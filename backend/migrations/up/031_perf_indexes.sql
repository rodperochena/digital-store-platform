-- Migration 031: Performance indexes for high-traffic query paths.
-- Adds indexes on orders.store_id and order_fulfillments.download_token_hash.
-- Without these, owner order listings and every download-token validation
-- require a full table scan — unacceptable at any meaningful order volume.

CREATE INDEX IF NOT EXISTS idx_orders_store_id
  ON orders(store_id);

CREATE INDEX IF NOT EXISTS idx_fulfillments_delivery_token_hash
  ON order_fulfillments(delivery_token_hash);

INSERT INTO schema_migrations (id, applied_at)
  VALUES ('031_perf_indexes.sql', NOW())
  ON CONFLICT DO NOTHING;
