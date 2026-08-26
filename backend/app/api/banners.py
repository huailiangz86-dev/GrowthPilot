from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.growth import Banner
from app.schemas.common import ApiResponse

router = APIRouter(tags=["banners"])


@router.get("/banners", response_model=ApiResponse[list])
async def list_banners(session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    result = await session.execute(
        select(Banner).where(Banner.is_active.is_(True)).order_by(Banner.sort_order)
    )
    return ApiResponse(success=True, data=[
        {"id": str(b.id), "title": b.title, "image_url": b.image_url, "link_type": b.link_type, "link_target": b.link_target}
        for b in result.scalars().all()
    ])
