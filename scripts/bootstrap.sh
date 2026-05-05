#!/bin/bash
# bootstrap.sh — One-command Replit setup
# Runs automatically before each service starts (first boot only).
# On subsequent runs the .env check short-circuits instantly.

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

# ─── 2. DECRYPT .env ──────────────────────────────────────────────────────────
if [ ! -f ".env" ] || [ ! -s ".env" ]; then
  if [ -f ".env.enc" ] && [ -s ".env.enc" ]; then
    if [ -n "$ENV_PASSWORD" ]; then
      echo "[bootstrap] ENV_PASSWORD found — auto-decrypting .env.enc..."
      node scripts/env-manager.mjs decrypt
      echo "[bootstrap] .env written successfully."
    else
      echo "[bootstrap] .env.enc found but ENV_PASSWORD is not set."
      echo "[bootstrap] Add ENV_PASSWORD as a Replit Secret for zero-touch setup."
      echo "[bootstrap] Falling back to interactive prompt..."
      node scripts/env-manager.mjs decrypt
    fi
  else
    echo "[bootstrap] WARNING: No .env or .env.enc found. Services requiring secrets will fail."
    echo "[bootstrap] Run:  pnpm env:create  to set up the encrypted environment."
  fi
else
  echo "[bootstrap] .env already present — skipping decrypt"
fi

# ─── 3. LOAD .env INTO SHELL ──────────────────────────────────────────────────
set -a
[ -f .env ] && [ -s .env ] && source .env
set +a

# ─── 4. DB PUSH (first boot only) ─────────────────────────────────────────────
DB_STAMP="node_modules/.bootstrap-db-stamp"
DB_URL="${DATABASE_URL:-}"

if [ -n "$DB_URL" ]; then
  if [ ! -f "$DB_STAMP" ]; then
    echo "[bootstrap] Running pnpm db:push (first boot)..."
    pnpm db:push && touch "$DB_STAMP" && echo "[bootstrap] Schema pushed successfully."
  else
    echo "[bootstrap] DB already pushed — skipping (delete node_modules/.bootstrap-db-stamp to force)"
  fi
else
  echo "[bootstrap] DATABASE_URL not set — skipping db:push"
fi

echo "[bootstrap] Bootstrap complete."
