"""Currency conversion — approximate rates, refreshed periodically."""

import structlog

logger = structlog.get_logger()

# Hardcoded approximate rates (to CNY). In production, fetch from API.
RATES_TO_CNY = {
    "CNY": 1.0,
    "HKD": 0.92,
    "USD": 7.26,
}


def convert_to_cny(amount: float, currency: str) -> float:
    """Convert amount to CNY."""
    rate = RATES_TO_CNY.get(currency, 1.0)
    return round(amount * rate, 2)


def market_to_currency(market: str) -> str:
    """Map market code to currency."""
    return {"A": "CNY", "HK": "HKD", "US": "USD"}.get(market, "CNY")
