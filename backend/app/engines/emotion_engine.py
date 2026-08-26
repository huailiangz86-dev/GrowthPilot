"""Emotion Engine — emotion-performance correlation analysis (SQL-first)."""

import uuid

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_emotion_correlation(session: AsyncSession, user_id: str) -> list[dict]:
    """Emotion vs win-rate correlation. Pure SQL."""
    result = await session.execute(text("""
        SELECT emotion, COUNT(*) AS total,
            ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
        FROM records
        WHERE user_id = :uid AND scene IN ('trading','crypto') AND content->>'pnl' IS NOT NULL
            AND emotion IS NOT NULL AND deleted_at IS NULL
        GROUP BY emotion HAVING COUNT(*) >= 3
        ORDER BY win_rate DESC
    """), {"uid": uuid.UUID(user_id)})
    return [{"emotion": r.emotion, "total": r.total, "win_rate": float(r.win_rate or 0), "avg_pnl": float(r.avg_pnl or 0)} for r in result.fetchall()]


async def get_emotion_trend(session: AsyncSession, user_id: str) -> list[dict]:
    """Monthly emotion distribution trend."""
    result = await session.execute(text("""
        SELECT TO_CHAR(occurred_at, 'YYYY-MM') AS month, emotion, COUNT(*) AS count
        FROM records
        WHERE user_id = :uid AND scene IN ('trading','crypto') AND emotion IS NOT NULL AND deleted_at IS NULL
        GROUP BY TO_CHAR(occurred_at, 'YYYY-MM'), emotion
        ORDER BY month, emotion
    """), {"uid": uuid.UUID(user_id)})
    return [{"month": r.month, "emotion": r.emotion, "count": r.count} for r in result.fetchall()]


async def get_best_state(session: AsyncSession, user_id: str) -> dict | None:
    """Find the emotion state with highest win rate."""
    corr = await get_emotion_correlation(session, user_id)
    if not corr:
        return None
    best = max(corr, key=lambda x: x["win_rate"])
    worst = min(corr, key=lambda x: x["win_rate"])
    return {
        "best_emotion": best["emotion"], "best_win_rate": best["win_rate"],
        "worst_emotion": worst["emotion"], "worst_win_rate": worst["win_rate"],
        "insight": f"你在「{best['emotion']}」状态下表现最好（胜率{best['win_rate']}%），在「{worst['emotion']}」状态下需要注意（胜率{worst['win_rate']}%）。",
    }
