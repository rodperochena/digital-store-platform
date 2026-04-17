-- Rollback 013: Remove personality and social link columns from stores.

BEGIN;

ALTER TABLE stores
  DROP COLUMN IF EXISTS tagline,
  DROP COLUMN IF EXISTS description,
  DROP COLUMN IF EXISTS social_twitter,
  DROP COLUMN IF EXISTS social_instagram,
  DROP COLUMN IF EXISTS social_youtube,
  DROP COLUMN IF EXISTS social_website;

COMMIT;
