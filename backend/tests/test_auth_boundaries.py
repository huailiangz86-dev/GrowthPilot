"""Authentication rejects unverified identities and consumes callbacks exactly once."""
import asyncio
import json
import os
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
from fastapi import Request
from pydantic import ValidationError
from redis.asyncio import Redis

from app.api import auth
from app.core.config import Settings
from app.core.exceptions import ForbiddenException
from app.core.security import validate_auth_configuration
from app.schemas.auth import SmsCodeRequest, WxLoginRequest
from app.services import sms_service as sms


def request(host="127.0.0.1", client="127.0.0.1", origin=None, fetch_site=None):
    headers = [(b"host", host.encode())]
    if origin:
        headers.append((b"origin", origin.encode()))
    if fetch_site:
        headers.append((b"sec-fetch-site", fetch_site.encode()))
    return Request({"type": "http", "scheme": "http", "path": "/api/v1/auth/dev-login", "headers": headers,
                    "client": (client, 1234), "server": (host, 8002), "query_string": b""})


def existing_session():
    user = SimpleNamespace(id=uuid.uuid4(), is_beta_user=False, beta_number=None, wx_unionid=None)
    session = MagicMock()
    session.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: user))
    session.commit = AsyncMock()
    return session, user


def provider(data=None, error=None):
    client = AsyncMock()
    if error:
        client.get.side_effect = error
    else:
        client.get.return_value = httpx.Response(200, json=data, request=httpx.Request("GET", "https://api.weixin.qq.com/test"))
    client.__aenter__.return_value = client
    return patch.object(auth.httpx, "AsyncClient", return_value=client), client


class AuthenticationBoundaries(unittest.IsolatedAsyncioTestCase):
    def test_default_settings_never_enable_development_login(self):
        config = Settings(_env_file=None)
        self.assertEqual(config.APP_ENV, "production")
        self.assertFalse(config.DEV_AUTH_ENABLED)

    def test_production_startup_requires_own_signing_secret_and_disabled_dev_auth(self):
        for values in ({"JWT_SECRET": "growthpilot-change-me-in-production", "DEV_AUTH_ENABLED": False},
                       {"JWT_SECRET": "short", "DEV_AUTH_ENABLED": False},
                       {"JWT_SECRET": "synthetic-secret-at-least-thirty-two-characters", "DEV_AUTH_ENABLED": True}):
            with patch.multiple(auth.settings, APP_ENV="production", **values), self.assertRaises(RuntimeError):
                validate_auth_configuration()
        with patch.multiple(auth.settings, APP_ENV="production", DEV_AUTH_ENABLED=False, JWT_SECRET="synthetic-secret-at-least-thirty-two-characters"):
            validate_auth_configuration()

    def test_development_requires_flag_environment_loopback_host_and_origin(self):
        with patch.multiple(auth.settings, APP_ENV="development", DEV_AUTH_ENABLED=True):
            self.assertTrue(auth.development_login_allowed(request()))
            for req in (request(client="198.51.100.1"), request(host="example.test"),
                        request(origin="https://example.test"), request(origin="http://[invalid"), request(fetch_site="cross-site")):
                self.assertFalse(auth.development_login_allowed(req))
        for values in ({"APP_ENV": "production", "DEV_AUTH_ENABLED": True}, {"APP_ENV": "development", "DEV_AUTH_ENABLED": False}):
            with patch.multiple(auth.settings, **values):
                self.assertFalse(auth.development_login_allowed(request()))

    async def test_disallowed_dev_login_does_not_access_accounts(self):
        session, _ = existing_session()
        with patch.multiple(auth.settings, APP_ENV="production", DEV_AUTH_ENABLED=True):
            with self.assertRaises(ForbiddenException):
                await auth.dev_login(WxLoginRequest(code="dev_auto_login"), request(), session)
        session.execute.assert_not_awaited()

    async def test_local_development_retains_existing_account_mapping(self):
        response = auth.ApiResponse(success=False, error="test-only")
        with patch.multiple(auth.settings, APP_ENV="development", DEV_AUTH_ENABLED=True), patch.object(auth, "_wx_user_response", AsyncMock(return_value=response)) as login:
            await auth.dev_login(WxLoginRequest(code="dev_auto_login"), request(), MagicMock())
        self.assertEqual(login.call_args.args[1], "dev_dev_auto_login")

    async def test_wechat_without_credentials_cannot_become_a_developer(self):
        session, _ = existing_session()
        with patch.multiple(auth.settings, WX_APP_ID="", WX_APP_SECRET="", DEV_AUTH_ENABLED=True), patch.object(auth, "create_access_token") as sign:
            result = await auth.wx_login(WxLoginRequest(code="dev_auto_login"), session)
        self.assertFalse(result.success)
        session.execute.assert_not_awaited()
        sign.assert_not_called()

    async def test_rejected_missing_or_malformed_wechat_identity_never_touches_database(self):
        for data in ({"errcode": 40029}, {}, {"openid": " "}, {"openid": []}, ["not an identity"]):
            session, _ = existing_session()
            stub, _ = provider(data)
            with self.subTest(data=data), patch.multiple(auth.settings, WX_APP_ID="synthetic", WX_APP_SECRET="synthetic"), stub, patch.object(auth, "create_access_token") as sign:
                result = await auth.wx_login(WxLoginRequest(code="invalid"), session)
                self.assertFalse(result.success)
                session.execute.assert_not_awaited()
                session.add.assert_not_called()
                sign.assert_not_called()

    async def test_network_failure_does_not_create_a_fallback_identity(self):
        session, _ = existing_session()
        stub, _ = provider(error=httpx.ConnectError("synthetic"))
        with patch.multiple(auth.settings, WX_APP_ID="synthetic", WX_APP_SECRET="synthetic"), stub:
            result = await auth.wx_login(WxLoginRequest(code="invalid"), session)
        self.assertFalse(result.success)
        session.execute.assert_not_awaited()

    async def test_verified_wechat_identity_uses_existing_account(self):
        session, user = existing_session()
        stub, _ = provider({"openid": "verified-synthetic"})
        with patch.multiple(auth.settings, WX_APP_ID="synthetic", WX_APP_SECRET="synthetic"), stub, patch.object(auth, "create_access_token", return_value="synthetic-token") as sign:
            result = await auth.wx_login(WxLoginRequest(code="one-use-provider-code"), session)
        self.assertEqual(result.data.user_id, str(user.id))
        self.assertEqual(sign.call_args.args[0], {"sub": str(user.id)})
        session.add.assert_not_called()

    async def test_qr_requires_both_credentials_and_usable_state_store(self):
        for secret in ("", "synthetic"):
            with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET=secret), patch.object(auth, "get_redis", AsyncMock(return_value=None)):
                self.assertFalse((await auth.wx_web_qr_url()).success)

    async def test_qr_callback_uses_the_deployment_domain_and_never_a_local_default(self):
        redis = AsyncMock()
        with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic", PUBLIC_BASE_URL="https://growth.example.test", WX_WEB_REDIRECT_URI=""), patch.object(auth, "get_redis", AsyncMock(return_value=redis)):
            reply = await auth.wx_web_qr_url()
        self.assertTrue(reply.success)
        self.assertIn("https%3A%2F%2Fgrowth.example.test%2Fapi%2Fv1%2Fauth%2Fwx-web%2Fcallback", reply.data["qr_url"])
        self.assertNotIn("localhost", reply.data["qr_url"])
        redis.setex.assert_awaited_once()
        with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic", PUBLIC_BASE_URL="https://growth.example.test", WX_WEB_REDIRECT_URI="http://localhost/callback"), patch.object(auth, "get_redis", AsyncMock()) as store:
            self.assertFalse((await auth.wx_web_qr_url()).success)
        store.assert_not_awaited()

    async def test_missing_or_consumed_state_cannot_exchange_code(self):
        redis = AsyncMock(); redis.eval.return_value = 0
        session, _ = existing_session()
        with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic"), patch.object(auth, "get_redis", AsyncMock(return_value=redis)), patch.object(auth.httpx, "AsyncClient") as client:
            for state in ("", "expired", "a" * 32):
                reply = await auth.wx_web_callback("code", state, session)
                self.assertIn("invalid_state", reply.headers["location"])
        client.assert_not_called()
        session.execute.assert_not_awaited()

    async def test_processing_state_is_not_reported_as_expired(self):
        redis = AsyncMock(); redis.getdel.return_value = None; redis.get.return_value = "processing"
        with patch.object(auth, "get_redis", AsyncMock(return_value=redis)):
            reply = await auth.wx_web_poll("a" * 32)
        self.assertEqual(reply.data["status"], "waiting")

    async def test_web_provider_rejection_does_not_create_user_or_sign_token(self):
        redis = AsyncMock(); redis.eval.return_value = 1
        for data in ({"errcode": 40029}, {}, {"openid": ""}):
            stub, _ = provider(data)
            session, _ = existing_session()
            with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic"), patch.object(auth, "get_redis", AsyncMock(return_value=redis)), stub, patch.object(auth, "create_access_token") as sign:
                reply = await auth.wx_web_callback("bad-code", "a" * 32, session)
                self.assertIn("wx_auth_failed", reply.headers["location"])
                session.execute.assert_not_awaited(); sign.assert_not_called()

    async def test_callback_and_poll_fail_closed_when_state_store_fails(self):
        with patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic"), patch.object(auth, "get_redis", AsyncMock(side_effect=OSError("synthetic"))):
            reply = await auth.wx_web_callback("code", "a" * 32, MagicMock())
            self.assertIn("state_unavailable", reply.headers["location"])
            self.assertFalse((await auth.wx_web_poll("a" * 32)).success)

    def test_sms_request_rejects_invalid_type_and_phone(self):
        for value in (None, [], "123", "11111111111"):
            with self.assertRaises(ValidationError):
                SmsCodeRequest(phone=value)

    async def test_unconfigured_sms_is_never_reported_as_sent(self):
        with patch.object(sms, "sms_configured", return_value=False), patch.object(sms, "get_redis", AsyncMock()) as redis, patch.object(sms, "_send_alibaba_sms", AsyncMock()) as send:
            self.assertFalse((await sms.send_code("13800000000"))["success"])
            self.assertFalse(await sms.verify_code("13800000000", "123456"))
        redis.assert_not_awaited(); send.assert_not_awaited()

    async def test_provider_failure_revokes_the_unsent_code(self):
        redis = AsyncMock(); redis.set.return_value = True
        with patch.object(sms, "sms_configured", return_value=True), patch.object(sms, "get_redis", AsyncMock(return_value=redis)), patch.object(sms, "_send_alibaba_sms", AsyncMock(return_value=False)):
            self.assertFalse((await sms.send_code("13800000000"))["success"])
        redis.delete.assert_any_await(sms._redis_key("13800000000"))

    async def test_sms_cooldown_does_not_call_provider(self):
        redis = AsyncMock(); redis.set.return_value = None; redis.ttl.return_value = 30
        with patch.object(sms, "sms_configured", return_value=True), patch.object(sms, "get_redis", AsyncMock(return_value=redis)), patch.object(sms, "_send_alibaba_sms", AsyncMock()) as send:
            self.assertFalse((await sms.send_code("13800000000"))["success"])
        send.assert_not_awaited()


@unittest.skipUnless(os.environ.get("GROWTHPILOT_TEST_REDIS_URL"), "isolated local Redis required")
class AtomicAuthentication(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        url = httpx.URL(os.environ["GROWTHPILOT_TEST_REDIS_URL"])
        if url.host not in ("localhost", "127.0.0.1", "::1") or url.port == 6379:
            raise RuntimeError("Use a separate local Redis port for auth checks")
        self.redis = Redis.from_url(str(url), decode_responses=True)
        self.state = uuid.uuid4().hex
        self.phone = "138" + str(uuid.uuid4().int % 100000000).zfill(8)
        self.patchers = [patch.object(auth, "get_redis", AsyncMock(return_value=self.redis)),
                         patch.object(sms, "get_redis", AsyncMock(return_value=self.redis)),
                         patch.object(sms, "sms_configured", return_value=True),
                         patch.multiple(auth.settings, WX_WEB_APP_ID="synthetic", WX_WEB_APP_SECRET="synthetic")]
        for patcher in self.patchers: patcher.start()

    async def asyncTearDown(self):
        await self.redis.delete(f"wx_web_state:{self.state}", f"wx_web_token:{self.state}", sms._redis_key(self.phone), sms._rate_key(self.phone), sms._attempt_key(self.phone))
        await self.redis.aclose()
        for patcher in reversed(self.patchers): patcher.stop()

    async def test_callback_replay_cannot_issue_another_token_and_url_has_no_bearer(self):
        await self.redis.setex(f"wx_web_state:{self.state}", 300, "pending")
        session, _ = existing_session()
        stub, client = provider({"openid": "verified-synthetic"})
        with stub, patch.object(auth, "create_access_token", return_value="synthetic-token") as sign:
            replies = await asyncio.gather(*(auth.wx_web_callback("one-code", self.state, session) for _ in range(6)))
        self.assertEqual(sum(reply.headers["location"] == "/login?wx=confirmed" for reply in replies), 1)
        self.assertTrue(all("token=" not in reply.headers["location"] for reply in replies))
        self.assertEqual(client.get.await_count, 1); self.assertEqual(sign.call_count, 1)
        polls = await asyncio.gather(*(auth.wx_web_poll(self.state) for _ in range(6)))
        self.assertEqual(sum(reply.data["status"] == "ok" for reply in polls), 1)

    async def test_one_sms_code_has_only_one_success_under_concurrency(self):
        await self.redis.set(sms._redis_key(self.phone), "123456", ex=300)
        results = await asyncio.gather(*(sms.verify_code(self.phone, "123456") for _ in range(12)))
        self.assertEqual(sum(results), 1)

    async def test_sms_attempt_limit_remains_effective_under_concurrency(self):
        await self.redis.set(sms._redis_key(self.phone), "123456", ex=300)
        results = await asyncio.gather(*(sms.verify_code(self.phone, "000000") for _ in range(12)))
        self.assertEqual(sum(results), 0)
        self.assertEqual(int(await self.redis.get(sms._attempt_key(self.phone))), sms.MAX_VERIFY_ATTEMPTS)
        self.assertFalse(await sms.verify_code(self.phone, "123456"))

    async def test_concurrent_sms_sends_only_call_provider_once(self):
        async def delivered(*args):
            await asyncio.sleep(0)
            return True
        with patch.object(sms, "_send_alibaba_sms", AsyncMock(side_effect=delivered)) as send:
            replies = await asyncio.gather(*(sms.send_code(self.phone) for _ in range(8)))
        self.assertEqual(sum(reply["success"] for reply in replies), 1)
        self.assertEqual(send.await_count, 1)
