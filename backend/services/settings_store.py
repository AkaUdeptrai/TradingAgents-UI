"""Server-side store for validated TradingAgents UI setting overrides."""

import json
import os
import sqlite3
from pathlib import Path

from pydantic import JsonValue, TypeAdapter

_values = TypeAdapter(dict[str, JsonValue])


class SettingsStore:
    def __init__(self, database: Path) -> None:
        self.database = database
        self.database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        descriptor = os.open(self.database, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(descriptor)
        os.chmod(self.database, 0o600)
        with sqlite3.connect(self.database) as connection:
            connection.execute(
                "CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)"
            )

    def read(self) -> dict[str, JsonValue]:
        with sqlite3.connect(self.database) as connection:
            rows = connection.execute("SELECT key, value FROM settings").fetchall()
        return _values.validate_python({key: json.loads(value) for key, value in rows})

    def replace(self, values: dict[str, JsonValue]) -> None:
        safe_values = _values.validate_python(values)
        with sqlite3.connect(self.database) as connection:
            connection.execute("DELETE FROM settings")
            connection.executemany(
                "INSERT INTO settings(key, value) VALUES (?, ?)",
                [
                    (key, json.dumps(value, ensure_ascii=False))
                    for key, value in safe_values.items()
                ],
            )
