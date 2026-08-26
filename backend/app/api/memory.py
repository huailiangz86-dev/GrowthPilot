"""Personal Memory API for the Web-first growth workspace."""

import uuid
from datetime import UTC, date, datetime, time, timedelta, timezone
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import Text, cast, case, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.memory_engine import create_from_source
from app.engines.privacy_scope import memory_source_allowed
from app.models.memory import DERIVED_STATUS_STALE, MemoryEntry
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/memory", tags=["memory"])


class MemoryCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    memory_type: str = Field(default="semantic", max_length=24)
    tags: list[str] = Field(default_factory=list, max_length=12)
    importance: int = Field(default=3, ge=1, le=5)
    occurred_at: datetime | None = None

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("content cannot be empty")
        return normalized

    @field_validator("memory_type")
    @classmethod
    def normalize_memory_type(cls, value: str) -> str:
        normalized = value.strip().lower()
        if not normalized:
            raise ValueError("memory_type cannot be empty")
        return normalized

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            tag = value.strip()[:40]
            if tag and tag not in normalized:
                normalized.append(tag)
        return normalized


class MemoryUpdateRequest(BaseModel):
    content: str | None = Field(default=None, max_length=4000)
    tags: list[str] | None = Field(default=None, max_length=12)
    occurred_at: datetime | None = None
    importance: int | None = Field(default=None, ge=1, le=5)

    @field_validator("content")
    @classmethod
    def validate_optional_content(cls, value: str | None) -> str | None:
        if value is None:
            return None
        normalized = value.strip()
        if not normalized:
            raise ValueError("content cannot be empty")
        return normalized

    @field_validator("tags")
    @classmethod
    def normalize_optional_tags(cls, values: list[str] | None) -> list[str] | None:
        if values is None:
            return None
        normalized: list[str] = []
        for value in values:
            tag = value.strip()[:40]
            if tag and tag not in normalized:
                normalized.append(tag)
        return normalized

    @model_validator(mode="after")
    def validate_has_changes(self) -> "MemoryUpdateRequest":
        if all(value is None for value in (self.content, self.tags, self.occurred_at, self.importance)):
            raise ValueError("至少提供一项需要修改的内容")
        return self


class MemoryResponse(BaseModel):
    id: str
    content: str
    summary: str | None
    memory_type: str
    source: str
    tags: list[str]
    derived_status: dict[str, str]
    importance: int
    confidence: float
    occurred_at: str
    created_at: str
    updated_at: str


class MemoryListResponse(BaseModel):
    items: list[MemoryResponse]
    total: int


MemoryPeriod = Literal["all", "today", "week", "month", "custom"]


def _to_response(memory: MemoryEntry) -> MemoryResponse:
    return MemoryResponse(
        id=str(memory.id),
        content=memory.content,
        summary=memory.summary,
        memory_type=memory.memory_type,
        source=memory.source,
        tags=[str(tag) for tag in (memory.tags or [])],
        derived_status={str(key): str(value) for key, value in (memory.derived_status or {}).items()},
        importance=memory.importance,
        confidence=memory.confidence,
        occurred_at=memory.occurred_at.isoformat(),
        created_at=memory.created_at.isoformat(),
        updated_at=memory.updated_at.isoformat(),
    )


def _parse_user_id(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError as exc:
        raise ValidationException("当前登录状态无效，请重新登录") from exc


def _parse_memory_id(memory_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(memory_id)
    except ValueError as exc:
        raise NotFoundException("Memory") from exc


def _resolve_memory_window(
    period: MemoryPeriod,
    start_date: date | None,
    end_date: date | None,
    *,
    now: datetime | None = None,
    timezone_offset_minutes: int = 0,
) -> tuple[datetime | None, datetime | None]:
    """Resolve calendar filters into a half-open UTC datetime interval."""
    if period == "all":
        if start_date or end_date:
            raise ValueError("只有自定义时间范围可以提供日期")
        return None, None

    if period == "custom":
        if start_date is None or end_date is None:
            raise ValueError("自定义时间范围需要开始日期和结束日期")
        if start_date > end_date:
            raise ValueError("自定义时间范围的开始日期不能晚于结束日期")
        return (
            _date_start(start_date, timezone_offset_minutes),
            _date_start(end_date + timedelta(days=1), timezone_offset_minutes),
        )

    if start_date or end_date:
        raise ValueError("只有自定义时间范围可以提供日期")

    current = now or datetime.now(UTC)
    user_timezone = timezone(timedelta(minutes=timezone_offset_minutes))
    current_date = current.astimezone(user_timezone).date()
    if period == "today":
        start = current_date
        end = current_date + timedelta(days=1)
    elif period == "week":
        start = current_date - timedelta(days=current_date.weekday())
        end = start + timedelta(days=7)
    else:
        start = current_date.replace(day=1)
        if start.month == 12:
            end = date(start.year + 1, 1, 1)
        else:
            end = date(start.year, start.month + 1, 1)

    return _date_start(start, timezone_offset_minutes), _date_start(end, timezone_offset_minutes)


def _date_start(value: date, timezone_offset_minutes: int) -> datetime:
    user_timezone = timezone(timedelta(minutes=timezone_offset_minutes))
    return datetime.combine(value, time.min, tzinfo=user_timezone).astimezone(UTC)


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _memory_scope_filters(
    user_id: uuid.UUID,
    period: MemoryPeriod,
    start_date: date | None,
    end_date: date | None,
    *,
    now: datetime | None = None,
    timezone_offset_minutes: int = 0,
) -> list:
    start_at, end_at = _resolve_memory_window(
        period,
        start_date,
        end_date,
        now=now,
        timezone_offset_minutes=timezone_offset_minutes,
    )
    filters = [MemoryEntry.user_id == user_id, MemoryEntry.deleted_at.is_(None)]
    if start_at is not None:
        filters.append(MemoryEntry.occurred_at >= start_at)
    if end_at is not None:
        filters.append(MemoryEntry.occurred_at < end_at)
    return filters


def _build_memory_search_filters(
    user_id: uuid.UUID,
    keyword: str | None,
    period: MemoryPeriod,
    start_date: date | None,
    end_date: date | None,
    *,
    now: datetime | None = None,
    timezone_offset_minutes: int = 0,
) -> tuple[list, str, object | None]:
    filters = _memory_scope_filters(
        user_id,
        period,
        start_date,
        end_date,
        now=now,
        timezone_offset_minutes=timezone_offset_minutes,
    )
    normalized_keyword = keyword.strip() if keyword else ""
    if not normalized_keyword:
        return filters, normalized_keyword, None

    escaped_keyword = _escape_like(normalized_keyword)
    contains_pattern = f"%{escaped_keyword}%"
    prefix_pattern = f"{escaped_keyword}%"
    tag_text = cast(MemoryEntry.tags, Text)
    fields = [MemoryEntry.content, MemoryEntry.summary, tag_text]
    filters.append(or_(*(field.ilike(contains_pattern, escape="\\") for field in fields)))
    relevance = case(
        (MemoryEntry.content.ilike(prefix_pattern, escape="\\"), 3),
        (MemoryEntry.summary.ilike(prefix_pattern, escape="\\"), 2),
        (tag_text.ilike(contains_pattern, escape="\\"), 2),
        else_=1,
    )
    return filters, normalized_keyword, relevance


def _build_agent_memory_scope_filter(settings: object):
    """Return a SQLAlchemy predicate for future Agent/Context retrieval.

    The current Memory page remains a user data-management view and therefore
    can still show all of the user's active memories. Agent retrieval must call
    this boundary before building its context.
    """
    if all(memory_source_allowed(settings, source) for source in ("manual", "onboarding", "capability_brief")):
        return None
    allowed_sources = [
        source
        for source in ("manual", "onboarding", "capability_brief", "reflection", "morning", "micro", "evening", "task", "goal", "plan", "growth_plan", "learning", "knowledge", "knowledge_card")
        if memory_source_allowed(settings, source)
    ]
    return MemoryEntry.source.in_(allowed_sources) if allowed_sources else MemoryEntry.id.is_(None)


def _build_memory_search_query(
    user_id: uuid.UUID,
    keyword: str | None,
    period: MemoryPeriod,
    start_date: date | None,
    end_date: date | None,
    limit: int,
    *,
    now: datetime | None = None,
    timezone_offset_minutes: int = 0,
):
    filters, normalized_keyword, relevance = _build_memory_search_filters(
        user_id=user_id,
        keyword=keyword,
        period=period,
        start_date=start_date,
        end_date=end_date,
        now=now,
        timezone_offset_minutes=timezone_offset_minutes,
    )
    if normalized_keyword and relevance is not None:
        return (
            select(MemoryEntry)
            .where(*filters)
            .order_by(relevance.desc(), MemoryEntry.occurred_at.desc(), MemoryEntry.created_at.desc())
            .limit(limit)
        )

    return (
        select(MemoryEntry)
        .where(*filters)
        .order_by(MemoryEntry.occurred_at.desc(), MemoryEntry.created_at.desc())
        .limit(limit)
    )


@router.post("", response_model=ApiResponse[MemoryResponse])
async def create_memory(
    payload: MemoryCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemoryResponse]:
    """Save a short user-authored fact into the shared Memory layer."""
    normalized_user_id = _parse_user_id(user_id)
    occurred_at = payload.occurred_at or datetime.now(UTC)
    memory = await create_from_source(
        session=session,
        user_id=normalized_user_id,
        source="manual",
        content=payload.content,
        summary=payload.content[:180],
        tags=payload.tags,
        memory_type=payload.memory_type,
        importance=payload.importance,
        confidence=1.0,
        occurred_at=occurred_at,
    )
    await session.commit()
    await session.refresh(memory)
    return ApiResponse(success=True, data=_to_response(memory))


@router.get("", response_model=ApiResponse[MemoryListResponse])
async def list_memories(
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    keyword: Annotated[str | None, Query(max_length=120)] = None,
    period: Annotated[MemoryPeriod, Query()] = "all",
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
    timezone_offset_minutes: Annotated[int, Query(ge=-840, le=840)] = 0,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemoryListResponse]:
    """Return active memories filtered by keyword and calendar range."""
    normalized_user_id = _parse_user_id(user_id)
    query_now = datetime.now(UTC)
    try:
        filters, normalized_keyword, relevance = _build_memory_search_filters(
            user_id=normalized_user_id,
            keyword=keyword,
            period=period,
            start_date=start_date,
            end_date=end_date,
            now=query_now,
            timezone_offset_minutes=timezone_offset_minutes,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc

    items_query = select(MemoryEntry).where(*filters)
    if normalized_keyword and relevance is not None:
        items_query = items_query.order_by(
            relevance.desc(),
            MemoryEntry.occurred_at.desc(),
            MemoryEntry.created_at.desc(),
        )
    else:
        items_query = items_query.order_by(MemoryEntry.occurred_at.desc(), MemoryEntry.created_at.desc())
    items_result = await session.execute(items_query.limit(limit))
    count_result = await session.execute(select(func.count(MemoryEntry.id)).where(*filters))
    return ApiResponse(
        success=True,
        data=MemoryListResponse(
            items=[_to_response(item) for item in items_result.scalars().all()],
            total=count_result.scalar_one(),
        ),
    )


@router.patch("/{memory_id}", response_model=ApiResponse[MemoryResponse])
async def update_memory(
    memory_id: str,
    payload: MemoryUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemoryResponse]:
    normalized_user_id = _parse_user_id(user_id)
    normalized_memory_id = _parse_memory_id(memory_id)
    result = await session.execute(
        select(MemoryEntry).where(
            MemoryEntry.id == normalized_memory_id,
            MemoryEntry.user_id == normalized_user_id,
            MemoryEntry.deleted_at.is_(None),
        )
    )
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundException("Memory")

    if payload.content is not None:
        memory.content = payload.content
        memory.summary = payload.content[:180]
    if payload.tags is not None:
        memory.tags = payload.tags
    if payload.occurred_at is not None:
        memory.occurred_at = payload.occurred_at
    if payload.importance is not None:
        memory.importance = payload.importance

    memory.derived_status = dict(DERIVED_STATUS_STALE)
    memory.updated_at = datetime.now(UTC)
    await session.commit()
    await session.refresh(memory)
    return ApiResponse(success=True, data=_to_response(memory))


@router.delete("/{memory_id}", response_model=ApiResponse[dict])
async def delete_memory(
    memory_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    normalized_user_id = _parse_user_id(user_id)
    normalized_memory_id = _parse_memory_id(memory_id)
    result = await session.execute(
        select(MemoryEntry).where(
            MemoryEntry.id == normalized_memory_id,
            MemoryEntry.user_id == normalized_user_id,
            MemoryEntry.deleted_at.is_(None),
        )
    )
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundException("Memory")

    deleted_at = datetime.now(UTC)
    memory.deleted_at = deleted_at
    memory.derived_status = dict(DERIVED_STATUS_STALE)
    memory.updated_at = deleted_at
    await session.commit()
    return ApiResponse(
        success=True,
        data={
            "deleted": True,
            "id": str(memory.id),
            "undo_until": (deleted_at + timedelta(minutes=15)).isoformat(),
        },
    )


@router.post("/{memory_id}/restore", response_model=ApiResponse[MemoryResponse])
async def restore_memory(
    memory_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemoryResponse]:
    normalized_user_id = _parse_user_id(user_id)
    normalized_memory_id = _parse_memory_id(memory_id)
    result = await session.execute(
        select(MemoryEntry).where(
            MemoryEntry.id == normalized_memory_id,
            MemoryEntry.user_id == normalized_user_id,
            MemoryEntry.deleted_at.is_not(None),
        )
    )
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundException("Memory")

    now = datetime.now(UTC)
    if memory.deleted_at < now - timedelta(minutes=15):
        raise ValidationException("这条 Memory 的撤销时间已结束")

    memory.deleted_at = None
    memory.updated_at = now
    await session.commit()
    await session.refresh(memory)
    return ApiResponse(success=True, data=_to_response(memory))


@router.get("/{memory_id}", response_model=ApiResponse[MemoryResponse])
async def get_memory(
    memory_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[MemoryResponse]:
    normalized_user_id = _parse_user_id(user_id)
    normalized_memory_id = _parse_memory_id(memory_id)

    result = await session.execute(
        select(MemoryEntry).where(
            MemoryEntry.id == normalized_memory_id,
            MemoryEntry.user_id == normalized_user_id,
            MemoryEntry.deleted_at.is_(None),
        )
    )
    memory = result.scalar_one_or_none()
    if memory is None:
        raise NotFoundException("Memory")
    return ApiResponse(success=True, data=_to_response(memory))
