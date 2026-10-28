"""D4 user background, exact source options and durable profile isolation."""
import copy
import os
import unittest
import uuid
from datetime import date, timedelta
from types import SimpleNamespace

from pydantic import ValidationError
from sqlalchemy import select

from app.api.fitness_expert import ExpertCommand, apply_expert_command, history, snapshot
from app.api.personal_life import WorkoutContent
from app.core.exceptions import AppException
from app.engines.expert_skills import fitness_skill
from app.engines.fitness_context import ProfileContent, fitness_context, profile_payload
from app.engines.fitness_expert import build_source, digest, validate_result
from app.models.fitness_expert import FitnessExpertRevision
from app.models.personal_life import LifeRecord
from app.models.user import User
from tests import test_fitness_expert as fixtures


def profile(**patch):
    return {'goal':'consistency','experience':'beginner','equipment':['dumbbell'],'days_per_week':2,
        'session_minutes':30,'population':'healthy_adult','limitations':'none','limitation_notes':'',
        'share_with_expert':True,'confirmed':True,**patch}


def source(**patch):
    return {'end': date.today().isoformat(), 'profile': {'version': 3, 'content': profile()}, 'records': [{
        'id':str(uuid.uuid4()), 'version':4, 'content':{'occurred_on':date.today().isoformat(), 'outcome':'completed',
            'actual_minutes':20,'effort':6,'recovery':'ready','exercises':[{'name':'划船','weight':5,'sets':2,'reps':8,'equipment':'dumbbell'}],**patch}}]}


class ContextContractTests(unittest.TestCase):
    def test_profile_needs_confirmation_and_bounds_but_allows_unknown_background(self):
        self.assertIsNone(ProfileContent(confirmed=True).goal)
        for patch in ({'confirmed':False},{'equipment':['dumbbell','dumbbell']},{'equipment':['guessed']},
                      {'days_per_week':True},{'days_per_week':8},{'session_minutes':0},{'goal':'guessed'}):
            with self.assertRaises(ValidationError):ProfileContent.model_validate(profile(**patch))

    def test_profile_not_shared_is_removed_even_when_other_fitness_scope_is_enabled(self):
        u=SimpleNamespace(id=uuid.uuid4(),settings={'fitness_profile':{'version':2,'content':profile(share_with_expert=False)}})
        self.assertIsNone(profile_payload(u,for_expert=True)['content'])
        self.assertEqual(profile_payload(u)['content']['goal'],'consistency')

    def test_exact_logged_structure_preserves_units_record_version_and_conditions(self):
        s=source();c=fitness_context(s)
        self.assertEqual(c['mode'],'repeat_logged_structure')
        self.assertEqual(c['record_id'],s['records'][0]['id']);self.assertEqual(c['record_version'],4)
        self.assertEqual(c['session']['exercises'],s['records'][0]['content']['exercises'])
        self.assertTrue(c['session']['conditions']);self.assertEqual(c['profile_version'],3)

    def test_missing_or_changed_equipment_unknown_duration_and_feedback_cannot_be_inferred(self):
        cases=[source(actual_minutes=None),source(effort=None),source(recovery=None),source(exercises=[])]
        s=source();s['records'][0]['content']['exercises'][0]['equipment']=None;cases.append(s)
        s=source();s['profile']['content']['equipment']=['barbell'];cases.append(s)
        s=source();s['profile']['content']=None;cases.append(s)
        s=source();s['profile']['content']['session_minutes']=10;cases.append(s)
        for s in cases:
            c=fitness_context(s);self.assertEqual(c['mode'],'gather_context');self.assertIsNone(c['session']);self.assertTrue(c['reasons'])

    def test_limitations_and_subjective_high_effort_or_unwell_feedback_require_review(self):
        cases=[source(effort=9),source(recovery='tired'),source(recovery='pain_or_unwell')]
        for patch in ({'population':'needs_guidance'},{'limitations':'reported'},{'limitation_notes':'希望避开膝部负荷'}):
            s=source();s['profile']['content'].update(patch);cases.append(s)
        for s in cases:
            c=fitness_context(s);self.assertEqual(c['mode'],'review_limits');self.assertIsNone(c['session'])

    def test_multiple_latest_records_stale_samples_and_skips_do_not_supply_a_session(self):
        s=source();s['records'].append(copy.deepcopy(s['records'][0]));self.assertIsNone(fitness_context(s)['session'])
        self.assertIsNone(fitness_context(source(outcome='skipped'))['session'])
        self.assertIsNone(fitness_context(source(occurred_on=(date.today()-timedelta(days=8)).isoformat()))['session'])
        old=source(occurred_on=(date.today()-timedelta(days=8)).isoformat())
        old['end']=old['records'][0]['content']['occurred_on']
        self.assertIsNone(fitness_context(old)['session'])

    def test_server_supplies_option_instead_of_unchecked_model_weight_suggestion(self):
        s=source();s['expert_skill']=fitness_skill(s);raw=fixtures.reply([s['records'][0]['id']])
        raw['suggestion']['detail']='编造：下次加重到 100 kg'
        result=validate_result(raw,s)
        self.assertNotIn('100 kg',result['suggestion']['detail']);self.assertIn('5 kg',result['suggestion']['detail'])
        self.assertEqual(result['context'],s['expert_skill']['tools']['personal_context'])

    def test_known_different_equipment_is_not_a_comparable_record(self):
        s=source();old=copy.deepcopy(s['records'][0]);old['id']=str(uuid.uuid4());old['content']['occurred_on']=(date.today()-timedelta(days=1)).isoformat()
        old['content']['exercises'][0]['equipment']='barbell';s['records'].append(old)
        self.assertEqual(fitness_skill(s)['tools']['record_comparison']['comparison_count'],0)

    def test_feedback_is_optional_bounded_and_cannot_be_attached_to_skipped_activity(self):
        base={'title':'记录','occurred_on':date.today(),'outcome':'completed','original':'本人原话','confirmed':True}
        self.assertIsNone(WorkoutContent(**base).effort)
        for patch in ({'effort':True},{'effort':11},{'effort':1.2},{'recovery':'invented'}, {'outcome':'skipped','effort':3}):
            with self.assertRaises(ValidationError):WorkoutContent.model_validate({**base,**patch})


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class ProfileIntegrationTests(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=fixtures.ExpertIntegrationTests.asyncSetUp
    asyncTearDown=fixtures.ExpertIntegrationTests.asyncTearDown
    fact=fixtures.ExpertIntegrationTests.fact
    queue=fixtures.ExpertIntegrationTests.queue
    finish=fixtures.ExpertIntegrationTests.finish
    read=fixtures.ExpertIntegrationTests.read
    change_scope=fixtures.ExpertIntegrationTests.change_scope

    async def save(self,content=None,version=0,request_id=None,uid=None):
        cmd=ExpertCommand(request_id=request_id or uuid.uuid4(),action='save_profile',entity_id=uuid.uuid5(uid or self.uid,'fitness-profile'),base_version=version,data=content or profile())
        async with self.sessions() as s:
            value=await apply_expert_command(s,uid or self.uid,cmd);await s.commit();return value,cmd

    async def test_durable_save_replay_conflict_and_account_settings_are_preserved(self):
        value,cmd=await self.save();self.assertEqual(value['entity']['version'],1)
        async with self.sessions() as s:
            self.assertEqual(await apply_expert_command(s,self.uid,cmd),value);await s.commit()
            u=await s.get(User,self.uid);self.assertTrue(u.settings['life_privacy']['fitness_expert_enabled'])
            rows=list((await s.scalars(select(FitnessExpertRevision).where(FitnessExpertRevision.user_id==self.uid))).all());self.assertEqual(len(rows),1)
        with self.assertRaises(AppException):await self.save(profile(goal='strength'),version=0)
        with self.assertRaises(AppException):await self.save(profile(goal='strength'),request_id=cmd.request_id)

    async def test_other_user_cannot_save_or_read_profile_history(self):
        _,cmd=await self.save()
        async with self.sessions() as s:
            with self.assertRaises(AppException):await apply_expert_command(s,self.other,cmd)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await history('profile',cmd.entity_id,str(self.other),s)
        async with self.sessions() as s:
            data=(await snapshot(str(self.other),s,0)).data;self.assertIsNone(data['profile']['content'])

    async def test_profile_edit_and_opt_out_hide_old_review_but_preserve_history(self):
        await self.save();row=await self.finish();self.assertFalse((await self.read(row))['redacted'])
        await self.save(profile(share_with_expert=False),version=1)
        self.assertTrue((await self.read(row))['redacted'])
        async with self.sessions() as s:
            current=await build_source(s,self.uid,self.old,self.today);self.assertIsNone(current['profile']['content'])
            versions=(await history('profile',uuid.uuid5(self.uid,'fitness-profile'),str(self.uid),s)).data
            self.assertEqual([r['version'] for r in versions],[2,1])
        await self.save(version=2);self.assertTrue((await self.read(row))['redacted'])

    async def test_record_feedback_correction_hides_exact_structure_option(self):
        await self.save()
        async with self.sessions() as s:
            r=await s.get(LifeRecord,self.rid);r.occurred_on=self.today;r.content=self.fact(effort=6,recovery='ready',actual_minutes=20,
                exercises=[{'name':'划船','weight':5,'sets':2,'reps':8,'unit':'kg','equipment':'dumbbell'}]);await s.commit()
        row=await self.finish();self.assertEqual((await self.read(row))['result']['context']['mode'],'repeat_logged_structure')
        async with self.sessions() as s:
            r=await s.get(LifeRecord,self.rid);r.version+=1;r.content={**r.content,'recovery':'pain_or_unwell'};await s.commit()
        self.assertTrue((await self.read(row))['redacted'])

    async def test_pre_d4_digest_remains_readable_only_until_actual_background_changes(self):
        row=await self.finish()
        async with self.sessions() as s:
            r=await s.get(type(row),row.id);old={k:v for k,v in r.source.items() if k not in ('digest','expert_skill','profile')}
            r.source={**old,'digest':digest(old)};r.result=fixtures.reply([self.rid]);await s.commit()
        self.assertFalse((await self.read(row))['redacted'])
        await self.save();self.assertTrue((await self.read(row))['redacted'])

    async def test_expired_structure_option_cannot_be_adopted(self):
        await self.save()
        async with self.sessions() as s:
            r=await s.get(LifeRecord,self.rid);r.occurred_on=self.today;r.content=self.fact(effort=6,recovery='ready',actual_minutes=20,
                exercises=[{'name':'划船','weight':5,'sets':2,'reps':8,'unit':'kg','equipment':'dumbbell'}]);await s.commit()
        row=await self.finish()
        async with self.sessions() as s:
            r=await s.get(type(row),row.id);frozen=copy.deepcopy(r.source)
            frozen['expert_skill']['tools']['personal_context']['valid_until']=(self.today-timedelta(days=1)).isoformat()
            r.source=frozen;await s.commit()
        self.assertTrue((await self.read(row))['redacted'])
        async with self.sessions() as s:
            with self.assertRaises(AppException):
                await apply_expert_command(s,self.uid,ExpertCommand(request_id=uuid.uuid4(),action='adopt_plan',entity_id=row.id,
                    data=fixtures.ExpertIntegrationTests.plan(self)))
