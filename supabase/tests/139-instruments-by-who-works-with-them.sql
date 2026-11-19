-- =============================================================================
-- 139-instruments-by-who-works-with-them.sql — GENERA fixes F1b-2 (N1, part 2).
-- Proves migration 20261118102000_instruments_by_who_works_with_them.sql:
-- an instrument is read only by the people who work with it (owner's
-- decision, 17 Nov 2026):
--   * STRUCTURE (assessment_templates, assessment_objectives,
--     assessment_modules, assessment_indicators, assessment_context_questions,
--     assessment_sub_questions): admins; consultores with a current assignment
--     to, and the equipo directivo of, a school the instrument is delivered to
--     (an assessment_instances row of that school made from one of its stored
--     versions); teachers who are assignees of a registro made from it, in
--     any state.
--   * EXPECTED LEVELS (assessment_year_expectations) and STORED VERSIONS
--     (assessment_template_snapshots): the same admins, consultores and
--     directivos; teachers only once a registro of theirs made from it has
--     status 'completed' (sent). A registro is one shared thing: once any of
--     its assignees has sent it, every assignee reads the levels.
--   * everybody else (an ended assignment, a demo-access row alone, a teacher
--     with no registro, anon): nothing.
-- Personas: admin; consultor assigned to S1; consultor assigned to S2 only;
-- consultor whose assignment to S1 ended; directivo of S1; directivo of S2;
-- teacher with an unsent registro of T1 (then the same after sending); a
-- co-assignee of that registro who did not send it himself; a teacher with no
-- registro; a person with only a demo-access row; anon.
-- Instruments: T1 published, delivered to S1; T2 published, delivered to S2
-- only; T3 a draft (with a leftover stored version, delivered nowhere).
-- Sub-questions (send-back 1): each instrument also has a child sub-question
-- under its root sub-question and a grandchild under that child (both with
-- indicator_id NULL, as the table's has_single_parent constraint requires);
-- T1 also has two parent-only rows that point at each other (a cycle that
-- reaches no indicator): read by admins only.
-- Writing and asking back (send-back 2): an admin inserts or updates a row of
-- each table and gets it back in the same statement (RETURNING), for a new
-- instrument T4 and for T1; the publication (service role) publishes T4; a
-- consultor and a teacher still cannot write.
-- Synthetic fixtures (schools -139001/-139002, grade -139011, uuids
-- 13900000-…); everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(121);

-- -----------------------------------------------------------------------------
-- Fixtures (postgres)
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('n1b_admin');
SELECT tests.create_supabase_user('n1b_cons1');
SELECT tests.create_supabase_user('n1b_cons2');
SELECT tests.create_supabase_user('n1b_cons_ended');
SELECT tests.create_supabase_user('n1b_dir1');
SELECT tests.create_supabase_user('n1b_dir2');
SELECT tests.create_supabase_user('n1b_teacher');
SELECT tests.create_supabase_user('n1b_coteacher');
SELECT tests.create_supabase_user('n1b_teacher_none');
SELECT tests.create_supabase_user('n1b_demo');

INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved', false
FROM (VALUES ('n1b_admin'), ('n1b_cons1'), ('n1b_cons2'), ('n1b_cons_ended'), ('n1b_dir1'), ('n1b_dir2'),
             ('n1b_teacher'), ('n1b_coteacher'), ('n1b_teacher_none'), ('n1b_demo')) AS x(ident);

INSERT INTO public.schools (id, name) VALUES
  (-139001, 'N1B Synthetic School 1'),
  (-139002, 'N1B Synthetic School 2');

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('n1b_admin'),        'admin',            NULL,    true),
  (tests.get_supabase_uid('n1b_cons1'),        'consultor',        NULL,    true),
  (tests.get_supabase_uid('n1b_cons2'),        'consultor',        NULL,    true),
  (tests.get_supabase_uid('n1b_cons_ended'),   'consultor',        NULL,    true),
  (tests.get_supabase_uid('n1b_dir1'),         'equipo_directivo', -139001, true),
  (tests.get_supabase_uid('n1b_dir2'),         'equipo_directivo', -139002, true),
  (tests.get_supabase_uid('n1b_teacher'),      'docente',          -139001, true),
  (tests.get_supabase_uid('n1b_coteacher'),    'docente',          -139001, true),
  (tests.get_supabase_uid('n1b_teacher_none'), 'docente',          -139001, true);
-- n1b_demo has no role at all: only a demo-access row (below).

INSERT INTO public.consultant_assignments (consultant_id, school_id, is_active, starts_at, ends_at, assignment_type) VALUES
  (tests.get_supabase_uid('n1b_cons1'),      -139001, true, now() - interval '30 days', NULL,                     'monitoring'),
  (tests.get_supabase_uid('n1b_cons2'),      -139002, true, now() - interval '30 days', NULL,                     'monitoring'),
  (tests.get_supabase_uid('n1b_cons_ended'), -139001, true, now() - interval '30 days', now() - interval '1 day', 'monitoring');

INSERT INTO public.ab_grades (id, name, sort_order) VALUES (-139011, 'N1B Grade', 139011);

INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id) VALUES
  ('13900000-0000-4000-8000-0000000000e1', 'personalizacion', '1.0', 'N1B T1 publicado, S1', 'published', -139011),
  ('13900000-0000-4000-8000-0000000000e2', 'aprendizaje',     '1.0', 'N1B T2 publicado, S2', 'published', -139011),
  ('13900000-0000-4000-8000-0000000000e3', 'evaluacion',      '1.0', 'N1B T3 borrador',      'draft',     -139011);

-- One proceso, práctica, indicador, expected level, context question and
-- sub-question per instrument (the last hex digit is the instrument).
INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
SELECT ('13900000-0000-4000-8000-0000000000a' || n)::uuid, ('13900000-0000-4000-8000-0000000000e' || n)::uuid, 'N1B Proceso ' || n, 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
SELECT ('13900000-0000-4000-8000-0000000000b' || n)::uuid, ('13900000-0000-4000-8000-0000000000e' || n)::uuid,
       ('13900000-0000-4000-8000-0000000000a' || n)::uuid, 'N1B Practica ' || n, 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_indicators (id, module_id, name, category, display_order)
SELECT ('13900000-0000-4000-8000-0000000000c' || n)::uuid, ('13900000-0000-4000-8000-0000000000b' || n)::uuid,
       'N1B Indicador ' || n, 'cobertura', 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, year_1_expected)
SELECT ('13900000-0000-4000-8000-0000000000d' || n)::uuid, ('13900000-0000-4000-8000-0000000000e' || n)::uuid,
       ('13900000-0000-4000-8000-0000000000c' || n)::uuid, 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_context_questions (id, template_id, question_text, question_type, display_order)
SELECT ('13900000-0000-4000-8000-0000000001d' || n)::uuid, ('13900000-0000-4000-8000-0000000000e' || n)::uuid,
       'N1B Pregunta de contexto ' || n, 'text', 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_sub_questions (id, indicator_id, question_text, question_type, trigger_condition, display_order)
SELECT ('13900000-0000-4000-8000-0000000002d' || n)::uuid, ('13900000-0000-4000-8000-0000000000c' || n)::uuid,
       'N1B Subpregunta ' || n, 'text', '{}', 1
FROM generate_series(1, 3) AS n;

-- Nested sub-questions: child (…3dN) under the root (…2dN), grandchild (…4dN)
-- under the child.
INSERT INTO public.assessment_sub_questions (id, parent_question_id, question_text, question_type, trigger_condition, display_order)
SELECT ('13900000-0000-4000-8000-0000000003d' || n)::uuid, ('13900000-0000-4000-8000-0000000002d' || n)::uuid,
       'N1B Subpregunta hija ' || n, 'text', '{}', 1
FROM generate_series(1, 3) AS n;
INSERT INTO public.assessment_sub_questions (id, parent_question_id, question_text, question_type, trigger_condition, display_order)
SELECT ('13900000-0000-4000-8000-0000000004d' || n)::uuid, ('13900000-0000-4000-8000-0000000003d' || n)::uuid,
       'N1B Subpregunta nieta ' || n, 'text', '{}', 1
FROM generate_series(1, 3) AS n;
-- A parent-only cycle: …5d1 and …6d1 point at each other (first hung under
-- T1's root so the parent key exists, then re-pointed).
INSERT INTO public.assessment_sub_questions (id, parent_question_id, question_text, question_type, trigger_condition, display_order) VALUES
  ('13900000-0000-4000-8000-0000000005d1', '13900000-0000-4000-8000-0000000002d1', 'N1B Ciclo A', 'text', '{}', 1);
INSERT INTO public.assessment_sub_questions (id, parent_question_id, question_text, question_type, trigger_condition, display_order) VALUES
  ('13900000-0000-4000-8000-0000000006d1', '13900000-0000-4000-8000-0000000005d1', 'N1B Ciclo B', 'text', '{}', 1);
UPDATE public.assessment_sub_questions SET parent_question_id = '13900000-0000-4000-8000-0000000006d1'
 WHERE id = '13900000-0000-4000-8000-0000000005d1';

-- Stored versions: T1 and T2 published; T3 keeps a leftover version that no
-- registro refers to.
INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
SELECT ('13900000-0000-4000-8000-0000000000f' || n)::uuid, ('13900000-0000-4000-8000-0000000000e' || n)::uuid,
       '1.0', '{"modules": []}'
FROM generate_series(1, 3) AS n;

-- Registro I1: T1 at S1, in_progress, assignees teacher (sends it) and
-- co-teacher. Registro I2: T2 at S2, no assignee from these personas.
INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, transformation_year, status, started_at) VALUES
  ('13900000-0000-4000-8000-000000000101', '13900000-0000-4000-8000-0000000000f1', -139001, 1, 'in_progress', now()),
  ('13900000-0000-4000-8000-000000000102', '13900000-0000-4000-8000-0000000000f2', -139002, 1, 'pending',     NULL);

INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit) VALUES
  ('13900000-0000-4000-8000-000000000201', '13900000-0000-4000-8000-000000000101', tests.get_supabase_uid('n1b_teacher'),   true, true),
  ('13900000-0000-4000-8000-000000000202', '13900000-0000-4000-8000-000000000101', tests.get_supabase_uid('n1b_coteacher'), true, false);

INSERT INTO public.assessment_demo_access (template_id, user_id, granted_by) VALUES
  ('13900000-0000-4000-8000-0000000000e1', tests.get_supabase_uid('n1b_demo'), tests.get_supabase_uid('n1b_admin'));

-- What the caller reads of instrument n, one count per table, in this order:
-- {templates, objectives, modules, indicators, context questions,
--  sub-questions, expected levels, stored versions}.
CREATE FUNCTION pg_temp.n1b_reads(n int) RETURNS int[] LANGUAGE sql AS $$
  SELECT ARRAY[
    (SELECT count(*)::int FROM public.assessment_templates         WHERE id = ('13900000-0000-4000-8000-0000000000e' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_objectives        WHERE id = ('13900000-0000-4000-8000-0000000000a' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_modules           WHERE id = ('13900000-0000-4000-8000-0000000000b' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_indicators        WHERE id = ('13900000-0000-4000-8000-0000000000c' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_context_questions WHERE id = ('13900000-0000-4000-8000-0000000001d' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_sub_questions     WHERE id = ('13900000-0000-4000-8000-0000000002d' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_year_expectations WHERE id = ('13900000-0000-4000-8000-0000000000d' || n)::uuid),
    (SELECT count(*)::int FROM public.assessment_template_snapshots WHERE id = ('13900000-0000-4000-8000-0000000000f' || n)::uuid)]
$$;

-- The nested sub-questions the caller reads, in this order:
-- {T1 child, T1 grandchild, T2 child, T2 grandchild, T3 child, T3 grandchild,
--  T1 cycle A, T1 cycle B}.
CREATE FUNCTION pg_temp.n1b_nested() RETURNS int[] LANGUAGE sql AS $$
  SELECT ARRAY[
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000003d1'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000004d1'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000003d2'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000004d2'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000003d3'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000004d3'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000005d1'),
    (SELECT count(*)::int FROM public.assessment_sub_questions WHERE id = '13900000-0000-4000-8000-0000000006d1')]
$$;

-- Send-back 2: runs ONE statement as the current caller and gives back the
-- first column of the row it returns (NULL when it returns no row), or
-- 'ERROR <sqlstate>' when the statement is refused. A refused statement is
-- undone on its own (sub-transaction); the file goes on.
CREATE FUNCTION pg_temp.n1b_try(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE q INTO v;
  RETURN v;
EXCEPTION WHEN OTHERS THEN
  RETURN 'ERROR ' || SQLSTATE;
END
$$;

-- -----------------------------------------------------------------------------
-- Real reads, per persona and instrument
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n1b_admin');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,1,1], 'admin: reads all of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[1,1,1,1,1,1,1,1], 'admin: reads all of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[1,1,1,1,1,1,1,1], 'admin: reads all of the draft T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_cons1');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,1,1], 'consultor assigned to S1: reads all of T1 (delivered to S1)');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'consultor assigned to S1: reads nothing of T2 (delivered only to S2)');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'consultor assigned to S1: reads nothing of the draft T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_cons2');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'consultor assigned to S2 only: reads nothing of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[1,1,1,1,1,1,1,1], 'consultor assigned to S2 only: reads all of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'consultor assigned to S2 only: reads nothing of the draft T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_cons_ended');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'consultor whose assignment to S1 ended: reads nothing of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'consultor whose assignment to S1 ended: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'consultor whose assignment to S1 ended: reads nothing of T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_dir1');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,1,1], 'directivo of S1: reads all of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'directivo of S1: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'directivo of S1: reads nothing of the draft T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_dir2');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'directivo of S2: reads nothing of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[1,1,1,1,1,1,1,1], 'directivo of S2: reads all of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'directivo of S2: reads nothing of the draft T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_teacher');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,0,0],
  'teacher with an unsent registro of T1: reads its structure, NOT its expected levels, NOT its stored version');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'teacher with an unsent registro of T1: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'teacher with an unsent registro of T1: reads nothing of T3');
-- The registro itself stays readable to its teacher (rule unchanged).
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '13900000-0000-4000-8000-000000000101'),
  'in_progress', 'teacher with an unsent registro: still reads the registro itself');
RESET ROLE;

SELECT tests.authenticate_as('n1b_coteacher');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,0,0],
  'co-assignee of the unsent registro of T1: reads its structure, not its levels nor its stored version');
RESET ROLE;

SELECT tests.authenticate_as('n1b_teacher_none');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'teacher with no registro: reads nothing of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'teacher with no registro: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'teacher with no registro: reads nothing of T3');
RESET ROLE;

SELECT tests.authenticate_as('n1b_demo');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'person with only a demo-access row for T1: reads nothing of T1 directly (the demo goes through its route)');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'person with only a demo-access row: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'person with only a demo-access row: reads nothing of T3');
RESET ROLE;

SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'anon: reads nothing of T1');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'anon: reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'anon: reads nothing of T3');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- Nested sub-questions (send-back 1): read by the same people as their
-- instrument, through the parent chain up to the root's indicator; a chain
-- that reaches no indicator (the cycle) is read by admins only.
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n1b_admin');
SELECT is(pg_temp.n1b_nested(), ARRAY[1,1,1,1,1,1,1,1], 'nested sub-questions, admin: all, the cycle included');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons1');
SELECT is(pg_temp.n1b_nested(), ARRAY[1,1,0,0,0,0,0,0], 'nested sub-questions, consultor of S1: T1''s child and grandchild only');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons2');
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,1,1,0,0,0,0], 'nested sub-questions, consultor of S2: T2''s only, none of T1');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons_ended');
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,0,0,0,0,0,0], 'nested sub-questions, consultor whose assignment ended: none');
RESET ROLE;
SELECT tests.authenticate_as('n1b_dir1');
SELECT is(pg_temp.n1b_nested(), ARRAY[1,1,0,0,0,0,0,0], 'nested sub-questions, directivo of S1: T1''s child and grandchild only');
RESET ROLE;
SELECT tests.authenticate_as('n1b_dir2');
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,1,1,0,0,0,0], 'nested sub-questions, directivo of S2: T2''s only, none of T1');
RESET ROLE;
SELECT tests.authenticate_as('n1b_teacher');
SELECT is(pg_temp.n1b_nested(), ARRAY[1,1,0,0,0,0,0,0], 'nested sub-questions, teacher with an unsent registro of T1: T1''s child and grandchild');
RESET ROLE;
SELECT tests.authenticate_as('n1b_coteacher');
SELECT is(pg_temp.n1b_nested(), ARRAY[1,1,0,0,0,0,0,0], 'nested sub-questions, co-assignee of the unsent registro: T1''s child and grandchild');
RESET ROLE;
SELECT tests.authenticate_as('n1b_teacher_none');
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,0,0,0,0,0,0], 'nested sub-questions, teacher with no registro: none');
RESET ROLE;
SELECT tests.authenticate_as('n1b_demo');
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,0,0,0,0,0,0], 'nested sub-questions, person with only a demo-access row: none');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT is(pg_temp.n1b_nested(), ARRAY[0,0,0,0,0,0,0,0], 'nested sub-questions, anon: none');
RESET ROLE;
-- A whole-table read as the teacher: T1's three sub-questions, nothing else.
SELECT tests.authenticate_as('n1b_teacher');
SELECT is(
  (SELECT array_agg(id::text ORDER BY id) FROM public.assessment_sub_questions WHERE id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000002d1', '13900000-0000-4000-8000-0000000003d1', '13900000-0000-4000-8000-0000000004d1'],
  'teacher with an unsent registro of T1: the whole table gives T1''s root, child and grandchild only');
RESET ROLE;
-- The table's own rule: a row has an indicator or a parent, never neither.
SELECT throws_ok(
  $q$INSERT INTO public.assessment_sub_questions (id, question_text, question_type, trigger_condition, display_order)
     VALUES ('13900000-0000-4000-8000-0000000007d1', 'N1B Sin padre', 'text', '{}', 1)$q$,
  '23514', NULL, 'a sub-question with no indicator and no parent cannot exist (has_single_parent)');

-- The teacher sends the registro (the route's own update, with the teacher's
-- session: in_progress -> completed, the same thing submit.ts does before it
-- calls scoring).
SELECT tests.authenticate_as('n1b_teacher');
WITH u AS (UPDATE public.assessment_instances SET status = 'completed', completed_at = now()
           WHERE id = '13900000-0000-4000-8000-000000000101' RETURNING 1)
SELECT is((SELECT count(*)::int FROM u), 1, 'teacher: sending the registro of T1 changes 1 row');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,1,1],
  'teacher after sending: reads T1''s structure, its expected levels and its stored version');
SELECT is(pg_temp.n1b_reads(2), ARRAY[0,0,0,0,0,0,0,0], 'teacher after sending: still reads nothing of T2');
SELECT is(pg_temp.n1b_reads(3), ARRAY[0,0,0,0,0,0,0,0], 'teacher after sending: still reads nothing of T3');
-- What scoring reads with the teacher's own client right after sending
-- (scoringService fetchInstanceDataForScoring): the instance with its stored
-- version (inner join) and the instrument's expected levels.
SELECT is(
  (SELECT count(*)::int FROM public.assessment_instances i
     JOIN public.assessment_template_snapshots s ON s.id = i.template_snapshot_id
    WHERE i.id = '13900000-0000-4000-8000-000000000101'),
  1, 'teacher after sending: the instance with its stored version reads as one row (scoring''s inner join)');
SELECT is((SELECT count(*)::int FROM public.assessment_year_expectations
            WHERE template_id = '13900000-0000-4000-8000-0000000000e1'),
  1, 'teacher after sending: reads the expected levels of T1 (scoring''s read)');
RESET ROLE;

-- The co-assignee did not send it himself (his own has_submitted is false),
-- but the registro is sent for all of its assignees.
SELECT is((SELECT has_submitted FROM public.assessment_instance_assignees WHERE id = '13900000-0000-4000-8000-000000000202'),
  false, 'as postgres: the co-assignee''s own has_submitted flag is still false');
SELECT tests.authenticate_as('n1b_coteacher');
SELECT is(pg_temp.n1b_reads(1), ARRAY[1,1,1,1,1,1,1,1],
  'co-assignee after the registro was sent by the other teacher: reads T1''s levels and stored version too');
RESET ROLE;

-- Nothing else changed for the others after the send.
SELECT tests.authenticate_as('n1b_teacher_none');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'teacher with no registro, after the send: still reads nothing of T1');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons2');
SELECT is(pg_temp.n1b_reads(1), ARRAY[0,0,0,0,0,0,0,0], 'consultor of S2, after the send: still reads nothing of T1');
RESET ROLE;

-- A whole-table read gives only the readable instruments (no error, no extra
-- rows): the builder's list as consultor of S1, as admin.
SELECT tests.authenticate_as('n1b_cons1');
SELECT is(
  (SELECT array_agg(id::text ORDER BY id) FROM public.assessment_templates WHERE id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000000e1'],
  'consultor of S1: the list of instruments holds T1 only');
RESET ROLE;
SELECT tests.authenticate_as('n1b_admin');
SELECT is(
  (SELECT count(*)::int FROM public.assessment_templates WHERE id::text LIKE '13900000-%'),
  3, 'admin: the list of instruments holds T1, T2 and T3');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- The two helpers
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'auth_readable_template_ids', ARRAY[]::name[], 'auth_readable_template_ids() exists');
SELECT has_function('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'auth_readable_template_level_ids() exists');
SELECT is_definer('public', 'auth_readable_template_ids', ARRAY[]::name[], 'auth_readable_template_ids() is SECURITY DEFINER');
SELECT is_definer('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'auth_readable_template_level_ids() is SECURITY DEFINER');
SELECT volatility_is('public', 'auth_readable_template_ids', ARRAY[]::name[], 'stable', 'auth_readable_template_ids() is STABLE');
SELECT volatility_is('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'stable', 'auth_readable_template_level_ids() is STABLE');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_template_ids'
             AND cfg = 'search_path=public, pg_temp'),
  'auth_readable_template_ids() pins search_path = public, pg_temp');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_template_level_ids'
             AND cfg = 'search_path=public, pg_temp'),
  'auth_readable_template_level_ids() pins search_path = public, pg_temp');
SELECT function_privs_are('public', 'auth_readable_template_ids', ARRAY[]::name[], 'anon', ARRAY[]::name[],
  'anon cannot execute auth_readable_template_ids()');
SELECT function_privs_are('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'anon', ARRAY[]::name[],
  'anon cannot execute auth_readable_template_level_ids()');
SELECT function_privs_are('public', 'auth_readable_template_ids', ARRAY[]::name[], 'authenticated', ARRAY['EXECUTE']::name[],
  'authenticated can execute auth_readable_template_ids()');
SELECT function_privs_are('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'authenticated', ARRAY['EXECUTE']::name[],
  'authenticated can execute auth_readable_template_level_ids()');
SELECT function_privs_are('public', 'auth_readable_template_ids', ARRAY[]::name[], 'service_role', ARRAY['EXECUTE']::name[],
  'service_role can execute auth_readable_template_ids()');
SELECT function_privs_are('public', 'auth_readable_template_level_ids', ARRAY[]::name[], 'service_role', ARRAY['EXECUTE']::name[],
  'service_role can execute auth_readable_template_level_ids()');
SELECT ok(
  (SELECT obj_description(p.oid, 'pg_proc') IS NOT NULL FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_template_ids'),
  'auth_readable_template_ids() has a COMMENT');
SELECT ok(
  (SELECT obj_description(p.oid, 'pg_proc') IS NOT NULL FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_template_level_ids'),
  'auth_readable_template_level_ids() has a COMMENT');
SELECT has_function('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'auth_readable_nested_sub_question_ids() exists');
SELECT is_definer('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'auth_readable_nested_sub_question_ids() is SECURITY DEFINER');
SELECT volatility_is('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'stable', 'auth_readable_nested_sub_question_ids() is STABLE');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
           WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_nested_sub_question_ids'
             AND cfg = 'search_path=public, pg_temp'),
  'auth_readable_nested_sub_question_ids() pins search_path = public, pg_temp');
SELECT function_privs_are('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'anon', ARRAY[]::name[],
  'anon cannot execute auth_readable_nested_sub_question_ids()');
SELECT function_privs_are('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'authenticated', ARRAY['EXECUTE']::name[],
  'authenticated can execute auth_readable_nested_sub_question_ids()');
SELECT function_privs_are('public', 'auth_readable_nested_sub_question_ids', ARRAY[]::name[], 'service_role', ARRAY['EXECUTE']::name[],
  'service_role can execute auth_readable_nested_sub_question_ids()');
SELECT ok(
  (SELECT obj_description(p.oid, 'pg_proc') IS NOT NULL FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = 'auth_readable_nested_sub_question_ids'),
  'auth_readable_nested_sub_question_ids() has a COMMENT');
SELECT ok(
  (SELECT qual LIKE '%id IN ( SELECT auth_readable_nested_sub_question_ids()%' FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'assessment_sub_questions' AND policyname = 'assessment_sub_questions_select'),
  'the sub-questions read rule also admits nested rows through auth_readable_nested_sub_question_ids()');

-- -----------------------------------------------------------------------------
-- The eight read rules keep their names and commands, apply to authenticated
-- only, and ask the helper (structure or levels) in an uncorrelated sub-select
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT array_agg(tablename || '.' || policyname || ':' || cmd || ':' || array_to_string(roles, ',') || ':' ||
                    CASE WHEN qual LIKE '%auth_readable_template_level_ids()%' THEN 'levels'
                         WHEN qual LIKE '%auth_readable_template_ids()%' THEN 'structure'
                         ELSE 'other' END
                    ORDER BY tablename)
     FROM pg_policies
    WHERE schemaname = 'public'
      AND (tablename, policyname) IN (
        ('assessment_templates', 'assessment_templates_select_admin_consultor'),
        ('assessment_objectives', 'assessment_objectives_select_authenticated'),
        ('assessment_modules', 'assessment_modules_select'),
        ('assessment_indicators', 'assessment_indicators_select'),
        ('assessment_context_questions', 'assessment_context_questions_select'),
        ('assessment_sub_questions', 'assessment_sub_questions_select'),
        ('assessment_year_expectations', 'assessment_year_expectations_select'),
        ('assessment_template_snapshots', 'assessment_template_snapshots_select'))),
  ARRAY['assessment_context_questions.assessment_context_questions_select:SELECT:authenticated:structure',
        'assessment_indicators.assessment_indicators_select:SELECT:authenticated:structure',
        'assessment_modules.assessment_modules_select:SELECT:authenticated:structure',
        'assessment_objectives.assessment_objectives_select_authenticated:SELECT:authenticated:structure',
        'assessment_sub_questions.assessment_sub_questions_select:SELECT:authenticated:structure',
        'assessment_template_snapshots.assessment_template_snapshots_select:SELECT:authenticated:levels',
        'assessment_templates.assessment_templates_select_admin_consultor:SELECT:authenticated:structure',
        'assessment_year_expectations.assessment_year_expectations_select:SELECT:authenticated:levels'],
  'the eight select rules keep their names, are for authenticated only, and use the structure or the levels helper');
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('assessment_templates', 'assessment_objectives', 'assessment_modules', 'assessment_indicators',
                        'assessment_context_questions', 'assessment_sub_questions', 'assessment_year_expectations',
                        'assessment_template_snapshots')),
  32, 'the eight tables still hold their 32 rules (no rule created or removed)');

-- -----------------------------------------------------------------------------
-- The helpers answer about the caller only, nothing without a sign-in
-- -----------------------------------------------------------------------------
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.auth_readable_template_ids()), 0,
  'auth_readable_template_ids(): no sign-in, no instrument');
SELECT is((SELECT count(*)::int FROM public.auth_readable_template_level_ids()), 0,
  'auth_readable_template_level_ids(): no sign-in, no instrument');
SELECT tests.authenticate_as('n1b_teacher_none');
SELECT is((SELECT count(*)::int FROM public.auth_readable_template_ids() AS t(id) WHERE t.id::text LIKE '13900000-%'), 0,
  'auth_readable_template_ids() as a teacher with no registro: none of the fixture instruments');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons1');
SELECT is((SELECT array_agg(t.id::text) FROM public.auth_readable_template_ids() AS t(id) WHERE t.id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000000e1'], 'auth_readable_template_ids() as consultor of S1: T1 only');
SELECT is((SELECT array_agg(t.id::text) FROM public.auth_readable_template_level_ids() AS t(id) WHERE t.id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000000e1'], 'auth_readable_template_level_ids() as consultor of S1: T1 only');
RESET ROLE;
SELECT tests.authenticate_as('n1b_admin');
SELECT is((SELECT count(*)::int FROM public.auth_readable_template_ids()), (SELECT count(*)::int FROM public.assessment_templates),
  'auth_readable_template_ids() as admin: every instrument');
SELECT is((SELECT count(*)::int FROM public.auth_readable_template_level_ids()), (SELECT count(*)::int FROM public.assessment_templates),
  'auth_readable_template_level_ids() as admin: every instrument');
RESET ROLE;
-- A direct call of the sub-question helper answers only about the caller:
-- the nested sub-questions they may read, nothing else.
SELECT tests.clear_authentication();
SELECT is((SELECT count(*)::int FROM public.auth_readable_nested_sub_question_ids()), 0,
  'auth_readable_nested_sub_question_ids(): no sign-in, nothing');
SELECT tests.authenticate_as('n1b_teacher_none');
SELECT is((SELECT count(*)::int FROM public.auth_readable_nested_sub_question_ids() AS q(id) WHERE q.id::text LIKE '13900000-%'), 0,
  'auth_readable_nested_sub_question_ids() as a teacher with no registro: none of the fixtures');
RESET ROLE;
SELECT tests.authenticate_as('n1b_cons1');
SELECT is((SELECT array_agg(q.id::text ORDER BY q.id) FROM public.auth_readable_nested_sub_question_ids() AS q(id) WHERE q.id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000003d1', '13900000-0000-4000-8000-0000000004d1'],
  'auth_readable_nested_sub_question_ids() as consultor of S1: T1''s child and grandchild only (no draft, no other school, no cycle)');
RESET ROLE;
SELECT tests.authenticate_as('n1b_admin');
SELECT is((SELECT array_agg(q.id::text ORDER BY q.id) FROM public.auth_readable_nested_sub_question_ids() AS q(id) WHERE q.id::text LIKE '13900000-%'),
  ARRAY['13900000-0000-4000-8000-0000000003d1', '13900000-0000-4000-8000-0000000003d2', '13900000-0000-4000-8000-0000000003d3',
        '13900000-0000-4000-8000-0000000004d1', '13900000-0000-4000-8000-0000000004d2', '13900000-0000-4000-8000-0000000004d3'],
  'auth_readable_nested_sub_question_ids() as admin: every nested row that reaches an indicator (the cycle reaches none; admins read it through the writing rule)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT set_config('role', 'anon', true);
SELECT throws_ok('SELECT count(*) FROM public.auth_readable_template_ids()', '42501', NULL,
  'anon: calling auth_readable_template_ids() is refused (42501)');
SELECT throws_ok('SELECT count(*) FROM public.auth_readable_nested_sub_question_ids()', '42501', NULL,
  'anon: calling auth_readable_nested_sub_question_ids() is refused (42501)');
RESET ROLE;

-- -----------------------------------------------------------------------------
-- Send-back 2: an admin writes a row and asks for it back IN THE SAME
-- STATEMENT (INSERT/UPDATE … RETURNING, what PostgREST does for
-- .insert(…).select() and .update(…).select()). The database applies the read
-- rule to the returned row; the STABLE helper sees the table as it was when
-- the statement began, so without an admin branch in the rule itself the
-- admin's own new instrument is refused (42501) — «Crear template» and
-- «Duplicar» answered 500. T4 is a new instrument made here.
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('n1b_admin');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id)
  VALUES ('13900000-0000-4000-8000-0000000000e4', 'evaluacion', '2.0', 'N1B T4 nuevo', 'draft', -139011)
  RETURNING name$q$),
  'N1B T4 nuevo', 'admin: a new instrument, inserted and returned in one statement (the builder''s create and duplicate routes)');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000a4', '13900000-0000-4000-8000-0000000000e4', 'N1B Proceso 4', 1)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e4', 'admin: a proceso of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000b4', '13900000-0000-4000-8000-0000000000e4',
          '13900000-0000-4000-8000-0000000000a4', 'N1B Practica 4', 1)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e4', 'admin: a práctica of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_indicators (id, module_id, name, category, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000c4', '13900000-0000-4000-8000-0000000000b4', 'N1B Indicador 4', 'cobertura', 1)
  RETURNING module_id::text$q$),
  '13900000-0000-4000-8000-0000000000b4', 'admin: an indicador of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_context_questions (id, template_id, question_text, question_type, display_order)
  VALUES ('13900000-0000-4000-8000-0000000001d4', '13900000-0000-4000-8000-0000000000e4', 'N1B Pregunta de contexto 4', 'text', 1)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e4', 'admin: a context question of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_sub_questions (id, indicator_id, question_text, question_type, trigger_condition, display_order)
  VALUES ('13900000-0000-4000-8000-0000000002d4', '13900000-0000-4000-8000-0000000000c4', 'N1B Subpregunta 4', 'text', '{}', 1)
  RETURNING indicator_id::text$q$),
  '13900000-0000-4000-8000-0000000000c4', 'admin: a sub-question of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_year_expectations (id, template_id, indicator_id, year_1_expected)
  VALUES ('13900000-0000-4000-8000-0000000000d4', '13900000-0000-4000-8000-0000000000e4', '13900000-0000-4000-8000-0000000000c4', 1)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e4', 'admin: an expected level of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000a5', '13900000-0000-4000-8000-0000000000e1', 'N1B Proceso 1b', 2)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e1', 'admin: a proceso of the existing T1, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_modules (id, template_id, objective_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000b5', '13900000-0000-4000-8000-0000000000e1',
          '13900000-0000-4000-8000-0000000000a5', 'N1B Practica 1b', 2)
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e1', 'admin: a práctica of the existing T1, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_indicators (id, module_id, name, category, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000c5', '13900000-0000-4000-8000-0000000000b1', 'N1B Indicador 1b', 'cobertura', 2)
  RETURNING module_id::text$q$),
  '13900000-0000-4000-8000-0000000000b1', 'admin: an indicador of the existing T1, inserted and returned');
-- A stored version written by an admin directly (the table's insert rule is
-- admin-only). The publication itself does not write this way: see below.
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
  VALUES ('13900000-0000-4000-8000-0000000000f4', '13900000-0000-4000-8000-0000000000e4', '2.0', '{"modules": []}')
  RETURNING template_id::text$q$),
  '13900000-0000-4000-8000-0000000000e4', 'admin: a stored version of the NEW instrument T4, inserted and returned');
SELECT is(pg_temp.n1b_try($q$
  UPDATE public.assessment_templates SET description = 'N1B T3 cambiado'
   WHERE id = '13900000-0000-4000-8000-0000000000e3' RETURNING description$q$),
  'N1B T3 cambiado', 'admin: the draft T3, updated and returned in one statement');
SELECT is(pg_temp.n1b_try($q$
  UPDATE public.assessment_templates SET description = 'N1B T4 cambiado'
   WHERE id = '13900000-0000-4000-8000-0000000000e4' RETURNING description$q$),
  'N1B T4 cambiado', 'admin: the NEW instrument T4, updated and returned in one statement');
SELECT is(pg_temp.n1b_try($q$
  UPDATE public.assessment_modules SET name = 'N1B Practica 4 cambiada'
   WHERE id = '13900000-0000-4000-8000-0000000000b4' RETURNING name$q$),
  'N1B Practica 4 cambiada', 'admin: a práctica of T4, updated and returned in one statement');
RESET ROLE;

-- The publication writes the stored version through
-- public.publish_assessment_template (SECURITY DEFINER, EXECUTE for
-- service_role only), called by the publish route with the service client
-- after its admin check: the read rules do not apply to it. What is real:
-- the service role publishes the admin's new T4.
SELECT tests.clear_authentication();
SELECT set_config('role', 'service_role', true);
SELECT is(
  (SELECT (r->>'ok') || '/' || (r->'template'->>'status')
     FROM public.publish_assessment_template('13900000-0000-4000-8000-0000000000e4', '2.0', '{"modules": []}'::jsonb) AS r),
  'true/published', 'service role: the publication of the new T4 writes its stored version and publishes it');
RESET ROLE;

-- People who may not write still cannot: an insert is refused, an update
-- changes and returns nothing.
SELECT tests.authenticate_as('n1b_cons1');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id)
  VALUES ('13900000-0000-4000-8000-0000000000e6', 'evaluacion', '3.0', 'N1B consultor', 'draft', -139011)
  RETURNING name$q$),
  'ERROR 42501', 'consultor of S1: inserting an instrument and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000a6', '13900000-0000-4000-8000-0000000000e1', 'N1B consultor', 3)
  RETURNING template_id::text$q$),
  'ERROR 42501', 'consultor of S1: inserting a proceso of T1 (which they read) and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
  VALUES ('13900000-0000-4000-8000-0000000000f6', '13900000-0000-4000-8000-0000000000e1', '3.0', '{"modules": []}')
  RETURNING template_id::text$q$),
  'ERROR 42501', 'consultor of S1: inserting a stored version of T1 and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  UPDATE public.assessment_templates SET description = 'N1B consultor'
   WHERE id = '13900000-0000-4000-8000-0000000000e1' RETURNING description$q$),
  NULL, 'consultor of S1: updating T1 and asking it back changes and returns nothing');
RESET ROLE;

SELECT tests.authenticate_as('n1b_teacher');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_templates (id, area, version, name, status, grade_id)
  VALUES ('13900000-0000-4000-8000-0000000000e7', 'evaluacion', '4.0', 'N1B docente', 'draft', -139011)
  RETURNING name$q$),
  'ERROR 42501', 'teacher: inserting an instrument and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_objectives (id, template_id, name, display_order)
  VALUES ('13900000-0000-4000-8000-0000000000a7', '13900000-0000-4000-8000-0000000000e1', 'N1B docente', 4)
  RETURNING template_id::text$q$),
  'ERROR 42501', 'teacher: inserting a proceso of T1 (which they read) and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data)
  VALUES ('13900000-0000-4000-8000-0000000000f7', '13900000-0000-4000-8000-0000000000e1', '4.0', '{"modules": []}')
  RETURNING template_id::text$q$),
  'ERROR 42501', 'teacher: inserting a stored version of T1 and asking it back is refused');
SELECT is(pg_temp.n1b_try($q$
  UPDATE public.assessment_templates SET description = 'N1B docente'
   WHERE id = '13900000-0000-4000-8000-0000000000e1' RETURNING description$q$),
  NULL, 'teacher: updating T1 and asking it back changes and returns nothing');
RESET ROLE;

-- Each of the eight read rules admits an admin directly, in the rule itself.
SELECT is(
  (SELECT count(*)::int FROM pg_policies
    WHERE schemaname = 'public'
      AND qual LIKE '%SELECT auth_is_assessment_admin()%'
      AND (tablename, policyname) IN (
        ('assessment_templates', 'assessment_templates_select_admin_consultor'),
        ('assessment_objectives', 'assessment_objectives_select_authenticated'),
        ('assessment_modules', 'assessment_modules_select'),
        ('assessment_indicators', 'assessment_indicators_select'),
        ('assessment_context_questions', 'assessment_context_questions_select'),
        ('assessment_sub_questions', 'assessment_sub_questions_select'),
        ('assessment_year_expectations', 'assessment_year_expectations_select'),
        ('assessment_template_snapshots', 'assessment_template_snapshots_select'))),
  8, 'the eight read rules admit an admin in the rule itself, not only through the helper''s set');

SELECT * FROM finish();
ROLLBACK;
