# TradingAgents UI

A Google-authenticated TradingAgents UI that includes the existing runtime.
The Dashboard reports API/core status. Settings shows public core configuration.
New Analysis starts a background job using the existing core graph; History lists
the signed-in user's UI jobs and their saved result summaries.

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
`backend/services/tradingagents_adapter.py` imports core modules in TradingAgents UI
production code. The health check imports the real graph class without constructing
it or making provider calls. A graph and its LLM clients are constructed only when
an authenticated analysis job is explicitly started.

One Docker service contains the Python runtime and compiled frontend. Its internal
API serves workspace data and login routes on the same origin as the UI.

Google sign-in uses a small SQLite repository for one-time login attempts and
revocable sessions (`backend/auth/store.py`, schema version 1). Analysis jobs use
a separate SQLite database beside the auth database; the core retains ownership
of its cache, memory, checkpoints and report files.
See [Google sign-in setup](AUTH.md) for configuration, security and storage details.

## Prerequisites

- Local: Python >=3.11, Node.js 22.12+ (supported even-numbered release), npm.
- Docker: Docker Engine and Compose >=2.24 (optional `env_file` support).
- No LLM provider API key is required. Google OAuth credentials and an explicit
  allowed-email list are needed to sign in; without them the login page stays locked.

## Local development

All configuration lives in **one** file: the repository-root `.env` (copy it from
`.env.example`). It holds both LLM provider keys and the `TRADINGAGENTS_UI_*` values.

First run (creates `.venv`, creates `.env` if missing, installs Python and npm
dependencies, then starts the app):

```sh
# macOS / Linux / WSL
./scripts/setup.sh
```

```powershell
# Windows PowerShell
.\scripts\setup.ps1
```

Open <http://127.0.0.1:5173>. Configure Google using [AUTH.md](AUTH.md) to unlock the
workspace. Ctrl-C stops both processes. To choose the interpreter that creates `.venv`,
set `TRADINGAGENTS_UI_PYTHON` (for example `python3.11`).

After dependencies are installed, start the app without reinstalling:

```sh
.venv/bin/python -m backend.dev        # macOS / Linux
.venv\Scripts\python -m backend.dev    # Windows
```

The dev helper runs the FastAPI backend (port 8000) and Vite (port 5173, proxies `/api`)
together. The production Docker image serves the built UI and backend as one app.

The frontend uses [Lucide React](https://github.com/lucide-icons/lucide) for
icons and [TanStack Query](https://github.com/TanStack/query) for polling background
job state. Progress is based on the core graph stream; no percentage is shown.

## Codex project roles

Project-specific Codex instructions live under `.codex/`. The roles in
`.codex/agents/` cover UI/UX, runtime/API work, and security review. They follow
the repository guidance in `AGENTS.md`; availability depends on the Codex client
supporting project-scoped custom agents.

## Docker

From the repository root:

```sh
cp -n .env.example .env   # once; fill in Google and provider values
docker compose up --build
```

Open <http://127.0.0.1:8000>. To detach, add `-d`; to stop, `docker compose down`.
The published port binds to loopback. For a shared deployment terminate HTTPS at a
reverse proxy, forward `/api` on the same origin, and set `TRADINGAGENTS_UI_PUBLIC_URL`
to the exact HTTPS browser origin.

The upstream CLI image is unchanged and lives behind the `cli` profile:

```sh
docker compose run --rm tradingagents --help
docker compose --profile ollama up ollama
docker compose --profile ollama run --rm tradingagents-ollama
```

UI data (sessions, job history, schedules, settings overrides) persists in the
`ui_data` volume, mounted at `~/.tradingagents/ui`. It does not share the CLI data volume.

To change the **published** port, export it for Compose interpolation:
`TRADINGAGENTS_UI_PORT=8010 docker compose up --build`. The container always listens on 8000.
`TRADINGAGENTS_UI_API_URL` is compiled into the bundle at build time; keep it `/api`
for same-origin deployments.

## Environment

Use the repository-root `.env` (template: `.env.example`); never commit it. Exported
variables take precedence. The browser receives only `TRADINGAGENTS_UI_API_URL`.

| Variable | Default | Purpose |
| --- | --- | --- |
| `TRADINGAGENTS_UI_HOST` | `127.0.0.1` | Local bind address; Docker overrides to `0.0.0.0`. |
| `TRADINGAGENTS_UI_PORT` | `8000` | Backend port; exported value also selects the Docker host port. |
| `TRADINGAGENTS_UI_API_URL` | `/api` | Public frontend API base URL; compiled by Vite. |
| `TRADINGAGENTS_UI_CORS_ORIGINS` | empty | Comma-separated explicit HTTP(S) origins. Wildcards rejected. |
| `TRADINGAGENTS_UI_STATIC_DIR` | unset | Built frontend directory to serve; set by Docker. |
| `TRADINGAGENTS_UI_PYTHON` | `python3` / `python` | Interpreter the setup scripts use to create `.venv`. |
| `TRADINGAGENTS_UI_GOOGLE_CLIENT_ID` / `_SECRET` | empty | Server-side Google OAuth credentials. |
| `TRADINGAGENTS_UI_ALLOWED_EMAILS` | empty | Exact, comma-separated approved emails; empty denies everyone. |
| `TRADINGAGENTS_UI_ADMIN_EMAILS` | empty | Administrators (may edit Settings); each must also be allowlisted. |
| `TRADINGAGENTS_UI_PUBLIC_URL` | context default | Exact browser origin; dev defaults to 5173, Docker to 8000. |
| `TRADINGAGENTS_UI_AUTH_DB` | `~/.tradingagents/ui/auth.sqlite3` | Session database; other UI databases live beside it. |
| `TRADINGAGENTS_UI_SESSION_TTL_SECONDS` | `28800` | Fixed session lifetime, 300–86400 seconds. |

The old `PORTAL_*` names, `tradingagents_ui/.env` and `portal/.env` are no longer read.
Settings returns only an explicit allowlist of non-secret core values; paths,
endpoint URLs and credentials are never returned.

## API

| Method/path | Behavior |
| --- | --- |
| `GET /api/health` | App status + real graph import check; 200 healthy, 503 degraded. No provider calls. |
| `GET /api/version` | TradingAgents UI and core versions. |
| `GET /api/capabilities` | Core model catalog grouped by provider/tier, analysts, public configurable setting descriptors, language capability, TradingAgents UI runtime flags. |
| `GET /api/settings` | Safe public projection of TradingAgents configuration, including persisted admin overrides. |
| `PUT /api/settings` | Admin-only update of allowlisted, non-secret settings; applied to new analysis jobs. |
| `POST /api/analysis` | Authenticated request to queue an analysis with ticker, date, asset type and analyst selection. |
| `GET /api/analysis` | List the current user's latest 100 analysis jobs. |
| `GET /api/analysis/{id}` | Read the current user's job status and completed report sections. |
| `GET/POST /api/scans` | List or create the signed-in user's recurring ticker scans. |
| `PATCH/DELETE /api/scans/{id}` | Pause/resume or delete an owned scan schedule. |
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

Runtime flags declare analysis execution, UI job history and settings writes available.
Settings overrides persist separately in `settings.sqlite3`; only allowlisted,
non-secret core settings are editable. Google OAuth credentials, provider secrets,
endpoint URLs and filesystem paths stay in server environment configuration.
UI job records persist across restarts, while a job
interrupted by a server restart is marked failed. Runs are serialized within one
process because core data tools use process-wide configuration context. API
responses are not cached. Unknown API/asset paths return 404,
not SPA HTML.

For web analysis jobs, each provider request has a 120-second timeout and one
SDK-level retry by default. A job is retried once after a timeout, connection
failure, rate limit, or provider 5xx response; permanent 4xx/configuration errors
fail immediately. The progress view shows the current attempt. These web-only
defaults do not change CLI behavior.

Quét chủ động lets each signed-in user save ticker lists (up to 20 symbols) for
daily or weekly analysis. Schedules are stored in `scan_plans.sqlite3`; the
application checks due schedules while running and creates ordinary analysis
jobs, visible in History. The first run happens after the selected interval.
Scheduled runs use the current core trade date and configured analysts. They
pause while the application is stopped and resume after it starts.

## Structure

```text
backend/                     # FastAPI app (python -m backend)
  __main__.py                # console/module startup
  app.py                     # endpoints and SPA serving
  config.py                  # TRADINGAGENTS_UI_* environment
  models.py                  # public Pydantic schemas (source of the OpenAPI contract)
  openapi.json               # committed API contract
  auth/                      # Google OIDC, session store, access checks
  services/
    tradingagents_adapter.py # the only module that imports the core
    analysis_jobs.py         # background analysis jobs
    scan_plans.py            # recurring scans
    settings_store.py        # admin setting overrides
  dev.py                     # run backend + Vite together
  export_openapi.py          # regenerate/check openapi.json
  tests/                     # offline API/auth/security tests
frontend/                    # React + TypeScript + Vite
  src/
    api/                     # client, generated schema.d.ts, loading hook
    components/              # AuthGate, States, JobBadges, MarkdownReport
    lib/                     # pure helpers (labels)
    pages/                   # Dashboard, Analysis (+History), Scans, Settings
    App.tsx, main.tsx, tokens.css, base.css, styles.css
scripts/setup.sh, setup.ps1  # first-run bootstrap
docs/UI.md, docs/AUTH.md
Dockerfile.ui
```

## Checks and contract generation

```sh
.venv/bin/pytest -q                         # existing core suite
.venv/bin/pytest -q backend/tests    # offline application suite
.venv/bin/ruff check .
.venv/bin/ruff format --check backend
.venv/bin/mypy
.venv/bin/tradingagents --help
npm --prefix frontend run lint
npm --prefix frontend run format:check
npm --prefix frontend run test
npm --prefix frontend run build
.venv/bin/python -m backend.export_openapi --check
npm --prefix frontend run api:check
docker compose build tradingagents-ui tradingagents
```

After changing internal API response models:

```sh
.venv/bin/python -m backend.export_openapi
npm --prefix frontend run api:generate
```

Commit both `backend/openapi.json` and `frontend/src/api/schema.d.ts`. CI compares
them with regeneration to catch drift. Generated types contain no manually
maintained provider/model enums. The API client uses these types; runtime payloads
come from Pydantic response validation inside the app. Tests mock API calls only
in test files, including empty responses and unavailable core.

## Current limits

- The web form uses provider, model and vendor settings from environment and core defaults; it does not accept credentials or per-run provider overrides.
- History contains analyses started in the UI; it does not import older CLI reports.
- Progress reports queued/running/completed/failed states and streams analyst/team milestones with partial report sections. Job cancellation is not exposed yet.
- Job metadata and results are stored in `analysis.sqlite3`; full reports remain in the core results directory.
- Optional SDK readiness checks and token-usage summaries remain future work.

No automatic trading, exchange integration, prompt customization, external cron, messaging,
portfolio redesign or token optimization is included here.
