# Repository instructions

Read and follow [.codex/github.md](.codex/github.md) when working with branches,
commits, pushes, pull requests, or GitHub reviews in this repository.

Keep core integration behind `backend/services/tradingagents_adapter.py`.
Preserve existing core and CLI behavior unless the task explicitly changes it.
For application setup and checks, see `docs/UI.md`; for authentication,
see `docs/AUTH.md`. Read `DESIGN.md` before changing the UI.

## Review guidelines

- Authentication must fail closed when configuration or the email allowlist is
  empty. Verify Google identity server-side and enforce the allowlist on sessions.
- Do not expose credentials, provider endpoint URLs, filesystem paths, OAuth
  tokens, or session identifiers in public settings, logs, or committed files.
- Keep the OpenAPI snapshot and generated TypeScript types in sync with API changes.
- Flag regressions to the CLI and imports of core internals outside the adapter.

## Project map

- `tradingagents/`, `cli/`, `tests/`: upstream core (graph, agents, dataflows, LLM clients) and its CLI. Treat as stable.
- `backend/`: FastAPI app (`app.py`), `models.py`, `auth/` (Google sign-in, SQLite sessions),
  `services/tradingagents_adapter.py` (the only core boundary), `services/analysis_jobs.py` (background jobs), `tests/`.
- `frontend/`: React + TypeScript + Vite; `src/pages`, `src/components`, `src/api` (generated types + client).
- `backend/openapi.json`: committed OpenAPI snapshot; `frontend/src/api/schema.d.ts` is generated from it.
- UI copy is Vietnamese. Visual rules live in `DESIGN.md`.

## Working method

- Explore before editing: read the files you will change and their tests. Do not guess APIs; grep for real usage.
- For work spanning several areas, plan first, then change contract (models, OpenAPI, types) before consumers.
- Make the smallest cohesive change; do not refactor unrelated code or reformat untouched files.
- Add or update tests with every behavior change; reproduce bugs with a failing test when practical.
- Run the relevant checks from `.codex/github.md` and report results truthfully, including skipped checks.
- Never run live Google, LLM, or paid provider calls. Never commit `.env`, databases, or build output.
- The worktree may contain the user's uncommitted work; do not revert or overwrite changes you did not make.

## Project roles (`.codex/agents/`)

Delegate when a task fits a role and stays independent: `explorer` (read-only search), `planner`, `core_adapter`,
`api_contract`, `frontend_dev`, `ui_ux`, `runtime_api`, `qa_tester`, `debugger`, `code_reviewer`, `security_review`,
`devops_docker`, `docs_writer`, `github_release`. Run read-only roles in parallel for exploration and review;
keep edits to one writer per file. After non-trivial changes, run `code_reviewer`, and `security_review` for anything
touching auth, sessions, jobs, or settings. See `.codex/agents/README.md`.
