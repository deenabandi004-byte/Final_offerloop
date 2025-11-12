#!/usr/bin/env bash
set -euo pipefail

# 1) Install Node (for building the frontend) — runs on Render (Linux)
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# 2) Build the frontend (change folder name if different)
cd connect-grow-hire
npm ci
npm run build
cd ..

# 3) Install Python deps for the backend
pip install -r backend/requirements.txt
