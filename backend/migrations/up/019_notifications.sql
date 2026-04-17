-- Migration 019: In-dashboard notification bell for store owners.
-- Notifications are created server-side when events happen (new sale, delivery sent, etc.)
-- and polled by the frontend. The composite index on (store_id, is_read, created_at DESC)
-- covers the most common query: "unread notifications for this store, newest first".
-- metadata is JSONB so each notification type can carry type-specific payload (order_id, etc.)

CREATE TABLE owner_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('sale', 'delivery_sent', 'delivery_opened', 'delivery_failed', 'delivery_expired', 'product_milestone', 'system')),
    title TEXT NOT NULL,
    body TEXT,
    metadata JSONB DEFAULT '{}',
    is_read BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_store_unread ON owner_notifications(store_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_store_created ON owner_notifications(store_id, created_at DESC);
