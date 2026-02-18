BEGIN;

-- Enforce uniqueness of Stripe PaymentIntent per store (when present).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_store_payment_intent
ON orders (store_id, stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
