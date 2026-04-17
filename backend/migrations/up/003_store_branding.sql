-- Migration 003: Add branding fields to stores.
-- Stores need a currency so checkout amounts are denominated correctly,
-- and a primary_color + logo_url so the storefront can reflect the owner's brand.

BEGIN;

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS currency TEXT NOT NULL DEFAULT 'usd',
  ADD COLUMN IF NOT EXISTS primary_color TEXT,
  ADD COLUMN IF NOT EXISTS logo_url TEXT;

COMMIT;
