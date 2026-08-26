"""Compliance Guard — ensures AI output doesn't contain investment advice (Red Line R-01).

All AI-generated content MUST pass through check() before reaching the user.
Double-layer defense: LLM prompt constraints + post-generation filtering.
"""

import re
from dataclasses import dataclass, field
from pathlib import Path

import structlog
import yaml

logger = structlog.get_logger()

RULES_PATH = Path(__file__).parent.parent.parent / "prompts" / "compliance" / "rules.yaml"


@dataclass
class ComplianceResult:
    is_clean: bool
    original: str
    filtered: str
    violations: list[str] = field(default_factory=list)
    disclaimer_appended: bool = False


class ComplianceGuard:
    def __init__(self) -> None:
        self._rules: dict = {}
        self._patterns: list[tuple[re.Pattern, str]] = []
        self._disclaimer: str = ""
        self._load_rules()

    def _load_rules(self) -> None:
        if not RULES_PATH.exists():
            logger.warning("compliance_rules_not_found", path=str(RULES_PATH))
            return

        with open(RULES_PATH, encoding="utf-8") as f:
            self._rules = yaml.safe_load(f)

        self._disclaimer = self._rules.get("disclaimer", "")
        self._patterns = []
        for rule in self._rules.get("banned_patterns", []):
            try:
                compiled = re.compile(rule["pattern"])
                self._patterns.append((compiled, rule["replacement"]))
            except re.error as e:
                logger.error("compliance_rule_compile_error", pattern=rule["pattern"], error=str(e))

        logger.info("compliance_rules_loaded", pattern_count=len(self._patterns))

    def check(self, content: str) -> ComplianceResult:
        """Check and filter AI-generated content for compliance violations.

        Returns ComplianceResult with filtered content and violation list.
        """
        violations: list[str] = []
        filtered = content

        for pattern, replacement in self._patterns:
            matches = pattern.findall(filtered)
            if matches:
                for match in matches:
                    match_str = match if isinstance(match, str) else "".join(match)
                    violations.append(f"Pattern matched: '{match_str}'")
                filtered = pattern.sub(replacement, filtered)

        # Ensure disclaimer is present
        disclaimer_appended = False
        if self._disclaimer and self._disclaimer not in filtered:
            filtered = filtered.rstrip() + "\n\n" + self._disclaimer
            disclaimer_appended = True

        is_clean = len(violations) == 0

        if not is_clean:
            logger.warning("compliance_violations_found", count=len(violations), violations=violations[:3])

        return ComplianceResult(
            is_clean=is_clean,
            original=content,
            filtered=filtered,
            violations=violations,
            disclaimer_appended=disclaimer_appended,
        )

    def reload_rules(self) -> None:
        """Hot-reload rules from YAML."""
        self._load_rules()


# Singleton instance
guard = ComplianceGuard()


def check(content: str) -> ComplianceResult:
    """Module-level convenience function."""
    return guard.check(content)
