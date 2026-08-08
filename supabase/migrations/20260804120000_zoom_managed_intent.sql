-- =============================================================================
-- Z2-1 — durable managed intent on consultor_sessions (plan §8)
--
-- Additive only: one boolean column, NOT NULL DEFAULT false, on an existing
-- public table. No DROP, no TRUNCATE, no destructive ALTER, no RLS change, no
-- new grant — `consultor_sessions` keeps the policies and grants it already
-- has, and every pre-existing row reads as unmanaged.
--
-- Why a column on the SOURCE row rather than an inference from the projection:
-- `session_meetings_public` only exists AFTER provisioning, so deriving intent
-- from it would conflate "the scheduler asked for a Zoom meeting" with "a Zoom
-- meeting already exists". Plan §8 makes the intent durable and independent of
-- provisioning state; the provisioner reads the flag, the PUT guard that
-- rejects manual `meeting_link` edits keys on it, and `meeting_provider` stays
-- 'zoom' (the live CHECK constraint has no 'zoom_managed' value and must not
-- grow one).
-- =============================================================================

ALTER TABLE public.consultor_sessions
  ADD COLUMN IF NOT EXISTS is_zoom_managed boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.consultor_sessions.is_zoom_managed IS
  'Durable managed intent (Zoom plan §8): true when the scheduler chose "Generar reunión Zoom" for this session. Set at creation (or by an admin while the session is still borrador/pendiente_aprobacion); read by the meeting_provision eligibility gate and by the PUT guard that rejects manual meeting_link edits. Independent of provisioning state — the session_meetings_public row is a status artifact, not the intent.';
