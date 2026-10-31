"""Small SQLite session repository. No Google tokens or credentials are stored."""

import hashlib
import os
import secrets
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path

from tradingagents_ui.runtime.models import UserIdentity


def digest(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()


@dataclass(frozen=True)
class LoginAttempt:
    nonce: str
    verifier: str
    next_path: str


class SessionStore:
    def __init__(self, path: Path) -> None:
        self.path = path

    @contextmanager
    def connection(self) -> Iterator[sqlite3.Connection]:
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        fd = os.open(self.path, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
        conn = sqlite3.connect(self.path, timeout=5)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                version = conn.execute("PRAGMA user_version").fetchone()[0]
                if version not in (0, 1):
                    raise RuntimeError("Unsupported TradingAgents UI auth database schema")
                if version == 0:
                    conn.execute(
                        "CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user_json TEXT NOT NULL, expires INTEGER NOT NULL)"
                    )
                    conn.execute(
                        "CREATE TABLE IF NOT EXISTS login_attempts (state TEXT PRIMARY KEY, binding TEXT NOT NULL, nonce TEXT NOT NULL, verifier TEXT NOT NULL, next_path TEXT NOT NULL, expires INTEGER NOT NULL)"
                    )
                    conn.execute("PRAGMA user_version = 1")
                yield conn
        finally:
            conn.close()

    def create_attempt(
        self, state: str, binding: str, nonce: str, verifier: str, next_path: str = "/"
    ) -> None:
        now = int(time.time())
        with self.connection() as conn:
            conn.execute(
                "DELETE FROM login_attempts WHERE expires <= ? OR binding = ?",
                (now, digest(binding)),
            )
            conn.execute("DELETE FROM sessions WHERE expires <= ?", (now,))
            conn.execute(
                "INSERT INTO login_attempts VALUES (?, ?, ?, ?, ?, ?)",
                (digest(state), digest(binding), nonce, verifier, next_path, now + 600),
            )

    def consume_attempt(self, state: str, binding: str) -> LoginAttempt | None:
        with self.connection() as conn:
            # Single atomic consumption: callbacks cannot replay or race across workers.
            row = conn.execute(
                "DELETE FROM login_attempts WHERE state = ? AND binding = ? AND expires > ? RETURNING nonce, verifier, next_path",
                (digest(state), digest(binding), int(time.time())),
            ).fetchone()
        return LoginAttempt(row["nonce"], row["verifier"], row["next_path"]) if row else None

    def create_session(self, user: UserIdentity, ttl: int) -> str:
        token = secrets.token_urlsafe(32)
        with self.connection() as conn:
            conn.execute(
                "INSERT INTO sessions VALUES (?, ?, ?)",
                (digest(token), user.model_dump_json(), int(time.time()) + ttl),
            )
        return token

    def user(self, token: str) -> UserIdentity | None:
        with self.connection() as conn:
            row = conn.execute(
                "SELECT user_json FROM sessions WHERE id = ? AND expires > ?",
                (digest(token), int(time.time())),
            ).fetchone()
        return UserIdentity.model_validate_json(row["user_json"]) if row else None

    def revoke(self, token: str) -> None:
        with self.connection() as conn:
            conn.execute("DELETE FROM sessions WHERE id = ?", (digest(token),))
