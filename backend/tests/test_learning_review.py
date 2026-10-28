"""D6 truthful answers, immutable provenance, scoped access and atomic replay."""
import asyncio,os,unittest,uuid
from datetime import UTC,date,datetime,timedelta
from pydantic import ValidationError
from sqlalchemy import select,delete,func
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.api.learning_review import CreateUnit,Answer,Finish,create_unit,save_answer,finish_attempt,inbox,history
from app.api.learning_materials import MaterialUpload,ingest
from app.api.personal_work import Command,apply_command,day_evidence
from app.core.exceptions import AppException
from app.models.learning_review import LearningReviewUnit,LearningReviewAttempt
from app.models.learning_material import LearningMaterial
from app.models.personal_work import PersonalDocument,DocumentRevision,PersonalCommandReceipt
from app.models.workspace import Workspace,WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.workspace_reflection import WorkspaceReflection
from app.models.user import User
from zoneinfo import ZoneInfo
TEXT='原文📚：先凭记忆回答，再核对材料。\n\n卡点需要本人记录，不用分钟推断掌握。'

class Contract(unittest.TestCase):
    def test_blank_answer_requires_explicit_cannot_recall_and_fields_are_strict(self):
        for change in ({},{'answer':' '},{'answer':'我记得','did_not_recall':True},{'answer':'x','elapsed_seconds':10}):
            with self.assertRaises(ValidationError):Answer(request_id=uuid.uuid4(),**change)
        self.assertTrue(Answer(request_id=uuid.uuid4(),did_not_recall=True).did_not_recall)
        for change in ({'rating':'mastered','next_action':'练习'},{'rating':'good','next_action':' '}):
            with self.assertRaises(ValidationError):Finish(request_id=uuid.uuid4(),**change)
    def test_ambiguous_or_unbounded_source_is_rejected(self):
        base={'request_id':uuid.uuid4(),'question':'问题','source':{'kind':'document','revision_id':uuid.uuid4(),'field':'notes','start':0,'end':10}}
        for source in ({'kind':'document','start':0,'end':10},{**base['source'],'end':13000},{**base['source'],'material_id':uuid.uuid4()}):
            with self.assertRaises(ValidationError):CreateUnit.model_validate({**base,'source':source})
        with self.assertRaises(ValidationError):CreateUnit.model_validate({**base,'question':' '})

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other,self.wid,self.wid2,self.iid=[uuid.uuid4() for _ in range(5)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={'daily_preferences':{'timezone':'Asia/Shanghai'}}),User(id=self.other,wx_openid=str(self.other),settings={})]);await s.flush()
            s.add_all([Workspace(id=self.wid,user_id=self.uid,name='D6 fictional'),Workspace(id=self.wid2,user_id=self.uid,name='other')]);await s.flush()
            self.item=(await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action='create_learning',data={'title':'D6 review','notes':TEXT,'stage':'queued'})))['entity'];await s.commit()
            self.revision=await s.scalar(select(DocumentRevision).where(DocumentRevision.document_id==uuid.UUID(self.item['document']['id'])))
    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (LearningReviewAttempt,LearningReviewUnit,LearningMaterial):await s.execute(delete(model).where(model.user_id==self.uid))
            docs=select(PersonalDocument.id).where(PersonalDocument.user_id==self.uid)
            await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(docs)))
            for model in (PersonalCommandReceipt,PersonalDocument,WorkspaceEvent,WorkspaceReflection,WorkspaceLearningItem,Workspace):await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()
    def unit_request(self,**changes):
        return CreateUnit.model_validate({'request_id':uuid.uuid4(),'question':'学习后应该先做什么？','source':{'kind':'document','revision_id':self.revision.id,'field':'notes','start':0,'end':len(TEXT)},**changes})
    async def call(self,fn,*args):
        async with self.sessions() as s:result=await fn(s,self.uid,self.wid,self.iid,*args);await s.commit();return result
    async def make(self):return await self.call(create_unit,self.unit_request())
    async def answer(self,u,**changes):return await self.call(save_answer,uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),answer='先回忆再看原文',**changes))
    def finish_request(self,**changes):return Finish.model_validate({'request_id':uuid.uuid4(),'rating':'good','understanding':'先独立回忆','difficulty':'会先看答案','next_action':'明天练习一次','next_review_date':date.today()+timedelta(days=2),**changes})
    async def test_concurrent_create_replay_preserves_one_unit_and_hides_quote_before_answer(self):
        request=self.unit_request();a,b=await asyncio.gather(self.call(create_unit,request),self.call(create_unit,request));self.assertEqual(a['id'],b['id']);self.assertNotIn('quote',a['source'])
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningReviewUnit).where(LearningReviewUnit.user_id==self.uid)),1)
            self.assertEqual((await s.get(PersonalDocument,uuid.UUID(self.item['document']['id']))).version,1)
            data=(await inbox(self.wid,str(self.uid),s)).data;self.assertNotIn('quote',data[0]['source'])
        with self.assertRaises(AppException):await self.call(create_unit,request.model_copy(update={'question':'改写'}))
    async def test_real_answer_and_reflection_replay_are_atomic_and_old_source_is_immutable(self):
        u=await self.make();rid=uuid.uuid4();request=Answer(request_id=rid,answer='真实本人答案')
        a,b=await asyncio.gather(self.call(save_answer,uuid.UUID(u['id']),request),self.call(save_answer,uuid.UUID(u['id']),request));self.assertEqual(a['id'],b['id']);self.assertEqual(a['snapshot']['source']['quote'],TEXT)
        async with self.sessions() as s:
            await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action='save_learning',base_version=1,expected_updated_at=self.item['updated_at'],data={'title':'新标题','notes':'已改成新内容','stage':'queued'}));await s.commit()
        finish=self.finish_request();args=uuid.UUID(u['id']),uuid.UUID(a['id']),finish
        done,replay=await asyncio.gather(self.call(finish_attempt,*args),self.call(finish_attempt,*args));self.assertEqual(done,replay);self.assertEqual(done['answer'],'真实本人答案');self.assertEqual(done['snapshot']['source']['quote'],TEXT)
        with self.assertRaises(AppException):await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request(rating='easy'))
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningReviewAttempt).where(LearningReviewAttempt.user_id==self.uid)),1)
            events=(await s.scalars(select(WorkspaceEvent).where(WorkspaceEvent.user_id==self.uid,WorkspaceEvent.event_type=='learning_review_completed'))).all();self.assertEqual(len(events),1)
            listing=(await inbox(self.wid,str(self.uid),s)).data;self.assertEqual(listing[0]['completed_count'],1);self.assertEqual(listing[0]['last_rating'],'good')
    async def test_raw_material_chunk_is_frozen_and_foreign_or_wrong_chunks_fail(self):
        async with self.sessions() as s:m=await ingest(s,self.uid,self.wid,self.iid,MaterialUpload(request_id=uuid.uuid4(),title='来源',kind='text',text=TEXT))
        source={'kind':'material','material_id':m['id'],'checksum':m['checksum'],'chunk_id':'c2'}
        u=await self.call(create_unit,self.unit_request(source=source));a=await self.answer(u)
        self.assertEqual(a['snapshot']['source']['quote'],TEXT.split('\n\n')[1]);self.assertEqual(a['snapshot']['source']['checksum'],m['checksum'])
        for changes in ({'chunk_id':'nonexistent'},{'checksum':'0'*64},{'material_id':str(uuid.uuid4())}):
            with self.assertRaises(AppException):await self.call(create_unit,self.unit_request(source={**source,**changes}))
    async def test_source_revision_is_owned_and_offsets_are_valid(self):
        for changes in ({'revision_id':str(uuid.uuid4())},{'end':len(TEXT)+1},{'start':len(TEXT),'end':len(TEXT)+1}):
            request=self.unit_request();request=CreateUnit.model_validate({**request.model_dump(mode='json'),'source':{**request.source.model_dump(mode='json',exclude_none=True),**changes}})
            with self.assertRaises(AppException):await self.call(create_unit,request)
        async with self.sessions() as s:
            other=uuid.uuid4();res=await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=other,action='create_learning',data={'title':'other','notes':TEXT}));await s.commit();rev=await s.scalar(select(DocumentRevision).where(DocumentRevision.document_id==uuid.UUID(res['entity']['document']['id'])))
        source=self.unit_request().source.model_dump(mode='json',exclude_none=True);source['revision_id']=str(rev.id)
        with self.assertRaises(AppException):await self.call(create_unit,self.unit_request(source=source))
    async def test_cannot_recall_does_not_fabricate_answer_and_invalid_finish_does_not_mutate(self):
        u=await self.make();a=await self.call(save_answer,uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),did_not_recall=True));self.assertEqual(a['answer'],'')
        for changes in ({'rating':'easy'},{'rating':'again','next_review_date':date.today()-timedelta(days=2)}):
            with self.assertRaises(AppException):await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request(**changes))
        async with self.sessions() as s:self.assertEqual((await s.get(LearningReviewAttempt,uuid.UUID(a['id']))).status,'answered')
        done=await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request(rating='again'));self.assertEqual(done['rating'],'again')
    async def test_owner_workspace_item_and_archive_guards(self):
        u=await self.make();a=await self.answer(u)
        for uid,wid,iid in ((self.other,self.wid,self.iid),(self.uid,self.wid2,self.iid),(self.uid,self.wid,uuid.uuid4())):
            for fn,args in ((create_unit,(self.unit_request(),)),(save_answer,(uuid.UUID(u['id']),Answer(request_id=uuid.uuid4(),answer='x'))),(finish_attempt,(uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request()))):
                async with self.sessions() as s:
                    with self.assertRaises(AppException):await fn(s,uid,wid,iid,*args)
            async with self.sessions() as s:
                with self.assertRaises(AppException):await history(wid,iid,uuid.UUID(u['id']),str(uid),s)
        async with self.sessions() as s:(await s.get(WorkspaceLearningItem,self.iid)).archived_at=datetime.now(UTC);await s.commit()
        async with self.sessions() as s:
            self.assertEqual((await inbox(self.wid,str(self.uid),s)).data,[])
            with self.assertRaises(AppException):await history(self.wid,self.iid,uuid.UUID(u['id']),str(self.uid),s)
    async def test_daily_review_includes_only_completed_attempts_and_retains_saved_reference(self):
        u=await self.make();a=await self.answer(u);day=datetime.now(ZoneInfo('Asia/Shanghai')).date()
        async with self.sessions() as s:self.assertFalse(any(e['kind']=='learning_review' for e in await day_evidence(s,self.uid,self.wid,day,ZoneInfo('Asia/Shanghai'))))
        await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),self.finish_request())
        async with self.sessions() as s:
            evidence=await day_evidence(s,self.uid,self.wid,day,ZoneInfo('Asia/Shanghai'));entries=[e for e in evidence if e['kind']=='learning_review'];self.assertEqual(len(entries),1);self.assertEqual(entries[0]['attempt_id'],a['id']);self.assertIn('明天练习一次',entries[0]['excerpt'])
            review=await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=uuid.uuid5(self.wid,f'review:{day}'),action='save_review',data={'date':str(day),'next':'继续回忆'}));await s.commit()
            frozen=review['entity']['document']['content']['evidence'];self.assertEqual([e for e in frozen if e['kind']=='learning_review'],entries)
    async def test_new_attempt_is_independent_and_lost_finish_receipt_never_duplicates(self):
        u=await self.make();a=await self.answer(u);f=self.finish_request();done=await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),f)
        b=await self.answer(u);self.assertNotEqual(a['id'],b['id'])
        replay=await self.call(finish_attempt,uuid.UUID(u['id']),uuid.UUID(a['id']),f);self.assertEqual(done,replay)
        async with self.sessions() as s:rows=(await history(self.wid,self.iid,uuid.UUID(u['id']),str(self.uid),s)).data;self.assertEqual(len(rows),2);self.assertEqual(sum(r['status']=='completed' for r in rows),1)
