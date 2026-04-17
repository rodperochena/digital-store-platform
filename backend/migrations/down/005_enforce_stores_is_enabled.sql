-- Rollback 005: Re-apply NOT NULL + DEFAULT FALSE on is_enabled.
-- This restores the state 005 put in place (the 006 down is the opposite).

BEGIN;

UPDATE stores SET is_enabled = FALSE WHERE is_enabled IS NULL;
ALTER TABLE stores ALTER COLUMN is_enabled SET DEFAULT FALSE;
ALTER TABLE stores ALTER COLUMN is_enabled SET NOT NULL;

COMMIT;
