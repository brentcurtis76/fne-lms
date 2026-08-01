-- =============================================================================
-- Atomic provisioning transitions (Z1b-sol5; Sol R5 findings 1 and 2)
-- AMENDED IN PLACE by Z1b-sol6 (Sol R6 finding 2) — see section 3 below.
--
-- Recovery and checkpoint adoption used to update zoom_meetings and publish the
-- public projection in separate PostgREST calls. A lifecycle webhook could commit
-- between them, observe no projection, and then be overwritten by a late
-- `scheduled` INSERT. Each function below makes the guarded internal transition and
-- projection publication one transaction. A compare-and-set miss returns false and
-- writes neither table.
--
-- `adopt_checkpoint_meeting` is UNCHANGED by sol6 and is now called from TWO
-- places: checkpoint adoption (sol5) and fresh-create persistence (sol6). Its CAS —
-- `id + status = 'pending' + zoom_meeting_number IS NULL` — is exactly the state a
-- reservation is in when `createMeeting` returns, so the fresh path needed no new
-- function, only the guard it never had. See `lib/zoom/jobs/meeting-provision.ts`.
--
-- SECURITY: every function here follows the zoom_internal RPC discipline: SECURITY
-- DEFINER, empty search_path, signature-specific grants, and a final blanket revoke.
-- =============================================================================

CREATE OR REPLACE FUNCTION zoom_internal.recover_provisioned_meeting(
    p_meeting_id uuid,
    p_zoom_meeting_number bigint,
    p_passcode text,
    p_join_url text,
    p_effective_settings jsonb,
    p_growth_community_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows integer;
    v_surface_type text;
    v_surface_id uuid;
    v_school_id integer;
    v_starts_at timestamptz;
    v_ends_at timestamptz;
BEGIN
    UPDATE zoom_internal.zoom_meetings
       SET zoom_meeting_number = p_zoom_meeting_number,
           passcode = p_passcode,
           join_url = p_join_url,
           effective_settings = p_effective_settings,
           status = 'provisioned',
           last_error = NULL,
           updated_at = now()
     WHERE id = p_meeting_id
       AND status = 'pending'
       AND zoom_meeting_number = p_zoom_meeting_number
    RETURNING surface_type, surface_id, school_id, starts_at, ends_at
         INTO v_surface_type, v_surface_id, v_school_id, v_starts_at, v_ends_at;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RETURN false;
    END IF;

    INSERT INTO public.session_meetings_public
        (surface_type, surface_id, school_id, growth_community_id, provider,
         meeting_status, starts_at, ends_at, updated_at)
    VALUES
        (v_surface_type, v_surface_id, v_school_id, p_growth_community_id, 'zoom',
         'scheduled', v_starts_at, v_ends_at, now())
    ON CONFLICT (surface_type, surface_id) DO UPDATE
       SET school_id = EXCLUDED.school_id,
           growth_community_id = EXCLUDED.growth_community_id,
           provider = EXCLUDED.provider,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           updated_at = now()
     WHERE public.session_meetings_public.meeting_status = 'scheduled';

    RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION zoom_internal.adopt_checkpoint_meeting(
    p_meeting_id uuid,
    p_zoom_meeting_number bigint,
    p_passcode text,
    p_join_url text,
    p_effective_settings jsonb,
    p_growth_community_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows integer;
    v_surface_type text;
    v_surface_id uuid;
    v_school_id integer;
    v_starts_at timestamptz;
    v_ends_at timestamptz;
BEGIN
    UPDATE zoom_internal.zoom_meetings
       SET zoom_meeting_number = p_zoom_meeting_number,
           passcode = p_passcode,
           join_url = p_join_url,
           effective_settings = p_effective_settings,
           status = 'provisioned',
           last_error = NULL,
           updated_at = now()
     WHERE id = p_meeting_id
       AND status = 'pending'
       AND zoom_meeting_number IS NULL
    RETURNING surface_type, surface_id, school_id, starts_at, ends_at
         INTO v_surface_type, v_surface_id, v_school_id, v_starts_at, v_ends_at;

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    IF v_rows <> 1 THEN
        RETURN false;
    END IF;

    INSERT INTO public.session_meetings_public
        (surface_type, surface_id, school_id, growth_community_id, provider,
         meeting_status, starts_at, ends_at, updated_at)
    VALUES
        (v_surface_type, v_surface_id, v_school_id, p_growth_community_id, 'zoom',
         'scheduled', v_starts_at, v_ends_at, now())
    ON CONFLICT (surface_type, surface_id) DO UPDATE
       SET school_id = EXCLUDED.school_id,
           growth_community_id = EXCLUDED.growth_community_id,
           provider = EXCLUDED.provider,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           updated_at = now()
     WHERE public.session_meetings_public.meeting_status = 'scheduled';

    RETURN true;
END;
$$;

-- =============================================================================
-- 3. Projection sync, DERIVED from the internal row (Z1b-sol6; Sol R6 finding 2)
--
-- The already-provisioned REPLAY path published `scheduled` through an unguarded
-- `INSERT ... ON CONFLICT DO UPDATE` in TypeScript, so a redelivered job landing
-- after `meeting.started` clobbered a `live`/`ended` badge back to `scheduled`.
-- Nothing about that write was derived from the meeting's actual state: it was a
-- constant.
--
-- This function derives the public status from the internal row instead, under
-- `FOR UPDATE`, in one transaction — so it cannot publish a status the internal
-- machine has already left behind, and a stale worker calling it late writes the
-- CURRENT truth rather than its own. That is also what makes it HEALING: a surface
-- whose projection is missing (the sol2-era stranded case) gets one created at the
-- status the meeting is actually in, `ended` included.
--
-- The status map (§8 internal machine → §6/§7 public badge):
--   provisioned → scheduled · started → live · ended → ended
--   cancelled   → cancelled · deleted → cancelled (a deleted meeting reads as
--                 cancelled to the UI; the guard below makes it idempotent)
--   pending / error → NOT PUBLISHABLE. There is nothing to announce for a
--                 reservation that never reached Zoom, or a row that failed; the
--                 function returns a distinguishable result and writes nothing.
--
-- NEVER-BACKWARD GUARD. The ON CONFLICT WHERE mirrors the webhook store's
-- applies-from discipline. The `live` and `ended` arms are the SQL twins of
-- `PROJECTION_LIVE_APPLIES_FROM` and `PROJECTION_ENDED_APPLIES_FROM` in
-- `lib/zoom/webhook-store.ts` — those constants carry the reciprocal pointer back
-- to this function. THE TWO CANNOT SHARE CODE: keep them in step by hand.
--   → scheduled  applies from {scheduled}                    (self only: idempotent)
--   → live       applies from {scheduled, live}              == PROJECTION_LIVE_APPLIES_FROM
--   → ended      applies from {scheduled, live, ended}       == PROJECTION_ENDED_APPLIES_FROM
--   → cancelled  applies from {scheduled, live, cancelled}   (no TS twin — the
--                lifecycle only ever drives live/ended; cancellation reaches the
--                projection through this function alone)
-- `ended` and `cancelled` are terminal against each other in both directions.
--
-- Returns: 'published' · 'blocked' (the guard refused; the projection is already
-- at or past this status) · 'not_publishable' · 'missing'.
-- =============================================================================

CREATE OR REPLACE FUNCTION zoom_internal.sync_projection_from_meeting(
    p_meeting_id uuid,
    p_growth_community_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_rows integer;
    v_surface_type text;
    v_surface_id uuid;
    v_school_id integer;
    v_status text;
    v_starts_at timestamptz;
    v_ends_at timestamptz;
    v_public_status text;
BEGIN
    -- FOR UPDATE: the derived status and the publication must see the same row, so
    -- a lifecycle transition committing in between cannot be published stale.
    SELECT surface_type, surface_id, school_id, status, starts_at, ends_at
      INTO v_surface_type, v_surface_id, v_school_id, v_status, v_starts_at, v_ends_at
      FROM zoom_internal.zoom_meetings
     WHERE id = p_meeting_id
       FOR UPDATE;

    IF NOT FOUND THEN
        RETURN 'missing';
    END IF;

    v_public_status := CASE v_status
        WHEN 'provisioned' THEN 'scheduled'
        WHEN 'started'     THEN 'live'
        WHEN 'ended'       THEN 'ended'
        WHEN 'cancelled'   THEN 'cancelled'
        WHEN 'deleted'     THEN 'cancelled'
        ELSE NULL
    END;

    IF v_public_status IS NULL THEN
        RETURN 'not_publishable';
    END IF;

    INSERT INTO public.session_meetings_public
        (surface_type, surface_id, school_id, growth_community_id, provider,
         meeting_status, starts_at, ends_at, updated_at)
    VALUES
        (v_surface_type, v_surface_id, v_school_id, p_growth_community_id, 'zoom',
         v_public_status, v_starts_at, v_ends_at, now())
    ON CONFLICT (surface_type, surface_id) DO UPDATE
       SET school_id = EXCLUDED.school_id,
           growth_community_id = EXCLUDED.growth_community_id,
           provider = EXCLUDED.provider,
           meeting_status = EXCLUDED.meeting_status,
           starts_at = EXCLUDED.starts_at,
           ends_at = EXCLUDED.ends_at,
           updated_at = now()
     WHERE public.session_meetings_public.meeting_status = ANY (
             CASE EXCLUDED.meeting_status
               WHEN 'scheduled' THEN ARRAY['scheduled']
               WHEN 'live'      THEN ARRAY['scheduled', 'live']
               WHEN 'ended'     THEN ARRAY['scheduled', 'live', 'ended']
               WHEN 'cancelled' THEN ARRAY['scheduled', 'live', 'cancelled']
             END
           );

    GET DIAGNOSTICS v_rows = ROW_COUNT;
    RETURN CASE WHEN v_rows = 1 THEN 'published' ELSE 'blocked' END;
END;
$$;

REVOKE EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.sync_projection_from_meeting(
  uuid, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.sync_projection_from_meeting(
  uuid, uuid
) TO service_role;

-- Belt-and-braces: no earlier or future default grant may expose any function in
-- this secret-bearing schema. Re-grant only the three signatures introduced here;
-- previous migrations already granted their own service-role RPC signatures.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.sync_projection_from_meeting(
  uuid, uuid
) TO service_role;
