-- Rollback 018: Drop page_views table and all its indexes.
-- CASCADE drops the indexes automatically.

DROP TABLE IF EXISTS page_views CASCADE;
