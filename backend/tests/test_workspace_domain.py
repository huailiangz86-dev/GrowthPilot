import asyncio
import uuid

from pydantic import ValidationError
from sqlalchemy.dialects import postgresql

from app.api.workspaces import ProjectCreateRequest, WorkspaceCreateRequest, WorkspaceUpdateRequest
from app.engines.workspace_engine import (
    archive_project,
    archive_workspace,
    create_project,
    create_workspace,
    project_query,
    update_project,
    workspace_query,
)
from app.models.workspace import WorkspaceEvent


class _FakeSession:
    def __init__(self) -> None:
        self.items: list[object] = []

    def add(self, item: object) -> None:
        self.items.append(item)


def test_workspace_requests_reject_blank_name_and_empty_patch() -> None:
    try:
        WorkspaceCreateRequest(name="   ")
    except ValidationError as error:
        assert "name" in str(error)
    else:
        raise AssertionError("a blank workspace name should be rejected")

    try:
        WorkspaceUpdateRequest()
    except ValidationError as error:
        assert "至少提供一项" in str(error)
    else:
        raise AssertionError("an empty workspace patch should be rejected")

    try:
        ProjectCreateRequest(workspace_id=str(uuid.uuid4()), name="  ")
    except ValidationError as error:
        assert "name" in str(error)
    else:
        raise AssertionError("a blank project name should be rejected")


def test_scoped_queries_filter_user_and_archived_records() -> None:
    user_id = uuid.uuid4()
    workspace_id = uuid.uuid4()
    project_id = uuid.uuid4()

    workspace_sql = str(workspace_query(user_id, workspace_id).compile(dialect=postgresql.dialect()))
    project_sql = str(project_query(user_id, project_id).compile(dialect=postgresql.dialect()))

    assert "workspaces.user_id" in workspace_sql
    assert "workspaces.archived_at IS NULL" in workspace_sql
    assert "projects.user_id" in project_sql
    assert "projects.archived_at IS NULL" in project_sql
    assert "workspaces.user_id" in project_sql
    assert "workspaces.archived_at IS NULL" in project_sql


def test_workspace_and_project_writes_append_scoped_events() -> None:
    async def run() -> None:
        session = _FakeSession()
        user_id = uuid.uuid4()
        workspace = await create_workspace(
            session,
            user_id=user_id,
            name="产品实验室",
            description="验证下一条产品线索",
            workspace_type="work",
            icon="P",
        )

        assert workspace.user_id == user_id
        assert isinstance(session.items[1], WorkspaceEvent)
        workspace_event = session.items[1]
        assert isinstance(workspace_event, WorkspaceEvent)
        assert workspace_event.event_type == "workspace_created"
        assert workspace_event.workspace_id == workspace.id

        project = await create_project(
            session,
            workspace=workspace,
            name="GrowthPilot 工作台",
            description="完成真实数据边界",
            status="active",
            priority="high",
            progress=20,
            next_action="完成 Workspace API",
            due_at=None,
        )
        assert project.workspace_id == workspace.id
        project_event = session.items[-1]
        assert isinstance(project_event, WorkspaceEvent)
        assert project_event.event_type == "project_created"
        assert project_event.project_id == project.id

        await update_project(session, project, {"progress": 40, "next_action": "补齐测试"})
        updated_event = session.items[-1]
        assert isinstance(updated_event, WorkspaceEvent)
        assert updated_event.event_type == "project_updated"
        assert updated_event.payload == {"progress": 40, "next_action": "补齐测试"}

        await update_project(session, project, {"next_action": None})
        cleared_event = session.items[-1]
        assert isinstance(cleared_event, WorkspaceEvent)
        assert cleared_event.payload == {"next_action": None}

        await archive_project(session, project)
        await archive_workspace(session, workspace)
        assert project.archived_at is not None
        assert workspace.archived_at is not None
        event_types = [item.event_type for item in session.items if isinstance(item, WorkspaceEvent)]
        assert event_types == [
            "workspace_created",
            "project_created",
            "project_updated",
            "project_updated",
            "project_archived",
            "workspace_archived",
        ]

    asyncio.run(run())
