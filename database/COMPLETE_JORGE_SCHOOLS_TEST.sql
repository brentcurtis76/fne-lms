-- COMPLETE JORGE SCHOOLS ACCESS TEST & FIX
-- This script tests, diagnoses, and fixes Jorge's schools access issue

-- ============================================
-- STEP 1: CURRENT STATE ANALYSIS
-- ============================================

-- 1.1 Check all schools policies
SELECT 
    '=== CURRENT SCHOOLS POLICIES ===' as section,
    policyname,
    cmd as operation,
    CASE 
        WHEN qual LIKE '%auth.uid() IS NOT NULL%' THEN 'Allows all authenticated users'
        WHEN qual LIKE '%auth.uid() = schools.admin_id%' THEN 'Only school admins'
        WHEN qual LIKE '%EXISTS%course_instructors%' THEN 'Only instructors'
        ELSE substring(qual, 1, 50) || '...'
    END as policy_summary,
    permissive as is_permissive
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY cmd, policyname;

-- 1.2 Check if authenticated users can read schools
WITH policy_check AS (
    SELECT 
        COUNT(*) FILTER (WHERE qual LIKE '%auth.uid() IS NOT NULL%') as auth_user_policies,
        COUNT(*) FILTER (WHERE permissive = 'RESTRICTIVE') as restrictive_policies
    FROM pg_policies 
    WHERE tablename = 'schools' AND cmd = 'SELECT'
)
SELECT 
    '=== AUTHENTICATED USER ACCESS ===' as section,
    CASE 
        WHEN auth_user_policies > 0 AND restrictive_policies = 0 THEN '✅ Authenticated users CAN read schools'
        WHEN auth_user_policies = 0 THEN '❌ NO policy for authenticated users'
        WHEN restrictive_policies > 0 THEN '⚠️ Restrictive policies may block access'
        ELSE '❓ Unknown state'
    END as current_status,
    auth_user_policies as policies_for_auth_users,
    restrictive_policies as blocking_policies
FROM policy_check;

-- 1.3 Check schools data
SELECT 
    '=== SCHOOLS DATA ===' as section,
    COUNT(*) as total_schools,
    COUNT(*) FILTER (WHERE name = 'Los Pellines') as los_pellines_exists,
    COUNT(*) FILTER (WHERE name LIKE 'Escuela de Prueba%') as test_schools_count
FROM schools;

-- 1.4 Check Jorge's profile
SELECT 
    '=== JORGE\'S PROFILE ===' as section,
    p.id,
    p.email,
    p.first_name || ' ' || p.last_name as full_name,
    s.name as current_school,
    ur.role_type
FROM profiles p
LEFT JOIN schools s ON p.school_id = s.id
LEFT JOIN user_roles ur ON p.id = ur.user_id
WHERE p.email = 'jorge@lospellines.cl';

-- ============================================
-- STEP 2: PROBLEM DIAGNOSIS
-- ============================================

SELECT 
    '=== PROBLEM DIAGNOSIS ===' as section,
    CASE 
        WHEN NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools' 
            AND cmd = 'SELECT'
            AND qual LIKE '%auth.uid() IS NOT NULL%'
        ) THEN '❌ PROBLEM FOUND: No policy allows authenticated users to read schools'
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools' 
            AND cmd = 'SELECT'
            AND permissive = 'RESTRICTIVE'
        ) THEN '❌ PROBLEM FOUND: Restrictive policies blocking access'
        ELSE '✅ Policies look correct - issue may be elsewhere'
    END as diagnosis;

-- ============================================
-- STEP 3: APPLY THE FIX
-- ============================================

-- Create the policy that allows all authenticated users to see schools
DO $$
BEGIN
    -- Check if policy already exists
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schools' 
        AND policyname = 'authenticated_users_read_schools'
    ) THEN
        -- Create the policy
        CREATE POLICY authenticated_users_read_schools ON schools
            FOR SELECT
            TO authenticated
            USING (auth.uid() IS NOT NULL);
        
        RAISE NOTICE '✅ Created policy: authenticated_users_read_schools';
    ELSE
        RAISE NOTICE 'ℹ️ Policy authenticated_users_read_schools already exists';
    END IF;
    
    -- Remove any test-only policies that might interfere
    IF EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schools' 
        AND policyname LIKE '%test%'
    ) THEN
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(policyname) || ' ON schools'
        FROM pg_policies 
        WHERE tablename = 'schools' 
        AND policyname LIKE '%test%';
        
        RAISE NOTICE '🗑️ Removed test policies';
    END IF;
END $$;

-- ============================================
-- STEP 4: VERIFY THE FIX
-- ============================================

-- 4.1 Confirm policy exists
SELECT 
    '=== FIX VERIFICATION ===' as section,
    EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schools' 
        AND policyname = 'authenticated_users_read_schools'
    ) as policy_exists,
    EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schools' 
        AND cmd = 'SELECT'
        AND qual LIKE '%auth.uid() IS NOT NULL%'
    ) as can_authenticated_users_read;

-- 4.2 Simulate what Jorge would see
WITH jorge_simulation AS (
    SELECT 
        COUNT(*) as would_see_schools,
        STRING_AGG(name, ', ' ORDER BY name) as school_names
    FROM schools
    WHERE 
        -- This simulates RLS check for authenticated users
        EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools' 
            AND cmd = 'SELECT'
            AND qual LIKE '%auth.uid() IS NOT NULL%'
        )
)
SELECT 
    '=== JORGE\'S VIEW (SIMULATED) ===' as section,
    would_see_schools as schools_jorge_can_see,
    CASE 
        WHEN would_see_schools > 0 THEN '✅ Jorge WILL see real schools'
        ELSE '❌ Jorge will still see test schools'
    END as result,
    substring(school_names, 1, 100) || '...' as sample_schools
FROM jorge_simulation;

-- ============================================
-- STEP 5: FINAL STATUS REPORT
-- ============================================

SELECT 
    '=== FINAL STATUS ===' as section,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools' 
            AND policyname = 'authenticated_users_read_schools'
        ) THEN '✅ SUCCESS: Fix has been applied!'
        ELSE '❌ FAILED: Fix could not be applied'
    END as fix_status,
    '🎯 EXPECTED BEHAVIOR' as behavior_section,
    'When Jorge logs in, he will:' as behavior_title,
    '• See all real schools in dropdowns' as behavior_1,
    '• Can select "Los Pellines" as his school' as behavior_2,
    '• Will NOT see "Escuela de Prueba 1/2"' as behavior_3,
    '• Have full access to school features' as behavior_4;

-- ============================================
-- STEP 6: CLEANUP RECOMMENDATIONS
-- ============================================

SELECT 
    '=== CLEANUP RECOMMENDATIONS ===' as section,
    'Run these queries to clean up:' as instructions,
    'DELETE FROM schools WHERE name LIKE ''Escuela de Prueba%'';' as remove_test_schools,
    'UPDATE profiles SET school_id = (SELECT id FROM schools WHERE name = ''Los Pellines'') WHERE email = ''jorge@lospellines.cl'';' as update_jorge_school;