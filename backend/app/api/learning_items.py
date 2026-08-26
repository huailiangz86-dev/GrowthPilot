"""Workspace Learning Item API."""

import uuid
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.learning_engine import create_learning_item, get_learning_item, list_learning_items, update_learning_progress
from app.engines.workspace_engine import get_project, get_workspace
from app.models.goal import Goal
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/learning-items", tags=["learning-items"])
LearningKind = Literal["article", "course", "note", "book"]


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class LearningItemCreateRequest(BaseModel):
    workspace_id: str
    title: str = Field(min_length=1, max_length=240)
    summary: str = Field(default="", max_length=4000)
    kind: LearningKind = "note"
    duration_minutes: int | None = Field(default=None, ge=1, le=10080)
    project_id: str | None = None
    goal_id: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("summary")
    @classmethod
    def trim_summary(cls, value: str) -> str:
        return value.strip()


class LearningProgressRequest(BaseModel):
    progress: int = Field(ge=0, le=100)


class LearningItemResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    goal_id: str | None
    title: str
    summary: str
    kind: str
    status: str
    progress: int
    duration_minutes: int | None
    progress_updated_at: str | None
    created_at: str
    updated_at: str


def _response(item: WorkspaceLearningItem) -> LearningItemResponse:
    return LearningItemResponse(
        id=str(item.id),
        workspace_id=str(item.workspace_id),
        project_id=str(item.project_id) if item.project_id else None,
        goal_id=str(item.goal_id) if item.goal_id else None,
        title=item.title,
        summary=item.summary,
        kind=item.kind,
        status=item.status,
        progress=item.progress,
        duration_minutes=item.duration_minutes,
        progress_updated_at=item.progress_updated_at.isoformat() if item.progress_updated_at else None,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


async def _links(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, project_value: str | None, goal_value: str | None
) -> tuple[uuid.UUID | None, uuid.UUID | None]:
    project_id = None
    if project_value:
        project_id = _uuid(project_value, "Project")
        project = await get_project(session, user_id, project_id)
        if project is None or project.workspace_id != workspace_id:
            raise ValidationException("项目必须属于当前 Workspace")
    goal_id = None
    if goal_value:
        goal_id = _uuid(goal_value, "Goal")
        goal = (await session.execute(select(Goal).where(
            Goal.id == goal_id,
            Goal.user_id == user_id,
            Goal.workspace_id == workspace_id,
            Goal.archived_at.is_(None),
        ))).scalar_one_or_none()
        if goal is None:
            raise ValidationException("目标必须属于当前 Workspace")
    return project_id, goal_id


@router.post("", response_model=ApiResponse[LearningItemResponse])
async def create_learning_item_endpoint(
    payload: LearningItemCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[LearningItemResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    project_id, goal_id = await _links(session, uid, workspace.id, payload.project_id, payload.goal_id)
    item = await create_learning_item(
        session,
        workspace=workspace,
        values={
            "project_id": project_id,
            "goal_id": goal_id,
            "title": payload.title,
            "summary": payload.summary,
            "kind": payload.kind,
            "duration_minutes": payload.duration_minutes,
        },
    )
    await session.commit()
    await session.refresh(item)
    return ApiResponse(success=True, data=_response(item))


@router.get("", response_model=ApiResponse[list[LearningItemResponse]])
async def list_learning_items_endpoint(
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[LearningItemResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    items = await list_learning_items(session, uid, workspace.id)
    return ApiResponse(success=True, data=[_response(item) for item in items])


@router.patch("/{item_id}/progress", response_model=ApiResponse[LearningItemResponse])
async def update_learning_progress_endpoint(
    item_id: str,
    payload: LearningProgressRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[LearningItemResponse]:
    uid = _uuid(user_id, "User")
    item = await get_learning_item(session, uid, _uuid(item_id, "LearningItem"))
    if item is None:
        raise NotFoundException("LearningItem")
    await update_learning_progress(session, item, payload.progress)
    await session.commit()
    await session.refresh(item)
    return ApiResponse(success=True, data=_response(item))
