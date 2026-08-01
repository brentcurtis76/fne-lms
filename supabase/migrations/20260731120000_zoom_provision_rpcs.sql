-- =============================================================================
-- Atomic provisioning transitions (Z1b-sol5; Sol R5 findings 1 and 2)
--
-- Recovery and checkpoint adoption used to update zoom_meetings and publish the
-- public projection in separate PostgREST calls. A lifecycle webhook could commit
-- between them, observe no projection, and then be overwritten by a late
-- `scheduled` INSERT. Each function below makes the guarded internal transition and
-- projection publication one transaction. A compare-and-set miss returns false and
-- writes neither table.
--
-- SECURITY: both functions follow the zoom_internal RPC discipline: SECURITY
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

-- Belt-and-braces: no earlier or future default grant may expose any function in
-- this secret-bearing schema. Re-grant only the two signatures introduced here;
-- previous migrations already granted their own service-role RPC signatures.
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.recover_provisioned_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
GRANT EXECUTE ON FUNCTION zoom_internal.adopt_checkpoint_meeting(
  uuid, bigint, text, text, jsonb, uuid
) TO service_role;
