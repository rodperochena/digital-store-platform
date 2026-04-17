-- Rollback 029: Remove country column from buyer_accounts and store_customers.

ALTER TABLE buyer_accounts DROP COLUMN IF EXISTS country;
ALTER TABLE store_customers DROP COLUMN IF EXISTS country;
