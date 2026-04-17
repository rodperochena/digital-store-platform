-- Migration 001: Bootstrap the migration tracking table.
-- This has to exist before any other migration can record itself, so it's the
-- only one the runner applies unconditionally without checking schema_migrations first.

BEGIN;

CREATE TABLE IF NOT EXISTS schema_migrations (
  id TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
