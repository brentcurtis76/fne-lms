-- =============================================================================
-- contract_hours_ledger.planned_minutes_snapshot (plan §11, Z1b slice; Z1b-1)
--
-- Additive, nullable: existing rows stay NULL. Written by createReservation
-- (lib/services/hour-tracking.ts) from the session's scheduled duration at
-- reservation time — the approved-duration evidence that bills, regardless of
-- what Zoom later observes (§11 invariant: Zoom data is comparison-only).
--
-- The existing hours CHECK (hours > 0) is NEVER touched or replaced (plan
-- errata #23). The atomic pre-execution reschedule RPC is Z2; the override
-- machinery (effective_minutes, session_hour_overrides) is Z7.
-- =============================================================================

ALTER TABLE public.contract_hours_ledger
  ADD COLUMN IF NOT EXISTS planned_minutes_snapshot integer;

COMMENT ON COLUMN public.contract_hours_ledger.planned_minutes_snapshot IS
  'Planned/approved session duration in minutes, snapshotted by createReservation at approve time (plan §11). NULL on pre-Z1b rows. Updated only by the Z2 atomic pre-execution reschedule RPC; post-execution changes only via the Z7 admin override.';
