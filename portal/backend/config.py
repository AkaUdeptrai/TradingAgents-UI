"""Portal configuration is separate from provider credentials."""

import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import load_dotenv

from portal.backend.auth.config import AuthConfig


@dataclass(frozen=True)
class PortalConfig:
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: tuple[str, ...] = ()
    static_dir: Path | None = None
    auth: AuthConfig = field(default_factory=AuthConfig)

    @classmethod
    def from_env(cls) -> "PortalConfig":
        # Exported variables win. Core loads its own .env through its existing mechanism.
        load_dotenv(Path(__file__).resolve().parents[1] / ".env", override=False)
        origins = tuple(
            origin.strip()
            for origin in os.getenv("PORTAL_CORS_ORIGINS", "").split(",")
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
                raise ValueError("PORTAL_CORS_ORIGINS must contain explicit HTTP(S) origins")
        port = int(os.getenv("PORTAL_PORT", "8000"))
        if not 1 <= port <= 65535:
            raise ValueError("PORTAL_PORT must be between 1 and 65535")
        static_dir = os.getenv("PORTAL_STATIC_DIR")
        return cls(
            host=os.getenv("PORTAL_HOST", "127.0.0.1"),
            port=port,
            cors_origins=origins,
            static_dir=Path(static_dir).resolve() if static_dir else None,
            auth=AuthConfig.from_env(),
        )
