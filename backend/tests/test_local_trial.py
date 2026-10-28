"""Verify the local launcher cannot migrate remote or unversioned data."""

import importlib.util
from pathlib import Path
import unittest
from unittest.mock import AsyncMock, patch

from sqlalchemy.engine import make_url

spec = importlib.util.spec_from_file_location("local_trial", Path(__file__).resolve().parents[1] / "scripts" / "local_trial.py")
trial = importlib.util.module_from_spec(spec)
spec.loader.exec_module(trial)


class LocalTrialTests(unittest.TestCase):
    def test_only_named_local_development_databases_are_allowed(self):
        for value in ("postgresql+asyncpg://user@remote.example/growthpilot_dev", "postgresql+asyncpg://user@localhost/production", "sqlite:///growthpilot_dev", "postgresql+asyncpg://user@localhost/growthpilot_prod"):
            with self.subTest(url=value), self.assertRaises(ValueError):
                trial.local_database(make_url(value))
        for host in ("localhost", "127.0.0.1", "::1"):
            url = make_url("postgresql+asyncpg://user@localhost/growthpilot_dev").set(host=host)
            self.assertEqual(trial.local_database(url), url)

    def test_unversioned_existing_tables_are_never_migrated(self):
        with patch.object(trial, "inspect_database", AsyncMock(return_value={"exists": True, "revision": None, "table_count": 1})), patch.object(trial, "expected_revision", return_value="head"), patch.object(trial, "backup_database") as backup, patch.object(trial.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "未登记迁移"):
                trial.prepare(make_url("postgresql+asyncpg://localhost/growthpilot_dev"), "unused")
            backup.assert_not_called()
            run.assert_not_called()

    def test_backup_failure_prevents_migration(self):
        with patch.object(trial, "inspect_database", AsyncMock(return_value={"exists": True, "revision": "old", "table_count": 10})), patch.object(trial, "expected_revision", return_value="head"), patch.object(trial, "backup_database", side_effect=RuntimeError("backup failed")), patch.object(trial.subprocess, "run") as run:
            with self.assertRaisesRegex(RuntimeError, "backup failed"):
                trial.prepare(make_url("postgresql+asyncpg://localhost/growthpilot_dev"), "unused")
            run.assert_not_called()

    def test_existing_data_is_backed_up_before_upgrading(self):
        events = []
        async def inspect(url, create=False):
            events.append("inspect-create" if create else "inspect")
            return {"exists": True, "revision": "head" if events.count("inspect") > 1 else "old", "table_count": 10}
        with patch.object(trial, "inspect_database", inspect), patch.object(trial, "expected_revision", return_value="head"), patch.object(trial, "backup_database", side_effect=lambda _: events.append("backup")), patch.object(trial.subprocess, "run", side_effect=lambda *a, **kw: events.append("migrate")):
            trial.prepare(make_url("postgresql+asyncpg://localhost/growthpilot_dev"), "unused")
        self.assertLess(events.index("backup"), events.index("migrate"))

    def test_current_database_does_not_get_recreated_or_migrated(self):
        with patch.object(trial, "inspect_database", AsyncMock(return_value={"exists": True, "revision": "head", "table_count": 10})) as inspect, patch.object(trial, "expected_revision", return_value="head"), patch.object(trial, "backup_database") as backup, patch.object(trial.subprocess, "run") as run:
            trial.prepare(make_url("postgresql+asyncpg://localhost/growthpilot_dev"), "unused")
            self.assertEqual(inspect.call_count, 1)
            backup.assert_not_called()
            run.assert_not_called()

    def test_start_refuses_old_schema_without_automatic_migration(self):
        with patch.object(trial, "inspect_database", AsyncMock(return_value={"revision": "old"})), patch.object(trial, "expected_revision", return_value="head"), patch.object(trial.subprocess, "Popen") as launch:
            with self.assertRaisesRegex(RuntimeError, "prepare"):
                trial.start(make_url("postgresql+asyncpg://localhost/growthpilot_dev"), "unused")
            launch.assert_not_called()
