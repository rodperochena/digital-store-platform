-- Migration 011: Add first_name and last_name to owner_accounts.
-- Needed for personalizing seller notification emails and the dashboard header.

BEGIN;

ALTER TABLE owner_accounts
  ADD COLUMN IF NOT EXISTS first_name TEXT,
  ADD COLUMN IF NOT EXISTS last_name  TEXT;

COMMIT;
