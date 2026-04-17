-- Revert 024: restore the original rating constraint (1-5 only).
-- WARNING: any rows with rating = 0 must be removed first, otherwise this will fail.

ALTER TABLE product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_rating_check;

ALTER TABLE product_reviews
  ADD CONSTRAINT product_reviews_rating_check
    CHECK (rating BETWEEN 1 AND 5);

DELETE FROM schema_migrations WHERE id = '024_fix_review_rating_constraint.sql';
