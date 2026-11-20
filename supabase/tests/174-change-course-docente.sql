-- =============================================================================
-- 174-change-course-docente.sql — GC-20 (F25 build d)
--
-- Proves public.change_course_docente and public.course_docente_changes
-- (20261120112000_change_course_docente) against the real policies, helpers
-- and the delivery sweep. Per live registro of the course:
--   SENT      (completed)                      stays as the course's result;
--   STARTED   (in_progress, or pending with an answer)
--                                              archived, old grant read-only,
--                                              one fresh empty registro for the
--                                              new teacher on the CURRENT
--                                              snapshot (only when the
--                                              instrument still qualifies);
--   UNTOUCHED (pending, no answer)             handed to the new teacher;
--   CANCELLED                                  not touched.
-- A reason is required when something is closed; refusals write nothing; one
-- history row per change, readable by admins and the school's directivos only.
--
-- Fixtures are synthetic and the whole file rolls back.
--
-- Schools: 9740 (A, context year 2, migration plan GI for grade 97401 year 2),
--          9741 (B, other school), 9742 (C, NO context row).
-- Grades:  97401 (the courses' grade), 97402 (grade of the instruments used
--          only by course M, so the sweep has nothing to add to it).
-- Instruments (all vías are 'course_docente'):
--   T1 personalizacion grade 97401 published, snapshots f11 (old) and f12 (newest)
--   T2 aprendizaje     grade 97402 published, snapshot f21
--   T3 familias        grade 97401 published but ARCHIVED, snapshot f31
--   T4 evaluacion      grade 97402 published, snapshot f41
--   T5 trabajo_docente grade 97402 published, snapshot f51
-- Courses (school A unless said, all with cd_old as the active teacher):
--   K one SENT registro (T1 f12)
--   S one STARTED registro (T1 f11, in_progress) with two answers
--   P pending registro with one answer (T1 f11)
--   U one untouched pending registro (T1 f12)
--   M sent (T2) + started (T1 f11) + untouched (T4, cd_new already holds a
--     read-only row on it) + cancelled (T5)
--   A started registro of the archived instrument T3 + a sent T1 registro
--   Z no registro at all (positive control for the sweep)
--   X school C (no context year), started T1 registro
-- =============================================================================

BEGIN;

SELECT no_plan();

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('cd_old');     -- docente, schools A and C; active on every course
SELECT tests.create_supabase_user('cd_new');     -- docente, schools A and C
SELECT tests.create_supabase_user('cd_doc_b');   -- docente of school B only
SELECT tests.create_supabase_user('cd_dir');     -- equipo_directivo of school A
SELECT tests.create_supabase_user('cd_dir_b');   -- equipo_directivo of school B
SELECT tests.create_supabase_user('cd_cons');    -- consultor of school A
SELECT tests.create_supabase_user('cd_admin');   -- admin

CREATE FUNCTION pg_temp.uid(ident text) RETURNS uuid
  SECURITY DEFINER SET search_path = tests, pg_temp
  AS $$ SELECT tests.get_supabase_uid($1) $$ LANGUAGE sql;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('cd_old'), ('cd_new'), ('cd_doc_b'), ('cd_dir'), ('cd_dir_b'), ('cd_cons'), ('cd_admin')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9740, 'Change Docente School A'),
  (9741, 'Change Docente School B'),
  (9742, 'Change Docente School C')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('cd_old'),   'docente',          9740, true),
  (tests.get_supabase_uid('cd_old'),   'docente',          9742, true),
  (tests.get_supabase_uid('cd_new'),   'docente',          9740, true),
  (tests.get_supabase_uid('cd_new'),   'docente',          9742, true),
  (tests.get_supabase_uid('cd_doc_b'), 'docente',          9741, true),
  (tests.get_supabase_uid('cd_dir'),   'equipo_directivo', 9740, true),
  (tests.get_supabase_uid('cd_dir_b'), 'equipo_directivo', 9741, true),
  (tests.get_supabase_uid('cd_cons'),  'consultor',        9740, true),
  (tests.get_supabase_uid('cd_admin'), 'admin',            NULL, true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES
  ('17400000-0000-4000-8000-00000000c0a1', 9740, 120, ARRAY['1_basico'], '{"1_basico": 8}', 2, 'semestral'),
  ('17400000-0000-4000-8000-00000000c0b1', 9741, 80,  ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral');

INSERT INTO public.ab_grades (id, name, sort_order, is_always_gt) VALUES
  (97401, 'Grade 174', 97401, false),
  (97402, 'Grade 174 other', 97402, false);
INSERT INTO public.ab_migration_plan (school_id, year_number, grade_id, generation_type) VALUES (9740, 2, 97401, 'GI');

-- Course X belongs to school C but hangs off school A's context row
-- (context_id is NOT NULL); the year is read by the course's school.
INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name, grade_id) VALUES
  ('17400000-0000-4000-8000-0000000000a1', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD K', 97401),
  ('17400000-0000-4000-8000-0000000000a2', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD S', 97401),
  ('17400000-0000-4000-8000-0000000000a3', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD P', 97401),
  ('17400000-0000-4000-8000-0000000000a4', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD U', 97401),
  ('17400000-0000-4000-8000-0000000000a5', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD M', 97401),
  ('17400000-0000-4000-8000-0000000000a6', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD A', 97401),
  ('17400000-0000-4000-8000-0000000000a7', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD Z', 97401),
  ('17400000-0000-4000-8000-0000000000a8', 9742, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD X', 97401);

INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, assigned_by, is_active)
SELECT c.id, tests.get_supabase_uid('cd_old'), tests.get_supabase_uid('cd_dir'), true
  FROM public.school_course_structure c WHERE c.id::text LIKE '17400000-%';

INSERT INTO public.assessment_templates (id, area, version, name, status, is_archived, grade_id) VALUES
  ('17400000-0000-4000-8000-0000000000e1', 'personalizacion', '1.0', 'CD T1', 'published', false, 97401),
  ('17400000-0000-4000-8000-0000000000e2', 'aprendizaje',     '1.0', 'CD T2', 'published', false, 97402),
  ('17400000-0000-4000-8000-0000000000e3', 'familias',        '1.0', 'CD T3 archived', 'published', true, 97401),
  ('17400000-0000-4000-8000-0000000000e4', 'evaluacion',      '1.0', 'CD T4', 'published', false, 97402),
  ('17400000-0000-4000-8000-0000000000e5', 'trabajo_docente', '1.0', 'CD T5', 'published', false, 97402);

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data, created_at) VALUES
  ('17400000-0000-4000-8000-0000000000f1', '17400000-0000-4000-8000-0000000000e1', '0.9', '{"modules": []}', '2026-01-01'),
  ('17400000-0000-4000-8000-0000000000f2', '17400000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}', '2026-02-01'),
  ('17400000-0000-4000-8000-0000000000f3', '17400000-0000-4000-8000-0000000000e2', '1.0', '{"modules": []}', '2026-01-01'),
  ('17400000-0000-4000-8000-0000000000f4', '17400000-0000-4000-8000-0000000000e3', '1.0', '{"modules": []}', '2026-01-01'),
  ('17400000-0000-4000-8000-0000000000f5', '17400000-0000-4000-8000-0000000000e4', '1.0', '{"modules": []}', '2026-01-01'),
  ('17400000-0000-4000-8000-0000000000f6', '17400000-0000-4000-8000-0000000000e5', '1.0', '{"modules": []}', '2026-01-01');

-- Instances: b1x K, b2x S, b3x P, b4x U, b5x M, b6x A, b8x X.
INSERT INTO public.assessment_instances
  (id, template_snapshot_id, school_id, course_structure_id, transformation_year, generation_type, status) VALUES
  ('17400000-0000-4000-8000-000000000b11', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000a1', 2, 'GI', 'completed'),
  ('17400000-0000-4000-8000-000000000b21', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000a2', 2, 'GI', 'in_progress'),
  ('17400000-0000-4000-8000-000000000b31', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000a3', 2, 'GI', 'pending'),
  ('17400000-0000-4000-8000-000000000b41', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000a4', 2, 'GI', 'pending'),
  ('17400000-0000-4000-8000-000000000b51', '17400000-0000-4000-8000-0000000000f3', 9740, '17400000-0000-4000-8000-0000000000a5', 2, 'GI', 'completed'),
  ('17400000-0000-4000-8000-000000000b52', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000a5', 2, 'GI', 'in_progress'),
  ('17400000-0000-4000-8000-000000000b53', '17400000-0000-4000-8000-0000000000f5', 9740, '17400000-0000-4000-8000-0000000000a5', 2, 'GI', 'pending'),
  ('17400000-0000-4000-8000-000000000b54', '17400000-0000-4000-8000-0000000000f6', 9740, '17400000-0000-4000-8000-0000000000a5', 2, 'GI', 'pending'),
  ('17400000-0000-4000-8000-000000000b61', '17400000-0000-4000-8000-0000000000f4', 9740, '17400000-0000-4000-8000-0000000000a6', 2, 'GI', 'in_progress'),
  ('17400000-0000-4000-8000-000000000b62', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000a6', 2, 'GI', 'completed'),
  ('17400000-0000-4000-8000-000000000b81', '17400000-0000-4000-8000-0000000000f1', 9742, '17400000-0000-4000-8000-0000000000a8', 1, 'GT', 'in_progress');

-- The old teacher's grant on every instance (has_started / has_submitted as
-- the status implies); cd_new already holds a read-only row on M's untouched one.
INSERT INTO public.assessment_instance_assignees
  (id, instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by)
SELECT ('17400000-0000-4000-8000-000000000' || right(i.id::text, 3))::uuid, i.id, tests.get_supabase_uid('cd_old'),
       true, true, i.status <> 'pending', i.status = 'completed', tests.get_supabase_uid('cd_dir')
  FROM public.assessment_instances i WHERE i.id::text LIKE '17400000-%';
INSERT INTO public.assessment_instance_assignees
  (id, instance_id, user_id, can_edit, can_submit, has_started, has_submitted)
VALUES ('17400000-0000-4000-8000-000000000953', '17400000-0000-4000-8000-000000000b53',
        tests.get_supabase_uid('cd_new'), false, false, false, false);

SELECT public.cancel_assessment_instance(tests.get_supabase_uid('cd_admin'),
  '17400000-0000-4000-8000-000000000b54', 'Cancelación sintética para la prueba 174');

-- Answers: two on S, one on P (started), none elsewhere.
INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by, rationale) VALUES
  ('17400000-0000-4000-8000-000000000d21', '17400000-0000-4000-8000-000000000b21',
   '17400000-0000-4000-8000-000000000101', true,  tests.get_supabase_uid('cd_old'), 'Respuesta sintética uno'),
  ('17400000-0000-4000-8000-000000000d22', '17400000-0000-4000-8000-000000000b21',
   '17400000-0000-4000-8000-000000000102', false, tests.get_supabase_uid('cd_old'), 'Respuesta sintética dos'),
  ('17400000-0000-4000-8000-000000000d31', '17400000-0000-4000-8000-000000000b31',
   '17400000-0000-4000-8000-000000000101', true,  tests.get_supabase_uid('cd_old'), 'Respuesta sintética tres');

CREATE TEMP TABLE cd_orig_responses AS
  SELECT * FROM public.assessment_responses WHERE id::text LIKE '17400000-%';
CREATE TEMP TABLE cd_orig_instances AS
  SELECT * FROM public.assessment_instances WHERE id::text LIKE '17400000-%';
CREATE TEMP TABLE cd_orig_grants AS
  SELECT * FROM public.assessment_instance_assignees WHERE id::text LIKE '17400000-%';

-- Whole-fixture fingerprint: assignments, grants, instances, answers, history.
CREATE FUNCTION pg_temp.state() RETURNS text
  SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT coalesce((SELECT string_agg(course_structure_id::text || ':' || docente_id::text || ':' || is_active::text,
                                       ',' ORDER BY course_structure_id, docente_id)
                       FROM public.school_course_docente_assignments WHERE course_structure_id::text LIKE '17400000-%'), '')
        || '|' ||
           coalesce((SELECT string_agg(a.id::text || ':' || a.instance_id::text || ':' || a.user_id::text || ':' ||
                                       a.can_edit::text || ':' || a.can_submit::text || ':' || a.has_started::text || ':' ||
                                       a.has_submitted::text, ',' ORDER BY a.id)
                       FROM public.assessment_instance_assignees a
                       JOIN public.assessment_instances i ON i.id = a.instance_id
                      WHERE i.course_structure_id::text LIKE '17400000-%'), '')
        || '|' ||
           coalesce((SELECT string_agg(id::text || ':' || status || ':' || (cancelled_at IS NOT NULL)::text, ',' ORDER BY id)
                       FROM public.assessment_instances WHERE course_structure_id::text LIKE '17400000-%'), '')
        || '|' ||
           (SELECT md5(coalesce(string_agg(r::text, ',' ORDER BY r.id), '')) FROM public.assessment_responses r
             WHERE r.instance_id IN (SELECT id FROM public.assessment_instances WHERE course_structure_id::text LIKE '17400000-%'))
        || '|' ||
           (SELECT count(*)::text FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%')
  $$ LANGUAGE sql;

-- Calls the function as the current role and answers 'ok' or
-- 'SQLSTATE|message|detail' (the exception rolls back its own subtransaction).
CREATE FUNCTION pg_temp.try_change(p_course uuid, p_new uuid, p_reason text) RETURNS text
  LANGUAGE plpgsql AS $$
DECLARE
  v_state text; v_msg text; v_detail text;
BEGIN
  PERFORM public.change_course_docente(p_course, p_new, p_reason);
  RETURN 'ok';
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_state = RETURNED_SQLSTATE, v_msg = MESSAGE_TEXT, v_detail = PG_EXCEPTION_DETAIL;
  RETURN v_state || '|' || v_msg || '|' || coalesce(v_detail, '');
END $$;

CREATE TEMP TABLE cd_snap AS SELECT pg_temp.state() AS s;

-- =============================================================================
-- [C-0] Objects, rights, rules
-- =============================================================================
SELECT has_function('public', 'change_course_docente', ARRAY['uuid', 'uuid', 'text'],
  'C-0: change_course_docente(uuid, uuid, text) exists');
SELECT is((SELECT prosecdef FROM pg_proc WHERE oid = 'public.change_course_docente(uuid,uuid,text)'::regprocedure), true,
  'C-0: change_course_docente is SECURITY DEFINER');
SELECT function_privs_are('public', 'change_course_docente', ARRAY['uuid', 'uuid', 'text'], 'anon', ARRAY[]::text[],
  'C-0: anon holds no privilege on change_course_docente');
SELECT function_privs_are('public', 'change_course_docente', ARRAY['uuid', 'uuid', 'text'], 'authenticated', ARRAY['EXECUTE'],
  'C-0: authenticated may EXECUTE change_course_docente');
SELECT has_function('public', 'replace_course_docente', ARRAY['uuid', 'uuid'],
  'C-0: replace_course_docente(uuid, uuid) is still there');
SELECT has_table('public', 'course_docente_changes', 'C-0: the history table exists');
SELECT is((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.course_docente_changes'::regclass), true,
  'C-0: row level security is on for the history table');
SELECT table_privs_are('public', 'course_docente_changes', 'authenticated', ARRAY['SELECT'],
  'C-0: authenticated may only SELECT the history table');
SELECT table_privs_are('public', 'course_docente_changes', 'anon', ARRAY[]::text[],
  'C-0: anon holds no privilege on the history table');

-- =============================================================================
-- [C-1] Who may not (42501) — nothing written
-- =============================================================================
SELECT tests.authenticate_as('cd_dir_b');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), 'Motivo'),
  '42501|permission_denied|', 'C-1: a directivo of another school is refused');
RESET ROLE;
SELECT tests.authenticate_as('cd_cons');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), 'Motivo'),
  '42501|permission_denied|', 'C-1: a consultor is refused');
RESET ROLE;
SELECT tests.authenticate_as('cd_old');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), 'Motivo'),
  '42501|permission_denied|', 'C-1: a docente (the course''s own) is refused');
RESET ROLE;
SELECT tests.authenticate_as('cd_new');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), 'Motivo'),
  '42501|permission_denied|', 'C-1: the new docente cannot take the course himself');
RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM cd_snap), 'C-1: every refused call left the fixture untouched');

-- =============================================================================
-- [C-2] Business refusals — nothing written
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_old'), 'Motivo'),
  'P0001|same_docente|', 'C-2: the same teacher is same_docente');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_doc_b'), 'Motivo'),
  'P0001|docente_not_eligible_for_school|', 'C-2: a docente of another school is not eligible');
SELECT is(pg_temp.try_change(NULL, pg_temp.uid('cd_new'), 'Motivo'),
  'P0001|invalid_arguments|', 'C-2: null arguments are refused');

-- S without a reason: reason_required with the counts in DETAIL.
CREATE TEMP TABLE cd_req_s AS
  SELECT pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), NULL) AS r;
-- M without a reason: one to close, one kept.
CREATE TEMP TABLE cd_req_m AS
  SELECT pg_temp.try_change('17400000-0000-4000-8000-0000000000a5', pg_temp.uid('cd_new'), NULL) AS r;

SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), '   '),
  'P0001|reason_invalid|', 'C-2: a blank reason is reason_invalid');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), ''),
  'P0001|reason_invalid|', 'C-2: an empty reason is reason_invalid');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'), repeat('x', 501)),
  'P0001|reason_invalid|', 'C-2: a 501-character reason is reason_invalid');
RESET ROLE;

SELECT is(split_part((SELECT r FROM cd_req_s), '|', 1) || '|' || split_part((SELECT r FROM cd_req_s), '|', 2),
  'P0001|reason_required', 'C-2: S without a reason is reason_required (P0001)');
SELECT is(split_part((SELECT r FROM cd_req_s), '|', 3)::jsonb, '{"closing": 1, "kept": 0}'::jsonb,
  'C-2: reason_required on S carries DETAIL {closing: 1, kept: 0}');
SELECT is(split_part((SELECT r FROM cd_req_m), '|', 2), 'reason_required',
  'C-2: M without a reason is reason_required');
SELECT is(split_part((SELECT r FROM cd_req_m), '|', 3)::jsonb, '{"closing": 1, "kept": 1}'::jsonb,
  'C-2: reason_required on M carries DETAIL {closing: 1, kept: 1}');

-- X: school C has no context year, a fresh registro would be needed.
SELECT tests.authenticate_as('cd_admin');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a8', pg_temp.uid('cd_new'), 'Motivo válido'),
  'P0001|context_missing|', 'C-2: no context year at the school is context_missing');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000ff', pg_temp.uid('cd_new'), 'Motivo'),
  'P0001|course_not_found|', 'C-2: an unknown course answers course_not_found to an admin');
RESET ROLE;

SELECT is(pg_temp.state(), (SELECT s FROM cd_snap), 'C-2: every refused call left the fixture untouched (assignments, statuses, grants, answers, history)');

-- =============================================================================
-- [C-3] K: only a SENT registro — kept, no reason asked
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
CREATE TEMP TABLE cd_res_k AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a1', pg_temp.uid('cd_new')) AS r;
RESET ROLE;

SELECT is((SELECT r FROM cd_res_k) - 'change_id',
  jsonb_build_object('previous_docente_id', tests.get_supabase_uid('cd_old'), 'new_docente_id', tests.get_supabase_uid('cd_new'),
                     'moved', 0, 'closed', 0, 'created', 0, 'kept', 1),
  'C-3: K answers kept 1, nothing moved, closed or created');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b11'), 'completed',
  'C-3: the sent registro stays completed');
SELECT is((SELECT row(a.*)::text FROM public.assessment_instance_assignees a WHERE id = '17400000-0000-4000-8000-000000000b11'),
          (SELECT row(o.*)::text FROM cd_orig_grants o WHERE id = '17400000-0000-4000-8000-000000000b11'),
  'C-3: the old teacher''s grant on the sent registro is unchanged');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE instance_id = '17400000-0000-4000-8000-000000000b11' AND user_id = tests.get_supabase_uid('cd_new')), 0,
  'C-3: the new teacher gets nothing for the sent instrument');
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a1'), 1,
  'C-3: no registro was created for K');
SELECT results_eq($$
  SELECT docente_id = pg_temp.uid('cd_new'), assigned_by = pg_temp.uid('cd_dir')
    FROM public.school_course_docente_assignments
   WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a1' AND is_active
$$, $$ VALUES (true, true) $$, 'C-3: the new teacher holds the one active assignment of K, by the caller');
SELECT results_eq($$
  SELECT reason IS NULL, closed_instance_ids, created_instance_ids, kept_instance_ids, moved_instance_ids,
         changed_by = pg_temp.uid('cd_dir'), id = (SELECT (r->>'change_id')::uuid FROM cd_res_k)
    FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a1'
$$, $$ VALUES (true, '{}'::uuid[], '{}'::uuid[], ARRAY['17400000-0000-4000-8000-000000000b11']::uuid[], '{}'::uuid[], true, true) $$,
  'C-3: one history row for K: no reason, the sent registro listed as kept');
SELECT tests.authenticate_as('cd_dir');
SELECT is(pg_temp.try_change('17400000-0000-4000-8000-0000000000a1', pg_temp.uid('cd_new'), NULL),
  'P0001|same_docente|', 'C-3: repeating the change on K is same_docente');
RESET ROLE;

-- =============================================================================
-- [C-4] S: STARTED with two answers — closed as history, fresh one for the new teacher
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
CREATE TEMP TABLE cd_res_s AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a2', pg_temp.uid('cd_new'),
                                      '  Licencia médica del docente  ') AS r;
RESET ROLE;
CREATE TEMP TABLE cd_new_s AS
  SELECT * FROM public.assessment_instances
   WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a2' AND id <> '17400000-0000-4000-8000-000000000b21';

SELECT is((SELECT r FROM cd_res_s) - 'change_id',
  jsonb_build_object('previous_docente_id', tests.get_supabase_uid('cd_old'), 'new_docente_id', tests.get_supabase_uid('cd_new'),
                     'moved', 0, 'closed', 1, 'created', 1, 'kept', 0),
  'C-4: S answers closed 1, created 1');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b21'), 'archived',
  'C-4: the started registro is archived');
SELECT is((SELECT md5(string_agg(r::text, ',' ORDER BY r.id)) FROM public.assessment_responses r
            WHERE instance_id = '17400000-0000-4000-8000-000000000b21'),
          (SELECT md5(string_agg(o::text, ',' ORDER BY o.id)) FROM cd_orig_responses o
            WHERE instance_id = '17400000-0000-4000-8000-000000000b21'),
  'C-4: its two answers are byte-identical');
SELECT results_eq($$
  SELECT user_id = pg_temp.uid('cd_old'), can_edit, can_submit FROM public.assessment_instance_assignees
   WHERE instance_id = '17400000-0000-4000-8000-000000000b21'
$$, $$ VALUES (true, false, false) $$, 'C-4: the old teacher keeps a read-only grant on the closed registro, and nobody else has one');
SELECT is((SELECT count(*)::int FROM cd_new_s), 1, 'C-4: exactly one new registro for S');
SELECT results_eq($$
  SELECT template_snapshot_id::text, status, transformation_year, generation_type::text, school_id,
         assigned_by = pg_temp.uid('cd_dir'), cancelled_at IS NULL
    FROM cd_new_s
$$, $$ VALUES ('17400000-0000-4000-8000-0000000000f2', 'pending', 2, 'GI', 9740, true, true) $$,
  'C-4: the new registro is pending, on the NEWEST snapshot, with the context year and the plan''s generation');
SELECT results_eq($$
  SELECT a.user_id = pg_temp.uid('cd_new'), a.can_edit, a.can_submit, a.has_started, a.has_submitted
    FROM public.assessment_instance_assignees a WHERE a.instance_id = (SELECT id FROM cd_new_s)
$$, $$ VALUES (true, true, true, false, false) $$, 'C-4: the new teacher alone holds the new registro, with edit and submit');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = (SELECT id FROM cd_new_s)), 0,
  'C-4: the new registro is empty: no answer was transferred');
SELECT results_eq($$
  SELECT reason, changed_by = pg_temp.uid('cd_dir'), changed_at IS NOT NULL, school_id,
         previous_docente_id = pg_temp.uid('cd_old'), new_docente_id = pg_temp.uid('cd_new'),
         closed_instance_ids, created_instance_ids = ARRAY[(SELECT id FROM cd_new_s)], kept_instance_ids, moved_instance_ids
    FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a2'
$$, $$ VALUES ('Licencia médica del docente', true, true, 9740, true, true,
               ARRAY['17400000-0000-4000-8000-000000000b21']::uuid[], true, '{}'::uuid[], '{}'::uuid[]) $$,
  'C-4: one history row for S with who, when, the trimmed reason and the ids');

-- The old teacher still reads his closed registro and its answers, and can
-- neither answer it, change an answer, reopen nor send it.
SELECT tests.authenticate_as('cd_old');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b21'), 'archived',
  'C-4: the old teacher still SELECTs his closed registro');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = '17400000-0000-4000-8000-000000000b21'), 2,
  'C-4: the old teacher still SELECTs its two answers');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000b21', '17400000-0000-4000-8000-000000000103', true, pg_temp.uid('cd_old'))
$$, '42501', NULL, 'C-4: the old teacher cannot INSERT an answer on the closed registro');
UPDATE public.assessment_responses SET rationale = 'cambiado' WHERE instance_id = '17400000-0000-4000-8000-000000000b21';
UPDATE public.assessment_instances SET status = 'in_progress' WHERE id = '17400000-0000-4000-8000-000000000b21';
UPDATE public.assessment_instances SET status = 'completed' WHERE id = '17400000-0000-4000-8000-000000000b21';
SELECT is((SELECT count(*)::int FROM public.assessment_instances
            WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a2' AND id <> '17400000-0000-4000-8000-000000000b21'), 0,
  'C-4: the old teacher does not see the new teacher''s registro');
RESET ROLE;
SELECT is((SELECT md5(string_agg(r::text, ',' ORDER BY r.id)) FROM public.assessment_responses r
            WHERE instance_id = '17400000-0000-4000-8000-000000000b21'),
          (SELECT md5(string_agg(o::text, ',' ORDER BY o.id)) FROM cd_orig_responses o
            WHERE instance_id = '17400000-0000-4000-8000-000000000b21'),
  'C-4: the old teacher''s UPDATE of the answers changed nothing');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b21'), 'archived',
  'C-4: the old teacher could neither reopen nor send the closed registro');

-- The new teacher can answer the fresh one.
SELECT format($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES (%L, '17400000-0000-4000-8000-000000000101', true, pg_temp.uid('cd_new'))
$$, (SELECT id FROM cd_new_s)) AS new_answer_sql \gset
SELECT tests.authenticate_as('cd_new');
SELECT lives_ok(:'new_answer_sql', 'C-4: the new teacher can answer the fresh registro');
RESET ROLE;

-- =============================================================================
-- [C-5] P: pending with one answer counts as started; a 500-character reason is fine
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
SELECT is(split_part(pg_temp.try_change('17400000-0000-4000-8000-0000000000a3', pg_temp.uid('cd_new'), NULL), '|', 2),
  'reason_required', 'C-5: P (pending with an answer) asks for a reason');
CREATE TEMP TABLE cd_res_p AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a3', pg_temp.uid('cd_new'), repeat('m', 500)) AS r;
RESET ROLE;
SELECT is(((SELECT r FROM cd_res_p)->>'closed')::int || '/' || ((SELECT r FROM cd_res_p)->>'created')::int, '1/1',
  'C-5: P answers closed 1, created 1');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b31'), 'archived',
  'C-5: P''s registro is archived');
SELECT is((SELECT row(r.*)::text FROM public.assessment_responses r WHERE id = '17400000-0000-4000-8000-000000000d31'),
          (SELECT row(o.*)::text FROM cd_orig_responses o WHERE id = '17400000-0000-4000-8000-000000000d31'),
  'C-5: P''s answer is byte-identical');
SELECT results_eq($$
  SELECT i.template_snapshot_id::text, i.status, a.user_id = pg_temp.uid('cd_new'), a.can_edit, a.can_submit
    FROM public.assessment_instances i JOIN public.assessment_instance_assignees a ON a.instance_id = i.id
   WHERE i.course_structure_id = '17400000-0000-4000-8000-0000000000a3' AND i.status <> 'archived'
$$, $$ VALUES ('17400000-0000-4000-8000-0000000000f2', 'pending', true, true, true) $$,
  'C-5: one fresh registro for the new teacher on the newest snapshot');
SELECT is((SELECT char_length(reason) FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a3'), 500,
  'C-5: the 500-character reason is stored');

-- =============================================================================
-- [C-6] U: untouched — handed over as today, no reason asked
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
CREATE TEMP TABLE cd_res_u AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a4', pg_temp.uid('cd_new'), NULL) AS r;
RESET ROLE;
SELECT is((SELECT r FROM cd_res_u) - 'change_id' - 'previous_docente_id' - 'new_docente_id',
  '{"moved": 1, "closed": 0, "created": 0, "kept": 0}'::jsonb, 'C-6: U answers moved 1');
SELECT results_eq($$
  SELECT id::text, user_id = pg_temp.uid('cd_new'), can_edit, can_submit, has_started, has_submitted,
         assigned_by = pg_temp.uid('cd_dir'), assigned_at = now()
    FROM public.assessment_instance_assignees WHERE instance_id = '17400000-0000-4000-8000-000000000b41'
$$, $$ VALUES ('17400000-0000-4000-8000-000000000b41', true, true, true, false, false, true, true) $$,
  'C-6: the old teacher''s grant row now belongs to the new teacher with fresh flags (no row added or removed)');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b41'), 'pending',
  'C-6: U''s registro stays pending');
SELECT results_eq($$
  SELECT reason IS NULL, closed_instance_ids, moved_instance_ids
    FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a4'
$$, $$ VALUES (true, '{}'::uuid[], ARRAY['17400000-0000-4000-8000-000000000b41']::uuid[]) $$,
  'C-6: one history row for U: no reason, the registro listed as moved');

-- =============================================================================
-- [C-7] M: sent + started + untouched + cancelled
-- =============================================================================
SELECT tests.authenticate_as('cd_dir');
CREATE TEMP TABLE cd_res_m AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a5', pg_temp.uid('cd_new'), 'Reorganización del curso') AS r;
RESET ROLE;
SELECT is((SELECT r FROM cd_res_m) - 'change_id' - 'previous_docente_id' - 'new_docente_id',
  '{"moved": 1, "closed": 1, "created": 1, "kept": 1}'::jsonb, 'C-7: M answers moved 1, closed 1, created 1, kept 1');
SELECT results_eq($$
  SELECT id::text, status FROM public.assessment_instances
   WHERE id::text LIKE '17400000-%' AND course_structure_id = '17400000-0000-4000-8000-0000000000a5' ORDER BY id
$$, $$ VALUES ('17400000-0000-4000-8000-000000000b51', 'completed'), ('17400000-0000-4000-8000-000000000b52', 'archived'),
            ('17400000-0000-4000-8000-000000000b53', 'pending'), ('17400000-0000-4000-8000-000000000b54', 'pending') $$,
  'C-7: sent stays completed, started archived, untouched and cancelled stay pending');
SELECT is((SELECT row(a.*)::text FROM public.assessment_instance_assignees a WHERE id = '17400000-0000-4000-8000-000000000b51'),
          (SELECT row(o.*)::text FROM cd_orig_grants o WHERE id = '17400000-0000-4000-8000-000000000b51'),
  'C-7: the old grant on the sent registro is unchanged');
SELECT results_eq($$
  SELECT user_id = pg_temp.uid('cd_old'), can_edit, can_submit FROM public.assessment_instance_assignees
   WHERE instance_id = '17400000-0000-4000-8000-000000000b52'
$$, $$ VALUES (true, false, false) $$, 'C-7: the old grant on the closed registro is read-only');
SELECT results_eq($$
  SELECT id::text, user_id = pg_temp.uid('cd_new'), can_edit, can_submit, has_started, has_submitted
    FROM public.assessment_instance_assignees WHERE instance_id = '17400000-0000-4000-8000-000000000b53' ORDER BY id
$$, $$ VALUES ('17400000-0000-4000-8000-000000000953', true, true, true, false, false),
            ('17400000-0000-4000-8000-000000000b53', false, false, false, false, false) $$,
  'C-7: on the untouched one the new teacher''s existing row gets edit and submit, the old teacher''s row turns read-only');
SELECT is((SELECT row(i.*)::text FROM public.assessment_instances i WHERE id = '17400000-0000-4000-8000-000000000b54'),
          (SELECT row(o.*)::text FROM cd_orig_instances o WHERE id = '17400000-0000-4000-8000-000000000b54'),
  'C-7: the cancelled registro is not touched at all');
SELECT is((SELECT row(a.*)::text FROM public.assessment_instance_assignees a WHERE id = '17400000-0000-4000-8000-000000000b54'),
          (SELECT row(o.*)::text FROM cd_orig_grants o WHERE id = '17400000-0000-4000-8000-000000000b54'),
  'C-7: the grant on the cancelled registro is not touched');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees WHERE instance_id = '17400000-0000-4000-8000-000000000b54'), 1,
  'C-7: nobody was added to the cancelled registro');
SELECT results_eq($$
  SELECT i.template_snapshot_id::text, i.status, a.user_id = pg_temp.uid('cd_new'), a.can_edit, a.can_submit
    FROM public.assessment_instances i JOIN public.assessment_instance_assignees a ON a.instance_id = i.id
   WHERE i.course_structure_id = '17400000-0000-4000-8000-0000000000a5' AND i.id::text NOT LIKE '17400000-%'
$$, $$ VALUES ('17400000-0000-4000-8000-0000000000f2', 'pending', true, true, true) $$,
  'C-7: one fresh registro for the closed instrument, on its newest snapshot');
SELECT results_eq($$
  SELECT reason, closed_instance_ids, kept_instance_ids, moved_instance_ids, cardinality(created_instance_ids)
    FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a5'
$$, $$ VALUES ('Reorganización del curso', ARRAY['17400000-0000-4000-8000-000000000b52']::uuid[],
               ARRAY['17400000-0000-4000-8000-000000000b51']::uuid[], ARRAY['17400000-0000-4000-8000-000000000b53']::uuid[], 1) $$,
  'C-7: the history row of M lists each part; the cancelled registro is in none');

-- =============================================================================
-- [C-8] A: started registro of an ARCHIVED instrument (admin) — closed, nothing created
-- =============================================================================
SELECT tests.authenticate_as('cd_admin');
CREATE TEMP TABLE cd_res_a AS
  SELECT public.change_course_docente('17400000-0000-4000-8000-0000000000a6', pg_temp.uid('cd_new'), 'Cambio por el administrador') AS r;
RESET ROLE;
SELECT is((SELECT r FROM cd_res_a) - 'change_id' - 'previous_docente_id' - 'new_docente_id',
  '{"moved": 0, "closed": 1, "created": 0, "kept": 1}'::jsonb, 'C-8: A answers closed 1, created 0, kept 1');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '17400000-0000-4000-8000-000000000b61'), 'archived',
  'C-8: the started registro of the archived instrument is archived');
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a6'), 2,
  'C-8: nothing was created for the archived instrument');
SELECT results_eq($$
  SELECT can_edit, can_submit FROM public.assessment_instance_assignees WHERE instance_id = '17400000-0000-4000-8000-000000000b61'
$$, $$ VALUES (false, false) $$, 'C-8: the old grant on it is read-only');
SELECT is((SELECT changed_by FROM public.course_docente_changes WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a6'),
  tests.get_supabase_uid('cd_admin'), 'C-8: an admin may change the teacher; the history names him');

-- =============================================================================
-- [C-9] Who reads the history; nobody writes it
-- =============================================================================
SELECT tests.authenticate_as('cd_admin');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 6,
  'C-9: the admin reads the six history rows');
SELECT throws_ok($$
  INSERT INTO public.course_docente_changes (course_structure_id, school_id, previous_docente_id, new_docente_id, changed_by)
  VALUES ('17400000-0000-4000-8000-0000000000a7', 9740, pg_temp.uid('cd_old'), pg_temp.uid('cd_new'), pg_temp.uid('cd_admin'))
$$, '42501', NULL, 'C-9: the admin cannot INSERT a history row');
SELECT throws_ok($$ UPDATE public.course_docente_changes SET reason = 'x' $$, '42501', NULL,
  'C-9: the admin cannot UPDATE a history row');
SELECT throws_ok($$ DELETE FROM public.course_docente_changes $$, '42501', NULL,
  'C-9: the admin cannot remove a history row');
RESET ROLE;
SELECT tests.authenticate_as('cd_dir');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 6,
  'C-9: the school''s directivo reads the six history rows');
SELECT throws_ok($$
  INSERT INTO public.course_docente_changes (course_structure_id, school_id, previous_docente_id, new_docente_id, changed_by)
  VALUES ('17400000-0000-4000-8000-0000000000a7', 9740, pg_temp.uid('cd_old'), pg_temp.uid('cd_new'), pg_temp.uid('cd_dir'))
$$, '42501', NULL, 'C-9: the directivo cannot INSERT a history row');
SELECT throws_ok($$ UPDATE public.course_docente_changes SET reason = 'x' $$, '42501', NULL,
  'C-9: the directivo cannot UPDATE a history row');
SELECT throws_ok($$ DELETE FROM public.course_docente_changes $$, '42501', NULL,
  'C-9: the directivo cannot remove a history row');
RESET ROLE;
SELECT tests.authenticate_as('cd_dir_b');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 0,
  'C-9: a directivo of another school reads no history row');
RESET ROLE;
SELECT tests.authenticate_as('cd_old');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 0,
  'C-9: the old teacher reads no history row');
RESET ROLE;
SELECT tests.authenticate_as('cd_new');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 0,
  'C-9: the new teacher reads no history row');
RESET ROLE;
SELECT tests.authenticate_as('cd_cons');
SELECT is((SELECT count(*)::int FROM public.course_docente_changes WHERE course_structure_id::text LIKE '17400000-%'), 0,
  'C-9: the consultor reads no history row');
RESET ROLE;

-- =============================================================================
-- [C-10] The sweep afterwards creates nothing more for the changed courses
-- =============================================================================
CREATE TEMP TABLE cd_after_change AS
  SELECT id, course_structure_id FROM public.assessment_instances WHERE course_structure_id::text LIKE '17400000-%';
UPDATE public.assessment_delivery_reconcile_state SET scan_key = '';
SET LOCAL ROLE service_role;
SELECT public.reconcile_published_assessment_deliveries(500);
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.assessment_instances
            WHERE course_structure_id::text LIKE '17400000-%'
              AND course_structure_id <> '17400000-0000-4000-8000-0000000000a7'
              AND id NOT IN (SELECT id FROM cd_after_change)), 0,
  'C-10: the sweep creates nothing more for the changed courses');
SELECT is((SELECT count(*)::int FROM public.assessment_instances
            WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a7'), 1,
  'C-10: control: the sweep did reach these fixtures (course Z got its registro)');

-- =============================================================================
-- [C-11] Same instrument, two snapshots: the newest snapshot already holds a
--        SENT (course I) or CANCELLED (course J) registro. The started one on
--        the old snapshot is closed; the new teacher is NOT attached to the
--        sent or cancelled one and nothing is created. (The ordinary case,
--        exactly one fresh empty registro, is C-4, C-5 and C-7.)
-- =============================================================================
SELECT set_config('request.jwt.claims', '', true);  -- fixtures below are written by no signed-in user
INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name, grade_id) VALUES
  ('17400000-0000-4000-8000-0000000000a9', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD I', 97401),
  ('17400000-0000-4000-8000-0000000000aa', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD J', 97401);
INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, assigned_by, is_active) VALUES
  ('17400000-0000-4000-8000-0000000000a9', tests.get_supabase_uid('cd_old'), tests.get_supabase_uid('cd_dir'), true),
  ('17400000-0000-4000-8000-0000000000aa', tests.get_supabase_uid('cd_old'), tests.get_supabase_uid('cd_dir'), true);
INSERT INTO public.assessment_instances
  (id, template_snapshot_id, school_id, course_structure_id, transformation_year, generation_type, status) VALUES
  ('17400000-0000-4000-8000-000000000b91', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000a9', 2, 'GI', 'in_progress'),
  ('17400000-0000-4000-8000-000000000b92', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000a9', 2, 'GI', 'completed'),
  ('17400000-0000-4000-8000-000000000ba1', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000aa', 2, 'GI', 'in_progress'),
  ('17400000-0000-4000-8000-000000000ba2', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000aa', 2, 'GI', 'pending');
INSERT INTO public.assessment_instance_assignees
  (id, instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by)
SELECT ('17400000-0000-4000-8000-000000000' || right(i.id::text, 3))::uuid, i.id, tests.get_supabase_uid('cd_old'),
       true, true, i.status <> 'pending', i.status = 'completed', tests.get_supabase_uid('cd_dir')
  FROM public.assessment_instances i
 WHERE i.course_structure_id IN ('17400000-0000-4000-8000-0000000000a9', '17400000-0000-4000-8000-0000000000aa');
SELECT public.cancel_assessment_instance(tests.get_supabase_uid('cd_admin'),
  '17400000-0000-4000-8000-000000000ba2', 'Cancelación sintética para la prueba 174 (J)');
INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by, rationale) VALUES
  ('17400000-0000-4000-8000-000000000d91', '17400000-0000-4000-8000-000000000b91',
   '17400000-0000-4000-8000-000000000101', true, tests.get_supabase_uid('cd_old'), 'Respuesta sintética I'),
  ('17400000-0000-4000-8000-000000000d92', '17400000-0000-4000-8000-000000000b92',
   '17400000-0000-4000-8000-000000000101', true, tests.get_supabase_uid('cd_old'), 'Respuesta sintética I enviada');

SELECT tests.authenticate_as('cd_dir');
CREATE TEMP TABLE cd_res_i AS
  SELECT pg_temp.try_change('17400000-0000-4000-8000-0000000000a9', pg_temp.uid('cd_new'), 'Cambio con registro enviado') AS t;
CREATE TEMP TABLE cd_res_j AS
  SELECT pg_temp.try_change('17400000-0000-4000-8000-0000000000aa', pg_temp.uid('cd_new'), 'Cambio con registro anulado') AS t;
RESET ROLE;

-- (i) started on the old snapshot + SENT on the newest.
SELECT is((SELECT t FROM cd_res_i), 'ok', 'C-11 (i): the change of I succeeds');
SELECT results_eq($$
  SELECT (c.closed_instance_ids)::text, (c.kept_instance_ids)::text, cardinality(c.created_instance_ids)
    FROM public.course_docente_changes c WHERE c.course_structure_id = '17400000-0000-4000-8000-0000000000a9'
$$, $$ VALUES ('{17400000-0000-4000-8000-000000000b91}', '{17400000-0000-4000-8000-000000000b92}', 0) $$,
  'C-11 (i): history: the started one closed, the sent one kept, nothing created');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE instance_id = '17400000-0000-4000-8000-000000000b92' AND user_id = tests.get_supabase_uid('cd_new')), 0,
  'C-11 (i): the new teacher has NO grant on the sent registro');
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a9'), 2,
  'C-11 (i): no new registro exists for that instrument');
SELECT results_eq($$
  SELECT id::text, status FROM public.assessment_instances
   WHERE course_structure_id = '17400000-0000-4000-8000-0000000000a9' ORDER BY id
$$, $$ VALUES ('17400000-0000-4000-8000-000000000b91', 'archived'), ('17400000-0000-4000-8000-000000000b92', 'completed') $$,
  'C-11 (i): the started one is archived, the sent one stays completed');

-- (ii) started on the old snapshot + CANCELLED (not archived) on the newest.
SELECT is((SELECT t FROM cd_res_j), 'ok', 'C-11 (ii): the change of J succeeds');
SELECT results_eq($$
  SELECT (c.closed_instance_ids)::text, (c.kept_instance_ids)::text, cardinality(c.created_instance_ids)
    FROM public.course_docente_changes c WHERE c.course_structure_id = '17400000-0000-4000-8000-0000000000aa'
$$, $$ VALUES ('{17400000-0000-4000-8000-000000000ba1}', '{}', 0) $$,
  'C-11 (ii): history: the started one closed, nothing kept, nothing created');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE instance_id = '17400000-0000-4000-8000-000000000ba2' AND user_id = tests.get_supabase_uid('cd_new')), 0,
  'C-11 (ii): the new teacher has NO grant on the cancelled registro');
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '17400000-0000-4000-8000-0000000000aa'), 2,
  'C-11 (ii): nothing was created for J');

-- =============================================================================
-- [C-12] The course answer guard (assessment_response_course_guard): it exists,
--        and in an uncontended, sequential save it refuses nobody whom the row
--        rules let through. (The contended cases need two sessions: they are
--        proven by evidence/F25/race-ab.sh, outside this file.)
-- =============================================================================
SELECT has_trigger('public', 'assessment_responses', 'assessment_response_course_guard_trg',
  'C-12: the course answer guard trigger exists on assessment_responses');
SELECT has_trigger('public', 'assessment_responses', 'assessment_response_via_guard_trg',
  'C-12: the vía guard trigger is still there');
SELECT is((SELECT prosecdef FROM pg_proc WHERE proname = 'assessment_response_course_guard'), true,
  'C-12: the course answer guard is SECURITY DEFINER');
SELECT is(coalesce((SELECT has_function_privilege('authenticated', p.oid, 'EXECUTE') FROM pg_proc p
                    WHERE p.proname = 'assessment_response_course_guard'), true), false,
  'C-12: authenticated may not EXECUTE the guard directly');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name, grade_id) VALUES
  ('17400000-0000-4000-8000-0000000000ab', 9740, '17400000-0000-4000-8000-00000000c0a1', '1_basico', 'CD Q', 97401);
INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, assigned_by, is_active) VALUES
  ('17400000-0000-4000-8000-0000000000ab', tests.get_supabase_uid('cd_old'), tests.get_supabase_uid('cd_dir'), true);
INSERT INTO public.assessment_instances
  (id, template_snapshot_id, school_id, course_structure_id, transformation_year, generation_type, status) VALUES
  ('17400000-0000-4000-8000-000000000bb1', '17400000-0000-4000-8000-0000000000f1', 9740, '17400000-0000-4000-8000-0000000000ab', 2, 'GI', 'pending'),
  ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-0000000000f2', 9740, '17400000-0000-4000-8000-0000000000ab', 2, 'GI', 'in_progress');
INSERT INTO public.assessment_instance_assignees
  (id, instance_id, user_id, can_edit, can_submit, has_started, has_submitted, assigned_by) VALUES
  ('17400000-0000-4000-8000-000000000bb1', '17400000-0000-4000-8000-000000000bb1', tests.get_supabase_uid('cd_old'), true, true, false, false, tests.get_supabase_uid('cd_dir')),
  ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000bb2', tests.get_supabase_uid('cd_old'), true, true, true, false, tests.get_supabase_uid('cd_dir')),
  ('17400000-0000-4000-8000-000000000cb2', '17400000-0000-4000-8000-000000000bb2', tests.get_supabase_uid('cd_new'), false, false, false, false, tests.get_supabase_uid('cd_dir'));

SELECT tests.authenticate_as('cd_old');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb1', '17400000-0000-4000-8000-000000000101', true, pg_temp.uid('cd_old'))
$$, 'C-12: the teacher saves the first answer on his pending course registro');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000101', true, pg_temp.uid('cd_old'))
  ON CONFLICT (instance_id, indicator_id) DO UPDATE SET coverage_value = EXCLUDED.coverage_value
$$, 'C-12: the teacher saves an answer on his in-progress course registro');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000101', false, pg_temp.uid('cd_old'))
  ON CONFLICT (instance_id, indicator_id) DO UPDATE SET coverage_value = EXCLUDED.coverage_value
$$, 'C-12: the teacher changes that answer (the save route''s upsert)');
RESET ROLE;
SELECT is((SELECT coverage_value FROM public.assessment_responses
            WHERE instance_id = '17400000-0000-4000-8000-000000000bb2' AND indicator_id = '17400000-0000-4000-8000-000000000101'), false,
  'C-12: the changed answer is stored');

SELECT tests.authenticate_as('cd_new');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000102', true, pg_temp.uid('cd_new'))
$$, '42501', NULL, 'C-12: a teacher whose grant has no edit is still refused (42501)');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb1', '17400000-0000-4000-8000-000000000102', true, pg_temp.uid('cd_new'))
$$, '42501', NULL, 'C-12: a teacher with no grant at all is still refused (42501)');
RESET ROLE;
SELECT tests.authenticate_as('cd_old');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000b21', '17400000-0000-4000-8000-000000000109', true, pg_temp.uid('cd_old'))
$$, '42501', NULL, 'C-12: a write on an archived course registro is still refused (42501)');
RESET ROLE;

SELECT tests.authenticate_as('cd_admin');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000103', true, pg_temp.uid('cd_admin'))
$$, 'C-12: an assessment admin still writes an answer on a course registro');
RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '', true);
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('17400000-0000-4000-8000-000000000bb2', '17400000-0000-4000-8000-000000000104', true, NULL)
$$, 'C-12: the service role (no signed-in user) still writes an answer on a course registro');
RESET ROLE;

-- Per-state table for the build report.
SELECT diag(format('%s | %s | %s | grant(old) edit=%s submit=%s',
       c.course_name, i.status, CASE WHEN i.cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'live' END,
       a.can_edit, a.can_submit))
  FROM public.assessment_instances i
  JOIN public.school_course_structure c ON c.id = i.course_structure_id
  LEFT JOIN public.assessment_instance_assignees a ON a.instance_id = i.id AND a.user_id = tests.get_supabase_uid('cd_old')
 WHERE i.id::text LIKE '17400000-%'
 ORDER BY i.id;

SELECT * FROM finish();
ROLLBACK;
