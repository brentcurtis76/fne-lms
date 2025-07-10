-- Create functions to check for RLS policies with legacy references

-- Function to get tables with RLS enabled
CREATE OR REPLACE FUNCTION get_tables_with_rls()
RETURNS TABLE(tablename text, rowsecurity boolean)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT tablename::text, rowsecurity 
  FROM pg_tables 
  WHERE schemaname = 'public' 
  AND rowsecurity = true
  ORDER BY tablename;
$$;

-- Function to get policies with legacy profiles.role references
CREATE OR REPLACE FUNCTION get_policies_with_legacy_role()
RETURNS TABLE(
  tablename text, 
  policyname text,
  cmd text,
  roles text[],
  has_qual_reference boolean,
  has_check_reference boolean,
  qual text,
  with_check text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT 
    tablename::text, 
    policyname::text,
    cmd::text,
    roles,
    (qual LIKE '%profiles.role%') as has_qual_reference,
    (with_check LIKE '%profiles.role%') as has_check_reference,
    qual::text,
    with_check::text
  FROM pg_policies 
  WHERE schemaname = 'public'
  AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
  ORDER BY tablename, policyname;
$$;

-- Function to get functions with legacy profiles.role references
CREATE OR REPLACE FUNCTION get_functions_with_legacy_role()
RETURNS TABLE(function_name text)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT p.proname::text as function_name
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
  AND pg_get_functiondef(p.oid) LIKE '%profiles.role%'
  ORDER BY p.proname;
$$;

-- Grant execute permissions to authenticated users (for admin check)
GRANT EXECUTE ON FUNCTION get_tables_with_rls() TO authenticated;
GRANT EXECUTE ON FUNCTION get_policies_with_legacy_role() TO authenticated;
GRANT EXECUTE ON FUNCTION get_functions_with_legacy_role() TO authenticated;