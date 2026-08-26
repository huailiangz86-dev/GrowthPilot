"""Workspace Task API."""

import uuid
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.task_engine import block_task, complete_task, create_task, defer_task, get_task, update_task
from app.engines.workspace_engine import get_project, get_workspace
from app.models.task import Task
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/tasks", tags=["tasks"])
Priority = Literal["low", "medium", "high"]


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class TaskCreateRequest(BaseModel):
    workspace_id: str
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)
    priority: Priority = "medium"
    energy_required: int | None = Field(default=None, ge=1, le=5)
    time_block: int | None = Field(default=None, ge=5, le=720)
    due_at: datetime | None = None
    project_id: str | None = None
    goal_id: str | None = None
    plan_id: str | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("description")
    @classmethod
    def trim_description(cls, value: str) -> str:
        return value.strip()


class TaskUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    priority: Priority | None = None
    energy_required: int | None = Field(default=None, ge=1, le=5)
    time_block: int | None = Field(default=None, ge=5, le=720)
    due_at: datetime | None = None
    project_id: str | None = None
    goal_id: str | None = None
    plan_id: str | None = None

    @field_validator("title")
    @classmethod
    def optional_title_not_blank(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("description")
    @classmethod
    def trim_optional_description(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @model_validator(mode="after")
    def has_changes(self) -> "TaskUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一项需要修改的内容")
        return self


class TaskReasonRequest(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)
    due_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def reason_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("reason cannot be empty")
        return value


class TaskResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    goal_id: str | None
    plan_id: str | None
    title: str
    description: str
    status: str
    priority: str
    energy_required: int | None
    time_block: int | None
    due_at: str | None
    completed_at: str | None
    created_at: str
    updated_at: str


def _response(task: Task) -> TaskResponse:
    return TaskResponse(
        id=str(task.id), workspace_id=str(task.workspace_id), project_id=str(task.project_id) if task.project_id else None,
        goal_id=str(task.goal_id) if task.goal_id else None, plan_id=str(task.plan_id) if task.plan_id else None,
        title=task.title, description=task.description, status=task.status, priority=task.priority,
        energy_required=task.energy_required, time_block=task.time_block,
        due_at=task.due_at.isoformat() if task.due_at else None, completed_at=task.completed_at.isoformat() if task.completed_at else None,
        created_at=task.created_at.isoformat(), updated_at=task.updated_at.isoformat(),
    )


async def _project_id(session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, value: str | None) -> uuid.UUID | None:
    if value is None:
        return None
    project_id = _uuid(value, "Project")
    project = await get_project(session, user_id, project_id)
    if project is None or project.workspace_id != workspace_id:
        raise ValidationException("项目必须属于当前 Workspace")
    return project_id


@router.post("", response_model=ApiResponse[TaskResponse])
async def create_task_endpoint(payload: TaskCreateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[TaskResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    task = await create_task(session, workspace=workspace, values={
        "title": payload.title, "description": payload.description, "priority": payload.priority,
        "energy_required": payload.energy_required, "time_block": payload.time_block, "due_at": payload.due_at,
        "project_id": await _project_id(session, uid, workspace.id, payload.project_id),
        "goal_id": _uuid(payload.goal_id, "Goal") if payload.goal_id else None,
        "plan_id": _uuid(payload.plan_id, "GrowthPlan") if payload.plan_id else None,
    })
    await session.commit()
    await session.refresh(task)
    return ApiResponse(success=True, data=_response(task))


@router.get("", response_model=ApiResponse[list[TaskResponse]])
async def list_tasks(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list[TaskResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    result = await session.execute(select(Task).where(Task.user_id == uid, Task.workspace_id == workspace.id, Task.deleted_at.is_(None)).order_by(Task.due_at.asc().nullslast(), Task.created_at.desc()))
    return ApiResponse(success=True, data=[_response(item) for item in result.scalars().all()])


@router.patch("/{task_id}", response_model=ApiResponse[TaskResponse])
async def update_task_endpoint(task_id: str, payload: TaskUpdateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[TaskResponse]:
    uid = _uuid(user_id, "User")
    task = await get_task(session, uid, _uuid(task_id, "Task"))
    if task is None:
        raise NotFoundException("Task")
    changes = payload.model_dump(exclude_unset=True)
    if "project_id" in changes:
        changes["project_id"] = await _project_id(session, uid, task.workspace_id, changes["project_id"])
    for field in ("goal_id", "plan_id"):
        if field in changes and changes[field] is not None:
            changes[field] = _uuid(changes[field], "Goal" if field == "goal_id" else "GrowthPlan")
    await update_task(session, task, changes)
    await session.commit()
    await session.refresh(task)
    return ApiResponse(success=True, data=_response(task))


async def _action_task(task_id: str, user_id: str, session: AsyncSession) -> Task:
    task = await get_task(session, _uuid(user_id, "User"), _uuid(task_id, "Task"))
    if task is None:
        raise NotFoundException("Task")
    return task


@router.post("/{task_id}/complete", response_model=ApiResponse[TaskResponse])
async def complete_task_endpoint(task_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[TaskResponse]:
    task = await _action_task(task_id, user_id, session)
    if task.status not in {"todo", "doing", "done"}:
        raise ValidationException("只有待处理或进行中的任务可以完成")
    await complete_task(session, task)
    await session.commit()
    await session.refresh(task)
    return ApiResponse(success=True, data=_response(task))


@router.post("/{task_id}/defer", response_model=ApiResponse[TaskResponse])
async def defer_task_endpoint(task_id: str, payload: TaskReasonRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[TaskResponse]:
    task = await _action_task(task_id, user_id, session)
    if task.status == "done":
        raise ValidationException("已完成任务不能推迟")
    await defer_task(session, task, reason=payload.reason, due_at=payload.due_at)
    await session.commit()
    await session.refresh(task)
    return ApiResponse(success=True, data=_response(task))


@router.post("/{task_id}/block", response_model=ApiResponse[TaskResponse])
async def block_task_endpoint(task_id: str, payload: TaskReasonRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[TaskResponse]:
    task = await _action_task(task_id, user_id, session)
    if task.status == "done":
        raise ValidationException("已完成任务不能阻塞")
    await block_task(session, task, reason=payload.reason)
    await session.commit()
    await session.refresh(task)
    return ApiResponse(success=True, data=_response(task))
