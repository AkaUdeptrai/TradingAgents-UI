#!/usr/bin/env bash
# One-command first run (macOS/Linux/WSL). Run from any directory; Ctrl-C stops the app.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
command -v npm >/dev/null || { echo 'Install Node.js >=22.12 (includes npm).'; exit 1; }
TRADINGAGENTS_UI_PYTHON="${TRADINGAGENTS_UI_PYTHON:-python3}"
if [ ! -x .venv/bin/python ]; then "$TRADINGAGENTS_UI_PYTHON" -m venv .venv; fi
if [ ! -f .env ]; then cp .env.example .env; echo 'Created .env from .env.example.'; fi
.venv/bin/python -m pip install -e '.[ui,ui-dev,dev]'
npm --prefix frontend ci

# Start local development processes without sourcing .env as shell code.
exec .venv/bin/python -m backend.dev
