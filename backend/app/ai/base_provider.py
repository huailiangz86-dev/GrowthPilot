"""Abstract base for LLM providers."""

from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass
from urllib.parse import urlsplit


def chat_completion_path(base_url: str) -> str:
    """httpx retains base paths: avoid appending a second /v1 to compatible endpoints."""
    return "/chat/completions" if urlsplit(base_url).path.rstrip("/").endswith("/v1") else "/v1/chat/completions"


@dataclass
class LLMResponse:
    content: str
    model: str
    input_tokens: int
    output_tokens: int
    cost_yuan: float


@dataclass
class LLMStreamChunk:
    delta: str
    finish_reason: str | None = None


class BaseLLMProvider(ABC):
    """All LLM providers must implement this interface."""

    name: str

    @abstractmethod
    async def chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> LLMResponse:
        """Synchronous (non-streaming) chat completion."""

    @abstractmethod
    async def stream_chat(
        self,
        messages: list[dict],
        model: str,
        temperature: float = 0.7,
        max_tokens: int = 2000,
    ) -> AsyncIterator[LLMStreamChunk]:
        """Streaming chat completion, yields chunks."""

    @abstractmethod
    def estimate_cost(self, model: str, input_tokens: int, output_tokens: int) -> float:
        """Estimate cost in yuan for a call."""
