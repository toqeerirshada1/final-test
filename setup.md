# AJKMart Super-App — Complete Setup Guide

> Multi-service super-app for AJK region, Pakistan. E-commerce · Food Delivery · Ride-Hailing · Pharmacy · Parcel · Inter-city Transport.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Quick Start](#2-quick-start)
3. [Project File Structure](#3-project-file-structure)
4. [Environment System](#4-environment-system)
5. [Development Workflow](#5-development-workflow)
6. [All pnpm Scripts — Complete Reference](#6-all-pnpm-scripts--complete-reference)
7. [Production Deployment VPS](#7-production-deployment-vps)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Project Overview

AJKMart is a pnpm workspace monorepo containing 5 deployable apps and 10 shared libraries.

| Layer | What |
|---|---|
| **API** | Node.js / Express · Drizzle ORM · PostgreSQL · Socket.IO · JWT |
| **Admin** | React + Vite · Command-centre dashboard |
| **Vendor** | React + Vite · Product & order management portal |
| **Rider** | React + Vite PWA · GPS tracking · Earnings |
| **Customer** | Expo / React Native · iOS · Android · Web |
| **Database** | PostgreSQL (Neon cloud or local) |
| **Cache** | Redis (optional, for rate-limiting) |
| **Push** | Web Push via VAPID |
| **AI** | Google Gemini API |
| **SMS** | Twilio |
| **Email** | SendGrid / SMTP |

---

## 2. Quick Start

### Prerequisites (all platforms)

- **Node.js** 20+ and **pnpm** 9+
- **PostgreSQL** connection string (`DATABASE_URL`)
- Env password: `Khan@123.com` (change after first setup)

---

### 2.1 Replit (Recommended for Development)

```bash
# 1. Open the project in Replit — it auto-runs pnpm install
# 2. Decrypt the environment (password: Khan@123.com)
pnpm env:decrypt

# 3. Start all services via the Run button (or in shell):
pnpm replit-start
```

The Replit workflow (`Start application`) calls `node scripts/launchers/start.mjs replit`.
It auto-prompts for the env password if `.env` is missing.

**Service URLs in Replit preview pane:**

| Service | Path |
|---|---|
| Customer App (Expo web) | `/` |
| API Server | `/api/` |
| Admin Panel | `/admin/` |
| Vendor Portal | `/vendor/` |
| Rider PWA | `/rider/` |

---

### 2.2 GitHub Codespaces

```bash
# 1. Clone repo and open in Codespace
# 2. Install dependencies
pnpm install

# 3. Decrypt environment
pnpm env:decrypt          # enter password: Khan@123.com

# 4. Start all services
pnpm codespace-start

# Or start individual services:
pnpm dev:api              # API on :8080
pnpm dev:admin            # Admin on :5173
pnpm dev:vendor           # Vendor on :5174
pnpm dev:rider            # Rider on :5175
pnpm dev:customer         # Customer web on :19006
```

Port forwards are automatically detected by Codespaces.

---

### 2.3 Local Machine

```bash
# 1. Install dependencies
pnpm install

# 2. Set up environment
pnpm env:decrypt          # password: Khan@123.com

# 3. Push database schema
pnpm db:push

# 4. Start all services
pnpm local-start

# Or use the full dev runner:
node scripts/run-dev-all.mjs
```

---

### 2.4 VPS / Production Server

```bash
# 1. Clone and install
git clone <repo-url>
pnpm install

# 2. Decrypt environment
pnpm env:decrypt

# 3. Build all apps
node scripts/build-production.mjs

# 4. Start with PM2
node scripts/pm2-control.mjs start

# Or use the all-in-one script:
bash scripts/server-up.sh
```

See [Section 7](#7-production-deployment-vps) for Caddy / Nginx config.

---

## 3. Project File Structure

### Root Directory

| File / Folder | Purpose |
|---|---|
| `package.json` | Root scripts, workspace config, all `pnpm *` commands |
| `pnpm-workspace.yaml` | Workspace package paths (artifacts/*, lib/*) |
| `tsconfig.base.json` | Shared TypeScript compiler base config |
| `tsconfig.json` | Root-level TS project references |
| `.npmrc` | pnpm settings (enforce pnpm usage) |
| `ecosystem.config.cjs` | PM2 app config for VPS production start |
| `flake.nix` / `replit.nix` | Nix environment for Replit |
| `.env` | Active env vars — **gitignored**, never commit |
| `.env.enc` | AES-256-GCM encrypted env — **safe to commit** |
| `.env.example` | Non-sensitive template — safe to commit |
| `.gitignore` | Ignores `.env`, backups; allows `.env.enc` |
| `replit.md` | Agent memory / project documentation |
| `test123.md` | Source reference for env-manager code — keep |
| `setup.md` | This file — complete setup guide |

---

### scripts/ — Automation Scripts

| File | Purpose |
|---|---|
| `env-manager.mjs` | **Main env tool** — create/decrypt/update/show/verify/export/reset |
| `launchers/start.mjs` | Multi-profile launcher (replit/codespace/vps/local) |
| `launchers/replit.mjs` | Replit-specific service start |
| `launchers/codespace.mjs` | Codespace-specific service start |
| `dev-ctl.mjs` | Developer control script — start/stop individual services |
| `run-dev-all.mjs` | Start all 5 services in parallel (local dev) |
| `build-production.mjs` | Build all apps for production |
| `pm2-control.mjs` | Start / stop PM2 via ecosystem.config.cjs |
| `server-up.sh` | All-in-one VPS setup: install → db push → build → PM2 start |
| `post-merge.sh` | Auto-runs after git merge — installs deps, warns if .env missing |
| `src/seed.ts` | Sample product seed data — run to populate dev database |

---

### artifacts/ — Deployable Applications

| App | Dev Port | Prod Path | Stack |
|---|---|---|---|
| `api-server` | 8080 | `/api/` | Node.js · Express · Drizzle · Socket.IO |
| `admin` | 5173 | `/admin/` | React · Vite |
| `vendor-app` | 5174 | `/vendor/` | React · Vite |
| `rider-app` | 5175 | `/rider/` | React · Vite · PWA |
| `ajkmart` | 19006 / 5000 | `/` | Expo · React Native · Web |
| `mockup-sandbox` | 20716 | `/__mockup` | Vite component preview server |

---

### lib/ — Shared Libraries

| Package | Purpose |
|---|---|
| `@workspace/db` | Drizzle ORM schema, migrations, connection helpers |
| `@workspace/api-client-react` | Typed API client with React Query hooks |
| `@workspace/api-spec` | OpenAPI-style API route specifications |
| `@workspace/api-zod` | Zod schemas for all API request/response types |
| `@workspace/i18n` | Trilingual strings — English / Urdu / Roman Urdu |
| `@workspace/service-constants` | Shared enums, service IDs, feature flags |
| `@workspace/auth-utils` | JWT helpers shared between server and clients |
| `@workspace/admin-timing-shared` | Time-slot utilities for admin scheduling |
| `@workspace/phone-utils` | Phone number formatting and validation |
| `@workspace/integrations` | Third-party integration adapters |
| `@workspace/integrations-gemini-ai` | Google Gemini AI helpers |

---

### deploy/ — Server Config Files

| File | Purpose |
|---|---|
| `Caddyfile` | Caddy web server config — reverse proxy + static files |
| `nginx.conf` | Nginx alternative config |
| `env.example` | Legacy env example (use `.env.example` at root instead) |

---

## 4. Environment System

All secrets are stored in `.env.enc` (AES-256-GCM, scrypt key derivation).

### Quick Command Reference

| Command | What it does |
|---|---|
| `pnpm env:create` | First-time setup — set password, generate `.env.enc` |
| `pnpm env:decrypt` | Unlock `.env.enc` → writes `.env` to disk |
| `pnpm env:update` | Interactive menu: change any variable or password |
| `pnpm env:show` | View all variables (secrets masked as `••••`) |
| `pnpm env:verify` | Health-check report: READY / PLACEHOLDER / EMPTY status per var |
| `pnpm env:export` | Write `.env.example` with secrets redacted — safe to commit |
| `pnpm env:reset` | Delete `.env.enc` (backup created first), then recreate |
| `pnpm env` | Alias for `env:decrypt` |

### Command Aliases

| Command | Also accepts |
|---|---|
| `env:decrypt` | `open`, `unlock` |
| `env:update` | `edit`, `modify` |
| `env:show` | `view`, `list` |
| `env:verify` | `check`, `health`, `status` |
| `env:export` | `example`, `template` |
| `env:reset` | `delete`, `clean` |

### `pnpm env:verify` — Status Legend

| Icon | Meaning |
|---|---|
| ✅ | Real value set — ready to use |
| 🟡 | Placeholder — has a value but needs a real one |
| ⚠️ | Empty — using built-in default |
| 🔧 | Can be auto-generated (run `env:update`) |
| ❌ | Missing from `.env` entirely |

### Variable Groups (47 total)

| Group | Variables |
|---|---|
| Database | `DATABASE_URL` |
| JWT / Auth | `JWT_SECRET`, `ADMIN_JWT_SECRET`, `ADMIN_REFRESH_SECRET`, `ADMIN_SECRET`, `ADMIN_ACCESS_TOKEN_SECRET`, `ADMIN_REFRESH_TOKEN_SECRET`, `ADMIN_CSRF_SECRET`, `VENDOR_JWT_SECRET`, `RIDER_JWT_SECRET`, `JWT_ISSUER` |
| Admin Seed | `ADMIN_SEED_USERNAME`, `ADMIN_SEED_PASSWORD`, `ADMIN_SEED_EMAIL`, `ADMIN_SEED_NAME` |
| Security | `ERROR_REPORT_HMAC_SECRET`, `ALLOWED_ORIGINS`, `ADMIN_LEGACY_AUTH_DISABLED`, `ADMIN_PASSWORD_RESET_TOKEN_TTL_MIN` |
| Ports & URLs | `PORT` (5000), `APP_BASE_URL`, `ADMIN_BASE_URL`, `FRONTEND_URL`, `CLIENT_URL`, `PORT_FALLBACK_ENABLE`, `PORT_MAX_RETRIES` |
| Firebase | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` |
| Twilio / SMS | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` |
| Email | `SENDGRID_API_KEY`, `SMTP_HOST` |
| AI | `GEMINI_API_KEY` |
| Maps & Routing | `GOOGLE_MAPS_API_KEY`, `OSRM_API_URL` |
| Push (VAPID) | `VAPID_PRIVATE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_CONTACT_EMAIL` |
| Infrastructure | `REDIS_URL`, `SENTRY_DSN` |
| Runtime | `NODE_ENV`, `LOG_LEVEL` |
| Expo / Vite | `EXPO_PUBLIC_DOMAIN`, `VITE_API_BASE_URL`, `VITE_API_PROXY_TARGET` |

### Replacing Placeholder Values

When `pnpm env:verify` shows 🟡 PLACEHOLDER, run:

```bash
pnpm env:update
# → Choose option 2: Change specific variable
# → Enter variable name (e.g. FIREBASE_PRIVATE_KEY)
# → Paste the real value
```

### Security Rules

- `.env` is gitignored — never commit it
- `.env.enc` is safe to commit (encrypted)
- `.env.example` is safe to commit (secrets redacted)
- Master password: **never commit** — share securely (WhatsApp / Signal)
- Backups (`*.backup`) are auto-created before reset

---

## 5. Development Workflow

### First Time (new machine / clone)

```bash
git clone <repo-url>
cd ajkmart
pnpm install
pnpm env:decrypt          # password: Khan@123.com
pnpm db:push              # apply schema to database
pnpm replit-start         # or codespace-start / local-start
```

### Daily Work

```bash
pnpm replit-start         # start all services
# OR
pnpm dev:api              # start only API
pnpm dev:admin            # start only admin
```

### After Pulling Changes (git pull / merge)

The `scripts/post-merge.sh` runs automatically and:
1. Installs any new dependencies (`pnpm install`)
2. Warns if `.env` is missing (run `pnpm env:decrypt`)
3. Skips migrations gracefully if no `DATABASE_URL`

### Database Commands

```bash
pnpm db:push              # push schema changes to database
pnpm db:studio            # open Drizzle Studio (visual DB browser)
pnpm db:generate          # generate migration files
pnpm db:migrate           # run migrations
```

### Seeding Sample Data

```bash
pnpm --filter @workspace/scripts tsx scripts/src/seed.ts
```

Inserts 20 sample products (groceries, food, household) for vendor `vendor_demo_001`.

---

## 6. All pnpm Scripts — Complete Reference

### Startup Scripts

| Script | Command | Description |
|---|---|---|
| `pnpm replit-start` | `node scripts/launchers/start.mjs replit` | Start all services on Replit |
| `pnpm codespace-start` | `node scripts/launchers/start.mjs codespace` | Start all services in Codespace |
| `pnpm vps-start` | `node scripts/launchers/start.mjs vps` | Start all services on VPS |
| `pnpm local-start` | `node scripts/launchers/start.mjs local` | Start all on local machine |
| `pnpm start:all` | `node scripts/run-dev-all.mjs` | Alternative: start all in one process |

### Dev Scripts (individual services)

| Script | Port | Description |
|---|---|---|
| `pnpm dev:api` | 8080 | API server (hot reload) |
| `pnpm dev:admin` | 5173 | Admin panel (Vite HMR) |
| `pnpm dev:vendor` | 5174 | Vendor portal (Vite HMR) |
| `pnpm dev:rider` | 5175 | Rider app (Vite HMR) |
| `pnpm dev:customer` | 19006 | Customer Expo web |

### Environment Scripts

| Script | Description |
|---|---|
| `pnpm env` | Decrypt `.env.enc` → writes `.env` |
| `pnpm env:create` | Create new encrypted environment |
| `pnpm env:decrypt` | Same as `env` |
| `pnpm env:update` | Interactive update menu |
| `pnpm env:show` | Show all vars (masked) |
| `pnpm env:verify` | Health check — ready/placeholder/empty report |
| `pnpm env:export` | Generate `.env.example` (secrets redacted) |
| `pnpm env:reset` | Delete with backup, recreate |

### Database Scripts

| Script | Description |
|---|---|
| `pnpm db:push` | Push Drizzle schema to database |
| `pnpm db:generate` | Generate migration SQL files |
| `pnpm db:migrate` | Run pending migrations |
| `pnpm db:studio` | Open Drizzle Studio browser |

### Build & Deploy Scripts

| Script | Description |
|---|---|
| `pnpm build:all` | Build all 5 apps for production |
| `pnpm build:api` | Build API server only |
| `pnpm build:admin` | Build admin panel only |
| `pnpm build:vendor` | Build vendor portal only |
| `pnpm build:rider` | Build rider app only |
| `pnpm build:customer` | Build customer Expo web only |

### Utility Scripts

| Script | Description |
|---|---|
| `pnpm check-permissions` | Validate Replit permissions (used by Run button) |
| `pnpm lint` | Run ESLint across all packages |
| `pnpm typecheck` | TypeScript type-check all packages |

---

## 7. Production Deployment (VPS)

### Server Requirements

- Ubuntu 22.04+ / Debian 12+
- Node.js 20+, pnpm 9+
- PostgreSQL 15+ (or Neon cloud DB)
- Caddy or Nginx (for reverse proxy)
- PM2 (for process management)
- Optional: Redis 7+ (for caching/rate-limiting)

### Step-by-Step

```bash
# 1. Clone and install
git clone <repo-url> /srv/ajkmart
cd /srv/ajkmart
pnpm install

# 2. Set up environment
pnpm env:decrypt
# Enter your master password

# 3. Update production vars
pnpm env:update
# Change: NODE_ENV=production
# Change: APP_BASE_URL=https://yourdomain.com
# Change: ALLOWED_ORIGINS=https://yourdomain.com

# 4. Push database schema
pnpm db:push

# 5. Build all apps
node scripts/build-production.mjs

# 6. Start with PM2
node scripts/pm2-control.mjs start

# PM2 commands:
pnpm dlx pm2 list           # check status
pnpm dlx pm2 logs           # view logs
pnpm dlx pm2 restart all    # restart
pnpm dlx pm2 stop all       # stop
```

### Caddy Config (deploy/Caddyfile)

```
AJKMART_DOMAIN=yourdomain.com \
APP_ROOT=/srv/ajkmart \
caddy run --config deploy/Caddyfile
```

Routes:
- `/api/*` → API server (port 8080)
- `/admin/*` → Admin dist/public
- `/vendor/*` → Vendor dist/public
- `/rider/*` → Rider dist/public
- `/*` → Customer web (port 19006)

### Environment Variables for Production

Must update before deploying:

```bash
pnpm env:update     # change each one interactively
```

| Variable | Production Value |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Your production PostgreSQL URL |
| `APP_BASE_URL` | `https://yourdomain.com` |
| `ALLOWED_ORIGINS` | `https://yourdomain.com` |
| `REDIS_URL` | `redis://localhost:6379` (if Redis installed) |
| `SENTRY_DSN` | Your real Sentry DSN (for error tracking) |
| `FIREBASE_PRIVATE_KEY` | Real key from Firebase Console |
| `GEMINI_API_KEY` | Real Google AI API key |

---

## 8. Troubleshooting

### `.env` not found on startup

```bash
pnpm env:decrypt          # enter password: Khan@123.com
```

The launcher auto-detects this and prompts for the password.

### `DATABASE_URL` not set / DB connection fails

```bash
pnpm env:show             # check current DATABASE_URL value
pnpm env:update           # update it if wrong
pnpm db:push              # re-push schema after fixing
```

### Port already in use

The launcher has auto port-retry (up to 10 ports). Or set `PORT_FALLBACK_ENABLE=false` to get a clear error.

### Wrong password for `.env.enc`

You have 7 attempts. After 7 failures, the process exits. If you forget the password:
1. Contact the team admin who has the master password
2. Password hint: `Khan@123.com` format (change it after onboarding)

### TypeScript / Build errors

```bash
pnpm typecheck             # see all TS errors across monorepo
pnpm --filter @workspace/api-server typecheck    # single package
```

### pnpm install fails

```bash
corepack enable            # enable corepack (fixes pnpm version issues)
pnpm install --no-frozen-lockfile
```

### API returns 401 / JWT errors

Check that these vars are set in `.env`:
```bash
pnpm env:verify            # look for 🟡 PLACEHOLDER or ❌ MISSING in JWT section
pnpm env:update            # fix any placeholder values
```

### Firebase / Push notifications not working

The `FIREBASE_PRIVATE_KEY` in `.env.enc` is a **placeholder**. Replace with real key:
1. Go to Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Copy the `private_key` field from the downloaded JSON
4. Run `pnpm env:update` and paste the real key for `FIREBASE_PRIVATE_KEY`

### Gemini AI not responding

`GEMINI_API_KEY` is currently set to `GOOGLE_API_KEY` (placeholder). Get a real key:
1. Go to https://makersuite.google.com/app/apikey
2. Create a new API key
3. Run `pnpm env:update` → change `GEMINI_API_KEY`

---

## Summary: Environment Status After Setup

Run `pnpm env:verify` to see current status. After initial setup:

| Group | Status | Notes |
|---|---|---|
| JWT / Auth | ✅ READY | All secrets generated |
| Admin Seed | ✅ READY | Default credentials set |
| Ports & URLs | ✅ READY | Configured for local dev |
| Push (VAPID) | ✅ READY | Keys generated |
| Infrastructure | ✅ READY | Redis + Sentry using defaults |
| Maps & OSRM | ✅ READY | OSRM using public server |
| Firebase | 🟡 PLACEHOLDER | Replace with real Firebase key |
| Gemini AI | 🟡 PLACEHOLDER | Replace with real Google API key |
| Twilio / SMS | ✅ READY | Replace with real credentials for SMS |
| Email | ✅ READY | Replace with real SendGrid key for email |
| Database | ⚠️ DEFAULT | Set real `DATABASE_URL` for your PostgreSQL |

---

*Last updated: May 2026 — AJKMart v1.x*
