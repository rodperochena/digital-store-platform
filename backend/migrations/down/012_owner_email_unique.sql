-- Rollback 012: Drop the case-insensitive email uniqueness index.
-- After this, duplicate emails (different case) can exist in owner_accounts.

BEGIN;

DROP INDEX IF EXISTS owner_accounts_email_unique;

COMMIT;
