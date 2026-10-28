"""P0 synthetic-only diagnosis/summary evaluation through the production LLM service.

Offline by default. A real run requires explicit opt-in, a new output file and a
disposable local database. One request per case; no retries or provider fallback.
Contract/oracle results never stand in for a separate semantic rubric review.
"""
import argparse
import asyncio
import hashlib
import json
import os
import sys
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))


def load_cases(extended=False):
    diagnosis = json.loads((ROOT / 'evals/learning_diagnosis/cases.json').read_text())
    summaries = json.loads((ROOT / 'evals/source_summary/cases.json').read_text())
    cases = [dict(c, purpose='learning_diagnosis', version='v2') for c in diagnosis]
    cases += [dict(c, purpose='source_summary', version='v1') for c in summaries]
    if len(diagnosis) != 10 or len(summaries) != 6 or len({c['id'] for c in cases}) != 16:
        raise ValueError('Expected exactly 10 diagnosis and 6 summary synthetic cases')
    for case in cases:
        if not case['source'] or not case['rubric'] or not case['question']:
            raise ValueError('Incomplete synthetic case')
    if extended:
        extra = json.loads((ROOT / 'evals/learning_quality_v3/new_cases.json').read_text())
        if len(extra) != 16 or len({c['id'] for c in [*cases, *extra]}) != 32:
            raise ValueError('Expected sixteen distinct new evaluation cases')
        cases.extend(extra)
    return cases


def checked_database(url):
    parsed = make_url(url)
    name = parsed.database or ''
    if (parsed.get_backend_name() != 'postgresql'
            or parsed.host not in ('localhost', '127.0.0.1')
            or not name.startswith('growthpilot_p0_') or not name.endswith('_test')):
        raise ValueError('Only an explicitly configured disposable local P0 database is allowed')
    return url


def fingerprint(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


async def evaluate(cases, output, candidate_prompts=False, candidate_revision=1):
    from app.ai import llm_service
    from app.ai.prompt_loader import load_prompt
    from app.ai.prompt_router import PromptVariant
    from app.engines.learning_diagnosis import validate_diagnosis
    from app.engines.source_summary import validate_summary

    url = checked_database(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL', ''))
    if candidate_prompts:
        import yaml
        suffix = '' if candidate_revision == 1 else f'_v{candidate_revision}'
        variants = {c['purpose']: PromptVariant(c['purpose'], c['version'] + f'-p0-candidate{candidate_revision}',
            yaml.safe_load((ROOT / 'evals/candidates' / (c['purpose'] + suffix + '.yaml')).read_text())) for c in cases}
    else:
        variants = {c['purpose']: PromptVariant(c['purpose'], c['version'], load_prompt(c['purpose'], c['version'])) for c in cases}
    providers = [llm_service._select_provider(v)[0] for v in variants.values()]
    if any(p.name != 'qwen' or not p.api_key for p in providers):
        raise ValueError('Configured Qwen credentials and Qwen-only routing are required')
    provider = providers[0]
    if any(p is not provider for p in providers):
        raise ValueError('Expected one configured Qwen provider')
    engine = create_async_engine(url)
    sessions = async_sessionmaker(engine, expire_on_commit=False)
    report = {'started_at': datetime.now(UTC).isoformat(), 'synthetic_only': True,
              'maximum_requests': len(cases), 'requests_attempted': 0, 'provider': 'qwen',
              'candidate_prompts': candidate_prompts,
              'candidate_revision': candidate_revision if candidate_prompts else None,
              'cases_sha256': fingerprint(cases), 'semantic_review': 'pending',
              'renderer_sha256': hashlib.sha256((ROOT / 'app/engines/bounded_learning.py').read_bytes()).hexdigest(),
              'prompt_sha256': {k: fingerprint(v.data) for k, v in variants.items()},
              'results': []}
    current = {}
    original_chat, original_retries = provider.chat, llm_service.MAX_RETRIES

    async def measured_chat(**kwargs):
        if report['requests_attempted'] >= report['maximum_requests']:
            raise ValueError('Request ceiling reached')
        report['requests_attempted'] += 1
        persist()
        response = await original_chat(**kwargs)
        current['raw_text'] = response.content
        current['usage'] = {'model': response.model, 'input_tokens': response.input_tokens,
                            'output_tokens': response.output_tokens,
                            'provider_estimated_cost_yuan': response.cost_yuan}
        return response

    def persist():
        temporary = output.with_suffix('.pending')
        temporary.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
        temporary.replace(output)

    persist()
    provider.chat, llm_service.MAX_RETRIES = measured_chat, 1
    try:
        for case in cases:
            current = {'id': case['id'], 'title': case['title'], 'purpose': case['purpose'],
                       'rubric': case['rubric'], 'contract_pass': False,
                       'semantic_review': 'pending'}
            started = asyncio.get_running_loop().time()
            try:
                model_source = case['source']
                preflight = None
                if candidate_prompts and candidate_revision >= 4:
                    from app.engines.bounded_learning import prepare_model_source, preflight_assessment
                    model_source = prepare_model_source(case['purpose'], case['source'])
                    if case['purpose'] == 'learning_diagnosis':
                        preflight = preflight_assessment(case['source'], case['question'])
                current['model_source_sha256'] = fingerprint(model_source)
                if preflight is not None:
                    raw = preflight
                    current['origin'] = 'structural_precheck_no_model'
                else:
                    async with sessions() as session:
                        raw = await llm_service.structured_output(session, None, case['purpose'],
                            {'source': json.dumps(model_source, ensure_ascii=False), 'question': case['question']}, variants[case['purpose']])
                    current['origin'] = 'real_model'
                current['raw'] = raw
                validator = validate_diagnosis if case['purpose'] == 'learning_diagnosis' else validate_summary
                result = validator(raw, case['source'], require_bounded=candidate_revision >= 3 and candidate_prompts)
                current.update(validated=result, contract_pass=True)
                if case['purpose'] == 'learning_diagnosis':
                    kinds = {f['kind'] for f in result['findings']}
                    current['observed_kinds'] = sorted(kinds)
                    current['expected_kinds'] = case['expected_kinds']
                    current['expected_kind_pass'] = bool(kinds & set(case['expected_kinds'])) and kinds <= set(case['expected_kinds'])
            except Exception as error:
                current['error'] = str(error)[:1000]
            current['elapsed_ms'] = round((asyncio.get_running_loop().time() - started) * 1000)
            report['results'].append(current)
            persist()
            print(f"{current['id']}: contract={current['contract_pass']}, kind={current.get('expected_kind_pass', 'rubric-review-required')}", flush=True)
        report['finished_at'] = datetime.now(UTC).isoformat()
        report['contract_passes'] = sum(r['contract_pass'] for r in report['results'])
        report['provider_estimated_cost_yuan'] = round(sum(r.get('usage', {}).get('provider_estimated_cost_yuan', 0) for r in report['results']), 6)
        persist()
    finally:
        provider.chat, llm_service.MAX_RETRIES = original_chat, original_retries
        await engine.dispose()
    return all(r['contract_pass'] and r.get('expected_kind_pass', True) for r in report['results'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--allow-external-qwen', action='store_true')
    parser.add_argument('--output', type=Path)
    parser.add_argument('--candidate-prompts', action='store_true', help='Evaluate isolated candidates without changing production prompt discovery')
    parser.add_argument('--candidate-revision', type=int, choices=[1, 2, 3, 4], default=1)
    parser.add_argument('--extended', action='store_true', help='Include sixteen new regression/transfer cases')
    parser.add_argument('--holdout', action='store_true', help='Use eight separately frozen holdout cases')
    parser.add_argument('--suite', choices=['all', 'diagnosis', 'summary'], default='all')
    args = parser.parse_args()
    cases = load_cases(args.extended)
    if args.holdout:
        cases = json.loads((ROOT / 'evals/learning_quality_v3/holdout.json').read_text())
        if len(cases) != 8 or len({c['id'] for c in cases}) != 8:
            raise ValueError('Expected eight distinct holdout cases')
    if args.suite != 'all':
        purpose = 'learning_diagnosis' if args.suite == 'diagnosis' else 'source_summary'
        cases = [case for case in cases if case['purpose'] == purpose]
    if not args.allow_external_qwen:
        print(f'Offline: {len(cases)} synthetic cases; zero external requests; no personal records read.')
        return
    if not args.output or args.output.exists():
        parser.error('A new --output file is required; existing reports are never overwritten')
    checked_database(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL', ''))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    sys.exit(0 if asyncio.run(evaluate(cases, args.output, args.candidate_prompts, args.candidate_revision)) else 1)


if __name__ == '__main__':
    main()
