"""Server-owned creation and edit receipts: replay, concurrency and scope."""
import asyncio
import os
import unittest
import uuid
from unittest.mock import patch

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.goals import GoalCreateRequest, create_goal
from app.api.growth_plans import GrowthPlanCreateRequest, create_growth_plan
from app.api.workspaces import ProjectCreateRequest, ProjectUpdateRequest, create_project_endpoint, project_detail, update_project_endpoint
from app.core.exceptions import AppException
from app.models.goal import Goal
from app.models.growth_plan import GrowthPlan
from app.models.personal_work import PersonalCommandReceipt
from app.models.user import User
from app.models.workspace import Project, Workspace, WorkspaceEvent


class MutationContracts(unittest.TestCase):
    def test_request_ids_are_optional_for_old_clients_and_uuid_for_new_clients(self):
        self.assertIsNone(GoalCreateRequest(workspace_id=str(uuid.uuid4()), title='旧请求').request_id)
        for cls, fields in ((GoalCreateRequest, {'title': '目标'}), (ProjectCreateRequest, {'name': '项目'}), (GrowthPlanCreateRequest, {'title': '计划', 'goal_id': str(uuid.uuid4())})):
            with self.assertRaises(ValidationError): cls(workspace_id=str(uuid.uuid4()), request_id='not-a-uuid', **fields)

    def test_project_metadata_cannot_be_the_only_edit_or_replace_required_fields_with_null(self):
        for fields in ({'request_id': uuid.uuid4()}, {'name': None}, {'status': None}, {'progress': None}):
            with self.assertRaises(ValidationError): ProjectUpdateRequest(**fields)


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'isolated PostgreSQL required')
class MutationIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/', 1)[-1].endswith('_test'): raise RuntimeError('isolated _test database required')
        self.url = url; self.engine = create_async_engine(url); self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid, self.other, self.wid, self.wid2 = [uuid.uuid4() for _ in range(4)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid, wx_openid=str(self.uid), settings={}), User(id=self.other, wx_openid=str(self.other), settings={})]); await s.flush()
            s.add_all([Workspace(id=self.wid, user_id=self.uid, name='R2 虚构检查'), Workspace(id=self.wid2, user_id=self.uid, name='另一空间')]); await s.commit()

    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (PersonalCommandReceipt, WorkspaceEvent, GrowthPlan, Goal, Project, Workspace):
                await s.execute(delete(model).where(model.user_id == self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid, self.other]))); await s.commit()
        await self.engine.dispose()

    async def call(self, endpoint, payload, uid=None, project_id=None):
        async with self.sessions() as s:
            args = [str(project_id), payload] if project_id else [payload]
            return (await endpoint(*args, user_id=str(uid or self.uid), session=s)).data.model_dump(mode='json')

    def goal_request(self, **extra):
        return GoalCreateRequest(workspace_id=str(self.wid), title='核对真实结果', request_id=uuid.uuid4(), **extra)

    async def count(self, model, **filters):
        async with self.sessions() as s:
            return await s.scalar(select(func.count()).select_from(model).where(model.user_id == self.uid, *[getattr(model, key) == value for key, value in filters.items()]))

    async def test_concurrent_goal_replays_create_one_goal_one_event_one_receipt(self):
        payload = self.goal_request()
        results = await asyncio.gather(*(self.call(create_goal, payload) for _ in range(8)))
        self.assertTrue(all(result == results[0] for result in results))
        self.assertEqual(await self.count(Goal), 1); self.assertEqual(await self.count(PersonalCommandReceipt), 1)
        self.assertEqual(await self.count(WorkspaceEvent, event_type='goal_created'), 1)
        with self.assertRaises(AppException) as error: await self.call(create_goal, payload.model_copy(update={'title': '另一内容'}))
        self.assertEqual(error.exception.code, 'CREATE_REQUEST_CONFLICT')
        self.assertEqual(await self.count(Goal), 1)

    async def test_lost_receipt_survives_database_connection_restart(self):
        payload = self.goal_request(); first = await self.call(create_goal, payload)
        await self.engine.dispose(); self.engine = create_async_engine(self.url); self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.assertEqual(first, await self.call(create_goal, payload)); self.assertEqual(await self.count(Goal), 1)

    async def test_plan_and_project_replays_are_atomic_and_preserve_response(self):
        goal = await self.call(create_goal, self.goal_request())
        plan = GrowthPlanCreateRequest(workspace_id=str(self.wid), goal_id=goal['id'], title='明确行动', milestones=['核对资料'], request_id=uuid.uuid4())
        results = await asyncio.gather(*(self.call(create_growth_plan, plan) for _ in range(6)))
        self.assertTrue(all(result == results[0] for result in results)); self.assertEqual(await self.count(GrowthPlan), 1)
        project = ProjectCreateRequest(workspace_id=str(self.wid), name='本周应用项目', request_id=uuid.uuid4(), next_action='保留实际成果')
        results = await asyncio.gather(*(self.call(create_project_endpoint, project) for _ in range(6)))
        self.assertTrue(all(result == results[0] for result in results)); self.assertEqual(await self.count(Project), 1)
        self.assertEqual(await self.count(WorkspaceEvent, event_type='project_created'), 1)
        self.assertEqual(await self.count(WorkspaceEvent, event_type='growth_plan_created'), 1)

    async def test_request_id_cannot_change_action_but_is_scoped_to_workspace_and_account(self):
        request = self.goal_request(); await self.call(create_goal, request)
        with self.assertRaises(AppException): await self.call(create_project_endpoint, ProjectCreateRequest(workspace_id=str(self.wid), name='同标识其他操作', request_id=request.request_id))
        with self.assertRaises(AppException): await self.call(create_goal, request, uid=self.other)
        other = await self.call(create_goal, request.model_copy(update={'workspace_id': str(self.wid2)}))
        self.assertEqual(other['workspace_id'], str(self.wid2)); self.assertEqual(await self.count(Goal), 2)

    async def test_failure_before_commit_rolls_back_object_event_and_receipt(self):
        request = self.goal_request()
        with patch('app.api.goals.record_mutation', side_effect=RuntimeError('synthetic receipt failure')):
            with self.assertRaises(RuntimeError): await self.call(create_goal, request)
        for model in (Goal, WorkspaceEvent, PersonalCommandReceipt): self.assertEqual(await self.count(model), 0)
        await self.call(create_goal, request)
        self.assertEqual(await self.count(Goal), 1)

    async def test_concurrent_project_edit_preserves_winner_and_supports_replay(self):
        project = await self.call(create_project_endpoint, ProjectCreateRequest(workspace_id=str(self.wid), name='原始项目', request_id=uuid.uuid4()))
        requests = [ProjectUpdateRequest(name=name, expected_updated_at=project['updated_at'], request_id=uuid.uuid4()) for name in ('甲的修改', '乙的修改')]
        results = await asyncio.gather(*(self.call(update_project_endpoint, req, project_id=project['id']) for req in requests), return_exceptions=True)
        self.assertEqual(sum(isinstance(result, AppException) for result in results), 1)
        failed = next(result for result in results if isinstance(result, AppException)); self.assertEqual(failed.code, 'PROJECT_EDIT_CONFLICT')
        winner_index = next(index for index, result in enumerate(results) if isinstance(result, dict))
        self.assertEqual(results[winner_index], await self.call(update_project_endpoint, requests[winner_index], project_id=project['id']))
        self.assertEqual(await self.count(WorkspaceEvent, event_type='project_updated'), 1)
        async with self.sessions() as s:
            with self.assertRaises(AppException): await project_detail(project['id'], str(self.wid2), str(self.uid), s)
            with self.assertRaises(AppException): await project_detail(project['id'], str(self.wid), str(self.other), s)
            latest = (await project_detail(project['id'], str(self.wid), str(self.uid), s)).data
        self.assertEqual(latest.name, results[winner_index]['name'])
        rebased = ProjectUpdateRequest(description='本人核对后保留的新内容', expected_updated_at=latest.updated_at, request_id=uuid.uuid4())
        updated = await self.call(update_project_endpoint, rebased, project_id=project['id'])
        self.assertEqual(updated['description'], '本人核对后保留的新内容')

    async def test_legacy_request_still_works_and_archived_workspace_cannot_replay(self):
        await self.call(create_goal, GoalCreateRequest(workspace_id=str(self.wid), title='旧客户端'))
        request = self.goal_request(); await self.call(create_goal, request)
        async with self.sessions() as s:
            from datetime import UTC, datetime
            workspace = await s.get(Workspace, self.wid); workspace.archived_at = datetime.now(UTC); await s.commit()
        with self.assertRaises(AppException): await self.call(create_goal, request)
