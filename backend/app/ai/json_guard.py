"""Validate and repair LLM JSON output."""

import json
import re

import json_repair
import structlog

logger = structlog.get_logger()


def extract_json(text: str) -> str | None:
    """Extract JSON from LLM output that may contain markdown fences or extra text."""
    # Try direct parse first
    text = text.strip()
    if text.startswith("{") or text.startswith("["):
        return text

    # Try extracting from markdown code block
    match = re.search(r"```(?:json)?\s*\n?([\s\S]*?)\n?```", text)
    if match:
        return match.group(1).strip()

    # Try finding first { to last }
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        return text[start : end + 1]

    return None


def parse_and_repair(text: str) -> dict | list | None:
    """Parse JSON from LLM output, attempting repair if malformed."""
    raw = extract_json(text)
    if raw is None:
        logger.warning("json_guard_no_json", text_preview=text[:200])
        return None

    # Try standard parse
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    # Try json-repair
    try:
        repaired = json_repair.repair_json(raw, return_objects=True)
        if isinstance(repaired, (dict, list)):
            logger.info("json_guard_repaired", original_preview=raw[:100])
            return repaired
    except Exception:
        pass

    logger.error("json_guard_failed", text_preview=raw[:200])
    return None


def validate_schema(data: dict, schema: dict) -> list[str]:
    """Basic schema validation. Returns list of error messages (empty = valid)."""
    errors: list[str] = []
    required = schema.get("required", [])
    properties = schema.get("properties", {})

    for field in required:
        if field not in data:
            errors.append(f"Missing required field: {field}")

    for field, spec in properties.items():
        if field not in data:
            continue
        value = data[field]
        expected_type = spec.get("type")
        if expected_type == "string" and not isinstance(value, str):
            errors.append(f"Field '{field}' should be string, got {type(value).__name__}")
        elif expected_type == "integer" and not isinstance(value, int):
            # LLM sometimes returns float for integer
            if isinstance(value, float) and value == int(value):
                data[field] = int(value)  # auto-fix
            else:
                errors.append(f"Field '{field}' should be integer, got {type(value).__name__}")
        elif expected_type == "number" and not isinstance(value, (int, float)):
            errors.append(f"Field '{field}' should be number, got {type(value).__name__}")

    return errors
