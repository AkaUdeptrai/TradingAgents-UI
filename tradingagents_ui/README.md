# TradingAgents UI

A Google-authenticated, read-only TradingAgents UI that includes the existing runtime.
The Dashboard reports actual API/core import status and versions. Settings shows
public core configuration and the core provider/model/analyst catalog. New Analysis
and History are skeleton pages; there is no analysis execution or simulated data.

## One application

The production product is a single application and a single Docker service named
`tradingagents-ui`. The React UI, its internal FastAPI interface, and the Python
TradingAgents runtime are packaged and started together. You do not deploy or
operate a separate backend service.

During local development, the helper script supervises Vite and Python processes
for hot reload. That development arrangement does not change the production package.

## Internal application structure

```text
Browser (React / TypeScript / Vite)
  → typed API client (types generated from OpenAPI)
  → FastAPI routes + Pydantic response models
  → TradingAgentsAdapter
  → existing TradingAgents config, model catalog and analyst registry
```

`tradingagents/` and `cli/` retain their implementation and behavior. Only
`runtime/services/tradingagents_adapter.py` imports core modules in TradingAgents UI
production code. It imports the real graph class for health checks, without
constructing a graph, creating an LLM client, or calling an external service.

One Docker service contains the Python runtime and compiled frontend. Its internal
API serves workspace data and login routes on the same origin as the UI.

Google sign-in uses a small SQLite repository for one-time login attempts and
revocable sessions (`runtime/auth/store.py`, schema version 1). It is separate
from core cache, memory and checkpoints. No analysis/history database is added.
See [Google sign-in setup](AUTH.md) for configuration, security and storage details.

## Prerequisites

- Local: Python >=3.11, Node.js 22.12+ (supported even-numbered release), npm.
- Docker: Docker Engine and Compose >=2.24 (optional `env_file` support).
- No LLM provider API key is required. Google OAuth credentials and an explicit
  allowed-email list are needed to sign in; without them the login page stays locked.

## Local development

From the repository root:

```sh
cp tradingagents_ui/.env.example tradingagents_ui/.env
./scripts/dev-tradingagents-ui.sh
```

Open <http://127.0.0.1:5173>. Configure Google using [AUTH.md](AUTH.md) to unlock the workspace. The script creates `.venv` if missing, installs
UI Python dependencies and `npm ci`, then starts the application; Ctrl-C stops it.
To choose a Python binary on first run, use `TRADINGAGENTS_UI_PYTHON=python3.11 ./scripts/dev-tradingagents-ui.sh`.
Existing `.venv` environments are reused. The script requires a POSIX shell (or WSL).

After dependencies are installed, start the whole app without reinstalling:

```sh
.venv/bin/python -m tradingagents_ui.scripts.dev
```

The development helper supervises the internal API runtime and Vite together.
The production Docker image serves the built UI and runtime as one app.

## Docker

From the root, with or without env files:

```sh
docker compose up --build
```

Open <http://127.0.0.1:8000>. To detach, add `-d`; to stop, `docker compose down`.
The published port binds to loopback. Google sign-in protects TradingAgents UI data. For a
shared deployment terminate HTTPS at a reverse proxy, forward `/api` on the same
origin, and set `TRADINGAGENTS_UI_PUBLIC_URL` to the exact HTTPS browser origin.

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

A named volume persists sessions across restarts. Its existing `portal_auth` name
is retained so upgrades preserve login sessions; it does not share the CLI data volume.

The CLI service now has the `cli` profile so normal `up` starts TradingAgents UI without
an interactive CLI. Root `.env` remains mandatory for explicit CLI services, as
before. TradingAgents UI loads it optionally. CLI's existing data volume is unchanged;
TradingAgents UI does not mount/read report history in this phase.

To change the **published** Docker port, export it for Compose interpolation:
`TRADINGAGENTS_UI_PORT=8010 docker compose up --build`. The container always listens on
8000. `tradingagents_ui/.env` alone does not control Compose port interpolation.

Use the same browser origin for SSO and keep `TRADINGAGENTS_UI_API_URL=/api`.
`TRADINGAGENTS_UI_API_URL` is a build-time
value, not a runtime setting for an already-built bundle. Cross-site cookie/SSO
deployment is outside the supported setup for this phase.

## Environment

Copy `tradingagents_ui/.env.example` to `tradingagents_ui/.env`; do not commit `.env` files.
Exported variables take precedence. Provider keys and core settings continue
using root `.env`, `.env.enterprise`, or exported variables through the existing
core mechanism. Docker injects root `.env` and `tradingagents_ui/.env`; it does not mount
`.env.enterprise` automatically. No secrets are needed by the frontend.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRADINGAGENTS_UI_HOST` | `127.0.0.1` | Local app bind address; Docker overrides to `0.0.0.0`. |
| `TRADINGAGENTS_UI_PORT` | `8000` | App port; exported value also selects Docker host port. |
| `TRADINGAGENTS_UI_API_URL` | `/api` | Public frontend API base URL including `/api`; compiled by Vite. |
| `TRADINGAGENTS_UI_CORS_ORIGINS` | empty | Comma-separated explicit HTTP(S) origins without trailing slashes. Wildcards rejected. |
| `TRADINGAGENTS_UI_STATIC_DIR` | unset | Optional absolute compiled frontend directory; set by Docker. |
| `TRADINGAGENTS_UI_PYTHON` | `python3` | Bootstrap script's interpreter when creating `.venv`. |
| `TRADINGAGENTS_UI_GOOGLE_CLIENT_ID` / `TRADINGAGENTS_UI_GOOGLE_CLIENT_SECRET` | empty | Server-side Google OAuth credentials. |
| `TRADINGAGENTS_UI_ALLOWED_EMAILS` | empty | Exact, comma-separated approved emails; empty denies everyone. |
| `TRADINGAGENTS_UI_ADMIN_EMAILS` | empty | Exact administrator emails; each must also be allowlisted. |
| `TRADINGAGENTS_UI_PUBLIC_URL` | context default | Exact browser origin; dev script defaults to 5173, Docker to 8000. |
| `TRADINGAGENTS_UI_AUTH_DB` | `~/.tradingagents/portal/auth.sqlite3` | Server-side session SQLite file. |
| `TRADINGAGENTS_UI_SESSION_TTL_SECONDS` | `28800` | Fixed session lifetime, 300–86400 seconds. |

The previous `PORTAL_*` names remain accepted as upgrade aliases; use `TRADINGAGENTS_UI_*`
for new deployments. The browser receives only `TRADINGAGENTS_UI_API_URL` from application configuration.
Never put credentials in browser-exposed variables. Settings uses an explicit
allowlist; paths, endpoint URLs and credentials are not returned. Core metadata
errors return a generic 503 without logging the underlying error text.

## API

| Method/path | Behavior |
| --- | --- |
| `GET /api/health` | App status + real graph import check; 200 healthy, 503 degraded. No provider calls. |
| `GET /api/version` | TradingAgents UI and core versions. |
| `GET /api/capabilities` | Core model catalog grouped by provider/tier, analysts, public configurable setting descriptors, language capability, TradingAgents UI runtime flags. |
| `GET /api/settings` | Read-only public projection of `build_default_config()` including environment overrides. |
| `GET /openapi.json` | Authenticated contract; authenticated documentation at `/docs`. |
| `GET /api/auth/config` | Public provider/setup status; no credentials or allowlist. |
| `GET /api/auth/google/login` | Start Google authorization-code + PKCE flow. |
| `GET /api/auth/google/callback` | Validate callback, Google identity and email permission; issue session. |
| `GET /api/auth/me` | Current signed-in identity, or 401. |
| `POST /api/auth/logout` | Revoke session and clear cookies; requires exact Origin. |

`/api/version`, `/api/settings`, `/api/capabilities`, `/docs` and `/openapi.json`
require a valid session. `/api/health` stays public for Docker health checks. SPA
HTML/assets are public shells; the UI gate prevents private rendering and the
app enforces access on protected requests.

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
tradingagents_ui/
  README.md
  .env.example
  Dockerfile
  runtime/
    __main__.py                # console/module startup
    app.py                     # endpoints and SPA serving
    config.py                  # TradingAgents UI environment
    models.py                  # public Pydantic schemas
    services/tradingagents_adapter.py
    auth/                      # Google OIDC, session store, access checks
    tests/                     # offline API/authentication/security/SPA tests
  web/
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
scripts/dev-tradingagents-ui.sh
.github/workflows/tradingagents-ui.yml
```

## Checks and contract generation

```sh
.venv/bin/pytest -q                         # existing core suite
.venv/bin/pytest -q tradingagents_ui/runtime/tests    # offline application suite
.venv/bin/ruff check .
.venv/bin/ruff format --check tradingagents_ui
.venv/bin/mypy
.venv/bin/tradingagents --help
npm --prefix tradingagents_ui/web run lint
npm --prefix tradingagents_ui/web run format:check
npm --prefix tradingagents_ui/web run test
npm --prefix tradingagents_ui/web run build
.venv/bin/python -m tradingagents_ui.scripts.export_openapi --check
npm --prefix tradingagents_ui/web run api:check
docker compose build tradingagents-ui tradingagents
```

After changing internal API response models:

```sh
.venv/bin/python -m tradingagents_ui.scripts.export_openapi
npm --prefix tradingagents_ui/web run api:generate
```

Commit both `schema/openapi.json` and `web/src/api/schema.d.ts`. CI compares
them with regeneration to catch drift. Generated types contain no manually
maintained provider/model enums. The API client uses these types; runtime payloads
come from Pydantic response validation inside the app. Tests mock API calls only
in test files, including empty responses and unavailable core.

## Next phase

- Define the analysis execution/job lifecycle through the adapter and reuse core execution.
- Decide how to index existing reports and persist TradingAgents UI jobs before adding a database.
- Add admin-only endpoints before introducing administrative writes; this phase exposes no admin write actions.
- Extend config schemas/validation from core; add optional SDK/provider readiness checks separately from health.
- Reuse existing token-usage callbacks and reporting when execution is introduced.

No automatic trading, exchange integration, prompt customization, cron, messaging,
portfolio redesign or token optimization is included here.
