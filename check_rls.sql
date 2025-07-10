-- Check if RLS is enabled on schools table
SELECT relname, relrowsecurity 
FROM pg_class 
WHERE relname = 'schools';

-- Check policies on schools table
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'schools';
EOF < /dev/null