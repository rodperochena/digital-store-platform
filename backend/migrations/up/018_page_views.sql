-- Migration 018: Page view tracking for analytics.
-- Records each storefront and product page visit with optional visitor_id (localStorage),
-- country (from CDN headers), referrer, and referrer_source (categorized).
-- The composite index on (store_id, created_at DESC) is the hot path for time-series queries.
-- The partial index on (store_id, product_id) speeds up per-product view counts.

CREATE TABLE page_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    -- what was viewed
    page_type TEXT NOT NULL CHECK (page_type IN ('storefront', 'product')),
    -- visitor info
    visitor_id TEXT,
    ip_country TEXT,
    referrer TEXT,
    referrer_source TEXT,
    user_agent TEXT,
    -- timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_page_views_store_id ON page_views(store_id);
CREATE INDEX idx_page_views_store_created ON page_views(store_id, created_at DESC);
CREATE INDEX idx_page_views_store_product ON page_views(store_id, product_id) WHERE product_id IS NOT NULL;
