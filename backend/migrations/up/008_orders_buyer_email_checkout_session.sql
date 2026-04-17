-- Migration 008: Capture buyer email and Stripe Checkout Session ID on orders.
-- buyer_email lets us send delivery emails without requiring a buyer account.
-- stripe_checkout_session_id is how we tie the Stripe webhook event back to
-- our local order — the unique index prevents the same session from being processed twice.

BEGIN;

-- Store buyer email for order visibility and future delivery emails.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS buyer_email TEXT;

-- Persist Stripe Checkout Session ID for webhook reconciliation.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id TEXT;

-- Ensure each checkout session maps to at most one order.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_orders_checkout_session_id
ON orders (stripe_checkout_session_id)
WHERE stripe_checkout_session_id IS NOT NULL;

COMMIT;
