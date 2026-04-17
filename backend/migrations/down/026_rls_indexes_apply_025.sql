-- Reverse of 026: intentional no-op.
-- RLS policies and indexes are not removed on rollback — disabling RLS on production
-- tables is too dangerous to automate. Remove them manually if needed.

SELECT 1;
