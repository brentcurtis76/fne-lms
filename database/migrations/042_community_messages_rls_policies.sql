-- Migration 042: Complete RLS policies for community_messages table
-- Fixes: 403 Forbidden error when inserting messages

-- First, ensure RLS is enabled
ALTER TABLE community_messages ENABLE ROW LEVEL SECURITY;

-- Drop any conflicting policies
DROP POLICY IF EXISTS "community_messages_insert_own" ON community_messages;
DROP POLICY IF EXISTS "community_messages_select" ON community_messages;
DROP POLICY IF EXISTS "community_messages_update_own" ON community_messages;
DROP POLICY IF EXISTS "community_messages_delete_own" ON community_messages;
DROP POLICY IF EXISTS "community_messages_service_role" ON community_messages;

-- Allow authenticated users to INSERT their own messages
CREATE POLICY "community_messages_insert_own" ON community_messages
    FOR INSERT TO authenticated
    WITH CHECK (author_id = auth.uid());

-- Allow authenticated users to SELECT messages (workspace access checked in application)
CREATE POLICY "community_messages_select" ON community_messages
    FOR SELECT TO authenticated
    USING (true);

-- Allow users to UPDATE their own messages
CREATE POLICY "community_messages_update_own" ON community_messages
    FOR UPDATE TO authenticated
    USING (author_id = auth.uid())
    WITH CHECK (author_id = auth.uid());

-- Allow users to DELETE their own messages (soft delete via is_deleted flag)
CREATE POLICY "community_messages_delete_own" ON community_messages
    FOR DELETE TO authenticated
    USING (author_id = auth.uid());

-- Service role bypass for admin operations
CREATE POLICY "community_messages_service_role" ON community_messages
    FOR ALL TO service_role
    USING (true)
    WITH CHECK (true);

-- Add comments
COMMENT ON POLICY "community_messages_insert_own" ON community_messages IS
    'Allows authenticated users to create messages where they are the author';
COMMENT ON POLICY "community_messages_select" ON community_messages IS
    'Allows authenticated users to view all messages (workspace access checked in app)';

-- Verify policies
SELECT
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd
FROM pg_policies
WHERE tablename = 'community_messages'
ORDER BY policyname;
