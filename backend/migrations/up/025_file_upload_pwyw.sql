-- Migration 025: Add file upload columns and pay-what-you-want (PWYW) pricing to products.
-- delivery_file_key is the Supabase Storage object key — we store the key, not the URL,
-- because signed URLs are generated on demand and expire.
-- image_urls replaces the single image_url column (added in 010) with an array so
-- products can have a gallery. The backfill copies image_url into image_urls[0].
-- minimum_price_cents = 0 means "no minimum" for PWYW products.

ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_key         TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_size_bytes  BIGINT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS delivery_file_name        TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_urls                TEXT[] DEFAULT '{}';
ALTER TABLE products ADD COLUMN IF NOT EXISTS pricing_type              TEXT NOT NULL DEFAULT 'fixed'
  CHECK (pricing_type IN ('fixed', 'pay_what_you_want'));
ALTER TABLE products ADD COLUMN IF NOT EXISTS minimum_price_cents       INTEGER NOT NULL DEFAULT 0;

-- Backfill image_urls from the existing image_url column (single → array)
UPDATE products
   SET image_urls = ARRAY[image_url]
 WHERE image_url IS NOT NULL
   AND image_url <> ''
   AND (image_urls IS NULL OR image_urls = '{}');
