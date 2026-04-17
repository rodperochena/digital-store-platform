-- Rollback 014: Remove storefront layout and branding columns from stores.

BEGIN;

ALTER TABLE stores DROP COLUMN IF EXISTS storefront_config;
ALTER TABLE stores DROP COLUMN IF EXISTS secondary_color;
ALTER TABLE stores DROP COLUMN IF EXISTS font_family;

COMMIT;
