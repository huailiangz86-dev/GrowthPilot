import asyncio
import uuid

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.learning_items import LearningItemCreateRequest, LearningProgressRequest
from app.engines.learning_engine import create_learning_item, learning_item_query, update_learning_progress
from app.models.workspace import Workspace, WorkspaceEvent


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)


def test_learning_item_requests_validate_title_and_progress() -> None:
    try:
        LearningItemCreateRequest(workspace_id=str(uuid.uuid4()), title="  ")
    except ValidationError as error:
        assert "title" in str(error)
    else:
        raise AssertionError("a blank learning title should be rejected")

    try:
        LearningProgressRequest(progress=101)
    except ValidationError as error:
        assert "progress" in str(error)
    else:
        raise AssertionError("progress above 100 should be rejected")


def test_learning_item_query_scopes_user_and_archived_workspace() -> None:
    query = learning_item_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "workspace_learning_items.user_id" in sql
    assert "workspace_learning_items.archived_at IS NULL" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_learning_item_writes_events_for_creation_and_progress() -> None:
    async def run() -> None:
        session = _FakeSession()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            name="成长学习",
            description="",
            workspace_type="learning",
        )
        item = await create_learning_item(
            session,
            workspace=workspace,
            values={
                "project_id": None,
                "goal_id": None,
                "title": "阅读系统设计",
                "summary": "",
                "kind": "book",
                "duration_minutes": 45,
            },
        )
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "learning_item_created"

        await update_learning_progress(session, item, 40)
        assert item.status == "in_progress"
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "learning_progress_updated"

        await update_learning_progress(session, item, 100)
        assert item.status == "completed"
        assert item.progress_updated_at is not None

    asyncio.run(run())
