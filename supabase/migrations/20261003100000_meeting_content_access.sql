-- =============================================================================
-- SM-H8 (W-MEET-01): who may read and delete a meeting's content.
--
-- Owner decisions (2 Oct 2026, reviews/sm-hand-20261001/SM-H8-DECISIONS-20261002.md):
--   * A meeting's agreements, commitments, tasks and documents may be read by
--     its editors (unchanged: creator, facilitator, secretary, verified
--     co-editor, community leader, admin, consultor), by the people who took
--     part in it (meeting_attendees, any role) and by people an editor adds
--     later (e.g. someone absent). Nobody else. Title, date, summary and notes
--     stay visible to the community (community_meetings is not changed here).
--   * A meeting may be deleted only by its creator, the community leader or an
--     admin.
--
-- Before this migration (baseline + 20260925182000):
--   meeting_commitments  SELECT / INSERT / DELETE: any signed-in user
--   meeting_attendees    SELECT / INSERT / DELETE: any signed-in user, so
--                        anyone could make themselves a "participant"
--   meeting_attachments  SELECT: any signed-in user; bucket meeting-documents
--                        public in Production with bucket-only storage policies
--   community_meetings   DELETE: any active member of the community
--   meeting_agreements / meeting_tasks DELETE: creator/admin/leader only, so a
--                        facilitator or co-editor removing an item failed
--   get_overdue_items    workspace mode returned every commitment/task title
--                        to any member of the workspace
--
-- Forward-only and additive: existing policies are narrowed with ALTER POLICY
-- (historical names kept, COMMENT explains), new policies/functions are added,
-- nothing is dropped or backfilled; the only data change is the
-- meeting-documents bucket becoming private.
-- =============================================================================

-- 1. Read grants ("people the editors add later") --------------------------
CREATE TABLE public.meeting_read_grants (
  meeting_id uuid NOT NULL REFERENCES public.community_meetings(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid NOT NULL REFERENCES public.profiles(id),
  granted_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (meeting_id, user_id)
);
CREATE INDEX idx_meeting_read_grants_user_id ON public.meeting_read_grants (user_id);
ALTER TABLE public.meeting_read_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meeting_read_grants FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON TABLE public.meeting_read_grants TO authenticated;
SELECT public.apply_forced_password_change_guard('public', 'meeting_read_grants');
COMMENT ON TABLE public.meeting_read_grants IS
  'SM-H8: people a verified meeting editor added as readers of the meeting content (agreements, commitments, tasks, documents) without being participants.';

-- 2. Predicates ------------------------------------------------------------
-- Readers: verified editors, participants (any meeting_attendees row) and
-- people with a read grant.
CREATE FUNCTION public.can_read_meeting_content(check_user_id uuid, check_meeting_id uuid)
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
REVOKE ALL ON FUNCTION public.can_read_meeting_content(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_meeting_content(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_read_meeting_content(uuid, uuid) IS
  'SM-H8: may this user read the meeting''s agreements, commitments, tasks and documents? Verified editors, participants, read grants.';

-- Deleters: the creator, an active admin, or an active leader of the meeting's
-- community. Same rule as the former "Meeting creators and authorized users can
-- delete meetings" policy and lib/meetings/deletion.ts canDeleteMeeting.
CREATE FUNCTION public.can_delete_meeting(check_user_id uuid, check_meeting_id uuid)
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
         OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = check_user_id AND ur.community_id = cw.community_id
              AND ur.role_type = 'lider_comunidad' AND ur.is_active = true
         )
       )
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_delete_meeting(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_delete_meeting(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_delete_meeting(uuid, uuid) IS
  'SM-H8: creator, active admin or active community leader of the meeting''s community.';

-- A read grant may only name someone who holds an active role in the meeting's
-- community. Answers only a verified editor of that meeting (the person adding
-- the grant) or a backend caller, so it cannot be used to probe membership.
CREATE FUNCTION public.is_meeting_community_member(check_user_id uuid, check_meeting_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    IF NOT public.auth_is_backend_caller() THEN
      RETURN false;
    END IF;
  ELSIF NOT public.can_edit_meeting_verified(auth.uid(), check_meeting_id) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
      FROM public.community_meetings cm
      JOIN public.community_workspaces cw ON cw.id = cm.workspace_id
      JOIN public.user_roles ur ON ur.community_id = cw.community_id
     WHERE cm.id = check_meeting_id AND ur.user_id = check_user_id AND ur.is_active = true
  );
END;
$$;
REVOKE ALL ON FUNCTION public.is_meeting_community_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_meeting_community_member(uuid, uuid) TO authenticated, service_role;

-- Storage paths are <workspace_id>/<meeting_id>/<file>. NULL for anything else.
CREATE FUNCTION public.meeting_document_meeting_id(object_name text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN split_part(object_name, '/', 2) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    THEN split_part(object_name, '/', 2)::uuid
  END;
$$;
REVOKE ALL ON FUNCTION public.meeting_document_meeting_id(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meeting_document_meeting_id(text) TO authenticated, service_role;

-- Upload: a verified editor of the meeting, under that meeting's workspace folder.
CREATE FUNCTION public.can_upload_meeting_document(check_user_id uuid, object_name text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_meeting uuid := public.meeting_document_meeting_id(object_name);
BEGIN
  IF v_meeting IS NULL OR NOT public.can_edit_meeting_verified(check_user_id, v_meeting) THEN
    RETURN false;
  END IF;
  RETURN EXISTS (
    SELECT 1 FROM public.community_meetings cm
     WHERE cm.id = v_meeting AND cm.workspace_id::text = split_part(object_name, '/', 1)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.can_upload_meeting_document(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_upload_meeting_document(uuid, text) TO authenticated, service_role;

-- 3. meeting_read_grants policies --------------------------------------------
CREATE POLICY "Editors and the grantee can view read grants" ON public.meeting_read_grants
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Verified meeting editors can add read grants" ON public.meeting_read_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    granted_by = auth.uid()
    AND public.can_edit_meeting_verified(auth.uid(), meeting_id)
    AND public.is_meeting_community_member(user_id, meeting_id)
  );
CREATE POLICY "Verified meeting editors can remove read grants" ON public.meeting_read_grants
  FOR DELETE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- Existing policies are narrowed in place with ALTER POLICY (additive-only
-- rule: nothing is dropped); each keeps its historical name with a COMMENT.

-- 4. community_meetings ----------------------------------------------------------
ALTER POLICY "Community members can delete meetings" ON public.community_meetings
  TO authenticated
  USING (public.can_delete_meeting(auth.uid(), id));
COMMENT ON POLICY "Community members can delete meetings" ON public.community_meetings IS
  'Historical name. Since 20261003100000 (SM-H8) only the creator, the community leader or an admin (can_delete_meeting).';
ALTER POLICY "Meeting creators and authorized users can delete meetings" ON public.community_meetings
  TO authenticated
  USING (public.can_delete_meeting(auth.uid(), id));
COMMENT ON POLICY "Meeting creators and authorized users can delete meetings" ON public.community_meetings IS
  'SM-H8: same rule as before, now through can_delete_meeting so the UI rights RPC and this policy cannot drift.';

-- The baseline UPDATE policy trusts unverified co_editor rows (can_edit_meeting).
CREATE POLICY "Meeting updates require a verified meeting editor" ON public.community_meetings
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), id))
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), id));

-- An editor must not move a meeting to another workspace or change its creator
-- (that would hand out deletion rights), and archiving (is_active / deleted_*)
-- is a deletion right. Signed-in callers only; backend jobs are unaffected.
CREATE FUNCTION public.guard_community_meeting_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.created_by IS DISTINCT FROM OLD.created_by OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id THEN
    RAISE EXCEPTION 'SM-H8: a meeting''s creator and workspace cannot be changed'
      USING ERRCODE = '42501';
  END IF;
  IF (NEW.is_active IS DISTINCT FROM OLD.is_active
      OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at
      OR NEW.deleted_by IS DISTINCT FROM OLD.deleted_by)
     AND NOT public.can_delete_meeting(v_actor, OLD.id) THEN
    RAISE EXCEPTION 'SM-H8: only the creator, the community leader or an admin can archive a meeting'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_community_meeting_update() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_guard_community_meeting_update
  BEFORE UPDATE ON public.community_meetings
  FOR EACH ROW EXECUTE FUNCTION public.guard_community_meeting_update();

-- Finalize e-mail audience (owner decision 4): from now on the summary goes
-- to the people with access, never the whole community. The stored
-- finalize_audience keeps its values ('community' / 'attended'); this column
-- marks finalizations made under the new rule, so meetings finalized before
-- SM-H8 keep saying truthfully that their summary went to the community.
-- Additive (the CHECK on finalize_audience is not widened: no DROP).
ALTER TABLE public.community_meetings ADD COLUMN finalize_with_access boolean;
COMMENT ON COLUMN public.community_meetings.finalize_with_access IS
  'SM-H8: true when the finalize summary went to the people with access (leaders, creator/facilitator/secretary, participants, read grants). NULL for finalizations before SM-H8.';

-- 5. meeting_agreements ----------------------------------------------------------
ALTER POLICY "Verified meeting editors can view agreements" ON public.meeting_agreements
  USING (public.can_read_meeting_content(auth.uid(), meeting_id));
COMMENT ON POLICY "Verified meeting editors can view agreements" ON public.meeting_agreements IS
  'Historical name. Since 20261003100000 (SM-H8): meeting readers (verified editors, participants, read grants).';
CREATE POLICY "Verified meeting editors can delete agreements" ON public.meeting_agreements
  FOR DELETE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- 6. meeting_tasks ---------------------------------------------------------------
ALTER POLICY "Verified meeting editors can view tasks" ON public.meeting_tasks
  USING (public.can_read_meeting_content(auth.uid(), meeting_id) OR assigned_to = auth.uid());
COMMENT ON POLICY "Verified meeting editors can view tasks" ON public.meeting_tasks IS
  'Historical name. Since 20261003100000 (SM-H8): meeting readers, and the assignee of the task.';
CREATE POLICY "Verified meeting editors can delete tasks" ON public.meeting_tasks
  FOR DELETE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- 7. meeting_commitments ---------------------------------------------------------
ALTER POLICY "Users can view meeting commitments" ON public.meeting_commitments
  TO authenticated
  USING (public.can_read_meeting_content(auth.uid(), meeting_id) OR assigned_to = auth.uid());
COMMENT ON POLICY "Users can view meeting commitments" ON public.meeting_commitments IS
  'Historical name. Since 20261003100000 (SM-H8): meeting readers, and the assignee of the commitment (was: any signed-in user).';
ALTER POLICY "Users can create meeting commitments" ON public.meeting_commitments
  TO authenticated
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can create meeting commitments" ON public.meeting_commitments IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors only (was: any signed-in user).';
ALTER POLICY "Users can delete meeting commitments" ON public.meeting_commitments
  TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can delete meeting commitments" ON public.meeting_commitments IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors only (was: any signed-in user).';
CREATE POLICY "Commitment updates require a verified meeting editor" ON public.meeting_commitments
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id))
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- 8. meeting_attendees -----------------------------------------------------------
-- The participant list stays visible to whoever can see the meeting itself.
-- The subquery runs under the caller's community_meetings policies, none of
-- which reads meeting_attendees, so there is no recursion.
ALTER POLICY "Users can view meeting attendees" ON public.meeting_attendees
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_meetings cm WHERE cm.id = meeting_attendees.meeting_id));
COMMENT ON POLICY "Users can view meeting attendees" ON public.meeting_attendees IS
  'Historical name. Since 20261003100000 (SM-H8): people who can see the meeting (was: any signed-in user).';
ALTER POLICY "Users can insert meeting attendees" ON public.meeting_attendees
  TO authenticated
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can insert meeting attendees" ON public.meeting_attendees IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors only; a participant row grants read access (was: any signed-in user).';
ALTER POLICY "Users can delete meeting attendees" ON public.meeting_attendees
  TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can delete meeting attendees" ON public.meeting_attendees IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors only (was: any signed-in user).';
CREATE POLICY "Attendee updates require a verified meeting editor" ON public.meeting_attendees
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id))
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- 9. meeting_attachments ---------------------------------------------------------
-- Row and stored file are removed by the same people (storage DELETE below).
ALTER POLICY "Users can view meeting attachments" ON public.meeting_attachments
  TO authenticated
  USING (public.can_read_meeting_content(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can view meeting attachments" ON public.meeting_attachments IS
  'Historical name. Since 20261003100000 (SM-H8): meeting readers (was: any signed-in user).';
ALTER POLICY "Users can upload meeting attachments" ON public.meeting_attachments
  TO authenticated
  WITH CHECK (uploaded_by = auth.uid() AND public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can upload meeting attachments" ON public.meeting_attachments IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors, as themselves.';
ALTER POLICY "Users can delete their own meeting attachments" ON public.meeting_attachments
  TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));
COMMENT ON POLICY "Users can delete their own meeting attachments" ON public.meeting_attachments IS
  'Historical name. Since 20261003100000 (SM-H8): verified meeting editors (matches the storage DELETE policy).';

-- 10. Storage: meeting-documents -------------------------------------------------
-- Private bucket; reads go through signed URLs created by people who pass the
-- SELECT rule. Production also holds four bucket-only permissive policies that
-- are not in the migration history ("Authenticated users can view / upload
-- meeting documents", "Users can update / delete their own meeting documents");
-- they are left in place and narrowed by the RESTRICTIVE policies below, which
-- only bite inside this bucket. storage.objects has no
-- forced_password_change_guard, so the gate is repeated here.
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('meeting-documents', 'meeting-documents', false, 10485760)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Meeting readers can view meeting documents" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'meeting-documents'
    AND (SELECT public.password_change_gate_ok())
    AND public.can_read_meeting_content(auth.uid(), public.meeting_document_meeting_id(name))
  );
CREATE POLICY "Verified meeting editors can upload meeting documents" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'meeting-documents'
    AND (SELECT public.password_change_gate_ok())
    AND public.can_upload_meeting_document(auth.uid(), name)
  );
CREATE POLICY "Verified meeting editors can delete meeting documents" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'meeting-documents'
    AND (SELECT public.password_change_gate_ok())
    AND public.can_edit_meeting_verified(auth.uid(), public.meeting_document_meeting_id(name))
  );

CREATE POLICY "Meeting documents: read limit" ON storage.objects
  AS RESTRICTIVE FOR SELECT TO authenticated
  USING (
    bucket_id IS DISTINCT FROM 'meeting-documents'
    OR ((SELECT public.password_change_gate_ok())
        AND public.can_read_meeting_content(auth.uid(), public.meeting_document_meeting_id(name)))
  );
CREATE POLICY "Meeting documents: upload limit" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IS DISTINCT FROM 'meeting-documents'
    OR ((SELECT public.password_change_gate_ok())
        AND public.can_upload_meeting_document(auth.uid(), name))
  );
CREATE POLICY "Meeting documents: no updates" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (bucket_id IS DISTINCT FROM 'meeting-documents')
  WITH CHECK (bucket_id IS DISTINCT FROM 'meeting-documents');
CREATE POLICY "Meeting documents: delete limit" ON storage.objects
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (
    bucket_id IS DISTINCT FROM 'meeting-documents'
    OR ((SELECT public.password_change_gate_ok())
        AND public.can_edit_meeting_verified(auth.uid(), public.meeting_document_meeting_id(name)))
  );

-- 11. get_overdue_items: signed-in callers only see items they may read (as a
--     reader of the meeting or as the assignee) ----------
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
    cm.title as meeting_title
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
    cm.title as meeting_title
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

-- 12. Rights the UI shows (buttons must match the policies above) ----------------
-- SECURITY INVOKER: only meetings the caller can already see are returned.
CREATE FUNCTION public.get_my_meeting_rights(p_meeting_ids uuid[])
RETURNS TABLE(meeting_id uuid, can_edit boolean, can_delete boolean, can_read_content boolean)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  SELECT cm.id,
         public.can_edit_meeting_verified(auth.uid(), cm.id),
         public.can_delete_meeting(auth.uid(), cm.id),
         public.can_read_meeting_content(auth.uid(), cm.id)
    FROM public.community_meetings cm
   WHERE auth.uid() IS NOT NULL AND cm.id = ANY (p_meeting_ids);
$$;
REVOKE ALL ON FUNCTION public.get_my_meeting_rights(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_meeting_rights(uuid[]) TO authenticated;
