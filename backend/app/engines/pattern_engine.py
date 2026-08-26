"""Pattern Discovery Engine — finds behavioral patterns from trading data.

SQL-first (Red Line R-05): tag stats, time patterns, holding patterns are ALL pure SQL.
LLM only used for natural language descriptions of discovered patterns.
"""

import uuid

import structlog
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pattern import PatternDiscovery

logger = structlog.get_logger()

MIN_TRADES_FOR_PATTERNS = 30
MIN_SAMPLE_SIZE = 5


async def discover_all_patterns(session: AsyncSession, user_id: str) -> list[dict]:
    """Run all pattern discovery SQL queries and save results."""
    uid = uuid.UUID(user_id)
    discoveries = []

    # 1. Tag win-rate patterns (e.g., "抄底胜率仅28%")
    discoveries.extend(await _discover_tag_patterns(session, uid))

    # 2. Time-of-day patterns (e.g., "下午2点后亏损率65%")
    discoveries.extend(await _discover_time_patterns(session, uid))

    # 3. Holding period patterns (e.g., "持仓>3天收益+110%")
    discoveries.extend(await _discover_holding_patterns(session, uid))

    # 4. Emotion patterns (e.g., "焦虑时亏损+42%")
    discoveries.extend(await _discover_emotion_patterns(session, uid))

    # 5. Streak patterns (e.g., "连亏3笔后加仓胜率18%")
    discoveries.extend(await _discover_streak_patterns(session, uid))

    # Save to DB
    for d in discoveries:
        session.add(PatternDiscovery(
            id=uuid.uuid4(), user_id=uid, scene="trading",
            pattern_type=d["type"], title=d["title"],
            description=d["description"], data=d["data"],
            sample_size=d["sample_size"], severity=d["severity"],
        ))
    await session.commit()

    logger.info("patterns_discovered", user_id=str(uid), count=len(discoveries))
    return discoveries


async def _discover_tag_patterns(session: AsyncSession, uid: uuid.UUID) -> list[dict]:
    """Find tags with notably high or low win rates."""
    result = await session.execute(text("""
        SELECT tag->>'value' AS tag_value, tag->>'category' AS category,
            COUNT(*) AS total,
            ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
        FROM records, jsonb_array_elements(tags) AS tag
        WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
            AND tag->>'category' IN ('buy_reason', 'sell_reason')
        GROUP BY tag->>'value', tag->>'category'
        HAVING COUNT(*) >= :min_sample
        ORDER BY win_rate ASC
    """), {"uid": uid, "min_sample": MIN_SAMPLE_SIZE})

    patterns = []
    for row in result.fetchall():
        wr = float(row.win_rate or 0)
        severity = "negative" if wr < 35 else ("positive" if wr > 65 else "neutral")
        if severity == "neutral":
            continue  # Only report notable patterns

        cat_label = "买入原因" if row.category == "buy_reason" else "卖出原因"
        if severity == "negative":
            title = f"{row.tag_value}策略胜率仅{wr}%"
            desc = f"你的「{row.tag_value}」({cat_label}) 在{row.total}笔交易中胜率仅{wr}%，平均盈亏{row.avg_pnl}元。建议减少使用或优化该策略。"
        else:
            title = f"{row.tag_value}策略胜率高达{wr}%"
            desc = f"你的「{row.tag_value}」({cat_label}) 在{row.total}笔交易中胜率{wr}%，平均盈亏{row.avg_pnl}元。这是你的优势策略，继续保持！"

        patterns.append({
            "type": "tag_winrate", "title": title, "description": desc,
            "data": {"tag": row.tag_value, "category": row.category, "total": row.total, "win_rate": wr, "avg_pnl": float(row.avg_pnl or 0)},
            "sample_size": row.total, "severity": severity,
        })
    return patterns


async def _discover_time_patterns(session: AsyncSession, uid: uuid.UUID) -> list[dict]:
    """Find time-of-day patterns."""
    result = await session.execute(text("""
        SELECT EXTRACT(HOUR FROM occurred_at) AS hour,
            COUNT(*) AS total,
            ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
        FROM records
        WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
        GROUP BY EXTRACT(HOUR FROM occurred_at)
        HAVING COUNT(*) >= :min_sample
        ORDER BY win_rate ASC
    """), {"uid": uid, "min_sample": MIN_SAMPLE_SIZE})

    patterns = []
    for row in result.fetchall():
        wr = float(row.win_rate or 0)
        if wr >= 35 and wr <= 65:
            continue
        hour = int(row.hour)
        severity = "negative" if wr < 35 else "positive"
        if severity == "negative":
            title = f"{hour}点交易亏损率{100-wr}%"
            desc = f"你在{hour}:00左右的交易胜率仅{wr}%（{row.total}笔），建议避开这个时段。"
        else:
            title = f"{hour}点交易胜率{wr}%"
            desc = f"你在{hour}:00左右的交易表现出色，胜率{wr}%（{row.total}笔），这是你的黄金时段！"

        patterns.append({
            "type": "time_pattern", "title": title, "description": desc,
            "data": {"hour": hour, "total": row.total, "win_rate": wr},
            "sample_size": row.total, "severity": severity,
        })
    return patterns


async def _discover_holding_patterns(session: AsyncSession, uid: uuid.UUID) -> list[dict]:
    """Find holding period patterns."""
    result = await session.execute(text("""
        SELECT
            CASE
                WHEN (content->>'sell_time') IS NOT NULL THEN
                    EXTRACT(DAY FROM (content->>'sell_time')::timestamp - occurred_at)
                ELSE NULL
            END AS holding_days,
            (content->>'pnl')::float AS pnl
        FROM records
        WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL
            AND content->>'sell_time' IS NOT NULL AND deleted_at IS NULL
    """), {"uid": uid})

    rows = result.fetchall()
    if len(rows) < MIN_SAMPLE_SIZE:
        return []

    # Split into short (<= 1 day) vs long (> 3 days)
    short = [r for r in rows if r.holding_days is not None and r.holding_days <= 1]
    long_hold = [r for r in rows if r.holding_days is not None and r.holding_days > 3]

    patterns = []
    if len(short) >= MIN_SAMPLE_SIZE and len(long_hold) >= MIN_SAMPLE_SIZE:
        short_wr = sum(1 for r in short if r.pnl > 0) / len(short) * 100
        long_wr = sum(1 for r in long_hold if r.pnl > 0) / len(long_hold) * 100
        long_avg = sum(r.pnl for r in long_hold) / len(long_hold)

        if long_wr > short_wr + 15:
            patterns.append({
                "type": "holding_pattern",
                "title": f"持仓超过3天胜率提高{long_wr-short_wr:.0f}%",
                "description": f"当天卖出胜率{short_wr:.0f}%（{len(short)}笔），持仓3天以上胜率{long_wr:.0f}%（{len(long_hold)}笔）。耐心持有对你更有利。",
                "data": {"short_wr": round(short_wr, 1), "long_wr": round(long_wr, 1), "long_avg_pnl": round(long_avg, 2)},
                "sample_size": len(short) + len(long_hold), "severity": "positive",
            })
    return patterns


async def _discover_emotion_patterns(session: AsyncSession, uid: uuid.UUID) -> list[dict]:
    """Find emotion-performance correlation."""
    result = await session.execute(text("""
        SELECT emotion,
            COUNT(*) AS total,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl,
            ROUND(COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric / NULLIF(COUNT(*),0) * 100, 1) AS win_rate
        FROM records
        WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL
            AND emotion IS NOT NULL AND deleted_at IS NULL
        GROUP BY emotion
        HAVING COUNT(*) >= :min_sample
    """), {"uid": uid, "min_sample": MIN_SAMPLE_SIZE})

    # Find overall average
    all_result = await session.execute(text("""
        SELECT ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS overall_avg
        FROM records WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
    """), {"uid": uid})
    overall_avg = float(all_result.scalar_one() or 0)

    patterns = []
    for row in result.fetchall():
        avg_pnl = float(row.avg_pnl or 0)
        diff_pct = ((avg_pnl - overall_avg) / abs(overall_avg) * 100) if overall_avg != 0 else 0

        if abs(diff_pct) < 20:
            continue

        severity = "negative" if diff_pct < -20 else "positive"
        if severity == "negative":
            title = f"{row.emotion}时平均亏损增加{abs(diff_pct):.0f}%"
            desc = f"当你处于「{row.emotion}」状态时，平均盈亏{avg_pnl}元（{row.total}笔），比整体平均差{abs(diff_pct):.0f}%。建议在该情绪下减少交易。"
        else:
            title = f"{row.emotion}时表现优于平均{diff_pct:.0f}%"
            desc = f"「{row.emotion}」状态下，平均盈亏{avg_pnl}元（{row.total}笔），胜率{row.win_rate}%。这是你的最佳交易状态。"

        patterns.append({
            "type": "emotion_pattern", "title": title, "description": desc,
            "data": {"emotion": row.emotion, "total": row.total, "avg_pnl": avg_pnl, "win_rate": float(row.win_rate or 0), "diff_pct": round(diff_pct, 1)},
            "sample_size": row.total, "severity": severity,
        })
    return patterns


async def _discover_streak_patterns(session: AsyncSession, uid: uuid.UUID) -> list[dict]:
    """Find consecutive loss patterns (e.g., adding after 3 losses)."""
    result = await session.execute(text("""
        SELECT (content->>'pnl')::float AS pnl, occurred_at
        FROM records
        WHERE user_id = :uid AND scene = 'trading' AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
        ORDER BY occurred_at ASC
    """), {"uid": uid})

    rows = result.fetchall()
    if len(rows) < 10:
        return []

    # Find trades after 3 consecutive losses
    after_3_loss = []
    streak = 0
    for row in rows:
        if streak >= 3:
            after_3_loss.append(row.pnl)
        if row.pnl < 0:
            streak += 1
        else:
            streak = 0

    if len(after_3_loss) < MIN_SAMPLE_SIZE:
        return []

    wr = sum(1 for p in after_3_loss if p > 0) / len(after_3_loss) * 100

    if wr < 35:
        return [{
            "type": "streak_pattern",
            "title": f"连亏3笔后交易胜率仅{wr:.0f}%",
            "description": f"连续亏损3笔后的{len(after_3_loss)}笔交易中，胜率仅{wr:.0f}%。建议在连续亏损后暂停交易，避免报复性操作。",
            "data": {"after_loss_count": 3, "total": len(after_3_loss), "win_rate": round(wr, 1)},
            "sample_size": len(after_3_loss), "severity": "negative",
        }]
    return []


async def get_patterns(session: AsyncSession, user_id: str) -> list[dict]:
    """Get discovered patterns for a user. user_id filtered (Red Line R-03)."""
    from sqlalchemy import select

    result = await session.execute(
        select(PatternDiscovery)
        .where(PatternDiscovery.user_id == uuid.UUID(user_id))
        .where(PatternDiscovery.scene == "trading")
        .order_by(PatternDiscovery.discovered_at.desc())
    )
    return [
        {
            "id": str(p.id), "type": p.pattern_type, "title": p.title,
            "description": p.description, "data": p.data,
            "sample_size": p.sample_size, "severity": p.severity,
            "is_read": p.is_read, "discovered_at": p.discovered_at.isoformat(),
        }
        for p in result.scalars().all()
    ]
