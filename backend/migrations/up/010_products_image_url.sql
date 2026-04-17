-- Migration 010: Add a single image_url column to products.
-- Simple placeholder for product cover images at this stage.
-- Migration 025 later replaces this with image_urls (TEXT[]) to support
-- multiple images per product. The backfill in 025 copies this value over.

BEGIN;
ALTER TABLE products ADD COLUMN IF NOT EXISTS image_url TEXT;
COMMIT;
