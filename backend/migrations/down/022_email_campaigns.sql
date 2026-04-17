-- Rollback 022: Drop email campaigns and recipient log.
-- Recipients must be dropped before campaigns due to the FK.

DROP TABLE IF EXISTS email_campaign_recipients;
DROP TABLE IF EXISTS email_campaigns;
