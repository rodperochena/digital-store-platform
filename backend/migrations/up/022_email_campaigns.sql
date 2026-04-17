-- Migration 022: Broadcast email campaigns to store subscriber lists.
-- email_campaigns holds the campaign definition and aggregate stats (sent_count, open_count, etc.)
-- email_campaign_recipients is the per-subscriber send log — one row per subscriber per campaign.
-- tracking_token is a unique per-recipient token embedded in the email open pixel URL,
-- which lets us attribute opens back to the right recipient without exposing their email.

CREATE TABLE email_campaigns (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id         UUID        NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    subject          TEXT        NOT NULL,
    preview_text     TEXT,
    body_html        TEXT        NOT NULL,
    body_text        TEXT,
    status           TEXT        NOT NULL DEFAULT 'draft'
                                 CHECK (status IN ('draft', 'sending', 'sent', 'failed')),
    recipient_count  INTEGER     NOT NULL DEFAULT 0,
    sent_count       INTEGER     NOT NULL DEFAULT 0,
    open_count       INTEGER     NOT NULL DEFAULT 0,
    click_count      INTEGER     NOT NULL DEFAULT 0,
    failed_count     INTEGER     NOT NULL DEFAULT 0,
    sent_at          TIMESTAMPTZ,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_email_campaigns_store ON email_campaigns(store_id, created_at DESC);

CREATE TABLE email_campaign_recipients (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id   UUID        NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
    subscriber_id UUID        NOT NULL REFERENCES store_subscribers(id) ON DELETE CASCADE,
    email         TEXT        NOT NULL,
    status        TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'bounced')),
    opened_at     TIMESTAMPTZ,
    clicked_at    TIMESTAMPTZ,
    sent_at       TIMESTAMPTZ,
    error         TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_campaign_recipients_campaign ON email_campaign_recipients(campaign_id, status);
CREATE INDEX idx_campaign_recipients_email    ON email_campaign_recipients(email);

ALTER TABLE email_campaign_recipients ADD COLUMN tracking_token TEXT UNIQUE;
