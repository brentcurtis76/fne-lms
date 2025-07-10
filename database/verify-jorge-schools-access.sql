-- Comprehensive Schools Access Verification for Jorge
-- This script guarantees Jorge can see schools in the FNE LMS

-- 1. Check current policies on schools table
SELECT 
    '1. Current Schools RLS Policies' as test_section,
    policyname,
    cmd,
    roles,
    qual,
    permissive
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY cmd, policyname;

-- 2. Check if authenticated users read policy exists
SELECT 
    '2. Authenticated Users Read Policy Check' as test_section,
    EXISTS (
        SELECT 1 
        FROM pg_policies 
        WHERE tablename = 'schools' 
        AND cmd = 'SELECT'
        AND (
            qual LIKE '%auth.uid() IS NOT NULL%'
            OR policyname LIKE '%authenticated%'
        )
    ) as has_authenticated_read_policy;

-- 3. Check for any restrictive policies that might block access
SELECT 
    '3. Restrictive Policies Check' as test_section,
    policyname,
    qual
FROM pg_policies 
WHERE tablename = 'schools'
AND cmd = 'SELECT'
AND permissive = 'RESTRICTIVE';

-- 4. Check what an authenticated user would see
WITH auth_user_test AS (
    SELECT 
        CASE 
            WHEN EXISTS (
                SELECT 1 FROM pg_policies 
                WHERE tablename = 'schools' 
                AND cmd = 'SELECT'
                AND qual LIKE '%auth.uid() IS NOT NULL%'
            ) THEN 'Can see schools'
            ELSE 'Cannot see schools'
        END as access_status
)
SELECT 
    '4. Authenticated User Access Test' as test_section,
    access_status,
    (SELECT COUNT(*) FROM schools) as total_schools_in_db
FROM auth_user_test;

-- 5. Verify specific users can see schools (including Jorge)
WITH user_checks AS (
    SELECT 
        'Jorge Parra' as user_name,
        '372ab00b-1d39-4574-8eff-d756b9d6b861'::uuid as user_id
    UNION ALL
    SELECT 
        'Brent Curtis',
        (SELECT id FROM auth.users WHERE email = 'brent@perrotuertocm.cl' LIMIT 1)
)
SELECT 
    '5. User-Specific Access Check' as test_section,
    user_name,
    user_id,
    EXISTS (SELECT 1 FROM profiles WHERE id = user_id) as has_profile,
    EXISTS (SELECT 1 FROM user_roles WHERE user_id = user_checks.user_id) as has_role
FROM user_checks;

-- 6. Final guarantee check
SELECT 
    '6. FINAL VERDICT' as test_section,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools' 
            AND cmd = 'SELECT'
            AND qual LIKE '%auth.uid() IS NOT NULL%'
        ) AND NOT EXISTS (
            SELECT 1 FROM pg_policies 
            WHERE tablename = 'schools'
            AND cmd = 'SELECT'
            AND permissive = 'RESTRICTIVE'
        ) THEN '✅ FIXED: Jorge WILL see real schools'
        ELSE '❌ NOT FIXED: Jorge will see test schools'
    END as jorge_schools_status,
    (SELECT COUNT(*) FROM schools) as schools_count,
    (SELECT COUNT(*) FROM schools WHERE name = 'Los Pellines') as los_pellines_exists;

-- 7. If not fixed, create the missing policy
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'schools' 
        AND policyname = 'authenticated_users_read_schools'
    ) THEN
        RAISE NOTICE 'Creating missing authenticated users read policy...';
        
        CREATE POLICY authenticated_users_read_schools ON schools
            FOR SELECT
            TO authenticated
            USING (auth.uid() IS NOT NULL);
            
        RAISE NOTICE '✅ Policy created successfully!';
    ELSE
        RAISE NOTICE '✅ Authenticated users read policy already exists';
    END IF;
END $$;

-- 8. Final verification after fix
SELECT 
    '8. POST-FIX VERIFICATION' as test_section,
    policyname,
    cmd,
    qual
FROM pg_policies 
WHERE tablename = 'schools'
AND policyname = 'authenticated_users_read_schools';