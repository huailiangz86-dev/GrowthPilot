"""News API — placeholder for RSS/scraper integration."""

import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.models.news import NewsItem
from app.models.user import User
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/news", tags=["news"])


@router.get("", response_model=ApiResponse[list])
async def get_news(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Get news related to user's watchlist. Precise > broad."""
    uid = uuid.UUID(user_id)

    # Get user watchlist
    user_result = await session.execute(select(User).where(User.id == uid))
    user = user_result.scalar_one_or_none()
    watchlist = user.watchlist if user and user.watchlist else []

    # Get recent news (with symbol matching if watchlist exists)
    query = select(NewsItem).order_by(NewsItem.published_at.desc()).limit(20)
    result = await session.execute(query)
    all_news = result.scalars().all()

    # Filter by watchlist if available
    if watchlist:
        matched = [n for n in all_news if any(s in (n.related_symbols or []) for s in watchlist)]
        # Pad with general news if not enough matches
        if len(matched) < 5:
            general = [n for n in all_news if n not in matched]
            matched.extend(general[:5 - len(matched)])
        news = matched[:10]
    else:
        news = all_news[:10]

    result_list = [
        {"id": str(n.id), "title": n.title, "summary": n.summary, "source": n.source,
         "sentiment": n.sentiment, "url": n.url, "published_at": n.published_at.isoformat()}
        for n in news
    ]

    # Fallback to Sina finance if DB is empty
    if not result_list:
        try:
            import httpx
            async with httpx.AsyncClient(trust_env=False, timeout=5) as client:
                resp = await client.get("https://feed.mix.sina.com.cn/api/roll/get",
                    params={"pageid": 153, "lid": 2516, "num": 10, "page": 1})
                sina = resp.json()
            for item in sina.get("result", {}).get("data", [])[:10]:
                title = item.get("title", "").strip()
                if title:
                    result_list.append({
                        "id": item.get("oid", ""), "title": title,
                        "summary": (item.get("intro") or "")[:80],
                        "source": "新浪财经", "sentiment": None,
                    })
        except Exception:
            pass

    return ApiResponse(success=True, data=result_list)


@router.get("/trending", response_model=ApiResponse[list])
async def trending(session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    """Top trending news (no auth required for preview)."""
    result = await session.execute(
        select(NewsItem).order_by(NewsItem.published_at.desc()).limit(5)
    )
    return ApiResponse(success=True, data=[
        {"id": str(n.id), "title": n.title, "summary": n.summary, "sentiment": n.sentiment}
        for n in result.scalars().all()
    ])
