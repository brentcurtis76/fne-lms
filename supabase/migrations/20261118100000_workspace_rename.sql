-- =============================================================================
-- 20261118100000_workspace_rename.sql — GENERA fixes F12c, EC-V1a.
--
-- Any member of a community may rename its workspace (owner decision,
-- 17 Nov 2026: "Any member"); admins may too. The table's own write rules
-- (admins_modify_all_workspaces, community_managers_modify_their_workspace)
-- stay exactly as they are: the picture keeps its present path, and the name
-- goes through this function for every person.
--
-- Additive only: one new function, its grants and its comment. No existing
-- rule, grant or function is changed.
-- =============================================================================

CREATE FUNCTION public.rename_community_workspace(p_workspace_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  -- White space, control and format characters stripped at both ends, as
  -- rename_community_document does: the [[:space:]] and [[:cntrl:]] classes,
  -- the no-break space U+00A0, the Unicode spaces U+2000..U+200A, the
  -- zero-width characters U+200B..U+200D and U+FEFF, and U+2028, U+2029,
  -- U+202F, U+205F, U+3000.
  v_strip constant text := '[[:space:][:cntrl:]  -‍    　﻿]';
  v_name text := regexp_replace(p_name, '^' || v_strip || '+|' || v_strip || '+$', '', 'g');
  v_community_id uuid;
BEGIN
  IF v_uid IS NULL OR NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  SELECT w.community_id INTO v_community_id
    FROM public.community_workspaces w
   WHERE w.id = p_workspace_id
     FOR UPDATE;

  -- A missing workspace and one the caller may not rename get the same answer.
  IF v_community_id IS NULL OR NOT (
       public.auth_is_admin()
       OR EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = v_uid
            AND ur.is_active = true
            AND ur.community_id = v_community_id
       )
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'not_allowed';
  END IF;

  IF v_name IS NULL OR length(v_name) < 1 OR length(v_name) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_name';
  END IF;

  UPDATE public.community_workspaces
     SET custom_name = v_name,
         updated_at = now()
   WHERE id = p_workspace_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_community_workspace(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rename_community_workspace(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.rename_community_workspace(uuid, text) IS
  'F12c EC-V1a: sets custom_name (stripped at both ends of white space, control and format characters; then 1..100 characters, else invalid_name 22023) and updated_at of one community workspace. Allowed: an admin (auth_is_admin) or a caller with an active user_roles row in the workspace''s community, any role type. A missing workspace or a caller not allowed raises not_allowed (42501); so does no sign-in or a pending forced password change. Changes no other column.';
