-- =============================================================================
-- 074-consultor-scope.sql — Procesos de Cambio review remediation, Codex
-- round 1 finding 2: the temporary consultor DENIAL on the transversal-context
-- surface holds at the database, for a direct user-scoped connection.
--
-- Proves, against 20260908120000_consultor_scope.sql:
--   [C-1] context_general_responses: an assigned consultor and an unassigned
--         consultor SELECT 0 rows; INSERT is refused (42501); UPDATE / DELETE
--         touch 0 rows. Admin and the school's directivo still read (controls).
--   [C-2] school_change_history: the consultor SELECT policy admits ONLY
--         feature = 'migration_plan'. Observed with a direct user-scoped
--         connection the assigned consultor sees 0 rows even there, because
--         consultant_assignments has no consultor-self SELECT policy (the
--         policy's EXISTS subquery runs under the consultor's own RLS) —
--         pre-existing; the documented migration-plan access is served by the
--         API through the service role. Either way: never transversal_context
--         or context_responses. Directivo and admin controls unchanged.
--   [C-3] school_plan_completion_status: same shape — migration_plan only.
--   [C-4] PROC-CONSULTOR-C1 supersedes the former denial on the
--         transversal-context CORE (context, courses, assignments): against
--         20261001190000_consultor_context_select.sql, an ACTIVE consultor
--         SELECTs every registered school on all three tables, assigned or
--         not, while INSERT stays refused (42501) and UPDATE / DELETE touch 0
--         rows. An INACTIVE consultor, a docente and anon are denied every
--         operation on all three core tables — SELECT, INSERT (42501),
--         UPDATE and DELETE (0 rows) — except the docente's own assignment
--         row, which its own assignment grants and which stays read-only.
--         RLS stays enabled on the three tables.
--   [C-5] the three consultor-scoped policies carry the narrowed predicate in
--         pg_policies.
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(97);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('cs_cons_a');     -- assigned to school 9980
SELECT tests.create_supabase_user('cs_cons_none');  -- consultor, no assignment
SELECT tests.create_supabase_user('cs_cons_off');   -- consultor role, is_active = false
SELECT tests.create_supabase_user('cs_dir_a');      -- directivo of 9980
SELECT tests.create_supabase_user('cs_admin');
SELECT tests.create_supabase_user('cs_docente');    -- docente of 9980
SELECT tests.create_supabase_user('cs_docente_b');  -- docente of 9981

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('cs_cons_a'), ('cs_cons_none'), ('cs_cons_off'), ('cs_dir_a'), ('cs_admin'), ('cs_docente'), ('cs_docente_b')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (9980, 'Consultor Scope School A'),
  (9981, 'Consultor Scope School B')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('cs_cons_a'),    'consultor',        NULL, true),
  (tests.get_supabase_uid('cs_cons_none'), 'consultor',        NULL, true),
  (tests.get_supabase_uid('cs_cons_off'),  'consultor',        NULL, false),
  (tests.get_supabase_uid('cs_dir_a'),     'equipo_directivo', 9980, true),
  (tests.get_supabase_uid('cs_admin'),     'admin',            NULL, true),
  (tests.get_supabase_uid('cs_docente'),   'docente',          9980, true),
  (tests.get_supabase_uid('cs_docente_b'), 'docente',          9981, true);

INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, assignment_type)
VALUES (tests.get_supabase_uid('cs_cons_a'), 9980, true, 'monitoring');

-- The `tests` schema is not readable by `authenticated` / `anon`, so calling
-- tests.get_supabase_uid() inside a throws_ok body would raise 42501 for the
-- wrong reason and turn a denial assertion into a false positive. The uids are
-- captured here, as the owner, and read back with current_setting().
SELECT set_config('proc10.uid_cons_a',    tests.get_supabase_uid('cs_cons_a')::text,    true);
SELECT set_config('proc10.uid_cons_none', tests.get_supabase_uid('cs_cons_none')::text, true);
SELECT set_config('proc10.uid_cons_off',  tests.get_supabase_uid('cs_cons_off')::text,  true);
SELECT set_config('proc10.uid_docente_b', tests.get_supabase_uid('cs_docente_b')::text, true);

INSERT INTO public.context_general_questions (id, question_key, question_text, question_type, is_required, is_active, display_order, widget_type)
VALUES ('74000000-0000-4000-8000-0000000000a1', 'cs_scope_q1', 'Pregunta sintética', 'text', false, true, 1, 'generic');

INSERT INTO public.context_general_responses (school_id, question_id, response, responded_by) VALUES
  (9980, '74000000-0000-4000-8000-0000000000a1', '"respuesta A"'::jsonb, tests.get_supabase_uid('cs_dir_a')),
  (9981, '74000000-0000-4000-8000-0000000000a1', '"respuesta B"'::jsonb, tests.get_supabase_uid('cs_admin'));

INSERT INTO public.school_change_history (school_id, feature, action, previous_state, new_state, changed_fields, user_id, user_name) VALUES
  (9980, 'transversal_context', 'initial_save', '{}', '{"total_students": 1}', ARRAY['total_students'], tests.get_supabase_uid('cs_dir_a'), 'cs_dir_a'),
  (9980, 'context_responses',   'initial_save', '{}', '{"q": 1}',              ARRAY['q'],              tests.get_supabase_uid('cs_dir_a'), 'cs_dir_a'),
  (9980, 'migration_plan',      'initial_save', '{}', '{"plan": 1}',           ARRAY['plan'],           tests.get_supabase_uid('cs_dir_a'), 'cs_dir_a'),
  (9981, 'migration_plan',      'initial_save', '{}', '{"plan": 1}',           ARRAY['plan'],           tests.get_supabase_uid('cs_admin'), 'cs_admin');

INSERT INTO public.school_plan_completion_status (school_id, feature, is_completed) VALUES
  (9980, 'migration_plan',    true),
  (9980, 'context_responses', true),
  (9981, 'migration_plan',    true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES ('74000000-0000-4000-8000-00000000c0a1', 9980, 100, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name)
VALUES ('74000000-0000-4000-8000-00000000cc01', 9980, '74000000-0000-4000-8000-00000000c0a1', '1_basico', '1° Básico A');

INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
VALUES ('74000000-0000-4000-8000-00000000cc01', tests.get_supabase_uid('cs_docente'), true);

-- School B: the second registered school, so an all-school read is observable
-- and a single-school read is distinguishable from it.
INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES ('74000000-0000-4000-8000-00000000c0b1', 9981, 200, ARRAY['2_basico'], '{"2_basico": 1}', 2, 'trimestral');

INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name)
VALUES ('74000000-0000-4000-8000-00000000cc02', 9981, '74000000-0000-4000-8000-00000000c0b1', '2_basico', '2 Basico A');

INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
VALUES ('74000000-0000-4000-8000-00000000cc02', tests.get_supabase_uid('cs_docente_b'), true);

-- -----------------------------------------------------------------------------
-- [C-5] the policies carry the narrowed predicates
-- -----------------------------------------------------------------------------
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'context_general_responses'
     AND policyname = 'Admin and consultor can read all responses') NOT LIKE '%consultor%',
  'C-5: the context_general_responses SELECT policy no longer names consultor');
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_change_history'
     AND policyname = 'school_change_history_consultor_select') LIKE '%migration_plan%',
  'C-5: the change-history consultor policy is restricted to migration_plan');
SELECT ok(
  (SELECT qual FROM pg_policies WHERE schemaname = 'public' AND tablename = 'school_plan_completion_status'
     AND policyname = 'school_plan_completion_consultor_select') LIKE '%migration_plan%',
  'C-5: the completion-status consultor policy is restricted to migration_plan');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.context_general_responses'::regclass), 'C-5: RLS enabled on context_general_responses');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.school_change_history'::regclass), 'C-5: RLS enabled on school_change_history');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.school_plan_completion_status'::regclass), 'C-5: RLS enabled on school_plan_completion_status');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.school_transversal_context'::regclass), 'C-4: RLS enabled on school_transversal_context');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.school_course_structure'::regclass), 'C-4: RLS enabled on school_course_structure');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.school_course_docente_assignments'::regclass), 'C-4: RLS enabled on school_course_docente_assignments');

-- -----------------------------------------------------------------------------
-- Assigned consultor (cs_cons_a, school 9980)
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('cs_cons_a');

-- [C-1]
SELECT is((SELECT count(*)::int FROM public.context_general_responses), 0,
  'C-1: assigned consultor SELECTs 0 custom context responses (own school included)');
SELECT throws_ok($$
  INSERT INTO public.context_general_responses (school_id, question_id, response)
  VALUES (9980, '74000000-0000-4000-8000-0000000000a1', '"x"'::jsonb)
$$, '42501', NULL, 'C-1: assigned consultor INSERT into context_general_responses is refused');
WITH u AS (UPDATE public.context_general_responses SET response = '"y"'::jsonb WHERE school_id = 9980 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-1: assigned consultor UPDATE touches 0 responses');
WITH d AS (DELETE FROM public.context_general_responses WHERE school_id = 9980 RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-1: assigned consultor DELETE touches 0 responses');

-- [C-2]
SELECT is((SELECT count(*)::int FROM public.school_change_history WHERE feature IN ('transversal_context', 'context_responses')), 0,
  'C-2: transversal_context and context_responses history: 0 rows for the assigned consultor');
SELECT is((SELECT count(*)::int FROM public.school_change_history WHERE school_id = 9981), 0,
  'C-2: history of a non-assigned school: 0 rows');
SELECT is((SELECT count(*)::int FROM public.school_change_history), 0,
  'C-2: direct read: 0 history rows in total (consultant_assignments is not consultor-self-readable; API serves migration_plan via service role)');

-- [C-3]
SELECT is((SELECT count(*)::int FROM public.school_plan_completion_status WHERE feature = 'context_responses'), 0,
  'C-3: context_responses completion: 0 rows for the assigned consultor');
SELECT is((SELECT count(*)::int FROM public.school_plan_completion_status), 0,
  'C-3: direct read: 0 completion rows in total (same reason as C-2)');

-- [C-4] READ: every registered school, not just the assigned one
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9980, 9981],
  'C-4: assigned consultor reads the transversal context of BOTH registered schools');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_course_structure), ARRAY[9980, 9981],
  'C-4: assigned consultor reads the course structure of BOTH registered schools');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 2,
  'C-4: assigned consultor reads the docente assignments of BOTH registered schools');

-- [C-4] WRITE: refused on every core table, own school and foreign school alike
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9980, 1, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')
$$, '42501', NULL, 'C-4: assigned consultor INSERT into school_transversal_context is refused');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 999 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: assigned consultor UPDATE touches 0 transversal contexts');
WITH d AS (DELETE FROM public.school_transversal_context RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: assigned consultor DELETE touches 0 transversal contexts');

SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9980, '74000000-0000-4000-8000-00000000c0a1', '1_basico', '1 Basico Z')
$$, '42501', NULL, 'C-4: assigned consultor INSERT into school_course_structure is refused');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'Renombrado' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: assigned consultor UPDATE touches 0 courses');
WITH d AS (DELETE FROM public.school_course_structure RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: assigned consultor DELETE touches 0 courses');

SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
  VALUES ('74000000-0000-4000-8000-00000000cc01', current_setting('proc10.uid_cons_a')::uuid, true)
$$, '42501', NULL, 'C-4: assigned consultor INSERT into school_course_docente_assignments is refused');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: assigned consultor UPDATE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: assigned consultor DELETE touches 0 docente assignments');

-- -----------------------------------------------------------------------------
-- Unassigned consultor (cs_cons_none)
-- -----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('cs_cons_none');
SELECT is((SELECT count(*)::int FROM public.context_general_responses), 0, 'C-1: unassigned consultor sees 0 custom responses (was: every school)');
SELECT throws_ok($$
  INSERT INTO public.context_general_responses (school_id, question_id, response)
  VALUES (9981, '74000000-0000-4000-8000-0000000000a1', '"x"'::jsonb)
$$, '42501', NULL, 'C-1: unassigned consultor INSERT is refused');
SELECT is((SELECT count(*)::int FROM public.school_change_history), 0, 'C-2: unassigned consultor sees no history at all');
SELECT is((SELECT count(*)::int FROM public.school_plan_completion_status), 0, 'C-3: unassigned consultor sees no completion rows');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9980, 9981],
  'C-4: unassigned consultor reads the transversal context of BOTH registered schools (the role grants it, not the assignment)');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_course_structure), ARRAY[9980, 9981],
  'C-4: unassigned consultor reads the course structure of BOTH registered schools');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 2,
  'C-4: unassigned consultor reads the docente assignments of BOTH registered schools');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9981, 1, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')
$$, '42501', NULL, 'C-4: unassigned consultor INSERT into school_transversal_context is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9981, '74000000-0000-4000-8000-00000000c0b1', '2_basico', '2 Basico Z')
$$, '42501', NULL, 'C-4: unassigned consultor INSERT into school_course_structure is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
  VALUES ('74000000-0000-4000-8000-00000000cc02', current_setting('proc10.uid_cons_none')::uuid, true)
$$, '42501', NULL, 'C-4: unassigned consultor INSERT into school_course_docente_assignments is refused');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 998 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: unassigned consultor UPDATE touches 0 transversal contexts');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'Renombrado B' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: unassigned consultor UPDATE touches 0 courses');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: unassigned consultor UPDATE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_transversal_context RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: unassigned consultor DELETE touches 0 transversal contexts');
WITH d AS (DELETE FROM public.school_course_structure RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: unassigned consultor DELETE touches 0 courses');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: unassigned consultor DELETE touches 0 docente assignments');

-- -----------------------------------------------------------------------------
-- Inactive consultor (cs_cons_off): the grant is is_active-gated
-- -----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('cs_cons_off');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'C-4: inactive consultor reads no transversal context');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 0, 'C-4: inactive consultor reads no course structure');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 0, 'C-4: inactive consultor reads no docente assignments');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9980, 1, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')
$$, '42501', NULL, 'C-4: inactive consultor INSERT into school_transversal_context is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9980, '74000000-0000-4000-8000-00000000c0a1', '1_basico', '1 Basico Off')
$$, '42501', NULL, 'C-4: inactive consultor INSERT into school_course_structure is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
  VALUES ('74000000-0000-4000-8000-00000000cc01', current_setting('proc10.uid_cons_off')::uuid, true)
$$, '42501', NULL, 'C-4: inactive consultor INSERT into school_course_docente_assignments is refused');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 997 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: inactive consultor UPDATE touches 0 transversal contexts');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'Renombrado Off' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: inactive consultor UPDATE touches 0 courses');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: inactive consultor UPDATE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: inactive consultor DELETE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_course_structure RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: inactive consultor DELETE touches 0 courses');
WITH d AS (DELETE FROM public.school_transversal_context RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: inactive consultor DELETE touches 0 transversal contexts');

-- -----------------------------------------------------------------------------
-- Docente (cs_docente): another user's consultor role never confers the grant
-- -----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('cs_docente');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0,
  'C-4: docente reads no transversal context (another user''s consultor row confers nothing)');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 0,
  'C-4: docente reads no course structure');
-- The docente's OWN assignment row stays readable: that grant comes from the
-- assignment itself, never from the consultor policy. It is the control that
-- keeps the denials below honest.
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 1,
  'control: docente reads exactly ONE docente assignment row (a consultor reads both)');
SELECT is((SELECT array_agg(course_structure_id) FROM public.school_course_docente_assignments),
  ARRAY['74000000-0000-4000-8000-00000000cc01'::uuid],
  'control: the single row a docente reads is their own course assignment');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9980, 1, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')
$$, '42501', NULL, 'C-4: docente INSERT into school_transversal_context is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9980, '74000000-0000-4000-8000-00000000c0a1', '1_basico', '1 Basico Doc')
$$, '42501', NULL, 'C-4: docente INSERT into school_course_structure is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
  VALUES ('74000000-0000-4000-8000-00000000cc01', current_setting('proc10.uid_docente_b')::uuid, true)
$$, '42501', NULL, 'C-4: docente INSERT into school_course_docente_assignments is refused');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 996 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: docente UPDATE touches 0 transversal contexts');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'Renombrado Doc' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: docente UPDATE touches 0 courses');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'C-4: docente UPDATE touches 0 docente assignments (not even their own)');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: docente DELETE touches 0 docente assignments (not even their own)');
WITH d AS (DELETE FROM public.school_course_structure RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: docente DELETE touches 0 courses');
WITH d AS (DELETE FROM public.school_transversal_context RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'C-4: docente DELETE touches 0 transversal contexts');

-- -----------------------------------------------------------------------------
-- Controls: the directivo of school A and the admin are unaffected
-- -----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('cs_dir_a');
SELECT is((SELECT array_agg(school_id) FROM public.context_general_responses), ARRAY[9980],
  'control: directivo reads own-school custom responses only');
SELECT is((SELECT array_agg(DISTINCT feature ORDER BY feature) FROM public.school_change_history),
  ARRAY['context_responses', 'migration_plan', 'transversal_context'],
  'control: directivo reads every feature of own-school history');
SELECT is((SELECT array_agg(DISTINCT school_id) FROM public.school_change_history), ARRAY[9980],
  'control: directivo history is own school only');
SELECT is((SELECT array_agg(feature ORDER BY feature) FROM public.school_plan_completion_status),
  ARRAY['context_responses', 'migration_plan'],
  'control: directivo reads both completion features of own school');
SELECT is((SELECT array_agg(school_id) FROM public.school_transversal_context), ARRAY[9980],
  'control: directivo reads own-school transversal context ONLY (the consultor grant does not widen it)');
SELECT is((SELECT array_agg(school_id) FROM public.school_course_structure), ARRAY[9980],
  'control: directivo reads own-school course structure only');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 1,
  'control: directivo reads own-school docente assignments only');

RESET ROLE;
SELECT tests.authenticate_as('cs_admin');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.context_general_responses), ARRAY[9980, 9981],
  'control: admin reads every school''s custom responses');
SELECT is((SELECT count(*)::int FROM public.school_change_history), 4, 'control: admin reads all history rows');
SELECT is((SELECT count(*)::int FROM public.school_plan_completion_status), 3, 'control: admin reads all completion rows');
SELECT is((SELECT array_agg(school_id ORDER BY school_id) FROM public.school_transversal_context), ARRAY[9980, 9981],
  'control: admin reads every school''s transversal context');

-- -----------------------------------------------------------------------------
-- anon: nothing
-- -----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT is((SELECT count(*)::int FROM public.context_general_responses), 0, 'anon: 0 custom responses');
SELECT is((SELECT count(*)::int FROM public.school_change_history), 0, 'anon: 0 history rows');
SELECT is((SELECT count(*)::int FROM public.school_plan_completion_status), 0, 'anon: 0 completion rows');
SELECT is((SELECT count(*)::int FROM public.school_transversal_context), 0, 'anon: 0 transversal contexts');
SELECT is((SELECT count(*)::int FROM public.school_course_structure), 0, 'anon: 0 courses');
SELECT is((SELECT count(*)::int FROM public.school_course_docente_assignments), 0, 'anon: 0 docente assignments');
SELECT throws_ok($$
  INSERT INTO public.school_transversal_context (school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
  VALUES (9980, 1, ARRAY['1_basico'], '{"1_basico": 1}', 1, 'semestral')
$$, '42501', NULL, 'anon: INSERT into school_transversal_context is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_structure (school_id, context_id, grade_level, course_name)
  VALUES (9980, '74000000-0000-4000-8000-00000000c0a1', '1_basico', '1 Basico Anon')
$$, '42501', NULL, 'anon: INSERT into school_course_structure is refused');
SELECT throws_ok($$
  INSERT INTO public.school_course_docente_assignments (course_structure_id, docente_id, is_active)
  VALUES ('74000000-0000-4000-8000-00000000cc01', current_setting('proc10.uid_docente_b')::uuid, true)
$$, '42501', NULL, 'anon: INSERT into school_course_docente_assignments is refused');
WITH u AS (UPDATE public.school_transversal_context SET total_students = 995 RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'anon: UPDATE touches 0 transversal contexts');
WITH u AS (UPDATE public.school_course_structure SET course_name = 'Renombrado Anon' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'anon: UPDATE touches 0 courses');
WITH u AS (UPDATE public.school_course_docente_assignments SET is_active = false RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'anon: UPDATE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_course_docente_assignments RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'anon: DELETE touches 0 docente assignments');
WITH d AS (DELETE FROM public.school_course_structure RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'anon: DELETE touches 0 courses');
WITH d AS (DELETE FROM public.school_transversal_context RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'anon: DELETE touches 0 transversal contexts');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
