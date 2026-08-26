"""A/B routing for prompt versions."""

import hashlib

from app.ai.prompt_loader import list_prompts, load_prompt


class PromptVariant:
    """Holds a resolved prompt variant with metadata."""

    def __init__(self, purpose: str, version: str, data: dict):
        self.purpose = purpose
        self.version = version
        self.data = data
        self.model_preference: str = data.get("model_preference", "deepseek-chat")
        self.temperature: float = data.get("temperature", 0.7)
        self.max_tokens: int = data.get("max_tokens", 2000)


# Default weights: {"v1": 100} means 100% v1
_routing_weights: dict[str, dict[str, int]] = {}


def set_routing_weights(purpose: str, weights: dict[str, int]) -> None:
    """Set A/B routing weights for a prompt purpose.

    Example: set_routing_weights("review", {"v1": 80, "v2": 20})
    """
    _routing_weights[purpose] = weights


async def get_variant(user_id: str, purpose: str) -> PromptVariant:
    """Get a prompt variant for a user, respecting A/B routing weights.

    Uses deterministic hashing so the same user always gets the same variant
    within a routing configuration.
    """
    weights = _routing_weights.get(purpose)

    if not weights:
        # No A/B configured — use latest version
        versions = list_prompts(purpose)
        if not versions:
            raise FileNotFoundError(f"No prompts found for purpose: {purpose}")
        version = sorted(versions)[-1]  # latest
    elif len(weights) == 1:
        # Single version, no routing needed
        version = next(iter(weights))
    else:
        # Deterministic A/B: hash user_id + purpose → consistent bucket
        hash_input = f"{user_id}:{purpose}"
        hash_val = int(hashlib.md5(hash_input.encode()).hexdigest(), 16) % 100

        cumulative = 0
        version = next(iter(weights))  # default fallback
        for ver, weight in weights.items():
            cumulative += weight
            if hash_val < cumulative:
                version = ver
                break

    data = load_prompt(purpose, version)
    return PromptVariant(purpose, version, data)
