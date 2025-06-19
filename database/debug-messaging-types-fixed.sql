-- Debug script to understand the messaging types issue (FIXED)

-- 1. First, let's see ALL custom enum types in the database
SELECT 
    'ALL ENUM TYPES:' as info;
    
SELECT 
    n.nspname as schema_name,
    t.typname as type_name,
    t.oid as type_oid,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
LEFT JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typtype = 'e'
GROUP BY n.nspname, t.typname, t.oid
ORDER BY n.nspname, t.typname;

-- 2. Check if mention_type specifically exists
SELECT 
    'MENTION_TYPE CHECK:' as info,
    EXISTS(
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'mention_type' 
        AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) as mention_type_exists;

-- 3. Try to drop it with more detail
DO $$
BEGIN
    -- Check if type exists
    IF EXISTS (
        SELECT 1 
        FROM pg_type 
        WHERE typname = 'mention_type' 
        AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    ) THEN
        RAISE NOTICE 'mention_type exists, attempting to drop...';
        
        -- Try to drop it
        BEGIN
            DROP TYPE mention_type CASCADE;
            RAISE NOTICE 'Successfully dropped mention_type';
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Error dropping mention_type: %', SQLERRM;
        END;
    ELSE
        RAISE NOTICE 'mention_type does not exist';
    END IF;
END $$;

-- 4. Check what objects depend on mention_type
SELECT 
    'DEPENDENCIES:' as info;

SELECT 
    classid::regclass AS dependent_class,
    objid,
    objsubid,
    deptype
FROM pg_depend
WHERE refobjid = (
    SELECT oid 
    FROM pg_type 
    WHERE typname = 'mention_type' 
    AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
)
AND refobjid IS NOT NULL
AND deptype != 'i';  -- exclude implicit dependencies

-- 5. Check if there are any columns using this type
SELECT 
    'COLUMNS USING MENTION_TYPE:' as info;

SELECT 
    table_schema,
    table_name,
    column_name,
    data_type,
    udt_name
FROM information_schema.columns
WHERE data_type = 'USER-DEFINED'
AND udt_name = 'mention_type';

-- 6. Check for tables that might have messaging-related columns
SELECT 
    'MESSAGING TABLES CHECK:' as info;

SELECT 
    table_name,
    COUNT(*) as column_count
FROM information_schema.tables
WHERE table_schema = 'public'
AND (table_name LIKE '%message%' OR table_name LIKE '%mention%' OR table_name LIKE '%thread%')
GROUP BY table_name
ORDER BY table_name;

-- 7. Nuclear option - drop all messaging-related types regardless of dependencies
-- ONLY UNCOMMENT IF YOU'RE SURE YOU WANT TO FORCE DROP
/*
DO $$
DECLARE
    type_rec RECORD;
BEGIN
    -- Drop all messaging-related enum types with CASCADE
    FOR type_rec IN 
        SELECT t.typname 
        FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typtype = 'e'
        AND n.nspname = 'public'
        AND (t.typname LIKE '%message%' OR t.typname LIKE '%mention%' OR t.typname LIKE '%thread%' 
             OR t.typname IN ('reaction_type', 'attachment_type', 'activity_type'))
    LOOP
        BEGIN
            EXECUTE format('DROP TYPE %I CASCADE', type_rec.typname);
            RAISE NOTICE 'Dropped type: %', type_rec.typname;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not drop type %: %', type_rec.typname, SQLERRM;
        END;
    END LOOP;
END $$;
*/