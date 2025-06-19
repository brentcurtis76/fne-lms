-- Cleanup script for messaging system
-- Run this BEFORE running messaging-system.sql to avoid conflicts

-- ============================================
-- 1. DROP ALL CUSTOM TYPES (if they exist)
-- ============================================

-- Drop enum types
DROP TYPE IF EXISTS message_type CASCADE;
DROP TYPE IF EXISTS thread_category CASCADE;
DROP TYPE IF EXISTS reaction_type CASCADE;

-- ============================================
-- 2. DROP ALL POLICIES
-- ============================================

-- Drop policies on message_threads
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_threads'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON message_threads', pol.policyname);
    END LOOP;
END $$;

-- Drop policies on community_messages
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'community_messages'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON community_messages', pol.policyname);
    END LOOP;
END $$;

-- Drop policies on message_mentions
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_mentions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON message_mentions', pol.policyname);
    END LOOP;
END $$;

-- Drop policies on message_reactions
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_reactions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON message_reactions', pol.policyname);
    END LOOP;
END $$;

-- Drop policies on message_attachments
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_attachments'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON message_attachments', pol.policyname);
    END LOOP;
END $$;

-- Drop policies on message_activity_log
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'message_activity_log'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON message_activity_log', pol.policyname);
    END LOOP;
END $$;

-- ============================================
-- 3. DROP ALL TRIGGERS
-- ============================================

-- Drop triggers on all messaging tables
DO $$
DECLARE
    trig RECORD;
BEGIN
    FOR trig IN 
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
        AND event_object_table IN ('message_threads', 'community_messages', 'message_mentions', 'message_reactions', 'message_attachments', 'message_activity_log')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trig.trigger_name, trig.event_object_table);
    END LOOP;
END $$;

-- ============================================
-- 4. DROP ALL FUNCTIONS
-- ============================================

-- Drop messaging-related functions
DROP FUNCTION IF EXISTS get_thread_participants(UUID);
DROP FUNCTION IF EXISTS get_user_mention_count(UUID, UUID);
DROP FUNCTION IF EXISTS create_message_activity(UUID, UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS get_message_statistics(UUID);

-- ============================================
-- 5. DROP ALL INDEXES
-- ============================================

-- Drop indexes on message_threads
DROP INDEX IF EXISTS idx_message_threads_workspace;
DROP INDEX IF EXISTS idx_message_threads_category;
DROP INDEX IF EXISTS idx_message_threads_pinned;
DROP INDEX IF EXISTS idx_message_threads_archived;

-- Drop indexes on community_messages
DROP INDEX IF EXISTS idx_community_messages_thread;
DROP INDEX IF EXISTS idx_community_messages_author;
DROP INDEX IF EXISTS idx_community_messages_parent;
DROP INDEX IF EXISTS idx_community_messages_created;

-- Drop indexes on message_mentions
DROP INDEX IF EXISTS idx_message_mentions_message;
DROP INDEX IF EXISTS idx_message_mentions_user;
DROP INDEX IF EXISTS idx_message_mentions_read;

-- Drop indexes on message_reactions
DROP INDEX IF EXISTS idx_message_reactions_message;
DROP INDEX IF EXISTS idx_message_reactions_user;
DROP INDEX IF EXISTS idx_message_reactions_type;

-- Drop indexes on message_attachments
DROP INDEX IF EXISTS idx_message_attachments_message;
DROP INDEX IF EXISTS idx_message_attachments_type;

-- Drop indexes on message_activity_log
DROP INDEX IF EXISTS idx_message_activity_log_thread;
DROP INDEX IF EXISTS idx_message_activity_log_user;
DROP INDEX IF EXISTS idx_message_activity_log_created;

-- ============================================
-- 6. VERIFICATION
-- ============================================

-- Check if types exist
SELECT 
    'Custom Types' as object_type,
    string_agg(typname, ', ') as names
FROM pg_type
WHERE typname IN ('message_type', 'thread_category', 'reaction_type')
AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')

UNION ALL

-- Count remaining policies
SELECT 
    'Policies' as object_type,
    COUNT(*)::text as names
FROM pg_policies
WHERE tablename IN ('message_threads', 'community_messages', 'message_mentions', 'message_reactions', 'message_attachments', 'message_activity_log')
AND schemaname = 'public'

UNION ALL

-- Count remaining triggers
SELECT 
    'Triggers' as object_type,
    COUNT(*)::text as names
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table IN ('message_threads', 'community_messages', 'message_mentions', 'message_reactions', 'message_attachments', 'message_activity_log');

-- Final message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Messaging System Cleanup Complete ===';
    RAISE NOTICE 'You can now run messaging-system.sql without conflicts';
    RAISE NOTICE '';
END $$;