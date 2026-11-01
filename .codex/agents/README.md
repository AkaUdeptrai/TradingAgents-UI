# Project Codex roles

Codex discovers project-scoped roles from `.codex/agents/*.toml`; limits are in `../config.toml`.
Read-only roles set `sandbox_mode = "read-only"`. Roles grant no extra network access.

| Role | Use for |
| --- | --- |
| `explorer` | read-only: locate code, trace flows |
| `planner` | read-only: ordered plan for multi-area work |
| `core_adapter` | adapter boundary, analysis jobs, core integration |
| `api_contract` | routes, models, OpenAPI snapshot, generated TS types |
| `frontend_dev` | React/TS pages, components, client, tests |
| `ui_ux` | visual/UX design per `DESIGN.md`, accessibility, responsive |
| `runtime_api` | runtime wiring and packaging overall |
| `qa_tester` | write/run tests, regression coverage |
| `debugger` | root-cause failing checks and errors |
| `code_reviewer` | read-only diff review |
| `security_review` | read-only auth/data-isolation review |
| `devops_docker` | Docker, compose, dev scripts, env |
| `docs_writer` | documentation only |
| `github_release` | branch, commit, push, PR |
