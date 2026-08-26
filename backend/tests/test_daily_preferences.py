from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic import ValidationError

from app.api.onboarding import DailyPreferencesUpdateRequest
from app.engines.daily_preferences import (
    DEFAULT_EVENING_TIME,
    DEFAULT_MORNING_TIME,
    DEFAULT_TIMEZONE,
    normalized_daily_preferences,
    user_today_utc_window,
)


def test_daily_preferences_fallback_and_validation() -> None:
    assert normalized_daily_preferences({}) == {
        "timezone": DEFAULT_TIMEZONE,
        "morning_time": DEFAULT_MORNING_TIME,
        "evening_time": DEFAULT_EVENING_TIME,
    }
    assert normalized_daily_preferences({
        "timezone": "Not/AZone",
        "morning_time": "25:00",
        "evening_time": "9:00",
    }) == {
        "timezone": DEFAULT_TIMEZONE,
        "morning_time": DEFAULT_MORNING_TIME,
        "evening_time": DEFAULT_EVENING_TIME,
    }

    payload = DailyPreferencesUpdateRequest(
        timezone=" America/Los_Angeles ",
        morning_time="07:15",
        evening_time="22:45",
    )
    assert payload.timezone == "America/Los_Angeles"
    assert payload.morning_time == "07:15"

    try:
        DailyPreferencesUpdateRequest(
            timezone="Not/AZone",
            morning_time="07:15",
            evening_time="22:45",
        )
    except ValidationError as error:
        assert "时区不可用" in str(error)
    else:
        raise AssertionError("invalid IANA timezone should be rejected")


def test_daily_window_uses_local_midnight_across_dst() -> None:
    settings = {
        "daily_preferences": {
            "timezone": "America/New_York",
            "morning_time": "07:15",
            "evening_time": "22:45",
        }
    }
    now = datetime(2026, 11, 1, 12, 0, tzinfo=ZoneInfo("America/New_York"))
    start, end = user_today_utc_window(settings, now)
    assert start.isoformat() == "2026-11-01T04:00:00+00:00"
    assert end.isoformat() == "2026-11-02T05:00:00+00:00"
