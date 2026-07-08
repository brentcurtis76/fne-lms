-- =============================================================================
-- consultor_sessions RLS Test Suite (pgTAP)
--
-- Verifies row-level security on the consultor_sessions table against all four
-- primary access tiers:
--
--   1. admin            → SELECT every session, regardless of school
--   2. consultor (school-scoped)
--                       → SELECT only sessions whose school_id matches an
--                         active user_roles.school_id row for that user
--   3. consultor (no school assignment)
--                       → SELECT zero sessions. sessions_consultor_select
--                         requires user_roles.school_id = sessions.school_id;
--                         there is NO global-access policy and production has
--                         no consultor rows with school_id IS NULL (verified
--                         2026-07-08)
--   4. docente / community_manager
--                       → SELECT zero sessions (no access path)
--
-- How to run (after starting a local Postgres with the real migrations applied
-- and pgTAP extension installed):
--
--     psql $DATABASE_URL -f database/tests/consultor_sessions_rls.test.sql
--
-- The whole script runs inside a transaction and rolls back at the end so it
-- is safe to run repeatedly against a dev / local database. DO NOT run it
-- against production.
-- =============================================================================

BEGIN;

-- Load pgTAP helpers (idempotent — does nothing if already installed).
CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(8);

-- -----------------------------------------------------------------------------
-- Fixture UUIDs — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set admin_uid     '''00000000-0000-0000-0000-00000000aaaa'''
\set global_uid    '''00000000-0000-0000-0000-00000000bbbb'''
\set scoped_uid    '''00000000-0000-0000-0000-00000000cccc'''
\set docente_uid   '''00000000-0000-0000-0000-00000000dddd'''
\set cm_uid        '''00000000-0000-0000-0000-00000000eeee'''

-- -----------------------------------------------------------------------------
-- Seed the minimum auth + profile rows needed for FKs / RLS predicates.
-- Every INSERT is idempotent via ON CONFLICT so repeated runs don't fail.
-- -----------------------------------------------------------------------------

-- auth.users is managed by Supabase; we only insert the columns we control.
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:admin_uid::uuid,   'admin@rls-test.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:global_uid::uuid,  'global@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:scoped_uid::uuid,  'scoped@rls-test.local',  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid, 'docente@rls-test.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:cm_uid::uuid,      'cm@rls-test.local',      '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

-- user_roles.user_id references profiles(id), so mirror each auth user there.
INSERT INTO profiles (id, email, name, approval_status)
VALUES
  (:admin_uid::uuid,   'admin@rls-test.local',   'RLS Test Admin',     'approved'),
  (:global_uid::uuid,  'global@rls-test.local',  'RLS Test Global',    'approved'),
  (:scoped_uid::uuid,  'scoped@rls-test.local',  'RLS Test Scoped',    'approved'),
  (:docente_uid::uuid, 'docente@rls-test.local', 'RLS Test Docente',   'approved'),
  (:cm_uid::uuid,      'cm@rls-test.local',      'RLS Test CommMgr',   'approved')
ON CONFLICT (id) DO NOTHING;

-- Two distinct schools: one the scoped consultor CAN see, one they cannot.
INSERT INTO schools (id, name)
VALUES
  (9001, 'RLS Test School A'),
  (9002, 'RLS Test School B')
ON CONFLICT (id) DO NOTHING;

-- user_roles fixtures. Per architecture:
--   * admin        → role_type='admin',   school_id NULL
--   * unscoped con → role_type='consultor', school_id NULL (no access expected)
--   * scoped cons  → role_type='consultor', school_id=9001
--   * docente      → role_type='docente',  school_id=9001
--   * comm. mgr    → role_type='community_manager', school_id=9001
INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES
  (:admin_uid::uuid,   'admin',             NULL, true),
  (:global_uid::uuid,  'consultor',         NULL, true),
  (:scoped_uid::uuid,  'consultor',         9001, true),
  (:docente_uid::uuid, 'docente',           9001, true),
  (:cm_uid::uuid,      'community_manager', 9001, true)
ON CONFLICT DO NOTHING;

-- consultor_sessions.growth_community_id is NOT NULL — seed one synthetic
-- growth community per school. No fixture user carries a community_id, so the
-- sessions_gc_member_select policy never matches these rows.
INSERT INTO growth_communities (id, school_id, name)
VALUES
  ('cccccccc-0000-0000-0000-000000000001'::uuid, 9001, 'RLS Test GC (School A)'),
  ('cccccccc-0000-0000-0000-000000000002'::uuid, 9002, 'RLS Test GC (School B)')
ON CONFLICT (id) DO NOTHING;

-- Three consultor_sessions: two in School A, one in School B.
-- school-scoped consultor (scoped_uid) should see rows in A only.
INSERT INTO consultor_sessions (
  id, school_id, growth_community_id, title, session_date, start_time, end_time,
  modality, status, is_active, created_by
)
VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, 9001,
   'cccccccc-0000-0000-0000-000000000001'::uuid,
   'Session A1 (School A)', CURRENT_DATE, '09:00:00', '10:00:00', 'presencial', 'programada', true,
   :admin_uid::uuid),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, 9001,
   'cccccccc-0000-0000-0000-000000000001'::uuid,
   'Session A2 (School A)', CURRENT_DATE, '11:00:00', '12:00:00', 'presencial', 'programada', true,
   :admin_uid::uuid),
  ('bbbbbbbb-0000-0000-0000-000000000003'::uuid, 9002,
   'cccccccc-0000-0000-0000-000000000002'::uuid,
   'Session B1 (School B)', CURRENT_DATE, '09:00:00', '10:00:00', 'presencial', 'programada', true,
   :admin_uid::uuid)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helper: set the authenticated role and the JWT "sub" claim that RLS policies
-- resolve through auth.uid(). Every assertion below pairs a set_authenticated
-- call with a results_eq / results_ne check.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.set_authenticated(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Tier 1 — admin: unrestricted SELECT
-- =============================================================================
SELECT pg_temp.set_authenticated(:admin_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int
       FROM consultor_sessions
      WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      ) $$,
  ARRAY[3],
  'admin: sees all 3 seeded sessions regardless of school_id'
);

SELECT ok(
  EXISTS (
    SELECT 1 FROM consultor_sessions
     WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid
  ),
  'admin: can read a session in an un-affiliated school (School B)'
);

RESET ROLE;

-- =============================================================================
-- Tier 2 — school-scoped consultor: SELECT only own school's sessions
-- =============================================================================
SELECT pg_temp.set_authenticated(:scoped_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int
       FROM consultor_sessions
      WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      ) $$,
  ARRAY[2],
  'school-scoped consultor: sees exactly the 2 sessions at their school (School A)'
);

SELECT is_empty(
  $$ SELECT 1 FROM consultor_sessions
      WHERE id = 'bbbbbbbb-0000-0000-0000-000000000003'::uuid $$,
  'school-scoped consultor: cannot read a session from an out-of-scope school (School B)'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — consultor with NO school assignment (user_roles.school_id IS NULL):
-- sees nothing. The only consultor SELECT policy requires an exact school_id
-- match, so a NULL school row grants no visibility. Production has zero such
-- rows; if a "global consultor" tier is ever wanted, it needs a new policy and
-- this assertion flips to 3.
-- =============================================================================
SELECT pg_temp.set_authenticated(:global_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int
       FROM consultor_sessions
      WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      ) $$,
  ARRAY[0],
  'consultor without school assignment: sees no sessions (no global-access policy)'
);

RESET ROLE;

-- =============================================================================
-- Tier 4 — docente / community_manager: zero visibility into consultor_sessions
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM consultor_sessions
      WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      ) $$,
  'docente: is denied SELECT on every seeded consultor_session'
);

RESET ROLE;

SELECT pg_temp.set_authenticated(:cm_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM consultor_sessions
      WHERE id IN (
        'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
        'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
        'bbbbbbbb-0000-0000-0000-000000000003'::uuid
      ) $$,
  'community_manager: is denied SELECT on every seeded consultor_session'
);

RESET ROLE;

-- =============================================================================
-- Sanity: RLS must be ENABLED on consultor_sessions. If this flips off the
-- whole suite above is meaningless — fail loudly.
-- =============================================================================
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'consultor_sessions'),
  'consultor_sessions: row-level security flag is ENABLED'
);

-- -----------------------------------------------------------------------------
-- Finish + rollback. Rollback ensures no fixture rows leak into the database
-- even if a developer forgets to drop the test schema.
-- -----------------------------------------------------------------------------
SELECT * FROM finish();

ROLLBACK;
