-- =============================================================================
-- 138-consultor-workspace-entry.sql — GENERA fixes F12e, item V5a.
-- Proves migration 20261118101000_consultor_workspace_entry.sql:
--   * public.auth_consultor_assigned_school_ids() RETURNS SETOF integer: the
--     distinct school_id of the CALLER's current consultant_assignments rows
--     (school_id not null, is_active, started — starts_at null or not in the
--     future — and not ended — ends_at null or in the future), and only while
--     the caller holds an active consultor role; no rows otherwise;
--   * SECURITY DEFINER, no argument; EXECUTE for authenticated and
--     service_role, not for anon (anon is refused by permission, 42501).
-- Synthetic fixtures (schools 13801 / 13802, uuids 13800000-…); everything
-- rolls back.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT no_plan();

CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

-- -----------------------------------------------------------------------------
-- Fixtures
-- -----------------------------------------------------------------------------
SELECT tests.create_supabase_user(k) FROM unnest(ARRAY[
  'v5a_admin', 'v5a_cons_one', 'v5a_cons_two', 'v5a_cons_ended', 'v5a_cons_off',
  'v5a_cons_future', 'v5a_cons_role_off', 'v5a_cons_comgen', 'v5a_cons_nulls', 'v5a_docente']) k;
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY[
  'v5a_admin', 'v5a_cons_one', 'v5a_cons_two', 'v5a_cons_ended', 'v5a_cons_off',
  'v5a_cons_future', 'v5a_cons_role_off', 'v5a_cons_comgen', 'v5a_cons_nulls', 'v5a_docente']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (13801, 'V5a school A (pgTAP 138)'),
  (13802, 'V5a school B (pgTAP 138)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.generations (id, school_id, name) VALUES
  ('13800000-0000-4000-8000-0000000000a1', 13801, 'V5a generation A');
INSERT INTO public.growth_communities (id, generation_id, school_id, name) VALUES
  ('13800000-0000-4000-8000-00000000c0a1', '13800000-0000-4000-8000-0000000000a1', 13801, 'V5a community A');

-- Every consultor's ROLE row names school B; the assignments name school A
-- (and B for cons_two), so the answer is visibly the assignment, not the role.
INSERT INTO public.user_roles (user_id, role_type, school_id, generation_id, community_id, is_active) VALUES
  (pg_temp.uid('v5a_admin'),         'admin',     NULL,  NULL, NULL, true),
  (pg_temp.uid('v5a_cons_one'),      'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_two'),      'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_ended'),    'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_off'),      'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_future'),   'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_role_off'), 'consultor', 13802, NULL, NULL, false),
  (pg_temp.uid('v5a_cons_comgen'),   'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_cons_nulls'),    'consultor', 13802, NULL, NULL, true),
  (pg_temp.uid('v5a_docente'),       'docente',   13801, NULL, NULL, true);

INSERT INTO public.consultant_assignments
  (consultant_id, student_id, school_id, generation_id, community_id, is_active, starts_at, ends_at, assignment_type, assignment_data) VALUES
  (pg_temp.uid('v5a_cons_one'),      NULL, 13801, NULL, NULL, true,  now() - interval '10 days', now() + interval '30 days', 'monitoring', '{"assignment_scope":"school"}'),
  -- two schools (school B with no start date), plus a community-scoped row that
  -- also names school A: each school once
  (pg_temp.uid('v5a_cons_two'),      NULL, 13801, NULL, NULL, true,  now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('v5a_cons_two'),      NULL, 13802, NULL, NULL, true,  NULL,                       NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('v5a_cons_two'),      NULL, 13801, NULL, '13800000-0000-4000-8000-00000000c0a1', true, now() - interval '5 days', NULL, 'support', '{"assignment_scope":"community"}'),
  (pg_temp.uid('v5a_cons_ended'),    NULL, 13801, NULL, NULL, true,  now() - interval '10 days', now() - interval '1 day', 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('v5a_cons_off'),      NULL, 13801, NULL, NULL, false, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('v5a_cons_future'),   NULL, 13801, NULL, NULL, true,  now() + interval '1 month', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  (pg_temp.uid('v5a_cons_role_off'), NULL, 13801, NULL, NULL, true,  now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  -- rows naming only a community or only a generation, no school
  (pg_temp.uid('v5a_cons_comgen'),   NULL, NULL, NULL, '13800000-0000-4000-8000-00000000c0a1', true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"community"}'),
  (pg_temp.uid('v5a_cons_comgen'),   NULL, NULL, '13800000-0000-4000-8000-0000000000a1', NULL, true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"generation"}'),
  -- is_active null is not "true"
  (pg_temp.uid('v5a_cons_nulls'),    NULL, 13801, NULL, NULL, NULL,  now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}'),
  -- a docente for whom an assignment row exists
  (pg_temp.uid('v5a_docente'),       NULL, 13801, NULL, NULL, true,  now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}');

-- -----------------------------------------------------------------------------
-- Structure and grants
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'auth_consultor_assigned_school_ids', ARRAY[]::name[], 'auth_consultor_assigned_school_ids() exists');
SELECT is_definer('public', 'auth_consultor_assigned_school_ids', ARRAY[]::name[], 'auth_consultor_assigned_school_ids is SECURITY DEFINER');
SELECT function_returns('public', 'auth_consultor_assigned_school_ids', ARRAY[]::name[], 'setof integer', 'returns SETOF integer');
SELECT volatility_is('public', 'auth_consultor_assigned_school_ids', ARRAY[]::name[], 'stable', 'is STABLE');
SELECT ok(NOT coalesce(has_function_privilege('anon', to_regprocedure('public.auth_consultor_assigned_school_ids()'), 'EXECUTE'), true), 'anon cannot execute auth_consultor_assigned_school_ids');
SELECT ok(NOT coalesce(has_function_privilege('public', to_regprocedure('public.auth_consultor_assigned_school_ids()'), 'EXECUTE'), true), 'PUBLIC cannot execute auth_consultor_assigned_school_ids');
SELECT ok(coalesce(has_function_privilege('authenticated', to_regprocedure('public.auth_consultor_assigned_school_ids()'), 'EXECUTE'), false), 'authenticated can execute auth_consultor_assigned_school_ids');
SELECT ok(coalesce(has_function_privilege('service_role', to_regprocedure('public.auth_consultor_assigned_school_ids()'), 'EXECUTE'), false), 'service_role can execute auth_consultor_assigned_school_ids');
SELECT ok(coalesce(obj_description(to_regprocedure('public.auth_consultor_assigned_school_ids()'), 'pg_proc'), '') LIKE '%starts_at%', 'the comment states the rule (mentions starts_at)');

-- -----------------------------------------------------------------------------
-- Real calls, each as that person
-- -----------------------------------------------------------------------------
SELECT tests.authenticate_as('v5a_cons_one');
SELECT results_eq($$SELECT s FROM public.auth_consultor_assigned_school_ids() s ORDER BY s$$,
  ARRAY[13801], 'consultor with a current assignment: that school (not the role''s school)');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_two');
SELECT results_eq($$SELECT s FROM public.auth_consultor_assigned_school_ids() s ORDER BY s$$,
  ARRAY[13801, 13802], 'consultor with two schools: both, each once');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_ended');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'assignment ended: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_off');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'assignment switched off: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_nulls');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'assignment with is_active null: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_future');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'assignment starting next month: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_role_off');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'current assignment, consultor role switched off: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_docente');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'docente with an assignment row: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_cons_comgen');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'rows naming only a community or a generation: nothing');
RESET ROLE;

SELECT tests.authenticate_as('v5a_admin');
SELECT is_empty($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$, 'admin: nothing');
RESET ROLE;

-- anon: pinned as refused by permission (42501), not an empty answer
SET LOCAL ROLE anon;
SELECT throws_ok($$SELECT * FROM public.auth_consultor_assigned_school_ids()$$,
  '42501', NULL, 'anon: refused by permission');
RESET ROLE;

-- =============================================================================
-- Send-back 1 (18 Nov 2026): the workspace's own row (community_workspaces) is
-- readable by a consultor currently assigned to the school of that workspace's
-- community — rule "consultants_read_assigned_school_workspaces", added next to
-- the role-school rule "consultants_read_school_workspaces", which stays.
--
-- Workspaces: A1 and A2 (school A, 13801), B (school B, 13802), C (school C,
-- 13803). Every consultor role row above names school B, so the OLD role-school
-- rule gives them B's workspace and never A's: whatever they read of school A
-- comes through the new rule only. v5a_cons_noschool's role row names no school
-- (the old rule gives them nothing at all). v5a_member is a docente whose role
-- row names community A1 (the members' rule).
-- =============================================================================
SELECT tests.create_supabase_user(k) FROM unnest(ARRAY['v5a_cons_noschool', 'v5a_member']) k;
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['v5a_cons_noschool', 'v5a_member']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES
  (13803, 'V5a school C (pgTAP 138)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.generations (id, school_id, name) VALUES
  ('13800000-0000-4000-8000-0000000000b1', 13802, 'V5a generation B'),
  ('13800000-0000-4000-8000-0000000000c1', 13803, 'V5a generation C');
INSERT INTO public.growth_communities (id, generation_id, school_id, name) VALUES
  ('13800000-0000-4000-8000-00000000c0a2', '13800000-0000-4000-8000-0000000000a1', 13801, 'V5a community A2'),
  ('13800000-0000-4000-8000-00000000c0b1', '13800000-0000-4000-8000-0000000000b1', 13802, 'V5a community B'),
  ('13800000-0000-4000-8000-00000000c0c1', '13800000-0000-4000-8000-0000000000c1', 13803, 'V5a community C');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-00000000c0a1', 'V5a workspace A1'),
  ('13800000-0000-4000-8000-0000000e0a02', '13800000-0000-4000-8000-00000000c0a2', 'V5a workspace A2'),
  ('13800000-0000-4000-8000-0000000e0b01', '13800000-0000-4000-8000-00000000c0b1', 'V5a workspace B'),
  ('13800000-0000-4000-8000-0000000e0c01', '13800000-0000-4000-8000-00000000c0c1', 'V5a workspace C');

INSERT INTO public.user_roles (user_id, role_type, school_id, generation_id, community_id, is_active) VALUES
  (pg_temp.uid('v5a_cons_noschool'), 'consultor', NULL, NULL, NULL, true),
  (pg_temp.uid('v5a_member'),        'docente',   13801, NULL, '13800000-0000-4000-8000-00000000c0a1', true);
INSERT INTO public.consultant_assignments
  (consultant_id, student_id, school_id, generation_id, community_id, is_active, starts_at, ends_at, assignment_type, assignment_data) VALUES
  (pg_temp.uid('v5a_cons_noschool'), NULL, 13801, NULL, NULL, true, now() - interval '10 days', NULL, 'monitoring', '{"assignment_scope":"school"}');

SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'community_workspaces'
    AND policyname = 'consultants_read_assigned_school_workspaces' AND cmd = 'SELECT' AND permissive = 'PERMISSIVE'
    AND roles = '{authenticated}'::name[]),
  'community_workspaces has the permissive SELECT rule consultants_read_assigned_school_workspaces for authenticated');
SELECT ok(EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'community_workspaces'
    AND policyname = 'consultants_read_school_workspaces'),
  'the role-school rule consultants_read_school_workspaces is still there');

-- Workspace rows of the four fixtures only (the ground may hold others)
CREATE OR REPLACE FUNCTION pg_temp.v5a_ws() RETURNS SETOF text
LANGUAGE sql STABLE AS $$
  SELECT name FROM public.community_workspaces
   WHERE id IN ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-0000000e0a02',
                '13800000-0000-4000-8000-0000000e0b01', '13800000-0000-4000-8000-0000000e0c01')
   ORDER BY name
$$;

-- role names school B, assignment school A
SELECT tests.authenticate_as('v5a_cons_one');
SELECT results_eq($$SELECT name FROM public.community_workspaces WHERE community_id IN
    ('13800000-0000-4000-8000-00000000c0a1', '13800000-0000-4000-8000-00000000c0a2') ORDER BY name$$,
  ARRAY['V5a workspace A1', 'V5a workspace A2'],
  'consultor whose role names another school, assigned to school A: reads the workspaces of A''s communities');
SELECT is_empty($$SELECT 1 FROM public.community_workspaces WHERE id = '13800000-0000-4000-8000-0000000e0c01'$$,
  'the same consultor: no workspace of school C (neither assigned nor named by the role)');
SELECT results_eq($$SELECT * FROM pg_temp.v5a_ws()$$,
  ARRAY['V5a workspace A1', 'V5a workspace A2', 'V5a workspace B'],
  'the same consultor: A1, A2 (assignment) and B (the role-school rule, unchanged), not C');
-- writes stay refused
SELECT is_empty($$WITH u AS (UPDATE public.community_workspaces SET name = 'changed by a consultor'
    WHERE id = '13800000-0000-4000-8000-0000000e0a01' RETURNING id) SELECT * FROM u$$,
  'the assigned consultor cannot UPDATE a workspace row of school A (no row changed)');
SELECT is_empty($$WITH d AS (DELETE FROM public.community_workspaces
    WHERE id = '13800000-0000-4000-8000-0000000e0a01' RETURNING id) SELECT * FROM d$$,
  'the assigned consultor cannot DELETE a workspace row of school A (no row deleted)');
SELECT throws_ok($$INSERT INTO public.community_workspaces (community_id, name) VALUES
    ('13800000-0000-4000-8000-00000000c0c1', 'inserted by a consultor')$$,
  '42501', NULL, 'the assigned consultor cannot INSERT a workspace row (refused by the row rules)');
RESET ROLE;
SELECT results_eq($$SELECT name FROM public.community_workspaces WHERE id = '13800000-0000-4000-8000-0000000e0a01'$$,
  ARRAY['V5a workspace A1'], 'after the consultor''s attempts workspace A1 is still there, unchanged');

-- role names no school, assignment school A
SELECT tests.authenticate_as('v5a_cons_noschool');
SELECT results_eq($$SELECT * FROM pg_temp.v5a_ws()$$,
  ARRAY['V5a workspace A1', 'V5a workspace A2'],
  'consultor whose role names no school, assigned to school A: reads A''s workspaces and no other');
RESET ROLE;

-- Not current, not a consultor: none of school A's workspaces. Their role rows
-- name school B, so the old rule never reaches A; B's own workspace (old rule)
-- is left out of these reads on purpose.
SELECT tests.authenticate_as('v5a_cons_ended');
SELECT is_empty($$SELECT 1 FROM public.community_workspaces WHERE id IN
    ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-0000000e0a02')$$,
  'assignment ended: no workspace of school A');
RESET ROLE;
SELECT tests.authenticate_as('v5a_cons_off');
SELECT is_empty($$SELECT 1 FROM public.community_workspaces WHERE id IN
    ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-0000000e0a02')$$,
  'assignment switched off: no workspace of school A');
RESET ROLE;
SELECT tests.authenticate_as('v5a_cons_future');
SELECT is_empty($$SELECT 1 FROM public.community_workspaces WHERE id IN
    ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-0000000e0a02')$$,
  'assignment starting next month: no workspace of school A');
RESET ROLE;
SELECT tests.authenticate_as('v5a_cons_role_off');
SELECT is_empty($$SELECT * FROM pg_temp.v5a_ws()$$,
  'current assignment, consultor role switched off: no workspace at all');
RESET ROLE;
-- the docente's role row names school A but no community; an assignment row exists
SELECT tests.authenticate_as('v5a_docente');
SELECT is_empty($$SELECT * FROM pg_temp.v5a_ws()$$,
  'docente with an assignment row to school A: no workspace');
RESET ROLE;

-- must still work: a member and an admin
SELECT tests.authenticate_as('v5a_member');
SELECT results_eq($$SELECT * FROM pg_temp.v5a_ws()$$,
  ARRAY['V5a workspace A1'], 'member of community A1: reads A1''s workspace only (unchanged)');
RESET ROLE;
SELECT tests.authenticate_as('v5a_admin');
SELECT results_eq($$SELECT * FROM pg_temp.v5a_ws()$$,
  ARRAY['V5a workspace A1', 'V5a workspace A2', 'V5a workspace B', 'V5a workspace C'],
  'admin: reads all four (unchanged)');
RESET ROLE;

-- anon: no rows
SET LOCAL ROLE anon;
SELECT is_empty($$SELECT 1 FROM public.community_workspaces WHERE id IN
    ('13800000-0000-4000-8000-0000000e0a01', '13800000-0000-4000-8000-0000000e0a02',
     '13800000-0000-4000-8000-0000000e0b01', '13800000-0000-4000-8000-0000000e0c01')$$,
  'anon: no workspace');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
