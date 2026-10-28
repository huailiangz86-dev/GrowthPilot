"""Cloud adapter provenance, redaction and account boundaries; no network."""
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from app.api import bailian_knowledge as api
from app.core.config import settings
from app.core.exceptions import AppException, ForbiddenException, ValidationException
from app.engines.bailian_knowledge import BailianKnowledge, KnowledgeConfig, chunk_rows, unpack

CONFIG = KnowledgeConfig('credential-id', 'credential-secret', 'workspace-test', 'index-test')
NODE = {'Text': '  📚 保留原文\n<script>示例</script>', 'Score': 0.5,
        'Metadata': {'doc_id': 'file-test', 'nid': 'chunk-test', 'doc_name': '笔记',
                     'hier_title': '第一章', 'page_number': 2, 'file_path': 'https://secret.example/signed'}}


def response(data=None, **extra):
    return SimpleNamespace(body=SimpleNamespace(to_map=lambda: {'Success': True, 'Data': data or {}, 'RequestId': 'req-test', **extra}))


class ConfigTests(unittest.TestCase):
    def test_source_env_without_import_or_interpolation(self):
        with tempfile.TemporaryDirectory() as path:
            file = Path(path)/'KnowledgeHub'/'.env'
            file.parent.mkdir()
            file.write_text('ALIYUN_ACCESS_KEY_ID=id\nALIYUN_ACCESS_KEY_SECRET="${LITERAL}"\nBAILIAN_WORKSPACE_ID=ws\nBAILIAN_INDEX_ID=kb\n')
            with patch.multiple(settings, BAILIAN_CONFIG_ENV_FILE=str(file), BAILIAN_ACCESS_KEY_ID='', BAILIAN_ACCESS_KEY_SECRET='', BAILIAN_WORKSPACE_ID='', BAILIAN_INDEX_ID=''):
                config = KnowledgeConfig.load()
            self.assertEqual(config.access_key_secret, '${LITERAL}')
            self.assertEqual(config.source, 'KnowledgeHub 配置')
            self.assertNotIn('${LITERAL}', repr(config))
            self.assertNotIn('access_key', json.dumps(config.public()))

    def test_explicit_server_settings(self):
        with patch.multiple(settings, BAILIAN_CONFIG_ENV_FILE='', BAILIAN_ACCESS_KEY_ID='id', BAILIAN_ACCESS_KEY_SECRET='secret', BAILIAN_WORKSPACE_ID='ws', BAILIAN_INDEX_ID='kb'):
            self.assertEqual(KnowledgeConfig.load().index_id, 'kb')

    def test_missing_file_and_credentials_are_recoverable(self):
        for file in ['/missing-test-file.env', '']:
            with patch.multiple(settings, BAILIAN_CONFIG_ENV_FILE=file, BAILIAN_ACCESS_KEY_ID='', BAILIAN_ACCESS_KEY_SECRET='', BAILIAN_WORKSPACE_ID='', BAILIAN_INDEX_ID=''):
                with self.assertRaises(AppException) as caught:
                    KnowledgeConfig.load()
                self.assertEqual(caught.exception.status_code, 503)

    def test_endpoint_is_not_client_controlled_url(self):
        with patch.multiple(settings, BAILIAN_CONFIG_ENV_FILE='', BAILIAN_ACCESS_KEY_ID='id', BAILIAN_ACCESS_KEY_SECRET='secret', BAILIAN_WORKSPACE_ID='ws', BAILIAN_INDEX_ID='kb', BAILIAN_ENDPOINT='127.0.0.1'):
            with self.assertRaises(AppException):
                KnowledgeConfig.load()

    def test_exact_text_provenance_and_finite_score(self):
        row = chunk_rows([NODE], 'file-test')[0]
        self.assertEqual(row['text'], NODE['Text'])
        self.assertEqual(row['page'], 2)
        self.assertNotIn('file_path', row)
        self.assertNotIn('signed', json.dumps(row))
        for score in [float('nan'), float('inf'), True, '0.3']:
            self.assertIsNone(chunk_rows([{**NODE, 'Score': score}])[0]['score'])

    def test_missing_wrong_or_malformed_provenance_rejected(self):
        for nodes in [[{}], [{**NODE, 'Metadata': {'doc_id': 'file-test'}}], [{**NODE, 'Text': ' '}], ['bad'], 'bad']:
            with self.assertRaises(AppException):
                chunk_rows(nodes)
        with self.assertRaises(AppException):
            chunk_rows([NODE], 'other-file')

    def test_real_index_empty_nid_uses_actual_provider_record_id(self):
        row = chunk_rows([{**NODE, 'Metadata': {**NODE['Metadata'], 'nid': '', '_id': 'actual-cloud-record'}}])[0]
        self.assertEqual(row['chunk_id'], 'actual-cloud-record')
        self.assertEqual(row['chunk_id_field'], '_id')
        self.assertEqual(row['text'], NODE['Text'])
        self.assertEqual(chunk_rows([NODE])[0]['chunk_id_field'], 'nid')

    def test_business_failure_and_signed_error_are_sanitized(self):
        with self.assertRaises(AppException) as caught:
            unpack(response(Success=False, Code='https://signed.example/?secret=yes'), '检索')
        self.assertNotIn('secret', str(caught.exception))
        with self.assertRaises(AppException):
            unpack(SimpleNamespace(body=None), '检索')


class AdapterTests(unittest.IsolatedAsyncioTestCase):
    async def test_list_chunk_new_file_id_and_provider_paging(self):
        client = SimpleNamespace(list_index_documents_with_options_async=AsyncMock(return_value=response({'Documents': [{'Id': 'file-test', 'Name': '笔记', 'Status': 'FINISH'}], 'TotalCount': 138})), list_chunks_with_options_async=AsyncMock(return_value=response({'Nodes': [NODE], 'Total': 11})))
        adapter = BailianKnowledge(CONFIG, client)
        self.assertEqual((await adapter.documents(2))['total'], 138)
        self.assertEqual((await adapter.chunks('file-test', 2))['total'], 11)
        args = client.list_chunks_with_options_async.call_args.args
        self.assertEqual(args[0], CONFIG.workspace_id)
        self.assertEqual(args[1].file_id, 'file-test')
        self.assertIsNone(args[1].filed)
        self.assertEqual(args[1].page_num, 2)
        self.assertFalse(args[3].autoretry)

    async def test_retrieve_no_rewrite_or_history(self):
        method = AsyncMock(return_value=response({'Nodes': [NODE]}))
        result = await BailianKnowledge(CONFIG, SimpleNamespace(retrieve_with_options_async=method)).retrieve('  核对原文  ', False)
        request = method.call_args.args[1]
        self.assertEqual(request.query, '核对原文')
        self.assertFalse(request.save_retriever_history)
        self.assertFalse(request.enable_rewrite)
        self.assertFalse(request.enable_reranking)
        self.assertEqual(result['items'][0]['chunk_id'], 'chunk-test')
        self.assertEqual(result['request_id'], 'req-test')

    async def test_network_errors_never_disclose_credentials(self):
        method = AsyncMock(side_effect=RuntimeError('credential-secret https://signed.example/'))
        with self.assertRaises(AppException) as caught:
            await BailianKnowledge(CONFIG, SimpleNamespace(retrieve_with_options_async=method)).retrieve('问题')
        self.assertNotIn('credential', str(caught.exception))
        self.assertNotIn('signed', str(caught.exception))
        self.assertEqual(caught.exception.status_code, 502)

    async def test_invalid_query_identifier_never_call_cloud(self):
        client = SimpleNamespace(retrieve_with_options_async=AsyncMock(), list_chunks_with_options_async=AsyncMock())
        adapter = BailianKnowledge(CONFIG, client)
        for query in [' ', 'a'*501]:
            with self.assertRaises(ValidationException):
                await adapter.retrieve(query)
        with self.assertRaises(ValidationException):
            await adapter.chunks('../secret')
        client.retrieve_with_options_async.assert_not_called()
        client.list_chunks_with_options_async.assert_not_called()

    async def test_non_owner_cannot_load_config(self):
        with patch.object(settings, 'BAILIAN_OWNER_USER_ID', 'owner'), patch.object(api.KnowledgeConfig, 'load') as load:
            status = await api.status('other')
            self.assertFalse(status.data['available'])
            self.assertNotIn('index_id', status.data)
            for call in [api.documents(1, 'other'), api.chunks('file-test', 1, 'other'), api.retrieve(api.RetrieveRequest(query='问题', consent=True), 'other')]:
                with self.assertRaises(ForbiddenException):
                    await call
            load.assert_not_called()

    async def test_status_no_cloud_and_consent_required(self):
        with patch.object(settings, 'BAILIAN_OWNER_USER_ID', 'owner'), patch.object(api.KnowledgeConfig, 'load', return_value=CONFIG), patch.object(api, 'BailianKnowledge') as provider:
            self.assertTrue((await api.status('owner')).data['available'])
            provider.assert_not_called()
            with self.assertRaises(ForbiddenException):
                await api.retrieve(api.RetrieveRequest(query='问题'), 'owner')
            provider.assert_not_called()

    async def test_unconfigured_owner_cannot_expose_library(self):
        with patch.object(settings, 'BAILIAN_OWNER_USER_ID', ''):
            self.assertFalse((await api.status('owner')).data['available'])
            with self.assertRaises(ForbiddenException):
                api.provider('owner')


class HttpTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import httpx
        from fastapi import FastAPI
        from fastapi.responses import JSONResponse
        from app.core.dependencies import get_current_user_id
        self.app = FastAPI()
        self.app.include_router(api.router)
        self.app.dependency_overrides[get_current_user_id] = lambda: 'owner'
        @self.app.exception_handler(AppException)
        async def handler(request, error):
            return JSONResponse({'success': False, 'error': error.message}, status_code=error.status_code)
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')
        self.owner = patch.object(settings, 'BAILIAN_OWNER_USER_ID', 'owner')
        self.owner.start()

    async def asyncTearDown(self):
        await self.client.aclose()
        self.owner.stop()

    async def test_invalid_page_and_oversized_or_blank_query(self):
        with patch.object(api, 'provider') as provider:
            for path in ['/bailian-knowledge/documents?page=0', '/bailian-knowledge/documents?page=10001', '/bailian-knowledge/documents/file/chunks?page=-1']:
                self.assertEqual((await self.client.get(path)).status_code, 422)
            for query in [' ', 'a'*501]:
                self.assertEqual((await self.client.post('/bailian-knowledge/retrieve', json={'query': query, 'consent': True})).status_code, 422)
            provider.assert_not_called()

    async def test_missing_consent_is_403_and_no_provider(self):
        with patch.object(api, 'provider') as provider:
            self.assertEqual((await self.client.post('/bailian-knowledge/retrieve', json={'query': '问题'})).status_code, 403)
            provider.assert_not_called()

    async def test_valid_http_retrieve_passes_trimmed_query_and_consent(self):
        fake = SimpleNamespace(retrieve=AsyncMock(return_value={'items': chunk_rows([NODE])}))
        with patch.object(api, 'provider', return_value=fake):
            result = await self.client.post('/bailian-knowledge/retrieve', json={'query': '  问题  ', 'consent': True, 'rerank': False})
        self.assertEqual(result.status_code, 200)
        self.assertEqual(result.json()['data']['items'][0]['text'], NODE['Text'])
        fake.retrieve.assert_awaited_once_with('问题', False)

    async def test_non_owner_http_denial_before_credential_load(self):
        from app.core.dependencies import get_current_user_id
        self.app.dependency_overrides[get_current_user_id] = lambda: 'other'
        with patch.object(api.KnowledgeConfig, 'load') as load:
            self.assertNotIn('index_id', (await self.client.get('/bailian-knowledge/status')).json()['data'])
            self.assertEqual((await self.client.get('/bailian-knowledge/documents')).status_code, 403)
            load.assert_not_called()

    async def test_invalid_token_does_not_reach_config(self):
        self.app.dependency_overrides.clear()
        with patch.object(api.KnowledgeConfig, 'load') as load:
            self.assertEqual((await self.client.get('/bailian-knowledge/status', headers={'Authorization':'Bearer invalid'})).status_code, 401)
            load.assert_not_called()
