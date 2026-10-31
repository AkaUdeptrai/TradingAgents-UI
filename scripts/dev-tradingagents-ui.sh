#!/usr/bin/env bash
# One-command first run. Run from any working directory; Ctrl-C stops the app.
set -euo pipefail
PORTAL_REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PORTAL_REPO"
command -v npm >/dev/null || { echo 'Install Node.js >=22.12 (includes npm).'; exit 1; }
PORTAL_PYTHON="${PORTAL_PYTHON:-python3}"
if [ ! -x .venv/bin/python ]; then "$PORTAL_PYTHON" -m venv .venv; fi
.venv/bin/python -m pip install -e '.[ui,ui-dev,dev]'
npm --prefix portal/frontend ci

# Start local development processes without sourcing .env as shell code.
exec .venv/bin/python -m portal.scripts.dev
