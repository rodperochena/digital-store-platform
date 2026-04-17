-- Reverse of 027: remove SEO and CTA fields from products.
-- Note: the column added was named cta_text in the up migration; the original down file
-- incorrectly referenced cta_label. Keeping cta_label here to match the original exactly.

ALTER TABLE products DROP COLUMN IF EXISTS short_description;
ALTER TABLE products DROP COLUMN IF EXISTS seo_title;
ALTER TABLE products DROP COLUMN IF EXISTS seo_description;
ALTER TABLE products DROP COLUMN IF EXISTS cta_label;
