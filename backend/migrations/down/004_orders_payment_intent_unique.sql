-- Rollback 004: Drop the PaymentIntent uniqueness index.
-- After this, the same PaymentIntent could theoretically be attached to multiple orders.

BEGIN;

DROP INDEX IF EXISTS uniq_orders_store_payment_intent;

COMMIT;
