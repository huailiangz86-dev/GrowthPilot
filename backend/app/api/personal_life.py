"""Person-owned fitness facts and deterministic views; explicit AI adoption."""
import hashlib
import json
import uuid
from datetime import UTC, date, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, StrictBool, StrictInt, ValidationError, field_validator, model_validator
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.workspace_engine import append_event
from app.models.personal_life import LifeCommandReceipt, LifeRecord, LifeRevision, LifeWorkspaceReference, PersonalHabit
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/personal-life", tags=["personal-life"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)


def valid_timezone(value):
    try:
        ZoneInfo(value)
    except (ValueError, ZoneInfoNotFoundError) as exc:
        raise ValueError("请选择有效时区") from exc
    return value


class Exercise(Strict):
    name: str = Field(min_length=1, max_length=120)
    weight: float = Field(ge=0, le=1000)
    unit: Literal["kg"] = "kg"
    sets: StrictInt = Field(ge=1, le=100)
    reps: StrictInt = Field(ge=1, le=1000)
    equipment: Literal['bodyweight', 'dumbbell', 'barbell', 'machine', 'band'] | None = None

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, value):
        if not value.strip():
            raise ValueError("名称不能为空")
        return value.strip()

    @field_validator("weight", mode="before")
    @classmethod
    def actual_number(cls, value):
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            raise ValueError("重量需要明确数值；未知时请先不填动作")
        return value


class WorkoutContent(Strict):
    title: str = Field(min_length=1, max_length=240)
    occurred_on: date
    timezone: str = Field(default="Asia/Shanghai", max_length=64)
    outcome: Literal["completed", "skipped"]
    actual_minutes: StrictInt | None = Field(default=None, ge=1, le=1440)
    exercises: list[Exercise] = Field(default_factory=list, max_length=100)
    note: str = Field(default="", max_length=10000)
    source: Literal["manual", "reuse", "ai"] = "manual"
    original: str = Field(max_length=20000)
    confirmed: StrictBool
    reused_from: uuid.UUID | None = None
    habit_id: uuid.UUID | None = None
    help_request_id: uuid.UUID | None = None
    expert_plan_id: uuid.UUID | None = None
    effort: StrictInt | None = Field(default=None, ge=1, le=10)
    recovery: Literal['ready', 'tired', 'pain_or_unwell'] | None = None
    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value):
        return Exercise.name_not_blank(value)

    _zone = field_validator("timezone")(valid_timezone)

    @model_validator(mode="after")
    def fact_validation(self):
        if not self.confirmed:
            raise ValueError("实际记录需要本人明确确认")
        if self.occurred_on > datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError("实际发生日期不能在未来")
        if self.outcome == "skipped" and (self.actual_minutes is not None or self.exercises or self.effort is not None or self.recovery is not None):
            raise ValueError("明确未执行不能带有实际用时或动作")
        if self.source == "reuse" and self.reused_from is None:
            raise ValueError("复用需保留原记录引用")
        if self.source == "manual" and self.reused_from is not None:
            raise ValueError("手动记录不能带有复用来源")
        if (self.source == "ai") != (self.help_request_id is not None) or (self.source == "ai" and self.reused_from):
            raise ValueError("AI 整理需要保留本次原话与帮助来源")
        if not self.original.strip():
            raise ValueError("请保留最初填写的原始记录")
        return self


class HabitContent(Strict):
    enabled: StrictBool = False
    days: list[StrictInt] = Field(default_factory=list, max_length=7)
    time: str = Field(default="18:30", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    timezone: str = Field(default="Asia/Shanghai", max_length=64)
    effective_from: date
    _zone = field_validator("timezone")(valid_timezone)

    @model_validator(mode="after")
    def valid_rule(self):
        if any(d < 0 or d > 6 for d in self.days) or len(set(self.days)) != len(self.days):
            raise ValueError("每周日期需为不重复的 0–6")
        if self.enabled and not self.days:
            raise ValueError("启用习惯时至少选择一天")
        if self.effective_from < datetime.now(ZoneInfo(self.timezone)).date():
            raise ValueError("新习惯规则从今天或之后生效，不覆盖过去规则")
        return self


class AccessContent(Strict):
    fitness_expert_enabled: StrictBool = False


class ReferenceContent(Strict):
    workspace_id: uuid.UUID


class LifeCommand(Strict):
    request_id: uuid.UUID
    entity_id: uuid.UUID
    action: Literal["create_record", "save_record", "save_habit", "save_access", "link_record", "unlink_record"]
    base_version: StrictInt = Field(default=0, ge=0)
    data: dict


def access_payload(user):
    stored = (user.settings or {}).get("life_privacy", {})
    return {"id": str(user.id), "version": stored.get("version", 0),
            "fitness_expert_enabled": stored.get("fitness_expert_enabled") is True}


def fitness_source_allowed(user):
    # The seven pre-existing workspace source switches cannot grant this scope.
    return access_payload(user)["fitness_expert_enabled"]


def entity_payload(row):
    return {"id": str(row.id), "version": row.version, "content": row.content, "updated_at": row.updated_at.isoformat()}


def conflict(message="记录已有新版本。你的草稿已保留，请比较后再保存。"):
    raise AppException("LIFE_CONFLICT", message, 409)


async def owned(session, model, uid, eid):
    row = await session.scalar(select(model).where(model.id == eid, model.user_id == uid))
    if row is None:
        raise NotFoundException("个人记录")
    return row


async def workspace_owned(session, uid, wid):
    row = await session.scalar(select(Workspace).where(Workspace.id == wid, Workspace.user_id == uid, Workspace.archived_at.is_(None)))
    if row is None:
        raise NotFoundException("Workspace")
    return row


async def references(session, uid, record_ids):
    if not record_ids:
        return []
    rows = (await session.scalars(select(LifeWorkspaceReference).join(Workspace, Workspace.id == LifeWorkspaceReference.workspace_id).where(
        LifeWorkspaceReference.user_id == uid, LifeWorkspaceReference.record_id.in_(record_ids),
        Workspace.user_id == uid, Workspace.archived_at.is_(None)))).all()
    return [{"record_id": str(r.record_id), "workspace_id": str(r.workspace_id), "linked_at": r.linked_at.isoformat(),
             "revoked_at": r.revoked_at.isoformat() if r.revoked_at else None} for r in rows]


@router.get("")
async def snapshot(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db),
                   workspace_id: uuid.UUID | None = None, offset: int = Query(0, ge=0), limit: int = Query(50, ge=1, le=100)):
    uid = uuid.UUID(user_id)
    user = await session.get(User, uid)
    if user is None:
        raise NotFoundException("User")
    query = select(LifeRecord).where(LifeRecord.user_id == uid, LifeRecord.domain == "fitness")
    if workspace_id is not None:
        await workspace_owned(session, uid, workspace_id)
        query = query.where(LifeRecord.id.in_(select(LifeWorkspaceReference.record_id).where(
            LifeWorkspaceReference.user_id == uid, LifeWorkspaceReference.workspace_id == workspace_id, LifeWorkspaceReference.revoked_at.is_(None))))
    total = await session.scalar(select(func.count()).select_from(query.subquery()))
    records = (await session.scalars(query.order_by(LifeRecord.occurred_on.desc(), LifeRecord.id).offset(offset).limit(limit))).all()
    habit = await session.scalar(select(PersonalHabit).where(PersonalHabit.user_id == uid, PersonalHabit.domain == "fitness"))
    return ApiResponse(success=True, data={"records": [entity_payload(r) for r in records], "total": total,
        "habit": entity_payload(habit) if habit else {"id": str(uuid.uuid5(uid, "fitness-habit")), "version": 0, "content": None},
        "access": access_payload(user), "references": await references(session, uid, [r.id for r in records])})


@router.get("/history/{kind}/{entity_id}")
async def history(kind: Literal["record", "habit"], entity_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await owned(session, LifeRecord if kind == "record" else PersonalHabit, uid, entity_id)
    column = LifeRevision.record_id if kind == "record" else LifeRevision.habit_id
    rows = (await session.scalars(select(LifeRevision).where(LifeRevision.user_id == uid, column == entity_id).order_by(LifeRevision.version.desc()))).all()
    events = (await session.scalars(select(WorkspaceEvent).where(WorkspaceEvent.user_id == uid,
        WorkspaceEvent.source_id == entity_id, WorkspaceEvent.event_type.in_(['life_create_record', 'life_save_record', 'life_save_habit', 'life_link_record', 'life_unlink_record'])))).all()
    changes = {e.payload.get('request_id'): e for e in events}
    workspace_ids = [uuid.UUID(e.payload['workspace_id']) for e in events if e.payload.get('workspace_id')]
    spaces = {str(w.id): w.name for w in (await session.scalars(select(Workspace).where(Workspace.user_id == uid, Workspace.id.in_(workspace_ids)))).all()} if workspace_ids else {}
    return ApiResponse(success=True, data=[{"id": str(r.id), "version": r.version, "content": r.content,
        "created_at": r.created_at.isoformat(),
        "change": {"action": changes[str(r.request_id)].event_type.removeprefix('life_'),
                   "workspace_name": spaces.get(changes[str(r.request_id)].payload.get('workspace_id'))} if str(r.request_id) in changes else None} for r in rows])


@router.get("/views")
async def views(start: date, end: date, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    from app.engines.fitness_views import fitness_report
    if start > end or (end - start).days > 365:
        raise ValidationException("请选择起止顺序正确、最多 366 天的范围")
    uid = uuid.UUID(user_id)
    records = (await session.scalars(select(LifeRecord).where(LifeRecord.user_id == uid,
        LifeRecord.domain == "fitness", LifeRecord.occurred_on >= start, LifeRecord.occurred_on <= end)
        .order_by(LifeRecord.occurred_on.desc(), LifeRecord.id))).all()
    revisions = (await session.scalars(select(LifeRevision).join(PersonalHabit, PersonalHabit.id == LifeRevision.habit_id)
        .where(LifeRevision.user_id == uid, PersonalHabit.user_id == uid, PersonalHabit.domain == "fitness"))).all()
    return ApiResponse(success=True, data=fitness_report(records, revisions, start, end))


@router.get("/records/{record_id}")
async def read_record(record_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    return ApiResponse(success=True, data=entity_payload(await owned(session, LifeRecord, uuid.UUID(user_id), record_id)))


async def apply_command(session: AsyncSession, uid: uuid.UUID, command: LifeCommand):
    # A per-person row lock serializes commands across workspaces and request replays.
    user = await session.scalar(select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True))
    if user is None:
        raise NotFoundException("User")
    fingerprint = hashlib.sha256(json.dumps(command.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    receipt = await session.scalar(select(LifeCommandReceipt).where(LifeCommandReceipt.user_id == uid, LifeCommandReceipt.request_id == command.request_id))
    if receipt:
        if receipt.fingerprint != fingerprint:
            conflict("同一提交标识包含不同内容，请保留原草稿重新提交。")
        return receipt.result
    action, eid, now = command.action, command.entity_id, datetime.now(UTC)
    if action == "save_access":
        if eid != uid:
            raise NotFoundException("User")
        content = AccessContent.model_validate(command.data)
        current = access_payload(user)
        if command.base_version != current["version"]:
            conflict("生活数据范围已改变，请重新读取后选择。")
        value = {**content.model_dump(), "version": current["version"] + 1}
        user.settings = {**(user.settings or {}), "life_privacy": value}
        result = {"kind": "access", "entity": access_payload(user)}
    elif action == "save_habit":
        if eid != uuid.uuid5(uid, "fitness-habit"):
            raise NotFoundException("习惯")
        content = HabitContent.model_validate(command.data)
        row = await session.scalar(select(PersonalHabit).where(PersonalHabit.id == eid, PersonalHabit.user_id == uid))
        if command.base_version != (row.version if row else 0):
            conflict("习惯已有新规则，请比较后保存。")
        if row is None:
            row = PersonalHabit(id=eid, user_id=uid, domain="fitness", version=0)
            session.add(row)
        if row.content and content.effective_from < date.fromisoformat(row.content["effective_from"]):
            raise ValidationException("新规则的生效日不能早于上一版")
        row.version += 1
        row.content, row.updated_at = content.model_dump(mode="json"), now
        await session.flush()
        session.add(LifeRevision(user_id=uid, habit_id=eid, version=row.version, content=row.content, request_id=command.request_id))
        result = {"kind": "habit", "entity": entity_payload(row)}
    elif action in {"create_record", "save_record"}:
        content = WorkoutContent.model_validate(command.data)
        plan = None
        if content.expert_plan_id:
            from app.models.fitness_expert import FitnessArrangement
            plan = await owned(session, FitnessArrangement, uid, content.expert_plan_id)
            if plan.feedback_record_id and plan.feedback_record_id != eid:
                conflict("这个安排已有实际反馈，请纠正原记录。")
            if not plan.feedback_record_id and plan.content['cancelled']:
                raise ValidationException("已取消的安排不能新增反馈，可手动记录独立活动。")
        if content.reused_from:
            await owned(session, LifeRecord, uid, content.reused_from)
        if content.habit_id:
            await owned(session, PersonalHabit, uid, content.habit_id)
        if content.help_request_id:
            from app.models.item_help import ItemHelp
            help_row = await session.scalar(select(ItemHelp).where(ItemHelp.user_id == uid,
                ItemHelp.request_id == content.help_request_id, ItemHelp.kind == "fitness_extract", ItemHelp.status == "completed"))
            if help_row is None or help_row.input["text"] != content.original:
                raise ValidationException("AI 来源不可用或原话不一致，请保留正确的原始内容")
        row = None if action == "create_record" else await owned(session, LifeRecord, uid, eid)
        if command.base_version != (row.version if row else 0):
            conflict()
        if row:
            if any(getattr(content, key) != row.content.get(key) for key in ("source", "original")) or str(content.reused_from) != str(row.content.get("reused_from")):
                raise ValidationException("纠正保留原始来源，不能改写原文或复用引用")
            if str(content.help_request_id) != str(row.content.get("help_request_id")):
                raise ValidationException("纠正不能改写 AI 帮助来源")
            if str(content.expert_plan_id) != str(row.content.get("expert_plan_id")):
                raise ValidationException("纠正不能改写已采用安排的来源")
        else:
            if await session.get(LifeRecord, eid):
                conflict("该记录标识已使用，请重新建立记录。")
            row = LifeRecord(id=eid, user_id=uid, domain="fitness", version=0, created_at=now)
            session.add(row)
        row.version += 1
        row.occurred_on, row.content, row.updated_at = content.occurred_on, content.model_dump(mode="json"), now
        await session.flush()
        if plan and not plan.feedback_record_id:
            plan.feedback_record_id = eid
        session.add(LifeRevision(user_id=uid, record_id=eid, version=row.version, content=row.content, request_id=command.request_id))
        result = {"kind": "record", "entity": entity_payload(row)}
    else:
        content = ReferenceContent.model_validate(command.data)
        row = await owned(session, LifeRecord, uid, eid)
        await workspace_owned(session, uid, content.workspace_id)
        if command.base_version != row.version:
            conflict()
        reference = await session.scalar(select(LifeWorkspaceReference).where(LifeWorkspaceReference.user_id == uid,
            LifeWorkspaceReference.record_id == eid, LifeWorkspaceReference.workspace_id == content.workspace_id))
        if reference is None and action == "link_record":
            reference = LifeWorkspaceReference(id=uuid.uuid5(eid, str(content.workspace_id)), user_id=uid, record_id=eid,
                                               workspace_id=content.workspace_id, linked_at=now)
            session.add(reference)
        elif reference:
            reference.revoked_at = now if action == "unlink_record" else None
            if action == "link_record":
                reference.linked_at = now
        # References share the record version so concurrent edits cannot silently
        # overwrite a reference change. Facts stay unchanged in the new revision.
        row.version += 1
        row.updated_at = now
        session.add(LifeRevision(user_id=uid, record_id=eid, version=row.version, content=row.content, request_id=command.request_id))
        await session.flush()
        result = {"kind": "reference", "entity": entity_payload(row), "references": await references(session, uid, [eid])}
    await append_event(session, user_id=uid, workspace_id=None, event_type=f"life_{action}", source_type="life_record" if "record" in action else "life_setting",
                       source_id=eid, payload={"version": result["entity"]["version"], "request_id": str(command.request_id),
                                               **({"workspace_id": command.data["workspace_id"]} if action in {"link_record", "unlink_record"} else {})})
    session.add(LifeCommandReceipt(user_id=uid, request_id=command.request_id, fingerprint=fingerprint, result=result))
    await session.flush()
    return result


@router.post("/commands")
async def submit(command: LifeCommand, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    try:
        result = await apply_command(session, uuid.UUID(user_id), command)
        await session.commit()
    except ValidationError as exc:
        await session.rollback()
        raise ValidationException(exc.errors()[0]["msg"]) from exc
    return ApiResponse(success=True, data=result)
