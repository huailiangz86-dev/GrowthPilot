"""User-controlled data scope for future Personal Agent retrieval."""

from collections.abc import Mapping
from typing import Final

PRIVACY_SOURCE_KEYS: Final[tuple[str, ...]] = (
    "tasks",
    "goals",
    "plans",
    "learning",
    "knowledge_cards",
    "reflections",
    "memories",
)

PRIVACY_SOURCE_LABELS: Final[dict[str, str]] = {
    "tasks": "任务",
    "goals": "目标",
    "plans": "计划",
    "learning": "学习",
    "knowledge_cards": "知识卡",
    "reflections": "晨晚复盘与快速记录",
    "memories": "长期 Memory",
}

PRIVACY_SOURCE_DESCRIPTIONS: Final[dict[str, str]] = {
    "tasks": "允许 Agent 参考当前 Workspace 的任务状态、下一步和行动完成结果。",
    "goals": "允许 Agent 参考当前 Workspace 的目标与进度。",
    "plans": "允许 Agent 参考当前 Workspace 的周期计划。",
    "learning": "允许 Agent 参考当前 Workspace 的学习入口、进度与显式实际投入分钟。",
    "knowledge_cards": "允许 Agent 参考已保存的知识卡及其确认内容。",
    "reflections": "允许 Agent 参考 Morning、Micro Capture 和 Evening。",
    "memories": "允许 Agent 参考长期保存的个人事实和记忆。",
}


def normalized_privacy_scope(value: object) -> dict[str, list[str]]:
    """Normalize persisted data while keeping unknown future keys out of reads."""
    raw_sources = value.get("enabled_sources") if isinstance(value, Mapping) else None
    if not isinstance(raw_sources, list):
        return {"enabled_sources": list(PRIVACY_SOURCE_KEYS)}

    enabled = []
    for source in raw_sources:
        normalized = str(source).strip()
        if normalized in PRIVACY_SOURCE_KEYS and normalized not in enabled:
            enabled.append(normalized)
    return {"enabled_sources": enabled}


def user_privacy_scope(settings: object) -> dict[str, list[str]]:
    raw_settings = settings if isinstance(settings, Mapping) else {}
    return normalized_privacy_scope(raw_settings.get("privacy_scope"))


def privacy_source_enabled(settings: object, source: str) -> bool:
    return source in user_privacy_scope(settings)["enabled_sources"]


def memory_source_allowed(settings: object, memory_source: str) -> bool:
    """Map Memory provenance to the user-facing scope without broad defaults."""
    if memory_source in {"manual", "onboarding", "capability_brief"}:
        return privacy_source_enabled(settings, "memories")
    if memory_source in {"reflection", "morning", "micro", "evening"}:
        return privacy_source_enabled(settings, "reflections")
    if memory_source in {"task"}:
        return privacy_source_enabled(settings, "tasks")
    if memory_source in {"goal"}:
        return privacy_source_enabled(settings, "goals")
    if memory_source in {"plan", "growth_plan"}:
        return privacy_source_enabled(settings, "plans")
    if memory_source in {"learning", "knowledge", "knowledge_card"}:
        return privacy_source_enabled(settings, "learning" if memory_source == "learning" else "knowledge_cards")
    return False
