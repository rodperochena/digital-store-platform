-- Rollback 001: Drop the migration tracking table.
-- Warning: running this will make the runner think no migrations have been applied.

BEGIN;

DROP TABLE IF EXISTS schema_migrations;

COMMIT;
