"""One-item AI help: explicit input, source versions, replay and bounded leases."""
import hashlib
import json
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo
import structlog

from fastapi import APIRouter, Depends
from pydantic import Field, StrictBool, StrictInt, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai import llm_service
from app.ai.prompt_router import get_variant
from app.api.personal_life import Strict, valid_timezone, workspace_owned
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.privacy_scope import privacy_source_enabled
from app.engines.expert_skills import Teaching, learning_skill, validate_teaching
from app.models.item_help import ItemHelp
from app.engines.learning_diagnosis import diagnosis_source, validate_diagnosis
from app.models.personal_work import PersonalDocument
from app.models.user import User
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/item-help", tags=["item-help"])
logger = structlog.get_logger()


class HelpRequest(Strict):
    request_id: uuid.UUID
    kind: Literal["fitness_extract", "learning_explain", "learning_practice", "learning_feedback", "learning_diagnose"]
    evidence_keys: list[str] = Field(default_factory=list, max_length=10)
    consent: StrictBool
    text: str = Field(default="", max_length=10000)
    timezone: str = Field(default="Asia/Shanghai", max_length=64)
    workspace_id: uuid.UUID | None = None
    item_id: uuid.UUID | None = None
    base_version: StrictInt = Field(default=0, ge=0)
    question: str = Field(default="", max_length=2000)
    answer: str = Field(default="", max_length=10000)
    _zone = field_validator("timezone")(valid_timezone)

    @model_validator(mode="after")
    def explicit_scope(self):
        if self.kind == "learning_diagnose":
            if not self.evidence_keys or len(set(self.evidence_keys)) != len(self.evidence_keys) or any(not key or len(key)>100 for key in self.evidence_keys):
                raise ValueError("请选择不重复的已保存学习记录，最多 10 条")
        elif self.evidence_keys:
            raise ValueError("这项帮助不接受额外学习记录")
        if not self.consent:
            raise ValueError("请明确选择把这次内容交给 AI 处理")
        if self.kind == "fitness_extract":
            if not self.text.strip() or self.workspace_id or self.item_id or self.answer or self.question or self.base_version:
                raise ValueError("健身整理只接收本次填写的原话与时区")
        elif not self.workspace_id or not self.item_id or self.text or not self.base_version:
            raise ValueError("学习帮助需要已保存的学习页和版本")
        if self.kind == "learning_feedback" and not self.answer.strip():
            raise ValueError("请先填写本人的实际答案")
        if self.kind != "learning_feedback" and self.answer:
            raise ValueError("本次操作不接收答案")
        return self


class CandidateExercise(Strict):
    name: str = Field(min_length=1, max_length=120)
    weight: float | None = Field(ge=0, le=1000)
    sets: StrictInt | None = Field(ge=1, le=100)
    reps: StrictInt | None = Field(ge=1, le=1000)
    quote: str = Field(min_length=1, max_length=1000)

    @field_validator("weight", mode="before")
    @classmethod
    def number_only(cls, value):
        if value is not None and (isinstance(value, bool) or not isinstance(value, (float, int))):
            raise ValueError("候选重量必须为数字或未知")
        return value


class FitnessCandidate(Strict):
    title: str = Field(min_length=1, max_length=240)
    occurred_on: date | None
    outcome: Literal["completed", "skipped"] | None
    actual_minutes: StrictInt | None = Field(ge=1, le=1440)
    exercises: list[CandidateExercise] = Field(max_length=30)
    quotes: list[str] = Field(min_length=1, max_length=8)
    uncertainty: str = Field(max_length=2000)


class LearningReply(Strict):
    text: str = Field(min_length=1, max_length=12000)
    quotes: list[str] = Field(min_length=1, max_length=8)
    teaching: Teaching | None = None


def digest(value):
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True).encode()).hexdigest()


async def learning_source(session, uid, wid, iid):
    await workspace_owned(session, uid, wid)
    user = await session.scalar(select(User).where(User.id == uid).execution_options(populate_existing=True))
    if not privacy_source_enabled(user.settings, "learning"):
        raise AppException("HELP_SCOPE", "学习数据读取已关闭。可在我的数据范围中调整。", 403)
    item = await session.scalar(select(WorkspaceLearningItem).where(WorkspaceLearningItem.id == iid,
        WorkspaceLearningItem.user_id == uid, WorkspaceLearningItem.workspace_id == wid,
        WorkspaceLearningItem.archived_at.is_(None)).execution_options(populate_existing=True))
    doc = await session.scalar(select(PersonalDocument).where(PersonalDocument.learning_item_id == iid,
        PersonalDocument.user_id == uid, PersonalDocument.workspace_id == wid).execution_options(populate_existing=True))
    if not item or not doc:
        raise NotFoundException("已保存的学习内容")
    c = doc.content
    # Links remain pointers. Only the selected saved text is sent to the model.
    fields = {k: str(c.get(k, "")) for k in ("title", "aim", "notes", "questions", "exercise")}
    if not fields["notes"].strip():
        raise ValidationException("请先保存一段实际资料摘录或笔记；只有链接无法解释原文")
    if sum(len(v) for v in fields.values()) > 24000:
        raise ValidationException("本次学习正文超过 24000 字，请先缩短摘录与练习")
    return {"version": doc.version, "document_id": str(doc.id), "digest": digest({"version": doc.version,
        "content": c, "item_updated_at": item.updated_at.isoformat()}), "fields": fields}


async def source_current(session, row):
    if row.kind == "fitness_extract":
        return True
    try:
        source = await diagnosis_source(session, row.user_id, row.workspace_id, row.item_id, row.source["evidence_keys"]) if row.kind == "learning_diagnose" else await learning_source(session, row.user_id, row.workspace_id, row.item_id)
        return source["digest"] == row.source.get("digest")
    except AppException:
        return False


async def help_data(session, row):
    current = await source_current(session, row)
    expired = row.status == "processing" and row.lease_until <= datetime.now(UTC)
    return {"request_id": str(row.request_id), "kind": row.kind,
        "status": "failed" if expired else row.status, "redacted": not current,
        "error": "上次处理被中断，原输入已保留，可重试。" if expired else row.error,
        "input": row.input if current else None, "source": row.source if current else None,
        "result": row.result if current else None, "created_at": row.created_at.isoformat(),
        "prompt_version": row.prompt_version}


def validate_result(raw, request, source, require_bounded=False):
    if request.kind == "learning_diagnose":
        return validate_diagnosis(raw, source, require_bounded=require_bounded)
    model = FitnessCandidate if request.kind == "fitness_extract" else LearningReply
    reply = model.model_validate(raw)
    body = request.text if request.kind == "fitness_extract" else source["fields"]["notes"]
    quotes = reply.quotes + ([e.quote for e in reply.exercises] if isinstance(reply, FitnessCandidate) else [])
    if any(not q.strip() or len(q) > 2000 or q not in body for q in quotes):
        raise ValueError("AI 引用无法在本次原始内容中找到")
    if isinstance(reply, FitnessCandidate):
        if reply.occurred_on and reply.occurred_on > date.fromisoformat(source["today"]):
            raise ValueError("AI 返回了未来的实际日期")
        if reply.outcome != "completed" and (reply.exercises or reply.actual_minutes is not None):
            raise ValueError("未确认完成的候选不能带有训练数值")
    elif not reply.text.strip():
        raise ValueError("AI 回复为空")
    result = reply.model_dump(mode="json")
    if isinstance(reply, LearningReply) and reply.teaching is None:
        result.pop('teaching')
    if request.kind != 'fitness_extract' and source.get('expert_skill'):
        result['teaching'] = validate_teaching(raw.get('teaching'), source, request.kind, request.answer)
        if request.kind == 'learning_practice' and any(line.strip().startswith('检查项 C') for line in reply.text.splitlines()):
            raise ValueError('练习正文与结构化检查项重复')
        result['skill'] = source['expert_skill']
    return result


async def generate_help(session, uid, payload):
    # Stable per-user request identity, serialized only before/after model work.
    if not await session.scalar(select(User.id).where(User.id == uid).with_for_update()):
        raise NotFoundException("User")
    fingerprint = digest(payload.model_dump(mode="json", exclude={"evidence_keys"} if payload.kind != "learning_diagnose" else set()))
    row = await session.scalar(select(ItemHelp).where(ItemHelp.user_id == uid,
        ItemHelp.request_id == payload.request_id).execution_options(populate_existing=True))
    if row:
        if row.fingerprint != fingerprint:
            raise AppException("HELP_CONFLICT", "同一 AI 请求的原内容已固定，请新建一次请求。", 409)
        if row.status == "completed" or (row.status == "processing" and row.lease_until > datetime.now(UTC)):
            await session.commit()
            return await help_data(session, row)
    if payload.kind == "fitness_extract":
        source = row.source if row else {"text": payload.text, "timezone": payload.timezone,
            "today": datetime.now(ZoneInfo(payload.timezone)).date().isoformat()}
    else:
        source = await diagnosis_source(session, uid, payload.workspace_id, payload.item_id, payload.evidence_keys) if payload.kind == "learning_diagnose" else await learning_source(session, uid, payload.workspace_id, payload.item_id)
        if source["version"] != payload.base_version or (row and source["digest"] != row.source["digest"]):
            raise AppException("HELP_STALE", "笔记或练习已有新版本，请基于当前内容重新请求。", 409)
        if payload.kind == "learning_feedback" and not source["fields"]["exercise"].strip():
            raise ValidationException("请先保存具体练习题，再提交答案反馈")
        # Freeze the skill version/manifest and rubric with the selected text.
        # Business source digest is unchanged; new pack versions don't hide old results.
        if payload.kind == 'learning_diagnose':
            pass
        elif row and row.source.get('expert_skill'):
            source = row.source
        else:
            try:
                source = {**source, 'expert_skill': learning_skill(source, payload.kind)}
            except ValueError as exc:
                raise ValidationException(str(exc)) from exc
    active = await session.scalar(select(ItemHelp.id).where(ItemHelp.user_id == uid,
        ItemHelp.status == "processing", ItemHelp.lease_until > datetime.now(UTC),
        ItemHelp.request_id != payload.request_id))
    if active:
        raise AppException("HELP_BUSY", "上一份帮助正在生成，请稍后重试。", 409)
    now, attempt = datetime.now(UTC), uuid.uuid4()
    purpose = "fitness_extract" if payload.kind == "fitness_extract" else "learning_diagnosis" if payload.kind == "learning_diagnose" else "learning_help"
    variant = await get_variant(str(uid), purpose)
    if not row:
        row = ItemHelp(id=uuid.uuid5(uid, str(payload.request_id)), user_id=uid, request_id=payload.request_id,
            workspace_id=payload.workspace_id, item_id=payload.item_id, kind=payload.kind,
            fingerprint=fingerprint, input=payload.model_dump(mode="json"), source=source, created_at=now)
        session.add(row)
    row.status, row.error, row.result = "processing", None, None
    row.source = source
    row.attempt_id, row.lease_until, row.updated_at, row.prompt_version = attempt, now + timedelta(minutes=5), now, variant.version
    await session.commit()
    try:
        bounded = purpose == 'learning_diagnosis' and variant.data.get('evidence_selection', False)
        model_source, raw = source, None
        if bounded:
            from app.engines.bounded_learning import prepare_model_source, preflight_assessment
            raw = preflight_assessment(source, payload.question)
            model_source = prepare_model_source(purpose, source)
        prechecked = raw is not None
        if raw is None:
            raw = await llm_service.structured_output(session, str(uid), purpose,
                {"source": json.dumps(model_source, ensure_ascii=False), "kind": payload.kind,
                 "question": payload.question, "answer": payload.answer}, variant)
        result = validate_result(raw, payload, source, require_bounded=bounded)
        if bounded:
            result['assessment_mode'] = 'source_precheck' if prechecked else 'evidence_selection'
        failure = None
    except Exception as exc:
        logger.warning("item_help_failed", request_id=str(payload.request_id), kind=payload.kind, error_type=type(exc).__name__)
        await session.rollback()
        result, failure = None, "AI 暂时无法完成这次帮助，原输入仍保留。可重试或继续手动操作。"
    await session.scalar(select(User.id).where(User.id == uid).with_for_update())
    row = await session.scalar(select(ItemHelp).where(ItemHelp.user_id == uid,
        ItemHelp.request_id == payload.request_id).execution_options(populate_existing=True))
    if row.attempt_id == attempt:
        if not await source_current(session, row):
            result, failure = None, "处理期间笔记或读取范围发生改变，请重新请求。"
        row.result, row.error, row.status, row.updated_at = result, failure, "failed" if failure else "completed", datetime.now(UTC)
    await session.commit()
    return await help_data(session, row)


@router.post("")
async def create(payload: HelpRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    return ApiResponse(success=True, data=await generate_help(session, uuid.UUID(user_id), payload))


@router.get("")
async def list_help(workspace_id: uuid.UUID, item_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await workspace_owned(session, uid, workspace_id)
    rows = (await session.scalars(select(ItemHelp).where(ItemHelp.user_id == uid, ItemHelp.workspace_id == workspace_id,
        ItemHelp.item_id == item_id).order_by(ItemHelp.created_at.desc(), ItemHelp.id).limit(20))).all()
    return ApiResponse(success=True, data=[await help_data(session, row) for row in rows])


@router.get("/{request_id}")
async def read(request_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    row = await session.scalar(select(ItemHelp).where(ItemHelp.user_id == uuid.UUID(user_id), ItemHelp.request_id == request_id))
    if not row:
        raise NotFoundException("AI 帮助")
    return ApiResponse(success=True, data=await help_data(session, row))
