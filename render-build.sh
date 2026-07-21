#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend"
cd connect-grow-hire

if command -v npm >/dev/null 2>&1; then
  echo "Using npm"
  npm ci || npm install
  npm run build
elif command -v bun >/dev/null 2>&1; then
  echo "Using bun"
  bun install
  bun run build
else
  echo "ERROR: Neither npm nor bun found in Render build environment."
  exit 1
fi

cd ..

echo "==> Installing backend Python deps"
pip install --upgrade pip
pip install -r backend/requirements.txt --break-system-packages

# Playwright ships as a Python package + a separate browser binary. `pip
# install` alone only lands the package; the Chromium binary that
# `sync_playwright().chromium.connect_over_cdp(...)` (used by every
# auto-apply filler) needs at runtime has to be installed explicitly.
# Without this step, cold Render pods raise ImportError-style failures on
# import and the run dies with "playwright not installed" — confirmed on
# the 2026-07-20 audit.
echo "==> Installing Playwright Chromium binary"
python -m playwright install chromium
