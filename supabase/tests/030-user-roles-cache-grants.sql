-- =============================================================================
-- user_roles_cache grant test suite (pgTAP)
--
-- The materialized view public.user_roles_cache cannot carry RLS, so its only
-- protection is privileges. Two migrations remove every client-reachable entry
-- point, and this suite locks both down:
--
--   20260728000000 — REVOKE on the view itself (read exposure)
--   20260729000000 — REVOKE EXECUTE on refresh_user_roles_cache() (RPC surface)
--   20260729120000 — refresh_user_roles_cache() drops CONCURRENTLY so it can
--                    actually succeed (it never could: no unique index exists)
--
-- Proves:
--   1. anon          → no view privilege; SELECT throws 42501
--   2. authenticated → no view privilege; SELECT throws 42501
--   3. neither role  → can EXECUTE refresh_user_roles_cache(), directly or
--                      inherited via PUBLIC
--   4. service_role  → still reads the view (degraded path in roleUtils.ts)
--                      and still holds EXECUTE on the refresh function
--   5. SECURITY DEFINER helpers (auth_has_school_access_uuid) still resolve
--      roles from the view on behalf of an authenticated caller
--   6. the refresh function actually repopulates the cache end-to-end when
--      service_role calls it — the regression test for the CONCURRENTLY bug
--
-- This also guards against the view or function being re-created: Supabase
-- default privileges (and CREATE FUNCTION's implicit GRANT TO PUBLIC) would
-- silently re-grant client access, and these assertions would go red in CI.
--
-- Runs inside a transaction and rolls back — safe to run repeatedly against a
-- local database. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(23);

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
-- Privilege matrix for refresh_user_roles_cache(): the RPC surface.
-- SECURITY DEFINER does not bypass the EXECUTE check, so the grant is the only
-- gate. has_function_privilege() already accounts for privileges inherited via
-- PUBLIC; the aclexplode assertion additionally pins that no PUBLIC grant
-- lingers, since CREATE FUNCTION re-adds one implicitly.
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.refresh_user_roles_cache()', 'EXECUTE'),
  'anon: no EXECUTE privilege on refresh_user_roles_cache()'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.refresh_user_roles_cache()', 'EXECUTE'),
  'authenticated: no EXECUTE privilege on refresh_user_roles_cache()'
);

SELECT is_empty(
  $$ SELECT 1
       FROM pg_proc p, aclexplode(p.proacl) a
      WHERE p.proname = 'refresh_user_roles_cache'
        AND p.pronamespace = 'public'::regnamespace
        AND a.grantee = 0 $$,
  'refresh_user_roles_cache(): no PUBLIC grant remains in proacl'
);

SELECT ok(
  has_function_privilege('service_role', 'public.refresh_user_roles_cache()', 'EXECUTE'),
  'service_role: keeps EXECUTE on refresh_user_roles_cache()'
);

-- -----------------------------------------------------------------------------
-- Definition checks on refresh_user_roles_cache().
--
-- CONCURRENTLY requires a unique index with no WHERE clause. This matview has
-- none and cannot have one: it projects no column that distinguishes duplicate
-- user_roles rows (approval_status/is_admin/is_teacher are functions of
-- user_id/role_type; cached_at is now()). Production carries exact full-row
-- duplicates, so the keyword can never come back without first de-duplicating
-- the source and re-keying the view — assert it stays gone.
-- -----------------------------------------------------------------------------
SELECT ok(
  (SELECT prosrc NOT ILIKE '%CONCURRENTLY%'
     FROM pg_proc
    WHERE proname = 'refresh_user_roles_cache'
      AND pronamespace = 'public'::regnamespace),
  'refresh_user_roles_cache(): does not use CONCURRENTLY (no unique index exists)'
);

SELECT ok(
  (SELECT proconfig::text[] && ARRAY['search_path=public, pg_temp']
     FROM pg_proc
    WHERE proname = 'refresh_user_roles_cache'
      AND pronamespace = 'public'::regnamespace),
  'refresh_user_roles_cache(): SECURITY DEFINER pins an explicit search_path'
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

-- The RPC surface is closed too. This assertion is strictly stronger since
-- 20260729120000 repaired the function: the body now SUCCEEDS for a permitted
-- caller (proved in Tier 3), so a returning grant would surface as a passing
-- call rather than a different error code. 42501 can only come from the
-- privilege check.
SELECT throws_ok(
  $$ SELECT public.refresh_user_roles_cache() $$,
  '42501', NULL,
  'authenticated: EXECUTE on refresh_user_roles_cache() throws permission denied'
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
-- Tier 3 — service_role: degraded-path read still works, and the refresh
-- function actually refreshes.
--
-- Regression test for the CONCURRENTLY bug: before 20260729120000 every call
-- raised 55000 ("cannot refresh materialized view concurrently"), so the cache
-- silently never updated. A lives_ok alone would be weak, so this adds a new
-- role assignment, proves the cache does NOT yet contain it, refreshes, and
-- proves it does — i.e. the function moves data, not just exits cleanly.
-- =============================================================================

-- Added as postgres, after the fixture's manual refresh, so it is genuinely
-- absent from the cache at this point.
INSERT INTO user_roles (user_id, role_type, school_id, is_active)
VALUES (:docente_uid::uuid, 'equipo_directivo', 9102, true)
ON CONFLICT DO NOTHING;

SELECT results_eq(
  $$ SELECT count(*)::int FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid
        AND role = 'equipo_directivo' $$,
  ARRAY[0],
  'pre-refresh: the new role assignment is absent from the cache'
);

SELECT set_config('role', 'service_role', true);

SELECT results_eq(
  $$ SELECT count(*)::int FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid $$,
  ARRAY[1],
  'service_role: still reads role rows from user_roles_cache'
);

SELECT lives_ok(
  $$ SELECT public.refresh_user_roles_cache() $$,
  'service_role: refresh_user_roles_cache() succeeds (was 55000 before the fix)'
);

SELECT results_eq(
  $$ SELECT count(*)::int FROM user_roles_cache
      WHERE user_id = '00000000-0000-0000-0000-000000003ddd'::uuid
        AND role = 'equipo_directivo' $$,
  ARRAY[1],
  'post-refresh: the new role assignment is now cached (refresh moved data)'
);

RESET ROLE;

SELECT * FROM finish();

ROLLBACK;
