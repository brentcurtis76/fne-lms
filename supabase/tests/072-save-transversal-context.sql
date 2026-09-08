-- =============================================================================
-- 072-save-transversal-context.sql — Procesos de Cambio review remediation
-- (R1 dependency preservation, R2 atomic reconciliation, R3 fail-closed
-- grade/year validation, R5 consultor denial at the database).
--
-- Proves public.save_transversal_context (20260908100000) against the real
-- policies and helpers:
--   [S-0] objects exist; the RPC is SECURITY DEFINER; anon holds no privilege;
--         the grade allowlist helper maps every GradeLevel and nothing else;
--   [S-1] 42501 for anon, an assigned consultor, a directivo of another
--         school and a docente — nothing written;
--   [S-2] P0001 validation refusals write nothing: unknown grade string,
--         fractional / zero / six year, duplicate levels, courses_per_level
--         above the cap, missing ab_grades mapping; ab_grades.sort_order is
--         UNIQUE so an ambiguous mapping is structurally impossible (no
--         course is ever created with a NULL grade);
--   [S-3] directivo initial save: context, history, completion, courses with
--         resolved grade_id, result counts;
--   [S-4] update: extra course generated, changed_fields history, grade
--         relink of a course that had grade_id NULL;
--   [S-5] dependency refusals with EVERYTHING preserved: an INACTIVE
--         assignment and an ARCHIVED instance on a course to be removed each
--         refuse the whole save (context row untouched, courses untouched);
--         the DETAIL carries the counts;
--   [S-6] removing a dependency-free course succeeds atomically with the
--         context update;
--   [S-7] year change is flagged and existing instances keep their frozen
--         transformation_year;
--   [S-8] admin saves for any school.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(72);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('sc_dir_a');
SELECT tests.create_supabase_user('sc_dir_b');
SELECT tests.create_supabase_user('sc_cons');
SELECT tests.create_supabase_user('sc_doc');
SELECT tests.create_supabase_user('sc_admin');

CREATE FUNCTION pg_temp.uid(ident text) RETURNS uuid
  SECURITY DEFINER SET search_path = tests, pg_temp
  AS $$ SELECT tests.get_supabase_uid($1) $$ LANGUAGE sql;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('sc_dir_a'), ('sc_dir_b'), ('sc_cons'), ('sc_doc'), ('sc_admin')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9990, 'Save Context School A'),
  (9991, 'Save Context School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('sc_dir_a'), 'equipo_directivo', 9990, true),
  (tests.get_supabase_uid('sc_dir_b'), 'equipo_directivo', 9991, true),
  (tests.get_supabase_uid('sc_cons'),  'consultor',        NULL, true),
  (tests.get_supabase_uid('sc_doc'),   'docente',          9990, true),
  (tests.get_supabase_uid('sc_admin'), 'admin',            NULL, true);

INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, assignment_type)
VALUES (tests.get_supabase_uid('sc_cons'), 9990, true, 'monitoring');

-- ab_grades: 1_basico (5) and 2_basico (6) resolve; 4_medio (16) has no row
-- at all. (sort_order is UNIQUE, so an ambiguous mapping cannot exist — the
-- function still guards it; [S-2] pins the constraint instead.)
INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt) VALUES
  (99905, '1° Básico', 5, true),
  (99906, '2° Básico', 6, true);
SELECT is((SELECT count(*)::int FROM public.ab_grades WHERE sort_order = 16), 0,
  'fixture: no ab_grades row for 4_medio (sort_order 16)');
SELECT is((SELECT count(*)::int FROM public.ab_grades WHERE sort_order = 5), 1,
  'fixture: exactly one ab_grades row for 1_basico');

-- School B already has a context, two courses (one with grade_id NULL), an
-- inactive assignment on course B2, and an archived instance on course B3.
INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system, created_at)
VALUES
  ('72000000-0000-4000-8000-00000000c0b1', 9991, 80, ARRAY['1_basico'], '{"1_basico": 3}', 1, 'semestral', now() - interval '1 day');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, grade_id, course_name) VALUES
  ('72000000-0000-4000-8000-0000000000b1', 9991, '72000000-0000-4000-8000-00000000c0b1', '1_basico', 99905, '1 BASICO A'),
  ('72000000-0000-4000-8000-0000000000b2', 9991, '72000000-0000-4000-8000-00000000c0b1', '1_basico', NULL,  '1 BASICO B'),
  ('72000000-0000-4000-8000-0000000000b3', 9991, '72000000-0000-4000-8000-00000000c0b1', '1_basico', 99905, '1 BASICO C');

INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
  ('72000000-0000-4000-8000-0000000000d2', '72000000-0000-4000-8000-0000000000b2', tests.get_supabase_uid('sc_doc'), false);

INSERT INTO public.assessment_templates (id, area, version, name, status) VALUES
  ('72000000-0000-4000-8000-0000000000e1', 'lenguaje', '1.0', 'Save Context Template', 'published');
INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('72000000-0000-4000-8000-0000000000f1', '72000000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}');
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status) VALUES
  ('72000000-0000-4000-8000-000000003b01', '72000000-0000-4000-8000-0000000000f1', 9991, '72000000-0000-4000-8000-0000000000b3', 1, 'archived'),
  ('72000000-0000-4000-8000-000000001b01', '72000000-0000-4000-8000-0000000000f1', 9991, '72000000-0000-4000-8000-0000000000b1', 1, 'pending');

-- Whole-fixture fingerprint for both schools (contexts, courses, assignments,
-- instances, history). Compared after RESET ROLE.
CREATE FUNCTION pg_temp.state() RETURNS text
  SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT coalesce((SELECT string_agg(id::text || ':' || school_id::text || ':' || total_students::text || ':' ||
                                       array_to_string(grade_levels, '+') || ':' || courses_per_level::text || ':' ||
                                       implementation_year_2026::text || ':' || coalesce(is_completed::text, 'null'),
                                       ',' ORDER BY id)
                       FROM public.school_transversal_context WHERE school_id IN (9990, 9991)), '')
        || '|' ||
           coalesce((SELECT string_agg(id::text || ':' || course_name || ':' || coalesce(grade_id::text, 'null'), ',' ORDER BY id)
                       FROM public.school_course_structure WHERE school_id IN (9990, 9991)), '')
        || '|' ||
           coalesce((SELECT string_agg(a.id::text || ':' || a.is_active::text, ',' ORDER BY a.id)
                       FROM public.school_course_docente_assignments a
                       JOIN public.school_course_structure c ON c.id = a.course_structure_id
                      WHERE c.school_id IN (9990, 9991)), '')
        || '|' ||
           coalesce((SELECT string_agg(id::text || ':' || status || ':' || coalesce(course_structure_id::text, 'null') || ':' || transformation_year::text,
                                       ',' ORDER BY id)
                       FROM public.assessment_instances WHERE school_id IN (9990, 9991)), '')
        || '|' ||
           (SELECT count(*)::text FROM public.school_change_history WHERE school_id IN (9990, 9991))
  $$ LANGUAGE sql;

CREATE TEMP TABLE sc_snap AS SELECT pg_temp.state() AS s;

CREATE FUNCTION pg_temp.payload(levels text[], per_level jsonb, yr numeric) RETURNS jsonb
  AS $$
    SELECT jsonb_build_object(
      'total_students', 100,
      'grade_levels', to_jsonb(levels),
      'courses_per_level', per_level,
      'implementation_year_2026', yr,
      'period_system', 'semestral',
      'programa_inicia_completed', false
    )
  $$ LANGUAGE sql;

-- =============================================================================
-- [S-0] Migration objects
-- =============================================================================
SELECT has_function('public', 'save_transversal_context', ARRAY['integer', 'jsonb'],
  'S-0: save_transversal_context(integer, jsonb) exists');
SELECT has_function('public', 'transversal_grade_sort_order', ARRAY['text'],
  'S-0: transversal_grade_sort_order(text) exists');
SELECT is(p.prosecdef, true, 'S-0: save_transversal_context is SECURITY DEFINER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'save_transversal_context';
SELECT function_privs_are('public', 'save_transversal_context', ARRAY['integer', 'jsonb'], 'anon', ARRAY[]::text[],
  'S-0: anon holds no privilege on save_transversal_context');
SELECT function_privs_are('public', 'save_transversal_context', ARRAY['integer', 'jsonb'], 'authenticated', ARRAY['EXECUTE'],
  'S-0: authenticated may EXECUTE save_transversal_context');
SELECT is(
  (SELECT count(*)::int FROM unnest(ARRAY['medio_menor','medio_mayor','pre_kinder','kinder','1_basico','2_basico','3_basico','4_basico',
                                         '5_basico','6_basico','7_basico','8_basico','1_medio','2_medio','3_medio','4_medio']) AS g(level)
    WHERE public.transversal_grade_sort_order(g.level) IS NULL),
  0, 'S-0: every GradeLevel maps to a sort_order');
SELECT is(public.transversal_grade_sort_order('1_basico'), 5, 'S-0: 1_basico -> 5');
SELECT is(public.transversal_grade_sort_order('4_medio'), 16, 'S-0: 4_medio -> 16');
SELECT is(public.transversal_grade_sort_order('1_BASICO'), NULL, 'S-0: case-different string is not a GradeLevel');
SELECT is(public.transversal_grade_sort_order('grade 1'), NULL, 'S-0: arbitrary string is not a GradeLevel');

-- =============================================================================
-- [S-1] Authorisation (42501) — nothing written
-- =============================================================================
SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1))
$$, '42501', NULL, 'S-1: anon is refused (42501)');
RESET ROLE;

SELECT tests.authenticate_as('sc_cons');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1))
$$, '42501', 'permission_denied', 'S-1: an assigned consultor is refused at the database (pending product decision)');
RESET ROLE;

SELECT tests.authenticate_as('sc_dir_b');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1))
$$, '42501', 'permission_denied', 'S-1: directivo of school B cannot save school A');
RESET ROLE;

SELECT tests.authenticate_as('sc_doc');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1))
$$, '42501', 'permission_denied', 'S-1: a docente cannot save');
RESET ROLE;

SELECT is(pg_temp.state(), (SELECT s FROM sc_snap), 'S-1: every refused call left the fixture untouched');

-- =============================================================================
-- [S-2] Validation refusals (P0001) — nothing written
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_a');

SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['grade 1'], '{}', 1))
$$, 'P0001', 'invalid_grade_level:grade 1', 'S-2: an arbitrary grade string is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico', '1_basico'], '{}', 1))
$$, 'P0001', 'duplicate_grade_levels', 'S-2: duplicate levels are refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY[]::text[], '{}', 1))
$$, 'P0001', 'invalid_grade_levels', 'S-2: an empty level list is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{}', 1.5))
$$, 'P0001', 'invalid_year', 'S-2: a fractional year is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{}', 0))
$$, 'P0001', 'invalid_year', 'S-2: year 0 is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{}', 6))
$$, 'P0001', 'invalid_year', 'S-2: year 6 is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, jsonb_build_object('total_students', 100, 'grade_levels', '["1_basico"]'::jsonb,
                                                'implementation_year_2026', '2', 'period_system', 'semestral'))
$$, 'P0001', 'invalid_year', 'S-2: a string year is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 11}', 1))
$$, 'P0001', 'invalid_courses_per_level:1_basico', 'S-2: courses_per_level above the cap is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1.5}', 1))
$$, 'P0001', 'invalid_courses_per_level:1_basico', 'S-2: a fractional courses_per_level is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, jsonb_build_object('total_students', 0, 'grade_levels', '["1_basico"]'::jsonb,
                                                'implementation_year_2026', 1, 'period_system', 'semestral'))
$$, 'P0001', 'invalid_total_students', 'S-2: zero students is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, jsonb_build_object('total_students', 10, 'grade_levels', '["1_basico"]'::jsonb,
                                                'implementation_year_2026', 1, 'period_system', 'anual'))
$$, 'P0001', 'invalid_period_system', 'S-2: an unknown period system is refused');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico', '4_medio'], '{}', 1))
$$, 'P0001', 'grade_mapping_missing:4_medio', 'S-2: a level with no ab_grades row refuses the WHOLE save');
SELECT col_is_unique('public', 'ab_grades', 'sort_order',
  'S-2: ab_grades.sort_order is UNIQUE, so a grade mapping can never be ambiguous (the RPC still guards grade_mapping_ambiguous)');
SELECT throws_ok($$
  SELECT public.save_transversal_context(9990, '[]'::jsonb)
$$, 'P0001', 'invalid_payload', 'S-2: a non-object payload is refused');
RESET ROLE;

SELECT is(pg_temp.state(), (SELECT s FROM sc_snap), 'S-2: every validation refusal left the fixture untouched');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9990), 0,
  'S-2: school A still has no course rows (no NULL-grade course was created)');

-- =============================================================================
-- [S-3] Directivo initial save
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_a');
CREATE TEMP TABLE sc_r3 AS
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico', '2_basico'], '{"1_basico": 2}', 1)) AS r;
RESET ROLE;

SELECT is((SELECT r->>'action' FROM sc_r3), 'initial_save', 'S-3: action is initial_save');
SELECT is((SELECT (r->>'courses_generated')::int FROM sc_r3), 3, 'S-3: three courses generated (2 + 1)');
SELECT is((SELECT (r->>'courses_deleted')::int FROM sc_r3), 0, 'S-3: nothing deleted');
SELECT is((SELECT (r->>'year_changed')::boolean FROM sc_r3), false, 'S-3: year_changed is false on an initial save');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context WHERE school_id = 9990), 1,
  'S-3: exactly one context row for school A');
SELECT is((SELECT is_completed FROM public.school_transversal_context WHERE school_id = 9990), true,
  'S-3: the context is marked completed');
SELECT is((SELECT completed_by FROM public.school_transversal_context WHERE school_id = 9990), tests.get_supabase_uid('sc_dir_a'),
  'S-3: completed_by is the caller');
SELECT is((SELECT courses_per_level FROM public.school_transversal_context WHERE school_id = 9990), '{"1_basico": 2, "2_basico": 1}'::jsonb,
  'S-3: courses_per_level is normalised (missing level defaults to 1)');
SELECT results_eq($$
  SELECT course_name, grade_level, grade_id FROM public.school_course_structure WHERE school_id = 9990 ORDER BY course_name
$$, $$
  VALUES ('1 BASICO A', '1_basico', 99905), ('1 BASICO B', '1_basico', 99905), ('2 BASICO A', '2_basico', 99906)
$$, 'S-3: courses carry their resolved grade_id');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9990 AND grade_id IS NULL), 0,
  'S-3: no course has a NULL grade');
SELECT is((SELECT count(*)::int FROM public.school_change_history WHERE school_id = 9990 AND action = 'initial_save'), 1,
  'S-3: one initial_save history row');
SELECT is((SELECT user_id FROM public.school_change_history WHERE school_id = 9990), tests.get_supabase_uid('sc_dir_a'),
  'S-3: history user_id is the caller');

-- =============================================================================
-- [S-4] Update: extra course, changed_fields, grade relink
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_b');
CREATE TEMP TABLE sc_r4 AS
  SELECT public.save_transversal_context(9991, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 4}', 1)) AS r;
RESET ROLE;

SELECT is((SELECT r->>'action' FROM sc_r4), 'update', 'S-4: action is update');
SELECT is((SELECT (r->>'courses_generated')::int FROM sc_r4), 1, 'S-4: one course generated (D)');
SELECT is((SELECT (r->>'courses_relinked')::int FROM sc_r4), 1, 'S-4: the NULL-grade course B was relinked');
SELECT is((SELECT grade_id FROM public.school_course_structure WHERE id = '72000000-0000-4000-8000-0000000000b2'), 99905,
  'S-4: course B now carries the resolved grade_id');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9991), 4, 'S-4: four courses on school B');
SELECT is((SELECT changed_fields FROM public.school_change_history WHERE school_id = 9991 AND action = 'update'),
  ARRAY['total_students', 'courses_per_level'], 'S-4: changed_fields lists exactly what changed');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context WHERE school_id = 9991), 1,
  'S-4: still exactly one context row for school B');

CREATE TEMP TABLE sc_snap4 AS SELECT pg_temp.state() AS s;

-- =============================================================================
-- [S-5] Dependency refusals — inactive assignment / archived instance
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_b');
-- Shrinking to 1 course would remove B (inactive assignment), C (archived
-- instance) and D (free). Everything must be refused.
SELECT throws_ok($$
  SELECT public.save_transversal_context(9991, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1))
$$, 'P0001', 'courses_have_dependencies', 'S-5: an inactive assignment and an archived instance block the removal');
RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM sc_snap4), 'S-5: the refused save wrote nothing (context, courses, history intact)');

-- The DETAIL carries the counts per blocked course.
CREATE FUNCTION pg_temp.blocked_detail() RETURNS jsonb
  AS $$
  DECLARE v_detail text;
  BEGIN
    PERFORM public.save_transversal_context(9991, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 1}', 1));
    RETURN NULL;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
    RETURN v_detail::jsonb;
  END
  $$ LANGUAGE plpgsql;
SELECT tests.authenticate_as('sc_dir_b');
CREATE TEMP TABLE sc_detail AS SELECT pg_temp.blocked_detail() AS d;
RESET ROLE;
SELECT is((SELECT jsonb_array_length(d) FROM sc_detail), 2, 'S-5: DETAIL lists the two blocked courses (D is free)');
SELECT is((SELECT (e->>'inactiveAssignments')::int FROM sc_detail, jsonb_array_elements(d) e WHERE e->>'course_name' = '1 BASICO B'), 1,
  'S-5: course B is blocked by its inactive assignment');
SELECT is((SELECT (e->>'activeAssignments')::int FROM sc_detail, jsonb_array_elements(d) e WHERE e->>'course_name' = '1 BASICO B'), 0,
  'S-5: course B has no active assignment (the old check would have deleted it)');
SELECT is((SELECT (e->>'archivedInstances')::int FROM sc_detail, jsonb_array_elements(d) e WHERE e->>'course_name' = '1 BASICO C'), 1,
  'S-5: course C is blocked by its archived instance');
SELECT is((SELECT (e->>'instances')::int FROM sc_detail, jsonb_array_elements(d) e WHERE e->>'course_name' = '1 BASICO C'), 0,
  'S-5: course C has no live instance (the old check would have detached it)');
SELECT is(pg_temp.state(), (SELECT s FROM sc_snap4), 'S-5: the detail probe wrote nothing either');

-- =============================================================================
-- [S-6] Removing a dependency-free course succeeds atomically
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_b');
CREATE TEMP TABLE sc_r6 AS
  SELECT public.save_transversal_context(9991, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 3}', 1)) AS r;
RESET ROLE;
SELECT is((SELECT (r->>'courses_deleted')::int FROM sc_r6), 1, 'S-6: course D deleted');
SELECT is((SELECT count(*)::int FROM public.school_course_structure WHERE school_id = 9991), 3, 'S-6: three courses remain');
SELECT is((SELECT courses_per_level FROM public.school_transversal_context WHERE school_id = 9991), '{"1_basico": 3}'::jsonb,
  'S-6: the context was updated in the same call');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments WHERE id = '72000000-0000-4000-8000-0000000000d2'), 1,
  'S-6: the inactive assignment history survived');
SELECT is((SELECT course_structure_id FROM public.assessment_instances WHERE id = '72000000-0000-4000-8000-000000003b01'),
  '72000000-0000-4000-8000-0000000000b3'::uuid, 'S-6: the archived instance still points at its course');

-- =============================================================================
-- [S-7] Year change is flagged; instances keep their frozen year
-- =============================================================================
SELECT tests.authenticate_as('sc_dir_b');
CREATE TEMP TABLE sc_r7 AS
  SELECT public.save_transversal_context(9991, pg_temp.payload(ARRAY['1_basico'], '{"1_basico": 3}', 2)) AS r;
RESET ROLE;
SELECT is((SELECT (r->>'year_changed')::boolean FROM sc_r7), true, 'S-7: year_changed is true');
SELECT is((SELECT implementation_year_2026 FROM public.school_transversal_context WHERE school_id = 9991), 2, 'S-7: context year is 2');
SELECT is((SELECT transformation_year FROM public.assessment_instances WHERE id = '72000000-0000-4000-8000-000000001b01'), 1,
  'S-7: the existing instance keeps transformation_year 1 (frozen, not rewritten)');
SELECT is((SELECT count(*)::int FROM public.school_change_history
            WHERE school_id = 9991 AND action = 'update' AND changed_fields = ARRAY['implementation_year_2026']),
  1, 'S-7: history records the year change as its only changed field');

-- =============================================================================
-- [S-8] Admin saves for any school
-- =============================================================================
SELECT tests.authenticate_as('sc_admin');
CREATE TEMP TABLE sc_r8 AS
  SELECT public.save_transversal_context(9990, pg_temp.payload(ARRAY['1_basico', '2_basico'], '{"1_basico": 2, "2_basico": 2}', 1)) AS r;
RESET ROLE;
SELECT is((SELECT r->>'action' FROM sc_r8), 'update', 'S-8: admin updates school A');
SELECT is((SELECT (r->>'courses_generated')::int FROM sc_r8), 1, 'S-8: admin save generated 2 BASICO B');
SELECT is((SELECT completed_by FROM public.school_transversal_context WHERE school_id = 9990), tests.get_supabase_uid('sc_admin'),
  'S-8: completed_by follows the caller');

SELECT * FROM finish();
ROLLBACK;
