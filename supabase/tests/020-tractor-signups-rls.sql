-- =============================================================================
-- tractor_signups RLS Test Suite (pgTAP)
--
-- The table backs BOTH public signup flows (/registro-tractor and /registro,
-- distinguished by `source`). The public endpoints write via the service-role
-- client, so the only database-level access path is the admin-only policy
-- tractor_signups_admin_all:
--
--   1. admin        → full SELECT / INSERT / UPDATE / DELETE
--   2. docente      → nothing: 0 rows visible, INSERT throws, UPDATE/DELETE
--                     match 0 rows (per repo convention: blocked INSERT throws,
--                     blocked UPDATE returns empty)
--   3. anon         → nothing (policy is TO authenticated only)
--
-- Also verifies the additive generation_id column (nullable FK → generations)
-- landed and that the pre-existing policy still protects the table after the
-- column addition.
--
-- Runs inside a transaction and rolls back — safe to run repeatedly against a
-- local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(13);

-- -----------------------------------------------------------------------------
-- Fixture ids — stable and obvious so test output is easy to read.
-- -----------------------------------------------------------------------------
\set admin_uid    '''00000000-0000-0000-0000-000000002aaa'''
\set docente_uid  '''00000000-0000-0000-0000-000000002ddd'''
\set gen_id       '''ffffffff-0000-0000-0000-000000000001'''
\set seeded_id    '''55555555-0000-0000-0000-000000000001'''
\set admin_ins_id '''55555555-0000-0000-0000-000000000002'''

-- -----------------------------------------------------------------------------
-- Schema checks (as postgres, before any role switching).
-- -----------------------------------------------------------------------------
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE relname = 'tractor_signups'),
  'tractor_signups: row-level security flag is ENABLED'
);

SELECT has_column('public', 'tractor_signups', 'generation_id',
  'tractor_signups: generation_id column exists');

SELECT fk_ok('public', 'tractor_signups', 'generation_id',
             'public', 'generations', 'id',
  'tractor_signups.generation_id: foreign key to generations(id)');

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as postgres, bypassing RLS).
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:admin_uid::uuid,   'admin@signups-rls.local',   '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:docente_uid::uuid, 'docente@signups-rls.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES
  (:admin_uid::uuid,   'admin@signups-rls.local',   'RLS Signups Admin',   'approved'),
  (:docente_uid::uuid, 'docente@signups-rls.local', 'RLS Signups Docente', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name)
VALUES (9101, 'RLS Signups Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO generations (id, school_id, name)
VALUES (:gen_id::uuid, 9101, 'RLS Test Tractor')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES
  (:admin_uid::uuid,   'admin',   NULL, true),
  (:docente_uid::uuid, 'docente', 9101, true)
ON CONFLICT DO NOTHING;

-- One pending signup from the generic flow, carrying a generation.
INSERT INTO tractor_signups (
  id, source, first_name, last_name, email, email_normalized,
  school_id, generation_id, birth_date, profession, role, status
)
VALUES (
  :seeded_id::uuid, 'registro_general', 'Sofía', 'Prueba',
  'sofia@signups-rls.local', 'sofia@signups-rls.local',
  9101, :gen_id::uuid, DATE '1991-03-15', 'Docente de Prueba', 'docente', 'pending'
)
ON CONFLICT (id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- Helpers: impersonate an authenticated user / the anon role.
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

CREATE OR REPLACE FUNCTION pg_temp.set_anon() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'anon', true);
  PERFORM set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- Tier 1 — admin: full CRUD
-- =============================================================================
SELECT pg_temp.set_authenticated(:admin_uid::uuid);

SELECT results_eq(
  $$ SELECT count(*)::int FROM tractor_signups
      WHERE id = '55555555-0000-0000-0000-000000000001'::uuid $$,
  ARRAY[1],
  'admin: sees the seeded signup (including its generation_id column)'
);

SELECT lives_ok(
  $$ INSERT INTO tractor_signups (
       id, source, first_name, last_name, email, email_normalized,
       school_id, generation_id, birth_date, profession, role, status
     ) VALUES (
       '55555555-0000-0000-0000-000000000002'::uuid, 'lideres_generacion_tractor',
       'Pedro', 'Prueba', 'pedro@signups-rls.local', 'pedro@signups-rls.local',
       9101, NULL, DATE '1985-08-20', 'Profesor de Prueba', 'equipo_directivo', 'pending'
     ) $$,
  'admin: INSERT allowed'
);

SELECT results_eq(
  $$ UPDATE tractor_signups SET status = 'dismissed'
      WHERE id = '55555555-0000-0000-0000-000000000002'::uuid
      RETURNING 1 $$,
  ARRAY[1],
  'admin: UPDATE allowed and matches the row'
);

SELECT results_eq(
  $$ DELETE FROM tractor_signups
      WHERE id = '55555555-0000-0000-0000-000000000002'::uuid
      RETURNING 1 $$,
  ARRAY[1],
  'admin: DELETE allowed and matches the row'
);

RESET ROLE;

-- =============================================================================
-- Tier 2 — docente: no access path at all
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT is_empty(
  $$ SELECT 1 FROM tractor_signups
      WHERE id = '55555555-0000-0000-0000-000000000001'::uuid $$,
  'docente: sees 0 signup rows'
);

SELECT throws_ok(
  $$ INSERT INTO tractor_signups (
       source, first_name, last_name, email, email_normalized,
       school_id, birth_date, profession, role, status
     ) VALUES (
       'registro_general', 'Hack', 'Intento', 'hack@signups-rls.local',
       'hack@signups-rls.local', 9101, DATE '1990-01-01', 'N/A', 'docente', 'pending'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "tractor_signups"',
  'docente: INSERT throws RLS violation'
);

SELECT is_empty(
  $$ UPDATE tractor_signups SET status = 'granted'
      WHERE id = '55555555-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'docente: UPDATE matches 0 rows (blocked UPDATE returns empty)'
);

SELECT is_empty(
  $$ DELETE FROM tractor_signups
      WHERE id = '55555555-0000-0000-0000-000000000001'::uuid
      RETURNING 1 $$,
  'docente: DELETE matches 0 rows'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — anon: the policy is TO authenticated, so anon has nothing
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT is_empty(
  $$ SELECT 1 FROM tractor_signups
      WHERE id = '55555555-0000-0000-0000-000000000001'::uuid $$,
  'anon: sees 0 signup rows'
);

SELECT throws_ok(
  $$ INSERT INTO tractor_signups (
       source, first_name, last_name, email, email_normalized,
       school_id, birth_date, profession, role, status
     ) VALUES (
       'registro_general', 'Anon', 'Intento', 'anon@signups-rls.local',
       'anon@signups-rls.local', 9101, DATE '1990-01-01', 'N/A', 'docente', 'pending'
     ) $$,
  '42501',
  'new row violates row-level security policy for table "tractor_signups"',
  'anon: INSERT throws RLS violation'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
