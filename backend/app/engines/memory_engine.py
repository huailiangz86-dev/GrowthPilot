"""Small Memory write boundary used by the new growth flows."""

import uuid
from datetime import UTC, datetime

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.memory import DERIVED_STATUS_PENDING, MemoryEntry


async def create_from_source(
    session: AsyncSession,
    user_id: uuid.UUID | str,
    source: str,
    content: str,
    summary: str | None = None,
    tags: list[str] | None = None,
    source_id: uuid.UUID | None = None,
    memory_type: str = "semantic",
    importance: int = 3,
    confidence: float = 1.0,
    occurred_at: datetime | None = None,
) -> MemoryEntry:
    """Create a durable Memory entry with an explicit user scope."""
    normalized_content = content.strip()
    if not normalized_content:
        raise ValueError("Memory content cannot be empty")

    entry = MemoryEntry(
        user_id=uuid.UUID(str(user_id)),
        memory_type=memory_type,
        source=source,
        source_id=source_id,
        content=normalized_content,
        summary=summary.strip() if summary else None,
        tags=tags or [],
        derived_status={
            **DERIVED_STATUS_PENDING,
            "summary": "ready" if summary else "pending",
        },
        importance=importance,
        confidence=confidence,
        occurred_at=occurred_at or datetime.now(UTC),
    )
    session.add(entry)
    await session.flush()
    return entry
