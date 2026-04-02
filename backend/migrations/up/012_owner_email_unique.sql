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
