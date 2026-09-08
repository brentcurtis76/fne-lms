-- =============================================================================
-- 070-proc-integrity.sql — Procesos de Cambio PR 2: integrity + tenancy matrix
--
-- Proves, against the real policies and the 20260907120000_proc_integrity
-- migration:
--   [I-1] the two unique indexes reject duplicates (SQLSTATE 23505) and the
--         instance index ignores archived rows;
--   [I-2] the assessment_instance_progress_flags trigger sets has_started on
--         the pending -> in_progress transition and has_submitted on
--         completion — for the calling assignee when the caller is one, for
--         every can_submit assignee otherwise — and touches nothing else;
--   [I-3] a docente cannot write assessment_instance_assignees directly
--         (the trigger is the only path);
--   [T-*] the CURRENT RLS behaviour, per persona, for the seven Procesos de
--         Cambio tables. These assert what the policies do today, including
--         the gaps (consultores see nothing; directivos cannot update
--         instances; nobody but admin can delete where an ALL policy exists,
--         and nobody at all where no DELETE policy exists).
--
-- Personas: anon, unrelated docente, assigned docente (assignee, can_edit),
-- directivo same school, directivo other school, assigned consultor
-- (consultant_assignments row), unassigned consultor, admin.
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(131);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('pi_docente');      -- assignee of inst1, can_edit
SELECT tests.create_supabase_user('pi_docente2');     -- assignee of inst1 + inst2, can_edit false
SELECT tests.create_supabase_user('pi_docente3');     -- assignee of inst2, can_submit false
SELECT tests.create_supabase_user('pi_docente_unrel');
SELECT tests.create_supabase_user('pi_dir_a');
SELECT tests.create_supabase_user('pi_dir_b');
SELECT tests.create_supabase_user('pi_cons_a');
SELECT tests.create_supabase_user('pi_cons_none');
SELECT tests.create_supabase_user('pi_admin');

-- authenticated/anon have no USAGE on the tests schema; this session-local
-- SECURITY DEFINER wrapper lets persona blocks resolve fixture uids.
CREATE FUNCTION pg_temp.uid(ident text) RETURNS uuid
  SECURITY DEFINER SET search_path = tests, pg_temp
  AS $$ SELECT tests.get_supabase_uid($1) $$ LANGUAGE sql;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('pi_docente'), ('pi_docente2'), ('pi_docente3'), ('pi_docente_unrel'),
             ('pi_dir_a'), ('pi_dir_b'), ('pi_cons_a'), ('pi_cons_none'), ('pi_admin')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9970, 'Proc Integrity School A'),
  (9971, 'Proc Integrity School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('pi_docente'),       'docente',          9970, true),
  (tests.get_supabase_uid('pi_docente2'),      'docente',          9970, true),
  (tests.get_supabase_uid('pi_docente3'),      'docente',          9970, true),
  (tests.get_supabase_uid('pi_docente_unrel'), 'docente',          9970, true),
  (tests.get_supabase_uid('pi_dir_a'),         'equipo_directivo', 9970, true),
  (tests.get_supabase_uid('pi_dir_b'),         'equipo_directivo', 9971, true),
  (tests.get_supabase_uid('pi_cons_a'),        'consultor',        NULL, true),
  (tests.get_supabase_uid('pi_cons_none'),     'consultor',        NULL, true),
  (tests.get_supabase_uid('pi_admin'),         'admin',            NULL, true);

INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, assignment_type)
VALUES (tests.get_supabase_uid('pi_cons_a'), 9970, true, 'monitoring');

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES
  ('70000000-0000-4000-8000-00000000c0a1', 9970, 120, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral'),
  ('70000000-0000-4000-8000-00000000c0b1', 9971, 80,  ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('70000000-0000-4000-8000-0000000000a1', 9970, '70000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO A'),
  ('70000000-0000-4000-8000-0000000000a2', 9970, '70000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO B'),
  ('70000000-0000-4000-8000-0000000000b1', 9971, '70000000-0000-4000-8000-00000000c0b1', '1_basico', '1 BASICO A');

INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
  ('70000000-0000-4000-8000-0000000000d1', '70000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('pi_docente'), true);

INSERT INTO public.assessment_templates (id, area, version, name, status) VALUES
  ('70000000-0000-4000-8000-0000000000e1', 'lenguaje', '1.0', 'Proc Integrity Template', 'published');

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('70000000-0000-4000-8000-0000000000f1', '70000000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}');

-- inst1: school A, course A1, pending — the docente-driven lifecycle instance.
-- inst2: school A, course A2, pending — the admin-driven completion instance.
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status) VALUES
  ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-0000000000f1', 9970, '70000000-0000-4000-8000-0000000000a1', 1, 'pending'),
  ('70000000-0000-4000-8000-000000000102', '70000000-0000-4000-8000-0000000000f1', 9970, '70000000-0000-4000-8000-0000000000a2', 1, 'pending');

INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit) VALUES
  ('70000000-0000-4000-8000-000000000201', '70000000-0000-4000-8000-000000000101', tests.get_supabase_uid('pi_docente'),  true,  true),
  ('70000000-0000-4000-8000-000000000202', '70000000-0000-4000-8000-000000000101', tests.get_supabase_uid('pi_docente2'), false, true),
  ('70000000-0000-4000-8000-000000000203', '70000000-0000-4000-8000-000000000102', tests.get_supabase_uid('pi_docente2'), false, true),
  ('70000000-0000-4000-8000-000000000204', '70000000-0000-4000-8000-000000000102', tests.get_supabase_uid('pi_docente3'), true,  false);

INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by) VALUES
  ('70000000-0000-4000-8000-000000000301', '70000000-0000-4000-8000-000000000101',
   '70000000-0000-4000-8000-000000000401', true, tests.get_supabase_uid('pi_docente'));

INSERT INTO public.assessment_instance_results (id, instance_id, total_score, overall_level) VALUES
  ('70000000-0000-4000-8000-000000000501', '70000000-0000-4000-8000-000000000101', 50.00, 2);

-- Migration objects are present
SELECT has_index('public', 'school_transversal_context', 'school_transversal_context_school_id_key',
  'unique index school_transversal_context_school_id_key exists');
SELECT has_index('public', 'assessment_instances', 'assessment_instances_course_snapshot_active_key',
  'partial unique index assessment_instances_course_snapshot_active_key exists');
SELECT has_trigger('public', 'assessment_instances', 'assessment_instance_progress_flags_trg',
  'assessment_instance_progress_flags_trg is attached to assessment_instances');
SELECT is(p.prosecdef, true, 'assessment_instance_progress_flags() is SECURITY DEFINER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'assessment_instance_progress_flags';

-- =============================================================================
-- [I-1] Unique indexes reject duplicates (as postgres, no RLS in the way)
-- =============================================================================
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context
    (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9970, 1, ARRAY['1_basico'], '{}', 1, 'semestral')
$$, '23505', NULL, 'I-1: a second transversal context for the same school is rejected (23505)');

SELECT throws_ok($$
  INSERT INTO public.assessment_instances (template_snapshot_id, school_id, course_structure_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-0000000000f1', 9970, '70000000-0000-4000-8000-0000000000a1', 1, 'pending')
$$, '23505', NULL, 'I-1: a second live instance for the same (course, snapshot) is rejected (23505)');

SELECT lives_ok($$
  INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-000000000103', '70000000-0000-4000-8000-0000000000f1', 9970, '70000000-0000-4000-8000-0000000000a1', 1, 'archived')
$$, 'I-1: an ARCHIVED duplicate for the same (course, snapshot) is allowed (partial index)');

SELECT lives_ok($$
  INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-000000000104', '70000000-0000-4000-8000-0000000000f1', 9970, NULL, 1, 'pending')
$$, 'I-1: an instance without a course is not covered by the partial index');

-- =============================================================================
-- [T-ctx] school_transversal_context — SELECT / INSERT / UPDATE / DELETE
-- =============================================================================
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'ctx SELECT: anon sees nothing');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9972, 1, ARRAY['1_basico'], '{}', 1, 'semestral')
$$, '42501', NULL, 'ctx INSERT: anon is refused');
RESET ROLE;

RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'ctx SELECT: unrelated docente sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'ctx SELECT: assigned docente sees nothing');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 999 WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'ctx UPDATE: assigned docente updates 0 rows');
WITH d AS (DELETE FROM public.school_transversal_context WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'ctx DELETE: docente deletes 0 rows (no DELETE policy)');

RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'ctx SELECT: assigned consultor sees nothing (policy has no consultor branch)');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 999 WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'ctx UPDATE: assigned consultor updates 0 rows');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9971, 1, ARRAY['1_basico'], '{}', 1, 'semestral')
$$, '42501', NULL, 'ctx INSERT: assigned consultor is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_none');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'ctx SELECT: unassigned consultor sees nothing');

RESET ROLE;
SELECT tests.authenticate_as('pi_dir_b');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9971],
  'ctx SELECT: directivo of school B sees only school B');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 999 WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'ctx UPDATE: directivo of other school updates 0 rows');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9970, 1, ARRAY['1_basico'], '{}', 1, 'semestral')
$$, '42501', NULL, 'ctx INSERT: directivo of other school is refused by RLS before the unique index');

RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9970],
  'ctx SELECT: directivo of school A sees only school A');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 121 WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'ctx UPDATE: directivo of school A updates own row');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9970, 1, ARRAY['1_basico'], '{}', 1, 'semestral')
$$, '23505', NULL, 'ctx INSERT: directivo passes RLS but the unique index rejects a second context (23505)');
WITH d AS (DELETE FROM public.school_transversal_context WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'ctx DELETE: directivo deletes 0 rows (no DELETE policy)');

RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9970, 9971],
  'ctx SELECT: admin sees every school');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 122 WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'ctx UPDATE: admin updates');
WITH d AS (DELETE FROM public.school_transversal_context WHERE school_id = 9971 RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'ctx DELETE: even admin deletes 0 rows (no DELETE policy)');

-- =============================================================================
-- [T-course] school_course_structure
-- =============================================================================
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 0, 'course SELECT: assigned docente sees nothing');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9970, '70000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO Z')
$$, '42501', NULL, 'course INSERT: docente is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 0, 'course SELECT: assigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_b');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9970), 0, 'course SELECT: directivo of other school sees none of school A');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'X' WHERE school_id = 9970 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'course UPDATE: directivo of other school updates 0 rows');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9970, '70000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO Z')
$$, '42501', NULL, 'course INSERT: directivo of other school is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 2, 'course SELECT: directivo of school A sees exactly its 2 courses');
SELECT lives_ok($$
  INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name)
  VALUES ('70000000-0000-4000-8000-0000000000a3', 9970, '70000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO C')
$$, 'course INSERT: directivo of school A inserts');
WITH u AS (UPDATE public.school_course_structure SET grade_level = '1_basico' WHERE id = '70000000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'course UPDATE: directivo of school A updates own course');
WITH d AS (DELETE FROM public.school_course_structure WHERE id = '70000000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'course DELETE: directivo deletes 0 rows (no DELETE policy)');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 4, 'course SELECT: admin sees all 4 courses');
WITH d AS (DELETE FROM public.school_course_structure WHERE id = '70000000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'course DELETE: admin deletes 0 rows (no DELETE policy)');

-- =============================================================================
-- [T-assign] school_course_docente_assignments
-- =============================================================================
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 1, 'assign SELECT: assigned docente sees own row');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id)
  VALUES ('70000000-0000-4000-8000-0000000000a2', pg_temp.uid('pi_docente'))
$$, '42501', NULL, 'assign INSERT: docente cannot self-assign');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false WHERE docente_id = pg_temp.uid('pi_docente') RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'assign UPDATE: docente updates 0 rows on own row');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'assign DELETE: docente deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 0, 'assign SELECT: unrelated docente sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 0, 'assign SELECT: assigned consultor sees nothing');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id)
  VALUES ('70000000-0000-4000-8000-0000000000a2', pg_temp.uid('pi_docente_unrel'))
$$, '42501', NULL, 'assign INSERT: assigned consultor is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_b');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 0, 'assign SELECT: directivo of other school sees nothing');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id)
  VALUES ('70000000-0000-4000-8000-0000000000a2', pg_temp.uid('pi_docente_unrel'))
$$, '42501', NULL, 'assign INSERT: directivo of other school is refused');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'assign UPDATE: directivo of other school updates 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 1, 'assign SELECT: directivo of school A sees the assignment');
SELECT lives_ok($$
  INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id)
  VALUES ('70000000-0000-4000-8000-0000000000d2', '70000000-0000-4000-8000-0000000000a2', pg_temp.uid('pi_docente_unrel'))
$$, 'assign INSERT: directivo of school A assigns on own course');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = '70000000-0000-4000-8000-0000000000d2' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'assign UPDATE: directivo of school A revokes on own course');
WITH d AS (DELETE FROM public.school_course_docente_assignments WHERE id = '70000000-0000-4000-8000-0000000000d2' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'assign DELETE: directivo deletes 0 rows (no DELETE policy)');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 2, 'assign SELECT: admin sees both rows');
WITH d AS (DELETE FROM public.school_course_docente_assignments WHERE id = '70000000-0000-4000-8000-0000000000d2' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'assign DELETE: admin deletes 0 rows (no DELETE policy)');

-- =============================================================================
-- [T-inst] assessment_instances
-- =============================================================================
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 0, 'inst SELECT: anon sees nothing');
RESET ROLE;
RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 0, 'inst SELECT: unrelated docente sees nothing');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress' WHERE id = '70000000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'inst UPDATE: unrelated docente updates 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT array_agg(id::text) FROM public.assessment_instances), ARRAY['70000000-0000-4000-8000-000000000101'],
  'inst SELECT: assigned docente sees only its instance');
SELECT throws_ok($$
  INSERT INTO public.assessment_instances (template_snapshot_id, school_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-0000000000f1', 9970, 1, 'pending')
$$, '42501', NULL, 'inst INSERT: docente is refused');
WITH d AS (DELETE FROM public.assessment_instances RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'inst DELETE: docente deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente2');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress' WHERE id = '70000000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'inst UPDATE: assignee WITHOUT can_edit updates 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 0, 'inst SELECT: assigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_none');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 0, 'inst SELECT: unassigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_b');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 0, 'inst SELECT: directivo of other school sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 4, 'inst SELECT: directivo of school A sees all 4 school-A instances');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress' WHERE id = '70000000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'inst UPDATE: directivo updates 0 rows (policy has no directivo branch)');
SELECT throws_ok($$
  INSERT INTO public.assessment_instances (template_snapshot_id, school_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-0000000000f1', 9970, 1, 'pending')
$$, '42501', NULL, 'inst INSERT: directivo is refused');
WITH d AS (DELETE FROM public.assessment_instances RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'inst DELETE: directivo deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.assessment_instances), 4, 'inst SELECT: admin sees all instances');
SELECT throws_ok($$
  INSERT INTO public.assessment_instances (template_snapshot_id, school_id, course_structure_id, transformation_year, status)
  VALUES ('70000000-0000-4000-8000-0000000000f1', 9970, '70000000-0000-4000-8000-0000000000a2', 1, 'in_progress')
$$, '23505', NULL, 'inst INSERT: admin passes RLS but a duplicate live (course, snapshot) is rejected (23505)');
WITH d AS (DELETE FROM public.assessment_instances WHERE id = '70000000-0000-4000-8000-000000000104' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'inst DELETE: admin deletes 0 rows (no DELETE policy)');

-- =============================================================================
-- [T-assignee] assessment_instance_assignees + [I-3] docente cannot write it
-- =============================================================================
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees), 1, 'assignee SELECT: docente sees only own row');
WITH u AS (UPDATE public.assessment_instance_assignees SET has_started = true, has_submitted = true
           WHERE id = '70000000-0000-4000-8000-000000000201' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'I-3: docente UPDATE of own assignee row affects 0 rows');
SELECT throws_ok($$
  INSERT INTO public.assessment_instance_assignees (instance_id, user_id)
  VALUES ('70000000-0000-4000-8000-000000000102', pg_temp.uid('pi_docente'))
$$, '42501', NULL, 'assignee INSERT: docente is refused');
WITH d AS (DELETE FROM public.assessment_instance_assignees RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'assignee DELETE: docente deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees), 0, 'assignee SELECT: unrelated docente sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees), 0, 'assignee SELECT: directivo sees nothing (policy has no directivo branch)');
WITH u AS (UPDATE public.assessment_instance_assignees SET has_started = true RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'assignee UPDATE: directivo updates 0 rows');
SELECT throws_ok($$
  INSERT INTO public.assessment_instance_assignees (instance_id, user_id)
  VALUES ('70000000-0000-4000-8000-000000000102', pg_temp.uid('pi_docente_unrel'))
$$, '42501', NULL, 'assignee INSERT: directivo is refused');
WITH d AS (DELETE FROM public.assessment_instance_assignees RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'assignee DELETE: directivo deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees), 0, 'assignee SELECT: assigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees), 4, 'assignee SELECT: admin sees all 4 rows');
SELECT lives_ok($$
  INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit)
  VALUES ('70000000-0000-4000-8000-000000000205', '70000000-0000-4000-8000-000000000104', pg_temp.uid('pi_docente_unrel'), true, true)
$$, 'assignee INSERT: admin inserts');
WITH u AS (UPDATE public.assessment_instance_assignees SET can_edit = false WHERE id = '70000000-0000-4000-8000-000000000205' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'assignee UPDATE: admin updates');
WITH d AS (DELETE FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000205' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 1, 'assignee DELETE: admin CAN delete (ALL policy for admin)');

-- Flags are still pristine after the refused docente write
RESET ROLE;
SELECT is((SELECT has_started OR has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000201'),
  false, 'I-3: the refused docente write left has_started/has_submitted false');

-- =============================================================================
-- [T-resp] assessment_responses
-- =============================================================================
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 1, 'resp SELECT: assignee sees the instance responses');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('70000000-0000-4000-8000-000000000302', '70000000-0000-4000-8000-000000000101',
          '70000000-0000-4000-8000-000000000402', false, pg_temp.uid('pi_docente'))
$$, 'resp INSERT: assignee with can_edit inserts');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = true WHERE id = '70000000-0000-4000-8000-000000000302' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'resp UPDATE: assignee with can_edit updates');
WITH d AS (DELETE FROM public.assessment_responses RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'resp DELETE: assignee deletes 0 rows (no DELETE policy)');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente2');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 2, 'resp SELECT: assignee without can_edit still reads');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'resp UPDATE: assignee without can_edit updates 0 rows');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value)
  VALUES ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000403', true)
$$, '42501', NULL, 'resp INSERT: assignee without can_edit is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 0, 'resp SELECT: unrelated docente sees nothing');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value)
  VALUES ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000403', true)
$$, '42501', NULL, 'resp INSERT: unrelated docente is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 0, 'resp SELECT: directivo sees nothing (policy has no directivo branch)');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value)
  VALUES ('70000000-0000-4000-8000-000000000101', '70000000-0000-4000-8000-000000000403', true)
$$, '42501', NULL, 'resp INSERT: directivo is refused');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 0, 'resp SELECT: assigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.assessment_responses), 2, 'resp SELECT: admin sees all');
WITH u AS (UPDATE public.assessment_responses SET evidence_notes = 'admin' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 2, 'resp UPDATE: admin updates all');
WITH d AS (DELETE FROM public.assessment_responses RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'resp DELETE: admin deletes 0 rows (no DELETE policy)');

-- =============================================================================
-- [T-results] assessment_instance_results
-- =============================================================================
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_results), 1, 'results SELECT: assignee sees own instance result');
WITH u AS (UPDATE public.assessment_instance_results SET total_score = 99 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'results UPDATE: assignee updates 0 rows (admin-only write)');
SELECT throws_ok($$
  INSERT INTO public.assessment_instance_results (instance_id, total_score) VALUES ('70000000-0000-4000-8000-000000000102', 1)
$$, '42501', NULL, 'results INSERT: assignee is refused (admin-only write)');
WITH d AS (DELETE FROM public.assessment_instance_results RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'results DELETE: assignee deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_results), 0, 'results SELECT: unrelated docente sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_dir_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_results), 0, 'results SELECT: directivo sees nothing (policy has no directivo branch)');
SELECT throws_ok($$
  INSERT INTO public.assessment_instance_results (instance_id, total_score) VALUES ('70000000-0000-4000-8000-000000000102', 1)
$$, '42501', NULL, 'results INSERT: directivo is refused');
WITH d AS (DELETE FROM public.assessment_instance_results RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'results DELETE: directivo deletes 0 rows');
RESET ROLE;
SELECT tests.authenticate_as('pi_cons_a');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_results), 0, 'results SELECT: assigned consultor sees nothing');
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_results), 1, 'results SELECT: admin sees all');
SELECT lives_ok($$
  INSERT INTO public.assessment_instance_results (id, instance_id, total_score)
  VALUES ('70000000-0000-4000-8000-000000000502', '70000000-0000-4000-8000-000000000102', 10)
$$, 'results INSERT: admin inserts');
WITH u AS (UPDATE public.assessment_instance_results SET total_score = 11 WHERE id = '70000000-0000-4000-8000-000000000502' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'results UPDATE: admin updates');
WITH d AS (DELETE FROM public.assessment_instance_results WHERE id = '70000000-0000-4000-8000-000000000502' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 1, 'results DELETE: admin CAN delete (ALL policy for admin)');

-- =============================================================================
-- [I-2] The progress-flags trigger, driven through the user client
-- =============================================================================
-- Docente (assignee with can_edit) moves inst1 pending -> in_progress.
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress', started_at = now()
           WHERE id = '70000000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'I-2: assigned docente with can_edit moves the instance to in_progress');
SELECT is((SELECT has_started FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000201'),
  true, 'I-2: has_started is true for the caller after in_progress (visible through RLS)');

RESET ROLE;
SELECT is((SELECT has_started FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000202'),
  true, 'I-2: has_started is true for the other assignee of the same instance too');
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000201'),
  false, 'I-2: has_submitted is untouched by the in_progress transition');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees WHERE instance_id = '70000000-0000-4000-8000-000000000102' AND has_started),
  0, 'I-2: assignees of a different instance are untouched');

-- Docente completes inst1: only the caller's row is marked submitted.
RESET ROLE;
SELECT tests.authenticate_as('pi_docente');
WITH u AS (UPDATE public.assessment_instances SET status = 'completed', completed_at = now()
           WHERE id = '70000000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'I-2: assigned docente completes the instance');
RESET ROLE;
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000201'),
  true, 'I-2: has_submitted is true for the calling assignee after completed');
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000202'),
  false, 'I-2: the non-calling assignee is NOT marked submitted when the caller is an assignee');
SELECT results_eq($$
  SELECT can_edit, can_submit, user_id = pg_temp.uid('pi_docente')
    FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000201'
$$, $$ VALUES (true, true, true) $$, 'I-2: the trigger never changed can_edit / can_submit / user_id (caller row)');
SELECT results_eq($$
  SELECT can_edit, can_submit, user_id = pg_temp.uid('pi_docente2')
    FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000202'
$$, $$ VALUES (false, true, true) $$, 'I-2: the trigger never changed can_edit / can_submit / user_id (other row)');

-- Admin (no assignee row) completes inst2 straight from pending: every
-- can_submit assignee is marked submitted; has_started is NOT implied.
RESET ROLE;
SELECT tests.authenticate_as('pi_admin');
WITH u AS (UPDATE public.assessment_instances SET status = 'completed' WHERE id = '70000000-0000-4000-8000-000000000102' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'I-2: admin completes inst2');
RESET ROLE;
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000203'),
  true, 'I-2: without a caller assignee row, the can_submit assignee is marked submitted');
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000204'),
  false, 'I-2: without a caller assignee row, the assignee with can_submit = false is NOT marked');
SELECT is((SELECT has_started FROM public.assessment_instance_assignees WHERE id = '70000000-0000-4000-8000-000000000203'),
  false, 'I-2: pending -> completed does not set has_started (only in_progress does)');

-- A status change that does not enter in_progress/completed changes nothing.
UPDATE public.assessment_instances SET status = 'archived' WHERE id = '70000000-0000-4000-8000-000000000102';
SELECT results_eq($$
  SELECT id::text, has_started, has_submitted FROM public.assessment_instance_assignees
   WHERE instance_id = '70000000-0000-4000-8000-000000000102' ORDER BY id
$$, $$ VALUES ('70000000-0000-4000-8000-000000000203', false, true),
            ('70000000-0000-4000-8000-000000000204', false, false) $$,
  'I-2: completed -> archived leaves every flag exactly as it was');

SELECT * FROM finish();
ROLLBACK;
