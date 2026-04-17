-- Migration 028: Buyer account system (accounts, sessions, password reset tokens).
-- Buyer accounts are scoped per-store — the same email can have separate accounts
-- on different stores, with independent passwords and order histories.
-- This mirrors the owner auth pattern from 007: sessions store only a token hash,
-- never the raw token. buyer_account_id on store_customers lets us link a customer
-- record to an account once they register.

-- ── buyer_accounts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyer_accounts (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id         UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  email            TEXT        NOT NULL,
  password_hash    TEXT,
  display_name     TEXT,
  marketing_opt_in BOOLEAN     NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (store_id, email)
);

CREATE INDEX IF NOT EXISTS buyer_accounts_store_id_idx ON buyer_accounts(store_id);
CREATE INDEX IF NOT EXISTS buyer_accounts_email_idx    ON buyer_accounts(LOWER(email));

-- ── buyer_sessions ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyer_sessions (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_account_id  UUID        NOT NULL REFERENCES buyer_accounts(id) ON DELETE CASCADE,
  store_id          UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token_hash        TEXT        NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL,
  last_seen_at      TIMESTAMPTZ,
  revoked_at        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS buyer_sessions_token_hash_idx ON buyer_sessions(token_hash);
CREATE INDEX IF NOT EXISTS buyer_sessions_account_idx    ON buyer_sessions(buyer_account_id);

-- ── buyer_password_reset_tokens ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS buyer_password_reset_tokens (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  buyer_account_id UUID        NOT NULL REFERENCES buyer_accounts(id) ON DELETE CASCADE,
  token_hash       TEXT        NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  used_at          TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS buyer_prt_token_hash_idx ON buyer_password_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS buyer_prt_account_idx    ON buyer_password_reset_tokens(buyer_account_id);

-- ── Extend store_customers ────────────────────────────────────────────────────
ALTER TABLE store_customers
  ADD COLUMN IF NOT EXISTS buyer_account_id UUID REFERENCES buyer_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;

-- ── Extend orders ─────────────────────────────────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN NOT NULL DEFAULT FALSE;
