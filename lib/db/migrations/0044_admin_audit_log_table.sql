-- Create admin_audit_log table.
--
-- The schema for this table has lived in lib/db/src/schema/admin_sessions.ts
-- since Task #0, and the runtime helper logAdminAudit() inserts into it from
-- many places (admin login, password reset, force-change, super-admin reset
-- link, and now the seeded-admin bootstrap). However, no SQL migration was
-- ever shipped to actually create the relation, so every insert was failing
-- silently because logAdminAudit() catches its own errors.
--
-- This migration creates the table idempotently so audit entries actually
-- persist, including the first one written when the default super-admin is
-- seeded on a fresh deployment.
--
-- NOTE: On some environments the table was created by early bootstrap code
-- with a slightly different shape (using "action" instead of "event", and
-- without the "result" / "reason" columns).  The ALTER TABLE ... ADD COLUMN
-- IF NOT EXISTS statements below bring those environments up to the canonical
-- schema without breaking fresh deployments where CREATE TABLE already added
-- every column.

CREATE TABLE IF NOT EXISTS "admin_audit_log" (
  "id"          text PRIMARY KEY,
  "admin_id"    text REFERENCES "admin_accounts"("id") ON DELETE SET NULL,
  "event"       text NOT NULL DEFAULT '',
  "ip"          varchar(45) NOT NULL,
  "user_agent"  text,
  "result"      varchar(20) NOT NULL DEFAULT 'success',
  "reason"      text,
  "metadata"    text,
  "created_at"  timestamp NOT NULL DEFAULT NOW()
);

ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "event"  text NOT NULL DEFAULT '';
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "result" varchar(20) NOT NULL DEFAULT 'success';
ALTER TABLE "admin_audit_log" ADD COLUMN IF NOT EXISTS "reason" text;

CREATE INDEX IF NOT EXISTS "admin_audit_log_admin_idx"
  ON "admin_audit_log" ("admin_id");

CREATE INDEX IF NOT EXISTS "admin_audit_log_event_idx"
  ON "admin_audit_log" ("event");

CREATE INDEX IF NOT EXISTS "admin_audit_log_created_idx"
  ON "admin_audit_log" ("created_at");
