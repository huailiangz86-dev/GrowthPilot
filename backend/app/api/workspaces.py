"""Workspace, Project and Workspace Event API."""

import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException, ValidationException
from app.engines.mutation_receipts import prepare_mutation, record_mutation
from app.engines.workspace_engine import (
    archive_project,
    archive_workspace,
    create_project,
    create_workspace,
    get_project,
    project_query,
    get_workspace,
    update_project,
    update_workspace,
)
from app.models.workspace import Project, Workspace, WorkspaceEvent
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/workspaces", tags=["workspaces"])
projects_router = APIRouter(prefix="/projects", tags=["projects"])

WorkspaceType = Literal["personal", "work", "life", "learning"]
ProjectStatus = Literal["active", "paused", "completed"]
ProjectPriority = Literal["low", "medium", "high"]


def _parse_id(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


def _parse_user_id(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise ValidationException("当前登录状态无效，请重新登录") from exc


def _trim(value: str, field_name: str) -> str:
    normalized = value.strip()
    if not normalized:
        raise ValueError(f"{field_name} cannot be empty")
    return normalized


class WorkspaceCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    workspace_type: WorkspaceType = "personal"
    icon: str | None = Field(default=None, max_length=24)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _trim(value, "name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("icon")
    @classmethod
    def normalize_icon(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class WorkspaceUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=2000)
    workspace_type: WorkspaceType | None = None
    icon: str | None = Field(default=None, max_length=24)

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        return _trim(value, "name") if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("icon")
    @classmethod
    def normalize_optional_icon(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @model_validator(mode="after")
    def validate_has_changes(self) -> "WorkspaceUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一项需要修改的内容")
        return self


class ProjectCreateRequest(BaseModel):
    request_id: uuid.UUID | None = None
    workspace_id: str
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    status: ProjectStatus = "active"
    priority: ProjectPriority = "medium"
    progress: int = Field(default=0, ge=0, le=100)
    next_action: str | None = Field(default=None, max_length=1000)
    due_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return _trim(value, "name")

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("next_action")
    @classmethod
    def normalize_next_action(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class ProjectUpdateRequest(BaseModel):
    request_id: uuid.UUID | None = None
    expected_updated_at: datetime | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    status: ProjectStatus | None = None
    priority: ProjectPriority | None = None
    progress: int | None = Field(default=None, ge=0, le=100)
    next_action: str | None = Field(default=None, max_length=1000)
    due_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def normalize_optional_name(cls, value: str | None) -> str | None:
        return _trim(value, "name") if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_optional_description(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("next_action")
    @classmethod
    def normalize_optional_next_action(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None

    @model_validator(mode="after")
    def validate_has_changes(self) -> "ProjectUpdateRequest":
        if not self.model_fields_set - {"request_id", "expected_updated_at"}:
            raise ValueError("至少提供一项需要修改的内容")
        if self.expected_updated_at is not None and self.expected_updated_at.utcoffset() is None:
            raise ValueError("项目版本时间必须包含时区")
        for field in ("name", "description", "status", "priority", "progress"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} 不能为 null")
        return self


class WorkspaceResponse(BaseModel):
    id: str
    name: str
    description: str
    workspace_type: str
    status: str
    icon: str | None
    active_project_id: str | None
    last_opened_at: str | None
    created_at: str
    updated_at: str
    archived_at: str | None


class ProjectResponse(BaseModel):
    id: str
    workspace_id: str
    name: str
    description: str
    status: str
    priority: str
    progress: int
    next_action: str | None
    due_at: str | None
    last_activity_at: str | None
    created_at: str
    updated_at: str
    archived_at: str | None


class WorkspaceEventResponse(BaseModel):
    id: str
    workspace_id: str | None
    project_id: str | None
    event_type: str
    source_type: str
    source_id: str | None
    payload: dict
    occurred_at: str


def _date_value(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _workspace_response(workspace: Workspace) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=str(workspace.id),
        name=workspace.name,
        description=workspace.description,
        workspace_type=workspace.workspace_type,
        status=workspace.status,
        icon=workspace.icon,
        active_project_id=str(workspace.active_project_id) if workspace.active_project_id else None,
        last_opened_at=_date_value(workspace.last_opened_at),
        created_at=workspace.created_at.isoformat(),
        updated_at=workspace.updated_at.isoformat(),
        archived_at=_date_value(workspace.archived_at),
    )


def _project_response(project: Project) -> ProjectResponse:
    return ProjectResponse(
        id=str(project.id),
        workspace_id=str(project.workspace_id),
        name=project.name,
        description=project.description,
        status=project.status,
        priority=project.priority,
        progress=project.progress,
        next_action=project.next_action,
        due_at=_date_value(project.due_at),
        last_activity_at=_date_value(project.last_activity_at),
        created_at=project.created_at.isoformat(),
        updated_at=project.updated_at.isoformat(),
        archived_at=_date_value(project.archived_at),
    )


def _event_response(event: WorkspaceEvent) -> WorkspaceEventResponse:
    return WorkspaceEventResponse(
        id=str(event.id),
        workspace_id=str(event.workspace_id) if event.workspace_id else None,
        project_id=str(event.project_id) if event.project_id else None,
        event_type=event.event_type,
        source_type=event.source_type,
        source_id=str(event.source_id) if event.source_id else None,
        payload=event.payload or {},
        occurred_at=event.occurred_at.isoformat(),
    )


@router.post("", response_model=ApiResponse[WorkspaceResponse])
async def create_workspace_endpoint(
    payload: WorkspaceCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[WorkspaceResponse]:
    workspace = await create_workspace(
        session,
        user_id=_parse_user_id(user_id),
        name=payload.name,
        description=payload.description,
        workspace_type=payload.workspace_type,
        icon=payload.icon,
    )
    await session.commit()
    await session.refresh(workspace)
    return ApiResponse(success=True, data=_workspace_response(workspace))


@router.get("", response_model=ApiResponse[list[WorkspaceResponse]])
async def list_workspaces(
    include_archived: bool = False,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[WorkspaceResponse]]:
    normalized_user_id = _parse_user_id(user_id)
    query = select(Workspace).where(Workspace.user_id == normalized_user_id)
    if not include_archived:
        query = query.where(Workspace.archived_at.is_(None))
    query = query.order_by(Workspace.updated_at.desc(), Workspace.created_at.desc())
    result = await session.execute(query)
    return ApiResponse(success=True, data=[_workspace_response(item) for item in result.scalars().all()])


@router.get("/{workspace_id}", response_model=ApiResponse[WorkspaceResponse])
async def get_workspace_endpoint(
    workspace_id: str,
    include_archived: bool = False,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[WorkspaceResponse]:
    workspace = await get_workspace(
        session,
        _parse_user_id(user_id),
        _parse_id(workspace_id, "Workspace"),
        include_archived=include_archived,
    )
    if workspace is None:
        raise NotFoundException("Workspace")
    return ApiResponse(success=True, data=_workspace_response(workspace))


@router.patch("/{workspace_id}", response_model=ApiResponse[WorkspaceResponse])
async def update_workspace_endpoint(
    workspace_id: str,
    payload: WorkspaceUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[WorkspaceResponse]:
    workspace = await get_workspace(session, _parse_user_id(user_id), _parse_id(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    await update_workspace(session, workspace, payload.model_dump(exclude_unset=True))
    await session.commit()
    await session.refresh(workspace)
    return ApiResponse(success=True, data=_workspace_response(workspace))


@router.post("/{workspace_id}/archive", response_model=ApiResponse[WorkspaceResponse])
async def archive_workspace_endpoint(
    workspace_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[WorkspaceResponse]:
    workspace = await get_workspace(session, _parse_user_id(user_id), _parse_id(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    await archive_workspace(session, workspace)
    await session.commit()
    await session.refresh(workspace)
    return ApiResponse(success=True, data=_workspace_response(workspace))


@router.get("/{workspace_id}/projects", response_model=ApiResponse[list[ProjectResponse]])
async def list_projects(
    workspace_id: str,
    include_archived: bool = False,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[ProjectResponse]]:
    normalized_user_id = _parse_user_id(user_id)
    workspace = await get_workspace(
        session,
        normalized_user_id,
        _parse_id(workspace_id, "Workspace"),
        include_archived=include_archived,
    )
    if workspace is None:
        raise NotFoundException("Workspace")
    query = select(Project).where(Project.workspace_id == workspace.id, Project.user_id == normalized_user_id)
    if not include_archived:
        query = query.where(Project.archived_at.is_(None))
    query = query.order_by(Project.last_activity_at.desc().nullslast(), Project.created_at.desc())
    result = await session.execute(query)
    return ApiResponse(success=True, data=[_project_response(item) for item in result.scalars().all()])


@router.get("/{workspace_id}/events", response_model=ApiResponse[list[WorkspaceEventResponse]])
async def list_workspace_events(
    workspace_id: str,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    include_archived: bool = False,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[WorkspaceEventResponse]]:
    normalized_user_id = _parse_user_id(user_id)
    workspace = await get_workspace(
        session,
        normalized_user_id,
        _parse_id(workspace_id, "Workspace"),
        include_archived=include_archived,
    )
    if workspace is None:
        raise NotFoundException("Workspace")
    result = await session.execute(
        select(WorkspaceEvent)
        .where(WorkspaceEvent.user_id == normalized_user_id, WorkspaceEvent.workspace_id == workspace.id)
        .order_by(WorkspaceEvent.occurred_at.desc(), WorkspaceEvent.created_at.desc())
        .limit(limit)
    )
    return ApiResponse(success=True, data=[_event_response(item) for item in result.scalars().all()])


@projects_router.post("", response_model=ApiResponse[ProjectResponse])
async def create_project_endpoint(
    payload: ProjectCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectResponse]:
    normalized_user_id = _parse_user_id(user_id)
    workspace = await get_workspace(session, normalized_user_id, _parse_id(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    fingerprint, receipt = await prepare_mutation(session, normalized_user_id, workspace.id, payload.request_id, "project_create", payload)
    if receipt is not None:
        return ApiResponse(success=True, data=ProjectResponse.model_validate(receipt))
    project = await create_project(
        session,
        workspace=workspace,
        name=payload.name,
        description=payload.description,
        status=payload.status,
        priority=payload.priority,
        progress=payload.progress,
        next_action=payload.next_action,
        due_at=payload.due_at,
    )
    await session.flush()
    await session.refresh(project)
    result = _project_response(project)
    record_mutation(session, normalized_user_id, workspace.id, payload.request_id, fingerprint, result)
    await session.commit()
    return ApiResponse(success=True, data=result)


@projects_router.get("/{project_id}", response_model=ApiResponse[ProjectResponse])
async def project_detail(project_id: str, workspace_id: str | None = None, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    project = await get_project(session, _parse_user_id(user_id), _parse_id(project_id, "Project"))
    if project is None or workspace_id is not None and project.workspace_id != _parse_id(workspace_id, "Workspace"):
        raise NotFoundException("Project")
    return ApiResponse(success=True, data=_project_response(project))


@projects_router.patch("/{project_id}", response_model=ApiResponse[ProjectResponse])
async def update_project_endpoint(project_id: str, payload: ProjectUpdateRequest,
                                  user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    uid, pid = _parse_user_id(user_id), _parse_id(project_id, "Project")
    project = await get_project(session, uid, pid)
    if project is None:
        raise NotFoundException("Project")
    fingerprint, receipt = await prepare_mutation(session, uid, project.workspace_id, payload.request_id, f"project_update:{pid}", payload)
    if receipt is not None:
        return ApiResponse(success=True, data=ProjectResponse.model_validate(receipt))
    project = await session.scalar(project_query(uid, pid).with_for_update(of=Project).execution_options(populate_existing=True))
    if project is None:
        raise NotFoundException("Project")
    if payload.expected_updated_at is not None and payload.expected_updated_at != project.updated_at:
        raise AppException("PROJECT_EDIT_CONFLICT", "其他页面已有更新。当前输入已保留，请先核对最新项目。", 409)
    changes = payload.model_dump(exclude_unset=True, exclude={"request_id", "expected_updated_at"})
    await update_project(session, project, changes)
    await session.flush()
    await session.refresh(project)
    result = _project_response(project)
    record_mutation(session, uid, project.workspace_id, payload.request_id, fingerprint, result)
    await session.commit()
    return ApiResponse(success=True, data=result)


@projects_router.post("/{project_id}/archive", response_model=ApiResponse[ProjectResponse])
async def archive_project_endpoint(
    project_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ProjectResponse]:
    project = await get_project(session, _parse_user_id(user_id), _parse_id(project_id, "Project"))
    if project is None:
        raise NotFoundException("Project")
    await archive_project(session, project)
    await session.commit()
    await session.refresh(project)
    return ApiResponse(success=True, data=_project_response(project))
