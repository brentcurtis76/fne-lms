-- Debug script to understand the messaging types issue

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
    '',
    'MENTION_TYPE CHECK:' as info;

SELECT 
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
    '',
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
AND deptype != 'i';  -- exclude implicit dependencies

-- 5. Check if there are any columns using this type
SELECT 
    '',
    'COLUMNS USING MENTION_TYPE:' as info;

SELECT 
    schemaname,
    tablename,
    columnname,
    data_type
FROM information_schema.columns
WHERE data_type = 'USER-DEFINED'
AND udt_name = 'mention_type';

-- 6. Force drop all tables that might be using mention_type
-- This is a last resort approach
DO $$
DECLARE
    tab RECORD;
BEGIN
    RAISE NOTICE 'Checking for tables using mention_type...';
    
    FOR tab IN
        SELECT DISTINCT 
            c.table_schema,
            c.table_name
        FROM information_schema.columns c
        WHERE c.data_type = 'USER-DEFINED'
        AND c.udt_name = 'mention_type'
    LOOP
        RAISE NOTICE 'Table %.% uses mention_type', tab.table_schema, tab.table_name;
        -- Uncomment the next line only if you want to drop these tables
        -- EXECUTE format('DROP TABLE IF EXISTS %I.%I CASCADE', tab.table_schema, tab.table_name);
    END LOOP;
END $$;