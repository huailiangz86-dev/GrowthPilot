"""Restart-safe daily due digest; browser notification tags deduplicate retries."""
import asyncio
import json
import uuid
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from app.core.config import settings
from app.core.database import async_session_factory
from app.engines.calendar_feed import calendar_objects
from app.models.reminders import PushSubscription, ReminderDelivery
from app.models.workspace import Workspace


def scheduled_at(day, send_time, timezone):
    # fold=0 selects the first occurrence of a repeated DST hour. Nonexistent
    # local times normalize forward on the UTC round trip.
    return datetime.combine(day,time.fromisoformat(send_time),ZoneInfo(timezone)).replace(fold=0).astimezone(UTC)


def send_push(subscription, payload):
    from pywebpush import webpush
    from requests import Session
    from app.api.reminders import push_endpoint
    push_endpoint(subscription['endpoint'])
    class NoRedirects(Session):
        def request(self, method, url, **kwargs):
            kwargs['allow_redirects']=False
            return super().request(method,url,**kwargs)
    with NoRedirects() as client:
        response=webpush(subscription_info=subscription,data=json.dumps(payload,ensure_ascii=False),
            vapid_private_key=settings.VAPID_PRIVATE_KEY,vapid_claims={'sub':settings.VAPID_SUBJECT},
            ttl=3600,timeout=15,requests_session=client)
        if not 200<=response.status_code<300: raise RuntimeError('Push service did not accept notification')


async def reminder_tick(session_factory=async_session_factory, now=None, sender=None):
    now=now or datetime.now(UTC)
    if not settings.WEB_PUSH_ENABLED: return
    sender=sender or send_push
    async with session_factory() as s:
        rows=(await s.scalars(select(PushSubscription).join(Workspace,Workspace.id==PushSubscription.workspace_id)
            .where(PushSubscription.enabled.is_(True),Workspace.user_id==PushSubscription.user_id,Workspace.archived_at.is_(None)))).all()
        for row in rows:
            today=now.astimezone(ZoneInfo(row.timezone)).date()
            for offset in (-1,0,1):
                day=today+timedelta(days=offset);due=scheduled_at(day,row.send_time,row.timezone)
                if due<row.updated_at: continue
                await s.execute(insert(ReminderDelivery).values(id=uuid.uuid4(),subscription_id=row.id,local_date=day,
                    schedule_version=row.schedule_version,due_at=due,next_attempt_at=due,status='pending',attempts=0)
                    .on_conflict_do_nothing(constraint='uq_reminder_day'))
        await s.commit()
    # Each delivery + device is locked through the bounded send. Concurrent
    # ticks skip locked rows; a crash rolls back and retries the same delivery ID.
    for _ in range(100):
        async with session_factory() as s:
            delivery=await s.scalar(select(ReminderDelivery).where(ReminderDelivery.status.in_(['pending','failed']),
                ReminderDelivery.next_attempt_at<=now).order_by(ReminderDelivery.due_at).limit(1).with_for_update(skip_locked=True))
            if not delivery: return
            device=await s.scalar(select(PushSubscription).where(PushSubscription.id==delivery.subscription_id).with_for_update())
            workspace=await s.get(Workspace,device.workspace_id) if device else None
            if not device or not device.enabled or delivery.schedule_version!=device.schedule_version or not workspace or workspace.archived_at:
                delivery.status='cancelled'
            elif delivery.due_at<now-timedelta(hours=24):
                delivery.status='expired'
            else:
                tasks,blocks,reviews=await calendar_objects(s,device.user_id,device.workspace_id)
                zone=ZoneInfo(device.timezone);day=now.astimezone(zone).date()
                due_tasks=sum(t.due_at is not None and not t.deleted_at and t.status!='done' and t.due_at<=now for t in tasks)
                due_reviews=sum(not r.get('cancelled') and r['date']<=day for r in reviews)
                if not due_tasks and not due_reviews:
                    delivery.status='quiet'
                else:
                    delivery.attempts+=1
                    try:
                        await asyncio.to_thread(sender,device.subscription,{'id':str(delivery.id),'title':'GrowthPilot 到期提醒',
                            'body':f'有 {due_tasks} 项到期工作、{due_reviews} 项待复习内容。打开后查看。','url':'/app/execution'})
                        delivery.status='sent';delivery.sent_at=now;delivery.error=None
                    except Exception as error:
                        response=getattr(error,'response',None)
                        code=getattr(response,'status_code',None) if response is not None else getattr(error,'status_code',None)
                        if code in (404,410):
                            device.enabled=False;delivery.status='expired';delivery.error='设备推送凭据已失效，请重新开启。'
                        else:
                            delivery.status='failed' if delivery.attempts<6 else 'expired'
                            delivery.error='推送服务暂未确认接收，服务器将按同一标识重试。' if delivery.status=='failed' else '本次提醒重试已结束，请检查推送配置。'
                            delivery.next_attempt_at=now+timedelta(seconds=min(3600,30*2**delivery.attempts))
            await s.commit()
