import uuid
from datetime import UTC, date, datetime

from sqlalchemy.dialects import postgresql

from app.api.memory import (
    _build_memory_search_query,
    _resolve_memory_window,
    list_memories,
)
from app.core.exceptions import ValidationException
from app.models.memory import MemoryEntry


class _SearchResult:
    def __init__(self, items=None, total=0):
        self.items = items or []
        self.total = total

    def scalars(self):
        return self

    def all(self):
        return self.items

    def scalar_one(self):
        return self.total


class _SearchSession:
    def __init__(self, items=None, total=0):
        self.queries = []
        self.result = _SearchResult(items=items, total=total)

    async def execute(self, query):
        self.queries.append(query)
        return self.result


def _build_memory(user_id: uuid.UUID) -> MemoryEntry:
    occurred_at = datetime(2026, 8, 9, 8, 30, tzinfo=UTC)
    return MemoryEntry(
        id=uuid.uuid4(),
        user_id=user_id,
        memory_type="semantic",
        source="manual",
        content="今天完成了产品首页的第一版。",
        summary="完成产品首页第一版",
        tags=["产品"],
        derived_status={"summary": "ready", "entities": "ready", "embedding": "ready"},
        importance=4,
        confidence=1.0,
        occurred_at=occurred_at,
        created_at=occurred_at,
        updated_at=occurred_at,
    )


def test_resolve_memory_window_supports_calendar_ranges() -> None:
    now = datetime(2026, 8, 9, 8, 30, tzinfo=UTC)

    today_start, today_end = _resolve_memory_window("today", None, None, now=now)
    assert today_start == datetime(2026, 8, 9, tzinfo=UTC)
    assert today_end == datetime(2026, 8, 10, tzinfo=UTC)

    week_start, week_end = _resolve_memory_window("week", None, None, now=now)
    assert week_start == datetime(2026, 8, 3, tzinfo=UTC)
    assert week_end == datetime(2026, 8, 10, tzinfo=UTC)

    month_start, month_end = _resolve_memory_window("month", None, None, now=now)
    assert month_start == datetime(2026, 8, 1, tzinfo=UTC)
    assert month_end == datetime(2026, 9, 1, tzinfo=UTC)


def test_resolve_memory_window_includes_both_custom_dates() -> None:
    start, end = _resolve_memory_window("custom", date(2026, 8, 1), date(2026, 8, 9))

    assert start == datetime(2026, 8, 1, tzinfo=UTC)
    assert end == datetime(2026, 8, 10, tzinfo=UTC)


def test_resolve_memory_window_uses_the_users_timezone() -> None:
    now = datetime(2026, 8, 8, 17, 30, tzinfo=UTC)
    start, end = _resolve_memory_window(
        "today",
        None,
        None,
        now=now,
        timezone_offset_minutes=480,
    )

    assert start == datetime(2026, 8, 8, 16, tzinfo=UTC)
    assert end == datetime(2026, 8, 9, 16, tzinfo=UTC)


def test_resolve_memory_window_rejects_invalid_custom_range() -> None:
    try:
        _resolve_memory_window("custom", date(2026, 8, 10), date(2026, 8, 9))
    except ValueError as error:
        assert "自定义时间范围" in str(error)
    else:
        raise AssertionError("an inverted custom range should be rejected")

    try:
        _resolve_memory_window("custom", date(2026, 8, 1), None)
    except ValueError as error:
        assert "需要开始日期和结束日期" in str(error)
    else:
        raise AssertionError("an incomplete custom range should be rejected")


def test_memory_search_query_scopes_user_and_excludes_deleted_rows() -> None:
    user_id = uuid.uuid4()
    query = _build_memory_search_query(
        user_id=user_id,
        keyword="首页",
        period="today",
        start_date=None,
        end_date=None,
        limit=20,
    )
    compiled = str(query.compile(dialect=postgresql.dialect()))

    assert 'memory_entries.user_id = ' in compiled
    assert 'memory_entries.deleted_at IS NULL' in compiled
    assert 'memory_entries.content ILIKE ' in compiled
    assert 'memory_entries.occurred_at >= ' in compiled
    assert 'memory_entries.occurred_at < ' in compiled
    assert 'CASE WHEN' in compiled


def test_list_memories_passes_keyword_and_time_filters_to_both_queries() -> None:
    async def run() -> None:
        user_id = uuid.uuid4()
        memory = _build_memory(user_id)
        session = _SearchSession(items=[memory], total=1)

        response = await list_memories(
            limit=20,
            keyword="首页",
            period="custom",
            start_date=date(2026, 8, 1),
            end_date=date(2026, 8, 9),
            timezone_offset_minutes=480,
            user_id=str(user_id),
            session=session,
        )

        assert response.success is True
        assert response.data is not None
        assert response.data.total == 1
        assert response.data.items[0].id == str(memory.id)
        assert len(session.queries) == 2
        for query in session.queries:
            compiled = str(query.compile(dialect=postgresql.dialect()))
            assert 'memory_entries.user_id = ' in compiled
            assert 'memory_entries.deleted_at IS NULL' in compiled
            assert 'memory_entries.occurred_at >= ' in compiled
            assert 'memory_entries.occurred_at < ' in compiled
            assert 'ILIKE' in compiled

    import asyncio

    asyncio.run(run())


def test_list_memories_rejects_incomplete_custom_range() -> None:
    async def run() -> None:
        try:
            await list_memories(
                user_id=str(uuid.uuid4()),
                session=_SearchSession(),
                period="custom",
                start_date=date(2026, 8, 1),
            )
        except ValidationException as error:
            assert "需要开始日期和结束日期" in error.message
        else:
            raise AssertionError("an incomplete custom range should be rejected by the API")

    import asyncio

    asyncio.run(run())
