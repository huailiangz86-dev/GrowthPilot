"""Workspace Reflection API."""

import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.daily_preferences import user_today
from app.engines.reflection_engine import list_workspace_reflections, save_reflection
from app.engines.task_engine import get_task
from app.engines.workspace_engine import get_project, get_workspace
from app.models.goal import Goal
from app.models.user import User
from app.models.workspace_reflection import WorkspaceReflection
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/reflections", tags=["reflections"])
ReflectionType = Literal["morning", "micro", "evening"]
MicroType = Literal["progress", "decision", "emotion", "idea", "learning"]


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class ReflectionSaveRequest(BaseModel):
    workspace_id: str
    reflection_type: ReflectionType
    reflection_date: date
    energy: int | None = Field(default=None, ge=1, le=5)
    intention: str | None = Field(default=None, max_length=1000)
    completion: int | None = Field(default=None, ge=0, le=100)
    wins: str | None = Field(default=None, max_length=2000)
    friction: str | None = Field(default=None, max_length=2000)
    adjustment: str | None = Field(default=None, max_length=2000)
    mood: str | None = Field(default=None, max_length=32)
    micro_type: MicroType | None = None
    micro_status: str | None = Field(default=None, max_length=32)
    content: str | None = Field(default=None, max_length=4000)
    project_id: str | None = None
    goal_id: str | None = None
    task_id: str | None = None
    is_makeup: bool = False

    @field_validator("intention", "wins", "friction", "adjustment", "mood", "micro_status", "content")
    @classmethod
    def trim_optional_text(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @model_validator(mode="after")
    def validate_reflection_shape(self) -> "ReflectionSaveRequest":
        if self.reflection_type == "morning" and self.energy is None:
            raise ValueError("晨间启动需要能量值")
        if self.reflection_type == "evening" and self.completion is None:
            raise ValueError("晚间复盘需要完成度")
        if self.reflection_type == "micro":
            if not self.content:
                raise ValueError("快速记录需要内容")
            if self.micro_type is None or self.micro_status is None:
                raise ValueError("快速记录需要类型和状态")
        return self


class ReflectionResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    goal_id: str | None
    task_id: str | None
    reflection_type: str
    reflection_date: str
    energy: int | None
    intention: str | None
    completion: int | None
    wins: str | None
    friction: str | None
    adjustment: str | None
    mood: str | None
    micro_type: str | None
    micro_status: str | None
    content: str | None
    is_makeup: bool
    created_at: str
    updated_at: str


def _response(item: WorkspaceReflection) -> ReflectionResponse:
    return ReflectionResponse(
        id=str(item.id),
        workspace_id=str(item.workspace_id),
        project_id=str(item.project_id) if item.project_id else None,
        goal_id=str(item.goal_id) if item.goal_id else None,
        task_id=str(item.task_id) if item.task_id else None,
        reflection_type=item.reflection_type,
        reflection_date=item.reflection_date.isoformat(),
        energy=item.energy,
        intention=item.intention,
        completion=item.completion,
        wins=item.wins,
        friction=item.friction,
        adjustment=item.adjustment,
        mood=item.mood,
        micro_type=item.micro_type,
        micro_status=item.micro_status,
        content=item.content,
        is_makeup=item.is_makeup,
        created_at=item.created_at.isoformat(),
        updated_at=item.updated_at.isoformat(),
    )


async def _links(
    session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, payload: ReflectionSaveRequest
) -> tuple[uuid.UUID | None, uuid.UUID | None, uuid.UUID | None]:
    project_id = None
    if payload.project_id:
        project_id = _uuid(payload.project_id, "Project")
        project = await get_project(session, user_id, project_id)
        if project is None or project.workspace_id != workspace_id:
            raise ValidationException("项目必须属于当前 Workspace")
    goal_id = None
    if payload.goal_id:
        goal_id = _uuid(payload.goal_id, "Goal")
        goal = (await session.execute(select(Goal).where(
            Goal.id == goal_id,
            Goal.user_id == user_id,
            Goal.workspace_id == workspace_id,
            Goal.archived_at.is_(None),
        ))).scalar_one_or_none()
        if goal is None:
            raise ValidationException("目标必须属于当前 Workspace")
    task_id = None
    if payload.task_id:
        task_id = _uuid(payload.task_id, "Task")
        task = await get_task(session, user_id, task_id)
        if task is None or task.workspace_id != workspace_id:
            raise ValidationException("任务必须属于当前 Workspace")
    return project_id, goal_id, task_id


@router.post("", response_model=ApiResponse[ReflectionResponse])
async def save_reflection_endpoint(
    payload: ReflectionSaveRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ReflectionResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    user = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    project_id, goal_id, task_id = await _links(session, uid, workspace.id, payload)
    reflection = await save_reflection(
        session,
        workspace=workspace,
        values={
            "project_id": project_id,
            "goal_id": goal_id,
            "task_id": task_id,
            "reflection_type": payload.reflection_type,
            "reflection_date": payload.reflection_date if payload.is_makeup else user_today(user.settings),
            "energy": payload.energy,
            "intention": payload.intention,
            "completion": payload.completion,
            "wins": payload.wins,
            "friction": payload.friction,
            "adjustment": payload.adjustment,
            "mood": payload.mood,
            "micro_type": payload.micro_type,
            "micro_status": payload.micro_status,
            "content": payload.content,
            "is_makeup": payload.is_makeup,
        },
    )
    await session.commit()
    await session.refresh(reflection)
    return ApiResponse(success=True, data=_response(reflection))


@router.get("", response_model=ApiResponse[list[ReflectionResponse]])
async def list_reflections(
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ReflectionResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    reflections = await list_workspace_reflections(session, uid, workspace.id)
    return ApiResponse(success=True, data=[_response(item) for item in reflections])
