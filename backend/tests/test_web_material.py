"""Public webpage boundaries, exact snapshots, and credential-free pinned fetching."""
import asyncio
import socket
import unittest
import uuid
from unittest.mock import AsyncMock, patch

import httpx
from pydantic import ValidationError

from app.api.learning_materials import WebMaterialUpload
from app.engines.material_parser import MAX_BYTES, MaterialError
from app.engines.web_material import extract_webpage, fetch_webpage, public_address, public_url, require_public_ip

HTML = '<html><head><title>标题</title><script>忽略脚本</script></head><body><nav>菜单</nav><main><h1>原文标题</h1><p>先独立回答 &amp; 核对原文。😀</p><p>记录真实困难。</p><script>不执行</script><div hidden>隐藏内容</div></main><footer>页脚</footer></body></html>'.encode()


class WebContractTests(unittest.TestCase):
    def test_urls_reject_credentials_private_networks_controls_and_ports(self):
        urls = ['http://example.com', 'https://u:p@example.com', 'https://example.com:8443',
            'https://localhost/a', 'https://site.local', 'https://127.0.0.1', 'https://[::1]',
            'https://10.1.1.1', 'https://example.com\\@localhost', 'https://example.com/\nheader']
        for url in urls:
            with self.subTest(url=url), self.assertRaises(MaterialError):
                public_url(url)
        self.assertEqual(public_url('https://EXAMPLE.com/a#heading'), 'https://example.com/a')
        for ip in ['0.0.0.0', '169.254.169.254', '100.64.0.1', '224.0.0.1', '::ffff:8.8.8.8',
                   '64:ff9b::7f00:1', '2002:7f00:1::', 'fe80::1', 'fc00::1']:
            with self.subTest(ip=ip), self.assertRaises(MaterialError):
                require_public_ip(ip)

    def test_html_is_visible_text_with_exact_unicode_offsets(self):
        result = extract_webpage(HTML, 'text/html; charset=utf-8')
        self.assertIn('先独立回答 & 核对原文。😀', result['text'])
        for word in ['菜单', '忽略脚本', '不执行', '隐藏内容', '页脚', '<h1>']:
            self.assertNotIn(word, result['text'])
        for c in result['chunks']:
            self.assertEqual(result['text'][c['start']:c['end']], c['text'])
        self.assertTrue(result['warnings'])

    def test_unreadable_login_nontext_oversize_and_unsupported_encoding_fail(self):
        for raw, mime in [(b'<input type="password"><p>Login</p>', 'text/html'),
            (b'<script>empty</script>', 'text/html'), (b'abc', 'application/pdf'),
            (b'\xff', 'text/html; charset=utf-8'), (b'abc', 'text/plain; charset=utf-7'), (b'abc', ''),
            (b'x'*(MAX_BYTES+1), 'text/html')]:
            with self.subTest(mime=mime), self.assertRaises(MaterialError):
                extract_webpage(raw, mime)
        result = extract_webpage('<meta charset="gb18030"><p>中文正文</p>'.encode('gb18030'), 'text/html')
        self.assertIn('中文正文', result['text'])

    def test_web_upload_requires_explicit_title_and_public_url(self):
        p = WebMaterialUpload(request_id=uuid.uuid4(), title=' 原资料 ', source_url='https://example.com/a#x')
        self.assertEqual(p.title, '原资料')
        self.assertEqual(p.source_url, 'https://example.com/a')
        for patch_value in [{'title':' '}, {'source_url':'http://example.com'}, {'title':'x\ny'}, {'text':'hidden'}]:
            with self.assertRaises(ValidationError):
                WebMaterialUpload.model_validate({**p.model_dump(), **patch_value})


class WebFetchTests(unittest.IsolatedAsyncioTestCase):
    async def run_fetch(self, handler, url='https://example.com/source'):
        real_client = httpx.AsyncClient
        options = []
        def client(**kwargs):
            options.append(kwargs)
            return real_client(transport=httpx.MockTransport(handler), **kwargs)
        with patch('app.engines.web_material.public_address', AsyncMock(return_value='8.8.8.8')), \
             patch('app.engines.web_material.httpx.AsyncClient', side_effect=client):
            result = await fetch_webpage(url)
        self.assertTrue(all(x['trust_env'] is False and x['follow_redirects'] is False for x in options))
        return result

    async def test_pins_vetted_address_retains_tls_hostname_and_never_sends_credentials(self):
        def handler(req):
            self.assertEqual(req.url.host, '8.8.8.8')
            self.assertEqual(req.headers['host'], 'example.com')
            self.assertEqual(req.extensions['sni_hostname'], 'example.com')
            self.assertNotIn('authorization', req.headers)
            self.assertNotIn('cookie', req.headers)
            return httpx.Response(200, headers={'content-type':'text/html'}, stream=httpx.ByteStream(HTML))
        raw, result = await self.run_fetch(handler)
        self.assertEqual(raw, HTML)
        self.assertEqual(result['web']['final_url'], 'https://example.com/source')
        self.assertTrue(result['web']['fetched_at'])

    async def test_redirect_revalidates_destination_and_does_not_forward_set_cookie(self):
        seen = []
        def handler(req):
            seen.append(req)
            if len(seen)==1:
                return httpx.Response(302, headers={'location':'https://other.example/final','set-cookie':'private=value'})
            self.assertNotIn('cookie', req.headers)
            self.assertEqual(req.headers['host'], 'other.example')
            self.assertEqual(req.extensions['sni_hostname'], 'other.example')
            return httpx.Response(200, headers={'content-type':'text/html'}, stream=httpx.ByteStream(HTML))
        _, result = await self.run_fetch(handler)
        self.assertEqual(result['web']['final_url'], 'https://other.example/final')
        seen.clear()
        with self.assertRaises(MaterialError):
            await self.run_fetch(lambda req: httpx.Response(302, headers={'location':'https://127.0.0.1/secret'}))

    async def test_dns_mixed_answers_are_rejected_before_connecting(self):
        loop = asyncio.get_running_loop()
        answers=[(socket.AF_INET,socket.SOCK_STREAM,6,'',('8.8.8.8',443)),
                 (socket.AF_INET,socket.SOCK_STREAM,6,'',('127.0.0.1',443))]
        with patch.object(loop, 'getaddrinfo', AsyncMock(return_value=answers)), self.assertRaises(MaterialError):
            await public_address('example.com')

    async def test_redirect_limit_status_size_compression_and_timeouts_are_clear(self):
        for handler in [lambda req:httpx.Response(302,headers={'location':'/loop'}),
            lambda req:httpx.Response(403),
            lambda req:httpx.Response(200,headers={'content-length':str(MAX_BYTES+1)}),
            lambda req:httpx.Response(200,headers={'content-encoding':'gzip'}),
            lambda req:httpx.Response(200,headers={'content-type':'text/plain'},stream=httpx.ByteStream(b'x'*(MAX_BYTES+1)))]:
            with self.assertRaises(MaterialError):
                await self.run_fetch(handler)
        def timeout(req):
            raise httpx.ReadTimeout('test timeout')
        with self.assertRaisesRegex(MaterialError, '超时'):
            await self.run_fetch(timeout)
