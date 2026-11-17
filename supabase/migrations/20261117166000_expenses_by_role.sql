-- =============================================================================
-- 20261117166000_expenses_by_role.sql — GENERA fixes F7d (GES-1.3, E1)
--
-- Rendición de Gastos by role. Decided (Brent, 17 Nov 2026): active admins,
-- consultores and community managers file expenses; nobody else sees or opens
-- them; a non-admin sees only their own reports; admins see all. The one-by-one
-- switch (expense_report_access.can_submit) is retired: no rule here depends on
-- it any more (the table stays). Any admin approves or rejects any report, their
-- own included. A sent report cannot be changed by its author; an approved
-- report is closed to its author even when the author is an admin (another
-- admin can still correct it); an author deletes only their own draft or
-- rejected report; after a rejection the author corrects and resends the same
-- report. The history of sends, rejections, resends, approvals and reopenings
-- is written by the database itself.
--
--   a. public.auth_can_file_expenses()
--   b. expense_reports: two rules altered, four restrictive rules added
--   c. expense_items: four rules altered, four restrictive rules added
--   d. public.expense_report_events + its trigger
--   e. the receipts store `boletas`: public.file_store_allows (boletas branch
--      only) and four permissive storage rules for filers (placed before the
--      trigger of part d; part e is written before part d for that reason)
--
-- Additive only: no rule is dropped; existing rules are changed with ALTER
-- POLICY. Row level security stays on everywhere.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- a. Who files
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_can_file_expenses()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.password_change_gate_ok()
     AND EXISTS (
           SELECT 1
             FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND ur.role_type IN ('admin', 'consultor', 'community_manager'));
$$;

COMMENT ON FUNCTION public.auth_can_file_expenses() IS
  'True when the calling account may file expense reports (Rendición de Gastos): signed in, past the forced-password-change gate, and holding an ACTIVE admin, consultor or community_manager role. Replaces expense_report_access.can_submit, which no rule depends on any more (F7d, 17 Nov 2026).';

REVOKE ALL ON FUNCTION public.auth_can_file_expenses() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_can_file_expenses() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_can_file_expenses() TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- b. expense_reports
-- -----------------------------------------------------------------------------
ALTER POLICY "expense_reports_access" ON public.expense_reports
  USING ((submitted_by = auth.uid()) OR public.auth_is_admin())
  WITH CHECK ((submitted_by = auth.uid()) OR public.auth_is_admin());

ALTER POLICY "expense_reports_insert" ON public.expense_reports
  WITH CHECK (submitted_by = auth.uid());

CREATE POLICY "expense_reports_filers_only" ON public.expense_reports
  AS RESTRICTIVE FOR ALL
  USING (public.auth_can_file_expenses())
  WITH CHECK (public.auth_can_file_expenses());

CREATE POLICY "expense_reports_update_states" ON public.expense_reports
  AS RESTRICTIVE FOR UPDATE
  USING (
    (submitted_by = auth.uid() AND status IN ('draft', 'rejected'))
    OR (public.auth_is_admin() AND NOT (status = 'approved' AND submitted_by = auth.uid()))
  )
  WITH CHECK (public.auth_is_admin() OR status IN ('draft', 'rejected', 'submitted'));

CREATE POLICY "expense_reports_delete_states" ON public.expense_reports
  AS RESTRICTIVE FOR DELETE
  USING (
    (submitted_by = auth.uid() AND status IN ('draft', 'rejected'))
    OR (public.auth_is_admin() AND NOT (status = 'approved' AND submitted_by = auth.uid()))
  );

CREATE POLICY "expense_reports_insert_states" ON public.expense_reports
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (public.auth_is_admin() OR status IN ('draft', 'submitted'));

-- -----------------------------------------------------------------------------
-- c. expense_items
-- -----------------------------------------------------------------------------
ALTER POLICY "expense_items_insert" ON public.expense_items
  WITH CHECK (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status IN ('draft', 'rejected')))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_update" ON public.expense_items
  USING (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status IN ('draft', 'rejected')))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  )
  WITH CHECK (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status IN ('draft', 'rejected')))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_delete" ON public.expense_items
  USING (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status IN ('draft', 'rejected')))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_select" ON public.expense_items
  USING (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND public.auth_can_file_expenses())
                    OR COALESCE(public.is_global_admin(auth.uid()), false)))
  );

CREATE POLICY "expense_items_filers_only" ON public.expense_items
  AS RESTRICTIVE FOR ALL
  USING (public.auth_can_file_expenses())
  WITH CHECK (public.auth_can_file_expenses());

CREATE POLICY "expense_items_insert_states" ON public.expense_items
  AS RESTRICTIVE FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status IN ('draft', 'rejected'))
                    OR (public.auth_is_admin() AND NOT (er.status = 'approved' AND er.submitted_by = auth.uid()))))
  );

CREATE POLICY "expense_items_update_states" ON public.expense_items
  AS RESTRICTIVE FOR UPDATE
  USING (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status IN ('draft', 'rejected'))
                    OR (public.auth_is_admin() AND NOT (er.status = 'approved' AND er.submitted_by = auth.uid()))))
  )
  WITH CHECK (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status IN ('draft', 'rejected'))
                    OR (public.auth_is_admin() AND NOT (er.status = 'approved' AND er.submitted_by = auth.uid()))))
  );

CREATE POLICY "expense_items_delete_states" ON public.expense_items
  AS RESTRICTIVE FOR DELETE
  USING (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status IN ('draft', 'rejected'))
                    OR (public.auth_is_admin() AND NOT (er.status = 'approved' AND er.submitted_by = auth.uid()))))
  );

-- -----------------------------------------------------------------------------
-- e. The receipts store `boletas` follows the role
--
-- public.file_store_allows is replaced from its latest body
-- (20261116179800_visitors_list_no_store.sql) with changes ONLY inside the
-- `WHEN 'boletas'` branch: no sign-in -> false (every action); an admin ->
-- true; a caller who does not file expenses (public.auth_can_file_expenses()
-- false) -> false, also for their own earlier uploads and whatever old
-- expense_report_access row they hold; then, for a filer: insert -> true;
-- update -> the file's owner is the caller; select and delete -> the owner, or
-- (no owner) the person the server recorded for that object, as F2b decided.
-- Every other branch, the signature, language, STABLE, SECURITY DEFINER,
-- search_path and grants are unchanged. The Telegram assistant stores with
-- the service key and is not affected.
--
-- Four permissive rules let a filer through Production's older store rules
-- (which ask for an expense_report_access row); those older rules are not
-- touched, and the restrictive file_stores_boundary_* rules (this function)
-- still decide whose file each one is. They come before the trigger of part d
-- on purpose (the release tool's check of storage rules and triggers).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.file_store_allows(p_bucket text, p_name text, p_owner uuid, p_action text, p_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid   uuid := auth.uid();
  v_name  text := coalesce(p_name, '');
  v_part  text;
  v_ws    text;
  c_uuid  constant text := '^[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}$';
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('select', 'insert', 'update', 'delete') THEN
    RETURN false;
  END IF;

  -- all buckets: a visitor never writes
  IF v_uid IS NULL AND p_action <> 'select' THEN
    RETURN false;
  END IF;

  -- all buckets: a visitor never lists (N124)
  IF v_uid IS NULL AND p_action = 'select' THEN
    RETURN false;
  END IF;

  CASE p_bucket
  WHEN 'facturas' THEN
    RETURN v_uid IS NOT NULL AND public.auth_is_admin();

  WHEN 'resources' THEN
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    IF p_action NOT IN ('select', 'insert') THEN
      RETURN false;
    END IF;
    v_part := split_part(v_name, '/', 1);
    IF v_part = 'documents' THEN
      v_ws := split_part(v_name, '/', 2);
      IF v_ws !~ c_uuid THEN
        RETURN false;
      END IF;
      RETURN coalesce(public.can_access_workspace(v_uid, v_ws::uuid), false);
    ELSIF v_part = 'news-images' AND strpos(v_name, '/') > 0 THEN
      RETURN EXISTS (SELECT 1 FROM public.user_roles ur
                      WHERE ur.user_id = v_uid AND ur.role_type = 'community_manager' AND ur.is_active = true);
    END IF;
    RETURN false;

  WHEN 'assignments' THEN
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    RETURN p_action = 'select' AND p_owner IS NOT NULL AND p_owner = v_uid;

  WHEN 'community-images' THEN
    IF p_action IN ('select', 'insert') THEN
      RETURN true;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    v_ws := substring(v_name FROM '^community-images/([0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12})-');
    IF v_ws IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.community_workspaces cw
        JOIN public.user_roles ur ON ur.community_id = cw.community_id
       WHERE cw.id = v_ws::uuid
         AND ur.user_id = v_uid
         AND ur.role_type = 'community_manager'
         AND ur.is_active = true);

  WHEN 'boletas' THEN
    -- F7d: the role decides (public.auth_can_file_expenses()), for every
    -- action; the old one-by-one switch grants nothing
    IF v_uid IS NULL THEN
      RETURN false;
    END IF;
    IF public.auth_is_admin() THEN
      RETURN true;
    END IF;
    IF NOT public.auth_can_file_expenses() THEN
      RETURN false;
    END IF;
    IF p_action = 'insert' THEN
      RETURN true;
    END IF;
    IF p_action = 'update' THEN
      -- also a move into boletas: the new row is checked here
      RETURN p_owner IS NOT NULL AND p_owner = v_uid;
    END IF;
    IF p_owner IS NOT NULL THEN
      RETURN p_owner = v_uid;
    END IF;
    IF p_id IS NULL THEN
      RETURN false;
    END IF;
    RETURN EXISTS (
      SELECT 1
        FROM public.expense_receipt_files f
       WHERE f.object_id = p_id
         AND f.user_id = v_uid);

  WHEN 'course-materials', 'course-assets', 'instructor-photos', 'contracts' THEN
    IF p_action = 'select' THEN
      RETURN true;
    END IF;
    RETURN public.auth_is_admin();

  ELSE
    -- not governed by this phase: unchanged
    RETURN true;
  END CASE;
END;
$$;

REVOKE ALL ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.file_store_allows(text, text, uuid, text, uuid) TO anon, authenticated, service_role;

CREATE POLICY "boletas_filers_insert" ON storage.objects
  AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'boletas' AND public.auth_can_file_expenses());
CREATE POLICY "boletas_filers_select" ON storage.objects
  AS PERMISSIVE FOR SELECT TO authenticated
  USING (bucket_id = 'boletas' AND public.auth_can_file_expenses());
CREATE POLICY "boletas_filers_update" ON storage.objects
  AS PERMISSIVE FOR UPDATE TO authenticated
  USING (bucket_id = 'boletas' AND public.auth_can_file_expenses())
  WITH CHECK (bucket_id = 'boletas' AND public.auth_can_file_expenses());
CREATE POLICY "boletas_filers_delete" ON storage.objects
  AS PERMISSIVE FOR DELETE TO authenticated
  USING (bucket_id = 'boletas' AND public.auth_can_file_expenses());

-- -----------------------------------------------------------------------------
-- d. The history, written by the database
-- -----------------------------------------------------------------------------
CREATE TABLE public.expense_report_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id  uuid NOT NULL,
  event      text NOT NULL CHECK (event IN ('submitted', 'resubmitted', 'rejected', 'approved', 'reopened')),
  actor_id   uuid,
  comment    text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- A plain column, no foreign key: deleting a draft never trips over its history.
CREATE INDEX expense_report_events_report_idx ON public.expense_report_events (report_id, created_at);

COMMENT ON TABLE public.expense_report_events IS
  'History of an expense report: each send, resend after a rejection, rejection (with its reason), approval and reopening, with who (actor_id; NULL when the server acts with the service key) and when. Written only by the trigger expense_reports_history on public.expense_reports; nobody inserts, updates or deletes it directly.';

ALTER TABLE public.expense_report_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.expense_report_events FROM public, anon, authenticated, service_role;
GRANT SELECT ON public.expense_report_events TO authenticated;
GRANT SELECT ON public.expense_report_events TO service_role;

-- Admins see every report's history; a filer sees the history of their own reports.
CREATE POLICY expense_report_events_read ON public.expense_report_events
  FOR SELECT TO authenticated
  USING (
    public.auth_is_admin()
    OR (public.auth_can_file_expenses()
        AND EXISTS (SELECT 1
                      FROM public.expense_reports er
                     WHERE er.id = expense_report_events.report_id
                       AND er.submitted_by = auth.uid()))
  );
CREATE POLICY expense_report_events_service_read ON public.expense_report_events
  FOR SELECT TO service_role USING (true);
SELECT public.apply_forced_password_change_guard('public', 'expense_report_events');

CREATE OR REPLACE FUNCTION public.expense_report_record_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_event   text;
  v_comment text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'submitted' THEN
      v_event := 'submitted';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'submitted' AND OLD.status = 'rejected' THEN
      v_event := 'resubmitted';
    ELSIF NEW.status = 'submitted' THEN
      v_event := 'submitted';
    ELSIF NEW.status = 'rejected' THEN
      -- also a decision reversed from approved or submitted: one line, not two
      v_event := 'rejected';
      v_comment := NEW.review_comments;
    ELSIF NEW.status = 'approved' THEN
      v_event := 'approved';
    ELSIF NEW.status = 'draft' AND OLD.status IN ('approved', 'submitted') THEN
      v_event := 'reopened';
    END IF;
  END IF;

  IF v_event IS NOT NULL THEN
    INSERT INTO public.expense_report_events (report_id, event, actor_id, comment)
    VALUES (NEW.id, v_event, auth.uid(), v_comment);
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.expense_report_record_event() IS
  'Trigger function of expense_reports_history: adds one line to public.expense_report_events when an expense report''s status actually changes (or a report is created already submitted).';

REVOKE ALL ON FUNCTION public.expense_report_record_event() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expense_report_record_event() FROM anon, authenticated;

CREATE TRIGGER expense_reports_history
  AFTER INSERT OR UPDATE OF status ON public.expense_reports
  FOR EACH ROW EXECUTE FUNCTION public.expense_report_record_event();
