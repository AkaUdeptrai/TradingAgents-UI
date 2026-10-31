# Repository instructions

Read and follow [.codex/github.md](.codex/github.md) when working with branches,
commits, pushes, pull requests, or GitHub reviews in this repository.

Keep core integration behind `tradingagents_ui/runtime/services/tradingagents_adapter.py`.
Preserve existing core and CLI behavior unless the task explicitly changes it.
For application setup and checks, see `tradingagents_ui/README.md`; for authentication,
see `tradingagents_ui/AUTH.md`. Read `DESIGN.md` before changing the UI.

## Review guidelines

- Authentication must fail closed when configuration or the email allowlist is
  empty. Verify Google identity server-side and enforce the allowlist on sessions.
- Do not expose credentials, provider endpoint URLs, filesystem paths, OAuth
  tokens, or session identifiers in public settings, logs, or committed files.
- Keep the OpenAPI snapshot and generated TypeScript types in sync with API changes.
- Flag regressions to the CLI and imports of core internals outside the adapter.
