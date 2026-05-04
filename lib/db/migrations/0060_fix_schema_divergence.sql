-- Migration 0060: Fix schema divergence between Drizzle ORM definitions and live DB.
--
-- All five tables below existed with an older shape (created by bootstrap or
-- early migrations that ran before the canonical Drizzle schema was finalized).
-- This migration brings every table up to the shape the ORM and API routes
-- actually expect, using ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT
-- EXISTS everywhere so it is safe to re-run on any environment.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. admin_audit_log
--    DB has:  id, admin_id, action, ip, user_agent, metadata, created_at
--    ORM wants: + event (NOT NULL DEFAULT ''), + result (NOT NULL DEFAULT 'success'), + reason
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE admin_audit_log
  ADD COLUMN IF NOT EXISTS event  text        NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS result varchar(20) NOT NULL DEFAULT 'success',
  ADD COLUMN IF NOT EXISTS reason text;

-- Back-fill event from the legacy 'action' column for any existing rows
UPDATE admin_audit_log SET event = action WHERE event = '' AND action IS NOT NULL;

-- The legacy 'action' column is NOT NULL with no default; give it a default so
-- Drizzle inserts (which only supply 'event', not 'action') don't violate it.
ALTER TABLE admin_audit_log ALTER COLUMN action SET DEFAULT '';

CREATE INDEX IF NOT EXISTS admin_audit_log_event_idx ON admin_audit_log(event);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. admin_password_hash_snapshots
--    Old table (created by bootstrap): id (PK text NOT NULL), admin_id, hash, created_at
--    Canonical ORM schema:             admin_id (PK), secret_hash, password_changed_at,
--                                      last_verified_at, updated_at
--
--    The two schemas are irreconcilable via ALTER TABLE alone (different PK,
--    different column names for the hash, extra NOT NULL legacy columns that
--    Drizzle never supplies on INSERT). This is a pure watchdog/cache table —
--    rows are regenerated automatically on the next server startup — so we
--    drop and recreate it with the canonical shape.
-- ─────────────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS admin_password_hash_snapshots;

CREATE TABLE admin_password_hash_snapshots (
  admin_id            text PRIMARY KEY
    REFERENCES admin_accounts(id) ON DELETE CASCADE,
  secret_hash         text NOT NULL,
  password_changed_at timestamp,
  last_verified_at    timestamp NOT NULL DEFAULT NOW(),
  updated_at          timestamp NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. van_bookings
--    DB has:  id, user_id, schedule_id, seat_numbers, seat_tiers, tier_label,
--             price_paid, tier_breakdown, total_amount, payment_method, status,
--             travel_date, notes, created_at, updated_at
--    ORM wants: + fare (NOT NULL NUMERIC), + route_id (TEXT), + passenger_name,
--               + passenger_phone, + boarded_at, + completed_at,
--               + cancelled_at, + cancellation_reason
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE van_bookings
  ADD COLUMN IF NOT EXISTS fare                 numeric(10,2),
  ADD COLUMN IF NOT EXISTS route_id             text,
  ADD COLUMN IF NOT EXISTS passenger_name       text,
  ADD COLUMN IF NOT EXISTS passenger_phone      text,
  ADD COLUMN IF NOT EXISTS boarded_at           timestamp,
  ADD COLUMN IF NOT EXISTS completed_at         timestamp,
  ADD COLUMN IF NOT EXISTS cancelled_at         timestamp,
  ADD COLUMN IF NOT EXISTS cancellation_reason  text;

-- Back-fill fare from total_amount for existing rows so NOT NULL can be set
UPDATE van_bookings SET fare = total_amount WHERE fare IS NULL AND total_amount IS NOT NULL;
UPDATE van_bookings SET fare = 0 WHERE fare IS NULL;

-- Back-fill route_id from the related schedule
UPDATE van_bookings vb
  SET route_id = vs.route_id
  FROM van_schedules vs
  WHERE vb.route_id IS NULL AND vb.schedule_id = vs.id;

-- Add travel_date index (schema defines it)
CREATE INDEX IF NOT EXISTS van_bookings_travel_date_idx ON van_bookings(travel_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. customer_error_reports
--    DB has: id, timestamp, customer_name, customer_email, customer_phone,
--            user_id, app_version, device_info, platform, screen, description,
--            repro_steps, status, reviewed_at, reviewed_by, created_at
--    ORM wants: + admin_note
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE customer_error_reports
  ADD COLUMN IF NOT EXISTS admin_note text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. error_reports
--    DB has: id, timestamp, source_app, error_type, severity, status,
--            function_name, error_message, stack_trace, component_name, route,
--            user_id, session_id, app_version, platform, device_info, metadata,
--            resolution_notes, resolution_method, resolved_at, resolved_by,
--            error_hash, created_at, updated_at, occurrence_count, root_cause
--    ORM wants: + module_name, + short_impact, + acknowledged_at
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE error_reports
  ADD COLUMN IF NOT EXISTS module_name     text,
  ADD COLUMN IF NOT EXISTS short_impact    text,
  ADD COLUMN IF NOT EXISTS acknowledged_at timestamp;
