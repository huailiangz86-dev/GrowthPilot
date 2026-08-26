"""Commands and scoped queries for the Workspace-first domain."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.workspace import Project, Workspace, WorkspaceEvent


def workspace_query(user_id: uuid.UUID, workspace_id: uuid.UUID, *, include_archived: bool = False):
    query = select(Workspace).where(Workspace.id == workspace_id, Workspace.user_id == user_id)
    if not include_archived:
        query = query.where(Workspace.archived_at.is_(None))
    return query


def project_query(user_id: uuid.UUID, project_id: uuid.UUID, *, include_archived: bool = False):
    query = (
        select(Project)
        .join(Workspace, Project.workspace_id == Workspace.id)
        .where(
            Project.id == project_id,
            Project.user_id == user_id,
            Workspace.user_id == user_id,
        )
    )
    if not include_archived:
        query = query.where(Project.archived_at.is_(None), Workspace.archived_at.is_(None))
    return query


async def get_workspace(
    session: AsyncSession,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    *,
    include_archived: bool = False,
) -> Workspace | None:
    result = await session.execute(workspace_query(user_id, workspace_id, include_archived=include_archived))
    return result.scalar_one_or_none()


async def get_project(
    session: AsyncSession,
    user_id: uuid.UUID,
    project_id: uuid.UUID,
    *,
    include_archived: bool = False,
) -> Project | None:
    result = await session.execute(project_query(user_id, project_id, include_archived=include_archived))
    return result.scalar_one_or_none()


async def append_event(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID | None,
    event_type: str,
    source_type: str,
    source_id: uuid.UUID | None,
    payload: dict[str, Any],
    project_id: uuid.UUID | None = None,
) -> WorkspaceEvent:
    event = WorkspaceEvent(
        id=uuid.uuid4(),
        user_id=user_id,
        workspace_id=workspace_id,
        project_id=project_id,
        event_type=event_type,
        source_type=source_type,
        source_id=source_id,
        payload=payload,
    )
    session.add(event)
    return event


async def create_workspace(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    name: str,
    description: str,
    workspace_type: str,
    icon: str | None,
) -> Workspace:
    workspace = Workspace(
        id=uuid.uuid4(),
        user_id=user_id,
        name=name,
        description=description,
        workspace_type=workspace_type,
        icon=icon,
    )
    session.add(workspace)
    await append_event(
        session,
        user_id=user_id,
        workspace_id=workspace.id,
        event_type="workspace_created",
        source_type="workspace",
        source_id=workspace.id,
        payload={"name": workspace.name, "workspace_type": workspace.workspace_type},
    )
    return workspace


async def update_workspace(
    session: AsyncSession,
    workspace: Workspace,
    changes: dict[str, Any],
) -> Workspace:
    for field, value in changes.items():
        setattr(workspace, field, value)
    await append_event(
        session,
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        event_type="workspace_updated",
        source_type="workspace",
        source_id=workspace.id,
        payload=changes,
    )
    return workspace


async def archive_workspace(session: AsyncSession, workspace: Workspace) -> Workspace:
    workspace.status = "archived"
    workspace.archived_at = datetime.now(UTC)
    await append_event(
        session,
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        event_type="workspace_archived",
        source_type="workspace",
        source_id=workspace.id,
        payload={"name": workspace.name},
    )
    return workspace


async def create_project(
    session: AsyncSession,
    *,
    workspace: Workspace,
    name: str,
    description: str,
    status: str,
    priority: str,
    progress: int,
    next_action: str | None,
    due_at: datetime | None,
) -> Project:
    project = Project(
        id=uuid.uuid4(),
        workspace_id=workspace.id,
        user_id=workspace.user_id,
        name=name,
        description=description,
        status=status,
        priority=priority,
        progress=progress,
        next_action=next_action,
        due_at=due_at,
        last_activity_at=datetime.now(UTC),
    )
    session.add(project)
    await append_event(
        session,
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        project_id=project.id,
        event_type="project_created",
        source_type="project",
        source_id=project.id,
        payload={"name": project.name, "status": project.status, "priority": project.priority},
    )
    return project


async def update_project(
    session: AsyncSession,
    project: Project,
    changes: dict[str, Any],
) -> Project:
    for field, value in changes.items():
        setattr(project, field, value)
    project.last_activity_at = datetime.now(UTC)
    await append_event(
        session,
        user_id=project.user_id,
        workspace_id=project.workspace_id,
        project_id=project.id,
        event_type="project_updated",
        source_type="project",
        source_id=project.id,
        payload={
            key: value.isoformat() if isinstance(value, datetime) else value
            for key, value in changes.items()
        },
    )
    return project


async def archive_project(session: AsyncSession, project: Project) -> Project:
    project.status = "archived"
    project.archived_at = datetime.now(UTC)
    project.last_activity_at = project.archived_at
    await append_event(
        session,
        user_id=project.user_id,
        workspace_id=project.workspace_id,
        project_id=project.id,
        event_type="project_archived",
        source_type="project",
        source_id=project.id,
        payload={"name": project.name},
    )
    return project
