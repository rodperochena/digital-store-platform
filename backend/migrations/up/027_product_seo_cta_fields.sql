-- Migration 027: SEO metadata, URL slug, and CTA customization fields for products.
-- short_description is a one-liner shown on storefront cards (separate from the full description).
-- seo_title and seo_description populate <title> and <meta description> on product pages.
-- slug allows owners to set a custom URL path; falls back to auto-generated if null.
-- cta_text is the buy button label (e.g. "Get the template", "Download now").
-- All columns are optional — the frontend falls back to sensible defaults when null.
-- Using DO $$ IF NOT EXISTS $$ so this is safe to run after 026 (which may have already added some).

DO $$
BEGIN
  -- Short description / tagline for storefront cards
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'short_description') THEN
    ALTER TABLE public.products ADD COLUMN short_description TEXT;
  END IF;

  -- SEO title (defaults to product title if empty)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_title') THEN
    ALTER TABLE public.products ADD COLUMN seo_title TEXT;
  END IF;

  -- SEO description (defaults to short_description or first 160 chars of description)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'seo_description') THEN
    ALTER TABLE public.products ADD COLUMN seo_description TEXT;
  END IF;

  -- Custom URL slug (defaults to auto-generated from title)
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'slug') THEN
    ALTER TABLE public.products ADD COLUMN slug TEXT;
  END IF;

  -- Custom CTA button text (defaults to "Buy Now" or "Name Your Price")
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'products' AND column_name = 'cta_text') THEN
    ALTER TABLE public.products ADD COLUMN cta_text TEXT;
  END IF;
END $$;

-- Record migration
INSERT INTO public.schema_migrations (id, applied_at)
VALUES ('027_product_seo_cta_fields', NOW())
ON CONFLICT (id) DO NOTHING;
