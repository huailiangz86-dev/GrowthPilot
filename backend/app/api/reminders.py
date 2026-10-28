"""Explicit browser push consent; server-owned schedule and per-device status."""
import base64
import hashlib
import uuid
from datetime import UTC, datetime
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends
from pydantic import Field, field_validator
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.personal_work import Strict
from app.api.execution import _workspace
from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import AppException, NotFoundException
from app.models.reminders import PushSubscription, ReminderDelivery
from app.models.workspace import Workspace
from app.schemas.common import ApiResponse

router = APIRouter(prefix='/reminders', tags=['reminders'])

def push_endpoint(value):
    u = urlsplit(value)
    host = (u.hostname or '').lower()
    allowed = host in {'fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'} or host.endswith('.push.apple.com') or host.endswith('.notify.windows.com')
    if u.scheme != 'https' or not allowed or u.username or u.password or u.port not in (None,443) or u.fragment:
        raise ValueError('推送地址必须来自受支持浏览器的 HTTPS 推送服务')
    return value

class Keys(Strict):
    p256dh: str = Field(min_length=80,max_length=100)
    auth: str = Field(min_length=20,max_length=32)
    @field_validator('p256dh','auth')
    @classmethod
    def actual_key(cls, value, info):
        try: raw = base64.urlsafe_b64decode(value + '=' * (-len(value) % 4))
        except Exception as e: raise ValueError('推送密钥编码无效') from e
        if (info.field_name == 'p256dh' and (len(raw)!=65 or raw[0]!=4)) or (info.field_name == 'auth' and len(raw)!=16): raise ValueError('推送密钥长度无效')
        return value

class Subscription(Strict):
    endpoint: str = Field(max_length=2000)
    keys: Keys
    expirationTime: int | None = None
    _endpoint = field_validator('endpoint')(push_endpoint)

class EnableReminder(Strict):
    subscription: Subscription
    timezone: str = Field(max_length=64)
    send_time: str = Field(pattern=r'^([01][0-9]|2[0-3]):[0-5][0-9]$')
    @field_validator('timezone')
    @classmethod
    def valid_zone(cls, value):
        try: ZoneInfo(value)
        except Exception as e: raise ValueError('请选择有效时区') from e
        return value

@router.get('/config')
async def config(user_id: str = Depends(get_current_user_id)):
    ready = bool(settings.EXECUTION_ENABLED and settings.WEB_PUSH_ENABLED and settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY and settings.VAPID_SUBJECT)
    return ApiResponse(success=True, data={'configured':ready,'public_key':settings.VAPID_PUBLIC_KEY if ready else None})

@router.get('/{workspace_id}')
async def status(workspace_id: str, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    w = await _workspace(session,user_id,workspace_id)
    rows = (await session.scalars(select(PushSubscription).where(PushSubscription.user_id==w.user_id,PushSubscription.workspace_id==w.id))).all()
    result=[]
    for row in rows:
        delivery = await session.scalar(select(ReminderDelivery).where(ReminderDelivery.subscription_id==row.id,ReminderDelivery.due_at<=datetime.now(UTC)).order_by(ReminderDelivery.due_at.desc()).limit(1))
        result.append({'id':str(row.id),'enabled':row.enabled,'timezone':row.timezone,'send_time':row.send_time,
            'last_delivery':{'status':delivery.status,'attempts':delivery.attempts,'error':delivery.error,'sent_at':delivery.sent_at.isoformat() if delivery.sent_at else None} if delivery else None})
    return ApiResponse(success=True,data=result)

@router.post('/{workspace_id}')
async def enable(workspace_id: str, payload: EnableReminder, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    if not (settings.EXECUTION_ENABLED and settings.WEB_PUSH_ENABLED and settings.VAPID_PRIVATE_KEY and settings.VAPID_PUBLIC_KEY and settings.VAPID_SUBJECT):
        raise AppException('PUSH_NOT_CONFIGURED','服务器尚未配置推送通道，提醒未启用。',503)
    w = await _workspace(session,user_id,workspace_id)
    await session.execute(select(Workspace.id).where(Workspace.id==w.id).with_for_update())
    digest = hashlib.sha256(payload.subscription.endpoint.encode()).hexdigest()
    row = await session.scalar(select(PushSubscription).where(PushSubscription.user_id==w.user_id,PushSubscription.workspace_id==w.id,PushSubscription.endpoint_hash==digest))
    now=datetime.now(UTC)
    if row is None:
        row=PushSubscription(user_id=w.user_id,workspace_id=w.id,endpoint_hash=digest,subscription=payload.subscription.model_dump(exclude_none=True),timezone=payload.timezone,send_time=payload.send_time,enabled=True,created_at=now,updated_at=now)
        session.add(row)
    else:
        changed=not row.enabled or row.timezone!=payload.timezone or row.send_time!=payload.send_time
        row.subscription=payload.subscription.model_dump(exclude_none=True);row.enabled=True
        if changed: row.schedule_version+=1; row.updated_at=now
        row.timezone=payload.timezone;row.send_time=payload.send_time
    await session.commit()
    return ApiResponse(success=True,data={'id':str(row.id),'enabled':True})

@router.delete('/{workspace_id}/{subscription_id}')
async def pause(workspace_id: str, subscription_id: uuid.UUID, user_id: str = Depends(get_current_user_id), session: AsyncSession = Depends(get_db)):
    w=await _workspace(session,user_id,workspace_id)
    row=await session.scalar(select(PushSubscription).where(PushSubscription.id==subscription_id,PushSubscription.user_id==w.user_id,PushSubscription.workspace_id==w.id).with_for_update())
    if not row: raise NotFoundException('Reminder')
    row.enabled=False;row.schedule_version+=1;row.updated_at=datetime.now(UTC)
    await session.commit()
    return ApiResponse(success=True,data={'paused':True})
