"""Review synthetic cases offline; opt in to at most one Qwen call per case.

Uses the production prompt, LLM audit service and diagnosis validator. It never
loads personal learning records. Run only against a disposable D10 test database.
Automated contract/oracle checks are distinct from semantic rubric review.
"""
import argparse,asyncio,json,os,sys
from datetime import UTC,datetime
from pathlib import Path
from sqlalchemy.engine import make_url
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT))
CASES=ROOT/'evals/learning_diagnosis/cases.json'

def load_cases():
    cases=json.loads(CASES.read_text())
    if len(cases)!=10 or len({c['id'] for c in cases})!=10:raise ValueError('Expected the reviewed set of 10 synthetic cases')
    for c in cases:
        if not c['source']['evidence'] or not c['rubric'] or not c['expected_kinds']:raise ValueError('Incomplete reviewable case')
    return cases

async def evaluate(cases,output):
    from app.ai import llm_service
    from app.ai.prompt_loader import load_prompt
    from app.ai.prompt_router import PromptVariant
    from app.engines.learning_diagnosis import validate_diagnosis
    url=os.environ.get('GROWTHPILOT_TEST_DATABASE_URL','');parsed=make_url(url)
    if parsed.host not in ('localhost','127.0.0.1') or not parsed.database.startswith('growthpilot_d10_') or not parsed.database.endswith('_test'):
        raise ValueError('Only an explicitly configured disposable D10 database is allowed')
    variant=PromptVariant('learning_diagnosis','v2',load_prompt('learning_diagnosis','v2'))
    provider,_=llm_service._select_provider(variant)
    if provider.name!='qwen':raise ValueError('This evaluation only authorizes configured Qwen')
    # No retry or alternate-provider submission: a hard ceiling of 10 requests.
    retries=llm_service.MAX_RETRIES;llm_service.MAX_RETRIES=1
    engine=create_async_engine(url);sessions=async_sessionmaker(engine,expire_on_commit=False)
    report={'started_at':datetime.now(UTC).isoformat(),'prompt_version':'v2','provider':'qwen','synthetic_only':True,'maximum_requests':10,'results':[],'semantic_review':'pending'}
    def persist():output.write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
    persist()
    try:
        for case in cases:
            entry={'id':case['id'],'title':case['title'],'rubric':case['rubric'],'expected_kinds':case['expected_kinds']}
            try:
                async with sessions() as session:
                    raw=await llm_service.structured_output(session,None,'learning_diagnosis',{'source':json.dumps(case['source'],ensure_ascii=False),'question':case['question']},variant)
                entry['raw']=raw
                result=validate_diagnosis(raw,case['source']);entry['validated']=result;entry['contract_pass']=True
                kinds={f['kind'] for f in result['findings']};expected=set(case['expected_kinds'])
                entry['expected_kind_pass']=bool(kinds&expected) and kinds<=expected
            except Exception as error:
                entry.update(contract_pass=False,expected_kind_pass=False,error=str(error)[:500])
            report['results'].append(entry);persist()
            print(f"{case['id']}: contract={entry['contract_pass']}, expected-kind={entry['expected_kind_pass']}",flush=True)
        report['finished_at']=datetime.now(UTC).isoformat();report['contract_passes']=sum(r['contract_pass'] for r in report['results']);report['expected_kind_passes']=sum(r['expected_kind_pass'] for r in report['results']);persist()
    finally:
        llm_service.MAX_RETRIES=retries;await engine.dispose()
    return all(r['contract_pass'] and r['expected_kind_pass'] for r in report['results'])

def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--allow-external-qwen',action='store_true',help='Explicit opt in; requires user authorization to send these synthetic cases');parser.add_argument('--output',type=Path);args=parser.parse_args();cases=load_cases()
    if not args.allow_external_qwen:
        print(f'Offline review: {len(cases)} synthetic cases. No model call or personal-data read.');return
    if not args.output:parser.error('--output is required for real evaluation')
    if args.output.exists():parser.error('Output already exists; refusing accidental repeated model calls')
    args.output.parent.mkdir(parents=True,exist_ok=True)
    sys.exit(0 if asyncio.run(evaluate(cases,args.output)) else 1)

if __name__=='__main__':main()
