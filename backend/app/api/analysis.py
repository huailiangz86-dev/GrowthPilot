from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.engines.emotion_engine import get_best_state, get_emotion_correlation, get_emotion_trend
from app.engines.persona_engine import get_full_profile
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/analysis", tags=["analysis"])


@router.get("/emotion/correlation", response_model=ApiResponse[list])
async def emotion_corr(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    return ApiResponse(success=True, data=await get_emotion_correlation(session, user_id))


@router.get("/emotion/trend", response_model=ApiResponse[list])
async def emotion_trend(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    return ApiResponse(success=True, data=await get_emotion_trend(session, user_id))


@router.get("/emotion/best-state", response_model=ApiResponse[dict | None])
async def best_state(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict | None]:
    return ApiResponse(success=True, data=await get_best_state(session, user_id))


@router.get("/persona", response_model=ApiResponse[dict])
async def persona(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    """Trading style profile — 6 dimensions + style matching."""
    return ApiResponse(success=True, data=await get_full_profile(session, user_id))
