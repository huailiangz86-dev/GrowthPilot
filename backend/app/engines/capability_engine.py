"""Built-in capability catalog and Workspace-scoped authorization settings."""

import uuid
from datetime import UTC, datetime
from dataclasses import dataclass

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.task_engine import create_task
from app.engines.knowledge_card_engine import create_knowledge_card
from app.engines.memory_engine import create_from_source
from app.engines.workspace_engine import append_event
from app.models.capability import AgentRun, CapabilityRegistry, CapabilityRun, WorkspaceCapabilitySetting
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.memory import MemoryEntry
from app.models.task import Task
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard

CONFIGURABLE_CAPABILITY_TYPES = frozenset({"connection", "plugin", "skill", "agent"})
PREVIEWABLE_CAPABILITY_TYPES = frozenset({"app", "plugin", "skill", "agent"})
CAPABILITY_RUN_DECISIONS = frozenset({"confirm", "plan", "reject"})
EXECUTABLE_CAPABILITY_SLUGS = frozenset({"weekly-brief-plugin"})
WEEKLY_BRIEF_EVENT_LIMIT = 12

BUILTIN_CAPABILITIES: tuple[dict[str, object], ...] = (
    {
        "capability_type": "app",
        "name": "Notion",
        "slug": "notion-app",
        "description": "作为项目资料、知识库和会议记录的可发现入口。",
        "source": "builtin",
        "version": "1.0",
        "status": "available",
        "dependencies": [],
        "permissions": ["仅显示入口"],
        "workspace_scope": "all",
        "workspace_ids": [],
        "entrypoint": "notion://",
    },
    {
        "capability_type": "connection",
        "name": "日历连接",
        "slug": "calendar-connection",
        "description": "准备将日程读入当前工作空间；尚未请求授权或同步数据。",
        "source": "builtin",
        "version": "1.0",
        "status": "needs_setup",
        "dependencies": ["日历授权"],
        "permissions": ["读取日历（待授权）"],
        "workspace_scope": "all",
        "workspace_ids": [],
        "entrypoint": None,
    },
    {
        "capability_type": "plugin",
        "name": "Weekly Brief Plugin",
        "slug": "weekly-brief-plugin",
        "description": "把确认的工作、学习与复盘事实整理为周度简报计划。",
        "source": "builtin",
        "version": "1.0",
        "status": "available",
        "dependencies": ["Workspace Event"],
        "permissions": ["读取当前 Workspace 事实"],
        "workspace_scope": "all",
        "workspace_ids": [],
        "entrypoint": None,
    },
    {
        "capability_type": "skill",
        "name": "Research Skill",
        "slug": "research-skill",
        "description": "把用户已保存的资料整理为可确认的知识摘要与学习入口。",
        "source": "builtin",
        "version": "1.0",
        "status": "available",
        "dependencies": ["Knowledge Card"],
        "permissions": ["读取用户确认的知识卡片"],
        "workspace_scope": "all",
        "workspace_ids": [],
        "entrypoint": "knowledge_summary",
    },
    {
        "capability_type": "agent",
        "name": "成长教练",
        "slug": "growth-coach-agent",
        "description": "基于用户确认的目标、任务和活动事实提供下一步建议。",
        "source": "builtin",
        "version": "1.0",
        "status": "available",
        "dependencies": ["Goal", "Task", "Workspace Event"],
        "permissions": ["读取当前 Workspace 事实"],
        "workspace_scope": "all",
        "workspace_ids": [],
        "entrypoint": "growth_coach",
    },
)


async def seed_capability_catalog(session: AsyncSession) -> None:
    """Idempotently add the small built-in catalog without creating user events."""
    existing = (await session.execute(select(CapabilityRegistry.slug))).scalars().all()
    existing_slugs = set(existing)
    for values in BUILTIN_CAPABILITIES:
        if values["slug"] not in existing_slugs:
            session.add(CapabilityRegistry(id=uuid.uuid4(), **values))


def capability_query(
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID | None = None,
):
    query = (
        select(CapabilityRegistry)
        .where(
            CapabilityRegistry.archived_at.is_(None),
            or_(CapabilityRegistry.user_id.is_(None), CapabilityRegistry.user_id == user_id),
            or_(
                CapabilityRegistry.workspace_scope == "all",
                CapabilityRegistry.workspace_ids.contains([str(workspace_id)]),
            ),
        )
        .order_by(CapabilityRegistry.capability_type, CapabilityRegistry.name)
    )
    if capability_id is not None:
        query = query.where(CapabilityRegistry.id == capability_id)
    return query


async def list_capabilities(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> list[CapabilityRegistry]:
    result = await session.execute(capability_query(user_id, workspace_id))
    return list(result.scalars().all())


async def get_capability(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID,
) -> CapabilityRegistry | None:
    result = await session.execute(capability_query(user_id, workspace_id, capability_id))
    return result.scalar_one_or_none()


def workspace_capability_setting_query(
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID,
):
    return (
        select(WorkspaceCapabilitySetting)
        .join(Workspace, WorkspaceCapabilitySetting.workspace_id == Workspace.id)
        .where(
            WorkspaceCapabilitySetting.user_id == user_id,
            WorkspaceCapabilitySetting.workspace_id == workspace_id,
            WorkspaceCapabilitySetting.capability_id == capability_id,
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )


async def get_workspace_capability_setting(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID,
) -> WorkspaceCapabilitySetting | None:
    result = await session.execute(
        workspace_capability_setting_query(user_id, workspace_id, capability_id)
    )
    return result.scalar_one_or_none()


async def _dependency_present(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    dependency: str,
) -> bool:
    if dependency == "Workspace Event":
        query = select(WorkspaceEvent.id).where(
            WorkspaceEvent.user_id == user_id,
            WorkspaceEvent.workspace_id == workspace_id,
        )
    elif dependency == "Knowledge Card":
        query = select(WorkspaceKnowledgeCard.id).where(
            WorkspaceKnowledgeCard.user_id == user_id,
            WorkspaceKnowledgeCard.workspace_id == workspace_id,
            WorkspaceKnowledgeCard.archived_at.is_(None),
            WorkspaceKnowledgeCard.ai_status == "confirmed",
        )
    elif dependency == "Goal":
        query = select(Goal.id).where(
            Goal.user_id == user_id,
            Goal.workspace_id == workspace_id,
            Goal.archived_at.is_(None),
        )
    elif dependency == "Task":
        query = select(Task.id).where(
            Task.user_id == user_id,
            Task.workspace_id == workspace_id,
            Task.deleted_at.is_(None),
        )
    else:
        return True
    return (await session.execute(query.limit(1))).scalar_one_or_none() is not None


async def capability_blocked_reason(
    session: AsyncSession,
    *,
    capability: CapabilityRegistry,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> str | None:
    if capability.status == "needs_setup":
        return "此连接仍需完成授权或设置，当前不能启用。"
    for dependency in capability.dependencies or []:
        if not await _dependency_present(
            session,
            user_id=user_id,
            workspace_id=workspace_id,
            dependency=dependency,
        ):
            return f"当前 Workspace 缺少依赖：{dependency}。请先记录相关事实后再启用。"
    return None


@dataclass(frozen=True)
class EffectiveCapability:
    capability: CapabilityRegistry
    setting: WorkspaceCapabilitySetting | None
    status: str
    permissions: list[str]
    available_permissions: list[str]
    configurable: bool
    blocked_reason: str | None


async def effective_capability(
    session: AsyncSession,
    *,
    capability: CapabilityRegistry,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
) -> EffectiveCapability:
    configurable = capability.capability_type in CONFIGURABLE_CAPABILITY_TYPES
    setting = None
    if configurable:
        setting = await get_workspace_capability_setting(
            session,
            user_id=user_id,
            workspace_id=workspace_id,
            capability_id=capability.id,
        )
    blocked_reason = await capability_blocked_reason(
        session,
        capability=capability,
        user_id=user_id,
        workspace_id=workspace_id,
    )
    available_permissions = list(capability.permissions or [])
    permissions = list(setting.permissions or []) if setting else (
        available_permissions if not configurable else []
    )
    if not configurable:
        status = capability.status
    elif setting and setting.status == "disabled":
        status = "disabled"
    elif setting and setting.status == "enabled" and not blocked_reason:
        status = "enabled"
    elif blocked_reason:
        status = "blocked" if capability.status != "needs_setup" else "needs_setup"
    else:
        status = "available"
    return EffectiveCapability(
        capability=capability,
        setting=setting,
        status=status,
        permissions=permissions,
        available_permissions=available_permissions,
        configurable=configurable,
        blocked_reason=blocked_reason,
    )


async def save_workspace_capability_setting(
    session: AsyncSession,
    *,
    capability: CapabilityRegistry,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    status: str,
    permissions: list[str],
    existing: WorkspaceCapabilitySetting | None,
) -> WorkspaceCapabilitySetting:
    setting = existing
    if setting is None:
        setting = WorkspaceCapabilitySetting(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace_id,
            capability_id=capability.id,
            status=status,
            permissions=permissions,
        )
        session.add(setting)
    else:
        setting.status = status
        setting.permissions = permissions
    await append_event(
        session,
        user_id=user_id,
        workspace_id=workspace_id,
        event_type="capability_setting_updated",
        source_type="capability",
        source_id=capability.id,
        payload={
            "capability_id": str(capability.id),
            "capability_slug": capability.slug,
            "status": status,
            "permissions": permissions,
        },
    )
    return setting


def capability_run_query(user_id: uuid.UUID, capability_run_id: uuid.UUID | None = None):
    query = (
        select(CapabilityRun)
        .join(Workspace, CapabilityRun.workspace_id == Workspace.id)
        .where(
            CapabilityRun.user_id == user_id,
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )
    if capability_run_id is not None:
        query = query.where(CapabilityRun.id == capability_run_id)
    return query


def capability_runs_query(
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID,
):
    return (
        select(CapabilityRun)
        .join(Workspace, CapabilityRun.workspace_id == Workspace.id)
        .where(
            CapabilityRun.user_id == user_id,
            CapabilityRun.workspace_id == workspace_id,
            CapabilityRun.capability_id == capability_id,
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
        .order_by(CapabilityRun.started_at.desc())
    )


def workspace_brief_events_query(user_id: uuid.UUID, workspace_id: uuid.UUID):
    return (
        select(WorkspaceEvent)
        .where(
            WorkspaceEvent.user_id == user_id,
            WorkspaceEvent.workspace_id == workspace_id,
            WorkspaceEvent.event_type.notlike("capability_%"),
        )
        .order_by(WorkspaceEvent.occurred_at.desc())
        .limit(WEEKLY_BRIEF_EVENT_LIMIT)
    )


async def get_capability_run(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    capability_run_id: uuid.UUID,
    for_update: bool = False,
) -> CapabilityRun | None:
    query = capability_run_query(user_id, capability_run_id)
    if for_update:
        query = query.with_for_update()
    result = await session.execute(query)
    return result.scalar_one_or_none()


async def list_capability_runs(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    capability_id: uuid.UUID,
    limit: int,
) -> list[CapabilityRun]:
    result = await session.execute(
        capability_runs_query(user_id, workspace_id, capability_id).limit(limit)
    )
    return list(result.scalars().all())


async def get_agent_run_for_capability_run(
    session: AsyncSession,
    *,
    run: CapabilityRun,
) -> AgentRun | None:
    if run.agent_run_id is None:
        return None
    result = await session.execute(
        select(AgentRun).where(
            AgentRun.id == run.agent_run_id,
            AgentRun.user_id == run.user_id,
            AgentRun.workspace_id == run.workspace_id,
        )
    )
    return result.scalar_one_or_none()


def capability_can_execute(
    *,
    capability: CapabilityRegistry,
    effective_status: str,
    run: CapabilityRun,
) -> bool:
    return (
        capability.slug in EXECUTABLE_CAPABILITY_SLUGS
        and capability.capability_type == "plugin"
        and effective_status == "enabled"
        and run.status == "confirmed"
        and (run.output_ref or {}).get("execution_state") == "not_started"
    )


def _brief_fact(event: WorkspaceEvent) -> dict[str, str]:
    payload = event.payload or {}
    event_labels = {
        "task_created": "创建任务",
        "task_completed": "完成任务",
        "task_deferred": "延后任务",
        "task_blocked": "标记任务受阻",
        "learning_item_created": "加入学习",
        "learning_progress_updated": "更新学习进度",
        "knowledge_card_captured": "记录知识卡片",
        "knowledge_card_queued": "加入学习队列",
        "knowledge_card_summary_confirmed": "确认知识摘要",
        "reflection_created": "完成复盘",
        "reflection_updated": "更新复盘",
        "goal_created": "创建目标",
        "goal_updated": "更新目标",
        "growth_plan_created": "创建成长计划",
        "growth_plan_updated": "更新成长计划",
        "project_created": "创建项目",
        "project_updated": "更新项目",
    }
    label = event_labels.get(event.event_type, "记录工作事实")
    title = payload.get("title") or payload.get("name")
    if isinstance(title, str) and title.strip():
        summary = f"{label}「{title.strip()[:120]}」"
    elif event.event_type == "learning_progress_updated" and payload.get("progress") is not None:
        summary = f"{label}至 {payload['progress']}%"
    else:
        summary = label
    return {
        "event_id": str(event.id),
        "event_type": event.event_type,
        "occurred_at": event.occurred_at.isoformat(),
        "summary": summary,
    }


def weekly_brief_draft(events: list[WorkspaceEvent]) -> dict[str, object]:
    facts = [_brief_fact(event) for event in events]
    summary = (
        f"已整理 {len(facts)} 条近期 Workspace 事实，以下内容仅供审阅。"
        if facts
        else "当前没有可用于生成简报的近期事实。"
    )
    return {
        "title": "Weekly Brief 草稿",
        "summary": summary,
        "facts": facts,
        "fact_actions": {},
        "fact_goal_actions": {},
        "fact_plan_actions": {},
        "fact_knowledge_actions": {},
        "fact_memory_actions": {},
    }


async def execute_confirmed_weekly_brief(
    session: AsyncSession,
    *,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
) -> CapabilityRun:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide a low-risk internal executor")
    if run.status != "confirmed" or agent_run.status != "confirmed":
        raise ValueError("only a confirmed capability run can generate a brief")
    if (run.output_ref or {}).get("execution_state") != "not_started":
        raise ValueError("capability run has already been executed")
    events = list(
        (
            await session.execute(
                workspace_brief_events_query(run.user_id, run.workspace_id)
            )
        ).scalars().all()
    )
    brief = weekly_brief_draft(events)
    now = datetime.now(UTC)
    run.status = "completed"
    run.completed_at = now
    run.output_ref = {
        **(run.output_ref or {}),
        "execution_state": "completed",
        "brief": brief,
    }
    agent_run.status = "completed"
    agent_run.output_text = str(brief["summary"])
    agent_run.updated_at = now
    agent_run.context_refs = [
        *(agent_run.context_refs or []),
        *[
            {"source_type": "workspace_event", "source_id": str(event.id)}
            for event in events
        ],
    ]
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type="capability_invocation_completed",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "capability_slug": capability.slug,
            "agent_run_id": str(agent_run.id),
            "execution_state": "completed",
            "evidence_event_ids": [str(event.id) for event in events],
        },
    )
    return run


async def create_task_from_weekly_brief_fact(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
    event_id: str,
    title: str,
) -> tuple[CapabilityRun, Task]:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide weekly brief fact actions")
    if workspace.id != run.workspace_id or workspace.user_id != run.user_id:
        raise ValueError("workspace does not match capability run")
    if run.status != "completed" or agent_run.status != "completed":
        raise ValueError("only a completed weekly brief can create a task")
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    if not isinstance(brief, dict) or not isinstance(brief.get("facts"), list):
        raise ValueError("weekly brief facts are unavailable")
    fact = next(
        (
            item
            for item in brief["facts"]
            if isinstance(item, dict) and item.get("event_id") == event_id
        ),
        None,
    )
    if fact is None:
        raise ValueError("brief fact is unavailable")
    fact_actions = brief.get("fact_actions")
    if not isinstance(fact_actions, dict):
        fact_actions = {}
    if event_id in fact_actions:
        raise ValueError("this brief fact has already created a task")
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("task title cannot be empty")
    fact_summary = str(fact.get("summary") or "已确认的 Workspace 事实")
    task = await create_task(
        session,
        workspace=workspace,
        values={
            "title": clean_title[:240],
            "description": (
                f"来源：Weekly Brief「{run.input_summary[:160]}」中的事实"
                f"「{fact_summary[:240]}」。审计 Run：{run.id}；事实事件：{event_id}。"
            ),
            "priority": "medium",
            "project_id": run.project_id,
            "goal_id": None,
            "plan_id": None,
            "energy_required": None,
            "time_block": None,
            "due_at": None,
        },
    )
    run.output_ref = {
        **output_ref,
        "brief": {
            **brief,
            "fact_actions": {
                **fact_actions,
                event_id: {
                    "task_id": str(task.id),
                    "created_at": datetime.now(UTC).isoformat(),
                },
            },
        },
    }
    agent_run.context_refs = [
        *(agent_run.context_refs or []),
        {"source_type": "task", "source_id": str(task.id)},
    ]
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type="capability_brief_fact_promoted",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "agent_run_id": str(agent_run.id),
            "brief_event_id": event_id,
            "task_id": str(task.id),
        },
    )
    return run, task


async def create_goal_from_weekly_brief_fact(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
    event_id: str,
    title: str,
) -> tuple[CapabilityRun, Goal]:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide weekly brief fact actions")
    if workspace.id != run.workspace_id or workspace.user_id != run.user_id:
        raise ValueError("workspace does not match capability run")
    if run.status != "completed" or agent_run.status != "completed":
        raise ValueError("only a completed weekly brief can create a goal")
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    if not isinstance(brief, dict) or not isinstance(brief.get("facts"), list):
        raise ValueError("weekly brief facts are unavailable")
    fact = next((item for item in brief["facts"] if isinstance(item, dict) and item.get("event_id") == event_id), None)
    if fact is None:
        raise ValueError("brief fact is unavailable")
    actions = brief.get("fact_goal_actions")
    if not isinstance(actions, dict):
        actions = {}
    if event_id in actions:
        raise ValueError("this brief fact has already created a goal")
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("goal title cannot be empty")
    summary = str(fact.get("summary") or "已确认的 Workspace 事实")
    goal = Goal(
        id=uuid.uuid4(),
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        title=clean_title[:240],
        description=f"来源：Weekly Brief「{run.input_summary[:160]}」中的事实「{summary[:240]}」。审计 Run：{run.id}；事实事件：{event_id}。",
    )
    session.add(goal)
    await append_event(session, user_id=goal.user_id, workspace_id=goal.workspace_id, project_id=goal.project_id, event_type="goal_created", source_type="goal", source_id=goal.id, payload={"title": goal.title, "goal_type": None, "importance": None})
    run.output_ref = {**output_ref, "brief": {**brief, "fact_goal_actions": {**actions, event_id: {"goal_id": str(goal.id), "created_at": datetime.now(UTC).isoformat()}}}}
    agent_run.context_refs = [*(agent_run.context_refs or []), {"source_type": "goal", "source_id": str(goal.id)}]
    await append_event(session, user_id=run.user_id, workspace_id=run.workspace_id, project_id=run.project_id, event_type="capability_brief_fact_promoted_to_goal", source_type="capability_run", source_id=run.id, payload={"capability_id": str(capability.id), "agent_run_id": str(agent_run.id), "brief_event_id": event_id, "goal_id": str(goal.id)})
    return run, goal


async def create_growth_plan_from_weekly_brief_fact(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
    event_id: str,
    goal_id: str,
    title: str,
    period_type: str,
) -> tuple[CapabilityRun, GrowthPlan]:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide weekly brief fact actions")
    if workspace.id != run.workspace_id or workspace.user_id != run.user_id:
        raise ValueError("workspace does not match capability run")
    if run.status != "completed" or agent_run.status != "completed":
        raise ValueError("only a completed weekly brief can create a growth plan")
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    if not isinstance(brief, dict) or not isinstance(brief.get("facts"), list):
        raise ValueError("weekly brief facts are unavailable")
    fact = next(
        (
            item
            for item in brief["facts"]
            if isinstance(item, dict) and item.get("event_id") == event_id
        ),
        None,
    )
    if fact is None:
        raise ValueError("brief fact is unavailable")
    actions = brief.get("fact_plan_actions")
    if not isinstance(actions, dict):
        actions = {}
    if event_id in actions:
        raise ValueError("this brief fact has already created a growth plan")
    clean_title = title.strip()
    if not clean_title:
        raise ValueError("growth plan title cannot be empty")
    if period_type not in {"weekly", "monthly", "quarterly"}:
        raise ValueError("growth plan period is unavailable")
    try:
        goal_uuid = uuid.UUID(goal_id)
    except ValueError as exc:
        raise ValueError("goal is unavailable") from exc
    goal = (
        await session.execute(
            select(Goal).where(
                Goal.id == goal_uuid,
                Goal.user_id == run.user_id,
                Goal.workspace_id == run.workspace_id,
                Goal.archived_at.is_(None),
            )
        )
    ).scalar_one_or_none()
    if goal is None:
        raise ValueError("goal must belong to the current workspace")
    summary = str(fact.get("summary") or "已确认的 Workspace 事实")
    plan = GrowthPlan(
        id=uuid.uuid4(),
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        goal_id=goal.id,
        project_id=run.project_id,
        title=clean_title[:240],
        description=(
            f"来源：Weekly Brief「{run.input_summary[:160]}」中的事实"
            f"「{summary[:240]}」。审计 Run：{run.id}；事实事件：{event_id}。"
        ),
        period_type=period_type,
        total_weeks=None,
        current_week=None,
        milestones=[],
    )
    session.add(plan)
    await append_event(
        session,
        user_id=plan.user_id,
        workspace_id=plan.workspace_id,
        project_id=plan.project_id,
        event_type="growth_plan_created",
        source_type="growth_plan",
        source_id=plan.id,
        payload={"title": plan.title, "goal_id": str(plan.goal_id)},
    )
    run.output_ref = {
        **output_ref,
        "brief": {
            **brief,
            "fact_plan_actions": {
                **actions,
                event_id: {
                    "plan_id": str(plan.id),
                    "created_at": datetime.now(UTC).isoformat(),
                },
            },
        },
    }
    agent_run.context_refs = [
        *(agent_run.context_refs or []),
        {"source_type": "growth_plan", "source_id": str(plan.id)},
    ]
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type="capability_brief_fact_promoted_to_plan",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "agent_run_id": str(agent_run.id),
            "brief_event_id": event_id,
            "goal_id": str(goal.id),
            "plan_id": str(plan.id),
        },
    )
    return run, plan


async def create_knowledge_card_from_weekly_brief_fact(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
    event_id: str,
    title: str,
    content: str,
    goal_id: str | None,
) -> tuple[CapabilityRun, WorkspaceKnowledgeCard]:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide weekly brief fact actions")
    if workspace.id != run.workspace_id or workspace.user_id != run.user_id:
        raise ValueError("workspace does not match capability run")
    if run.status != "completed" or agent_run.status != "completed":
        raise ValueError("only a completed weekly brief can create a knowledge card")
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    if not isinstance(brief, dict) or not isinstance(brief.get("facts"), list):
        raise ValueError("weekly brief facts are unavailable")
    fact = next(
        (
            item
            for item in brief["facts"]
            if isinstance(item, dict) and item.get("event_id") == event_id
        ),
        None,
    )
    if fact is None:
        raise ValueError("brief fact is unavailable")
    actions = brief.get("fact_knowledge_actions")
    if not isinstance(actions, dict):
        actions = {}
    if event_id in actions:
        raise ValueError("this brief fact has already created a knowledge card")
    clean_title = title.strip()
    clean_content = content.strip()
    if not clean_title:
        raise ValueError("knowledge card title cannot be empty")
    if not clean_content:
        raise ValueError("knowledge card content cannot be empty")
    linked_goal_id = None
    if goal_id:
        try:
            linked_goal_id = uuid.UUID(goal_id)
        except ValueError as exc:
            raise ValueError("goal is unavailable") from exc
        goal = (
            await session.execute(
                select(Goal).where(
                    Goal.id == linked_goal_id,
                    Goal.user_id == run.user_id,
                    Goal.workspace_id == run.workspace_id,
                    Goal.archived_at.is_(None),
                )
            )
        ).scalar_one_or_none()
        if goal is None:
            raise ValueError("goal must belong to the current workspace")
    summary = str(fact.get("summary") or "已确认的 Workspace 事实")
    source_note = (
        f"来源：Weekly Brief「{run.input_summary[:160]}」中的事实「{summary[:240]}」。"
        f"审计 Run：{run.id}；事实事件：{event_id}。"
    )
    card = await create_knowledge_card(
        session,
        workspace=workspace,
        values={
            "project_id": run.project_id,
            "goal_id": linked_goal_id,
            "title": clean_title[:240],
            "source_type": "text",
            "source_url": None,
            "content": f"{clean_content[:7600]}\n\n{source_note}",
            "status": "captured",
        },
    )
    run.output_ref = {
        **output_ref,
        "brief": {
            **brief,
            "fact_knowledge_actions": {
                **actions,
                event_id: {
                    "knowledge_card_id": str(card.id),
                    "created_at": datetime.now(UTC).isoformat(),
                },
            },
        },
    }
    agent_run.context_refs = [
        *(agent_run.context_refs or []),
        {"source_type": "knowledge_card", "source_id": str(card.id)},
    ]
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type="capability_brief_fact_promoted_to_knowledge",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "agent_run_id": str(agent_run.id),
            "brief_event_id": event_id,
            "knowledge_card_id": str(card.id),
            "goal_id": str(linked_goal_id) if linked_goal_id else None,
        },
    )
    return run, card


async def create_memory_from_weekly_brief_fact(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    run: CapabilityRun,
    agent_run: AgentRun,
    event_id: str,
    content: str,
    memory_type: str,
    importance: int,
    tags: list[str],
) -> tuple[CapabilityRun, MemoryEntry]:
    if capability.slug not in EXECUTABLE_CAPABILITY_SLUGS:
        raise ValueError("this capability does not provide weekly brief fact actions")
    if workspace.id != run.workspace_id or workspace.user_id != run.user_id:
        raise ValueError("workspace does not match capability run")
    if run.status != "completed" or agent_run.status != "completed":
        raise ValueError("only a completed weekly brief can create memory")
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    if not isinstance(brief, dict) or not isinstance(brief.get("facts"), list):
        raise ValueError("weekly brief facts are unavailable")
    fact = next(
        (
            item
            for item in brief["facts"]
            if isinstance(item, dict) and item.get("event_id") == event_id
        ),
        None,
    )
    if fact is None:
        raise ValueError("brief fact is unavailable")
    actions = brief.get("fact_memory_actions")
    if not isinstance(actions, dict):
        actions = {}
    if event_id in actions:
        raise ValueError("this brief fact has already created memory")
    clean_content = content.strip()
    clean_type = memory_type.strip().lower()
    if not clean_content:
        raise ValueError("memory content cannot be empty")
    if not clean_type:
        raise ValueError("memory type cannot be empty")
    if len(clean_type) > 24:
        raise ValueError("memory type is too long")
    if importance < 1 or importance > 5:
        raise ValueError("memory importance is unavailable")
    normalized_tags: list[str] = []
    for tag in tags[:12]:
        normalized_tag = tag.strip()[:40]
        if normalized_tag and normalized_tag not in normalized_tags:
            normalized_tags.append(normalized_tag)
    summary = str(fact.get("summary") or "已确认的 Workspace 事实")
    source_note = (
        f"来源：Weekly Brief「{run.input_summary[:160]}」中的事实"
        f"「{summary[:240]}」。审计 Run：{run.id}；事实事件：{event_id}。"
    )
    raw_occurred_at = fact.get("occurred_at")
    occurred_at = None
    if isinstance(raw_occurred_at, str) and raw_occurred_at.strip():
        try:
            occurred_at = datetime.fromisoformat(raw_occurred_at.replace("Z", "+00:00"))
        except ValueError:
            occurred_at = None
    memory = await create_from_source(
        session=session,
        user_id=run.user_id,
        source="capability_brief",
        source_id=run.id,
        content=f"{clean_content}\n\n{source_note}",
        summary=None,
        tags=normalized_tags,
        memory_type=clean_type,
        importance=importance,
        confidence=1.0,
        occurred_at=occurred_at,
    )
    run.output_ref = {
        **output_ref,
        "brief": {
            **brief,
            "fact_memory_actions": {
                **actions,
                event_id: {
                    "memory_id": str(memory.id),
                    "created_at": datetime.now(UTC).isoformat(),
                },
            },
        },
    }
    agent_run.context_refs = [
        *(agent_run.context_refs or []),
        {"source_type": "memory", "source_id": str(memory.id)},
    ]
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type="capability_brief_fact_promoted_to_memory",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "agent_run_id": str(agent_run.id),
            "brief_event_id": event_id,
            "memory_id": str(memory.id),
            "memory_type": clean_type,
            "importance": importance,
        },
    )
    return run, memory


def capability_expected_output(capability: CapabilityRegistry) -> str:
    if capability.capability_type == "app":
        return f"确认后保留打开「{capability.name}」入口的授权记录；当前不会打开外部应用。"
    if capability.capability_type == "plugin":
        return f"基于当前 Workspace 已确认事实生成「{capability.name}」的可审阅计划。"
    if capability.capability_type == "skill":
        return f"基于当前 Workspace 已确认资料生成「{capability.name}」的可编辑建议。"
    return f"基于当前 Workspace 已确认事实生成「{capability.name}」的下一步建议。"


def capability_can_preview(
    *,
    capability: CapabilityRegistry,
    effective_status: str,
) -> bool:
    if capability.capability_type not in PREVIEWABLE_CAPABILITY_TYPES:
        return False
    if capability.capability_type == "app":
        return capability.status == "available"
    return effective_status == "enabled"


async def create_capability_invocation_preview(
    session: AsyncSession,
    *,
    workspace: Workspace,
    capability: CapabilityRegistry,
    input_summary: str,
    permissions: list[str],
    project_id: uuid.UUID | None,
) -> tuple[CapabilityRun, AgentRun]:
    expected_output = capability_expected_output(capability)
    agent_run = AgentRun(
        id=uuid.uuid4(),
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        project_id=project_id,
        agent_name="Capability Preview",
        intent="capability_invocation",
        input_text=input_summary,
        context_refs=[
            {"source_type": "capability", "source_id": str(capability.id)},
            {"source_type": "workspace", "source_id": str(workspace.id)},
        ],
        output_text=expected_output,
        model=None,
        prompt_version=None,
        status="awaiting_confirmation",
    )
    run = CapabilityRun(
        id=uuid.uuid4(),
        user_id=workspace.user_id,
        capability_id=capability.id,
        workspace_id=workspace.id,
        project_id=project_id,
        agent_run_id=agent_run.id,
        input_summary=input_summary,
        permission_snapshot=permissions,
        access_scope=f"当前 Workspace：{workspace.name}",
        side_effect_level="none",
        status="awaiting_confirmation",
        output_ref={
            "expected_output": expected_output,
            "execution_state": "not_started",
        },
    )
    session.add(agent_run)
    session.add(run)
    await append_event(
        session,
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        project_id=project_id,
        event_type="capability_invocation_previewed",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(capability.id),
            "capability_slug": capability.slug,
            "agent_run_id": str(agent_run.id),
            "side_effect_level": run.side_effect_level,
            "execution_state": "not_started",
        },
    )
    return run, agent_run


async def decide_capability_invocation(
    session: AsyncSession,
    *,
    run: CapabilityRun,
    agent_run: AgentRun,
    decision: str,
) -> CapabilityRun:
    if decision not in CAPABILITY_RUN_DECISIONS:
        raise ValueError("unsupported capability run decision")
    if run.status != "awaiting_confirmation" or agent_run.status != "awaiting_confirmation":
        raise ValueError("capability run has already been decided")
    status = {"confirm": "confirmed", "plan": "planned", "reject": "rejected"}[decision]
    now = datetime.now(UTC)
    run.status = status
    run.completed_at = now
    run.output_ref = {
        **(run.output_ref or {}),
        "decision": decision,
        "execution_state": "not_started",
    }
    agent_run.status = status
    agent_run.updated_at = now
    await append_event(
        session,
        user_id=run.user_id,
        workspace_id=run.workspace_id,
        project_id=run.project_id,
        event_type=f"capability_invocation_{status}",
        source_type="capability_run",
        source_id=run.id,
        payload={
            "capability_id": str(run.capability_id),
            "agent_run_id": str(agent_run.id),
            "decision": decision,
            "execution_state": "not_started",
        },
    )
    return run
