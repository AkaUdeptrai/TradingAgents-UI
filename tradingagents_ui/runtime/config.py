"""TradingAgents UI configuration is separate from provider credentials."""

from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

from tradingagents_ui.runtime.env import setting
from tradingagents_ui.runtime.auth.config import AuthConfig


@dataclass(frozen=True)
class TradingAgentsUIConfig:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = ()
    static_dir: Path | None = None
    auth: AuthConfig = field(default_factory=AuthConfig)

    @classmethod
    def from_env(cls) -> "TradingAgentsUIConfig":
        # Exported variables win. Core loads its own .env through its existing mechanism.
        app_dir = Path(__file__).resolve().parents[1]
        load_dotenv(app_dir / ".env", override=False)
        load_dotenv(app_dir.parent / "portal" / ".env", override=False)
        origins = tuple(
            origin.strip()
            for origin in setting("TRADINGAGENTS_UI_CORS_ORIGINS").split(",")
            if origin.strip()
        )
        for origin in origins:
            parsed = urlsplit(origin)
            if (
                "*" in origin
                or parsed.scheme not in {"http", "https"}
                or not parsed.netloc
                or parsed.path
                or parsed.query
                or parsed.fragment
                or parsed.username
            ):
                raise ValueError("TRADINGAGENTS_UI_CORS_ORIGINS must contain explicit HTTP(S) origins")
        port = int(setting("TRADINGAGENTS_UI_PORT", "8000"))
        if not 1 <= port <= 65535:
            raise ValueError("TRADINGAGENTS_UI_PORT must be between 1 and 65535")
        static_dir = setting("TRADINGAGENTS_UI_STATIC_DIR")
        return cls(
            host=setting("TRADINGAGENTS_UI_HOST", "127.0.0.1"),
            port=port,
            cors_origins=origins,
            static_dir=Path(static_dir).resolve() if static_dir else None,
            auth=AuthConfig.from_env(),
        )
