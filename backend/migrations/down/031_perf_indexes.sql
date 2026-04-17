-- Rollback migration 031: Drop performance indexes.

DROP INDEX IF EXISTS idx_orders_store_id;
DROP INDEX IF EXISTS idx_fulfillments_delivery_token_hash;

DELETE FROM schema_migrations WHERE id = '031_perf_indexes.sql';
