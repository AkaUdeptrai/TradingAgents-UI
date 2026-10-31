# TradingAgents Portal

A Google-authenticated, read-only web interface over the existing TradingAgents runtime.
The Dashboard reports actual API/core import status and versions. Settings shows
public core configuration and the core provider/model/analyst catalog. New Analysis
and History are skeleton pages; there is no analysis execution or simulated data.

## Architecture

```text
Browser (React / TypeScript / Vite)
  → typed API client (types generated from OpenAPI)
  → FastAPI routes + Pydantic response models
  → TradingAgentsAdapter
  → existing TradingAgents config, model catalog and analyst registry
```

`tradingagents/` and `cli/` retain their implementation and behavior. Only
`backend/services/tradingagents_adapter.py` imports core modules in Portal
production code. It imports the real graph class for health checks, without
constructing a graph, creating an LLM client, or calling an external service.

One Docker service contains the Python runtime and compiled frontend; FastAPI
serves the workspace and login routes and static assets on the same origin as `/api`.
Local development uses Vite with an API proxy and a separate Python process.

Google sign-in uses a small SQLite repository for one-time login attempts and
revocable sessions (`backend/auth/store.py`, schema version 1). It is separate
from core cache, memory and checkpoints. No analysis/history database is added.
See [Google sign-in setup](AUTH.md) for configuration, security and storage details.

See [AUDIT.md](AUDIT.md) for repository evidence, decisions and boundaries.

## Prerequisites

- Local: Python >=3.11, Node.js 22.12+ (supported even-numbered release), npm.
- Docker: Docker Engine and Compose >=2.24 (optional `env_file` support).
- No LLM provider API key is required. Google OAuth credentials and an explicit
  allowed-email list are needed to sign in; without them the login page stays locked.

## Local development

From the repository root:

```sh
cp portal/.env.example portal/.env
./scripts/dev-portal.sh
```

Open <http://127.0.0.1:5173>. Configure Google using [AUTH.md](AUTH.md) to unlock the workspace. The script creates `.venv` if missing, installs
Python extras and `npm ci`, then starts both servers; Ctrl-C stops both. To choose
a Python binary on first run, use `PORTAL_PYTHON=python3.11 ./scripts/dev-portal.sh`.
Existing `.venv` environments are reused. The script requires a POSIX shell (or WSL).

After dependencies are installed, start both without reinstalling:

```sh
.venv/bin/python -m portal.scripts.dev
```

Or run each process in a separate terminal:

```sh
# Repository root
PORTAL_PUBLIC_URL=http://127.0.0.1:5173 .venv/bin/python -m portal.backend
# Second terminal
npm --prefix portal/frontend run dev
```

Vite proxies `/api` to `127.0.0.1:${PORTAL_PORT}`. Restart the Python server after
backend edits; Vite reloads frontend edits automatically. Keep `PORTAL_HOST` on
loopback or `0.0.0.0` when using this proxy. For Python-only serving, build the
frontend, set `PORTAL_STATIC_DIR` to its absolute `dist` path, then start the backend.

## Docker

From the root, with or without env files:

```sh
docker compose up --build
```

Open <http://127.0.0.1:8000>. To detach, add `-d`; to stop, `docker compose down`.
The published port binds to loopback. Google sign-in protects Portal data. For a
shared deployment terminate HTTPS at a reverse proxy, forward `/api` on the same
origin, and set `PORTAL_PUBLIC_URL` to the exact HTTPS browser origin.

The old CLI image/entry point is unchanged. Explicit service commands still work:

```sh
# If not already present, create the existing CLI env file (do not overwrite it):
cp -n .env.example .env
docker compose run --rm tradingagents --help
docker compose run --rm tradingagents
# CLI-only service startup:
docker compose --profile cli up tradingagents
# Existing Ollama services remain available:
docker compose --profile ollama up ollama
docker compose --profile ollama run --rm tradingagents-ollama
```

A dedicated `portal_auth` named volume persists sessions across restarts; it does
not share the CLI data volume.

The CLI service now has the `cli` profile so normal `up` starts Portal without
an interactive CLI. Root `.env` remains mandatory for explicit CLI services, as
before. Portal loads it optionally. CLI's existing data volume is unchanged;
Portal does not mount/read report history in this phase.

To change the **published** Docker port, export it for Compose interpolation:
`PORTAL_PORT=8010 docker compose up --build`. The container always listens on
8000. `portal/.env` alone does not control Compose port interpolation.

Use the same browser origin for SSO: keep `PORTAL_API_URL=/api` and proxy `/api`
to the backend if serving frontend separately. `PORTAL_API_URL` is a build-time
value, not a runtime setting for an already-built bundle. Cross-site cookie/SSO
deployment is outside the supported setup for this phase.

## Environment

Copy `portal/.env.example` to `portal/.env`; do not commit `.env` files.
Exported variables take precedence. Provider keys and core settings continue
using root `.env`, `.env.enterprise`, or exported variables through the existing
core mechanism. Docker injects root `.env` and `portal/.env`; it does not mount
`.env.enterprise` automatically. No secrets are needed by the frontend.

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORTAL_HOST` | `127.0.0.1` | Local API bind address; Docker overrides to `0.0.0.0`. |
| `PORTAL_PORT` | `8000` | Local API port; exported value also selects Docker host port. |
| `PORTAL_API_URL` | `/api` | Public frontend API base URL including `/api`; compiled by Vite. |
| `PORTAL_CORS_ORIGINS` | empty | Comma-separated explicit HTTP(S) origins without trailing slashes. Wildcards rejected. |
| `PORTAL_STATIC_DIR` | unset | Optional absolute compiled frontend directory; set by Docker. |
| `PORTAL_PYTHON` | `python3` | Bootstrap script's interpreter when creating `.venv`. |
| `PORTAL_GOOGLE_CLIENT_ID` / `PORTAL_GOOGLE_CLIENT_SECRET` | empty | Server-side Google OAuth credentials. |
| `PORTAL_ALLOWED_EMAILS` | empty | Exact, comma-separated approved emails; empty denies everyone. |
| `PORTAL_ADMIN_EMAILS` | empty | Exact administrator emails; each must also be allowlisted. |
| `PORTAL_PUBLIC_URL` | context default | Exact browser origin; dev script defaults to 5173, backend/Docker to 8000. |
| `PORTAL_AUTH_DB` | `~/.tradingagents/portal/auth.sqlite3` | Server-side session SQLite file. |
| `PORTAL_SESSION_TTL_SECONDS` | `28800` | Fixed session lifetime, 300–86400 seconds. |

The browser receives only `PORTAL_API_URL` from Portal environment configuration.
Never put credentials in browser-exposed variables. Settings uses an explicit
allowlist; paths, endpoint URLs and credentials are not returned. Core metadata
errors return a generic 503 without logging the underlying error text.

## API

| Method/path | Behavior |
| --- | --- |
| `GET /api/health` | Backend status + real graph import check; 200 healthy, 503 degraded. No provider calls. |
| `GET /api/version` | Portal and core versions. |
| `GET /api/capabilities` | Core model catalog grouped by provider/tier, analysts, public configurable setting descriptors, language capability, Portal runtime flags. |
| `GET /api/settings` | Read-only public projection of `build_default_config()` including environment overrides. |
| `GET /openapi.json` | Authenticated contract; authenticated documentation at `/docs`. |
| `GET /api/auth/config` | Public provider/setup status; no credentials or allowlist. |
| `GET /api/auth/google/login` | Start Google authorization-code + PKCE flow. |
| `GET /api/auth/google/callback` | Validate callback, Google identity and email permission; issue session. |
| `GET /api/auth/me` | Current signed-in identity, or 401. |
| `POST /api/auth/logout` | Revoke session and clear cookies; requires exact Origin. |

`/api/version`, `/api/settings`, `/api/capabilities`, `/docs` and `/openapi.json`
require a valid session. `/api/health` stays public for Docker health checks. SPA
HTML/assets are public shells; the frontend gate prevents private rendering and
the backend independently enforces access.

Health means the installed core can import, **not** that credentials, providers
or external data sources have been validated. The model catalog lists supported
choices, not proof that optional SDKs (e.g. Bedrock) or credentials are installed.
Live provider model discovery is not performed. The `custom` picker sentinel is
represented by `allows_custom_model`, not a real model ID.

The adapter combines `MODEL_OPTIONS` with the existing CLI provider table because
Azure (deployment names) and OpenRouter (live discovery) are absent from the static
catalog. They expose empty model maps and custom IDs. This private CLI-table
dependency is isolated to the adapter until core offers a public provider schema.

Core output language accepts free text. The current configured language is a
suggestion, not an exhaustive supported-language enum. The adapter does not copy
the CLI prompt's local suggestion list. Settings represent defaults + environment,
not CLI remembered preferences or per-analysis command-line selections. The
initial public setting allowlist is intentionally a subset of all core config.

Runtime flags explicitly declare analysis execution, history and settings writes
unavailable. API responses are not cached. Unknown API/asset paths return 404,
not SPA HTML.

## Structure

```text
portal/
  AUDIT.md
  README.md
  .env.example
  Dockerfile
  backend/
    __main__.py                # console/module startup
    app.py                     # endpoints and SPA serving
    config.py                  # Portal environment
    models.py                  # public Pydantic schemas
    services/tradingagents_adapter.py
    auth/                      # Google OIDC, session store, access checks
    tests/                     # offline API/authentication/security/SPA tests
  frontend/
    package.json, package-lock.json
    vite.config.ts, tsconfig.json, eslint.config.js
    scripts/check-api.mjs
    src/
      api/                     # client, generated types, loading hook
      components/{States,AuthGate}.tsx
      pages/{Dashboard,Settings}.tsx
      App.tsx, main.tsx, styles.css
      App.test.tsx, test-setup.ts
  schema/openapi.json
  scripts/{dev,export_openapi}.py
scripts/dev-portal.sh
.github/workflows/portal.yml
```

## Checks and contract generation

```sh
.venv/bin/pytest -q                         # existing core suite
.venv/bin/pytest -q portal/backend/tests    # offline Portal suite
.venv/bin/ruff check .
.venv/bin/ruff format --check portal
.venv/bin/mypy
.venv/bin/tradingagents --help
npm --prefix portal/frontend run lint
npm --prefix portal/frontend run format:check
npm --prefix portal/frontend run test
npm --prefix portal/frontend run build
.venv/bin/python -m portal.scripts.export_openapi --check
npm --prefix portal/frontend run api:check
docker compose build portal tradingagents
```

After changing backend response models:

```sh
.venv/bin/python -m portal.scripts.export_openapi
npm --prefix portal/frontend run api:generate
```

Commit both `schema/openapi.json` and `frontend/src/api/schema.d.ts`. CI compares
them with regeneration to catch drift. Generated types contain no manually
maintained provider/model enums. The API client uses these types; runtime payloads
come from the backend's Pydantic response validation. Tests mock APIs only in test
files, including empty responses, disconnected backend and unavailable core.

## Next phase

- Define the analysis execution/job lifecycle through the adapter and reuse core execution.
- Decide how to index existing reports and persist Portal jobs before adding a database.
- Add admin-only endpoints before introducing administrative writes; this phase exposes no admin write actions.
- Extend config schemas/validation from core; add optional SDK/provider readiness checks separately from health.
- Reuse existing token-usage callbacks and reporting when execution is introduced.

No automatic trading, exchange integration, prompt customization, cron, messaging,
portfolio redesign or token optimization is included here.
