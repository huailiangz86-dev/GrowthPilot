"""Versioned, transparent interval rules; ratings are personal reports, not mastery."""

import hashlib
import json
from datetime import date, timedelta
from math import ceil

RULE_VERSION = "personal-interval-v1"
INITIAL_DAYS = {"again": 1, "hard": 2, "good": 4, "easy": 7}


def latest_completed(attempts):
    completed = [a for a in attempts if a.status == "completed"]
    return max(completed, key=lambda a: (a.completed_at, str(a.id))) if completed else None


def saved_schedule(attempt):
    if attempt is None:
        return None
    if hasattr(attempt, "schedule"):
        return attempt.schedule
    return (attempt.snapshot or {}).get("schedule")


def preview_schedule(attempts, today: date):
    latest = latest_completed(attempts)
    saved = saved_schedule(latest)
    # Manual dates and older records do not become inferred algorithm history.
    previous = (
        saved["interval_days"]
        if saved and saved.get("mode") == "suggested" and saved.get("rule_version") == RULE_VERSION
        else None
    )
    early = bool(previous is not None and latest.next_review_date and today < latest.next_review_date)
    intervals = dict(INITIAL_DAYS)
    if previous is not None:
        intervals.update(
            hard=min(366, max(2, ceil(previous * 1.2))),
            good=min(366, max(4, previous * 2)),
            easy=min(366, max(7, ceil(previous * 2.5))),
        )
        if early:
            # Repeated same-day recall must not inflate the interval.
            intervals.update(hard=previous, good=previous, easy=previous)
    basis = {
        "latest_attempt_id": str(latest.id) if latest else None,
        "previous_interval_days": previous,
        "today": str(today),
        "rule_version": RULE_VERSION,
        "early_review": early,
    }
    token = hashlib.sha256(json.dumps(basis, sort_keys=True).encode()).hexdigest()
    return {
        **basis,
        "token": token,
        "choices": {
            rating: {"interval_days": days, "next_review_date": str(today + timedelta(days=days))}
            for rating, days in intervals.items()
        },
    }


def queue_state(attempts, today: date):
    if any(a.status == "answered" for a in attempts):
        return "unfinished"
    latest = latest_completed(attempts)
    if latest is None:
        return "new"
    if latest.next_review_date is None:
        return "unscheduled"
    return "due" if latest.next_review_date <= today else "upcoming"
