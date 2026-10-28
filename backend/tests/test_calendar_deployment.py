"""Subscription addresses belong to the deployment, independent of browser host."""
import unittest
import uuid
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.api import execution
from app.core.exceptions import AppException
from app.engines.calendar_feed import subscription_url


class SubscriptionDeployment(unittest.IsolatedAsyncioTestCase):
    def test_deployment_origin_supplies_the_full_subscription_url(self):
        self.assertEqual(subscription_url('https://calendar.example.test/', '/api/v1', 'synthetic'),
                         'https://calendar.example.test/api/v1/execution/calendar.ics?token=synthetic')

    def test_missing_or_local_deployment_origins_are_rejected(self):
        for base in ('', 'http://calendar.example.test', 'https://localhost', 'https://LOCALHOST.',
                     'https://127.0.0.1', 'https://127.0.0.2', 'https://0.0.0.0', 'https://[::1]',
                     'https://[::ffff:127.0.0.1]', 'https://user:pass@calendar.example.test',
                     'https://calendar.example.test/path', 'https://calendar.example.test?token=other',
                     'https://calendar.example.test#fragment', 'https://calendar.example.test:bad'):
            with self.subTest(base=base), self.assertRaises(ValueError):
                subscription_url(base, '/api/v1', 'synthetic')

    async def test_missing_deployment_config_does_not_rotate_existing_subscriptions(self):
        workspace = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
        session = MagicMock(); session.execute = AsyncMock(); session.commit = AsyncMock()
        with patch.object(execution, '_workspace', AsyncMock(return_value=workspace)), patch.object(execution.settings, 'PUBLIC_BASE_URL', ''):
            with self.assertRaises(AppException) as result:
                await execution.connect_calendar(str(workspace.id), str(workspace.user_id), session)
        self.assertEqual(result.exception.code, 'CALENDAR_NOT_CONFIGURED')
        session.execute.assert_not_awaited(); session.add.assert_not_called(); session.commit.assert_not_awaited()

    async def test_created_subscription_returns_the_server_address_and_stores_only_a_digest(self):
        workspace = SimpleNamespace(id=uuid.uuid4(), user_id=uuid.uuid4())
        session = MagicMock(); session.execute = AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: None)); session.commit = AsyncMock()
        with patch.object(execution, '_workspace', AsyncMock(return_value=workspace)), patch.object(execution.settings, 'PUBLIC_BASE_URL', 'https://calendar.example.test'), patch.object(execution.secrets, 'token_urlsafe', return_value='synthetic-key'):
            result = await execution.connect_calendar(str(workspace.id), str(workspace.user_id), session)
        self.assertTrue(result.data['url'].startswith('https://calendar.example.test/api/v1/'))
        self.assertNotEqual(session.add.call_args.args[0].token_hash, 'synthetic-key')
        session.commit.assert_awaited_once()
