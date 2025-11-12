#!/usr/bin/env bash
set -euo pipefail

echo "==> Building frontend"
cd connect-grow-hire

# Prefer npm if available; otherwise use bun
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
pip install -r backend/requirements.txt
