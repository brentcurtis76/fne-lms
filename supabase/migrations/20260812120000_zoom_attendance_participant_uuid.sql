-- =============================================================================
-- zoom_attendance.participant_uuid + interval integrity (plan §6/§11; Z7-2).
--
-- Additive: one nullable column, one partial unique index, one CHECK. Nothing is
-- dropped or rewritten, and every existing row reads NULL.
--
-- ## participant_uuid — the interval key (ruling [R3])
--
-- Zoom's `payload.object.participant.participant_uuid` is the per-participant handle
-- for an occurrence, and it is the only field on the committed captures that is
-- populated for BOTH a licensed host and a license-free guest
-- (`364B3A17-05C0-6B63-F4FA-2180DCC26971` and
-- `73823734-9301-A7E5-36F4-684DEEF79FE5`). Every other candidate key is empty string
-- on the guest's event: `email`, `participant_user_id`, `id` and `registrant_id` are
-- all `""`.
--
-- **Its stability across a joined→left pair is UNVERIFIED and the fixtures cannot
-- settle it**: the two committed captures are two DIFFERENT people (different
-- customer_key, different user_name), so they are not a pair and no pairing can be
-- inferred from them. The interval matcher therefore treats participant_uuid as the
-- PREFERRED key and falls back to the identity token, and both paths are tested. If a
-- real recorded session ever shows the uuid changing between join and leave, the
-- fallback is what keeps intervals closing.
--
-- ## The partial unique index
--
-- `(zoom_meeting_uuid, participant_uuid) WHERE participant_uuid IS NOT NULL` is the
-- uniqueness the Z7-1 review deferred to this chunk. It is what makes a redelivered
-- `participant_joined` a no-op at the DATABASE, not merely in the applier — Zoom
-- retries, and `webhook_sweep` deliberately replays events minutes later, so "the
-- applier checks first" is a race and not a guarantee.
--
-- PARTIAL rather than total, because a participant whose uuid Zoom omitted must still
-- produce a row: a total unique index would collapse every anonymous guest of one
-- occurrence into a single interval, which is exactly the double-count-in-reverse that
-- §11's presence metric cannot survive. For those rows the applier's identity+instant
-- check is the only dedupe there is, and it says so.
--
-- ## The interval-order CHECK (ruling [R7])
--
-- `left_at >= joined_at` is a data-integrity floor, not the applier's error handling.
-- An out-of-order `leave_time` must NOT raise out of the webhook route — Zoom would
-- retry a malformed event forever against an endpoint that can never accept it — so
-- the applier leaves such an interval OPEN and records ledger-only. The CHECK exists
-- so that a future writer which skips that reasoning is refused by Postgres instead of
-- silently storing a negative interval that §11's presence sum would subtract.
-- =============================================================================

ALTER TABLE public.zoom_attendance
  ADD COLUMN participant_uuid text;

COMMENT ON COLUMN public.zoom_attendance.participant_uuid IS
  'Zoom''s per-participant handle for this occurrence (payload.object.participant.participant_uuid). The preferred interval key: it is the only identity-ish field populated for BOTH a licensed host and a license-free guest. NULL when Zoom omitted it, in which case the applier falls back to the identity token. Stability across a joined→left pair is UNVERIFIED — the committed fixtures are two different people and cannot settle it.';

CREATE UNIQUE INDEX zoom_attendance_participant_occurrence_key
  ON public.zoom_attendance (zoom_meeting_uuid, participant_uuid)
  WHERE participant_uuid IS NOT NULL;

ALTER TABLE public.zoom_attendance
  ADD CONSTRAINT zoom_attendance_interval_order
  CHECK (left_at IS NULL OR left_at >= joined_at);
