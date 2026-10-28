"""Sourced learning observations; actual evidence stays separate from AI inference."""
import hashlib,json,uuid
from typing import Literal
from pydantic import Field,StrictInt,model_validator
from sqlalchemy import select
from app.api.personal_work import Strict,scope,owned,document
from app.core.exceptions import AppException,ValidationException,NotFoundException
from app.models.user import User
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.learning_material import LearningMaterial
from app.models.learning_review import LearningReviewUnit,LearningReviewAttempt
from app.engines.privacy_scope import privacy_source_enabled
LABELS={'content':'学习内容','notes':'学习笔记','insights':'学习心得','questions':'本人疑问','exercise':'练习','outcome':'应用成果'}

def digest(value):return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True).encode()).hexdigest()

def requested_ids(keys,prefix):
    ids=[]
    for key in keys:
        if key.startswith(prefix+':'):
            try:ids.append(uuid.UUID(key.split(':')[1]))
            except (ValueError,IndexError):pass
    return ids

def recall_evidence(a):
    """Keep the frozen reference, actual answer and self report separately addressable."""
    recall={'question':a.snapshot['question'],'reference':a.snapshot['source']['quote'],
        'answer':a.answer or '', 'self_report':f"本人自评：{a.rating}\n理解：{a.understanding or ''}\n卡点：{a.difficulty or ''}\n下一步：{a.next_action or ''}"}
    if a.snapshot.get('assistance'):
        recall['self_report']+='\n本人声明的作答方式：'+{'independent':'独立回忆','source':'看过原文或笔记','ai':'使用过 AI 提示','unknown':'未记录'}[a.snapshot['assistance']]
    return {'key':'attempt:'+str(a.id),'label':('已完成回忆 · ' if a.status=='completed' else '已保存答案 · ')+a.snapshot['question'][:80], 'role':'recall_record',
        'text':f"问题：{recall['question']}\n核对依据：{recall['reference']}\n本人答案：{a.answer or '本次没能想起'}\n{recall['self_report']}",
        'recall':recall,'attempt_id':str(a.id),'answered_at':a.answered_at.isoformat(),'completed_at':a.completed_at.isoformat() if a.completed_at else None}

async def evidence_rows(s,uid,wid,iid,keys=None,offset=0,limit=101):
    await scope(s,uid,wid);await owned(s,WorkspaceLearningItem,uid,wid,iid)
    doc=await document(s,uid,wid,'learning_item',iid)
    if not doc:raise NotFoundException('已保存学习记录')
    rows=[];position=0;wanted=set(keys) if keys is not None else None
    def append(row):
        nonlocal position
        if wanted is not None:
            if row['key'] in wanted:rows.append(row)
        else:
            if position>=offset:rows.append(row)
            position+=1
        return wanted is None and len(rows)>=limit
    for field,label in LABELS.items():
        text=str(doc.content.get(field,''))
        if text.strip() and append({'key':field,'label':label,'role':'learning_content' if field=='content' else 'personal_record','text':text,'document_id':str(doc.id),'version':doc.version}):return doc,rows
    for e in doc.content.get('journal',[]):
        if e['body'].strip() and append({'key':'journal:'+e['id'],'label':e['date']+' · '+(e['title'] or ('笔记' if e['kind']=='note' else '心得')),'role':'personal_record','text':e['body'],'document_id':str(doc.id),'version':doc.version}):return doc,rows
    material_ids=requested_ids(keys or [],'material')
    if wanted is None or material_ids:
        query=select(LearningMaterial).where(LearningMaterial.user_id==uid,LearningMaterial.workspace_id==wid,LearningMaterial.item_id==iid,LearningMaterial.status=='ready').order_by(LearningMaterial.created_at,LearningMaterial.id)
        if wanted is not None:query=query.where(LearningMaterial.id.in_(material_ids))
        materials=await s.stream_scalars(query.execution_options(yield_per=10))
        async for m in materials:
            for chunk in (m.extraction or {}).get('chunks',[]):
                key=f"material:{m.id}:{chunk['id']}"
                if wanted is not None and key not in wanted:continue
                text=(m.extraction or {}).get('text','')[chunk['start']:chunk['end']]
                if text.strip() and append({'key':key,'label':f"原资料 · {m.title} · {chunk['id']}",
                    'role':'learning_source','text':text,'material_id':str(m.id),'checksum':m.checksum,
                    'chunk_id':chunk['id'],'start':chunk['start'],'end':chunk['end'],'page':chunk.get('page')}):return doc,rows
    attempt_ids=requested_ids(keys or [],'attempt')
    if wanted is None or attempt_ids:
        query=select(LearningReviewAttempt).join(LearningReviewUnit,LearningReviewUnit.id==LearningReviewAttempt.unit_id).where(
            LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==wid,LearningReviewUnit.item_id==iid,
            LearningReviewUnit.user_id==uid,LearningReviewUnit.workspace_id==wid,LearningReviewAttempt.status.in_(['answered','completed']),LearningReviewUnit.archived_at.is_(None)).order_by(LearningReviewAttempt.completed_at.desc(),LearningReviewAttempt.id)
        if wanted is not None:query=query.where(LearningReviewAttempt.id.in_(attempt_ids))
        else:query=query.offset(max(0,offset-position)).limit(limit-len(rows))
        attempts=await s.stream_scalars(query.execution_options(yield_per=10))
        async for a in attempts:
            rows.append(recall_evidence(a))
    return doc,rows

async def diagnosis_source(s,uid,wid,iid,keys):
    user=await s.scalar(select(User).where(User.id==uid).execution_options(populate_existing=True))
    if not user or not privacy_source_enabled(user.settings,'learning'):raise AppException('HELP_SCOPE','学习数据读取已关闭。可在我的数据范围中调整。',403)
    doc,rows=await evidence_rows(s,uid,wid,iid,keys=keys);by_key={r['key']:r for r in rows}
    if not keys or any(k not in by_key for k in keys):raise ValidationException('请选择当前学习中已保存的记录，来源不得跨学习页')
    chosen=[by_key[k] for k in keys]
    if sum(len(r['text']) for r in chosen)>24000:raise ValidationException('本次选择超过 24000 字，请减少记录，或先整理本次要回顾的部分')
    # recall is a structured projection of the unchanged text. Preserve old source
    # digests so adding this projection does not invalidate a saved v1 result.
    canonical=[{k:v for k,v in r.items() if k!='recall'} for r in chosen]
    return {'version':doc.version,'document_id':str(doc.id),'evidence':chosen,'evidence_keys':keys,'digest':digest({'version':doc.version,'evidence':canonical})}

class Citation(Strict):
    key:str=Field(min_length=1,max_length=100)
    quote:str=Field(min_length=1,max_length=1500)
class Finding(Strict):
    observation:str=Field(min_length=1,max_length=1500)
    interpretation:str=Field(min_length=1,max_length=1500)
    certainty:str=Field(pattern='^(supported|tentative|insufficient)$')
    evidence:list[Citation]=Field(min_length=1,max_length=4)
class Advice(Strict):
    title:str=Field(min_length=1,max_length=200)
    action:str=Field(min_length=1,max_length=2000)
    why:str=Field(min_length=1,max_length=1500)
    evidence:list[Citation]=Field(min_length=1,max_length=4)
class Diagnosis(Strict):
    summary:str=Field(min_length=1,max_length=2000)
    findings:list[Finding]=Field(min_length=1,max_length=5)
    suggestions:list[Advice]=Field(min_length=1,max_length=4)
    limitations:str=Field(min_length=1,max_length=2000)
    @model_validator(mode='after')
    def nonblank(self):
        texts=[self.summary,self.limitations]
        for f in self.findings:texts.extend([f.observation,f.interpretation])
        for a in self.suggestions:texts.extend([a.title,a.action,a.why])
        if any(not t.strip() for t in texts):raise ValueError('学习回顾不能为空')
        return self

class QualityCitation(Citation):
    part:Literal['text','reference','answer','self_report']='text'

class QualityFinding(Finding):
    kind:Literal['self_reported','omission','contradiction','no_gap_observed','source_conflict','insufficient_evidence']
    evidence:list[QualityCitation]=Field(min_length=1,max_length=4)

class QualityAdvice(Advice):
    finding_indexes:list[StrictInt]=Field(min_length=1,max_length=5)
    success_check:str=Field(min_length=1,max_length=1500)
    evidence:list[QualityCitation]=Field(min_length=1,max_length=4)

class QualityDiagnosis(Diagnosis):
    schema_version:Literal[2]
    findings:list[QualityFinding]=Field(min_length=1,max_length=5)
    suggestions:list[QualityAdvice]=Field(min_length=1,max_length=4)

    @model_validator(mode='after')
    def linked_actions(self):
        for a in self.suggestions:
            if not a.success_check.strip() or len(set(a.finding_indexes))!=len(a.finding_indexes):
                raise ValueError('建议需要核对条件及不重复的观察编号')
            if any(type(i) is not int or i<0 or i>=len(self.findings) for i in a.finding_indexes):
                raise ValueError('建议必须对应本次观察')
        return self

def citation_text(c,row):
    if c.part=='text':return row['text']
    if row.get('role')!='recall_record':raise ValueError('本人答案与核对原文必须来自已完成回忆')
    return row.get('recall',{}).get(c.part,'')

def reference_citation(c,row):
    return c.part=='reference' or (c.part=='text' and row.get('role')=='learning_source')

def validate_quality(result,rows):
    for f in result.findings:
        if f.kind in ('omission','contradiction','no_gap_observed'):
            answers={c.key for c in f.evidence if c.part=='answer'}
            references={c.key for c in f.evidence if c.part=='reference'}
            if not answers.intersection(references):raise ValueError('答案判断需要同一回忆的实际答案和冻结核对依据')
        elif f.kind=='self_reported':
            if f.certainty!='tentative':raise ValueError('本人报告的卡点只能暂时推断')
            if not any((c.part=='text' and rows[c.key].get('role')=='personal_record') or c.part=='self_report' for c in f.evidence):
                raise ValueError('自报卡点必须引用本人记录')
        elif f.kind in ('source_conflict','insufficient_evidence'):
            if f.certainty!='insufficient':raise ValueError('来源矛盾或证据不足不能发布确定判断')
            if f.kind=='source_conflict' and len({c.key for c in f.evidence if reference_citation(c,rows[c.key])})<2:
                raise ValueError('来源矛盾需要至少两份冻结原资料')
    for a in result.suggestions:
        # A generic action cannot claim an unrelated finding as its rationale.
        supporting_keys={c.key for i in a.finding_indexes for c in result.findings[i].evidence}
        if not any(c.key in supporting_keys for c in a.evidence):raise ValueError('建议引用必须与对应观察有关')

def validate_diagnosis(raw,source,require_v2=True,require_bounded=False):
    if require_bounded and raw.get('schema_version') not in (3,4):
        raise ValueError('本次回顾只接受证据受限的判断回执')
    if raw.get('schema_version') in (3,4):
        from app.engines.bounded_learning import render_assessment
        raw=render_assessment(raw,source)
    if require_v2 or raw.get('schema_version')==2:result=QualityDiagnosis.model_validate(raw)
    else:result=Diagnosis.model_validate(raw)
    rows={r['key']:r for r in source['evidence']}
    for block in [*result.findings,*result.suggestions]:
        for c in block.evidence:
            if c.key not in rows:raise ValueError('学习回顾引用不属于本次冻结记录')
            text=citation_text(c,rows[c.key]) if isinstance(result,QualityDiagnosis) else rows[c.key]['text']
            if not c.quote.strip() or c.quote not in text:raise ValueError('学习回顾引用不属于本次冻结记录中的对应身份')
    if isinstance(result,QualityDiagnosis):validate_quality(result,rows)
    data=result.model_dump(mode='json');return {**data,'text':data['summary'],'quotes':list(dict.fromkeys(c.quote for block in [*result.findings,*result.suggestions] for c in block.evidence))}
