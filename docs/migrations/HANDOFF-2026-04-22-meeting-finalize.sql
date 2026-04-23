-- HANDOFF: DB agent
-- Purpose: Add finalize metadata + reconcile PR 2's version default.
-- CLAUDE.md rule: developer must not write/apply migrations — this file is a spec for the DB agent to generate a proper migration at supabase/migrations/[timestamp]_*.sql via `supabase db diff` + `supabase db push --dry-run`.
-- Additive only. No destructive ALTER. Tested behavior documented below.

-- A) Finalize metadata on community_meetings
ALTER TABLE community_meetings
  ADD COLUMN IF NOT EXISTS finalized_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS finalized_by     UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS finalize_audience TEXT CHECK (finalize_audience IN ('community', 'attended'));

-- B) Reconcile PR 2 version default drift (already applied manually in prod; this file
--    exists so fresh environments pick up the corrected default)
ALTER TABLE community_meetings ALTER COLUMN version SET DEFAULT 0;

-- C) Indexes: audience queries on finalized meetings
CREATE INDEX IF NOT EXISTS idx_community_meetings_finalized
  ON community_meetings (finalized_at DESC) WHERE finalized_at IS NOT NULL;

-- D) RLS reminder for DB agent: existing can_edit_meeting() policy remains authoritative.
--    Finalize transitions status 'borrador' → 'completada' so write access naturally
--    closes per the existing policy. No RLS change required for this PR.
