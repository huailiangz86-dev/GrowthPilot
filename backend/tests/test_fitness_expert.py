"""D3 source boundaries, durable server work and two real feedback cycles."""
import asyncio
import json
import os
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.fitness_expert import (ArrangementContent, ExpertCommand, ReviewRequest, RuleContent,
    apply_expert_command, history, read_review, retry_review, snapshot)
from app.api.personal_life import LifeCommand, apply_command
from app.core.exceptions import AppException
from app.engines.fitness_expert import enqueue_review, expert_tick, process_review, review_data, validate_result
from app.models.fitness_expert import FitnessArrangement, FitnessExpertRevision, FitnessReview, FitnessReviewRule
from app.models.personal_life import LifeCommandReceipt, LifeRecord, LifeRevision, PersonalHabit
from app.models.user import User
from app.models.workspace import WorkspaceEvent


def reply(ids):
    return {'observations':[{'text':'这段时间有本人确认的实际记录，未记录日的情况未知。','record_ids':[str(ids[0])]}],
        'limitation':'记录不足以判断体能变化。',
        'suggestion':{'title':'留下下一次实际反馈','detail':'自行安排合适时间，完成后核对实际活动与感受。','record_ids':[str(ids[0])]}}


class ExpertContractTests(unittest.TestCase):
    def test_explicit_consent_real_dates_and_bounded_range(self):
        for fields in ({'consent':False},{'consent':1},{'start':date.today()+timedelta(days=1)},
                       {'end':date.today()+timedelta(days=1)},{'start':date.today()-timedelta(days=366)}, {'timezone':'Bad/Zone'}):
            with self.assertRaises(ValidationError):
                ReviewRequest.model_validate({'request_id':uuid.uuid4(),'start':date.today(),'end':date.today(),'consent':True,**fields})

    def test_every_observation_and_suggestion_must_cite_a_selected_record(self):
        eid=uuid.uuid4();source={'records':[{'id':str(eid)}]}
        self.assertEqual(validate_result(reply([eid]),source)['suggestion']['record_ids'],[str(eid)])
        for raw in (reply([uuid.uuid4()]),{**reply([eid]),'observations':[]},
                    {**reply([eid]),'suggestion':{**reply([eid])['suggestion'],'record_ids':[]}},
                    {**reply([eid]),'observations':[{'text':' ','record_ids':[str(eid)]}]}):
            with self.assertRaises(ValueError):validate_result(raw,source)

    def test_arrangements_cannot_be_mistaken_for_actual_activity(self):
        with self.assertRaises(ValidationError):ArrangementContent(title='安排',detail='预计完成',scheduled_on=date.today(),actual_minutes=30)
        with self.assertRaises(ValidationError):ArrangementContent(title=' ',detail='安排',scheduled_on=date.today())
        with self.assertRaises(ValidationError):RuleContent(enabled=True,period_days=7,start_on=date.today(),consent=False)
        with self.assertRaises(ValidationError):RuleContent(enabled=True,period_days=1,start_on=date.today(),consent=True)
        with self.assertRaises(ValidationError):RuleContent(enabled=True,period_days=7,start_on=date.today()-timedelta(days=1),consent=True)


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class ExpertIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/',1)[-1].endswith('_test'):raise RuntimeError('Isolated test DB required')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other,self.rid=[uuid.uuid4() for _ in range(3)]
        self.today=datetime.now(UTC).date()
        self.old=self.today-timedelta(days=13)
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={'life_privacy':{'fitness_expert_enabled':True,'version':1}}),User(id=self.other,wx_openid=str(self.other))]);await s.flush()
            s.add(LifeRecord(id=self.rid,user_id=self.uid,occurred_on=self.old,domain='fitness',version=1,content=self.fact(self.old)))
            await s.commit()

    def fact(self, day=None, **fields):
        return {'title':'虚构实际训练','occurred_on':(day or self.today).isoformat(),'timezone':'UTC','outcome':'completed',
            'actual_minutes':None,'exercises':[],'note':'本人实际记录','source':'manual','original':'本人训练原话','confirmed':True,**fields}

    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (FitnessExpertRevision,FitnessArrangement,FitnessReview,FitnessReviewRule,LifeCommandReceipt,LifeRevision,LifeRecord,PersonalHabit,WorkspaceEvent):
                await s.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    async def queue(self, **patches):
        req=ReviewRequest(request_id=uuid.uuid4(),start=self.old,end=self.today,timezone='UTC',consent=True,**patches)
        async with self.sessions() as s:
            row=await enqueue_review(s,self.uid,req);await s.commit();return row

    async def finish(self, row=None):
        row=row or await self.queue()
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=reply([self.rid]))):
            await process_review(self.sessions,row.id)
        return row

    async def command(self, action, eid, data, base=0, request_id=None, uid=None):
        cmd=ExpertCommand(request_id=request_id or uuid.uuid4(),action=action,entity_id=eid,base_version=base,data=data)
        async with self.sessions() as s:
            value=await apply_expert_command(s,uid or self.uid,cmd);await s.commit();return value,cmd

    def plan(self, **fields):
        return {'title':'下一次记录','detail':'按本人情况安排并填写实际活动','scheduled_on':self.today.isoformat(),'time':'18:30','timezone':'UTC','planned_minutes':None,'cancelled':False,**fields}

    async def change_scope(self, enabled):
        async with self.sessions() as s:
            u=await s.get(User,self.uid);old=u.settings['life_privacy'];u.settings={'life_privacy':{'fitness_expert_enabled':enabled,'version':old['version']+1}};await s.commit()

    async def read(self,row):
        async with self.sessions() as s:return (await read_review(row.id,str(self.uid),s)).data

    async def test_default_scope_and_other_accounts_cannot_request_or_read(self):
        row=await self.finish()
        async with self.sessions() as s:
            with self.assertRaises(AppException):await read_review(row.id,str(self.other),s)
            req=ReviewRequest(request_id=uuid.uuid4(),start=self.old,end=self.today,consent=True)
            with self.assertRaises(AppException):await enqueue_review(s,self.other,req)
        with self.assertRaises(AppException):await self.command('adopt_plan',row.id,self.plan(),uid=self.other)

    async def test_concurrent_enqueue_and_processing_have_one_model_call(self):
        req=ReviewRequest(request_id=uuid.uuid4(),start=self.old,end=self.today,consent=True)
        async def enqueue():
            async with self.sessions() as s:
                r=await enqueue_review(s,self.uid,req);await s.commit();return r.id
        ids=await asyncio.gather(enqueue(),enqueue());self.assertEqual(ids[0],ids[1])
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=reply([self.rid]))) as model:
            await asyncio.gather(process_review(self.sessions,ids[0]),process_review(self.sessions,ids[0]))
            await process_review(self.sessions,ids[0])
        self.assertEqual(model.await_count,1)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await enqueue_review(s,self.uid,req.model_copy(update={'start':self.old-timedelta(days=1)}))

    async def test_background_tick_needs_no_page_and_does_not_create_activity(self):
        row=await self.queue()
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=reply([self.rid]))):await expert_tick(self.sessions)
        self.assertEqual((await self.read(row))['status'],'completed')
        async with self.sessions() as s:self.assertEqual(await s.scalar(select(func.count()).select_from(LifeRecord).where(LifeRecord.user_id==self.uid)),1)

    async def test_source_correction_or_new_record_hides_old_advice(self):
        row=await self.finish()
        async with self.sessions() as s:
            fact=await s.get(LifeRecord,self.rid);fact.version+=1;fact.content={**fact.content,'note':'本人纠正'};await s.commit()
        value=await self.read(row);self.assertTrue(value['redacted']);self.assertIsNone(value['result']);self.assertIsNone(value['source'])
        with self.assertRaises(AppException):await self.command('adopt_plan',row.id,self.plan())

    async def test_revocation_regrant_does_not_restore_old_sources(self):
        row=await self.finish();await self.change_scope(False)
        self.assertTrue((await self.read(row))['redacted'])
        await self.change_scope(True);self.assertTrue((await self.read(row))['redacted'])

    async def test_scope_change_during_model_discards_result(self):
        row=await self.queue()
        async def changing(*args):await self.change_scope(False);return reply([self.rid])
        with patch('app.engines.fitness_expert.llm_service.structured_output',changing):await process_review(self.sessions,row.id)
        value=await self.read(row);self.assertEqual(value['status'],'blocked');self.assertIsNone(value['result'])

    async def test_invalid_citation_is_retried_with_bounded_failures(self):
        row=await self.queue();now=datetime.now(UTC)
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=reply([uuid.uuid4()]))) as model:
            for minutes in (0,10,20):await process_review(self.sessions,row.id,now+timedelta(minutes=minutes))
        value=await self.read(row);self.assertEqual((value['status'],value['attempts']),('failed',3));self.assertEqual(model.await_count,3)
        async with self.sessions() as s:await retry_review(row.id,str(self.uid),s)
        await self.finish(row);self.assertEqual((await self.read(row))['status'],'completed')

    async def test_expired_lease_and_attempt_token_protect_restart_recovery(self):
        entered,released=asyncio.Event(),asyncio.Event();row=await self.queue()
        async def slow(*args):entered.set();await released.wait();return reply([self.rid])
        with patch('app.engines.fitness_expert.llm_service.structured_output',slow):
            old=asyncio.create_task(process_review(self.sessions,row.id));await entered.wait()
            async with self.sessions() as s:
                r=await s.get(FitnessReview,row.id);r.lease_until=datetime.now(UTC)-timedelta(seconds=1);await s.commit()
            new=reply([self.rid]);new['observations'][0]['text']='新租期完成结果'
            with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=new)):await process_review(self.sessions,row.id)
            released.set();await old
        self.assertEqual((await self.read(row))['result']['observations'][0]['text'],'新租期完成结果')

    async def test_repeated_adoption_and_lost_receipt_keep_one_plan(self):
        row=await self.finish();a,cmd=await self.command('adopt_plan',row.id,self.plan())
        b,_=await self.command('adopt_plan',row.id,self.plan(),request_id=cmd.request_id)
        c,_=await self.command('adopt_plan',row.id,self.plan(title='另一个提交'))
        self.assertEqual(a,b);self.assertEqual(a['entity']['id'],c['entity']['id']);self.assertEqual(c['entity']['version'],1)
        async with self.sessions() as s:self.assertEqual(await s.scalar(select(func.count()).select_from(FitnessArrangement).where(FitnessArrangement.user_id==self.uid)),1)

    async def test_plan_conflict_and_revisions_preserve_rules_and_time(self):
        row=await self.finish();plan,_=await self.command('adopt_plan',row.id,self.plan());eid=uuid.UUID(plan['entity']['id'])
        await self.command('save_plan',eid,self.plan(time='19:00'),1)
        with self.assertRaises(AppException):await self.command('save_plan',eid,self.plan(time='20:00'),1)
        async with self.sessions() as s:revisions=(await history('plan',eid,str(self.uid),s)).data
        self.assertEqual([r['content']['time'] for r in revisions],['19:00','18:30'])

    async def test_feedback_is_one_confirmed_fact_and_source_cannot_be_rewritten(self):
        row=await self.finish();plan,_=await self.command('adopt_plan',row.id,self.plan());eid=uuid.UUID(plan['entity']['id']);factid=uuid.uuid4()
        cmd=LifeCommand(request_id=uuid.uuid4(),entity_id=factid,action='create_record',data=self.fact(expert_plan_id=str(eid),outcome='skipped'))
        async with self.sessions() as s:
            a=await apply_command(s,self.uid,cmd);await s.commit();b=await apply_command(s,self.uid,cmd);await s.commit();self.assertEqual(a,b)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await apply_command(s,self.uid,cmd.model_copy(update={'request_id':uuid.uuid4(),'entity_id':uuid.uuid4()}))
        async with self.sessions() as s:
            with self.assertRaises(AppException):await apply_command(s,self.uid,LifeCommand(request_id=uuid.uuid4(),entity_id=factid,action='save_record',base_version=1,data=self.fact()))
        with self.assertRaises(AppException):await self.command('save_plan',eid,self.plan(),1)
        async with self.sessions() as s:
            value=(await snapshot(str(self.uid),s,0)).data['plans'][0]
        self.assertEqual(value['feedback']['content']['outcome'],'skipped')

    async def test_two_cycles_use_adopted_plan_feedback_and_keep_actual_counts(self):
        row=await self.finish();plan,_=await self.command('adopt_plan',row.id,self.plan());eid=uuid.UUID(plan['entity']['id']);factid=uuid.uuid4()
        async with self.sessions() as s:
            await apply_command(s,self.uid,LifeCommand(request_id=uuid.uuid4(),entity_id=factid,action='create_record',data=self.fact(expert_plan_id=str(eid))));await s.commit()
        second=await self.queue()
        sent=[]
        async def model(session,uid,purpose,variables,variant):sent.append(json.loads(variables['source']));return reply([factid])
        with patch('app.engines.fitness_expert.llm_service.structured_output',model):await process_review(self.sessions,second.id)
        self.assertEqual(sent[0]['feedback'][0]['record_id'],str(factid))
        secondplan,_=await self.command('adopt_plan',second.id,self.plan());secondid=uuid.UUID(secondplan['entity']['id'])
        async with self.sessions() as s:
            await apply_command(s,self.uid,LifeCommand(request_id=uuid.uuid4(),entity_id=uuid.uuid4(),action='create_record',data=self.fact(expert_plan_id=str(secondid),outcome='skipped')));await s.commit()
            self.assertEqual(await s.scalar(select(func.count()).select_from(FitnessArrangement).where(FitnessArrangement.user_id==self.uid)),2)
            self.assertEqual(await s.scalar(select(func.count()).select_from(LifeRecord).where(LifeRecord.user_id==self.uid)),3)

    async def test_completed_periods_queue_once_and_empty_cycles_do_not_call_model(self):
        # A historical rule already authorized before the clock reached today.
        async with self.sessions() as s:
            s.add(FitnessReviewRule(id=uuid.uuid5(self.uid,'fitness-review-rule'),user_id=self.uid,version=1,
                content={'enabled':True,'period_days':7,'start_on':(self.old-timedelta(days=1)).isoformat(),'timezone':'UTC','consent':True,'access_version':1},
                next_start=self.old-timedelta(days=1),updated_at=datetime.now(UTC)));await s.commit()
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock(return_value=reply([self.rid]))) as model:
            await expert_tick(self.sessions);await expert_tick(self.sessions);await expert_tick(self.sessions)
        async with self.sessions() as s:
            rows=(await s.scalars(select(FitnessReview).where(FitnessReview.user_id==self.uid))).all()
        self.assertEqual(len(rows),2);self.assertEqual(model.await_count,1)
        self.assertEqual(sorted(r.status for r in rows),['blocked','completed'])

    async def test_two_complete_recurring_periods_run_without_browser_requests(self):
        start=self.today-timedelta(days=14);secondfact=uuid.uuid4()
        async with self.sessions() as s:
            s.add(LifeRecord(id=secondfact,user_id=self.uid,domain='fitness',version=1,occurred_on=self.today-timedelta(days=1),content=self.fact(self.today-timedelta(days=1))))
            s.add(FitnessReviewRule(id=uuid.uuid5(self.uid,'fitness-review-rule'),user_id=self.uid,version=1,
                content={'enabled':True,'period_days':7,'start_on':start.isoformat(),'timezone':'UTC','consent':True,'access_version':1},next_start=start,updated_at=datetime.now(UTC)));await s.commit()
        async def model(session,uid,purpose,variables,variant):return reply([uuid.UUID(json.loads(variables['source'])['records'][0]['id'])])
        with patch('app.engines.fitness_expert.llm_service.structured_output',model):
            await asyncio.gather(expert_tick(self.sessions),expert_tick(self.sessions));await expert_tick(self.sessions)
        async with self.sessions() as s:
            rows=list((await s.scalars(select(FitnessReview).where(FitnessReview.user_id==self.uid))).all())
        self.assertEqual(len(rows),2);self.assertTrue(all(r.status=='completed' for r in rows))
        self.assertEqual({r.source['records'][0]['id'] for r in rows},{str(self.rid),str(secondfact)})

    async def test_pause_or_rule_change_invalidates_queued_period_before_model(self):
        start=self.today-timedelta(days=7)
        async with self.sessions() as s:
            rule=FitnessReviewRule(id=uuid.uuid5(self.uid,'fitness-review-rule'),user_id=self.uid,version=1,
                content={'enabled':True,'period_days':7,'start_on':start.isoformat(),'timezone':'UTC','consent':True,'access_version':1},next_start=start,updated_at=datetime.now(UTC))
            s.add(rule);await s.flush()
            request=ReviewRequest(request_id=uuid.uuid4(),start=self.old,end=self.today,consent=True)
            row=await enqueue_review(s,self.uid,request,rule=rule);await s.commit()
            rule.version+=1;rule.content={**rule.content,'enabled':False};await s.commit()
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock()) as model:await process_review(self.sessions,row.id)
        self.assertEqual(model.await_count,0);self.assertTrue((await self.read(row))['redacted'])

    async def test_oversized_recurring_period_blocks_visibly_without_starving_other_work(self):
        start=self.today-timedelta(days=7)
        async with self.sessions() as s:
            for i in range(301):s.add(LifeRecord(id=uuid.uuid4(),user_id=self.uid,domain='fitness',version=1,occurred_on=start,content=self.fact(start)))
            s.add(FitnessReviewRule(id=uuid.uuid5(self.uid,'fitness-review-rule'),user_id=self.uid,version=1,
                content={'enabled':True,'period_days':7,'start_on':start.isoformat(),'timezone':'UTC','consent':True,'access_version':1},next_start=start,updated_at=datetime.now(UTC)));await s.commit()
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock()) as model:await expert_tick(self.sessions)
        self.assertEqual(model.await_count,0)
        async with self.sessions() as s:
            row=await s.scalar(select(FitnessReview).where(FitnessReview.user_id==self.uid));value=await review_data(s,row)
        self.assertEqual(value['status'],'blocked');self.assertIn('300',value['error'])

    async def test_recurring_revocation_pause_and_rule_versions_never_restart_silently(self):
        data={'enabled':True,'period_days':7,'start_on':self.today.isoformat(),'timezone':'UTC','consent':True}
        ruleid=uuid.uuid5(self.uid,'fitness-review-rule');await self.command('save_rule',ruleid,data)
        await self.change_scope(False);await self.change_scope(True)
        async with self.sessions() as s:self.assertFalse((await snapshot(str(self.uid),s,0)).data['rule_active'])
        await self.command('save_rule',ruleid,data,1)
        async with self.sessions() as s:
            self.assertTrue((await snapshot(str(self.uid),s,0)).data['rule_active'])
            self.assertEqual(len((await history('rule',ruleid,str(self.uid),s)).data),2)
        with self.assertRaises(AppException):await self.command('save_rule',ruleid,data,1)

    async def test_empty_or_outside_selected_dates_never_send_private_records(self):
        req=ReviewRequest(request_id=uuid.uuid4(),start=self.today,end=self.today,consent=True)
        async with self.sessions() as s:
            row=await enqueue_review(s,self.uid,req);await s.commit();self.assertEqual(row.status,'blocked')
        with patch('app.engines.fitness_expert.llm_service.structured_output',AsyncMock()) as model:await expert_tick(self.sessions)
        self.assertEqual(model.await_count,0)

    async def test_range_uses_only_effective_habit_and_changes_within_selected_dates(self):
        hid=uuid.uuid5(self.uid,'fitness-habit')
        contents=[{'enabled':True,'days':[1],'time':'18:30','timezone':'UTC','effective_from':day.isoformat()}
                  for day in (self.old-timedelta(days=30),self.old-timedelta(days=10),self.old+timedelta(days=1))]
        async with self.sessions() as s:
            s.add(PersonalHabit(id=hid,user_id=self.uid,domain='fitness',version=3,content=contents[-1]));await s.flush()
            for version,content in enumerate(contents,1):s.add(LifeRevision(user_id=self.uid,habit_id=hid,version=version,content=content,request_id=uuid.uuid4()))
            await s.commit()
        row=await self.queue()
        self.assertEqual([r['version'] for r in row.source['habits']],[2,3])
