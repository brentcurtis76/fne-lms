-- Meeting draft workflow + collaborative editors (schema only).
--
-- Adds:
--   1. 'borrador' value to the `meeting_status` enum (safe, idempotent).
--   2. `started_at`, `version`, `updated_by` columns to `community_meetings`.
--   3. `meeting_work_sessions` table for co-editing presence/heartbeat.
--   4. Documents the extension of attendee `role` to include 'co_editor'.
--      (The column is free-form TEXT with no CHECK constraint, so no DDL
--       is needed here — RLS + application code enforce the value set.)
--
-- Date: 2026-04-21
-- Branch: feat/mtg-draft

BEGIN;

-- 1. Extend the meeting_status enum with 'borrador'.
--    ADD VALUE IF NOT EXISTS is transactional-safe on PG 12+.
ALTER TYPE meeting_status ADD VALUE IF NOT EXISTS 'borrador' BEFORE 'programada';

-- 2. Extend community_meetings with draft/versioning metadata.
ALTER TABLE community_meetings
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id);

CREATE INDEX IF NOT EXISTS idx_community_meetings_updated_by
  ON community_meetings(updated_by);

-- 3. Collaborative work-session presence.
CREATE TABLE IF NOT EXISTS meeting_work_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meeting_id        UUID NOT NULL REFERENCES community_meetings(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_heartbeat_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at          TIMESTAMPTZ,
  client_id         TEXT
);

CREATE INDEX IF NOT EXISTS idx_meeting_work_sessions_meeting_active
  ON meeting_work_sessions(meeting_id)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_work_sessions_heartbeat
  ON meeting_work_sessions(meeting_id, last_heartbeat_at DESC)
  WHERE ended_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_meeting_work_sessions_user
  ON meeting_work_sessions(user_id);

ALTER TABLE meeting_work_sessions ENABLE ROW LEVEL SECURITY;

-- 4. Attendee role 'co_editor' — no DDL needed (role column is TEXT).
--    Documented here so future readers understand the role vocabulary:
--      facilitator | secretary | participant | observer | co_editor

COMMIT;
