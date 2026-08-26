import asyncio
import uuid
from datetime import date

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.reflections import ReflectionSaveRequest
from app.engines.reflection_engine import reflection_key, reflection_query, save_reflection
from app.models.workspace import Workspace, WorkspaceEvent


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)


def test_reflection_request_requires_type_specific_facts() -> None:
    try:
        ReflectionSaveRequest(
            workspace_id=str(uuid.uuid4()),
            reflection_type="morning",
            reflection_date=date.today(),
        )
    except ValidationError as error:
        assert "能量值" in str(error)
    else:
        raise AssertionError("morning reflection should require energy")

    try:
        ReflectionSaveRequest(
            workspace_id=str(uuid.uuid4()),
            reflection_type="micro",
            reflection_date=date.today(),
            content="留下一个事实",
        )
    except ValidationError as error:
        assert "类型和状态" in str(error)
    else:
        raise AssertionError("micro reflection should require type and status")


def test_reflection_query_scopes_user_and_archived_workspace() -> None:
    query = reflection_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_reflections.user_id" in sql
    assert "workspaces.user_id" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_reflection_save_appends_workspace_event() -> None:
    async def run() -> None:
        session = _FakeSession()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            name="个人成长",
            description="",
            workspace_type="personal",
        )
        reflection = await save_reflection(
            session,
            workspace=workspace,
            values={
                "project_id": None,
                "goal_id": None,
                "task_id": None,
                "reflection_type": "morning",
                "reflection_date": date(2026, 8, 17),
                "energy": 4,
                "intention": "完成一个真实闭环",
                "completion": None,
                "wins": None,
                "friction": None,
                "adjustment": None,
                "mood": None,
                "micro_type": None,
                "micro_status": None,
                "content": None,
                "is_makeup": False,
            },
        )

        assert reflection.reflection_key == "morning:2026-08-17"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "reflection_created"
        assert session.items[-1].payload["energy"] == 4

    asyncio.run(run())


def test_reflection_key_only_upserts_daily_reflections() -> None:
    assert reflection_key("morning", date(2026, 8, 17)) == "morning:2026-08-17"
    assert reflection_key("evening", date(2026, 8, 17)) == "evening:2026-08-17"
    assert reflection_key("micro", date(2026, 8, 17)) is None
