"""OCR API — extract trade info from screenshots.

Strategy: Upload image → Qwen VL (vision) if available → fallback to text description.
For production: integrate Tencent OCR → extract text → Qwen parse.
"""

import base64
import os

import structlog
from fastapi import APIRouter, Depends, UploadFile
from pydantic import BaseModel, Field

from app.core.dependencies import get_current_user_id
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/ocr", tags=["ocr"])


def _clear_proxy():
    for k in ["http_proxy", "https_proxy", "all_proxy", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "SOCKS_PROXY"]:
        os.environ.pop(k, None)


@router.post("/screenshot", response_model=ApiResponse[dict])
async def ocr_screenshot(
    file: UploadFile,
    user_id: str = Depends(get_current_user_id),
) -> ApiResponse[dict]:
    """Extract trade info from screenshot using Qwen VL or OCR + text parse."""
    data = await file.read()
    if len(data) > 10 * 1024 * 1024:
        return ApiResponse(success=False, error="文件太大，最大 10MB")

    img_b64 = base64.b64encode(data).decode("ascii")

    try:
        _clear_proxy()
        import httpx

        from app.core.config import settings

        # Try Qwen VL (vision model) first
        async with httpx.AsyncClient(trust_env=False, timeout=30) as client:
            resp = await client.post(
                f"{settings.QWEN_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.QWEN_API_KEY}"},
                json={
                    "model": "qwen-vl-max",
                    "messages": [{
                        "role": "user",
                        "content": [
                            {"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{img_b64}"}},
                            {"type": "text", "text": (
                                "这是一张券商/交易所截图。提取交易信息，JSON 格式返回：\n"
                                '{"symbol":"代码","symbol_name":"名称","direction":"BUY或SELL",'
                                '"price":数字,"quantity":数字,"time":"时间"}\n'
                                "无法识别的字段填 null。只返回 JSON。"
                            )},
                        ],
                    }],
                },
            )

            if resp.status_code == 200:
                result = resp.json()
                ai_text = result["choices"][0]["message"]["content"]
                from app.ai.json_guard import parse_and_repair
                parsed = parse_and_repair(ai_text)

                if parsed and isinstance(parsed, dict):
                    return ApiResponse(success=True, data={
                        "recognized": True, "method": "vision",
                        "symbol": parsed.get("symbol"), "symbol_name": parsed.get("symbol_name"),
                        "direction": parsed.get("direction"), "price": parsed.get("price"),
                        "quantity": parsed.get("quantity"), "time": parsed.get("time"),
                    })

            # Vision model failed — return guidance
            return ApiResponse(success=True, data={
                "recognized": False, "method": "none",
                "message": "截图识别暂不可用，请手动输入交易信息",
                "hint": "后续将接入腾讯 OCR 提升识别能力",
            })

    except Exception as e:
        logger.error("ocr_error", error=str(e))
        return ApiResponse(success=True, data={"recognized": False, "error": str(e), "message": "识别失败，请手动输入"})


class TextParseRequest(BaseModel):
    """User describes trade in text → AI parses into structured data."""
    text: str = Field(..., min_length=2, max_length=500, description="如: 茅台 1685 买入 100股")


@router.post("/parse-text", response_model=ApiResponse[dict])
async def parse_text(
    payload: TextParseRequest,
    user_id: str = Depends(get_current_user_id),
) -> ApiResponse[dict]:
    """Parse trade info from user text description using LLM."""
    try:
        _clear_proxy()
        import httpx

        from app.core.config import settings

        async with httpx.AsyncClient(trust_env=False, timeout=15) as client:
            resp = await client.post(
                f"{settings.QWEN_BASE_URL}/chat/completions",
                headers={"Authorization": f"Bearer {settings.QWEN_API_KEY}"},
                json={
                    "model": "qwen-plus",
                    "messages": [
                        {"role": "system", "content": (
                            "从用户输入的交易描述中提取信息，返回 JSON：\n"
                            '{"symbol_name":"名称","direction":"BUY或SELL","price":数字,"quantity":数字}\n'
                            "无法识别的字段填 null。只返回 JSON。"
                        )},
                        {"role": "user", "content": payload.text},
                    ],
                    "temperature": 0.1,
                },
            )
            resp.raise_for_status()
            ai_text = resp.json()["choices"][0]["message"]["content"]

            from app.ai.json_guard import parse_and_repair
            parsed = parse_and_repair(ai_text)

            if parsed and isinstance(parsed, dict):
                return ApiResponse(success=True, data={"recognized": True, "method": "text_parse", **parsed})

        return ApiResponse(success=True, data={"recognized": False})

    except Exception as e:
        logger.error("text_parse_error", error=str(e))
        return ApiResponse(success=True, data={"recognized": False, "error": str(e)})
