"""Universal Record Engine — scene-agnostic CRUD for all record types.

This engine does NOT know about trading/career/skill specifics.
Scene-specific logic lives in scenes/trading/ etc.
"""

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import generate_proof_hash
from app.models.record import Record

logger = structlog.get_logger()


async def create_record(
    session: AsyncSession,
    user_id: str,
    scene: str,
    record_type: str,
    title: str,
    content: dict,
    tags: list[dict],
    emotion: str | None,
    occurred_at: datetime,
    attachments: list[dict] | None = None,
) -> Record:
    """Create a universal record with proof hash."""
    proof_data = {"title": title, "scene": scene, "occurred_at": occurred_at.isoformat()}
    proof_ts, proof_hash = generate_proof_hash(proof_data)

    record = Record(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        scene=scene,
        record_type=record_type,
        title=title,
        content=content,
        tags=tags,
        emotion=emotion,
        occurred_at=occurred_at,
        proof_hash=proof_hash,
        proof_ts=proof_ts,
        attachments=attachments or [],
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    logger.info("record_created", id=str(record.id), scene=scene, type=record_type)
    return record


async def list_records(
    session: AsyncSession,
    user_id: str,
    scene: str | None = None,
    record_type: str | None = None,
    tag_filter: dict | None = None,  # {"category": "buy_reason", "value": "抄底"}
    keyword: str | None = None,
    page: int = 1,
    page_size: int = 20,
) -> tuple[list[Record], int]:
    """List records with filters. Always user_id scoped (Red Line R-03)."""
    filters = [Record.user_id == uuid.UUID(user_id), Record.deleted_at.is_(None)]

    if scene:
        filters.append(Record.scene == scene)
    if record_type:
        filters.append(Record.record_type == record_type)
    if keyword:
        filters.append(Record.title.ilike(f"%{keyword}%"))
    if tag_filter:
        # GIN query: tags @> '[{"category":"buy_reason","value":"抄底"}]'

        filters.append(Record.tags.op("@>")(f'[{{"category":"{tag_filter["category"]}","value":"{tag_filter["value"]}"}}]'))

    query = select(Record).where(and_(*filters))

    # Count
    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar_one()

    # Paginate
    query = query.order_by(Record.occurred_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    return list(result.scalars().all()), total


async def get_record(session: AsyncSession, user_id: str, record_id: str) -> Record | None:
    """Get single record. user_id filtered (Red Line R-03)."""
    result = await session.execute(
        select(Record)
        .where(Record.id == uuid.UUID(record_id))
        .where(Record.user_id == uuid.UUID(user_id))
        .where(Record.deleted_at.is_(None))
    )
    return result.scalar_one_or_none()


async def update_record(session: AsyncSession, user_id: str, record_id: str, updates: dict) -> Record | None:
    """Update record fields. proof_hash is immutable (Red Line R-08)."""
    record = await get_record(session, user_id, record_id)
    if record is None:
        return None

    updates.pop("proof_hash", None)
    updates.pop("proof_ts", None)
    updates.pop("user_id", None)
    updates.pop("id", None)

    for key, value in updates.items():
        if value is not None and hasattr(record, key):
            setattr(record, key, value)

    await session.commit()
    await session.refresh(record)
    return record


async def soft_delete_record(session: AsyncSession, user_id: str, record_id: str) -> bool:
    """Soft delete. user_id filtered (Red Line R-03)."""
    record = await get_record(session, user_id, record_id)
    if record is None:
        return False
    record.deleted_at = datetime.now(UTC)
    await session.commit()
    return True
