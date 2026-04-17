-- Migration 029: Add country to buyer_accounts and store_customers.
-- Stored as a 2-char ISO 3166-1 alpha-2 code (e.g. "US", "DE").
-- Captured from CDN/proxy headers at registration or checkout time.
-- Used in the analytics geography breakdown.
-- Using DO $$ IF NOT EXISTS $$ because this column was sometimes added manually in dev.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'buyer_accounts' AND column_name = 'country'
  ) THEN
    ALTER TABLE buyer_accounts ADD COLUMN country char(2);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'store_customers' AND column_name = 'country'
  ) THEN
    ALTER TABLE store_customers ADD COLUMN country char(2);
  END IF;
END $$;

INSERT INTO schema_migrations (id, applied_at) VALUES ('029_customer_country.sql', NOW()) ON CONFLICT DO NOTHING;
