-- ============================================================
-- GUEST/ANON GRANTS SECURITY CHECK
-- Purpose: Detect any tables with SELECT grants to anon/public
-- Usage: Run in SQL Editor, should return 0 rows when secure
-- ============================================================

-- Check 1: Tables with direct SELECT grants to 'anon' role
WITH anon_grants AS (
  SELECT 
    schemaname,
    tablename,
    'anon' as granted_to,
    'SELECT' as privilege_type
  FROM pg_tables t
  WHERE schemaname = 'public'
  AND EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = t.schemaname
    AND g.table_name = t.tablename
    AND g.grantee = 'anon'
    AND g.privilege_type = 'SELECT'
  )
),

-- Check 2: Tables with SELECT grants to 'public' (affects everyone including anon)
public_grants AS (
  SELECT 
    schemaname,
    tablename,
    'public' as granted_to,
    'SELECT' as privilege_type
  FROM pg_tables t
  WHERE schemaname = 'public'
  AND EXISTS (
    SELECT 1
    FROM information_schema.role_table_grants g
    WHERE g.table_schema = t.schemaname
    AND g.table_name = t.tablename
    AND g.grantee = 'public'
    AND g.privilege_type = 'SELECT'
  )
),

-- Check 3: Tables without RLS enabled (potential exposure)
no_rls_tables AS (
  SELECT 
    n.nspname as schemaname,
    c.relname as tablename,
    'NO_RLS' as granted_to,
    'RLS_DISABLED' as privilege_type
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND NOT c.relrowsecurity
  AND c.relname NOT LIKE 'pg_%'
  AND c.relname NOT IN ('schema_migrations', 'supabase_functions')
)

-- Combine all security issues
SELECT * FROM anon_grants
UNION ALL
SELECT * FROM public_grants
UNION ALL
SELECT * FROM no_rls_tables
ORDER BY tablename, granted_to;

-- ============================================================
-- EXPECTED RESULT: 0 rows (all tables secured)
-- IF ROWS RETURNED: Security issue - tables exposed to anonymous
-- ============================================================