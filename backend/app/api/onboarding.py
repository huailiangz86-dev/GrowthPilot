"""Onboarding API — personal context initialization and legacy learning progress."""

import uuid
from datetime import UTC, datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import structlog
from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator, model_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.llm_service import structured_output
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException, ValidationException
from app.engines.daily_preferences import user_daily_preferences
from app.engines.memory_engine import create_from_source
from app.engines.onboarding_engine import save_onboarding_graph
from app.engines.learning_paths_seed import assign_path, get_day_task, get_path
from app.engines.privacy_scope import (
    PRIVACY_SOURCE_DESCRIPTIONS,
    PRIVACY_SOURCE_KEYS,
    PRIVACY_SOURCE_LABELS,
    user_privacy_scope,
)
from app.engines.workspace_engine import append_event, create_project, create_workspace
from app.models.memory import MemoryEntry
from app.models.onboarding_submission import OnboardingSubmission
from app.models.user import User
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/onboarding", tags=["onboarding"])


# --- Schemas ---


class PersonalContext(BaseModel):
    identity: str = Field(default="", max_length=200)
    current_project: str = Field(default="", max_length=300)
    goals: list[str] = Field(default_factory=list, max_length=8)
    work_rhythm: str = Field(default="", max_length=300)


class _RawInputRequest(BaseModel):
    raw_input: str = Field(min_length=1, max_length=2000)

    @field_validator("raw_input")
    @classmethod
    def validate_raw_input(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("raw_input cannot be empty")
        return normalized


class ContextPreviewRequest(_RawInputRequest):
    pass


class ContextPreviewResponse(BaseModel):
    raw_input: str
    profile: PersonalContext
    ai_generated: bool


class OnboardingWorkspaceInput(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=2000)
    workspace_type: Literal["personal", "work", "life", "learning"] = "personal"
    icon: str | None = Field(default=None, max_length=24)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("workspace name cannot be empty")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("icon")
    @classmethod
    def normalize_icon(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class OnboardingProjectInput(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    next_action: str | None = Field(default=None, max_length=1000)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("project name cannot be empty")
        return normalized

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str) -> str:
        return value.strip()

    @field_validator("next_action")
    @classmethod
    def normalize_next_action(cls, value: str | None) -> str | None:
        return value.strip() or None if value else None


class _OnboardingTitledInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    description: str = Field(default="", max_length=4000)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title cannot be empty")
        return value.strip()


class OnboardingGoalInput(_OnboardingTitledInput):
    target_metric: dict | None = None


class OnboardingPlanInput(_OnboardingTitledInput):
    period_type: Literal["weekly", "monthly", "quarterly"] = "weekly"
    total_weeks: int = Field(ge=1, le=104)
    milestones: list[str] = Field(default_factory=list, max_length=12)

    @field_validator("milestones")
    @classmethod
    def normalize_milestones(cls, values: list[str]) -> list[str]:
        return [value.strip() for value in values if value.strip()]


class OnboardingTaskInput(_OnboardingTitledInput):
    client_key: str = Field(pattern=r"^task-[0-2]$")
    priority: Literal["high", "medium", "low"] = "medium"
    due_at: datetime | None = None

    @field_validator("due_at")
    @classmethod
    def require_timezone(cls, value: datetime | None) -> datetime | None:
        if value is not None and value.tzinfo is None:
            raise ValueError("due_at requires a timezone")
        return value


class OnboardingLearningInput(BaseModel):
    title: str = Field(min_length=1, max_length=240)
    summary: str = Field(default="", max_length=4000)
    kind: Literal["article", "course", "note", "book"] = "note"
    duration_minutes: int | None = Field(default=None, ge=1, le=1440)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("title cannot be empty")
        return value.strip()


class ContextCompleteRequest(_RawInputRequest):
    profile: PersonalContext = Field(default_factory=PersonalContext)
    workspace: OnboardingWorkspaceInput | None = None
    project: OnboardingProjectInput | None = None
    client_request_id: uuid.UUID | None = None
    goal: OnboardingGoalInput | None = None
    plan: OnboardingPlanInput | None = None
    tasks: list[OnboardingTaskInput] = Field(default_factory=list, max_length=3)
    learning: OnboardingLearningInput | None = None

    @model_validator(mode="after")
    def validate_project_workspace_dependency(self) -> "ContextCompleteRequest":
        if self.project is not None and self.workspace is None:
            raise ValueError("project requires a confirmed workspace")
        if self.client_request_id is not None and self.workspace is None:
            raise ValueError("a retryable submission requires a workspace")
        if self.goal is not None or self.plan is not None or self.tasks or self.learning is not None:
            if self.workspace is None or self.client_request_id is None:
                raise ValueError("confirmed objects require workspace and client_request_id")
        if self.plan is not None and self.goal is None:
            raise ValueError("plan requires a confirmed goal")
        if len({task.client_key for task in self.tasks}) != len(self.tasks):
            raise ValueError("task client keys must be unique")
        return self


class ContextCompleteResponse(BaseModel):
    memory_id: str
    profile: PersonalContext
    workspace_id: str | None = None
    project_id: str | None = None
    saved: bool
    client_request_id: str | None = None
    objects: list[dict] = Field(default_factory=list)


class DailyPreferencesUpdateRequest(BaseModel):
    timezone: str = Field(min_length=1, max_length=64)
    morning_time: str = Field(min_length=5, max_length=5)
    evening_time: str = Field(min_length=5, max_length=5)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        normalized = value.strip()
        try:
            ZoneInfo(normalized)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("时区不可用") from exc
        return normalized

    @field_validator("morning_time", "evening_time")
    @classmethod
    def validate_time(cls, value: str) -> str:
        normalized = value.strip()
        try:
            datetime.strptime(normalized, "%H:%M")
        except ValueError as exc:
            raise ValueError("提醒时间必须为 HH:MM") from exc
        if len(normalized) != 5:
            raise ValueError("提醒时间必须为 HH:MM")
        return normalized


class DailyPreferencesResponse(BaseModel):
    timezone: str
    morning_time: str
    evening_time: str
    notification_enabled: bool = False


class PrivacyScopeUpdateRequest(BaseModel):
    enabled_sources: list[str] = Field(default_factory=lambda: list(PRIVACY_SOURCE_KEYS), max_length=len(PRIVACY_SOURCE_KEYS))

    @field_validator("enabled_sources")
    @classmethod
    def validate_enabled_sources(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            source = value.strip()
            if source not in PRIVACY_SOURCE_KEYS:
                raise ValueError(f"不支持的数据来源：{source}")
            if source not in normalized:
                normalized.append(source)
        return normalized


class PrivacyScopeSourceResponse(BaseModel):
    key: str
    label: str
    description: str
    enabled: bool


class PrivacyScopeResponse(BaseModel):
    enabled_sources: list[str]
    sources: list[PrivacyScopeSourceResponse]


class AssessRequest(BaseModel):
    level: str  # beginner / intermediate / advanced
    market: str  # stock / crypto / fund / multi
    focus: str  # psychology / risk / review / strategy


class AssessResponse(BaseModel):
    path_id: str
    path_name: str
    total_days: int
    description: str


class OnboardingStatus(BaseModel):
    completed: bool
    onboarded: bool
    current_day: int
    path_id: str | None
    path_name: str | None
    total_days: int
    completed_days: list[int]
    personal_context_completed: bool = False
    personal_profile: PersonalContext | None = None


class TodayTask(BaseModel):
    day: int
    task_type: str
    task_title: str
    description: str
    article_title: str
    target_url: str


class CompleteDayResponse(BaseModel):
    completed_day: int
    next_day: int | None
    all_completed: bool


# --- Helpers ---


def _get_onboarding(user: User) -> dict:
    """Extract onboarding sub-dict from user.settings."""
    settings = user.settings or {}
    return settings.get("onboarding", {})


def _get_personal_context(user: User) -> dict:
    """Extract the new growth context without touching legacy onboarding data."""
    settings = user.settings or {}
    return settings.get("personal_context", {})


def _daily_preferences_response(user: User) -> DailyPreferencesResponse:
    preferences = user_daily_preferences(user.settings)
    return DailyPreferencesResponse(
        timezone=preferences["timezone"],
        morning_time=preferences["morning_time"],
        evening_time=preferences["evening_time"],
        notification_enabled=False,
    )


def _privacy_scope_response(user: User) -> PrivacyScopeResponse:
    scope = user_privacy_scope(user.settings)
    enabled_sources = scope["enabled_sources"]
    return PrivacyScopeResponse(
        enabled_sources=enabled_sources,
        sources=[
            PrivacyScopeSourceResponse(
                key=key,
                label=PRIVACY_SOURCE_LABELS[key],
                description=PRIVACY_SOURCE_DESCRIPTIONS[key],
                enabled=key in enabled_sources,
            )
            for key in PRIVACY_SOURCE_KEYS
        ],
    )


def _trim_text(value: object, max_length: int) -> str:
    return str(value or "").strip()[:max_length]


def _normalize_goals(value: object) -> list[str]:
    if isinstance(value, str):
        raw_goals = (
            value.replace("；", "\n")
            .replace(";", "\n")
            .replace("，", "\n")
            .replace(",", "\n")
            .splitlines()
        )
    elif isinstance(value, list):
        raw_goals = value
    else:
        raw_goals = []

    goals: list[str] = []
    for item in raw_goals:
        goal = _trim_text(item, 120)
        if goal and goal not in goals:
            goals.append(goal)
        if len(goals) == 8:
            break
    return goals


def _normalize_context(value: object) -> PersonalContext:
    """Normalize both well-formed and slightly loose LLM output."""
    data = value if isinstance(value, dict) else {}
    return PersonalContext(
        identity=_trim_text(data.get("identity"), 200),
        current_project=_trim_text(data.get("current_project"), 300),
        goals=_normalize_goals(data.get("goals")),
        work_rhythm=_trim_text(data.get("work_rhythm"), 300),
    )


def _profile_summary(profile: PersonalContext) -> str:
    parts = [
        f"身份：{profile.identity}" if profile.identity else "",
        f"当前项目：{profile.current_project}" if profile.current_project else "",
        f"成长目标：{'、'.join(profile.goals)}" if profile.goals else "",
        f"工作节奏：{profile.work_rhythm}" if profile.work_rhythm else "",
    ]
    return "；".join(part for part in parts if part)


async def _task_target_url(task: dict, session: AsyncSession) -> str:
    """Build the navigation target URL based on task type."""
    from sqlalchemy import text as sa_text
    t = task.get("type", "read")
    article_title = task.get("article_title", "")

    if t == "read" and article_title:
        # Look up article ID by title — try exact match first, then keyword
        for search in [article_title, article_title.split("：")[-1], article_title.split(":")[-1]]:
            result = await session.execute(
                sa_text("SELECT id FROM knowledge_articles WHERE title ILIKE :t LIMIT 1"),
                {"t": f"%{search.strip()}%"},
            )
            row = result.fetchone()
            if row:
                return f"/pages/knowledge-detail/index?id={row[0]}"
        return "/pages/knowledge/index"
    if t == "review":
        return "/pages/review-form/index?template=trade_post"
    if t == "record":
        return "/pages/record-form/index"
    if t == "ai":
        return "/pages/ai-coach/index"
    return "/pages/knowledge/index"


# --- Endpoints ---


@router.post("/context/preview", response_model=ApiResponse[ContextPreviewResponse])
async def preview_context(
    payload: ContextPreviewRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ContextPreviewResponse]:
    """Turn one natural-language description into an editable profile draft."""
    raw_input = payload.raw_input.strip()
    try:
        result = await structured_output(
            session=session,
            user_id=user_id,
            purpose="onboarding_context",
            variables={"raw_input": raw_input},
        )
        profile = _normalize_context(result)
        ai_generated = True
    except Exception as exc:
        # AI is an enhancement here; the user must still be able to continue.
        logger.warning("onboarding_context_ai_failed", user_id=user_id, error=str(exc)[:200])
        profile = PersonalContext()
        ai_generated = False

    return ApiResponse(
        success=True,
        data=ContextPreviewResponse(
            raw_input=raw_input,
            profile=profile,
            ai_generated=ai_generated,
        ),
    )


@router.post("/context/complete", response_model=ApiResponse[ContextCompleteResponse])
async def complete_context(
    payload: ContextCompleteRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ContextCompleteResponse]:
    """Commit confirmed onboarding facts, their event trail, and the raw input Memory."""
    if payload.client_request_id is not None:
        result = await save_onboarding_graph(session, uid=uuid.UUID(user_id), payload=payload.model_dump(mode="json"))
        return ApiResponse(success=True, data=ContextCompleteResponse(**result))
    raw_input = payload.raw_input.strip()
    normalized_user_id = uuid.UUID(user_id)
    result = await session.execute(select(User).where(User.id == normalized_user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")

    profile = _normalize_context(payload.profile.model_dump())
    summary = _profile_summary(profile) or raw_input[:300]
    personal_context = _get_personal_context(user)
    memory: MemoryEntry | None = None

    existing_memory_id = personal_context.get("memory_id")
    if existing_memory_id:
        try:
            memory_result = await session.execute(
                select(MemoryEntry).where(
                    MemoryEntry.id == uuid.UUID(str(existing_memory_id)),
                    MemoryEntry.user_id == uuid.UUID(user_id),
                    MemoryEntry.source == "onboarding",
                    MemoryEntry.deleted_at.is_(None),
                )
            )
            memory = memory_result.scalar_one_or_none()
        except ValueError:
            memory = None

    if memory is None:
        memory = await create_from_source(
            session=session,
            user_id=user_id,
            source="onboarding",
            content=raw_input,
            summary=summary,
            tags=["onboarding", "personal_context"],
            importance=5,
            confidence=1.0,
        )
    else:
        memory.content = raw_input
        memory.summary = summary
        memory.tags = ["onboarding", "personal_context"]
        memory.updated_at = datetime.now(UTC)

    workspace_id = personal_context.get("workspace_id")
    project_id = personal_context.get("project_id")
    workspace = None
    project = None

    if payload.workspace is not None and not workspace_id:
        workspace = await create_workspace(
            session,
            user_id=normalized_user_id,
            name=payload.workspace.name,
            description=payload.workspace.description,
            workspace_type=payload.workspace.workspace_type,
            icon=payload.workspace.icon,
        )
        workspace_id = str(workspace.id)

        if payload.project is not None:
            project = await create_project(
                session,
                workspace=workspace,
                name=payload.project.name,
                description=payload.project.description,
                status="active",
                priority="high",
                progress=0,
                next_action=payload.project.next_action,
                due_at=None,
            )
            project_id = str(project.id)

        confirmed_objects = ["workspace"]
        if project is not None:
            confirmed_objects.append("project")
        await append_event(
            session,
            user_id=normalized_user_id,
            workspace_id=workspace.id,
            project_id=project.id if project is not None else None,
            event_type="onboarding_confirmed",
            source_type="onboarding",
            source_id=workspace.id,
            payload={
                "raw_input": raw_input,
                "confirmed_objects": confirmed_objects,
            },
        )

    settings = dict(user.settings or {})
    settings["profile"] = profile.model_dump()
    next_personal_context = {
        **personal_context,
        "completed": True,
        "memory_id": str(memory.id),
        "completed_at": datetime.now(UTC).isoformat(),
    }
    if workspace_id:
        next_personal_context["workspace_id"] = str(workspace_id)
    if project_id:
        next_personal_context["project_id"] = str(project_id)
    settings["personal_context"] = next_personal_context
    user.settings = settings
    await session.commit()

    logger.info(
        "onboarding_context_completed",
        user_id=user_id,
        memory_id=str(memory.id),
        workspace_id=workspace_id,
        project_id=project_id,
    )
    return ApiResponse(
        success=True,
        data=ContextCompleteResponse(
            memory_id=str(memory.id),
            profile=profile,
            workspace_id=str(workspace_id) if workspace_id else None,
            project_id=str(project_id) if project_id else None,
            saved=True,
        ),
    )


@router.get("/context/submissions/{client_request_id}", response_model=ApiResponse[ContextCompleteResponse])
async def get_context_submission(
    client_request_id: uuid.UUID,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[ContextCompleteResponse]:
    receipt = (await session.execute(select(OnboardingSubmission).where(
        OnboardingSubmission.user_id == uuid.UUID(user_id),
        OnboardingSubmission.client_request_id == client_request_id,
    ))).scalar_one_or_none()
    if receipt is None:
        raise NotFoundException("Onboarding submission")
    return ApiResponse(success=True, data=ContextCompleteResponse(**receipt.result))


@router.get("/daily-preferences", response_model=ApiResponse[DailyPreferencesResponse])
async def get_daily_preferences(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DailyPreferencesResponse]:
    user = (await session.execute(select(User).where(User.id == uuid.UUID(user_id)))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    return ApiResponse(success=True, data=_daily_preferences_response(user))


@router.put("/daily-preferences", response_model=ApiResponse[DailyPreferencesResponse])
async def update_daily_preferences(
    payload: DailyPreferencesUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[DailyPreferencesResponse]:
    user = (await session.execute(select(User).where(User.id == uuid.UUID(user_id)).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    settings = dict(user.settings or {})
    settings["daily_preferences"] = payload.model_dump()
    user.settings = settings
    await session.commit()
    await session.refresh(user)
    return ApiResponse(success=True, data=_daily_preferences_response(user))


@router.get("/privacy-scope", response_model=ApiResponse[PrivacyScopeResponse])
async def get_privacy_scope(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PrivacyScopeResponse]:
    user = (await session.execute(select(User).where(User.id == uuid.UUID(user_id)))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    return ApiResponse(success=True, data=_privacy_scope_response(user))


@router.put("/privacy-scope", response_model=ApiResponse[PrivacyScopeResponse])
async def update_privacy_scope(
    payload: PrivacyScopeUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[PrivacyScopeResponse]:
    user = (await session.execute(select(User).where(User.id == uuid.UUID(user_id)).with_for_update().execution_options(populate_existing=True))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    settings = dict(user.settings or {})
    settings["privacy_scope"] = {"enabled_sources": payload.enabled_sources}
    user.settings = settings
    await session.commit()
    await session.refresh(user)
    return ApiResponse(success=True, data=_privacy_scope_response(user))


@router.post("/assess", response_model=ApiResponse[AssessResponse])
async def assess(
    payload: AssessRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AssessResponse]:
    """Receive user assessment and assign a learning path."""
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")

    path = assign_path(payload.level, payload.focus)

    # Save onboarding data into user.settings
    settings = dict(user.settings or {})
    settings["onboarding"] = {
        "completed": False,
        "level": payload.level,
        "market": payload.market,
        "focus": payload.focus,
        "path_id": path["id"],
        "current_day": 1,
        "completed_days": [],
    }
    user.settings = settings
    await session.commit()

    logger.info("onboarding_assess", user_id=user_id, path_id=path["id"])

    return ApiResponse(
        success=True,
        data=AssessResponse(
            path_id=path["id"],
            path_name=path["name"],
            total_days=path["total_days"],
            description=path["description"],
        ),
    )


@router.get("/status", response_model=ApiResponse[OnboardingStatus])
async def status(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[OnboardingStatus]:
    """Return current onboarding state."""
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")

    ob = _get_onboarding(user)
    personal_context = _get_personal_context(user)
    personal_profile = _normalize_context((user.settings or {}).get("profile"))
    personal_context_completed = bool(personal_context.get("completed"))
    if not ob:
        return ApiResponse(
            success=True,
            data=OnboardingStatus(
                completed=False,
                onboarded=False,
                current_day=0,
                path_id=None,
                path_name=None,
                total_days=0,
                completed_days=[],
                personal_context_completed=personal_context_completed,
                personal_profile=personal_profile if personal_context_completed else None,
            ),
        )

    path = get_path(ob.get("path_id", ""))
    path_name = path["name"] if path else None
    total_days = path["total_days"] if path else 0
    completed_days = ob.get("completed_days", [])
    all_done = len(completed_days) >= total_days

    return ApiResponse(
        success=True,
        data=OnboardingStatus(
            completed=all_done,
            onboarded=True,
            current_day=ob.get("current_day", 1),
            path_id=ob.get("path_id"),
            path_name=path_name,
            total_days=total_days,
            completed_days=completed_days,
            personal_context_completed=personal_context_completed,
            personal_profile=personal_profile if personal_context_completed else None,
        ),
    )


@router.get("/today-task", response_model=ApiResponse[TodayTask])
async def today_task(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[TodayTask]:
    """Return today's learning task."""
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")

    ob = _get_onboarding(user)
    if not ob or not ob.get("path_id"):
        raise ValidationException("请先完成新手引导")

    path_id = ob["path_id"]
    current_day = ob.get("current_day", 1)

    task = get_day_task(path_id, current_day)
    if task is None:
        raise NotFoundException("Task")

    return ApiResponse(
        success=True,
        data=TodayTask(
            day=current_day,
            task_type=task["type"],
            task_title=task["title"],
            description=task["description"],
            article_title=task.get("article_title", ""),
            target_url=await _task_target_url(task, session),
        ),
    )


@router.get("/path/{path_id}", response_model=ApiResponse[dict])
async def get_path_detail(path_id: str) -> ApiResponse[dict]:
    """Return full path detail with stages and days."""
    path = get_path(path_id)
    if not path:
        raise NotFoundException("Learning path")
    return ApiResponse(success=True, data=path)


@router.post("/complete-day", response_model=ApiResponse[CompleteDayResponse])
async def complete_day(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[CompleteDayResponse]:
    """Mark the current day as complete and advance to next day."""
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")

    ob = _get_onboarding(user)
    if not ob or not ob.get("path_id"):
        raise ValidationException("请先完成新手引导")

    path = get_path(ob["path_id"])
    if path is None:
        raise NotFoundException("Learning path")

    current_day = ob.get("current_day", 1)
    completed_days: list[int] = list(ob.get("completed_days", []))

    if current_day not in completed_days:
        completed_days.append(current_day)

    total_days = path["total_days"]
    all_done = len(completed_days) >= total_days
    next_day = current_day + 1 if current_day < total_days else None

    # Update settings
    settings = dict(user.settings or {})
    settings["onboarding"] = {
        **ob,
        "current_day": next_day if next_day else current_day,
        "completed_days": completed_days,
        "completed": all_done,
    }
    user.settings = settings
    await session.commit()

    logger.info("onboarding_complete_day", user_id=user_id, day=current_day, all_done=all_done)

    return ApiResponse(
        success=True,
        data=CompleteDayResponse(
            completed_day=current_day,
            next_day=next_day,
            all_completed=all_done,
        ),
    )
