# One-command first run (Windows PowerShell). Run from any directory; Ctrl-C stops the app.
$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw 'Install Node.js >=22.12 (includes npm).' }
$python = if ($env:TRADINGAGENTS_UI_PYTHON) { $env:TRADINGAGENTS_UI_PYTHON } else { 'python' }
if (-not (Test-Path .venv\Scripts\python.exe)) { & $python -m venv .venv }
if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host 'Created .env from .env.example.' }
& .venv\Scripts\python.exe -m pip install -e '.[ui,ui-dev,dev]'
if ($LASTEXITCODE) { exit $LASTEXITCODE }
npm --prefix frontend ci
if ($LASTEXITCODE) { exit $LASTEXITCODE }
& .venv\Scripts\python.exe -m backend.dev
