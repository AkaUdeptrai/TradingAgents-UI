# Repository audit — TradingAgents UI initialization

Recorded before implementation, 2026-10-30. Working tree was clean.

| Area | Evidence and finding |
| --- | --- |
| Runtime/package management | `pyproject.toml`: Python >=3.11, setuptools, pip; `requirements.txt` installs `.`. No Python lockfile. |
| Core entry point | `tradingagents/graph/trading_graph.py`: `TradingAgentsGraph`, `propagate`, `stream`, `save_reports`; `main.py` is a runnable example that starts analysis. |
| CLI | Console script `tradingagents = cli.main:app`, Typer; `cli/run.py` handles execution. |
| Configuration | `tradingagents/default_config.py`: `build_default_config()` and `DEFAULT_CONFIG`, environment coercion in `_ENV_OVERRIDES`. |
| Environment | Package import loads `.env` and `.env.enterprise` without overriding exported variables. Root `.env.example` documents provider keys, data providers, model tiers, output language, paths, retry/token/thinking settings. Do not copy secrets into TradingAgents UI config. |
| Providers/models | `llm_clients/model_catalog.py` owns `MODEL_OPTIONS`, including regional providers and custom IDs. `factory.py` dispatches clients; `openai_client.py` owns the compatible-provider registry. `capabilities.py` describes model parameter compatibility, not a complete TradingAgents UI capability schema. |
| Analysts/languages | `graph/analyst_execution.py` owns `ANALYST_NODE_SPECS`. Output language is a free-text config value; `cli/prompts.py:ask_output_language` has local suggestions and a custom-language option, not a shared language enum. |
| Results/reports | `reporting.py` writes per-section Markdown and consolidated `complete_report.md`/`.html`; graph logs full state JSON. Defaults under `~/.tradingagents/logs`. |
| Token usage | `cli/stats_handler.py:StatsCallbackHandler` counts LLM/tool calls and input/output tokens from LangChain response metadata, protected by a lock. No TradingAgents UI usage store. |
| Persistence | Filesystem data caches, Markdown trading memory (`memory/log.py`), CLI JSON preferences, LangGraph SQLite checkpoints (`graph/checkpointer.py`). No TradingAgents UI database needed for read-only initialization. |
| Docker | Root multistage Python 3.13 Dockerfile installs core and uses `ENTRYPOINT ["tradingagents"]`, non-root user. Compose has interactive CLI and optional Ollama services, persistent home volume, root `.env`. |
| Tests | pytest with unit/integration/smoke markers; normal runs exclude external integration tests. `tests/conftest.py` isolates config, cache and preferences, blocks network calls. |
| Quality/CI | Ruff lint configured in pyproject and CI, Python 3.11–3.14 matrix; repo-wide formatter adoption intentionally deferred. No frontend tooling yet. |

## Chosen structure and dependencies

Keep `tradingagents/` and `cli/` unchanged. Add `portal/backend` (FastAPI,
Pydantic, adapter, pytest), `portal/frontend` (React, TypeScript strict, Vite,
React Router, CSS, ESLint/Prettier, Vitest/Testing Library), `portal/schema`
(OpenAPI contract), scripts, Dockerfile and documentation. Generate TypeScript
from OpenAPI with openapi-typescript; verify generated artifacts in CI.

Python runtime extras: FastAPI, Uvicorn and Pydantic. TradingAgents UI development extra:
HTTPX for TestClient and mypy (pytest/Ruff are existing dev extras).
Core dependencies remain unchanged. No database, queue or analysis service.

One TradingAgents UI Docker service bundles the compiled frontend and backend/core runtime.
The existing CLI service gets a `cli` profile so plain `docker compose up --build`
starts TradingAgents UI; explicit `docker compose run --rm tradingagents ...` still works.
Ollama profiles and CLI Dockerfile/entry point remain intact.

## Adapter boundaries

Only `portal/backend/services/tradingagents_adapter.py` imports TradingAgents.
Read the shared model catalog and analyst registry; import the graph class during
health checks without constructing it. Derive settings from `build_default_config`
through an explicit public allowlist; omit paths, endpoint URLs and credentials.
Expose output language as free text with its configured value as a suggestion,
not as a new finite enum. Distinguish core import availability from provider/key
readiness and TradingAgents UI execution support (not implemented in this phase).

Integration check: `MODEL_OPTIONS` omits Azure and OpenRouter. The adapter also
reads `cli.prompts._llm_provider_table()` (no prompt or network call) so these
providers are included without inventing a duplicated provider list. Their model
maps remain empty and allow custom IDs/deployment names. This private API coupling
is a documented adapter limitation until core exposes a unified provider schema.

## Verification — 2026-10-30

- Existing core suite: 1,412 passed, 100 subtests passed; one optional Bedrock
  test skipped (SDK absent), one integration test deselected by existing defaults.
- TradingAgents UI backend: 9 offline tests passed, including health, catalog parity,
  config overrides, secret/error redaction, CORS and SPA routes.
- Frontend: 11 tests passed; TypeScript production build, ESLint and Prettier passed.
- Full-repository Ruff, TradingAgents UI formatting, strict backend mypy and generated
  OpenAPI/TypeScript drift checks passed. npm audit reported zero vulnerabilities.
- Core CLI `--help` passed locally and in the unchanged CLI Docker image.
- Both Docker images built successfully. `docker compose up --build -d --wait`
  started a healthy TradingAgents UI; all four API endpoints and all four SPA paths returned
  200. Unknown API/asset paths returned 404. Browser showed real connected/core
  status and versions from the Docker build.
- Bootstrap script ran successfully with a custom backend port; Vite proxy
  returned the adapter's 21 providers and four analysts. Ctrl-C stopped both
  child processes. Temporary dev servers and the TradingAgents UI test container were
  stopped after verification; images remain available for the next startup.
- No core/CLI implementation, CLI Dockerfile or root env example changed.
  Local env files, dependencies and build output are ignored; credential-pattern
  scan of changed/new source found no credential material.

These checks do not run an LLM analysis, validate provider credentials, or exercise
the excluded external integration tests. Browser inspection used the app's narrow
preview viewport; no separate desktop-wide screenshot was captured.

## Follow-up: Google authentication — 2026-10-30

The user's subsequent request adds Google sign-in with an exact email allowlist,
initially empty. This supersedes the init-phase decision to omit a TradingAgents UI database:
a separate SQLite auth store now holds revocable sessions and expiring one-time
OAuth attempts. Core persistence remains unchanged. See `AUTH.md` for the current
security model and configuration; the earlier verification describes the initial
unauthenticated scaffold, not the current API access rules.

Current verification: 27 TradingAgents UI backend tests, 20 frontend tests, and the existing
1,412 core tests + 100 subtests passed. Ruff, strict mypy, ESLint, Prettier,
TypeScript/Vite build and OpenAPI drift checks passed. Strict UI static audit
reported no findings; DESIGN.md lint had zero errors (five documentation-only
orphan-token warnings). Docker rebuilt and started healthy; HTTP smoke verified
401 for protected APIs/docs and 503 for unconfigured Google login, while public
health/setup status and the SPA login shell remained available.

Live Google authentication remains unverified without a real OAuth client and
approved email. Browser inspection for this follow-up was unavailable because
local browser use is disabled in Work settings. UI state behavior was exercised
through component tests; no new browser screenshot is claimed.
