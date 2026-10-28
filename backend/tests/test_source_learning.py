import asyncio
import os
import unittest
import uuid
from datetime import date,timedelta
from sqlalchemy import select,delete,func
from sqlalchemy.ext.asyncio import create_async_engine,async_sessionmaker
from app.api.personal_sources import SourceUpload,ingest
from app.api.source_learning import SourceLearningCreate,create_from_source
from app.api.learning_review import Answer,Finish,save_answer,finish_attempt,unit_payload
from app.models.user import User
from app.models.workspace import Workspace,WorkspaceEvent
from app.models.personal_source import PersonalSource,PersonalSourceVersion
from app.models.workspace_learning_item import WorkspaceLearningItem
from app.models.learning_review import LearningReviewUnit,LearningReviewAttempt
from app.models.personal_work import PersonalCommandReceipt
from app.core.exceptions import AppException

@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'isolated PostgreSQL required')
class SourceLearningIntegration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other,self.wid,self.sid=[uuid.uuid4() for _ in range(4)]
        async with self.sessions() as s:
            s.add_all([User(id=u,wx_openid=str(u),settings={}) for u in (self.uid,self.other)]);await s.flush()
            s.add(Workspace(id=self.wid,user_id=self.uid,name='资料转学习验收'));await s.commit()
            self.version=await ingest(s,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=self.sid,base_version=0,title='版本一',category='note',kind='text',filename='原文.txt',text='同一提交标识与同一内容返回已有回执。😀原文保留。'))
        self.payload=SourceLearningCreate(request_id=uuid.uuid4(),workspace_id=self.wid,source_id=self.sid,version=1,checksum=self.version['checksum'],chunk_id=self.version['extraction']['chunks'][0]['id'],title='应用回执',question='如何避免重复提交？',application_goal='为自己的提交操作设计可靠重试')
    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (LearningReviewAttempt,LearningReviewUnit,PersonalCommandReceipt,WorkspaceEvent,WorkspaceLearningItem,Workspace,PersonalSourceVersion,PersonalSource):
                await s.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()
    async def call(self,payload=None,uid=None):
        async with self.sessions() as s:return await create_from_source(s,uid or self.uid,payload or self.payload)
    async def test_atomic_concurrent_replay_keeps_one_learning_and_original_reference(self):
        results=await asyncio.gather(*(self.call() for _ in range(6)))
        self.assertTrue(all(r==results[0] for r in results))
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(WorkspaceLearningItem).where(WorkspaceLearningItem.user_id==self.uid)),1)
            unit=await s.get(LearningReviewUnit,uuid.UUID(results[0]['data']['unit_id']))
            self.assertEqual(unit.source['revision_id'],self.version['id'])
            self.assertNotIn('quote',unit_payload(unit)['source'])
            from app.engines.execution_engine import _prepare_learning
            from datetime import UTC,datetime
            workspace=await s.get(Workspace,self.wid)
            item=await s.get(WorkspaceLearningItem,unit.item_id)
            state,detail=await _prepare_learning(s,workspace,item,datetime.now(UTC))
            self.assertEqual(state,'waiting');self.assertEqual(detail['unit_id'],str(unit.id))
            self.assertEqual(await s.scalar(select(func.count()).select_from(WorkspaceEvent).where(WorkspaceEvent.user_id==self.uid,WorkspaceEvent.event_type=='learning_item_created')),1)
        with self.assertRaises(AppException):await self.call(self.payload.model_copy(update={'title':'换内容'}))
    async def test_old_source_version_survives_revision_and_complete_existing_learning_flow(self):
        first=await self.call();iid=uuid.UUID(first['data']['item_id']);unit_id=uuid.UUID(first['data']['unit_id'])
        async with self.sessions() as s:
            await ingest(s,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=self.sid,base_version=1,title='版本二',category='note',kind='text',filename='原文.txt',text='新的正文不能覆盖旧依据。'))
            answer=await save_answer(s,self.uid,self.wid,iid,unit_id,Answer(request_id=uuid.uuid4(),answer='按同一标识重试并返回已有回执',assistance='independent'));await s.commit()
            finished=await finish_attempt(s,self.uid,self.wid,iid,unit_id,uuid.UUID(answer['id']),Finish(request_id=uuid.uuid4(),rating='good',next_action='再次验证重试',schedule_mode='manual',next_review_date=date.today()+timedelta(days=1),practice_result='完成一次相同请求重试，只有一个对象',practice_criterion='对象数量和创建事件都为一',practice_checked=True));await s.commit()
            self.assertEqual(finished['snapshot']['source']['version'],1)
            self.assertIn('同一提交标识',finished['snapshot']['source']['quote'])
            self.assertEqual(finished['status'],'completed')
        self.assertEqual(await self.call(),first)
    async def test_other_account_bad_checksum_missing_chunk_and_archived_workspace_rejected(self):
        for payload,uid in [(self.payload,self.other),(self.payload.model_copy(update={'checksum':'0'*64}),self.uid),(self.payload.model_copy(update={'chunk_id':'missing'}),self.uid)]:
            with self.assertRaises(AppException):await self.call(payload,uid)
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(WorkspaceLearningItem).where(WorkspaceLearningItem.user_id==self.uid)),0)
            from datetime import UTC,datetime
            w=await s.get(Workspace,self.wid);w.archived_at=datetime.now(UTC);await s.commit()
        with self.assertRaises(AppException):await self.call()
