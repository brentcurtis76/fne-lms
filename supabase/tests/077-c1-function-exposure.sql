-- =============================================================================
-- 077-c1-function-exposure.sql — RLS closure C1 (2026-09-07): migration
-- 20260907120400_c1_function_exposure.sql — the 21 remaining D-RLS function
-- dispositions, tested as catalog facts, direct oracle probes, nested calls
-- and REAL policy operations (not only helper calls).
--
--   1. catalog: for each of the 21 signatures — SECURITY DEFINER, pinned
--      search_path, PUBLIC holds no EXECUTE, the expected anon / authenticated /
--      service_role grants (policy predicates keep anon+authenticated so the
--      public-targeted policies still evaluate; backend-only endpoints keep
--      service_role only; get_school_user_counts keeps authenticated)
--   2. oracle probes: self / other user / NULL / anon / literal admin /
--      backend for every actor-bound predicate — the caller-supplied id is
--      honoured only for self, admin or backend; the answer for a foreign id
--      is the safe negative, never an error inside a policy
--   3. backend-only endpoints: authenticated and anon cannot execute; the
--      backend still can, including the nested is_dev_user call chain and the
--      repaired get_available_assignment_templates ORDER BY
--   4. get_school_user_counts: literal admin and backend answer; a non-admin
--      authenticated caller gets 42501; anon cannot execute
--   5. policy operations through every affected policy family: events,
--      community_posts, community_meetings, community_documents, courses,
--      transformation_assessments, group_assignment_members, dev_audit_log /
--      dev_users, course_enrollments, user_progress — for the entitled user,
--      a foreign user, the preserved staff roles and anon
--
-- Synthetic/local state only. Rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap;
SELECT plan(280);

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
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(stmt text) RETURNS int
LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE stmt;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- ----------------------------------------------------------------------------
-- 1. Catalog
-- ----------------------------------------------------------------------------
CREATE TEMP TABLE c1_fns (sig text, anon_ok boolean, auth_ok boolean, svc_ok boolean) ON COMMIT DROP;
INSERT INTO c1_fns VALUES
  -- actor-bound policy predicates (12)
  ('public.can_access_workspace(uuid, uuid)',            true,  true,  true),
  ('public.can_edit_meeting(uuid, uuid)',                true,  true,  true),
  ('public.fn_is_events_manager(uuid)',                  true,  true,  true),
  ('public.get_user_workspace_role(uuid, uuid)',         true,  true,  true),
  ('public.has_feedback_permission(uuid)',               true,  true,  true),
  ('public.is_admin_or_consultor(uuid)',                 true,  true,  true),
  ('public.is_assessment_collaborator(uuid, uuid)',      true,  true,  true),
  ('public.is_dev_user(uuid)',                           true,  true,  true),
  ('public.is_global_admin(uuid)',                       true,  true,  true),
  ('public.supervisor_can_access_user(uuid, uuid)',      true,  true,  true),
  ('public.user_is_in_group(uuid, uuid)',                true,  true,  true),
  ('public.user_school_ids(uuid)',                       true,  true,  true),
  -- backend-only (7)
  ('public.get_available_assignment_templates(uuid)',    false, false, true),
  ('public.get_baseline_permissions(text)',              false, false, true),
  ('public.get_effective_permissions(text, uuid)',       false, false, true),
  ('public.get_effective_user_role(uuid)',               false, false, true),
  ('public.get_user_admin_status(uuid)',                 false, false, true),
  ('public.get_user_messaging_permissions(uuid, uuid)',  false, false, true),
  ('public.is_community_member(uuid, uuid)',             false, false, true),
  -- service-only superadmin check (1)
  ('public.auth_is_superadmin(uuid)',                    false, false, true),
  -- admin-gated browser endpoint (1)
  ('public.get_school_user_counts()',                    false, true,  true);

SELECT is((SELECT count(*)::int FROM c1_fns), 21, 'C1 covers exactly the 21 remaining dispositions');

SELECT ok((SELECT prosecdef FROM pg_proc WHERE oid = f.sig::regprocedure), format('%s is SECURITY DEFINER', f.sig))
FROM c1_fns f ORDER BY f.sig;
SELECT ok(EXISTS (SELECT 1 FROM unnest((SELECT proconfig FROM pg_proc WHERE oid = f.sig::regprocedure)) c WHERE c = 'search_path=public, pg_temp'),
  format('%s search_path pinned to public, pg_temp', f.sig))
FROM c1_fns f ORDER BY f.sig;
SELECT ok(NOT EXISTS (SELECT 1 FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid = f.sig::regprocedure)) a WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE'),
  format('PUBLIC holds no EXECUTE on %s', f.sig))
FROM c1_fns f ORDER BY f.sig;
SELECT is(has_function_privilege('anon', f.sig, 'EXECUTE'), f.anon_ok, format('anon EXECUTE on %s is %s', f.sig, f.anon_ok))
FROM c1_fns f ORDER BY f.sig;
SELECT is(has_function_privilege('authenticated', f.sig, 'EXECUTE'), f.auth_ok, format('authenticated EXECUTE on %s is %s', f.sig, f.auth_ok))
FROM c1_fns f ORDER BY f.sig;
SELECT is(has_function_privilege('service_role', f.sig, 'EXECUTE'), f.svc_ok, format('service_role EXECUTE on %s is %s', f.sig, f.svc_ok))
FROM c1_fns f ORDER BY f.sig;

-- the shared helper is internal
SELECT ok(NOT has_function_privilege('authenticated', 'public.auth_actor_bound(uuid)', 'EXECUTE'), 'auth_actor_bound: authenticated cannot execute');
SELECT ok(NOT has_function_privilege('anon', 'public.auth_actor_bound(uuid)', 'EXECUTE'), 'auth_actor_bound: anon cannot execute');
SELECT ok(NOT has_function_privilege('service_role', 'public.auth_actor_bound(uuid)', 'EXECUTE'), 'auth_actor_bound: service_role cannot execute');
-- has_global_workspace_access (already fixed in 120200) is unchanged
SELECT ok(NOT has_function_privilege('anon', 'public.has_global_workspace_access(uuid)', 'EXECUTE'), 'has_global_workspace_access: anon still cannot execute (120200 preserved)');
-- policy dependency inventory: every policy that references an actor-bound
-- predicate passes auth.uid() as its user argument
SELECT is((SELECT count(*)::int FROM pg_policies p
            WHERE (coalesce(p.qual,'') || coalesce(p.with_check,''))
                  ~ '(is_global_admin|is_admin_or_consultor|is_dev_user|fn_is_events_manager|has_feedback_permission|user_school_ids)\((?!auth\.uid\(\))'),
          0, 'every single-argument predicate policy passes auth.uid()');
SELECT is((SELECT count(*)::int FROM pg_policies p
            WHERE (coalesce(p.qual,'') || coalesce(p.with_check,''))
                  ~ '(can_access_workspace|can_edit_meeting|get_user_workspace_role)\((?!auth\.uid\(\))'),
          0, 'every user-first two-argument predicate policy passes auth.uid() first');
SELECT is((SELECT count(*)::int FROM pg_policies p
            WHERE (coalesce(p.qual,'') || coalesce(p.with_check,''))
                  ~ '(user_is_in_group|is_assessment_collaborator)\([^,]*,(?!\s*auth\.uid\(\))'),
          0, 'every object-first two-argument predicate policy passes auth.uid() second');

-- ----------------------------------------------------------------------------
-- Fixtures (as postgres)
-- ----------------------------------------------------------------------------
SELECT tests.create_supabase_user('c1_admin');
SELECT tests.create_supabase_user('c1_user');      -- docente, community C1 (school 9741)
SELECT tests.create_supabase_user('c1_other');     -- docente, community C2 (school 9741)
SELECT tests.create_supabase_user('c1_consultor'); -- consultor, school 9741
SELECT tests.create_supabase_user('c1_cm');        -- community_manager
SELECT tests.create_supabase_user('c1_super');     -- superadmins row + docente
SELECT tests.create_supabase_user('c1_dev');       -- dev_users row + docente
SELECT tests.create_supabase_user('c1_devonly');   -- dev_users row, no role
SELECT tests.create_supabase_user('c1_leader');    -- lider_comunidad, community C1
SELECT tests.create_supabase_user('c1_sup');       -- supervisor_de_red, red R1
SELECT tests.create_supabase_user('c1_target');    -- docente school 9741 (in R1)
SELECT tests.create_supabase_user('c1_outsider');  -- docente school 9742 (not in R1)

INSERT INTO public.profiles (id, email, name, approval_status)
SELECT pg_temp.uid(k), k || '@test.local', k, 'approved'
  FROM unnest(ARRAY['c1_admin','c1_user','c1_other','c1_consultor','c1_cm','c1_super','c1_dev','c1_devonly','c1_leader','c1_sup','c1_target','c1_outsider']) k
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.schools (id, name) VALUES (9741, 'C1 school (pgTAP 077)'), (9742, 'C1 other school (pgTAP 077)') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.growth_communities (id, school_id, name) VALUES
  ('77000000-0000-4000-8000-00000000c001', 9741, 'C1 community'),
  ('77000000-0000-4000-8000-00000000c002', 9741, 'C1 other community');
INSERT INTO public.community_workspaces (id, community_id, name) VALUES
  ('77000000-0000-4000-8000-00000000bb01', '77000000-0000-4000-8000-00000000c001', 'C1 workspace'),
  ('77000000-0000-4000-8000-00000000bb02', '77000000-0000-4000-8000-00000000c002', 'C1 other workspace');
INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by) VALUES
  ('77000000-0000-4000-8000-00000000ee01', 'Red sintetica pgTAP 077', 'Red sintetica para pgTAP. No es una red real.', pg_temp.uid('c1_admin'));
INSERT INTO public.red_escuelas (red_id, school_id, agregado_por) VALUES
  ('77000000-0000-4000-8000-00000000ee01', 9741, pg_temp.uid('c1_admin'));

INSERT INTO public.user_roles (user_id, role_type, school_id, community_id, red_id, is_active) VALUES
  (pg_temp.uid('c1_admin'),     'admin',             NULL, NULL, NULL, true),
  (pg_temp.uid('c1_user'),      'docente',           9741, '77000000-0000-4000-8000-00000000c001', NULL, true),
  (pg_temp.uid('c1_other'),     'docente',           9741, '77000000-0000-4000-8000-00000000c002', NULL, true),
  (pg_temp.uid('c1_consultor'), 'consultor',         9741, NULL, NULL, true),
  (pg_temp.uid('c1_cm'),        'community_manager', 9741, NULL, NULL, true),
  (pg_temp.uid('c1_super'),     'docente',           9741, NULL, NULL, true),
  (pg_temp.uid('c1_dev'),       'docente',           9741, NULL, NULL, true),
  (pg_temp.uid('c1_leader'),    'lider_comunidad',   9741, '77000000-0000-4000-8000-00000000c001', NULL, true),
  (pg_temp.uid('c1_sup'),       'supervisor_de_red', NULL, NULL, '77000000-0000-4000-8000-00000000ee01', true),
  (pg_temp.uid('c1_target'),    'docente',           9741, NULL, NULL, true),
  (pg_temp.uid('c1_outsider'),  'docente',           9742, NULL, NULL, true);

INSERT INTO public.superadmins (user_id, reason, is_active) VALUES (pg_temp.uid('c1_super'), 'pgTAP 077', true);
INSERT INTO public.dev_users (user_id, is_active) VALUES (pg_temp.uid('c1_dev'), true), (pg_temp.uid('c1_devonly'), true);
INSERT INTO public.dev_audit_log (dev_user_id, action) VALUES (pg_temp.uid('c1_dev'), 'pgTAP 077 probe');
INSERT INTO public.feedback_permissions (user_id, granted_by, is_active) VALUES (pg_temp.uid('c1_user'), pg_temp.uid('c1_admin'), true);

INSERT INTO public.events (id, title, location, date_start, is_published, created_by) VALUES
  ('77000000-0000-4000-8000-0000000000e1', 'C1 unpublished event', 'nowhere', current_date, false, pg_temp.uid('c1_admin')),
  ('77000000-0000-4000-8000-0000000000e2', 'C1 published event',   'nowhere', current_date, true,  pg_temp.uid('c1_admin'));
INSERT INTO public.community_posts (id, workspace_id, author_id, type, content) VALUES
  ('77000000-0000-4000-8000-0000000000a9', '77000000-0000-4000-8000-00000000bb01', pg_temp.uid('c1_user'), 'text', '{"text":"hola"}'::jsonb);
INSERT INTO public.community_meetings (id, workspace_id, title, meeting_date, created_by) VALUES
  ('77000000-0000-4000-8000-0000000000d1', '77000000-0000-4000-8000-00000000bb01', 'C1 meeting', now() + interval '1 day', pg_temp.uid('c1_admin'));
INSERT INTO public.community_documents (id, workspace_id, title, file_name, file_size, mime_type, storage_path, uploaded_by) VALUES
  ('77000000-0000-4000-8000-0000000000f1', '77000000-0000-4000-8000-00000000bb01', 'C1 doc', 'c1.txt', 1, 'text/plain', 'pgtap/077/c1.txt', pg_temp.uid('c1_user'));
INSERT INTO public.instructors (id, full_name) VALUES ('77000000-0000-4000-8000-00000000f001', 'C1 instructor');
INSERT INTO public.courses (id, title, description, instructor_id) VALUES
  ('77000000-0000-4000-8000-000000000c01', 'C1 course', 'pgTAP 077', '77000000-0000-4000-8000-00000000f001');
INSERT INTO public.modules (id, course_id, title, order_number) VALUES
  ('77000000-0000-4000-8000-00000000e001', '77000000-0000-4000-8000-000000000c01', 'C1 module', 1);
INSERT INTO public.lessons (id, module_id, course_id, title, order_number) VALUES
  ('77000000-0000-4000-8000-00000000ee01', '77000000-0000-4000-8000-00000000e001', '77000000-0000-4000-8000-000000000c01', 'C1 lesson', 1);
INSERT INTO public.course_enrollments (user_id, course_id, enrollment_type, status, access_origin) VALUES
  (pg_temp.uid('c1_user'), '77000000-0000-4000-8000-000000000c01', 'assigned', 'active', 'independent');
INSERT INTO public.user_progress (user_id, lesson_id) VALUES (pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000ee01');
INSERT INTO public.transformation_assessments (id, growth_community_id, area, school_id, created_by) VALUES
  ('77000000-0000-4000-8000-0000000000a1', '77000000-0000-4000-8000-00000000c001', 'aprendizaje', 9741, pg_temp.uid('c1_consultor'));
INSERT INTO public.transformation_assessment_collaborators (assessment_id, user_id, can_edit) VALUES
  ('77000000-0000-4000-8000-0000000000a1', pg_temp.uid('c1_user'), true);
INSERT INTO public.group_assignment_groups (id, assignment_id, community_id, name, school_id) VALUES
  ('77000000-0000-4000-8000-0000000000b1', 'c1-assignment', '77000000-0000-4000-8000-00000000c001', 'C1 group', 9741);
INSERT INTO public.group_assignment_members (group_id, assignment_id, user_id) VALUES
  ('77000000-0000-4000-8000-0000000000b1', 'c1-assignment', pg_temp.uid('c1_user'));

-- ----------------------------------------------------------------------------
-- 2. Oracle probes — ordinary user (c1_user)
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT ok(NOT public.is_global_admin(pg_temp.uid('c1_admin')), 'user: is_global_admin(the admin) answers FALSE (no disclosure) although that user IS an admin');
SELECT ok(NOT public.is_global_admin(auth.uid()), 'user: is_global_admin(self) FALSE (truth)');
SELECT ok(NOT public.is_admin_or_consultor(pg_temp.uid('c1_consultor')), 'user: is_admin_or_consultor(the consultor) FALSE (no disclosure)');
SELECT ok(NOT public.is_admin_or_consultor(auth.uid()), 'user: is_admin_or_consultor(self) FALSE (truth)');
SELECT is(public.user_school_ids(pg_temp.uid('c1_other')), '{}'::integer[], 'user: user_school_ids(other) is the empty array');
SELECT is(public.user_school_ids(auth.uid()), '{9741}'::integer[], 'user: user_school_ids(self) answers');
SELECT ok(NOT public.fn_is_events_manager(pg_temp.uid('c1_cm')), 'user: fn_is_events_manager(the community manager) FALSE (no disclosure)');
SELECT ok(NOT public.can_edit_meeting(pg_temp.uid('c1_leader'), '77000000-0000-4000-8000-0000000000d1'), 'user: can_edit_meeting(the leader, meeting) FALSE (no disclosure)');
SELECT ok(NOT public.can_edit_meeting(auth.uid(), '77000000-0000-4000-8000-0000000000d1'), 'user: can_edit_meeting(self, meeting) FALSE (truth: not an editor)');
SELECT ok(NOT public.can_access_workspace(pg_temp.uid('c1_other'), '77000000-0000-4000-8000-00000000bb02'), 'user: can_access_workspace(other, their workspace) FALSE (no disclosure)');
SELECT ok(public.can_access_workspace(auth.uid(), '77000000-0000-4000-8000-00000000bb01'), 'user: can_access_workspace(self, own workspace) TRUE');
SELECT ok(NOT public.can_access_workspace(auth.uid(), '77000000-0000-4000-8000-00000000bb02'), 'user: can_access_workspace(self, foreign workspace) FALSE');
SELECT is(public.get_user_workspace_role(pg_temp.uid('c1_other'), '77000000-0000-4000-8000-00000000bb02'), NULL, 'user: get_user_workspace_role(other, their workspace) NULL (no disclosure)');
SELECT is(public.get_user_workspace_role(auth.uid(), '77000000-0000-4000-8000-00000000bb01'), 'docente', 'user: get_user_workspace_role(self, own workspace) answers');
SELECT ok(public.has_feedback_permission(auth.uid()), 'user: has_feedback_permission(self) TRUE (granted)');
SELECT ok(public.is_assessment_collaborator('77000000-0000-4000-8000-0000000000a1', auth.uid()), 'user: is_assessment_collaborator(assessment, self) TRUE');
SELECT ok(NOT public.is_dev_user(pg_temp.uid('c1_dev')), 'user: is_dev_user(the dev) FALSE (no disclosure)');
SELECT ok(public.user_is_in_group('77000000-0000-4000-8000-0000000000b1', auth.uid()), 'user: user_is_in_group(group, self) TRUE');
SELECT ok(NOT public.supervisor_can_access_user(pg_temp.uid('c1_sup'), pg_temp.uid('c1_target')), 'user: supervisor_can_access_user(the supervisor, target) FALSE — the supervisor argument cannot be spoofed');
SELECT ok(NOT public.supervisor_can_access_user(auth.uid(), pg_temp.uid('c1_target')), 'user: supervisor_can_access_user(self, target) FALSE (not a supervisor)');
-- NULL inputs
SELECT ok(NOT public.is_global_admin(NULL), 'NULL: is_global_admin FALSE');
SELECT ok(NOT public.is_admin_or_consultor(NULL), 'NULL: is_admin_or_consultor FALSE');
SELECT is(public.user_school_ids(NULL), '{}'::integer[], 'NULL: user_school_ids empty');
SELECT ok(NOT public.can_access_workspace(NULL, '77000000-0000-4000-8000-00000000bb01'), 'NULL: can_access_workspace FALSE');
SELECT ok(NOT public.can_access_workspace(auth.uid(), NULL), 'NULL workspace: can_access_workspace FALSE');
SELECT ok(NOT public.can_edit_meeting(NULL, '77000000-0000-4000-8000-0000000000d1'), 'NULL: can_edit_meeting FALSE');
SELECT ok(NOT public.fn_is_events_manager(NULL), 'NULL: fn_is_events_manager FALSE');
SELECT is(public.get_user_workspace_role(NULL, '77000000-0000-4000-8000-00000000bb01'), NULL, 'NULL: get_user_workspace_role NULL');
SELECT ok(NOT public.has_feedback_permission(NULL), 'NULL: has_feedback_permission FALSE');
SELECT ok(NOT public.is_assessment_collaborator('77000000-0000-4000-8000-0000000000a1', NULL), 'NULL: is_assessment_collaborator FALSE');
SELECT ok(NOT public.is_dev_user(NULL), 'NULL: is_dev_user FALSE');
SELECT ok(NOT public.user_is_in_group('77000000-0000-4000-8000-0000000000b1', NULL), 'NULL: user_is_in_group FALSE');
SELECT ok(NOT public.supervisor_can_access_user(NULL, pg_temp.uid('c1_target')), 'NULL supervisor: supervisor_can_access_user FALSE');
SELECT ok(NOT public.supervisor_can_access_user(pg_temp.uid('c1_sup'), NULL), 'NULL target: supervisor_can_access_user FALSE');

-- the other side of each pair: the entitled user answers TRUE about themselves
RESET ROLE;
SELECT tests.authenticate_as('c1_cm');
SELECT ok(public.fn_is_events_manager(auth.uid()), 'community manager: fn_is_events_manager(self) TRUE (role preserved)');
RESET ROLE;
SELECT tests.authenticate_as('c1_super');
SELECT ok(public.fn_is_events_manager(auth.uid()), 'superadmin: fn_is_events_manager(self) TRUE (superadmin path preserved)');
RESET ROLE;
SELECT tests.authenticate_as('c1_leader');
SELECT ok(public.can_edit_meeting(auth.uid(), '77000000-0000-4000-8000-0000000000d1'), 'lider_comunidad: can_edit_meeting(self, community meeting) TRUE');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT ok(public.can_edit_meeting(auth.uid(), '77000000-0000-4000-8000-0000000000d1'), 'consultor: can_edit_meeting(self, meeting) TRUE (global consultor short-circuit preserved, recorded)');
SELECT ok(public.is_admin_or_consultor(auth.uid()), 'consultor: is_admin_or_consultor(self) TRUE');
SELECT ok(public.can_access_workspace(auth.uid(), '77000000-0000-4000-8000-00000000bb01'), 'consultor: can_access_workspace(self, school workspace) TRUE (school consultor path preserved)');
SELECT is(public.get_user_workspace_role(auth.uid(), '77000000-0000-4000-8000-00000000bb01'), 'consultor', 'consultor: get_user_workspace_role(self, school workspace) = consultor');
SELECT ok(NOT public.is_global_admin(pg_temp.uid('c1_admin')), 'consultor: is_global_admin(the admin) FALSE (a consultor is not a literal admin: no disclosure)');
RESET ROLE;
SELECT tests.authenticate_as('c1_dev');
SELECT ok(public.is_dev_user(auth.uid()), 'dev: is_dev_user(self) TRUE');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT ok(NOT public.has_feedback_permission(pg_temp.uid('c1_user')), 'other: has_feedback_permission(the granted user) FALSE (no disclosure)');
SELECT ok(NOT public.is_assessment_collaborator('77000000-0000-4000-8000-0000000000a1', pg_temp.uid('c1_user')), 'other: is_assessment_collaborator(assessment, the collaborator) FALSE (no disclosure)');
SELECT ok(NOT public.user_is_in_group('77000000-0000-4000-8000-0000000000b1', pg_temp.uid('c1_user')), 'other: user_is_in_group(group, the member) FALSE (no disclosure)');
RESET ROLE;
SELECT tests.authenticate_as('c1_sup');
SELECT ok(public.supervisor_can_access_user(auth.uid(), pg_temp.uid('c1_target')), 'supervisor: supervisor_can_access_user(self, user in network) TRUE');
SELECT ok(NOT public.supervisor_can_access_user(auth.uid(), pg_temp.uid('c1_outsider')), 'supervisor: supervisor_can_access_user(self, user outside network) FALSE (network check preserved)');

-- literal admin may ask about anyone (cross-user reporting exception)
RESET ROLE;
SELECT tests.authenticate_as('c1_admin');
SELECT ok(public.is_global_admin(auth.uid()), 'admin: is_global_admin(self) TRUE');
SELECT ok(NOT public.is_global_admin(pg_temp.uid('c1_user')), 'admin: is_global_admin(a docente) FALSE (truth)');
SELECT ok(public.is_admin_or_consultor(pg_temp.uid('c1_consultor')), 'admin: is_admin_or_consultor(the consultor) TRUE (admin may ask)');
SELECT ok(public.fn_is_events_manager(pg_temp.uid('c1_cm')), 'admin: fn_is_events_manager(the community manager) TRUE (admin may ask)');
SELECT ok(public.user_is_in_group('77000000-0000-4000-8000-0000000000b1', pg_temp.uid('c1_user')), 'admin: user_is_in_group(group, the member) TRUE (admin may ask)');
SELECT is(public.user_school_ids(pg_temp.uid('c1_other')), '{9741}'::integer[], 'admin: user_school_ids(other) answers');
SELECT ok(public.is_dev_user(pg_temp.uid('c1_dev')), 'admin: is_dev_user(the dev) TRUE (admin may ask)');
SELECT ok(public.supervisor_can_access_user(pg_temp.uid('c1_sup'), pg_temp.uid('c1_target')), 'admin: supervisor_can_access_user(the supervisor, target) TRUE (admin may ask)');

-- anon: the public-targeted policies can still evaluate — safe negatives, no error
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT ok(NOT public.is_admin_or_consultor(pg_temp.uid('c1_admin')), 'anon: is_admin_or_consultor(the admin) FALSE without raising');
SELECT ok(NOT public.is_global_admin(pg_temp.uid('c1_admin')), 'anon: is_global_admin(the admin) FALSE without raising');
SELECT is(public.user_school_ids(pg_temp.uid('c1_user')), '{}'::integer[], 'anon: user_school_ids empty without raising');
SELECT ok(NOT public.can_access_workspace(pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000bb01'), 'anon: can_access_workspace FALSE without raising');
SELECT ok(NOT public.user_is_in_group('77000000-0000-4000-8000-0000000000b1', pg_temp.uid('c1_user')), 'anon: user_is_in_group FALSE without raising');
SELECT is(public.get_user_workspace_role(pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000bb01'), NULL, 'anon: get_user_workspace_role NULL without raising');
SELECT ok(NOT public.can_edit_meeting(pg_temp.uid('c1_leader'), '77000000-0000-4000-8000-0000000000d1'), 'anon: can_edit_meeting FALSE without raising');
SELECT ok(NOT public.fn_is_events_manager(pg_temp.uid('c1_cm')), 'anon: fn_is_events_manager FALSE without raising');
SELECT ok(NOT public.has_feedback_permission(pg_temp.uid('c1_user')), 'anon: has_feedback_permission FALSE without raising');
SELECT ok(NOT public.is_assessment_collaborator('77000000-0000-4000-8000-0000000000a1', pg_temp.uid('c1_user')), 'anon: is_assessment_collaborator FALSE without raising');
SELECT ok(NOT public.is_dev_user(pg_temp.uid('c1_dev')), 'anon: is_dev_user FALSE without raising');
SELECT ok(NOT public.supervisor_can_access_user(pg_temp.uid('c1_sup'), pg_temp.uid('c1_target')), 'anon: supervisor_can_access_user FALSE without raising');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 3. Backend-only endpoints and nested calls
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT throws_ok($$SELECT * FROM public.get_available_assignment_templates('77000000-0000-4000-8000-000000000c01')$$, '42501', NULL, 'authenticated: get_available_assignment_templates not executable');
SELECT throws_ok($$SELECT * FROM public.get_baseline_permissions('docente')$$, '42501', NULL, 'authenticated: get_baseline_permissions not executable');
SELECT throws_ok($$SELECT * FROM public.get_effective_permissions('docente', NULL)$$, '42501', NULL, 'authenticated: get_effective_permissions not executable');
SELECT throws_ok($$SELECT public.get_effective_user_role(auth.uid())$$, '42501', NULL, 'authenticated: get_effective_user_role not executable');
SELECT throws_ok($$SELECT public.get_user_admin_status(auth.uid())$$, '42501', NULL, 'authenticated: get_user_admin_status not executable');
SELECT throws_ok($$SELECT public.get_user_messaging_permissions(auth.uid(), '77000000-0000-4000-8000-00000000bb01')$$, '42501', NULL, 'authenticated: get_user_messaging_permissions not executable');
SELECT throws_ok($$SELECT public.is_community_member(auth.uid(), '77000000-0000-4000-8000-00000000c001')$$, '42501', NULL, 'authenticated: is_community_member not executable');
SELECT throws_ok($$SELECT public.auth_is_superadmin(auth.uid())$$, '42501', NULL, 'authenticated: auth_is_superadmin not executable (service-side callers only)');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT throws_ok($$SELECT public.get_effective_user_role('77000000-0000-4000-8000-00000000c001')$$, '42501', NULL, 'anon: get_effective_user_role not executable');
SELECT throws_ok($$SELECT public.auth_is_superadmin('77000000-0000-4000-8000-00000000c001')$$, '42501', NULL, 'anon: auth_is_superadmin not executable');
SELECT throws_ok($$SELECT * FROM public.get_school_user_counts()$$, '42501', NULL, 'anon: get_school_user_counts not executable');
RESET ROLE;

RESET ROLE;
SELECT pg_temp.set_service();
SELECT ok(public.auth_is_backend_caller(), 'service_role: is a backend caller');
SELECT ok(public.auth_is_superadmin(pg_temp.uid('c1_super')), 'backend: auth_is_superadmin(the superadmin) TRUE (the admin routes keep working)');
SELECT ok(NOT public.auth_is_superadmin(pg_temp.uid('c1_user')), 'backend: auth_is_superadmin(a docente) FALSE');
SELECT is(public.get_effective_user_role(pg_temp.uid('c1_dev'))::text, 'docente', 'backend: get_effective_user_role(dev with a role, no impersonation) = docente — nested is_dev_user / get_active_dev_impersonation reachable');
SELECT is(public.get_effective_user_role(pg_temp.uid('c1_devonly'))::text, 'admin', 'backend: get_effective_user_role(dev without any role) = admin (pre-existing semantics preserved)');
SELECT is(public.get_effective_user_role(pg_temp.uid('c1_consultor'))::text, 'consultor', 'backend: get_effective_user_role(consultor) = consultor');
SELECT ok(public.get_user_admin_status(pg_temp.uid('c1_admin')), 'backend: get_user_admin_status(the admin) TRUE');
SELECT ok(NOT public.get_user_admin_status(pg_temp.uid('c1_user')), 'backend: get_user_admin_status(a docente) FALSE');
SELECT is((public.get_user_messaging_permissions(pg_temp.uid('c1_leader'), '77000000-0000-4000-8000-00000000bb01') ->> 'can_pin_threads')::boolean, true, 'backend: get_user_messaging_permissions(leader) can_pin_threads TRUE (semantics preserved)');
SELECT is((public.get_user_messaging_permissions(pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000bb01') ->> 'can_moderate_messages')::boolean, false, 'backend: get_user_messaging_permissions(docente) can_moderate_messages FALSE');
SELECT ok(public.is_community_member(pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000c001'), 'backend: is_community_member(member, community) TRUE');
SELECT ok(NOT public.is_community_member(pg_temp.uid('c1_other'), '77000000-0000-4000-8000-00000000c001'), 'backend: is_community_member(non-member, community) FALSE');
SELECT lives_ok($$SELECT * FROM public.get_baseline_permissions('docente')$$, 'backend: get_baseline_permissions executes');
SELECT lives_ok($$SELECT * FROM public.get_effective_permissions('docente', NULL)$$, 'backend: get_effective_permissions executes');
SELECT lives_ok($$SELECT * FROM public.get_available_assignment_templates('77000000-0000-4000-8000-000000000c01')$$, 'backend: get_available_assignment_templates executes (ORDER BY order_number — the order_index defect is gone)');
SELECT is((SELECT count(*)::int FROM public.get_available_assignment_templates('77000000-0000-4000-8000-000000000c01')), 0, 'backend: get_available_assignment_templates returns the (empty) template set for the course');
SELECT ok(public.is_global_admin(pg_temp.uid('c1_admin')), 'backend: is_global_admin(the admin) TRUE (backend may ask)');
SELECT ok(public.supervisor_can_access_user(pg_temp.uid('c1_sup'), pg_temp.uid('c1_target')), 'backend: supervisor_can_access_user(supervisor, target) TRUE — the user-details route path');
SELECT ok(public.can_access_workspace(pg_temp.uid('c1_user'), '77000000-0000-4000-8000-00000000bb01'), 'backend: can_access_workspace(user, workspace) answers');
SELECT is((SELECT user_count FROM public.get_school_user_counts() WHERE school_id = 9741), 8::bigint, 'backend: get_school_user_counts answers (8 distinct users at school 9741)');
SELECT is((SELECT user_count FROM public.get_school_user_counts() WHERE school_id = 9742), 1::bigint, 'backend: get_school_user_counts answers (1 user at school 9742)');
RESET ROLE;

-- ----------------------------------------------------------------------------
-- 4. get_school_user_counts — admin-gated browser endpoint
-- ----------------------------------------------------------------------------
RESET ROLE;
SELECT tests.authenticate_as('c1_admin');
SELECT is((SELECT user_count FROM public.get_school_user_counts() WHERE school_id = 9741), 8::bigint, 'admin (browser client): get_school_user_counts answers');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT throws_ok($$SELECT * FROM public.get_school_user_counts()$$, '42501', NULL, 'consultor: get_school_user_counts refused (literal admin only)');
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT throws_ok($$SELECT * FROM public.get_school_user_counts()$$, '42501', NULL, 'docente: get_school_user_counts refused (literal admin only)');

-- ----------------------------------------------------------------------------
-- 5. Policy operations
-- ----------------------------------------------------------------------------
-- events (fn_is_events_manager)
RESET ROLE;
SELECT tests.authenticate_as('c1_cm');
SELECT is((SELECT count(*)::int FROM public.events WHERE id IN ('77000000-0000-4000-8000-0000000000e1','77000000-0000-4000-8000-0000000000e2')), 2, 'events: community manager reads published and unpublished (manager policy)');
SELECT is(pg_temp.rows_affected($$UPDATE public.events SET location = 'moved' WHERE id = '77000000-0000-4000-8000-0000000000e1'$$), 1, 'events: community manager updates the unpublished event');
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.events WHERE id IN ('77000000-0000-4000-8000-0000000000e1','77000000-0000-4000-8000-0000000000e2')), 1, 'events: docente reads only the published event');
SELECT is(pg_temp.rows_affected($$UPDATE public.events SET location = 'hacked' WHERE id = '77000000-0000-4000-8000-0000000000e1'$$), 0, 'events: docente updates nothing');
SELECT throws_ok($$INSERT INTO public.events (title, location, date_start) VALUES ('x', 'y', current_date)$$, '42501', NULL, 'events: docente cannot insert');
RESET ROLE;
SELECT tests.authenticate_as('c1_admin');
SELECT is((SELECT count(*)::int FROM public.events WHERE id IN ('77000000-0000-4000-8000-0000000000e1','77000000-0000-4000-8000-0000000000e2')), 2, 'events: admin reads both');

-- community_posts (can_access_workspace, public-targeted)
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.community_posts WHERE id = '77000000-0000-4000-8000-0000000000a9'), 1, 'community_posts: member reads the post of their workspace');
SELECT lives_ok($$INSERT INTO public.community_posts (workspace_id, author_id, type, content) VALUES ('77000000-0000-4000-8000-00000000bb01', auth.uid(), 'text', '{"text":"mine"}')$$, 'community_posts: member inserts their own post');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT is((SELECT count(*)::int FROM public.community_posts WHERE workspace_id = '77000000-0000-4000-8000-00000000bb01'), 0, 'community_posts: non-member reads nothing from the foreign workspace');
SELECT throws_ok($$INSERT INTO public.community_posts (workspace_id, author_id, type, content) VALUES ('77000000-0000-4000-8000-00000000bb01', auth.uid(), 'text', '{"text":"intruder"}')$$, '42501', NULL, 'community_posts: non-member cannot insert into the foreign workspace');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT is((SELECT count(*)::int FROM public.community_posts WHERE id = '77000000-0000-4000-8000-0000000000a9'), 1, 'community_posts: school consultor reads the post (consultor path preserved)');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT is((SELECT count(*)::int FROM public.community_posts WHERE workspace_id = '77000000-0000-4000-8000-00000000bb01'), 0, 'community_posts: anon evaluates the public policy to nothing — no error');
RESET ROLE;

-- community_meetings (can_edit_meeting)
RESET ROLE;
SELECT tests.authenticate_as('c1_leader');
SELECT is(pg_temp.rows_affected($$UPDATE public.community_meetings SET title = 'edited by leader' WHERE id = '77000000-0000-4000-8000-0000000000d1'$$), 1, 'community_meetings: lider_comunidad updates the meeting');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT is(pg_temp.rows_affected($$UPDATE public.community_meetings SET title = 'edited by intruder' WHERE id = '77000000-0000-4000-8000-0000000000d1'$$), 0, 'community_meetings: user of another community updates nothing');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT is(pg_temp.rows_affected($$UPDATE public.community_meetings SET title = 'edited by consultor' WHERE id = '77000000-0000-4000-8000-0000000000d1'$$), 1, 'community_meetings: consultor updates (global short-circuit preserved)');

-- community_documents (get_user_workspace_role)
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.community_documents WHERE id = '77000000-0000-4000-8000-0000000000f1'), 1, 'community_documents: member reads the document of their workspace');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT is((SELECT count(*)::int FROM public.community_documents WHERE id = '77000000-0000-4000-8000-0000000000f1'), 0, 'community_documents: non-member reads nothing');
SELECT throws_ok($$INSERT INTO public.community_documents (workspace_id, title, file_name, file_size, mime_type, storage_path, uploaded_by) VALUES ('77000000-0000-4000-8000-00000000bb01', 'x', 'x', 1, 'text/plain', 'x', auth.uid())$$, '42501', NULL, 'community_documents: non-member cannot upload into the foreign workspace');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT is((SELECT count(*)::int FROM public.community_documents WHERE id = '77000000-0000-4000-8000-0000000000f1'), 1, 'community_documents: school consultor reads (consultor role path preserved)');

-- courses (is_admin_or_consultor, public-targeted)
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '77000000-0000-4000-8000-000000000c01'), 1, 'courses: consultor reads the course (staff policy)');
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '77000000-0000-4000-8000-000000000c01'), 1, 'courses: enrolled docente reads the course');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT is((SELECT count(*)::int FROM public.courses WHERE id = '77000000-0000-4000-8000-000000000c01'), 0, 'courses: unenrolled docente reads nothing');

-- transformation_assessments (user_school_ids, is_assessment_collaborator, is_admin_or_consultor)
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '77000000-0000-4000-8000-0000000000a1'), 1, 'transformation_assessments: school member reads the school assessment');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET area = 'evaluacion' WHERE id = '77000000-0000-4000-8000-0000000000a1'$$), 1, 'transformation_assessments: collaborator updates (is_assessment_collaborator)');
RESET ROLE;
SELECT tests.authenticate_as('c1_outsider');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '77000000-0000-4000-8000-0000000000a1'), 0, 'transformation_assessments: user of another school reads nothing');
SELECT is(pg_temp.rows_affected($$UPDATE public.transformation_assessments SET area = 'personalizacion' WHERE id = '77000000-0000-4000-8000-0000000000a1'$$), 0, 'transformation_assessments: user of another school updates nothing');
SELECT throws_ok($$INSERT INTO public.transformation_assessments (growth_community_id, area, school_id, created_by) VALUES ('77000000-0000-4000-8000-00000000c001', 'aprendizaje', 9741, auth.uid())$$, '42501', NULL, 'transformation_assessments: user of another school cannot insert for school 9741');
RESET ROLE;
SELECT tests.authenticate_as('c1_consultor');
SELECT is((SELECT count(*)::int FROM public.transformation_assessments WHERE id = '77000000-0000-4000-8000-0000000000a1'), 1, 'transformation_assessments: consultor reads (is_admin_or_consultor)');
SELECT is((SELECT count(*)::int FROM public.transformation_assessment_collaborators WHERE assessment_id = '77000000-0000-4000-8000-0000000000a1'), 1, 'transformation_assessment_collaborators: consultor reads the collaborator row');

-- group_assignment_members (user_is_in_group, public-targeted)
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '77000000-0000-4000-8000-0000000000b1'), 1, 'group_assignment_members: member reads the membership');
RESET ROLE;
SELECT tests.authenticate_as('c1_outsider');
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '77000000-0000-4000-8000-0000000000b1'), 0, 'group_assignment_members: outsider reads nothing');
RESET ROLE;
SELECT pg_temp.set_anon();
SELECT is((SELECT count(*)::int FROM public.group_assignment_members WHERE group_id = '77000000-0000-4000-8000-0000000000b1'), 0, 'group_assignment_members: anon evaluates the public policy to nothing — no error');
RESET ROLE;

-- dev_audit_log / dev_users (is_dev_user, is_global_admin)
RESET ROLE;
SELECT tests.authenticate_as('c1_dev');
SELECT is((SELECT count(*)::int FROM public.dev_audit_log WHERE dev_user_id = auth.uid()), 1, 'dev_audit_log: dev reads their own entry');
SELECT is((SELECT count(*)::int FROM public.dev_users WHERE user_id = auth.uid()), 1, 'dev_users: dev reads their own record');
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.dev_audit_log WHERE dev_user_id = pg_temp.uid('c1_dev')), 0, 'dev_audit_log: non-dev reads nothing');
SELECT is((SELECT count(*)::int FROM public.dev_users), 0, 'dev_users: non-dev, non-admin reads nothing');
RESET ROLE;
SELECT tests.authenticate_as('c1_admin');
SELECT is((SELECT count(*)::int FROM public.dev_audit_log WHERE dev_user_id = pg_temp.uid('c1_dev')), 1, 'dev_audit_log: admin reads all (is_global_admin)');
SELECT is((SELECT count(*)::int FROM public.dev_users WHERE user_id IN (pg_temp.uid('c1_dev'), pg_temp.uid('c1_devonly'))), 2, 'dev_users: admin manages all (is_global_admin)');

-- course_enrollments / user_progress (is_global_admin)
RESET ROLE;
SELECT tests.authenticate_as('c1_admin');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('c1_user')), 1, 'course_enrollments: admin reads another user''s enrolment');
SELECT is((SELECT count(*)::int FROM public.user_progress WHERE user_id = pg_temp.uid('c1_user')), 1, 'user_progress: admin reads another user''s progress');
RESET ROLE;
SELECT tests.authenticate_as('c1_other');
SELECT is((SELECT count(*)::int FROM public.course_enrollments WHERE user_id = pg_temp.uid('c1_user')), 0, 'course_enrollments: another docente reads nothing of it');
SELECT is((SELECT count(*)::int FROM public.user_progress WHERE user_id = pg_temp.uid('c1_user')), 0, 'user_progress: another docente reads nothing of it');
RESET ROLE;
SELECT tests.authenticate_as('c1_user');
SELECT is((SELECT count(*)::int FROM public.user_progress WHERE user_id = auth.uid()), 1, 'user_progress: owner reads their own row');

SELECT * FROM finish();
ROLLBACK;
