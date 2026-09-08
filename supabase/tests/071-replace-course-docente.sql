-- =============================================================================
-- 071-replace-course-docente.sql — Procesos de Cambio PR 2 item 2
--
-- Proves public.replace_course_docente (20260907130000_replace_course_docente)
-- against the real policies and helpers:
--   [R-0] the function exists, is SECURITY DEFINER, anon cannot execute it;
--   [R-1] 42501 for a directivo of another school, an unrelated docente, the
--         course's own docente, anon, a directivo on another school's course
--         and on an unknown course; admin learns course_not_found;
--   [R-2] refusals write nothing: ineligible / cross-school / inactive-role
--         docente, no active assignment, more than one active assignment,
--         same docente, an in_progress instance, a pending instance with a
--         response row, null arguments;
--   [R-3] a directivo of the school succeeds on a pending, answer-free course:
--         old assignment inactive, old assignee rows gone from the live
--         instances (archived instance and other assignees untouched), new
--         assignment active, new assignee rows with fresh flags, responses and
--         instance statuses untouched, a repeat is same_docente;
--   [R-4] admin succeeds and an inactive prior row of the new docente is
--         reactivated rather than duplicated.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(43);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('rd_old');    -- active docente on A1, A2, A3, A5
SELECT tests.create_supabase_user('rd_new');    -- eligible docente, school A
SELECT tests.create_supabase_user('rd_new2');   -- eligible lider_generacion, school A; inactive prior row on A5
SELECT tests.create_supabase_user('rd_b');      -- docente of school B only; active on B1
SELECT tests.create_supabase_user('rd_unrel');  -- docente of school A, assigned nowhere (unauthorised caller)
SELECT tests.create_supabase_user('rd_other');  -- second assignee on inst 1a1 (must survive)
SELECT tests.create_supabase_user('rd_inel');   -- inactive docente role at school A
SELECT tests.create_supabase_user('rd_dir_a');
SELECT tests.create_supabase_user('rd_dir_b');
SELECT tests.create_supabase_user('rd_admin');

-- authenticated/anon have no USAGE on the tests schema; this session-local
-- SECURITY DEFINER wrapper lets persona blocks resolve fixture uids.
CREATE FUNCTION pg_temp.uid(ident text) RETURNS uuid
  SECURITY DEFINER SET search_path = tests, pg_temp
  AS $$ SELECT tests.get_supabase_uid($1) $$ LANGUAGE sql;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('rd_old'), ('rd_new'), ('rd_new2'), ('rd_b'), ('rd_unrel'), ('rd_other'),
             ('rd_inel'), ('rd_dir_a'), ('rd_dir_b'), ('rd_admin')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9980, 'Replace Docente School A'),
  (9981, 'Replace Docente School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('rd_old'),   'docente',          9980, true),
  (tests.get_supabase_uid('rd_new'),   'docente',          9980, true),
  (tests.get_supabase_uid('rd_new2'),  'lider_generacion', 9980, true),
  (tests.get_supabase_uid('rd_b'),     'docente',          9981, true),
  (tests.get_supabase_uid('rd_unrel'), 'docente',          9980, true),
  (tests.get_supabase_uid('rd_other'), 'docente',          9980, true),
  (tests.get_supabase_uid('rd_inel'),  'docente',          9980, false),
  (tests.get_supabase_uid('rd_dir_a'), 'equipo_directivo', 9980, true),
  (tests.get_supabase_uid('rd_dir_b'), 'equipo_directivo', 9981, true),
  (tests.get_supabase_uid('rd_admin'), 'admin',            NULL, true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES
  ('71000000-0000-4000-8000-00000000c0a1', 9980, 120, ARRAY['1_basico'], '{"1_basico": 6}', 1, 'semestral'),
  ('71000000-0000-4000-8000-00000000c0b1', 9981, 80,  ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral');

-- A1: replaceable (two pending live instances + one archived)
-- A2: blocked — instance in_progress
-- A3: blocked — pending instance with a response row
-- A4: no active assignment (only an inactive row)
-- A5: replaceable by admin; rd_new2 holds an inactive prior row
-- A6: two active assignments (invariant already violated)
-- B1: school B
INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('71000000-0000-4000-8000-0000000000a1', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO A'),
  ('71000000-0000-4000-8000-0000000000a2', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO B'),
  ('71000000-0000-4000-8000-0000000000a3', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO C'),
  ('71000000-0000-4000-8000-0000000000a4', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO D'),
  ('71000000-0000-4000-8000-0000000000a5', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO E'),
  ('71000000-0000-4000-8000-0000000000a6', 9980, '71000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO F'),
  ('71000000-0000-4000-8000-0000000000b1', 9981, '71000000-0000-4000-8000-00000000c0b1', '1_basico', '1 BASICO A');

INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
  ('71000000-0000-4000-8000-0000000000d1', '71000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('rd_old'),  true),
  ('71000000-0000-4000-8000-0000000000d2', '71000000-0000-4000-8000-0000000000a2', tests.get_supabase_uid('rd_old'),  true),
  ('71000000-0000-4000-8000-0000000000d3', '71000000-0000-4000-8000-0000000000a3', tests.get_supabase_uid('rd_old'),  true),
  ('71000000-0000-4000-8000-0000000000d4', '71000000-0000-4000-8000-0000000000a4', tests.get_supabase_uid('rd_old'),  false),
  ('71000000-0000-4000-8000-0000000000d5', '71000000-0000-4000-8000-0000000000a5', tests.get_supabase_uid('rd_old'),  true),
  ('71000000-0000-4000-8000-0000000000d6', '71000000-0000-4000-8000-0000000000a5', tests.get_supabase_uid('rd_new2'), false),
  ('71000000-0000-4000-8000-0000000000d7', '71000000-0000-4000-8000-0000000000a6', tests.get_supabase_uid('rd_old'),  true),
  ('71000000-0000-4000-8000-0000000000d8', '71000000-0000-4000-8000-0000000000a6', tests.get_supabase_uid('rd_other'), true),
  ('71000000-0000-4000-8000-0000000000d9', '71000000-0000-4000-8000-0000000000b1', tests.get_supabase_uid('rd_b'),    true);

INSERT INTO public.assessment_templates (id, area, version, name, status) VALUES
  ('71000000-0000-4000-8000-0000000000e1', 'lenguaje', '1.0', 'Replace Docente Template', 'published');

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('71000000-0000-4000-8000-0000000000f1', '71000000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}'),
  ('71000000-0000-4000-8000-0000000000f2', '71000000-0000-4000-8000-0000000000e1', '1.1', '{"modules": []}');

INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status) VALUES
  ('71000000-0000-4000-8000-000000001a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a1', 1, 'pending'),
  ('71000000-0000-4000-8000-000000001a02', '71000000-0000-4000-8000-0000000000f2', 9980, '71000000-0000-4000-8000-0000000000a1', 1, 'pending'),
  ('71000000-0000-4000-8000-000000001a03', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a1', 1, 'archived'),
  ('71000000-0000-4000-8000-000000002a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a2', 1, 'in_progress'),
  ('71000000-0000-4000-8000-000000003a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a3', 1, 'pending'),
  ('71000000-0000-4000-8000-000000004a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a4', 1, 'pending'),
  ('71000000-0000-4000-8000-000000005a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a5', 1, 'pending'),
  ('71000000-0000-4000-8000-000000006a01', '71000000-0000-4000-8000-0000000000f1', 9980, '71000000-0000-4000-8000-0000000000a6', 1, 'pending'),
  ('71000000-0000-4000-8000-00000000b101', '71000000-0000-4000-8000-0000000000f1', 9981, '71000000-0000-4000-8000-0000000000b1', 1, 'pending');

INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit, has_started) VALUES
  ('71000000-0000-4000-8000-000000000201', '71000000-0000-4000-8000-000000001a01', tests.get_supabase_uid('rd_old'),   true,  true,  false),
  ('71000000-0000-4000-8000-000000000202', '71000000-0000-4000-8000-000000001a01', tests.get_supabase_uid('rd_other'), false, true,  false),
  ('71000000-0000-4000-8000-000000000203', '71000000-0000-4000-8000-000000001a02', tests.get_supabase_uid('rd_old'),   true,  true,  false),
  ('71000000-0000-4000-8000-000000000204', '71000000-0000-4000-8000-000000001a03', tests.get_supabase_uid('rd_old'),   true,  true,  true),
  ('71000000-0000-4000-8000-000000000205', '71000000-0000-4000-8000-000000002a01', tests.get_supabase_uid('rd_old'),   true,  true,  true),
  ('71000000-0000-4000-8000-000000000206', '71000000-0000-4000-8000-000000003a01', tests.get_supabase_uid('rd_old'),   true,  true,  false),
  ('71000000-0000-4000-8000-000000000207', '71000000-0000-4000-8000-000000005a01', tests.get_supabase_uid('rd_old'),   true,  true,  false),
  ('71000000-0000-4000-8000-000000000208', '71000000-0000-4000-8000-00000000b101', tests.get_supabase_uid('rd_b'),     true,  true,  false);

-- One answer on the ARCHIVED instance of A1 (must survive a replacement) and
-- one on the pending instance of A3 (blocks its replacement).
INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by) VALUES
  ('71000000-0000-4000-8000-000000000301', '71000000-0000-4000-8000-000000001a03',
   '71000000-0000-4000-8000-000000000401', true, tests.get_supabase_uid('rd_old')),
  ('71000000-0000-4000-8000-000000000302', '71000000-0000-4000-8000-000000003a01',
   '71000000-0000-4000-8000-000000000401', true, tests.get_supabase_uid('rd_old'));

-- Whole-fixture state fingerprint: assignments, assignees and answer count.
-- Compared after RESET ROLE (the temp table belongs to the test session).
CREATE FUNCTION pg_temp.state() RETURNS text
  SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT coalesce((SELECT string_agg(id::text || ':' || docente_id::text || ':' || is_active::text, ',' ORDER BY id)
                       FROM public.school_course_docente_assignments WHERE id::text LIKE '71000000%'), '')
        || '|' ||
           coalesce((SELECT string_agg(instance_id::text || ':' || user_id::text || ':' || can_edit::text || ':' ||
                                       can_submit::text || ':' || has_started::text || ':' || has_submitted::text,
                                       ',' ORDER BY instance_id, user_id)
                       FROM public.assessment_instance_assignees WHERE instance_id::text LIKE '71000000%'), '')
        || '|' ||
           (SELECT count(*)::text FROM public.assessment_responses WHERE instance_id::text LIKE '71000000%')
        || '|' ||
           (SELECT string_agg(id::text || ':' || status, ',' ORDER BY id)
              FROM public.assessment_instances WHERE id::text LIKE '71000000%')
  $$ LANGUAGE sql;

CREATE TEMP TABLE rd_snap AS SELECT pg_temp.state() AS s;

-- =============================================================================
-- [R-0] Migration objects
-- =============================================================================
SELECT has_function('public', 'replace_course_docente', ARRAY['uuid', 'uuid'],
  'R-0: replace_course_docente(uuid, uuid) exists');
SELECT is(p.prosecdef, true, 'R-0: replace_course_docente is SECURITY DEFINER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'replace_course_docente';
SELECT function_privs_are('public', 'replace_course_docente', ARRAY['uuid', 'uuid'], 'anon', ARRAY[]::text[],
  'R-0: anon holds no privilege on replace_course_docente');
SELECT function_privs_are('public', 'replace_course_docente', ARRAY['uuid', 'uuid'], 'authenticated', ARRAY['EXECUTE'],
  'R-0: authenticated may EXECUTE replace_course_docente');

-- =============================================================================
-- [R-1] Authorisation (42501) — nothing written
-- =============================================================================
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new'))
$$, '42501', NULL, 'R-1: anon is refused (42501)');
RESET ROLE;

SELECT tests.authenticate_as('rd_dir_b');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new'))
$$, '42501', 'permission_denied', 'R-1: directivo of school B cannot replace on a school A course');
RESET ROLE;

SELECT tests.authenticate_as('rd_unrel');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new'))
$$, '42501', 'permission_denied', 'R-1: an unrelated docente cannot replace');
RESET ROLE;

SELECT tests.authenticate_as('rd_old');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new'))
$$, '42501', 'permission_denied', 'R-1: the course''s own docente cannot hand the course over');
RESET ROLE;

SELECT tests.authenticate_as('rd_dir_a');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000b1', pg_temp.uid('rd_b'))
$$, '42501', 'permission_denied', 'R-1: directivo of school A cannot replace on a school B course');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000ff', pg_temp.uid('rd_new'))
$$, '42501', 'permission_denied', 'R-1: an unknown course answers 42501 to a directivo (no existence leak)');
RESET ROLE;

SELECT tests.authenticate_as('rd_admin');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000ff', pg_temp.uid('rd_new'))
$$, 'P0001', 'course_not_found', 'R-1: an unknown course answers course_not_found to an admin');
RESET ROLE;

SELECT is(pg_temp.state(), (SELECT s FROM rd_snap), 'R-1: every refused call left the fixture untouched');

-- =============================================================================
-- [R-2] Business refusals (P0001) — nothing written
-- =============================================================================
SELECT tests.authenticate_as('rd_dir_a');

SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_b'))
$$, 'P0001', 'docente_not_eligible_for_school', 'R-2: a docente of another school is not eligible');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_inel'))
$$, 'P0001', 'docente_not_eligible_for_school', 'R-2: an inactive role at the school is not eligible');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', '71000000-0000-4000-8000-0000000000ee')
$$, 'P0001', 'docente_not_eligible_for_school', 'R-2: an unknown user is not eligible');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a4', pg_temp.uid('rd_new'))
$$, 'P0001', 'no_active_assignment', 'R-2: a course without an active docente cannot be replaced');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a6', pg_temp.uid('rd_new'))
$$, 'P0001', 'assignment_invariant_violation', 'R-2: a course with two active docentes needs administrative resolution');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_old'))
$$, 'P0001', 'same_docente', 'R-2: replacing a docente with itself is rejected');

-- in_progress instance
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a2', pg_temp.uid('rd_new'))
$$, 'P0001', NULL, 'R-2: an in_progress instance blocks replacement (P0001)');
SELECT throws_like($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a2', pg_temp.uid('rd_new'))
$$, 'evaluation_started: instances_started=1 instances_with_responses=0',
  'R-2: the in_progress refusal names the started-instance count');

-- pending instance with a response row
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a3', pg_temp.uid('rd_new'))
$$, 'P0001', NULL, 'R-2: a pending instance with answers blocks replacement (P0001)');
SELECT throws_like($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a3', pg_temp.uid('rd_new'))
$$, 'evaluation_started: instances_started=0 instances_with_responses=1',
  'R-2: the answered refusal names the instances-with-responses count');
RESET ROLE;

SELECT tests.authenticate_as('rd_admin');
SELECT throws_ok($$
  SELECT public.replace_course_docente(NULL, pg_temp.uid('rd_new'))
$$, 'P0001', 'invalid_arguments', 'R-2: null arguments are refused');
RESET ROLE;

SELECT is(pg_temp.state(), (SELECT s FROM rd_snap), 'R-2: every refused call left the fixture untouched');

-- =============================================================================
-- [R-3] Directivo of the school replaces the docente of A1
-- =============================================================================
SELECT tests.authenticate_as('rd_dir_a');
CREATE TEMP TABLE rd_result AS
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new')) AS r;
RESET ROLE;

SELECT is((SELECT (r->>'previous_docente_id')::uuid FROM rd_result), tests.get_supabase_uid('rd_old'),
  'R-3: result names the previous docente');
SELECT is((SELECT (r->>'new_docente_id')::uuid FROM rd_result), tests.get_supabase_uid('rd_new'),
  'R-3: result names the new docente');
SELECT is((SELECT (r->>'instances_reattached')::int FROM rd_result), 2,
  'R-3: exactly the two live instances were reattached (archived one excluded)');
SELECT is(
  (SELECT (r->>'assignment_id')::uuid FROM rd_result),
  (SELECT id FROM public.school_course_docente_assignments
    WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a1' AND is_active = true),
  'R-3: result assignment_id is the course''s one active assignment');

SELECT is((SELECT is_active FROM public.school_course_docente_assignments WHERE id = '71000000-0000-4000-8000-0000000000d1'),
  false, 'R-3: the previous assignment is inactive');
SELECT results_eq($$
  SELECT docente_id = pg_temp.uid('rd_new'), is_active, assigned_by = pg_temp.uid('rd_dir_a')
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a1' AND is_active = true
$$, $$ VALUES (true, true, true) $$,
  'R-3: the new docente holds the single active assignment, attributed to the caller');

SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE user_id = tests.get_supabase_uid('rd_old')
              AND instance_id IN ('71000000-0000-4000-8000-000000001a01', '71000000-0000-4000-8000-000000001a02')),
  0, 'R-3: the previous docente is gone from both live instances');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE id = '71000000-0000-4000-8000-000000000204'),
  1, 'R-3: the previous docente keeps the assignee row of the ARCHIVED instance');
SELECT results_eq($$
  SELECT can_edit, can_submit FROM public.assessment_instance_assignees WHERE id = '71000000-0000-4000-8000-000000000202'
$$, $$ VALUES (false, true) $$,
  'R-3: another assignee on the live instance is untouched');
SELECT results_eq($$
  SELECT instance_id::text, can_edit, can_submit, has_started, has_submitted, assigned_by = pg_temp.uid('rd_dir_a')
    FROM public.assessment_instance_assignees
   WHERE user_id = pg_temp.uid('rd_new') ORDER BY instance_id
$$, $$ VALUES ('71000000-0000-4000-8000-000000001a01', true, true, false, false, true),
            ('71000000-0000-4000-8000-000000001a02', true, true, false, false, true) $$,
  'R-3: the new docente is attached to both live instances with fresh flags (not the archived one)');

SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id::text LIKE '71000000%'), 2,
  'R-3: no response row was created, moved or deleted');
SELECT results_eq($$
  SELECT status FROM public.assessment_instances
   WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a1' ORDER BY id
$$, $$ VALUES ('pending'), ('pending'), ('archived') $$,
  'R-3: instance statuses are untouched');

SELECT tests.authenticate_as('rd_dir_a');
SELECT throws_ok($$
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a1', pg_temp.uid('rd_new'))
$$, 'P0001', 'same_docente', 'R-3: repeating the call is same_docente (nothing to do)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments
            WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a1' AND is_active = true),
  1, 'R-3: still exactly one active assignment after the repeat');

-- =============================================================================
-- [R-4] Admin replaces on A5; the new docente's inactive row is reactivated
-- =============================================================================
SELECT tests.authenticate_as('rd_admin');
CREATE TEMP TABLE rd_result_admin AS
  SELECT public.replace_course_docente('71000000-0000-4000-8000-0000000000a5', pg_temp.uid('rd_new2')) AS r;
RESET ROLE;

SELECT is((SELECT (r->>'assignment_id')::uuid FROM rd_result_admin), '71000000-0000-4000-8000-0000000000d6'::uuid,
  'R-4: the inactive prior row of the new docente was reactivated, not duplicated');
SELECT is((SELECT (r->>'instances_reattached')::int FROM rd_result_admin), 1,
  'R-4: one live instance reattached');
SELECT results_eq($$
  SELECT id::text, is_active FROM public.school_course_docente_assignments
   WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a5' ORDER BY id
$$, $$ VALUES ('71000000-0000-4000-8000-0000000000d5', false),
            ('71000000-0000-4000-8000-0000000000d6', true) $$,
  'R-4: previous row inactive, reactivated row active, no third row');
SELECT results_eq($$
  SELECT user_id = pg_temp.uid('rd_new2'), can_edit, can_submit, has_started, has_submitted
    FROM public.assessment_instance_assignees WHERE instance_id = '71000000-0000-4000-8000-000000005a01'
$$, $$ VALUES (true, true, true, false, false) $$,
  'R-4: the live instance has exactly the new docente as assignee');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments
            WHERE course_structure_id = '71000000-0000-4000-8000-0000000000a5'), 2,
  'R-4: the course still has two assignment rows in total');

SELECT * FROM finish();
ROLLBACK;
