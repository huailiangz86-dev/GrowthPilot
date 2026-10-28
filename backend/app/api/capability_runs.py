"""Capability invocation preview and decision audit API."""

import uuid
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.capability_engine import (
    capability_can_execute,
    capability_can_preview,
    create_growth_plan_from_weekly_brief_fact,
    create_goal_from_weekly_brief_fact,
    create_knowledge_card_from_weekly_brief_fact,
    create_memory_from_weekly_brief_fact,
    create_task_from_weekly_brief_fact,
    create_capability_invocation_preview,
    decide_capability_invocation,
    effective_capability,
    execute_confirmed_weekly_brief,
    get_agent_run_for_capability_run,
    get_capability,
    get_capability_run,
    list_capability_runs,
)
from app.engines.workspace_engine import get_project, get_workspace
from app.models.capability import AgentRun, CapabilityRegistry, CapabilityRun
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.memory import MemoryEntry
from app.models.task import Task
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/capabilities", tags=["capability-runs"])


def _uuid(value: str, resource: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException(resource) from exc


class CapabilityInvocationPreviewRequest(BaseModel):
    workspace_id: str
    input_summary: str = Field(min_length=1, max_length=1200)
    project_id: str | None = None

    @field_validator("input_summary")
    @classmethod
    def input_summary_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("调用摘要不能为空")
        return normalized


class CapabilityRunDecisionRequest(BaseModel):
    decision: Literal["confirm", "plan", "reject"]


class CapabilityBriefFactResponse(BaseModel):
    event_id: str
    event_type: str
    occurred_at: str
    summary: str


class CapabilityBriefFactActionResponse(BaseModel):
    task_id: str
    created_at: str


class CapabilityBriefFactGoalActionResponse(BaseModel):
    goal_id: str
    created_at: str


class CapabilityBriefFactPlanActionResponse(BaseModel):
    plan_id: str
    created_at: str


class CapabilityBriefResponse(BaseModel):
    title: str
    summary: str
    facts: list[CapabilityBriefFactResponse]
    fact_actions: dict[str, CapabilityBriefFactActionResponse] = Field(default_factory=dict)
    fact_goal_actions: dict[str, "CapabilityBriefFactGoalActionResponse"] = Field(default_factory=dict)
    fact_plan_actions: dict[str, "CapabilityBriefFactPlanActionResponse"] = Field(default_factory=dict)
    fact_knowledge_actions: dict[str, dict[str, str]] = Field(default_factory=dict)
    fact_memory_actions: dict[str, dict[str, str]] = Field(default_factory=dict)


class CapabilityBriefTaskCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=240)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("待办标题不能为空")
        return normalized


class CapabilityBriefGoalCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=240)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("目标标题不能为空")
        return normalized


class CapabilityBriefPlanCreateRequest(BaseModel):
    goal_id: str
    title: str = Field(min_length=1, max_length=240)
    period_type: Literal["weekly", "monthly", "quarterly"]

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("计划标题不能为空")
        return normalized


class CapabilityBriefKnowledgeCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    content: str = Field(min_length=1, max_length=8000)
    goal_id: str | None = None

    @field_validator("title", "content")
    @classmethod
    def text_not_blank(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("知识卡片内容不能为空")
        return normalized


class CapabilityBriefMemoryCreateRequest(BaseModel):
    content: str = Field(min_length=1, max_length=4000)
    memory_type: str = Field(default="semantic", min_length=1, max_length=24)
    tags: list[str] = Field(default_factory=list, max_length=12)
    importance: int = Field(default=3, ge=1, le=5)

    @field_validator("content", "memory_type")
    @classmethod
    def normalize_required_text(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("Memory 内容不能为空")
        return normalized

    @field_validator("tags")
    @classmethod
    def normalize_tags(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            tag = value.strip()[:40]
            if tag and tag not in normalized:
                normalized.append(tag)
        return normalized


class CapabilityBriefTaskResponse(BaseModel):
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


class CapabilityInvocationResponse(BaseModel):
    id: str
    agent_run_id: str | None
    capability_id: str
    capability_name: str
    capability_type: str
    workspace_id: str
    project_id: str | None
    input_summary: str
    permission_snapshot: list[str]
    access_scope: str
    expected_output: str
    side_effect_level: str
    status: str
    decision: str | None
    execution_state: str
    brief: CapabilityBriefResponse | None
    created_at: str
    completed_at: str | None


class CapabilityBriefTaskPromotionResponse(BaseModel):
    invocation: CapabilityInvocationResponse
    task: CapabilityBriefTaskResponse


class CapabilityBriefGoalResponse(BaseModel):
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


class CapabilityBriefGoalPromotionResponse(BaseModel):
    invocation: CapabilityInvocationResponse
    goal: CapabilityBriefGoalResponse


class CapabilityBriefPlanResponse(BaseModel):
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


class CapabilityBriefPlanPromotionResponse(BaseModel):
    invocation: CapabilityInvocationResponse
    plan: CapabilityBriefPlanResponse


class CapabilityBriefKnowledgeResponse(BaseModel):
    id: str
    workspace_id: str
    project_id: str | None
    goal_id: str | None
    task_id: str | None
    learning_item_id: str | None
    title: str
    source_type: str
    source_url: str | None
    content: str | None
    status: str
    ai_status: str
    ai_summary: str | None
    ai_concepts: list[str]
    ai_tags: list[str]
    ai_processed_at: str | None
    created_at: str
    updated_at: str


class CapabilityBriefKnowledgePromotionResponse(BaseModel):
    invocation: CapabilityInvocationResponse
    knowledge_card: CapabilityBriefKnowledgeResponse


class CapabilityBriefMemoryResponse(BaseModel):
    id: str
    content: str
    summary: str | None
    memory_type: str
    source: str
    tags: list[str]
    derived_status: dict[str, str]
    importance: int
    confidence: float
    occurred_at: str
    created_at: str
    updated_at: str


class CapabilityBriefMemoryPromotionResponse(BaseModel):
    invocation: CapabilityInvocationResponse
    memory: CapabilityBriefMemoryResponse


def _response(
    run: CapabilityRun,
    agent_run: AgentRun,
    capability: CapabilityRegistry,
) -> CapabilityInvocationResponse:
    output_ref = run.output_ref or {}
    brief = output_ref.get("brief")
    normalized_brief = None
    if isinstance(brief, dict):
        normalized_brief = {
            **brief,
            "fact_actions": brief["fact_actions"] if isinstance(brief.get("fact_actions"), dict) else {},
            "fact_goal_actions": (
                brief["fact_goal_actions"]
                if isinstance(brief.get("fact_goal_actions"), dict)
                else {}
            ),
            "fact_plan_actions": (
                brief["fact_plan_actions"]
                if isinstance(brief.get("fact_plan_actions"), dict)
                else {}
            ),
            "fact_knowledge_actions": (
                brief["fact_knowledge_actions"]
                if isinstance(brief.get("fact_knowledge_actions"), dict)
                else {}
            ),
            "fact_memory_actions": (
                brief["fact_memory_actions"]
                if isinstance(brief.get("fact_memory_actions"), dict)
                else {}
            ),
        }
    return CapabilityInvocationResponse(
        id=str(run.id),
        agent_run_id=str(run.agent_run_id) if run.agent_run_id else None,
        capability_id=str(run.capability_id),
        capability_name=capability.name,
        capability_type=capability.capability_type,
        workspace_id=str(run.workspace_id),
        project_id=str(run.project_id) if run.project_id else None,
        input_summary=run.input_summary,
        permission_snapshot=run.permission_snapshot or [],
        access_scope=run.access_scope,
        expected_output=str(output_ref.get("expected_output") or agent_run.output_text or ""),
        side_effect_level=run.side_effect_level,
        status=run.status,
        decision=output_ref.get("decision"),
        execution_state=str(output_ref.get("execution_state") or "not_started"),
        brief=normalized_brief,
        created_at=run.started_at.isoformat(),
        completed_at=run.completed_at.isoformat() if run.completed_at else None,
    )


def _task_response(task: Task) -> CapabilityBriefTaskResponse:
    return CapabilityBriefTaskResponse(
        id=str(task.id),
        workspace_id=str(task.workspace_id),
        project_id=str(task.project_id) if task.project_id else None,
        goal_id=str(task.goal_id) if task.goal_id else None,
        plan_id=str(task.plan_id) if task.plan_id else None,
        title=task.title,
        description=task.description,
        status=task.status,
        priority=task.priority,
        energy_required=task.energy_required,
        time_block=task.time_block,
        due_at=task.due_at.isoformat() if task.due_at else None,
        completed_at=task.completed_at.isoformat() if task.completed_at else None,
    )


def _goal_response(goal: Goal) -> CapabilityBriefGoalResponse:
    return CapabilityBriefGoalResponse(id=str(goal.id), workspace_id=str(goal.workspace_id), project_id=str(goal.project_id) if goal.project_id else None, title=goal.title, description=goal.description, dimension=goal.dimension, goal_type=goal.goal_type, due_at=goal.due_at.isoformat() if goal.due_at else None, importance=goal.importance, target_metric=goal.target_metric, progress=goal.progress, status=goal.status)


def _growth_plan_response(plan: GrowthPlan) -> CapabilityBriefPlanResponse:
    return CapabilityBriefPlanResponse(
        id=str(plan.id),
        workspace_id=str(plan.workspace_id),
        goal_id=str(plan.goal_id),
        project_id=str(plan.project_id) if plan.project_id else None,
        title=plan.title,
        description=plan.description,
        period_type=plan.period_type,
        total_weeks=plan.total_weeks,
        current_week=plan.current_week,
        milestones=plan.milestones,
        progress=plan.progress,
        status=plan.status,
    )


def _knowledge_card_response(card: WorkspaceKnowledgeCard) -> CapabilityBriefKnowledgeResponse:
    return CapabilityBriefKnowledgeResponse(
        id=str(card.id),
        workspace_id=str(card.workspace_id),
        project_id=str(card.project_id) if card.project_id else None,
        goal_id=str(card.goal_id) if card.goal_id else None,
        task_id=str(card.task_id) if card.task_id else None,
        learning_item_id=str(card.learning_item_id) if card.learning_item_id else None,
        title=card.title,
        source_type=card.source_type,
        source_url=card.source_url,
        content=card.content,
        status=card.status,
        ai_status=card.ai_status,
        ai_summary=card.ai_summary,
        ai_concepts=card.ai_concepts or [],
        ai_tags=card.ai_tags or [],
        ai_processed_at=card.ai_processed_at.isoformat() if card.ai_processed_at else None,
        created_at=card.created_at.isoformat(),
        updated_at=card.updated_at.isoformat(),
    )


def _memory_response(memory: MemoryEntry) -> CapabilityBriefMemoryResponse:
    return CapabilityBriefMemoryResponse(
        id=str(memory.id),
        content=memory.content,
        summary=memory.summary,
        memory_type=memory.memory_type,
        source=memory.source,
        tags=[str(tag) for tag in (memory.tags or [])],
        derived_status={str(key): str(value) for key, value in (memory.derived_status or {}).items()},
        importance=memory.importance,
        confidence=memory.confidence,
        occurred_at=memory.occurred_at.isoformat(),
        created_at=memory.created_at.isoformat(),
        updated_at=memory.updated_at.isoformat(),
    )


async def _project_id(
    session: AsyncSession,
    *,
    user_id: uuid.UUID,
    workspace_id: uuid.UUID,
    value: str | None,
) -> uuid.UUID | None:
    if value is None:
        return None
    project_id = _uuid(value, "Project")
    project = await get_project(session, user_id, project_id)
    if project is None or project.workspace_id != workspace_id:
        raise ValidationException("项目必须属于当前 Workspace")
    return project_id


@router.get("/runs", response_model=ApiResponse[list[CapabilityInvocationResponse]])
async def list_capability_invocations_endpoint(
    workspace_id: str,
    capability_id: str,
    limit: Annotated[int, Query(ge=1, le=20)] = 5,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[list[CapabilityInvocationResponse]]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=_uuid(capability_id, "Capability"),
    )
    if capability is None:
        raise NotFoundException("Capability")
    runs = await list_capability_runs(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=capability.id,
        limit=limit,
    )
    responses: list[CapabilityInvocationResponse] = []
    for run in runs:
        agent_run = await get_agent_run_for_capability_run(session, run=run)
        if agent_run is not None:
            responses.append(_response(run, agent_run, capability))
    return ApiResponse(success=True, data=responses)


@router.post(
    "/{capability_id}/invocation-preview",
    response_model=ApiResponse[CapabilityInvocationResponse],
)
async def create_capability_invocation_preview_endpoint(
    capability_id: str,
    payload: CapabilityInvocationPreviewRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityInvocationResponse]:
    uid = _uuid(user_id, "User")
    workspace = await get_workspace(session, uid, _uuid(payload.workspace_id, "Workspace"))
    if workspace is None:
        raise NotFoundException("Workspace")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=_uuid(capability_id, "Capability"),
    )
    if capability is None:
        raise NotFoundException("Capability")
    effective = await effective_capability(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=workspace.id,
    )
    if not capability_can_preview(capability=capability, effective_status=effective.status):
        raise ValidationException("此能力未在当前 Workspace 启用，不能创建调用预览")
    project_id = await _project_id(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        value=payload.project_id,
    )
    run, agent_run = await create_capability_invocation_preview(
        session,
        workspace=workspace,
        capability=capability,
        input_summary=payload.input_summary,
        permissions=effective.permissions,
        project_id=project_id,
    )
    await session.commit()
    return ApiResponse(success=True, data=_response(run, agent_run, capability))


@router.post("/runs/{capability_run_id}/decision", response_model=ApiResponse[CapabilityInvocationResponse])
async def decide_capability_invocation_endpoint(
    capability_run_id: str,
    payload: CapabilityRunDecisionRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityInvocationResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=run.workspace_id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    if payload.decision == "confirm":
        effective = await effective_capability(
            session,
            capability=capability,
            user_id=uid,
            workspace_id=run.workspace_id,
        )
        if not capability_can_preview(capability=capability, effective_status=effective.status):
            raise ValidationException("能力状态已变化，不能确认这次调用")
    try:
        await decide_capability_invocation(
            session,
            run=run,
            agent_run=agent_run,
            decision=payload.decision,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    return ApiResponse(success=True, data=_response(run, agent_run, capability))


@router.post("/runs/{capability_run_id}/execute", response_model=ApiResponse[CapabilityInvocationResponse])
async def execute_capability_invocation_endpoint(
    capability_run_id: str,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityInvocationResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=run.workspace_id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    effective = await effective_capability(
        session,
        capability=capability,
        user_id=uid,
        workspace_id=run.workspace_id,
    )
    if not capability_can_execute(
        capability=capability,
        effective_status=effective.status,
        run=run,
    ):
        raise ValidationException("此调用不满足生成简报草稿的当前条件")
    try:
        await execute_confirmed_weekly_brief(
            session,
            capability=capability,
            run=run,
            agent_run=agent_run,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    return ApiResponse(success=True, data=_response(run, agent_run, capability))


@router.post(
    "/runs/{capability_run_id}/brief-facts/{event_id}/tasks",
    response_model=ApiResponse[CapabilityBriefTaskPromotionResponse],
)
async def create_task_from_brief_fact_endpoint(
    capability_run_id: str,
    event_id: str,
    payload: CapabilityBriefTaskCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityBriefTaskPromotionResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
        for_update=True,
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    workspace = await get_workspace(session, uid, run.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    try:
        _, task = await create_task_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=run,
            agent_run=agent_run,
            event_id=event_id,
            title=payload.title,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    await session.refresh(task)
    return ApiResponse(
        success=True,
        data=CapabilityBriefTaskPromotionResponse(
            invocation=_response(run, agent_run, capability),
            task=_task_response(task),
        ),
    )


@router.post("/runs/{capability_run_id}/brief-facts/{event_id}/goals", response_model=ApiResponse[CapabilityBriefGoalPromotionResponse])
async def create_goal_from_brief_fact_endpoint(capability_run_id: str, event_id: str, payload: CapabilityBriefGoalCreateRequest, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[CapabilityBriefGoalPromotionResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(session, user_id=uid, capability_run_id=_uuid(capability_run_id, "CapabilityRun"), for_update=True)
    if run is None:
        raise NotFoundException("CapabilityRun")
    workspace = await get_workspace(session, uid, run.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(session, user_id=uid, workspace_id=workspace.id, capability_id=run.capability_id)
    if capability is None:
        raise NotFoundException("Capability")
    try:
        _, goal = await create_goal_from_weekly_brief_fact(session, workspace=workspace, capability=capability, run=run, agent_run=agent_run, event_id=event_id, title=payload.title)
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    await session.refresh(goal)
    return ApiResponse(success=True, data=CapabilityBriefGoalPromotionResponse(invocation=_response(run, agent_run, capability), goal=_goal_response(goal)))


@router.post(
    "/runs/{capability_run_id}/brief-facts/{event_id}/plans",
    response_model=ApiResponse[CapabilityBriefPlanPromotionResponse],
)
async def create_growth_plan_from_brief_fact_endpoint(
    capability_run_id: str,
    event_id: str,
    payload: CapabilityBriefPlanCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityBriefPlanPromotionResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
        for_update=True,
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    workspace = await get_workspace(session, uid, run.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    try:
        _, plan = await create_growth_plan_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=run,
            agent_run=agent_run,
            event_id=event_id,
            goal_id=payload.goal_id,
            title=payload.title,
            period_type=payload.period_type,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    await session.refresh(plan)
    return ApiResponse(
        success=True,
        data=CapabilityBriefPlanPromotionResponse(
            invocation=_response(run, agent_run, capability),
            plan=_growth_plan_response(plan),
        ),
    )


@router.post(
    "/runs/{capability_run_id}/brief-facts/{event_id}/knowledge-cards",
    response_model=ApiResponse[CapabilityBriefKnowledgePromotionResponse],
)
async def create_knowledge_card_from_brief_fact_endpoint(
    capability_run_id: str,
    event_id: str,
    payload: CapabilityBriefKnowledgeCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityBriefKnowledgePromotionResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
        for_update=True,
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    workspace = await get_workspace(session, uid, run.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    try:
        _, card = await create_knowledge_card_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=run,
            agent_run=agent_run,
            event_id=event_id,
            title=payload.title,
            content=payload.content,
            goal_id=payload.goal_id,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    await session.refresh(card)
    return ApiResponse(
        success=True,
        data=CapabilityBriefKnowledgePromotionResponse(
            invocation=_response(run, agent_run, capability),
            knowledge_card=_knowledge_card_response(card),
        ),
    )


@router.post(
    "/runs/{capability_run_id}/brief-facts/{event_id}/memories",
    response_model=ApiResponse[CapabilityBriefMemoryPromotionResponse],
)
async def create_memory_from_brief_fact_endpoint(
    capability_run_id: str,
    event_id: str,
    payload: CapabilityBriefMemoryCreateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CapabilityBriefMemoryPromotionResponse]:
    uid = _uuid(user_id, "User")
    run = await get_capability_run(
        session,
        user_id=uid,
        capability_run_id=_uuid(capability_run_id, "CapabilityRun"),
        for_update=True,
    )
    if run is None:
        raise NotFoundException("CapabilityRun")
    workspace = await get_workspace(session, uid, run.workspace_id)
    if workspace is None:
        raise NotFoundException("Workspace")
    agent_run = await get_agent_run_for_capability_run(session, run=run)
    if agent_run is None:
        raise NotFoundException("AgentRun")
    capability = await get_capability(
        session,
        user_id=uid,
        workspace_id=workspace.id,
        capability_id=run.capability_id,
    )
    if capability is None:
        raise NotFoundException("Capability")
    try:
        _, memory = await create_memory_from_weekly_brief_fact(
            session,
            workspace=workspace,
            capability=capability,
            run=run,
            agent_run=agent_run,
            event_id=event_id,
            content=payload.content,
            memory_type=payload.memory_type,
            importance=payload.importance,
            tags=payload.tags,
        )
    except ValueError as exc:
        raise ValidationException(str(exc)) from exc
    await session.commit()
    await session.refresh(memory)
    return ApiResponse(
        success=True,
        data=CapabilityBriefMemoryPromotionResponse(
            invocation=_response(run, agent_run, capability),
            memory=_memory_response(memory),
        ),
    )
