-- Migration 015: Discount codes, order discount tracking, and product sales counts.
-- discount_codes supports both percentage and fixed-amount discounts with optional
-- expiry, usage limits, and minimum order amounts.
-- The composite UNIQUE (store_id, code) means the same code string can be reused
-- across different stores — codes are always validated in the context of a store.
-- sales_count on products is denormalized for fast "best sellers" queries.

BEGIN;

CREATE TABLE IF NOT EXISTS discount_codes (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  code              TEXT NOT NULL,
  description       TEXT,
  discount_type     TEXT NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value    NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  max_uses          INTEGER,
  use_count         INTEGER NOT NULL DEFAULT 0,
  min_order_cents   INTEGER NOT NULL DEFAULT 0,
  expires_at        TIMESTAMPTZ,
  active            BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, code)
);

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS discount_code_id UUID REFERENCES discount_codes(id),
  ADD COLUMN IF NOT EXISTS discount_amount_cents INTEGER NOT NULL DEFAULT 0;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS sales_count INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_discount_codes_store_id ON discount_codes(store_id);
CREATE INDEX IF NOT EXISTS idx_discount_codes_store_code ON discount_codes(store_id, code);
CREATE INDEX IF NOT EXISTS idx_orders_discount_code_id ON orders(discount_code_id);

COMMIT;
