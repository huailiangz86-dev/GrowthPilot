"""Growth Report API — monthly progress comparison."""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from fastapi import APIRouter, Depends, Query
from sqlalchemy import and_, func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.knowledge import UserLearningProgress
from app.models.record import Record
from app.models.review import Review
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/growth-report", tags=["growth-report"])


def _month_range(year: int, month: int):
    """Return (start, end) datetime for a month in UTC."""
    start = datetime(year, month, 1, tzinfo=UTC)
    if month == 12:
        end = datetime(year + 1, 1, 1, tzinfo=UTC)
    else:
        end = datetime(year, month + 1, 1, tzinfo=UTC)
    return start, end


async def _month_stats(session, user_id: uuid.UUID, year: int, month: int) -> dict:
    """Compute stats for a single month."""
    start, end = _month_range(year, month)

    # Trade stats
    trades_q = select(Record).where(and_(
        Record.user_id == user_id, Record.scene == "trading",
        Record.occurred_at >= start, Record.occurred_at < end,
    ))
    trades_result = await session.execute(trades_q)
    trades = trades_result.scalars().all()

    trade_count = len(trades)
    pnls = [r.content.get("pnl", 0) for r in trades if r.content.get("pnl") is not None]
    wins = sum(1 for p in pnls if p and p > 0)
    total_pnl = sum(p for p in pnls if p)
    win_rate = round(wins / len(pnls) * 100) if pnls else 0

    # Emotion stats
    emotions = {}
    for r in trades:
        e = r.emotion or "未记录"
        emotions[e] = emotions.get(e, 0) + 1

    # Review stats
    reviews_q = select(func.count()).select_from(Review).where(and_(
        Review.user_id == user_id,
        Review.created_at >= start, Review.created_at < end,
    ))
    review_count = (await session.execute(reviews_q)).scalar_one()

    # Learning stats
    learn_q = select(func.count()).select_from(UserLearningProgress).where(and_(
        UserLearningProgress.user_id == user_id,
        UserLearningProgress.status == "completed",
        UserLearningProgress.read_at >= start, UserLearningProgress.read_at < end,
    ))
    learn_count = (await session.execute(learn_q)).scalar_one()

    return {
        "year": year, "month": month,
        "trade_count": trade_count,
        "win_rate": win_rate,
        "total_pnl": total_pnl,
        "review_count": review_count,
        "learn_count": learn_count,
        "top_emotion": max(emotions, key=emotions.get) if emotions else "无",
        "emotion_dist": emotions,
    }


@router.get("/monthly", response_model=ApiResponse[dict])
async def monthly_report(
    year: int = Query(default=0),
    month: int = Query(default=0),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Get monthly growth report with current vs previous month comparison."""
    uid = uuid.UUID(user_id)
    now = datetime.now(UTC)
    if year == 0:
        year = now.year
    if month == 0:
        month = now.month

    # Current month
    current = await _month_stats(session, uid, year, month)

    # Previous month
    prev_year, prev_month = (year, month - 1) if month > 1 else (year - 1, 12)
    previous = await _month_stats(session, uid, prev_year, prev_month)

    # Compute deltas
    def delta(cur, prev):
        if prev == 0:
            return 100 if cur > 0 else 0
        return round((cur - prev) / abs(prev) * 100)

    return ApiResponse(success=True, data={
        "current": current,
        "previous": previous,
        "deltas": {
            "trade_count": delta(current["trade_count"], previous["trade_count"]),
            "win_rate": current["win_rate"] - previous["win_rate"],
            "total_pnl": current["total_pnl"] - previous["total_pnl"],
            "review_count": delta(current["review_count"], previous["review_count"]),
            "learn_count": delta(current["learn_count"], previous["learn_count"]),
        },
    })
