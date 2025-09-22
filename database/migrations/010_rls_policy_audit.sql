-- ============================================================================
-- RLS Policy Audit Report
-- Purpose: Inventory RLS-enabled tables and summarize key policies and grants.
-- Run in Supabase SQL Editor.
-- ============================================================================

-- 1) List all RLS-enabled tables in public
SELECT 
  'RLS Tables' AS section,
  n.nspname AS schemaname,
  c.relname  AS tablename
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
ORDER BY tablename;

-- 2) Policies per table
SELECT 
  'Policies' AS section,
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.roles,
  p.qual,
  p.with_check
FROM pg_policies p
WHERE p.schemaname = 'public'
ORDER BY p.tablename, p.policyname;

-- 3) Admin policy coverage
SELECT 
  'Admin Coverage' AS section,
  t.tablename,
  EXISTS (
    SELECT 1 FROM pg_policies p
    WHERE p.schemaname='public' AND p.tablename=t.tablename
      AND (p.qual ILIKE '%auth_is_admin%' OR p.with_check ILIKE '%auth_is_admin%')
  ) AS has_admin_policy
FROM (
  SELECT c.relname AS tablename
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
) t
ORDER BY t.tablename;

-- 4) Ownership heuristic (tables with created_by)
SELECT 
  'Ownership Tables' AS section,
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'created_by'
ORDER BY table_name;

-- 5) Publish heuristic (tables with is_published)
SELECT 
  'Publish Tables' AS section,
  table_name,
  column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'is_published'
ORDER BY table_name;

-- 6) Privilege summary for authenticated on RLS tables
SELECT 
  'Privileges' AS section,
  t.tablename,
  has_table_privilege('authenticated', format('public.%I', t.tablename), 'SELECT') AS sel,
  has_table_privilege('authenticated', format('public.%I', t.tablename), 'INSERT') AS ins,
  has_table_privilege('authenticated', format('public.%I', t.tablename), 'UPDATE') AS upd,
  has_table_privilege('authenticated', format('public.%I', t.tablename), 'DELETE') AS del
FROM (
  SELECT c.relname AS tablename
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
) t
ORDER BY t.tablename;

