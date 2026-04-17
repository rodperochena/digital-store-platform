-- Rollback 015: Remove discount code support.
-- Orders referencing discount codes must be cleared first (or FK nulled out)
-- before dropping the table.

BEGIN;

ALTER TABLE orders
  DROP COLUMN IF EXISTS discount_amount_cents,
  DROP COLUMN IF EXISTS discount_code_id;

ALTER TABLE products
  DROP COLUMN IF EXISTS sales_count;

DROP TABLE IF EXISTS discount_codes;

COMMIT;
