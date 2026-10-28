"""Person-owned original fidelity, MIME extraction, replay, concurrent revisions and scope."""
import asyncio
import base64
import hashlib
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from unittest.mock import AsyncMock, patch

from pydantic import ValidationError
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.personal_sources import SourceUpload, detail, ingest, listing, original, retry
from app.core.exceptions import AppException
from app.engines.material_parser import MaterialError
from app.engines.source_parser import extract_email
from app.engines.web_material import extract_webpage
from app.models.personal_source import PersonalSource, PersonalSourceVersion
from app.models.user import User
from tests.test_learning_materials import pdf_fixture


def email_fixture():
    message = EmailMessage()
    message['From'] = 'sender@example.com'
    message['To'] = 'reader@example.com'
    message['Subject'] = '虚构邮件：保留原文'
    message['Date'] = 'Fri, 09 Oct 2026 10:00:00 +0800'
    message['Message-ID'] = '<fictional-source@example.com>'
    message.set_content('这是原邮件😀。请保留完整上下文。')
    message.add_alternative('<p>同一正文的 HTML 版本。</p><script>unsafe()</script>', subtype='html')
    message.add_attachment(b'attachment-only', maintype='application', subtype='octet-stream', filename='attachment.bin')
    return message.as_bytes()


class SourceContractTests(unittest.TestCase):
    def base(self, **changes):
        return dict(request_id=uuid.uuid4(), source_id=uuid.uuid4(), base_version=0, title='虚构笔记', category='note', kind='text', filename='原文.txt', text='原文😀', **changes)

    def test_unambiguous_bounded_upload_and_safe_sources(self):
        base = self.base()
        for change in ({'title':' '}, {'base_version':True}, {'base_version':-1}, {'text':' '}, {'data_base64':'eA=='}, {'source_url':'javascript:alert(1)'}, {'source_url':'https://u:p@example.com'}, {'kind':'pdf'}, {'kind':'eml'}, {'text':'x'*200001}):
            with self.subTest(change=next(iter(change))), self.assertRaises(ValidationError):
                SourceUpload(**{**base, **change})
        self.assertEqual(SourceUpload(**base).raw_bytes(), '原文😀'.encode())

    def test_link_book_and_email_contracts(self):
        base = self.base()
        link = {**base, 'category':'link', 'kind':'link', 'text':None, 'source_url':'https://example.com', 'filename':'链接.txt'}
        self.assertEqual(SourceUpload(**link).raw_bytes(), b'https://example.com')
        for change in ({'source_url':None}, {'text':'ambiguous'}, {'category':'note'}, {'kind':'web','source_url':'http://example.com'}, {'kind':'web','source_url':'https://127.0.0.1'}):
            with self.assertRaises(ValidationError): SourceUpload(**{**link, **change})
        self.assertIsNone(SourceUpload(**{**link,'kind':'web'}).raw_bytes())
        SourceUpload(**{**base, 'category':'book', 'kind':'pdf', 'filename':'书本.pdf', 'text':None, 'data_base64':base64.b64encode(pdf_fixture()).decode()})

    def test_email_prefers_plain_body_preserves_headers_and_skips_attachments(self):
        result = extract_email(email_fixture())
        self.assertEqual(result['email']['Subject'], '虚构邮件：保留原文')
        self.assertEqual(result['email']['Message-ID'], '<fictional-source@example.com>')
        self.assertIn('原邮件😀', result['text'])
        self.assertNotIn('HTML 版本', result['text'])
        self.assertNotIn('attachment-only', result['text'])
        self.assertIn('1 个附件', result['warnings'][-1])
        for c in result['chunks']:
            self.assertEqual(result['text'][c['start']:c['end']], c['text'])

    def test_html_only_email_excludes_active_content_and_external_assets(self):
        message = EmailMessage();message.set_content('<main><p>保留的正文。</p><img src="https://example.com/private"><script>secret()</script></main>', subtype='html')
        result = extract_email(message.as_bytes())
        self.assertIn('保留的正文', result['text'])
        self.assertNotIn('secret()', result['text'])
        self.assertNotIn('private', result['text'])
        with self.assertRaises(MaterialError): extract_email(b'From: x@example.com\n\n   ')
        with self.assertRaises(MaterialError): extract_email(b'Content-Type: text/plain; charset=unknown-codec\n\ntext')


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'requires isolated PostgreSQL')
class SourceIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL'];assert url.rsplit('/', 1)[-1].endswith('_test')
        self.engine = create_async_engine(url)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid,self.other = uuid.uuid4(),uuid.uuid4()
        async with self.sessions() as s:
            s.add_all([User(id=u,wx_openid=str(u),settings={}) for u in (self.uid,self.other)]);await s.commit()

    async def asyncTearDown(self):
        async with self.sessions() as s:
            for model in (PersonalSourceVersion,PersonalSource):await s.execute(delete(model).where(model.user_id.in_([self.uid,self.other])))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    def payload(self, **changes):
        return SourceUpload(**{'request_id':uuid.uuid4(),'source_id':uuid.uuid4(),'base_version':0,'title':'独立笔记','category':'note','kind':'text','filename':'原文.txt','text':'原文😀：先尝试回忆，再核对来源。\n\n保留版本。', **changes})

    async def upload(self,payload,uid=None):
        async with self.sessions() as s:return await ingest(s,uid or self.uid,payload)

    async def count(self,model):
        async with self.sessions() as s:return await s.scalar(select(func.count()).select_from(model).where(model.user_id==self.uid))

    async def test_standalone_source_replay_exact_original_and_version_history(self):
        p=self.payload();first=await self.upload(p);again=await self.upload(p)
        self.assertEqual(first,again);self.assertEqual(await self.count(PersonalSourceVersion),1)
        self.assertEqual(first['checksum'],hashlib.sha256(p.raw_bytes()).hexdigest())
        second=await self.upload(self.payload(source_id=p.source_id,base_version=1,text='第二版原文'))
        self.assertEqual(second['version'],2)
        async with self.sessions() as s:
            old=await detail(p.source_id,1,str(self.uid),s)
            self.assertEqual(old.data['versions'],[2,1]);self.assertIn('原文😀',old.data['current']['extraction']['text'])
            download=await original(p.source_id,1,str(self.uid),s)
            self.assertEqual(download.body,p.raw_bytes());self.assertEqual(download.headers['x-content-type-options'],'nosniff')
        for c in first['extraction']['chunks']:self.assertEqual(first['extraction']['text'][c['start']:c['end']],c['text'])

    async def test_replay_conflicting_payload_and_stale_version_do_not_mutate(self):
        p=self.payload();await self.upload(p)
        for changed in (p.model_copy(update={'text':'同提交改文'}),self.payload(source_id=p.source_id)):
            with self.assertRaises(AppException) as e:await self.upload(changed)
            self.assertEqual(e.exception.status_code,409)
        self.assertEqual(await self.count(PersonalSourceVersion),1)

    async def test_concurrent_same_request_has_one_original_and_one_receipt(self):
        p=self.payload();a,b=await asyncio.gather(self.upload(p),self.upload(p))
        self.assertEqual(a['id'],b['id']);self.assertEqual(await self.count(PersonalSourceVersion),1)
        self.assertEqual(await self.count(PersonalSource),1)

    async def test_concurrent_revisions_preserve_losing_draft_contract(self):
        p=self.payload();await self.upload(p)
        results=await asyncio.gather(*(self.upload(self.payload(source_id=p.source_id,base_version=1,text=text)) for text in ('修订 A','修订 B')),return_exceptions=True)
        self.assertEqual(sum(isinstance(v,dict) for v in results),1)
        failures=[v for v in results if isinstance(v,AppException)];self.assertEqual(len(failures),1);self.assertEqual(failures[0].status_code,409)
        self.assertEqual(await self.count(PersonalSourceVersion),2)

    async def test_foreign_sources_versions_download_and_retry_are_inaccessible(self):
        p=self.payload();await self.upload(p)
        for operation in (detail,original,retry):
            async with self.sessions() as s:
                with self.assertRaises(AppException) as e:await operation(p.source_id,1,str(self.other),s)
                self.assertEqual(e.exception.status_code,404)
        with self.assertRaises(AppException):await self.upload(self.payload(source_id=p.source_id,base_version=1),self.other)
        async with self.sessions() as s:
            own=await listing('', 'all',1,str(self.uid),s);other=await listing('', 'all',1,str(self.other),s)
            self.assertEqual(own.data['total'],1);self.assertEqual(other.data['total'],0)

    async def test_failed_parser_keeps_original_and_retry_never_adds_a_version(self):
        p=self.payload()
        with patch('app.api.personal_sources.parse_source',AsyncMock(side_effect=MaterialError('虚构解析失败'))):first=await self.upload(p)
        self.assertEqual(first['status'],'failed')
        async with self.sessions() as s:
            self.assertEqual((await original(p.source_id,1,str(self.uid),s)).body,p.raw_bytes())
            fixed=await retry(p.source_id,1,str(self.uid),s)
        self.assertEqual(fixed.data['status'],'ready');self.assertEqual(fixed.data['attempts'],2)
        self.assertEqual(await self.count(PersonalSourceVersion),1)

    async def test_expired_attempt_cannot_overwrite_recovered_parse(self):
        p=self.payload();started=asyncio.Event();release=asyncio.Event()
        async def delayed(raw,kind):
            from app.engines.material_parser import extract
            started.set();await release.wait();return extract(b'late incorrect result','text')
        with patch('app.api.personal_sources.parse_source',delayed):
            task=asyncio.create_task(self.upload(p));await started.wait()
            async with self.sessions() as s:
                row=await s.scalar(select(PersonalSourceVersion).where(PersonalSourceVersion.user_id==self.uid));row.attempt_id=uuid.uuid4();row.status='ready';row.extraction={'text':'recovered valid result','chunks':[],'warnings':[],'page_count':None};await s.commit()
            release.set();result=await task
        self.assertEqual(result['extraction']['text'],'recovered valid result')

    async def test_email_and_pdf_originals_are_preserved_with_context_and_pages(self):
        for kind,category,raw,name in (('eml','email',email_fixture(),'邮件.eml'),('pdf','book',pdf_fixture(),'书本.pdf')):
            p=self.payload(kind=kind,category=category,text=None,filename=name,data_base64=base64.b64encode(raw).decode());result=await self.upload(p)
            self.assertEqual(result['status'],'ready')
            async with self.sessions() as s:self.assertEqual((await original(p.source_id,1,str(self.uid),s)).body,raw)
            if kind=='pdf':self.assertEqual([c['page'] for c in result['extraction']['chunks']],[1,2])
            else:self.assertEqual(result['extraction']['email']['From'],'sender@example.com')

    async def test_latest_search_filters_literal_percent_and_pagination(self):
        p=self.payload(title='100%_原文');await self.upload(p)
        await self.upload(self.payload(source_id=p.source_id,base_version=1,title='最新标题',text='当前原文中含 100%_'))
        for i in range(21):await self.upload(self.payload(title=f'分页笔记 {i}'))
        async with self.sessions() as s:
            literal=await listing('%_', 'note',1,str(self.uid),s);self.assertEqual(literal.data['total'],1);self.assertEqual(literal.data['items'][0]['version'],2)
            page2=await listing('', 'all',2,str(self.uid),s);self.assertEqual(page2.data['total'],22);self.assertEqual(len(page2.data['items']),2)
            emails=await listing('', 'email',1,str(self.uid),s);self.assertEqual(emails.data['total'],0)

    async def test_link_first_then_web_snapshot_replay_and_fetch_failure(self):
        p=self.payload(category='link',kind='link',text=None,source_url='https://example.com/source',filename='链接.txt');link=await self.upload(p)
        self.assertEqual(link['extraction']['chunks'],[])
        raw=b'<main><p>Frozen public source.</p></main>';extraction=extract_webpage(raw,'text/html; charset=utf-8');extraction['web']={'fetched_at':'2026-10-10T00:00:00Z','final_url':'https://example.com/source'}
        web=self.payload(source_id=p.source_id,base_version=1,category='link',kind='web',text=None,source_url=p.source_url)
        with patch('app.api.personal_sources.fetch_webpage',AsyncMock(return_value=(raw,extraction))) as fetch:
            snapshot=await self.upload(web);again=await self.upload(web);self.assertEqual(snapshot,again);self.assertEqual(fetch.await_count,1)
        with patch('app.api.personal_sources.fetch_webpage',AsyncMock(side_effect=MaterialError('读取失败'))):
            with self.assertRaises(AppException):await self.upload(self.payload(category='link',kind='web',text=None,source_url='https://example.com/fail'))
        self.assertEqual(await self.count(PersonalSourceVersion),2)
