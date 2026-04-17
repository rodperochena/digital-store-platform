-- Rollback 008: Remove buyer email and Stripe Checkout Session fields from orders.

BEGIN;

DROP INDEX IF EXISTS uniq_orders_checkout_session_id;
ALTER TABLE orders DROP COLUMN IF EXISTS stripe_checkout_session_id;
ALTER TABLE orders DROP COLUMN IF EXISTS buyer_email;

COMMIT;
