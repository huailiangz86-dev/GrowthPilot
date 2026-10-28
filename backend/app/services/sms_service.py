"""阿里云短信服务 — 发送/验证手机验证码。

复用自 ViralForge 项目，适配 GrowthPilot 的 config 结构。
"""

import asyncio
import json
import secrets

import structlog

from app.core.config import settings
from app.core.redis import get_redis

logger = structlog.get_logger()

CODE_TTL = 300          # 验证码有效期 5 分钟
SEND_INTERVAL = 60      # 发送间隔 60 秒
MAX_VERIFY_ATTEMPTS = 5  # 最多验证 5 次


def _redis_key(phone: str) -> str:
    return f"sms:code:{phone}"

def _rate_key(phone: str) -> str:
    return f"sms:rate:{phone}"

def _attempt_key(phone: str) -> str:
    return f"sms:attempt:{phone}"

def _generate_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def sms_configured() -> bool:
    return all((settings.ALIBABA_SMS_ACCESS_KEY_ID, settings.ALIBABA_SMS_ACCESS_KEY_SECRET,
                settings.ALIBABA_SMS_SIGN_NAME, settings.ALIBABA_SMS_TEMPLATE_CODE))


async def send_code(phone: str) -> dict:
    if not sms_configured():
        return {"success": False, "message": "短信登录尚未配置，请使用其他登录方式"}
    try:
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("state storage unavailable")
        # One atomic reservation also prevents concurrent sends bypassing the
        # cooldown while the provider request is still in progress.
        reserved = await redis.set(_rate_key(phone), "1", ex=SEND_INTERVAL, nx=True)
        if not reserved:
            ttl = max(1, await redis.ttl(_rate_key(phone)))
            return {"success": False, "message": f"发送太频繁，请 {ttl} 秒后重试"}
        code = _generate_code()
        await redis.set(_redis_key(phone), code, ex=CODE_TTL)
        await redis.delete(_attempt_key(phone))
        if not await _send_alibaba_sms(phone, code):
            await redis.delete(_redis_key(phone))
            return {"success": False, "message": "短信发送失败，请稍后重试"}
        return {"success": True}
    except Exception:
        logger.warning("sms_state_unavailable")
        return {"success": False, "message": "短信服务暂不可用，请稍后重试"}


async def verify_code(phone: str, code: str) -> bool:
    if not sms_configured() or len(code) != 6 or not code.isdigit():
        return False
    try:
        redis = await get_redis()
        if redis is None:
            return False
        # Attempts, comparison and consumption are one operation: concurrent
        # correct submissions cannot both consume the same SMS credential.
        result = await redis.eval(
            "local stored=redis.call('GET',KEYS[1]); "
            "if not stored then return 0 end; "
            "local attempts=tonumber(redis.call('GET',KEYS[2]) or '0'); "
            "if attempts >= tonumber(ARGV[2]) then return 0 end; "
            "redis.call('INCR',KEYS[2]); redis.call('EXPIRE',KEYS[2],ARGV[3]); "
            "if stored == ARGV[1] then redis.call('DEL',KEYS[1],KEYS[2]); return 1 end; return 0",
            2, _redis_key(phone), _attempt_key(phone), code, MAX_VERIFY_ATTEMPTS, CODE_TTL,
        )
        return result == 1
    except Exception:
        logger.warning("sms_verification_unavailable")
        return False


async def _send_alibaba_sms(phone: str, code: str) -> bool:
    """调用阿里云 SMS API。"""
    try:
        from alibabacloud_dysmsapi20170525.client import Client
        from alibabacloud_dysmsapi20170525.models import SendSmsRequest
        from alibabacloud_tea_openapi.models import Config

        config = Config(
            access_key_id=settings.ALIBABA_SMS_ACCESS_KEY_ID,
            access_key_secret=settings.ALIBABA_SMS_ACCESS_KEY_SECRET,
            endpoint="dysmsapi.aliyuncs.com",
        )
        client = Client(config)
        request = SendSmsRequest(
            phone_numbers=phone,
            sign_name=settings.ALIBABA_SMS_SIGN_NAME,
            template_code=settings.ALIBABA_SMS_TEMPLATE_CODE,
            template_param=json.dumps({"code": code}),
        )
        response = await asyncio.to_thread(client.send_sms, request)
        if response.body.code == "OK":
            logger.info("sms_sent")
            return True
        else:
            logger.warning("sms_provider_rejected")
            return False
    except Exception:
        logger.warning("sms_provider_unavailable")
        return False
