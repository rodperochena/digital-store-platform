-- Rollback 007: Drop owner sessions and accounts.
-- sessions must be dropped first because it references owner_accounts.

BEGIN;
DROP TABLE IF EXISTS owner_sessions;
DROP TABLE IF EXISTS owner_accounts;
COMMIT;
