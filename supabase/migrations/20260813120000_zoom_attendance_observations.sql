-- =============================================================================
-- zoom_internal.zoom_attendance_observations + the one-transaction leave applier
-- (plan §15.3.9; Z7-2).
--
-- ## Why this table exists
--
-- §15.3.9 requires that EVERY `participant_left` be durably recorded, whether or
-- not it closed anything. `zoom_webhook_events` already stores the raw body, but §6
-- nulls `raw_payload` at 30 days — the same horizon problem that forced the C6
-- amendment for the lifecycle instants — so a distilled observation must outlive
-- it. The row records *what was decided*, not only what arrived: the `outcome`
-- column carries the applier's ruling for the delivery.
--
-- ## Why the PRIVATE schema
--
-- This is an operational event log, not business data. §6's lockdown (REVOKE from
-- anon/authenticated, service_role only, RLS enabled with zero policies) is a
-- strictly stronger guarantee than any public-table policy set, and the shape is
-- structurally unreadable as an attendance interval — nothing here can be summed
-- into presence. It sits beside `zoom_webhook_events`, the same class of record.
--
-- Scope note: an observation requires a resolved surface (school_id NOT NULL) and
-- an occurrence uuid. A leave for a meeting created outside the LMS never resolves
-- a surface; its record is the webhook ledger row, exactly as for every other event
-- about a meeting that is not ours.
--
-- Ley 21.719: these rows name real people. Fixtures are synthetic everywhere.
-- =============================================================================

CREATE TABLE zoom_internal.zoom_attendance_observations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    -- §6 invariant: every row is school-scoped, no exceptions.
    school_id integer NOT NULL,
    -- The occurrence uuid, never the meeting number — same key as zoom_attendance.
    zoom_meeting_uuid text NOT NULL,
    event_type text NOT NULL CHECK (event_type = 'meeting.participant_left'),
    -- The webhook ledger dedupe_key (sha256 of the raw body). UNIQUE is the
    -- delivery-level idempotency §15.3.9 requires: route and sweep can apply the
    -- same delivery concurrently, and exactly one observation may exist for it.
    source_event_key text NOT NULL UNIQUE,
    -- The leave instant Zoom reported. NULL when the delivery carried no usable
    -- instant, in which case `outcome` says so ('no_instant') — a missing value is
    -- recorded as missing, never fabricated.
    observed_at timestamptz,

    -- The identity evidence exactly as intervals persist it (§15.3.9).
    participant_uuid text,
    customer_key text,
    display_name text,
    transient_email text,
    identity_tokens text[],

    -- What the applier decided for this delivery, inside the SAME transaction that
    -- recorded it. `no_open_interval` covers both "zero open rows matched" and
    -- "more than one open row matched" — §15.3.9 rule 3 treats them identically
    -- (close nothing) and fixes this enum at exactly four values.
    outcome text NOT NULL CHECK (outcome IN (
      'interval_closed', 'no_open_interval', 'unpairable_leave', 'no_instant'
    )),

    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX zoom_attendance_observations_occurrence_idx
  ON zoom_internal.zoom_attendance_observations (zoom_meeting_uuid);

COMMENT ON TABLE zoom_internal.zoom_attendance_observations IS
  'Durable per-delivery record of every meeting.participant_left applied against a resolved surface (§15.3.9): the identity evidence presented, the observed instant, and the applier''s outcome — recorded in ONE transaction with any eligible interval close, so no delivery can be both closed and logged unmatched. Retained past the 30-day raw_payload scrub. Service-role only.';

COMMENT ON COLUMN zoom_internal.zoom_attendance_observations.outcome IS
  'interval_closed | no_open_interval | unpairable_leave | no_instant. no_open_interval covers zero AND >1 matching open rows — §15.3.9 rule 3 closes nothing in either case. unpairable_leave = the leave presented no participant_uuid, the only token that may authorise closure.';

ALTER TABLE zoom_internal.zoom_attendance_observations ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- zoom_internal.apply_participant_leave — observation + eligible close, atomically.
--
-- ## The §15.3.9 eligibility rule, implemented where a race cannot break it
--
-- A `participant_left` may close an interval only via a Zoom-minted
-- `participant_uuid` matching EXACTLY ONE open row in the occurrence. Zero or more
-- than one ⇒ close nothing. Everything else the leave presented is recorded as
-- evidence. Closing nothing is the normal, correct outcome — Z7-3's authoritative
-- report supplies the true interval.
--
-- ## Why one function rather than two statements from the applier
--
-- The route and `webhook_sweep` call the applier concurrently for the same
-- delivery. Two separate statements (close, then observe) let one application close
-- the interval while the other records the same delivery as unmatched — two
-- contradictory records of one event. Here both writes share the function's single
-- transaction, and the observation's UNIQUE `source_event_key` is the arbiter: the
-- loser's INSERT raises `unique_violation`, the EXCEPTION handler rolls the WHOLE
-- body back — including any close it performed — and reports
-- 'observation_duplicate'. No delivery can be both closed and logged unmatched.
--
-- ## Locking order
--
-- The candidate rows are taken FOR UPDATE before counting, so the count and the
-- close see the same rows: a concurrent closer blocks, and after it commits the
-- re-evaluated predicate (left_at IS NULL) excludes the row it closed. A join that
-- lands after this statement's snapshot is not seen — which is the contract's "no
-- retroactive pairing": an observation is never re-applied to a join that arrives
-- later.
--
-- `p_observed_at >= joined_at` mirrors the table's interval-order CHECK: a leave
-- that precedes the open interval's join closes nothing (§15.3.9 matrix row 9)
-- rather than handing Postgres a row it will refuse.
--
-- SECURITY INVOKER (the default), like apply_meeting_lifecycle: the caller is
-- already service_role, which holds the table rights; DEFINER would add privilege
-- this function does not need.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zoom_internal.apply_participant_leave(
  p_school_id integer,
  p_zoom_meeting_uuid text,
  p_source_event_key text,
  p_observed_at timestamptz,
  p_participant_uuid text,
  p_customer_key text,
  p_display_name text,
  p_transient_email text,
  p_identity_tokens text[]
) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_outcome text;
  v_open_ids uuid[];
  v_closed integer := 0;
BEGIN
  IF p_observed_at IS NULL THEN
    v_outcome := 'no_instant';
  ELSIF p_participant_uuid IS NULL THEN
    -- No eligible token at all. Distinct from no_open_interval so the two causes
    -- stay legible in the log ([C10] vs [C2]).
    v_outcome := 'unpairable_leave';
  ELSE
    -- Lock the candidates, then count them. Exactly one ⇒ attempt the close.
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_open_ids
      FROM (
        SELECT za.id
          FROM public.zoom_attendance za
         WHERE za.zoom_meeting_uuid = p_zoom_meeting_uuid
           AND za.participant_uuid = p_participant_uuid
           AND za.left_at IS NULL
           FOR UPDATE
      ) candidates;

    IF array_length(v_open_ids, 1) = 1 THEN
      UPDATE public.zoom_attendance
         SET left_at = p_observed_at,
             updated_at = now()
       WHERE id = v_open_ids[1]
         AND left_at IS NULL
         AND p_observed_at >= joined_at;
      GET DIAGNOSTICS v_closed = ROW_COUNT;
      v_outcome := CASE WHEN v_closed = 1 THEN 'interval_closed' ELSE 'no_open_interval' END;
    ELSE
      -- Zero or more than one: rule 3 closes nothing either way.
      v_outcome := 'no_open_interval';
    END IF;
  END IF;

  INSERT INTO zoom_internal.zoom_attendance_observations (
    school_id, zoom_meeting_uuid, event_type, source_event_key, observed_at,
    participant_uuid, customer_key, display_name, transient_email,
    identity_tokens, outcome
  ) VALUES (
    p_school_id, p_zoom_meeting_uuid, 'meeting.participant_left',
    p_source_event_key, p_observed_at,
    p_participant_uuid, p_customer_key, p_display_name, p_transient_email,
    CASE WHEN p_identity_tokens IS NOT NULL AND array_length(p_identity_tokens, 1) > 0
         THEN p_identity_tokens ELSE NULL END,
    v_outcome
  );

  RETURN v_outcome;
EXCEPTION WHEN unique_violation THEN
  -- Another application of this same delivery already committed its observation.
  -- The handler's savepoint rollback undoes EVERYTHING this call did — including a
  -- close — which is the one-transaction rule: the winning application's record is
  -- the only record.
  RETURN 'observation_duplicate';
END
$$;

COMMENT ON FUNCTION zoom_internal.apply_participant_leave(
  integer, text, text, timestamptz, text, text, text, text, text[]) IS
  'Applies one meeting.participant_left delivery under §15.3.9: records the observation and performs any eligible close (participant_uuid matching exactly one open row, leave instant not preceding the join) in ONE transaction. Returns the recorded outcome, or ''observation_duplicate'' when another application of the same delivery already committed — in which case this call''s work, including any close, is rolled back in full.';

REVOKE EXECUTE ON FUNCTION zoom_internal.apply_participant_leave(
  integer, text, text, timestamptz, text, text, text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.apply_participant_leave(
  integer, text, text, timestamptz, text, text, text, text, text[])
  TO service_role;

-- Blanket re-run, as every zoom_internal migration does: the schema stays denied to
-- anon/authenticated no matter which migration created which table.
REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA zoom_internal TO service_role;
