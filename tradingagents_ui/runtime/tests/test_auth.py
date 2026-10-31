import json
import time
from dataclasses import replace
from unittest.mock import Mock
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi.testclient import TestClient
from google.auth.exceptions import GoogleAuthError

from tradingagents_ui.runtime.app import create_app
from tradingagents_ui.runtime.auth.config import AuthConfig
from tradingagents_ui.runtime.auth.google import GoogleOAuth
from tradingagents_ui.runtime.auth.routes import SESSION_COOKIE
from tradingagents_ui.runtime.auth.store import SessionStore, digest
from tradingagents_ui.runtime.config import TradingAgentsUIConfig
from tradingagents_ui.runtime.models import UserIdentity

USER = UserIdentity(subject="google-subject", email="allowed@example.com", name="Researcher")


@pytest.fixture
def auth_config(tmp_path):
    return AuthConfig(
        google_client_id="test-client",
        google_client_secret="test-only-secret",
        allowed_emails=(USER.email,),
        database=tmp_path / "auth.sqlite3",
    )


@pytest.fixture
def auth_app(auth_config):
    return create_app(TradingAgentsUIConfig(auth=auth_config))


def start_login(client, next_path="/settings"):
    response = client.get(
        "/api/auth/google/login", params={"next": next_path}, follow_redirects=False
    )
    assert response.status_code == 302
    query = parse_qs(urlsplit(response.headers["location"]).query)
    assert query["scope"] == ["openid email profile"]
    assert query["code_challenge_method"] == ["S256"]
    assert "client_secret" not in query
    assert query["redirect_uri"] == ["http://127.0.0.1:8000/api/auth/google/callback"]
    return query


def test_unconfigured_denies_data_and_login(tmp_path):
    app = create_app(TradingAgentsUIConfig(auth=AuthConfig(database=tmp_path / "unused.sqlite3")))
    with TestClient(app) as client:
        assert client.get("/api/auth/config").json() == {"provider": "google", "configured": False}
        for path in (
            "/api/settings",
            "/api/capabilities",
            "/api/version",
            "/api/auth/me",
            "/docs",
            "/openapi.json",
        ):
            assert client.get(path).status_code == 401
        assert client.get("/api/auth/google/login").status_code == 503
        assert client.get("/api/health").status_code == 200
    assert not (tmp_path / "unused.sqlite3").exists()


def test_login_callback_session_logout_and_replay(auth_app, monkeypatch):
    auth = auth_app.state.auth
    identity = Mock(return_value=USER)
    monkeypatch.setattr(auth.google, "identity", identity)
    with TestClient(auth_app) as client:
        assert client.get("/api/settings").status_code == 401
        query = start_login(client)
        response = client.get(
            "/api/auth/google/callback",
            params={"code": "one-use-code", "state": query["state"][0]},
            follow_redirects=False,
        )
        assert response.status_code == 303
        assert response.headers["location"] == "http://127.0.0.1:8000/settings"
        cookie = response.headers["set-cookie"]
        assert "HttpOnly" in cookie and "SameSite=lax" in cookie
        token = client.cookies.get(SESSION_COOKIE)
        assert token and "test-only-secret" not in token
        assert client.get("/api/auth/me").json() == USER.model_dump()
        assert client.get("/api/settings").status_code == 200
        identity.assert_called_once()
        _, verifier, nonce = identity.call_args.args
        assert nonce == query["nonce"][0] and verifier
        assert (
            client.get(
                "/api/auth/google/callback",
                params={"code": "one-use-code", "state": query["state"][0]},
                follow_redirects=False,
            )
            .headers["location"]
            .endswith("error=sign_in_failed")
        )
        assert identity.call_count == 1
        assert (
            client.post("/api/auth/logout", headers={"Origin": "https://evil.test"}).status_code
            == 403
        )
        assert client.get("/api/auth/me").status_code == 200
        assert (
            client.post("/api/auth/logout", headers={"Origin": auth.config.public_url}).status_code
            == 204
        )
        client.cookies.set(SESSION_COOKIE, token)
        assert client.get("/api/auth/me").status_code == 401
        with auth.store.connection() as conn:
            assert conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0] == 0


def test_state_is_bound_to_browser_and_expires(auth_app, monkeypatch):
    identity = Mock(return_value=USER)
    monkeypatch.setattr(auth_app.state.auth.google, "identity", identity)
    with TestClient(auth_app) as browser, TestClient(auth_app) as attacker:
        query = start_login(browser)
        callback = {"code": "code", "state": query["state"][0]}
        assert (
            attacker.get("/api/auth/google/callback", params=callback, follow_redirects=False)
            .headers["location"]
            .endswith("error=sign_in_failed")
        )
        assert not identity.called
        with auth_app.state.auth.store.connection() as conn:
            conn.execute("UPDATE login_attempts SET expires = 0")
        assert (
            browser.get("/api/auth/google/callback", params=callback, follow_redirects=False)
            .headers["location"]
            .endswith("error=sign_in_failed")
        )
        assert not identity.called


@pytest.mark.parametrize("mode", ["denied", "exception", "cancelled"])
def test_callback_failures_never_issue_session(auth_app, monkeypatch, caplog, mode):
    identity = Mock(return_value=USER.model_copy(update={"email": "outsider@example.com"}))
    if mode == "exception":
        identity.side_effect = ValueError("private-token-should-not-be-logged")
    monkeypatch.setattr(auth_app.state.auth.google, "identity", identity)
    with TestClient(auth_app) as client:
        query = start_login(client)
        params = {"state": query["state"][0], "code": "code"}
        if mode == "cancelled":
            params["error"] = "access_denied"
        response = client.get("/api/auth/google/callback", params=params, follow_redirects=False)
        assert "/login?error=" in response.headers["location"]
        assert SESSION_COOKIE not in client.cookies
        assert client.get("/api/settings").status_code == 401
        assert "private-token" not in response.text + caplog.text


def test_session_expiry_restart_policy_and_tampering(auth_config):
    store = SessionStore(auth_config.database)
    token = store.create_session(USER, 600)
    assert SessionStore(auth_config.database).user(token) == USER
    assert store.user(token + "x") is None
    with store.connection() as conn:
        raw = conn.execute("SELECT * FROM sessions").fetchone()
        assert raw["id"] == digest(token) and token not in json.dumps(dict(raw))
    changed = replace(auth_config, allowed_emails=("another@example.com",))
    with TestClient(create_app(TradingAgentsUIConfig(auth=changed))) as client:
        client.cookies.set(SESSION_COOKIE, token)
        assert client.get("/api/auth/me").status_code == 401
    with store.connection() as conn:
        conn.execute("UPDATE sessions SET expires = 0")
    assert store.user(token) is None


def test_https_cookie_and_redirect_allowlist(auth_config, monkeypatch):
    config = replace(auth_config, public_url="https://tradingagents_ui.example.com")
    app = create_app(TradingAgentsUIConfig(auth=config))
    monkeypatch.setattr(app.state.auth.google, "identity", Mock(return_value=USER))
    with TestClient(app, base_url=config.public_url) as client:
        response = client.get("/api/auth/google/login?next=//evil.test", follow_redirects=False)
        assert "Secure" in response.headers["set-cookie"]
        query = parse_qs(urlsplit(response.headers["location"]).query)
        response = client.get(
            "/api/auth/google/callback",
            params={"code": "code", "state": query["state"][0]},
            follow_redirects=False,
        )
        assert response.headers["location"] == config.public_url + "/"
        assert "Secure" in response.headers["set-cookie"]
        assert response.headers["referrer-policy"] == "no-referrer"


def test_allowlist_empty_is_not_public_and_env_normalizes(monkeypatch):
    monkeypatch.setenv("TRADINGAGENTS_UI_GOOGLE_CLIENT_ID", "client")
    monkeypatch.setenv("TRADINGAGENTS_UI_GOOGLE_CLIENT_SECRET", "private-secret")
    monkeypatch.setenv("TRADINGAGENTS_UI_ALLOWED_EMAILS", "")
    assert not AuthConfig.from_env().configured
    monkeypatch.setenv("TRADINGAGENTS_UI_ALLOWED_EMAILS", " User@Example.com , second@example.com ")
    config = AuthConfig.from_env()
    assert config.allowed_emails == ("user@example.com", "second@example.com")
    assert "private-secret" not in repr(config)
    with pytest.raises(ValueError):
        AuthConfig(public_url="http://public.example.com")
    with pytest.raises(ValueError):
        AuthConfig(public_url="https://evil.test/path")
    with pytest.raises(ValueError):
        AuthConfig(allowed_emails=("*@example.com",))


@pytest.fixture
def signed_token(monkeypatch):
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from google.auth import crypt, jwt
    from google.oauth2 import id_token

    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8, serialization.NoEncryption()
    )
    public = (
        key.public_key()
        .public_bytes(serialization.Encoding.PEM, serialization.PublicFormat.SubjectPublicKeyInfo)
        .decode()
    )
    signer = crypt.RSASigner.from_string(pem, key_id="test-key")
    monkeypatch.setattr(id_token, "_fetch_certs", lambda *a, **kw: {"test-key": public})

    def make(**overrides):
        claims = {
            "iss": "https://accounts.google.com",
            "aud": "test-client",
            "sub": "google-subject",
            "email": USER.email,
            "email_verified": True,
            "name": "Researcher",
            "nonce": "expected-nonce",
            "iat": int(time.time()),
            "exp": int(time.time()) + 600,
        }
        return jwt.encode(signer, {**claims, **overrides}).decode()

    return make


@pytest.mark.parametrize(
    "claims",
    [
        {"aud": "attacker-client"},
        {"iss": "https://evil.test"},
        {"exp": 0},
        {"nonce": "replayed-nonce"},
        {"email_verified": False},
        {"azp": "attacker-client"},
        {"iat": int(time.time()) + 3600},
    ],
)
def test_real_token_verification_rejects_invalid_claims(
    auth_config, monkeypatch, signed_token, claims
):
    from authlib.integrations.requests_client import OAuth2Session

    monkeypatch.setattr(
        OAuth2Session, "fetch_token", lambda *a, **kw: {"id_token": signed_token(**claims)}
    )
    with pytest.raises((ValueError, GoogleAuthError)):
        GoogleOAuth(auth_config).identity("code", "verifier", "expected-nonce")


def test_real_token_verification_accepts_valid_signature(auth_config, monkeypatch, signed_token):
    from authlib.integrations.requests_client import OAuth2Session

    monkeypatch.setattr(OAuth2Session, "fetch_token", lambda *a, **kw: {"id_token": signed_token()})
    assert GoogleOAuth(auth_config).identity("code", "verifier", "expected-nonce") == USER


def test_real_token_verification_rejects_tampered_signature(auth_config, monkeypatch, signed_token):
    from authlib.integrations.requests_client import OAuth2Session

    token = signed_token()
    header, payload, signature = token.split(".")
    changed = ("A" if signature[0] != "A" else "B") + signature[1:]
    monkeypatch.setattr(
        OAuth2Session, "fetch_token", lambda *a, **kw: {"id_token": f"{header}.{payload}.{changed}"}
    )
    with pytest.raises((ValueError, GoogleAuthError)):
        GoogleOAuth(auth_config).identity("code", "verifier", "expected-nonce")
