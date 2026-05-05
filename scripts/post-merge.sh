#!/bin/bash
set -e

# ─── ENV CHECK / AUTO-DECRYPT ─────────────────────────────────────────────────
# Always refresh .env from .env.enc when ENV_PASSWORD is available so that any
# secrets changed in the pulled .env.enc are reflected immediately.
if [ -f ".env.enc" ] && [ -s ".env.enc" ]; then
  if [ -n "$ENV_PASSWORD" ]; then
    # Decrypt when: .env is missing, empty, OR .env.enc is newer than .env
    if [ ! -f ".env" ] || [ ! -s ".env" ] || [ ".env.enc" -nt ".env" ]; then
      echo "[post-merge] ENV_PASSWORD is set — refreshing .env from .env.enc..."
      node scripts/env-manager.mjs decrypt --non-interactive && echo "[post-merge] .env refreshed successfully." || {
        echo "[post-merge] WARNING: Auto-decrypt failed (wrong ENV_PASSWORD?). Run:  pnpm env:decrypt  manually."
      }
    else
      echo "[post-merge] .env is up to date (newer than .env.enc) — skipping decrypt"
    fi
  else
    if [ ! -f ".env" ] || [ ! -s ".env" ]; then
      echo "[post-merge] WARNING: .env missing but .env.enc found."
      echo "[post-merge] Set ENV_PASSWORD as a Replit Secret for auto-decrypt, or run:  pnpm env:decrypt"
    fi
  fi
else
  if [ ! -f ".env" ] || [ ! -s ".env" ]; then
    echo "[post-merge] WARNING: No .env or .env.enc found."
    echo "[post-merge] Run:  pnpm env:create   — to set up encrypted environment."
  fi
fi

# Load .env into this shell if present (safe parser — handles special chars in values)
if [ -f .env ] && [ -s .env ]; then
  while IFS= read -r line || [ -n "$line" ]; do
    # Skip blank lines and comments
    [[ "$line" =~ ^[[:space:]]*$ ]] && continue
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    # Only process lines that look like KEY=VALUE
    if [[ "$line" =~ ^[[:space:]]*([A-Za-z_][A-Za-z0-9_]*)=(.*)$ ]]; then
      key="${BASH_REMATCH[1]}"
      val="${BASH_REMATCH[2]}"
      # Strip surrounding quotes if present
      val="${val%\"}"
      val="${val#\"}"
      val="${val%\'}"
      val="${val#\'}"
      export "$key=$val"
    fi
  done < .env
fi

# ─── INSTALL ──────────────────────────────────────────────────────────────────
INSTALL_MARKER="node_modules/.post-merge-install-marker"
if [ ! -d "node_modules" ] || [ ! -f "$INSTALL_MARKER" ] || [ "pnpm-lock.yaml" -nt "$INSTALL_MARKER" ]; then
  echo "[post-merge] Running pnpm install..."
  pnpm install --no-frozen-lockfile
  touch "$INSTALL_MARKER"
else
  echo "[post-merge] node_modules up to date, skipping install"
fi

# ─── BUILD LIBS ───────────────────────────────────────────────────────────────
pnpm --filter @workspace/db build 2>/dev/null || echo "[post-merge] WARN: @workspace/db build skipped"
pnpm --filter @workspace/phone-utils build 2>/dev/null || echo "[post-merge] WARN: @workspace/phone-utils build skipped"

# ─── MIGRATIONS ───────────────────────────────────────────────────────────────
MIGRATION_DIR="lib/db/migrations"
DB_URL="${DATABASE_URL}"

if [ -z "$DB_URL" ]; then
  echo "[post-merge] Skipping migrations — no DATABASE_URL set."
  echo "[post-merge] Run:  pnpm env:decrypt  — then re-run post-merge manually."
else
  psql "$DB_URL" -c "
    CREATE TABLE IF NOT EXISTS _schema_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT now()
    );
  " 2>&1

  for sql_file in $(ls "$MIGRATION_DIR"/*.sql 2>/dev/null | sort); do
    filename=$(basename "$sql_file")
    already_applied=$(psql "$DB_URL" -tA -c "SELECT COUNT(*) FROM _schema_migrations WHERE filename = '$filename';")
    if [ "$already_applied" -eq "0" ]; then
      echo "[migration] Applying $filename..."
      psql "$DB_URL" -f "$sql_file" 2>&1 && \
        psql "$DB_URL" -c "INSERT INTO _schema_migrations (filename) VALUES ('$filename') ON CONFLICT DO NOTHING;" 2>&1
      echo "[migration] Applied $filename"
    else
      echo "[migration] Skipping $filename (already applied)"
    fi
  done
fi

echo "[post-merge] Done"
