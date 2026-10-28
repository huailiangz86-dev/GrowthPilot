"""Persistent personal Agent dialogue; generation and confirmed writes are separate."""
import json
import uuid
from datetime import UTC, datetime, timedelta
from typing import Literal

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import llm_service
from app.ai.prompt_router import get_variant
from app.api.tasks import _response as task_response
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException
from app.engines.agent_context import build_context, refs_current, resolve_source, settings_for
from app.engines.privacy_scope import user_privacy_scope
from app.engines.task_engine import create_task
from app.engines.workspace_engine import append_event, get_workspace
from app.models.agent_conversation import AgentConversation, AgentTurn
from app.models.task import Task
from app.models.user import User
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/personal-agent", tags=["personal-agent"])
logger = structlog.get_logger()


class ConversationRequest(BaseModel):
    id: uuid.UUID
    workspace_id: uuid.UUID


class TurnRequest(BaseModel):
    client_request_id: uuid.UUID
    question: str = Field(min_length=1, max_length=2000)

    @field_validator("question")
    @classmethod
    def trim_question(cls, value):
        if not value.strip():
            raise ValueError("问题不能为空")
        return value.strip()


class Suggestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(max_length=4000)
    priority: Literal["low", "medium", "high"]
    time_block: int | None = Field(ge=5, le=720)

    @field_validator("title")
    @classmethod
    def trim_title(cls, value):
        if not value.strip():
            raise ValueError("行动名称不能为空")
        return value.strip()


class ModelReply(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    reply: str = Field(min_length=1, max_length=6000)
    citation_keys: list[str] = Field(max_length=8)
    suggestion: Suggestion | None

    @field_validator("reply")
    @classmethod
    def nonempty_reply(cls, value):
        if not value.strip():
            raise ValueError("回复为空")
        return value.strip()


class ConfirmRequest(Suggestion):
    confirmed: Literal[True]


async def conversation_for(session, uid, cid, *, lock=False):
    query = select(AgentConversation).where(AgentConversation.id == cid, AgentConversation.user_id == uid).execution_options(populate_existing=True)
    if lock:
        query = query.with_for_update()
    conversation = (await session.execute(query)).scalar_one_or_none()
    if not conversation or not await get_workspace(session, uid, conversation.workspace_id):
        raise NotFoundException("会话")
    return conversation


def conversation_data(conversation):
    return {"id": str(conversation.id), "workspace_id": str(conversation.workspace_id), "title": conversation.title,
            "updated_at": conversation.updated_at.isoformat()}


async def turn_data(session, uid, wid, turn, settings):
    confirmed_title = (await session.execute(select(Task.title).where(Task.id == turn.confirmed_task_id, Task.user_id == uid, Task.workspace_id == wid, Task.deleted_at.is_(None)))).scalar_one_or_none() if turn.confirmed_task_id else None
    valid = await refs_current(session, uid, wid, turn.context_refs, settings) if turn.status == "completed" else True
    citations = []
    for ref in turn.citations:
        current = await resolve_source(session, uid, wid, ref["key"], settings)
        available = bool(current and current["digest"] == ref["digest"])
        citations.append({"key": ref["key"], "source": ref["source"], "title": ref["title"] if available else "来源不可用", "available": available})
    expired = turn.status == "processing" and turn.lease_until <= datetime.now(UTC)
    return {"id": str(turn.id), "client_request_id": str(turn.client_request_id), "question": turn.question,
            "status": "failed" if expired else turn.status,
            "reply": turn.reply if valid else "来源已变更、删除或移出数据范围，这段回复已隐藏。请重新提问。",
            "error": "上次处理被中断，提问已保存，可重试。" if expired else turn.error,
            "citations": citations, "suggestion": turn.suggestion if valid else None,
            "confirmed_task_id": str(turn.confirmed_task_id) if turn.confirmed_task_id else None,
            "confirmed_task_title": confirmed_title,
            "created_at": turn.created_at.isoformat(), "redacted": not valid}


@router.post("/conversations", response_model=ApiResponse[dict])
async def create_conversation(payload: ConversationRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    # The client chooses a stable conversation ID so a lost creation response is replayable.
    await session.execute(select(User.id).where(User.id == uid).with_for_update())
    workspace = await get_workspace(session, uid, payload.workspace_id)
    if not workspace:
        raise NotFoundException("工作台")
    existing = await session.get(AgentConversation, payload.id)
    if existing:
        if existing.user_id != uid or existing.workspace_id != payload.workspace_id:
            raise NotFoundException("会话")
        await session.commit()
        return ApiResponse(success=True, data=conversation_data(existing))
    conversation = AgentConversation(id=payload.id, user_id=uid, workspace_id=payload.workspace_id)
    session.add(conversation)
    await session.commit()
    return ApiResponse(success=True, data=conversation_data(conversation))


@router.get("/conversations", response_model=ApiResponse[list])
async def list_conversations(workspace_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    if not await get_workspace(session, uid, workspace_id):
        raise NotFoundException("工作台")
    rows = (await session.execute(select(AgentConversation).where(AgentConversation.user_id == uid, AgentConversation.workspace_id == workspace_id).order_by(AgentConversation.updated_at.desc(), AgentConversation.id).limit(100))).scalars().all()
    return ApiResponse(success=True, data=[conversation_data(row) for row in rows])


@router.get("/conversations/{conversation_id}", response_model=ApiResponse[dict])
async def get_conversation(conversation_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    conversation = await conversation_for(session, uid, conversation_id)
    settings = await settings_for(session, uid)
    turns = (await session.execute(select(AgentTurn).where(AgentTurn.conversation_id == conversation_id).order_by(AgentTurn.created_at, AgentTurn.id))).scalars().all()
    data = conversation_data(conversation)
    if conversation.analysis_snapshot_id:
        from app.models.workspace_fact import AnalysisSnapshot
        snapshot = await session.get(AnalysisSnapshot, conversation.analysis_snapshot_id)
        source = await resolve_source(session, uid, conversation.workspace_id, f"analysis:{snapshot.id}", settings)
        data["analysis"] = {"start":snapshot.report["start"], "end":snapshot.report["end"], "period":snapshot.period, "anchor":str(snapshot.anchor), "generated_at":snapshot.report["generated_at"], "excluded_sources":snapshot.report["excluded_sources"], "available":bool(source)}
    data["turns"] = [await turn_data(session, uid, conversation.workspace_id, turn, settings) for turn in turns]
    return ApiResponse(success=True, data=data)


@router.post("/conversations/{conversation_id}/turns", response_model=ApiResponse[dict])
async def send_turn(conversation_id: uuid.UUID, payload: TurnRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    conversation = await conversation_for(session, uid, conversation_id, lock=True)
    wid = conversation.workspace_id
    now = datetime.now(UTC)
    turn = (await session.execute(select(AgentTurn).where(AgentTurn.conversation_id == conversation_id, AgentTurn.client_request_id == payload.client_request_id))).scalar_one_or_none()
    if turn:
        if turn.question != payload.question:
            raise AppException("REQUEST_CONFLICT", "这次提问的原文已固定，请新建一次提问。", 409)
        if turn.status == "completed" or (turn.status == "processing" and turn.lease_until > now):
            await session.commit()
            return ApiResponse(success=True, data=await turn_data(session, uid, wid, turn, await settings_for(session, uid)))
    active = (await session.execute(select(AgentTurn.id).where(AgentTurn.conversation_id == conversation_id, AgentTurn.status == "processing", AgentTurn.lease_until > now))).first()
    if active:
        raise AppException("TURN_BUSY", "这段会话正在处理上一条提问，请稍后再试。", 409)
    attempt = uuid.uuid4()
    if not turn:
        turn = AgentTurn(id=uuid.uuid4(), conversation_id=conversation_id, client_request_id=payload.client_request_id, question=payload.question, attempt_id=attempt, lease_until=now + timedelta(minutes=5))
        session.add(turn)
        conversation.title = payload.question[:80] if conversation.title == "新对话" else conversation.title
    turn.status, turn.error, turn.attempt_id, turn.lease_until, turn.updated_at = "processing", None, attempt, now + timedelta(minutes=5), now
    conversation.updated_at = now
    await session.commit()  # Durable question before network/model work; no database lock spans the call.
    tid = turn.id
    try:
        settings = await settings_for(session, uid)
        analysis_citations = []
        if conversation.analysis_snapshot_id:
            source = await resolve_source(session, uid, wid, f"analysis:{conversation.analysis_snapshot_id}", settings)
            if not source:
                raise ValueError("analysis source changed or permissions withdrawn")
            context = [source]
            # Excerpts are also independently citable originals. Only expose the
            # exact originals in this frozen report, under the same boundary.
            for excerpt in json.loads(source["content"])["evidence"]:
                original = await resolve_source(session, uid, wid, excerpt["key"], settings)
                if original:
                    analysis_citations.append(original)
        else:
            context = await build_context(session, uid, wid, settings)
        history = []
        inherited = []
        older = (await session.execute(select(AgentTurn).where(AgentTurn.conversation_id == conversation_id, AgentTurn.created_at < turn.created_at, AgentTurn.status == "completed").order_by(AgentTurn.created_at.desc()).limit(6))).scalars().all()
        history_size = 0
        seen_keys = {ref["key"] for ref in context}
        for previous in older:
            size = len(previous.question) + len(previous.reply or "")
            expanded_keys = seen_keys | {ref["key"] for ref in previous.context_refs}
            if history_size + size > 18000 or len(expanded_keys) > 128:
                continue
            if await refs_current(session, uid, wid, previous.context_refs, settings):
                history[0:0] = [{"role": "user", "content": previous.question}, {"role": "assistant", "content": previous.reply}]
                inherited.extend(previous.context_refs)
                history_size += size
                seen_keys = expanded_keys
        refs = {ref["key"]: {"key": ref["key"], "digest": ref["digest"]} for ref in inherited + context}
        turn.context_refs = list(refs.values())
        variant = await get_variant(user_id, "personal_agent")
        turn.prompt_version = variant.version
        workspace = await get_workspace(session, uid, wid)
        variables = {"workspace": workspace.name, "scope": json.dumps(user_privacy_scope(settings)["enabled_sources"]),
                     "context": json.dumps(context, ensure_ascii=False), "citation_allowlist":json.dumps([ref["key"] for ref in context + analysis_citations]), "history": json.dumps(history, ensure_ascii=False), "question": payload.question}
        await session.commit()
        raw = await llm_service.structured_output(session, user_id, "personal_agent", variables, variant)
        result = ModelReply.model_validate(raw)
        allowed = {ref["key"]: ref for ref in context + analysis_citations}
        if any(key not in allowed for key in result.citation_keys):
            raise ValueError("model returned an unknown citation")
        # A previous expired worker cannot overwrite a newer retry's result.
        conversation = await conversation_for(session, uid, conversation_id, lock=True)
        turn = (await session.execute(select(AgentTurn).where(AgentTurn.id == tid).execution_options(populate_existing=True))).scalar_one()
        current_settings = await settings_for(session, uid)
        if turn.attempt_id != attempt:
            await session.commit()
            return ApiResponse(success=True, data=await turn_data(session, uid, wid, turn, current_settings))
        if not await refs_current(session, uid, wid, turn.context_refs, current_settings):
            turn.status, turn.error = "failed", "处理期间来源或数据范围发生变化，请重试以使用当前数据。"
        else:
            turn.status, turn.reply, turn.error = "completed", result.reply, None
            turn.citations = [{k: allowed[key][k] for k in ("key", "digest", "source", "title")} for key in dict.fromkeys(result.citation_keys)]
            turn.suggestion = result.suggestion.model_dump() if result.suggestion else None
        turn.updated_at = conversation.updated_at = datetime.now(UTC)
        await session.commit()
    except Exception as exc:
        logger.warning("personal_agent_generation_failed", turn_id=str(tid), error_type=type(exc).__name__)
        await session.rollback()
        await conversation_for(session, uid, conversation_id, lock=True)
        turn = (await session.execute(select(AgentTurn).where(AgentTurn.id == tid).execution_options(populate_existing=True))).scalar_one()
        if turn.attempt_id == attempt:
            turn.status, turn.error, turn.updated_at = "failed", "模型暂时无法回复或返回了无效结果。提问已保存，可以重试。", datetime.now(UTC)
        await session.commit()
    return ApiResponse(success=True, data=await turn_data(session, uid, wid, turn, await settings_for(session, uid)))


@router.get("/conversations/{conversation_id}/turns/{turn_id}/source", response_model=ApiResponse[dict])
async def get_source(conversation_id: uuid.UUID, turn_id: uuid.UUID, key: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    conversation = await conversation_for(session, uid, conversation_id)
    turn = (await session.execute(select(AgentTurn).where(AgentTurn.id == turn_id, AgentTurn.conversation_id == conversation_id))).scalar_one_or_none()
    ref = next((ref for ref in turn.citations if ref["key"] == key), None) if turn else None
    if not ref:
        raise NotFoundException("来源")
    current = await resolve_source(session, uid, conversation.workspace_id, key, await settings_for(session, uid))
    if not current or current["digest"] != ref["digest"]:
        return ApiResponse(success=True, data={"available": False, "title": "来源不可用", "content": "", "reason": "来源已变更、删除、归档或移出允许范围。"})
    if current["source"] == "analysis":
        from app.engines.workspace_analysis import readable_snapshot
        current = {**current,"content":readable_snapshot(current["content"])}
    return ApiResponse(success=True, data={"available": True, "title": current["title"], "content": current["content"]})


@router.post("/conversations/{conversation_id}/turns/{turn_id}/confirm", response_model=ApiResponse[dict])
async def confirm_action(conversation_id: uuid.UUID, turn_id: uuid.UUID, payload: ConfirmRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    conversation = await conversation_for(session, uid, conversation_id, lock=True)
    turn = (await session.execute(select(AgentTurn).where(AgentTurn.id == turn_id, AgentTurn.conversation_id == conversation_id))).scalar_one_or_none()
    if not turn:
        raise NotFoundException("建议")
    if turn.confirmed_task_id:
        task = await session.get(Task, turn.confirmed_task_id)
        if not task or task.deleted_at is not None:
            raise NotFoundException("已确认行动")
    else:
        if turn.status != "completed" or not turn.suggestion:
            raise AppException("NO_SUGGESTION", "这条回复没有可确认的建议。", 409)
        if not await refs_current(session, uid, conversation.workspace_id, turn.context_refs, await settings_for(session, uid)):
            raise AppException("SOURCE_CHANGED", "建议的来源已变更，请重新提问后再确认。", 409)
        task = await create_task(session, workspace=await get_workspace(session, uid, conversation.workspace_id), values=payload.model_dump(exclude={"confirmed"}))
        await session.flush()  # Persist the new Task before the existing turn's FK update.
        turn.confirmed_task_id = task.id
        await append_event(session, user_id=uid, workspace_id=conversation.workspace_id, event_type="agent_action_confirmed", source_type="task", source_id=task.id,
            payload={"conversation_id": str(conversation_id), "turn_id": str(turn_id), "citation_keys": [ref["key"] for ref in turn.citations], "edited_action": payload.model_dump(exclude={"confirmed"})})
        await session.commit()
    return ApiResponse(success=True, data={"task": task_response(task, {"conversation_id": str(conversation_id), "turn_id": str(turn_id)}).model_dump(), "turn": await turn_data(session, uid, conversation.workspace_id, turn, await settings_for(session, uid))})
