-- =============================================================================
-- zoom_internal.zoom_meetings.actual_started_at / actual_ended_at — the C6
-- amendment (plan §15.3.1 / §15.3.7 Decision Log; Z7-1).
--
-- §11 quantity (3) is "Zoom meeting elapsed — zoom_meetings started/ended webhook
-- instants (reconcile-corrected)". The falsification pass found it had nowhere to
-- live: the table carries `starts_at`, `duration_minutes` and the generated
-- `ends_at`, which are all PLANNED values, plus `status`. The lifecycle moved the
-- status and captured the occurrence uuid; it recorded no time at all, so the Z7-5
-- comparison panel's "Zoom" column had no source.
--
-- Recovering the instants from zoom_internal.zoom_webhook_events.raw_payload was the
-- alternative and it is not available: §6 nulls `raw_payload` at 30 days, so the panel
-- would silently lose its Zoom column for every session older than a month.
--
-- Additive, nullable, and confined to the private schema — nothing outside the
-- service-role workers can read them, and every existing row simply reads NULL.
-- Provisioning never writes either one: the values are only knowable once the
-- occurrence actually happens, which is what `meeting.started` / `meeting.ended`
-- announce.
-- =============================================================================

ALTER TABLE zoom_internal.zoom_meetings
  ADD COLUMN actual_started_at timestamptz,
  ADD COLUMN actual_ended_at timestamptz;

COMMENT ON COLUMN zoom_internal.zoom_meetings.actual_started_at IS
  'The instant the occurrence actually began: meeting.started''s payload.object.start_time (event_ts, in MILLISECONDS, as fallback), or meeting.ended''s start_time when started never landed. NULL until one of them arrives. Provisioning NEVER writes this — starts_at is the planned value and this is the observed one. The lifecycle RPC fills it only while NULL; a deliberate correction (Z7-3 reconcile) writes it directly.';
COMMENT ON COLUMN zoom_internal.zoom_meetings.actual_ended_at IS
  'The instant the occurrence actually ended, from meeting.ended''s payload.object.end_time (event_ts, in MILLISECONDS, as fallback). NULL until that event arrives. Provisioning NEVER writes this. Same fill-while-NULL rule under the lifecycle RPC, same direct correction path for reconcile.';

-- -----------------------------------------------------------------------------
-- The lifecycle transition, as ONE atomic guarded statement.
--
-- ## Why this function exists at all
--
-- Until Z7-1 the transition was a PostgREST `UPDATE ... WHERE id = $1 AND status IN
-- (...)`, and the `.in(...)` filter WAS the monotonicity guard — evaluated by Postgres
-- inside the UPDATE, so a route and a concurrent `webhook_sweep` racing on the same
-- meeting cannot both win (Sol F1). That property is preserved here exactly.
--
-- What PostgREST cannot express is a SET list that reads the existing row.
-- `webhook_sweep` deliberately replays events fifteen minutes or more after they
-- arrive, and Zoom does not order its deliveries, so a second `meeting.started` for
-- the same occurrence is normal operation — and a literal assignment would let it
-- overwrite an instant already recorded. `COALESCE(m.actual_started_at, p_…)` is the
-- fix, and it has to live in SQL, in the same statement as the guard.
--
-- ## Why a function and not a BEFORE UPDATE trigger
--
-- A trigger would apply the same COALESCE to EVERY writer, which makes the columns
-- write-once for the whole system — including the Z7-3 reconcile, whose participant
-- report §11 makes AUTHORITATIVE over webhooks. Scoping the rule to this function
-- keeps fill-while-NULL where it belongs (the replay-prone webhook path) and leaves a
-- plain service-role UPDATE as the explicit correction path reconciliation needs.
-- pgTAP 011 asserts both halves: this function cannot overwrite, and a direct UPDATE
-- can.
--
-- ## Why the applies-from set is a PARAMETER
--
-- `lib/zoom/webhook-store.ts` exports `LIFECYCLE_STARTED_APPLIES_FROM` /
-- `LIFECYCLE_ENDED_APPLIES_FROM` and its suite pins them literally. Hard-coding them
-- here too would create a third SQL twin of a rule that already carries one drift
-- warning in this codebase (`sync_projection_from_meeting`). Passing the set in keeps
-- TypeScript the single source of truth and makes this function a mechanism rather
-- than a second copy of the policy. `__tests__/lib/zoom/webhook-store.test.ts` reads
-- the array back off the wire, so a dropped or widened guard still fails there.
--
-- SECURITY INVOKER (the default) on purpose, unlike the provisioning RPCs: the caller
-- is already service_role, which holds the table rights and bypasses RLS, so DEFINER
-- would add privilege this function does not need. Zero rows returned = the guard
-- refused, which is an ordinary outcome and not an error.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zoom_internal.apply_meeting_lifecycle(
  p_meeting_id uuid,
  p_status text,
  p_applies_from text[],
  p_occurrence_uuid text,
  p_actual_started_at timestamptz,
  p_actual_ended_at timestamptz
) RETURNS TABLE (surface_type text, surface_id uuid)
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  UPDATE zoom_internal.zoom_meetings AS m
     SET status = p_status,
         -- Fill only while missing. Once either lifecycle delivery establishes the
         -- occurrence identity, a replay carrying a different UUID cannot retarget
         -- this meeting's report/attendance authority.
         zoom_meeting_uuid = COALESCE(m.zoom_meeting_uuid, p_occurrence_uuid),
         -- Fill-while-NULL, both columns. First writer wins; the replay is inert.
         actual_started_at = COALESCE(m.actual_started_at, p_actual_started_at),
         actual_ended_at = COALESCE(m.actual_ended_at, p_actual_ended_at),
         updated_at = now()
   WHERE m.id = p_meeting_id
     AND m.status = ANY (p_applies_from)
  RETURNING m.surface_type, m.surface_id;
END
$$;

COMMENT ON FUNCTION zoom_internal.apply_meeting_lifecycle(uuid, text, text[], text, timestamptz, timestamptz) IS
  'The §8 lifecycle transition as one atomic guarded UPDATE: the applies-from set is the monotonicity guard (caller-supplied; source of truth lib/zoom/webhook-store.ts), and the occurrence UUID plus observed instants are filled only while NULL so a swept or out-of-order replay cannot overwrite established identity/evidence. Returns the row surface keys when the guard applied, zero rows when it refused. NOT the correction path — Z7-3 reconcile writes the instant columns directly.';

REVOKE EXECUTE ON FUNCTION zoom_internal.apply_meeting_lifecycle(
  uuid, text, text[], text, timestamptz, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.apply_meeting_lifecycle(
  uuid, text, text[], text, timestamptz, timestamptz)
  TO service_role;
