"""Load prompt definitions from YAML files (Red Line R-07: no hardcoded prompts)."""

from pathlib import Path

import yaml

PROMPTS_DIR = Path(__file__).parent.parent.parent / "prompts"

_cache: dict[str, dict] = {}


def load_prompt(purpose: str, version: str = "v1") -> dict:
    """Load a prompt YAML by purpose and version.

    Example: load_prompt("review", "v1") loads prompts/review/v1.yaml
    """
    cache_key = f"{purpose}:{version}"
    if cache_key in _cache:
        return _cache[cache_key]

    path = PROMPTS_DIR / purpose / f"{version}.yaml"
    if not path.exists():
        raise FileNotFoundError(f"Prompt not found: {path}")

    with open(path, encoding="utf-8") as f:
        data = yaml.safe_load(f)

    _cache[cache_key] = data
    return data


def render_prompt(prompt_data: dict, variables: dict) -> tuple[str, str]:
    """Render system and user prompts with variable substitution.

    Returns (system_prompt, user_prompt).
    """
    system = prompt_data.get("system_prompt", "")
    user_template = prompt_data.get("user_prompt_template", "")

    user = user_template
    for key, value in variables.items():
        user = user.replace(f"{{{{{key}}}}}", str(value))

    return system, user


def list_prompts(purpose: str) -> list[str]:
    """List available versions for a prompt purpose."""
    purpose_dir = PROMPTS_DIR / purpose
    if not purpose_dir.exists():
        return []
    return [f.stem for f in purpose_dir.glob("v*.yaml")]


def clear_cache() -> None:
    """Clear the prompt cache (useful for testing or hot-reload)."""
    _cache.clear()
