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
--
-- Not in this file: part e of the brief (the receipts store `boletas`:
-- public.file_store_allows and four storage rules). It was stopped; the
-- builder's write-up (evidence/F7d/BUILD.md) says why.
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
