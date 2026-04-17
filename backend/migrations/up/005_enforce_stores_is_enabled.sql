-- Migration 005: Enforce is_enabled as a required, non-null field on stores.
-- Early stores had NULL in this column. We backfill to FALSE (disabled) first,
-- then enforce NOT NULL + DEFAULT FALSE so future inserts can't leave it unset.
-- Note: this was partially reverted in 006 — see that migration for context.

BEGIN;

-- Ensure column exists (safe no-op if it already exists)
ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS is_enabled BOOLEAN;

-- Backfill existing rows (NULL => false)
UPDATE stores
SET is_enabled = FALSE
WHERE is_enabled IS NULL;

-- Enforce defaults for new rows
ALTER TABLE stores
  ALTER COLUMN is_enabled SET DEFAULT FALSE;

-- Enforce non-null going forward
ALTER TABLE stores
  ALTER COLUMN is_enabled SET NOT NULL;

COMMIT;
