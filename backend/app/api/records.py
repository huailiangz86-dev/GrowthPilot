from datetime import datetime

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException
from app.engines.record_engine import create_record, get_record, list_records, soft_delete_record, update_record
from app.schemas.common import ApiResponse, PaginatedResponse

router = APIRouter(prefix="/records", tags=["records"])


class RecordCreateRequest(BaseModel):
    scene: str = Field(..., pattern=r"^(trading|career|skill)$")
    record_type: str = Field(..., max_length=32)
    title: str = Field(..., min_length=1, max_length=200)
    content: dict = Field(default_factory=dict)
    tags: list[dict] = Field(default_factory=list)  # [{"category":"buy_reason","value":"突破前高"}]
    emotion: str | None = None
    occurred_at: datetime
    attachments: list[dict] = Field(default_factory=list)


class RecordResponse(BaseModel):
    id: str
    scene: str
    record_type: str
    title: str
    content: dict
    tags: list[dict]
    emotion: str | None
    occurred_at: str
    proof_hash_short: str
    attachments: list[dict]
    created_at: str


def _to_response(r) -> RecordResponse:
    return RecordResponse(
        id=str(r.id), scene=r.scene, record_type=r.record_type, title=r.title,
        content=r.content, tags=r.tags, emotion=r.emotion,
        occurred_at=r.occurred_at.isoformat(), proof_hash_short=r.proof_hash[:8],
        attachments=r.attachments, created_at=r.created_at.isoformat(),
    )


@router.post("", response_model=ApiResponse[RecordResponse])
async def create(
    payload: RecordCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RecordResponse]:
    record = await create_record(
        session=session, user_id=user_id,
        scene=payload.scene, record_type=payload.record_type,
        title=payload.title, content=payload.content,
        tags=payload.tags, emotion=payload.emotion,
        occurred_at=payload.occurred_at, attachments=payload.attachments,
    )
    # Auto-complete daily task
    try:
        from app.engines.growth_engine import complete_task
        await complete_task(session, user_id, "recorded")
    except Exception:
        pass
    return ApiResponse(success=True, data=_to_response(record))


@router.get("", response_model=ApiResponse[PaginatedResponse[RecordResponse]])
async def list_all(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    scene: str | None = None,
    record_type: str | None = None,
    keyword: str | None = None,
    tag_category: str | None = None,
    tag_value: str | None = None,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PaginatedResponse[RecordResponse]]:
    tag_filter = {"category": tag_category, "value": tag_value} if tag_category and tag_value else None
    items, total = await list_records(
        session, user_id, scene=scene, record_type=record_type,
        tag_filter=tag_filter, keyword=keyword, page=page, page_size=page_size,
    )
    return ApiResponse(
        success=True,
        data=PaginatedResponse(items=[_to_response(r) for r in items], total=total, page=page, page_size=page_size),
    )


@router.get("/{record_id}", response_model=ApiResponse[RecordResponse])
async def get_one(
    record_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RecordResponse]:
    record = await get_record(session, user_id, record_id)
    if record is None:
        raise NotFoundException("Record")
    return ApiResponse(success=True, data=_to_response(record))


@router.patch("/{record_id}", response_model=ApiResponse[RecordResponse])
async def update(
    record_id: str,
    payload: dict,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[RecordResponse]:
    record = await update_record(session, user_id, record_id, payload)
    if record is None:
        raise NotFoundException("Record")
    return ApiResponse(success=True, data=_to_response(record))


@router.delete("/{record_id}", response_model=ApiResponse[dict])
async def delete(
    record_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[dict]:
    if not await soft_delete_record(session, user_id, record_id):
        raise NotFoundException("Record")
    return ApiResponse(success=True, data={"deleted": True})
