-- Script to handle existing messaging system tables

-- 1. First, let's see what messaging tables and types already exist
SELECT 'EXISTING MESSAGING TABLES:' as info;

SELECT 
    table_name,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = t.table_name) as columns,
    pg_size_pretty(pg_total_relation_size(table_name::regclass)) as size,
    (SELECT COUNT(*) FROM information_schema.table_constraints 
     WHERE table_name = t.table_name AND constraint_type = 'PRIMARY KEY') as has_pk
FROM information_schema.tables t
WHERE table_schema = 'public'
AND (table_name LIKE '%message%' OR table_name LIKE '%mention%' OR table_name LIKE '%thread%')
ORDER BY table_name;

-- 2. Check if tables have data
SELECT '', 'ROW COUNTS:' as info;

DO $$
DECLARE
    tab RECORD;
    row_count BIGINT;
BEGIN
    FOR tab IN
        SELECT table_name
        FROM information_schema.tables
        WHERE table_schema = 'public'
        AND (table_name LIKE '%message%' OR table_name LIKE '%mention%' OR table_name LIKE '%thread%')
        ORDER BY table_name
    LOOP
        EXECUTE format('SELECT COUNT(*) FROM %I', tab.table_name) INTO row_count;
        RAISE NOTICE '% has % rows', tab.table_name, row_count;
    END LOOP;
END $$;

-- 3. OPTION A: Drop all messaging tables and types to start fresh
-- ONLY RUN THIS IF YOU DON'T HAVE IMPORTANT DATA IN THESE TABLES
/*
-- Drop all messaging-related tables
DROP TABLE IF EXISTS message_activity_log CASCADE;
DROP TABLE IF EXISTS message_attachments CASCADE;
DROP TABLE IF EXISTS message_reactions CASCADE;
DROP TABLE IF EXISTS message_mentions CASCADE;
DROP TABLE IF EXISTS community_messages CASCADE;
DROP TABLE IF EXISTS message_threads CASCADE;
DROP TABLE IF EXISTS post_mentions CASCADE;
DROP TABLE IF EXISTS user_mentions CASCADE;
DROP TABLE IF EXISTS workspace_messages CASCADE;

-- Drop all messaging-related types
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS thread_category CASCADE;
DROP TYPE IF EXISTS reaction_type CASCADE;
DROP TYPE IF EXISTS mention_type CASCADE;
DROP TYPE IF EXISTS attachment_type CASCADE;
DROP TYPE IF EXISTS activity_type CASCADE;

RAISE NOTICE 'All messaging tables and types have been dropped. You can now run messaging-system.sql';
*/

-- 4. OPTION B: Check if the existing tables match the expected schema
-- This helps determine if we can skip the migration
SELECT '', 'SCHEMA CHECK:' as info;

-- Check message_threads structure
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'message_threads'
AND table_schema = 'public'
ORDER BY ordinal_position;

-- 5. Check existing types and their values
SELECT '', 'EXISTING ENUM TYPES:' as info;

SELECT 
    t.typname as type_name,
    array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
AND t.typname IN ('message_type', 'thread_category', 'reaction_type', 'mention_type', 'attachment_type', 'activity_type')
GROUP BY t.typname
ORDER BY t.typname;