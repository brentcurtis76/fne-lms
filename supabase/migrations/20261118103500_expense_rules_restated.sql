-- GENERA: nine access rules of Rendición de Gastos (three on the reports, six on their items) are stated again,
-- with the SAME meaning, in a spelling that survives a dump and a rebuild of the database.
--
-- Why: migration 20261117166000_expenses_by_role.sql (live in Production since 18 Nov 2026) wrote these nine rules
-- as `status IN ('draft', 'rejected')` on a character varying column. PostgreSQL stores that as
--   (status)::text = ANY ((ARRAY['draft'::character varying, 'rejected'::character varying])::text[])
-- and, after a dump and a rebuild of the database, as
--   (status)::text = ANY (ARRAY[('draft'::character varying)::text, ('rejected'::character varying)::text])
-- The same rule, another spelling. The release tool compares Production with a rebuilt copy by each rule's text,
-- found the nine different, and refused to rehearse any further database change.
--
-- What this does: ALTER POLICY on those nine rules only, with the comparisons written as explicit text values,
-- which PostgreSQL spells the same way before and after a rebuild. Same tables, same commands, same people, same
-- states; nothing is created or dropped and no row is touched.
--
-- Production: the owner applied exactly these nine statements to Production by hand on 18 Nov 2026, because the
-- release tool itself was blocked by this defect. There this file is therefore a repeat, and applying it again
-- changes nothing. Everywhere else (every database built from the repository) it makes the rules equal to that.
-- The release tool applies this file in one transaction of its own.

ALTER POLICY "expense_reports_update_states" ON public.expense_reports
  USING (
    (submitted_by = auth.uid() AND status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
    OR (public.auth_is_admin() AND NOT (status::text = 'approved'::text AND submitted_by = auth.uid()))
  )
  WITH CHECK (public.auth_is_admin() OR status::text = ANY (ARRAY['draft'::text, 'rejected'::text, 'submitted'::text]));

ALTER POLICY "expense_reports_delete_states" ON public.expense_reports
  USING (
    (submitted_by = auth.uid() AND status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
    OR (public.auth_is_admin() AND NOT (status::text = ANY (ARRAY['submitted'::text, 'approved'::text]) AND submitted_by = auth.uid()))
  );

ALTER POLICY "expense_reports_insert_states" ON public.expense_reports
  WITH CHECK (public.auth_is_admin() OR status::text = ANY (ARRAY['draft'::text, 'submitted'::text]));

ALTER POLICY "expense_items_insert" ON public.expense_items
  WITH CHECK (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text])))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_update" ON public.expense_items
  USING (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text])))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  )
  WITH CHECK (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text])))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_delete" ON public.expense_items
  USING (
    (EXISTS (SELECT 1
               FROM public.expense_reports er
              WHERE er.id = expense_items.report_id
                AND er.submitted_by = auth.uid()
                AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text])))
    AND (public.auth_can_file_expenses() OR COALESCE(public.is_global_admin(auth.uid()), false))
  );

ALTER POLICY "expense_items_insert_states" ON public.expense_items
  WITH CHECK (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
                    OR (public.auth_is_admin() AND NOT (er.status::text = ANY (ARRAY['submitted'::text, 'approved'::text]) AND er.submitted_by = auth.uid()))))
  );

ALTER POLICY "expense_items_update_states" ON public.expense_items
  USING (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
                    OR (public.auth_is_admin() AND NOT (er.status::text = ANY (ARRAY['submitted'::text, 'approved'::text]) AND er.submitted_by = auth.uid()))))
  )
  WITH CHECK (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
                    OR (public.auth_is_admin() AND NOT (er.status::text = ANY (ARRAY['submitted'::text, 'approved'::text]) AND er.submitted_by = auth.uid()))))
  );

ALTER POLICY "expense_items_delete_states" ON public.expense_items
  USING (
    EXISTS (SELECT 1
              FROM public.expense_reports er
             WHERE er.id = expense_items.report_id
               AND ((er.submitted_by = auth.uid() AND er.status::text = ANY (ARRAY['draft'::text, 'rejected'::text]))
                    OR (public.auth_is_admin() AND NOT (er.status::text = ANY (ARRAY['submitted'::text, 'approved'::text]) AND er.submitted_by = auth.uid()))))
  );
