"""D11 original-text retrieval, stable pagination and scoped source verification."""
import os
import unittest
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.learning_knowledge import detail, library
from app.api.personal_work import Command, apply_command
from app.core.exceptions import AppException
from app.engines.knowledge_search import excerpts, find_hits, retrieve, search_terms
from app.models.learning_material import LearningMaterial
from app.models.personal_work import DocumentRevision, PersonalCommandReceipt, PersonalDocument
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceEvent
from app.models.workspace_knowledge_card import WorkspaceKnowledgeCard
from app.models.workspace_learning_item import WorkspaceLearningItem


class Contracts(unittest.TestCase):
    def test_literal_mode_keeps_phrase_and_keywords_deduplicate_case(self):
        self.assertEqual(search_terms('  主动回忆 核对  '), ['主动回忆 核对'])
        self.assertEqual(search_terms('API api\n主动回忆 核对', 'keywords'), ['API', '主动回忆', '核对'])
        self.assertEqual(search_terms(' \n', 'keywords'), [])
        with self.assertRaises(ValueError):
            search_terms(' '.join(str(i) for i in range(13)), 'keywords')

    def test_casefold_expansion_emoji_and_leading_whitespace_keep_exact_positions(self):
        text = '  📚 Straße 和 API；核对。'
        hits = find_hits(text, ['STRASSE', 'api', '核对'])
        self.assertEqual([h['quote'] for h in hits], ['Straße', 'API', '核对'])
        self.assertEqual(hits[0]['start'], 4)
        for h in hits:
            self.assertEqual(text[h['start']:h['end']], h['quote'])

    def test_keywords_match_any_term_and_title_only_is_explicit(self):
        terms = search_terms('主动回忆 核对', 'keywords')
        self.assertIsNone(retrieve('标题', '都没有', terms))
        title = retrieve('主动回忆方法', '只有示例。', terms)
        self.assertEqual(title['matched_terms'], ['主动回忆'])
        self.assertEqual(title['excerpts'], [])
        self.assertEqual(title['title_hits'][0]['quote'], '主动回忆')
        both = retrieve('标题', '核对在前，主动回忆在后。', terms)
        self.assertGreater(both['rank'], title['rank'])

    def test_repeated_words_cannot_outrank_distinct_keyword_coverage(self):
        terms = ['记忆', '步骤']
        repeated = retrieve('标题', '记忆' * 10000, terms)
        varied = retrieve('标题', '记忆之后核对步骤。', terms)
        self.assertGreater(varied['rank'], repeated['rank'])
        self.assertLessEqual(len(repeated['excerpts'][0]['hits']), 3)

    def test_snippets_are_bounded_exact_slices_and_distant_hits_are_separate(self):
        text = '📚开头\n' + ('空' * 1500 + '命中') * 5
        hits = find_hits(text, ['命中'])
        quotes = excerpts(text, hits)
        self.assertEqual(len(quotes), 3)
        for e in quotes:
            self.assertEqual(e['text'], text[e['start']:e['end']])
            self.assertLessEqual(len(e['text']), 300)
            self.assertTrue(e['hits'])

    def test_special_characters_are_literal_and_never_executed(self):
        text = '<script>bad()</script> 100% _ [a]'
        for term in ['<script>', '%', '_', '[a]']:
            self.assertEqual(find_hits(text, [term])[0]['quote'], term)


@unittest.skipUnless(os.environ.get('GROWTHPILOT_TEST_DATABASE_URL'), 'isolated PostgreSQL required')
class Integration(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = os.environ['GROWTHPILOT_TEST_DATABASE_URL']
        assert url.rsplit('/', 1)[-1].endswith('_test')
        self.engine = create_async_engine(url)
        self.sessions = async_sessionmaker(self.engine, expire_on_commit=False)
        self.uid, self.other, self.wid, self.wid2, self.iid = [uuid.uuid4() for _ in range(5)]
        async with self.sessions() as s:
            s.add_all([User(id=self.uid, wx_openid=str(self.uid), settings={}), User(id=self.other, wx_openid=str(self.other), settings={})])
            await s.flush()
            s.add_all([Workspace(id=self.wid, user_id=self.uid, name='D11 test'), Workspace(id=self.wid2, user_id=self.uid, name='other')])
            await s.flush()
            self.item = (await apply_command(s, self.uid, self.wid, Command(request_id=uuid.uuid4(), entity_id=self.iid, action='create_learning', data={'title': '回忆方法', 'notes': '  📚 主动回忆之后核对原文。', 'insights': '核对之后写下心得。'})))['entity']
            await s.commit()

    async def asyncTearDown(self):
        async with self.sessions() as s:
            docs = select(PersonalDocument.id).where(PersonalDocument.user_id == self.uid)
            await s.execute(delete(DocumentRevision).where(DocumentRevision.document_id.in_(docs)))
            for model in (LearningMaterial, WorkspaceKnowledgeCard, PersonalCommandReceipt, PersonalDocument, WorkspaceEvent, WorkspaceLearningItem, Workspace):
                await s.execute(delete(model).where(model.user_id == self.uid))
            await s.execute(delete(User).where(User.id.in_([self.uid, self.other])))
            await s.commit()
        await self.engine.dispose()

    async def test_keyword_ranking_filters_literal_compatibility_and_exact_revision(self):
        async with self.sessions() as s:
            self.assertEqual((await library(s, self.uid, self.wid, '主动回忆 核对'))['total'], 0)
            result = await library(s, self.uid, self.wid, '主动回忆 核对', mode='keywords', order='relevance')
            self.assertEqual(result['total'], 2)
            row = result['items'][0]
            self.assertEqual(row['kind'], 'notes')
            self.assertEqual(row['matched_terms'], ['主动回忆', '核对'])
            old = (await detail(self.wid, row['key'], row['source']['version'], str(self.uid), s)).data
            self.assertEqual(old['text'][row['excerpts'][0]['start']:row['excerpts'][0]['end']], row['excerpts'][0]['text'])
            self.assertEqual((await library(s, self.uid, self.wid, '主动回忆 核对', 'insights', mode='keywords'))['total'], 1)
            await apply_command(s, self.uid, self.wid, Command(request_id=uuid.uuid4(), entity_id=self.iid, action='save_learning', base_version=1, expected_updated_at=self.item['updated_at'], data={'title': '回忆方法', 'notes': '新笔记，替换旧内容。', 'stage': 'queued'}))
            await s.commit()
            old_again = (await detail(self.wid, row['key'], 1, str(self.uid), s)).data
            self.assertEqual(old_again['text'], old['text'])
            self.assertEqual((await library(s, self.uid, self.wid, '主动回忆'))['total'], 0)

    async def test_scope_archives_and_cross_item_sources_are_rechecked(self):
        async with self.sessions() as s:
            for uid, wid in ((self.other, self.wid), (self.uid, uuid.uuid4())):
                with self.assertRaises(AppException):
                    await library(s, uid, wid, '核对', mode='keywords')
            with self.assertRaises(AppException):
                await detail(self.wid2, f'doc:{self.iid}:notes', 1, str(self.uid), s)
            item = await s.get(WorkspaceLearningItem, self.iid)
            item.archived_at = datetime.now(UTC)
            await s.commit()
            self.assertEqual((await library(s, self.uid, self.wid, '核对', mode='keywords'))['total'], 0)
            with self.assertRaises(AppException):
                await detail(self.wid, f'doc:{self.iid}:notes', 1, str(self.uid), s)

    async def test_card_modification_rejects_stale_copy_and_preserves_current_card(self):
        async with self.sessions() as s:
            card = WorkspaceKnowledgeCard(user_id=self.uid, workspace_id=self.wid, title='卡片', source_type='text', content='核对的原话', ai_concepts=[], ai_tags=[])
            s.add(card)
            await s.commit()
            result = await library(s, self.uid, self.wid, '核对', 'card', mode='keywords')
            row = result['items'][0]
            updated = datetime.fromisoformat(row['updated_at'])
            await detail(self.wid, row['key'], None, str(self.uid), s, updated)
            card.content = '新的原话'
            card.updated_at = updated + timedelta(seconds=1)
            await s.commit()
            with self.assertRaises(AppException) as rejected:
                await detail(self.wid, row['key'], None, str(self.uid), s, updated)
            self.assertEqual(rejected.exception.status_code, 409)
            self.assertEqual(card.content, '新的原话')

    async def test_equal_dates_pagination_is_stable_and_material_quotes_are_exact(self):
        async with self.sessions() as s:
            moment = datetime.now(UTC)
            for i in range(34):
                s.add(WorkspaceKnowledgeCard(user_id=self.uid, workspace_id=self.wid, title=f'同日 {i}', source_type='text', content='核对关键词', ai_concepts=[], ai_tags=[], updated_at=moment))
            mid = uuid.uuid4()
            text = '原资料📚：主动回忆。\n\n第二段：核对。'
            s.add(LearningMaterial(id=mid, user_id=self.uid, workspace_id=self.wid, item_id=self.iid, request_id=uuid.uuid4(), fingerprint='f'*64, checksum='a'*64, title='原资料', kind='text', filename='原资料.txt', byte_count=len(text.encode()), original=text.encode(), extraction={'text':text,'chunks':[]}, status='ready', attempts=1, attempt_id=uuid.uuid4(), lease_until=moment, parser_version='test'))
            await s.commit()
            first = await library(s, self.uid, self.wid, '核对', 'card', mode='keywords', order='relevance')
            second = await library(s, self.uid, self.wid, '核对', 'card', page=2, mode='keywords', order='relevance')
            again = await library(s, self.uid, self.wid, '核对', 'card', mode='keywords', order='relevance')
            self.assertEqual(first, again)
            self.assertEqual(len(first['items']), 30)
            self.assertEqual(len(second['items']), 4)
            self.assertFalse({e['key'] for e in first['items']} & {e['key'] for e in second['items']})
            material = (await library(s, self.uid, self.wid, '主动回忆 核对', 'material', mode='keywords'))['items'][0]
            full = (await detail(self.wid, material['key'], None, str(self.uid), s)).data
            for e in material['excerpts']:
                self.assertEqual(full['text'][e['start']:e['end']], e['text'])
            self.assertEqual(material['source']['checksum'], 'a'*64)
