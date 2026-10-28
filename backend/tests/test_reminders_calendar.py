import asyncio
import base64
import os
import unittest
import uuid
from datetime import UTC,date,datetime,timedelta
from types import SimpleNamespace
from unittest.mock import patch
from sqlalchemy import select,delete,func
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from pydantic import ValidationError
from app.api.reminders import EnableReminder,push_endpoint,pause
from app.engines.calendar_feed import workspace_calendar
from app.engines.reminder_engine import reminder_tick,scheduled_at,send_push
from app.models.reminders import PushSubscription,ReminderDelivery
from app.models.user import User
from app.models.workspace import Workspace
from app.models.task import Task
from app.core.config import settings

class Contracts(unittest.TestCase):
    def test_calendar_preserves_actual_intervals_deadline_and_cancelled_identifiers(self):
        now=datetime(2026,10,27,6,tzinfo=UTC);tid=uuid.uuid4();bid=uuid.uuid4();rid=uuid.uuid4()
        task=SimpleNamespace(id=tid,title='标题\r\nEND:VEVENT',due_at=now,updated_at=now,deleted_at=None)
        block=SimpleNamespace(id=bid,task_id=tid,starts_at=now-timedelta(hours=1),ends_at=now-timedelta(minutes=15),updated_at=now,timezone='Asia/Shanghai',cancelled_at=now,version=3)
        review={'id':rid,'title':'复习','date':date(2026,10,28),'updated_at':now}
        text=workspace_calendar([task],[block],[review],now)
        self.assertEqual(text.count('\r\nEND:VEVENT\r\n'),3)
        self.assertIn('DTSTART:20261027T050000Z',text);self.assertIn('DTEND:20261027T054500Z',text)
        self.assertIn('DTEND:20261027T060100Z',text)
        self.assertIn('DTSTART;VALUE=DATE:20261028',text);self.assertIn('STATUS:CANCELLED',text)
        self.assertIn(f'UID:block-{bid}@growthpilot',text)
        filtered=workspace_calendar([task],[block],[review],now,{'blocks':False,'deadlines':False,'reviews':True})
        self.assertEqual(filtered.count('BEGIN:VEVENT'),1)
        self.assertTrue(all(len(line.encode())<=75 for line in text.split('\r\n')))
    def test_timezone_dst_and_unsafe_endpoints(self):
        self.assertEqual(scheduled_at(date(2026,10,27),'08:30','Asia/Shanghai'),datetime(2026,10,27,0,30,tzinfo=UTC))
        self.assertEqual(scheduled_at(date(2026,11,1),'01:30','America/New_York'),datetime(2026,11,1,5,30,tzinfo=UTC))
        for url in ('https://127.0.0.1/secret','https://fcm.googleapis.com.evil.test/x','http://fcm.googleapis.com/x','https://u:p@fcm.googleapis.com/x','https://fcm.googleapis.com:9443/x'):
            with self.assertRaises(ValueError):push_endpoint(url)
    def test_webpush_encrypts_and_disables_redirects(self):
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import Encoding,PrivateFormat,PublicFormat,NoEncryption
        from requests import Response
        vapid=ec.generate_private_key(ec.SECP256R1());receiver=ec.generate_private_key(ec.SECP256R1())
        enc=lambda b:base64.urlsafe_b64encode(b).decode().rstrip('=')
        subscription={'endpoint':'https://fcm.googleapis.com/fcm/send/synthetic','keys':{'p256dh':enc(receiver.public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint)),'auth':enc(b'a'*16)}}
        key=enc(vapid.private_bytes(Encoding.DER,PrivateFormat.TraditionalOpenSSL,NoEncryption()))
        captured=[]
        def request(_client,method,url,**kw):
            captured.append(kw);r=Response();r.status_code=201;return r
        with patch.object(settings,'VAPID_PRIVATE_KEY',key),patch.object(settings,'VAPID_SUBJECT','mailto:test@example.com'),patch('requests.Session.request',request):
            send_push(subscription,{'id':str(uuid.uuid4()),'body':'fictional digest'})
        self.assertFalse(captured[0]['allow_redirects'])
        self.assertNotIn(b'fictional digest',captured[0]['data'])

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class DeliveryIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.wid,self.sid=uuid.uuid4(),uuid.uuid4(),uuid.uuid4();self.now=datetime(2026,10,27,1,tzinfo=UTC)
        self.enabled=patch.object(settings,'WEB_PUSH_ENABLED',True);self.enabled.start()
        async with self.sessions() as s:
            s.add(User(id=self.uid,wx_openid=str(self.uid),settings={}));await s.flush()
            s.add(Workspace(id=self.wid,user_id=self.uid,name='虚构提醒检查'));await s.flush()
            s.add(Task(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,title='实际待办',due_at=self.now-timedelta(minutes=30)))
            s.add(PushSubscription(id=self.sid,user_id=self.uid,workspace_id=self.wid,endpoint_hash=str(uuid.uuid4()),subscription={'endpoint':'https://fcm.googleapis.com/synthetic','keys':{}},timezone='Asia/Shanghai',send_time='08:30',created_at=self.now-timedelta(hours=1),updated_at=self.now-timedelta(hours=1),schedule_version=1,enabled=True));await s.commit()
    async def asyncTearDown(self):
        self.enabled.stop()
        async with self.sessions() as s:
            await s.execute(delete(ReminderDelivery).where(ReminderDelivery.subscription_id==self.sid))
            for m in (PushSubscription,Task,Workspace):await s.execute(delete(m).where(m.user_id==self.uid))
            await s.execute(delete(User).where(User.id==self.uid));await s.commit()
        await self.engine.dispose()
    async def sent(self):
        async with self.sessions() as s:return (await s.scalars(select(ReminderDelivery).where(ReminderDelivery.subscription_id==self.sid))).all()
    async def test_concurrent_ticks_and_restart_only_send_one_digest(self):
        calls=[]
        await asyncio.gather(*(reminder_tick(self.sessions,self.now,lambda sub,p:calls.append(p)) for _ in range(3)))
        await self.engine.dispose()
        await reminder_tick(self.sessions,self.now+timedelta(minutes=2),lambda sub,p:calls.append(p))
        self.assertEqual(len(calls),1);self.assertEqual(sum(r.status=='sent' for r in await self.sent()),1)
    async def test_failure_retries_same_delivery_then_pause_cancels_future_work(self):
        calls=[]
        def fail(sub,p):calls.append(p['id']);raise OSError('synthetic offline')
        await reminder_tick(self.sessions,self.now,fail)
        self.assertEqual(sum(r.status=='failed' for r in await self.sent()),1)
        await reminder_tick(self.sessions,self.now+timedelta(minutes=2),lambda sub,p:calls.append(p['id']))
        self.assertEqual(calls,[calls[0],calls[0]])
        async with self.sessions() as s:await pause(str(self.wid),self.sid,str(self.uid),s)
        await reminder_tick(self.sessions,self.now+timedelta(days=1),lambda sub,p:calls.append(p['id']))
        self.assertEqual(len(calls),2)
    async def test_no_due_content_stays_quiet_and_archive_prevents_send(self):
        calls=[]
        async with self.sessions() as s:
            task=await s.scalar(select(Task).where(Task.user_id==self.uid));task.status='done';await s.commit()
        await reminder_tick(self.sessions,self.now,lambda sub,p:calls.append(p))
        self.assertFalse(calls);self.assertTrue(any(r.status=='quiet' for r in await self.sent()))
        async with self.sessions() as s:
            w=await s.get(Workspace,self.wid);w.archived_at=self.now;await s.commit()
        await reminder_tick(self.sessions,self.now+timedelta(days=1),lambda sub,p:calls.append(p))
        self.assertFalse(calls)
    async def test_scope_export_rotation_revocation_and_missing_push_config_over_http(self):
        from httpx import AsyncClient,ASGITransport
        from app.main import app
        from app.core.database import get_db
        from app.core.dependencies import get_current_user_id
        from app.models.execution import CalendarSubscription
        async def database():
            async with self.sessions() as session:yield session
        app.dependency_overrides[get_db]=database
        app.dependency_overrides[get_current_user_id]=lambda:str(self.uid)
        try:
            with patch.object(settings,'PUBLIC_BASE_URL','https://calendar.example.com'):
                async with AsyncClient(transport=ASGITransport(app=app),base_url='http://local.test') as client:
                    prefix=settings.API_V1_PREFIX+'/execution'
                    first=await client.post(prefix+'/calendar-subscription',params={'workspace_id':str(self.wid)},json={'deadlines':True,'blocks':False,'reviews':False})
                    self.assertEqual(first.status_code,200)
                    path=first.json()['data']['path'];feed=await client.get(path)
                    self.assertIn('BEGIN:VEVENT',feed.text)
                    second=await client.post(prefix+'/calendar-subscription',params={'workspace_id':str(self.wid)},json={'deadlines':False,'blocks':False,'reviews':True})
                    self.assertEqual((await client.get(path)).status_code,404)
                    self.assertNotIn('BEGIN:VEVENT',(await client.get(second.json()['data']['path'])).text)
                    exported=await client.get(prefix+'/calendar-export',params={'workspace_id':str(self.wid),'reviews':False,'blocks':False})
                    self.assertEqual(exported.status_code,200);self.assertIn('BEGIN:VEVENT',exported.text)
                    await client.delete(prefix+'/calendar-subscription',params={'workspace_id':str(self.wid)})
                    self.assertEqual((await client.get(second.json()['data']['path'])).status_code,404)
                    with patch.object(settings,'WEB_PUSH_ENABLED',False):
                        self.assertFalse((await client.get(settings.API_V1_PREFIX+'/reminders/config')).json()['data']['configured'])
        finally:
            app.dependency_overrides.clear()
            async with self.sessions() as s:
                await s.execute(delete(CalendarSubscription).where(CalendarSubscription.user_id==self.uid));await s.commit()
    async def test_device_consent_schedule_updates_are_idempotent_and_scoped(self):
        from httpx import AsyncClient,ASGITransport
        from app.main import app
        from app.core.database import get_db
        from app.core.dependencies import get_current_user_id
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import Encoding,PublicFormat
        enc=lambda raw:base64.urlsafe_b64encode(raw).decode().rstrip('=')
        pub=ec.generate_private_key(ec.SECP256R1()).public_key().public_bytes(Encoding.X962,PublicFormat.UncompressedPoint)
        payload={'subscription':{'endpoint':'https://fcm.googleapis.com/synthetic-http','keys':{'p256dh':enc(pub),'auth':enc(b'a'*16)},'expirationTime':None},'timezone':'Asia/Shanghai','send_time':'09:15'}
        async def database():
            async with self.sessions() as s:yield s
        app.dependency_overrides[get_db]=database;app.dependency_overrides[get_current_user_id]=lambda:str(self.uid)
        new_id=None
        try:
            with patch.multiple(settings,WEB_PUSH_ENABLED=True,EXECUTION_ENABLED=True,VAPID_PRIVATE_KEY='synthetic',VAPID_PUBLIC_KEY='synthetic',VAPID_SUBJECT='mailto:test@example.com'):
                async with AsyncClient(transport=ASGITransport(app=app),base_url='http://local.test') as c:
                    path=settings.API_V1_PREFIX+'/reminders/'+str(self.wid)
                    first=await c.post(path,json=payload);self.assertEqual(first.status_code,200);new_id=uuid.UUID(first.json()['data']['id'])
                    self.assertEqual((await c.post(path,json=payload)).json()['data']['id'],str(new_id))
                    updated=await c.post(path,json={**payload,'send_time':'10:30'});self.assertEqual(updated.status_code,200)
                    async with self.sessions() as s:
                        row=await s.get(PushSubscription,new_id);self.assertEqual(row.schedule_version,2);self.assertEqual(row.send_time,'10:30')
                    self.assertEqual((await c.post(path,json={**payload,'timezone':'invalid/zone'})).status_code,422)
                    self.assertEqual((await c.delete(path+'/'+str(new_id))).status_code,200)
                    self.assertEqual((await c.get(settings.API_V1_PREFIX+'/reminders/'+str(uuid.uuid4()))).status_code,404)
                    async with self.sessions() as s:self.assertFalse((await s.get(PushSubscription,new_id)).enabled)
        finally:
            app.dependency_overrides.clear()
            if new_id:
                async with self.sessions() as s:await s.execute(delete(PushSubscription).where(PushSubscription.id==new_id));await s.commit()
