# Google sign-in

Portal uses Google OpenID Connect with an exact email allowlist. There is no
password login, public sign-up or authentication bypass. The initial allowlist
is deliberately empty, as requested: nobody can sign in until it is configured.

## Configure Google

1. In your Google Cloud project, configure the Google Auth Platform consent screen
   and create an OAuth client of type **Web application**. Only `openid`, `email`
   and `profile` are requested. No Gmail, Drive or other Google API access is requested.
2. Register the exact **Authorized redirect URI** for each environment:
   - Docker/default backend: `http://127.0.0.1:8000/api/auth/google/callback`
   - Local dev script: `http://127.0.0.1:5173/api/auth/google/callback`
   - Hosted: `https://your-portal.example/api/auth/google/callback`
3. If the Google app is in external Testing mode, also add the intended accounts
   as Google test users. Google consent configuration and Portal's allowlist are
   separate controls; both must allow the account.
4. Set these values in the ignored `portal/.env` file or your secret manager:

```dotenv
PORTAL_GOOGLE_CLIENT_ID=your-web-client-id.apps.googleusercontent.com
PORTAL_GOOGLE_CLIENT_SECRET=
PORTAL_ALLOWED_EMAILS=
PORTAL_ADMIN_EMAILS=
PORTAL_PUBLIC_URL=
```

Fill the secret locally, and set `PORTAL_ALLOWED_EMAILS` to exact addresses such
as `person@example.com,another@example.com` when you are ready. The example keeps
it empty intentionally. Matching trims surrounding whitespace and ignores case;
it does not equate Gmail aliases, strip dots or allow wildcard domains.

`PORTAL_ADMIN_EMAILS` assigns administrator roles to exact approved addresses.
Every administrator address must also be in `PORTAL_ALLOWED_EMAILS`; an invalid
configuration prevents startup. The role is recalculated for each authenticated
request, so changes apply to existing sessions after reload.

`PORTAL_PUBLIC_URL` is the browser origin, not the backend container address.
When empty, `dev-portal.sh` uses `http://127.0.0.1:5173`; backend/Docker uses
`http://127.0.0.1:8000`. Keep the hostname consistent: `localhost` and `127.0.0.1`
are different origins/cookie hosts. With a custom Docker host port, set both
Compose's exported `PORTAL_PORT` and `PORTAL_PUBLIC_URL` in `portal/.env`.

Restart the backend/container after configuration changes. Then open Portal and
choose **Sign in with Google**. A successful sign-in returns to the protected
page you requested. Sign out revokes the Portal session; it does not sign you out
of Google or other applications.

The server flow and Google token claims follow the [Google OIDC documentation](https://developers.google.com/identity/openid-connect/openid-connect).
PKCE is handled by [Authlib's OAuth client](https://docs.authlib.org/en/stable/oauth2/client/http/index.html).

## Deployment and sessions

- Serve the browser and `/api` on the same origin. Keep `PORTAL_API_URL=/api`.
  Vite proxies this automatically; Docker bundles both in one service. A production
  reverse proxy should forward `/api` to the backend and terminate HTTPS.
- HTTPS is required outside loopback. Cookies are host-only, HttpOnly, SameSite=Lax
  and Secure when the public URL is HTTPS. Do not expose a plaintext alternate origin.
- Google verifies the account; `google-auth` verifies ID-token signature, issuer,
  audience and timestamps. Portal also checks nonce, authorized party and verified
  email, then enforces the exact allowlist. The stable Google subject identifies
  the account; the email is the access-policy field.
- One-time state is bound to a browser cookie, expires after ten minutes and is
  consumed atomically. PKCE uses S256. Return destinations are restricted to the
  four existing Portal routes; external redirects are rejected.
- Session cookies contain only a random opaque identifier. SQLite stores its hash,
  minimal identity (subject, email, name) and expiry. Google tokens, client secrets
  and passwords are not persisted. Default session lifetime is eight hours, with
  no sliding refresh. Reauthentication rotates the session; logout deletes it.
- Every protected request checks the current server allowlist. After updating the
  environment, restart all backend workers to apply it. Empty configuration fails
  closed. There is no API for editing the allowlist in this phase.
- `PORTAL_AUTH_DB` defaults to `~/.tradingagents/portal/auth.sqlite3`. The file is
  created with owner-only permissions. Schema v1 is initialized automatically;
  unsupported schema versions are refused. The SQL is isolated in `SessionStore`
  for a later database migration. Use local storage, not a network filesystem;
  workers on one host may share the file. Multi-host SSO requires a shared DB design.
- Docker persists auth state in `portal_auth`, separate from all core storage.
  Removing the auth database/volume invalidates every session. Treat the file and
  its backups as private identity data. Expired attempts/sessions are removed on
  subsequent login attempts; logout immediately removes the current session.
- Mutation endpoints must enforce CSRF protection. Current logout requires the
  exact configured `Origin`. Read-only settings remain read-only.
- Uvicorn access logs are disabled by the Portal entry point so callback URLs do
  not log authorization codes. Configure proxies/APM to omit callback query
  strings and redact cookies/authorization headers too. Do not enable HTTP debug logs.

## Verification and limits

Offline tests exercise the full Portal login/callback/session/logout sequence,
using fake provider exchanges only in tests. Separate tests pass locally signed
JWTs through the real Google verifier to cover signature/issuer/audience/expiry,
nonce, verified email and authorized-party rejection. Tests also cover browser
binding, replay, session revocation, allowlist changes and HTTPS cookie flags.

A live Google consent round trip cannot be verified until you supply an OAuth
client and approved email addresses. No Google project, client or permission is
created automatically. This implementation is Google-specific; it does not claim
to support SAML, Microsoft Entra ID, or arbitrary enterprise identity providers.
