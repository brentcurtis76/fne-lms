-- =============================================================================
-- 102-audit-log-director-scope.sql — W-B2c-01 release review P1 — migration
-- 20261002130000_audit_log_director_scope.sql.
--
-- Direct (PostgREST-equivalent) SELECTs on public.assignment_audit_log with two
-- schools:
--   * director A: only rows about school-A people (course AND learning-path
--     rows), 0 rows about school-B people, 0 workspace (group) rows, 0 rows
--     about a person with no school
--   * active admin / active consultor: every row (unchanged); an inactive
--     consultor: nothing (unchanged)
--   * a director who is also an active consultor: every row (consultor rule)
--   * docente, director without school, anon: nothing (unchanged)
--   * flagged (forced password change) director: nothing
--   * service_role: every row; no write opened to directors
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(19);

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.set_service() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION pg_temp.uid(k text) RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER AS $$ SELECT tests.get_supabase_uid(k) $$;

-- Fixture rows visible to the caller, as a sorted list of their labels
-- (metadata->>'lbl'), restricted to this file's rows.
CREATE OR REPLACE FUNCTION pg_temp.seen() RETURNS text
LANGUAGE sql STABLE AS $$
  SELECT coalesce(string_agg(metadata ->> 'lbl', ',' ORDER BY metadata ->> 'lbl'), '')
    FROM public.assignment_audit_log
   WHERE metadata ->> 'pgtap' = '102' $$;

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres). School A = 10201, school B = 10202.
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user(k)
  FROM unnest(ARRAY['al102_admin','al102_cons','al102_cons_off','al102_dirA','al102_dirA_cons','al102_dirNull',
                    'al102_doc','al102_a1','al102_b1','al102_none']) k;
INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['al102_admin','al102_cons','al102_cons_off','al102_dirA','al102_dirA_cons','al102_dirNull',
                    'al102_doc','al102_a1','al102_b1','al102_none']) k
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.schools (id, name) VALUES (10201, 'AL102 school A (pgTAP 102)'), (10202, 'AL102 school B (pgTAP 102)')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES ('10200000-0000-4000-8000-00000000c00a', 10201, 'AL102 community A');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES ('10200000-0000-4000-8000-00000000bb0a', '10200000-0000-4000-8000-00000000c00a', 'AL102 workspace A');
INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, is_active) VALUES
  (pg_temp.uid('al102_admin'),     'admin',            NULL,  NULL, true),
  (pg_temp.uid('al102_cons'),      'consultor',        NULL,  NULL, true),
  (pg_temp.uid('al102_cons_off'),  'consultor',        NULL,  NULL, false),
  (pg_temp.uid('al102_dirA'),      'equipo_directivo', 10201, NULL, true),
  (pg_temp.uid('al102_dirA_cons'), 'equipo_directivo', 10201, NULL, true),
  (pg_temp.uid('al102_dirA_cons'), 'consultor',        NULL,  NULL, true),
  (pg_temp.uid('al102_dirNull'),   'equipo_directivo', NULL,  NULL, true),
  (pg_temp.uid('al102_doc'),       'docente',          10201, NULL, true),
  (pg_temp.uid('al102_a1'),        'docente',          10201, '10200000-0000-4000-8000-00000000c00a', true),
  (pg_temp.uid('al102_b1'),        'docente',          10202, NULL, true);
-- al102_none has no role at all.
INSERT INTO public.assignment_audit_log (action, entity_type, entity_id, content_type, content_id, source, source_learning_path_id, performed_by, metadata) VALUES
  ('assigned',   'user',                pg_temp.uid('al102_a1'),   'course',        '10200000-0000-4000-8000-000000000c01', 'learning_path', '10200000-0000-4000-8000-000000000001', pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"a1_course"}'),
  ('assigned',   'user',                pg_temp.uid('al102_a1'),   'learning_path', '10200000-0000-4000-8000-000000000001', 'direct',        NULL,                                   pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"a1_lp"}'),
  ('assigned',   'user',                pg_temp.uid('al102_b1'),   'course',        '10200000-0000-4000-8000-000000000c01', 'direct',        NULL,                                   pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"b1_course"}'),
  ('unassigned', 'user',                pg_temp.uid('al102_b1'),   'learning_path', '10200000-0000-4000-8000-000000000001', 'direct',        NULL,                                   pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"b1_lp"}'),
  ('assigned',   'community_workspace', '10200000-0000-4000-8000-00000000bb0a', 'learning_path', '10200000-0000-4000-8000-000000000001', 'direct', NULL,                            pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"ws_lp"}'),
  ('assigned',   'user',                pg_temp.uid('al102_none'), 'course',        '10200000-0000-4000-8000-000000000c01', 'direct',        NULL,                                   pg_temp.uid('al102_admin'), '{"pgtap":"102","lbl":"none_course"}');

-- ----------------------------------------------------------------------------
-- Catalog
-- ----------------------------------------------------------------------------
SELECT is((SELECT permissive || '/' || cmd || '/' || array_to_string(roles, ',') FROM pg_policies
            WHERE schemaname = 'public' AND tablename = 'assignment_audit_log' AND policyname = 'assignment_audit_log_director_school_scope'),
          'RESTRICTIVE/SELECT/authenticated', 'catalog: a RESTRICTIVE SELECT policy for authenticated scopes the audit log');
SELECT is((SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public' AND tablename = 'assignment_audit_log'), 3,
          'catalog: baseline view policy + forced-password-change guard + the new scope policy (nothing removed)');
SELECT ok((SELECT relrowsecurity FROM pg_class WHERE oid = 'public.assignment_audit_log'::regclass), 'catalog: RLS still enabled');

-- ----------------------------------------------------------------------------
-- Reads
-- ----------------------------------------------------------------------------
SELECT tests.authenticate_as('al102_dirA');
SELECT is(pg_temp.seen(), 'a1_course,a1_lp', 'director A: exactly the course and learning-path rows of the school-A person');
SELECT is((SELECT count(*)::int FROM public.assignment_audit_log WHERE entity_id = pg_temp.uid('al102_b1')), 0, 'director A: 0 rows about the school-B person');
SELECT is((SELECT count(*)::int FROM public.assignment_audit_log WHERE entity_type = 'community_workspace'), 0, 'director A: 0 workspace (group) rows, even for a school-A workspace');
SELECT is((SELECT count(*)::int FROM public.assignment_audit_log WHERE entity_id = pg_temp.uid('al102_none')), 0, 'director A: 0 rows about a person with no school');
SELECT throws_ok($$INSERT INTO public.assignment_audit_log (action, entity_type, entity_id, content_type, content_id, source, performed_by) VALUES ('assigned', 'user', auth.uid(), 'course', gen_random_uuid(), 'direct', auth.uid())$$,
                 '42501', NULL, 'director A: cannot write audit rows');
RESET ROLE;
SELECT tests.authenticate_as('al102_admin');
SELECT is(pg_temp.seen(), 'a1_course,a1_lp,b1_course,b1_lp,none_course,ws_lp', 'admin: every row (unchanged)');
RESET ROLE;
SELECT tests.authenticate_as('al102_cons');
SELECT is(pg_temp.seen(), 'a1_course,a1_lp,b1_course,b1_lp,none_course,ws_lp', 'active consultor: every row (unchanged)');
RESET ROLE;
SELECT tests.authenticate_as('al102_dirA_cons');
SELECT is(pg_temp.seen(), 'a1_course,a1_lp,b1_course,b1_lp,none_course,ws_lp', 'director who is also an active consultor: every row (consultor rule)');
RESET ROLE;
SELECT tests.authenticate_as('al102_cons_off');
SELECT is(pg_temp.seen(), '', 'inactive consultor: nothing (unchanged)');
RESET ROLE;
SELECT tests.authenticate_as('al102_dirNull');
SELECT is(pg_temp.seen(), '', 'director without a school: nothing');
RESET ROLE;
SELECT tests.authenticate_as('al102_doc');
SELECT is(pg_temp.seen(), '', 'docente: nothing (unchanged: the baseline policy admits no docente)');
RESET ROLE;
SELECT tests.authenticate_as('al102_a1');
SELECT is(pg_temp.seen(), '', 'a learner cannot read even rows about themselves (unchanged)');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT is(pg_temp.seen(), '', 'anon: nothing');
RESET ROLE;
SELECT pg_temp.set_service();
SELECT is(pg_temp.seen(), 'a1_course,a1_lp,b1_course,b1_lp,none_course,ws_lp', 'service_role (backend, API): every row');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- Forced password change
-- ----------------------------------------------------------------------------
SELECT set_config('request.jwt.claims', '', true);
UPDATE public.profiles SET must_change_password = true WHERE id IN (pg_temp.uid('al102_dirA'), pg_temp.uid('al102_cons'));
SELECT tests.authenticate_as('al102_dirA');
SELECT is(pg_temp.seen(), '', 'flagged director A: nothing');
RESET ROLE;
SELECT tests.authenticate_as('al102_cons');
SELECT is(pg_temp.seen(), '', 'flagged consultor: nothing');
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
