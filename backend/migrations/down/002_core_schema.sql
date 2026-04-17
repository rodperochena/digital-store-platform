-- Rollback 002: Drop all core tables.
-- Order matters — child tables must be dropped before their parents.
-- This is a full data wipe. Do not run in production without a backup.

BEGIN;

DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS stores;

COMMIT;
