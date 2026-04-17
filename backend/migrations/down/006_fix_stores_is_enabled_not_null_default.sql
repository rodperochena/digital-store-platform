-- Rollback 006: Revert is_enabled to nullable with no default.
-- This is the same outcome as what 006 up does, so rolling back 006 returns
-- to the same nullable state. See the up migration for the reasoning.

BEGIN;

ALTER TABLE stores
  ALTER COLUMN is_enabled DROP NOT NULL;

ALTER TABLE stores
  ALTER COLUMN is_enabled DROP DEFAULT;

COMMIT;
