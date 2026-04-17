-- Migration 024: Allow rating = 0 as a sentinel for "pending / not yet submitted" reviews.
-- The original CHECK (rating BETWEEN 1 AND 5) forbids the placeholder value that
-- the application inserts when creating a review invitation token. We widen the
-- constraint to allow 0, while keeping the public-facing queries filtered to
-- approved reviews with rating > 0.

ALTER TABLE product_reviews
  DROP CONSTRAINT IF EXISTS product_reviews_rating_check;

ALTER TABLE product_reviews
  ADD CONSTRAINT product_reviews_rating_check
    CHECK (rating BETWEEN 0 AND 5);

INSERT INTO schema_migrations (id, applied_at)
  VALUES ('024_fix_review_rating_constraint.sql', NOW())
  ON CONFLICT DO NOTHING;
