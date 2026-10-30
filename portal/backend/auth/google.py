"""Google authorization-code flow with PKCE and verified OIDC identity."""

import secrets
from functools import partial
from typing import Any

from authlib.integrations.requests_client import OAuth2Session
from google.auth.transport.requests import Request as GoogleRequest
from google.oauth2.id_token import verify_oauth2_token

from portal.backend.auth.config import AuthConfig
from portal.backend.models import UserIdentity

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"


class GoogleOAuth:
    def __init__(self, config: AuthConfig) -> None:
        self.config = config

    def client(self) -> Any:
        return OAuth2Session(
            self.config.google_client_id,
            self.config.google_client_secret,
            scope="openid email profile",
            redirect_uri=self.config.callback_url,
            code_challenge_method="S256",
            token_endpoint_auth_method="client_secret_post",
        )

    def authorization_url(self, state: str, nonce: str, verifier: str) -> str:
        with self.client() as client:
            url, _ = client.create_authorization_url(
                AUTHORIZE_URL,
                state=state,
                nonce=nonce,
                code_verifier=verifier,
                prompt="select_account",
            )
        return str(url)

    def identity(self, code: str, verifier: str, nonce: str) -> UserIdentity:
        with self.client() as client:
            token = client.fetch_token(TOKEN_URL, code=code, code_verifier=verifier, timeout=10)
        # google-auth validates signature, issuer, audience, issued-at and expiry.
        claims = verify_oauth2_token(  # type: ignore[no-untyped-call]
            token["id_token"],
            partial(GoogleRequest(), timeout=10),
            audience=self.config.google_client_id,
        )
        if not isinstance(claims.get("nonce"), str) or not secrets.compare_digest(
            claims["nonce"], nonce
        ):
            raise ValueError("Invalid nonce")
        if claims.get("email_verified") is not True:
            raise ValueError("Email must be verified")
        if claims.get("azp", self.config.google_client_id) != self.config.google_client_id:
            raise ValueError("Invalid authorized party")
        if not isinstance(claims.get("sub"), str) or not claims["sub"]:
            raise ValueError("Missing subject")
        email = claims.get("email")
        if not isinstance(email, str) or "@" not in email:
            raise ValueError("Missing email")
        return UserIdentity(
            subject=claims["sub"], email=email.casefold(), name=claims.get("name") or email
        )
