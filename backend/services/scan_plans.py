"""Persistent owner-scoped schedules for recurring ticker research."""

import json
import os
import sqlite3
import uuid
from contextlib import closing
from datetime import UTC, datetime, timedelta
from pathlib import Path

from backend.models import ScanPlan, ScanPlanCreate


class ScanPlanStore:
    def __init__(self, database: Path):
        self.database = database
        database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with closing(self._connect()) as db, db:
            db.execute("""CREATE TABLE IF NOT EXISTS scan_plans (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, name TEXT NOT NULL, tickers TEXT NOT NULL,
                frequency TEXT NOT NULL, asset_type TEXT NOT NULL, analysts TEXT NOT NULL,
                enabled INTEGER NOT NULL, next_run_at TEXT NOT NULL, last_run_at TEXT
            )""")
            db.execute("CREATE INDEX IF NOT EXISTS scans_due ON scan_plans(enabled, next_run_at)")

    def _connect(self) -> sqlite3.Connection:
        fd = os.open(self.database, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
        os.chmod(self.database, 0o600)
        db = sqlite3.connect(str(self.database), timeout=30)
        db.row_factory = sqlite3.Row
        return db

    @staticmethod
    def _model(row: sqlite3.Row) -> ScanPlan:
        return ScanPlan(
            id=row["id"],
            name=row["name"],
            tickers=json.loads(row["tickers"]),
            frequency=row["frequency"],
            asset_type=row["asset_type"],
            analysts=json.loads(row["analysts"]),
            enabled=bool(row["enabled"]),
            next_run_at=row["next_run_at"],
            last_run_at=row["last_run_at"],
        )

    def create(self, owner: str, request: ScanPlanCreate) -> ScanPlan:
        now = datetime.now(UTC)
        plan_id = str(uuid.uuid4())
        next_run = now + timedelta(days=1 if request.frequency == "daily" else 7)
        with closing(self._connect()) as db, db:
            db.execute(
                "INSERT INTO scan_plans VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, NULL)",
                (
                    plan_id,
                    owner,
                    request.name,
                    json.dumps(request.tickers),
                    request.frequency,
                    request.asset_type,
                    json.dumps(request.analysts),
                    next_run.isoformat(),
                ),
            )
        return self.get(owner, plan_id)  # type: ignore[return-value]

    def list_plans(self, owner: str) -> list[ScanPlan]:
        with closing(self._connect()) as db, db:
            rows = db.execute(
                "SELECT * FROM scan_plans WHERE owner=? ORDER BY name", (owner,)
            ).fetchall()
        return [self._model(row) for row in rows]

    def get(self, owner: str, plan_id: str) -> ScanPlan | None:
        with closing(self._connect()) as db, db:
            row = db.execute(
                "SELECT * FROM scan_plans WHERE owner=? AND id=?", (owner, plan_id)
            ).fetchone()
        return self._model(row) if row else None

    def delete(self, owner: str, plan_id: str) -> bool:
        with closing(self._connect()) as db, db:
            cursor = db.execute("DELETE FROM scan_plans WHERE owner=? AND id=?", (owner, plan_id))
        return cursor.rowcount > 0

    def set_enabled(self, owner: str, plan_id: str, enabled: bool) -> ScanPlan | None:
        with closing(self._connect()) as db, db:
            db.execute(
                "UPDATE scan_plans SET enabled=? WHERE owner=? AND id=?", (enabled, owner, plan_id)
            )
        return self.get(owner, plan_id)

    def claim_due(self) -> list[tuple[str, ScanPlan]]:
        now = datetime.now(UTC)
        claimed: list[tuple[str, ScanPlan]] = []
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM scan_plans WHERE enabled=1 AND next_run_at<=?", (now.isoformat(),)
            ).fetchall()
            for row in rows:
                plan = self._model(row)
                interval = timedelta(days=1 if plan.frequency == "daily" else 7)
                db.execute(
                    "UPDATE scan_plans SET next_run_at=?, last_run_at=? WHERE id=?",
                    ((now + interval).isoformat(), now.isoformat(), plan.id),
                )
                claimed.append((row["owner"], plan))
        return claimed
