"""D10 identity-aware evidence, actionable criteria and legacy compatibility."""
import copy,json,os,unittest,uuid
from datetime import UTC,datetime,date
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock,patch
from sqlalchemy import select,delete
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.engines.learning_diagnosis import recall_evidence,validate_diagnosis,diagnosis_source,digest
from app.api.personal_work import Command,apply_command
from app.api.learning_review import CreateUnit,Answer,Finish,create_unit,save_answer,finish_attempt
from app.api.item_help import HelpRequest,generate_help,help_data,source_current
from app.models.learning_review import LearningReviewUnit,LearningReviewAttempt
from app.models.personal_work import PersonalDocument,DocumentRevision,PersonalCommandReceipt
from app.models.workspace import Workspace,WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.item_help import ItemHelp
from app.models.user import User
from tests.test_learning_workspace import response

CASES=json.loads((Path(__file__).parents[1]/'evals/learning_diagnosis/cases.json').read_text())

def comparison(source=None,kind='contradiction'):
    source=source or CASES[0]['source'];row=source['evidence'][0]
    cites=[{'key':row['key'],'part':part,'quote':row['recall'][part]} for part in ('reference','answer')]
    return {'schema_version':2,'summary':'这次答案与给定依据需要核对。','findings':[{'kind':kind,'observation':'答案把每次请求都描述为重新计算。','interpretation':'这次答案与命中时读取已有值不符。','certainty':'supported','evidence':cites}],
        'suggestions':[{'title':'区分两种情况','action':'合上原文，分别写出命中与未命中的处理步骤，再核对。','why':'检验这次答案出现的不符。','finding_indexes':[0],'success_check':'命中时读取已有值；未命中时计算并保存新值。','evidence':copy.deepcopy(cites)}],
        'limitations':'仅限本次选定记录，不等于长期掌握评估。'}

def insufficient(source):
    row=source['evidence'][0];cite={'key':row['key'],'part':'text','quote':row['text'][:100]}
    return {'schema_version':2,'summary':'还需实际作答。','findings':[{'kind':'insufficient_evidence','observation':'缺少可比较的实际答案。','interpretation':'不能判定具体概念错误。','certainty':'insufficient','evidence':[cite]}],
        'suggestions':[{'title':'保存同题作答','action':'保留同一问题的原文依据与独立答案。','why':'下一次可以逐项比较。','finding_indexes':[0],'success_check':'原文依据和实际答案均已保存，且对应同一个问题。','evidence':[cite]}],'limitations':'仅限本次记录，不能评估长期掌握。'}

class Contracts(unittest.TestCase):
    def test_actual_answer_and_reference_have_distinct_addressable_roles(self):
        now=datetime.now(UTC);a=SimpleNamespace(id=uuid.uuid4(),status='completed',snapshot={'question':'问题','source':{'quote':'原文📚\n第二行'}},answer='本人答案',rating='again',understanding='',difficulty='不确定',next_action='',answered_at=now,completed_at=now)
        row=recall_evidence(a);self.assertEqual(row['recall']['answer'],'本人答案');self.assertEqual(row['recall']['reference'],'原文📚\n第二行');self.assertNotIn('原文📚',row['recall']['self_report'])
        a.answer='';self.assertEqual(recall_evidence(a)['recall']['answer'],'');self.assertIn('本次没能想起',recall_evidence(a)['text'])

    def test_comparison_requires_answer_and_reference_from_same_attempt(self):
        source=copy.deepcopy(CASES[0]['source']);raw=comparison(source);validate_diagnosis(raw,source)
        for kind in ('contradiction','omission','no_gap_observed'):
            bad=comparison(source,kind);bad['findings'][0]['evidence']=bad['findings'][0]['evidence'][:1]
            with self.assertRaises(ValueError):validate_diagnosis(bad,source)
        row=copy.deepcopy(source['evidence'][0]);row['key']='attempt:'+str(uuid.uuid4());source['evidence'].append(row)
        raw['findings'][0]['evidence'][1]['key']=row['key']
        with self.assertRaises(ValueError):validate_diagnosis(raw,source)

    def test_quote_in_source_text_cannot_masquerade_as_actual_answer(self):
        source=CASES[0]['source'];raw=comparison(source);raw['findings'][0]['evidence'][1]['quote']=source['evidence'][0]['recall']['reference']
        with self.assertRaises(ValueError):validate_diagnosis(raw,source)
        bad=copy.deepcopy(source);bad['evidence'][0]['role']='personal_record'
        with self.assertRaises(ValueError):validate_diagnosis(comparison(),bad)

    def test_empty_answer_and_minutes_cannot_support_a_comparison(self):
        for case in (CASES[3],CASES[4],CASES[8]):validate_diagnosis(insufficient(case['source']),case['source'])
        raw=comparison();source=copy.deepcopy(CASES[0]['source']);source['evidence'][0]['recall']['answer']=''
        with self.assertRaises(ValueError):validate_diagnosis(raw,source)

    def test_self_report_stays_tentative_and_requires_personal_evidence(self):
        source={'evidence':[{'key':'notes','role':'personal_record','text':'没有尝试独立回忆'}]};validate_diagnosis(response(),source)
        for certainty in ('supported','insufficient'):
            raw=response();raw['findings'][0]['certainty']=certainty
            with self.assertRaises(ValueError):validate_diagnosis(raw,source)
        source['evidence'][0]['role']='learning_content'
        with self.assertRaises(ValueError):validate_diagnosis(response(),source)

    def test_source_conflict_needs_two_original_sources_and_insufficient_certainty(self):
        source=CASES[6]['source'];raw=insufficient(source);f=raw['findings'][0];f['kind']='source_conflict';f['evidence']=[{'key':r['key'],'part':'text','quote':r['text']} for r in source['evidence']];validate_diagnosis(raw,source)
        bad=copy.deepcopy(raw);bad['findings'][0]['certainty']='supported'
        with self.assertRaises(ValueError):validate_diagnosis(bad,source)
        bad=copy.deepcopy(raw);bad['findings'][0]['evidence']=f['evidence'][:1]
        with self.assertRaises(ValueError):validate_diagnosis(bad,source)
        badsource=copy.deepcopy(source);badsource['evidence'][1]['role']='personal_record'
        with self.assertRaises(ValueError):validate_diagnosis(raw,badsource)

    def test_actions_need_nonblank_criteria_and_valid_unique_finding_links(self):
        for change in ({'success_check':' '},{'finding_indexes':[-1]},{'finding_indexes':[1]},{'finding_indexes':[0,0]},{'finding_indexes':[True]},{'finding_indexes':['0']}):
            raw=comparison();raw['suggestions'][0].update(change)
            with self.assertRaises(ValueError):validate_diagnosis(raw,CASES[0]['source'])

    def test_unrelated_action_citations_are_rejected_even_if_exact(self):
        source=copy.deepcopy(CASES[0]['source']);source['evidence'].append({'key':'notes','text':'另一个本人感受','role':'personal_record'});raw=comparison();raw['suggestions'][0]['evidence']=[{'key':'notes','quote':'另一个本人感受','part':'text'}]
        with self.assertRaises(ValueError):validate_diagnosis(raw,source)

    def test_legacy_is_readable_but_new_generation_cannot_use_legacy_shape(self):
        raw=response();raw.pop('schema_version');raw['findings'][0].pop('kind');a=raw['suggestions'][0];a.pop('success_check');a.pop('finding_indexes');source={'evidence':[{'key':'notes','text':'没有尝试独立回忆'}]}
        validate_diagnosis(raw,source,require_v2=False)
        with self.assertRaises(ValueError):validate_diagnosis(raw,source)

    def test_eval_cases_are_reviewable_and_do_not_put_gold_rubrics_in_source(self):
        self.assertEqual(len(CASES),10);self.assertEqual(len({c['id'] for c in CASES}),10)
        for case in CASES:
            self.assertTrue(case['rubric']);self.assertTrue(case['expected_kinds']);self.assertNotIn('expected_kinds',case['source']);self.assertNotIn('rubric',case['source'])
            for row in case['source']['evidence']:
                if row['role']=='recall_record':
                    for part in ('reference','answer','self_report'):self.assertIn(row['recall'][part],row['text'])

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Freeze legacy protocol tests; current production receipts are covered in test_learning_flow.
        from app.ai.prompt_loader import load_prompt
        from app.ai.prompt_router import PromptVariant
        legacy=patch('app.api.item_help.get_variant',AsyncMock(return_value=PromptVariant('learning_diagnosis','v2',load_prompt('learning_diagnosis','v2'))))
        legacy.start();self.addCleanup(legacy.stop)
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test');self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False);self.uid,self.wid,self.iid=[uuid.uuid4() for _ in range(3)]
        reference=CASES[0]['source']['evidence'][0]['recall']['reference']
        async with self.sessions() as s:
            s.add(User(id=self.uid,wx_openid=str(self.uid),settings={}));await s.flush();s.add(Workspace(id=self.wid,user_id=self.uid,name='D10 synthetic'));await s.flush()
            self.item=(await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action='create_learning',data={'title':'D10 synthetic','content':reference,'notes':'没有尝试独立回忆'})))['entity'];await s.commit()
            revision=await s.scalar(select(DocumentRevision).where(DocumentRevision.document_id==uuid.UUID(self.item['document']['id'])))
            unit=await create_unit(s,self.uid,self.wid,self.iid,CreateUnit(request_id=uuid.uuid4(),question='缓存命中与未命中分别做什么？',source={'kind':'document','revision_id':revision.id,'field':'content','start':0,'end':len(reference)}));await s.commit()
            attempt=await save_answer(s,self.uid,self.wid,self.iid,uuid.UUID(unit['id']),Answer(request_id=uuid.uuid4(),answer=CASES[0]['source']['evidence'][0]['recall']['answer']));await s.commit()
            done=await finish_attempt(s,self.uid,self.wid,self.iid,uuid.UUID(unit['id']),uuid.UUID(attempt['id']),Finish(request_id=uuid.uuid4(),rating='good',difficulty='还不确定',next_action='再做一次'));await s.commit();self.aid=uuid.UUID(done['id']);self.key='attempt:'+str(self.aid)
    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (ItemHelp,LearningReviewAttempt,LearningReviewUnit):await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(select(PersonalDocument.id).where(PersonalDocument.user_id==self.uid))))
            for model in (PersonalCommandReceipt,PersonalDocument,WorkspaceEvent,WorkspaceLearningItem,Workspace):await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(User).where(User.id==self.uid));await s.commit()
        await self.engine.dispose()
    async def test_actual_review_source_v2_persistence_and_adoption_preserve_check(self):
        async with self.sessions() as s:
            source=await diagnosis_source(s,self.uid,self.wid,self.iid,[self.key]);raw=comparison(source);req=HelpRequest(request_id=uuid.uuid4(),kind='learning_diagnose',consent=True,workspace_id=self.wid,item_id=self.iid,base_version=1,evidence_keys=[self.key])
            with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=raw)) as model:
                result=await generate_help(s,self.uid,req);again=await generate_help(s,self.uid,req);self.assertEqual(result,again);self.assertEqual(model.await_count,1);self.assertEqual(result['status'],'completed');self.assertEqual(model.call_args.args[4].version,'v2')
            row=await s.scalar(select(ItemHelp).where(ItemHelp.request_id==req.request_id));self.assertEqual((await help_data(s,row))['result']['schema_version'],2)
            cmd=Command(request_id=uuid.uuid4(),entity_id=self.iid,action='adopt_learning_advice',base_version=1,expected_updated_at=self.item['updated_at'],data={'help_request_id':req.request_id,'suggestion_index':0,'date':date.today()});saved=await apply_command(s,self.uid,self.wid,cmd);await s.commit();body=saved['entity']['document']['content']['journal'][0]['body'];self.assertIn(raw['suggestions'][0]['success_check'],body);self.assertIn('本人答案',body);self.assertIn('原文依据',body);self.assertFalse(await source_current(s,row));self.assertEqual(saved,await apply_command(s,self.uid,self.wid,cmd))
    async def test_invalid_comparison_is_saved_failed_without_result(self):
        async with self.sessions() as s:
            source=await diagnosis_source(s,self.uid,self.wid,self.iid,[self.key]);raw=comparison(source);raw['findings'][0]['evidence'][1]['quote']=source['evidence'][0]['recall']['reference'];req=HelpRequest(request_id=uuid.uuid4(),kind='learning_diagnose',consent=True,workspace_id=self.wid,item_id=self.iid,base_version=1,evidence_keys=[self.key])
            with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=raw)):result=await generate_help(s,self.uid,req)
            self.assertEqual(result['status'],'failed');self.assertIsNone(result['result'])
    async def test_legacy_source_digest_stays_valid_and_legacy_adoption_works(self):
        async with self.sessions() as s:
            source=await diagnosis_source(s,self.uid,self.wid,self.iid,[self.key]);old=copy.deepcopy(source);old['evidence'][0].pop('recall');old['digest']=digest({'version':old['version'],'evidence':old['evidence']});self.assertEqual(old['digest'],source['digest'])
            raw=comparison(source);raw.pop('schema_version');raw['findings'][0].pop('kind');a=raw['suggestions'][0];a.pop('success_check');a.pop('finding_indexes')
            for block in [*raw['findings'],*raw['suggestions']]:
                for cite in block['evidence']:cite.pop('part')
            row=ItemHelp(id=uuid.uuid4(),request_id=uuid.uuid4(),user_id=self.uid,workspace_id=self.wid,item_id=self.iid,kind='learning_diagnose',fingerprint='f'*64,status='completed',input={},source=old,result=raw,prompt_version='v1',attempt_id=uuid.uuid4(),lease_until=datetime.now(UTC));s.add(row);await s.commit();self.assertTrue(await source_current(s,row));self.assertEqual((await help_data(s,row))['result'],raw)
            saved=await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action='adopt_learning_advice',base_version=1,expected_updated_at=self.item['updated_at'],data={'help_request_id':row.request_id,'suggestion_index':0,'date':date.today()}));await s.commit();self.assertIn(raw['suggestions'][0]['action'],saved['entity']['document']['content']['journal'][0]['body'])
