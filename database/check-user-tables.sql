-- Check user-related tables to understand the schema

-- 1. Check auth.users columns
SELECT 'auth.users columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'auth' 
AND table_name = 'users'
ORDER BY ordinal_position;

-- 2. Check user_roles columns
SELECT '', 'user_roles columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- 3. Check profiles columns (if exists)
SELECT '', 'profiles columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'profiles'
ORDER BY ordinal_position;

-- 4. Check consultant_assignments columns
SELECT '', 'consultant_assignments columns:' as info;
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'public' 
AND table_name = 'consultant_assignments'
ORDER BY ordinal_position;