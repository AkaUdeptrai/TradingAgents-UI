"""Environment access with fallback support for the earlier Portal deployment."""

import os


def setting(name: str, default: str = "") -> str:
    """Read the current setting name, falling back to the previous prefix."""
    current = os.getenv(name)
    if current is not None:
        return current
    if name.startswith("TRADINGAGENTS_UI_"):
        legacy_name = name.replace("TRADINGAGENTS_UI_", "PORTAL_", 1)
        return os.getenv(legacy_name, default)
    return default
