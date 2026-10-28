"""D7 complete records, own knowledge library, cited AI observations and personal adoption."""
import asyncio,os,uuid,unittest
from datetime import UTC,datetime,date
from unittest.mock import AsyncMock,patch
from pydantic import ValidationError
from sqlalchemy import select,delete,func
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.api.personal_work import Command,apply_command,LearningContent,day_evidence
from app.api.learning_knowledge import library,detail
from app.api.item_help import HelpRequest,generate_help,source_current
from app.engines.learning_diagnosis import diagnosis_source,validate_diagnosis,evidence_rows
from app.core.exceptions import AppException
from app.models.personal_work import PersonalDocument,DocumentRevision,PersonalCommandReceipt
from app.models.workspace import Workspace,WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.models.learning_material import LearningMaterial
from app.engines.material_parser import extract
from app.models.item_help import ItemHelp
from app.models.user import User
from zoneinfo import ZoneInfo
BODY='学习内容：主动回忆是先尝试从记忆中回答，再核对原文。'
NOTES='学习笔记：我常常先看答案，没有尝试独立回忆。'
INSIGHTS='学习心得：需要先独立解释，再补上遗漏。'
def response():
    cites=[{'key':'notes','quote':'没有尝试独立回忆'}]
    return {'schema_version':2,'summary':'记录中有一个本人报告的卡点。','findings':[{'observation':'笔记提到没有独立回忆。','interpretation':'可能需要增加先作答的环节。','kind':'self_reported','certainty':'tentative','evidence':cites}],
    'suggestions':[{'title':'先独立解释一次','action':'合上原文，写出记得的步骤，再核对原文。','why':'检验本人报告的卡点。','finding_indexes':[0],'success_check':'保留独立写出的步骤，逐项标出与原文一致或遗漏的部分。','evidence':cites}],'limitations':'仅依据本次记录，不能判断长期掌握。'}

class Contracts(unittest.TestCase):
    def test_complete_record_contract_and_request_scope(self):
        entry={'id':uuid.uuid4(),'date':date.today(),'kind':'note','body':'实际笔记'}
        with self.assertRaises(ValidationError):LearningContent(title='学习',journal=[entry,entry])
        for keys in ([],['notes','notes'],['notes']*11):
            with self.assertRaises(ValidationError):HelpRequest(request_id=uuid.uuid4(),kind='learning_diagnose',consent=True,workspace_id=uuid.uuid4(),item_id=uuid.uuid4(),base_version=1,evidence_keys=keys)
    def test_ai_citations_must_match_the_selected_evidence_exactly(self):
        source={'evidence':[{'key':'notes','role':'personal_record','text':NOTES}]};self.assertEqual(validate_diagnosis(response(),source)['suggestions'][0]['title'],'先独立解释一次')
        for change in ({'key':'other','quote':'没有尝试独立回忆'},{'key':'notes','quote':'改写的摘录'},{'key':'notes','quote':' '}):
            raw=response();raw['findings'][0]['evidence']=[change]
            with self.assertRaises((ValueError,ValidationError)):validate_diagnosis(raw,source)

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Freeze legacy protocol tests; current production receipts are covered in test_learning_flow.
        from app.ai.prompt_loader import load_prompt
        from app.ai.prompt_router import PromptVariant
        legacy=patch('app.api.item_help.get_variant',AsyncMock(return_value=PromptVariant('learning_diagnosis','v2',load_prompt('learning_diagnosis','v2'))))
        legacy.start();self.addCleanup(legacy.stop)
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False);self.uid,self.other,self.wid,self.wid2,self.iid=[uuid.uuid4() for _ in range(5)];self.entry_id=uuid.uuid4()
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={}),User(id=self.other,wx_openid=str(self.other),settings={})]);await s.flush();s.add_all([Workspace(id=self.wid,user_id=self.uid,name='D7 test'),Workspace(id=self.wid2,user_id=self.uid,name='other')]);await s.flush()
            self.item=(await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action='create_learning',data={'title':'完整学习','content':BODY,'notes':NOTES,'insights':INSIGHTS,'journal':[{'id':str(self.entry_id),'date':str(date.today()),'kind':'insight','title':'今天的例子','body':'这个例子连接到工作中的解释方法。'}]})))['entity'];await s.commit()
    async def asyncTearDown(self):
        async with self.sessions() as s:
            await s.execute(delete(ItemHelp).where(ItemHelp.user_id==self.uid));await s.execute(delete(LearningMaterial).where(LearningMaterial.user_id==self.uid));await s.execute(delete(WorkspaceKnowledgeCard).where(WorkspaceKnowledgeCard.user_id==self.uid))
            docs=select(PersonalDocument.id).where(PersonalDocument.user_id==self.uid);await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(docs)))
            for model in (PersonalCommandReceipt,PersonalDocument,WorkspaceEvent,WorkspaceLearningItem,Workspace):await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()
    def request(self,**changes):return HelpRequest.model_validate({'request_id':uuid.uuid4(),'kind':'learning_diagnose','consent':True,'workspace_id':self.wid,'item_id':self.iid,'base_version':1,'evidence_keys':['content','notes','insights'],'question':'这次哪里卡住了？',**changes})
    async def generate(self,req=None):
        async with self.sessions() as s:return await generate_help(s,self.uid,req or self.request())
    async def submit(self,cmd):
        async with self.sessions() as s:r=await apply_command(s,self.uid,self.wid,cmd);await s.commit();return r
    async def test_records_and_legacy_clients_preserve_new_fields_and_old_versions(self):
        old={'title':'旧端修改笔记','notes':'新的笔记','stage':'queued'}
        r=await self.submit(Command(request_id=uuid.uuid4(),entity_id=self.iid,action='save_learning',base_version=1,expected_updated_at=self.item['updated_at'],data=old));content=r['entity']['document']['content'];self.assertEqual(content['content'],BODY);self.assertEqual(content['insights'],INSIGHTS);self.assertEqual(content['journal'][0]['body'],'这个例子连接到工作中的解释方法。')
        async with self.sessions() as s:
            old=(await detail(self.wid,'doc:'+str(self.iid)+':notes',1,str(self.uid),s)).data;self.assertEqual(old['text'],NOTES)
            current=(await detail(self.wid,'doc:'+str(self.iid)+':notes',None,str(self.uid),s)).data;self.assertEqual(current['version'],2)
            day=datetime.now(ZoneInfo('Asia/Shanghai')).date();evidence=await day_evidence(s,self.uid,self.wid,day,ZoneInfo('Asia/Shanghai'));self.assertIn('insights',evidence[0]['fields']);self.assertIn('journal',evidence[0]['fields'])
    async def test_library_auto_collects_records_searches_and_keeps_revision_reference(self):
        async with self.sessions() as s:
            all_=await library(s,self.uid,self.wid);self.assertEqual(all_['total'],4)
            self.assertEqual((await library(s,self.uid,self.wid,'连接到工作'))['total'],1)
            self.assertEqual((await library(s,self.uid,self.wid,'%'))['total'],0)
            self.assertEqual((await library(s,self.uid,self.wid,'','insights'))['total'],2)
            key='entry:'+str(self.iid)+':'+str(self.entry_id);full=(await detail(self.wid,key,1,str(self.uid),s)).data;self.assertIn('连接到工作',full['text'])
            card=WorkspaceKnowledgeCard(user_id=self.uid,workspace_id=self.wid,title='知识卡',source_type='text',content='已有知识卡也能查找。',ai_concepts=[],ai_tags=[]);s.add(card);await s.commit();self.assertEqual((await library(s,self.uid,self.wid,'知识卡'))['total'],1)
    async def test_library_and_diagnosis_enforce_owner_workspace_item_and_archives(self):
        async with self.sessions() as s:
            for uid,wid in ((self.other,self.wid),(self.uid,uuid.uuid4())):
                with self.assertRaises(AppException):await library(s,uid,wid)
            with self.assertRaises(AppException):await detail(self.wid2,'doc:'+str(self.iid)+':content',1,str(self.uid),s)
            with self.assertRaises(AppException):await diagnosis_source(s,self.uid,self.wid2,self.iid,['notes'])
            with self.assertRaises(AppException):await diagnosis_source(s,self.uid,self.wid,self.iid,['journal:'+str(uuid.uuid4())])
            item=await s.get(WorkspaceLearningItem,self.iid);item.archived_at=datetime.now(UTC);await s.commit();self.assertEqual((await library(s,self.uid,self.wid))['total'],0)
            with self.assertRaises(AppException):await detail(self.wid,'doc:'+str(self.iid)+':notes',1,str(self.uid),s)
    async def test_true_model_boundary_and_replay_send_only_selected_records(self):
        req=self.request(evidence_keys=['notes'])
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=response())) as model:
            r=await self.generate(req);again=await self.generate(req);self.assertEqual(r['request_id'],again['request_id']);self.assertEqual(model.await_count,1);sent=model.call_args.args[4];self.assertEqual(sent.purpose,'learning_diagnosis');self.assertNotIn(BODY,model.call_args.args[3]['source']);self.assertEqual(r['status'],'completed');self.assertEqual(len(r['source']['evidence']),1)
        async with self.sessions() as s:self.assertEqual(await s.scalar(select(func.count()).select_from(ItemHelp).where(ItemHelp.user_id==self.uid)),1)
    async def test_invalid_ai_quote_and_source_change_do_not_publish_diagnosis(self):
        bad=response();bad['suggestions'][0]['evidence']=[{'key':'notes','quote':'捏造原文'}]
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=bad)):r=await self.generate();self.assertEqual(r['status'],'failed');self.assertIsNone(r['result'])
        async def changing(*args):
            async with self.sessions() as s:
                user=await s.get(User,self.uid);user.settings={'privacy_scope':{'enabled_sources':[]}};await s.commit()
            return response()
        with patch('app.api.item_help.llm_service.structured_output',changing):r=await self.generate(self.request());self.assertEqual(r['status'],'failed');self.assertTrue(r['redacted']);self.assertIsNone(r['result'])
    async def test_personal_adoption_is_atomic_idempotent_and_preserves_complete_records(self):
        req=self.request()
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=response())):r=await self.generate(req)
        cmd=Command(request_id=uuid.uuid4(),entity_id=self.iid,action='adopt_learning_advice',base_version=1,expected_updated_at=self.item['updated_at'],data={'help_request_id':req.request_id,'suggestion_index':0,'date':str(date.today())})
        a,b=await asyncio.gather(self.submit(cmd),self.submit(cmd));self.assertEqual(a,b);doc=a['entity']['document'];self.assertEqual(doc['version'],2);self.assertEqual(doc['content']['content'],BODY);self.assertEqual(doc['content']['notes'],NOTES);self.assertEqual(len(doc['content']['journal']),2);entry=doc['content']['journal'][0];self.assertEqual(entry['advice_request_id'],str(req.request_id));self.assertIn('AI 学习回顾建议 · 本人采用',entry['body']);self.assertIn('没有尝试独立回忆',entry['body']);self.assertIn('完成后这样核对：',entry['body'])
        async with self.sessions() as s:
            self.assertEqual((await library(s,self.uid,self.wid,'先独立解释一次'))['total'],1)
            h=await s.scalar(select(ItemHelp).where(ItemHelp.user_id==self.uid));self.assertFalse(await source_current(s,h))
        with self.assertRaises(AppException):await self.submit(cmd.model_copy(update={'request_id':uuid.uuid4(),'base_version':2,'expected_updated_at':a['entity']['updated_at']}))
    async def test_material_selection_keeps_exact_offsets_and_cannot_use_other_item(self):
        raw='原资料📚：先独立回忆，再核对。\n\n第二段原文。'.encode()
        mid=uuid.uuid4()
        async with self.sessions() as s:
            s.add(LearningMaterial(id=mid,user_id=self.uid,workspace_id=self.wid,item_id=self.iid,request_id=uuid.uuid4(),fingerprint='f'*64,checksum='a'*64,title='原资料',kind='text',filename='原资料.txt',byte_count=len(raw),original=raw,extraction=extract(raw,'text'),status='ready',attempts=1,attempt_id=uuid.uuid4(),lease_until=datetime.now(UTC),parser_version='test'))
            await s.commit()
            key=f'material:{mid}:c1';source=await diagnosis_source(s,self.uid,self.wid,self.iid,[key]);e=source['evidence'][0]
            self.assertEqual(e['text'],'原资料📚：先独立回忆，再核对。');self.assertEqual(e['text'],raw.decode()[e['start']:e['end']]);self.assertEqual(e['role'],'learning_source')
            self.assertEqual((await library(s,self.uid,self.wid,'第二段'))['total'],1)
            with self.assertRaises(AppException):await diagnosis_source(s,self.uid,self.wid,self.iid,[f'material:{uuid.uuid4()}:c1'])

    async def test_long_valid_ai_advice_is_saved_without_truncation(self):
        text='原话'*750
        async with self.sessions() as s:
            doc=await s.get(PersonalDocument,uuid.UUID(self.item['document']['id']));doc.content={**doc.content,'notes':text};await s.commit()
        raw=response();raw['findings'][0]['evidence']=[{'key':'notes','quote':text}]
        raw['suggestions'][0].update(action='做'*2000,why='因'*1500,evidence=[{'key':'notes','quote':text}]*4)
        with patch('app.api.item_help.llm_service.structured_output',AsyncMock(return_value=raw)):r=await self.generate()
        self.assertEqual(r['status'],'completed')
        saved=await self.submit(Command(request_id=uuid.uuid4(),entity_id=self.iid,action='adopt_learning_advice',base_version=1,expected_updated_at=self.item['updated_at'],data={'help_request_id':r['request_id'],'suggestion_index':0,'date':str(date.today())}))
        body=saved['entity']['document']['content']['journal'][0]['body'];self.assertGreater(len(body),8000);self.assertEqual(body.count(text),4)

    async def test_paged_source_picker_and_selected_last_record_are_complete(self):
        entries=[{'id':str(uuid.uuid4()),'date':str(date.today()),'kind':'note','title':str(i),'body':f'第{i}次实际笔记'} for i in range(100)]
        async with self.sessions() as s:
            doc=await s.get(PersonalDocument,uuid.UUID(self.item['document']['id']));doc.content={**doc.content,'journal':entries};await s.commit()
            _,first=await evidence_rows(s,self.uid,self.wid,self.iid,offset=0,limit=100)
            _,last=await evidence_rows(s,self.uid,self.wid,self.iid,offset=100,limit=100)
            self.assertEqual(len(first),100);self.assertEqual(len(last),3);self.assertEqual(len({r['key'] for r in first+last}),103)
            page1=await library(s,self.uid,self.wid,page=1);page2=await library(s,self.uid,self.wid,page=2);self.assertEqual(page1['total'],103);self.assertEqual(len(page2['items']),30);self.assertFalse({e['key'] for e in page1['items']} & {e['key'] for e in page2['items']})
            selected=await diagnosis_source(s,self.uid,self.wid,self.iid,['journal:'+entries[-1]['id']]);self.assertEqual(selected['evidence'][0]['text'],'第99次实际笔记')

    async def test_large_input_requires_selected_scope_and_unchosen_updates_do_not_leak(self):
        async with self.sessions() as s:
            doc=await s.get(PersonalDocument,uuid.UUID(self.item['document']['id']));doc.content={**doc.content,'content':'大'*25000};await s.commit()
            with self.assertRaises(AppException):await diagnosis_source(s,self.uid,self.wid,self.iid,['content','notes'])
            chosen=await diagnosis_source(s,self.uid,self.wid,self.iid,['notes']);self.assertEqual(len(chosen['evidence']),1);self.assertNotIn('大',chosen['evidence'][0]['text'])
