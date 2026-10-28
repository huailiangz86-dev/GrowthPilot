"""Commands and scoped queries for Workspace Reflections."""

import uuid
from datetime import date
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import AppException
from app.engines.workspace_engine import append_event
from app.models.workspace import Workspace
from app.models.workspace_reflection import WorkspaceReflection


def reflection_query(user_id: uuid.UUID, reflection_id: uuid.UUID | None = None):
    query = (
        select(WorkspaceReflection)
        .join(Workspace, WorkspaceReflection.workspace_id == Workspace.id)
        .where(
            WorkspaceReflection.user_id == user_id,
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )
    if reflection_id is not None:
        query = query.where(WorkspaceReflection.id == reflection_id)
    return query


async def get_reflection(session: AsyncSession, user_id: uuid.UUID, reflection_id: uuid.UUID) -> WorkspaceReflection | None:
    result = await session.execute(reflection_query(user_id, reflection_id))
    return result.scalar_one_or_none()


async def list_workspace_reflections(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> list[WorkspaceReflection]:
    result = await session.execute(
        reflection_query(user_id).where(WorkspaceReflection.workspace_id == workspace_id).order_by(
            WorkspaceReflection.reflection_date.desc(), WorkspaceReflection.created_at.desc()
        )
    )
    return list(result.scalars().all())


def reflection_key(reflection_type: str, reflection_date: date) -> str | None:
    return f"{reflection_type}:{reflection_date.isoformat()}" if reflection_type in {"morning", "evening"} else None


def validate_capture_replay(existing: WorkspaceReflection, values: dict[str, Any]) -> None:
    immutable_fields = (
        "content", "micro_type", "micro_status", "project_id", "goal_id", "task_id",
        "energy", "intention", "completion", "wins", "friction", "adjustment", "mood",
    )
    if any(getattr(existing, field) != values.get(field) for field in immutable_fields):
        raise AppException("CAPTURE_REQUEST_CONFLICT", "同一提交标识不能用于不同记录，请保留原文并创建新记录", 409)


async def save_reflection(
    session: AsyncSession,
    *,
    workspace: Workspace,
    values: dict[str, Any],
    client_request_id: uuid.UUID | None = None,
) -> WorkspaceReflection:
    is_retryable_capture = values["reflection_type"] == "micro" and client_request_id is not None
    key = client_request_id.hex if is_retryable_capture else reflection_key(values["reflection_type"], values["reflection_date"])
    if is_retryable_capture:
        # Serialize identical first submissions, including requests from different tabs.
        await session.execute(select(Workspace.id).where(
            Workspace.id == workspace.id, Workspace.user_id == workspace.user_id,
        ).with_for_update())
    existing = None
    if key:
        result = await session.execute(
            select(WorkspaceReflection).where(
                WorkspaceReflection.user_id == workspace.user_id,
                WorkspaceReflection.workspace_id == workspace.id,
                WorkspaceReflection.reflection_key == key,
            )
        )
        existing = result.scalar_one_or_none()
    if existing is not None and is_retryable_capture:
        validate_capture_replay(existing, values)
        # A lost response can be replayed without rewriting the fact or appending another event.
        return existing
    if existing is None:
        reflection = WorkspaceReflection(
            id=uuid.uuid4(),
            user_id=workspace.user_id,
            workspace_id=workspace.id,
            reflection_key=key,
            **values,
        )
        session.add(reflection)
        event_type = "reflection_created"
    else:
        reflection = existing
        for field, value in values.items():
            setattr(reflection, field, value)
        event_type = "reflection_updated"
    await append_event(
        session,
        user_id=reflection.user_id,
        workspace_id=reflection.workspace_id,
        project_id=reflection.project_id,
        event_type=event_type,
        source_type="reflection",
        source_id=reflection.id,
        payload={
            "reflection_type": reflection.reflection_type,
            "reflection_date": reflection.reflection_date.isoformat(),
            "content": reflection.content,
            "energy": reflection.energy,
            "completion": reflection.completion,
        },
    )
    return reflection
