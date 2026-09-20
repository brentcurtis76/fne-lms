BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(44);

-- ---------------------------------------------------------------------------
-- Structure, RLS and grants
-- ---------------------------------------------------------------------------

SELECT has_table('public', 'assessment_template_source_revisions',
  'revision counter table exists');
SELECT col_is_pk('public', 'assessment_template_source_revisions', 'template_id',
  'template_id is the primary key');
SELECT col_type_is('public', 'assessment_template_source_revisions', 'revision', 'bigint',
  'revision is bigint');
SELECT col_not_null('public', 'assessment_template_source_revisions', 'revision',
  'revision is NOT NULL');
SELECT col_default_is('public', 'assessment_template_source_revisions', 'revision', '0'::text,
  'revision defaults to 0');
SELECT fk_ok('public', 'assessment_template_source_revisions', 'template_id',
  'public', 'assessment_templates', 'id',
  'template_id references assessment_templates(id)');
SELECT is(
  (SELECT confdeltype::text FROM pg_constraint
    WHERE conrelid = 'public.assessment_template_source_revisions'::regclass
      AND contype = 'f'),
  'c',
  'template FK cascades on delete');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class
    WHERE oid = 'public.assessment_template_source_revisions'::regclass),
  'RLS is enabled on the counter table');
SELECT policies_are('public', 'assessment_template_source_revisions',
  ARRAY['assessment_template_source_revisions_admin_select']::name[],
  'only the admin select policy exists');
SELECT policy_cmd_is('public', 'assessment_template_source_revisions',
  'assessment_template_source_revisions_admin_select', 'SELECT',
  'admin policy is SELECT only');
SELECT policy_roles_are('public', 'assessment_template_source_revisions',
  'assessment_template_source_revisions_admin_select', ARRAY['authenticated']::name[],
  'admin policy applies to authenticated only');
SELECT table_privs_are('public', 'assessment_template_source_revisions', 'authenticated',
  ARRAY['SELECT']::name[], 'authenticated has SELECT only');
SELECT table_privs_are('public', 'assessment_template_source_revisions', 'service_role',
  ARRAY['SELECT']::name[], 'service_role has SELECT only');
SELECT table_privs_are('public', 'assessment_template_source_revisions', 'anon',
  ARRAY[]::name[], 'anon has no table privileges');
SELECT ok(
  NOT has_table_privilege('public', 'public.assessment_template_source_revisions',
    'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'),
  'PUBLIC has no table privileges');

SELECT has_function('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'getter exists with (uuid) signature');
SELECT function_returns('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'bigint', 'getter returns bigint');
SELECT isnt_definer('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'getter is SECURITY INVOKER');
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_proc p, unnest(p.proconfig) AS cfg
     WHERE p.oid = 'public.get_template_source_revision(uuid)'::regprocedure
       AND cfg LIKE 'search_path=%'),
  'getter pins search_path');
SELECT function_privs_are('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'authenticated', ARRAY['EXECUTE']::name[], 'authenticated can execute getter');
SELECT function_privs_are('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'service_role', ARRAY['EXECUTE']::name[], 'service_role can execute getter');
SELECT function_privs_are('public', 'get_template_source_revision', ARRAY['uuid']::name[],
  'anon', ARRAY[]::name[], 'anon cannot execute getter');
SELECT ok(
  NOT has_function_privilege('public', 'public.get_template_source_revision(uuid)', 'EXECUTE'),
  'PUBLIC cannot execute getter');

-- ---------------------------------------------------------------------------
-- Synthetic fixtures (postgres)
-- ---------------------------------------------------------------------------

INSERT INTO public.assessment_templates (id, name, area, version, status)
VALUES ('b5000000-0000-4000-8000-000000000001', 'B5 counter fixture', 'personalizacion', '1.0', 'draft');

INSERT INTO public.assessment_template_source_revisions (template_id, revision)
VALUES ('b5000000-0000-4000-8000-000000000001', 7);

SELECT tests.create_supabase_user('b5_counter_admin');
SELECT tests.create_supabase_user('b5_counter_admin_mcp');
SELECT tests.create_supabase_user('b5_counter_consultor');
SELECT tests.create_supabase_user('b5_counter_docente');
SELECT tests.create_supabase_user('b5_counter_directivo');

INSERT INTO public.profiles (id, email, name, approval_status) VALUES
  (tests.get_supabase_uid('b5_counter_admin'), 'b5_counter_admin@test.com', 'B5 Counter Admin', 'approved'),
  (tests.get_supabase_uid('b5_counter_admin_mcp'), 'b5_counter_admin_mcp@test.com', 'B5 Counter Admin MCP', 'approved'),
  (tests.get_supabase_uid('b5_counter_consultor'), 'b5_counter_consultor@test.com', 'B5 Counter Consultor', 'approved'),
  (tests.get_supabase_uid('b5_counter_docente'), 'b5_counter_docente@test.com', 'B5 Counter Docente', 'approved'),
  (tests.get_supabase_uid('b5_counter_directivo'), 'b5_counter_directivo@test.com', 'B5 Counter Directivo', 'approved')
ON CONFLICT (id) DO NOTHING;

UPDATE public.profiles
   SET must_change_password = (id = tests.get_supabase_uid('b5_counter_admin_mcp'))
 WHERE id IN (
   tests.get_supabase_uid('b5_counter_admin'),
   tests.get_supabase_uid('b5_counter_admin_mcp'),
   tests.get_supabase_uid('b5_counter_consultor'),
   tests.get_supabase_uid('b5_counter_docente'),
   tests.get_supabase_uid('b5_counter_directivo'));

INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
  (tests.get_supabase_uid('b5_counter_admin'), 'admin', NULL, true),
  (tests.get_supabase_uid('b5_counter_admin_mcp'), 'admin', NULL, true),
  (tests.get_supabase_uid('b5_counter_consultor'), 'consultor', NULL, true),
  (tests.get_supabase_uid('b5_counter_docente'), 'docente', NULL, true),
  (tests.get_supabase_uid('b5_counter_directivo'), 'equipo_directivo', NULL, true);

-- ---------------------------------------------------------------------------
-- Active admin with satisfied password gate
-- ---------------------------------------------------------------------------

SELECT tests.authenticate_as('b5_counter_admin');

SELECT is(public.get_template_source_revision('b5000000-0000-4000-8000-000000000001'::uuid),
  7::bigint, 'admin reads existing revision 7');
SELECT is(public.get_template_source_revision('b5000000-0000-4000-8000-0000000000ff'::uuid),
  0::bigint, 'admin reads 0 for absent row');
SELECT throws_ok($$SELECT public.get_template_source_revision(NULL)$$,
  '22023', 'invalid_arguments', 'admin NULL template id is refused');
SELECT is(
  (SELECT revision FROM public.assessment_template_source_revisions
    WHERE template_id = 'b5000000-0000-4000-8000-000000000001'),
  7::bigint, 'admin direct SELECT sees counter row');
SELECT throws_ok(
  $$UPDATE public.assessment_template_source_revisions SET revision = 8
     WHERE template_id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'admin cannot UPDATE counter');
SELECT throws_ok(
  $$INSERT INTO public.assessment_template_source_revisions (template_id, revision)
    VALUES ('b5000000-0000-4000-8000-000000000001', 9)$$,
  '42501', NULL, 'admin cannot INSERT counter');

-- ---------------------------------------------------------------------------
-- Admin blocked by password change gate
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT tests.authenticate_as('b5_counter_admin_mcp');

SELECT throws_ok($$SELECT public.get_template_source_revision('b5000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'admin with must_change_password is refused');
SELECT is_empty(
  $$SELECT 1 FROM public.assessment_template_source_revisions$$,
  'admin with must_change_password sees no rows');

-- ---------------------------------------------------------------------------
-- Non-admin roles
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT tests.authenticate_as('b5_counter_consultor');

SELECT throws_ok($$SELECT public.get_template_source_revision('b5000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'consultor is refused');
SELECT is_empty(
  $$SELECT 1 FROM public.assessment_template_source_revisions$$,
  'consultor sees no rows');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT tests.authenticate_as('b5_counter_docente');

SELECT throws_ok($$SELECT public.get_template_source_revision('b5000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'docente is refused');

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT tests.authenticate_as('b5_counter_directivo');

SELECT throws_ok($$SELECT public.get_template_source_revision('b5000000-0000-4000-8000-000000000001')$$,
  '42501', 'forbidden', 'equipo_directivo is refused');

-- ---------------------------------------------------------------------------
-- Anonymous
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);
SELECT tests.clear_authentication();
SET LOCAL ROLE anon;

SELECT throws_ok($$SELECT public.get_template_source_revision('b5000000-0000-4000-8000-000000000001')$$,
  '42501', NULL, 'anon cannot execute getter');
SELECT throws_ok($$SELECT revision FROM public.assessment_template_source_revisions$$,
  '42501', NULL, 'anon cannot SELECT counter table');

-- ---------------------------------------------------------------------------
-- service_role
-- ---------------------------------------------------------------------------

RESET ROLE;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

SELECT is(public.get_template_source_revision('b5000000-0000-4000-8000-000000000001'::uuid),
  7::bigint, 'service_role reads existing revision 7');
SELECT is(public.get_template_source_revision('b5000000-0000-4000-8000-0000000000ff'::uuid),
  0::bigint, 'service_role reads 0 for absent row');
SELECT throws_ok($$SELECT public.get_template_source_revision(NULL)$$,
  '22023', 'invalid_arguments', 'service_role NULL template id is refused');
SELECT throws_ok(
  $$UPDATE public.assessment_template_source_revisions SET revision = 8
     WHERE template_id = 'b5000000-0000-4000-8000-000000000001'$$,
  '42501', NULL, 'service_role cannot UPDATE counter');
SELECT throws_ok(
  $$INSERT INTO public.assessment_template_source_revisions (template_id, revision)
    VALUES ('b5000000-0000-4000-8000-000000000001', 9)$$,
  '42501', NULL, 'service_role cannot INSERT counter');

-- ---------------------------------------------------------------------------
-- Owner constraints
-- ---------------------------------------------------------------------------

RESET ROLE;
SELECT set_config('request.jwt.claims', '{}', true);

SELECT throws_ok(
  $$UPDATE public.assessment_template_source_revisions SET revision = -1
     WHERE template_id = 'b5000000-0000-4000-8000-000000000001'$$,
  '23514', NULL, 'negative revision violates CHECK');
SELECT is(
  (SELECT revision FROM public.assessment_template_source_revisions
    WHERE template_id = 'b5000000-0000-4000-8000-000000000001'),
  7::bigint, 'counter unchanged after refused writes');

SELECT * FROM finish();

ROLLBACK;
