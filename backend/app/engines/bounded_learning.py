"""Evidence-only model receipts; product-owned wording and neutral action criteria.

The model chooses a local comparison or original excerpts, not a learner profile,
psychological explanation, causal claim, or action success standard.
"""
from typing import Literal
import re

from pydantic import BaseModel, ConfigDict, Field


class Receipt(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)


class Evidence(Receipt):
    key: str = Field(min_length=1, max_length=100)
    part: Literal['text', 'reference', 'answer', 'self_report']
    quote: str = Field(min_length=1, max_length=1200)


class Assessment(Receipt):
    schema_version: Literal[3]
    kind: Literal['self_reported', 'omission', 'contradiction', 'no_gap_observed', 'source_conflict', 'insufficient_evidence']
    evidence: list[Evidence] = Field(min_length=1, max_length=4)


class Extract(Receipt):
    key: str = Field(min_length=1, max_length=8)
    quote: str = Field(min_length=1, max_length=1000)


class ExtractGroup(Receipt):
    evidence: list[Extract] = Field(min_length=1, max_length=4)


class Extracts(Receipt):
    schema_version: Literal[2]
    groups: list[ExtractGroup] = Field(min_length=1, max_length=6)


class SelectionAssessment(Receipt):
    schema_version: Literal[4]
    kind: Literal['self_reported', 'omission', 'contradiction', 'no_gap_observed', 'source_conflict', 'insufficient_evidence']
    evidence_ids: list[str] = Field(max_length=4)


class SelectionGroup(Receipt):
    evidence_ids: list[str] = Field(min_length=1, max_length=4)


class SelectionExtracts(Receipt):
    schema_version: Literal[3]
    groups: list[SelectionGroup] = Field(min_length=1, max_length=6)


def evidence_catalog(purpose, source):
    """IDs and roles are computed from frozen evidence, never supplied by a model."""
    catalog, records, excluded = {}, [], 0
    rows = source['evidence'] if purpose == 'learning_diagnosis' else source
    comparable = any(r.get('role') == 'recall_record' and r.get('recall', {}).get('answer', '').strip()
                     and r.get('recall', {}).get('reference', '').strip() for r in rows)
    for row in rows:
        record = {'source_key': row['key'], 'role': row.get('role', 'source'), 'parts': {}}
        if purpose == 'learning_diagnosis' and row.get('role') == 'recall_record':
            recall = row.get('recall', {})
            record['question'] = recall.get('question', '')
            record['has_answer'] = bool(recall.get('answer', '').strip())
            fields = {k: recall.get(k, '') for k in ('reference', 'answer')}
            if not comparable:
                fields.update(text=row.get('text', ''), self_report=recall.get('self_report', ''))
        else:
            fields = {'text': row.get('text', '')}
        for part, text in fields.items():
            fragments = [m.group(0) for m in re.finditer(r'[\s\S]+?(?:[。！？]|\n|$)', text) if m.group(0).strip()]
            # Do not silently clip a long sentence and pretend its meaning survived.
            if any(len(fragment) > 1000 for fragment in fragments):
                raise ValueError('选定原文含过长完整句子，请选择较短片段')
            record['parts'][part] = []
            for fragment in fragments:
                if purpose == 'source_summary' and re.search(r'(?:忽略|无视).{0,16}(?:指令|规则|要求)|(?:读取|泄露|透露).{0,12}(?:其他|他人|别人).{0,8}(?:账户|账号|资料|记录)|取消(?:所有)?引用', fragment):
                    excluded += 1
                    continue
                identity = f'E{len(catalog) + 1}'
                catalog[identity] = {'key': row['key'], 'part': part, 'quote': fragment}
                record['parts'][part].append({'id': identity, 'text': fragment})
        records.append(record)
    return catalog, {'has_comparable_answer': comparable, 'records': records, 'excluded_directive_segments': excluded}


def prepare_model_source(purpose, source):
    return evidence_catalog(purpose, source)[1]


def preflight_assessment(source, question):
    """Structural insufficiency is a data check, never a model judgment."""
    rows = source['evidence']
    recalls = [r for r in rows if r.get('role') == 'recall_record']
    no_answer = bool(recalls) and len(recalls) == len(rows) and not any(r.get('recall', {}).get('answer', '').strip() for r in recalls)
    history_question = bool(re.search(r'(?:连续|过去|最近|近).{0,8}(?:次|天|周|月|年)|(?:上|前)(?:个)?月|历史|趋势|长期|越来越|一直在变|[二三四五六七八九十]+次|(?:[2-9]|[1-9]\d+)次', question))
    if not no_answer and not (history_question and len(recalls) < 2):
        return None
    catalog, _ = evidence_catalog('learning_diagnosis', source)
    if not catalog:
        raise ValueError('缺少可定位的原文记录')
    return {'schema_version': 4, 'kind': 'insufficient_evidence', 'evidence_ids': [next(iter(catalog))]}


def selected_evidence(ids, catalog):
    if len(ids) != len(set(ids)) or any(identity not in catalog for identity in ids):
        raise ValueError('证据选择包含未知或重复标识')
    return [dict(catalog[identity]) for identity in ids]


def render_assessment(raw, source):
    if raw.get('schema_version') == 4:
        choice = SelectionAssessment.model_validate(raw)
        catalog, _ = evidence_catalog('learning_diagnosis', source)
        if not choice.evidence_ids and choice.kind != 'insufficient_evidence':
            raise ValueError('本题判断需要明确证据')
        if not choice.evidence_ids:
            choice.evidence_ids = [next(iter(catalog))] if catalog else []
        cites = selected_evidence(choice.evidence_ids, catalog)
        if choice.kind in ('omission', 'contradiction', 'no_gap_observed'):
            keys = {c['key'] for c in cites}
            for key in keys:
                for part in ('reference', 'answer'):
                    if not any(c['key'] == key and c['part'] == part for c in cites):
                        counterpart = next((c for c in catalog.values() if c['key'] == key and c['part'] == part), None)
                        if counterpart:
                            cites.append(dict(counterpart))
        raw = {'schema_version': 3, 'kind': choice.kind, 'evidence': cites}
    receipt = Assessment.model_validate(raw)
    rows = {row['key']: row for row in source['evidence']}
    for cite in receipt.evidence:
        row = rows.get(cite.key)
        if not row:
            raise ValueError('判断引用不属于选定记录')
        if cite.part != 'text' and row.get('role') != 'recall_record':
            raise ValueError('此身份不是已保存回忆')
        text = row.get('text', '') if cite.part == 'text' else row.get('recall', {}).get(cite.part, '')
        if not cite.quote.strip() or cite.quote not in text:
            raise ValueError('判断引用不属于相应原文身份')
    kind = receipt.kind
    comparison = kind in ('omission', 'contradiction', 'no_gap_observed')
    if comparison:
        answer_keys = {c.key for c in receipt.evidence if c.part == 'answer'}
        reference_keys = {c.key for c in receipt.evidence if c.part == 'reference'}
        if not answer_keys.intersection(reference_keys):
            raise ValueError('比较需要同题的答案与原文')
    if kind == 'self_reported' and any(r.get('role') == 'recall_record' and r.get('recall', {}).get('answer', '').strip() and r.get('recall', {}).get('reference', '').strip() for r in rows.values()):
        raise ValueError('已有可比较答案时不能用自评替代本题核对')
    cites = [c.model_dump() for c in receipt.evidence]
    # Every statement below describes the receipt's narrow scope. Actual excerpts
    # are shown separately; no arbitrary model-authored interpretation survives.
    wording = {
        'omission': ('这次答案有一处需要补充核对。', '请只核对以下原文要求是否在本次答案中完整表达，不据此判断长期掌握。'),
        'contradiction': ('这次答案有一处与选定依据不符。', '请只核对以下两段话的实际含义，不推断困难原因或个人能力。'),
        'no_gap_observed': ('本次答案在给定依据范围内未见明确不符。', '这是对本题答案的核对，不代表长期掌握，也不以自评高低改变本题结果。'),
        'self_reported': ('记录中有一项本人报告的困惑。', '这里只保留本人报告；没有据此认定知识错误、内化不足或能力障碍。'),
        'source_conflict': ('选定的原资料存在需要澄清的不同规则。', '先确认适用范围与有效版本，不预设任意一份正确，也不据此判本人答错。'),
        'insufficient_evidence': ('本次选定记录不足以支持所问的判断。', '缺少可比较的依据、实际答案或所需历史时，不判断具体错误、掌握程度或变化趋势。'),
    }
    summary, interpretation = wording[kind]
    labels = {'text': '选定记录', 'reference': '本题原文', 'answer': '本人答案', 'self_report': '本人报告'}
    observation = '\n'.join(f'{labels[c.part]}：“{c.quote}”' for c in receipt.evidence)
    if len(observation) > 1500:
        raise ValueError('本次核对证据过长，请选较短完整依据')
    if kind == 'source_conflict':
        action = '核对这些资料的适用范围与有效版本，并记录确认依据；暂时无法确认时保留冲突，不选定答案。'
        check = '保存可核对的版本或适用范围依据；允许任一版本适用、分别适用或仍无法确定，不预设结论。'
    elif comparison:
        reference = '；'.join(dict.fromkeys(c.quote for c in receipt.evidence if c.part == 'reference'))
        action = '围绕同一道问题再独立写一次自己的回答，随后对照本次原文，记录保留或修正了什么。'
        check = f'保存同题的独立答案与原文核对记录；逐项核对原文：“{reference}”；按实际含义核对，等价改写可保留，不要求逐字背诵。'
    else:
        action = '先选择一个具体问题，保存该题原文核对依据与一次独立答案；如果要比较历史，先核对实际可用的记录范围。'
        check = '留下同一道问题、可定位的原文依据和本人实际答案；没有依据或答案时明确保留缺失，不补造标准答案或历史。'
    if len(check) > 1500:
        raise ValueError('核对条件过长，请选择较短原文')
    return {'schema_version': 2, 'summary': summary,
            'findings': [{'kind': kind, 'observation': observation, 'interpretation': interpretation,
                          'certainty': 'supported' if comparison else 'tentative' if kind == 'self_reported' else 'insufficient', 'evidence': cites}],
            'suggestions': [{'title': '只做一次可核对的下一步', 'action': action, 'why': interpretation,
                             'finding_indexes': [0], 'success_check': check, 'evidence': cites}],
            'limitations': '仅依据本次选定记录核对本题或保留不足；未评估长期能力、心理状态、记忆变化或学习效果。'}


def render_extracts(raw, source):
    if raw.get('schema_version') == 3:
        choice = SelectionExtracts.model_validate(raw)
        catalog, _ = evidence_catalog('source_summary', source)
        groups = [{'evidence': [{k: cite[k] for k in ('key', 'quote')} for cite in selected_evidence(group.evidence_ids, catalog)]} for group in choice.groups]
        raw = {'schema_version': 2, 'groups': groups}
    receipt = Extracts.model_validate(raw)
    rows = {row['key']: row for row in source}
    points, used = [], set()
    for group in receipt.groups:
        lines, evidence = [], []
        for cite in group.evidence:
            row = rows.get(cite.key)
            if not row or not cite.quote.strip() or cite.quote not in row['text']:
                raise ValueError('摘录不是本次选定原文')
            identity = (cite.key, cite.quote)
            if identity in used:
                raise ValueError('同一原文不应重复列作要点')
            used.add(identity)
            lines.append(f'原文摘录（{cite.key}）：“{cite.quote}”')
            evidence.append(cite.model_dump())
        text = '\n'.join(lines)
        if len(text) > 2000:
            raise ValueError('一个摘录组过长，请选择较短完整原文')
        points.append({'text': text, 'kind': 'observation', 'evidence': evidence})
    covered = {key for key, _ in used}
    missing = [key for key in rows if key not in covered]
    limits = '这是选定资料的摘录式整理，保留原作者表述；未独立验证来源真伪，不新增因果解释、能力判断或有效版本裁决。'
    _, scope = evidence_catalog('source_summary', source)
    if scope['excluded_directive_segments']:
        limits += f'已排除 {scope["excluded_directive_segments"]} 段疑似面向助手的指令，原资料仍保留，可人工核对；本摘录不覆盖被排除内容。'
    if missing:
        limits += '未摘录片段：' + '、'.join(missing) + '；本次摘录不代表覆盖全部选择。'
    return {'title': '选定资料的原文要点', 'points': points, 'limitations': limits}
