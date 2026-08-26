"""Workspace Knowledge Card API."""

import uuid
from datetime import UTC, datetime
from typing import Literal
from urllib.parse import urlparse

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.learning_items import LearningItemResponse, _response as learning_item_response
from app.ai.llm_service import structured_output
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.knowledge_card_engine import (
    add_knowledge_card_to_learning,
    confirm_knowledge_card_summary,
    create_knowledge_card,
    get_knowledge_card,
    list_knowledge_card_citations,
    list_knowledge_cards,
    update_knowledge_card_context_links,
)
from app.engines.workspace_engine import get_project, get_workspace
from app.models.goal import Goal
from app.models.task import Task
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/knowledge-cards", tags=["knowledge-cards"])
SourceType = Literal["text", "url"]
logger = structlog.get_logger()


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


def _title_for(source_type: SourceType, title: str, content: str | None, source_url: str | None) -> str:
    if title:
        return title
    if source_type == "url" and source_url:
        return urlparse(source_url).netloc
    return (content or "").splitlines()[0][:240]


class KnowledgeCardCreateRequest(BaseModel):
    workspace_id: str
    title: str = Field(default="", max_length=240)
    source_type: SourceType
    source_url: str | None = Field(default=None, max_length=2000)
    content: str | None = Field(default=None, max_length=8000)
    project_id: str | None = None
    goal_id: str | None = None

    @field_validator("title", "source_url", "content")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() if value else value

    @model_validator(mode="after")
    def validate_source(self) -> "KnowledgeCardCreateRequest":
        if self.source_type == "text" and not self.content:
            raise ValueError("文本捕获需要内容")
        if self.source_type == "url":
            parsed = urlparse(self.source_url or "")
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("网页地址必须以 http 或 https 开头")
        if not _title_for(self.source_type, self.title or "", self.content, self.source_url):
            raise ValueError("知识卡片需要标题或可用原始内容")
        return self


class KnowledgeCardResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    goal_id: str | None
    task_id: str | None
    learning_item_id: str | None
    title: str
    source_type: str
    source_url: str | None
    content: str | None
    status: str
    ai_status: str
    ai_summary: str | None
    ai_concepts: list[str]
    ai_tags: list[str]
    ai_processed_at: str | None
    created_at: str
    updated_at: str


class KnowledgeCardQueueResponse(BaseModel):
    card: KnowledgeCardResponse
    learning_item: LearningItemResponse


class KnowledgeCardSummaryConfirmRequest(BaseModel):
    summary: str = Field(min_length=1, max_length=4000)
    concepts: list[str] = Field(default_factory=list, max_length=12)
    tags: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("summary")
    @classmethod
    def summary_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("摘要不能为空")
        return normalized

    @field_validator("concepts", "tags")
    @classmethod
    def normalize_terms(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            term = value.strip()
            if term and term not in normalized:
                normalized.append(term[:80])
        return normalized


class KnowledgeCardSourceReference(BaseModel):
    type: Literal["knowledge_card_content"]
    card_id: str
    title: str


class KnowledgeCardSummarySuggestion(KnowledgeCardSummaryConfirmRequest):
    source_reference: KnowledgeCardSourceReference


class KnowledgeCardSummaryPreviewResponse(BaseModel):
    card: KnowledgeCardResponse
    suggestion: KnowledgeCardSummarySuggestion | None
    ai_generated: bool


class KnowledgeCardContextLinkRequest(BaseModel):
    goal_id: str | None = None
    task_id: str | None = None

    @model_validator(mode="after")
    def has_changes(self) -> "KnowledgeCardContextLinkRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一个需要修改的关联")
        return self


class KnowledgeCardCitationResponse(BaseModel):
    id: str
    workspace_id: str
    title: str
    excerpt: str
    summary: str
    concepts: list[str]
    tags: list[str]
    goal_id: str | None
    task_id: str | None
    source_reference: KnowledgeCardSourceReference


def _response(card: WorkspaceKnowledgeCard) -> KnowledgeCardResponse:
    return KnowledgeCardResponse(
        id=str(card.id),
        workspace_id=str(card.workspace_id),
        project_id=str(card.project_id) if card.project_id else None,
        goal_id=str(card.goal_id) if card.goal_id else None,
        task_id=str(card.task_id) if card.task_id else None,
        learning_item_id=str(card.learning_item_id) if card.learning_item_id else None,
        title=card.title,
        source_type=card.source_type,
        source_url=card.source_url,
        content=card.content,
        status=card.status,
        ai_status=card.ai_status,
        ai_summary=card.ai_summary,
        ai_concepts=card.ai_concepts or [],
        ai_tags=card.ai_tags or [],
        ai_processed_at=card.ai_processed_at.isoformat() if card.ai_processed_at else None,
        created_at=card.created_at.isoformat(),
        updated_at=card.updated_at.isoformat(),
    )


async def _links(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, project_value: str | None, goal_value: str | None
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    project_id = None
    if project_value:
        project_id = _uuid(project_value, "Project")
        project = await get_project(session, user_id, project_id)
        if project is None or project.workspace_id != workspace_id:
            raise ValidationException("项目必须属于当前 Workspace")
    goal_id = None
    if goal_value:
        goal_id = _uuid(goal_value, "Goal")
        goal = (await session.execute(select(Goal).where(
            Goal.id == goal_id,
            Goal.user_id == user_id,
            Goal.workspace_id == workspace_id,
            Goal.archived_at.is_(None),
        ))).scalar_one_or_none()
        if goal is None:
            raise ValidationException("目标必须属于当前 Workspace")
    return project_id, goal_id


async def _context_link_values(
    session: AsyncSession,
    *,
    card: WorkspaceKnowledgeCard,
    user_id: uuid.UUID,
    payload: KnowledgeCardContextLinkRequest,
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    goal_id = card.goal_id
    if "goal_id" in payload.model_fields_set:
        goal_id = None
        if payload.goal_id:
            candidate = _uuid(payload.goal_id, "Goal")
            result = await session.execute(
                select(Goal).where(
                    Goal.id == candidate,
                    Goal.user_id == user_id,
                    Goal.workspace_id == card.workspace_id,
                    Goal.archived_at.is_(None),
                )
            )
            if result.scalar_one_or_none() is None:
                raise ValidationException("目标必须属于当前 Workspace")
            goal_id = candidate

    task_id = card.task_id
    if "task_id" in payload.model_fields_set:
        task_id = None
        if payload.task_id:
            candidate = _uuid(payload.task_id, "Task")
            result = await session.execute(
                select(Task).where(
                    Task.id == candidate,
                    Task.user_id == user_id,
                    Task.workspace_id == card.workspace_id,
                    Task.deleted_at.is_(None),
                )
            )
            if result.scalar_one_or_none() is None:
                raise ValidationException("任务必须属于当前 Workspace")
            task_id = candidate
    return goal_id, task_id


def _citation_response(card: WorkspaceKnowledgeCard) -> KnowledgeCardCitationResponse:
    excerpt = (card.ai_summary or card.content or "").strip().replace("\n", " ")
    if len(excerpt) > 180:
        excerpt = f"{excerpt[:177]}..."
    return KnowledgeCardCitationResponse(
        id=str(card.id),
        workspace_id=str(card.workspace_id),
        title=card.title,
        excerpt=excerpt,
        summary=card.ai_summary or "",
        concepts=card.ai_concepts or [],
        tags=card.ai_tags or [],
        goal_id=str(card.goal_id) if card.goal_id else None,
        task_id=str(card.task_id) if card.task_id else None,
        source_reference=KnowledgeCardSourceReference(
            type="knowledge_card_content",
            card_id=str(card.id),
            title=card.title,
        ),
    )


@router.post("", response_model=ApiResponse[KnowledgeCardResponse])
async def create_knowledge_card_endpoint(
    payload: KnowledgeCardCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KnowledgeCardResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    project_id, goal_id = await _links(session, uid, workspace.id, payload.project_id, payload.goal_id)
    card = await create_knowledge_card(
        session,
        workspace=workspace,
        values={
            "project_id": project_id,
            "goal_id": goal_id,
            "title": _title_for(payload.source_type, payload.title or "", payload.content, payload.source_url),
            "source_type": payload.source_type,
            "source_url": payload.source_url,
            "content": payload.content,
            "status": "captured",
        },
    )
    await session.commit()
    await session.refresh(card)
    return ApiResponse(success=True, data=_response(card))


@router.get("", response_model=ApiResponse[list[KnowledgeCardResponse]])
async def list_knowledge_cards_endpoint(
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[KnowledgeCardResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    cards = await list_knowledge_cards(session, uid, workspace.id)
    return ApiResponse(success=True, data=[_response(card) for card in cards])


@router.get("/citations", response_model=ApiResponse[list[KnowledgeCardCitationResponse]])
async def list_knowledge_card_citations_endpoint(
    workspace_id: str,
    q: str = "",
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[KnowledgeCardCitationResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    cards = await list_knowledge_card_citations(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        query_text=q.strip()[:240],
    )
    return ApiResponse(success=True, data=[_citation_response(card) for card in cards])


@router.post("/{card_id}/add-to-learning", response_model=ApiResponse[KnowledgeCardQueueResponse])
async def add_to_learning_endpoint(
    card_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KnowledgeCardQueueResponse]:
    uid = _uuid(user_id, "User")
    card = await get_knowledge_card(session, uid, _uuid(card_id, "KnowledgeCard"))
    if card is None:
        raise NotFoundException("KnowledgeCard")
    workspace = await get_workspace(session, uid, card.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    queued_card, learning_item = await add_knowledge_card_to_learning(session, card=card, workspace=workspace)
    await session.commit()
    await session.refresh(queued_card)
    await session.refresh(learning_item)
    return ApiResponse(
        success=True,
        data=KnowledgeCardQueueResponse(card=_response(queued_card), learning_item=learning_item_response(learning_item)),
    )


def _summary_suggestion(card: WorkspaceKnowledgeCard, result: object) -> KnowledgeCardSummarySuggestion:
    if not isinstance(result, dict):
        raise ValueError("AI 摘要结果不是对象")
    draft = KnowledgeCardSummaryConfirmRequest.model_validate(
        {
            "summary": result.get("summary", ""),
            "concepts": result.get("concepts", []),
            "tags": result.get("tags", []),
        }
    )
    return KnowledgeCardSummarySuggestion(
        **draft.model_dump(),
        source_reference=KnowledgeCardSourceReference(
            type="knowledge_card_content",
            card_id=str(card.id),
            title=card.title,
        ),
    )


@router.post("/{card_id}/summary-preview", response_model=ApiResponse[KnowledgeCardSummaryPreviewResponse])
async def preview_knowledge_card_summary_endpoint(
    card_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KnowledgeCardSummaryPreviewResponse]:
    """Generate an editable AI draft without changing the source or confirmed fields."""
    uid = _uuid(user_id, "User")
    card = await get_knowledge_card(session, uid, _uuid(card_id, "KnowledgeCard"))
    if card is None:
        raise NotFoundException("KnowledgeCard")
    if card.source_type != "text" or not card.content:
        raise ValidationException("网页来源需完成抓取后才能生成摘要")

    try:
        result = await structured_output(
            session=session,
            user_id=user_id,
            purpose="knowledge_summary",
            variables={"title": card.title, "source_content": card.content},
        )
        suggestion = _summary_suggestion(card, result)
        card.ai_status = "preview_ready"
        await session.commit()
        await session.refresh(card)
        return ApiResponse(
            success=True,
            data=KnowledgeCardSummaryPreviewResponse(card=_response(card), suggestion=suggestion, ai_generated=True),
        )
    except Exception as exc:
        # AI must never make an already captured source unavailable.
        logger.warning("knowledge_card_summary_failed", card_id=str(card.id), error=str(exc)[:200])
        card.ai_status = "failed"
        card.ai_processed_at = datetime.now(UTC)
        await session.commit()
        await session.refresh(card)
        return ApiResponse(
            success=True,
            data=KnowledgeCardSummaryPreviewResponse(card=_response(card), suggestion=None, ai_generated=False),
        )


@router.post("/{card_id}/summary", response_model=ApiResponse[KnowledgeCardResponse])
async def confirm_knowledge_card_summary_endpoint(
    card_id: str,
    payload: KnowledgeCardSummaryConfirmRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KnowledgeCardResponse]:
    """Persist the user-reviewed AI draft and its source trace."""
    uid = _uuid(user_id, "User")
    card = await get_knowledge_card(session, uid, _uuid(card_id, "KnowledgeCard"))
    if card is None:
        raise NotFoundException("KnowledgeCard")
    await confirm_knowledge_card_summary(
        session,
        card=card,
        summary=payload.summary,
        concepts=payload.concepts,
        tags=payload.tags,
    )
    await session.commit()
    await session.refresh(card)
    return ApiResponse(success=True, data=_response(card))


@router.post("/{card_id}/context-links", response_model=ApiResponse[KnowledgeCardResponse])
async def update_knowledge_card_context_links_endpoint(
    card_id: str,
    payload: KnowledgeCardContextLinkRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[KnowledgeCardResponse]:
    uid = _uuid(user_id, "User")
    card = await get_knowledge_card(session, uid, _uuid(card_id, "KnowledgeCard"))
    if card is None:
        raise NotFoundException("KnowledgeCard")
    if card.source_type != "text" or card.ai_status != "confirmed" or not card.ai_summary:
        raise ValidationException("请先确认文本卡片的摘要后再关联行动")
    goal_id, task_id = await _context_link_values(session, card=card, user_id=uid, payload=payload)
    await update_knowledge_card_context_links(session, card=card, goal_id=goal_id, task_id=task_id)
    await session.commit()
    await session.refresh(card)
    return ApiResponse(success=True, data=_response(card))
