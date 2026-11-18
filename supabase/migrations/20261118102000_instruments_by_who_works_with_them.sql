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
-- without passing through the rules they serve), and a third for the
-- sub-questions that hang under another sub-question (their indicator_id is
-- NULL by the table's has_single_parent constraint): it follows the parent
-- chain down from the readable root sub-questions, so such a row is read by
-- the same people as its instrument. Each of the eight existing
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

-- Nested sub-questions: a row whose parent_question_id points to another
-- sub-question has no indicator of its own; it belongs to the instrument of
-- the root of its chain (the one sub-question with an indicator). The read
-- rule of assessment_sub_questions cannot follow that chain itself (it would
-- read the same table through its own rule), so this helper walks it with
-- the definer's rights, starting from the root sub-questions of the
-- instruments the caller may read (auth_readable_template_ids) and going down
-- at most 16 levels. A chain that reaches no indicator (only possible as a
-- parent-only cycle) is never reached: admins read such rows through the
-- table's writing rule only. It takes no argument and answers only about the
-- caller: called directly it gives exactly the nested sub-questions the read
-- rule lets the caller read, nothing about any other row.
CREATE FUNCTION public.auth_readable_nested_sub_question_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE chain (id, depth) AS (
    SELECT q.id, 0
      FROM public.assessment_sub_questions q
      JOIN public.assessment_indicators ind ON ind.id = q.indicator_id
      JOIN public.assessment_modules m ON m.id = ind.module_id
     WHERE m.template_id IN (SELECT public.auth_readable_template_ids())
    UNION ALL
    SELECT child.id, chain.depth + 1
      FROM public.assessment_sub_questions child
      JOIN chain ON child.parent_question_id = chain.id
     WHERE child.indicator_id IS NULL
       AND chain.depth < 16
  )
  SELECT chain.id FROM chain WHERE chain.depth > 0;
$$;

COMMENT ON FUNCTION public.auth_readable_nested_sub_question_ids() IS
  'N1 (F1b-2, send-back 1): the nested sub-questions (assessment_sub_questions with parent_question_id set and '
  'indicator_id NULL) whose chain leads up, within 16 levels, to a root sub-question of an instrument in '
  'auth_readable_template_ids(). Answers only about the caller, nothing without a sign-in. '
  'Used by the read rule of assessment_sub_questions.';

REVOKE ALL ON FUNCTION public.auth_readable_nested_sub_question_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_readable_nested_sub_question_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_readable_nested_sub_question_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_readable_nested_sub_question_ids() TO service_role;

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
                          WHERE m.template_id IN (SELECT public.auth_readable_template_ids()))
         OR id IN (SELECT public.auth_readable_nested_sub_question_ids()));

-- Expected levels and stored versions -----------------------------------------

ALTER POLICY "assessment_year_expectations_select" ON public.assessment_year_expectations TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_level_ids()));

ALTER POLICY "assessment_template_snapshots_select" ON public.assessment_template_snapshots TO authenticated
  USING (template_id IN (SELECT public.auth_readable_template_level_ids()));
