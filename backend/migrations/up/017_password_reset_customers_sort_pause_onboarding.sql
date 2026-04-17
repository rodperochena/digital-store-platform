-- Migration 017: Password reset tokens, store customers, product sort order, store pause + onboarding.
-- Several features landed together here:
-- - password_reset_tokens: short-lived tokens for the "forgot password" flow (hashed, same pattern as sessions)
-- - store_customers: denormalized buyer table updated on each purchase via ON CONFLICT — avoids
--   having to query all orders to answer "how much has this buyer spent total"
-- - sort_order on products: lets owners drag-and-drop their product list
-- - is_paused + pause_message: owners can temporarily hide their store without deleting it
-- - onboarding_completed_at: tracks whether the owner has finished initial setup

-- Password reset tokens
CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id        UUID NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  token_hash      TEXT NOT NULL UNIQUE,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_token_hash ON password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_owner_id   ON password_reset_tokens(owner_id);

-- Store customers (buyers who completed checkout)
CREATE TABLE IF NOT EXISTS store_customers (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id        UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email           TEXT NOT NULL,
  display_name    TEXT,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_count     INTEGER NOT NULL DEFAULT 1,
  total_spent_cents BIGINT NOT NULL DEFAULT 0,
  UNIQUE (store_id, email)
);
CREATE INDEX IF NOT EXISTS idx_store_customers_store_id ON store_customers(store_id);
CREATE INDEX IF NOT EXISTS idx_store_customers_email    ON store_customers(email);

-- Products sort order
ALTER TABLE products ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

-- Store pause mode
ALTER TABLE stores ADD COLUMN IF NOT EXISTS is_paused       BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pause_message   TEXT;

-- Store onboarding
ALTER TABLE stores ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;
