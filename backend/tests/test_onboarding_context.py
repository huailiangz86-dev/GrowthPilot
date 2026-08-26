import asyncio
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import patch

from pydantic import ValidationError

from app.ai.prompt_loader import clear_cache, load_prompt
from app.api.onboarding import (
    ContextCompleteRequest,
    ContextPreviewRequest,
    OnboardingProjectInput,
    OnboardingWorkspaceInput,
    PersonalContext,
    _normalize_context,
    _profile_summary,
    complete_context,
    preview_context,
)
from app.api.memory import (
    MemoryCreateRequest,
    MemoryUpdateRequest,
    create_memory,
    delete_memory,
    restore_memory,
    update_memory,
)
from app.engines.memory_engine import create_from_source
from app.models.memory import MemoryEntry
from app.models.user import User
from app.models.workspace import WorkspaceEvent


def test_normalize_context_accepts_flexible_llm_shapes() -> None:
    context = _normalize_context(
        {
            "identity": "独立设计师",
            "current_project": "正在做一个个人品牌网站",
            "goals": "完成上线\n建立稳定的写作习惯",
            "work_rhythm": "工作日晚上有整块时间",
        }
    )

    assert context == PersonalContext(
        identity="独立设计师",
        current_project="正在做一个个人品牌网站",
        goals=["完成上线", "建立稳定的写作习惯"],
        work_rhythm="工作日晚上有整块时间",
    )


def test_normalize_context_clamps_text_and_removes_empty_goals() -> None:
    context = _normalize_context(
        {
            "identity": "a" * 300,
            "goals": ["完成第一步", "", "  ", "完成第一步"],
        }
    )

    assert len(context.identity) == 200
    assert context.goals == ["完成第一步"]


def test_context_requests_reject_whitespace_only_input() -> None:
    try:
        ContextPreviewRequest(raw_input="   ")
    except ValidationError as error:
        assert "raw_input" in str(error)
    else:
        raise AssertionError("whitespace-only onboarding input should be rejected")


def test_memory_request_rejects_whitespace_only_content() -> None:
    try:
        MemoryCreateRequest(content="   ")
    except ValidationError as error:
        assert "content" in str(error)
    else:
        raise AssertionError("whitespace-only memory content should be rejected")


def test_profile_summary_is_readable_without_ai() -> None:
    summary = _profile_summary(
        PersonalContext(
            identity="产品经理",
            current_project="准备一个副业项目",
            goals=["验证想法"],
            work_rhythm="周末集中推进",
        )
    )

    assert "产品经理" in summary
    assert "准备一个副业项目" in summary
    assert "验证想法" in summary


def test_onboarding_prompt_is_loaded_from_yaml() -> None:
    clear_cache()
    prompt = load_prompt("onboarding_context", "v1")

    assert "raw_input" in prompt["user_prompt_template"]
    assert "identity" in prompt["output_schema"]["required"]


class _FakeSession:
    def __init__(self) -> None:
        self.items = []
        self.user = None

    def add(self, item) -> None:
        if getattr(item, "id", None) is None:
            item.id = uuid.uuid4()
        self.items.append(item)

    async def flush(self) -> None:
        return None

    async def execute(self, query):
        if "memory_entries" in str(query):
            memory = next((item for item in self.items if isinstance(item, MemoryEntry)), None)
            return _FakeResult(memory)
        return _FakeResult(self.user)

    async def commit(self) -> None:
        return None


class _FakeResult:
    def __init__(self, value) -> None:
        self.value = value

    def scalar_one_or_none(self):
        return self.value


class _MemorySession:
    def __init__(self) -> None:
        self.items = []

    def add(self, item) -> None:
        item.id = uuid.uuid4()
        item.created_at = item.occurred_at
        item.updated_at = item.occurred_at
        self.items.append(item)

    async def flush(self) -> None:
        return None

    async def commit(self) -> None:
        return None

    async def refresh(self, _item) -> None:
        return None


class _CrudMemorySession:
    def __init__(self, memory: MemoryEntry) -> None:
        self.memory = memory

    async def execute(self, _query):
        return _FakeResult(self.memory)

    async def commit(self) -> None:
        return None

    async def refresh(self, _item) -> None:
        return None


def _build_memory(user_id: uuid.UUID) -> MemoryEntry:
    occurred_at = datetime.now(UTC)
    return MemoryEntry(
        id=uuid.uuid4(),
        user_id=user_id,
        memory_type="semantic",
        source="manual",
        content="原始 Memory",
        summary="原始 Memory",
        tags=["原始"],
        derived_status={"summary": "ready", "entities": "ready", "embedding": "ready"},
        importance=3,
        confidence=1.0,
        occurred_at=occurred_at,
        created_at=occurred_at,
        updated_at=occurred_at,
    )


def test_create_from_source_creates_user_scoped_onboarding_memory() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()

        memory = await create_from_source(
            session=session,
            user_id=user_id,
            source="onboarding",
            content="我是一名设计师，正在准备转型。",
            summary="设计师正在准备转型。",
            tags=["onboarding"],
        )

        assert memory.user_id == user_id
        assert memory.source == "onboarding"
        assert memory.content == "我是一名设计师，正在准备转型。"
        assert memory in session.items

    asyncio.run(run())


def test_create_memory_uses_manual_source_and_user_scope() -> None:
    async def run() -> None:
        session = _MemorySession()
        user_id = uuid.uuid4()
        response = await create_memory(
            payload=MemoryCreateRequest(
                content="今天终于把第一版产品首页做出来了。",
                tags=["产品", "进展"],
                importance=4,
            ),
            user_id=str(user_id),
            session=session,
        )

        assert response.success is True
        assert response.data is not None
        assert response.data.source == "manual"
        assert response.data.content == "今天终于把第一版产品首页做出来了。"
        assert session.items[0].user_id == user_id
        assert session.items[0].tags == ["产品", "进展"]

    asyncio.run(run())


def test_memory_update_marks_derived_data_stale() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        memory = _build_memory(user_id)
        response = await update_memory(
            memory_id=str(memory.id),
            payload=MemoryUpdateRequest(content="更新后的 Memory", tags=["新的标签"]),
            user_id=str(user_id),
            session=_CrudMemorySession(memory),
        )

        assert response.success is True
        assert memory.content == "更新后的 Memory"
        assert memory.tags == ["新的标签"]
        assert memory.derived_status == {
            "summary": "stale",
            "entities": "stale",
            "embedding": "stale",
        }

    asyncio.run(run())


def test_memory_update_rejects_empty_patch() -> None:
    try:
        MemoryUpdateRequest()
    except ValidationError as error:
        assert "至少提供一项" in str(error)
    else:
        raise AssertionError("an empty memory patch should be rejected")


def test_memory_delete_soft_deletes_and_restore_reopens_window() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        memory = _build_memory(user_id)
        session = _CrudMemorySession(memory)

        deleted = await delete_memory(
            memory_id=str(memory.id),
            user_id=str(user_id),
            session=session,
        )
        assert deleted.success is True
        assert deleted.data is not None
        assert deleted.data["deleted"] is True
        assert memory.deleted_at is not None

        restored = await restore_memory(
            memory_id=str(memory.id),
            user_id=str(user_id),
            session=session,
        )
        assert restored.success is True
        assert memory.deleted_at is None

    asyncio.run(run())


def test_memory_restore_rejects_expired_undo_window() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        memory = _build_memory(user_id)
        memory.deleted_at = datetime.now(UTC) - timedelta(minutes=16)

        try:
            await restore_memory(
                memory_id=str(memory.id),
                user_id=str(user_id),
                session=_CrudMemorySession(memory),
            )
        except Exception as error:
            assert "撤销时间已结束" in str(error)
        else:
            raise AssertionError("expired memory restore should be rejected")

    asyncio.run(run())


def test_preview_context_keeps_ai_failure_non_blocking() -> None:
    async def fail(*_args, **_kwargs):
        raise TimeoutError("provider timeout")

    async def run() -> None:
        with patch("app.api.onboarding.structured_output", side_effect=fail):
            response = await preview_context(
                payload=ContextPreviewRequest(raw_input="我想把生活重新安排得更有节奏。"),
                user_id=str(uuid.uuid4()),
                session=object(),
            )

        assert response.success is True
        assert response.data is not None
        assert response.data.ai_generated is False
        assert response.data.raw_input == "我想把生活重新安排得更有节奏。"

    asyncio.run(run())


def test_complete_context_saves_raw_input_and_profile() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        session = _FakeSession()
        session.user = User(id=user_id, wx_openid="test-openid", settings={})
        response = await complete_context(
            payload=ContextCompleteRequest(
                raw_input="我是产品经理，正在准备一个副业项目。",
                profile=PersonalContext(
                    identity="产品经理",
                    current_project="副业项目",
                    goals=["验证想法"],
                    work_rhythm="工作日晚上",
                ),
            ),
            user_id=str(user_id),
            session=session,
        )

        assert response.success is True
        assert response.data is not None
        assert response.data.saved is True
        assert session.user.settings["profile"]["identity"] == "产品经理"
        assert session.user.settings["personal_context"]["completed"] is True
        assert len(session.items) == 1
        assert session.items[0].content == "我是产品经理，正在准备一个副业项目。"

    asyncio.run(run())


def test_complete_context_commits_confirmed_workspace_project_and_events() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        session = _FakeSession()
        session.user = User(id=user_id, wx_openid="test-openid", settings={})
        response = await complete_context(
            payload=ContextCompleteRequest(
                raw_input="我要完成 GrowthPilot 的第一版工作台。",
                workspace=OnboardingWorkspaceInput(
                    name="GrowthPilot 工作台",
                    description="把产品构想变成可执行的工作上下文。",
                ),
                project=OnboardingProjectInput(
                    name="完成首版工作台",
                    description="先跑通 Workspace 和 Onboarding。",
                    next_action="接入确认写入",
                ),
            ),
            user_id=str(user_id),
            session=session,
        )

        assert response.success is True
        assert response.data is not None
        assert response.data.workspace_id is not None
        assert response.data.project_id is not None
        assert session.user.settings["personal_context"]["workspace_id"] == response.data.workspace_id
        assert session.user.settings["personal_context"]["project_id"] == response.data.project_id

        events = [item for item in session.items if isinstance(item, WorkspaceEvent)]
        assert [event.event_type for event in events] == [
            "workspace_created",
            "project_created",
            "onboarding_confirmed",
        ]
        assert events[-1].payload == {
            "raw_input": "我要完成 GrowthPilot 的第一版工作台。",
            "confirmed_objects": ["workspace", "project"],
        }

    asyncio.run(run())


def test_complete_context_retry_reuses_confirmed_domain_facts() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        session = _FakeSession()
        session.user = User(id=user_id, wx_openid="test-openid", settings={})
        payload = ContextCompleteRequest(
            raw_input="我要完成 GrowthPilot 的第一版工作台。",
            workspace=OnboardingWorkspaceInput(
                name="GrowthPilot 工作台",
                description="把产品构想变成可执行的工作上下文。",
            ),
            project=OnboardingProjectInput(
                name="完成首版工作台",
                description="先跑通 Workspace 和 Onboarding。",
                next_action="接入确认写入",
            ),
        )

        first_response = await complete_context(payload=payload, user_id=str(user_id), session=session)
        retry_response = await complete_context(payload=payload, user_id=str(user_id), session=session)

        assert first_response.data is not None
        assert retry_response.data is not None
        assert retry_response.data.workspace_id == first_response.data.workspace_id
        assert retry_response.data.project_id == first_response.data.project_id
        events = [item for item in session.items if isinstance(item, WorkspaceEvent)]
        assert [event.event_type for event in events] == [
            "workspace_created",
            "project_created",
            "onboarding_confirmed",
        ]

    asyncio.run(run())
