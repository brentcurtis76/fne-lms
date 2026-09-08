-- =============================================================================
-- 072-drls-function-exposure.sql — D-RLS-01 confirmed corrections: migration
-- 20260907120200_drls_function_exposure.sql on the five named non-learning
-- functions, plus the prevention invariants the remediation leaves behind.
--
--   1. per function: EXECUTE revoked from PUBLIC and anon; the by-name grants
--      as declared; search_path pinned
--   2. cleanup_propuesta_rate_limits: authenticated revoked, service_role kept
--   3. live probes: anon cannot call any of the five; an authenticated user
--      cannot call the cleanup; the policy predicates still work for an
--      authenticated caller
--   4. prevention: no table in public (ordinary or partitioned) lacks row
--      security, and no SECURITY DEFINER function among the W-B2c-01 /
--      D-RLS-01 set is executable by anon or PUBLIC
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(52);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

-- Impersonated roles have no USAGE on schema tests; this SECURITY DEFINER shim
-- (owned by the session's postgres) resolves fixture uids on their behalf.
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

CREATE TEMP TABLE drls_fns (sig, auth, svc) AS VALUES
  ('public.has_transformation_access(uuid)',                                 true,  true),
  ('public.get_available_assignment_templates(uuid)',                        false, true),   -- C1 (20260907120400): retired from application roles; backend only
  ('public.cleanup_propuesta_rate_limits()',                                 false, true),
  ('public.has_global_workspace_access(uuid)',                               true,  true),
  ('public.submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)',      true,  true);

-- 1 + 2. Grants and search_path (5 × 5 = 25)
SELECT ok(NOT has_function_privilege('anon', f.sig, 'EXECUTE'), format('anon cannot execute %s', f.sig))
FROM drls_fns f ORDER BY f.sig;
SELECT ok(
  NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = f.sig::regprocedure)) a
               WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  format('PUBLIC holds no EXECUTE on %s', f.sig))
FROM drls_fns f ORDER BY f.sig;
SELECT is(has_function_privilege('authenticated', f.sig, 'EXECUTE'), f.auth,
  format('authenticated EXECUTE on %s is %s', f.sig, f.auth))
FROM drls_fns f ORDER BY f.sig;
SELECT is(has_function_privilege('service_role', f.sig, 'EXECUTE'), f.svc,
  format('service_role EXECUTE on %s is %s', f.sig, f.svc))
FROM drls_fns f ORDER BY f.sig;
SELECT ok(
  EXISTS (SELECT 1 FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = f.sig::regprocedure)) c
           WHERE c = 'search_path=public, pg_temp'),
  format('%s runs with search_path pinned to public, pg_temp', f.sig))
FROM drls_fns f ORDER BY f.sig;

-- 3. Live probes
SELECT tests.create_supabase_user('drls_user');
SELECT tests.create_supabase_user('drls_other');   -- a second consultor: the cross-user oracle target
SELECT tests.create_supabase_user('drls_admin');
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['drls_user','drls_other','drls_admin']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (9721, 'DRLS school (pgTAP 072)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (pg_temp.uid('drls_user'),  'consultor', 9721, true),
  (pg_temp.uid('drls_other'), 'consultor', 9721, true),
  (pg_temp.uid('drls_admin'), 'admin',     NULL, true);
-- Quiz fixture (course -> module -> lesson) for the submit_quiz actor probes.
INSERT INTO public.instructors (id, full_name) VALUES ('72000000-0000-4000-8000-00000000f001', 'DRLS instructor');
INSERT INTO public.courses (id, title, description, instructor_id)
VALUES ('72000000-0000-4000-8000-000000000c01', 'DRLS course', 'quiz fixture', '72000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number)
VALUES ('72000000-0000-4000-8000-00000000e001', '72000000-0000-4000-8000-000000000c01', 'DRLS module', 1);
INSERT INTO public.lessons (id, module_id, title)
VALUES ('72000000-0000-4000-8000-00000000ee01', '72000000-0000-4000-8000-00000000e001', 'DRLS lesson');
INSERT INTO public.growth_communities (id, school_id, name)
VALUES ('72000000-0000-4000-8000-00000000c001', 9721, 'DRLS community');
INSERT INTO public.growth_community_transformation_access (growth_community_id, is_active)
VALUES ('72000000-0000-4000-8000-00000000c001', true);

SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.has_transformation_access('72000000-0000-4000-8000-00000000c001')$$, '42501', NULL,
  'anon: has_transformation_access is not executable');
SELECT throws_ok($$SELECT * FROM public.get_available_assignment_templates('72000000-0000-4000-8000-00000000c001')$$, '42501', NULL,
  'anon: get_available_assignment_templates is not executable');
SELECT throws_ok($$SELECT public.cleanup_propuesta_rate_limits()$$, '42501', NULL,
  'anon: cleanup_propuesta_rate_limits is not executable');
SELECT throws_ok($$SELECT public.has_global_workspace_access('72000000-0000-4000-8000-00000000c001')$$, '42501', NULL,
  'anon: has_global_workspace_access is not executable');
SELECT throws_ok($$SELECT public.submit_quiz('72000000-0000-4000-8000-00000000c001', 'b', '72000000-0000-4000-8000-00000000c001', '72000000-0000-4000-8000-00000000c001', '{}'::jsonb, '{"questions":[]}'::jsonb, NULL)$$, '42501', NULL,
  'anon: submit_quiz is not executable');
RESET ROLE;

SELECT tests.authenticate_as('drls_user');
SELECT ok(public.has_transformation_access('72000000-0000-4000-8000-00000000c001'),
  'authenticated: has_transformation_access still answers for the policy predicates');
SELECT ok(public.has_global_workspace_access(auth.uid()),
  'authenticated: has_global_workspace_access(auth.uid()) still answers for the meeting policies');
SELECT ok(NOT public.has_global_workspace_access(pg_temp.uid('drls_other')),
  'authenticated non-admin: has_global_workspace_access(another user) answers FALSE (no disclosure), although that user IS a consultor');
SELECT ok(NOT public.auth_is_backend_caller(),
  'authenticated: auth_is_backend_caller() is FALSE');
SELECT throws_ok($$SELECT public.cleanup_propuesta_rate_limits()$$, '42501', NULL,
  'authenticated: cleanup_propuesta_rate_limits is not executable');
-- submit_quiz actor boundary (D-RLS-02)
SELECT isnt(
  public.submit_quiz('72000000-0000-4000-8000-00000000ee01', 'block-1', pg_temp.uid('drls_user'), '72000000-0000-4000-8000-000000000c01',
                     '{"q1": {"selectedOption": "a"}}'::jsonb,
                     '{"questions": [{"id": "q1", "type": "multiple-choice", "points": 1, "options": [{"id": "a", "isCorrect": true}]}]}'::jsonb, 10),
  NULL, 'authenticated: submit_quiz as THEMSELVES succeeds and returns a submission id');
SELECT is((SELECT auto_graded_score FROM public.quiz_submissions WHERE student_id = pg_temp.uid('drls_user') AND block_id = 'block-1'), 1,
  'authenticated: the own submission was scored (body semantics preserved)');
SELECT throws_ok(
  $$SELECT public.submit_quiz('72000000-0000-4000-8000-00000000ee01', 'block-2', pg_temp.uid('drls_other'), '72000000-0000-4000-8000-000000000c01',
                              '{}'::jsonb, '{"questions": []}'::jsonb, NULL)$$,
  '42501', 'Caller-supplied student does not match the authenticated user',
  'authenticated: submit_quiz as ANOTHER student is refused');
SELECT throws_ok(
  $$SELECT public.submit_quiz('72000000-0000-4000-8000-00000000ee01', 'block-2', NULL, '72000000-0000-4000-8000-000000000c01',
                              '{}'::jsonb, '{"questions": []}'::jsonb, NULL)$$,
  '42501', NULL, 'authenticated: a NULL p_student_id is not a wildcard');
SELECT is((SELECT count(*)::int FROM public.quiz_submissions WHERE block_id = 'block-2'), 0,
  'authenticated: the refused submissions wrote nothing');
RESET ROLE;

SELECT tests.authenticate_as('drls_admin');
SELECT ok(public.has_global_workspace_access(pg_temp.uid('drls_other')),
  'admin: has_global_workspace_access(another user) still answers (cross-user reporting)');
RESET ROLE;

-- Backend principal (the QA seed scripts: service-role key, no end-user identity)
SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
SELECT ok(public.auth_is_backend_caller(), 'service_role: auth_is_backend_caller() is TRUE');
SELECT isnt(
  public.submit_quiz('72000000-0000-4000-8000-00000000ee01', 'block-3', pg_temp.uid('drls_other'), '72000000-0000-4000-8000-000000000c01',
                     '{}'::jsonb, '{"questions": []}'::jsonb, NULL),
  NULL, 'service_role: submit_quiz for a named student (seed path) still succeeds');
SELECT ok(public.has_global_workspace_access(pg_temp.uid('drls_other')),
  'service_role: has_global_workspace_access(any user) answers');
RESET ROLE;

SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.auth_is_backend_caller()$$, '42501', NULL,
  'anon: auth_is_backend_caller is not executable');
RESET ROLE;
SELECT ok(NOT has_function_privilege('anon', 'public.auth_is_backend_caller()', 'EXECUTE'), 'anon holds no EXECUTE on auth_is_backend_caller');
SELECT ok(NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = 'public.auth_is_backend_caller()'::regprocedure)) a
                       WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'), 'PUBLIC holds no EXECUTE on auth_is_backend_caller');

-- 4. Prevention invariants
SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
  '{}'::text[], 'PREVENTION: no table in public — ordinary or partitioned — lacks row security');

-- A partitioned parent created without row security IS detected by the same
-- predicate (relkind 'p'), so the check cannot be escaped by partitioning.
CREATE TABLE public._drls_partitioned_probe (id int, k int) PARTITION BY RANGE (k);
SELECT is(
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
      AND c.relname = '_drls_partitioned_probe'),
  1, 'PREVENTION: a partitioned table without row security is detected (relkind p is covered)');
ALTER TABLE public._drls_partitioned_probe ENABLE ROW LEVEL SECURITY;
SELECT tests.rls_enabled('public', '_drls_partitioned_probe');
-- Transient fixture removed inside the rolled-back transaction (test-only DDL).
DROP TABLE public._drls_partitioned_probe;

SELECT is(
  (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}'::text[])
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_full_learning_path','update_full_learning_path','batch_assign_learning_path',
                        'start_learning_path_session','end_learning_path_session','auth_is_learning_path_member',
                        'increment_path_assignment_time','update_session_heartbeat','auth_is_learning_path_assignee',
                        'auth_is_assigned_group_member','has_transformation_access','get_available_assignment_templates',
                        'cleanup_propuesta_rate_limits','has_global_workspace_access','submit_quiz')
      AND (has_function_privilege('anon', p.oid, 'EXECUTE')
           OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'))),
  '{}'::text[], 'PREVENTION: none of the fifteen remediated functions is executable by anon or PUBLIC');

SELECT is(
  (SELECT coalesce(array_agg(p.proname::text ORDER BY p.proname), '{}'::text[])
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('create_full_learning_path','update_full_learning_path','batch_assign_learning_path',
                        'start_learning_path_session','end_learning_path_session','auth_is_learning_path_member',
                        'increment_path_assignment_time','update_session_heartbeat','auth_is_learning_path_assignee',
                        'auth_is_assigned_group_member','has_transformation_access','get_available_assignment_templates',
                        'cleanup_propuesta_rate_limits','has_global_workspace_access','submit_quiz')
      AND NOT EXISTS (SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%')),
  '{}'::text[], 'PREVENTION: none of the fifteen remediated functions runs with a mutable search_path');

SELECT * FROM finish();

ROLLBACK;
