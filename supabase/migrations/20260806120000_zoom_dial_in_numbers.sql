-- =============================================================================
-- Z2-4d: name the dial-in numbers that provisioning already persists
--
-- Dial-in numbers are ALREADY stored today, unnamed: `lib/zoom/client.ts` parses a
-- Zoom response with no field whitelist, `mapMeeting` passes `raw.settings` through
-- whole, and the provisioner persists that object verbatim as `effective_settings`.
-- So a tenant with an audio plan is already writing its dial-in set into this table
-- inside a JSON blob nothing in the schema knows the name of.
--
-- This migration gives it a name. It is ADDITIVE ONLY: one nullable column, and the
-- two provisioning RPCs amended IN PLACE at their IDENTICAL 6-argument signatures via
-- CREATE OR REPLACE (the idiom this file's ancestor 20260731120000 already declares in
-- its own header). No DROP, no overload, no signature change — an overload would make
-- the six positional pgTAP calls ambiguous (42725) while the signature-based grant
-- asserts kept passing against a stale function that silently wrote NULL forever.
--
-- WHY DERIVE IT IN THE RPC. `zoom_internal.zoom_meetings.effective_settings` has
-- exactly two writers in the entire codebase, and both are the `UPDATE … SET` inside
-- the two functions below. A column set in the SAME `UPDATE` statement cannot drift
-- from its source. That is the whole argument for a derived column here, and it stops
-- being true the moment someone adds a third writer — see the column COMMENT.
--
-- Each function body below is reproduced verbatim from 20260731120000; the ONLY change
-- is the single `dial_in_numbers = …` line in each `UPDATE … SET`.
-- =============================================================================

ALTER TABLE zoom_internal.zoom_meetings
  ADD COLUMN IF NOT EXISTS dial_in_numbers jsonb;

COMMENT ON COLUMN zoom_internal.zoom_meetings.dial_in_numbers IS
  'Zoom''s global_dial_in_numbers for this meeting, as reported in the create/read '
  'response. NULL when the tenant has no audio plan — Zoom simply omits the field, and '
  'a missing audio plan must never fail a provision. DERIVED from '
  'effective_settings -> ''global_dial_in_numbers'' inside '
  'zoom_internal.recover_provisioned_meeting and zoom_internal.adopt_checkpoint_meeting, '
  'in the same UPDATE that writes effective_settings, so the two cannot drift. ANY '
  'FUTURE WRITER OF effective_settings MUST SET THIS COLUMN TOO. It lives on the '
  'secret-bearing side of the schema because a usable dial-in also needs the meeting '
  'number and the passcode, which never leave zoom_internal.';

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
           dial_in_numbers = p_effective_settings -> 'global_dial_in_numbers',
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
           dial_in_numbers = p_effective_settings -> 'global_dial_in_numbers',
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

-- CREATE OR REPLACE preserves existing privileges, so these are re-asserted rather
-- than required. Scoped to the two amended signatures ONLY — a blanket
-- `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal` here would strip the grants
-- every other RPC in this schema depends on.
REVOKE EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
