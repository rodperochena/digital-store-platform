-- Migration 020: Product reviews, store sales (sitewide discounts), and subscriber list.
--
-- product_reviews: buyers submit via a unique review_token sent in their delivery email.
--   rating = 0 is a sentinel for "invitation sent but not yet submitted" (widened in 024).
--   average_rating and review_count on products are kept in sync by a trigger so dashboard
--   queries don't need a subquery to compute them.
--
-- store_sales: time-limited percentage or fixed-amount discounts applied automatically
--   at checkout. apply_to = 'all' hits every product; 'selected' uses the product_ids array.
--
-- store_subscribers: email list built from checkout opt-ins and direct signups.
--   UNIQUE (store_id, email) prevents duplicate entries; unsubscribe_token is a
--   per-row secret used in unsubscribe links so no auth is needed to opt out.

-- ── Product Reviews ───────────────────────────────────────────────────────────
CREATE TABLE product_reviews (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id        UUID        NOT NULL REFERENCES stores(id)   ON DELETE CASCADE,
    product_id      UUID        NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    order_id        UUID        REFERENCES orders(id)            ON DELETE SET NULL,
    buyer_email     TEXT        NOT NULL,
    rating          INT         NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body            TEXT,
    review_token    TEXT        UNIQUE NOT NULL,
    is_approved     BOOLEAN     NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reviews_product ON product_reviews(product_id, is_approved, created_at DESC);
CREATE INDEX idx_reviews_store   ON product_reviews(store_id, created_at DESC);
CREATE INDEX idx_reviews_token   ON product_reviews(review_token);

-- Denormalized stats on products (updated via trigger)
ALTER TABLE products
    ADD COLUMN IF NOT EXISTS average_rating NUMERIC(3,2),
    ADD COLUMN IF NOT EXISTS review_count   INT NOT NULL DEFAULT 0;

-- Auto-update average_rating and review_count after each approved review insert/update/delete
CREATE OR REPLACE FUNCTION refresh_product_review_stats()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE products
    SET
        review_count   = agg.cnt,
        average_rating = agg.avg_rating
    FROM (
        SELECT
            COUNT(*)::INT          AS cnt,
            ROUND(AVG(rating), 2)  AS avg_rating
        FROM product_reviews
        WHERE product_id = COALESCE(NEW.product_id, OLD.product_id)
          AND is_approved = true
    ) agg
    WHERE id = COALESCE(NEW.product_id, OLD.product_id);
    RETURN NULL;
END;
$$;

CREATE TRIGGER trg_review_stats
AFTER INSERT OR UPDATE OR DELETE ON product_reviews
FOR EACH ROW EXECUTE FUNCTION refresh_product_review_stats();

-- ── Store Sales (time-limited discounts on all or selected products) ───────────
CREATE TABLE store_sales (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id       UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    name           TEXT        NOT NULL,
    discount_type  TEXT        NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
    discount_value NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
    starts_at      TIMESTAMPTZ,
    ends_at        TIMESTAMPTZ,
    apply_to       TEXT        NOT NULL DEFAULT 'all' CHECK (apply_to IN ('all', 'selected')),
    product_ids    UUID[]      NOT NULL DEFAULT '{}',
    is_active      BOOLEAN     NOT NULL DEFAULT true,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sales_store_active ON store_sales(store_id, is_active, ends_at);

-- ── Store Subscribers ─────────────────────────────────────────────────────────
CREATE TABLE store_subscribers (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id          UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    email             TEXT        NOT NULL,
    first_name        TEXT,
    unsubscribe_token TEXT        UNIQUE NOT NULL,
    subscribed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_active         BOOLEAN     NOT NULL DEFAULT true,
    UNIQUE (store_id, email)
);

CREATE INDEX idx_subscribers_store   ON store_subscribers(store_id, is_active);
CREATE INDEX idx_subscribers_token   ON store_subscribers(unsubscribe_token);
