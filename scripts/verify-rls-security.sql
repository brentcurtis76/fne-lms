-- RLS Security Verification Script
-- Run this after applying RLS hardening to confirm the fix

-- 1. Check RLS status on profiles table
SELECT 
    'RLS Status' as check_type,
    relname as table_name,
    CASE 
        WHEN relrowsecurity THEN '✅ ENABLED' 
        ELSE '❌ DISABLED' 
    END as rls_enabled,
    CASE 
        WHEN relforcerowsecurity THEN '✅ ENFORCED' 
        ELSE '❌ NOT ENFORCED' 
    END as rls_enforced
FROM pg_class
WHERE relname = 'profiles';

-- 2. List all RLS policies on profiles table
SELECT 
    'RLS Policies' as check_type,
    policyname as policy_name,
    cmd as operation,
    roles as applies_to
FROM pg_policies 
WHERE tablename = 'profiles'
ORDER BY policyname;

-- 3. Count policies (should be exactly 4)
SELECT 
    'Policy Count' as check_type,
    COUNT(*) as policy_count,
    CASE 
        WHEN COUNT(*) = 4 THEN '✅ CORRECT (4 policies)' 
        ELSE '❌ INCORRECT (expected 4 policies)' 
    END as status
FROM pg_policies 
WHERE tablename = 'profiles';

-- 4. Verify is_admin() function exists
SELECT 
    'Admin Function' as check_type,
    proname as function_name,
    CASE 
        WHEN proname IS NOT NULL THEN '✅ EXISTS' 
        ELSE '❌ MISSING' 
    END as status
FROM pg_proc 
WHERE proname = 'is_admin' 
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

-- 5. Summary of security status
WITH security_checks AS (
    SELECT 
        (SELECT COUNT(*) FROM pg_class WHERE relname = 'profiles' AND relrowsecurity = true) as rls_enabled,
        (SELECT COUNT(*) FROM pg_class WHERE relname = 'profiles' AND relforcerowsecurity = true) as rls_enforced,
        (SELECT COUNT(*) FROM pg_policies WHERE tablename = 'profiles') as policy_count,
        (SELECT COUNT(*) FROM pg_proc WHERE proname = 'is_admin') as admin_func_exists
)
SELECT 
    'SECURITY SUMMARY' as check_type,
    CASE 
        WHEN rls_enabled = 1 
            AND rls_enforced = 1 
            AND policy_count = 4 
            AND admin_func_exists >= 1 
        THEN '✅ ALL SECURITY CHECKS PASSED - VULNERABILITY FIXED' 
        ELSE '❌ SECURITY CHECKS FAILED - VULNERABILITY STILL EXISTS' 
    END as overall_status,
    jsonb_build_object(
        'rls_enabled', rls_enabled = 1,
        'rls_enforced', rls_enforced = 1,
        'correct_policy_count', policy_count = 4,
        'admin_function_exists', admin_func_exists >= 1
    ) as details
FROM security_checks;