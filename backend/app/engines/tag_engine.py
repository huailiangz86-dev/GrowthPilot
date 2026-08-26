"""Tag Engine — tag definitions + tag statistics (the "aha moment" data source).

Statistics are computed via SQL on JSONB tags with GIN index.
NO LLM needed for basic tag stats (Red Line R-05).
"""

import uuid

import structlog
from sqlalchemy import and_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tag_definition import TagDefinition

logger = structlog.get_logger()

# System preset tags by scene
ALL_PRESETS = {
    "trading": {
        "buy_reason": ["突破前高", "超跌反弹", "消息刺激", "抄底", "趋势突破", "均线信号", "基本面", "技术面"],
        "sell_reason": ["止盈", "止损", "破均线", "情绪卖出", "尾盘卖出", "目标达到", "趋势结束"],
        "emotion": ["兴奋", "焦虑", "冲动", "害怕", "平静"],
    },
    "crypto": {
        "buy_reason": ["趋势突破", "消息驱动", "超跌反弹", "定投", "技术信号", "FOMO"],
        "sell_reason": ["止盈", "止损", "恐慌卖出", "目标达到", "换仓"],
        "emotion": ["兴奋", "焦虑", "冲动", "害怕", "平静"],
    },
    "fund": {
        "buy_reason": ["定投", "加仓", "配置调整", "看好行业"],
        "sell_reason": ["赎回", "调仓", "止盈", "急用钱"],
    },
    "expense": {
        "category": ["餐饮", "交通", "购物", "娱乐", "住房", "医疗", "教育", "其他"],
    },
}

# Backward compat
TRADING_PRESETS = ALL_PRESETS["trading"]


async def seed_preset_tags(session: AsyncSession) -> int:
    """Seed system preset tags for ALL scenes. Idempotent."""
    count = 0
    for scene, categories in ALL_PRESETS.items():
        for category, values in categories.items():
            for i, value in enumerate(values):
                existing = await session.execute(
                    select(TagDefinition).where(
                        TagDefinition.user_id.is_(None),
                        TagDefinition.scene == scene,
                        TagDefinition.category == category,
                        TagDefinition.value == value,
                    )
                )
                if existing.scalar_one_or_none() is None:
                    session.add(TagDefinition(
                        id=uuid.uuid4(), user_id=None, scene=scene,
                        category=category, value=value, sort_order=i,
                    ))
                    count += 1
    await session.commit()
    logger.info("tags_seeded", count=count, scenes=list(ALL_PRESETS.keys()))
    return count


async def get_tag_definitions(
    session: AsyncSession,
    user_id: str | None,
    scene: str = "trading",
    category: str | None = None,
) -> list[dict]:
    """Get tag definitions (system presets + user custom)."""
    filters = [
        TagDefinition.scene.in_([scene, "all"]),
        TagDefinition.is_active.is_(True),
    ]

    if user_id:
        filters.append((TagDefinition.user_id.is_(None)) | (TagDefinition.user_id == uuid.UUID(user_id)))
    else:
        filters.append(TagDefinition.user_id.is_(None))

    if category:
        filters.append(TagDefinition.category == category)

    result = await session.execute(
        select(TagDefinition).where(and_(*filters)).order_by(TagDefinition.category, TagDefinition.sort_order)
    )
    return [
        {"id": str(t.id), "category": t.category, "value": t.value, "is_custom": t.user_id is not None}
        for t in result.scalars().all()
    ]


async def create_custom_tag(session: AsyncSession, user_id: str, scene: str, category: str, value: str) -> dict:
    """Create a user-custom tag."""
    tag = TagDefinition(
        id=uuid.uuid4(), user_id=uuid.UUID(user_id),
        scene=scene, category=category, value=value,
    )
    session.add(tag)
    await session.commit()
    return {"id": str(tag.id), "category": category, "value": value, "is_custom": True}


async def get_tag_stats(
    session: AsyncSession,
    user_id: str,
    scene: str = "trading",
    category: str = "buy_reason",
) -> list[dict]:
    """Tag win-rate statistics — the 'aha moment'.

    Pure SQL on JSONB with GIN index (Red Line R-05: no LLM needed).
    """
    uid = uuid.UUID(user_id)

    # SQL: unnest tags, group by value, compute win rate
    query = text("""
        SELECT
            tag->>'value' AS tag_value,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0) AS wins,
            ROUND(
                COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric
                / NULLIF(COUNT(*), 0) * 100, 1
            ) AS win_rate,
            ROUND(AVG((content->>'pnl')::float)::numeric, 2) AS avg_pnl
        FROM records, jsonb_array_elements(tags) AS tag
        WHERE user_id = :user_id
            AND scene = :scene
            AND tag->>'category' = :category
            AND content->>'pnl' IS NOT NULL
            AND deleted_at IS NULL
        GROUP BY tag->>'value'
        ORDER BY total DESC
    """)

    result = await session.execute(query, {"user_id": uid, "scene": scene, "category": category})
    rows = result.fetchall()

    return [
        {
            "tag_value": row.tag_value,
            "total": row.total,
            "wins": row.wins,
            "win_rate": float(row.win_rate) if row.win_rate else 0,
            "avg_pnl": float(row.avg_pnl) if row.avg_pnl else 0,
        }
        for row in rows
    ]


async def get_tag_cross_stats(
    session: AsyncSession,
    user_id: str,
    scene: str = "trading",
    category_x: str = "buy_reason",
    category_y: str = "emotion",
) -> list[dict]:
    """Cross-analysis: buy_reason × emotion win-rate matrix."""
    uid = uuid.UUID(user_id)

    query = text("""
        SELECT
            tx->>'value' AS x_value,
            ty->>'value' AS y_value,
            COUNT(*) AS total,
            ROUND(
                COUNT(*) FILTER (WHERE (content->>'pnl')::float > 0)::numeric
                / NULLIF(COUNT(*), 0) * 100, 1
            ) AS win_rate
        FROM records,
            jsonb_array_elements(tags) AS tx,
            jsonb_array_elements(tags) AS ty
        WHERE user_id = :user_id
            AND scene = :scene
            AND tx->>'category' = :category_x
            AND ty->>'category' = :category_y
            AND content->>'pnl' IS NOT NULL
            AND deleted_at IS NULL
        GROUP BY tx->>'value', ty->>'value'
        HAVING COUNT(*) >= 3
        ORDER BY total DESC
    """)

    result = await session.execute(query, {
        "user_id": uid, "scene": scene,
        "category_x": category_x, "category_y": category_y,
    })
    return [
        {"x": row.x_value, "y": row.y_value, "total": row.total, "win_rate": float(row.win_rate or 0)}
        for row in result.fetchall()
    ]
