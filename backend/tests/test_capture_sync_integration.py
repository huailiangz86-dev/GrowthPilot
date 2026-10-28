"""Real PostgreSQL checks; run only against an explicitly isolated test database."""

import asyncio
import os
import unittest
import uuid
from datetime import UTC, date, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.reflections import ReflectionSaveRequest, list_reflections, save_reflection_endpoint
from app.core.database import Base
from app.core.exceptions import AppException, NotFoundException
from app.models.user import User
from app.models.workspace import Project, Workspace, WorkspaceEvent
from app.models.workspace_reflection import WorkspaceReflection


@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_DATABASE_URL"), "requires isolated PostgreSQL test database")
class CaptureSyncIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.engine = create_async_engine(os.environ["GROWTHPILOT_TEST_DATABASE_URL"])
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        tables = [User.__table__, Workspace.__table__, Project.__table__, WorkspaceReflection.__table__, WorkspaceEvent.__table__]
        async with self.engine.begin() as conn:
            await conn.run_sync(lambda sync: Base.metadata.create_all(sync, tables=tables))
        self.user_id = uuid.uuid4()
        self.workspace_id = uuid.uuid4()
        self.request_id = uuid.uuid4()
        async with self.sessions() as session:
            session.add(User(id=self.user_id, wx_openid=f"test-{self.user_id}", settings={}))
            await session.flush()
            session.add(Workspace(id=self.workspace_id, user_id=self.user_id, name="同步测试"))
            await session.commit()

    async def asyncTearDown(self):
        await self.engine.dispose()

    def payload(self, **updates):
        return ReflectionSaveRequest(**{
            "workspace_id": str(self.workspace_id), "reflection_type": "micro",
            "reflection_date": date(2026, 10, 7), "is_makeup": True,
            "micro_type": "idea", "micro_status": "noted", "content": "原文与日期需要保留",
            "client_request_id": self.request_id, **updates,
        })

    async def submit(self, payload=None, user_id=None):
        async with self.sessions() as session:
            return await save_reflection_endpoint(payload or self.payload(), str(user_id or self.user_id), session)

    async def assert_single_fact(self):
        async with self.sessions() as session:
            facts = (await session.execute(select(func.count()).select_from(WorkspaceReflection).where(
                WorkspaceReflection.workspace_id == self.workspace_id))).scalar()
            events = (await session.execute(select(func.count()).select_from(WorkspaceEvent).where(
                WorkspaceEvent.workspace_id == self.workspace_id, WorkspaceEvent.event_type == "reflection_created"))).scalar()
            self.assertEqual((facts, events), (1, 1))

    async def test_lost_response_replay_returns_same_fact_and_original_date(self):
        first = (await self.submit()).data
        second = (await self.submit(self.payload(reflection_date=date(2026, 10, 8)))).data
        self.assertEqual(first.id, second.id)
        self.assertEqual(second.reflection_date, "2026-10-07")
        self.assertEqual(first.created_at, second.created_at)
        self.assertEqual(second.client_request_id, str(self.request_id))
        await self.assert_single_fact()

    async def test_concurrent_submissions_create_only_one_event(self):
        first, second = await asyncio.gather(self.submit(), self.submit())
        self.assertEqual(first.data.id, second.data.id)
        await self.assert_single_fact()

    async def test_reused_key_cannot_replace_the_original(self):
        await self.submit()
        with self.assertRaises(AppException) as error:
            await self.submit(self.payload(content="不同的记录"))
        self.assertEqual(error.exception.status_code, 409)
        await self.assert_single_fact()

    async def test_replay_survives_archived_source_project(self):
        project_id = uuid.uuid4()
        async with self.sessions() as session:
            session.add(Project(id=project_id, workspace_id=self.workspace_id, user_id=self.user_id, name="来源项目"))
            await session.commit()
        payload = self.payload(project_id=str(project_id))
        first = await self.submit(payload)
        async with self.sessions() as session:
            project = await session.get(Project, project_id)
            project.archived_at = datetime.now(UTC)
            await session.commit()
        second = await self.submit(payload)
        self.assertEqual(first.data.id, second.data.id)
        await self.assert_single_fact()

    async def test_foreign_user_is_rejected_and_workspace_keys_are_independent(self):
        await self.submit()
        other_user = uuid.uuid4()
        with self.assertRaises(NotFoundException):
            await self.submit(user_id=other_user)
        async with self.sessions() as session:
            with self.assertRaises(NotFoundException):
                await list_reflections(str(self.workspace_id), str(other_user), session)
        other_workspace = uuid.uuid4()
        async with self.sessions() as session:
            session.add(Workspace(id=other_workspace, user_id=self.user_id, name="其他空间"))
            await session.commit()
        second = await self.submit(self.payload(workspace_id=str(other_workspace)))
        self.assertEqual(second.data.workspace_id, str(other_workspace))
        await self.assert_single_fact()
