"""Trading-specific statistics — PnL curve, win/loss ratio, pattern alerts."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


async def get_pnl_curve(session: AsyncSession, user_id: str, days: int = 30) -> list[dict]:
    """Daily PnL curve for chart display."""
    uid = uuid.UUID(user_id)
    cutoff = datetime.now(UTC) - timedelta(days=days) if days > 0 else None

    params = {"uid": uid}
    date_filter = ""
    if cutoff:
        date_filter = "AND occurred_at >= :cutoff"
        params["cutoff"] = cutoff

    result = await session.execute(text(f"""
        SELECT DATE(occurred_at) AS trade_date,
            ROUND(SUM((content->>'pnl')::float)::numeric, 2) AS daily_pnl,
            COUNT(*) AS trade_count
        FROM records
        WHERE user_id = :uid AND scene = 'trading'
            AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
            {date_filter}
        GROUP BY DATE(occurred_at)
        ORDER BY trade_date ASC
    """), params)

    cumulative = 0.0
    curve = []
    for row in result.fetchall():
        cumulative += float(row.daily_pnl)
        curve.append({
            "date": str(row.trade_date),
            "daily_pnl": float(row.daily_pnl),
            "cumulative_pnl": round(cumulative, 2),
            "trades": row.trade_count,
        })
    return curve


async def check_pattern_alert(session: AsyncSession, user_id: str, tags: list[dict]) -> dict | None:
    """Check if incoming trade tags match a known low-winrate pattern (STORY-015).

    Called when user creates a new trade. Returns alert if pattern found.
    """
    uid = uuid.UUID(user_id)
    buy_reasons = [t["value"] for t in tags if t.get("category") == "buy_reason"]

    if not buy_reasons:
        return None

    # Check each buy_reason against historical win rate
    for reason in buy_reasons:
        result = await session.execute(text("""
            SELECT COUNT(*) AS total,
                ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate
            FROM records, jsonb_array_elements(tags) AS tag
            WHERE user_id = :uid AND scene = 'trading'
                AND tag->>'category' = 'buy_reason' AND tag->>'value' = :reason
                AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
        """), {"uid": uid, "reason": reason})
        row = result.fetchone()

        if row and row.total >= 5 and row.win_rate is not None and float(row.win_rate) < 35:
            return {
                "alert": True,
                "tag": reason,
                "win_rate": float(row.win_rate),
                "sample_size": row.total,
                "message": f"你的「{reason}」策略历史胜率仅{row.win_rate}%（{row.total}笔），确定继续？",
            }

    # Check for positive reinforcement (STORY-016)
    for reason in buy_reasons:
        result = await session.execute(text("""
            SELECT COUNT(*) AS total,
                ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate
            FROM records, jsonb_array_elements(tags) AS tag
            WHERE user_id = :uid AND scene = 'trading'
                AND tag->>'category' = 'buy_reason' AND tag->>'value' = :reason
                AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
        """), {"uid": uid, "reason": reason})
        row = result.fetchone()

        if row and row.total >= 5 and row.win_rate is not None and float(row.win_rate) > 65:
            return {
                "alert": False,
                "positive": True,
                "tag": reason,
                "win_rate": float(row.win_rate),
                "sample_size": row.total,
                "message": f"你的「{reason}」策略胜率{row.win_rate}%（{row.total}笔），这是你的优势！",
            }

    return None
