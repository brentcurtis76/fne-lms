-- Execute these queries in Supabase SQL Editor to check for legacy RLS policies

-- 1. Check tables with RLS enabled (first 20)
SELECT 'Tables with RLS enabled:' as description;
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
AND rowsecurity = true
ORDER BY tablename
LIMIT 20;

-- 2. Check for policies with legacy profiles.role references
SELECT '---' as divider;
SELECT 'Policies with legacy profiles.role references:' as description;
SELECT 
    tablename, 
    policyname,
    cmd,
    CASE 
        WHEN qual LIKE '%profiles.role%' THEN 'QUAL'
        WHEN with_check LIKE '%profiles.role%' THEN 'WITH_CHECK'
    END as reference_location,
    SUBSTRING(
        CASE 
            WHEN qual LIKE '%profiles.role%' THEN qual
            WHEN with_check LIKE '%profiles.role%' THEN with_check
        END,
        POSITION('profiles.role' IN 
            CASE 
                WHEN qual LIKE '%profiles.role%' THEN qual
                WHEN with_check LIKE '%profiles.role%' THEN with_check
            END
        ) - 20,
        60
    ) as context
FROM pg_policies 
WHERE schemaname = 'public'
AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%')
ORDER BY tablename, policyname;

-- 3. Summary count
SELECT '---' as divider;
SELECT 'Summary:' as description;
SELECT 
    COUNT(*) as total_policies_with_legacy_references
FROM pg_policies 
WHERE schemaname = 'public'
AND (qual LIKE '%profiles.role%' OR with_check LIKE '%profiles.role%');

-- 4. Check functions with legacy references
SELECT '---' as divider;
SELECT 'Functions with legacy profiles.role references:' as description;
SELECT 
    p.proname as function_name,
    'Contains profiles.role reference' as issue
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND pg_get_functiondef(p.oid) LIKE '%profiles.role%'
ORDER BY p.proname
LIMIT 10;