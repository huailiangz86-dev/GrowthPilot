"""Personal Agent evidence. Always resolve ownership, workspace and privacy at read time."""
import hashlib
import json
import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.privacy_scope import memory_source_allowed, privacy_source_enabled
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.memory import MemoryEntry
from app.models.onboarding_submission import OnboardingSubmission
from app.models.task import Task
from app.models.user import User
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection
from app.models.personal_work import PersonalDocument

MODELS = {"tasks": Task, "goals": Goal, "plans": GrowthPlan, "reflections": WorkspaceReflection,
          "learning": WorkspaceLearningItem, "knowledge_cards": WorkspaceKnowledgeCard}
MEMORY_ORIGINS = {"task": "tasks", "goal": "goals", "plan": "plans", "growth_plan": "plans",
                  "reflection": "reflections", "morning": "reflections", "micro": "reflections", "evening": "reflections",
                  "learning": "learning", "knowledge": "knowledge_cards", "knowledge_card": "knowledge_cards"}


async def settings_for(session: AsyncSession, uid: uuid.UUID) -> dict:
    # A fresh select avoids reusing an identity-map snapshot across a long model call.
    return (await session.execute(select(User.settings).where(User.id == uid))).scalar_one() or {}


def row_query(source: str, uid: uuid.UUID, wid: uuid.UUID):
    model = MODELS[source]
    query = select(model).where(model.user_id == uid, model.workspace_id == wid)
    if hasattr(model, "deleted_at"):
        query = query.where(model.deleted_at.is_(None))
    if hasattr(model, "archived_at"):
        query = query.where(model.archived_at.is_(None))
    if source == "knowledge_cards":
        # Link/image captures without actual source text cannot serve as evidence.
        query = query.where(model.source_type == "text", model.content.is_not(None), model.content != "")
    return query.execution_options(populate_existing=True)


def evidence(source: str, row) -> dict:
    if source == "reflections":
        kind = {"micro": "快速记录", "morning": "晨间启动", "evening": "晚间复盘"}.get(row.reflection_type, "记录")
        title = f"{row.reflection_date} · {kind}"
        labels = {"content": "原文", "intention": "推进意图", "wins": "收获", "friction": "阻力", "adjustment": "调整", "energy": "能量", "mood": "感受", "completion": "完成度"}
        content = "\n".join(f"{label}：{getattr(row, key)}" for key, label in labels.items() if getattr(row, key) is not None)
    elif source == "knowledge_cards":
        title, content = row.title, row.content or ""
    elif source == "memories":
        title, content = "工作台来源记忆", row.content
    else:
        title = row.title
        fields = ("description", "status", "priority", "due_at", "progress", "summary", "duration_minutes", "milestones", "created_at", "completed_at")
        labels = {"description": "说明", "status": "状态", "priority": "优先级", "due_at": "截止时间", "progress": "进度（%）", "summary": "内容", "duration_minutes": "预计分钟", "milestones": "里程碑", "created_at":"创建时间", "completed_at":"最近完成时间"}
        content = "\n".join(f"{labels[key]}：{getattr(row, key)}" for key in fields if getattr(row, key, None) is not None)
        if source == "learning":
            content += "\n注意：duration_minutes 是预计时长，progress 是进度，均不等于实际投入。"
    result = {"key": f"{source}:{row.id}", "source": source, "title": title, "content": content}
    result["digest"] = hashlib.sha256(json.dumps(result, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return result


async def memory_in_workspace(session, row, uid, wid, settings) -> bool:
    if not privacy_source_enabled(settings, "memories") or not memory_source_allowed(settings, row.source) or not row.source_id:
        return False
    origin = MEMORY_ORIGINS.get(row.source)
    if origin:
        return (await session.execute(row_query(origin, uid, wid).where(MODELS[origin].id == row.source_id))).scalar_one_or_none() is not None
    if row.source == "onboarding":
        receipt = (await session.execute(select(OnboardingSubmission.result).where(OnboardingSubmission.client_request_id == row.source_id, OnboardingSubmission.user_id == uid))).scalar_one_or_none()
        return bool(receipt and any(item.get("key") == "workspace" and item.get("id") == str(wid) for item in receipt.get("objects", [])))
    # Manual/legacy/capability memories have no trustworthy Workspace association.
    return False


async def content_evidence(session, source, row):
    result = evidence(source, row)
    field = {"tasks": "task_id", "learning": "learning_item_id", "reflections": "reflection_id"}.get(source)
    if field:
        doc = await session.scalar(select(PersonalDocument).where(
            getattr(PersonalDocument, field) == row.id, PersonalDocument.user_id == row.user_id,
            PersonalDocument.workspace_id == row.workspace_id).execution_options(populate_existing=True))
        if doc:
            result["content"] += f"\n本人保存的内容 · 版本 {doc.version}：\n" + json.dumps(doc.content, ensure_ascii=False)
            result["digest"] = hashlib.sha256(json.dumps({k:v for k,v in result.items() if k != "digest"}, ensure_ascii=False, sort_keys=True).encode()).hexdigest()
    return result


async def resolve_source(session, uid, wid, key: str, settings) -> dict | None:
    try:
        source, sid = key.split(":", 1)
        object_id = uuid.UUID(sid)
    except (ValueError, AttributeError):
        return None
    if source == "analysis":
        from app.engines.workspace_analysis import snapshot_evidence
        return await snapshot_evidence(session, uid, wid, object_id, settings)
    if source == "facts":
        from app.engines.workspace_analysis import fact_evidence
        from app.models.workspace_fact import WorkspaceFact
        row = (await session.execute(select(WorkspaceFact).where(WorkspaceFact.id == object_id, WorkspaceFact.user_id == uid, WorkspaceFact.workspace_id == wid))).scalar_one_or_none()
        if not row or not privacy_source_enabled(settings, "learning" if row.kind == "learning" else "tasks"): return None
        task = (await session.execute(row_query("tasks", uid, wid).where(Task.id == row.task_id))).scalar_one_or_none() if row.task_id else None
        if row.task_id and not task: return None
        return fact_evidence(row, task)
    if not privacy_source_enabled(settings, source):
        return None
    if source in MODELS:
        row = (await session.execute(row_query(source, uid, wid).where(MODELS[source].id == object_id))).scalar_one_or_none()
    elif source == "memories":
        row = (await session.execute(select(MemoryEntry).where(MemoryEntry.id == object_id, MemoryEntry.user_id == uid, MemoryEntry.deleted_at.is_(None)).execution_options(populate_existing=True))).scalar_one_or_none()
        if row and not await memory_in_workspace(session, row, uid, wid, settings):
            row = None
    else:
        row = None
    if not row:
        return None
    result = await content_evidence(session, source, row)
    if source == "memories" and row.source in MEMORY_ORIGINS:
        origin = await resolve_source(session, uid, wid, f"{MEMORY_ORIGINS[row.source]}:{row.source_id}", settings)
        if not origin:
            return None
        result["content"] = (f"历史记忆（{row.occurred_at.date()}）：{row.content}\n原始来源当前内容：{origin['content']}")
        result["digest"] = hashlib.sha256((json.dumps({k: v for k, v in result.items() if k != "digest"}, ensure_ascii=False, sort_keys=True) + origin["digest"]).encode()).hexdigest()
    return result


async def build_context(session, uid, wid, settings) -> list[dict]:
    refs = []
    from app.models.workspace_fact import WorkspaceFact
    facts = (await session.execute(select(WorkspaceFact).where(WorkspaceFact.user_id == uid, WorkspaceFact.workspace_id == wid).order_by(WorkspaceFact.created_at.desc(), WorkspaceFact.id).limit(16))).scalars().all()
    for row in facts:
        ref = await resolve_source(session, uid, wid, f"facts:{row.id}", settings)
        if ref: refs.append({**ref, "content":ref["content"][:1800]})
    for source, model in MODELS.items():
        if privacy_source_enabled(settings, source):
            rows = (await session.execute(row_query(source, uid, wid).order_by(model.updated_at.desc(), model.id).limit(8))).scalars().all()
            for row in rows:
                ref = await content_evidence(session, source, row)
                refs.append({**ref, "content": ref["content"][:1800]})
    if privacy_source_enabled(settings, "memories"):
        rows = (await session.execute(select(MemoryEntry).where(MemoryEntry.user_id == uid, MemoryEntry.deleted_at.is_(None)).order_by(MemoryEntry.updated_at.desc()).limit(40))).scalars().all()
        for row in rows:
            if await memory_in_workspace(session, row, uid, wid, settings):
                ref = await resolve_source(session, uid, wid, f"memories:{row.id}", settings)
                if not ref:
                    continue
                refs.append({**ref, "content": ref["content"][:1800]})
                if sum(item["source"] == "memories" for item in refs) >= 8:
                    break
    return refs


async def refs_current(session, uid, wid, refs, settings) -> bool:
    for ref in refs:
        current = await resolve_source(session, uid, wid, ref["key"], settings)
        if not current or current["digest"] != ref["digest"]:
            return False
    return True
