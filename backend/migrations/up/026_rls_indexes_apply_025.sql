-- Migration 026: Enable Row Level Security + add missing FK indexes.
-- This migration does three things:
--
-- Part A: Re-applies the 025 columns idempotently using DO $$ IF NOT EXISTS $$
--   so this is safe to run even if 025 already ran.
--
-- Part B: Enables RLS on every public table and creates a service_role_full_access
--   policy on each. Our backend connects as the postgres/service_role user so it
--   bypasses RLS anyway — but enabling it means the Supabase anon role (used by
--   the PostgREST API) can't read sensitive data directly. Taxonomy tables also
--   get an anon SELECT policy because the public storefront fetches them without auth.
--
-- Part C: Adds indexes on foreign key columns that Postgres doesn't index automatically.
--   Without these, ON DELETE CASCADE and JOIN queries on those columns do full scans.
--
-- Part D: Records both 025 and 026 in schema_migrations (025 didn't self-record).

-- ============================================================
-- PART A: Apply file upload + PWYW columns (idempotent)
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'delivery_file_key') THEN
    ALTER TABLE public.products ADD COLUMN delivery_file_key TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'delivery_file_size_bytes') THEN
    ALTER TABLE public.products ADD COLUMN delivery_file_size_bytes BIGINT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'delivery_file_name') THEN
    ALTER TABLE public.products ADD COLUMN delivery_file_name TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'image_urls') THEN
    ALTER TABLE public.products ADD COLUMN image_urls TEXT[] DEFAULT '{}';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'pricing_type') THEN
    ALTER TABLE public.products ADD COLUMN pricing_type TEXT NOT NULL DEFAULT 'fixed'
      CHECK (pricing_type IN ('fixed', 'pay_what_you_want'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'minimum_price_cents') THEN
    ALTER TABLE public.products ADD COLUMN minimum_price_cents INTEGER NOT NULL DEFAULT 0;
  END IF;
END $$;

-- Backfill: copy image_url → image_urls[0] for existing products
UPDATE public.products
SET image_urls = ARRAY[image_url]
WHERE image_url IS NOT NULL
  AND image_url <> ''
  AND (image_urls IS NULL OR image_urls = '{}');

-- ============================================================
-- PART B: Enable Row Level Security on all public tables
--
-- Strategy: enable RLS, then grant full access to the roles
-- our backend actually uses (postgres + service_role).
-- The anon role (Supabase PostgREST default) gets no policy
-- on sensitive tables, blocking unauthenticated API access.
-- Taxonomy tables get an additional anon SELECT policy because
-- the public storefront fetches them without auth.
-- ============================================================

ALTER TABLE public.stores                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_fulfillments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_accounts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_sessions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.owner_notifications       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.discount_codes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_customers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_subscribers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_sales               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.page_views                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.password_reset_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blog_posts                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_domains            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_types            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.taxonomy_tags             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations         ENABLE ROW LEVEL SECURITY;

-- Service-role full-access policies (idempotent via drop+create)
DO $$
DECLARE
  t TEXT;
  tables TEXT[] := ARRAY[
    'stores', 'products', 'orders', 'order_items', 'order_fulfillments',
    'users', 'owner_accounts', 'owner_sessions', 'owner_notifications',
    'discount_codes', 'store_customers', 'store_subscribers', 'store_sales',
    'page_views', 'password_reset_tokens', 'product_reviews', 'blog_posts',
    'email_campaigns', 'email_campaign_recipients', 'custom_domains',
    'taxonomy_types', 'taxonomy_categories', 'taxonomy_tags', 'schema_migrations'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('DROP POLICY IF EXISTS service_role_full_access ON public.%I', t);
    EXECUTE format(
      'CREATE POLICY service_role_full_access ON public.%I FOR ALL TO postgres, service_role USING (true) WITH CHECK (true)',
      t
    );
  END LOOP;

  -- Taxonomy tables: also allow anon SELECT (public storefront reads these)
  DROP POLICY IF EXISTS anon_read ON public.taxonomy_types;
  CREATE POLICY anon_read ON public.taxonomy_types FOR SELECT TO anon USING (true);

  DROP POLICY IF EXISTS anon_read ON public.taxonomy_categories;
  CREATE POLICY anon_read ON public.taxonomy_categories FOR SELECT TO anon USING (true);

  DROP POLICY IF EXISTS anon_read ON public.taxonomy_tags;
  CREATE POLICY anon_read ON public.taxonomy_tags FOR SELECT TO anon USING (true);
END $$;

-- ============================================================
-- PART C: Indexes on unindexed foreign keys
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_blog_posts_store_id
  ON public.blog_posts(store_id);
CREATE INDEX IF NOT EXISTS idx_blog_posts_featured_product_id
  ON public.blog_posts(featured_product_id);

CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_campaign_id
  ON public.email_campaign_recipients(campaign_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_recipients_subscriber_id
  ON public.email_campaign_recipients(subscriber_id);

CREATE INDEX IF NOT EXISTS idx_email_campaigns_store_id
  ON public.email_campaigns(store_id);

CREATE INDEX IF NOT EXISTS idx_order_fulfillments_store_id
  ON public.order_fulfillments(store_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items(product_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer_user_id
  ON public.orders(customer_user_id);
CREATE INDEX IF NOT EXISTS idx_orders_discount_code_id
  ON public.orders(discount_code_id);

CREATE INDEX IF NOT EXISTS idx_owner_notifications_store_id
  ON public.owner_notifications(store_id);

CREATE INDEX IF NOT EXISTS idx_owner_sessions_owner_account_id
  ON public.owner_sessions(owner_account_id);

CREATE INDEX IF NOT EXISTS idx_page_views_product_id
  ON public.page_views(product_id);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product_id
  ON public.product_reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_product_reviews_order_id
  ON public.product_reviews(order_id);

CREATE INDEX IF NOT EXISTS idx_custom_domains_store_id
  ON public.custom_domains(store_id);

CREATE INDEX IF NOT EXISTS idx_store_sales_store_id
  ON public.store_sales(store_id);

CREATE INDEX IF NOT EXISTS idx_store_subscribers_store_id
  ON public.store_subscribers(store_id);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_owner_id
  ON public.password_reset_tokens(owner_id);

-- ============================================================
-- PART D: Record in schema_migrations
-- ============================================================

INSERT INTO public.schema_migrations (id, applied_at)
VALUES ('025_file_upload_pwyw', NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schema_migrations (id, applied_at)
VALUES ('026_rls_indexes', NOW())
ON CONFLICT (id) DO NOTHING;
