"""D1 validation and real PostgreSQL atomicity/isolation contracts."""
import asyncio
import os
import unittest
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.personal_life import (HabitContent, LifeCommand, WorkoutContent, access_payload, apply_command,
                                   fitness_source_allowed, history, snapshot)
from app.core.exceptions import AppException
from app.models.personal_life import LifeCommandReceipt, LifeRecord, LifeRevision, LifeWorkspaceReference, PersonalHabit
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent


def workout(**patch):
    return {"title": "虚构验收训练", "occurred_on": "2026-10-01", "timezone": "Asia/Shanghai",
            "outcome": "completed", "actual_minutes": None, "exercises": [], "note": "本人填写", "original": "原始记录", "confirmed": True, **patch}


class LifeContractTests(unittest.TestCase):
    def test_unknown_minutes_remain_null_and_zero_bodyweight_is_explicit(self):
        content = WorkoutContent.model_validate(workout(exercises=[{"name": "自重动作", "weight": 0, "sets": 3, "reps": 8}]))
        self.assertIsNone(content.actual_minutes)
        self.assertEqual(content.exercises[0].weight, 0)

    def test_unperformed_has_no_actual_measurements(self):
        self.assertEqual(WorkoutContent.model_validate(workout(outcome="skipped")).exercises, [])
        for patch in ({"actual_minutes": 20}, {"exercises": [{"name": "深蹲", "weight": 30, "sets": 2, "reps": 8}]}):
            with self.assertRaises(ValidationError): WorkoutContent.model_validate(workout(outcome="skipped", **patch))

    def test_future_invalid_zone_unconfirmed_and_original_are_rejected(self):
        for patch in ({"occurred_on": "2099-01-01"}, {"timezone": "Unknown/Zone"}, {"confirmed": False},
                      {"confirmed": 1}, {"confirmed": "true"}, {"original": " "}, {"title": " "}, {"actual_minutes": True}, {"actual_minutes": 1.5}):
            with self.assertRaises(ValidationError): WorkoutContent.model_validate(workout(**patch))

    def test_exercise_values_must_be_explicit_finite_numbers_and_integers(self):
        for field, value in (("weight", "35"), ("weight", True), ("weight", float('nan')), ("weight", float('inf')),
                             ("sets", 1.5), ("reps", 0), ("unit", "lb"), ("name", " ")):
            exercise = {"name": "深蹲", "weight": 35, "sets": 3, "reps": 8, field: value}
            with self.assertRaises(ValidationError): WorkoutContent.model_validate(workout(exercises=[exercise]))

    def test_habit_frequency_zone_and_effective_date_are_validated(self):
        today = date.today().isoformat()
        for patch in ({"days": [1, 1]}, {"days": [7]}, {"enabled": True, "days": []}, {"time": "25:00"},
                      {"effective_from": "2020-01-01"}, {"timezone": "Invalid/Zone"}):
            with self.assertRaises(ValidationError): HabitContent.model_validate({"effective_from": today, **patch})

    def test_life_expert_scope_is_independent_and_defaults_to_off(self):
        for settings in ({}, {"privacy_scope": {"enabled_sources": ["tasks", "goals", "plans", "learning", "knowledge_cards", "reflections", "memories"]}},
                         {"life_privacy": {"fitness_expert_enabled": "true"}}):
            self.assertFalse(fitness_source_allowed(SimpleNamespace(id=uuid.uuid4(), settings=settings)))
        self.assertTrue(fitness_source_allowed(SimpleNamespace(id=uuid.uuid4(), settings={"life_privacy": {"fitness_expert_enabled": True}})))


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class LifeIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/', 1)[-1].endswith('_test'):
            raise RuntimeError('Isolated _test DB required')
        self.engine = create_async_engine(url)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid, self.other, self.wid, self.wid2, self.foreign_wid = [uuid.uuid4() for _ in range(5)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid, wx_openid=str(self.uid), settings={"privacy_scope": {"enabled_sources": ["tasks"]}}),
                       User(id=self.other, wx_openid=str(self.other), settings={})])
            await s.flush()
            s.add_all([Workspace(id=self.wid, user_id=self.uid, name='D1 虚构空间'), Workspace(id=self.wid2, user_id=self.uid, name='另一空间'),
                       Workspace(id=self.foreign_wid, user_id=self.other, name='另一人')])
            await s.commit()

    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (LifeCommandReceipt, LifeWorkspaceReference, LifeRevision, LifeRecord, PersonalHabit, WorkspaceEvent, Workspace):
                await s.execute(delete(model).where(model.user_id.in_([self.uid, self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid, self.other])))
            await s.commit()
        await self.engine.dispose()

    def command(self, action='create_record', eid=None, data=None, version=0, request=None):
        return LifeCommand(action=action, entity_id=eid or uuid.uuid4(), request_id=request or uuid.uuid4(),
                           base_version=version, data=workout() if data is None else data)

    async def submit(self, command, uid=None):
        async with self.sessions() as s:
            result = await apply_command(s, uid or self.uid, command)
            await s.commit()
            return result

    async def read(self, uid=None, wid=None):
        async with self.sessions() as s:
            return (await snapshot(str(uid or self.uid), s, workspace_id=wid, offset=0, limit=50)).data

    async def test_concurrent_lost_receipt_replay_creates_one_record_revision_receipt_event(self):
        command = self.command()
        a, b = await asyncio.gather(self.submit(command), self.submit(command))
        self.assertEqual(a, b)
        async with self.sessions() as s:
            for model in (LifeRecord, LifeRevision, LifeCommandReceipt, WorkspaceEvent):
                self.assertEqual(await s.scalar(select(func.count()).select_from(model).where(model.user_id == self.uid)), 1)

    async def test_request_id_cannot_be_reused_for_changed_facts(self):
        command = self.command()
        await self.submit(command)
        with self.assertRaises(AppException) as error:
            await self.submit(command.model_copy(update={"data": workout(note='different')}))
        self.assertEqual(error.exception.status_code, 409)

    async def test_corrections_keep_original_and_immutable_versions(self):
        record = (await self.submit(self.command()))['entity']
        updated = await self.submit(self.command('save_record', uuid.UUID(record['id']), {**record['content'], 'note': '纠正', 'actual_minutes': 25}, 1))
        self.assertEqual(updated['entity']['version'], 2)
        async with self.sessions() as s:
            versions = (await history('record', uuid.UUID(record['id']), str(self.uid), s)).data
        self.assertEqual([v['version'] for v in versions], [2, 1])
        self.assertIsNone(versions[1]['content']['actual_minutes'])
        self.assertEqual(versions[0]['content']['original'], '原始记录')
        with self.assertRaises(AppException):
            await self.submit(self.command('save_record', uuid.UUID(record['id']), {**updated['entity']['content'], 'original': '改写原文'}, 2))

    async def test_two_concurrent_edits_conflict_without_overwriting_loser(self):
        record = (await self.submit(self.command()))['entity']
        commands = [self.command('save_record', uuid.UUID(record['id']), {**record['content'], 'note': note}, 1) for note in ('甲', '乙')]
        results = await asyncio.gather(*[self.submit(c) for c in commands], return_exceptions=True)
        self.assertEqual(sum(isinstance(r, AppException) for r in results), 1)
        self.assertEqual((await self.read())['records'][0]['version'], 2)

    async def test_owner_record_history_reference_and_reuse_isolation(self):
        record = (await self.submit(self.command()))['entity']
        eid = uuid.UUID(record['id'])
        self.assertEqual((await self.read(self.other))['records'], [])
        for command, uid in ((self.command('save_record', eid, record['content'], 1), self.other),
                             (self.command('link_record', eid, {'workspace_id': str(self.foreign_wid)}, 1), self.uid),
                             (self.command(data=workout(source='reuse', reused_from=str(eid))), self.other)):
            with self.assertRaises(AppException): await self.submit(command, uid)
        async with self.sessions() as s:
            with self.assertRaises(AppException): await history('record', eid, str(self.other), s)
        with self.assertRaises(AppException): await self.read(self.uid, self.foreign_wid)

    async def test_two_workspaces_reference_one_fact_without_duplicate_count(self):
        record = (await self.submit(self.command()))['entity']
        for wid in (self.wid, self.wid2):
            command = self.command('link_record', uuid.UUID(record['id']), {'workspace_id': str(wid)}, record['version'])
            a, _ = await asyncio.gather(self.submit(command), self.submit(command))
            record = a['entity']
            self.assertEqual((await self.read(wid=wid))['records'][0]['id'], record['id'])
        data = await self.read()
        self.assertEqual(data['total'], 1)
        self.assertEqual(len(data['references']), 2)

    async def test_revoked_reference_is_traceable_and_does_not_delete_personal_fact(self):
        record = (await self.submit(self.command()))['entity']
        eid, reference = uuid.UUID(record['id']), {'workspace_id': str(self.wid)}
        await self.submit(self.command('link_record', eid, reference, 1))
        await self.submit(self.command('unlink_record', eid, reference, 2))
        self.assertEqual((await self.read(wid=self.wid))['total'], 0)
        data = await self.read()
        self.assertEqual(data['total'], 1)
        self.assertIsNotNone(data['references'][0]['revoked_at'])
        async with self.sessions() as s:
            changes = (await history('record', eid, str(self.uid), s)).data
        self.assertEqual([r['change']['action'] for r in changes], ['unlink_record', 'link_record', 'create_record'])
        self.assertEqual(changes[0]['change']['workspace_name'], 'D1 虚构空间')

    async def test_reference_change_conflicts_with_stale_correction(self):
        record = (await self.submit(self.command()))['entity']
        eid = uuid.UUID(record['id'])
        await self.submit(self.command('link_record', eid, {'workspace_id': str(self.wid)}, 1))
        with self.assertRaises(AppException) as error:
            await self.submit(self.command('save_record', eid, record['content'], 1))
        self.assertEqual(error.exception.status_code, 409)
        data = await self.read()
        self.assertEqual(data['records'][0]['version'], 2)
        self.assertEqual(data['records'][0]['content'], record['content'])

    async def test_habit_changes_have_history_and_never_generate_actual_activity(self):
        hid, today = uuid.uuid5(self.uid, 'fitness-habit'), date.today()
        first = {'enabled': True, 'days': [1, 4], 'time': '18:30', 'timezone': 'UTC', 'effective_from': str(today)}
        await self.submit(self.command('save_habit', hid, first))
        second = {**first, 'days': [2], 'effective_from': str(today + timedelta(days=1))}
        await self.submit(self.command('save_habit', hid, second, 1))
        data = await self.read()
        self.assertEqual(data['total'], 0)
        async with self.sessions() as s:
            versions = (await history('habit', hid, str(self.uid), s)).data
        self.assertEqual(versions[1]['content']['days'], [1, 4])
        self.assertEqual(versions[0]['content']['days'], [2])
        with self.assertRaises(AppException): await self.submit(self.command('save_habit', hid, first, 2))

    async def test_explicit_life_permission_revoke_and_old_workspace_preferences_are_independent(self):
        self.assertFalse((await self.read())['access']['fitness_expert_enabled'])
        enabled = self.command('save_access', self.uid, {'fitness_expert_enabled': True})
        await self.submit(enabled)
        await self.submit(self.command('save_access', self.uid, {'fitness_expert_enabled': False}, 1))
        await self.submit(enabled)  # Replays the receipt, not the old settings mutation.
        self.assertFalse((await self.read())['access']['fitness_expert_enabled'])
        async with self.sessions() as s:
            user = await s.get(User, self.uid)
            self.assertEqual(user.settings['privacy_scope']['enabled_sources'], ['tasks'])
            self.assertEqual(access_payload(user)['version'], 2)

    async def test_failed_command_rolls_back_record_revision_event_and_receipt(self):
        command = self.command(data=workout(habit_id=str(uuid.uuid4())))
        with self.assertRaises(AppException): await self.submit(command)
        self.assertEqual((await self.read())['total'], 0)
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LifeCommandReceipt).where(LifeCommandReceipt.user_id == self.uid)), 0)

    async def test_new_session_restores_same_objects_after_reload(self):
        record = (await self.submit(self.command()))['entity']
        a, b = await self.read(), await self.read()
        self.assertEqual(a, b)
        self.assertEqual(a['records'][0]['id'], record['id'])

    async def test_pagination_returns_disjoint_personal_records(self):
        for i in range(3): await self.submit(self.command(data=workout(title=f'活动 {i}')))
        async with self.sessions() as s:
            a = (await snapshot(str(self.uid), s, offset=0, limit=2)).data
            b = (await snapshot(str(self.uid), s, offset=2, limit=2)).data
        self.assertEqual(a['total'], 3)
        self.assertEqual(len(set(r['id'] for r in a['records']) & set(r['id'] for r in b['records'])), 0)
