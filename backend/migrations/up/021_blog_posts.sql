-- Migration 021: Blog posts for store owners.
-- Slugs are unique per store so owners can have their own URL structure without
-- conflicting with other stores. The composite index on (store_id, status, published_at DESC)
-- covers the storefront's "list published posts" query efficiently.
-- featured_product_id lets owners link a product from within a blog post.

CREATE TABLE blog_posts (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id            UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    slug                TEXT        NOT NULL,
    title               TEXT        NOT NULL,
    excerpt             TEXT,
    body                TEXT        NOT NULL,
    cover_image_url     TEXT,
    status              TEXT        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at        TIMESTAMPTZ,
    seo_title           TEXT,
    seo_description     TEXT,
    featured_product_id UUID        REFERENCES products(id) ON DELETE SET NULL,
    author_name         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (store_id, slug)
);

CREATE INDEX idx_blog_posts_store_status ON blog_posts(store_id, status, published_at DESC);
CREATE INDEX idx_blog_posts_store_slug   ON blog_posts(store_id, slug);
