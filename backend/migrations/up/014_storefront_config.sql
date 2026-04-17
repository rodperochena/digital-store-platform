-- Migration 014: Add storefront layout configuration to stores.
-- storefront_config is a freeform JSONB blob that the frontend reads to render
-- the hero section, featured product, announcement banner, etc. Using JSONB here
-- instead of individual columns so we can evolve the config shape without migrations.
-- secondary_color and font_family round out the branding options.

BEGIN;

ALTER TABLE stores ADD COLUMN IF NOT EXISTS storefront_config JSONB DEFAULT '{}';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS secondary_color TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'system';

COMMIT;
