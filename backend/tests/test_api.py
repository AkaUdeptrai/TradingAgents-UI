import json
import time
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.app import create_app
from backend.auth.config import AuthConfig
from backend.auth.routes import SESSION_COOKIE
from backend.config import TradingAgentsUIConfig
from backend.models import (
    AnalysisCreate,
    AnalysisProgress,
    AnalysisResult,
    UserIdentity,
)
from backend.services.analysis_jobs import AnalysisJobStore, run_analysis_job
from backend.services.settings_store import SettingsStore
from backend.services.tradingagents_adapter import TradingAgentsAdapter


@pytest.fixture
def client(tmp_path):
    config = AuthConfig(
        google_client_id="test",
        google_client_secret="test",
        allowed_emails=("test@example.com",),
        database=tmp_path / "auth.sqlite3",
    )
    app = create_app(TradingAgentsUIConfig(auth=config))
    token = app.state.auth.store.create_session(
        UserIdentity(subject="test", email="test@example.com", name="Test"), 600
    )
    with TestClient(app) as client:
        client.cookies.set(SESSION_COOKIE, token)
        yield client


def test_health_imports_real_graph_without_constructing_it(client, monkeypatch):
    from tradingagents.graph.trading_graph import TradingAgentsGraph

    def forbidden(*args, **kwargs):
        raise AssertionError("Health must never construct an analysis graph")

    monkeypatch.setattr(TradingAgentsGraph, "__init__", forbidden)
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "application": "available", "core": "available"}
    assert response.headers["Cache-Control"] == "no-store"


def test_health_failure_is_degraded_and_redacted(monkeypatch):
    def broken(self):
        raise ImportError("secret-from-environment")

    monkeypatch.setattr(TradingAgentsAdapter, "check_core", broken)
    with TestClient(create_app(TradingAgentsUIConfig())) as client:
        response = client.get("/api/health")
    assert response.status_code == 503
    assert response.json()["core"] == "unavailable"
    assert "secret" not in response.text


def test_adapter_normalizes_ticker_and_reuses_core_graph(monkeypatch, tmp_path):
    from tradingagents.graph import trading_graph

    captured = {}

    class FakeGraph:
        def __init__(self, analysts, config):
            captured["analysts"] = analysts
            captured["graph_config"] = config
            self.config = {"max_risk_discuss_rounds": 1}
            self.propagator = type("Propagator", (), {"get_graph_args": lambda self: {}})()

        def create_run_state(self, ticker, trade_date, asset_type):
            captured.update(ticker=ticker, trade_date=trade_date, asset_type=asset_type)
            return {}

        def begin_checkpoint(self, ticker, trade_date, asset_type):
            return None

        def checkpoint_input(self, state):
            return state

        def stream_run(self, state, **kwargs):
            yield (
                [
                    SimpleNamespace(
                        type="ai",
                        id="live-message-1",
                        name="Market Analyst",
                        content="Price momentum is weak.",
                    )
                ],
                None,
            )
            yield [], {"market_report": "Market report", "final_trade_decision": "Rating: Buy"}

        def record_decision(self, ticker, trade_date, state):
            captured["recorded"] = True

        def clear_checkpoint_on_success(self, ticker, trade_date, asset_type):
            captured["cleared"] = True

        def end_checkpoint(self):
            captured["checkpoint_closed"] = True

        def default_report_path(self, ticker):
            return tmp_path / "report"

        def save_reports(self, state, ticker, report_path, html):
            captured["saved"] = html

    monkeypatch.setattr(trading_graph, "TradingAgentsGraph", FakeGraph)
    updates = []
    result = TradingAgentsAdapter().run_analysis(
        "BTCUSD", "2026-10-31", "crypto", ["market"], on_progress=updates.append
    )
    assert captured["ticker"] == "BTC-USD"
    assert captured["analysts"] == ["market"]
    assert captured["graph_config"]["llm_timeout_seconds"] == 120
    assert captured["graph_config"]["llm_max_retries"] == 1
    assert captured["saved"] is True
    assert result.final_rating == "Buy"
    assert result.reports["market_report"] == "Market report"
    assert any(
        message.content == "Price momentum is weak."
        for update in updates
        for message in update.messages
    )
    assert captured["recorded"] and captured["cleared"] and captured["checkpoint_closed"]
    assert updates[-1].steps[0].status == "completed"


def test_analysis_job_retries_transient_provider_failure_once(tmp_path):
    store = AnalysisJobStore(tmp_path / "analysis.sqlite3")
    job = store.create(
        "owner",
        AnalysisCreate(ticker="NVDA", trade_date="2026-10-31", analysts=["market"]),
    )

    class RetryOnceAdapter:
        calls = 0

        def run_analysis(self, *args, on_progress):
            self.calls += 1
            if self.calls == 1:
                raise TimeoutError("simulated provider timeout")
            on_progress(AnalysisProgress(phase="complete", label="Done"))
            return AnalysisResult(final_rating="Buy", final_trade_decision="Buy")

    adapter = RetryOnceAdapter()
    run_analysis_job(store, job, adapter)
    completed = store.get("owner", job.id)
    assert adapter.calls == 2
    assert completed is not None and completed.status == "completed"
    assert completed.progress is not None
    assert completed.progress.attempt == 2
    assert completed.progress.max_attempts == 2


def test_analysis_job_does_not_retry_permanent_provider_failure(tmp_path):
    store = AnalysisJobStore(tmp_path / "analysis.sqlite3")
    job = store.create(
        "owner",
        AnalysisCreate(ticker="NVDA", trade_date="2026-10-31", analysts=["market"]),
    )

    class InvalidRequestAdapter:
        calls = 0

        def run_analysis(self, *args, on_progress):
            self.calls += 1
            raise ValueError("bad request")

    adapter = InvalidRequestAdapter()
    run_analysis_job(store, job, adapter)
    failed = store.get("owner", job.id)
    assert adapter.calls == 1
    assert failed is not None and failed.status == "failed"


def test_capabilities_follow_core_catalog(client, monkeypatch):
    from cli.prompts import _llm_provider_table
    from tradingagents.graph.analyst_execution import ANALYST_NODE_SPECS
    from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS

    monkeypatch.setitem(
        MODEL_OPTIONS,
        "test-provider",
        {"quick": [("Test model", "test-model"), ("Custom", "custom")]},
    )
    response = client.get("/api/capabilities")
    assert response.status_code == 200
    data = response.json()
    expected = set(MODEL_OPTIONS) | {key for _, key, _ in _llm_provider_table()}
    assert {provider["id"] for provider in data["providers"]} == expected
    for custom_provider in ("azure", "openrouter"):
        entry = next(p for p in data["providers"] if p["id"] == custom_provider)
        assert entry["models"] == {}
        assert entry["allows_custom_model"] is True
    provider = next(provider for provider in data["providers"] if provider["id"] == "test-provider")
    assert provider["models"]["quick"] == [{"id": "test-model", "label": "Test model"}]
    assert provider["allows_custom_model"] is True
    assert {a["id"] for a in data["analysts"]} == set(ANALYST_NODE_SPECS)
    assert data["runtime"] == {
        "analysis_execution": True,
        "history": True,
        "settings_write": False,
    }
    assert data["output_languages"]["mode"] == "free_text"


def test_settings_reflect_environment_and_do_not_expose_secrets(client, monkeypatch):
    import tradingagents.default_config as core

    original = core.build_default_config

    def with_secret():
        return {**original(), "future_api_key": "private-secret"}

    monkeypatch.setattr(core, "build_default_config", with_secret)
    monkeypatch.setenv("OPENAI_API_KEY", "private-secret")
    monkeypatch.setenv(
        "TRADINGAGENTS_LLM_BACKEND_URL",
        "https://user:private-secret@example.test/?key=private-secret",
    )
    monkeypatch.setenv("TRADINGAGENTS_OUTPUT_LANGUAGE", "Vietnamese")
    monkeypatch.setenv("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "3")
    response = client.get("/api/settings")
    assert response.status_code == 200
    data = response.json()
    assert data["values"]["output_language"] == "Vietnamese"
    assert data["values"]["max_debate_rounds"] == 3
    assert "backend_url" not in data["values"]
    for endpoint in ("settings", "capabilities"):
        assert "private-secret" not in client.get(f"/api/{endpoint}").text


def test_config_errors_are_not_returned_or_logged(client, monkeypatch, caplog):
    monkeypatch.setenv("TRADINGAGENTS_MAX_DEBATE_ROUNDS", "private-secret")
    for endpoint in ("settings", "capabilities"):
        response = client.get(f"/api/{endpoint}")
        assert response.status_code == 503
        assert response.json() == {"detail": "Core metadata is unavailable."}
    assert "private-secret" not in caplog.text


def test_version_and_read_only_routes(client):
    import tradingagents

    assert client.get("/api/version").json()["core"] == tradingagents.__version__
    assert client.post("/api/settings", json={}).status_code == 405
    assert client.put("/api/settings", json={"values": {"max_debate_rounds": 2}}).status_code == 403
    assert client.get("/api/analysis").json() == []


def test_settings_write_is_admin_only_and_persisted(tmp_path):
    config = AuthConfig(
        google_client_id="test",
        google_client_secret="test",
        allowed_emails=("admin@example.com",),
        admin_emails=("admin@example.com",),
        database=tmp_path / "auth.sqlite3",
    )
    app = create_app(TradingAgentsUIConfig(auth=config))
    token = app.state.auth.store.create_session(
        UserIdentity(subject="admin", email="admin@example.com", name="Admin"), 600
    )
    with TestClient(app) as admin:
        admin.cookies.set(SESSION_COOKIE, token)
        assert admin.get("/api/settings").json()["read_only"] is False
        assert admin.get("/api/capabilities").json()["runtime"]["settings_write"] is True
        response = admin.put("/api/settings", json={"values": {"max_debate_rounds": 3}})
        assert response.status_code == 200
        assert response.json()["read_only"] is False
        assert response.json()["source"] == "core_defaults_environment_and_admin_overrides"
        assert response.json()["values"]["max_debate_rounds"] == 3
        assert (
            admin.put(
                "/api/settings", json={"values": {"backend_url": "https://secret.test"}}
            ).status_code
            == 422
        )
        assert (
            admin.put("/api/settings", json={"values": {"max_debate_rounds": "three"}}).status_code
            == 422
        )
        assert (
            admin.put("/api/settings", json={"values": {"llm_provider": None}}).status_code == 422
        )
        assert (
            admin.put(
                "/api/settings", json={"values": {"output_language": "https://private.test"}}
            ).status_code
            == 422
        )
        assert admin.get("/api/settings").json()["values"]["max_debate_rounds"] == 3
        # Partial updates merge with earlier overrides instead of freezing every key.
        response = admin.put("/api/settings", json={"values": {"deep_think_provider": "openai"}})
        assert response.status_code == 200
        assert SettingsStore(tmp_path / "settings.sqlite3").read() == {
            "max_debate_rounds": 3,
            "deep_think_provider": "openai",
        }


def test_analysis_jobs_run_and_are_owner_scoped(client, monkeypatch):
    def run_analysis(self, ticker, trade_date, asset_type, analysts, *, on_progress):
        on_progress(
            AnalysisProgress(
                phase="analysts",
                label="Đang chạy các tác tử phân tích",
                steps=[],
                reports={"market_report": "Partial report"},
            )
        )
        return AnalysisResult(
            final_rating="Buy", final_trade_decision="Buy NVDA", reports={"market_report": "Report"}
        )

    monkeypatch.setattr(TradingAgentsAdapter, "run_analysis", run_analysis)
    response = client.post(
        "/api/analysis",
        json={"ticker": "nvda", "trade_date": "2026-01-15", "analysts": ["market"]},
    )
    assert response.status_code == 202
    job = response.json()
    assert job["ticker"] == "NVDA"
    for _ in range(40):
        job = client.get(f"/api/analysis/{job['id']}").json()
        if job["status"] in {"completed", "failed"}:
            break
        time.sleep(0.025)
    assert job["status"] == "completed"
    assert job["result"]["reports"]["market_report"] == "Report"
    assert job["progress"]["reports"]["market_report"] == "Partial report"
    assert client.get("/api/analysis").json()[0]["id"] == job["id"]
    assert client.get(f"/api/analysis/{job['id']}").json()["result"]["final_rating"] == "Buy"
    assert (
        client.post(
            "/api/analysis",
            json={"ticker": "../secret", "trade_date": "2026-01-15", "analysts": ["market"]},
        ).status_code
        == 422
    )


def test_analysis_rejects_future_date_using_core_calendar(client, monkeypatch):
    from tradingagents.dataflows import date_window

    monkeypatch.setattr(date_window, "get_current_date", lambda: "2026-10-31")
    response = client.post(
        "/api/analysis",
        json={"ticker": "NVDA", "trade_date": "2026-11-01", "analysts": ["market"]},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Analysis date cannot be in the future."


def test_scan_plans_are_persisted_owner_scoped_and_validated(client):
    response = client.post(
        "/api/scans",
        json={
            "name": "Large cap",
            "tickers": ["nvda", "AAPL", "nvda"],
            "frequency": "daily",
            "asset_type": "stock",
            "analysts": ["market", "fundamentals"],
        },
    )
    assert response.status_code == 201
    plan = response.json()
    assert plan["tickers"] == ["NVDA", "AAPL"]
    assert plan["enabled"] is True
    assert client.get("/api/scans").json()[0]["id"] == plan["id"]
    assert client.patch(f"/api/scans/{plan['id']}?enabled=false").json()["enabled"] is False
    assert client.delete(f"/api/scans/{plan['id']}").status_code == 204
    assert client.get("/api/scans").json() == []
    assert (
        client.post(
            "/api/scans",
            json={
                "name": "bad",
                "tickers": ["../secret"],
                "analysts": ["market"],
            },
        ).status_code
        == 422
    )
    assert (
        client.post(
            "/api/scans",
            json={
                "name": "bad",
                "tickers": ["BTC-USD"],
                "asset_type": "crypto",
                "analysts": ["fundamentals"],
            },
        ).status_code
        == 422
    )


def test_analysis_job_is_not_visible_to_another_user(client, monkeypatch):
    monkeypatch.setattr(
        TradingAgentsAdapter,
        "run_analysis",
        lambda *args, **kwargs: AnalysisResult(final_rating="Buy"),
    )
    token = client.app.state.auth.store.create_session(
        UserIdentity(subject="other", email="test@example.com", name="Other"), 600
    )
    response = client.post(
        "/api/analysis",
        json={"ticker": "NVDA", "trade_date": "2026-01-15", "analysts": ["market"]},
    )
    job_id = response.json()["id"]
    with TestClient(client.app) as other_client:
        other_client.cookies.set(SESSION_COOKIE, token)
        assert other_client.get("/api/auth/me").json()["subject"] == "other"
        assert other_client.get(f"/api/analysis/{job_id}").status_code == 404


def test_explicit_cors_and_no_wildcards(monkeypatch):
    with TestClient(
        create_app(TradingAgentsUIConfig(cors_origins=("http://localhost:5173",)))
    ) as client:
        assert (
            client.get("/api/version", headers={"Origin": "http://localhost:5173"}).headers[
                "access-control-allow-origin"
            ]
            == "http://localhost:5173"
        )
        assert (
            "access-control-allow-origin"
            not in client.get("/api/version", headers={"Origin": "https://untrusted.test"}).headers
        )
    monkeypatch.setenv("TRADINGAGENTS_UI_CORS_ORIGINS", "*")
    with pytest.raises(ValueError, match="explicit"):
        TradingAgentsUIConfig.from_env()


def test_spa_deep_links_and_missing_assets(tmp_path):
    (tmp_path / "assets").mkdir()
    (tmp_path / "index.html").write_text("<html>TradingAgents UI</html>")
    (tmp_path / "assets" / "app.js").write_text("console.log('app')")
    with TestClient(create_app(TradingAgentsUIConfig(static_dir=tmp_path))) as client:
        for route in ("/", "/settings", "/history", "/analysis/new", "/login"):
            assert client.get(route).text == "<html>TradingAgents UI</html>"
        assert client.get("/assets/app.js").status_code == 200
        assert client.get("/api/missing").status_code == 404
        assert client.get("/assets/missing.js").status_code == 404
        assert client.get("/assets/../.env").status_code == 404


def test_openapi_does_not_contain_environment(client, monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_DEEP_THINK_LLM", "private-secret")
    schema = client.get("/openapi.json").json()
    assert set(schema["paths"]) == {
        "/api/health",
        "/api/version",
        "/api/capabilities",
        "/api/settings",
        "/api/analysis",
        "/api/analysis/{job_id}",
        "/api/scans",
        "/api/scans/{plan_id}",
        "/api/auth/config",
        "/api/auth/me",
        "/api/auth/google/login",
        "/api/auth/google/callback",
        "/api/auth/logout",
    }
    assert "private-secret" not in json.dumps(schema)
