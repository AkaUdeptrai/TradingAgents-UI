import os
from dataclasses import dataclass, field
from pathlib import Path
from urllib.parse import urlsplit


@dataclass(frozen=True)
class AuthConfig:
    public_url: str = "http://127.0.0.1:8000"
    google_client_id: str = ""
    google_client_secret: str = field(default="", repr=False)
    allowed_emails: tuple[str, ...] = ()
    database: Path = field(
        default_factory=lambda: Path.home() / ".tradingagents/portal/auth.sqlite3"
    )
    session_ttl: int = 28800

    def __post_init__(self) -> None:
        url = urlsplit(self.public_url)
        if (
            url.scheme not in {"http", "https"}
            or not url.netloc
            or url.username
            or url.password
            or url.path
            or url.query
            or url.fragment
            or (url.scheme == "http" and url.hostname not in {"localhost", "127.0.0.1", "::1"})
        ):
            raise ValueError(
                "PORTAL_PUBLIC_URL must be an HTTPS origin (HTTP allowed on loopback only)"
            )
        if not 300 <= self.session_ttl <= 86400:
            raise ValueError("PORTAL_SESSION_TTL_SECONDS must be between 300 and 86400")
        if any("@" not in email or "*" in email for email in self.allowed_emails):
            raise ValueError("PORTAL_ALLOWED_EMAILS must contain exact email addresses")

    @property
    def configured(self) -> bool:
        return bool(self.google_client_id and self.google_client_secret and self.allowed_emails)

    @property
    def secure_cookie(self) -> bool:
        return self.public_url.startswith("https://")

    @property
    def callback_url(self) -> str:
        return self.public_url + "/api/auth/google/callback"

    @classmethod
    def from_env(cls) -> "AuthConfig":
        return cls(
            public_url=(os.getenv("PORTAL_PUBLIC_URL") or "http://127.0.0.1:8000").rstrip("/"),
            google_client_id=os.getenv("PORTAL_GOOGLE_CLIENT_ID", ""),
            google_client_secret=os.getenv("PORTAL_GOOGLE_CLIENT_SECRET", ""),
            allowed_emails=tuple(
                email.strip().casefold()
                for email in os.getenv("PORTAL_ALLOWED_EMAILS", "").split(",")
                if email.strip()
            ),
            database=Path(
                os.getenv("PORTAL_AUTH_DB", str(Path.home() / ".tradingagents/portal/auth.sqlite3"))
            ).expanduser(),
            session_ttl=int(os.getenv("PORTAL_SESSION_TTL_SECONDS", "28800")),
        )
