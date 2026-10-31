import json

import pytest
from fastapi.testclient import TestClient

from tradingagents_ui.runtime.app import create_app
from tradingagents_ui.runtime.auth.config import AuthConfig
from tradingagents_ui.runtime.auth.routes import SESSION_COOKIE
from tradingagents_ui.runtime.config import TradingAgentsUIConfig
from tradingagents_ui.runtime.models import UserIdentity
from tradingagents_ui.runtime.services.tradingagents_adapter import TradingAgentsAdapter


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
        "analysis_execution": False,
        "history": False,
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
    assert client.get("/api/analysis").status_code == 404


def test_explicit_cors_and_no_wildcards(monkeypatch):
    with TestClient(create_app(TradingAgentsUIConfig(cors_origins=("http://localhost:5173",)))) as client:
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
    (tmp_path / "assets" / "app.js").write_text("console.log('tradingagents_ui')")
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
        "/api/auth/config",
        "/api/auth/me",
        "/api/auth/google/login",
        "/api/auth/google/callback",
        "/api/auth/logout",
    }
    assert "private-secret" not in json.dumps(schema)
