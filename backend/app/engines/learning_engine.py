"""Commands and scoped queries for Workspace Learning Items."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.workspace_engine import append_event
from app.models.workspace import Workspace
from app.models.workspace_learning_item import WorkspaceLearningItem


def learning_item_query(user_id: uuid.UUID, item_id: uuid.UUID | None = None):
    query = (
        select(WorkspaceLearningItem)
        .join(Workspace, WorkspaceLearningItem.workspace_id == Workspace.id)
        .where(
            WorkspaceLearningItem.user_id == user_id,
            WorkspaceLearningItem.archived_at.is_(None),
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )
    if item_id is not None:
        query = query.where(WorkspaceLearningItem.id == item_id)
    return query


async def get_learning_item(
    session: AsyncSession, user_id: uuid.UUID, item_id: uuid.UUID
) -> WorkspaceLearningItem | None:
    result = await session.execute(learning_item_query(user_id, item_id))
    return result.scalar_one_or_none()


async def list_learning_items(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> list[WorkspaceLearningItem]:
    result = await session.execute(
        learning_item_query(user_id)
        .where(WorkspaceLearningItem.workspace_id == workspace_id)
        .order_by(WorkspaceLearningItem.progress_updated_at.desc().nullslast(), WorkspaceLearningItem.created_at.desc())
    )
    return list(result.scalars().all())


async def create_learning_item(
    session: AsyncSession, *, workspace: Workspace, values: dict[str, Any]
) -> WorkspaceLearningItem:
    item = WorkspaceLearningItem(
        id=uuid.uuid4(),
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        **values,
    )
    session.add(item)
    await append_event(
        session,
        user_id=item.user_id,
        workspace_id=item.workspace_id,
        project_id=item.project_id,
        event_type="learning_item_created",
        source_type="learning",
        source_id=item.id,
        payload={"title": item.title, "kind": item.kind, "goal_id": str(item.goal_id) if item.goal_id else None},
    )
    return item


async def update_learning_progress(
    session: AsyncSession, item: WorkspaceLearningItem, progress: int
) -> WorkspaceLearningItem:
    if item.progress == progress:
        return item
    item.progress = progress
    item.status = "completed" if progress >= 100 else "in_progress" if progress > 0 else "queued"
    item.progress_updated_at = datetime.now(UTC)
    await append_event(
        session,
        user_id=item.user_id,
        workspace_id=item.workspace_id,
        project_id=item.project_id,
        event_type="learning_progress_updated",
        source_type="learning",
        source_id=item.id,
        payload={"title": item.title, "progress": item.progress, "status": item.status},
    )
    return item
