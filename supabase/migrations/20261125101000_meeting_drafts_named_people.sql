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
--
-- Meetings in any other state are read and edited exactly as before.
-- Additive only: one new function, one new policy, two functions replaced with
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
