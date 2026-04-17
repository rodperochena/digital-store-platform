-- Rollback 016: Remove product classification columns and taxonomy tables.
-- Tables are dropped in reverse dependency order (tags and categories before types).

BEGIN;

ALTER TABLE products DROP COLUMN IF EXISTS file_size_display;
ALTER TABLE products DROP COLUMN IF EXISTS video_url;
ALTER TABLE products DROP COLUMN IF EXISTS visibility;
ALTER TABLE products DROP COLUMN IF EXISTS product_tags;
ALTER TABLE products DROP COLUMN IF EXISTS product_category;
ALTER TABLE products DROP COLUMN IF EXISTS product_type;

DROP TABLE IF EXISTS taxonomy_tags;
DROP TABLE IF EXISTS taxonomy_categories;
DROP TABLE IF EXISTS taxonomy_types;

COMMIT;
