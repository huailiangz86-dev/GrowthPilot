"""Manual learning reviews: source fidelity and atomic idempotency without model calls."""
import hashlib
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import Field, StrictBool, model_validator, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.personal_work import Strict, scope, owned, document, conflict
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.daily_preferences import user_daily_timezone
from app.engines.workspace_engine import append_event
from app.engines.review_schedule import latest_completed, preview_schedule, queue_state, saved_schedule
from app.models.learning_review import LearningReviewUnit, LearningReviewAttempt
from app.models.learning_material import LearningMaterial
from app.models.personal_work import DocumentRevision, PersonalCommandReceipt
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.user import User
from app.schemas.common import ApiResponse

router=APIRouter(prefix='/learning-review',tags=['learning-review'])
RATINGS={'again':'没想起','hard':'费力想起','good':'基本想起','easy':'轻松想起'}

class UnitSource(Strict):
    kind: Literal['document','material']
    revision_id: uuid.UUID | None = None
    field: Literal['content','notes','insights','exercise'] | None = None
    start: int | None = Field(default=None,ge=0)
    end: int | None = Field(default=None,ge=1)
    material_id: uuid.UUID | None = None
    checksum: str | None = Field(default=None,pattern=r'^[a-f0-9]{64}$')
    chunk_id: str | None = Field(default=None,max_length=20)
    @model_validator(mode='after')
    def complete(self):
        if self.kind=='document':
            if self.revision_id is None or self.field is None or self.start is None or self.end is None or not 0<self.end-self.start<=12000 or any(v is not None for v in (self.material_id,self.checksum,self.chunk_id)):
                raise ValueError('请选择已保存笔记或练习的一段原文，最多 12000 字')
        elif self.material_id is None or self.checksum is None or not self.chunk_id or any(v is not None for v in (self.revision_id,self.field,self.start,self.end)):
            raise ValueError('请选择资料的真实原文片段')
        return self

class CreateUnit(Strict):
    request_id: uuid.UUID
    question: str = Field(min_length=1,max_length=2000)
    kind: Literal['concept','question'] = 'question'
    source: UnitSource
    application_goal: str | None = Field(default=None,min_length=1,max_length=2000)
    @field_validator('question')
    @classmethod
    def question_required(cls,value):
        if not value.strip():raise ValueError('请填写复习问题')
        return value.strip()

class Answer(Strict):
    request_id: uuid.UUID
    answer: str = Field(default='',max_length=12000)
    did_not_recall: bool = False
    assistance: Literal['independent','source','ai','unknown'] = 'unknown'
    @model_validator(mode='after')
    def actual_answer(self):
        if not self.answer.strip() and not self.did_not_recall:raise ValueError('请写下实际答案，或明确选择没能想起')
        if self.did_not_recall and self.answer.strip():raise ValueError('没能想起时请保留空答案；已有答案可直接提交')
        return self

class Finish(Strict):
    request_id: uuid.UUID
    rating: Literal['again','hard','good','easy']
    understanding: str = Field(default='',max_length=4000)
    difficulty: str = Field(default='',max_length=4000)
    next_action: str = Field(min_length=1,max_length=4000)
    next_review_date: date | None = None
    schedule_mode: Literal['manual','suggested','none'] = 'manual'
    schedule_token: str | None = Field(default=None,pattern=r'^[a-f0-9]{64}$')
    practice_result: str | None = Field(default=None,max_length=8000)
    practice_criterion: str | None = Field(default=None,max_length=1500)
    practice_checked: StrictBool | None = None
    @model_validator(mode='after')
    def schedule_contract(self):
        if any(v is not None for v in (self.practice_result,self.practice_criterion,self.practice_checked)):
            if not self.practice_result or not self.practice_result.strip() or not self.practice_criterion or not self.practice_criterion.strip() or self.practice_checked is not True:
                raise ValueError('请留下实际应用结果、本人核对标准并确认已核对')
        if self.schedule_mode=='suggested' and (not self.schedule_token or self.next_review_date is not None):
            raise ValueError('采用建议日期需先读取建议，并由服务端核对日期')
        if self.schedule_mode!='suggested' and self.schedule_token is not None:
            raise ValueError('本人日期或暂不安排不需要建议标识')
        if self.schedule_mode=='none' and self.next_review_date is not None:
            raise ValueError('暂不安排时请保留空日期')
        return self
    @field_validator('next_action')
    @classmethod
    def next_required(cls,value):
        if not value.strip():raise ValueError('请留下下一步练习或应用')
        return value

async def item_scope(s,uid,wid,iid,lock=False):
    await scope(s,uid,wid,lock=lock)
    return await owned(s,WorkspaceLearningItem,uid,wid,iid)

async def unit_scope(s,uid,wid,iid,unit_id,lock=False):
    await item_scope(s,uid,wid,iid,lock)
    row=await s.scalar(select(LearningReviewUnit).where(LearningReviewUnit.id==unit_id,LearningReviewUnit.user_id==uid,LearningReviewUnit.workspace_id==wid,LearningReviewUnit.item_id==iid,LearningReviewUnit.archived_at.is_(None)))
    if not row:raise NotFoundException('LearningReviewUnit')
    return row

def attempt_payload(row):
    return {'id':str(row.id),'unit_id':str(row.unit_id),'snapshot':row.snapshot,'answer':row.answer,'did_not_recall':row.did_not_recall,'status':row.status,'rating':row.rating,
        'understanding':row.understanding or '', 'difficulty':row.difficulty or '', 'next_action':row.next_action or '',
        'next_review_date':str(row.next_review_date) if row.next_review_date else None,'answered_at':row.answered_at.isoformat(),'completed_at':row.completed_at.isoformat() if row.completed_at else None}

def unit_payload(row,title=None,attempts=(),today=None):
    # The source quote is withheld until an answer is saved; metadata remains visible.
    completed=[a for a in attempts if a.status=='completed']
    latest=latest_completed(attempts)
    source={k:v for k,v in row.source.items() if k!='quote'}
    return {'id':str(row.id),'item_id':str(row.item_id),'item_title':title,'question':row.question,'kind':row.kind,'source':source,'created_at':row.created_at.isoformat(),
        'completed_count':len(completed),'last_rating':latest.rating if latest else None,'next_review_date':str(latest.next_review_date) if latest and latest.next_review_date else None,'unfinished_count':sum(a.status=='answered' for a in attempts),
        'schedule':saved_schedule(latest),'queue_state':queue_state(attempts,today) if today else None,'today':str(today) if today else None}

async def saved_receipt(s,uid,wid,request_id,action,target,payload):
    data=payload.model_dump(mode='json')
    if isinstance(payload,CreateUnit) and payload.application_goal is None:data.pop('application_goal')
    if isinstance(payload,Answer) and payload.assistance=='unknown':data.pop('assistance')
    if isinstance(payload,Finish):
        for key in ('practice_result','practice_criterion','practice_checked'):
            if data[key] is None:data.pop(key)
    # Preserve D6 fingerprints so outstanding manual submissions replay across upgrades.
    if isinstance(payload,Finish) and payload.schedule_mode=='manual' and payload.schedule_token is None:
        data.pop('schedule_mode');data.pop('schedule_token')
    fingerprint=hashlib.sha256(json.dumps({'action':action,'target':str(target),'payload':data},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
    row=await s.scalar(select(PersonalCommandReceipt).where(PersonalCommandReceipt.user_id==uid,PersonalCommandReceipt.workspace_id==wid,PersonalCommandReceipt.request_id==request_id))
    if row and row.fingerprint!=fingerprint:conflict('同一提交标识对应不同内容，请保留草稿并重新提交。')
    return fingerprint,row.result if row else None

async def record(s,uid,wid,request_id,fingerprint,result,event,target):
    s.add(PersonalCommandReceipt(user_id=uid,workspace_id=wid,request_id=request_id,fingerprint=fingerprint,result=result))
    await append_event(s,user_id=uid,workspace_id=wid,event_type=event,source_type='learning_review',source_id=target,payload={'request_id':str(request_id)})
    await s.flush()
    return result

async def create_unit(s,uid,wid,iid,payload):
    item=await item_scope(s,uid,wid,iid,True)
    fp,receipt=await saved_receipt(s,uid,wid,payload.request_id,'review_create',iid,payload)
    if receipt:return receipt
    if await s.scalar(select(func.count()).select_from(LearningReviewUnit).where(LearningReviewUnit.item_id==iid))>=100:raise ValidationException('每份学习最多保留 100 个复习问题')
    spec=payload.source
    if spec.kind=='document':
        doc=await document(s,uid,wid,'learning_item',iid)
        revision=await s.scalar(select(DocumentRevision).where(DocumentRevision.id==spec.revision_id,DocumentRevision.document_id==doc.id)) if doc else None
        if not revision:raise NotFoundException('DocumentRevision')
        text=revision.content.get(spec.field,'')
        if not isinstance(text,str) or spec.end>len(text) or not text[spec.start:spec.end].strip():raise ValidationException('原文位置无效，请重新选择已保存内容')
        source={**spec.model_dump(mode='json',exclude_none=True),'version':revision.version,'title':revision.content.get('title',item.title),'quote':text[spec.start:spec.end]}
    else:
        material=await s.scalar(select(LearningMaterial).where(LearningMaterial.id==spec.material_id,LearningMaterial.user_id==uid,LearningMaterial.workspace_id==wid,LearningMaterial.item_id==iid))
        if not material:raise NotFoundException('LearningMaterial')
        if material.status!='ready' or material.checksum!=spec.checksum:conflict('资料尚未就绪或来源已变化，请重新核对')
        chunk=next((c for c in (material.extraction or {}).get('chunks',[]) if c['id']==spec.chunk_id),None)
        if not chunk:raise ValidationException('所选原文片段不存在')
        source={**spec.model_dump(mode='json',exclude_none=True),'title':material.title,'page':chunk['page'],'start':chunk['start'],'end':chunk['end'],'quote':chunk['text']}
    if payload.application_goal is not None:
        if not payload.application_goal.strip():raise ValidationException('请填写希望实际用上的场景')
        source['application_goal']=payload.application_goal.strip()
        source['flow_version']=1
    row=LearningReviewUnit(id=uuid.uuid5(iid,'review_unit:'+str(payload.request_id)),user_id=uid,workspace_id=wid,item_id=iid,question=payload.question,kind=payload.kind,source=source)
    s.add(row);await s.flush()
    return await record(s,uid,wid,payload.request_id,fp,unit_payload(row,item.title),'learning_review_unit_created',row.id)

async def save_answer(s,uid,wid,iid,unit_id,payload):
    unit=await unit_scope(s,uid,wid,iid,unit_id,True)
    fp,receipt=await saved_receipt(s,uid,wid,payload.request_id,'review_answer',unit_id,payload)
    if receipt:return receipt
    # Limits apply to all attempts including unfinished ones; no client duration inference.
    if await s.scalar(select(func.count()).select_from(LearningReviewAttempt).where(LearningReviewAttempt.unit_id==unit_id))>=1000:raise ValidationException('此问题已保留 1000 次尝试，请建立新的复习问题')
    row=LearningReviewAttempt(id=uuid.uuid5(unit_id,'review_attempt:'+str(payload.request_id)),user_id=uid,workspace_id=wid,unit_id=unit_id,snapshot={'question':unit.question,'kind':unit.kind,'source':unit.source,'item_id':str(iid)},answer=payload.answer,did_not_recall=payload.did_not_recall,status='answered')
    if payload.assistance!='unknown':row.snapshot={**row.snapshot,'assistance':payload.assistance}
    s.add(row);await s.flush()
    return await record(s,uid,wid,payload.request_id,fp,attempt_payload(row),'learning_recall_answered',row.id)

async def finish_attempt(s,uid,wid,iid,unit_id,attempt_id,payload):
    unit=await unit_scope(s,uid,wid,iid,unit_id,True)
    row=await s.scalar(select(LearningReviewAttempt).where(LearningReviewAttempt.id==attempt_id,LearningReviewAttempt.unit_id==unit_id,LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==wid))
    if not row:raise NotFoundException('LearningReviewAttempt')
    fp,receipt=await saved_receipt(s,uid,wid,payload.request_id,'review_finish',attempt_id,payload)
    if receipt:return receipt
    if unit.source.get('flow_version')==1 and payload.practice_result is None:
        raise ValidationException('这份学习流程还需实际应用结果与本人核对标准，请从完整学习流程继续')
    if row.status=='completed':conflict('这次复盘已经保存，历史不会被改写；可以再次回忆。')
    if row.did_not_recall and payload.rating!='again':raise ValidationException('本次记录为没能想起，请选择“没想起”')
    user=await s.get(User,uid);today=datetime.now(user_daily_timezone(user.settings)).date()
    if payload.next_review_date is not None and not today<=payload.next_review_date<=today+timedelta(days=366):raise ValidationException('下次回忆日期请选择今天起一年以内')
    attempts=(await s.scalars(select(LearningReviewAttempt).where(LearningReviewAttempt.unit_id==unit_id,LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==wid))).all()
    preview=preview_schedule(attempts,today)
    next_date=payload.next_review_date
    mode=payload.schedule_mode
    if mode=='suggested':
        if payload.schedule_token!=preview['token']:conflict('复习依据或当天日期已变化，请重新读取建议日期；原答案与草稿保留。')
        next_date=date.fromisoformat(preview['choices'][payload.rating]['next_review_date'])
    elif next_date is None:
        mode='none'
    row.snapshot={**row.snapshot,'schedule':{'mode':mode,'rule_version':preview['rule_version'] if mode=='suggested' else None,
        'interval_days':(next_date-today).days if next_date else None,'scheduled_on':str(today),'next_review_date':str(next_date) if next_date else None,
        'basis_attempt_id':preview['latest_attempt_id'],'previous_interval_days':preview['previous_interval_days'] if mode=='suggested' else None,'timezone':str(user_daily_timezone(user.settings))}}
    for field in ('rating','understanding','difficulty','next_action','next_review_date'):setattr(row,field,getattr(payload,field))
    row.next_review_date=next_date
    if payload.practice_result is not None:
        row.snapshot={**row.snapshot,'practice':{'result':payload.practice_result,'criterion':payload.practice_criterion,'checked_by':'self'}}
    row.status='completed';row.completed_at=datetime.now(UTC);await s.flush()
    return await record(s,uid,wid,payload.request_id,fp,attempt_payload(row),'learning_review_completed',row.id)

@router.get('/{workspace_id}')
async def inbox(workspace_id:uuid.UUID,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id);await scope(session,uid,workspace_id)
    user=await session.get(User,uid);today=datetime.now(user_daily_timezone(user.settings)).date()
    rows=(await session.execute(select(LearningReviewUnit,WorkspaceLearningItem.title).join(WorkspaceLearningItem,WorkspaceLearningItem.id==LearningReviewUnit.item_id).where(LearningReviewUnit.user_id==uid,LearningReviewUnit.workspace_id==workspace_id,LearningReviewUnit.archived_at.is_(None),WorkspaceLearningItem.archived_at.is_(None)).order_by(LearningReviewUnit.created_at.desc()))).all()
    attempts=(await session.execute(select(LearningReviewAttempt.id,LearningReviewAttempt.unit_id,LearningReviewAttempt.status,LearningReviewAttempt.completed_at,LearningReviewAttempt.rating,LearningReviewAttempt.next_review_date,LearningReviewAttempt.snapshot['schedule'].label('schedule')).where(LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==workspace_id))).all()
    grouped={}
    for a in attempts:grouped.setdefault(a.unit_id,[]).append(a)
    return ApiResponse(success=True,data=[unit_payload(row,title,grouped.get(row.id,[]),today) for row,title in rows])

@router.get('/{workspace_id}/{item_id}/{unit_id}/schedule')
async def schedule(workspace_id:uuid.UUID,item_id:uuid.UUID,unit_id:uuid.UUID,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id);await unit_scope(session,uid,workspace_id,item_id,unit_id)
    user=await session.get(User,uid);today=datetime.now(user_daily_timezone(user.settings)).date()
    rows=(await session.scalars(select(LearningReviewAttempt).where(LearningReviewAttempt.unit_id==unit_id,LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==workspace_id))).all()
    return ApiResponse(success=True,data=preview_schedule(rows,today))

@router.get('/{workspace_id}/{item_id}/{unit_id}/attempts')
async def history(workspace_id:uuid.UUID,item_id:uuid.UUID,unit_id:uuid.UUID,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id);await unit_scope(session,uid,workspace_id,item_id,unit_id)
    rows=(await session.scalars(select(LearningReviewAttempt).where(LearningReviewAttempt.unit_id==unit_id,LearningReviewAttempt.user_id==uid,LearningReviewAttempt.workspace_id==workspace_id).order_by(LearningReviewAttempt.answered_at.desc()))).all()
    return ApiResponse(success=True,data=[attempt_payload(row) for row in rows])

@router.post('/{workspace_id}/{item_id}/units')
async def create(workspace_id:uuid.UUID,item_id:uuid.UUID,payload:CreateUnit,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    result=await create_unit(session,uuid.UUID(user_id),workspace_id,item_id,payload);await session.commit();return ApiResponse(success=True,data=result)

@router.post('/{workspace_id}/{item_id}/{unit_id}/answers')
async def answer(workspace_id:uuid.UUID,item_id:uuid.UUID,unit_id:uuid.UUID,payload:Answer,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    result=await save_answer(session,uuid.UUID(user_id),workspace_id,item_id,unit_id,payload);await session.commit();return ApiResponse(success=True,data=result)

@router.post('/{workspace_id}/{item_id}/{unit_id}/attempts/{attempt_id}/finish')
async def finish(workspace_id:uuid.UUID,item_id:uuid.UUID,unit_id:uuid.UUID,attempt_id:uuid.UUID,payload:Finish,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    result=await finish_attempt(session,uuid.UUID(user_id),workspace_id,item_id,unit_id,attempt_id,payload);await session.commit();return ApiResponse(success=True,data=result)
