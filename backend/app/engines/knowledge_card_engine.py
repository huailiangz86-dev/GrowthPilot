"""Commands and scoped queries for Workspace Knowledge Cards."""

import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.engines.learning_engine import create_learning_item
from app.engines.workspace_engine import append_event
from app.models.workspace import Workspace
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard


def knowledge_card_query(user_id: uuid.UUID, card_id: uuid.UUID | None = None):
    query = (
        select(WorkspaceKnowledgeCard)
        .join(Workspace, WorkspaceKnowledgeCard.workspace_id == Workspace.id)
        .where(
            WorkspaceKnowledgeCard.user_id == user_id,
            WorkspaceKnowledgeCard.archived_at.is_(None),
            Workspace.user_id == user_id,
            Workspace.archived_at.is_(None),
        )
    )
    if card_id is not None:
        query = query.where(WorkspaceKnowledgeCard.id == card_id)
    return query


async def get_knowledge_card(
    session: AsyncSession, user_id: uuid.UUID, card_id: uuid.UUID
) -> WorkspaceKnowledgeCard | None:
    result = await session.execute(knowledge_card_query(user_id, card_id))
    return result.scalar_one_or_none()


async def list_knowledge_cards(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID
) -> list[WorkspaceKnowledgeCard]:
    result = await session.execute(
        knowledge_card_query(user_id)
        .where(WorkspaceKnowledgeCard.workspace_id == workspace_id)
        .order_by(WorkspaceKnowledgeCard.updated_at.desc())
    )
    return list(result.scalars().all())


def knowledge_card_citation_query(
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    query_text: str,
):
    query = knowledge_card_query(user_id).where(
        WorkspaceKnowledgeCard.workspace_id == workspace_id,
        WorkspaceKnowledgeCard.source_type == "text",
        WorkspaceKnowledgeCard.ai_status == "confirmed",
        WorkspaceKnowledgeCard.ai_summary.is_not(None),
    )
    if query_text:
        term = f"%{query_text}%"
        query = query.where(
            or_(
                WorkspaceKnowledgeCard.title.ilike(term),
                WorkspaceKnowledgeCard.ai_summary.ilike(term),
                WorkspaceKnowledgeCard.content.ilike(term),
            )
        )
    return query.order_by(WorkspaceKnowledgeCard.updated_at.desc()).limit(12)


async def list_knowledge_card_citations(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    query_text: str,
) -> list[WorkspaceKnowledgeCard]:
    query = knowledge_card_citation_query(user_id, workspace_id, query_text)
    result = await session.execute(query)
    return list(result.scalars().all())


async def create_knowledge_card(
    session: AsyncSession, *, workspace: Workspace, values: dict[str, Any]
) -> WorkspaceKnowledgeCard:
    card = WorkspaceKnowledgeCard(
        id=uuid.uuid4(),
        user_id=workspace.user_id,
        workspace_id=workspace.id,
        **values,
    )
    session.add(card)
    await append_event(
        session,
        user_id=card.user_id,
        workspace_id=card.workspace_id,
        project_id=card.project_id,
        event_type="knowledge_card_captured",
        source_type="knowledge_card",
        source_id=card.id,
        payload={
            "title": card.title,
            "source_type": card.source_type,
            "source_url": card.source_url,
        },
    )
    return card


async def add_knowledge_card_to_learning(
    session: AsyncSession, *, card: WorkspaceKnowledgeCard, workspace: Workspace
):
    if card.learning_item_id:
        from app.models.workspace_learning_item import WorkspaceLearningItem

        existing = await session.get(WorkspaceLearningItem, card.learning_item_id)
        if existing is not None and existing.user_id == card.user_id:
            return card, existing

    learning_item = await create_learning_item(
        session,
        workspace=workspace,
        values={
            "project_id": card.project_id,
            "goal_id": card.goal_id,
            "title": card.title,
            "summary": card.content or card.source_url or "",
            "kind": "article" if card.source_type == "url" else "note",
            "duration_minutes": None,
            "source_url": card.source_url,
        },
    )
    card.learning_item_id = learning_item.id
    card.status = "queued"
    await append_event(
        session,
        user_id=card.user_id,
        workspace_id=card.workspace_id,
        project_id=card.project_id,
        event_type="knowledge_card_queued",
        source_type="knowledge_card",
        source_id=card.id,
        payload={"title": card.title, "learning_item_id": str(learning_item.id)},
    )
    return card, learning_item


async def confirm_knowledge_card_summary(
    session: AsyncSession,
    *,
    card: WorkspaceKnowledgeCard,
    summary: str,
    concepts: list[str],
    tags: list[str],
) -> WorkspaceKnowledgeCard:
    """Persist only the user's confirmed summary draft, never replace the source."""
    card.ai_summary = summary
    card.ai_concepts = concepts
    card.ai_tags = tags
    card.ai_status = "confirmed"
    card.ai_processed_at = datetime.now(UTC)
    await append_event(
        session,
        user_id=card.user_id,
        workspace_id=card.workspace_id,
        project_id=card.project_id,
        event_type="knowledge_card_summary_confirmed",
        source_type="knowledge_card",
        source_id=card.id,
        payload={
            "summary": summary,
            "concept_count": len(concepts),
            "tag_count": len(tags),
            "source_reference": {"type": "knowledge_card_content", "card_id": str(card.id)},
        },
    )
    return card


async def update_knowledge_card_context_links(
    session: AsyncSession,
    *,
    card: WorkspaceKnowledgeCard,
    goal_id: uuid.UUID | None,
    task_id: uuid.UUID | None,
) -> WorkspaceKnowledgeCard:
    """Update only explicit user-selected context links on a confirmed card."""
    card.goal_id = goal_id
    card.task_id = task_id
    await append_event(
        session,
        user_id=card.user_id,
        workspace_id=card.workspace_id,
        project_id=card.project_id,
        event_type="knowledge_card_context_linked",
        source_type="knowledge_card",
        source_id=card.id,
        payload={
            "goal_id": str(goal_id) if goal_id else None,
            "task_id": str(task_id) if task_id else None,
            "source_reference": {"type": "knowledge_card_content", "card_id": str(card.id)},
        },
    )
    return card
