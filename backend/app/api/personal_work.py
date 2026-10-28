"""Personal work commands. Each accepted command, revision and event commits together."""
import hashlib
import json
import uuid
from datetime import UTC, date, datetime, time, timedelta
from typing import Literal
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import APIRouter, Depends
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.daily_preferences import user_daily_timezone
from app.engines.workspace_engine import append_event
from app.models.personal_work import DocumentRevision, PersonalCommandReceipt, PersonalDocument, ScheduleBlock
from app.models.learning_session import LearningSession
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace
from app.models.workspace_fact import WorkspaceFact
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection
from app.models.learning_material import LearningMaterial, LearningMaterialExcerpt
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/personal-work", tags=["personal-work"])


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Resource(Strict):
    id: uuid.UUID
    title: str = Field(min_length=1, max_length=240)
    url: str = Field(max_length=2000)

    @field_validator("url")
    @classmethod
    def safe_url(cls, value):
        parsed = urlsplit(value.strip())
        if parsed.scheme not in {"https", "http"} or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("资料链接需为 HTTP 或 HTTPS 地址")
        return value.strip()


class TaskContent(Strict):
    title: str = Field(min_length=1, max_length=240)
    body: str = Field(default="", max_length=100000)
    criterion: str = Field(default="", max_length=4000)
    resources: list[Resource] = Field(default_factory=list, max_length=50)
    outcome: str = Field(default="", max_length=20000)
    status: Literal["todo", "doing", "done", "blocked"] = "todo"
    due_at: datetime | None = None

    @field_validator("title")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("请填写标题")
        return value.strip()

    @field_validator("due_at")
    @classmethod
    def aware_due(cls, value):
        if value is not None and value.utcoffset() is None:
            raise ValueError("截止时间必须包含时区")
        return value


class LearningEntry(Strict):
    id: uuid.UUID
    date: date
    kind: Literal["note", "insight"]
    title: str = Field(default="", max_length=240)
    body: str = Field(default="", max_length=12000)
    advice_request_id: uuid.UUID | None = None
    advice_index: int | None = Field(default=None, ge=0, le=3)


class LearningContent(Strict):
    title: str = Field(min_length=1, max_length=240)
    aim: str = Field(default="", max_length=4000)
    content: str = Field(default="", max_length=100000)
    insights: str = Field(default="", max_length=50000)
    journal: list[LearningEntry] = Field(default_factory=list, max_length=100)
    resources: list[Resource] = Field(default_factory=list, max_length=50)
    notes: str = Field(default="", max_length=100000)
    questions: str = Field(default="", max_length=20000)
    exercise: str = Field(default="", max_length=50000)
    outcome: str = Field(default="", max_length=20000)
    stage: Literal["queued", "in_progress", "practice", "applied"] = "queued"
    task_id: uuid.UUID | None = None
    minutes_by_date: dict[date, int] = Field(default_factory=dict, max_length=366)

    @field_validator("title")
    @classmethod
    def nonblank(cls, value):
        return TaskContent.nonblank(value)

    @field_validator("journal")
    @classmethod
    def distinct_entries(cls, value):
        if len({entry.id for entry in value}) != len(value):
            raise ValueError("学习记录标识不能重复")
        return value

    @field_validator("minutes_by_date")
    @classmethod
    def valid_minutes(cls, value):
        if any(minutes < 0 or minutes > 1440 for minutes in value.values()):
            raise ValueError("每日自报投入需为 0–1440 分钟")
        return value

    @model_validator(mode="after")
    def applied_evidence(self):
        if self.stage == "applied" and (not self.outcome.strip() or self.task_id is None):
            raise ValueError("已应用需关联实际任务并保存应用成果")
        return self


class ScheduleContent(Strict):
    task_id: uuid.UUID
    starts_at: datetime
    ends_at: datetime
    timezone: str = Field(max_length=64)

    @model_validator(mode="after")
    def valid_interval(self):
        if self.starts_at.utcoffset() is None or self.ends_at.utcoffset() is None:
            raise ValueError("开始与结束时间必须包含时区")
        if not timedelta(0) < self.ends_at - self.starts_at <= timedelta(days=7):
            raise ValueError("结束需晚于开始，每段最长七天")
        try:
            ZoneInfo(self.timezone)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("请选择有效时区") from exc
        return self


class ReviewContent(Strict):
    date: date
    reason: str = Field(default="", max_length=10000)
    feeling: str = Field(default="", max_length=4000)
    next: str = Field(default="", max_length=10000)


class SchedulePreferences(Strict):
    daily_minutes: int | None = Field(default=None, ge=1, le=1440)
    available_start: str = Field(default="09:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")
    available_end: str = Field(default="22:00", pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$")

    @model_validator(mode="after")
    def valid_window(self):
        if self.available_start >= self.available_end:
            raise ValueError("可用时间的结束需晚于开始")
        return self


def schedule_preferences(user, wid):
    return (user.settings or {}).get("personal_work_preferences", {}).get(str(wid),
        {"id": str(wid), "version": 0, **SchedulePreferences().model_dump()})


class RestoreContent(Strict):
    revision_id: uuid.UUID


class ApplicationContent(Strict):
    title: str = Field(min_length=1, max_length=240)


class AdoptLearningAdvice(Strict):
    help_request_id: uuid.UUID
    suggestion_index: int = Field(ge=0, le=3)
    date: date


class AppendMaterialContent(Strict):
    material_id: uuid.UUID
    checksum: str = Field(pattern=r"^[a-f0-9]{64}$")
    chunk_ids: list[str] = Field(min_length=1, max_length=20)
    draft: LearningContent | None = None

    @field_validator("chunk_ids")
    @classmethod
    def distinct_chunks(cls, value):
        if len(set(value)) != len(value):
            raise ValueError("同一片段只能选择一次")
        return value


class Command(Strict):
    request_id: uuid.UUID
    entity_id: uuid.UUID
    action: Literal["create_task", "save_task", "restore_task", "save_schedule", "cancel_schedule",
                    "create_learning", "save_learning", "append_material", "create_application", "adopt_learning_advice", "save_review", "save_preferences"]
    base_version: int = Field(default=0, ge=0)
    expected_updated_at: datetime | None = None
    data: dict = Field(default_factory=dict)


def conflict(message="其他页面已有更新。当前草稿已保留，请比较后再保存。"):
    raise AppException("PERSONAL_WORK_CONFLICT", message, 409)


async def scope(session, uid, wid, lock=False):
    if lock:
        # The same advisory lock is used by the existing background executor.
        await session.execute(text("SELECT pg_advisory_xact_lock(:key)"),
                              {"key": int.from_bytes(wid.bytes[:8], "big", signed=True)})
    query = select(Workspace).where(Workspace.id == wid, Workspace.user_id == uid, Workspace.archived_at.is_(None))
    if lock:
        query = query.with_for_update()
    workspace = await session.scalar(query)
    if workspace is None:
        raise NotFoundException("Workspace")
    return workspace


async def owned(session, model, uid, wid, entity_id):
    row = await session.scalar(select(model).where(model.id == entity_id, model.user_id == uid, model.workspace_id == wid))
    if row is None or getattr(row, "deleted_at", None) or getattr(row, "archived_at", None):
        raise NotFoundException(model.__name__)
    return row


async def document(session, uid, wid, kind, entity_id):
    return await session.scalar(select(PersonalDocument).where(
        PersonalDocument.id == uuid.uuid5(entity_id, f"personal:{kind}"),
        PersonalDocument.user_id == uid, PersonalDocument.workspace_id == wid))


def doc_payload(doc):
    return {"id": str(doc.id) if doc else None, "version": doc.version if doc else 0,
            "content": doc.content if doc else {}, "updated_at": doc.updated_at.isoformat() if doc else None}


def task_payload(task, doc):
    return {"id": str(task.id), "title": task.title, "description": task.description, "status": task.status,
            "due_at": task.due_at.isoformat() if task.due_at else None, "updated_at": task.updated_at.isoformat(),
            "project_id": str(task.project_id) if task.project_id else None,
            "goal_id": str(task.goal_id) if task.goal_id else None, "plan_id": str(task.plan_id) if task.plan_id else None,
            "document": doc_payload(doc)}


def learning_payload(item, doc):
    return {"id": str(item.id), "title": item.title, "summary": item.summary, "source_url": item.source_url,
            "status": item.status, "updated_at": item.updated_at.isoformat(), "document": doc_payload(doc)}


def schedule_payload(row):
    return {"id": str(row.id), "task_id": str(row.task_id), "starts_at": row.starts_at.isoformat(),
            "ends_at": row.ends_at.isoformat(), "timezone": row.timezone, "version": row.version,
            "cancelled_at": row.cancelled_at.isoformat() if row.cancelled_at else None}


def check_version(doc, base_version, row=None, expected=None):
    if (doc.version if doc else 0) != base_version:
        conflict()
    if row is not None and (expected is None or row.updated_at != expected):
        conflict("此事项的属性已在其他入口更新。草稿已保留，请读取新版本并比较。")


async def write_document(session, workspace, kind, entity_id, content, doc, request_id, source="user"):
    now = datetime.now(UTC)
    if doc is None:
        doc = PersonalDocument(id=uuid.uuid5(entity_id, f"personal:{kind}"), user_id=workspace.user_id,
                               workspace_id=workspace.id, version=0, content={}, **{f"{kind}_id": entity_id})
        session.add(doc)
        await session.flush()
    doc.version += 1
    doc.content, doc.updated_at = content, now
    revision = DocumentRevision(id=uuid.uuid5(doc.id, str(request_id)), document_id=doc.id, version=doc.version,
                                content=content, source=source, created_at=now)
    session.add(revision)
    await append_event(session, user_id=workspace.user_id, workspace_id=workspace.id, event_type="personal_content_saved",
                       source_type=kind, source_id=entity_id,
                       payload={"document_id": str(doc.id), "revision_id": str(revision.id), "version": doc.version})
    await session.flush()
    return doc


async def day_evidence(session, uid, wid, day, tz):
    first = datetime.combine(day, time.min, tz).astimezone(UTC)
    stop = datetime.combine(day + timedelta(days=1), time.min, tz).astimezone(UTC)
    rows = (await session.execute(select(PersonalDocument, DocumentRevision).join(
        DocumentRevision, DocumentRevision.document_id == PersonalDocument.id).where(
        PersonalDocument.user_id == uid, PersonalDocument.workspace_id == wid,
        PersonalDocument.reflection_id.is_(None), DocumentRevision.created_at >= first,
        DocumentRevision.created_at < stop).order_by(DocumentRevision.version.desc()))).all()
    result, seen = [], set()
    # A saved work artifact is a stable document reference, even when linked from learning.
    for doc, revision in rows:
        if doc.id in seen:
            continue
        seen.add(doc.id)
        content = revision.content
        fields = [key for key in ("body", "content", "notes", "insights", "journal", "questions", "exercise", "outcome") if (any(entry.get("body", "").strip() for entry in content.get(key, [])) if key == "journal" else content.get(key, "").strip())]
        if not fields:
            continue
        kind = "task" if doc.task_id else "learning"
        parent = await session.get(Task if doc.task_id else WorkspaceLearningItem, doc.task_id or doc.learning_item_id)
        if parent is None or getattr(parent, "deleted_at", None) or getattr(parent, "archived_at", None):
            continue
        result.append({"id": str(doc.id), "revision_id": str(revision.id), "version": revision.version,
                       "kind": kind, "entity_id": str(doc.task_id or doc.learning_item_id),
                       "title": content.get("title", parent.title), "fields": fields,
                       "excerpt": (content.get("outcome") or content.get("insights") or content.get("exercise") or content.get("notes") or content.get("content") or "\n".join(e.get("body", "") for e in content.get("journal", [])) or content.get("body") or content.get("questions", ""))[:600],
                       "task_id": content.get("task_id"), "saved_at": revision.created_at.isoformat()})
    # Completed/blocked tasks without content are still daily facts, not fabricated works.
    tasks = (await session.scalars(select(Task).where(Task.user_id == uid, Task.workspace_id == wid,
        Task.deleted_at.is_(None), Task.updated_at >= first, Task.updated_at < stop,
        Task.status.in_(["done", "blocked"])))).all()
    known_tasks = {entry["entity_id"] for entry in result if entry["kind"] == "task"}
    for task in tasks:
        if str(task.id) not in known_tasks:
            result.append({"id": str(task.id), "revision_id": None, "version": 0, "kind": "task",
                           "entity_id": str(task.id), "title": task.title, "fields": ["status"],
                           "excerpt": "本人记录完成" if task.status == "done" else (task.defer_reason or "当前阻塞"),
                           "saved_at": task.updated_at.isoformat()})
    # Each actual learning review is immutable evidence, independent of note versions.
    from app.models.learning_review import LearningReviewAttempt, LearningReviewUnit
    reviews = (await session.execute(select(LearningReviewAttempt, WorkspaceLearningItem.title).join(
        LearningReviewUnit, LearningReviewUnit.id == LearningReviewAttempt.unit_id).join(
        WorkspaceLearningItem, WorkspaceLearningItem.id == LearningReviewUnit.item_id).where(
        LearningReviewAttempt.user_id == uid, LearningReviewAttempt.workspace_id == wid,
        LearningReviewAttempt.status == "completed", LearningReviewAttempt.completed_at >= first,
        LearningReviewAttempt.completed_at < stop, WorkspaceLearningItem.archived_at.is_(None)))).all()
    ratings = {"again":"没想起", "hard":"费力想起", "good":"基本想起", "easy":"轻松想起"}
    for attempt, title in reviews:
        practice=attempt.snapshot.get('practice')
        practice_text=f"\n实际应用（本人记录）：{practice['result']}\n本人核对标准：{practice['criterion']}" if practice else ''
        result.append({"id":str(attempt.id), "revision_id":None, "version":1, "kind":"learning_review",
            "entity_id":attempt.snapshot["item_id"], "title":f"学习复盘 · {title}",
            "fields":["answer", "rating", "difficulty", "next_action"]+(["practice"] if practice else []),
            "excerpt":f"问题：{attempt.snapshot['question']}\n本人自评：{ratings[attempt.rating]}\n答案：{attempt.answer or '本次没能想起'}\n卡点：{attempt.difficulty or '未填写'}\n下一步：{attempt.next_action}{practice_text}"[:12000],
            "saved_at":attempt.completed_at.isoformat(), "attempt_id":str(attempt.id),
            "unit_id":str(attempt.unit_id)})
    return result


@router.get("/{workspace_id}")
async def snapshot(workspace_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await scope(session, uid, workspace_id, lock=True)
    # Serialize with C1 commands to avoid mixing new content with old properties.
    tasks = (await session.scalars(select(Task).where(Task.user_id == uid, Task.workspace_id == workspace_id, Task.deleted_at.is_(None)).order_by(Task.updated_at.desc()))).all()
    items = (await session.scalars(select(WorkspaceLearningItem).where(WorkspaceLearningItem.user_id == uid,
        WorkspaceLearningItem.workspace_id == workspace_id, WorkspaceLearningItem.archived_at.is_(None)).order_by(WorkspaceLearningItem.updated_at.desc()))).all()
    docs = (await session.scalars(select(PersonalDocument).where(PersonalDocument.user_id == uid, PersonalDocument.workspace_id == workspace_id))).all()
    by_task = {d.task_id: d for d in docs if d.task_id}
    by_learning = {d.learning_item_id: d for d in docs if d.learning_item_id}
    schedules = (await session.scalars(select(ScheduleBlock).where(ScheduleBlock.user_id == uid,
        ScheduleBlock.workspace_id == workspace_id).order_by(ScheduleBlock.starts_at))).all()
    sessions = (await session.scalars(select(LearningSession).where(LearningSession.user_id == uid, LearningSession.workspace_id == workspace_id))).all()
    return ApiResponse(success=True, data={"workspace_id": str(workspace_id), "tasks": [task_payload(t, by_task.get(t.id)) for t in tasks],
        "learning": [{**learning_payload(i, by_learning.get(i.id)), "observed_seconds": sum(s.active_seconds for s in sessions if s.learning_item_id == i.id)} for i in items],
        "schedules": [schedule_payload(s) for s in schedules], "preferences": schedule_preferences(await session.get(User,uid),workspace_id)})


@router.get("/{workspace_id}/history/{kind}/{entity_id}")
async def history(workspace_id: uuid.UUID, kind: Literal["task", "learning_item", "reflection"], entity_id: uuid.UUID,
                  user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await scope(session, uid, workspace_id)
    await owned(session, {"task": Task, "learning_item": WorkspaceLearningItem, "reflection": WorkspaceReflection}[kind], uid, workspace_id, entity_id)
    doc = await document(session, uid, workspace_id, kind, entity_id)
    revisions = (await session.scalars(select(DocumentRevision).where(DocumentRevision.document_id == doc.id).order_by(DocumentRevision.version.desc()))).all() if doc else []
    return ApiResponse(success=True, data=[{"id": str(r.id), "version": r.version, "content": r.content,
        "source": r.source, "created_at": r.created_at.isoformat()} for r in revisions])


@router.get("/{workspace_id}/review/{day}")
async def daily_review(workspace_id: uuid.UUID, day: date, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid = uuid.UUID(user_id)
    await scope(session, uid, workspace_id)
    user = await session.get(User, uid)
    row = await session.scalar(select(WorkspaceReflection).where(WorkspaceReflection.user_id == uid,
        WorkspaceReflection.workspace_id == workspace_id, WorkspaceReflection.reflection_key == f"evening:{day}"))
    doc = await document(session, uid, workspace_id, "reflection", row.id) if row else None
    return ApiResponse(success=True, data={"date": str(day), "id": str(row.id) if row else str(uuid.uuid5(workspace_id, f"review:{day}")),
        "document": doc_payload(doc), "updated_at": row.updated_at.isoformat() if row else None,
        "reason": row.friction or "" if row else "", "feeling": row.mood or "" if row else "", "next": row.adjustment or "" if row else "",
        "evidence": await day_evidence(session, uid, workspace_id, day, user_daily_timezone(user.settings)),
        "saved_evidence": doc.content.get("evidence", []) if doc else []})


async def apply_command(session: AsyncSession, uid: uuid.UUID, wid: uuid.UUID, command: Command):
    workspace = await scope(session, uid, wid, lock=True)
    fingerprint = hashlib.sha256(json.dumps(command.model_dump(mode="json"), sort_keys=True, ensure_ascii=False).encode()).hexdigest()
    receipt = await session.scalar(select(PersonalCommandReceipt).where(PersonalCommandReceipt.user_id == uid,
        PersonalCommandReceipt.workspace_id == wid, PersonalCommandReceipt.request_id == command.request_id))
    if receipt:
        if receipt.fingerprint != fingerprint:
            conflict("同一保存标识对应不同内容；原草稿已保留，请重新提交。")
        return receipt.result
    action, entity_id = command.action, command.entity_id
    now = datetime.now(UTC)
    if action == "save_preferences":
        if entity_id != wid:
            raise NotFoundException("Workspace")
        content = SchedulePreferences.model_validate(command.data)
        user = await session.scalar(select(User).where(User.id == uid).with_for_update().execution_options(populate_existing=True))
        previous = schedule_preferences(user,wid)
        if previous["version"] != command.base_version:
            conflict("可用时间偏好已有更新，请比较后再保存。")
        entity = {"id":str(wid),"version":previous["version"]+1,**content.model_dump()}
        settings = dict(user.settings or {})
        settings["personal_work_preferences"] = {**settings.get("personal_work_preferences",{}),str(wid):entity}
        user.settings = settings
        await append_event(session,user_id=uid,workspace_id=wid,event_type="schedule_preferences_saved",source_type="workspace",source_id=wid,payload={"version":entity["version"]})
        result = {"kind":"preferences","entity":entity}
    elif action in {"create_task", "save_task", "restore_task"}:
        task = None if action == "create_task" else await owned(session, Task, uid, wid, entity_id)
        doc = await document(session, uid, wid, "task", entity_id)
        check_version(doc, command.base_version, task, command.expected_updated_at)
        if action == "restore_task":
            restore = RestoreContent.model_validate(command.data)
            revision = await session.scalar(select(DocumentRevision).where(DocumentRevision.id == restore.revision_id,
                DocumentRevision.document_id == doc.id)) if doc else None
            if revision is None:
                raise NotFoundException("DocumentRevision")
            current = task_payload(task, doc)
            data = {**doc.content, "title": current["title"], "status": current["status"], "due_at": current["due_at"]}
            for field in ("body", "criterion", "resources", "outcome"):
                data[field] = revision.content.get(field, [] if field == "resources" else "")
            content = TaskContent.model_validate(data)
        else:
            content = TaskContent.model_validate(command.data)
        if task is None:
            # Never adopt a client ID already used by another object or account.
            if await session.get(Task, entity_id):
                conflict("工作标识已使用，请重新建立工作。")
            task = Task(id=entity_id, user_id=uid, workspace_id=wid, title=content.title, description="", priority="medium")
            session.add(task)
        task.title, task.due_at, task.status, task.updated_at = content.title, content.due_at, content.status, now
        if task.status == "done":
            task.completed_at = task.completed_at or now
        else:
            task.completed_at = None
        await session.flush()
        doc = await write_document(session, workspace, "task", entity_id, content.model_dump(mode="json"), doc, command.request_id,
                                   "restore" if action == "restore_task" else "user")
        result = {"kind": "task", "entity": task_payload(task, doc)}
    elif action in {"create_learning", "save_learning", "append_material", "create_application", "adopt_learning_advice"}:
        item = None if action == "create_learning" else await owned(session, WorkspaceLearningItem, uid, wid, entity_id)
        doc = await document(session, uid, wid, "learning_item", entity_id)
        check_version(doc, command.base_version, item, command.expected_updated_at)
        application = None
        excerpt = None
        if action == "adopt_learning_advice":
            from app.models.item_help import ItemHelp
            from app.api.item_help import source_current
            choice = AdoptLearningAdvice.model_validate(command.data)
            help_row = await session.scalar(select(ItemHelp).where(ItemHelp.request_id == choice.help_request_id,
                ItemHelp.user_id == uid, ItemHelp.workspace_id == wid, ItemHelp.item_id == entity_id,
                ItemHelp.kind == "learning_diagnose", ItemHelp.status == "completed"))
            if help_row is None or not await source_current(session, help_row):
                conflict("学习回顾的依据已变化，请重新核对后采用建议。")
            suggestions = (help_row.result or {}).get("suggestions", [])
            if choice.suggestion_index >= len(suggestions):
                raise ValidationException("这条学习建议不存在")
            suggestion = suggestions[choice.suggestion_index]
            entry_id = uuid.uuid5(entity_id, f"learning_advice:{choice.help_request_id}:{choice.suggestion_index}")
            data = dict(doc.content)
            entries = list(data.get("journal", []))
            if any(entry["id"] == str(entry_id) for entry in entries):
                conflict("这条建议已采用，请在逐次记录中继续。")
            text = "AI 学习回顾建议 · 本人采用\n" + suggestion["action"] + "\n为什么：" + suggestion["why"]
            if suggestion.get("success_check"):
                text += "\n完成后这样核对：" + suggestion["success_check"]
            parts = {"reference":"原文依据", "answer":"本人答案", "self_report":"本人自评", "text":"保存记录"}
            text += "\n\n" + "\n".join(f"依据 {c['key']} · {parts.get(c.get('part', 'text'), '保存记录')}：{c['quote']}" for c in suggestion["evidence"])
            entry = LearningEntry(id=entry_id, date=choice.date, kind="insight", title=suggestion["title"], body=text,
                advice_request_id=choice.help_request_id, advice_index=choice.suggestion_index)
            data["journal"] = [entry.model_dump(mode="json"), *entries]
            content = LearningContent.model_validate(data)
        elif action == "append_material":
            chosen = AppendMaterialContent.model_validate(command.data)
            material = await session.scalar(select(LearningMaterial).where(LearningMaterial.id == chosen.material_id,
                LearningMaterial.user_id == uid, LearningMaterial.workspace_id == wid, LearningMaterial.item_id == entity_id))
            if material is None:
                raise NotFoundException("LearningMaterial")
            if material.status != "ready" or material.checksum != chosen.checksum:
                conflict("资料尚未提取完成或来源不匹配，请重新读取预览。")
            selected = set(chosen.chunk_ids)
            chunks = [c for c in material.extraction["chunks"] if c["id"] in selected]
            if len(chunks) != len(selected):
                raise ValidationException("所选片段不属于这份资料，请重新选择。")
            header = f"[资料：{material.title} · 来源 {material.id} · SHA256 {material.checksum}]"
            if material.source_url:
                header += f"\n[原链接：{material.source_url}]"
            block = header + "\n\n" + "\n\n".join(
                f"[{'第 ' + str(c['page']) + ' 页 · ' if c['page'] else ''}片段 {c['id']} · 字符 {c['start']}–{c['end']}]\n{c['text']}" for c in chunks)
            data = chosen.draft.model_dump(mode="json") if chosen.draft else dict(doc.content if doc else {"title": item.title, "aim": item.summary or ""})
            data["notes"] = "\n\n".join(v for v in (data.get("notes", ""), block) if v)
            content = LearningContent.model_validate(data)
            excerpt = {"material_id": str(material.id), "checksum": material.checksum,
                       "title": material.title, "source_url": material.source_url, "chunks": chunks}
        elif action == "create_application":
            title = ApplicationContent.model_validate(command.data).title
            data = dict(doc.content if doc else {"title": item.title, "aim": item.summary, "resources": []})
            if data.get("task_id"):
                conflict("该学习已有应用任务，请进入原任务继续。")
            task_id = uuid.uuid5(entity_id, "personal:application")
            if await session.get(Task, task_id):
                conflict("应用任务已存在，请重新读取学习。")
            application = Task(id=task_id, user_id=uid, workspace_id=wid, project_id=item.project_id, goal_id=item.goal_id,
                               title=title, description="", status="todo", priority="medium", updated_at=now)
            session.add(application)
            await session.flush()
            application_doc = await write_document(session, workspace, "task", task_id,
                TaskContent(title=title, criterion="把学习用于实际工作，保存一次应用成果").model_dump(mode="json"), None, uuid.uuid5(command.request_id, "application"))
            data["task_id"] = str(task_id)
            content = LearningContent.model_validate(data)
        else:
            # Older clients omit D7 fields; preserve them instead of writing empty defaults.
            preserved = {key: doc.content.get(key, default) for key, default in
                         (("content", ""), ("insights", ""), ("journal", [])) if doc and key not in command.data}
            content = LearningContent.model_validate({**preserved, **command.data})
        for entry in content.journal:
            if entry.advice_request_id is None and entry.advice_index is None:
                continue
            from app.models.item_help import ItemHelp
            if entry.advice_request_id is None or entry.advice_index is None or entry.id != uuid.uuid5(entity_id, f"learning_advice:{entry.advice_request_id}:{entry.advice_index}"):
                raise ValidationException("学习建议来源标识不一致")
            original_help = await session.scalar(select(ItemHelp).where(ItemHelp.user_id == uid,
                ItemHelp.workspace_id == wid, ItemHelp.item_id == entity_id,
                ItemHelp.request_id == entry.advice_request_id, ItemHelp.kind == "learning_diagnose", ItemHelp.status == "completed"))
            if original_help is None or entry.advice_index >= len((original_help.result or {}).get("suggestions", [])):
                raise ValidationException("学习建议必须引用本学习页已保存的 AI 回顾")
        if content.task_id:
            await owned(session, Task, uid, wid, content.task_id)
        if item is None:
            if await session.get(WorkspaceLearningItem, entity_id):
                conflict("学习标识已使用，请重新建立学习。")
            item = WorkspaceLearningItem(id=entity_id, user_id=uid, workspace_id=wid, title=content.title)
            session.add(item)
        old_minutes = (doc.content if doc else {}).get("minutes_by_date", {})
        item.title, item.summary = content.title, content.aim
        item.source_url = content.resources[0].url if content.resources else None
        item.status, item.updated_at = content.stage, now
        await session.flush()
        # Cumulative self reports are separate from the existing observed session timer.
        for day in set(content.minutes_by_date) | {date.fromisoformat(day) for day in old_minutes}:
            minutes = content.minutes_by_date.get(day, 0)
            if minutes == old_minutes.get(str(day), 0):
                continue
            fact_id = uuid.uuid5(entity_id, f"personal:minutes:{day}")
            fact = await session.get(WorkspaceFact, fact_id)
            if minutes == 0:
                if fact:
                    await session.delete(fact)
            elif fact:
                fact.minutes, fact.note = minutes, f"本人自报 · {item.title}"
            else:
                session.add(WorkspaceFact(id=fact_id, user_id=uid, workspace_id=wid, kind="learning", entry_date=day,
                                          minutes=minutes, note=f"本人自报 · {item.title}"))
        doc = await write_document(session, workspace, "learning_item", entity_id, content.model_dump(mode="json"), doc, command.request_id,
                                   "material_excerpt" if excerpt else "user")
        if excerpt:
            await session.flush()
            session.add(LearningMaterialExcerpt(id=uuid.uuid5(doc.id, f"material_excerpt:{command.request_id}"), user_id=uid,
                material_id=material.id, revision_id=uuid.uuid5(doc.id, str(command.request_id)),
                content={**excerpt, "document_version": doc.version}, created_at=now))
        result = {"kind": "learning", "entity": learning_payload(item, doc)}
        if excerpt:
            result["appended_excerpt"] = block
        if application:
            result["application"] = task_payload(application, application_doc)
    elif action in {"save_schedule", "cancel_schedule"}:
        block = await session.get(ScheduleBlock, entity_id)
        if block and (block.user_id != uid or block.workspace_id != wid):
            raise NotFoundException("ScheduleBlock")
        if (block.version if block else 0) != command.base_version:
            conflict("这个时段已有新安排；当前改期草稿已保留。")
        if action == "cancel_schedule":
            if not block:
                raise NotFoundException("ScheduleBlock")
            block.cancelled_at = now
        else:
            content = ScheduleContent.model_validate(command.data)
            await owned(session, Task, uid, wid, content.task_id)
            overlaps = (await session.scalars(select(ScheduleBlock).where(ScheduleBlock.user_id == uid,
                ScheduleBlock.workspace_id == wid, ScheduleBlock.id != entity_id, ScheduleBlock.cancelled_at.is_(None),
                ScheduleBlock.starts_at < content.ends_at, ScheduleBlock.ends_at > content.starts_at))).all()
            if overlaps:
                conflict("时间冲突：与已有工作时段重叠，请调整开始或结束时间。")
            if block is None:
                block = ScheduleBlock(id=entity_id, user_id=uid, workspace_id=wid, version=0)
                session.add(block)
            block.task_id, block.starts_at, block.ends_at, block.timezone = content.task_id, content.starts_at, content.ends_at, content.timezone
            block.cancelled_at = None
        block.version += 1
        block.updated_at = now
        await append_event(session, user_id=uid, workspace_id=wid, event_type="schedule_cancelled" if action == "cancel_schedule" else "schedule_saved",
                           source_type="schedule", source_id=entity_id, payload={"task_id": str(block.task_id), "version": block.version})
        result = {"kind": "schedule", "entity": schedule_payload(block)}
    else:
        content = ReviewContent.model_validate(command.data)
        user = await session.get(User, uid)
        row = await session.scalar(select(WorkspaceReflection).where(WorkspaceReflection.user_id == uid,
            WorkspaceReflection.workspace_id == wid, WorkspaceReflection.reflection_key == f"evening:{content.date}"))
        if row is None:
            if entity_id != uuid.uuid5(wid, f"review:{content.date}"):
                raise ValidationException("复盘标识与日期不一致")
            row = WorkspaceReflection(id=entity_id, user_id=uid, workspace_id=wid, reflection_type="evening",
                                      reflection_date=content.date, reflection_key=f"evening:{content.date}")
            session.add(row)
            doc = None
            check_version(doc, command.base_version)
        else:
            if row.id != entity_id:
                conflict("当天已有复盘，请读取后继续补充。")
            doc = await document(session, uid, wid, "reflection", row.id)
            check_version(doc, command.base_version, row, command.expected_updated_at)
        evidence = await day_evidence(session, uid, wid, content.date, user_daily_timezone(user.settings))
        row.friction, row.mood, row.adjustment = content.reason, content.feeling[:32], content.next
        row.updated_at = now
        # Keep legacy reflection readers useful; references live in the versioned draft.
        row.wins = "\n".join(e["title"] for e in evidence)
        await session.flush()
        doc = await write_document(session, workspace, "reflection", row.id,
                                   {**content.model_dump(mode="json"), "evidence": evidence}, doc, command.request_id)
        result = {"kind": "review", "entity": {"id": str(row.id), "date": str(content.date), "updated_at": now.isoformat(), "document": doc_payload(doc)}}
    session.add(PersonalCommandReceipt(user_id=uid, workspace_id=wid, request_id=command.request_id,
                                       fingerprint=fingerprint, result=result))
    await session.flush()
    return result


@router.post("/{workspace_id}/commands")
async def submit_command(workspace_id: uuid.UUID, command: Command, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    try:
        result = await apply_command(session, uuid.UUID(user_id), workspace_id, command)
        await session.commit()
    except ValidationError as exc:
        await session.rollback()
        raise ValidationException("；".join(error["msg"] for error in exc.errors())) from exc
    return ApiResponse(success=True, data=result)
