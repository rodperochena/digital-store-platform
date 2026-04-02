BEGIN;

CREATE TABLE IF NOT EXISTS order_fulfillments (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id             UUID        NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  store_id             UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  delivery_token_hash  TEXT        NOT NULL UNIQUE,
  delivery_expires_at  TIMESTAMPTZ NOT NULL,
  sent_to_email        TEXT        NOT NULL,
  sent_at              TIMESTAMPTZ,
  opened_at            TIMESTAMPTZ,
  status               TEXT        NOT NULL DEFAULT 'pending'
                                   CHECK (status IN ('pending', 'sent', 'opened', 'failed')),
  error                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMIT;
