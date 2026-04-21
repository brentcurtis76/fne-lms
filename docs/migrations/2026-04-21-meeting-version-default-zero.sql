-- Corrective migration: align community_meetings.version default with API contract.
--
-- The autosave endpoint uses optimistic concurrency keyed on `version`. A fresh
-- draft must enter the loop with version = 0 so the first autosave (expected
-- version 0) succeeds and increments to 1. An earlier draft of the PR 2
-- migration set the default to 1, which caused the first autosave to look like
-- a stale write. This file resets the default to 0 and repairs any unedited
-- rows (version = 1 AND updated_by IS NULL) that were inserted under the wrong
-- default.

ALTER TABLE community_meetings ALTER COLUMN version SET DEFAULT 0;

UPDATE community_meetings SET version = 0 WHERE version = 1 AND updated_by IS NULL;
