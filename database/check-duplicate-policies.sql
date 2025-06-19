-- Check for duplicate policies across all tables
-- This query will show any table/policy combinations that appear more than once

WITH policy_counts AS (
    SELECT 
        schemaname,
        tablename,
        policyname,
        COUNT(*) as policy_count
    FROM pg_policies
    WHERE schemaname = 'public'
    GROUP BY schemaname, tablename, policyname
    HAVING COUNT(*) > 1
)
SELECT 
    tablename as "Table",
    policyname as "Policy Name",
    policy_count as "Count"
FROM policy_counts
ORDER BY tablename, policyname;

-- Check specifically for community_workspaces policies
SELECT 
    '\nPolicies on community_workspaces table:' as info;

SELECT 
    policyname as "Policy Name",
    cmd as "Command",
    roles as "Roles",
    CASE 
        WHEN qual IS NOT NULL THEN 'Has USING clause'
        ELSE 'No USING clause'
    END as "USING",
    CASE 
        WHEN with_check IS NOT NULL THEN 'Has WITH CHECK clause'
        ELSE 'No WITH CHECK clause'
    END as "WITH CHECK"
FROM pg_policies
WHERE schemaname = 'public' 
AND tablename = 'community_workspaces'
ORDER BY policyname;

-- Check for any policies that might have been created without DROP IF EXISTS
-- by looking at recently modified policies
SELECT 
    '\nRecently created/modified policies (if trackable):' as info;

SELECT DISTINCT
    n.nspname AS schema_name,
    c.relname AS table_name,
    p.polname AS policy_name,
    p.polcmd AS command,
    CASE p.polcmd
        WHEN 'r' THEN 'SELECT'
        WHEN 'a' THEN 'INSERT'
        WHEN 'w' THEN 'UPDATE'
        WHEN 'd' THEN 'DELETE'
        ELSE 'UNKNOWN'
    END AS command_text
FROM pg_policy p
JOIN pg_class c ON p.polrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public'
AND c.relname = 'community_workspaces'
ORDER BY table_name, policy_name;