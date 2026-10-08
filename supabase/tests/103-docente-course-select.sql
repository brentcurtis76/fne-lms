-- =============================================================================
-- 103-docente-course-select.sql — Procesos de Cambio, pilot rehearsal finding
--
-- Proves 20261002200000_docente_course_select.sql for a direct user-scoped
-- connection:
--   [D-0] the helper is SECURITY DEFINER with an empty search_path; anon
--         cannot execute it; the policy is SELECT-only for authenticated;
--   [D-1] a docente with an ACTIVE assignment reads that course (and its
--         name), and nothing else of the school;
--   [D-2] a docente whose assignment is inactive but who holds a grant on an
--         (archived) instance of the course still reads it — their history;
--   [D-3] a docente with an inactive assignment and no grant reads nothing;
--         a docente of another school reads nothing; anon reads nothing;
--   [D-4] still read-only: a docente's UPDATE touches 0 rows, INSERT and
--         DELETE are refused / touch nothing;
--   [D-5] directivo and admin access is unchanged (controls).
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(18);

SELECT tests.create_supabase_user('dc_active');   -- active assignment on A1
SELECT tests.create_supabase_user('dc_history');  -- inactive on A2, grant on archived instance of A2
SELECT tests.create_supabase_user('dc_gone');     -- inactive on A3, no grant
SELECT tests.create_supabase_user('dc_other');    -- docente of school B, active on B1
SELECT tests.create_supabase_user('dc_dir');      -- directivo of school A

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x), x || '@test.local', x, 'approved'
FROM unnest(ARRAY['dc_active', 'dc_history', 'dc_gone', 'dc_other', 'dc_dir']) AS x
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9991, 'Docente Course School A'), (9992, 'Docente Course School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('dc_active'),  'docente',          9991, true),
  (tests.get_supabase_uid('dc_history'), 'docente',          9991, true),
  (tests.get_supabase_uid('dc_gone'),    'docente',          9991, true),
  (tests.get_supabase_uid('dc_other'),   'docente',          9992, true),
  (tests.get_supabase_uid('dc_dir'),     'equipo_directivo', 9991, true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES
  ('10000000-0000-4000-8000-00000000c0a1', 9991, 90, ARRAY['1_basico'], '{"1_basico": 4}', 1, 'semestral'),
  ('10000000-0000-4000-8000-00000000c0b1', 9992, 30, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('10000000-0000-4000-8000-0000000000a1', 9991, '10000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO A'),
  ('10000000-0000-4000-8000-0000000000a2', 9991, '10000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO B'),
  ('10000000-0000-4000-8000-0000000000a3', 9991, '10000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO C'),
  ('10000000-0000-4000-8000-0000000000a4', 9991, '10000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO D'),
  ('10000000-0000-4000-8000-0000000000b1', 9992, '10000000-0000-4000-8000-00000000c0b1', '1_basico', '1 BASICO A');

INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active) VALUES
  ('10000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('dc_active'),  true),
  ('10000000-0000-4000-8000-0000000000a2', tests.get_supabase_uid('dc_history'), false),
  ('10000000-0000-4000-8000-0000000000a3', tests.get_supabase_uid('dc_gone'),    false),
  ('10000000-0000-4000-8000-0000000000b1', tests.get_supabase_uid('dc_other'),   true);

-- 20261008120000 (vía rules): a live template needs a real vía and, for a
-- course vía, a grade.
INSERT INTO public.ab_grades (id, name, sort_order) VALUES (97301, 'Grade 103', 97301);
INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('10000000-0000-4000-8000-0000000000e1', 'personalizacion', '1.0', 'Docente Course Template', 'published', 97301);
INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('10000000-0000-4000-8000-0000000000f1', '10000000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}');
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status) VALUES
  ('10000000-0000-4000-8000-000000001a02', '10000000-0000-4000-8000-0000000000f1', 9991, '10000000-0000-4000-8000-0000000000a2', 1, 'archived');
INSERT INTO public.assessment_instance_assignees (instance_id, user_id, can_edit, can_submit) VALUES
  ('10000000-0000-4000-8000-000000001a02', tests.get_supabase_uid('dc_history'), false, false);



-- [D-0] -----------------------------------------------------------------------
SELECT ok(
  (SELECT p.prosecdef AND p.proconfig @> ARRAY['search_path=""'] FROM pg_proc p
    WHERE p.oid = 'public.auth_docente_has_course(uuid)'::regprocedure),
  'D-0: auth_docente_has_course is SECURITY DEFINER with an empty search_path'
);
SELECT ok(NOT has_function_privilege('anon', 'public.auth_docente_has_course(uuid)', 'EXECUTE'), 'D-0: anon cannot execute the helper');
SELECT is(
  (SELECT cmd::text || ' ' || roles::text FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_course_structure'
     AND policyname = 'school_course_structure_docente_select'),
  'SELECT {authenticated}',
  'D-0: the docente policy is SELECT-only, for authenticated'
);

-- [D-1] -----------------------------------------------------------------------
SELECT tests.authenticate_as('dc_active');
SELECT is((SELECT coalesce(string_agg(course_name || '@' || school_id::text, ',' ORDER BY school_id, course_name), '') FROM public.school_course_structure WHERE school_id IN (9991, 9992)), '1 BASICO A@9991',
  'D-1: a docente with an active assignment reads exactly that course');
SELECT is(public.auth_docente_has_course('10000000-0000-4000-8000-0000000000a4'), false,
  'D-1: and not another course of the same school');

-- [D-2] -----------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('dc_history');
SELECT is((SELECT coalesce(string_agg(course_name || '@' || school_id::text, ',' ORDER BY school_id, course_name), '') FROM public.school_course_structure WHERE school_id IN (9991, 9992)), '1 BASICO B@9991',
  'D-2: an inactive docente with a grant on an archived instance still reads that course (history)');

-- [D-3] -----------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('dc_gone');
SELECT is((SELECT coalesce(string_agg(course_name || '@' || school_id::text, ',' ORDER BY school_id, course_name), '') FROM public.school_course_structure WHERE school_id IN (9991, 9992)), '', 'D-3: an inactive assignment without any grant reads nothing');
RESET ROLE;
SELECT tests.authenticate_as('dc_other');
SELECT is((SELECT coalesce(string_agg(course_name || '@' || school_id::text, ',' ORDER BY school_id, course_name), '') FROM public.school_course_structure WHERE school_id IN (9991, 9992)), '1 BASICO A@9992',
  'D-3: a docente of another school reads only their own course there');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT is((SELECT coalesce(string_agg(course_name || '@' || school_id::text, ',' ORDER BY school_id, course_name), '') FROM public.school_course_structure WHERE school_id IN (9991, 9992)), '', 'D-3: anon reads nothing');
SELECT throws_ok($$ SELECT public.auth_docente_has_course('10000000-0000-4000-8000-0000000000a1') $$,
  '42501', NULL, 'D-3: anon cannot call the helper');

-- [D-4] -----------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('dc_active');
SELECT is_empty(
  $$ UPDATE public.school_course_structure SET course_name = 'HACK' WHERE id = '10000000-0000-4000-8000-0000000000a1' RETURNING id $$,
  'D-4: the docente''s UPDATE touches 0 rows'
);
SELECT throws_ok(
  $$ INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
     VALUES (9991, '10000000-0000-4000-8000-00000000c0a1', '1_basico', 'HACK') $$,
  '42501', NULL, 'D-4: the docente''s INSERT is refused'
);
SELECT is_empty(
  $$ DELETE FROM public.school_course_structure WHERE id = '10000000-0000-4000-8000-0000000000a1' RETURNING id $$,
  'D-4: the docente''s DELETE touches 0 rows'
);
RESET ROLE;
SELECT is((SELECT course_name FROM public.school_course_structure WHERE id = '10000000-0000-4000-8000-0000000000a1'),
  '1 BASICO A', 'D-4: the course is unchanged');

-- [D-5] -----------------------------------------------------------------------
SELECT tests.authenticate_as('dc_dir');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9991), 4,
  'D-5: the school''s directivo still reads all four courses');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9992), 0,
  'D-5: and none of the other school');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id IN (9991, 9992)), 5,
  'D-5: control — five fixture courses exist');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_course_structure'
     AND cmd IN ('INSERT', 'UPDATE', 'DELETE') AND policyname LIKE '%docente%'),
  0, 'D-5: no docente write policy exists on school_course_structure');

SELECT * FROM finish();
ROLLBACK;
