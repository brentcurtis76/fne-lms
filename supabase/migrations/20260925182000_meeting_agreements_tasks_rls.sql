-- =============================================================================
-- W-B3a-01 (SM-22): verified co-editor grants and meeting child-table RLS.
--
-- meeting_agreements / meeting_tasks had UPDATE and DELETE policies but no
-- INSERT or SELECT policy, so editors could not save or reopen them. The
-- ledger's predicate can_edit_meeting() trusts any meeting_attendees row with
-- role 'co_editor', and meeting_attendees INSERT accepts any signed-in user, so
-- child access keyed on it alone lets anyone self-assign co_editor and read or
-- write another tenant's rows.
--
-- This migration is additive only:
--   1. meeting_co_editor_grants records provenance for co_editor grants made by
--      a verified editor (written only by a trigger; no API access).
--   2. can_edit_meeting_verified() = can_edit_meeting() with the co_editor branch
--      limited to rows that carry that provenance. Historical co_editor rows
--      have none, so they gain no child access from this migration.
--   3. A restrictive policy on meeting_attendees: only a verified editor may
--      write a row whose role is co_editor. Other attendee rows are unaffected.
--   4. Child SELECT/INSERT for verified editors, and a restrictive UPDATE so an
--      unverified co_editor row cannot drive child writes either.
-- DELETE policies and every other existing policy are unchanged.
-- =============================================================================

-- 1. Grant provenance ---------------------------------------------------------
CREATE TABLE public.meeting_co_editor_grants (
  attendee_id uuid PRIMARY KEY REFERENCES public.meeting_attendees(id) ON DELETE CASCADE,
  meeting_id  uuid NOT NULL,
  user_id     uuid NOT NULL,
  granted_by  uuid NOT NULL,
  granted_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meeting_co_editor_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meeting_co_editor_grants FROM anon, authenticated;
SELECT public.apply_forced_password_change_guard('public', 'meeting_co_editor_grants');
COMMENT ON TABLE public.meeting_co_editor_grants IS
  'W-B3a-01: one row per meeting_attendees co_editor grant made by a user who could already edit the meeting (verified). Written only by trg_record_meeting_co_editor_grant; no API role has access.';

-- 2. Verified editor predicate -----------------------------------------------
-- Mirrors can_edit_meeting (20260908180400_c1_function_exposure.sql) except
-- that a co_editor row counts only when its grant provenance matches it.
CREATE FUNCTION public.can_edit_meeting_verified(check_user_id uuid, check_meeting_id uuid)
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
     WHERE user_id = check_user_id AND role_type IN ('admin','consultor') AND is_active = true
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
REVOKE ALL ON FUNCTION public.can_edit_meeting_verified(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_edit_meeting_verified(uuid, uuid) TO authenticated, service_role;
COMMENT ON FUNCTION public.can_edit_meeting_verified(uuid, uuid) IS
  'W-B3a-01: can_edit_meeting without trusting unverified co_editor rows. Keep the non-co_editor branches in step with can_edit_meeting.';

-- 3. Provenance trigger ------------------------------------------------------
-- Records a grant only on a transition into co_editor (insert, role change,
-- or user/meeting change) made by a signed-in verified editor. AFTER trigger:
-- the grantee's own new row carries no provenance yet, so it cannot vouch for
-- itself. Backend (no auth.uid()) and unverified writes record nothing.
CREATE FUNCTION public.record_meeting_co_editor_grant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF NEW.role IS DISTINCT FROM 'co_editor' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.role = 'co_editor'
     AND OLD.user_id = NEW.user_id AND OLD.meeting_id = NEW.meeting_id THEN
    RETURN NULL;
  END IF;
  IF v_actor IS NULL OR NOT public.can_edit_meeting_verified(v_actor, NEW.meeting_id) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.meeting_co_editor_grants (attendee_id, meeting_id, user_id, granted_by)
  VALUES (NEW.id, NEW.meeting_id, NEW.user_id, v_actor)
  ON CONFLICT (attendee_id) DO UPDATE
    SET meeting_id = EXCLUDED.meeting_id, user_id = EXCLUDED.user_id,
        granted_by = EXCLUDED.granted_by, granted_at = now();
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.record_meeting_co_editor_grant() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_record_meeting_co_editor_grant
  AFTER INSERT OR UPDATE OF role, user_id, meeting_id ON public.meeting_attendees
  FOR EACH ROW EXECUTE FUNCTION public.record_meeting_co_editor_grant();

-- 4. Only a verified editor may write a co_editor attendee row ---------------
CREATE POLICY "Only verified meeting editors grant co_editor" ON public.meeting_attendees
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (role IS DISTINCT FROM 'co_editor' OR public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Only verified meeting editors set co_editor" ON public.meeting_attendees
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (role IS DISTINCT FROM 'co_editor' OR public.can_edit_meeting_verified(auth.uid(), meeting_id));

-- 5. Child tables ------------------------------------------------------------
CREATE POLICY "Verified meeting editors can view agreements" ON public.meeting_agreements
  FOR SELECT TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Verified meeting editors can insert agreements" ON public.meeting_agreements
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Agreement updates require a verified meeting editor" ON public.meeting_agreements
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id))
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));

CREATE POLICY "Verified meeting editors can view tasks" ON public.meeting_tasks
  FOR SELECT TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Verified meeting editors can insert tasks" ON public.meeting_tasks
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));
CREATE POLICY "Task updates require a verified meeting editor" ON public.meeting_tasks
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.can_edit_meeting_verified(auth.uid(), meeting_id))
  WITH CHECK (public.can_edit_meeting_verified(auth.uid(), meeting_id));
