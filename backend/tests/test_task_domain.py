import asyncio
import uuid

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.tasks import TaskCreateRequest, TaskReasonRequest, TaskUpdateRequest
from app.engines.task_engine import block_task, complete_task, create_task, defer_task, task_query, update_task
from app.models.workspace import Workspace, WorkspaceEvent


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)


def test_task_requests_reject_blank_title_and_empty_patch() -> None:
    try:
        TaskCreateRequest(workspace_id=str(uuid.uuid4()), title="   ")
    except ValidationError as error:
        assert "title" in str(error)
    else:
        raise AssertionError("a blank task title should be rejected")

    try:
        TaskUpdateRequest()
    except ValidationError as error:
        assert "至少提供一项" in str(error)
    else:
        raise AssertionError("an empty task patch should be rejected")


def test_task_query_scopes_user_and_archived_workspace() -> None:
    query = task_query(uuid.uuid4(), uuid.uuid4())
    sql = str(query.compile(dialect=postgresql.dialect()))

    assert "tasks.user_id" in sql
    assert "tasks.deleted_at IS NULL" in sql
    assert "workspaces.user_id" in sql
    assert "workspaces.archived_at IS NULL" in sql


def test_task_writes_append_workspace_events() -> None:
    async def run() -> None:
        session = _FakeSession()
        workspace = Workspace(
            id=uuid.uuid4(),
            user_id=uuid.uuid4(),
            name="产品实验室",
            description="",
            workspace_type="work",
        )
        task = await create_task(
            session,
            workspace=workspace,
            values={
                "title": "补齐任务领域测试",
                "description": "覆盖事件和隔离边界",
                "priority": "high",
                "energy_required": 3,
                "time_block": 25,
                "due_at": None,
                "project_id": None,
                "goal_id": None,
                "plan_id": None,
            },
        )

        assert task.user_id == workspace.user_id
        assert isinstance(session.items[-1], WorkspaceEvent)
        assert session.items[-1].event_type == "task_created"

        await update_task(session, task, {"description": "已覆盖事件和隔离边界", "due_at": None})
        event = session.items[-1]
        assert isinstance(event, WorkspaceEvent)
        assert event.event_type == "task_updated"
        assert event.payload == {"description": "已覆盖事件和隔离边界", "due_at": None}

        await defer_task(session, task, reason="补充验收标准", due_at=None)
        assert task.status == "todo"
        assert task.defer_reason == "补充验收标准"
        await block_task(session, task, reason="等待接口联调")
        assert task.status == "blocked"
        assert task.defer_reason == "等待接口联调"
        task.status = "doing"
        await complete_task(session, task)
        completed_at = task.completed_at
        assert task.status == "done"
        assert completed_at is not None
        await complete_task(session, task)

        event_types = [item.event_type for item in session.items if isinstance(item, WorkspaceEvent)]
        assert event_types == [
            "task_created",
            "task_updated",
            "task_deferred",
            "task_blocked",
            "task_completed",
        ]

    asyncio.run(run())


def test_task_reason_rejects_blank_input() -> None:
    try:
        TaskReasonRequest(reason="   ")
    except ValidationError as error:
        assert "reason" in str(error)
    else:
        raise AssertionError("a blank task reason should be rejected")
