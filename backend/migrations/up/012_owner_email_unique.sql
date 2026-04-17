-- Migration 012: Enforce case-insensitive uniqueness on owner emails.
-- Before this, two accounts could exist with "Owner@example.com" and "owner@example.com".
-- The UPDATE first nulls out duplicates (keeping the most recently updated one per email)
-- so the index creation doesn't fail on existing dev test data.
-- The partial index (WHERE email IS NOT NULL) allows multiple unclaimed accounts
-- that haven't set an email yet.

BEGIN;

-- Null out duplicate emails on older rows, keeping the most-recently-updated account
-- per email. This cleans up dev test data before enforcing uniqueness.
UPDATE owner_accounts
SET email = NULL
WHERE id NOT IN (
  SELECT DISTINCT ON (LOWER(email)) id
  FROM owner_accounts
  WHERE email IS NOT NULL
  ORDER BY LOWER(email), updated_at DESC NULLS LAST
)
AND email IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS owner_accounts_email_unique
  ON owner_accounts (LOWER(email))
  WHERE email IS NOT NULL;

COMMIT;
