"""Personal analysis API — persona + growth timeline."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.pattern import PatternDiscovery
from app.models.record import Record
from app.models.review import Review
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/persona", tags=["persona"])


@router.get("/profile", response_model=ApiResponse[dict])
async def get_profile(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Personal analysis profile — trading stats + behavior patterns + growth timeline."""
    uid = uuid.UUID(user_id)

    # Trade count
    from sqlalchemy import func
    trade_count = (await session.execute(
        select(func.count()).select_from(Record).where(Record.user_id == uid, Record.scene == "trading", Record.deleted_at.is_(None))
    )).scalar_one()

    # Review count
    review_count = (await session.execute(
        select(func.count()).select_from(Review).where(Review.user_id == uid)
    )).scalar_one()

    # Pattern count
    pattern_count = (await session.execute(
        select(func.count()).select_from(PatternDiscovery).where(PatternDiscovery.user_id == uid)
    )).scalar_one()

    # Top patterns (positive + negative)
    pos_patterns = (await session.execute(
        select(PatternDiscovery).where(PatternDiscovery.user_id == uid, PatternDiscovery.severity == "positive").order_by(PatternDiscovery.discovered_at.desc()).limit(3)
    )).scalars().all()

    neg_patterns = (await session.execute(
        select(PatternDiscovery).where(PatternDiscovery.user_id == uid, PatternDiscovery.severity == "negative").order_by(PatternDiscovery.discovered_at.desc()).limit(3)
    )).scalars().all()

    # Determine persona type based on patterns
    persona_type = "探索中"
    if trade_count >= 30:
        # Simple heuristic for MVP
        if len(pos_patterns) > len(neg_patterns):
            persona_type = "稳健成长型"
        elif len(neg_patterns) > 2:
            persona_type = "需要调整型"
        else:
            persona_type = "均衡发展型"

    return ApiResponse(success=True, data={
        "persona_type": persona_type,
        "trade_count": trade_count,
        "review_count": review_count,
        "pattern_count": pattern_count,
        "strengths": [{"title": p.title, "description": p.description} for p in pos_patterns],
        "weaknesses": [{"title": p.title, "description": p.description} for p in neg_patterns],
        "unlocked": trade_count >= 10,
    })


@router.get("/timeline", response_model=ApiResponse[list])
async def growth_timeline(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Personal growth timeline — trades + reviews + discoveries by date."""
    uid = uuid.UUID(user_id)

    # Get recent events
    events = []

    # Recent trades
    trades = (await session.execute(
        select(Record).where(Record.user_id == uid, Record.scene == "trading", Record.deleted_at.is_(None)).order_by(Record.occurred_at.desc()).limit(20)
    )).scalars().all()
    for t in trades:
        events.append({"type": "trade", "title": t.title, "date": t.occurred_at.isoformat(), "tags": t.tags})

    # Recent reviews
    reviews = (await session.execute(
        select(Review).where(Review.user_id == uid).order_by(Review.review_date.desc()).limit(10)
    )).scalars().all()
    for r in reviews:
        events.append({"type": "review", "title": f"复盘 - {r.review_date}", "date": r.created_at.isoformat(), "summary": r.did_right or r.did_wrong or ""})

    # Recent patterns
    patterns = (await session.execute(
        select(PatternDiscovery).where(PatternDiscovery.user_id == uid).order_by(PatternDiscovery.discovered_at.desc()).limit(5)
    )).scalars().all()
    for p in patterns:
        events.append({"type": "discovery", "title": p.title, "date": p.discovered_at.isoformat(), "severity": p.severity})

    # Sort by date desc
    events.sort(key=lambda x: x["date"], reverse=True)
    return ApiResponse(success=True, data=events[:30])
