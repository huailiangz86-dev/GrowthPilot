"""Workspace-first Command Center read model."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import and_, case, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException
from app.engines.daily_preferences import user_daily_preferences, user_daily_timezone, user_today_utc_window
from app.engines.workspace_engine import get_workspace
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Project, Workspace, WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])
def _uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError as exc:
        raise NotFoundException("Workspace") from exc


def _iso(value):
    return value.isoformat() if value else None


def _learning_item(item: WorkspaceLearningItem) -> dict:
    return {
        "id": str(item.id),
        "workspace_id": str(item.workspace_id),
        "project_id": str(item.project_id) if item.project_id else None,
        "goal_id": str(item.goal_id) if item.goal_id else None,
        "title": item.title,
        "summary": item.summary,
        "kind": item.kind,
        "status": item.status,
        "progress": item.progress,
        "duration_minutes": item.duration_minutes,
        "progress_updated_at": _iso(item.progress_updated_at),
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def _reflection(item: WorkspaceReflection) -> dict:
    return {
        "id": str(item.id),
        "workspace_id": str(item.workspace_id),
        "project_id": str(item.project_id) if item.project_id else None,
        "goal_id": str(item.goal_id) if item.goal_id else None,
        "task_id": str(item.task_id) if item.task_id else None,
        "reflection_type": item.reflection_type,
        "reflection_date": item.reflection_date.isoformat(),
        "energy": item.energy,
        "intention": item.intention,
        "completion": item.completion,
        "wins": item.wins,
        "friction": item.friction,
        "adjustment": item.adjustment,
        "mood": item.mood,
        "micro_type": item.micro_type,
        "micro_status": item.micro_status,
        "content": item.content,
        "is_makeup": item.is_makeup,
        "created_at": _iso(item.created_at),
        "updated_at": _iso(item.updated_at),
    }


def _task(item: Task) -> dict:
    return {
        "id": str(item.id),
        "workspace_id": str(item.workspace_id),
        "project_id": str(item.project_id) if item.project_id else None,
        "goal_id": str(item.goal_id) if item.goal_id else None,
        "plan_id": str(item.plan_id) if item.plan_id else None,
        "title": item.title,
        "description": item.description,
        "status": item.status,
        "priority": item.priority,
        "energy_required": item.energy_required,
        "time_block": item.time_block,
        "due_at": _iso(item.due_at),
        "completed_at": _iso(item.completed_at),
    }


@router.get("/command-center", response_model=ApiResponse[dict])
async def command_center(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)) -> ApiResponse[dict]:
    uid = _uuid(user_id)
    workspace = await get_workspace(session, uid, _uuid(workspace_id))
    if workspace is None:
        raise NotFoundException("Workspace")
    user = (await session.execute(select(User).where(User.id == uid))).scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    daily_preferences = user_daily_preferences(user.settings)
    now = datetime.now(user_daily_timezone(user.settings))
    day_start, day_end = user_today_utc_window(user.settings, now)
    projects = (await session.execute(select(Project).where(Project.user_id == uid, Project.workspace_id == workspace.id, Project.archived_at.is_(None)).order_by(Project.updated_at.desc()))).scalars().all()
    goals = (await session.execute(select(Goal).where(Goal.user_id == uid, Goal.workspace_id == workspace.id, Goal.archived_at.is_(None)).order_by(Goal.updated_at.desc()))).scalars().all()
    plans = (await session.execute(select(GrowthPlan).where(GrowthPlan.user_id == uid, GrowthPlan.workspace_id == workspace.id, GrowthPlan.archived_at.is_(None)).order_by(GrowthPlan.updated_at.desc()))).scalars().all()
    tasks = (await session.execute(select(Task).where(Task.user_id == uid, Task.workspace_id == workspace.id, Task.deleted_at.is_(None), Task.status != "done").order_by(Task.due_at.asc().nullslast(), Task.created_at.desc()).limit(3))).scalars().all()
    today_completed_tasks = (await session.execute(
        select(Task)
        .where(
            Task.user_id == uid,
            Task.workspace_id == workspace.id,
            Task.deleted_at.is_(None),
            Task.status == "done",
            Task.completed_at >= day_start,
            Task.completed_at < day_end,
        )
        .order_by(Task.completed_at.desc())
        .limit(6)
    )).scalars().all()
    learning_priority = case(
        (
            and_(
                WorkspaceLearningItem.progress_updated_at >= day_start,
                WorkspaceLearningItem.progress_updated_at < day_end,
            ),
            0,
        ),
        (WorkspaceLearningItem.status == "in_progress", 1),
        (WorkspaceLearningItem.status == "queued", 2),
        else_=3,
    )
    learning_items = (await session.execute(
        select(WorkspaceLearningItem)
        .where(
            WorkspaceLearningItem.user_id == uid,
            WorkspaceLearningItem.workspace_id == workspace.id,
            WorkspaceLearningItem.archived_at.is_(None),
        )
        .order_by(
            learning_priority,
            WorkspaceLearningItem.progress_updated_at.desc().nullslast(),
            WorkspaceLearningItem.created_at.desc(),
        )
        .limit(6)
    )).scalars().all()
    reflection_priority = case(
        (WorkspaceReflection.reflection_type == "morning", 0),
        (WorkspaceReflection.reflection_type == "evening", 1),
        else_=2,
    )
    daily_reflections = (await session.execute(
        select(WorkspaceReflection)
        .where(
            WorkspaceReflection.user_id == uid,
            WorkspaceReflection.workspace_id == workspace.id,
            WorkspaceReflection.reflection_date == now.date(),
        )
        .order_by(reflection_priority, WorkspaceReflection.updated_at.desc())
        .limit(12)
    )).scalars().all()
    events = (await session.execute(select(WorkspaceEvent).where(WorkspaceEvent.user_id == uid, WorkspaceEvent.workspace_id == workspace.id).order_by(WorkspaceEvent.occurred_at.desc()).limit(12))).scalars().all()
    return ApiResponse(success=True, data={
        "workspace": {"id": str(workspace.id), "name": workspace.name, "description": workspace.description, "status": workspace.status},
        "daily_timezone": daily_preferences["timezone"],
        "current_date": now.date().isoformat(),
        "projects": [{"id": str(item.id), "name": item.name, "description": item.description, "status": item.status, "progress": item.progress, "next_action": item.next_action} for item in projects],
        "goals": [{"id": str(item.id), "title": item.title, "description": item.description, "progress": item.progress, "status": item.status, "due_at": _iso(item.due_at)} for item in goals],
        "plans": [{"id": str(item.id), "goal_id": str(item.goal_id), "title": item.title, "description": item.description, "progress": item.progress, "milestones": item.milestones} for item in plans],
        "tasks": [_task(item) for item in tasks],
        "today_completed_tasks": [_task(item) for item in today_completed_tasks],
        "learning_items": [_learning_item(item) for item in learning_items],
        "daily_reflections": [_reflection(item) for item in daily_reflections],
        "recent_events": [{"id": str(item.id), "event_type": item.event_type, "source_type": item.source_type, "source_id": str(item.source_id) if item.source_id else None, "payload": item.payload or {}, "occurred_at": _iso(item.occurred_at)} for item in events],
    })
