"""Universal Review Engine — template-based, scene-agnostic (Red Line R-07)."""

import uuid
from datetime import UTC, date, datetime

import structlog
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.review import Review
from app.models.review_template import ReviewTemplate

logger = structlog.get_logger()


async def seed_templates(session: AsyncSession) -> int:
    """Seed preset review templates. Upsert — updates existing templates if content changed."""
    from app.engines.review_templates_seed import PRESET_TEMPLATES

    count = 0
    for t in PRESET_TEMPLATES:
        result = await session.execute(select(ReviewTemplate).where(ReviewTemplate.id == t["id"]))
        existing = result.scalar_one_or_none()
        if existing is None:
            session.add(ReviewTemplate(
                id=t["id"], name=t["name"], description=t["description"],
                category=t["category"], sections=t["sections"],
                author=t.get("author"), philosophy=t.get("philosophy"),
                sort_order=t["sort_order"], is_system=True,
            ))
            count += 1
        else:
            # Update content if changed
            existing.name = t["name"]
            existing.description = t["description"]
            existing.sections = t["sections"]
            existing.sort_order = t["sort_order"]
            existing.author = t.get("author")
            existing.philosophy = t.get("philosophy")
    await session.commit()
    logger.info("review_templates_seeded", new=count, total=len(PRESET_TEMPLATES))
    return count


async def get_templates(session: AsyncSession, user_id: str | None = None) -> list[dict]:
    """Get available templates (system + user custom)."""
    filters = [ReviewTemplate.is_active.is_(True)]
    if user_id:
        filters.append((ReviewTemplate.is_system.is_(True)) | (ReviewTemplate.user_id == uuid.UUID(user_id)))
    else:
        filters.append(ReviewTemplate.is_system.is_(True))

    result = await session.execute(
        select(ReviewTemplate).where(and_(*filters)).order_by(ReviewTemplate.sort_order)
    )
    return [
        {"id": t.id, "name": t.name, "description": t.description, "category": t.category,
         "sections": t.sections, "author": t.author, "philosophy": t.philosophy}
        for t in result.scalars().all()
    ]


async def get_template(session: AsyncSession, template_id: str) -> dict | None:
    """Get a single template by ID."""
    result = await session.execute(select(ReviewTemplate).where(ReviewTemplate.id == template_id))
    t = result.scalar_one_or_none()
    if t is None:
        return None
    return {"id": t.id, "name": t.name, "description": t.description, "category": t.category,
            "sections": t.sections, "author": t.author, "philosophy": t.philosophy}


async def create_review(
    session: AsyncSession,
    user_id: str,
    template_id: str,
    answers: dict,
    scene: str = "trading",
    linked_record_ids: list[str] | None = None,
    review_date: date | None = None,
) -> Review:
    """Create a template-based review with structured answers."""
    # Extract did_right/did_wrong from answers for backward compat
    did_right = answers.get("did_right") or answers.get("best_trade")
    did_wrong = answers.get("did_wrong") or answers.get("worst_trade")
    next_plan = answers.get("lesson") or answers.get("tomorrow_plan") or answers.get("focus_areas")

    review = Review(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id),
        scene=scene,
        template=template_id,
        did_right=did_right,
        did_wrong=did_wrong,
        next_plan=next_plan,
        notes=None,
        tags=[],
        attachments=[],
        linked_record_ids=linked_record_ids or [],
        review_date=review_date or datetime.now(UTC).date(),
        ai_analysis={"template_id": template_id, "answers": answers},
    )
    session.add(review)
    await session.commit()
    await session.refresh(review)
    logger.info("review_created", id=str(review.id), template=template_id)
    return review


async def list_reviews(
    session: AsyncSession, user_id: str, scene: str | None = None,
    page: int = 1, page_size: int = 20,
) -> tuple[list[Review], int]:
    filters = [Review.user_id == uuid.UUID(user_id)]
    if scene:
        filters.append(Review.scene == scene)
    query = select(Review).where(and_(*filters))
    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar_one()
    query = query.order_by(Review.review_date.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await session.execute(query)
    return list(result.scalars().all()), total


async def get_review(session: AsyncSession, user_id: str, review_id: str) -> Review | None:
    result = await session.execute(
        select(Review).where(Review.id == uuid.UUID(review_id)).where(Review.user_id == uuid.UUID(user_id))
    )
    return result.scalar_one_or_none()
