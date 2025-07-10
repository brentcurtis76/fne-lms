-- =====================================================================
-- CHECK ALL TABLES FOR LEGACY RLS POLICIES
-- Find all policies that still reference profiles.role
-- =====================================================================

-- 1. Find all policies with legacy references
SELECT 
    'Tables with legacy RLS policies:' as report_section,
    COUNT(DISTINCT tablename) as affected_tables_count,
    COUNT(*) as total_policies_with_issues
FROM pg_policies 
WHERE schemaname = 'public'
AND (
    qual LIKE '%profiles.role%' 
    OR with_check LIKE '%profiles.role%'
    OR qual LIKE '%profiles.is_admin%'
    OR with_check LIKE '%profiles.is_admin%'
);

-- 2. List specific tables and policies
SELECT 
    tablename,
    policyname,
    cmd as operation,
    CASE 
        WHEN qual LIKE '%profiles.role%' THEN 'Uses profiles.role in USING clause'
        WHEN with_check LIKE '%profiles.role%' THEN 'Uses profiles.role in WITH CHECK clause'
        WHEN qual LIKE '%profiles.is_admin%' THEN 'Uses profiles.is_admin in USING clause'
        WHEN with_check LIKE '%profiles.is_admin%' THEN 'Uses profiles.is_admin in WITH CHECK clause'
    END as issue
FROM pg_policies 
WHERE schemaname = 'public'
AND (
    qual LIKE '%profiles.role%' 
    OR with_check LIKE '%profiles.role%'
    OR qual LIKE '%profiles.is_admin%'
    OR with_check LIKE '%profiles.is_admin%'
)
ORDER BY tablename, policyname;

-- 3. Tables that might need RLS but don't have it
SELECT 
    'Tables without RLS that might need it:' as report_section,
    tablename
FROM pg_tables
WHERE schemaname = 'public'
AND tablename IN (
    'profiles', 'user_roles', 'courses', 'assignments', 
    'growth_communities', 'generations', 'consultant_assignments',
    'course_assignments', 'schools', 'quiz_submissions',
    'messaging_threads', 'messaging_participants'
)
AND rowsecurity = false
ORDER BY tablename;

-- 4. Summary recommendations
SELECT 
    'RECOMMENDATIONS:' as action,
    'Run database/unified-role-migration-fix.sql to fix all 31 policies' as recommendation
UNION ALL
SELECT 
    'OR:' as action,
    'Fix individual tables using the patterns in RLS_TROUBLESHOOTING_GUIDE.md' as recommendation;