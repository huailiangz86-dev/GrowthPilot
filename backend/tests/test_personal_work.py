"""C1 PostgreSQL contracts: atomic persistence, lost receipts and conflict safety."""
import asyncio
import os
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.personal_work import (Command, LearningContent, Resource, ScheduleContent, SchedulePreferences, apply_command, daily_review, history, snapshot)
from app.core.exceptions import AppException
from app.engines.execution_engine import execute_workspace
from app.models.learning_session import LearningSession
from app.models.personal_work import DocumentRevision, PersonalCommandReceipt, PersonalDocument, ScheduleBlock
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_fact import WorkspaceFact
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection


class PersonalWorkContractTests(unittest.TestCase):
    def test_links_are_pointers_without_unsafe_schemes(self):
        for url in ('javascript:alert(1)', 'file:///private/data', 'https://user:password@example.com', 'https://'):
            with self.assertRaises(ValidationError): Resource(id=uuid.uuid4(), title='来源', url=url)
        self.assertEqual(Resource(id=uuid.uuid4(), title='付费课程', url='https://example.com/login').url, 'https://example.com/login')

    def test_time_requires_zone_and_positive_duration(self):
        now=datetime.now(UTC)
        for start, end, zone in ((now,now,'UTC'),(now.replace(tzinfo=None),now,'UTC'),(now,now+timedelta(hours=1),'Invalid/Zone')):
            with self.assertRaises(ValidationError): ScheduleContent(task_id=uuid.uuid4(), starts_at=start, ends_at=end, timezone=zone)

    def test_applied_requires_actual_evidence(self):
        for data in ({'stage':'applied'}, {'stage':'applied','task_id':uuid.uuid4()}):
            with self.assertRaises(ValidationError): LearningContent(title='学习', **data)
        self.assertEqual(LearningContent(title='学习', stage='practice').stage,'practice')

    def test_available_window_and_capacity_are_validated(self):
        for data in ({'daily_minutes':0},{'available_start':'25:00'},{'available_start':'18:00','available_end':'09:00'}):
            with self.assertRaises(ValidationError):SchedulePreferences(**data)


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class PersonalWorkIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/',1)[-1].endswith('_test'): raise RuntimeError('Isolated _test DB required')
        self.engine=create_async_engine(url)
        self.sessions=async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid,self.other,self.wid,self.wid2=[uuid.uuid4() for _ in range(4)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={}),User(id=self.other,wx_openid=str(self.other),settings={})]);await s.flush()
            s.add_all([Workspace(id=self.wid,user_id=self.uid,name='C1虚构验收'),Workspace(id=self.wid2,user_id=self.uid,name='同人另一空间')]);await s.commit()

    async def asyncTearDown(self):
        from app.models.execution import ExecutionJob
        async with self.sessions() as s:
            docs=select(PersonalDocument.id).where(PersonalDocument.user_id==self.uid)
            await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(docs)))
            for model in (PersonalCommandReceipt,PersonalDocument,ScheduleBlock,LearningSession,WorkspaceFact,WorkspaceEvent,ExecutionJob,WorkspaceReflection,Task,WorkspaceLearningItem,Workspace):
                await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    async def submit(self, command, uid=None, wid=None):
        async with self.sessions() as s:
            result=await apply_command(s, uid or self.uid, wid or self.wid, command)
            await s.commit();return result

    def cmd(self, action, eid=None, data=None, base=0, updated=None, request=None):
        return Command(action=action, entity_id=eid or uuid.uuid4(), request_id=request or uuid.uuid4(), data=data or {}, base_version=base, expected_updated_at=updated)

    async def task(self, **data):
        return (await self.submit(self.cmd('create_task',data={'title':'AI应用方案','body':'# 实际方案\n访谈三位虚构用户。',**data})))['entity']

    async def update(self, entity, **changes):
        return (await self.submit(self.cmd('save_task',entity['id'],{**entity['document']['content'],**changes},entity['document']['version'],entity['updated_at'])))['entity']

    async def test_replay_after_lost_response_has_one_object_revision_and_event(self):
        command=self.cmd('create_task',data={'title':'真实工作','body':'完整原文'})
        a,b=await asyncio.gather(self.submit(command),self.submit(command))
        self.assertEqual(a,b)
        async with self.sessions() as s:
            for model in (Task,PersonalDocument,PersonalCommandReceipt,WorkspaceEvent):
                self.assertEqual(await s.scalar(select(func.count()).select_from(model).where(model.user_id==self.uid)),1)
            self.assertEqual(await s.scalar(select(func.count()).select_from(DocumentRevision).where(DocumentRevision.document_id==uuid.UUID(a['entity']['document']['id']))),1)
        with self.assertRaises(AppException) as error:
            await self.submit(command.model_copy(update={'data':{'title':'不同原文'}}))
        self.assertEqual(error.exception.status_code,409)

    async def test_concurrent_edits_preserve_winner_and_loser_can_restore_original(self):
        task=await self.task()
        original=task['document']['content']
        commands=[self.cmd('save_task',task['id'],{**original,'body':body},1,task['updated_at']) for body in ('甲的新内容','乙的新内容')]
        results=await asyncio.gather(*[self.submit(c) for c in commands],return_exceptions=True)
        self.assertEqual(sum(isinstance(r,AppException) for r in results),1)
        winner=next(r['entity'] for r in results if isinstance(r,dict))
        async with self.sessions() as s:
            revisions=(await history(self.wid,'task',uuid.UUID(task['id']),str(self.uid),s)).data
        self.assertEqual(len(revisions),2)
        restored=await self.submit(self.cmd('restore_task',task['id'],{'revision_id':revisions[-1]['id']},2,winner['updated_at']))
        self.assertEqual(restored['entity']['document']['content']['body'],original['body'])
        self.assertEqual(restored['entity']['document']['version'],3)

    async def test_account_workspace_history_and_link_isolation(self):
        task=await self.task()
        for uid,wid in ((self.other,self.wid),(self.uid,self.wid2)):
            with self.assertRaises(AppException):
                await self.submit(self.cmd('save_task',task['id'],task['document']['content'],1,task['updated_at']),uid,wid)
        async with self.sessions() as s:
            with self.assertRaises(AppException): await history(self.wid,'task',uuid.UUID(task['id']),str(self.other),s)
        learning=self.cmd('create_learning',data={'title':'另一空间学习','task_id':task['id']})
        with self.assertRaises(AppException): await self.submit(learning,wid=self.wid2)

    async def test_legacy_task_keeps_identity_associations_and_no_fake_body(self):
        eid=uuid.uuid4()
        async with self.sessions() as s:
            s.add(Task(id=eid,user_id=self.uid,workspace_id=self.wid,title='旧任务',description='旧说明',status='done',priority='high',completed_at=datetime.now(UTC)))
            await s.commit()
        async with self.sessions() as s:
            data=(await snapshot(self.wid,str(self.uid),s)).data
        old=data['tasks'][0];self.assertEqual(old['document']['content'],{})
        edited=await self.submit(self.cmd('save_task',eid,{'title':'旧任务','body':'本次实际工作','status':'done'},0,old['updated_at']))
        self.assertEqual(edited['entity']['id'],str(eid))
        async with self.sessions() as s:
            task=await s.get(Task,eid);self.assertEqual(task.description,'旧说明');self.assertEqual(task.priority,'high');self.assertIsNotNone(task.completed_at)

    async def test_upstream_property_change_is_not_overwritten(self):
        task=await self.task()
        async with self.sessions() as s:
            row=await s.get(Task,uuid.UUID(task['id']));row.title='另一入口的新标题';await s.commit()
        with self.assertRaises(AppException): await self.update(task,body='迟到的正文')
        async with self.sessions() as s:
            self.assertEqual((await s.get(Task,uuid.UUID(task['id']))).title,'另一入口的新标题')

    async def test_two_blocks_due_separation_reschedule_cancel_and_ended_not_done(self):
        due=(datetime.now(UTC)+timedelta(days=7)).isoformat();task=await self.task(due_at=due)
        start=datetime.now(UTC)-timedelta(days=1)
        blocks=[]
        for offset in (0,2):
            blocks.append((await self.submit(self.cmd('save_schedule',data={'task_id':task['id'],'starts_at':(start+timedelta(hours=offset)).isoformat(),'ends_at':(start+timedelta(hours=offset+1)).isoformat(),'timezone':'Asia/Shanghai'})))['entity'])
        with self.assertRaises(AppException): await self.submit(self.cmd('save_schedule',data={'task_id':task['id'],'starts_at':start.isoformat(),'ends_at':(start+timedelta(minutes=30)).isoformat(),'timezone':'UTC'}))
        first=blocks[0];new={k:v for k,v in first.items() if k in ('task_id','starts_at','ends_at','timezone')}
        new['starts_at']=(start+timedelta(hours=4)).isoformat();new['ends_at']=(start+timedelta(hours=5)).isoformat()
        moved=await self.submit(self.cmd('save_schedule',first['id'],new,1));self.assertEqual(moved['entity']['id'],first['id'])
        with self.assertRaises(AppException): await self.submit(self.cmd('cancel_schedule',first['id'],base=1))
        await self.submit(self.cmd('cancel_schedule',first['id'],base=2))
        async with self.sessions() as s:
            row=await s.get(Task,uuid.UUID(task['id']));self.assertEqual(row.status,'todo');self.assertEqual(row.due_at.isoformat(),due)
            self.assertEqual((await s.get(PersonalDocument,uuid.UUID(task['document']['id']))).content['body'],task['document']['content']['body'])

    async def test_cross_midnight_block_keeps_zone_and_absolute_instants(self):
        task=await self.task();start=datetime(2026,10,8,23,30,tzinfo=ZoneInfo('Asia/Shanghai'))
        block=(await self.submit(self.cmd('save_schedule',data={'task_id':task['id'],'starts_at':start.isoformat(),'ends_at':(start+timedelta(hours=2)).isoformat(),'timezone':'Asia/Shanghai'})))['entity']
        async with self.sessions() as s:
            restored=(await snapshot(self.wid,str(self.uid),s)).data['schedules'][0]
        self.assertEqual(datetime.fromisoformat(restored['starts_at']),start)
        self.assertEqual(restored['timezone'],block['timezone'])

    async def test_learning_practice_application_and_daily_sources_do_not_duplicate_work(self):
        learning=(await self.submit(self.cmd('create_learning',data={'title':'访谈方法','resources':[{'id':str(uuid.uuid4()),'title':'登录页也可保留','url':'https://example.com/login'}],
            'notes':'先问过去的实际行为','exercise':'改写了三条开放问题','stage':'practice'})))['entity']
        command=self.cmd('create_application',learning['id'],{'title':'把访谈用于方案'},1,learning['updated_at'])
        applied=await self.submit(command);self.assertEqual(applied,await self.submit(command))
        learning=applied['entity'];task=applied['application']
        task=await self.update(task,body='访谈提纲实际正文',outcome='验证了用户需求')
        data={**learning['document']['content'],'stage':'applied','outcome':'将开放问题用于一次访谈','minutes_by_date':{str(date.today()):25}}
        learning=(await self.submit(self.cmd('save_learning',learning['id'],data,learning['document']['version'],learning['updated_at'])))['entity']
        async with self.sessions() as s:
            review=(await daily_review(self.wid,datetime.now(ZoneInfo('Asia/Shanghai')).date(),str(self.uid),s)).data
        self.assertEqual(len(review['evidence']),2);self.assertEqual(len({e['id'] for e in review['evidence']}),2)
        self.assertEqual(sum(e['entity_id']==task['id'] for e in review['evidence']),1)
        saved=await self.submit(self.cmd('save_review',review['id'],{'date':review['date'],'reason':'先缩小验证范围','feeling':'轻松','next':'再访谈一次'}))
        await self.update(task,body='之后的变化')
        async with self.sessions() as s:
            refreshed=(await daily_review(self.wid,date.fromisoformat(review['date']),str(self.uid),s)).data
        self.assertEqual(saved['entity']['document']['content']['evidence'],refreshed['saved_evidence'])
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(WorkspaceFact).where(WorkspaceFact.user_id==self.uid)),1)
            self.assertEqual((await s.get(Task,uuid.UUID(task['id']))).status,'todo')

    async def test_failed_command_rolls_back_all_objects(self):
        command=self.cmd('create_learning',data={'title':'不能产生半件对象','task_id':str(uuid.uuid4())})
        with self.assertRaises(AppException): await self.submit(command)
        async with self.sessions() as s:
            for model in (WorkspaceLearningItem,PersonalDocument,PersonalCommandReceipt):
                self.assertEqual(await s.scalar(select(func.count()).select_from(model).where(model.user_id==self.uid)),0)

    async def test_personal_notes_are_live_agent_evidence_with_privacy_and_revision_digest(self):
        from app.engines.agent_context import resolve_source
        task=await self.task()
        async with self.sessions() as s:
            original=await resolve_source(s,self.uid,self.wid,f"tasks:{task['id']}",{})
            self.assertIn('访谈三位虚构用户。',original['content'])
            self.assertIsNone(await resolve_source(s,self.other,self.wid,f"tasks:{task['id']}",{}))
            self.assertIsNone(await resolve_source(s,self.uid,self.wid,f"tasks:{task['id']}",{'privacy_scope':{'enabled_sources':[]}}))
        await self.update(task,body='新保存的实际方案')
        async with self.sessions() as s:
            current=await resolve_source(s,self.uid,self.wid,f"tasks:{task['id']}",{})
            self.assertIn('新保存的实际方案',current['content'])
            self.assertNotEqual(original['digest'],current['digest'])

    async def test_personal_timer_keeps_stage_and_removed_self_report_removes_fact(self):
        from app.engines.learning_session_engine import study_session
        day=date.today()
        learning=(await self.submit(self.cmd('create_learning',data={'title':'本人学习','resources':[{'id':str(uuid.uuid4()),'title':'原始链接','url':'https://example.com'}],
            'minutes_by_date':{str(day):25}})))['entity']
        sid=uuid.uuid4();now=datetime.now(UTC)
        async with self.sessions() as s:
            await study_session(s,self.uid,uuid.UUID(learning['id']),sid,now=now)
            await s.commit()
        async with self.sessions() as s:
            _,item=await study_session(s,self.uid,uuid.UUID(learning['id']),sid,complete=True,note='一次本人练习',now=now+timedelta(seconds=20))
            self.assertEqual(item.status,'queued');await s.commit()
        async with self.sessions() as s:
            learning=(await snapshot(self.wid,str(self.uid),s)).data['learning'][0]
        await self.submit(self.cmd('save_learning',learning['id'],{**learning['document']['content'],'minutes_by_date':{}},learning['document']['version'],learning['updated_at']))
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(WorkspaceFact).where(WorkspaceFact.user_id==self.uid)),0)

    async def test_schedule_preferences_are_scoped_versioned_and_replay_safe(self):
        command=self.cmd('save_preferences',self.wid,{'daily_minutes':60,'available_start':'18:00','available_end':'21:00'})
        receipt=await self.submit(command)
        self.assertEqual(receipt,await self.submit(command))
        with self.assertRaises(AppException):await self.submit(self.cmd('save_preferences',self.wid,{'daily_minutes':90}))
        with self.assertRaises(AppException):await self.submit(command,uid=self.other)
        async with self.sessions() as s:
            data=(await snapshot(self.wid,str(self.uid),s)).data
            other=(await snapshot(self.wid2,str(self.uid),s)).data
        self.assertEqual(data['preferences']['daily_minutes'],60)
        self.assertEqual(data['preferences']['version'],1)
        self.assertEqual(other['preferences']['version'],0)
        from app.api.onboarding import DailyPreferencesUpdateRequest,update_daily_preferences
        async with self.sessions() as stale:
            user=await stale.get(User,self.uid)
            await self.submit(self.cmd('save_preferences',self.wid,{'daily_minutes':90,'available_start':'18:00','available_end':'21:00'},base=1))
            self.assertEqual(user.settings['personal_work_preferences'][str(self.wid)]['daily_minutes'],60)
            await update_daily_preferences(DailyPreferencesUpdateRequest(timezone='UTC',morning_time='08:30',evening_time='21:30'),str(self.uid),stale)
        async with self.sessions() as s:
            self.assertEqual((await s.get(User,self.uid)).settings['personal_work_preferences'][str(self.wid)]['daily_minutes'],90)
