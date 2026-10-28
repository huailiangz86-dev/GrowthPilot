"""Workspace Growth Plan API."""

import uuid
from typing import Literal

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
from app.models.growth_plan import GrowthPlan
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/growth-plans", tags=["growth-plans"])
PeriodType = Literal["weekly", "monthly", "quarterly"]


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class GrowthPlanCreateRequest(BaseModel):
    request_id: uuid.UUID | None = None
    workspace_id: str
    goal_id: str
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)
    project_id: str | None = None
    period_type: PeriodType = "weekly"
    total_weeks: int | None = Field(default=None, ge=1, le=104)
    milestones: list[str] = Field(default_factory=list, max_length=12)
    execution_enabled: bool = True

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("title cannot be empty")
        return value

    @field_validator("milestones")
    @classmethod
    def normalize_milestones(cls, values: list[str]) -> list[str]:
        if any(len(item.strip()) > 240 for item in values):
            raise ValueError("每个计划步骤最多 240 个字符")
        return [item.strip() for item in values if item.strip()][:12]


class GrowthPlanUpdateRequest(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=240)
    description: str | None = Field(default=None, max_length=4000)
    project_id: str | None = None
    period_type: PeriodType | None = None
    total_weeks: int | None = Field(default=None, ge=1, le=104)
    current_week: int | None = Field(default=None, ge=1, le=104)
    milestones: list[str] | None = Field(default=None, max_length=12)
    execution_enabled: bool | None = None

    @field_validator("milestones")
    @classmethod
    def normalize_steps(cls, values):
        return GrowthPlanCreateRequest.normalize_milestones(values) if values is not None else None

    @model_validator(mode="after")
    def has_changes(self) -> "GrowthPlanUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("至少提供一项需要修改的内容")
        for field in ("execution_enabled", "milestones"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} 不能为 null")
        return self


class GrowthPlanResponse(BaseModel):
    id: str
    workspace_id: str
    goal_id: str
    project_id: str | None
    title: str
    description: str
    period_type: str
    total_weeks: int | None
    current_week: int | None
    milestones: list[str]
    progress: int
    status: str
    execution_enabled: bool


def _response(plan: GrowthPlan) -> GrowthPlanResponse:
    return GrowthPlanResponse(id=str(plan.id), workspace_id=str(plan.workspace_id), goal_id=str(plan.goal_id), project_id=str(plan.project_id) if plan.project_id else None, title=plan.title, description=plan.description, period_type=plan.period_type, total_weeks=plan.total_weeks, current_week=plan.current_week, milestones=plan.milestones, progress=plan.progress, status=plan.status, execution_enabled=bool(plan.execution_enabled))


async def _links(session: AsyncSession, user_id: uuid.UUID, workspace_id: uuid.UUID, goal_id: str, project_id: str | None) -> tuple[uuid.UUID, uuid.UUID | None]:
    goal_uuid = _uuid(goal_id, "Goal")
    goal_result = await session.execute(select(Goal).where(Goal.id == goal_uuid, Goal.user_id == user_id, Goal.workspace_id == workspace_id, Goal.archived_at.is_(None)))
    if goal_result.scalar_one_or_none() is None:
        raise ValidationException("目标必须属于当前 Workspace")
    if project_id is None:
        return goal_uuid, None
    project_uuid = _uuid(project_id, "Project")
    project = await get_project(session, user_id, project_uuid)
    if project is None or project.workspace_id != workspace_id:
        raise ValidationException("项目必须属于当前 Workspace")
    return goal_uuid, project_uuid


@router.post("", response_model=ApiResponse[GrowthPlanResponse])
async def create_growth_plan(payload: GrowthPlanCreateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[GrowthPlanResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    fingerprint, receipt = await prepare_mutation(session, uid, workspace.id, payload.request_id, "growth_plan_create", payload)
    if receipt is not None:
        return ApiResponse(success=True, data=GrowthPlanResponse.model_validate(receipt))
    goal_id, project_id = await _links(session, uid, workspace.id, payload.goal_id, payload.project_id)
    plan = GrowthPlan(id=uuid.uuid4(), user_id=uid, workspace_id=workspace.id, goal_id=goal_id, project_id=project_id, title=payload.title, description=payload.description, period_type=payload.period_type, total_weeks=payload.total_weeks, current_week=1 if payload.total_weeks else None, milestones=payload.milestones)
    plan.execution_enabled = payload.execution_enabled
    session.add(plan)
    await append_event(session, user_id=uid, workspace_id=workspace.id, project_id=project_id, event_type="growth_plan_created", source_type="growth_plan", source_id=plan.id, payload={"title": plan.title, "goal_id": str(goal_id)})
    await session.flush()
    await session.refresh(plan)
    result = _response(plan)
    record_mutation(session, uid, workspace.id, payload.request_id, fingerprint, result)
    await session.commit()
    return ApiResponse(success=True, data=result)


@router.get("", response_model=ApiResponse[list[GrowthPlanResponse]])
async def list_growth_plans(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[list[GrowthPlanResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    result = await session.execute(select(GrowthPlan).where(GrowthPlan.user_id == uid, GrowthPlan.workspace_id == workspace.id, GrowthPlan.archived_at.is_(None)).order_by(GrowthPlan.created_at.desc()))
    return ApiResponse(success=True, data=[_response(plan) for plan in result.scalars().all()])


@router.patch("/{plan_id}", response_model=ApiResponse[GrowthPlanResponse])
async def update_growth_plan(plan_id: str, payload: GrowthPlanUpdateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[GrowthPlanResponse]:
    uid = _uuid(user_id, "User")
    result = await session.execute(select(GrowthPlan).where(GrowthPlan.id == _uuid(plan_id, "GrowthPlan"), GrowthPlan.user_id == uid, GrowthPlan.archived_at.is_(None)))
    plan = result.scalar_one_or_none()
    if plan is None:
        raise NotFoundException("GrowthPlan")
    changes = payload.model_dump(exclude_unset=True)
    if "milestones" in changes and changes["milestones"] != plan.milestones:
        from app.models.execution import ExecutionJob
        if await session.get(ExecutionJob, uuid.uuid5(plan.workspace_id, f"execution:plan:{plan.id}")) is not None:
            raise ValidationException("已开始执行的计划保留原始步骤；请新建计划保存调整后的路径")
    if "project_id" in changes:
        _, changes["project_id"] = await _links(session, uid, plan.workspace_id, str(plan.goal_id), changes["project_id"])
    for field, value in changes.items():
        setattr(plan, field, value)
    await append_event(session, user_id=uid, workspace_id=plan.workspace_id, project_id=plan.project_id, event_type="growth_plan_updated", source_type="growth_plan", source_id=plan.id, payload=changes)
    await session.commit()
    await session.refresh(plan)
    return ApiResponse(success=True, data=_response(plan))
