-- Migration 006: Revert the NOT NULL + DEFAULT added in 005.
-- We found that enforcing NOT NULL at this stage caused problems when inserting
-- stores without explicitly passing is_enabled. Dropping the constraint here
-- so application code controls the value explicitly rather than relying on a DB default.

BEGIN;

ALTER TABLE stores
  ALTER COLUMN is_enabled DROP NOT NULL;

ALTER TABLE stores
  ALTER COLUMN is_enabled DROP DEFAULT;

COMMIT;
