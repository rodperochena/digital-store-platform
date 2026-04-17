-- Migration 013: Add personality and social link fields to stores.
-- Owners want to describe their store and link out to their social profiles
-- from the storefront footer. These are all optional.

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS tagline          TEXT,
  ADD COLUMN IF NOT EXISTS description      TEXT,
  ADD COLUMN IF NOT EXISTS social_twitter   TEXT,
  ADD COLUMN IF NOT EXISTS social_instagram TEXT,
  ADD COLUMN IF NOT EXISTS social_youtube   TEXT,
  ADD COLUMN IF NOT EXISTS social_website   TEXT;

COMMIT;
