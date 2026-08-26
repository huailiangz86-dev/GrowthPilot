"""User-scoped daily rhythm preferences and timezone helpers."""

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Asia/Shanghai"
DEFAULT_MORNING_TIME = "08:30"
DEFAULT_EVENING_TIME = "21:30"


def normalized_daily_preferences(value: object) -> dict[str, str]:
    raw = value if isinstance(value, dict) else {}
    timezone = str(raw.get("timezone") or "").strip()
    try:
        ZoneInfo(timezone)
    except (ZoneInfoNotFoundError, ValueError):
        timezone = DEFAULT_TIMEZONE

    morning_time = str(raw.get("morning_time") or "").strip()
    evening_time = str(raw.get("evening_time") or "").strip()
    return {
        "timezone": timezone,
        "morning_time": morning_time if _is_time(morning_time) else DEFAULT_MORNING_TIME,
        "evening_time": evening_time if _is_time(evening_time) else DEFAULT_EVENING_TIME,
    }


def user_daily_preferences(settings: object) -> dict[str, str]:
    raw_settings = settings if isinstance(settings, dict) else {}
    return normalized_daily_preferences(raw_settings.get("daily_preferences"))


def user_daily_timezone(settings: object) -> ZoneInfo:
    return ZoneInfo(user_daily_preferences(settings)["timezone"])


def user_today(settings: object):
    return datetime.now(user_daily_timezone(settings)).date()


def user_today_utc_window(settings: object, now: datetime | None = None) -> tuple[datetime, datetime]:
    timezone = user_daily_timezone(settings)
    local_now = (now or datetime.now(timezone)).astimezone(timezone)
    local_start = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    local_end = local_start + timedelta(days=1)
    return local_start.astimezone(UTC), local_end.astimezone(UTC)


def _is_time(value: str) -> bool:
    try:
        datetime.strptime(value, "%H:%M")
    except ValueError:
        return False
    return len(value) == 5
