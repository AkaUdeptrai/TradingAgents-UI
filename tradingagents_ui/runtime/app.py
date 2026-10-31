"""TradingAgents UI application with its bundled API and frontend."""

from collections.abc import Callable
from typing import TypeVar

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.middleware.base import RequestResponseEndpoint

from tradingagents_ui.runtime import __version__
from tradingagents_ui.runtime.auth.routes import AuthService
from tradingagents_ui.runtime.config import TradingAgentsUIConfig
from tradingagents_ui.runtime.models import (
    CapabilitiesResponse,
    ErrorResponse,
    HealthResponse,
    SettingsResponse,
    VersionResponse,
)
from tradingagents_ui.runtime.services.tradingagents_adapter import TradingAgentsAdapter

T = TypeVar("T")


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
    adapter = adapter or TradingAgentsAdapter()
    app = FastAPI(
        title="TradingAgents UI",
        version=__version__,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    auth = AuthService(config.auth)
    app.state.auth = auth
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
    def capabilities() -> CapabilitiesResponse:
        return _metadata(adapter.capabilities)

    @app.get(
        "/api/settings", response_model=SettingsResponse, responses=errors, dependencies=protected
    )
    def settings() -> SettingsResponse:
        return _metadata(adapter.settings)

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
        @app.get("/history", include_in_schema=False)
        @app.get("/settings", include_in_schema=False)
        @app.get("/login", include_in_schema=False)
        def frontend() -> FileResponse:
            return FileResponse(index, headers={"Cache-Control": "no-cache"})

    return app
