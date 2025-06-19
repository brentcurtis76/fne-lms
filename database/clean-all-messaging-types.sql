-- Complete cleanup of ALL messaging system custom types
-- Run this to fix any "type already exists" errors

-- First, let's see what custom types exist
DO $$
BEGIN
    RAISE NOTICE 'Existing custom types before cleanup:';
END $$;

SELECT 
    typname as type_name,
    typtype as type_type
FROM pg_type
WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND typtype = 'e' -- enum types
AND typname IN ('message_type', 'thread_category', 'reaction_type', 'mention_type', 'attachment_type', 'activity_type')
ORDER BY typname;

-- Drop ALL messaging-related enum types
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS thread_category CASCADE;
DROP TYPE IF EXISTS reaction_type CASCADE;
DROP TYPE IF EXISTS mention_type CASCADE;
DROP TYPE IF EXISTS attachment_type CASCADE;
DROP TYPE IF EXISTS activity_type CASCADE;

-- Also check for any other custom types that might exist
-- This will catch any types we might have missed
DO $$
DECLARE
    type_rec RECORD;
BEGIN
    FOR type_rec IN 
        SELECT typname 
        FROM pg_type
        WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
        AND typtype = 'e' -- enum types
        AND typname LIKE '%message%' OR typname LIKE '%thread%' OR typname LIKE '%mention%'
    LOOP
        EXECUTE format('DROP TYPE IF EXISTS %I CASCADE', type_rec.typname);
        RAISE NOTICE 'Dropped type: %', type_rec.typname;
    END LOOP;
END $$;

-- Verification
DO $$
DECLARE
    remaining_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO remaining_count
    FROM pg_type
    WHERE typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
    AND typtype = 'e'
    AND (typname LIKE '%message%' OR typname LIKE '%thread%' OR typname LIKE '%mention%' 
         OR typname IN ('reaction_type', 'attachment_type', 'activity_type'));
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Type Cleanup Complete ===';
    RAISE NOTICE 'Remaining messaging-related types: %', remaining_count;
    IF remaining_count = 0 THEN
        RAISE NOTICE 'All messaging types have been removed. You can now run messaging-system.sql';
    ELSE
        RAISE NOTICE 'Warning: Some types may still exist. Check the output above.';
    END IF;
    RAISE NOTICE '';
END $$;