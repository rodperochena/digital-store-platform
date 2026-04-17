-- Rollback 028: Remove buyer account system.
-- FK columns on store_customers and orders must be dropped before the referenced tables.

ALTER TABLE orders         DROP COLUMN IF EXISTS marketing_opt_in;
ALTER TABLE store_customers DROP COLUMN IF EXISTS marketing_opt_in;
ALTER TABLE store_customers DROP COLUMN IF EXISTS buyer_account_id;

DROP TABLE IF EXISTS buyer_password_reset_tokens;
DROP TABLE IF EXISTS buyer_sessions;
DROP TABLE IF EXISTS buyer_accounts;
