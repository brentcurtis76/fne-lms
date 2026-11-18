-- =============================================================================
-- 20261118102000_instruments_by_who_works_with_them.sql — GENERA fixes F1b-2
-- (N1, part 2): an instrument of the Gestor de Cambio is read only by the
-- people who work with it (owner's decision, 17 Nov 2026).
--
-- "Delivered to school S" = an assessment_instances row with school_id = S made
-- from one of the instrument's stored versions (template_snapshot_id).
--   STRUCTURE (assessment_templates, assessment_objectives, assessment_modules,
--   assessment_indicators, assessment_context_questions,
--   assessment_sub_questions) is read by: an active admin; a consultor with a
--   current assignment to a school the instrument is delivered to
--   (public.auth_is_assigned_consultor); the equipo directivo of such a school
--   (public.auth_is_school_directivo); a teacher who is an assignee of a
--   registro made from it, in any state.
--   EXPECTED LEVELS (assessment_year_expectations) and STORED VERSIONS
--   (assessment_template_snapshots, which carry the levels) are read by the
--   same admins, consultores and directivos, and by a teacher only once a
--   registro of theirs made from it has status 'completed' (sent). A registro
--   is one shared thing: the instance's status decides, not each assignee's
--   own has_submitted flag. This is the condition the teacher's form route
--   uses to keep the levels in its answer
--   (pages/api/docente/assessments/[instanceId]/index.ts).
--   Everybody else reads nothing; anon has no read rule on these tables.
--
-- Two helpers about the caller (SECURITY DEFINER, so they read the tables
-- without passing through the rules they serve). Each of the eight existing
-- read rules is narrowed with ALTER POLICY (same name, same command) to
-- "the row's instrument is in the helper's set", written as an uncorrelated
-- sub-select so the helper runs once per statement, not once per row.
-- Writing rules (insert, update, removal) are not changed. No rule is created
-- or removed; row level security stays on everywhere.
-- Tested by supabase/tests/139-instruments-by-who-works-with-them.sql.
-- =============================================================================

-- Helpers ---------------------------------------------------------------------

CREATE FUNCTION public.auth_readable_template_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  my_schools AS (
    SELECT s.school_id
      FROM (SELECT DISTINCT i.school_id
              FROM public.assessment_instances i
             WHERE i.school_id IS NOT NULL) AS s, me
     WHERE me.uid IS NOT NULL
       AND (public.auth_is_assigned_consultor(s.school_id)
            OR public.auth_is_school_directivo(s.school_id))
  )
  SELECT t.id
    FROM public.assessment_templates t, me
   WHERE me.uid IS NOT NULL
     AND (SELECT public.auth_is_assessment_admin())
  UNION
  SELECT ts.template_id
    FROM public.assessment_instances i
    JOIN public.assessment_template_snapshots ts ON ts.id = i.template_snapshot_id
   WHERE i.school_id IN (SELECT ms.school_id FROM my_schools ms)
  UNION
  SELECT ts.template_id
    FROM public.assessment_instance_assignees a
    JOIN public.assessment_instances i ON i.id = a.instance_id
    JOIN public.assessment_template_snapshots ts ON ts.id = i.template_snapshot_id
    JOIN me ON a.user_id = me.uid;
$$;

COMMENT ON FUNCTION public.auth_readable_template_ids() IS
  'N1 (F1b-2): the instruments (assessment_templates.id) whose structure the caller may read: '
  'all for an active admin; those delivered to a school (an assessment_instances row of that school '
  'made from one of their stored versions) where the caller is an assigned consultor or equipo '
  'directivo; those of which the caller is an assignee of a registro, in any state. '
  'Answers only about the caller, nothing without a sign-in. Used by the instruments'' read rules.';

REVOKE ALL ON FUNCTION public.auth_readable_template_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_readable_template_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_readable_template_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_readable_template_ids() TO service_role;

CREATE FUNCTION public.auth_readable_template_level_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH me AS (
    SELECT auth.uid() AS uid
  ),
  my_schools AS (
    SELECT s.school_id
      FROM (SELECT DISTINCT i.school_id
              FROM public.assessment_instances i
             WHERE i.school_id IS NOT NULL) AS s, me
     WHERE me.uid IS NOT NULL
       AND (public.auth_is_assigned_consultor(s.school_id)
            OR public.auth_is_school_directivo(s.school_id))
  )
  SELECT t.id
    FROM public.assessment_templates t, me
   WHERE me.uid IS NOT NULL
     AND (SELECT public.auth_is_assessment_admin())
  UNION
  SELECT ts.template_id
    FROM public.assessment_instances i
    JOIN public.assessment_template_snapshots ts ON ts.id = i.template_snapshot_id
   WHERE i.school_id IN (SELECT ms.school_id FROM my_schools ms)
  UNION
  SELECT ts.template_id
    FROM public.assessment_instance_assignees a
    JOIN public.assessment_instances i ON i.id = a.instance_id
    JOIN public.assessment_template_snapshots ts ON ts.id = i.template_snapshot_id
    JOIN me ON a.user_id = me.uid
   WHERE i.status = 'completed';
$$;

COMMENT ON FUNCTION public.auth_readable_template_level_ids() IS
  'N1 (F1b-2): the instruments (assessment_templates.id) whose expected levels and stored versions '
  'the caller may read: all for an active admin; those delivered to a school where the caller is an '
  'assigned consultor or equipo directivo; for a teacher, only those with a registro of theirs whose '
  'status is completed (sent; the instance''s status decides for all its assignees). '
  'Answers only about the caller, nothing without a sign-in. Used by the instruments'' read rules.';

REVOKE ALL ON FUNCTION public.auth_readable_template_level_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_readable_template_level_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_readable_template_level_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_readable_template_level_ids() TO service_role;

-- Structure -------------------------------------------------------------------

ALTER POLICY "assessment_templates_select_admin_consultor" ON public.assessment_templates TO authenticated
  USING (id IN (SELECT public.auth_readable_template_ids()));

ALTER POLICY "assessment_objectives_select_authenticated" ON public.assessment_objectives TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_ids()));

ALTER POLICY "assessment_modules_select" ON public.assessment_modules TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_ids()));

ALTER POLICY "assessment_indicators_select" ON public.assessment_indicators TO authenticated
  USING (module_id IN (SELECT m.id FROM public.assessment_modules m
                        WHERE m.template_id IN (SELECT public.auth_readable_template_ids())));

ALTER POLICY "assessment_context_questions_select" ON public.assessment_context_questions TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_ids()));

ALTER POLICY "assessment_sub_questions_select" ON public.assessment_sub_questions TO authenticated
  USING (indicator_id IN (SELECT ind.id FROM public.assessment_indicators ind
                           JOIN public.assessment_modules m ON m.id = ind.module_id
                          WHERE m.template_id IN (SELECT public.auth_readable_template_ids())));

-- Expected levels and stored versions -----------------------------------------

ALTER POLICY "assessment_year_expectations_select" ON public.assessment_year_expectations TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_level_ids()));

ALTER POLICY "assessment_template_snapshots_select" ON public.assessment_template_snapshots TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_level_ids()));
