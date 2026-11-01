"""Persistent, owner-scoped analysis jobs for the web application."""

import json
import logging
import os
import sqlite3
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import TYPE_CHECKING

from backend.models import (
    AnalysisCreate,
    AnalysisJob,
    AnalysisProgress,
    AnalysisResult,
)

logger = logging.getLogger(__name__)
MAX_ANALYSIS_ATTEMPTS = 2
RETRY_BACKOFF_SECONDS = 1
if TYPE_CHECKING:
    from backend.services.tradingagents_adapter import TradingAgentsAdapter


def _now() -> str:
    return datetime.now(UTC).isoformat()


def _is_transient_provider_error(error: Exception) -> bool:
    """Retry connection/timeouts, rate limits, and provider 5xx errors only."""
    current: BaseException | None = error
    seen: set[int] = set()
    while current is not None and id(current) not in seen:
        seen.add(id(current))
        if isinstance(current, TimeoutError | ConnectionError):
            return True
        response = getattr(current, "response", None)
        status = getattr(current, "status_code", None) or getattr(response, "status_code", None)
        if isinstance(status, int) and (status == 429 or 500 <= status <= 599):
            return True
        name = type(current).__name__.lower()
        if any(
            marker in name
            for marker in (
                "timeout",
                "connectionerror",
                "connectionexception",
                "connecterror",
                "networkerror",
                "remoteprotocolerror",
                "ratelimit",
                "resourceexhausted",
                "serviceunavailable",
                "deadlineexceeded",
                "internalservererror",
            )
        ):
            return True
        current = current.__cause__ or current.__context__
    return False


class AnalysisJobStore:
    def __init__(self, database: Path):
        self.database = database
        database.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        with self._connect() as db:
            db.execute(
                """CREATE TABLE IF NOT EXISTS analysis_jobs (
                    id TEXT PRIMARY KEY, owner TEXT NOT NULL, ticker TEXT NOT NULL,
                    trade_date TEXT NOT NULL, asset_type TEXT NOT NULL,
                    analysts TEXT NOT NULL, status TEXT NOT NULL, error TEXT,
                    progress TEXT,
                    result TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
                )"""
            )
            columns = {row["name"] for row in db.execute("PRAGMA table_info(analysis_jobs)")}
            if "progress" not in columns:
                db.execute("ALTER TABLE analysis_jobs ADD COLUMN progress TEXT")
            db.execute(
                "CREATE INDEX IF NOT EXISTS jobs_owner_created ON analysis_jobs(owner, created_at)"
            )
            db.execute(
                "UPDATE analysis_jobs SET status='failed', error='Analysis interrupted by server restart.', updated_at=? WHERE status IN ('queued','running')",
                (_now(),),
            )

    def _connect(self) -> sqlite3.Connection:
        fd = os.open(self.database, os.O_CREAT | os.O_WRONLY, 0o600)
        os.close(fd)
        os.chmod(self.database, 0o600)
        db = sqlite3.connect(str(self.database), timeout=30)
        db.row_factory = sqlite3.Row
        return db

    def create(self, owner: str, request: AnalysisCreate) -> AnalysisJob:
        job_id, now = str(uuid.uuid4()), _now()
        with self._connect() as db:
            db.execute(
                """INSERT INTO analysis_jobs
                   (id, owner, ticker, trade_date, asset_type, analysts, status, error,
                    progress, result, created_at, updated_at)
                   VALUES (?, ?, ?, ?, ?, ?, 'queued', NULL, NULL, NULL, ?, ?)""",
                (
                    job_id,
                    owner,
                    request.ticker,
                    request.trade_date,
                    request.asset_type,
                    json.dumps(request.analysts),
                    now,
                    now,
                ),
            )
        job = self.get(owner, job_id)
        assert job is not None
        return job

    def update(
        self,
        job_id: str,
        status: str,
        *,
        error: str | None = None,
        progress: AnalysisProgress | None = None,
        result: AnalysisResult | None = None,
    ) -> None:
        with self._connect() as db:
            db.execute(
                """UPDATE analysis_jobs
                   SET status=?, error=?, result=COALESCE(?, result),
                       progress=COALESCE(?, progress), updated_at=? WHERE id=?""",
                (
                    status,
                    error,
                    result.model_dump_json() if result else None,
                    progress.model_dump_json() if progress else None,
                    _now(),
                    job_id,
                ),
            )

    def get(self, owner: str, job_id: str) -> AnalysisJob | None:
        with self._connect() as db:
            row = db.execute(
                "SELECT * FROM analysis_jobs WHERE owner=? AND id=?", (owner, job_id)
            ).fetchone()
        return self._model(row) if row else None

    def list(self, owner: str) -> list[AnalysisJob]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT * FROM analysis_jobs WHERE owner=? ORDER BY created_at DESC LIMIT 100",
                (owner,),
            ).fetchall()
        return [self._model(row) for row in rows]

    @staticmethod
    def _model(row: sqlite3.Row) -> AnalysisJob:
        return AnalysisJob(
            id=row["id"],
            ticker=row["ticker"],
            trade_date=row["trade_date"],
            asset_type=row["asset_type"],
            analysts=json.loads(row["analysts"]),
            status=row["status"],
            progress=AnalysisProgress.model_validate_json(row["progress"])
            if row["progress"]
            else None,
            error=row["error"],
            result=AnalysisResult.model_validate_json(row["result"]) if row["result"] else None,
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )


def run_analysis_job(
    store: AnalysisJobStore, job: AnalysisJob, adapter: "TradingAgentsAdapter"
) -> None:
    for attempt in range(1, MAX_ANALYSIS_ATTEMPTS + 1):
        store.update(job.id, "running")
        try:
            result = adapter.run_analysis(
                job.ticker,
                job.trade_date,
                job.asset_type,
                job.analysts,
                on_progress=lambda progress, attempt=attempt: store.update(
                    job.id,
                    "running",
                    progress=progress.model_copy(
                        update={"attempt": attempt, "max_attempts": MAX_ANALYSIS_ATTEMPTS}
                    ),
                ),
            )
            store.update(job.id, "completed", result=result)
            return
        except Exception as exc:  # provider errors can contain credentials or endpoint details
            if attempt < MAX_ANALYSIS_ATTEMPTS and _is_transient_provider_error(exc):
                logger.warning(
                    "Transient analysis failure; retrying (id=%s, attempt=%s, error_type=%s)",
                    job.id,
                    attempt,
                    type(exc).__name__,
                )
                store.update(
                    job.id,
                    "running",
                    progress=AnalysisProgress(
                        phase="retry",
                        label="Lỗi kết nối tạm thời. Hệ thống sẽ tự thử lại…",
                        attempt=attempt + 1,
                        max_attempts=MAX_ANALYSIS_ATTEMPTS,
                    ),
                )
                time.sleep(RETRY_BACKOFF_SECONDS)
                continue

            logger.error("Analysis job failed (id=%s, error_type=%s)", job.id, type(exc).__name__)
            store.update(
                job.id,
                "failed",
                error=(
                    "Phân tích thất bại sau 2 lần thử. Hãy kiểm tra cấu hình nhà cung cấp "
                    "hoặc kết nối rồi thử lại."
                ),
            )
            return
