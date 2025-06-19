-- Check the update_updated_at_column function

-- 1. Get the function definition
SELECT 
    routine_name,
    routine_definition
FROM information_schema.routines
WHERE routine_name = 'update_updated_at_column'
AND routine_schema = 'public';

-- 2. Check if this function references user_id
SELECT 
    proname,
    prosrc
FROM pg_proc
WHERE proname = 'update_updated_at_column';

-- 3. Drop the trigger that's causing issues
DROP TRIGGER IF EXISTS update_group_assignment_submissions_updated_at ON group_assignment_submissions;

-- 4. Check for any other triggers on these tables
SELECT 
    tgname as trigger_name,
    tgrelid::regclass as table_name,
    tgtype,
    proname as function_name
FROM pg_trigger t
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE tgrelid::regclass::text LIKE '%group_assignment%';