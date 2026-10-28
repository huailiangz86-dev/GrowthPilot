"""Onboarding durability checks against an explicitly isolated PostgreSQL database."""

import asyncio
import os
import unittest
import uuid
from datetime import UTC, datetime
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.onboarding import ContextCompleteRequest, complete_context, get_context_submission
from app.core.database import Base
from app.core.exceptions import AppException, NotFoundException
from app.engines.onboarding_engine import _create_object
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.memory import MemoryEntry
from app.models.onboarding_submission import OnboardingSubmission
from app.models.task import Task
from app.models.user import User
from app.models.workspace import Project, Workspace, WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem


class OnboardingGraphValidationTests(unittest.TestCase):
    def test_plan_requires_goal_and_new_objects_require_a_stable_request(self):
        for values in (
            {"workspace": {"name": "空间"}, "goal": {"title": "目标"}},
            {"workspace": {"name": "空间"}, "client_request_id": uuid.uuid4(), "plan": {"title": "计划", "total_weeks": 4}},
            {"workspace": {"name": "空间"}, "client_request_id": uuid.uuid4(), "tasks": [{"client_key": "task-0", "title": "任务"}, {"client_key": "task-0", "title": "任务2"}]},
            {"workspace": {"name": "空间"}, "client_request_id": uuid.uuid4(), "tasks": [{"client_key": "task-0", "title": "任务", "due_at": "2026-10-07T12:00:00"}]},
        ):
            with self.assertRaises(ValidationError):
                ContextCompleteRequest(raw_input="原话", **values)


@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_DATABASE_URL"), "requires isolated PostgreSQL test database")
class OnboardingSyncIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["GROWTHPILOT_TEST_DATABASE_URL"])
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        tables = [model.__table__ for model in (User, Workspace, Project, Goal, GrowthPlan, Task, MemoryEntry, WorkspaceLearningItem, WorkspaceEvent, OnboardingSubmission)]
        async with self.engine.begin() as connection:
            await connection.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
        self.uid = uuid.uuid4()
        self.request_id = uuid.uuid4()
        async with self.sessions() as session:
            session.add(User(id=self.uid, wx_openid=f"test-{self.uid}", settings={}))
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()

    def payload(self, **updates):
        return ContextCompleteRequest(**{
            "raw_input": "这是不可丢失的首次原话", "client_request_id": self.request_id,
            "workspace": {"name": "新工作台"}, "project": {"name": "个人产品", "next_action": "发布首版"},
            "goal": {"title": "发布目标", "target_metric": {"horizon_label": "未来90天"}},
            "plan": {"title": "首月计划", "total_weeks": 4, "milestones": ["原型", "验证"]},
            "tasks": [{"client_key": f"task-{index}", "title": f"行动{index}", "priority": "high", "due_at": "2026-10-08T04:00:00Z"} for index in range(3)],
            "learning": {"title": "学习入口", "kind": "article", "duration_minutes": 12}, **updates,
        })

    async def submit(self, payload=None, uid=None):
        async with self.sessions() as session:
            return (await complete_context(payload or self.payload(), str(uid or self.uid), session)).data

    async def assert_counts(self, tasks=3, confirmed=1):
        async with self.sessions() as session:
            for model, count in ((Workspace, 1), (Project, 1), (Goal, 1), (GrowthPlan, 1), (Task, tasks), (WorkspaceLearningItem, 1), (MemoryEntry, 1), (OnboardingSubmission, 1)):
                actual = (await session.execute(select(func.count()).select_from(model).where(model.user_id == self.uid))).scalar_one()
                self.assertEqual(actual, count, model.__tablename__)
            events = (await session.execute(select(func.count()).select_from(WorkspaceEvent).where(WorkspaceEvent.user_id == self.uid, WorkspaceEvent.event_type == "onboarding_confirmed"))).scalar_one()
            self.assertEqual(events, confirmed)

    async def test_complete_graph_has_real_ids_and_consistent_links(self):
        result = await self.submit()
        self.assertTrue(result.saved)
        ids = {row["key"]: uuid.UUID(row["id"]) for row in result.objects}
        async with self.sessions() as session:
            goal = await session.get(Goal, ids["goal"])
            plan = await session.get(GrowthPlan, ids["plan"])
            task = await session.get(Task, ids["task-0"])
            learning = await session.get(WorkspaceLearningItem, ids["learning"])
            project = await session.get(Project, ids["project"])
            self.assertEqual(plan.goal_id, goal.id)
            self.assertEqual((task.goal_id, task.plan_id, task.project_id), (goal.id, plan.id, project.id))
            self.assertEqual((learning.goal_id, learning.project_id), (goal.id, project.id))
            self.assertEqual(project.goal_id, goal.id)
            self.assertEqual(task.due_at.isoformat(), "2026-10-08T04:00:00+00:00")
        await self.assert_counts()

    async def test_lost_response_and_concurrent_replay_create_no_duplicates(self):
        first, second = await asyncio.gather(self.submit(), self.submit())
        replay = await self.submit()
        self.assertEqual(first.objects, second.objects)
        self.assertEqual(first.objects, replay.objects)
        self.assertEqual(first.memory_id, replay.memory_id)
        await self.assert_counts()

    async def test_goal_database_failure_preserves_siblings_and_retry_resumes_dependencies(self):
        async def fail_goal(session, key, *args):
            if key == "goal":
                await session.execute(text("SELECT 1 / 0"))
            return await _create_object(session, key, *args)
        with patch("app.engines.onboarding_engine._create_object", side_effect=fail_goal):
            partial = await self.submit()
        statuses = {row["key"]: row["status"] for row in partial.objects}
        self.assertFalse(partial.saved)
        self.assertEqual(statuses["project"], "synced")
        self.assertEqual(statuses["goal"], "failed")
        self.assertEqual(statuses["plan"], "blocked")
        async with self.sessions() as session:
            self.assertEqual((await session.execute(select(func.count()).select_from(Goal).where(Goal.user_id == self.uid))).scalar_one(), 0)
            self.assertEqual((await session.get(MemoryEntry, uuid.UUID(partial.memory_id))).content, "这是不可丢失的首次原话")
        complete = await self.submit()
        self.assertTrue(complete.saved)
        self.assertEqual(partial.workspace_id, complete.workspace_id)
        self.assertEqual(partial.project_id, complete.project_id)
        self.assertEqual(partial.memory_id, complete.memory_id)
        await self.assert_counts()

    async def test_single_task_failure_does_not_roll_back_other_tasks_or_learning(self):
        async def fail_task(session, key, *args):
            if key == "task-1":
                raise RuntimeError("controlled failure")
            return await _create_object(session, key, *args)
        with patch("app.engines.onboarding_engine._create_object", side_effect=fail_task):
            partial = await self.submit()
        self.assertEqual([row["status"] for row in partial.objects[-4:]], ["synced", "failed", "synced", "synced"])
        await self.assert_counts(tasks=2, confirmed=0)
        complete = await self.submit()
        successful = {row["key"]: row["id"] for row in partial.objects if row["status"] == "synced"}
        self.assertTrue(all(row["id"] == successful[row["key"]] for row in complete.objects if row["key"] in successful))
        await self.assert_counts()

    async def test_same_key_cannot_replace_original_and_users_are_isolated(self):
        first = await self.submit()
        with self.assertRaises(AppException) as error:
            await self.submit(self.payload(raw_input="其他原话"))
        self.assertEqual(error.exception.status_code, 409)
        other_uid = uuid.uuid4()
        async with self.sessions() as session:
            session.add(User(id=other_uid, wx_openid=f"test-{other_uid}", settings={}))
            await session.commit()
        other = await self.submit(uid=other_uid)
        self.assertNotEqual(first.workspace_id, other.workspace_id)
        self.assertNotEqual(first.memory_id, other.memory_id)
        await self.assert_counts()

    async def test_completed_replay_does_not_rewrite_progress_or_recreate_archived_objects(self):
        first = await self.submit()
        ids = {row["key"]: uuid.UUID(row["id"]) for row in first.objects}
        async with self.sessions() as session:
            task = await session.get(Task, ids["task-0"])
            task.status = "done"
            task.completed_at = datetime.now(UTC)
            workspace = await session.get(Workspace, ids["workspace"])
            workspace.archived_at = datetime.now(UTC)
            await session.commit()
        self.assertEqual((await self.submit()).objects, first.objects)
        async with self.sessions() as session:
            self.assertEqual((await session.get(Task, ids["task-0"])).status, "done")
        await self.assert_counts()

    async def test_unselected_objects_are_absent_and_links_are_not_guessed(self):
        result = await self.submit(self.payload(project=None, goal=None, plan=None, learning=None))
        self.assertEqual([row["key"] for row in result.objects], ["workspace", "task-0", "task-1", "task-2"])
        async with self.sessions() as session:
            tasks = (await session.execute(select(Task).where(Task.user_id == self.uid))).scalars().all()
            self.assertTrue(all(task.project_id is None and task.goal_id is None and task.plan_id is None for task in tasks))

    async def test_saved_receipt_restores_response_loss_without_writing_or_cross_user_access(self):
        result = await self.submit()
        async with self.sessions() as session:
            recovered = await get_context_submission(self.request_id, str(self.uid), session)
            self.assertEqual(recovered.data.objects, result.objects)
        async with self.sessions() as session:
            with self.assertRaises(NotFoundException):
                await get_context_submission(self.request_id, str(uuid.uuid4()), session)
        await self.assert_counts()
