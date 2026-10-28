"""Production bounded protocol and persisted application work, with legacy replay."""
import hashlib,json,os,unittest,uuid
from datetime import datetime
from unittest.mock import AsyncMock,patch
from pydantic import ValidationError
from sqlalchemy import select,delete
from zoneinfo import ZoneInfo
from app.api.learning_review import CreateUnit,Answer,Finish,create_unit,save_answer,finish_attempt,saved_receipt
from app.api.personal_work import day_evidence
from app.api.item_help import HelpRequest,generate_help
from app.ai.prompt_router import get_variant,PromptVariant
from app.engines.learning_diagnosis import diagnosis_source
from app.core.exceptions import AppException
from app.models.personal_work import PersonalCommandReceipt
from app.models.learning_review import LearningReviewAttempt
from tests import test_learning_review as fixture

class Contracts(unittest.IsolatedAsyncioTestCase):
    async def test_new_fields_require_an_actual_result_and_explicit_self_check(self):
        base={'request_id':uuid.uuid4(),'rating':'good','next_action':'实际尝试'}
        for change in ({'practice_checked':True},{'practice_result':'结果','practice_criterion':'标准','practice_checked':1},{'practice_result':' ','practice_criterion':'标准','practice_checked':True}):
            with self.assertRaises(ValidationError):Finish(**base,**change)
        with self.assertRaises(ValidationError):Answer(request_id=uuid.uuid4(),answer='回答',assistance='mastered')

    async def test_old_pending_request_fingerprints_are_unchanged(self):
        for payload,old in [(Answer(request_id=uuid.uuid4(),answer='本人答案'),('assistance',)),(Finish(request_id=uuid.uuid4(),rating='good',next_action='尝试'),('schedule_mode','schedule_token','practice_result','practice_criterion','practice_checked')),(CreateUnit(request_id=uuid.uuid4(),question='问题',source={'kind':'document','revision_id':uuid.uuid4(),'field':'notes','start':0,'end':4}),('application_goal',))]:
            data=payload.model_dump(mode='json')
            for k in old:data.pop(k)
            target=uuid.uuid4();expected=hashlib.sha256(json.dumps({'action':'test','target':str(target),'payload':data},sort_keys=True,ensure_ascii=False).encode()).hexdigest()
            s=AsyncMock();s.scalar.return_value=None
            fp,_=await saved_receipt(s,uuid.uuid4(),uuid.uuid4(),payload.request_id,'test',target,payload)
            self.assertEqual(fp,expected)

    async def test_bounded_provider_has_no_unvalidated_fallback_or_automatic_retry(self):
        from app.ai import llm_service as llm
        provider=AsyncMock();provider.name='qwen';provider.chat.side_effect=RuntimeError('synthetic unavailable')
        variant=PromptVariant('learning_diagnosis','v3',{'system_prompt':'test','user_prompt_template':'test','evidence_selection':True})
        with patch.object(llm,'_select_provider',return_value=(provider,'qwen-plus')),patch.object(llm,'_record_call',AsyncMock()):
            with self.assertRaisesRegex(Exception,'All 1 attempts failed'):await llm.structured_output(AsyncMock(),None,'learning_diagnosis',{},variant)
        self.assertEqual(provider.chat.await_count,1)

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class FormalIntegration(unittest.IsolatedAsyncioTestCase):
    asyncSetUp=fixture.Integration.asyncSetUp
    async def asyncTearDown(self):
        from app.models.item_help import ItemHelp
        async with self.sessions() as s:
            await s.execute(delete(ItemHelp).where(ItemHelp.user_id==self.uid));await s.commit()
        await fixture.Integration.asyncTearDown(self)
    unit_request=fixture.Integration.unit_request
    call=fixture.Integration.call
    finish_request=fixture.Integration.finish_request

    async def test_source_answer_application_history_and_daily_evidence_are_immutable_and_replayable(self):
        u=await self.call(create_unit,self.unit_request(application_goal='在自己的文档流程中检查一次'))
        self.assertEqual(u['source']['application_goal'],'在自己的文档流程中检查一次');self.assertNotIn('quote',u['source'])
        a=await self.call(save_answer,uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),answer='先回忆后核对',assistance='source'))
        self.assertEqual(a['snapshot']['assistance'],'source')
        with self.assertRaises(AppException):await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request())
        f=self.finish_request(practice_result='试用一次，发现先看答案导致漏项，已修正。',practice_criterion='先回忆再对照原文，说明漏项',practice_checked=True)
        done=await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),f)
        self.assertEqual(done,await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),f))
        self.assertEqual(done['snapshot']['practice']['checked_by'],'self')
        async with self.sessions() as s:
            row=await s.get(LearningReviewAttempt,uuid.UUID(a['id']));self.assertEqual(row.snapshot['practice']['result'],f.practice_result)
            evidence=await day_evidence(s,self.uid,self.wid,datetime.now(ZoneInfo('Asia/Shanghai')).date(),ZoneInfo('Asia/Shanghai'))
            entry=next(e for e in evidence if e['kind']=='learning_review');self.assertIn(f.practice_result,entry['excerpt']);self.assertIn('practice',entry['fields'])
        b=await self.call(save_answer,uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),answer='再次回忆'))
        self.assertNotIn('practice',b['snapshot']);self.assertNotIn('assistance',b['snapshot'])

    async def test_unfinished_answer_is_available_to_current_production_bounded_checker(self):
        u=await self.call(create_unit,self.unit_request())
        a=await self.call(save_answer,uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),answer='先凭记忆回答，再核对材料',assistance='independent'))
        async with self.sessions() as s:
            source=await diagnosis_source(s,self.uid,self.wid,self.iid,['attempt:'+a['id']]);self.assertIsNone(source['evidence'][0]['completed_at'])
            req=HelpRequest(request_id=uuid.uuid4(),kind='learning_diagnose',consent=True,workspace_id=self.wid,item_id=self.iid,base_version=1,evidence_keys=['attempt:'+a['id']])
            with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value={'schema_version':4,'kind':'omission','evidence_ids':['E1','E2']})) as model:
                reply=await generate_help(s,self.uid,req)
            self.assertEqual(reply['status'],'completed',reply.get('error'));self.assertEqual(reply['result']['assessment_mode'],'evidence_selection')
            self.assertEqual(model.call_args.args[4].version,'v3');self.assertNotIn('本人声明',model.call_args.args[3]['source'])
