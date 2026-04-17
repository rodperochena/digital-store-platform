-- Rollback 030: Remove buyer_country from orders.

ALTER TABLE orders DROP COLUMN IF EXISTS buyer_country;
