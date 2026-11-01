"""TradingAgents UI application with its bundled API and frontend."""

import asyncio
import json
import logging
import re
from collections.abc import Callable
from contextlib import asynccontextmanager, suppress
from typing import Annotated, TypeVar

from fastapi import BackgroundTasks, Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import RequestResponseEndpoint

from backend import __version__
from backend.auth.routes import AuthService
from backend.config import TradingAgentsUIConfig
from backend.models import (
    AnalysisCreate,
    AnalysisJob,
    CapabilitiesResponse,
    ErrorResponse,
    HealthResponse,
    ScanPlan,
    ScanPlanCreate,
    SettingsResponse,
    SettingsUpdate,
    UserIdentity,
    VersionResponse,
)
from backend.services.analysis_jobs import AnalysisJobStore, run_analysis_job
from backend.services.scan_plans import ScanPlanStore
from backend.services.settings_store import SettingsStore
from backend.services.tradingagents_adapter import (
    PUBLIC_SETTINGS,
    TradingAgentsAdapter,
)

T = TypeVar("T")
logger = logging.getLogger(__name__)
_SENSITIVE_VALUE = re.compile(
    r"(?i)(https?://|(?:api[_-]?key|token|secret|password)\s*[:=]|sk-[a-z0-9]{12,}|AIza[a-z0-9_-]{20,}|GOCSPX-[a-z0-9_-]{12,})"
)


def _safe_setting_value(value: object) -> bool:
    if isinstance(value, str):
        return not _SENSITIVE_VALUE.search(value) and not re.match(
            r"^(?:[A-Za-z]:[\\/]|/|\\\\)", value
        )
    if isinstance(value, dict):
        return len(value) <= 200 and all(
            isinstance(key, str)
            and not re.search(r"(?i)(api[_-]?key|secret|token|password|path|url|endpoint)", key)
            and _safe_setting_value(key)
            and _safe_setting_value(item)
            for key, item in value.items()
        )
    if isinstance(value, list):
        return len(value) <= 200 and all(_safe_setting_value(item) for item in value)
    return True


def _metadata(read: Callable[[], T]) -> T:
    try:
        return read()
    except Exception:
        # Do not let error details reach responses or Uvicorn exception logs.
        raise HTTPException(status_code=503, detail="Core metadata is unavailable.") from None


def create_app(
    config: TradingAgentsUIConfig | None = None, adapter: TradingAgentsAdapter | None = None
) -> FastAPI:
    config = config or TradingAgentsUIConfig.from_env()
    settings_store = SettingsStore(config.auth.database.with_name("settings.sqlite3"))
    adapter = adapter or TradingAgentsAdapter(settings_store)
    if getattr(adapter, "settings_store", None) is None:
        adapter.settings_store = settings_store
    scan_store = ScanPlanStore(config.auth.database.with_name("scan_plans.sqlite3"))

    def run_due_scans() -> None:
        for owner, plan in scan_store.claim_due():
            try:
                trade_date = adapter.capabilities().current_trade_date
                for ticker in plan.tickers:
                    request = AnalysisCreate(
                        ticker=ticker,
                        trade_date=trade_date,
                        asset_type=plan.asset_type,
                        analysts=plan.analysts,
                    )
                    job = app.state.analysis_jobs.create(owner, request)
                    run_analysis_job(app.state.analysis_jobs, job, adapter)
            except Exception as exc:
                logger.error(
                    "Scheduled scan failed (plan_id=%s, error_type=%s)", plan.id, type(exc).__name__
                )

    @asynccontextmanager
    async def lifespan(_app: FastAPI):
        async def scheduler() -> None:
            while True:
                await asyncio.to_thread(run_due_scans)
                await asyncio.sleep(30)

        task = asyncio.create_task(scheduler())
        try:
            yield
        finally:
            task.cancel()
            with suppress(asyncio.CancelledError):
                await task

    app = FastAPI(
        title="TradingAgents UI",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
        lifespan=lifespan,
    )
    auth = AuthService(config.auth)
    app.state.auth = auth
    app.state.analysis_jobs = AnalysisJobStore(config.auth.database.with_name("analysis.sqlite3"))
    app.state.scan_plans = scan_store
    app.include_router(auth.router())
    protected = [Depends(auth.require_user)]
    if config.cors_origins:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=list(config.cors_origins),
            allow_methods=["GET", "POST"],
            allow_headers=["Accept", "Content-Type"],
            allow_credentials=True,
        )

    @app.middleware("http")
    async def private_responses(request: Request, call_next: RequestResponseEndpoint) -> Response:
        response = await call_next(request)
        if request.url.path.startswith("/api/"):
            response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["X-Frame-Options"] = "DENY"
        return response

    errors: dict[int | str, dict[str, object]] = {
        401: {"model": ErrorResponse},
        503: {"model": ErrorResponse},
    }

    @app.get(
        "/api/health", response_model=HealthResponse, responses={503: {"model": HealthResponse}}
    )
    def health(response: Response) -> HealthResponse:
        try:
            adapter.check_core()
        except Exception:
            response.status_code = 503
            return HealthResponse(status="degraded", application="available", core="unavailable")
        return HealthResponse(status="ok", application="available", core="available")

    @app.get(
        "/api/version", response_model=VersionResponse, responses=errors, dependencies=protected
    )
    def version() -> VersionResponse:
        return VersionResponse(ui=__version__, core=_metadata(adapter.version))

    @app.get(
        "/api/capabilities",
        response_model=CapabilitiesResponse,
        responses=errors,
        dependencies=protected,
    )
    def capabilities(
        user: Annotated[UserIdentity, Depends(auth.require_user)],
    ) -> CapabilitiesResponse:
        response = _metadata(adapter.capabilities)
        response.runtime.settings_write = user.role == "admin"
        return response

    @app.get(
        "/api/settings", response_model=SettingsResponse, responses=errors, dependencies=protected
    )
    def settings(user: Annotated[UserIdentity, Depends(auth.require_user)]) -> SettingsResponse:
        response = _metadata(adapter.settings)
        response.read_only = user.role != "admin"
        return response

    @app.put(
        "/api/settings",
        response_model=SettingsResponse,
        responses={401: {"model": ErrorResponse}, 403: {"model": ErrorResponse}},
    )
    def update_settings(
        payload: SettingsUpdate,
        _admin: Annotated[UserIdentity, Depends(auth.require_admin)],
    ) -> SettingsResponse:
        if set(payload.values) - PUBLIC_SETTINGS:
            raise HTTPException(status_code=422, detail="Setting key is not editable.")
        defaults = _metadata(adapter.settings).values
        core_defaults = adapter.default_config()
        for key, value in payload.values.items():
            original = defaults.get(key)
            default_value = core_defaults.get(key)
            valid = value is None and default_value is None
            if value is not None and original is not None:
                valid = type(value) is type(original)
            if default_value is None and value is not None:
                expected = (
                    str
                    if key
                    in {
                        "benchmark_ticker",
                        "deep_think_provider",
                        "quick_think_provider",
                        "google_thinking_level",
                        "openai_reasoning_effort",
                        "anthropic_effort",
                    }
                    else (int, float)
                    if key == "temperature"
                    else int
                    if key
                    in {
                        "llm_max_retries",
                        "max_tokens",
                        "max_debate_rounds",
                        "max_risk_discuss_rounds",
                        "max_recur_limit",
                        "max_tool_rounds",
                        "news_article_limit",
                        "global_news_article_limit",
                        "global_news_lookback_days",
                        "holding_period_days",
                        "memory_log_max_entries",
                    }
                    else None
                )
                valid = expected is not None and type(value) in (
                    expected if isinstance(expected, tuple) else (expected,)
                )
            if not valid:
                raise HTTPException(status_code=422, detail=f"Invalid value for {key}.")
            if len(json.dumps(value, ensure_ascii=False)) > 20_000 or not _safe_setting_value(
                value
            ):
                raise HTTPException(status_code=422, detail=f"Unsafe or oversized value for {key}.")
        try:
            # Merge so unchanged keys keep following .env/core defaults.
            settings_store.replace({**settings_store.read(), **payload.values})
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=422, detail="Settings must contain valid JSON values."
            ) from None
        response = _metadata(adapter.settings)
        response.read_only = False
        return response

    @app.post(
        "/api/analysis",
        response_model=AnalysisJob,
        status_code=202,
        responses={401: {"model": ErrorResponse}},
    )
    def create_analysis(
        payload: AnalysisCreate,
        background: BackgroundTasks,
        user: Annotated[UserIdentity, Depends(auth.require_user)],
    ) -> AnalysisJob:
        if not payload.ticker.strip() or len(payload.ticker) > 32:
            raise HTTPException(status_code=422, detail="Enter a valid ticker.")
        if not payload.analysts:
            raise HTTPException(status_code=422, detail="Select at least one analyst.")
        try:
            adapter.validate_analysis_date(payload.trade_date)
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc)) from None
        job = app.state.analysis_jobs.create(user.subject, payload)
        background.add_task(run_analysis_job, app.state.analysis_jobs, job, adapter)
        return job

    @app.get("/api/analysis", response_model=list[AnalysisJob], dependencies=protected)
    def list_analyses(
        user: Annotated[UserIdentity, Depends(auth.require_user)],
    ) -> list[AnalysisJob]:
        return app.state.analysis_jobs.list(user.subject)

    @app.get("/api/analysis/{job_id}", response_model=AnalysisJob, dependencies=protected)
    def get_analysis(
        job_id: str, user: Annotated[UserIdentity, Depends(auth.require_user)]
    ) -> AnalysisJob:
        job = app.state.analysis_jobs.get(user.subject, job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Analysis job not found.")
        return job

    @app.get("/api/scans", response_model=list[ScanPlan], dependencies=protected)
    def list_scans(user: Annotated[UserIdentity, Depends(auth.require_user)]) -> list[ScanPlan]:
        return scan_store.list_plans(user.subject)

    @app.post("/api/scans", response_model=ScanPlan, status_code=201)
    def create_scan(
        payload: ScanPlanCreate,
        user: Annotated[UserIdentity, Depends(auth.require_user)],
    ) -> ScanPlan:
        return scan_store.create(user.subject, payload)

    @app.patch("/api/scans/{plan_id}", response_model=ScanPlan)
    def update_scan(
        plan_id: str,
        enabled: bool,
        user: Annotated[UserIdentity, Depends(auth.require_user)],
    ) -> ScanPlan:
        plan = scan_store.set_enabled(user.subject, plan_id, enabled)
        if plan is None:
            raise HTTPException(status_code=404, detail="Scan plan not found.")
        return plan

    @app.delete("/api/scans/{plan_id}", status_code=204)
    def delete_scan(
        plan_id: str, user: Annotated[UserIdentity, Depends(auth.require_user)]
    ) -> Response:
        if not scan_store.delete(user.subject, plan_id):
            raise HTTPException(status_code=404, detail="Scan plan not found.")
        return Response(status_code=204)

    @app.get("/openapi.json", include_in_schema=False, dependencies=protected)
    def openapi() -> JSONResponse:
        return JSONResponse(app.openapi(), headers={"Cache-Control": "no-store"})

    @app.get("/docs", include_in_schema=False, dependencies=protected)
    def docs() -> HTMLResponse:
        return get_swagger_ui_html(openapi_url="/openapi.json", title="TradingAgents UI")

    if config.static_dir is not None:
        index = config.static_dir / "index.html"
        if not index.is_file():
            raise ValueError("TRADINGAGENTS_UI_STATIC_DIR must contain a built frontend")
        app.mount("/assets", StaticFiles(directory=config.static_dir / "assets"), name="assets")

        # Explicit SPA routes prevent unknown API/asset paths returning HTML with 200.
        @app.get("/", include_in_schema=False)
        @app.get("/analysis/new", include_in_schema=False)
        @app.get("/scans", include_in_schema=False)
        @app.get("/history", include_in_schema=False)
        @app.get("/settings", include_in_schema=False)
        @app.get("/login", include_in_schema=False)
        def frontend() -> FileResponse:
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app
