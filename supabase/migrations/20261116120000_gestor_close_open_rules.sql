-- =============================================================================
-- 20261116120000_gestor_close_open_rules.sql — GENERA fixes F1 (Gestor de Cambio)
--
-- Closes database rules that were left open:
--   GC-17  assessment_objectives: insert / update / delete become admin-only.
--   GC-19  instrument snapshots, expected levels, context questions and
--          sub-questions: readable by signed-in people only, not by anon.
--   GC-18  assessment_responses / assessment_instances: an assignee writes
--          answers only while the registro is pending or in_progress, and may
--          move it pending -> in_progress -> completed, nothing else.
--   C-11   (ab_migration_plan reading) is NOT part of this migration: the
--          planned rule contradicts assertions of test 086; left for the lead.
--
-- This migration only alters existing rules (ALTER POLICY). No rule is created
-- or removed, no permission or function changes, and row level security stays
-- on for every table. Tested by supabase/tests/117-gestor-open-rules.sql.
-- =============================================================================

-- GC-17 -----------------------------------------------------------------------
ALTER POLICY "assessment_objectives_insert_authenticated" ON public.assessment_objectives
  WITH CHECK (public.auth_is_assessment_admin());

ALTER POLICY "assessment_objectives_update_authenticated" ON public.assessment_objectives
  USING (public.auth_is_assessment_admin()) WITH CHECK (public.auth_is_assessment_admin());

ALTER POLICY "assessment_objectives_delete_authenticated" ON public.assessment_objectives
  USING (public.auth_is_assessment_admin());

-- GC-19 -----------------------------------------------------------------------
ALTER POLICY "assessment_template_snapshots_select" ON public.assessment_template_snapshots TO authenticated;
ALTER POLICY "assessment_year_expectations_select" ON public.assessment_year_expectations TO authenticated;
ALTER POLICY "assessment_context_questions_select" ON public.assessment_context_questions TO authenticated;
ALTER POLICY "assessment_sub_questions_select" ON public.assessment_sub_questions TO authenticated;

-- GC-18 -----------------------------------------------------------------------
ALTER POLICY "assessment_responses_insert" ON public.assessment_responses
  WITH CHECK (
    public.auth_is_assessment_admin()
    OR (
      EXISTS (SELECT 1 FROM public.assessment_instance_assignees aia
              WHERE aia.instance_id = assessment_responses.instance_id
                AND aia.user_id = auth.uid() AND aia.can_edit = true)
      AND EXISTS (SELECT 1 FROM public.assessment_instances ai
                  WHERE ai.id = assessment_responses.instance_id
                    AND ai.status IN ('pending', 'in_progress'))
    ));

ALTER POLICY "assessment_responses_update" ON public.assessment_responses
  USING (
    public.auth_is_assessment_admin()
    OR (
      EXISTS (SELECT 1 FROM public.assessment_instance_assignees aia
              WHERE aia.instance_id = assessment_responses.instance_id
                AND aia.user_id = auth.uid() AND aia.can_edit = true)
      AND EXISTS (SELECT 1 FROM public.assessment_instances ai
                  WHERE ai.id = assessment_responses.instance_id
                    AND ai.status IN ('pending', 'in_progress'))
    ))
  WITH CHECK (
    public.auth_is_assessment_admin()
    OR (
      EXISTS (SELECT 1 FROM public.assessment_instance_assignees aia
              WHERE aia.instance_id = assessment_responses.instance_id
                AND aia.user_id = auth.uid() AND aia.can_edit = true)
      AND EXISTS (SELECT 1 FROM public.assessment_instances ai
                  WHERE ai.id = assessment_responses.instance_id
                    AND ai.status IN ('pending', 'in_progress'))
    ));

ALTER POLICY "assessment_instances_update" ON public.assessment_instances
  USING (
    public.auth_is_assessment_admin()
    OR (
      status IN ('pending', 'in_progress')
      AND EXISTS (SELECT 1 FROM public.assessment_instance_assignees aia
                  WHERE aia.instance_id = assessment_instances.id
                    AND aia.user_id = auth.uid() AND aia.can_edit = true)
    ))
  WITH CHECK (
    public.auth_is_assessment_admin()
    OR (
      status IN ('pending', 'in_progress', 'completed')
      AND EXISTS (SELECT 1 FROM public.assessment_instance_assignees aia
                  WHERE aia.instance_id = assessment_instances.id
                    AND aia.user_id = auth.uid() AND aia.can_edit = true)
    ));
