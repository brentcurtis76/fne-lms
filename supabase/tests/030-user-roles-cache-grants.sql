-- =============================================================================
-- user_roles_cache grant test suite (pgTAP)
--
-- The materialized view public.user_roles_cache cannot carry RLS, so its only
-- protection is table privileges. Migration
-- 20260728000000_revoke_client_read_user_roles_cache.sql revokes every client
-- privilege; this suite proves:
--
--   1. anon          → no privilege at all; SELECT throws 42501
--   2. authenticated → no privilege at all; SELECT throws 42501
--   3. service_role  → still reads the view (degraded-path in roleUtils.ts)
--   4. SECURITY DEFINER helpers (auth_has_school_access_uuid) still resolve
--      roles from the view on behalf of an authenticated caller
--
-- This also guards against the view being re-created: Supabase default
-- privileges would silently re-grant client access, and these assertions
-- would go red in CI.
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
\set docente_uid '''00000000-0000-0000-0000-000000003ddd'''

-- -----------------------------------------------------------------------------
-- Schema check (as postgres, before any role switching).
-- -----------------------------------------------------------------------------
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_matviews
     WHERE schemaname = 'public' AND matviewname = 'user_roles_cache'
  ),
  'user_roles_cache: materialized view exists'
);

-- -----------------------------------------------------------------------------
-- Privilege matrix: no client role holds any privilege; service_role reads.
-- has_table_privilege accounts for grants inherited via PUBLIC.
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_table_privilege('anon', 'public.user_roles_cache', 'SELECT'),
  'anon: no SELECT privilege on user_roles_cache'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.user_roles_cache',
                          'INSERT, UPDATE, DELETE'),
  'anon: no write privilege on user_roles_cache'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_roles_cache', 'SELECT'),
  'authenticated: no SELECT privilege on user_roles_cache'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.user_roles_cache',
                          'INSERT, UPDATE, DELETE'),
  'authenticated: no write privilege on user_roles_cache'
);

SELECT ok(
  has_table_privilege('service_role', 'public.user_roles_cache', 'SELECT'),
  'service_role: keeps SELECT privilege on user_roles_cache'
);

-- -----------------------------------------------------------------------------
-- Fixtures (inserted as postgres, bypassing RLS) + populate the view.
-- Baseline creates the view WITH NO DATA; a plain (non-concurrent) REFRESH is
-- transactional and rolls back with the rest of the suite.
-- -----------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES (:docente_uid::uuid, 'docente@cache-grants.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES (:docente_uid::uuid, 'docente@cache-grants.local',
        'Cache Grants Docente', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO schools (id, name)
VALUES (9102, 'Cache Grants Test School')
ON CONFLICT (id) DO NOTHING;

INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES (:docente_uid::uuid, 'docente', 9102, true)
ON CONFLICT DO NOTHING;

REFRESH MATERIALIZED VIEW public.user_roles_cache;

SELECT results_eq(
  $$ SELECT count(*)::int FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid $$,
  ARRAY[1],
  'postgres: view is populated with the seeded role (fixture sanity)'
);

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
-- Tier 1 — authenticated: every direct access path throws 42501
-- (error message text varies across Postgres versions, so only the SQLSTATE
-- is asserted).
-- =============================================================================
SELECT pg_temp.set_authenticated(:docente_uid::uuid);

SELECT throws_ok(
  $$ SELECT * FROM user_roles_cache $$,
  '42501', NULL,
  'authenticated: SELECT on user_roles_cache throws permission denied'
);

SELECT throws_ok(
  $$ SELECT * FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid $$,
  '42501', NULL,
  'authenticated: even own-row SELECT throws permission denied'
);

-- SECURITY DEFINER helper still resolves the caller's school from the view.
SELECT ok(
  public.auth_has_school_access_uuid(9102),
  'authenticated: auth_has_school_access_uuid still reads the view via SECURITY DEFINER'
);

SELECT ok(
  NOT public.auth_has_school_access_uuid(9999),
  'authenticated: auth_has_school_access_uuid denies a school the user lacks'
);

RESET ROLE;

-- =============================================================================
-- Tier 2 — anon: SELECT throws 42501
-- =============================================================================
SELECT pg_temp.set_anon();

SELECT throws_ok(
  $$ SELECT * FROM user_roles_cache $$,
  '42501', NULL,
  'anon: SELECT on user_roles_cache throws permission denied'
);

RESET ROLE;

-- =============================================================================
-- Tier 3 — service_role: degraded-path read still works
-- =============================================================================
SELECT set_config('role', 'service_role', true);

SELECT results_eq(
  $$ SELECT count(*)::int FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid $$,
  ARRAY[1],
  'service_role: still reads role rows from user_roles_cache'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
