-- Reverse of 025: remove file upload and PWYW columns from products.
-- Note: image_urls data is lost — image_url (010) is still present if that migration wasn't rolled back.

ALTER TABLE products DROP COLUMN IF EXISTS delivery_file_key;
ALTER TABLE products DROP COLUMN IF EXISTS delivery_file_size_bytes;
ALTER TABLE products DROP COLUMN IF EXISTS delivery_file_name;
ALTER TABLE products DROP COLUMN IF EXISTS image_urls;
ALTER TABLE products DROP COLUMN IF EXISTS pricing_type;
ALTER TABLE products DROP COLUMN IF EXISTS minimum_price_cents;
