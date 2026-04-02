BEGIN;

ALTER TABLE owner_accounts
  DROP COLUMN IF EXISTS first_name,
  DROP COLUMN IF EXISTS last_name;

COMMIT;
