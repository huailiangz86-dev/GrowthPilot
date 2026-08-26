import json
import uuid
from urllib.parse import quote

import httpx
import structlog
from fastapi import APIRouter, Depends, Query
from fastapi.responses import RedirectResponse
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.database import get_db
from app.core.dependencies import get_current_user_id
from app.core.exceptions import NotFoundException
from app.core.redis import get_redis
from app.core.security import create_access_token
from app.models.user import User
from app.schemas.auth import AuthResponse, PhoneLoginRequest, UserMeResponse, UserUpdateRequest, WxLoginRequest
from app.schemas.common import ApiResponse

logger = structlog.get_logger()
router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/sms/send-code", response_model=ApiResponse[dict])
async def sms_send_code(
    payload: dict,
) -> ApiResponse[dict]:
    """发送短信验证码。"""
    import re
    phone = payload.get("phone", "")
    if not re.match(r"^1[3-9]\d{9}$", phone):
        return ApiResponse(success=False, error="请输入正确的手机号")

    from app.services.sms_service import send_code
    result = await send_code(phone)
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
        logger.info("user_registered_phone", user_id=str(user.id), phone=payload.phone)

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


@router.post("/wx-login", response_model=ApiResponse[AuthResponse])
async def wx_login(
    payload: WxLoginRequest,
    session: AsyncSession = Depends(get_db),
) -> ApiResponse[AuthResponse]:
    # Exchange code for openid
    if settings.WX_APP_ID and settings.WX_APP_SECRET:
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
                resp = await client.get(
                    "https://api.weixin.qq.com/sns/jscode2session",
                    params={
                        "appid": settings.WX_APP_ID,
                        "secret": settings.WX_APP_SECRET,
                        "js_code": payload.code,
                        "grant_type": "authorization_code",
                    },
                )
                data = resp.json()
            if "errcode" in data and data["errcode"] != 0:
                # Dev mode fallback: use code as openid when wx API rejects
                logger.warning("wx_dev_fallback", errmsg=data.get("errmsg"))
                openid = f"dev_{payload.code}"
            else:
                openid = data["openid"]
        except Exception:
            openid = f"dev_{payload.code}"
    else:
        openid = f"dev_{payload.code}"

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
    """Generate WeChat OAuth QR code URL for web login."""
    if not settings.WX_WEB_APP_ID:
        return ApiResponse(success=False, error="微信网页登录未配置，请使用手机号或开发者登录")

    state = uuid.uuid4().hex[:16]
    redis = await get_redis()
    if redis:
        await redis.setex(f"wx_web_state:{state}", 300, "pending")

    qr_url = (
        f"https://open.weixin.qq.com/connect/qrconnect"
        f"?appid={settings.WX_WEB_APP_ID}"
        f"&redirect_uri={quote(settings.WX_WEB_REDIRECT_URI)}"
        f"&response_type=code"
        f"&scope=snsapi_login"
        f"&state={state}"
        f"#wechat_redirect"
    )
    return ApiResponse(success=True, data={"qr_url": qr_url, "state": state})


@router.get("/wx-web/callback")
async def wx_web_callback(
    code: str = Query(...),
    state: str = Query(""),
    session: AsyncSession = Depends(get_db),
):
    """WeChat OAuth callback — exchanges code for token, redirects to frontend."""
    redis = await get_redis()
    if redis and state:
        saved = await redis.get(f"wx_web_state:{state}")
        if not saved:
            return RedirectResponse(url="/login?error=invalid_state")

    openid = ""
    unionid = ""
    nickname = "微信用户"

    if settings.WX_WEB_APP_ID and settings.WX_WEB_APP_SECRET:
        try:
            async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
                resp = await client.get(
                    "https://api.weixin.qq.com/sns/oauth2/access_token",
                    params={
                        "appid": settings.WX_WEB_APP_ID,
                        "secret": settings.WX_WEB_APP_SECRET,
                        "code": code, "grant_type": "authorization_code",
                    },
                )
                data = resp.json()
            if data.get("errcode") and data["errcode"] != 0:
                logger.error("wx_web_oauth_error", error=data)
                return RedirectResponse(url="/login?error=wx_auth_failed")
            openid = data.get("openid", "")
            unionid = data.get("unionid", "")
            wx_token = data.get("access_token", "")
            if wx_token:
                async with httpx.AsyncClient(trust_env=False, timeout=10) as client:
                    info_resp = await client.get("https://api.weixin.qq.com/sns/userinfo",
                        params={"access_token": wx_token, "openid": openid})
                    info = info_resp.json()
                    nickname = info.get("nickname", "微信用户")
        except Exception as e:
            logger.error("wx_web_callback_error", error=str(e))
            return RedirectResponse(url="/login?error=network")
    else:
        return RedirectResponse(url="/login?error=not_configured")

    # Find or create user (try unionid first for cross-platform linking)
    user = None
    if unionid:
        result = await session.execute(select(User).where(User.wx_unionid == unionid))
        user = result.scalar_one_or_none()
    if not user and openid:
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
    if redis and state:
        await redis.setex(f"wx_web_token:{state}", 300, json.dumps({"token": token, "user_id": str(user.id)}))

    return RedirectResponse(url=f"/login?token={token}")


@router.get("/wx-web/poll", response_model=ApiResponse[dict])
async def wx_web_poll(state: str = Query(...)) -> ApiResponse[dict]:
    """Poll for QR scan login result."""
    redis = await get_redis()
    if not redis:
        return ApiResponse(success=True, data={"status": "waiting"})
    result = await redis.get(f"wx_web_token:{state}")
    if result:
        await redis.delete(f"wx_web_token:{state}")
        return ApiResponse(success=True, data={"status": "ok", **json.loads(result)})
    pending = await redis.get(f"wx_web_state:{state}")
    return ApiResponse(success=True, data={"status": "expired" if not pending else "waiting"})
