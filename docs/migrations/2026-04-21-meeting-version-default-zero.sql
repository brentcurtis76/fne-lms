-- NOTE: Written in-repo to close PR 2 tech debt. Future migrations must route through the DB agent.
ALTER TABLE community_meetings ALTER COLUMN version SET DEFAULT 0;
UPDATE community_meetings SET version = 0 WHERE version = 1 AND updated_by IS NULL;
