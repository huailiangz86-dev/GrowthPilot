"""Workspace Goal API."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.mutation_receipts import prepare_mutation, record_mutation
from app.engines.workspace_engine import append_event, get_project, get_workspace
from app.models.goal import Goal
from app.models.workspace import Workspace
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/goals", tags=["goals"])


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class GoalCreateRequest(BaseModel):
    request_id: uuid.UUID | None = None
    workspace_id: str
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)
    project_id: str | None = None
    dimension: str | None = Field(default=None, max_length=32)
    goal_type: str | None = Field(default=None, max_length=32)
    due_at: datetime | None = None
    importance: int | None = Field(default=None, ge=1, le=5)
    target_metric: dict | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value


class GoalUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    project_id: str | None = None
    dimension: str | None = Field(default=None, max_length=32)
    goal_type: str | None = Field(default=None, max_length=32)
    due_at: datetime | None = None
    importance: int | None = Field(default=None, ge=1, le=5)
    target_metric: dict | None = None

    @model_validator(mode="after")
    def has_changes(self) -> "GoalUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一项需要修改的内容")
        return self


class GoalResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    title: str
    description: str
    dimension: str | None
    goal_type: str | None
    due_at: str | None
    importance: int | None
    target_metric: dict | None
    progress: int
    status: str


def _response(goal: Goal) -> GoalResponse:
    return GoalResponse(id=str(goal.id), workspace_id=str(goal.workspace_id), project_id=str(goal.project_id) if goal.project_id else None, title=goal.title, description=goal.description, dimension=goal.dimension, goal_type=goal.goal_type, due_at=goal.due_at.isoformat() if goal.due_at else None, importance=goal.importance, target_metric=goal.target_metric, progress=goal.progress, status=goal.status)


async def _project(session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, value: str | None) -> uuid.UUID | None:
    if value is None:
        return None
    project_id = _uuid(value, "Project")
    project = await get_project(session, user_id, project_id)
    if project is None or project.workspace_id != workspace_id:
        raise ValidationException("项目必须属于当前 Workspace")
    return project_id


@router.post("", response_model=ApiResponse[GoalResponse])
async def create_goal(payload: GoalCreateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[GoalResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    fingerprint, receipt = await prepare_mutation(session, uid, workspace.id, payload.request_id, "goal_create", payload)
    if receipt is not None:
        return ApiResponse(success=True, data=GoalResponse.model_validate(receipt))
    goal = Goal(id=uuid.uuid4(), user_id=uid, workspace_id=workspace.id, project_id=await _project(session, uid, workspace.id, payload.project_id), title=payload.title, description=payload.description, dimension=payload.dimension, goal_type=payload.goal_type, due_at=payload.due_at, importance=payload.importance, target_metric=payload.target_metric)
    session.add(goal)
    await append_event(session, user_id=uid, workspace_id=workspace.id, project_id=goal.project_id, event_type="goal_created", source_type="goal", source_id=goal.id, payload={"title": goal.title, "goal_type": goal.goal_type, "importance": goal.importance})
    await session.flush()
    await session.refresh(goal)
    result = _response(goal)
    record_mutation(session, uid, workspace.id, payload.request_id, fingerprint, result)
    await session.commit()
    return ApiResponse(success=True, data=result)


@router.get("", response_model=ApiResponse[list[GoalResponse]])
async def list_goals(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list[GoalResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    result = await session.execute(select(Goal).where(Goal.user_id == uid, Goal.workspace_id == workspace.id, Goal.archived_at.is_(None)).order_by(Goal.created_at.desc()))
    return ApiResponse(success=True, data=[_response(goal) for goal in result.scalars().all()])


@router.patch("/{goal_id}", response_model=ApiResponse[GoalResponse])
async def update_goal(goal_id: str, payload: GoalUpdateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[GoalResponse]:
    uid = _uuid(user_id, "User")
    result = await session.execute(
        select(Goal)
        .join(Workspace, Goal.workspace_id == Workspace.id)
        .where(
            Goal.id == _uuid(goal_id, "Goal"),
            Goal.user_id == uid,
            Goal.archived_at.is_(None),
            Workspace.user_id == uid,
            Workspace.archived_at.is_(None),
        )
    )
    goal = result.scalar_one_or_none()
    if goal is None:
        raise NotFoundException("Goal")
    changes = payload.model_dump(exclude_unset=True)
    if "project_id" in changes:
        changes["project_id"] = await _project(session, uid, goal.workspace_id, changes["project_id"])
    for field, value in changes.items():
        setattr(goal, field, value)
    await append_event(session, user_id=uid, workspace_id=goal.workspace_id, project_id=goal.project_id, event_type="goal_updated", source_type="goal", source_id=goal.id, payload=changes)
    await session.commit()
    await session.refresh(goal)
    return ApiResponse(success=True, data=_response(goal))
