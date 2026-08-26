"""阿里云短信服务 — 发送/验证手机验证码。

复用自 ViralForge 项目，适配 GrowthPilot 的 config 结构。
"""

import json
import random
import string

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
    return "".join(random.choices(string.digits, k=6))


async def send_code(phone: str) -> dict:
    """发送验证码。返回 {"success": True/False, "message": "..."}"""
    redis = await get_redis()
    if not redis:
        return {"success": False, "message": "服务暂不可用"}

    # 频率限制
    if await redis.exists(_rate_key(phone)):
        ttl = await redis.ttl(_rate_key(phone))
        return {"success": False, "message": f"发送太频繁，请 {ttl} 秒后重试"}

    code = _generate_code()

    # 存 Redis
    await redis.set(_redis_key(phone), code, ex=CODE_TTL)
    await redis.set(_rate_key(phone), "1", ex=SEND_INTERVAL)
    await redis.delete(_attempt_key(phone))

    # 发送短信
    if settings.ALIBABA_SMS_ACCESS_KEY_ID:
        ok = await _send_alibaba_sms(phone, code)
        if not ok:
            return {"success": False, "message": "短信发送失败，请稍后重试"}
    else:
        logger.info("sms_dev_fallback", phone=phone, code=code)

    return {"success": True}


async def verify_code(phone: str, code: str) -> bool:
    """验证验证码。成功返回 True 并清除。"""
    redis = await get_redis()
    if not redis:
        return False

    attempts = int(await redis.get(_attempt_key(phone)) or 0)
    if attempts >= MAX_VERIFY_ATTEMPTS:
        return False

    stored = await redis.get(_redis_key(phone))
    if stored is None:
        return False
    if isinstance(stored, bytes):
        stored = stored.decode()

    await redis.incr(_attempt_key(phone))
    await redis.expire(_attempt_key(phone), CODE_TTL)

    if stored == code:
        await redis.delete(_redis_key(phone))
        await redis.delete(_attempt_key(phone))
        return True
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
        response = client.send_sms(request)
        if response.body.code == "OK":
            logger.info("sms_sent", phone=phone)
            return True
        else:
            logger.error("sms_failed", phone=phone, code=response.body.code, msg=response.body.message)
            return False
    except Exception:
        logger.exception("sms_exception", phone=phone)
        return False
