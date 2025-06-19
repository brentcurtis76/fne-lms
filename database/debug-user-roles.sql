-- Debug user_roles table structure

-- Check the exact columns in user_roles
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'user_roles'
ORDER BY ordinal_position;

-- Check if there's a profiles table
SELECT 
    table_name
FROM information_schema.tables
WHERE table_schema = 'public' 
AND table_name IN ('profiles', 'user_profiles', 'users')
ORDER BY table_name;

-- Check primary key of user_roles
SELECT 
    tc.constraint_name,
    tc.constraint_type,
    kcu.column_name
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
    ON tc.constraint_name = kcu.constraint_name
    AND tc.table_schema = kcu.table_schema
WHERE tc.table_schema = 'public'
AND tc.table_name = 'user_roles'
AND tc.constraint_type = 'PRIMARY KEY';