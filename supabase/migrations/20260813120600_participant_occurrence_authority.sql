-- =============================================================================
-- Participant occurrence authority at the write boundary (Z7 remediation R8).
--
-- Participant webhooks resolve by occurrence UUID first and use the meeting number
-- only before an occurrence is established. The read alone is not authority: a
-- lifecycle writer can fill a different UUID between that lookup and the attendance
-- write. These RPCs claim a NULL UUID or match the established UUID atomically on the
-- exact surface + school row before writing an interval or leave observation.
--
-- A mismatch changes nothing. Claiming a NULL row is fill-only and does not move the
-- lifecycle status or observed instants. The existing lifecycle RPC's COALESCE keeps
-- the claimed identity stable when meeting.started later arrives.
-- =============================================================================

CREATE FUNCTION zoom_internal.claim_participant_occurrence(
  p_surface_type text,
  p_surface_id uuid,
  p_school_id integer,
  p_occurrence_uuid text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claimed boolean;
BEGIN
  IF p_occurrence_uuid IS NULL OR btrim(p_occurrence_uuid) = '' THEN
    RETURN false;
  END IF;

  UPDATE zoom_internal.zoom_meetings m
     SET zoom_meeting_uuid = COALESCE(m.zoom_meeting_uuid, p_occurrence_uuid)
   WHERE m.surface_type = p_surface_type
     AND m.surface_id = p_surface_id
     AND m.school_id = p_school_id
     AND (m.zoom_meeting_uuid IS NULL OR m.zoom_meeting_uuid = p_occurrence_uuid)
  RETURNING true INTO v_claimed;

  RETURN COALESCE(v_claimed, false);
END
$$;

COMMENT ON FUNCTION zoom_internal.claim_participant_occurrence(text, uuid, integer, text) IS
  'Owner-only participant identity CAS: atomically fills a NULL occurrence UUID or matches the established value on the exact surface/school. False means missing or conflicting surface. Never changes lifecycle status or instants.';

REVOKE EXECUTE ON FUNCTION zoom_internal.claim_participant_occurrence(text, uuid, integer, text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION zoom_internal.apply_participant_join(
  p_surface_type text,
  p_surface_id uuid,
  p_school_id integer,
  p_zoom_meeting_uuid text,
  p_participant_uuid text,
  p_user_id uuid,
  p_customer_key text,
  p_display_name text,
  p_transient_email text,
  p_matched_by text,
  p_joined_at timestamptz,
  p_identity_tokens text[],
  p_source_event_key text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NOT zoom_internal.claim_participant_occurrence(
    p_surface_type, p_surface_id, p_school_id, p_zoom_meeting_uuid
  ) THEN
    RETURN 'occurrence_mismatch';
  END IF;

  INSERT INTO public.zoom_attendance (
    surface_type, surface_id, school_id, zoom_meeting_uuid,
    participant_uuid, user_id, customer_key, display_name, transient_email,
    matched_by, joined_at, identity_tokens, source_event_key, source
  ) VALUES (
    p_surface_type, p_surface_id, p_school_id, p_zoom_meeting_uuid,
    p_participant_uuid, p_user_id, p_customer_key, p_display_name, p_transient_email,
    p_matched_by, p_joined_at,
    CASE WHEN p_identity_tokens IS NOT NULL AND array_length(p_identity_tokens, 1) > 0
         THEN p_identity_tokens ELSE NULL END,
    p_source_event_key, 'webhook'
  );

  RETURN 'interval_opened';
EXCEPTION WHEN unique_violation THEN
  RETURN 'interval_duplicate';
END
$$;

COMMENT ON FUNCTION zoom_internal.apply_participant_join(
  text, uuid, integer, text, text, uuid, text, text, text, text,
  timestamptz, text[], text) IS
  'Atomically claim-or-match the exact meeting occurrence and insert one webhook attendance interval. Returns occurrence_mismatch before any attendance write, or the existing opened/duplicate outcomes.';

REVOKE EXECUTE ON FUNCTION zoom_internal.apply_participant_join(
  text, uuid, integer, text, text, uuid, text, text, text, text,
  timestamptz, text[], text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.apply_participant_join(
  text, uuid, integer, text, text, uuid, text, text, text, text,
  timestamptz, text[], text)
  TO service_role;

CREATE FUNCTION zoom_internal.apply_participant_leave(
  p_surface_type text,
  p_surface_id uuid,
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
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_outcome text;
  v_open_ids uuid[];
  v_closed integer := 0;
BEGIN
  IF NOT zoom_internal.claim_participant_occurrence(
    p_surface_type, p_surface_id, p_school_id, p_zoom_meeting_uuid
  ) THEN
    RETURN 'occurrence_mismatch';
  END IF;

  IF p_observed_at IS NULL THEN
    v_outcome := 'no_instant';
  ELSIF p_participant_uuid IS NULL THEN
    v_outcome := 'unpairable_leave';
  ELSE
    SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_open_ids
      FROM (
        SELECT za.id
          FROM public.zoom_attendance za
         WHERE za.surface_type = p_surface_type
           AND za.surface_id = p_surface_id
           AND za.school_id = p_school_id
           AND za.zoom_meeting_uuid = p_zoom_meeting_uuid
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
  RETURN 'observation_duplicate';
END
$$;

COMMENT ON FUNCTION zoom_internal.apply_participant_leave(
  text, uuid, integer, text, text, timestamptz, text, text, text, text, text[]) IS
  'Atomically claim-or-match the exact surface occurrence, then record one participant_left observation and any eligible interval close. occurrence_mismatch returns before every attendance/observation write.';

-- The historical 9-argument function remains immutable migration history but is no
-- longer an exposed write path because it lacks the surface identity needed to close
-- the lookup/write race.
REVOKE EXECUTE ON FUNCTION zoom_internal.apply_participant_leave(
  integer, text, text, timestamptz, text, text, text, text, text[])
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE EXECUTE ON FUNCTION zoom_internal.apply_participant_leave(
  text, uuid, integer, text, text, timestamptz, text, text, text, text, text[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.apply_participant_leave(
  text, uuid, integer, text, text, timestamptz, text, text, text, text, text[])
  TO service_role;

-- Preserve the private-schema deny state after adding owner-executed functions.
REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
