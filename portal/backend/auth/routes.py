import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, Security
from fastapi.responses import RedirectResponse
from fastapi.security import APIKeyCookie

from portal.backend.auth.config import AuthConfig
from portal.backend.auth.google import GoogleOAuth
from portal.backend.auth.store import SessionStore
from portal.backend.models import AuthStatus, ErrorResponse, UserIdentity

SESSION_COOKIE = "portal_session"
FLOW_COOKIE = "portal_login"
_cookie = APIKeyCookie(name=SESSION_COOKIE, auto_error=False)
logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, config: AuthConfig) -> None:
        self.config = config
        self.store = SessionStore(config.database)
        self.google = GoogleOAuth(config)

    def require_user(self, token: Annotated[str | None, Security(_cookie)]) -> UserIdentity:
        user = self.store.user(token) if token and self.config.configured else None
        if user is None or user.email not in self.config.allowed_emails:
            raise HTTPException(status_code=401, detail="Sign in to access the Portal.")
        role = "admin" if user.email in self.config.admin_emails else "user"
        return user.model_copy(update={"role": role})

    def require_admin(self, token: Annotated[str | None, Security(_cookie)]) -> UserIdentity:
        user = self.require_user(token)
        if user.role != "admin":
            raise HTTPException(status_code=403, detail="Administrator access is required.")
        return user

    def set_cookie(self, response: Response, name: str, value: str, ttl: int) -> None:
        response.set_cookie(
            name,
            value,
            max_age=ttl,
            httponly=True,
            secure=self.config.secure_cookie,
            samesite="lax",
            path="/",
        )

    def delete_cookie(self, response: Response, name: str) -> None:
        response.delete_cookie(
            name, httponly=True, secure=self.config.secure_cookie, samesite="lax", path="/"
        )

    def router(self) -> APIRouter:
        router = APIRouter(prefix="/api/auth", tags=["authentication"])

        @router.get("/config", response_model=AuthStatus)
        def status() -> AuthStatus:
            return AuthStatus(configured=self.config.configured)

        @router.get("/me", response_model=UserIdentity, responses={401: {"model": ErrorResponse}})
        def me(user: Annotated[UserIdentity, Depends(self.require_user)]) -> UserIdentity:
            return user

        @router.get(
            "/google/login",
            responses={503: {"model": ErrorResponse}},
            response_class=RedirectResponse,
        )
        def login(request: Request) -> RedirectResponse:
            if not self.config.configured:
                raise HTTPException(status_code=503, detail="Google sign-in is not configured.")
            state, nonce, verifier = (secrets.token_urlsafe(32) for _ in range(3))
            binding = request.cookies.get(FLOW_COOKIE) or secrets.token_urlsafe(32)
            next_path = request.query_params.get("next", "/")
            if next_path not in {"/", "/settings", "/history", "/analysis/new"}:
                next_path = "/"
            self.store.create_attempt(state, binding, nonce, verifier, next_path)
            response = RedirectResponse(
                self.google.authorization_url(state, nonce, verifier), status_code=302
            )
            self.set_cookie(response, FLOW_COOKIE, binding, 600)
            return response

        @router.get("/google/callback", response_class=RedirectResponse)
        def callback(request: Request) -> RedirectResponse:
            error = "sign_in_failed"
            binding = request.cookies.get(FLOW_COOKIE, "")
            state = request.query_params.get("state", "")
            attempt = (
                self.store.consume_attempt(state, binding)
                if state and binding and self.config.configured
                else None
            )
            if not attempt:
                logger.warning(
                    "OAuth callback has no matching login attempt "
                    "(state_present=%s flow_cookie_present=%s configured=%s)",
                    bool(state),
                    bool(binding),
                    self.config.configured,
                )
            response = RedirectResponse(
                self.config.public_url + "/login?error=" + error, status_code=303
            )
            provider_error = request.query_params.get("error")
            code_present = bool(request.query_params.get("code"))
            if attempt and (provider_error or not code_present):
                logger.warning(
                    "OAuth provider returned no usable authorization code "
                    "(provider_error_present=%s code_present=%s)",
                    bool(provider_error),
                    code_present,
                )
            try:
                if attempt and code_present and not provider_error:
                    user = self.google.identity(
                        request.query_params["code"], attempt.verifier, attempt.nonce
                    )
                    if user.email in self.config.allowed_emails:
                        # Rotate the old session on every successful authentication.
                        old_token = request.cookies.get(SESSION_COOKIE)
                        if old_token:
                            self.store.revoke(old_token)
                        token = self.store.create_session(user, self.config.session_ttl)
                        response = RedirectResponse(
                            self.config.public_url + attempt.next_path, status_code=303
                        )
                        self.set_cookie(response, SESSION_COOKIE, token, self.config.session_ttl)
                    else:
                        response = RedirectResponse(
                            self.config.public_url + "/login?error=access_denied", status_code=303
                        )
            except Exception as exc:
                # Exception text can contain OAuth codes/tokens; log only its class.
                logger.warning("OAuth identity verification failed (%s)", type(exc).__name__)
                pass
            self.delete_cookie(response, FLOW_COOKIE)
            return response

        @router.post("/logout", status_code=204, responses={403: {"model": ErrorResponse}})
        def logout(request: Request) -> Response:
            # Require same-origin intent on this state-changing cookie-authenticated route.
            if request.headers.get("origin") != self.config.public_url:
                raise HTTPException(status_code=403, detail="Invalid request origin.")
            token = request.cookies.get(SESSION_COOKIE)
            if token:
                self.store.revoke(token)
            response = Response(status_code=204)
            self.delete_cookie(response, SESSION_COOKIE)
            self.delete_cookie(response, FLOW_COOKIE)
            return response

        return router
