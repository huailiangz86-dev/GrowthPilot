"""Owner-bound, read-only cloud reference-library test endpoints."""
from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator

from app.core.config import settings
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, ForbiddenException
from app.engines.bailian_knowledge import BailianKnowledge, KnowledgeConfig
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/bailian-knowledge", tags=["bailian-knowledge"])


def owner(user_id):
    if not settings.BAILIAN_OWNER_USER_ID or str(user_id) != settings.BAILIAN_OWNER_USER_ID:
        raise ForbiddenException("此测试连接尚未分配给当前账户。")


def provider(user_id):
    owner(user_id)
    return BailianKnowledge(KnowledgeConfig.load())


class RetrieveRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)
    rerank: bool = True
    consent: bool = False

    @field_validator("query")
    @classmethod
    def nonempty(cls, value):
        if not value.strip():
            raise ValueError("请输入检索问题。")
        return value.strip()


@router.get("/status")
async def status(user_id: str = Depends(get_current_user_id)):
    try:
        owner(user_id)
    except ForbiddenException:
        return ApiResponse(success=True, data={"available": False, "reason": "此测试连接尚未分配给当前账户。"})
    try:
        config = KnowledgeConfig.load()
    except AppException as error:
        return ApiResponse(success=True, data={"available": False, "reason": error.message})
    return ApiResponse(success=True, data={"available": True, **config.public()})


@router.get("/documents")
async def documents(page: int = Query(1, ge=1, le=10000), user_id: str = Depends(get_current_user_id)):
    return ApiResponse(success=True, data=await provider(user_id).documents(page))


@router.get("/documents/{file_id}/chunks")
async def chunks(file_id: str, page: int = Query(1, ge=1, le=10000), user_id: str = Depends(get_current_user_id)):
    return ApiResponse(success=True, data=await provider(user_id).chunks(file_id, page))


@router.post("/retrieve")
async def retrieve(payload: RetrieveRequest, user_id: str = Depends(get_current_user_id)):
    owner(user_id)
    if not payload.consent:
        raise ForbiddenException("请先允许将这次检索问题发送给阿里云百炼。")
    return ApiResponse(success=True, data=await provider(user_id).retrieve(payload.query, payload.rerank))
