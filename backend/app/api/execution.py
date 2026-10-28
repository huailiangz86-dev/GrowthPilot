"""Read execution output and connect a scoped, revocable calendar feed."""
import hashlib
import secrets
import uuid
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Depends
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException
from app.engines.calendar_feed import subscription_url, workspace_calendar, calendar_objects
from pydantic import BaseModel

class CalendarScope(BaseModel):
    deadlines: bool = True
    blocks: bool = False
    reviews: bool = False
from app.engines.workspace_engine import get_workspace
from app.models.execution import CalendarSubscription, ExecutionHeartbeat, ExecutionJob
from app.models.task import Task
from app.models.workspace import Workspace, WorkspaceEvent
from app.schemas.common import ApiResponse

router = APIRouter(prefix="/execution", tags=["execution"])


async def _workspace(session, user_id, workspace_id):
    try:
        uid, wid = uuid.UUID(user_id), uuid.UUID(workspace_id)
    except ValueError as exc:
        raise NotFoundException("Workspace") from exc
    workspace = await get_workspace(session, uid, wid)
    if workspace is None:
        raise NotFoundException("Workspace")
    return workspace


@router.get("")
async def execution_status(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    workspace = await _workspace(session, user_id, workspace_id)
    heartbeat = await session.get(ExecutionHeartbeat, "execution")
    online = bool(settings.EXECUTION_ENABLED and heartbeat and heartbeat.last_seen_at > datetime.now(UTC) - timedelta(seconds=max(60, settings.EXECUTION_POLL_SECONDS * 4)))
    jobs = list((await session.execute(select(ExecutionJob).where(ExecutionJob.user_id == workspace.user_id,
        ExecutionJob.workspace_id == workspace.id).order_by(ExecutionJob.last_run_at.desc().nullslast()))).scalars().all())
    events = list((await session.execute(select(WorkspaceEvent).where(WorkspaceEvent.user_id == workspace.user_id,
        WorkspaceEvent.workspace_id == workspace.id, WorkspaceEvent.source_type == "execution")
        .order_by(WorkspaceEvent.created_at.desc()).limit(12))).scalars().all())
    return ApiResponse(success=True, data={"worker": {"online": online, "last_seen_at": heartbeat.last_seen_at.isoformat() if heartbeat else None,
        "poll_seconds": settings.EXECUTION_POLL_SECONDS}, "jobs": [{"id": str(j.id), "kind": j.kind,
        "resource_id": str(j.resource_id), "title": j.title, "status": j.status, "result": j.result,
        "error": j.error, "attempts": j.attempts, "last_run_at": j.last_run_at.isoformat() if j.last_run_at else None,
        "next_run_at": j.next_run_at.isoformat()} for j in jobs],
        "events": [{"id": str(e.id), "created_at": e.created_at.isoformat(), "payload": e.payload} for e in events]})


@router.get('/calendar-subscription')
async def calendar_status(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    workspace = await _workspace(session, user_id, workspace_id)
    row = await session.scalar(select(CalendarSubscription).where(CalendarSubscription.user_id==workspace.user_id,
        CalendarSubscription.workspace_id==workspace.id))
    return ApiResponse(success=True, data={'connected': row is not None, 'scope': row.scope if row else None})


@router.post("/calendar-subscription")
async def connect_calendar(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db), payload: CalendarScope | None = None):
    workspace = await _workspace(session, user_id, workspace_id)
    token = secrets.token_urlsafe(32)
    try:
        url = subscription_url(settings.PUBLIC_BASE_URL, settings.API_V1_PREFIX, token)
    except ValueError as error:
        raise AppException("CALENDAR_NOT_CONFIGURED", str(error), 503) from error
    # Serialize rotation against another request for this workspace.
    await session.execute(select(Workspace.id).where(Workspace.id == workspace.id).with_for_update())
    selected_scope = payload.model_dump() if isinstance(payload, CalendarScope) else CalendarScope().model_dump()
    digest = hashlib.sha256(token.encode()).hexdigest()
    existing = (await session.execute(select(CalendarSubscription).where(CalendarSubscription.user_id == workspace.user_id,
        CalendarSubscription.workspace_id == workspace.id))).scalar_one_or_none()
    if existing is None:
        session.add(CalendarSubscription(user_id=workspace.user_id, workspace_id=workspace.id, token_hash=digest, scope=selected_scope))
    else:
        existing.token_hash = digest
        existing.scope = selected_scope
    await session.commit()
    return ApiResponse(success=True, data={"url": url, "path": f"{settings.API_V1_PREFIX}/execution/calendar.ics?token={token}",
        "scope": "已选范围的真实工作时段、截止标记和复习日期，只读；刷新频率由日历应用决定。"})


@router.delete("/calendar-subscription")
async def disconnect_calendar(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    workspace = await _workspace(session, user_id, workspace_id)
    await session.execute(select(Workspace.id).where(Workspace.id == workspace.id).with_for_update())
    await session.execute(delete(CalendarSubscription).where(CalendarSubscription.user_id == workspace.user_id,
        CalendarSubscription.workspace_id == workspace.id))
    await session.commit()
    return ApiResponse(success=True, data={"revoked": True})


@router.get("/calendar.ics")
async def calendar_feed(token: str, session: AsyncSession = Depends(get_db)):
    subscription = (await session.execute(select(CalendarSubscription).where(
        CalendarSubscription.token_hash == hashlib.sha256(token.encode()).hexdigest()))).scalar_one_or_none()
    if subscription is None or await get_workspace(session, subscription.user_id, subscription.workspace_id) is None:
        raise NotFoundException("Calendar subscription")
    objects = await calendar_objects(session, subscription.user_id, subscription.workspace_id)
    return Response(workspace_calendar(*objects, scope=subscription.scope), media_type="text/calendar; charset=utf-8", headers={"Cache-Control": "no-store", "Referrer-Policy": "no-referrer"})


@router.get('/calendar-export')
async def calendar_export(workspace_id: str, deadlines: bool = True, blocks: bool = True, reviews: bool = True,
                          user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    workspace = await _workspace(session, user_id, workspace_id)
    objects = await calendar_objects(session, workspace.user_id, workspace.id)
    return Response(workspace_calendar(*objects, scope={'deadlines': deadlines, 'blocks': blocks, 'reviews': reviews}),
        media_type='text/calendar; charset=utf-8', headers={'Cache-Control': 'no-store', 'Content-Disposition': 'attachment; filename="growthpilot.ics"'})
