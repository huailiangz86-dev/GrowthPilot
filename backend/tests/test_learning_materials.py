"""Imported source fidelity, ownership, replay and atomic excerpt adoption."""
import asyncio
import base64
import io
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, patch
from pydantic import ValidationError
from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from app.api.learning_materials import MAX_BODY, MaterialUpload, WebMaterialUpload, detail, ingest, ingest_webpage, listing, original, retry, upload
from app.api.personal_work import AppendMaterialContent, Command, apply_command
from app.api.item_help import learning_source
from app.core.exceptions import AppException
from app.engines.material_parser import MAX_BYTES, MaterialError, extract, parse_material
from app.engines.web_material import extract_webpage
from app.models.learning_material import LearningMaterial, LearningMaterialExcerpt
from app.models.personal_work import PersonalDocument, PersonalCommandReceipt, DocumentRevision
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_learning_item import WorkspaceLearningItem

TEXT = "主动回忆是先尝试从记忆中回答问题，再核对原文。\n\n记录本人实际答案与困难，不能由学习分钟推断掌握。"


def pdf_fixture(blank=False, encrypted=False):
    writer = PdfWriter()
    for text in ("Recall before checking the source.", "Keep the actual answer and compare it."):
        page = writer.add_blank_page(width=300, height=300)
        if not blank:
            font = DictionaryObject({NameObject("/Type"): NameObject("/Font"), NameObject("/Subtype"): NameObject("/Type1"), NameObject("/BaseFont"): NameObject("/Helvetica")})
            page[NameObject("/Resources")] = DictionaryObject({NameObject("/Font"): DictionaryObject({NameObject("/F1"): font})})
            stream = DecodedStreamObject()
            stream.set_data(f"BT /F1 10 Tf 10 250 Td ({text}) Tj ET".encode())
            page[NameObject("/Contents")] = writer._add_object(stream)
    if encrypted:
        writer.encrypt("test-only-password")
    output = io.BytesIO()
    writer.write(output)
    return output.getvalue()


class MaterialContractTests(unittest.TestCase):
    def test_text_chunks_point_to_exact_source_offsets_without_rewriting(self):
        result = extract(("  原文，含标点。\r\n\r\n" + "长" * 2001).encode(), "md")
        self.assertEqual(len(result["chunks"]), 4)
        for c in result["chunks"]:
            self.assertEqual(result["text"][c["start"]:c["end"]], c["text"])
            self.assertIsNone(c["page"])

    def test_pdf_page_numbers_and_original_phrases_are_retained(self):
        result = extract(pdf_fixture(), "pdf")
        self.assertEqual(result["page_count"], 2)
        self.assertEqual([c["page"] for c in result["chunks"]], [1, 2])
        self.assertIn("Recall before checking the source.", result["chunks"][0]["text"])
        for c in result["chunks"]:
            self.assertEqual(result["text"][c["start"]:c["end"]], c["text"])

    def test_scanned_encrypted_malformed_binary_and_wrong_encoding_fail_clearly(self):
        for data, kind in ((pdf_fixture(blank=True), "pdf"), (pdf_fixture(encrypted=True), "pdf"),
                           (b"%PDF-invalid", "pdf"), (b"not a pdf", "pdf"), (b"\xff", "txt"), (b"a\x00b", "md"), (b" ", "txt")):
            with self.subTest(kind=kind), self.assertRaises(MaterialError):
                extract(data, kind)

    def test_limits_never_silently_truncate_materials(self):
        for data in (b"x" * (MAX_BYTES + 1), ("x" * 200001).encode(), ("p\n\n" * 501).encode()):
            with self.assertRaises(MaterialError): extract(data, "txt")
        writer = PdfWriter()
        for _ in range(101): writer.add_blank_page(width=100, height=100)
        data = io.BytesIO();writer.write(data)
        with self.assertRaises(MaterialError): extract(data.getvalue(), "pdf")

    def test_upload_contract_rejects_ambiguous_unsafe_and_invalid_inputs(self):
        base = dict(request_id=uuid.uuid4(), title="原文", kind="text", text=TEXT)
        for change in ({"text":" "}, {"data_base64":"eA=="}, {"source_url":"javascript:alert(1)"},
                       {"source_url":"https://user:pass@example.com"}, {"title":"x\ny"},
                       {"kind":"pdf", "text":None, "filename":"wrong.txt", "data_base64":"eA=="},
                       {"kind":"pdf", "text":None, "filename":"a.pdf", "data_base64":"!"}):
            with self.assertRaises(ValidationError): MaterialUpload(**{**base, **change})
        for chosen in ([], ["c1", "c1"], ["c1"] * 21):
            with self.assertRaises(ValidationError): AppendMaterialContent(material_id=uuid.uuid4(),checksum="a"*64,chunk_ids=chosen)


class ParserIsolationTests(unittest.IsolatedAsyncioTestCase):
    async def test_pdf_runs_in_bounded_worker_with_real_page_extraction(self):
        result = await parse_material(pdf_fixture(), "pdf")
        self.assertEqual(result["page_count"], 2)
        with self.assertRaises(MaterialError): await parse_material(pdf_fixture(blank=True), "pdf")


@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_DATABASE_URL"), "requires isolated PostgreSQL")
class MaterialIntegrationTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ["GROWTHPILOT_TEST_DATABASE_URL"]
        assert url.rsplit("/", 1)[-1].endswith("_test")
        self.engine = create_async_engine(url)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid, self.other, self.wid, self.wid2, self.iid = [uuid.uuid4() for _ in range(5)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid,wx_openid=str(self.uid),settings={}), User(id=self.other,wx_openid=str(self.other),settings={})]);await s.flush()
            s.add_all([Workspace(id=self.wid,user_id=self.uid,name="D5虚构验收"),Workspace(id=self.wid2,user_id=self.uid,name="另一空间")]);await s.flush()
            result = await apply_command(s,self.uid,self.wid,Command(request_id=uuid.uuid4(),entity_id=self.iid,action="create_learning",data={"title":"学习原文", "aim":"保留目标", "notes":"已有的个人笔记", "questions":"已有疑问", "exercise":"已有练习", "stage":"practice"}))
            await s.commit();self.item = result["entity"]

    async def asyncTearDown(self):
        async with self.sessions() as s:
            await s.execute(delete(LearningMaterialExcerpt).where(LearningMaterialExcerpt.user_id==self.uid))
            await s.execute(delete(LearningMaterial).where(LearningMaterial.user_id==self.uid))
            docs = select(PersonalDocument.id).where(PersonalDocument.user_id==self.uid)
            await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(docs)))
            for model in (PersonalCommandReceipt,PersonalDocument,WorkspaceEvent,WorkspaceLearningItem,Workspace):
                await s.execute(delete(model).where(model.user_id==self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid,self.other])));await s.commit()
        await self.engine.dispose()

    def payload(self, **change):
        return MaterialUpload.model_validate({"request_id":str(uuid.uuid4()), "title":"真实资料", "kind":"text", "text":TEXT, **change})

    async def upload(self, payload=None, uid=None, wid=None):
        async with self.sessions() as s:
            return await ingest(s,uid or self.uid,wid or self.wid,self.iid,payload or self.payload())

    def append_command(self, material, **change):
        return Command.model_validate({"request_id":str(uuid.uuid4()),"entity_id":str(self.iid),"action":"append_material",
            "base_version":self.item["document"]["version"],"expected_updated_at":self.item["updated_at"],
            "data":{"material_id":material["id"],"checksum":material["checksum"],"chunk_ids":["c2","c1"]},**change})

    async def submit(self, command):
        async with self.sessions() as s:
            result = await apply_command(s,self.uid,self.wid,command);await s.commit();return result

    def web_payload(self, **changes):
        return WebMaterialUpload(request_id=uuid.uuid4(), title="公开虚构资料", source_url="https://example.com/source", **changes)

    def web_fixture(self):
        raw = b'<main><p>Recall first, then verify the source.</p><p>Keep the actual answer.</p></main>'
        result = extract_webpage(raw, 'text/html; charset=utf-8')
        result['web'] = {'requested_url':'https://example.com/source','final_url':'https://example.com/final',
            'fetched_at':datetime.now(UTC).isoformat(),'content_type':'text/html; charset=utf-8','parser_version':'public-web-text-1'}
        return raw, result

    async def web_upload(self, payload=None, uid=None, wid=None):
        async with self.sessions() as s:
            return await ingest_webpage(s, uid or self.uid, wid or self.wid, self.iid, payload or self.web_payload())

    async def test_web_snapshot_replay_download_and_adoption_keep_exact_sources(self):
        payload = self.web_payload()
        raw, extraction = self.web_fixture()
        with patch('app.api.learning_materials.fetch_webpage', AsyncMock(return_value=(raw, extraction))) as fetch:
            m = await self.web_upload(payload)
            again = await self.web_upload(payload)
            self.assertEqual(m, again)
            self.assertEqual(fetch.await_count, 1)
        self.assertEqual(m['kind'], 'web')
        self.assertEqual(m['web']['final_url'], 'https://example.com/final')
        async with self.sessions() as s:
            response = await original(self.wid,self.iid,uuid.UUID(m['id']),str(self.uid),s)
            self.assertEqual(response.body, raw)
            document = await s.get(PersonalDocument, uuid.UUID(self.item['document']['id']))
            self.assertEqual(document.version, 1)
        adopted = await self.submit(self.append_command(m))
        self.assertIn('Recall first, then verify the source.', adopted['entity']['document']['content']['notes'])
        async with self.sessions() as s:
            provenance = await s.scalar(select(LearningMaterialExcerpt).where(LearningMaterialExcerpt.user_id==self.uid))
            self.assertEqual(provenance.content['checksum'], m['checksum'])
            for c in provenance.content['chunks']:
                self.assertEqual(extraction['text'][c['start']:c['end']], c['text'])

    async def test_web_fetch_failure_does_not_save_empty_sources_or_change_notes(self):
        with patch('app.api.learning_materials.fetch_webpage', AsyncMock(side_effect=MaterialError('网页读取超时'))):
            with self.assertRaises(AppException):
                await self.web_upload()
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterial).where(LearningMaterial.user_id==self.uid)),0)
            doc = await s.get(PersonalDocument, uuid.UUID(self.item['document']['id']))
            self.assertEqual(doc.content['notes'], '已有的个人笔记')

    async def test_web_rechecks_scope_and_conflicts_without_fetching_foreign_sources(self):
        with patch('app.api.learning_materials.fetch_webpage', AsyncMock(return_value=self.web_fixture())) as fetch:
            for kwargs in ({'uid':self.other}, {'wid':self.wid2}):
                with self.assertRaises(AppException):
                    await self.web_upload(**kwargs)
            fetch.assert_not_awaited()
            payload = self.web_payload()
            await self.web_upload(payload)
            with self.assertRaises(AppException):
                await self.web_upload(payload.model_copy(update={'source_url':'https://example.com/new'}))
            self.assertEqual(fetch.await_count,1)

    async def test_web_concurrent_fetches_save_one_snapshot_and_knowledge_source(self):
        from app.api.learning_knowledge import library
        payload = self.web_payload()
        with patch('app.api.learning_materials.fetch_webpage', AsyncMock(return_value=self.web_fixture())):
            a,b = await asyncio.gather(self.web_upload(payload), self.web_upload(payload))
        self.assertEqual(a['id'], b['id'])
        self.assertEqual(a['checksum'], b['checksum'])
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterial).where(LearningMaterial.user_id==self.uid)),1)
            entries = await library(s,self.uid,self.wid,q='Recall first',kind='material')
            self.assertEqual(entries['total'],1)

    async def test_web_scope_archival_during_fetch_prevents_saving_snapshot(self):
        async def archive(url):
            async with self.sessions() as s:
                workspace = await s.get(Workspace,self.wid)
                workspace.archived_at = datetime.now(UTC)
                await s.commit()
            return self.web_fixture()
        with patch('app.api.learning_materials.fetch_webpage',side_effect=archive):
            with self.assertRaises(AppException):
                await self.web_upload()

    async def test_concurrent_upload_replay_has_one_source_and_no_note_edits(self):
        payload = self.payload()
        a,b = await asyncio.gather(self.upload(payload),self.upload(payload))
        self.assertEqual(a["id"],b["id"])
        again = await self.upload(payload)
        self.assertEqual(again["status"],"ready")
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterial).where(LearningMaterial.user_id==self.uid)),1)
            doc = await s.get(PersonalDocument,uuid.UUID(self.item["document"]["id"]))
            self.assertEqual(doc.version,1);self.assertEqual(doc.content["notes"],"已有的个人笔记")
        with self.assertRaises(AppException): await self.upload(payload.model_copy(update={"text":"同标识不同内容"}))

    async def test_failed_extraction_preserves_original_and_retry_uses_saved_bytes(self):
        with patch("app.api.learning_materials.parse_material",side_effect=MaterialError("模拟临时失败")):
            m = await self.upload()
        self.assertEqual(m["status"],"failed")
        async with self.sessions() as s:
            raw = await original(self.wid,self.iid,uuid.UUID(m["id"]),str(self.uid),s)
            self.assertEqual(raw.body,TEXT.encode())
            recovered = (await retry(self.wid,self.iid,uuid.UUID(m["id"]),str(self.uid),s)).data
        self.assertEqual(recovered["status"],"ready");self.assertEqual(recovered["attempts"],2)

    async def test_expired_attempt_cannot_overwrite_later_extraction(self):
        payload, started, release = self.payload(),asyncio.Event(),asyncio.Event()
        result = extract(TEXT.encode(),"text")
        async def slow(raw, kind):
            started.set();await release.wait();return {**result,"characters":12345}
        with patch("app.api.learning_materials.parse_material",side_effect=slow):
            first = asyncio.create_task(self.upload(payload));await started.wait()
            async with self.sessions() as s:
                row = await s.scalar(select(LearningMaterial).where(LearningMaterial.user_id==self.uid))
                row.lease_until = datetime.now(UTC)-timedelta(seconds=1);await s.commit()
            with patch("app.api.learning_materials.parse_material",return_value=result): second=await self.upload(payload)
            release.set();late=await first
        self.assertEqual(second["characters"],len(TEXT));self.assertEqual(late["characters"],len(TEXT))
        self.assertEqual(late["attempts"],2)

    async def test_owner_workspace_item_and_archive_guard_all_source_routes(self):
        m = await self.upload();mid=uuid.UUID(m["id"])
        for uid,wid,iid in ((self.other,self.wid,self.iid),(self.uid,self.wid2,self.iid),(self.uid,self.wid,uuid.uuid4())):
            for endpoint,args in ((listing,(wid,iid)),(detail,(wid,iid,mid)),(retry,(wid,iid,mid)),(original,(wid,iid,mid))):
                async with self.sessions() as s:
                    with self.assertRaises(AppException): await endpoint(*args,str(uid),s)
        async with self.sessions() as s:
            row=await s.get(WorkspaceLearningItem,self.iid);row.archived_at=datetime.now(UTC);await s.commit()
        async with self.sessions() as s:
            with self.assertRaises(AppException): await original(self.wid,self.iid,mid,str(self.uid),s)

    async def test_confirmed_excerpt_preserves_notes_stage_and_immutable_provenance(self):
        m = await self.upload();result=(await self.submit(self.append_command(m)))["entity"]
        content=result["document"]["content"]
        self.assertTrue(content["notes"].startswith("已有的个人笔记\n\n"));self.assertIn(TEXT.split("\n\n")[0],content["notes"])
        self.assertEqual((content["stage"],content["questions"],content["exercise"]),("practice","已有疑问","已有练习"))
        self.assertLess(content["notes"].index("片段 c1"),content["notes"].index("片段 c2"))
        async with self.sessions() as s:
            source=await learning_source(s,self.uid,self.wid,self.iid)
            self.assertEqual(source["fields"]["notes"],content["notes"])
        await self.submit(Command.model_validate({"request_id":str(uuid.uuid4()),"entity_id":str(self.iid),"action":"save_learning","base_version":2,"expected_updated_at":result["updated_at"],"data":{**content,"notes":"本人的新理解"}}))
        async with self.sessions() as s:
            source=(await detail(self.wid,self.iid,uuid.UUID(m["id"]),str(self.uid),s)).data
            self.assertEqual(source["excerpts"][0]["document_version"],2)
            self.assertEqual(source["excerpts"][0]["chunks"],m["extraction"]["chunks"])
            self.assertEqual(source["extraction"]["text"],m["extraction"]["text"])

    async def test_lost_adoption_receipt_replays_one_append_revision_and_excerpt(self):
        m=await self.upload();command=self.append_command(m)
        a,b=await asyncio.gather(self.submit(command),self.submit(command));self.assertEqual(a,b)
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterialExcerpt).where(LearningMaterialExcerpt.user_id==self.uid)),1)
            doc=await s.get(PersonalDocument,uuid.UUID(self.item["document"]["id"]));self.assertEqual(doc.version,2)
            self.assertEqual(doc.content["notes"].count("[资料："),1)

    async def test_stale_notes_bad_checksum_foreign_chunks_and_full_notes_reject_atomically(self):
        m=await self.upload();base=self.append_command(m)
        for data in ({**base.data,"checksum":"0"*64},{**base.data,"chunk_ids":["absent"]},{**base.data,"material_id":str(uuid.uuid4())}):
            with self.assertRaises(AppException): await self.submit(base.model_copy(update={"data":data}))
        content={**self.item["document"]["content"],"notes":"n"*100000}
        edited=(await self.submit(Command.model_validate({"request_id":str(uuid.uuid4()),"entity_id":str(self.iid),"action":"save_learning","base_version":1,"expected_updated_at":self.item["updated_at"],"data":content})))["entity"]
        with self.assertRaises(AppException):await self.submit(base)
        with self.assertRaises(ValidationError):await self.submit(base.model_copy(update={"base_version":2,"expected_updated_at":datetime.fromisoformat(edited["updated_at"])}))
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterialExcerpt).where(LearningMaterialExcerpt.user_id==self.uid)),0)

    async def test_pdf_real_worker_and_per_item_storage_limit(self):
        raw=pdf_fixture()
        m=await self.upload(self.payload(kind="pdf",text=None,filename="source.pdf",data_base64=base64.b64encode(raw).decode()))
        self.assertEqual(m["page_count"],2)
        async with self.sessions() as s:
            row=await s.get(LearningMaterial,uuid.UUID(m["id"]));row.byte_count=20*1024*1024;await s.commit()
        with self.assertRaises(AppException):await self.upload()

    async def test_chunked_oversized_request_stops_before_source_creation(self):
        from types import SimpleNamespace
        async def blocks():
            for _ in range(4):yield b"x"*(MAX_BODY//3)
        async with self.sessions() as s:
            with self.assertRaises(AppException):await upload(self.wid,self.iid,SimpleNamespace(stream=blocks),str(self.uid),s)
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterial).where(LearningMaterial.user_id==self.uid)),0)

    async def test_source_count_limit_is_atomic_under_concurrent_uploads(self):
        for _ in range(29):await self.upload(self.payload(text="一段原文"))
        results=await asyncio.gather(self.upload(self.payload()),self.upload(self.payload()),return_exceptions=True)
        self.assertEqual(sum(isinstance(r,AppException) for r in results),1)
        async with self.sessions() as s:
            self.assertEqual(await s.scalar(select(func.count()).select_from(LearningMaterial).where(LearningMaterial.user_id==self.uid)),30)

    async def test_explicit_conflict_resolution_saves_selected_draft_and_excerpt_together(self):
        m=await self.upload()
        data={**self.append_command(m).data,"draft":{**self.item["document"]["content"],"notes":"确认期间写下的新理解","questions":"本人保留的新疑问"}}
        result=(await self.submit(self.append_command(m,data=data)))["entity"]
        self.assertTrue(result["document"]["content"]["notes"].startswith("确认期间写下的新理解\n\n"))
        self.assertIn("片段 c1",result["document"]["content"]["notes"])
        self.assertEqual(result["document"]["content"]["questions"],"本人保留的新疑问")
        self.assertEqual(result["status"],"practice")
