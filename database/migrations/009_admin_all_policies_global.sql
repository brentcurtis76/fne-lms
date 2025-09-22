-- ============================================================================
-- Global Admin-All Policies Generator
-- Purpose: Ensure every RLS-enabled table has an admin-all policy so admins
--          never get blocked. Uses public.auth_is_admin() for USING/WITH CHECK.
-- Safe to run multiple times; skips tables that already have an admin policy.
-- Run in Supabase SQL Editor.
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  v_has_admin_policy boolean;
  v_policy_name text;
BEGIN
  FOR r IN (
    SELECT n.nspname AS schemaname,
           c.relname  AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'              -- ordinary tables
      AND c.relrowsecurity = true      -- RLS enabled
  ) LOOP
    -- Check if table already has a policy that references auth_is_admin
    SELECT EXISTS (
      SELECT 1
      FROM pg_policies p
      WHERE p.schemaname = r.schemaname
        AND p.tablename  = r.tablename
        AND (p.qual ILIKE '%auth_is_admin%' OR p.with_check ILIKE '%auth_is_admin%')
    ) INTO v_has_admin_policy;

    IF NOT v_has_admin_policy THEN
      -- Construct a consistent policy name: <table>_admin_all
      v_policy_name := r.tablename || '_admin_all';

      EXECUTE format(
        'CREATE POLICY %I ON %I.%I FOR ALL TO authenticated USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin())',
        v_policy_name, r.schemaname, r.tablename
      );

      RAISE NOTICE 'Created admin policy % for %.% ', v_policy_name, r.schemaname, r.tablename;
    ELSE
      RAISE NOTICE 'Skipped %.% (admin policy already present)', r.schemaname, r.tablename;
    END IF;
  END LOOP;
END $$;

-- Report coverage
SELECT 
  p.schemaname,
  p.tablename,
  p.policyname,
  p.cmd,
  p.qual,
  p.with_check
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
WHERE p.schemaname = 'public'
  AND c.relkind = 'r'
  AND c.relrowsecurity = true
  AND (p.qual ILIKE '%auth_is_admin%' OR p.with_check ILIKE '%auth_is_admin%')
ORDER BY p.tablename, p.policyname;

