-- Migration 023: Custom domain support for stores.
-- Owners can point their own domain (e.g. shop.mybrand.com) to the platform via CNAME.
-- The partial unique index on (store_id) WHERE status IN ('pending', 'verified', 'active')
-- enforces that a store can only have one non-failed domain at a time, while allowing
-- them to retry after a failure by adding a new one.
-- verification_token is generated at domain creation and must appear in the CNAME target
-- or a DNS TXT record so we can verify ownership.

CREATE TABLE custom_domains (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    domain TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'failed', 'active')),
    dns_verified_at TIMESTAMPTZ,
    ssl_status TEXT DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'active', 'failed')),
    last_check_at TIMESTAMPTZ,
    last_check_error TEXT,
    verification_token TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custom_domains_store ON custom_domains(store_id);
CREATE INDEX idx_custom_domains_domain ON custom_domains(domain);
-- A store can only have one pending/verified/active domain at a time
CREATE UNIQUE INDEX idx_custom_domains_active_store ON custom_domains(store_id) WHERE status IN ('pending', 'verified', 'active');

INSERT INTO schema_migrations (id, applied_at) VALUES ('023_custom_domains.sql', NOW()) ON CONFLICT DO NOTHING;
