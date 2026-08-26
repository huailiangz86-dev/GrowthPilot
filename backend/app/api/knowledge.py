"""Knowledge base API — search across all records and reviews."""

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/knowledge", tags=["knowledge"])


@router.get("/search", response_model=ApiResponse[list])
async def search_knowledge(
    q: str = Query(..., min_length=1, max_length=100),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Search across all records and reviews (user_id filtered)."""
    uid = uuid.UUID(user_id)
    results = []

    # Search records by title
    records = await session.execute(text("""
        SELECT id, 'trade' AS type, title, occurred_at AS date
        FROM records
        WHERE user_id = :uid AND deleted_at IS NULL AND title ILIKE :q
        ORDER BY occurred_at DESC LIMIT 10
    """), {"uid": uid, "q": f"%{q}%"})
    for r in records.fetchall():
        results.append({"type": "trade", "id": str(r.id), "title": r.title, "date": r.date.isoformat()})

    # Search reviews by content
    reviews = await session.execute(text("""
        SELECT id, 'review' AS type, review_date AS date,
            COALESCE(did_right, '') || ' ' || COALESCE(did_wrong, '') || ' ' || COALESCE(next_plan, '') AS content
        FROM reviews
        WHERE user_id = :uid AND (did_right ILIKE :q OR did_wrong ILIKE :q OR next_plan ILIKE :q OR notes ILIKE :q)
        ORDER BY review_date DESC LIMIT 10
    """), {"uid": uid, "q": f"%{q}%"})
    for r in reviews.fetchall():
        results.append({"type": "review", "id": str(r.id), "title": f"复盘 {r.date}", "date": str(r.date), "preview": r.content[:80]})

    results.sort(key=lambda x: x["date"], reverse=True)
    return ApiResponse(success=True, data=results[:20])


@router.get("/summary", response_model=ApiResponse[dict])
async def knowledge_summary(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Knowledge base summary — total records, reviews, patterns."""
    uid = uuid.UUID(user_id)
    from sqlalchemy import func, select

    from app.models.pattern import PatternDiscovery
    from app.models.record import Record
    from app.models.review import Review

    trades = (await session.execute(select(func.count()).select_from(Record).where(Record.user_id == uid, Record.deleted_at.is_(None)))).scalar_one()
    reviews = (await session.execute(select(func.count()).select_from(Review).where(Review.user_id == uid))).scalar_one()
    patterns = (await session.execute(select(func.count()).select_from(PatternDiscovery).where(PatternDiscovery.user_id == uid))).scalar_one()

    return ApiResponse(success=True, data={"trades": trades, "reviews": reviews, "patterns": patterns, "total": trades + reviews + patterns})
