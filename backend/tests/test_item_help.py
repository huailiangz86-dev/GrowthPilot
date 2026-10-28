"""D2 view semantics and persistent one-item help boundaries."""
import asyncio
import json
import os
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.item_help import HelpRequest, generate_help, help_data, read, validate_result, digest
from app.api.personal_life import LifeCommand, apply_command, views
from app.core.exceptions import AppException
from app.engines.fitness_views import fitness_report
from app.models.item_help import ItemHelp
from app.models.personal_life import LifeCommandReceipt, LifeRecord, LifeRevision
from app.models.personal_work import PersonalDocument
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem

TEXT = '今天完成深蹲，20公斤，3组，每组8次。'
NOTES = '间隔复习是在不同时间重复回顾同一材料。先主动回忆，再核对原文。'

def learning_reply(kind, exercise='解释主动回忆与核对原文的顺序', answer='先主动回忆，再核对原文'):
    return {'text': '原文要求先回忆再核对。', 'quotes': ['先主动回忆，再核对原文。'],
        'teaching': {'method': 'criterion_feedback' if kind == 'learning_feedback' else 'guided_explanation',
            'questions': ['你会如何按顺序尝试？'], 'hints': [], 'criteria': [] if kind == 'learning_explain' else [
                {'id': 'C1', 'criterion': exercise, 'source_quote': '先主动回忆，再核对原文。',
                 'status': 'supported', 'answer_quote': answer, 'feedback': '这次答案说明了原文要求的顺序。'}]}}


def candidate(**patches):
    return {"title": "深蹲", "occurred_on": None, "outcome": "completed", "actual_minutes": None,
        "exercises": [{"name": "深蹲", "weight": 20, "sets": 3, "reps": 8, "quote": '深蹲，20公斤，3组，每组8次'}],
        "quotes": ['今天完成深蹲'], "uncertainty": "时长未知", **patches}


class HelpContractTests(unittest.TestCase):
    def test_consent_empty_answer_and_ambiguous_scope_are_rejected(self):
        base = {"request_id": uuid.uuid4(), "kind": "fitness_extract", "consent": True, "text": TEXT}
        for p in ({"consent": False}, {"consent": 1}, {"text": ' '}, {"timezone": 'Invalid/Zone'},
                  {"item_id": uuid.uuid4()}, {"kind": 'learning_feedback', "answer": ''}):
            with self.assertRaises(ValidationError): HelpRequest.model_validate({**base, **p})

    def test_unknowns_are_null_and_quotes_must_belong_to_original(self):
        request = HelpRequest(request_id=uuid.uuid4(), kind='fitness_extract', consent=True, text=TEXT)
        source = {"today": date.today().isoformat()}
        self.assertIsNone(validate_result(candidate(), request, source)['actual_minutes'])
        for c in (candidate(quotes=['不存在的原文']), candidate(actual_minutes=0),
                  candidate(occurred_on='2099-01-01'), candidate(outcome='skipped'),
                  candidate(exercises=[{'name':'深蹲','weight':True,'sets':3,'reps':8,'quote':'深蹲'}])):
            with self.assertRaises(ValueError): validate_result(c, request, source)

    def test_views_separate_activity_unknown_duration_skips_and_habit_history(self):
        def record(day, weight, minutes=None, outcome='completed'):
            return SimpleNamespace(id=uuid.uuid4(),version=1,content={'title':'活动','occurred_on':day,'timezone':'UTC',
                'outcome':outcome,'actual_minutes':minutes,'exercises':[] if outcome=='skipped' else
                [{'name':'深蹲','weight':weight,'unit':'kg','sets':3,'reps':8}]})
        rows = [record('2026-10-01',20),record('2026-10-01',25,30),record('2026-10-03',0,20),record('2026-10-02',None,outcome='skipped')]
        rules = [SimpleNamespace(version=1,content={'enabled':True,'effective_from':'2026-10-01','days':[4], 'time':'18:30','timezone':'UTC'}),
                 SimpleNamespace(version=2,content={'enabled':False,'effective_from':'2026-10-03','days':[4], 'time':'18:30','timezone':'UTC'})]
        report = fitness_report(rows,rules,date(2026,10,1),date(2026,10,8))
        self.assertEqual((report['completed_records'],report['completed_days'],report['skipped_records']), (3,2,1))
        self.assertEqual((report['known_minutes'],report['unknown_minutes_records']), (50,1))
        self.assertTrue(report['days'][0]['planned']);self.assertFalse(report['days'][-1]['planned'])
        self.assertEqual([p['weight'] for p in report['trends'][0]['points']], [25,0])
        self.assertEqual(report['trends'][0]['points'][0]['sources'][0]['id'],str(rows[1].id))

    def test_generated_exercise_cannot_be_cited_as_original_material(self):
        req=HelpRequest(request_id=uuid.uuid4(),kind='learning_explain',consent=True,
            workspace_id=uuid.uuid4(),item_id=uuid.uuid4(),base_version=1)
        source={'fields':{'notes':NOTES,'exercise':'AI 自己生成的练习'}}
        with self.assertRaises(ValueError):validate_result({'text':'解释','quotes':['AI 自己生成的练习']},req,source)
        self.assertEqual(validate_result({'text':'解释','quotes':['先主动回忆，再核对原文。']},req,source)['text'],'解释')


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class HelpIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        if not url.rsplit('/',1)[-1].endswith('_test'): raise RuntimeError('Isolated test DB required')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other,self.wid,self.iid=[uuid.uuid4() for _ in range(4)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid)),User(id=self.other,wx_openid=str(self.other))]);await s.flush()
            s.add(Workspace(id=self.wid,user_id=self.uid,name='D2 虚构空间'));await s.flush()
            s.add(WorkspaceLearningItem(id=self.iid,user_id=self.uid,workspace_id=self.wid,title='间隔复习'));await s.flush()
            s.add(PersonalDocument(id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,learning_item_id=self.iid,version=1,
                content={'title':'间隔复习','notes':NOTES,'questions':'怎么应用','exercise':'解释主动回忆与核对原文的顺序','aim':'学会安排复习'}));await s.commit()

    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (ItemHelp, LifeCommandReceipt, LifeRevision, LifeRecord, WorkspaceEvent, PersonalDocument, WorkspaceLearningItem, Workspace):
                await s.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    def request(self, kind='fitness_extract', **fields):
        data={'text':TEXT} if kind=='fitness_extract' else {'workspace_id':self.wid,'item_id':self.iid,'base_version':1}
        return HelpRequest(request_id=uuid.uuid4(),kind=kind,consent=True,**{**data,**fields})

    async def generate(self, request, uid=None):
        async with self.sessions() as s: return await generate_help(s,uid or self.uid,request)

    async def update_source(self, revoke=False):
        async with self.sessions() as s:
            if revoke:
                user=await s.get(User,self.uid);user.settings={'privacy_scope':{'enabled_sources':[]}}
            else:
                doc=await s.scalar(select(PersonalDocument).where(PersonalDocument.learning_item_id==self.iid));doc.version+=1;doc.content={**doc.content,'notes':'已纠正原文'}
            await s.commit()

    async def test_concurrent_and_lost_reply_replay_do_not_call_model_twice(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate())) as model:
            results=await asyncio.gather(self.generate(req),self.generate(req))
            final=await self.generate(req)
        self.assertEqual(model.await_count,1);self.assertEqual(final['status'],'completed')
        self.assertTrue(all(r['request_id']==str(req.request_id) for r in results))
        async with self.sessions() as s:self.assertEqual(await s.scalar(select(func.count()).select_from(ItemHelp).where(ItemHelp.user_id==self.uid)),1)

    async def test_pre_d7_receipt_can_replay_without_new_optional_field(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate())) as model:
            await self.generate(req)
            async with self.sessions() as s:
                row=await s.scalar(select(ItemHelp).where(ItemHelp.user_id==self.uid))
                row.input={k:v for k,v in row.input.items() if k!='evidence_keys'}
                row.fingerprint=digest(req.model_dump(mode='json',exclude={'evidence_keys'}))
                await s.commit()
            self.assertEqual((await self.generate(req))['status'],'completed')
        self.assertEqual(model.await_count,1)

    async def test_retry_uses_frozen_input_and_rejects_changed_identity(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(side_effect=RuntimeError('failure'))):
            self.assertEqual((await self.generate(req))['status'],'failed')
        with self.assertRaises(AppException): await self.generate(req.model_copy(update={'text':'改写'}))
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate())):
            self.assertEqual((await self.generate(req))['status'],'completed')

    async def test_expired_attempt_cannot_overwrite_newer_result(self):
        entered,released=asyncio.Event(),asyncio.Event()
        async def slow(*args):entered.set();await released.wait();return candidate(title='旧结果')
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',slow):
            old=asyncio.create_task(self.generate(req));await entered.wait()
            async with self.sessions() as s:
                row=await s.scalar(select(ItemHelp).where(ItemHelp.user_id==self.uid));row.lease_until=datetime.now(UTC)-timedelta(seconds=1);await s.commit()
            with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate(title='新结果'))):await self.generate(req)
            released.set();self.assertEqual((await old)['result']['title'],'新结果')

    async def test_invalid_model_quotes_are_failed_without_facts(self):
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate(quotes=['编造引用']))):
            self.assertEqual((await self.generate(self.request()))['status'],'failed')
        async with self.sessions() as s:self.assertEqual(await s.scalar(select(func.count()).select_from(LifeRecord).where(LifeRecord.user_id==self.uid)),0)

    async def test_learning_has_one_selected_source_and_real_answer(self):
        req=self.request('learning_feedback',answer='先主动回忆，再核对原文')
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=learning_reply(req.kind))) as model:
            result=await self.generate(req)
        self.assertEqual(result['status'],'completed');self.assertEqual(result['input']['answer'],req.answer)
        sent=model.call_args.args[3];self.assertEqual(sent['answer'],req.answer)
        self.assertEqual(json.loads(sent['source'])['fields']['notes'],NOTES)
        self.assertNotIn('source_url',sent['source'])
        self.assertEqual(json.loads(sent['source'])['expert_skill']['method'], 'criterion_feedback')
        self.assertEqual(result['result']['skill']['version'], '1.1.0')
        async with self.sessions() as s:self.assertEqual((await s.get(WorkspaceLearningItem,self.iid)).status,'queued')

    async def test_source_changes_hide_previous_result_and_old_retry_is_stale(self):
        req=self.request('learning_explain')
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=learning_reply(req.kind))):await self.generate(req)
        await self.update_source()
        async with self.sessions() as s:
            result=(await read(req.request_id,str(self.uid),s)).data
        self.assertTrue(result['redacted']);self.assertIsNone(result['result']);self.assertIsNone(result['source'])

    async def test_revocation_during_model_processing_disards_result(self):
        async def changing(*args):await self.update_source(revoke=True);return {'text':'解释','quotes':['先主动回忆，再核对原文。']}
        with patch('app.api.item_help.llm_service.structured_output',changing):result=await self.generate(self.request('learning_explain'))
        self.assertEqual(result['status'],'failed');self.assertTrue(result['redacted']);self.assertIsNone(result['result'])

    async def test_other_account_cannot_read_help_or_use_learning_source(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate())):await self.generate(req)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await read(req.request_id,str(self.other),s)
        with self.assertRaises(AppException):await self.generate(self.request('learning_explain'),self.other)

    async def test_only_link_or_empty_exercise_does_not_call_model(self):
        async with self.sessions() as s:
            doc=await s.scalar(select(PersonalDocument).where(PersonalDocument.learning_item_id==self.iid));doc.content={'title':'只有链接','notes':'','exercise':''};await s.commit()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock()) as model:
            with self.assertRaises(AppException):await self.generate(self.request('learning_explain'))
        self.assertEqual(model.await_count,0)

    async def test_user_confirmed_ai_candidate_preserves_provenance_and_replay(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=candidate())):await self.generate(req)
        content={'title':'本人纠正后的深蹲','occurred_on':date.today().isoformat(),'timezone':'UTC','outcome':'completed',
            'actual_minutes':None,'exercises':[],'note':'已核对','source':'ai','original':TEXT,'confirmed':True,'help_request_id':str(req.request_id)}
        command=LifeCommand(request_id=uuid.uuid4(),entity_id=uuid.uuid4(),action='create_record',data=content)
        async with self.sessions() as s:
            a=await apply_command(s,self.uid,command);await s.commit()
            b=await apply_command(s,self.uid,command);await s.commit()
        self.assertEqual(a,b);self.assertEqual(a['entity']['content']['original'],TEXT)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await apply_command(s,self.other,command.model_copy(update={'request_id':uuid.uuid4(),'entity_id':uuid.uuid4()}))

    async def test_views_include_more_than_first_list_page_and_isolate_users(self):
        async with self.sessions() as s:
            for i in range(60):s.add(LifeRecord(id=uuid.uuid4(),user_id=self.uid,occurred_on=date.today(),version=1,content={'title':f'记录{i}',
                'occurred_on':date.today().isoformat(),'timezone':'UTC','outcome':'completed','actual_minutes':None,'exercises':[]}))
            await s.commit()
            report=(await views(date.today(),date.today(),str(self.uid),s)).data
            foreign=(await views(date.today(),date.today(),str(self.other),s)).data
        self.assertEqual((report['total'],report['completed_days'],report['unknown_minutes_records']),(60,1,60));self.assertEqual(foreign['total'],0)
