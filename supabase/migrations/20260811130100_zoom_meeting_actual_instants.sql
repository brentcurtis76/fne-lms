-- =============================================================================
-- zoom_internal.zoom_meetings.actual_started_at / actual_ended_at — the C6
-- amendment (plan §15.3.1 / §15.3.7 Decision Log; Z7-1).
--
-- §11 quantity (3) is "Zoom meeting elapsed — zoom_meetings started/ended webhook
-- instants". The falsification pass found it had nowhere to live: the table carries
-- `starts_at`, `duration_minutes` and the generated `ends_at`, which are all PLANNED
-- values, plus `status`. The lifecycle moved the status and captured the occurrence
-- uuid; it recorded no time at all, so the Z7-5 comparison panel's "Zoom" column had
-- no source.
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
  'The instant the occurrence actually began, from meeting.started''s payload.object.start_time (event_ts, in MILLISECONDS, as fallback). NULL until that event arrives. Provisioning NEVER writes this — starts_at is the planned value and this is the observed one. Write-once: the trigger below coalesces, so a swept or out-of-order replay cannot overwrite it.';
COMMENT ON COLUMN zoom_internal.zoom_meetings.actual_ended_at IS
  'The instant the occurrence actually ended, from meeting.ended''s payload.object.end_time (event_ts, in MILLISECONDS, as fallback). NULL until that event arrives. Provisioning NEVER writes this. Write-once under the same trigger.';

-- -----------------------------------------------------------------------------
-- The monotonic guard, in SQL for the same reason the status guard is (§8, and
-- lib/zoom/webhook-store.ts's header): `webhook_sweep` deliberately replays events
-- fifteen minutes or more after they were received and Zoom does not order its
-- deliveries, so a second `meeting.started` for the same occurrence is reachable in
-- normal operation. An in-process "read the row, decide, write it" check would be a
-- TOCTOU race between the route and a concurrent sweep; expressing it as COALESCE
-- inside the UPDATE itself makes both converge no matter which one runs first.
--
-- A BEFORE UPDATE trigger rather than the UPDATE's SET list because the writer is
-- PostgREST (`serviceClient.schema('zoom_internal')`), which sends literal values and
-- cannot express an expression over the existing row. This way the rule holds for
-- EVERY writer, including ones that do not exist yet.
--
-- No-op for every other write: an UPDATE that does not mention these columns has
-- NEW.col = OLD.col already, and COALESCE(OLD, OLD) is OLD.
--
-- CONSEQUENCE, stated so it is not discovered later: this makes the two columns
-- write-once. A future authoritative correction — §11's "(reconcile-corrected)" —
-- cannot go through a plain UPDATE and will need its own explicit path.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zoom_internal.preserve_actual_instants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.actual_started_at := COALESCE(OLD.actual_started_at, NEW.actual_started_at);
  NEW.actual_ended_at := COALESCE(OLD.actual_ended_at, NEW.actual_ended_at);
  RETURN NEW;
END
$$;

REVOKE EXECUTE ON FUNCTION zoom_internal.preserve_actual_instants()
  FROM PUBLIC, anon, authenticated;

CREATE TRIGGER zoom_meetings_preserve_actual_instants
  BEFORE UPDATE ON zoom_internal.zoom_meetings
  FOR EACH ROW
  EXECUTE FUNCTION zoom_internal.preserve_actual_instants();
