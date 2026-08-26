from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.engines.tag_engine import (
    create_custom_tag,
    get_tag_cross_stats,
    get_tag_definitions,
    get_tag_stats,
    seed_preset_tags,
)
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/tags", tags=["tags"])


@router.get("", response_model=ApiResponse[list])
async def list_tags(
    scene: str = Query("trading"),
    category: str | None = None,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    data = await get_tag_definitions(session, user_id, scene, category)
    return ApiResponse(success=True, data=data)


class TagCreateRequest(BaseModel):
    scene: str = Field(default="trading")
    category: str = Field(...)
    value: str = Field(..., min_length=1, max_length=64)


@router.post("", response_model=ApiResponse[dict])
async def create_tag(
    payload: TagCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    data = await create_custom_tag(session, user_id, payload.scene, payload.category, payload.value)
    return ApiResponse(success=True, data=data)


@router.post("/seed", response_model=ApiResponse[dict])
async def seed_tags(session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    """Seed preset trading tags. Idempotent."""
    count = await seed_preset_tags(session)
    return ApiResponse(success=True, data={"seeded": count})


@router.get("/stats", response_model=ApiResponse[list])
async def tag_statistics(
    scene: str = Query("trading"),
    category: str = Query("buy_reason"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Tag win-rate statistics — the 'aha moment'."""
    data = await get_tag_stats(session, user_id, scene, category)
    return ApiResponse(success=True, data=data)


@router.get("/stats/cross", response_model=ApiResponse[list])
async def tag_cross_statistics(
    scene: str = Query("trading"),
    category_x: str = Query("buy_reason"),
    category_y: str = Query("emotion"),
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list]:
    """Cross-analysis: buy_reason × emotion win-rate matrix."""
    data = await get_tag_cross_stats(session, user_id, scene, category_x, category_y)
    return ApiResponse(success=True, data=data)
