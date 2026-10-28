"""Verify execution with no UI requests, retry, isolation and automatic study facts."""
import asyncio
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.execution import calendar_feed, connect_calendar, disconnect_calendar, execution_status
from app.api.learning_items import LearningItemCreateRequest
from app.core.exceptions import NotFoundException
from app.engines.calendar_feed import task_calendar
from app.engines.execution_engine import execution_tick, milestone_task_id
from app.engines.learning_session_engine import observed_seconds, study_session
from app.engines.learning_resources import match_learning_resource
from app.models.execution import ExecutionJob
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_fact import WorkspaceFact
from app.models.workspace_learning_item import WorkspaceLearningItem


class ExecutionContractTests(unittest.TestCase):
    def test_resource_matching_does_not_invent_unknown_topic(self):
        self.assertIsNotNone(match_learning_resource('学习AI相关内容'))
        self.assertIsNone(match_learning_resource('整理一次家庭会议'))
    def test_source_url_rejects_unsafe_links(self):
        for url in ('javascript:alert(1)', 'file:///etc/passwd', 'https://u:p@example.com', 'https://'):
            with self.assertRaises(ValidationError):
                LearningItemCreateRequest(workspace_id=str(uuid.uuid4()), title='阅读', source_url=url)

    def test_calendar_unicode_folding_and_injection(self):
        now = datetime.now(UTC)
        task = SimpleNamespace(id=uuid.uuid4(), title='研究方法'*40+'\r\nEND:VEVENT', description='a,b;c\\d',
            status='todo', due_at=now, updated_at=now, deleted_at=None, time_block=25)
        calendar = task_calendar([task], now)
        self.assertEqual(calendar.count('\r\nEND:VEVENT\r\n'), 1)
        self.assertTrue(all(len(line.encode()) <= 75 for line in calendar.split('\r\n')))
        self.assertIn('a\\,b\\;c\\\\d', calendar)

    def test_unobserved_and_paused_time_is_not_counted(self):
        now = datetime.now(UTC)
        self.assertEqual(observed_seconds(SimpleNamespace(active=True, last_seen_at=now-timedelta(seconds=15)), now), 15)
        self.assertEqual(observed_seconds(SimpleNamespace(active=True, last_seen_at=now-timedelta(hours=1)), now), 0)
        self.assertEqual(observed_seconds(SimpleNamespace(active=False, last_seen_at=now-timedelta(seconds=15)), now), 0)


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class ExecutionIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/',1)[-1].endswith('_test'):
            raise RuntimeError('Only isolated _test databases are permitted')
        self.engine = create_async_engine(url)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid, self.wid, self.gid, self.pid, self.lid, self.other = [uuid.uuid4() for _ in range(6)]
        self.now = datetime(2026,10,8,7,tzinfo=UTC)
        async with self.sessions() as session:
            session.add_all([User(id=self.uid, wx_openid=str(self.uid), settings={}), User(id=self.other, wx_openid=str(self.other), settings={})]); await session.flush()
            session.add(Workspace(id=self.wid, user_id=self.uid, name='后台验收')); await session.flush()
            session.add(Goal(id=self.gid, user_id=self.uid, workspace_id=self.wid, title='真实闭环')); await session.flush()
            session.add(GrowthPlan(id=self.pid, user_id=self.uid, workspace_id=self.wid, goal_id=self.gid,
                title='两步计划', milestones=['整理一份材料', '写出应用结果'], execution_enabled=True))
            session.add(WorkspaceLearningItem(id=self.lid, user_id=self.uid, workspace_id=self.wid, goal_id=self.gid,
                title='学习原始资料', source_url='https://example.com/material'))
            await session.commit()

    async def asyncTearDown(self):
        # Keep the isolated database reusable without deleting other test fixtures.
        from sqlalchemy import delete
        from app.models.execution import CalendarSubscription
        from app.models.learning_session import LearningSession
        async with self.sessions() as session:
            for model in (CalendarSubscription, LearningSession, WorkspaceFact, ExecutionJob, WorkspaceEvent, Task, GrowthPlan, WorkspaceLearningItem, Goal, Workspace):
                await session.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await session.execute(delete(User).where(User.id.in_([self.uid,self.other]))); await session.commit()
        await self.engine.dispose()

    async def jobs(self):
        async with self.sessions() as session:
            return list((await session.execute(select(ExecutionJob).where(ExecutionJob.workspace_id==self.wid))).scalars().all())

    async def test_closed_browser_plan_progression_and_deduplication(self):
        await asyncio.gather(execution_tick(self.sessions,self.now), execution_tick(self.sessions,self.now))
        first = milestone_task_id(self.pid,0,'整理一份材料')
        async with self.sessions() as session:
            tasks = list((await session.execute(select(Task).where(Task.workspace_id==self.wid, Task.plan_id==self.pid))).scalars().all())
            self.assertEqual([t.id for t in tasks],[first]); self.assertIn('https://example.com/material',tasks[0].description)
            tasks[0].status='done';tasks[0].completed_at=self.now;await session.commit()
        # No endpoint or browser request triggers this second step.
        await execution_tick(self.sessions,self.now+timedelta(seconds=20))
        async with self.sessions() as session:
            second = await session.get(Task,milestone_task_id(self.pid,1,'写出应用结果'))
            self.assertEqual(second.status,'todo')
            self.assertEqual((await session.get(GrowthPlan,self.pid)).progress,50)
            second.status='done';second.completed_at=self.now;await session.commit()
        await execution_tick(self.sessions,self.now+timedelta(seconds=40))
        jobs = await self.jobs()
        self.assertEqual(next(j for j in jobs if j.kind=='plan').status,'completed')
        self.assertEqual(next(j for j in jobs if j.kind=='analysis').result['report']['metrics']['completed_tasks'],2)

    async def test_missing_steps_block_and_pause_does_not_create_tasks(self):
        async with self.sessions() as session:
            plan = await session.get(GrowthPlan,self.pid);plan.milestones=[];await session.commit()
        await execution_tick(self.sessions,self.now)
        self.assertEqual(next(j for j in await self.jobs() if j.kind=='plan').status,'blocked')
        async with self.sessions() as session:
            plan = await session.get(GrowthPlan,self.pid);plan.milestones=['一个具体步骤'];plan.execution_enabled=False;await session.commit()
        await execution_tick(self.sessions,self.now+timedelta(seconds=20))
        self.assertEqual(next(j for j in await self.jobs() if j.kind=='plan').status,'paused')
        async with self.sessions() as session:
            self.assertEqual(len(list((await session.execute(select(Task).where(Task.workspace_id==self.wid, Task.plan_id==self.pid))).scalars().all())),0)

    async def test_learning_resource_is_matched_and_action_runs_once(self):
        async with self.sessions() as session:
            item=await session.get(WorkspaceLearningItem,self.lid);item.source_url=None;item.title='学习AI相关内容';await session.commit()
        await execution_tick(self.sessions,self.now)
        await execution_tick(self.sessions,self.now+timedelta(seconds=20))
        async with self.sessions() as session:
            item=await session.get(WorkspaceLearningItem,self.lid)
            self.assertEqual(item.source_url,'https://github.com/microsoft/generative-ai-for-beginners')
            task=await session.get(Task,uuid.uuid5(item.id,'learning-action'))
            self.assertEqual(task.status,'todo')
            item.status='completed';item.progress=100;await session.commit()
        await execution_tick(self.sessions,self.now+timedelta(seconds=40))
        async with self.sessions() as session:
            self.assertEqual((await session.get(Task,uuid.uuid5(self.lid,'learning-action'))).status,'done')

    async def test_failure_rolls_back_and_retries_in_background(self):
        async def fail(*args):
            session=args[0]
            session.add(Task(user_id=self.uid,workspace_id=self.wid,title='必须回滚'))
            await session.flush()
            raise RuntimeError('simulated executor failure')
        with patch('app.engines.execution_engine._advance_plan',side_effect=fail), patch('app.engines.execution_engine.logger'):
            await execution_tick(self.sessions,self.now)
        job = next(j for j in await self.jobs() if j.kind=='plan')
        self.assertEqual((job.status,job.attempts),('failed',1))
        async with self.sessions() as session:
            self.assertEqual(len(list((await session.execute(select(Task).where(Task.workspace_id==self.wid, Task.plan_id==self.pid))).scalars().all())),0)
        await execution_tick(self.sessions,self.now+timedelta(seconds=16))
        self.assertEqual(next(j for j in await self.jobs() if j.kind=='plan').status,'waiting')

    async def test_study_minutes_save_without_completion_and_finish_replays(self):
        sid=uuid.uuid4()
        async def beat(offset, **values):
            async with self.sessions() as session:
                row,item=await study_session(session,self.uid,self.lid,sid,now=self.now+timedelta(seconds=offset),**values)
                await session.commit();return row,item
        await beat(0)
        for offset in (15,30,45,60,75): await beat(offset)
        async with self.sessions() as session:
            facts=list((await session.execute(select(WorkspaceFact).where(WorkspaceFact.user_id==self.uid))).scalars().all())
            self.assertEqual(len(facts),1);self.assertEqual(facts[0].minutes,1)
            self.assertNotEqual((await session.get(WorkspaceLearningItem,self.lid)).progress,100)
        row,item=await beat(90,complete=True,note='实际应用结果');self.assertEqual((row.active_seconds,item.progress),(90,100))
        replay,_=await beat(200,complete=True,note='实际应用结果');self.assertEqual(replay.active_seconds,90)
        async with self.sessions() as session:
            with self.assertRaises(NotFoundException): await study_session(session,self.other,self.lid,sid)

    @patch("app.api.execution.settings.PUBLIC_BASE_URL", "https://calendar.example.test")
    async def test_calendar_subscription_isolated_rotation_and_revocation(self):
        await execution_tick(self.sessions,self.now)
        async with self.sessions() as session:
            result=(await connect_calendar(str(self.wid),str(self.uid),session)).data
        token=result['path'].split('token=')[1]
        async with self.sessions() as session:
            calendar=await calendar_feed(token,session)
            self.assertIn('整理一份材料',calendar.body.decode());self.assertNotIn('写出应用结果',calendar.body.decode())
            with self.assertRaises(NotFoundException): await execution_status(str(self.wid),str(self.other),session)
        async with self.sessions() as session:
            await connect_calendar(str(self.wid),str(self.uid),session)
        async with self.sessions() as session:
            with self.assertRaises(NotFoundException):await calendar_feed(token,session)
            await disconnect_calendar(str(self.wid),str(self.uid),session)
