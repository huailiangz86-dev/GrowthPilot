"""Knowledge Base API — categories, articles, progress, bookmarks."""

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException
from app.models.knowledge import (
    KnowledgeArticle,
    KnowledgeCategory,
    UserBookmark,
    UserLearningProgress,
)
from app.schemas.common import ApiResponse, PaginatedResponse

router = APIRouter(prefix="/knowledge-base", tags=["knowledge-base"])


# ── Categories ──

@router.get("/categories", response_model=ApiResponse[list])
async def list_categories(session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    result = await session.execute(
        select(KnowledgeCategory).where(KnowledgeCategory.is_active.is_(True)).order_by(KnowledgeCategory.sort_order)
    )
    return ApiResponse(success=True, data=[
        {"id": str(c.id), "name": c.name, "slug": c.slug, "icon": c.icon}
        for c in result.scalars().all()
    ])


# ── Articles ──

@router.get("/articles", response_model=ApiResponse[dict])
async def list_articles(
    category: str | None = Query(None),
    keyword: str | None = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    filters = [KnowledgeArticle.is_active.is_(True)]
    if category:
        cat_q = await session.execute(select(KnowledgeCategory.id).where(KnowledgeCategory.slug == category))
        cat_id = cat_q.scalar_one_or_none()
        if cat_id:
            filters.append(KnowledgeArticle.category_id == cat_id)
    if keyword:
        filters.append(KnowledgeArticle.title.ilike(f"%{keyword}%"))

    query = select(KnowledgeArticle).where(and_(*filters)).order_by(KnowledgeArticle.sort_order)
    count_q = select(func.count()).select_from(query.subquery())
    total = (await session.execute(count_q)).scalar_one()
    result = await session.execute(query.offset((page - 1) * page_size).limit(page_size))

    return ApiResponse(success=True, data={
        "items": [
            {
                "id": str(a.id), "title": a.title, "summary": a.summary,
                "author": a.author, "cover_emoji": a.cover_emoji,
                "reading_time_min": a.reading_time_min,
                "related_template_id": a.related_template_id,
                "source_type": a.source_type,
            }
            for a in result.scalars().all()
        ],
        "total": total, "page": page, "page_size": page_size,
    })


@router.post("/resolve-titles", response_model=ApiResponse[dict])
async def resolve_titles(
    payload: dict,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Resolve article titles to IDs for learning path navigation."""
    titles = payload.get("titles", [])
    if not titles:
        return ApiResponse(success=True, data={})

    result_map = {}
    for title in titles[:50]:
        # Try exact match, then keyword match
        for search in [title, title.split("：")[-1], title.split(":")[-1]]:
            result = await session.execute(
                select(KnowledgeArticle.id, KnowledgeArticle.title).where(
                    KnowledgeArticle.title.ilike(f"%{search.strip()}%")
                ).limit(1)
            )
            row = result.first()
            if row:
                result_map[title] = str(row[0])
                break

    return ApiResponse(success=True, data=result_map)


@router.get("/articles/{article_id}", response_model=ApiResponse[dict])
async def get_article(article_id: str, session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    result = await session.execute(
        select(KnowledgeArticle).where(KnowledgeArticle.id == uuid.UUID(article_id))
    )
    a = result.scalar_one_or_none()
    if not a:
        raise NotFoundException("Article")
    return ApiResponse(success=True, data={
        "id": str(a.id), "title": a.title, "summary": a.summary,
        "content_md": a.content_md, "author": a.author,
        "cover_emoji": a.cover_emoji, "reading_time_min": a.reading_time_min,
        "source_type": a.source_type, "related_template_id": a.related_template_id,
    })


# ── Progress ──

class ProgressRequest(BaseModel):
    article_id: str
    status: str = "completed"
    notes: str | None = None


@router.post("/progress", response_model=ApiResponse[dict])
async def update_progress(
    payload: ProgressRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    uid = uuid.UUID(user_id)
    aid = uuid.UUID(payload.article_id)
    result = await session.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == uid, UserLearningProgress.article_id == aid
        )
    )
    progress = result.scalar_one_or_none()
    if progress:
        progress.status = payload.status
        if payload.notes is not None:
            progress.notes = payload.notes
        if payload.status == "completed":
            progress.read_at = datetime.now(UTC)
    else:
        session.add(UserLearningProgress(
            id=uuid.uuid4(), user_id=uid, article_id=aid,
            status=payload.status,
            notes=payload.notes,
            read_at=datetime.now(UTC) if payload.status == "completed" else None,
        ))
    await session.commit()
    return ApiResponse(success=True, data={"status": payload.status})


@router.get("/progress/{article_id}", response_model=ApiResponse[dict])
async def get_progress(
    article_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Get progress and notes for a specific article."""
    uid = uuid.UUID(user_id)
    aid = uuid.UUID(article_id)
    result = await session.execute(
        select(UserLearningProgress).where(
            UserLearningProgress.user_id == uid, UserLearningProgress.article_id == aid
        )
    )
    p = result.scalar_one_or_none()
    if not p:
        return ApiResponse(success=True, data={"status": "unread", "notes": None})
    return ApiResponse(success=True, data={
        "status": p.status, "notes": p.notes,
        "read_at": p.read_at.isoformat() if p.read_at else None,
    })


@router.get("/my-notes", response_model=ApiResponse[list])
async def my_notes(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Get all user notes across articles."""
    uid = uuid.UUID(user_id)
    result = await session.execute(
        select(UserLearningProgress, KnowledgeArticle.title, KnowledgeArticle.cover_emoji).join(
            KnowledgeArticle, UserLearningProgress.article_id == KnowledgeArticle.id
        ).where(
            and_(UserLearningProgress.user_id == uid, UserLearningProgress.notes.isnot(None), UserLearningProgress.notes != "")
        ).order_by(UserLearningProgress.read_at.desc())
    )
    return ApiResponse(success=True, data=[
        {
            "article_id": str(row[0].article_id), "title": row[1], "cover_emoji": row[2],
            "notes": row[0].notes, "read_at": row[0].read_at.isoformat() if row[0].read_at else None,
        }
        for row in result.all()
    ])


# ── Reading Progress (batch) ──

@router.get("/reading-progress", response_model=ApiResponse[dict])
async def reading_progress(
    article_ids: str = Query(..., description="Comma-separated article IDs"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    """Return {article_id: status} map for the given article IDs."""
    uid = uuid.UUID(user_id)
    ids = [uuid.UUID(aid.strip()) for aid in article_ids.split(",") if aid.strip()]
    if not ids:
        return ApiResponse(success=True, data={})
    result = await session.execute(
        select(UserLearningProgress.article_id, UserLearningProgress.status).where(
            UserLearningProgress.user_id == uid,
            UserLearningProgress.article_id.in_(ids),
        )
    )
    progress_map = {str(row[0]): row[1] for row in result.all()}
    return ApiResponse(success=True, data=progress_map)


# ── Bookmarks ──

class BookmarkRequest(BaseModel):
    article_id: str


@router.post("/bookmarks", response_model=ApiResponse[dict])
async def add_bookmark(
    payload: BookmarkRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    uid = uuid.UUID(user_id)
    aid = uuid.UUID(payload.article_id)
    existing = await session.execute(
        select(UserBookmark).where(UserBookmark.user_id == uid, UserBookmark.article_id == aid)
    )
    if not existing.scalar_one_or_none():
        session.add(UserBookmark(id=uuid.uuid4(), user_id=uid, article_id=aid))
        await session.commit()
    return ApiResponse(success=True, data={"bookmarked": True})


@router.delete("/bookmarks/{article_id}", response_model=ApiResponse[dict])
async def remove_bookmark(
    article_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    uid = uuid.UUID(user_id)
    aid = uuid.UUID(article_id)
    result = await session.execute(
        select(UserBookmark).where(UserBookmark.user_id == uid, UserBookmark.article_id == aid)
    )
    bm = result.scalar_one_or_none()
    if bm:
        await session.delete(bm)
        await session.commit()
    return ApiResponse(success=True, data={"bookmarked": False})
