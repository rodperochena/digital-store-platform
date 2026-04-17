-- Rollback 009: Drop the order fulfillment tracking table.
-- This deletes all delivery token and send status history.

BEGIN;

DROP TABLE IF EXISTS order_fulfillments;

COMMIT;
