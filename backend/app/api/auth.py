import json
import uuid
from urllib.parse import quote, urlsplit

import httpx
import structlog
from fastapi import APIRouter, Depends, Query, Request
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.deployment import public_origin
from app.core.exceptions import ForbiddenException, NotFoundException
from app.core.redis import get_redis
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import AuthResponse, PhoneLoginRequest, SmsCodeRequest, UserMeResponse, UserUpdateRequest, WxLoginRequest
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sms/send-code", response_model=ApiResponse[dict])
async def sms_send_code(
    payload: SmsCodeRequest,
) -> ApiResponse[dict]:
    """发送短信验证码。"""
    from app.services.sms_service import send_code
    result = await send_code(payload.phone)
    if not result["success"]:
        return ApiResponse(success=False, error=result["message"])
    return ApiResponse(success=True, data={"sent": True})


@router.post("/phone-login", response_model=ApiResponse[AuthResponse])
async def phone_login(
    payload: PhoneLoginRequest,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    """手机号+验证码登录。"""
    if len(payload.code) != 6 or not payload.code.isdigit():
        return ApiResponse(success=False, error="请输入6位验证码")

    # Verify SMS code
    from app.services.sms_service import verify_code
    if not await verify_code(payload.phone, payload.code):
        return ApiResponse(success=False, error="验证码错误或已过期")

    # Find or create user by phone
    result = await session.execute(select(User).where(User.phone == payload.phone))
    user = result.scalar_one_or_none()
    is_new = False

    if user is None:
        # Check beta eligibility
        count_result = await session.execute(select(func.count()).select_from(User))
        total_users = count_result.scalar_one()
        is_beta = total_users < settings.BETA_USER_LIMIT
        beta_number = total_users + 1 if is_beta else None

        user = User(
            id=uuid.uuid4(),
            wx_openid=f"phone_{payload.phone}",
            phone=payload.phone,
            nickname="交易者",
            is_beta_user=is_beta,
            beta_number=beta_number,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        is_new = True
        logger.info("user_registered_phone", user_id=str(user.id))

    token = create_access_token({"sub": str(user.id)})
    return ApiResponse(
        success=True,
        data=AuthResponse(
            access_token=token,
            user_id=str(user.id),
            is_new_user=is_new,
            is_beta_user=user.is_beta_user,
            beta_number=user.beta_number,
        ),
    )


def development_login_allowed(request: Request) -> bool:
    local_hosts = {"127.0.0.1", "::1", "localhost"}
    origin = request.headers.get("origin")
    try:
        host = request.url.hostname
        origin_host = urlsplit(origin).hostname if origin else None
    except ValueError:
        return False
    return (
        settings.APP_ENV == "development"
        and settings.DEV_AUTH_ENABLED
        and request.client is not None
        and request.client.host in local_hosts
        and host in local_hosts
        and (not origin or origin_host in local_hosts)
        and request.headers.get("sec-fetch-site") != "cross-site"
    )


def web_login_redirect() -> str:
    expected = f"{public_origin(settings.PUBLIC_BASE_URL)}{settings.API_V1_PREFIX}/auth/wx-web/callback"
    configured = settings.WX_WEB_REDIRECT_URI.strip()
    if configured and configured != expected:
        raise ValueError("微信回调地址必须与服务器部署域名和回调路径一致")
    return expected


@router.get("/options", response_model=ApiResponse[dict])
async def login_options(request: Request) -> ApiResponse[dict]:
    from app.services.sms_service import sms_configured
    try:
        web_ready = bool(settings.WX_WEB_APP_ID and settings.WX_WEB_APP_SECRET and web_login_redirect())
    except ValueError:
        web_ready = False
    return ApiResponse(success=True, data={
        "development_login": development_login_allowed(request),
        "phone_login": sms_configured(),
        "wechat_web_login": web_ready,
    })


@router.post("/dev-login", response_model=ApiResponse[AuthResponse])
async def dev_login(payload: WxLoginRequest, request: Request, session: AsyncSession = Depends(get_db)) -> ApiResponse[AuthResponse]:
    if not development_login_allowed(request):
        raise ForbiddenException("开发登录仅供显式开启的本机开发环境使用")
    import re
    if not re.fullmatch(r"dev_[A-Za-z0-9_-]{1,100}", payload.code):
        return ApiResponse(success=False, error="开发登录标识无效")
    # Preserve the historical local account mapping; never use this path as a
    # fallback for rejected WeChat credentials.
    return await _wx_user_response(payload, f"dev_{payload.code}", session)


@router.post("/wx-login", response_model=ApiResponse[AuthResponse])
async def wx_login(payload: WxLoginRequest, session: AsyncSession = Depends(get_db)) -> ApiResponse[AuthResponse]:
    if not settings.WX_APP_ID or not settings.WX_APP_SECRET:
        return ApiResponse(success=False, error="微信登录未配置")
    try:
        async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
            resp = await client.get("https://api.weixin.qq.com/sns/jscode2session", params={
                "appid": settings.WX_APP_ID, "secret": settings.WX_APP_SECRET,
                "js_code": payload.code, "grant_type": "authorization_code",
            })
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, dict) or data.get("errcode") not in (None, 0):
            return ApiResponse(success=False, error="微信验证失败，请重新登录")
        openid = data.get("openid")
        if not isinstance(openid, str) or not openid.strip():
            return ApiResponse(success=False, error="微信未返回有效身份，请重新登录")
    except (httpx.HTTPError, ValueError, TypeError):
        logger.warning("wx_login_unavailable")
        return ApiResponse(success=False, error="微信验证暂不可用，请稍后重试")
    return await _wx_user_response(payload, openid, session)


async def _wx_user_response(payload: WxLoginRequest, openid: str, session: AsyncSession) -> ApiResponse[AuthResponse]:
    # Find or create user
    result = await session.execute(select(User).where(User.wx_openid == openid))
    user = result.scalar_one_or_none()
    is_new = False

    if user is None:
        # Check beta eligibility
        count_result = await session.execute(select(func.count()).select_from(User))
        total_users = count_result.scalar_one()
        is_beta = total_users < settings.BETA_USER_LIMIT
        beta_number = total_users + 1 if is_beta else None

        user = User(
            id=uuid.uuid4(),
            wx_openid=openid,
            nickname=payload.nickname or "交易者",
            avatar_url=payload.avatar_url,
            markets=payload.markets,
            review_schedule=payload.review_schedule,
            is_beta_user=is_beta,
            beta_number=beta_number,
        )
        session.add(user)
        await session.commit()
        await session.refresh(user)
        is_new = True
        logger.info("user_registered", user_id=str(user.id), beta=is_beta, beta_number=beta_number)

    token = create_access_token({"sub": str(user.id)})
    return ApiResponse(
        success=True,
        data=AuthResponse(
            access_token=token,
            user_id=str(user.id),
            is_new_user=is_new,
            is_beta_user=user.is_beta_user,
            beta_number=user.beta_number,
        ),
    )


@router.get("/me", response_model=ApiResponse[UserMeResponse])
async def get_me(
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[UserMeResponse]:
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    return ApiResponse(
        success=True,
        data=UserMeResponse(
            id=str(user.id), nickname=user.nickname, avatar_url=user.avatar_url,
            markets=user.markets, review_schedule=user.review_schedule,
            is_beta_user=user.is_beta_user, beta_number=user.beta_number,
        ),
    )


@router.patch("/me", response_model=ApiResponse[UserMeResponse])
async def update_me(
    payload: UserUpdateRequest,
    user_id: str = Depends(get_current_user_id),
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[UserMeResponse]:
    result = await session.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise NotFoundException("User")
    for key, value in payload.model_dump(exclude_unset=True).items():
        setattr(user, key, value)
    await session.commit()
    await session.refresh(user)
    return ApiResponse(
        success=True,
        data=UserMeResponse(
            id=str(user.id), nickname=user.nickname, avatar_url=user.avatar_url,
            markets=user.markets, review_schedule=user.review_schedule,
            is_beta_user=user.is_beta_user, beta_number=user.beta_number,
        ),
    )


# ── WeChat Web OAuth (QR Code Login) ──

@router.get("/wx-web/qr-url", response_model=ApiResponse[dict])
async def wx_web_qr_url() -> ApiResponse[dict]:
    if not settings.WX_WEB_APP_ID or not settings.WX_WEB_APP_SECRET:
        return ApiResponse(success=False, error="微信网页登录未配置，请使用其他登录方式")
    try:
        redirect_uri = web_login_redirect()
    except ValueError:
        return ApiResponse(success=False, error="微信网页登录的服务器域名或回调地址尚未配置")
    state = uuid.uuid4().hex
    try:
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("state storage unavailable")
        await redis.setex(f"wx_web_state:{state}", 300, "pending")
    except Exception:
        logger.warning("wx_web_state_unavailable")
        return ApiResponse(success=False, error="登录状态服务暂不可用，请稍后重试")
    qr_url = (
        f"https://open.weixin.qq.com/connect/qrconnect?appid={settings.WX_WEB_APP_ID}"
        f"&redirect_uri={quote(redirect_uri, safe='')}&response_type=code"
        f"&scope=snsapi_login&state={state}#wechat_redirect"
    )
    return ApiResponse(success=True, data={"qr_url": qr_url, "state": state})


@router.get("/wx-web/callback")
async def wx_web_callback(code: str = Query(...), state: str = Query(""), session: AsyncSession = Depends(get_db)):
    if not settings.WX_WEB_APP_ID or not settings.WX_WEB_APP_SECRET:
        return RedirectResponse(url="/login?error=not_configured")
    if not state or len(state) != 32:
        return RedirectResponse(url="/login?error=invalid_state")
    try:
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("state storage unavailable")
        # Atomic transition permits exactly one exchange. Keep a processing
        # marker so the initiating tab continues polling during provider I/O.
        claimed = await redis.eval(
            "if redis.call('GET',KEYS[1]) == 'pending' then "
            "redis.call('SET',KEYS[1],'processing','EX',ARGV[1]); return 1 else return 0 end",
            1, f"wx_web_state:{state}", 300,
        )
        if claimed != 1:
            return RedirectResponse(url="/login?error=invalid_state")
    except Exception:
        logger.warning("wx_web_state_unavailable")
        return RedirectResponse(url="/login?error=state_unavailable")

    try:
        async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
            resp = await client.get("https://api.weixin.qq.com/sns/oauth2/access_token", params={
                "appid": settings.WX_WEB_APP_ID, "secret": settings.WX_WEB_APP_SECRET,
                "code": code, "grant_type": "authorization_code",
            })
            resp.raise_for_status()
            data = resp.json()
        if not isinstance(data, dict) or data.get("errcode") not in (None, 0) or not isinstance(data.get("openid"), str) or not data["openid"].strip():
            await redis.delete(f"wx_web_state:{state}")
            return RedirectResponse(url="/login?error=wx_auth_failed")
        openid = data["openid"]
        unionid = data.get("unionid") if isinstance(data.get("unionid"), str) else ""
        nickname = "微信用户"
        wx_token = data.get("access_token")
        if wx_token:
            # A profile lookup failure cannot substitute a different identity.
            try:
                async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
                    info_resp = await client.get("https://api.weixin.qq.com/sns/userinfo", params={"access_token": wx_token, "openid": openid})
                    info_resp.raise_for_status()
                    info = info_resp.json()
                    if isinstance(info, dict) and isinstance(info.get("nickname"), str):
                        nickname = info["nickname"][:64]
            except (httpx.HTTPError, ValueError, TypeError):
                pass
    except (httpx.HTTPError, ValueError, TypeError):
        await redis.delete(f"wx_web_state:{state}")
        logger.warning("wx_web_exchange_unavailable")
        return RedirectResponse(url="/login?error=network")

    user = None
    if unionid:
        result = await session.execute(select(User).where(User.wx_unionid == unionid))
        user = result.scalar_one_or_none()
    if user is None:
        result = await session.execute(select(User).where(User.wx_openid == openid))
        user = result.scalar_one_or_none()
    if user is None:
        count_result = await session.execute(select(func.count()).select_from(User))
        total = count_result.scalar_one()
        user = User(id=uuid.uuid4(), wx_openid=openid, wx_unionid=unionid or None,
                    nickname=nickname, is_beta_user=total < settings.BETA_USER_LIMIT,
                    beta_number=total + 1 if total < settings.BETA_USER_LIMIT else None)
        session.add(user)
        await session.commit()
        await session.refresh(user)
        logger.info("user_registered_wx_web", user_id=str(user.id))
    elif unionid and not user.wx_unionid:
        user.wx_unionid = unionid
        await session.commit()
    token = create_access_token({"sub": str(user.id)})
    try:
        await redis.setex(f"wx_web_token:{state}", 300, json.dumps({"token": token, "user_id": str(user.id)}))
        await redis.delete(f"wx_web_state:{state}")
    except Exception:
        logger.warning("wx_web_receipt_unavailable")
        return RedirectResponse(url="/login?error=state_unavailable")
    # The initiating tab receives a one-use result through polling. Bearer
    # credentials never appear in redirect URLs or browser request logs.
    return RedirectResponse(url="/login?wx=confirmed")


@router.get("/wx-web/poll", response_model=ApiResponse[dict])
async def wx_web_poll(state: str = Query(..., min_length=32, max_length=32)) -> ApiResponse[dict]:
    try:
        redis = await get_redis()
        if redis is None:
            raise RuntimeError("state storage unavailable")
        result = await redis.getdel(f"wx_web_token:{state}")
        if result:
            return ApiResponse(success=True, data={"status": "ok", **json.loads(result)})
        pending = await redis.get(f"wx_web_state:{state}")
        return ApiResponse(success=True, data={"status": "waiting" if pending in ("pending", "processing", b"pending", b"processing") else "expired"})
    except Exception:
        logger.warning("wx_web_state_unavailable")
        return ApiResponse(success=False, error="登录状态服务暂不可用，请刷新二维码重试")
