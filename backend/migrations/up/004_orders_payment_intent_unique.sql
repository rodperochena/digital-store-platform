-- Migration 004: Enforce uniqueness of Stripe PaymentIntent IDs per store.
-- Without this, a race condition in the webhook handler could attach the same
-- PaymentIntent to two different orders. The partial index (WHERE NOT NULL)
-- means orders without a PaymentIntent yet are unaffected.

BEGIN;

-- Enforce uniqueness of Stripe PaymentIntent per store (when present).
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_store_payment_intent
ON orders (store_id, stripe_payment_intent_id)
WHERE stripe_payment_intent_id IS NOT NULL;

COMMIT;
