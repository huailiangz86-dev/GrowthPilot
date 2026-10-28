import asyncio
import uuid
from datetime import UTC, datetime

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.capabilities import CapabilitySettingUpdateRequest
from app.api.capability_runs import CapabilityInvocationPreviewRequest, _response
from app.engines.capability_engine import (
    BUILTIN_CAPABILITIES,
    capability_query,
    capability_run_query,
    capability_runs_query,
    create_growth_plan_from_weekly_brief_fact,
    create_goal_from_weekly_brief_fact,
    create_knowledge_card_from_weekly_brief_fact,
    create_memory_from_weekly_brief_fact,
    create_task_from_weekly_brief_fact,
    execute_confirmed_weekly_brief,
    create_capability_invocation_preview,
    decide_capability_invocation,
    save_workspace_capability_setting,
    workspace_brief_events_query,
    workspace_capability_setting_query,
)
from app.models.capability import AgentRun, CapabilityRegistry, CapabilityRun
from app.models.goal import Goal
from app.models.memory import MemoryEntry
from app.models.workspace import Workspace, WorkspaceEvent


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)

    async def flush(self) -> None:
        for item in self.items:
            if isinstance(item, MemoryEntry) and item.id is None:
                item.id = uuid.uuid4()


class _FakeScalarResult:
    def __init__(self, values: list[object]) -> None:
        self.values = values

    def scalars(self) -> "_FakeScalarResult":
        return self

    def all(self) -> list[object]:
        return self.values

    def scalar_one_or_none(self) -> object | None:
        return self.values[0] if self.values else None


class _EventSession(_FakeSession):
    def __init__(self, events: list[WorkspaceEvent]) -> None:
        super().__init__()
        self.events = events

    async def execute(self, _query):
        return _FakeScalarResult(self.events)


class _GoalSession(_FakeSession):
    def __init__(self, goal: Goal) -> None:
        super().__init__()
        self.goal = goal

    async def execute(self, _query):
        return _FakeScalarResult([self.goal])


def test_builtin_capability_catalog_covers_all_first_phase_groups() -> None:
    kinds = {str(item["capability_type"]) for item in BUILTIN_CAPABILITIES}

    assert kinds == {"app", "connection", "plugin", "skill", "agent"}
    assert all(item["source"] == "builtin" for item in BUILTIN_CAPABILITIES)
    assert all(item["workspace_scope"] == "all" for item in BUILTIN_CAPABILITIES)
    assert all(item["status"] != "enabled" for item in BUILTIN_CAPABILITIES)


def test_capability_query_scopes_user_workspace_and_archived_records() -> None:
    query = capability_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "capability_registry.archived_at IS NULL" in sql
    assert "capability_registry.user_id IS NULL" in sql
    assert "capability_registry.user_id" in sql
    assert "capability_registry.workspace_scope" in sql
    assert "capability_registry.workspace_ids @>" in sql


def test_capability_setting_query_scopes_user_workspace_and_archived_workspace() -> None:
    query = workspace_capability_setting_query(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_capability_settings.user_id" in sql
    assert "workspace_capability_settings.workspace_id" in sql
    assert "workspace_capability_settings.capability_id" in sql
    assert "workspaces.user_id" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_capability_setting_request_normalizes_explicit_permissions() -> None:
    payload = CapabilitySettingUpdateRequest(
        workspace_id=str(uuid.uuid4()),
        status="enabled",
        permissions=[" 读取当前 Workspace 事实 ", "读取当前 Workspace 事实", ""],
    )

    assert payload.permissions == ["读取当前 Workspace 事实"]

    try:
        CapabilitySettingUpdateRequest(
            workspace_id=str(uuid.uuid4()),
            status="available",
        )
    except ValidationError:
        pass
    else:
        raise AssertionError("only enabled and disabled settings should be accepted")


def test_capability_setting_writes_a_workspace_event() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace_id = uuid.uuid4()
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="test-weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )

        setting = await save_workspace_capability_setting(
            session,
            capability=capability,
            user_id=user_id,
            workspace_id=workspace_id,
            status="enabled",
            permissions=["读取当前 Workspace 事实"],
            existing=None,
        )

        assert setting.user_id == user_id
        assert setting.workspace_id == workspace_id
        assert setting.status == "enabled"
        assert isinstance(session.items[-1], WorkspaceEvent)
        event = session.items[-1]
        assert isinstance(event, WorkspaceEvent)
        assert event.event_type == "capability_setting_updated"
        assert event.source_id == capability.id
        assert event.payload["permissions"] == ["读取当前 Workspace 事实"]

    asyncio.run(run())


def test_capability_invocation_preview_request_requires_an_input_summary() -> None:
    try:
        CapabilityInvocationPreviewRequest(
            workspace_id=str(uuid.uuid4()),
            input_summary="   ",
        )
    except ValidationError as error:
        assert "调用摘要不能为空" in str(error)
    else:
        raise AssertionError("a capability preview should require an explicit input summary")


def test_capability_run_query_scopes_user_and_archived_workspace() -> None:
    query = capability_run_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "capability_runs.user_id" in sql
    assert "workspaces.user_id" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_capability_runs_query_scopes_user_workspace_capability_and_archived_workspace() -> None:
    query = capability_runs_query(uuid.uuid4(), uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "capability_runs.user_id" in sql
    assert "capability_runs.workspace_id" in sql
    assert "capability_runs.capability_id" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_workspace_brief_events_query_scopes_user_workspace_and_excludes_capability_events() -> None:
    query = workspace_brief_events_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_events.user_id" in sql
    assert "workspace_events.workspace_id" in sql
    assert "workspace_events.event_type NOT LIKE" in sql


def test_capability_invocation_preview_and_decision_write_linked_audits() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="test-weekly-brief-preview-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )

        capability_run, agent_run = await create_capability_invocation_preview(
            session,
            workspace=workspace,
            capability=capability,
            input_summary="整理本周已经确认的工作事实。",
            permissions=["读取当前 Workspace 事实"],
            project_id=None,
        )

        assert capability_run.status == "awaiting_confirmation"
        assert capability_run.agent_run_id == agent_run.id
        assert capability_run.output_ref["execution_state"] == "not_started"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_invocation_previewed"

        decided = await decide_capability_invocation(
            session,
            run=capability_run,
            agent_run=agent_run,
            decision="plan",
        )

        assert decided.status == "planned"
        assert decided.completed_at is not None
        assert decided.output_ref["decision"] == "plan"
        assert decided.output_ref["execution_state"] == "not_started"
        assert agent_run.status == "planned"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_invocation_planned"

    asyncio.run(run())


def test_confirmed_weekly_brief_only_writes_a_completed_audit_and_event() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        event = WorkspaceEvent(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            event_type="task_completed",
            source_type="task",
            source_id=uuid.uuid4(),
            payload={"title": "完成周复盘"},
            occurred_at=datetime.now(UTC),
        )
        session = _EventSession([event])
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        capability_run, agent_run = await create_capability_invocation_preview(
            session,
            workspace=workspace,
            capability=capability,
            input_summary="整理本周已经确认的工作事实。",
            permissions=["读取当前 Workspace 事实"],
            project_id=None,
        )
        await decide_capability_invocation(
            session,
            run=capability_run,
            agent_run=agent_run,
            decision="confirm",
        )

        completed = await execute_confirmed_weekly_brief(
            session,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
        )

        assert completed.status == "completed"
        assert completed.output_ref["execution_state"] == "completed"
        assert completed.output_ref["brief"]["facts"][0]["summary"] == "完成任务「完成周复盘」"
        assert completed.output_ref["brief"]["fact_actions"] == {}
        assert completed.output_ref["brief"]["fact_goal_actions"] == {}
        assert completed.output_ref["brief"]["fact_plan_actions"] == {}
        assert completed.output_ref["brief"]["fact_knowledge_actions"] == {}
        assert completed.output_ref["brief"]["fact_memory_actions"] == {}
        assert agent_run.status == "completed"
        assert any(
            reference["source_id"] == str(event.id)
            for reference in agent_run.context_refs
            if reference["source_type"] == "workspace_event"
        )
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_invocation_completed"
        assert session.items[-1].payload["evidence_event_ids"] == [str(event.id)]

    asyncio.run(run())


def test_weekly_brief_fact_creates_one_traceable_goal_without_affecting_task_mapping() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        agent_run = AgentRun(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            agent_name="Capability Preview",
            intent="capability_invocation",
            input_text="整理本周事实",
            context_refs=[],
            output_text="简报草稿",
            status="completed",
        )
        event_id = str(uuid.uuid4())
        capability_run = CapabilityRun(
            id=uuid.uuid4(),
            user_id=user_id,
            capability_id=capability.id,
            workspace_id=workspace.id,
            project_id=None,
            agent_run_id=agent_run.id,
            input_summary="整理本周事实",
            permission_snapshot=["读取当前 Workspace 事实"],
            access_scope="当前 Workspace：成长工作台",
            side_effect_level="none",
            status="completed",
            output_ref={
                "execution_state": "completed",
                "brief": {
                    "title": "Weekly Brief 草稿",
                    "summary": "已整理 1 条事实。",
                    "facts": [{
                        "event_id": event_id,
                        "event_type": "task_completed",
                        "occurred_at": datetime.now(UTC).isoformat(),
                        "summary": "完成任务「完成周复盘」",
                    }],
                },
            },
        )

        _, task = await create_task_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            title="整理下周复盘节奏",
        )
        _, goal = await create_goal_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            title="建立稳定的周复盘习惯",
        )

        assert goal.title == "建立稳定的周复盘习惯"
        assert goal.workspace_id == workspace.id
        assert "Weekly Brief" in goal.description
        assert str(capability_run.id) in goal.description
        assert event_id in goal.description
        assert capability_run.output_ref["brief"]["fact_actions"][event_id]["task_id"] == str(task.id)
        assert capability_run.output_ref["brief"]["fact_goal_actions"][event_id]["goal_id"] == str(goal.id)
        assert isinstance(session.items[-2], WorkspaceEvent)
        assert session.items[-2].event_type == "goal_created"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_brief_fact_promoted_to_goal"

        try:
            await create_goal_from_weekly_brief_fact(
                session,
                workspace=workspace,
                capability=capability,
                run=capability_run,
                agent_run=agent_run,
                event_id=event_id,
                title="重复创建",
            )
        except ValueError as error:
            assert "already created" in str(error)
        else:
            raise AssertionError("a brief fact should only create one goal")

    asyncio.run(run())


def test_capability_run_response_normalizes_legacy_brief_action_maps() -> None:
    from datetime import UTC, datetime

    user_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    capability = CapabilityRegistry(
        id=uuid.uuid4(),
        capability_type="plugin",
        name="Weekly Brief Plugin",
        slug="weekly-brief-plugin",
        description="",
        source="builtin",
        version="1.0",
        status="available",
        dependencies=[],
        permissions=["读取当前 Workspace 事实"],
        workspace_scope="all",
        workspace_ids=[],
    )
    agent_run = AgentRun(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        project_id=None,
        agent_name="Capability Preview",
        intent="capability_invocation",
        input_text="整理本周事实",
        context_refs=[],
        output_text="简报草稿",
        status="completed",
    )
    capability_run = CapabilityRun(
        id=uuid.uuid4(),
        user_id=user_id,
        capability_id=capability.id,
        workspace_id=workspace_id,
        project_id=None,
        agent_run_id=agent_run.id,
        started_at=datetime.now(UTC),
        input_summary="整理本周事实",
        permission_snapshot=["读取当前 Workspace 事实"],
        access_scope="当前 Workspace",
        side_effect_level="none",
        status="completed",
        output_ref={
            "execution_state": "completed",
            "brief": {
                "title": "Weekly Brief 草稿",
                "summary": "已整理 0 条事实。",
                "facts": [],
            },
        },
    )

    response = _response(capability_run, agent_run, capability)

    assert response.brief is not None
    assert response.brief.fact_actions == {}
    assert response.brief.fact_goal_actions == {}
    assert response.brief.fact_plan_actions == {}
    assert response.brief.fact_knowledge_actions == {}
    assert response.brief.fact_memory_actions == {}


def test_weekly_brief_fact_creates_one_traceable_growth_plan() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        goal = Goal(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            title="建立稳定的复盘节奏",
            description="",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        agent_run = AgentRun(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            agent_name="Capability Preview",
            intent="capability_invocation",
            input_text="整理本周事实",
            context_refs=[],
            output_text="简报草稿",
            status="completed",
        )
        event_id = str(uuid.uuid4())
        capability_run = CapabilityRun(
            id=uuid.uuid4(),
            user_id=user_id,
            capability_id=capability.id,
            workspace_id=workspace.id,
            project_id=None,
            agent_run_id=agent_run.id,
            input_summary="整理本周事实",
            permission_snapshot=["读取当前 Workspace 事实"],
            access_scope="当前 Workspace：成长工作台",
            side_effect_level="none",
            status="completed",
            output_ref={
                "execution_state": "completed",
                "brief": {
                    "title": "Weekly Brief 草稿",
                    "summary": "已整理 1 条事实。",
                    "facts": [{
                        "event_id": event_id,
                        "event_type": "task_completed",
                        "occurred_at": datetime.now(UTC).isoformat(),
                        "summary": "完成任务「完成周复盘」",
                    }],
                },
            },
        )
        session = _GoalSession(goal)

        _, plan = await create_growth_plan_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            goal_id=str(goal.id),
            title="把复盘变成每周节奏",
            period_type="weekly",
        )

        assert plan.title == "把复盘变成每周节奏"
        assert plan.workspace_id == workspace.id
        assert plan.goal_id == goal.id
        assert plan.period_type == "weekly"
        assert plan.total_weeks is None
        assert plan.current_week is None
        assert plan.milestones == []
        assert "Weekly Brief" in plan.description
        assert str(capability_run.id) in plan.description
        assert event_id in plan.description
        assert capability_run.output_ref["brief"]["fact_plan_actions"][event_id]["plan_id"] == str(plan.id)
        assert any(
            isinstance(item, WorkspaceEvent) and item.event_type == "growth_plan_created"
            for item in session.items
        )
        assert session.items[-1].event_type == "capability_brief_fact_promoted_to_plan"

        try:
            await create_growth_plan_from_weekly_brief_fact(
                session,
                workspace=workspace,
                capability=capability,
                run=capability_run,
                agent_run=agent_run,
                event_id=event_id,
                goal_id=str(goal.id),
                title="重复创建",
                period_type="weekly",
            )
        except ValueError as error:
            assert "already created" in str(error)
        else:
            raise AssertionError("a brief fact should only create one growth plan")

    asyncio.run(run())


def test_weekly_brief_fact_creates_one_traceable_knowledge_card_without_learning_side_effect() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        goal = Goal(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            title="建立稳定的复盘节奏",
            description="",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        agent_run = AgentRun(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            agent_name="Capability Preview",
            intent="capability_invocation",
            input_text="整理本周事实",
            context_refs=[],
            output_text="简报草稿",
            status="completed",
        )
        event_id = str(uuid.uuid4())
        capability_run = CapabilityRun(
            id=uuid.uuid4(),
            user_id=user_id,
            capability_id=capability.id,
            workspace_id=workspace.id,
            project_id=None,
            agent_run_id=agent_run.id,
            input_summary="整理本周事实",
            permission_snapshot=["读取当前 Workspace 事实"],
            access_scope="当前 Workspace：成长工作台",
            side_effect_level="none",
            status="completed",
            output_ref={
                "execution_state": "completed",
                "brief": {
                    "title": "Weekly Brief 草稿",
                    "summary": "已整理 1 条事实。",
                    "facts": [{
                        "event_id": event_id,
                        "event_type": "task_completed",
                        "occurred_at": datetime.now(UTC).isoformat(),
                        "summary": "完成任务「完成周复盘」",
                    }],
                },
            },
        )
        session = _GoalSession(goal)

        _, card = await create_knowledge_card_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            title="周复盘中的具体行为",
            content="先记录发生了什么，再决定下一步如何调整。",
            goal_id=str(goal.id),
        )

        assert card.title == "周复盘中的具体行为"
        assert card.workspace_id == workspace.id
        assert card.goal_id == goal.id
        assert card.source_type == "text"
        assert card.source_url is None
        assert card.learning_item_id is None
        assert "先记录发生了什么" in (card.content or "")
        assert "Weekly Brief" in (card.content or "")
        assert str(capability_run.id) in (card.content or "")
        assert event_id in (card.content or "")
        assert capability_run.output_ref["brief"]["fact_knowledge_actions"][event_id]["knowledge_card_id"] == str(card.id)
        assert session.items[-2].event_type == "knowledge_card_captured"
        assert session.items[-1].event_type == "capability_brief_fact_promoted_to_knowledge"
        assert not any(
            isinstance(item, WorkspaceEvent) and item.event_type == "knowledge_card_queued"
            for item in session.items
        )

        try:
            await create_knowledge_card_from_weekly_brief_fact(
                session,
                workspace=workspace,
                capability=capability,
                run=capability_run,
                agent_run=agent_run,
                event_id=event_id,
                title="重复创建",
                content="不应重复写入",
                goal_id=str(goal.id),
            )
        except ValueError as error:
            assert "already created" in str(error)
        else:
            raise AssertionError("a brief fact should only create one knowledge card")

    asyncio.run(run())


def test_weekly_brief_fact_creates_one_traceable_memory_without_domain_side_effects() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        agent_run = AgentRun(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            agent_name="Capability Preview",
            intent="capability_invocation",
            input_text="整理本周事实",
            context_refs=[],
            output_text="简报草稿",
            status="completed",
        )
        event_id = str(uuid.uuid4())
        occurred_at = datetime(2026, 8, 18, 9, 30, tzinfo=UTC)
        capability_run = CapabilityRun(
            id=uuid.uuid4(),
            user_id=user_id,
            capability_id=capability.id,
            workspace_id=workspace.id,
            project_id=None,
            agent_run_id=agent_run.id,
            input_summary="整理本周事实",
            permission_snapshot=["读取当前 Workspace 事实"],
            access_scope="当前 Workspace：成长工作台",
            side_effect_level="none",
            status="completed",
            output_ref={
                "execution_state": "completed",
                "brief": {
                    "title": "Weekly Brief 草稿",
                    "summary": "已整理 1 条事实。",
                    "facts": [{
                        "event_id": event_id,
                        "event_type": "task_completed",
                        "occurred_at": occurred_at.isoformat(),
                        "summary": "完成任务「完成周复盘」",
                    }],
                },
            },
        )

        confirmed_content = "复盘洞察" * 1000
        _, memory = await create_memory_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            content=confirmed_content,
            memory_type="procedural",
            importance=4,
            tags=["复盘", " 复盘 ", "行动"],
        )

        assert memory.user_id == user_id
        assert memory.source == "capability_brief"
        assert memory.source_id == capability_run.id
        assert memory.memory_type == "procedural"
        assert memory.importance == 4
        assert memory.tags == ["复盘", "行动"]
        assert memory.summary is None
        assert memory.occurred_at == occurred_at
        assert memory.content.startswith(confirmed_content)
        assert len(confirmed_content) == 4000
        assert "Weekly Brief" in memory.content
        assert str(capability_run.id) in memory.content
        assert event_id in memory.content
        assert capability_run.output_ref["brief"]["fact_memory_actions"][event_id]["memory_id"] == str(memory.id)
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_brief_fact_promoted_to_memory"
        assert not any(
            isinstance(item, WorkspaceEvent)
            and item.event_type in {"task_created", "goal_created", "growth_plan_created", "knowledge_card_captured", "knowledge_card_queued"}
            for item in session.items
        )

        try:
            await create_memory_from_weekly_brief_fact(
                session,
                workspace=workspace,
                capability=capability,
                run=capability_run,
                agent_run=agent_run,
                event_id=event_id,
                content="不应重复写入",
                memory_type="semantic",
                importance=3,
                tags=[],
            )
        except ValueError as error:
            assert "already created" in str(error)
        else:
            raise AssertionError("a brief fact should only create one memory")

    asyncio.run(run())


def test_weekly_brief_fact_creates_one_traceable_task() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=user_id,
            name="成长工作台",
            description="",
            workspace_type="personal",
        )
        capability = CapabilityRegistry(
            id=uuid.uuid4(),
            capability_type="plugin",
            name="Weekly Brief Plugin",
            slug="weekly-brief-plugin",
            description="",
            source="builtin",
            version="1.0",
            status="available",
            dependencies=[],
            permissions=["读取当前 Workspace 事实"],
            workspace_scope="all",
            workspace_ids=[],
        )
        agent_run = AgentRun(
            id=uuid.uuid4(),
            user_id=user_id,
            workspace_id=workspace.id,
            project_id=None,
            agent_name="Capability Preview",
            intent="capability_invocation",
            input_text="整理本周事实",
            context_refs=[],
            output_text="简报草稿",
            status="completed",
        )
        event_id = str(uuid.uuid4())
        capability_run = CapabilityRun(
            id=uuid.uuid4(),
            user_id=user_id,
            capability_id=capability.id,
            workspace_id=workspace.id,
            project_id=None,
            agent_run_id=agent_run.id,
            input_summary="整理本周事实",
            permission_snapshot=["读取当前 Workspace 事实"],
            access_scope="当前 Workspace：成长工作台",
            side_effect_level="none",
            status="completed",
            output_ref={
                "execution_state": "completed",
                "brief": {
                    "title": "Weekly Brief 草稿",
                    "summary": "已整理 1 条事实。",
                    "facts": [{
                        "event_id": event_id,
                        "event_type": "task_completed",
                        "occurred_at": datetime.now(UTC).isoformat(),
                        "summary": "完成任务「完成周复盘」",
                    }],
                },
            },
        )

        _, task = await create_task_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=capability_run,
            agent_run=agent_run,
            event_id=event_id,
            title="整理下周复盘节奏",
        )

        assert task.title == "整理下周复盘节奏"
        assert task.workspace_id == workspace.id
        assert "Weekly Brief" in task.description
        assert capability_run.output_ref["brief"]["fact_actions"][event_id]["task_id"] == str(task.id)
        assert isinstance(session.items[-2], WorkspaceEvent)
        assert session.items[-2].event_type == "task_created"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "capability_brief_fact_promoted"

        try:
            await create_task_from_weekly_brief_fact(
                session,
                workspace=workspace,
                capability=capability,
                run=capability_run,
                agent_run=agent_run,
                event_id=event_id,
                title="重复创建",
            )
        except ValueError as error:
            assert "already created" in str(error)
        else:
            raise AssertionError("a brief fact should only create one task")

    asyncio.run(run())
