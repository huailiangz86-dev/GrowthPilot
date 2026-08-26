import uuid

from sqlalchemy.dialects import postgresql

from app.api.memory import _build_agent_memory_scope_filter
from app.engines.privacy_scope import (
    PRIVACY_SOURCE_KEYS,
    memory_source_allowed,
    normalized_privacy_scope,
    user_privacy_scope,
)


def test_missing_scope_defaults_to_all_supported_sources() -> None:
    assert normalized_privacy_scope(None)["enabled_sources"] == list(PRIVACY_SOURCE_KEYS)
    assert user_privacy_scope({})["enabled_sources"] == list(PRIVACY_SOURCE_KEYS)


def test_scope_deduplicates_and_discards_unknown_sources() -> None:
    assert normalized_privacy_scope({"enabled_sources": ["tasks", "tasks", "not-a-source"]}) == {
        "enabled_sources": ["tasks"],
    }


def test_memory_provenance_follows_the_matching_user_scope() -> None:
    settings = {"privacy_scope": {"enabled_sources": ["reflections"]}}

    assert memory_source_allowed(settings, "reflection") is True
    assert memory_source_allowed(settings, "manual") is False
    assert memory_source_allowed(settings, "task") is False


def test_agent_memory_filter_excludes_disabled_provenance() -> None:
    settings = {"privacy_scope": {"enabled_sources": ["reflections"]}}
    predicate = _build_agent_memory_scope_filter(settings)
    compiled = str(predicate.compile(dialect=postgresql.dialect(), compile_kwargs={"literal_binds": True}))

    assert "memory_entries.source IN" in compiled
    assert "reflection" in compiled
    assert "manual" not in compiled


def test_agent_memory_filter_can_deny_all_sources() -> None:
    predicate = _build_agent_memory_scope_filter({"privacy_scope": {"enabled_sources": []}})
    compiled = str(predicate.compile(dialect=postgresql.dialect()))

    assert "memory_entries.id IS NULL" in compiled
    assert str(uuid.uuid4()) not in compiled
