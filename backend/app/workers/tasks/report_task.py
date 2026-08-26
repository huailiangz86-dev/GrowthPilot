"""Arq task: Generate weekly/monthly AI report (STORY-017)."""

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


async def generate_weekly_report(session: AsyncSession, user_id: str) -> dict:
    """Generate weekly trading summary. Called by Arq scheduler or manually."""
    uid = uuid.UUID(user_id)

    result = await session.execute(text("""
        SELECT
            COUNT(*) AS total_trades,
            COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins,
            ROUND(SUM((content->>'pnl')::float)::numeric, 2) AS total_pnl,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
        FROM records
        WHERE user_id = :uid AND scene = 'trading'
            AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
            AND occurred_at >= NOW() - INTERVAL '7 days'
    """), {"uid": uid})
    row = result.fetchone()

    if not row or row.total_trades == 0:
        return {"has_data": False}

    win_rate = round(row.wins / row.total_trades * 100, 1)

    # Get top patterns from this week
    patterns_result = await session.execute(text("""
        SELECT title, severity FROM pattern_discoveries
        WHERE user_id = :uid AND scene = 'trading'
            AND discovered_at >= NOW() - INTERVAL '7 days'
        ORDER BY discovered_at DESC LIMIT 3
    """), {"uid": uid})
    patterns = [{"title": p.title, "severity": p.severity} for p in patterns_result.fetchall()]

    report = {
        "has_data": True,
        "period": "weekly",
        "generated_at": datetime.now(UTC).isoformat(),
        "stats": {
            "total_trades": row.total_trades,
            "wins": row.wins,
            "win_rate": win_rate,
            "total_pnl": float(row.total_pnl or 0),
            "avg_pnl": float(row.avg_pnl or 0),
        },
        "patterns": patterns,
        "summary": f"本周完成{row.total_trades}笔交易，胜率{win_rate}%，"
                   f"总盈亏{row.total_pnl or 0}元。",
    }

    logger.info("weekly_report_generated", user_id=user_id, trades=row.total_trades)
    return report
