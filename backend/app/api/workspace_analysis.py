"""Owner-scoped facts, statistics and durable analysis-to-Agent handoff."""
import uuid
from datetime import UTC, date, datetime
from typing import Literal
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.tasks import _response as task_response
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException
from app.engines.agent_context import settings_for
from app.engines.daily_preferences import user_today
from app.engines.privacy_scope import user_privacy_scope
from app.engines.task_engine import complete_task, get_task
from app.engines.workspace_analysis import build_report
from app.engines.workspace_engine import append_event, get_workspace
from app.models.agent_conversation import AgentConversation, AgentTurn
from app.models.task import Task
from app.models.user import User
from app.models.workspace_fact import AnalysisSnapshot, WorkspaceFact
from app.schemas.common import ApiResponse
router = APIRouter(prefix="/workspace-analysis", tags=["workspace-analysis"])

class FactRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: uuid.UUID
    kind: Literal["learning","feedback"]
    entry_date: date
    minutes: int | None = Field(default=None, ge=1, le=1440, strict=True)
    note: str = Field(min_length=1, max_length=4000)
    task_id: uuid.UUID | None = None
    @field_validator("note")
    @classmethod
    def trim(cls,v):
        if not v.strip(): raise ValueError("请填写原始学习内容或行动结果")
        return v.strip()
    @model_validator(mode="after")
    def shape(self):
        if self.kind == "learning" and (self.minutes is None or self.task_id is not None): raise ValueError("学习投入需要实际分钟")
        if self.kind == "feedback" and (self.minutes is not None or self.task_id is None): raise ValueError("反馈需要关联任务")
        return self

class DiscussRequest(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID
    period: Literal["day","week","month"]
    anchor: date

async def owned(session, uid, wid):
    if not await get_workspace(session, uid, wid): raise NotFoundException("工作台")

async def fact_data(session, uid, row):
    task = await get_task(session,uid,row.task_id) if row.task_id else None
    cid = (await session.execute(select(AgentConversation.id).join(AgentTurn,AgentTurn.conversation_id==AgentConversation.id).where(AgentConversation.user_id==uid,AgentConversation.workspace_id==row.workspace_id,AgentTurn.confirmed_task_id==row.task_id))).scalar_one_or_none() if task else None
    return {"id":str(row.id),"workspace_id":str(row.workspace_id),"kind":row.kind,"entry_date":str(row.entry_date),"minutes":row.minutes,"note":row.note,"task_id":str(task.id) if task else None,"task_title":task.title if task else None,"conversation_id":str(cid) if cid else None,"created_at":row.created_at.isoformat()}

async def task_result(session, uid, task):
    if not task: return None
    origin = (await session.execute(select(AgentConversation.id, AgentTurn.id).join(AgentTurn, AgentTurn.conversation_id == AgentConversation.id).where(AgentConversation.user_id == uid, AgentConversation.workspace_id == task.workspace_id, AgentTurn.confirmed_task_id == task.id))).first()
    return task_response(task, {"conversation_id":str(origin[0]), "turn_id":str(origin[1])} if origin else None).model_dump()

@router.get("/report", response_model=ApiResponse[dict])
async def report(workspace_id:uuid.UUID,period:Literal["day","week","month"],anchor:date,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    # One database snapshot keeps completion and feedback consistent across reads.
    await session.execute(text("SET TRANSACTION ISOLATION LEVEL REPEATABLE READ"))
    uid=uuid.UUID(user_id);await owned(session,uid,workspace_id)
    data,_=await build_report(session,uid,workspace_id,await settings_for(session,uid),period,anchor)
    return ApiResponse(success=True,data=data)

@router.get("/facts", response_model=ApiResponse[list])
async def list_facts(workspace_id:uuid.UUID,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id);await owned(session,uid,workspace_id)
    rows=(await session.execute(select(WorkspaceFact).where(WorkspaceFact.user_id==uid,WorkspaceFact.workspace_id==workspace_id).order_by(WorkspaceFact.created_at.desc(),WorkspaceFact.id))).scalars().all()
    return ApiResponse(success=True,data=[await fact_data(session,uid,row) for row in rows])

@router.post("/facts", response_model=ApiResponse[dict])
async def save_fact(workspace_id:uuid.UUID,payload:FactRequest,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id)
    await session.execute(select(User.id).where(User.id==uid).with_for_update())
    await owned(session,uid,workspace_id)
    existing=await session.get(WorkspaceFact,payload.id)
    if existing:
        if existing.user_id!=uid or existing.workspace_id!=workspace_id: raise NotFoundException("记录")
        if any(getattr(existing,k)!=v for k,v in payload.model_dump().items()): raise AppException("REQUEST_CONFLICT","这次提交的原文已固定，请新建一条记录。",409)
        await session.commit()
        task=await get_task(session,uid,existing.task_id) if existing.task_id else None
        return ApiResponse(success=True,data={"fact":await fact_data(session,uid,existing),"task":await task_result(session,uid,task)})
    today=user_today(await settings_for(session,uid))
    if payload.entry_date>today or (payload.kind=="feedback" and payload.entry_date!=today): raise AppException("INVALID_DATE","学习日期不能在未来；行动结果记录在今天。",422)
    task=None
    if payload.task_id:
        task=await get_task(session,uid,payload.task_id)
        if not task or task.workspace_id!=workspace_id: raise NotFoundException("任务")
        previous=(await session.execute(select(WorkspaceFact.id).where(WorkspaceFact.task_id==task.id))).scalar_one_or_none()
        if previous: raise AppException("FEEDBACK_EXISTS","这个任务已有完成结果，请在数据页查看原文。",409)
        await complete_task(session,task)
    row=WorkspaceFact(user_id=uid,workspace_id=workspace_id,**payload.model_dump())
    session.add(row)
    await append_event(session,user_id=uid,workspace_id=workspace_id,event_type="learning_time_recorded" if row.kind=="learning" else "action_feedback_recorded",source_type="workspace_fact",source_id=row.id,payload={"entry_date":str(row.entry_date),"minutes":row.minutes,"task_id":str(row.task_id) if row.task_id else None})
    await session.commit()
    return ApiResponse(success=True,data={"fact":await fact_data(session,uid,row),"task":await task_result(session,uid,task)})

@router.post("/discuss", response_model=ApiResponse[dict])
async def discuss(payload:DiscussRequest,user_id:str=Depends(get_current_user_id),session:AsyncSession=Depends(get_db)):
    uid=uuid.UUID(user_id)
    await session.execute(select(User.id).where(User.id==uid).with_for_update())
    await owned(session,uid,payload.workspace_id)
    existing=await session.get(AgentConversation,payload.id)
    if existing:
        if existing.user_id!=uid or existing.workspace_id!=payload.workspace_id or not existing.analysis_snapshot_id: raise NotFoundException("分析会话")
        snapshot=await session.get(AnalysisSnapshot,existing.analysis_snapshot_id)
        if snapshot.period!=payload.period or snapshot.anchor!=payload.anchor: raise AppException("REQUEST_CONFLICT","这段会话的分析范围已固定。",409)
        await session.commit()
        return ApiResponse(success=True,data={"conversation_id":str(existing.id),"snapshot_id":str(snapshot.id)})
    settings=await settings_for(session,uid)
    data,refs=await build_report(session,uid,payload.workspace_id,settings,payload.period,payload.anchor,ai_scope=True)
    snapshot=AnalysisSnapshot(user_id=uid,workspace_id=payload.workspace_id,period=payload.period,anchor=payload.anchor,report=data,source_refs=refs,enabled_sources=[s for s in user_privacy_scope(settings)["enabled_sources"] if s in ("tasks","learning","reflections")])
    session.add(snapshot);await session.flush()
    session.add(AgentConversation(id=payload.id,user_id=uid,workspace_id=payload.workspace_id,analysis_snapshot_id=snapshot.id,title=f"{data['start']} · 事实分析"))
    await session.commit()
    return ApiResponse(success=True,data={"conversation_id":str(payload.id),"snapshot_id":str(snapshot.id)})
