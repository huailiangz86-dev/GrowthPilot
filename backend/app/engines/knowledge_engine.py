"""Knowledge Base Engine — seed categories & articles."""

import uuid
from datetime import UTC, datetime

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.knowledge import KnowledgeArticle, KnowledgeCategory

logger = structlog.get_logger()


async def seed_knowledge(session: AsyncSession) -> int:
    """Seed knowledge categories and master articles. Idempotent."""
    try:
        from app.engines.knowledge_seed import CATEGORIES, MASTER_ARTICLES
        try:
            from app.engines.knowledge_seed import EXTRA_ARTICLES
        except ImportError:
            EXTRA_ARTICLES = []
        # Book chapters (multiple seed files)
        BOOK_CHAPTERS: list = []
        try:
            from app.engines.knowledge_books_seed import BOOK_CHAPTERS as BC1
            BOOK_CHAPTERS += BC1
        except ImportError:
            pass
        try:
            from app.engines.knowledge_books_seed2 import BOOK_CHAPTERS_2 as BC2
            BOOK_CHAPTERS += BC2
        except ImportError:
            pass
    except ImportError:
        logger.warning("knowledge_seed_not_found")
        return 0

    # Seed categories
    ICON_MAP = {"strategy": "🧠", "book": "📖", "candlestick": "🕯", "chart": "📊", "library": "📚"}

    cat_map = {}
    for c in CATEGORIES:
        slug = c.get("slug") or c.get("key", "")
        result = await session.execute(select(KnowledgeCategory).where(KnowledgeCategory.slug == slug))
        existing = result.scalar_one_or_none()
        icon = c.get("icon", "📄")
        if len(icon) > 2:  # text icon like "strategy", convert to emoji
            icon = ICON_MAP.get(icon, "📄")
        if existing:
            cat_map[slug] = existing.id
        else:
            cat_id = uuid.uuid4()
            session.add(KnowledgeCategory(
                id=cat_id, name=c["name"], slug=slug,
                icon=icon, sort_order=c.get("sort_order", 0),
            ))
            cat_map[slug] = cat_id

    await session.flush()

    # Seed articles
    all_articles = MASTER_ARTICLES + EXTRA_ARTICLES + BOOK_CHAPTERS
    count = 0
    for a in all_articles:
        tpl_id = a.get("related_template_id", "")
        if tpl_id:
            result = await session.execute(
                select(KnowledgeArticle).where(KnowledgeArticle.related_template_id == tpl_id)
            )
        else:
            result = await session.execute(
                select(KnowledgeArticle).where(KnowledgeArticle.title == a["title"])
            )
        existing = result.scalar_one_or_none()
        if existing:
            # Update content
            existing.title = a["title"]
            existing.summary = a.get("summary", "")
            existing.content_md = a["content_md"]
            existing.author = a.get("author", "")
            existing.cover_emoji = a.get("cover_emoji", "📄")
            existing.reading_time_min = a.get("reading_time_min", 5)
        else:
            cat_slug = a.get("category_slug", "master")
            session.add(KnowledgeArticle(
                id=uuid.uuid4(),
                category_id=cat_map.get(cat_slug, cat_map.get("master")),
                title=a["title"],
                summary=a.get("summary", ""),
                content_md=a["content_md"],
                source_type=a.get("source_type", "ai_generated"),
                author=a.get("author", ""),
                cover_emoji=a.get("cover_emoji", "📄"),
                reading_time_min=a.get("reading_time_min", 5),
                related_template_id=a.get("related_template_id"),
                sort_order=a.get("sort_order", 0),
            ))
            count += 1

    await session.commit()
    logger.info("knowledge_seeded", new_articles=count, total=len(MASTER_ARTICLES))
    return count
