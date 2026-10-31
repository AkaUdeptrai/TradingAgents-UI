# GitHub workflow

## Branches and commits

- Inspect `git status`, the current branch, remotes, and applicable instructions
  before changing Git state. Preserve unrelated work.
- Use `codex/<short-description>` for new task branches. Determine the target
  branch from the repository default or the user's request; never push directly
  to the default branch as part of a feature task.
- Stage explicit paths and inspect the staged diff. Exclude `.env`, credentials,
  databases, caches, virtual environments, `node_modules`, and build output.
  Sanitized `.env.example` files and lockfiles belong in Git.
- Use concise commit subjects with a useful prefix such as `feat:`, `fix:`,
  `docs:`, or `chore:`. Keep commits coherent and within the requested scope.
- Do not reset unrelated work, rewrite published history, force-push, or merge
  a PR unless the user explicitly requests that action.

## Validation

Run checks relevant to the changes; reuse successful checks when code has not
changed. Report failures and skipped checks accurately.

For TradingAgents UI changes, with the development dependencies installed:

```sh
.venv/bin/pytest -q tradingagents_ui/runtime/tests
.venv/bin/ruff check tradingagents_ui
.venv/bin/ruff format --check tradingagents_ui
.venv/bin/mypy
.venv/bin/python -m tradingagents_ui.scripts.export_openapi --check
npm --prefix tradingagents_ui/web run api:check
npm --prefix tradingagents_ui/web run lint
npm --prefix tradingagents_ui/web run format:check
npm --prefix tradingagents_ui/web test
npm --prefix tradingagents_ui/web run build
```

Run core tests and a CLI smoke check when integration or shared packaging changes.
For Docker changes, build the affected services and verify their startup behavior.
Always run `git diff --cached --check` before committing. Do not make live Google,
LLM, or paid provider calls merely to satisfy tests; document untested live flows.

## Push and pull requests

- Honor existing user authorization to commit, push, and create a PR without
  asking again. A local implementation request alone does not imply a merge.
- Verify the destination remote, then push the task branch with upstream tracking.
- Use an available GitHub connector or authenticated `gh`. When using `gh`, put
  multiline PR text in a file and pass `--body-file`.
- PR titles and descriptions must describe the final change for a new reviewer:
  the problem, resulting behavior, relevant tests, setup requirements, and known
  limitations. Distinguish local results from remote CI results.
- For this TradingAgents UI, state that Google credentials and an explicit email allowlist
  are required; an empty allowlist grants access to nobody. Never include secrets.
- Verify the resulting PR's base/head and URL. Attach it to the Codex task when
  the artifact attachment tool is available. Report the link and branch to the user.
- Leave merging to an explicit user instruction. Do not claim CI passed while
  checks are pending or were not run.
