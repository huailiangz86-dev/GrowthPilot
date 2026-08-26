"""Persona Engine — 6-dimension trading style analysis + style matching."""

import uuid
from datetime import UTC, datetime, timedelta

import structlog
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.pattern import PatternDiscovery
from app.models.record import Record
from app.models.review import Review

logger = structlog.get_logger()

STYLE_TYPES = {
    "趋势猎手": "擅长顺势交易，耐心持仓等待趋势展开",
    "短线战士": "快进快出，善于捕捉短期机会",
    "价值守望者": "基本面驱动，长期持有等待价值回归",
    "波段冲浪者": "灵活把握波段节奏，进退有度",
    "纪律执行者": "严格按规则交易，情绪控制出色",
    "情绪交易者": "容易被情绪驱动，需要加强纪律",
}

DIM_LABELS = {
    "risk_appetite": "风险偏好", "trade_frequency": "交易频率",
    "holding_patience": "持仓耐心", "discipline": "纪律性",
    "emotion_stability": "情绪稳定", "learning_ability": "学习能力",
}

MIN_TRADES = 20


async def calculate_dimensions(session: AsyncSession, user_id: str) -> dict | None:
    uid = uuid.UUID(user_id)
    now = datetime.now(UTC)

    total_trades = (await session.execute(
        select(func.count()).select_from(Record).where(Record.user_id == uid, Record.scene.in_(["trading", "crypto"]), Record.deleted_at.is_(None))
    )).scalar_one()

    if total_trades < MIN_TRADES:
        return None

    # 1. Risk appetite
    risk_result = await session.execute(text("""
        SELECT STDDEV((content->>'pnl')::float) AS pnl_stddev
        FROM records WHERE user_id = :uid AND scene IN ('trading','crypto')
            AND content->>'pnl' IS NOT NULL AND deleted_at IS NULL
    """), {"uid": uid})
    risk_appetite = min(100, int((risk_result.scalar_one() or 0) / 10))

    # 2. Trade frequency
    freq = (await session.execute(text("""
        SELECT COUNT(*) FROM records WHERE user_id = :uid AND scene IN ('trading','crypto')
            AND deleted_at IS NULL AND occurred_at >= :cutoff
    """), {"uid": uid, "cutoff": now - timedelta(days=30)})).scalar_one() or 0
    trade_frequency = min(100, freq * 5)

    # 3. Holding patience
    avg_days = float((await session.execute(text("""
        SELECT COALESCE(AVG(EXTRACT(DAY FROM NOW() - occurred_at)), 3)
        FROM records WHERE user_id = :uid AND scene IN ('trading','crypto') AND deleted_at IS NULL
    """), {"uid": uid})).scalar_one() or 3)
    holding_patience = min(100, int(avg_days * 10))

    # 4. Discipline
    review_count = (await session.execute(select(func.count()).select_from(Review).where(Review.user_id == uid))).scalar_one()
    discipline = min(100, int(review_count / max(total_trades, 1) * 200))

    # 5. Emotion stability
    em = await session.execute(text("""
        SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE emotion IN ('焦虑','冲动','害怕')) AS neg
        FROM records WHERE user_id = :uid AND scene IN ('trading','crypto') AND emotion IS NOT NULL AND deleted_at IS NULL
    """), {"uid": uid})
    em_row = em.fetchone()
    emotion_stability = int((1 - (em_row.neg or 0) / max(em_row.total or 1, 1)) * 100)

    # 6. Learning ability
    patterns = (await session.execute(select(func.count()).select_from(PatternDiscovery).where(PatternDiscovery.user_id == uid))).scalar_one()
    learning_ability = min(100, review_count * 8 + patterns * 10)

    return {k: max(0, min(100, v)) for k, v in {
        "risk_appetite": risk_appetite, "trade_frequency": trade_frequency,
        "holding_patience": holding_patience, "discipline": discipline,
        "emotion_stability": emotion_stability, "learning_ability": learning_ability,
    }.items()}


def match_style(d: dict) -> str:
    if d["discipline"] >= 70 and d["emotion_stability"] >= 70:
        return "纪律执行者"
    if d["emotion_stability"] < 40 and d["discipline"] < 40:
        return "情绪交易者"
    if d["holding_patience"] >= 70 and d["trade_frequency"] < 40:
        return "价值守望者"
    if d["holding_patience"] >= 60:
        return "趋势猎手"
    if d["trade_frequency"] >= 70:
        return "短线战士"
    return "波段冲浪者"


async def get_full_profile(session: AsyncSession, user_id: str) -> dict:
    uid = uuid.UUID(user_id)
    dimensions = await calculate_dimensions(session, user_id)

    total = (await session.execute(select(func.count()).select_from(Record).where(Record.user_id == uid, Record.deleted_at.is_(None)))).scalar_one()

    if dimensions is None:
        return {"unlocked": False, "trade_count": total, "required": MIN_TRADES, "message": f"再记录 {max(0, MIN_TRADES - total)} 笔交易解锁风格分析"}

    style = match_style(dimensions)
    sorted_dims = sorted(dimensions.items(), key=lambda x: x[1], reverse=True)
    reviews = (await session.execute(select(func.count()).select_from(Review).where(Review.user_id == uid))).scalar_one()

    return {
        "unlocked": True,
        "style_type": style,
        "style_description": STYLE_TYPES.get(style, ""),
        "dimensions": dimensions,
        "dimension_labels": DIM_LABELS,
        "strengths": [{"dim": DIM_LABELS.get(k, k), "score": v} for k, v in sorted_dims[:2]],
        "improvements": [{"dim": DIM_LABELS.get(k, k), "score": v} for k, v in sorted_dims[-2:]],
        "trade_count": total,
        "review_count": reviews,
    }
