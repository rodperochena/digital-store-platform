-- Rollback 017: Drop password reset tokens and store customers; remove sort/pause/onboarding columns.

DROP TABLE IF EXISTS password_reset_tokens;
DROP TABLE IF EXISTS store_customers;
ALTER TABLE products DROP COLUMN IF EXISTS sort_order;
ALTER TABLE stores DROP COLUMN IF EXISTS is_paused;
ALTER TABLE stores DROP COLUMN IF EXISTS pause_message;
ALTER TABLE stores DROP COLUMN IF EXISTS onboarding_completed_at;
