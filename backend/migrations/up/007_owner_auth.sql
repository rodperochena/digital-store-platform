-- Migration 007: Per-store owner authentication (accounts + server-side sessions).
-- One owner_account per store — the owner claims it using a bootstrap token,
-- sets a password, and from then on authenticates with email + password.
-- Sessions are stored server-side: only the SHA-256 hash of the token is saved,
-- never the raw token. This lets us invalidate sessions instantly by deleting the row.

BEGIN;

-- Per-store owner credential (one per store)
CREATE TABLE IF NOT EXISTS owner_accounts (
  id                         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id                   UUID        NOT NULL UNIQUE REFERENCES stores(id) ON DELETE CASCADE,
  email                      TEXT,
  password_hash              TEXT,
  is_claimed                 BOOLEAN     NOT NULL DEFAULT FALSE,
  bootstrap_token_hash       TEXT,
  bootstrap_token_expires_at TIMESTAMPTZ,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_owner_accounts_store_id ON owner_accounts(store_id);

-- Server-side owner sessions (raw token never stored)
CREATE TABLE IF NOT EXISTS owner_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_account_id UUID        NOT NULL REFERENCES owner_accounts(id) ON DELETE CASCADE,
  store_id         UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  token_hash       TEXT        NOT NULL UNIQUE,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_owner_sessions_token_hash ON owner_sessions(token_hash);
CREATE INDEX IF NOT EXISTS idx_owner_sessions_store_id   ON owner_sessions(store_id);

COMMIT;
