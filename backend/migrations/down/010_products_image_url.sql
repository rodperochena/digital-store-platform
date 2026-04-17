-- Rollback 010: Remove the single image_url column from products.

BEGIN;
ALTER TABLE products DROP COLUMN IF EXISTS image_url;
COMMIT;
