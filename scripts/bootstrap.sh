#!/bin/bash
# bootstrap.sh — One-command Replit setup
# Runs automatically before each service starts (first boot only).

set -e

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

# ─── 1. INSTALL DEPENDENCIES ──────────────────────────────────────────────────
STAMP="node_modules/.bootstrap-install-stamp"
if [ ! -d "node_modules" ] || [ ! -f "$STAMP" ] || [ "pnpm-lock.yaml" -nt "$STAMP" ]; then
  echo "[bootstrap] Running pnpm install..."
  pnpm install --no-frozen-lockfile
  touch "$STAMP"
else
  echo "[bootstrap] node_modules up to date — skipping install"
fi

if [ -n "${VITE_API_PROXY_TARGET:-}" ]; then export VITE_API_PROXY_TARGET; fi
if [ -z "${VITE_API_PROXY_TARGET:-}" ]; then export VITE_API_PROXY_TARGET="http://127.0.0.1:5000"; fi

DB_STAMP="node_modules/.bootstrap-db-stamp"
DB_URL="${DATABASE_URL:-}"

if [ -z "$DB_URL" ]; then
  echo ""
  echo "[bootstrap] ERROR: DATABASE_URL is not set."
  echo "[bootstrap] Add it as a Replit Secret or in [userenv.shared] in .replit."
  echo "[bootstrap] Expected format: postgresql://<user>:<pass>@<host>/<db>?sslmode=require"
  echo ""
  exit 1
fi

if [ ! -f "$DB_STAMP" ]; then
  echo "[bootstrap] Running pnpm db:push (first boot)..."
  pnpm db:push && touch "$DB_STAMP" && echo "[bootstrap] Schema pushed successfully."
else
  echo "[bootstrap] DB already pushed — skipping (delete node_modules/.bootstrap-db-stamp to force)"
fi

echo "[bootstrap] Bootstrap complete."
