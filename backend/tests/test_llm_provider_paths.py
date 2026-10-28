"""Exercise real provider HTTP request construction without an external service."""
import json
import unittest
from unittest.mock import patch

import httpx

from app.ai.deepseek_provider import DeepSeekProvider
from app.ai.qwen_provider import QwenProvider


class ProviderPathTests(unittest.IsolatedAsyncioTestCase):
    async def test_compatible_and_root_urls_send_to_a_single_v1_endpoint(self):
        cases=((QwenProvider,"https://dashscope.aliyuncs.com/compatible-mode/v1","/compatible-mode/v1/chat/completions"),
               (QwenProvider,"https://test.invalid/relay/v1/","/relay/v1/chat/completions"),
               (DeepSeekProvider,"https://api.deepseek.com","/v1/chat/completions"),
               (DeepSeekProvider,"https://test.invalid/v1","/v1/chat/completions"))
        for cls,base,path in cases:
            provider=cls();provider.base_url=base
            seen=[]
            def transport(request):
                seen.append(request)
                payload=json.loads(request.content)
                if payload.get("stream"):
                    return httpx.Response(200,content='data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n',headers={"Content-Type":"text/event-stream"})
                return httpx.Response(200,json={"model":payload["model"],"choices":[{"message":{"content":"ok"}}],"usage":{"prompt_tokens":1,"completion_tokens":1}})
            with patch.object(provider,"_get_client",new=lambda:httpx.AsyncClient(base_url=base,transport=httpx.MockTransport(transport),trust_env=False)):
                reply=await provider.chat([{"role":"user","content":"test"}])
                chunks=[chunk.delta async for chunk in provider.stream_chat([{"role":"user","content":"test"}])]
            self.assertEqual((seen[0].url.path,reply.content),(path,"ok"))
            self.assertEqual((seen[1].url.path,''.join(chunks)),(path,"ok"))
