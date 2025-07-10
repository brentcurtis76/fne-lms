-- Check RLS policies for legacy profiles.role references
-- Run this script directly in Supabase SQL Editor

-- 1. Tables with RLS enabled
SELECT '=== Tables with Row Level Security enabled ===' as info;
SELECT schemaname, tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true
ORDER BY tablename;

-- 2. Policies with legacy profiles.role references
SELECT '=== Policies with legacy profiles.role references ===' as info;
SELECT 
    tablename, 
    policyname,
    cmd,
    roles,
    CASE 
        WHEN qual LIKE '%profiles.role%' THEN 'QUAL has legacy reference'
        WHEN with_check LIKE '%profiles.role%' THEN 'WITH_CHECK has legacy reference'
        ELSE 'No legacy reference'
    END as issue,
    qual,
    with_check
FROM pg_policies 
WHERE schemaname = 'public'
AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
ORDER BY tablename, policyname;

-- 3. Functions with legacy references
SELECT '=== Functions with legacy profiles.role references ===' as info;
SELECT 
    p.proname as function_name,
    'Found legacy reference in function' as issue
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) LIKE '%profiles.role%'
ORDER BY p.proname;

-- 4. Summary
SELECT '=== Summary ===' as info;
SELECT 
    'Policies with legacy references' as type,
    COUNT(*) as count
FROM pg_policies 
WHERE schemaname = 'public'
AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
UNION ALL
SELECT 
    'Functions with legacy references' as type,
    COUNT(*) as count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) LIKE '%profiles.role%';