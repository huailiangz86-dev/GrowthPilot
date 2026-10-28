"""D8 schedule provenance, local dates, replay and parallel completion boundaries."""

import hashlib
import json
import unittest
import uuid
from datetime import UTC, date, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import patch
from zoneinfo import ZoneInfo

from pydantic import ValidationError
from sqlalchemy import select

from app.api.learning_review import Finish, finish_attempt, inbox, schedule
from app.core.exceptions import AppException
from app.engines.review_schedule import preview_schedule, queue_state
from app.models.learning_review import LearningReviewAttempt
from app.models.personal_work import PersonalCommandReceipt
from tests import test_learning_review as base


class Rules(unittest.TestCase):
    def test_first_ratings_and_calendar_boundaries(self):
        p = preview_schedule([], date(2028, 2, 28))
        self.assertEqual(
            {r: c["interval_days"] for r, c in p["choices"].items()}, {"again": 1, "hard": 2, "good": 4, "easy": 7}
        )
        self.assertEqual(p["choices"]["again"]["next_review_date"], "2028-02-29")
        self.assertEqual(p["choices"]["hard"]["next_review_date"], "2028-03-01")

    def row(self, interval=7, mode="suggested", **changes):
        row = SimpleNamespace(
            id=uuid.uuid4(),
            status="completed",
            completed_at=datetime.now(UTC),
            rating="good",
            next_review_date=date(2026, 10, 9),
            snapshot={"schedule": {"mode": mode, "rule_version": "personal-interval-v1", "interval_days": interval}},
        )
        for key, value in changes.items():
            setattr(row, key, value)
        return row

    def test_progress_reset_rounding_and_cap(self):
        for previous, expected in (
            (7, {"again": 1, "hard": 9, "good": 14, "easy": 18}),
            (366, {"again": 1, "hard": 366, "good": 366, "easy": 366}),
        ):
            p = preview_schedule([self.row(previous)], date(2026, 10, 9))
            self.assertEqual({r: c["interval_days"] for r, c in p["choices"].items()}, expected)

    def test_manual_and_legacy_history_do_not_infer_algorithm_interval(self):
        for row in (self.row(200, "manual"), self.row(snapshot={}), self.row(mode="none")):
            self.assertIsNone(preview_schedule([row], date(2026, 10, 9))["previous_interval_days"])

    def test_early_recall_cannot_inflate_interval_but_again_resets(self):
        p = preview_schedule([self.row(next_review_date=date(2026, 10, 16))], date(2026, 10, 9))
        self.assertTrue(p["early_review"])
        self.assertEqual(
            {r: c["interval_days"] for r, c in p["choices"].items()}, {"again": 1, "hard": 7, "good": 7, "easy": 7}
        )

    def test_token_changes_with_date_and_latest_completion_not_unfinished_attempt(self):
        today = date(2026, 10, 9)
        first = self.row()
        p = preview_schedule([first], today)
        self.assertNotEqual(p["token"], preview_schedule([first], today + timedelta(days=1))["token"])
        self.assertEqual(
            p["token"], preview_schedule([first, self.row(status="answered", completed_at=None)], today)["token"]
        )
        self.assertNotEqual(p["token"], preview_schedule([first, self.row()], today)["token"])

    def test_queue_preserves_unscheduled_and_unfinished_and_due_is_inclusive(self):
        today = date(2026, 10, 9)
        for rows, expected in (
            ([], "new"),
            ([self.row(next_review_date=today)], "due"),
            ([self.row(next_review_date=today - timedelta(days=1))], "due"),
            ([self.row(next_review_date=today + timedelta(days=1))], "upcoming"),
            ([self.row(next_review_date=None)], "unscheduled"),
            ([self.row(status="answered")], "unfinished"),
        ):
            self.assertEqual(queue_state(rows, today), expected)

    def test_schedule_contract_prevents_client_forged_suggestion_date(self):
        for changes in (
            {"schedule_mode": "suggested"},
            {"schedule_mode": "suggested", "schedule_token": "a" * 64, "next_review_date": "2026-10-10"},
            {"schedule_mode": "none", "next_review_date": "2026-10-10"},
            {"schedule_mode": "manual", "schedule_token": "a" * 64},
        ):
            with self.assertRaises(ValidationError):
                Finish(request_id=uuid.uuid4(), rating="good", next_action="练习", **changes)


class Integration(base.Integration):
    async def preview(self, u):
        async with self.sessions() as s:
            return (await schedule(self.wid, self.iid, uuid.UUID(u["id"]), str(self.uid), s)).data

    async def suggested(self, u, a, rating="good", **changes):
        p = await self.preview(u)
        request = self.finish_request(
            next_review_date=None, schedule_mode="suggested", schedule_token=p["token"], rating=rating, **changes
        )
        return await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(a["id"]), request), request

    async def test_suggestions_repeat_replay_and_preserve_every_source_and_schedule(self):
        u = await self.make()
        a = await self.answer(u)
        done, request = await self.suggested(u, a)
        self.assertEqual(done["snapshot"]["schedule"]["interval_days"], 4)
        self.assertEqual(done, await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(a["id"]), request))
        b = await self.answer(u)
        next_done, _ = await self.suggested(u, b, rating="easy")
        self.assertEqual(next_done["snapshot"]["schedule"]["interval_days"], 4)
        self.assertEqual(next_done["snapshot"]["schedule"]["basis_attempt_id"], a["id"])
        async with self.sessions() as s:
            original = await s.get(LearningReviewAttempt, uuid.UUID(a["id"]))
            self.assertEqual(original.snapshot["schedule"], done["snapshot"]["schedule"])
            self.assertEqual(original.snapshot["source"]["quote"], base.TEXT)
            unit = (await inbox(self.wid, str(self.uid), s)).data[0]
            self.assertEqual(unit["queue_state"], "upcoming")
            self.assertEqual(unit["schedule"]["interval_days"], 4)
            self.assertNotIn("quote", unit["source"])

    async def test_stale_suggestion_cannot_override_other_completion(self):
        u = await self.make()
        old = await self.answer(u)
        p = await self.preview(u)
        newer = await self.answer(u)
        await self.suggested(u, newer)
        stale = self.finish_request(next_review_date=None, schedule_mode="suggested", schedule_token=p["token"])
        with self.assertRaises(AppException):
            await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(old["id"]), stale)
        async with self.sessions() as s:
            row = await s.get(LearningReviewAttempt, uuid.UUID(old["id"]))
            self.assertEqual(row.status, "answered")
            self.assertNotIn("schedule", row.snapshot)
        done, _ = await self.suggested(u, old)
        self.assertEqual(done["snapshot"]["schedule"]["interval_days"], 4)

    async def test_explicit_none_and_manual_dates_keep_history_without_synthetic_intervals(self):
        u = await self.make()
        a = await self.answer(u)
        manual = await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(a["id"]), self.finish_request())
        self.assertEqual(manual["snapshot"]["schedule"]["mode"], "manual")
        self.assertIsNone((await self.preview(u))["previous_interval_days"])
        b = await self.answer(u)
        none = await self.call(
            finish_attempt,
            uuid.UUID(u["id"]),
            uuid.UUID(b["id"]),
            self.finish_request(next_review_date=None, schedule_mode="none"),
        )
        self.assertIsNone(none["next_review_date"])
        async with self.sessions() as s:
            self.assertEqual((await inbox(self.wid, str(self.uid), s)).data[0]["queue_state"], "unscheduled")
            self.assertEqual(
                (await s.get(LearningReviewAttempt, uuid.UUID(a["id"]))).next_review_date.isoformat(),
                manual["next_review_date"],
            )

    async def test_preview_is_scoped_and_read_only(self):
        u = await self.make()
        for uid, wid, iid in (
            (self.other, self.wid, self.iid),
            (self.uid, self.wid2, self.iid),
            (self.uid, self.wid, uuid.uuid4()),
        ):
            async with self.sessions() as s:
                with self.assertRaises(AppException):
                    await schedule(wid, iid, uuid.UUID(u["id"]), str(uid), s)
        await self.preview(u)
        async with self.sessions() as s:
            self.assertEqual(
                list(await s.scalars(select(LearningReviewAttempt).where(LearningReviewAttempt.user_id == self.uid))),
                [],
            )

    async def test_user_timezone_and_expired_calendar_token(self):
        u = await self.make()
        a = await self.answer(u)

        class Clock(datetime):
            fixed = datetime(2026, 10, 9, 18, 30, tzinfo=UTC)

            @classmethod
            def now(cls, tz=None):
                return cls.fixed.astimezone(tz) if tz else cls.fixed.replace(tzinfo=None)

        with patch("app.api.learning_review.datetime", Clock):
            p = await self.preview(u)
            self.assertEqual(p["today"], "2026-10-10")
            Clock.fixed += timedelta(days=1)
            stale = self.finish_request(next_review_date=None, schedule_mode="suggested", schedule_token=p["token"])
            with self.assertRaises(AppException):
                await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(a["id"]), stale)
            done, _ = await self.suggested(u, a)
            self.assertEqual(done["next_review_date"], "2026-10-15")
            self.assertEqual(done["snapshot"]["schedule"]["timezone"], str(ZoneInfo("Asia/Shanghai")))

    async def test_d6_manual_receipt_replays_with_old_fingerprint(self):
        u = await self.make()
        a = await self.answer(u)
        request = self.finish_request()
        old = request.model_dump(mode="json")
        old.pop("schedule_mode")
        old.pop("schedule_token")
        for key in ("practice_result","practice_criterion","practice_checked"):old.pop(key)
        fingerprint = hashlib.sha256(
            json.dumps(
                {"action": "review_finish", "target": a["id"], "payload": old}, sort_keys=True, ensure_ascii=False
            ).encode()
        ).hexdigest()
        receipt = {"id": a["id"], "status": "completed", "legacy_receipt": True}
        async with self.sessions() as s:
            s.add(
                PersonalCommandReceipt(
                    user_id=self.uid,
                    workspace_id=self.wid,
                    request_id=request.request_id,
                    fingerprint=fingerprint,
                    result=receipt,
                )
            )
            await s.commit()
        self.assertEqual(await self.call(finish_attempt, uuid.UUID(u["id"]), uuid.UUID(a["id"]), request), receipt)
