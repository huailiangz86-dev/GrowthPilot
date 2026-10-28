"""Pipeline recovery, durable markers, owner isolation and cloud-contract tests; no network."""
import asyncio
import hashlib
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api import source_pipeline as api
from app.api.personal_sources import SourceUpload, ingest
from app.core.config import settings
from app.core.exceptions import AppException
from app.engines.bailian_knowledge import KnowledgeConfig
from app.engines.source_pipeline import CloudPipeline, exact_matches, job_state, lease_parameters, upload_content, verify_file
from app.models.personal_source import PersonalSource, PersonalSourceVersion
from app.models.source_pipeline import SourcePipeline
from app.models.user import User
from tests.test_bailian_knowledge import NODE, response

CONFIG=KnowledgeConfig('id','secret','test-space','read-only-index')


class PipelineContractTests(unittest.TestCase):
    def test_original_bytes_and_extracted_unicode_are_distinct(self):
        source=SimpleNamespace(status='ready',kind='pdf',original=b'%PDF original',extraction={'text':'正文😀'})
        self.assertEqual(upload_content(source,'original'),(b'%PDF original','pdf'))
        self.assertEqual(upload_content(source,'extracted'),('正文😀'.encode(),'txt'))
        for kind in ('eml','web','link'):
            source.kind=kind
            with self.assertRaises(AppException):upload_content(source,'original')
        source.kind='link'
        with self.assertRaises(AppException):upload_content(source,'extracted')
        source.kind='txt';source.status='failed'
        with self.assertRaises(AppException):upload_content(source,'original')

    def test_leases_only_send_to_official_https_oss_without_redirects(self):
        base={'FileUploadLeaseId':'lease.123','Param':{'Url':'https://bucket.oss-cn-beijing.aliyuncs.com/path?secret=signed','Method':'PUT','Headers':{'Content-Type':'','X-bailian-extra':'value'}}}
        self.assertEqual(lease_parameters(base)[3],'lease.123')
        for url in ('http://bucket.oss-cn-beijing.aliyuncs.com','https://127.0.0.1','https://evil.aliyuncs.com','https://bucket.oss-cn-beijing.aliyuncs.com.evil.com','https://user:pass@bucket.oss-cn-beijing.aliyuncs.com','https://bucket.oss-cn-beijing.aliyuncs.com:8443'):
            with self.assertRaises(AppException):lease_parameters({**base,'Param':{**base['Param'],'Url':url}})
        for headers in ({'Authorization':'secret'},{'Content-Type':'x\r\ny'},'bad'):
            with self.assertRaises(AppException):lease_parameters({**base,'Param':{**base['Param'],'Headers':headers}})

    def test_exact_match_unicode_duplicates_and_pages_not_inferred(self):
        extraction={'text':'😀原话\n😀原话','chunks':[{'start':0,'end':3,'page':1},{'start':4,'end':7,'page':2}]}
        self.assertEqual(exact_matches('😀原话',extraction),[{'start':0,'end':3,'page':1},{'start':4,'end':7,'page':2}])
        self.assertEqual(exact_matches('原话改写',extraction),[])
        self.assertEqual(exact_matches('原话\n😀',extraction)[0]['page'],None)

    def test_reconciliation_requires_matching_remote_identity_and_job_document(self):
        row=SimpleNamespace(id=uuid.uuid4(),filename='f.txt',category_id='category',byte_count=9,file_id='file')
        data={'FileId':'file','FileName':'f.txt','CategoryId':'category','SizeInBytes':9,'Tags':[row.id.hex]}
        verify_file(row,data,'file')
        for key in data:
            with self.assertRaises(AppException):verify_file(row,{**data,key:None},'file')
        job={'JobId':'job','Status':'COMPLETED','Documents':[{'DocId':'file','Status':'FINISH'}]}
        self.assertEqual(job_state(row,job,'job'),'ready')
        self.assertEqual(job_state(row,{**job,'Status':'RUNNING'},'job'),'indexing')
        self.assertEqual(job_state(row,{**job,'Documents':[{'DocId':'file','Status':'INSERT_ERROR'}]},'job'),'failed')
        with self.assertRaises(AppException):job_state(row,{**job,'Documents':[{'DocId':'other','Status':'FINISH'}]},'job')

    def test_expired_write_markers_are_uncertain_and_hide_private_lease(self):
        row=SimpleNamespace(id=uuid.uuid4(),source_checksum='a',payload_checksum='b',byte_count=1,filename='f.txt',endpoint=None,workspace_id=None,index_id=None,category_id=None,state='registering',file_id=None,job_id=None,error=None,receipts=[],updated_at=datetime.now(UTC),lease_until=datetime.now(UTC)-timedelta(seconds=1),lease_id='private-lease',mode='original')
        result=api.row_data(row,SimpleNamespace(source_id=uuid.uuid4(),version=1,title='title'))
        self.assertEqual(result['state'],'uncertain');self.assertNotIn('lease_id',result)

    def test_consent_is_an_explicit_boolean(self):
        for value in ('yes','true',1):
            with self.assertRaises(ValidationError):api.Consent(consent=value)
        self.assertFalse(api.Consent().consent)


class PipelineAdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_upload_preserves_exact_binary_and_uses_lease_method_headers_and_md5(self):
        lease={'FileUploadLeaseId':'lease.1','Param':{'Url':'https://bucket.oss-cn-beijing.aliyuncs.com/file?signature=secret','Method':'PUT','Headers':{'Content-Type':'','X-bailian-extra':'opaque'}}}
        method=AsyncMock(return_value=response(lease));http=SimpleNamespace(request=AsyncMock(return_value=SimpleNamespace(status_code=200)))
        context=AsyncMock();context.__aenter__.return_value=http
        raw=b'%PDF\x00\xff exact bytes';row=SimpleNamespace(category_id='default',workspace_id='test-space',filename='test.pdf')
        with patch('app.engines.source_pipeline.httpx.AsyncClient',return_value=context) as constructor:
            result=await CloudPipeline(CONFIG,SimpleNamespace(apply_file_upload_lease_with_options_async=method)).upload(row,raw)
        self.assertEqual(result['lease_id'],'lease.1');self.assertEqual(http.request.call_args.kwargs['content'],raw);self.assertEqual(http.request.call_args.args[0],'PUT');self.assertFalse(constructor.call_args.kwargs['follow_redirects']);self.assertFalse(constructor.call_args.kwargs['trust_env'])
        request=method.call_args.args[2];self.assertEqual(request.md_5,hashlib.md5(raw).hexdigest());self.assertEqual(request.size_in_bytes,str(len(raw)))

    async def test_no_sdk_auto_retry_and_registration_tags_and_exact_index_scope(self):
        client=SimpleNamespace(add_file_with_options_async=AsyncMock(return_value=response({'FileId':'file'})),submit_index_add_documents_job_with_options_async=AsyncMock(return_value=response({'Id':'job'})))
        row=SimpleNamespace(id=uuid.uuid4(),workspace_id='test-space',category_id='default',lease_id='lease',index_id='personal',file_id='file')
        adapter=CloudPipeline(CONFIG,client)
        self.assertEqual((await adapter.register(row))['file_id'],'file')
        request=client.add_file_with_options_async.call_args.args[1];self.assertEqual(request.tags,[row.id.hex]);self.assertEqual(request.parser,'AUTO_SELECT');self.assertFalse(client.add_file_with_options_async.call_args.args[-1].autoretry)
        self.assertEqual((await adapter.submit(row))['job_id'],'job');request=client.submit_index_add_documents_job_with_options_async.call_args.args[1];self.assertEqual(request.document_ids,['file']);self.assertEqual(request.index_id,'personal');self.assertEqual(request.source_type,'DATA_CENTER_FILE')

    async def test_transport_errors_and_missing_success_ids_do_not_leak_credentials(self):
        method=AsyncMock(side_effect=RuntimeError('secret signed-url'))
        with self.assertRaises(AppException) as error:await CloudPipeline(CONFIG,SimpleNamespace(add_file_with_options_async=method)).register(SimpleNamespace(workspace_id='test-space',category_id='default',lease_id='lease',id=uuid.uuid4()))
        self.assertNotIn('secret',error.exception.message)
        method=AsyncMock(return_value=response({}))
        with self.assertRaises(AppException):await CloudPipeline(CONFIG,SimpleNamespace(add_file_with_options_async=method)).register(SimpleNamespace(workspace_id='test-space',category_id='default',lease_id='lease',id=uuid.uuid4()))


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'),'requires isolated PostgreSQL')
class PipelineIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url=os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/',1)[-1].endswith('_test')
        self.engine=create_async_engine(url);self.sessions=async_sessionmaker(self.engine,expire_on_commit=False)
        self.uid,self.other=uuid.uuid4(),uuid.uuid4()
        async with self.sessions() as s:
            s.add_all([User(id=u,wx_openid=str(u),settings={}) for u in (self.uid,self.other)]);await s.commit()
            self.source=await ingest(s,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=uuid.uuid4(),base_version=0,title='D14 虚构笔记',category='note',kind='text',filename='note.txt',text='😀先回忆，再核对原文。'))
        self.config=patch('app.api.source_pipeline.KnowledgeConfig.load',return_value=CONFIG);self.config.start()
        self.flags=patch.multiple(settings,BAILIAN_OWNER_USER_ID=str(self.uid),BAILIAN_PERSONAL_IMPORT_ENABLED=True);self.flags.start()
        self.adapter=SimpleNamespace(upload=AsyncMock(return_value={'lease_id':'lease','request_id':'upload-req'}),register=AsyncMock(return_value={'file_id':'file-test','request_id':'file-req'}),submit=AsyncMock(return_value={'job_id':'job-test','request_id':'job-req'}),describe=AsyncMock(),job=AsyncMock(),chunks=AsyncMock(),retrieve=AsyncMock())
        self.cloud=patch('app.api.source_pipeline.CloudPipeline',return_value=self.adapter);self.cloud.start()

    async def asyncTearDown(self):
        self.cloud.stop();self.flags.stop();self.config.stop()
        async with self.sessions() as s:
            for model in (SourcePipeline,PersonalSourceVersion,PersonalSource):await s.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    async def prepared(self,mode='original'):
        p=api.Prepare(request_id=uuid.uuid4(),source_id=self.source['source_id'],version=1,mode=mode)
        async with self.sessions() as s:return p,(await api.prepare(p,str(self.uid),s)).data

    async def bind(self,row,index='personal-index'):
        async with self.sessions() as s:return (await api.destination(uuid.UUID(row['id']),api.Destination(index_id=index,category_id='default'),str(self.uid),s)).data

    async def advance(self,row,consent=True):
        async with self.sessions() as s:return (await api.advance(uuid.UUID(row['id']),api.Consent(consent=consent),str(self.uid),s)).data

    def file_data(self,row,status='PARSE_SUCCESS'):
        return {'FileId':'file-test','FileName':row['filename'],'CategoryId':'default','SizeInBytes':row['bytes'],'Tags':[uuid.UUID(row['id']).hex],'Status':status}

    async def indexed(self):
        _,row=await self.prepared();row=await self.bind(row);row=await self.advance(row);self.assertEqual(row['state'],'uploaded');row=await self.advance(row)
        self.adapter.describe.return_value=(self.file_data(row),'parse-req');row=await self.advance(row);self.assertEqual(row['state'],'parsed');row=await self.advance(row)
        self.adapter.job.return_value=({'JobId':'job-test','Status':'COMPLETED','Documents':[{'DocId':'file-test','Status':'FINISH'}]},'check-req');return await self.advance(row)

    async def test_local_prepare_replay_fingerprints_no_credentials_and_no_cloud(self):
        p,row=await self.prepared();self.assertIsNone(row['index_id']);self.assertEqual(row['state'],'prepared');self.assertEqual(row['payload_checksum'],hashlib.sha256('😀先回忆，再核对原文。'.encode()).hexdigest())
        with patch('app.api.source_pipeline.KnowledgeConfig.load',side_effect=AssertionError('must not read credentials')):
            async with self.sessions() as s:self.assertEqual((await api.prepare(p,str(self.uid),s)).data['id'],row['id'])
        self.adapter.upload.assert_not_awaited()
        async with self.sessions() as s:
            with self.assertRaises(AppException):await api.prepare(api.Prepare(**{**p.model_dump(),'mode':'extracted'}),str(self.uid),s)

    async def test_owner_isolation_scope_and_consent_block_before_cloud(self):
        _,row=await self.prepared()
        async with self.sessions() as s:
            with self.assertRaises(AppException):await api.detail(uuid.UUID(row['id']),str(self.other),s)
        with self.assertRaises(AppException):await self.bind(row,'read-only-index')
        row=await self.bind(row)
        with self.assertRaises(AppException):await self.advance(row,False)
        with patch.object(settings,'BAILIAN_PERSONAL_IMPORT_ENABLED',False):
            with self.assertRaises(AppException):await self.advance(row)
        self.adapter.upload.assert_not_awaited()
        with self.assertRaises(AppException):await self.bind(row,'changed-index')

    async def test_full_flow_replay_is_not_second_upload_or_index_submission(self):
        row=await self.indexed();self.assertEqual(row['state'],'ready');again=await self.advance(row);self.assertEqual(again,row)
        self.adapter.upload.assert_awaited_once();self.adapter.register.assert_awaited_once();self.adapter.submit.assert_awaited_once()
        async with self.sessions() as s:
            saved=await api.owned(s,self.uid,uuid.UUID(row['id']));self.assertIsNone(saved.operation_id);self.assertEqual(len(saved.receipts),5)

    async def test_concurrent_claims_call_upload_only_once(self):
        _,row=await self.prepared();row=await self.bind(row);entered,release=asyncio.Event(),asyncio.Event()
        async def upload(*args):entered.set();await release.wait();return {'lease_id':'lease','request_id':'req'}
        self.adapter.upload.side_effect=upload;task=asyncio.create_task(self.advance(row));await entered.wait()
        concurrent=await self.advance(row);self.assertEqual(concurrent['state'],'uploading');release.set();finished=await task;self.assertEqual(finished['state'],'uploaded');self.adapter.upload.assert_awaited_once()

    async def test_upload_failure_can_retry_without_registering_or_losing_source(self):
        _,row=await self.prepared();row=await self.bind(row);self.adapter.upload.side_effect=AppException('UPLOAD','上传失败',502);row=await self.advance(row);self.assertEqual(row['state'],'prepared');self.assertEqual(row['error'],'上传失败')
        self.adapter.upload.side_effect=None;row=await self.advance(row);self.assertEqual(row['state'],'uploaded');self.adapter.register.assert_not_awaited()

    async def test_explicit_provider_rejection_can_retry_without_reupload(self):
        _,row=await self.prepared();row=await self.bind(row);row=await self.advance(row)
        self.adapter.register.side_effect=AppException('BAILIAN_REMOTE','明确拒绝',502);row=await self.advance(row);self.assertEqual(row['state'],'uploaded')
        self.adapter.register.side_effect=None;row=await self.advance(row);self.assertEqual(row['state'],'parsing');self.adapter.upload.assert_awaited_once()

    async def test_expired_upload_replacement_requires_definitive_registration_rejection(self):
        _,row=await self.prepared();row=await self.bind(row);row=await self.advance(row)
        self.adapter.register.side_effect=AppException('BAILIAN_REMOTE','租约已过期',502);row=await self.advance(row)
        async with self.sessions() as s:row=(await api.reset_upload(uuid.UUID(row['id']),str(self.uid),s)).data
        self.assertEqual(row['state'],'prepared');row=await self.advance(row);self.assertEqual(self.adapter.upload.await_count,2)
        self.adapter.register.side_effect=AppException('BAILIAN_TRANSPORT','回执丢失',502);row=await self.advance(row)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await api.reset_upload(uuid.UUID(row['id']),str(self.uid),s)

    async def test_lost_registration_reply_requires_verified_reconciliation(self):
        _,row=await self.prepared();row=await self.bind(row);row=await self.advance(row);self.adapter.register.side_effect=AppException('TRANSPORT','回执丢失',502);row=await self.advance(row);self.assertEqual(row['state'],'uncertain');await self.advance(row);self.adapter.register.assert_awaited_once()
        self.adapter.describe.return_value=(self.file_data(row),'reconcile-req')
        async with self.sessions() as s:row=(await api.reconcile(uuid.UUID(row['id']),api.Reconcile(file_id='file-test'),str(self.uid),s)).data
        self.assertEqual(row['state'],'parsing');self.assertEqual(row['file_id'],'file-test')

    async def test_lost_index_reply_never_resubmits_and_wrong_job_is_rejected(self):
        row=await self.indexed()
        async with self.sessions() as s:
            saved=await api.owned(s,self.uid,uuid.UUID(row['id']));saved.job_id=None;saved.state='parsed';await s.commit()
        self.adapter.submit.side_effect=AppException('TRANSPORT','索引回执丢失',502);row=await self.advance(row);self.assertEqual(row['state'],'uncertain');await self.advance(row);self.assertEqual(self.adapter.submit.await_count,2)
        self.adapter.job.return_value=({'JobId':'wrong','Status':'COMPLETED','Documents':[{'DocId':'other','Status':'FINISH'}]},'req')
        async with self.sessions() as s:
            with self.assertRaises(AppException):await api.reconcile(uuid.UUID(row['id']),api.Reconcile(job_id='wrong'),str(self.uid),s)
        self.adapter.job.return_value=({'JobId':'recovered','Status':'COMPLETED','Documents':[{'DocId':'file-test','Status':'FINISH'}]},'req')
        async with self.sessions() as s:self.assertEqual((await api.reconcile(uuid.UUID(row['id']),api.Reconcile(job_id='recovered'),str(self.uid),s)).data['state'],'ready')

    async def test_stale_registration_and_late_upload_attempts_do_not_repeat_writes(self):
        _,row=await self.prepared();row=await self.bind(row)
        async with self.sessions() as s:
            saved=await api.owned(s,self.uid,uuid.UUID(row['id']));saved.state='registering';saved.operation_id=uuid.uuid4();saved.lease_until=datetime.now(UTC)-timedelta(seconds=1);await s.commit()
        self.assertEqual((await self.advance(row))['state'],'uncertain');self.adapter.register.assert_not_awaited();self.adapter.upload.assert_not_awaited()

    async def test_late_upload_cannot_overwrite_new_attempt_lease(self):
        _,row=await self.prepared();row=await self.bind(row);entered,release=asyncio.Event(),asyncio.Event();calls=0
        async def upload(*args):
            nonlocal calls
            calls+=1
            if calls==1:entered.set();await release.wait();return {'lease_id':'old-lease','request_id':'old-req'}
            return {'lease_id':'new-lease','request_id':'new-req'}
        self.adapter.upload.side_effect=upload;task=asyncio.create_task(self.advance(row));await entered.wait()
        async with self.sessions() as s:
            saved=await api.owned(s,self.uid,uuid.UUID(row['id']));saved.lease_until=datetime.now(UTC)-timedelta(seconds=1);await s.commit()
        fresh=await self.advance(row);self.assertEqual(fresh['state'],'uploaded');release.set();await task
        async with self.sessions() as s:self.assertEqual((await api.owned(s,self.uid,uuid.UUID(row['id']))).lease_id,'new-lease')
        self.adapter.register.assert_not_awaited()

    async def test_cloud_results_only_trace_the_bound_file_and_immutable_version(self):
        row=await self.indexed();match={**NODE,'Text':'先回忆，再核对原文。','Metadata':{**NODE['Metadata'],'doc_id':'file-test'}}
        async with self.sessions() as s:await ingest(s,self.uid,SourceUpload(request_id=uuid.uuid4(),source_id=self.source['source_id'],base_version=1,title='新版本',category='note',kind='text',filename='note.txt',text='第二版完全不同的正文。'))
        from app.engines.bailian_knowledge import chunk_rows
        self.adapter.retrieve.return_value={'items':chunk_rows([match,NODE|{'Metadata':{**NODE['Metadata'],'doc_id':'other-file'}}]),'request_id':'retrieve-req'}
        async with self.sessions() as s:
            data=(await api.retrieve(uuid.UUID(row['id']),api.Retrieve(query='回忆',consent=True),str(self.uid),s)).data
        self.assertEqual(len(data['items']),1);self.assertEqual(data['items'][0]['local_matches'][0]['start'],1);self.assertEqual(data['manifest']['source_version'],1)

    async def test_parse_failure_and_job_completion_without_document_success_are_not_ready(self):
        _,row=await self.prepared();row=await self.bind(row);row=await self.advance(row);row=await self.advance(row)
        self.adapter.describe.return_value=(self.file_data(row,'PARSE_FAILED'),'req');row=await self.advance(row);self.assertEqual(row['state'],'failed');self.adapter.submit.assert_not_awaited()
        self.adapter.describe.return_value=(self.file_data(row),'req');row=await self.advance(row);self.assertEqual(row['state'],'parsed')
