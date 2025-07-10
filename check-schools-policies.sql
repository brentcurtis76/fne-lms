-- Check current RLS policies on schools table
SELECT 
    policyname,
    permissive,
    roles,
    cmd,
    qual,
    with_check
FROM pg_policies 
WHERE tablename = 'schools'
ORDER BY policyname;