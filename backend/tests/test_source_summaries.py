"""Contract and isolated PostgreSQL checks. All model replies are local mocks."""
import asyncio
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import source_summaries as api
from app.api.personal_sources import SourceUpload, ingest
from app.core.exceptions import AppException
from app.engines.source_summary import validate_summary
from app.models.personal_source import PersonalSource, PersonalSourceVersion
from app.models.source_summary import SourceSummary
from app.models.user import User


def reply(quote='先回忆，再核对原文。'):
    return {'title':'复用检查单','points':[{'text':'先回忆，再核对原文。','kind':'observation',
        'evidence':[{'key':'S1','quote':quote}]}],'limitations':'仅依据所选片段，未评估长期掌握。'}


class SummaryContractTests(unittest.TestCase):
    def test_request_requires_strict_consent_unique_selection_and_checksum(self):
        s={'source_id':uuid.uuid4(),'version':1,'checksum':'a'*64,'chunk_id':'c1'}
        p={'request_id':uuid.uuid4(),'consent':True,'selections':[s]}
        api.Generate(**p)
        for consent in (False,1,'true'):
            with self.assertRaises(ValidationError):api.Generate(**{**p,'consent':consent})
        for selections in ([],[s,s],[{**s,'version':True}],[{**s,'checksum':'fake'}]):
            with self.assertRaises(ValidationError):api.Generate(**{**p,'selections':selections})

    def test_every_point_must_have_an_exact_selected_quote(self):
        source=[{'key':'S1','text':'😀先回忆，再核对原文。','start':20}]
        result=validate_summary(reply(),source)
        self.assertEqual(result['points'][0]['evidence'][0]['start'],21)
        self.assertEqual(result['points'][0]['evidence'][0]['end'],31)
        for raw in (reply('改写'),{**reply(),'points':[{**reply()['points'][0],'evidence':[]}]},reply(' '),reply('回忆，核对'),{**reply(),'summary':'无引用的结论'}):
            with self.assertRaises(ValueError):validate_summary(raw,source)
        raw=reply();raw['points'][0]['evidence'][0]['key']='S2'
        with self.assertRaises(ValueError):validate_summary(raw,source)

    def test_model_cannot_supply_false_positions_or_repeat_same_quote(self):
        source=[{'key':'S1','text':'先回忆，再核对原文。','start':0}]
        raw=reply();raw['points'][0]['evidence'][0]['start']=900
        with self.assertRaises(ValueError):validate_summary(raw,source)
        raw=reply();raw['points'][0]['evidence']*=2
        with self.assertRaises(ValueError):validate_summary(raw,source)

    def test_repeated_quote_has_a_deterministic_first_occurrence(self):
        source=[{'key':'S1','text':'原话 原话','start':5}]
        result=validate_summary(reply('原话'),source)
        self.assertEqual(result['points'][0]['evidence'][0]['start'],5)

    def test_saved_title_and_result_fields_cannot_be_blank_or_unbounded(self):
        with self.assertRaises(ValidationError):api.Save(title='  ')
        with self.assertRaises(ValidationError):api.Save(title='title',notes='x'*10001)
        for field in ('title','limitations'):
            with self.assertRaises(ValueError):validate_summary({**reply(),field:' '},[])


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'requires isolated PostgreSQL')
class SummaryIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        # Freeze legacy protocol tests; current production receipts are covered in test_learning_flow.
        from app.ai.prompt_loader import load_prompt
        from app.ai.prompt_router import PromptVariant
        legacy=patch('app.api.source_summaries.get_variant',AsyncMock(return_value=PromptVariant('source_summary','v1',load_prompt('source_summary','v1'))))
        legacy.start();self.addCleanup(legacy.stop)
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other=uuid.uuid4(),uuid.uuid4()
        async with self.sessions() as session:
            session.add_all([User(id=u,wx_openid=str(u),settings={}) for u in (self.uid,self.other)]);await session.commit()
            self.source=await ingest(session,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=uuid.uuid4(),base_version=0,
                title='虚构摘录',category='note',kind='text',filename='note.txt',text='😀先回忆，再核对原文。\n\n其他片段不发送。'))
        self.payload=api.Generate(request_id=uuid.uuid4(),consent=True,question='如何用于复盘',selections=[api.Selection(
            source_id=self.source['source_id'],version=1,checksum=self.source['checksum'],chunk_id='c1')])
        self.mock=AsyncMock(return_value=reply())
        self.provider=patch('app.api.source_summaries.llm_service.structured_output',self.mock);self.provider.start()

    async def asyncTearDown(self):
        self.provider.stop()
        async with self.sessions() as session:
            for model in (SourceSummary,PersonalSourceVersion,PersonalSource):await session.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await session.execute(delete(User).where(User.id.in_([self.uid,self.other])));await session.commit()
        await self.engine.dispose()

    async def generate(self,payload=None,uid=None):
        async with self.sessions() as session:return await api.generate_summary(session,uid or self.uid,payload or self.payload)

    async def read(self,uid=None):
        async with self.sessions() as session:return (await api.read(self.payload.request_id,str(uid or self.uid),session)).data

    async def save(self,title='复盘检查单',notes='本人补充'):
        async with self.sessions() as session:return (await api.save(self.payload.request_id,api.Save(title=title,notes=notes),str(self.uid),session)).data

    async def listing(self,q='',uid=None,page=1):
        async with self.sessions() as session:return (await api.listing(q,page,str(uid or self.uid),session)).data

    async def test_generate_freezes_only_selected_text_and_replay_does_not_call_model_again(self):
        row=await self.generate();self.assertEqual(row['status'],'completed');self.assertIsNone(row['saved'])
        self.assertEqual((await self.generate())['request_id'],row['request_id']);self.mock.assert_awaited_once()
        sent=self.mock.call_args.args[3]['source'];self.assertIn('先回忆',sent);self.assertNotIn('其他片段',sent)
        self.assertEqual((await self.listing())['total'],0)

    async def test_save_replay_search_original_and_personal_notes(self):
        await self.generate();row=await self.save();again=await self.save();self.assertEqual(row['saved_at'],again['saved_at'])
        for q in ('检查单','本人补充','先回忆','虚构摘录'):
            self.assertEqual((await self.listing(q))['total'],1,q)
        for q in ('不存在','%','_'):
            self.assertEqual((await self.listing(q))['total'],0,q)
        with self.assertRaises(AppException):await self.save(title='并发不同标题')

    async def test_no_cross_account_read_generate_save_or_search(self):
        await self.generate();await self.save()
        with self.assertRaises(AppException):await self.read(self.other)
        with self.assertRaises(AppException):await self.generate(uid=self.other)
        async with self.sessions() as session:
            with self.assertRaises(AppException):await api.save(self.payload.request_id,api.Save(title='x'),str(self.other),session)
        self.assertEqual((await self.listing(uid=self.other))['total'],0);self.mock.assert_awaited_once()

    async def test_new_original_version_preserves_saved_summary_and_frozen_old_citation(self):
        await self.generate();await self.save()
        async with self.sessions() as session:
            await ingest(session,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=self.source['source_id'],base_version=1,
                title='修改后的资料',category='note',kind='text',filename='note.txt',text='新版本不再包含旧句子。'))
        row=await self.read();self.assertEqual(row['source'][0]['version'],1);self.assertIsNotNone(row['result']);self.assertIsNotNone(row['saved'])

    async def test_bad_reference_is_failed_and_original_request_can_retry(self):
        self.mock.return_value=reply('不在原文');row=await self.generate();self.assertEqual(row['status'],'failed');self.assertIsNone(row['result'])
        with self.assertRaises(AppException):await self.save()
        self.mock.return_value=reply();row=await self.generate();self.assertEqual(row['status'],'completed');self.assertEqual(self.mock.await_count,2)

    async def test_changed_request_is_conflict(self):
        await self.generate()
        with self.assertRaises(AppException):await self.generate(self.payload.model_copy(update={'question':'不同问题'}))
        self.mock.assert_awaited_once()

    async def test_checksum_or_chunk_mismatch_and_link_pointer_never_reach_model(self):
        for s in (self.payload.selections[0].model_copy(update={'checksum':'b'*64}),self.payload.selections[0].model_copy(update={'chunk_id':'missing'})):
            with self.assertRaises(AppException):await self.generate(self.payload.model_copy(update={'selections':[s]}))
        async with self.sessions() as session:
            v=await ingest(session,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=uuid.uuid4(),base_version=0,title='只保存地址',category='link',kind='link',filename='link.txt',source_url='https://example.com'))
        s=api.Selection(source_id=v['source_id'],version=1,checksum=v['checksum'],chunk_id='c1')
        with self.assertRaises(AppException):await self.generate(self.payload.model_copy(update={'selections':[s]}))
        self.mock.assert_not_awaited()

    async def test_concurrent_replay_calls_model_once_and_processing_cannot_be_saved(self):
        entered,release=asyncio.Event(),asyncio.Event()
        async def response(*args):entered.set();await release.wait();return reply()
        self.mock.side_effect=response
        task=asyncio.create_task(self.generate())
        try:
            await asyncio.wait_for(entered.wait(),5);row=await self.generate();self.assertEqual(row['status'],'processing')
            with self.assertRaises(AppException):await self.save()
            with self.assertRaises(AppException):await self.generate(self.payload.model_copy(update={'request_id':uuid.uuid4()}))
        finally:release.set();await task
        self.mock.assert_awaited_once()

    async def test_expired_lease_can_resume_and_late_result_cannot_overwrite_new_attempt(self):
        entered,release=asyncio.Event(),asyncio.Event();calls=0
        async def response(*args):
            nonlocal calls
            calls+=1
            if calls==1:entered.set();await release.wait();return reply('错的迟到引用')
            return reply()
        self.mock.side_effect=response;task=asyncio.create_task(self.generate())
        try:
            await asyncio.wait_for(entered.wait(),5)
            async with self.sessions() as session:
                row=await api.owned(session,self.uid,self.payload.request_id);row.lease_until=datetime.now(UTC)-timedelta(seconds=1);await session.commit()
            self.assertEqual((await self.read())['status'],'failed');self.assertEqual((await self.generate())['status'],'completed')
        finally:release.set();await task
        self.assertEqual((await self.read())['status'],'completed')

    async def test_changed_frozen_extraction_hides_result_and_blocks_save(self):
        await self.generate();await self.save()
        async with self.sessions() as session:
            from app.api.personal_sources import owned_version
            row=await owned_version(session,self.uid,uuid.UUID(self.source['source_id']),1)
            row.extraction={**row.extraction,'chunks':[{**row.extraction['chunks'][0],'text':'改写'}]};await session.commit()
        row=await self.read();self.assertIsNone(row['result']);self.assertEqual(row['source'],[]);self.assertIsNone(row['saved'])
        with self.assertRaises(AppException):await self.save()
