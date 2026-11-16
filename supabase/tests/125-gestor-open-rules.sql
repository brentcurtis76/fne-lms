-- =============================================================================
-- 125-gestor-open-rules.sql — GENERA fixes F1 (Gestor de Cambio): database
-- rules that were left open. Proves, per persona, the behaviour of migration
-- 20261116170000_gestor_close_open_rules.sql:
--   [GC-17] assessment_objectives: only an admin inserts, updates, deletes;
--           only an active admin or consultor reads (not anon, not docentes
--           or directivos).
--   [GC-19] assessment_template_snapshots, assessment_year_expectations,
--           assessment_context_questions, assessment_sub_questions: readable by
--           signed-in people only (anon sees nothing).
--   [GC-18] assessment_responses / assessment_instances: an assignee with
--           can_edit writes answers only while the registro is pending or
--           in_progress, may move it pending -> in_progress -> completed and
--           nothing else; admin unchanged.
--   [C-11]  ab_migration_plan: readable by an admin, the school's equipo
--           directivo and active consultores with a current assignment to
--           that school only (not anon, not others)
--           (owner's decision 16 Nov 2026: a consultor reads the plan of assigned schools only).
--
-- Personas: anon; docente (assignee of registros A, B and C, can_edit and
-- can_submit); docente of school 2 assigned to nothing; equipo_directivo of
-- school 1; equipo_directivo of school 2; active consultor (assigned to
-- school 1); admin; second
-- docente (assignee of B and C, can_edit); docente assigned to C without edit
-- rights (can_edit false).
-- Synthetic fixtures (schools -1170xx, uuids 11700000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(85);

-- -----------------------------------------------------------------------------
-- Fixtures (postgres)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('gc117_docente');
SELECT tests.create_supabase_user('gc117_docente_unrel');
SELECT tests.create_supabase_user('gc117_dir1');
SELECT tests.create_supabase_user('gc117_dir2');
SELECT tests.create_supabase_user('gc117_cons');
SELECT tests.create_supabase_user('gc117_admin');
SELECT tests.create_supabase_user('gc117_docente2');
SELECT tests.create_supabase_user('gc117_viewer');

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved', false
FROM (VALUES ('gc117_docente'), ('gc117_docente_unrel'), ('gc117_dir1'), ('gc117_dir2'),
             ('gc117_cons'), ('gc117_admin'), ('gc117_docente2'), ('gc117_viewer')) AS x(ident);

INSERT INTO public.schools (id, name) VALUES
  (-117001, 'GC117 Synthetic School 1'),
  (-117002, 'GC117 Synthetic School 2');

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('gc117_docente'),       'docente',          -117001, true),
  (tests.get_supabase_uid('gc117_docente_unrel'), 'docente',          -117002, true),
  (tests.get_supabase_uid('gc117_dir1'),          'equipo_directivo', -117001, true),
  (tests.get_supabase_uid('gc117_dir2'),          'equipo_directivo', -117002, true),
  (tests.get_supabase_uid('gc117_cons'),          'consultor',        NULL,    true),
  (tests.get_supabase_uid('gc117_admin'),         'admin',            NULL,    true),
  (tests.get_supabase_uid('gc117_docente2'),      'docente',          -117001, true),
  (tests.get_supabase_uid('gc117_viewer'),        'docente',          -117001, true);

INSERT INTO public.ab_grades (id, name, sort_order) VALUES (-117011, 'GC117 Grade', 117011);

INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('11700000-0000-4000-8000-0000000000e1', 'personalizacion', '1.0', 'GC117 Synthetic Template', 'published', -117011);

-- a1: the proceso every persona tries to rename; a3: a childless proceso every
-- persona tries to delete.
INSERT INTO public.assessment_objectives (id, template_id, name, display_order) VALUES
  ('11700000-0000-4000-8000-0000000000a1', '11700000-0000-4000-8000-0000000000e1', 'GC117 Proceso 1', 1),
  ('11700000-0000-4000-8000-0000000000a3', '11700000-0000-4000-8000-0000000000e1', 'GC117 Proceso 3', 3);

INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order) VALUES
  ('11700000-0000-4000-8000-0000000000b1', '11700000-0000-4000-8000-0000000000e1',
   '11700000-0000-4000-8000-0000000000a1', 'GC117 Practica 1', 1);

INSERT INTO public.assessment_indicators (id, module_id, name, category, display_order) VALUES
  ('11700000-0000-4000-8000-0000000000c1', '11700000-0000-4000-8000-0000000000b1', 'GC117 Indicador 1', 'cobertura', 1),
  ('11700000-0000-4000-8000-0000000000c2', '11700000-0000-4000-8000-0000000000b1', 'GC117 Indicador 2', 'cobertura', 2),
  ('11700000-0000-4000-8000-0000000000c3', '11700000-0000-4000-8000-0000000000b1', 'GC117 Indicador 3', 'cobertura', 3);

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data) VALUES
  ('11700000-0000-4000-8000-0000000000f1', '11700000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}');

INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, year_1_expected) VALUES
  ('11700000-0000-4000-8000-0000000000d1', '11700000-0000-4000-8000-0000000000e1',
   '11700000-0000-4000-8000-0000000000c1', 1);

INSERT INTO public.assessment_context_questions (id, template_id, question_text, question_type, display_order) VALUES
  ('11700000-0000-4000-8000-0000000000d2', '11700000-0000-4000-8000-0000000000e1', 'GC117 Pregunta de contexto', 'text', 1);

INSERT INTO public.assessment_sub_questions (id, indicator_id, question_text, question_type, trigger_condition, display_order) VALUES
  ('11700000-0000-4000-8000-0000000000d3', '11700000-0000-4000-8000-0000000000c1', 'GC117 Subpregunta', 'text', '{}', 1);

-- Registro A: pending. Registro B: completed (already sent), with one answer.
-- Registro C: in_progress, with one answer by the docente (GC-18t).
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, transformation_year, status, completed_at) VALUES
  ('11700000-0000-4000-8000-000000000101', '11700000-0000-4000-8000-0000000000f1', -117001, 1, 'pending', NULL),
  ('11700000-0000-4000-8000-000000000102', '11700000-0000-4000-8000-0000000000f1', -117001, 1, 'completed', now()),
  ('11700000-0000-4000-8000-000000000103', '11700000-0000-4000-8000-0000000000f1', -117001, 1, 'in_progress', NULL);

INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit) VALUES
  ('11700000-0000-4000-8000-000000000201', '11700000-0000-4000-8000-000000000101', tests.get_supabase_uid('gc117_docente'), true, true),
  ('11700000-0000-4000-8000-000000000202', '11700000-0000-4000-8000-000000000102', tests.get_supabase_uid('gc117_docente'), true, true),
  ('11700000-0000-4000-8000-000000000203', '11700000-0000-4000-8000-000000000103', tests.get_supabase_uid('gc117_docente'), true, true),
  ('11700000-0000-4000-8000-000000000204', '11700000-0000-4000-8000-000000000103', tests.get_supabase_uid('gc117_docente2'), true, false),
  ('11700000-0000-4000-8000-000000000205', '11700000-0000-4000-8000-000000000102', tests.get_supabase_uid('gc117_docente2'), true, false),
  ('11700000-0000-4000-8000-000000000206', '11700000-0000-4000-8000-000000000103', tests.get_supabase_uid('gc117_viewer'), false, false);

INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by) VALUES
  ('11700000-0000-4000-8000-000000000301', '11700000-0000-4000-8000-000000000102',
   '11700000-0000-4000-8000-0000000000c1', true, tests.get_supabase_uid('gc117_docente')),
  ('11700000-0000-4000-8000-000000000306', '11700000-0000-4000-8000-000000000103',
   '11700000-0000-4000-8000-0000000000c1', true, tests.get_supabase_uid('gc117_docente'));

-- C-11: one migration-plan row for school 1, one for school 2; the consultor is
-- assigned (active, no end date) to school 1 only
-- (owner's decision 16 Nov 2026: a consultor reads the plan of assigned schools only).
INSERT INTO public.ab_migration_plan (id, school_id, year_number, grade_id, generation_type) VALUES
  (-117101, -117001, 1, -117011, 'GT'),
  (-117102, -117002, 1, -117011, 'GT');
INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, assignment_type) VALUES
  (tests.get_supabase_uid('gc117_cons'), -117001, true, 'monitoring');

-- -----------------------------------------------------------------------------
-- [GC-19] anon reads none of the four tables
-- -----------------------------------------------------------------------------
SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT is((SELECT count(*)::int FROM public.assessment_template_snapshots), 0, 'GC-19 anon: assessment_template_snapshots shows 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_year_expectations), 0, 'GC-19 anon: assessment_year_expectations shows 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_context_questions), 0, 'GC-19 anon: assessment_context_questions shows 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_sub_questions), 0, 'GC-19 anon: assessment_sub_questions shows 0 rows');
-- (anon and procesos: already closed before this phase; kept as a guard)
SELECT is((SELECT count(*)::int FROM public.assessment_objectives), 0, 'GC-17 anon: assessment_objectives shows 0 rows');
RESET ROLE;

-- [GC-19] every signed-in persona reads the fixture row of all four tables.
CREATE FUNCTION pg_temp.gc19_counts() RETURNS int[] LANGUAGE sql AS $$
  SELECT ARRAY[
    (SELECT count(*)::int FROM public.assessment_template_snapshots WHERE id = '11700000-0000-4000-8000-0000000000f1'),
    (SELECT count(*)::int FROM public.assessment_year_expectations  WHERE id = '11700000-0000-4000-8000-0000000000d1'),
    (SELECT count(*)::int FROM public.assessment_context_questions  WHERE id = '11700000-0000-4000-8000-0000000000d2'),
    (SELECT count(*)::int FROM public.assessment_sub_questions      WHERE id = '11700000-0000-4000-8000-0000000000d3')]
$$;

SELECT tests.authenticate_as('gc117_docente');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 docente: reads snapshot, expectation, context question, sub-question');
RESET ROLE;
SELECT tests.authenticate_as('gc117_docente_unrel');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 docente of school 2: reads the four fixture rows');
RESET ROLE;
SELECT tests.authenticate_as('gc117_dir1');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 directivo school 1: reads the four fixture rows');
RESET ROLE;
SELECT tests.authenticate_as('gc117_dir2');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 directivo school 2: reads the four fixture rows');
RESET ROLE;
SELECT tests.authenticate_as('gc117_cons');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 consultor: reads the four fixture rows');
RESET ROLE;
SELECT tests.authenticate_as('gc117_admin');
SELECT is(pg_temp.gc19_counts(), ARRAY[1,1,1,1], 'GC-19 admin: reads the four fixture rows');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- [GC-17] procesos generativos: non-admins cannot write; only admin and consultor read
-- -----------------------------------------------------------------------------
-- Broken-first persona: the unrelated docente.
SELECT tests.authenticate_as('gc117_docente_unrel');
SELECT throws_ok($$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('11700000-0000-4000-8000-0000000000a5', '11700000-0000-4000-8000-0000000000e1', 'GC117 intruso', 9)
$$, '42501', NULL, 'GC-17 docente of school 2: INSERT of a proceso is refused (42501)');
WITH u AS (UPDATE public.assessment_objectives SET name = 'GC117 renombrado'
           WHERE id = '11700000-0000-4000-8000-0000000000a1' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-17 docente of school 2: UPDATE of a proceso changes 0 rows');
WITH d AS (DELETE FROM public.assessment_objectives
           WHERE id = '11700000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'GC-17 docente of school 2: DELETE of a proceso changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_objectives WHERE id = '11700000-0000-4000-8000-0000000000a1'),
  0, 'GC-17 docente of school 2: does not read the proceso (0 rows)');
RESET ROLE;

SELECT tests.authenticate_as('gc117_docente');
SELECT throws_ok($$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('11700000-0000-4000-8000-0000000000a6', '11700000-0000-4000-8000-0000000000e1', 'GC117 intruso', 9)
$$, '42501', NULL, 'GC-17 docente: INSERT of a proceso is refused (42501)');
WITH u AS (UPDATE public.assessment_objectives SET name = 'GC117 renombrado'
           WHERE id = '11700000-0000-4000-8000-0000000000a1' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-17 docente: UPDATE of a proceso changes 0 rows');
WITH d AS (DELETE FROM public.assessment_objectives
           WHERE id = '11700000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'GC-17 docente: DELETE of a proceso changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_objectives WHERE id = '11700000-0000-4000-8000-0000000000a1'),
  0, 'GC-17 docente: does not read the proceso (0 rows)');
RESET ROLE;

SELECT tests.authenticate_as('gc117_dir1');
SELECT throws_ok($$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('11700000-0000-4000-8000-0000000000a7', '11700000-0000-4000-8000-0000000000e1', 'GC117 intruso', 9)
$$, '42501', NULL, 'GC-17 directivo: INSERT of a proceso is refused (42501)');
WITH u AS (UPDATE public.assessment_objectives SET name = 'GC117 renombrado'
           WHERE id = '11700000-0000-4000-8000-0000000000a1' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-17 directivo: UPDATE of a proceso changes 0 rows');
WITH d AS (DELETE FROM public.assessment_objectives
           WHERE id = '11700000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'GC-17 directivo: DELETE of a proceso changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_objectives WHERE id = '11700000-0000-4000-8000-0000000000a1'),
  0, 'GC-17 directivo: does not read the proceso (0 rows)');
RESET ROLE;

SELECT tests.authenticate_as('gc117_cons');
SELECT throws_ok($$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('11700000-0000-4000-8000-0000000000a8', '11700000-0000-4000-8000-0000000000e1', 'GC117 intruso', 9)
$$, '42501', NULL, 'GC-17 consultor: INSERT of a proceso is refused (42501)');
WITH u AS (UPDATE public.assessment_objectives SET name = 'GC117 renombrado'
           WHERE id = '11700000-0000-4000-8000-0000000000a1' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-17 consultor: UPDATE of a proceso changes 0 rows');
WITH d AS (DELETE FROM public.assessment_objectives
           WHERE id = '11700000-0000-4000-8000-0000000000a3' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 0, 'GC-17 consultor: DELETE of a proceso changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_objectives WHERE id = '11700000-0000-4000-8000-0000000000a1'),
  1, 'GC-17 consultor: still reads the proceso');
RESET ROLE;

-- As postgres: the non-admin attempts left the procesos exactly as they were.
SELECT is(
  (SELECT array_agg(id::text || ':' || name ORDER BY id) FROM public.assessment_objectives
    WHERE template_id = '11700000-0000-4000-8000-0000000000e1'),
  ARRAY['11700000-0000-4000-8000-0000000000a1:GC117 Proceso 1', '11700000-0000-4000-8000-0000000000a3:GC117 Proceso 3'],
  'GC-17: after the non-admin attempts the template still holds exactly its two procesos, unrenamed');

SELECT tests.authenticate_as('gc117_admin');
SELECT is((SELECT count(*)::int FROM public.assessment_objectives WHERE id = '11700000-0000-4000-8000-0000000000a1'),
  1, 'GC-17 admin: reads the proceso');
WITH i AS (INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
           VALUES ('11700000-0000-4000-8000-0000000000a9', '11700000-0000-4000-8000-0000000000e1', 'GC117 Proceso admin devuelto', 5)
           RETURNING id)
SELECT is((SELECT count(*)::int FROM i), 1, 'GC-17 admin: INSERT ... RETURNING of a proceso gives the row back (builder create route)');
SELECT lives_ok($$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('11700000-0000-4000-8000-0000000000a4', '11700000-0000-4000-8000-0000000000e1', 'GC117 Proceso admin', 4)
$$, 'GC-17 admin: INSERT of a proceso works');
WITH u AS (UPDATE public.assessment_objectives SET name = 'GC117 Proceso admin renombrado'
           WHERE id = '11700000-0000-4000-8000-0000000000a4' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-17 admin: UPDATE of a proceso changes 1 row');
WITH d AS (DELETE FROM public.assessment_objectives
           WHERE id = '11700000-0000-4000-8000-0000000000a4' RETURNING 1)
SELECT is((SELECT count(*)::int FROM d), 1, 'GC-17 admin: DELETE of a proceso changes 1 row');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- [GC-18] answers and status of a registro
-- -----------------------------------------------------------------------------
-- Completed registro B, as its own docente (can_edit true).
SELECT tests.authenticate_as('gc117_docente');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false
           WHERE id = '11700000-0000-4000-8000-000000000301' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente: UPDATE of an answer on a completed registro changes 0 rows');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-000000000302', '11700000-0000-4000-8000-000000000102',
          '11700000-0000-4000-8000-0000000000c2', true, auth.uid())
$$, '42501', NULL, 'GC-18 docente: INSERT of an answer on a completed registro is refused (42501)');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress'
           WHERE id = '11700000-0000-4000-8000-000000000102' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente: setting a completed registro back to in_progress changes 0 rows');
-- The docente still reads the sent registro and its answer.
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '11700000-0000-4000-8000-000000000102'),
  'completed', 'GC-18 docente: still reads the completed registro (status completed)');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = '11700000-0000-4000-8000-000000000102'),
  1, 'GC-18 docente: still reads the answer of the completed registro');
RESET ROLE;

SELECT is(
  (SELECT row(r.coverage_value, i.status)::text
     FROM public.assessment_responses r JOIN public.assessment_instances i ON i.id = r.instance_id
    WHERE r.id = '11700000-0000-4000-8000-000000000301'),
  '(t,completed)',
  'GC-18: as postgres, registro B and its answer are unchanged after the docente attempts');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = '11700000-0000-4000-8000-000000000102'),
  1, 'GC-18: as postgres, registro B still holds exactly one answer');

-- Unrelated docente: no write on registro A (true before and after the fix).
SELECT tests.authenticate_as('gc117_docente_unrel');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value)
  VALUES ('11700000-0000-4000-8000-000000000309', '11700000-0000-4000-8000-000000000101',
          '11700000-0000-4000-8000-0000000000c3', true)
$$, '42501', NULL, 'GC-18 docente of school 2: INSERT of an answer on registro A is refused (42501)');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress'
           WHERE id = '11700000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente of school 2: status UPDATE on registro A changes 0 rows');
RESET ROLE;

-- Pending registro A, as its docente: the save route, then the send route.
SELECT tests.authenticate_as('gc117_docente');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-000000000303', '11700000-0000-4000-8000-000000000101',
          '11700000-0000-4000-8000-0000000000c1', true, auth.uid())
$$, 'GC-18 docente: INSERT of an answer on a pending registro works');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false, rationale = 'GC117 guardado'
           WHERE id = '11700000-0000-4000-8000-000000000303' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 docente: UPDATE of its answer on a pending registro changes 1 row');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress', started_at = now()
           WHERE id = '11700000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 docente: pending -> in_progress (with started_at) changes 1 row');
RESET ROLE;

-- Unrelated docente cannot touch the answer of registro A.
SELECT tests.authenticate_as('gc117_docente_unrel');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = true
           WHERE id = '11700000-0000-4000-8000-000000000303' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente of school 2: UPDATE of an answer on registro A changes 0 rows');
RESET ROLE;

SELECT tests.authenticate_as('gc117_docente');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-000000000304', '11700000-0000-4000-8000-000000000101',
          '11700000-0000-4000-8000-0000000000c2', true, auth.uid())
$$, 'GC-18 docente: INSERT of an answer on an in_progress registro works');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = true
           WHERE id = '11700000-0000-4000-8000-000000000303' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 docente: UPDATE of its answer on an in_progress registro changes 1 row');
SELECT throws_ok($$
  UPDATE public.assessment_instances SET status = 'archived'
   WHERE id = '11700000-0000-4000-8000-000000000101'
$$, '42501', NULL, 'GC-18 docente: setting its registro to archived is refused (42501)');
WITH u AS (UPDATE public.assessment_instances SET status = 'completed', completed_at = now()
           WHERE id = '11700000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 docente: sending (in_progress -> completed, with completed_at) changes 1 row');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false
           WHERE id = '11700000-0000-4000-8000-000000000303' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente: UPDATE of an answer after sending changes 0 rows');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress'
           WHERE id = '11700000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 docente: re-opening its sent registro changes 0 rows');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = '11700000-0000-4000-8000-000000000101'),
  2, 'GC-18 docente: after sending it still reads both answers of registro A');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '11700000-0000-4000-8000-000000000101'),
  'completed', 'GC-18 docente: after sending it still reads registro A as completed');
RESET ROLE;

SELECT results_eq($$
  SELECT status, started_at IS NOT NULL, completed_at IS NOT NULL
    FROM public.assessment_instances WHERE id = '11700000-0000-4000-8000-000000000101'
$$, $$ VALUES ('completed'::text, true, true) $$,
  'GC-18: as postgres, registro A is completed with started_at and completed_at set');
SELECT results_eq($$
  SELECT has_started, has_submitted FROM public.assessment_instance_assignees
   WHERE id = '11700000-0000-4000-8000-000000000201'
$$, $$ VALUES (true, true) $$,
  'GC-18: as postgres, the progress-flags trigger marked the docente as started and submitted on registro A');
SELECT is(
  (SELECT array_agg(id::text || ':' || coverage_value::text ORDER BY id) FROM public.assessment_responses
    WHERE instance_id = '11700000-0000-4000-8000-000000000101'),
  ARRAY['11700000-0000-4000-8000-000000000303:true', '11700000-0000-4000-8000-000000000304:true'],
  'GC-18: as postgres, registro A answers hold the last value saved before sending');

-- [GC-18t a] The save route's upsert, as the docente, on an indicator that
-- already has an answer: works on in_progress registro C, refused on completed B.
SELECT tests.authenticate_as('gc117_docente');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-00000000030a', '11700000-0000-4000-8000-000000000103',
          '11700000-0000-4000-8000-0000000000c1', false, auth.uid())
  ON CONFLICT (instance_id, indicator_id) DO UPDATE SET coverage_value = EXCLUDED.coverage_value
$$, 'GC-18 docente: upsert of an existing answer on an in_progress registro works');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-00000000030b', '11700000-0000-4000-8000-000000000102',
          '11700000-0000-4000-8000-0000000000c1', false, auth.uid())
  ON CONFLICT (instance_id, indicator_id) DO UPDATE SET coverage_value = EXCLUDED.coverage_value
$$, '42501', NULL, 'GC-18 docente: upsert of an existing answer on a completed registro is refused (42501)');
RESET ROLE;
SELECT is((SELECT coverage_value FROM public.assessment_responses WHERE id = '11700000-0000-4000-8000-000000000306'),
  false, 'GC-18: as postgres, the upsert changed the stored answer of registro C (true -> false)');
SELECT is((SELECT coverage_value FROM public.assessment_responses WHERE id = '11700000-0000-4000-8000-000000000301'),
  true, 'GC-18: as postgres, the refused upsert left the stored answer of registro B unchanged (true)');

-- [GC-18t b] A second assignee with can_edit edits the first docente's answer
-- on in_progress registro C, but not on completed registro B.
SELECT tests.authenticate_as('gc117_docente2');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = true
           WHERE id = '11700000-0000-4000-8000-000000000306' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 second docente: UPDATE of the first docente''s answer on an in_progress registro changes 1 row');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false
           WHERE id = '11700000-0000-4000-8000-000000000301' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 second docente: UPDATE of an answer on a completed registro changes 0 rows');
RESET ROLE;

-- [GC-18t c] An assignee without edit rights (can_edit false) on in_progress
-- registro C: no writes, but still reads the registro and its answers.
SELECT tests.authenticate_as('gc117_viewer');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false
           WHERE id = '11700000-0000-4000-8000-000000000306' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 assignee without edit rights: UPDATE of an answer changes 0 rows');
SELECT throws_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value, responded_by)
  VALUES ('11700000-0000-4000-8000-00000000030c', '11700000-0000-4000-8000-000000000103',
          '11700000-0000-4000-8000-0000000000c2', true, auth.uid())
$$, '42501', NULL, 'GC-18 assignee without edit rights: INSERT of an answer is refused (42501)');
WITH u AS (UPDATE public.assessment_instances SET status = 'completed', completed_at = now()
           WHERE id = '11700000-0000-4000-8000-000000000103' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 0, 'GC-18 assignee without edit rights: status UPDATE changes 0 rows');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '11700000-0000-4000-8000-000000000103'),
  'in_progress', 'GC-18 assignee without edit rights: still reads the registro (status in_progress)');
SELECT is((SELECT count(*)::int FROM public.assessment_responses WHERE instance_id = '11700000-0000-4000-8000-000000000103'),
  1, 'GC-18 assignee without edit rights: still reads the answer of the registro');
RESET ROLE;
SELECT is((SELECT coverage_value FROM public.assessment_responses WHERE id = '11700000-0000-4000-8000-000000000306'),
  true, 'GC-18: as postgres, registro C answer holds the second docente''s value after the read-only assignee attempts');

-- Admin keeps full rights on a completed registro.
SELECT tests.authenticate_as('gc117_admin');
WITH u AS (UPDATE public.assessment_responses SET coverage_value = false, evidence_notes = 'GC117 admin'
           WHERE id = '11700000-0000-4000-8000-000000000301' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 admin: UPDATE of an answer on completed registro B changes 1 row');
SELECT lives_ok($$
  INSERT INTO public.assessment_responses (id, instance_id, indicator_id, coverage_value)
  VALUES ('11700000-0000-4000-8000-000000000305', '11700000-0000-4000-8000-000000000102',
          '11700000-0000-4000-8000-0000000000c2', true)
$$, 'GC-18 admin: INSERT of an answer on completed registro B works');
WITH u AS (UPDATE public.assessment_instances SET status = 'in_progress'
           WHERE id = '11700000-0000-4000-8000-000000000102' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 admin: status UPDATE of completed registro B changes 1 row');
WITH u AS (UPDATE public.assessment_instances SET status = 'archived'
           WHERE id = '11700000-0000-4000-8000-000000000102' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'GC-18 admin: archiving registro B changes 1 row');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- [C-11] migration plan: only admin, the school's directivo and consultores assigned to it read it
-- -----------------------------------------------------------------------------
SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan), 0, 'C-11 anon: ab_migration_plan shows 0 rows');
RESET ROLE;

SELECT tests.authenticate_as('gc117_docente_unrel');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan), 0, 'C-11 docente of school 2: ab_migration_plan shows 0 rows');
RESET ROLE;

SELECT tests.authenticate_as('gc117_dir2');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -117101), 0,
  'C-11 directivo school 2: does not see the migration plan of school 1');
RESET ROLE;

SELECT tests.authenticate_as('gc117_dir1');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -117101), 1,
  'C-11 directivo school 1: reads the migration plan of its school');
RESET ROLE;

SELECT tests.authenticate_as('gc117_cons');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -117101), 1,
  'C-11 active consultor assigned to school 1: reads the migration plan of school 1');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -117102), 0,
  'C-11 active consultor assigned to school 1: reads 0 rows of the migration plan of school 2 (not assigned)');
RESET ROLE;

SELECT tests.authenticate_as('gc117_admin');
SELECT is((SELECT count(*)::int FROM public.ab_migration_plan WHERE id = -117101), 1,
  'C-11 admin: reads the migration plan of school 1');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- The rules keep their names and their commands (no rule dropped or created)
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT array_agg(policyname || ':' || cmd || ':' || array_to_string(roles, ',') ORDER BY policyname)
     FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assessment_objectives'),
  ARRAY['assessment_objectives_delete_authenticated:DELETE:authenticated',
        'assessment_objectives_insert_authenticated:INSERT:authenticated',
        'assessment_objectives_select_authenticated:SELECT:authenticated',
        'assessment_objectives_update_authenticated:UPDATE:authenticated',
        'forced_password_change_guard:ALL:authenticated'],
  'assessment_objectives keeps its four rules (plus the forced-password guard), all for authenticated'
);
SELECT ok(
  (SELECT qual LIKE '%user_roles%' AND qual LIKE '%admin%' AND qual LIKE '%consultor%' AND qual LIKE '%is_active%'
     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assessment_objectives'
      AND policyname = 'assessment_objectives_select_authenticated'),
  'assessment_objectives select rule now requires an active admin or consultor role (no longer USING true)');
SELECT is(
  (SELECT array_agg(tablename || '.' || policyname || ':' || array_to_string(roles, ',') || ':' || qual ORDER BY tablename)
     FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename, policyname) IN (
        ('assessment_template_snapshots', 'assessment_template_snapshots_select'),
        ('assessment_year_expectations', 'assessment_year_expectations_select'),
        ('assessment_context_questions', 'assessment_context_questions_select'),
        ('assessment_sub_questions', 'assessment_sub_questions_select'))),
  ARRAY['assessment_context_questions.assessment_context_questions_select:authenticated:true',
        'assessment_sub_questions.assessment_sub_questions_select:authenticated:true',
        'assessment_template_snapshots.assessment_template_snapshots_select:authenticated:true',
        'assessment_year_expectations.assessment_year_expectations_select:authenticated:true'],
  'the four GC-19 select rules now apply to authenticated only, USING still true'
);
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('assessment_responses', 'assessment_instances')
      AND policyname IN ('assessment_responses_insert', 'assessment_responses_update', 'assessment_instances_update')),
  3, 'the three GC-18 rules still exist under their names');
SELECT is(
  (SELECT cmd || ':' || array_to_string(roles, ',') FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ab_migration_plan' AND policyname = 'ab_migration_plan_select'),
  'SELECT:authenticated', 'C-11: ab_migration_plan_select keeps its name and command, now for authenticated only');
SELECT * FROM finish();
ROLLBACK;
