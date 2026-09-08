-- =============================================================================
-- 075-attach-course-assessment.sql — Procesos de Cambio review remediation,
-- Codex round 3 finding 1
--
-- Proves public.attach_course_docente_assessment
-- (20260908130000_attach_course_assessment, replaced by
-- 20260908140000_attach_course_assessment_template_lock) against the real tables:
--   [T-0] the function exists, is SECURITY INVOKER, anon and authenticated
--         hold no privilege, service_role may EXECUTE;
--   [T-1] every refusal writes nothing: null arguments, year outside 1..5,
--         unknown generation type, unknown course, a docente with no ACTIVE
--         assignment (inactive row, never assigned, deactivated by a
--         cleanup), a course with two active assignments, an unknown
--         snapshot, an archived template, an unpublished template, a
--         non-current snapshot;
--   [T-2] attach to the live instance: the grant is inserted with fresh
--         flags, the unrelated co-assignee and the approved docente's rows
--         are field-identical, a repeat is `already_exists` and writes
--         nothing, an ARCHIVED instance is never reattached (a new live one
--         is created when the template is eligible);
--   [T-3] create: a pending instance with the given year / generation type /
--         school and the docente's grant, in one call; the unique live-instance
--         index is honoured on a repeat (already_exists, no second instance);
--   [T-4] the finding-1 sequence in one session: after the docente's
--         assignment is deactivated and the grant revoked (what Operation A
--         Step 2 does), the same attach call is refused and no grant returns;
--   [T-5] (round 4, R5-1; migration 20260908140000) the template row is
--         locked FOR SHARE before the instance lookup and the current-snapshot
--         check is the last read before the write; a committed archive is
--         refused; after Step 2e's archive + revoke and a restore, the attach
--         creates a fresh instance and never reattaches the archived one.
--
-- Fixtures are synthetic and the whole file rolls back.
-- =============================================================================

BEGIN;

SELECT plan(57);

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user('at_d1');     -- approved docente (active on A1, A3, A4)
SELECT tests.create_supabase_user('at_d2');     -- obsolete docente (active on A1 — invariant violated there)
SELECT tests.create_supabase_user('at_d3');     -- inactive assignment on A2
SELECT tests.create_supabase_user('at_x');      -- unrelated co-assignee (no assignment row anywhere)
SELECT tests.create_supabase_user('at_none');   -- never assigned
SELECT tests.create_supabase_user('at_dir');    -- assigned_by
SELECT tests.create_supabase_user('at_auth');   -- plain authenticated caller

CREATE FUNCTION pg_temp.uid(ident text) RETURNS uuid
  SECURITY DEFINER SET search_path = tests, pg_temp
  AS $$ SELECT tests.get_supabase_uid($1) $$ LANGUAGE sql;

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT tests.get_supabase_uid(x.ident), x.ident || '@test.local', x.ident, 'approved'
FROM (VALUES ('at_d1'), ('at_d2'), ('at_d3'), ('at_x'), ('at_none'), ('at_dir'), ('at_auth')) AS x(ident)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9985, 'Attach Course School') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('at_d1'),   'docente',          9985, true),
  (tests.get_supabase_uid('at_d2'),   'docente',          9985, true),
  (tests.get_supabase_uid('at_d3'),   'docente',          9985, true),
  (tests.get_supabase_uid('at_x'),    'docente',          9985, true),
  (tests.get_supabase_uid('at_none'), 'docente',          9985, true),
  (tests.get_supabase_uid('at_dir'),  'equipo_directivo', 9985, true),
  (tests.get_supabase_uid('at_auth'), 'docente',          9985, true);

INSERT INTO public.school_transversal_context
  (id, school_id, total_students, grade_levels, courses_per_level, implementation_year_2026, period_system)
VALUES ('75000000-0000-4000-8000-00000000c0a1', 9985, 100, ARRAY['1_basico'], '{"1_basico": 4}', 1, 'semestral');

-- A1: two active assignments (d1, d2) — invariant violated, live instance 1a01 with d1, d2, x grants
-- A2: d3 inactive only
-- A3: d1 active; live instance 3a01 (snapshot f2) with x only; archived instance 3a02 (snapshot f2) with d1
-- A4: d1 active; no instance yet (create path)
INSERT INTO public.school_course_structure (id, school_id, context_id, grade_level, course_name) VALUES
  ('75000000-0000-4000-8000-0000000000a1', 9985, '75000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO A'),
  ('75000000-0000-4000-8000-0000000000a2', 9985, '75000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO B'),
  ('75000000-0000-4000-8000-0000000000a3', 9985, '75000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO C'),
  ('75000000-0000-4000-8000-0000000000a4', 9985, '75000000-0000-4000-8000-00000000c0a1', '1_basico', '1 BASICO D');

INSERT INTO public.school_course_docente_assignments (id, course_structure_id, docente_id, is_active) VALUES
  ('75000000-0000-4000-8000-0000000000d1', '75000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('at_d1'), true),
  ('75000000-0000-4000-8000-0000000000d2', '75000000-0000-4000-8000-0000000000a1', tests.get_supabase_uid('at_d2'), true),
  ('75000000-0000-4000-8000-0000000000d3', '75000000-0000-4000-8000-0000000000a2', tests.get_supabase_uid('at_d3'), false),
  ('75000000-0000-4000-8000-0000000000d4', '75000000-0000-4000-8000-0000000000a3', tests.get_supabase_uid('at_d1'), true),
  ('75000000-0000-4000-8000-0000000000d5', '75000000-0000-4000-8000-0000000000a4', tests.get_supabase_uid('at_d1'), true);

-- e1: published, current snapshot f2 (newer) and stale snapshot f1
-- e2: archived (status kept published), snapshot f3
-- e3: draft, snapshot f4
INSERT INTO public.assessment_templates (id, area, version, name, status, is_archived) VALUES
  ('75000000-0000-4000-8000-0000000000e1', 'lenguaje',    '1.0', 'Attach Template',          'published', false),
  ('75000000-0000-4000-8000-0000000000e2', 'matematica',  '1.0', 'Attach Archived Template', 'published', true),
  ('75000000-0000-4000-8000-0000000000e3', 'convivencia', '1.0', 'Attach Draft Template',    'draft',     false);

INSERT INTO public.assessment_template_snapshots (id, template_id, version, snapshot_data, created_at) VALUES
  ('75000000-0000-4000-8000-0000000000f1', '75000000-0000-4000-8000-0000000000e1', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z'),
  ('75000000-0000-4000-8000-0000000000f2', '75000000-0000-4000-8000-0000000000e1', '1.1', '{"modules": []}', '2026-02-01T00:00:00Z'),
  ('75000000-0000-4000-8000-0000000000f3', '75000000-0000-4000-8000-0000000000e2', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z'),
  ('75000000-0000-4000-8000-0000000000f4', '75000000-0000-4000-8000-0000000000e3', '1.0', '{"modules": []}', '2026-01-01T00:00:00Z');

INSERT INTO public.assessment_instances (id, template_snapshot_id, school_id, course_structure_id, transformation_year, status, generation_type) VALUES
  ('75000000-0000-4000-8000-000000001a01', '75000000-0000-4000-8000-0000000000f2', 9985, '75000000-0000-4000-8000-0000000000a1', 1, 'pending',  'GT'),
  ('75000000-0000-4000-8000-000000003a01', '75000000-0000-4000-8000-0000000000f2', 9985, '75000000-0000-4000-8000-0000000000a3', 1, 'pending',  'GT'),
  ('75000000-0000-4000-8000-000000003a02', '75000000-0000-4000-8000-0000000000f2', 9985, '75000000-0000-4000-8000-0000000000a3', 1, 'archived', 'GT');

INSERT INTO public.assessment_instance_assignees (id, instance_id, user_id, can_edit, can_submit, has_started) VALUES
  ('75000000-0000-4000-8000-000000000201', '75000000-0000-4000-8000-000000001a01', tests.get_supabase_uid('at_d1'), true,  true, false),
  ('75000000-0000-4000-8000-000000000202', '75000000-0000-4000-8000-000000001a01', tests.get_supabase_uid('at_d2'), true,  true, false),
  ('75000000-0000-4000-8000-000000000203', '75000000-0000-4000-8000-000000001a01', tests.get_supabase_uid('at_x'),  false, true, false),
  ('75000000-0000-4000-8000-000000000204', '75000000-0000-4000-8000-000000003a01', tests.get_supabase_uid('at_x'),  false, true, false),
  ('75000000-0000-4000-8000-000000000205', '75000000-0000-4000-8000-000000003a02', tests.get_supabase_uid('at_d1'), true,  true, true);

-- Whole-fixture state fingerprint (assignments, grants, instances).
CREATE FUNCTION pg_temp.state() RETURNS text
  SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
    SELECT coalesce((SELECT string_agg(id::text || ':' || docente_id::text || ':' || is_active::text, ',' ORDER BY id)
                       FROM public.school_course_docente_assignments WHERE course_structure_id::text LIKE '75000000%'), '')
        || '|' ||
           coalesce((SELECT string_agg(x.instance_id::text || ':' || x.user_id::text || ':' || x.can_edit::text || ':' ||
                                       x.can_submit::text || ':' || x.has_started::text || ':' || x.has_submitted::text,
                                       ',' ORDER BY x.instance_id, x.user_id)
                       FROM public.assessment_instance_assignees x
                       JOIN public.assessment_instances i ON i.id = x.instance_id WHERE i.school_id = 9985), '')
        || '|' ||
           coalesce((SELECT string_agg(id::text || ':' || status || ':' || template_snapshot_id::text, ',' ORDER BY id)
                       FROM public.assessment_instances WHERE school_id = 9985), '')
  $$ LANGUAGE sql;

CREATE FUNCTION pg_temp.attach(course uuid, docente uuid, snap uuid, yr integer DEFAULT 1, gen text DEFAULT 'GT')
  RETURNS jsonb
  AS $$ SELECT public.attach_course_docente_assessment(course, docente, snap, yr, gen, pg_temp.uid('at_dir')) $$
  LANGUAGE sql;

CREATE TEMP TABLE at_snap AS SELECT pg_temp.state() AS s;

-- =============================================================================
-- [T-0] Migration objects and privileges
-- =============================================================================
SELECT has_function('public', 'attach_course_docente_assessment',
  ARRAY['uuid', 'uuid', 'uuid', 'integer', 'text', 'uuid'],
  'T-0: attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid) exists');
SELECT is(p.prosecdef, false, 'T-0: attach_course_docente_assessment is SECURITY INVOKER')
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname = 'public' AND p.proname = 'attach_course_docente_assessment';
SELECT function_privs_are('public', 'attach_course_docente_assessment',
  ARRAY['uuid', 'uuid', 'uuid', 'integer', 'text', 'uuid'], 'anon', ARRAY[]::text[],
  'T-0: anon holds no privilege');
SELECT function_privs_are('public', 'attach_course_docente_assessment',
  ARRAY['uuid', 'uuid', 'uuid', 'integer', 'text', 'uuid'], 'authenticated', ARRAY[]::text[],
  'T-0: authenticated holds no privilege');
SELECT function_privs_are('public', 'attach_course_docente_assessment',
  ARRAY['uuid', 'uuid', 'uuid', 'integer', 'text', 'uuid'], 'service_role', ARRAY['EXECUTE'],
  'T-0: service_role may EXECUTE');

SELECT set_config('request.jwt.claims', NULL, true);
SELECT set_config('role', 'anon', true);
SELECT throws_ok($$
  SELECT public.attach_course_docente_assessment('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'),
    '75000000-0000-4000-8000-0000000000f2', 1, 'GT', pg_temp.uid('at_dir'))
$$, '42501', NULL, 'T-0: anon is refused (42501)');
RESET ROLE;

SELECT tests.authenticate_as('at_auth');
SELECT throws_ok($$
  SELECT public.attach_course_docente_assessment('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'),
    '75000000-0000-4000-8000-0000000000f2', 1, 'GT', pg_temp.uid('at_dir'))
$$, '42501', NULL, 'T-0: an authenticated user is refused (42501)');
RESET ROLE;
SELECT tests.clear_authentication();

SELECT is(pg_temp.state(), (SELECT s FROM at_snap), 'T-0: the privilege refusals wrote nothing');

-- =============================================================================
-- [T-1] Business refusals (P0001) as service_role — nothing written
-- =============================================================================
SELECT set_config('role', 'service_role', true);

SELECT throws_ok($$ SELECT pg_temp.attach(NULL, pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'invalid_arguments', 'T-1: a null course is invalid');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', NULL, '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'invalid_arguments', 'T-1: a null docente is invalid');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), NULL) $$,
  'P0001', 'invalid_arguments', 'T-1: a null snapshot is invalid');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2', 6) $$,
  'P0001', 'invalid_arguments', 'T-1: a year outside 1..5 is invalid');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2', 1, 'XX') $$,
  'P0001', 'invalid_arguments', 'T-1: an unknown generation type is invalid');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000ff', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'course_not_found', 'T-1: an unknown course is refused');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a2', pg_temp.uid('at_d3'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'docente_not_active_on_course', 'T-1: an INACTIVE assignment does not authorise a grant');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_none'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'docente_not_active_on_course', 'T-1: a docente never assigned to the course is refused');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_x'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'docente_not_active_on_course', 'T-1: a co-assignee without an assignment row cannot be attached through this path');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a1', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'assignment_invariant_violation', 'T-1: a course with two active assignments is refused even for one of its docentes');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000ff') $$,
  'P0001', 'snapshot_not_found', 'T-1: an unknown snapshot is refused');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f3') $$,
  'P0001', 'template_not_eligible', 'T-1: an archived template never gains an instance or a grant (Step 2e)');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f4') $$,
  'P0001', 'template_not_eligible', 'T-1: a draft template is refused');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f1') $$,
  'P0001', 'snapshot_not_current', 'T-1: a superseded snapshot is refused');

RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM at_snap), 'T-1: every refused call left the fixture untouched');

-- =============================================================================
-- [T-2] Attach to the live instance (A3, snapshot f2, instance 3a01)
-- =============================================================================
SELECT set_config('role', 'service_role', true);

SELECT is(
  pg_temp.attach('75000000-0000-4000-8000-0000000000a3', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2'),
  jsonb_build_object('instance_id', '75000000-0000-4000-8000-000000003a01', 'assignment_id', '75000000-0000-4000-8000-0000000000d4', 'outcome', 'attached'),
  'T-2: the approved docente is attached to the live instance');
RESET ROLE;

SELECT results_eq($$
  SELECT can_edit, can_submit, has_started, has_submitted, assigned_by
    FROM public.assessment_instance_assignees
   WHERE instance_id = '75000000-0000-4000-8000-000000003a01' AND user_id = pg_temp.uid('at_d1')
$$, $$ VALUES (true, true, false, false, pg_temp.uid('at_dir')) $$,
  'T-2: the new grant carries fresh flags and the given assigned_by');
SELECT results_eq($$
  SELECT id, can_edit, can_submit, has_started, has_submitted
    FROM public.assessment_instance_assignees
   WHERE instance_id = '75000000-0000-4000-8000-000000003a01' AND user_id = pg_temp.uid('at_x')
$$, $$ VALUES ('75000000-0000-4000-8000-000000000204'::uuid, false, true, false, false) $$,
  'T-2: the unrelated co-assignee''s grant is field-identical');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees WHERE instance_id = '75000000-0000-4000-8000-000000003a01'),
  2, 'T-2: exactly one grant was added to the live instance');
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '75000000-0000-4000-8000-0000000000a3'),
  2, 'T-2: no instance was created (the live one was reused)');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = '75000000-0000-4000-8000-000000003a02'),
  'archived', 'T-2: the archived instance is untouched');

CREATE TEMP TABLE at_snap2 AS SELECT pg_temp.state() AS s;
SELECT set_config('role', 'service_role', true);
SELECT is(
  pg_temp.attach('75000000-0000-4000-8000-0000000000a3', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2'),
  jsonb_build_object('instance_id', '75000000-0000-4000-8000-000000003a01', 'assignment_id', '75000000-0000-4000-8000-0000000000d4', 'outcome', 'already_exists'),
  'T-2: a repeat is already_exists');
RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM at_snap2), 'T-2: the repeat wrote nothing (the existing grant''s flags were not reset)');

-- Archive the live instance of A3 by hand: the next attach must NOT reattach it.
UPDATE public.assessment_instances SET status = 'archived' WHERE id = '75000000-0000-4000-8000-000000003a01';
SELECT set_config('role', 'service_role', true);
SELECT is(
  (pg_temp.attach('75000000-0000-4000-8000-0000000000a3', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2'))->>'outcome',
  'created', 'T-2: with every instance archived a NEW live instance is created (archived history is never reattached)');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.assessment_instances
            WHERE course_structure_id = '75000000-0000-4000-8000-0000000000a3' AND status <> 'archived'),
  1, 'T-2: exactly one live instance exists for A3 after the create');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE instance_id = '75000000-0000-4000-8000-000000003a01'),
  2, 'T-2: the archived instance kept its grants (nothing revoked, nothing added)');

-- =============================================================================
-- [T-3] Create path (A4, no instance yet)
-- =============================================================================
SELECT set_config('role', 'service_role', true);
CREATE TEMP TABLE at_created AS
  SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2', 3, 'GI') AS r;
RESET ROLE;

SELECT is((SELECT r->>'outcome' FROM at_created), 'created', 'T-3: outcome is created');
SELECT is((SELECT r->>'assignment_id' FROM at_created), '75000000-0000-4000-8000-0000000000d5', 'T-3: the active assignment id is returned');
SELECT results_eq($$
  SELECT i.template_snapshot_id::text, i.school_id, i.course_structure_id::text, i.transformation_year,
         i.generation_type::text, i.status, i.assigned_by
    FROM public.assessment_instances i
   WHERE i.id = (SELECT (r->>'instance_id')::uuid FROM at_created)
$$, $$ VALUES ('75000000-0000-4000-8000-0000000000f2', 9985, '75000000-0000-4000-8000-0000000000a4', 3, 'GI', 'pending', pg_temp.uid('at_dir')) $$,
  'T-3: the instance carries the snapshot, the course''s school, the year, the generation type, pending, assigned_by');
SELECT results_eq($$
  SELECT user_id, can_edit, can_submit, has_started, has_submitted, assigned_by
    FROM public.assessment_instance_assignees
   WHERE instance_id = (SELECT (r->>'instance_id')::uuid FROM at_created)
$$, $$ VALUES (pg_temp.uid('at_d1'), true, true, false, false, pg_temp.uid('at_dir')) $$,
  'T-3: exactly the docente''s grant was created with the instance');

SELECT set_config('role', 'service_role', true);
SELECT is(
  pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2', 3, 'GI'),
  jsonb_build_object('instance_id', (SELECT r->>'instance_id' FROM at_created), 'assignment_id', '75000000-0000-4000-8000-0000000000d5', 'outcome', 'already_exists'),
  'T-3: a repeat reuses the live instance and is already_exists');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.assessment_instances WHERE course_structure_id = '75000000-0000-4000-8000-0000000000a4'),
  1, 'T-3: no second instance was created');

-- =============================================================================
-- [T-4] The finding-1 sequence: cleanup first, stale attach second
-- =============================================================================
-- What Operation A Step 2 does to A1: keep d1, deactivate d2, revoke d2's grant.
UPDATE public.school_course_docente_assignments SET is_active = false WHERE id = '75000000-0000-4000-8000-0000000000d2';
DELETE FROM public.assessment_instance_assignees
 WHERE instance_id = '75000000-0000-4000-8000-000000001a01' AND user_id = pg_temp.uid('at_d2');
CREATE TEMP TABLE at_snap4 AS SELECT pg_temp.state() AS s;

SELECT set_config('role', 'service_role', true);
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a1', pg_temp.uid('at_d2'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'docente_not_active_on_course', 'T-4: the obsolete docente''s attach (existing instance) is refused after the cleanup');
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a1', pg_temp.uid('at_d2'), '75000000-0000-4000-8000-0000000000f1') $$,
  'P0001', 'docente_not_active_on_course', 'T-4: the obsolete docente is refused before any snapshot / instance check');
RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM at_snap4), 'T-4: the refused attaches restored nothing');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees
            WHERE instance_id = '75000000-0000-4000-8000-000000001a01' AND user_id = pg_temp.uid('at_d2')),
  0, 'T-4: the obsolete docente holds no grant on the live instance');

-- The approved docente's own reconciliation still works on the cleaned course.
SELECT set_config('role', 'service_role', true);
SELECT is(
  (pg_temp.attach('75000000-0000-4000-8000-0000000000a1', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2'))->>'outcome',
  'already_exists', 'T-4: the approved docente''s reconciliation on the cleaned course is a no-op');
RESET ROLE;
SELECT results_eq($$
  SELECT user_id FROM public.assessment_instance_assignees
   WHERE instance_id = '75000000-0000-4000-8000-000000001a01' ORDER BY user_id
$$, $$ SELECT u FROM unnest(ARRAY[pg_temp.uid('at_d1'), pg_temp.uid('at_x')]) AS u ORDER BY u $$,
  'T-4: the live instance holds exactly the approved docente and the unrelated co-assignee');

-- =============================================================================
-- [T-5] Round 4, finding R5-1: the template eligibility decision is taken
--       under a FOR SHARE lock on the template row (20260908140000) and the
--       archive / restore lifecycle behaves as documented. The concurrent
--       orderings (archive waiting on an in-flight attach, Step 2e against a
--       restore) need several sessions and are proved by
--       scripts/ci/operation-a-proof.mjs [2e-r5]; here the lock is pinned in
--       the function body and the single-session semantics are asserted.
-- =============================================================================
SELECT ok(
  position('FOR SHARE OF t' IN pg_get_functiondef('public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid)'::regprocedure)) > 0,
  'T-5: the function locks the template row FOR SHARE (held to the end of the transaction)');
SELECT ok(
  position('FOR SHARE OF t' IN pg_get_functiondef('public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid)'::regprocedure))
    < position('FOR UPDATE OF i' IN pg_get_functiondef('public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid)'::regprocedure)),
  'T-5: the template row is locked BEFORE the instance lookup (the wait that made the round-4 decision stale)');
SELECT ok(
  position('snapshot_not_current' IN pg_get_functiondef('public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid)'::regprocedure))
    > position('FOR UPDATE OF i' IN pg_get_functiondef('public.attach_course_docente_assessment(uuid, uuid, uuid, integer, text, uuid)'::regprocedure)),
  'T-5: the current-snapshot check is the last read before the write (after the instance lock)');

-- A4 holds the instance T-3 created (d1 active, snapshot f2, template e1).
CREATE TEMP TABLE at_t5_live AS
  SELECT id FROM public.assessment_instances
   WHERE course_structure_id = '75000000-0000-4000-8000-0000000000a4' AND template_snapshot_id = '75000000-0000-4000-8000-0000000000f2' AND status <> 'archived';
SELECT is((SELECT count(*)::int FROM at_t5_live), 1, 'T-5: precondition — A4 holds one live instance on the current snapshot');

-- The archive route's write. Committed before the attach: the attach sees it under the lock and refuses.
UPDATE public.assessment_templates SET is_archived = true, archived_at = now() WHERE id = '75000000-0000-4000-8000-0000000000e1';
CREATE TEMP TABLE at_snap5 AS SELECT pg_temp.state() AS s;
SELECT set_config('role', 'service_role', true);
SELECT throws_ok($$ SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2') $$,
  'P0001', 'template_not_eligible', 'T-5: after the archive committed, the attach to the live instance is refused');
RESET ROLE;
SELECT is(pg_temp.state(), (SELECT s FROM at_snap5), 'T-5: the refused attach wrote nothing');

-- What Step 2e does to that instance (archive, revoke), then the restore route's write.
UPDATE public.assessment_instances SET status = 'archived', updated_at = now() WHERE id = (SELECT id FROM at_t5_live);
DELETE FROM public.assessment_instance_assignees WHERE instance_id = (SELECT id FROM at_t5_live);
UPDATE public.assessment_templates SET is_archived = false, archived_at = NULL WHERE id = '75000000-0000-4000-8000-0000000000e1';

SELECT set_config('role', 'service_role', true);
CREATE TEMP TABLE at_t5_after AS
  SELECT pg_temp.attach('75000000-0000-4000-8000-0000000000a4', pg_temp.uid('at_d1'), '75000000-0000-4000-8000-0000000000f2') AS r;
RESET ROLE;
SELECT is((SELECT r->>'outcome' FROM at_t5_after), 'created', 'T-5: after the restore, the attach creates a FRESH live instance (R4: the archived one is never reattached)');
SELECT isnt((SELECT (r->>'instance_id')::uuid FROM at_t5_after), (SELECT id FROM at_t5_live), 'T-5: the fresh instance is not the archived one');
SELECT is((SELECT status FROM public.assessment_instances WHERE id = (SELECT id FROM at_t5_live)), 'archived', 'T-5: the instance Step 2e archived stays archived');
SELECT is((SELECT count(*)::int FROM public.assessment_instance_assignees WHERE instance_id = (SELECT id FROM at_t5_live)), 0, 'T-5: the archived instance keeps zero grants');
SELECT is((SELECT count(*)::int FROM public.assessment_instances
            WHERE course_structure_id = '75000000-0000-4000-8000-0000000000a4' AND template_snapshot_id = '75000000-0000-4000-8000-0000000000f2' AND status <> 'archived'),
  1, 'T-5: exactly one live instance exists for the course + snapshot after the restore');

SELECT * FROM finish();
ROLLBACK;
