-- Force cleanup of all group assignment related objects

-- 1. First check what tables actually exist
SELECT 'Checking existing tables:' as info;
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%group_assignment%'
ORDER BY table_name;

-- 2. Drop ALL foreign key constraints related to group assignments
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Find and drop all foreign key constraints
    FOR r IN (
        SELECT 
            tc.table_name, 
            tc.constraint_name
        FROM information_schema.table_constraints tc
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND (tc.table_name LIKE '%group_assignment%' 
             OR tc.constraint_name LIKE '%group_assignment%')
    )
    LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_name, r.constraint_name);
        RAISE NOTICE 'Dropped constraint % on table %', r.constraint_name, r.table_name;
    END LOOP;
END $$;

-- 3. Drop all triggers manually
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT 
            tgname,
            tgrelid::regclass::text as table_name
        FROM pg_trigger
        WHERE tgrelid::regclass::text LIKE '%group_assignment%'
        AND tgisinternal = false
    )
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %s CASCADE', r.tgname, r.table_name);
        RAISE NOTICE 'Dropped trigger % on table %', r.tgname, r.table_name;
    END LOOP;
END $$;

-- 4. Now drop all tables
DROP TABLE IF EXISTS group_assignment_discussions CASCADE;
DROP TABLE IF EXISTS group_assignment_submissions CASCADE;
DROP TABLE IF EXISTS group_assignment_members CASCADE;
DROP TABLE IF EXISTS group_assignment_groups CASCADE;

-- 5. Drop any remaining objects with group_assignment in the name
DO $$
DECLARE
    r RECORD;
BEGIN
    -- Drop views
    FOR r IN (
        SELECT table_name 
        FROM information_schema.views 
        WHERE table_name LIKE '%group_assignment%'
    )
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I CASCADE', r.table_name);
        RAISE NOTICE 'Dropped view %', r.table_name;
    END LOOP;
    
    -- Drop functions
    FOR r IN (
        SELECT routine_name 
        FROM information_schema.routines 
        WHERE routine_name LIKE '%group_assignment%'
        AND routine_schema = 'public'
    )
    LOOP
        EXECUTE format('DROP FUNCTION IF EXISTS %I CASCADE', r.routine_name);
        RAISE NOTICE 'Dropped function %', r.routine_name;
    END LOOP;
END $$;

-- 6. Final verification
SELECT 'Final check - these objects still exist:' as info;
SELECT 
    'Table' as object_type, 
    table_name as object_name
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name LIKE '%group_assignment%'
UNION ALL
SELECT 
    'Trigger' as object_type,
    tgname as object_name
FROM pg_trigger
WHERE tgrelid::regclass::text LIKE '%group_assignment%'
UNION ALL
SELECT 
    'View' as object_type,
    table_name as object_name
FROM information_schema.views
WHERE table_name LIKE '%group_assignment%';

-- If the final check shows no results, you're ready to run the migration!