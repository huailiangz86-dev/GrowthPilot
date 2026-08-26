"""Commands and scoped queries for Workspace Tasks."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.workspace_engine import append_event
from app.models.task import Task
from app.models.workspace import Workspace


def task_query(user_id: uuid.UUID, task_id: uuid.UUID):
    return (
        select(Task)
        .join(Workspace, Task.workspace_id == Workspace.id)
        .where(
            Task.id == task_id,
            Task.user_id == user_id,
            Task.deleted_at.is_(None),
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )


async def get_task(session: AsyncSession, user_id: uuid.UUID, task_id: uuid.UUID) -> Task | None:
    result = await session.execute(task_query(user_id, task_id))
    return result.scalar_one_or_none()


async def create_task(session: AsyncSession, *, workspace: Workspace, values: dict[str, Any]) -> Task:
    task = Task(id=uuid.uuid4(), user_id=workspace.user_id, workspace_id=workspace.id, **values)
    session.add(task)
    await append_event(
        session,
        user_id=task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        event_type="task_created",
        source_type="task",
        source_id=task.id,
        payload={"title": task.title, "priority": task.priority, "status": task.status},
    )
    return task


async def update_task(session: AsyncSession, task: Task, changes: dict[str, Any]) -> Task:
    for field, value in changes.items():
        setattr(task, field, value)
    await append_event(
        session,
        user_id=task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        event_type="task_updated",
        source_type="task",
        source_id=task.id,
        payload={key: value.isoformat() if isinstance(value, datetime) else value for key, value in changes.items()},
    )
    return task


async def complete_task(session: AsyncSession, task: Task) -> Task:
    if task.status == "done":
        return task
    task.status = "done"
    task.completed_at = datetime.now(UTC)
    task.defer_reason = None
    await append_event(
        session,
        user_id=task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        event_type="task_completed",
        source_type="task",
        source_id=task.id,
        payload={"title": task.title},
    )
    return task


async def defer_task(
    session: AsyncSession,
    task: Task,
    *,
    reason: str,
    due_at: datetime | None,
) -> Task:
    task.status = "todo"
    task.defer_reason = reason
    task.due_at = due_at
    await append_event(
        session,
        user_id=task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        event_type="task_deferred",
        source_type="task",
        source_id=task.id,
        payload={"reason": reason, "due_at": due_at.isoformat() if due_at else None},
    )
    return task


async def block_task(session: AsyncSession, task: Task, *, reason: str) -> Task:
    task.status = "blocked"
    task.defer_reason = reason
    await append_event(
        session,
        user_id=task.user_id,
        workspace_id=task.workspace_id,
        project_id=task.project_id,
        event_type="task_blocked",
        source_type="task",
        source_id=task.id,
        payload={"reason": reason},
    )
    return task
