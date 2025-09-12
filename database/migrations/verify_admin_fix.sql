-- ============================================================================
-- Verify Admin Fix: Courses Insert RLS + auth_is_admin() Fallback
-- Run in Supabase SQL Editor (each statement is safe to run as-is)
-- This script validates that admins (e.g., Jorge) can create courses after fix
-- ============================================================================

-- Parameters
-- Replace with the target user's UUID if different
-- Jorge Parra user_id from context:
--   372ab00b-1d39-4574-8eff-d756b9d6b861

-- ============================================================================
-- 0) Environment info (who am I in this session?)
-- ============================================================================
SELECT current_user AS current_user, session_user AS session_user;

-- ============================================================================
-- 1) Jorge's Admin Status (user_roles) - ground truth
-- ============================================================================
SELECT
  'Jorge Admin Roles' AS section,
  COUNT(*) FILTER (WHERE role_type = 'admin' AND is_active) AS active_admin_roles,
  COUNT(*) AS total_roles
FROM user_roles
WHERE user_id = '372ab00b-1d39-4574-8eff-d756b9d6b861';

SELECT
  'Jorge Admin Role Details' AS section,
  role_type,
  is_active,
  school_id,
  community_id,
  generation_id
FROM user_roles
WHERE user_id = '372ab00b-1d39-4574-8eff-d756b9d6b861'
ORDER BY role_type, is_active DESC;

-- ============================================================================
-- 2) Auth Function Test - simulate JWT contexts and evaluate auth_is_admin()
--    Note: Supabase allows simulating auth context using request.jwt.claims
-- ============================================================================

-- 2a) Simulate Jorge as authenticated, NOT admin in JWT (forces fallback)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"372ab00b-1d39-4574-8eff-d756b9d6b861","role":"authenticated","user_metadata":{"role":"user"}}',
  true
) AS jwt_set_non_admin;

SELECT 'Auth Context (non-admin JWT)' AS section, auth.uid() AS uid_from_jwt;
SELECT 'auth_is_admin (fallback expected true if roles show admin)' AS section,
       CASE WHEN to_regproc('public.auth_is_admin()') IS NULL THEN NULL ELSE public.auth_is_admin() END AS is_admin_via_fallback;

-- 2b) Simulate Jorge with admin in JWT (fast path should be true)
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"372ab00b-1d39-4574-8eff-d756b9d6b861","role":"authenticated","user_metadata":{"role":"admin"}}',
  true
) AS jwt_set_admin;

SELECT 'Auth Context (admin JWT)' AS section, auth.uid() AS uid_from_jwt;
SELECT 'auth_is_admin (JWT admin expected true)' AS section,
       CASE WHEN to_regproc('public.auth_is_admin()') IS NULL THEN NULL ELSE public.auth_is_admin() END AS is_admin_via_jwt;

-- Clear claims (optional)
SELECT set_config('request.jwt.claims', NULL, true) AS jwt_cleared;

-- ============================================================================
-- 3) RLS Policies on courses
-- ============================================================================
SELECT 
  'RLS Enabled' AS section,
  c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'courses';

SELECT 
  'Courses Policies' AS section,
  policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'courses'
ORDER BY policyname, cmd;

-- Highlight admin policy exists and uses auth_is_admin()
SELECT 
  'Admin Policy Check' AS section,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename  = 'courses'
      AND p.policyname = 'courses_admin_all'
  ) AS has_admin_policy,
  EXISTS (
    SELECT 1
    FROM pg_policies p
    WHERE p.schemaname = 'public'
      AND p.tablename  = 'courses'
      AND p.policyname = 'courses_admin_all'
      AND (p.qual ILIKE '%auth_is_admin%' OR p.with_check ILIKE '%auth_is_admin%')
  ) AS admin_policy_uses_auth_is_admin;

-- ============================================================================
-- 4) Table Privileges for authenticated role
-- ============================================================================
SELECT 
  'Table Privileges' AS section,
  has_table_privilege('authenticated', 'public.courses', 'INSERT') AS authenticated_can_insert,
  has_table_privilege('authenticated', 'public.courses', 'SELECT') AS authenticated_can_select,
  has_table_privilege('authenticated', 'public.courses', 'UPDATE') AS authenticated_can_update,
  has_table_privilege('authenticated', 'public.courses', 'DELETE') AS authenticated_can_delete;

-- ============================================================================
-- 5) Function Verification - check fallback logic present in function body
-- ============================================================================
SELECT 
  'Function Exists' AS section,
  to_regproc('public.auth_is_admin()') IS NOT NULL AS function_exists;

WITH fn AS (
  SELECT to_regprocedure('public.auth_is_admin()') AS oid
)
SELECT 
  'Function Has Fallback' AS section,
  CASE WHEN oid IS NULL THEN false ELSE (pg_get_functiondef(oid) ILIKE '%FROM user_roles ur%') END AS references_user_roles_table,
  CASE WHEN oid IS NULL THEN false ELSE (pg_get_functiondef(oid) ILIKE '%user_roles_cache%')   END AS references_roles_cache,
  CASE WHEN oid IS NULL THEN false ELSE (pg_get_functiondef(oid) ILIKE '%auth.jwt()%')        END AS references_jwt
FROM fn;

-- Optional: show the function body for manual review
-- SELECT pg_get_functiondef('public.auth_is_admin()'::regproc);

-- ============================================================================
-- 6) Cache Status - presence and whether Jorge is cached
-- ============================================================================
SELECT 
  'Cache Presence' AS section,
  (to_regclass('public.user_roles_cache') IS NOT NULL) AS cache_exists;

-- If cache exists, show Jorge row (if any)
-- Skipped deliberately to avoid errors when cache is missing.
-- Instead, emit a friendly note based on presence check above.
SELECT 'Cache Row For Jorge (skipped - cache missing or not required with fallback)' AS section
WHERE to_regclass('public.user_roles_cache') IS NULL;

-- ============================================================================
-- 7) Final Summary - consolidated pass/fail
-- ============================================================================
WITH
jorge_admin AS (
  SELECT COUNT(*) FILTER (WHERE role_type = 'admin' AND is_active) > 0 AS is_admin
  FROM user_roles
  WHERE user_id = '372ab00b-1d39-4574-8eff-d756b9d6b861'
),
rls_state AS (
  SELECT c.relrowsecurity AS rls_enabled
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = 'courses'
),
admin_policy AS (
  SELECT EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename='courses' AND p.policyname='courses_admin_all'
         ) AS exists,
         EXISTS (
           SELECT 1 FROM pg_policies p
           WHERE p.schemaname='public' AND p.tablename='courses' AND p.policyname='courses_admin_all'
             AND (p.qual ILIKE '%auth_is_admin%' OR p.with_check ILIKE '%auth_is_admin%')
         ) AS uses_auth_is_admin
),
privs AS (
  SELECT has_table_privilege('authenticated', 'public.courses', 'INSERT') AS can_insert
),
fn AS (
  SELECT to_regprocedure('public.auth_is_admin()') AS oid
)
SELECT 
  'Final Summary' AS section,
  (SELECT is_admin FROM jorge_admin)                  AS jorge_is_admin_in_roles,
  (SELECT rls_enabled FROM rls_state)                 AS rls_enabled_on_courses,
  (SELECT exists FROM admin_policy)                   AS has_courses_admin_all_policy,
  (SELECT uses_auth_is_admin FROM admin_policy)       AS admin_policy_uses_auth_is_admin,
  (SELECT can_insert FROM privs)                      AS authenticated_role_can_insert,
  (SELECT (oid IS NOT NULL) FROM fn)                  AS auth_is_admin_function_exists,
  (SELECT CASE WHEN oid IS NULL THEN false ELSE (pg_get_functiondef(oid) ILIKE '%FROM user_roles ur%') END FROM fn) AS auth_is_admin_has_user_roles_fallback;

-- ============================================================================
-- 8) Optional: Test Insert (dry-run example)
-- NOTE: Running as superuser in SQL Editor bypasses RLS, so this does not
--       accurately simulate app behavior. Keep for manual/QA reference only.
--
-- BEGIN;
--   -- Simulate Jorge's JWT (non-admin metadata; fallback should allow admin)
--   SELECT set_config(
--     'request.jwt.claims',
--     '{"sub":"372ab00b-1d39-4574-8eff-d756b9d6b861","role":"authenticated","user_metadata":{"role":"user"}}',
--     true
--   );
--   
--   -- Attempt insert (will succeed here regardless if session is superuser)
--   INSERT INTO public.courses (title, description, instructor_id, created_by, status)
--   VALUES ('[TEST] Verificación de inserción', 'Curso de prueba',
--           '372ab00b-1d39-4574-8eff-d756b9d6b861',
--           '372ab00b-1d39-4574-8eff-d756b9d6b861',
--           'draft')
--   RETURNING id;
-- ROLLBACK;
--
-- For a real end-to-end test, create a temporary admin JWT for Jorge and use
-- the app or PostgREST to perform the insert via the authenticated client.

-- End of verification suite
