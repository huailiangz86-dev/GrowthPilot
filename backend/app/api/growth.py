from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.engines.growth_engine import check_in, complete_task, get_achievements, get_daily_tasks, get_progress
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/growth", tags=["growth"])


@router.get("/tasks", response_model=ApiResponse[dict])
async def tasks(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    return ApiResponse(success=True, data=await get_daily_tasks(session, user_id))


@router.post("/tasks/{task_type}/complete", response_model=ApiResponse[dict])
async def complete(task_type: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    return ApiResponse(success=True, data=await complete_task(session, user_id, task_type))


@router.post("/check-in", response_model=ApiResponse[dict])
async def checkin(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    return ApiResponse(success=True, data=await check_in(session, user_id))


@router.get("/achievements", response_model=ApiResponse[list])
async def achievements(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list]:
    return ApiResponse(success=True, data=await get_achievements(session, user_id))


@router.get("/progress", response_model=ApiResponse[dict])
async def progress(user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    return ApiResponse(success=True, data=await get_progress(session, user_id))
