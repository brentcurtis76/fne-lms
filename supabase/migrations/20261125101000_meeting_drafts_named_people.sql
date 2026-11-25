-- =============================================================================
-- 20261125101000_meeting_drafts_named_people.sql — GENERA fixes F25, build B,
-- item EC-R16.
--
-- Owner rule (17 Nov 2026, widened 20 Nov 2026): a draft meeting (status
-- 'borrador') is seen only by its creator, the people named on it (its
-- facilitator, its secretary, a person with a co_editor row on it, with or
-- without provenance), an active admin and an active leader of the meeting's
-- community — until it is finalised or moved to another state.
--
--   1. public.can_see_meeting_draft: the people above.
--   2. A restrictive SELECT policy on community_meetings: a draft row is seen
--      only by them. The attendee list follows the meeting row already
--      (20261003100000 "Users can view meeting attendees").
--   3. can_read_meeting_content: for a draft, only those people read its
--      agreements, commitments, tasks and documents (the assignee branches of
--      commitments and tasks are not touched).
--   4. can_edit_meeting_verified: a consultor edits a draft only when named on
--      it; admins and the named branches are unchanged.
--   5. get_overdue_items: the same items as before, but a draft's title is
--      given only to the people who see the draft; anyone else (such as the
--      assignee of an item on it) gets 'Reunión en borrador'.
--
-- Meetings in any other state are read and edited exactly as before.
-- Additive only: one new function, one new policy, three functions replaced with
-- the same signature and attributes (their grants stay). No data change.
-- =============================================================================

-- 1. Who sees a draft ---------------------------------------------------------
CREATE FUNCTION public.can_see_meeting_draft(check_user_id uuid, check_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF check_meeting_id IS NULL OR NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND role_type = 'admin' AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.community_meetings cm
      JOIN public.community_workspaces cw ON cw.id = cm.workspace_id
     WHERE cm.id = check_meeting_id
       AND (
         cm.created_by = check_user_id
         OR cm.facilitator_id = check_user_id
         OR cm.secretary_id = check_user_id
         OR EXISTS (
           SELECT 1 FROM public.meeting_attendees ma
            WHERE ma.meeting_id = cm.id AND ma.user_id = check_user_id AND ma.role = 'co_editor'
         )
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = check_user_id AND ur.community_id = cw.community_id
              AND ur.role_type = 'lider_comunidad' AND ur.is_active = true
         )
       )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_see_meeting_draft(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_see_meeting_draft(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_see_meeting_draft(uuid, uuid) IS
  'EC-R16: may this user see a draft meeting? Its creator, facilitator or secretary, a person with a co_editor row on it (with or without provenance), an active admin, or an active leader of the meeting''s community. Does not look at the state: callers apply it to drafts only.';

-- 2. A draft row is seen only by those people ----------------------------------
-- The inline created_by test is needed: the helper looks the row up, and a row
-- being inserted in the same statement (INSERT ... RETURNING) is not visible to
-- it yet. The helper is SECURITY DEFINER and reads meeting_attendees directly,
-- so this policy does not recurse through the attendee policy.
CREATE POLICY "Drafts are seen only by the people named on them" ON public.community_meetings
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (status IS DISTINCT FROM 'borrador'::public.meeting_status
         OR created_by = auth.uid()
         OR public.can_see_meeting_draft(auth.uid(), id));
COMMENT ON POLICY "Drafts are seen only by the people named on them" ON public.community_meetings IS
  'EC-R16: a draft (status borrador) is seen only by its creator, the people named on it, an active admin and an active leader of its community. Other states are unaffected.';

-- 3. A draft's content is read only by those people ---------------------------
CREATE OR REPLACE FUNCTION public.can_read_meeting_content(check_user_id uuid, check_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF check_meeting_id IS NULL OR NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;
  -- Definer callers (storage policies, get_overdue_items) bypass the table
  -- guard policies, so the forced-password-change gate is applied here too.
  IF auth.uid() IS NOT NULL AND NOT public.password_change_gate_ok() THEN
    RETURN false;
  END IF;

  -- EC-R16: a draft's content is read only by the people who see the draft.
  IF EXISTS (
    SELECT 1 FROM public.community_meetings cm
     WHERE cm.id = check_meeting_id AND cm.status = 'borrador'::public.meeting_status
  ) THEN
    RETURN public.can_see_meeting_draft(check_user_id, check_meeting_id);
  END IF;

  IF public.can_edit_meeting_verified(check_user_id, check_meeting_id) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
           SELECT 1 FROM public.meeting_attendees ma
            WHERE ma.meeting_id = check_meeting_id AND ma.user_id = check_user_id
         )
      OR EXISTS (
           SELECT 1 FROM public.meeting_read_grants g
            WHERE g.meeting_id = check_meeting_id AND g.user_id = check_user_id
         );
END;
$$;
COMMENT ON FUNCTION public.can_read_meeting_content(uuid, uuid) IS
  'SM-H8: may this user read the meeting''s agreements, commitments, tasks and documents? Verified editors, participants, read grants. EC-R16: for a draft, only the people of can_see_meeting_draft.';

-- 4. A consultor edits a draft only when named on it ---------------------------
CREATE OR REPLACE FUNCTION public.can_edit_meeting_verified(check_user_id uuid, check_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF check_meeting_id IS NULL OR NOT public.auth_actor_bound(check_user_id) THEN
    RETURN false;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND role_type = 'admin' AND is_active = true
  ) THEN
    RETURN true;
  END IF;

  -- EC-R16: a consultor's global right covers every meeting except a draft.
  IF EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = check_user_id AND role_type = 'consultor' AND is_active = true
  ) AND EXISTS (
    SELECT 1 FROM public.community_meetings cm
     WHERE cm.id = check_meeting_id AND cm.status IS DISTINCT FROM 'borrador'::public.meeting_status
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.community_meetings cm
      JOIN public.community_workspaces cw ON cw.id = cm.workspace_id
     WHERE cm.id = check_meeting_id
       AND (
         cm.created_by = check_user_id
         OR cm.facilitator_id = check_user_id
         OR cm.secretary_id = check_user_id
         OR EXISTS (
           SELECT 1
             FROM public.meeting_attendees ma
             JOIN public.meeting_co_editor_grants g
               ON g.attendee_id = ma.id AND g.meeting_id = ma.meeting_id AND g.user_id = ma.user_id
            WHERE ma.meeting_id = cm.id AND ma.user_id = check_user_id AND ma.role = 'co_editor'
         )
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = check_user_id AND ur.community_id = cw.community_id
              AND ur.role_type = 'lider_comunidad' AND ur.is_active = true
         )
       )
  );
END;
$$;
COMMENT ON FUNCTION public.can_edit_meeting_verified(uuid, uuid) IS
  'W-B3a-01: can_edit_meeting without trusting unverified co_editor rows. Keep the non-co_editor branches in step with can_edit_meeting. EC-R16: a consultor edits a draft only when named on it (creator, facilitator, secretary or verified co-editor).';

-- 5. The overdue list does not give a draft's title away ----------------------
-- Body of 20261003100000 (section 11) unchanged — the same rows come back,
-- including the assignee's own item on a draft (unchanged on purpose) — except
-- meeting_title: for a draft it is the real title only when the person asking
-- (auth.uid()) sees the draft; otherwise the fixed text 'Reunión en borrador'.
-- With no auth.uid() (service role) the real title is returned as before.
CREATE OR REPLACE FUNCTION public.get_overdue_items(p_workspace_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(item_type text, item_id uuid, title text, due_date date, days_overdue integer, assigned_to uuid, meeting_title text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_user_filter uuid := p_user_id;
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NOT NULL THEN
    -- Definer function: the table guard policies do not apply, so the
    -- forced-password-change gate is checked here.
    IF NOT public.password_change_gate_ok() THEN
      RETURN;
    END IF;
    IF p_workspace_id IS NOT NULL THEN
      PERFORM public.assert_workspace_access(p_workspace_id);
    END IF;
    IF p_user_id IS NOT NULL THEN
      PERFORM public.assert_actor_matches(p_user_id);
    ELSIF p_workspace_id IS NULL AND NOT public.auth_is_admin() THEN
      v_user_filter := v_actor;
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'commitment'::TEXT as item_type,
    mc.id as item_id,
    mc.commitment_text as title,
    mc.due_date,
    (CURRENT_DATE - mc.due_date)::INTEGER as days_overdue,
    mc.assigned_to,
    CASE
      WHEN v_actor IS NULL
        OR cm.status IS DISTINCT FROM 'borrador'::public.meeting_status
        OR public.can_see_meeting_draft(v_actor, cm.id)
      THEN cm.title
      ELSE 'Reunión en borrador'::TEXT
    END as meeting_title
  FROM meeting_commitments mc
  JOIN community_meetings cm ON cm.id = mc.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mc.status IN ('pendiente', 'en_progreso')
    AND mc.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (v_user_filter IS NULL OR mc.assigned_to = v_user_filter)
    AND (v_actor IS NULL OR mc.assigned_to = v_actor OR public.can_read_meeting_content(v_actor, cm.id))

  UNION ALL

  SELECT
    'task'::TEXT as item_type,
    mt.id as item_id,
    mt.task_title as title,
    mt.due_date,
    (CURRENT_DATE - mt.due_date)::INTEGER as days_overdue,
    mt.assigned_to,
    CASE
      WHEN v_actor IS NULL
        OR cm.status IS DISTINCT FROM 'borrador'::public.meeting_status
        OR public.can_see_meeting_draft(v_actor, cm.id)
      THEN cm.title
      ELSE 'Reunión en borrador'::TEXT
    END as meeting_title
  FROM meeting_tasks mt
  JOIN community_meetings cm ON cm.id = mt.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mt.status IN ('pendiente', 'en_progreso')
    AND mt.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (v_user_filter IS NULL OR mt.assigned_to = v_user_filter)
    AND (v_actor IS NULL OR mt.assigned_to = v_actor OR public.can_read_meeting_content(v_actor, cm.id))

  ORDER BY days_overdue DESC, due_date DESC;
END;
$function$;
REVOKE ALL ON FUNCTION public.get_overdue_items(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overdue_items(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_items(uuid, uuid) TO service_role;
COMMENT ON FUNCTION public.get_overdue_items(uuid, uuid) IS
  'Overdue commitments and tasks for a workspace or for the caller. A signed-in caller gets only the items they may read (as a reader of the meeting or as the assignee). EC-R16: for a draft meeting, meeting_title is the real title only for a person who sees the draft (can_see_meeting_draft); anyone else, such as the assignee of an item on it, gets the text ''Reunión en borrador''. The service role gets the real title.';
