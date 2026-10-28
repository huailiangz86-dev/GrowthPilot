"""Qwen (Aliyun DashScope) LLM provider (fallback)."""

from collections.abc import AsyncIterator

import httpx
import structlog

from app.ai.base_provider import BaseLLMProvider, LLMResponse, LLMStreamChunk, chat_completion_path
from app.core.config import settings

logger = structlog.get_logger()

QWEN_PRICING = {
    "qwen-max": {"input": 2.0, "output": 6.0},
    "qwen-plus": {"input": 0.8, "output": 2.0},
    "qwen-turbo": {"input": 0.3, "output": 0.6},
}


class QwenProvider(BaseLLMProvider):
    name = "qwen"

    def __init__(self) -> None:
        self.api_key = settings.QWEN_API_KEY
        self.base_url = settings.QWEN_BASE_URL

    def _get_client(self) -> httpx.AsyncClient:
        return httpx.AsyncClient(
            base_url=self.base_url,
            headers={"Authorization": f"Bearer {self.api_key}"},
            trust_env=False,
            timeout=60.0,
        )

    async def chat(
        self,
        messages: list[dict],
        model: str = "qwen-plus",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> LLMResponse:
        async with self._get_client() as client:
            resp = await client.post(
                chat_completion_path(self.base_url),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                },
            )
            resp.raise_for_status()
            data = resp.json()

        usage = data.get("usage", {})
        input_tokens = usage.get("prompt_tokens", 0)
        output_tokens = usage.get("completion_tokens", 0)

        return LLMResponse(
            content=data["choices"][0]["message"]["content"],
            model=model,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            cost_yuan=self.estimate_cost(model, input_tokens, output_tokens),
        )

    async def stream_chat(
        self,
        messages: list[dict],
        model: str = "qwen-plus",
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> AsyncIterator[LLMStreamChunk]:
        async with self._get_client() as client:
            async with client.stream(
                "POST",
                chat_completion_path(self.base_url),
                json={
                    "model": model,
                    "messages": messages,
                    "temperature": temperature,
                    "max_tokens": max_tokens,
                    "stream": True,
                },
            ) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data: "):
                        continue
                    payload = line[6:]
                    if payload == "[DONE]":
                        break

                    import json
                    chunk = json.loads(payload)
                    delta = chunk["choices"][0].get("delta", {})
                    content = delta.get("content", "")
                    finish = chunk["choices"][0].get("finish_reason")

                    if content:
                        yield LLMStreamChunk(delta=content, finish_reason=finish)
                    elif finish:
                        yield LLMStreamChunk(delta="", finish_reason=finish)

    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        pricing = QWEN_PRICING.get(model, {"input": 0.8, "output": 2.0})
        cost = (input_tokens * pricing["input"] + output_tokens * pricing["output"]) / 1_000_000
        return round(cost, 6)
