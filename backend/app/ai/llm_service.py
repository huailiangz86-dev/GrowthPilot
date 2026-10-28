"""Unified LLM service — the ONLY way to call LLMs (Red Line R-04).

All AI calls go through this module. It handles:
- Provider routing (primary → fallback)
- Retry logic (3 attempts)
- Cost tracking (llm_calls table)
- JSON output validation + repair
"""

import time
from collections.abc import AsyncIterator

import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.base_provider import BaseLLMProvider
from app.ai.deepseek_provider import DeepSeekProvider
from app.ai.json_guard import parse_and_repair, validate_schema
from app.ai.prompt_loader import render_prompt
from app.ai.prompt_router import PromptVariant, get_variant
from app.ai.qwen_provider import QwenProvider
from app.core.exceptions import LLMServiceException
from app.models.llm_call import LLMCall

logger = structlog.get_logger()

# Provider instances — Qwen as primary (has API key), DeepSeek as fallback
_primary: BaseLLMProvider = QwenProvider()
_fallback: BaseLLMProvider = DeepSeekProvider()

# Model mapping: provider → default model
PROVIDER_MODELS = {
    "deepseek": "deepseek-chat",
    "qwen": "qwen-plus",
}

MAX_RETRIES = 3


async def _record_call(
    session: AsyncSession,
    user_id: str | None,
    purpose: str,
    model: str,
    prompt_version: str,
    input_tokens: int,
    output_tokens: int,
    cost_yuan: float,
    latency_ms: int,
    status: str = "success",
    error_message: str | None = None,
) -> None:
    """Record LLM call to llm_calls table (Red Line R-04)."""
    import uuid

    call = LLMCall(
        id=uuid.uuid4(),
        user_id=uuid.UUID(user_id) if user_id else None,
        purpose=purpose,
        model=model,
        prompt_version=prompt_version,
        input_tokens=input_tokens,
        output_tokens=output_tokens,
        cost_yuan=cost_yuan,
        latency_ms=latency_ms,
        status=status,
        error_message=error_message,
    )
    session.add(call)
    await session.commit()


def _select_provider(variant: PromptVariant) -> tuple[BaseLLMProvider, str]:
    """Select provider and model based on prompt variant preference."""
    pref = variant.model_preference
    for provider in (_primary, _fallback):
        if provider.name in pref:
            return provider, pref
    return _primary, PROVIDER_MODELS[_primary.name]


async def structured_output(
    session: AsyncSession,
    user_id: str | None,
    purpose: str,
    variables: dict,
    variant: PromptVariant | None = None,
) -> dict:
    """Call LLM and parse structured JSON output.

    Handles retry, fallback, JSON repair, and schema validation.
    """
    if variant is None:
        variant = await get_variant(user_id or "system", purpose)

    system_prompt, user_prompt = render_prompt(variant.data, variables)
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt},
    ]

    provider, model = _select_provider(variant)
    alternate = _fallback if provider is _primary else _primary
    last_error: Exception | None = None

    attempts = 1 if variant.data.get('evidence_selection', False) else MAX_RETRIES
    for attempt in range(attempts):
        current_provider = provider if attempt < 2 else alternate
        current_model = model if attempt < 2 else PROVIDER_MODELS[alternate.name]

        start = time.monotonic()
        try:
            response = await current_provider.chat(
                messages=messages,
                model=current_model,
                temperature=variant.temperature,
                max_tokens=variant.max_tokens,
            )
            latency = int((time.monotonic() - start) * 1000)

            # Parse and validate JSON
            result = parse_and_repair(response.content)
            if result is None:
                raise ValueError("Failed to parse JSON from LLM output")

            # Schema validation (if defined in prompt)
            schema = variant.data.get("output_schema")
            if schema and isinstance(result, dict):
                errors = validate_schema(result, schema)
                if errors:
                    logger.warning("json_schema_errors", errors=errors, purpose=purpose)

            # Record successful call
            status = "fallback" if attempt >= 2 else "success"
            await _record_call(
                session=session,
                user_id=user_id,
                purpose=purpose,
                model=response.model,
                prompt_version=variant.version,
                input_tokens=response.input_tokens,
                output_tokens=response.output_tokens,
                cost_yuan=response.cost_yuan,
                latency_ms=latency,
                status=status,
            )

            return result

        except Exception as e:
            latency = int((time.monotonic() - start) * 1000)
            last_error = e
            logger.warning(
                "llm_call_failed",
                attempt=attempt + 1,
                provider=current_provider.name,
                model=current_model,
                error=str(e),
            )

            # Record failed attempt
            await _record_call(
                session=session,
                user_id=user_id,
                purpose=purpose,
                model=current_model,
                prompt_version=variant.version,
                input_tokens=0,
                output_tokens=0,
                cost_yuan=0,
                latency_ms=latency,
                status="error",
                error_message=str(e)[:500],
            )

    raise LLMServiceException(f"All {attempts} attempts failed: {last_error}")


async def stream_chat(
    session: AsyncSession,
    user_id: str | None,
    purpose: str,
    messages: list[dict],
    variant: PromptVariant | None = None,
) -> AsyncIterator[str]:
    """Stream chat completion, yielding text chunks.

    Used for AI review dialogue (SSE to frontend).
    """
    if variant is None:
        variant = await get_variant(user_id or "system", purpose)

    provider, model = _select_provider(variant)
    start = time.monotonic()
    total_output = ""

    try:
        async for chunk in provider.stream_chat(
            messages=messages,
            model=model,
            temperature=variant.temperature,
            max_tokens=variant.max_tokens,
        ):
            total_output += chunk.delta
            yield chunk.delta

        latency = int((time.monotonic() - start) * 1000)
        # Estimate tokens (rough: 1 token ≈ 1.5 Chinese chars)
        est_output_tokens = len(total_output) * 2 // 3
        est_input_tokens = sum(len(m.get("content", "")) for m in messages) * 2 // 3

        await _record_call(
            session=session,
            user_id=user_id,
            purpose=purpose,
            model=model,
            prompt_version=variant.version,
            input_tokens=est_input_tokens,
            output_tokens=est_output_tokens,
            cost_yuan=provider.estimate_cost(model, est_input_tokens, est_output_tokens),
            latency_ms=latency,
        )

    except Exception as e:
        latency = int((time.monotonic() - start) * 1000)
        await _record_call(
            session=session,
            user_id=user_id,
            purpose=purpose,
            model=model,
            prompt_version=variant.version,
            input_tokens=0,
            output_tokens=0,
            cost_yuan=0,
            latency_ms=latency,
            status="error",
            error_message=str(e)[:500],
        )
        raise LLMServiceException(f"Stream failed: {e}")


async def classify(
    session: AsyncSession,
    user_id: str | None,
    purpose: str,
    text: str,
    categories: list[str],
) -> str:
    """Lightweight classification (uses low temperature, short output).

    Used for emotion classification, trade tagging, etc.
    """
    system = (
        "你是一个分类器。根据用户输入，从给定类别中选择最匹配的一个。"
        "只输出类别名称，不要其他内容。"
    )
    user = f"类别列表: {', '.join(categories)}\n\n待分类文本: {text}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    start = time.monotonic()
    try:
        response = await _primary.chat(
            messages=messages,
            model=PROVIDER_MODELS[_primary.name],
            temperature=0.1,
            max_tokens=50,
        )
        latency = int((time.monotonic() - start) * 1000)

        result = response.content.strip()
        # Validate result is one of the categories
        if result not in categories:
            # Fuzzy match
            for cat in categories:
                if cat in result:
                    result = cat
                    break

        await _record_call(
            session=session,
            user_id=user_id,
            purpose=purpose,
            model=response.model,
            prompt_version="classify",
            input_tokens=response.input_tokens,
            output_tokens=response.output_tokens,
            cost_yuan=response.cost_yuan,
            latency_ms=latency,
        )

        return result

    except Exception as e:
        latency = int((time.monotonic() - start) * 1000)
        await _record_call(
            session=session,
            user_id=user_id,
            purpose=purpose,
            model=PROVIDER_MODELS[_primary.name],
            prompt_version="classify",
            input_tokens=0,
            output_tokens=0,
            cost_yuan=0,
            latency_ms=latency,
            status="error",
            error_message=str(e)[:500],
        )
        raise LLMServiceException(f"Classification failed: {e}")
