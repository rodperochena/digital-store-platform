-- Rollback 020: Drop reviews, sales, and subscribers.
-- The trigger must be dropped before the function, and both before the table.
-- average_rating and review_count columns are removed from products too.

DROP TRIGGER IF EXISTS trg_review_stats ON product_reviews;
DROP FUNCTION IF EXISTS refresh_product_review_stats();
ALTER TABLE products DROP COLUMN IF EXISTS average_rating;
ALTER TABLE products DROP COLUMN IF EXISTS review_count;
DROP TABLE IF EXISTS product_reviews;
DROP TABLE IF EXISTS store_sales;
DROP TABLE IF EXISTS store_subscribers;
