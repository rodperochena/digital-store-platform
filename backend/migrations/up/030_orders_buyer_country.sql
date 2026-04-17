-- Migration 030: Add buyer_country to orders.
-- Captures the buyer's country at checkout time (from CDN/proxy headers),
-- independent of whether they have a buyer_account. This lets us show
-- purchase geography on the analytics page even for guest checkouts.
-- Same char(2) ISO code as 029. Using DO $$ IF NOT EXISTS $$ for safety.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'orders' AND column_name = 'buyer_country') THEN
    ALTER TABLE orders ADD COLUMN buyer_country char(2);
  END IF;
END $$;

INSERT INTO schema_migrations (id, applied_at) VALUES ('030_orders_buyer_country.sql', NOW()) ON CONFLICT DO NOTHING;
