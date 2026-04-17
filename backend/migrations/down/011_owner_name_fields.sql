-- Rollback 011: Remove first_name and last_name from owner_accounts.

BEGIN;

ALTER TABLE owner_accounts
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name;

COMMIT;
