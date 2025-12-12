-- Migration 041: Add message_type column to community_messages table
-- Fixes: "Could not find the 'message_type' column of 'community_messages' in the schema cache"

-- Check if column exists first, then add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'community_messages'
        AND column_name = 'message_type'
    ) THEN
        ALTER TABLE community_messages ADD COLUMN message_type TEXT DEFAULT 'regular';
        RAISE NOTICE 'Added message_type column to community_messages';
    ELSE
        RAISE NOTICE 'message_type column already exists in community_messages';
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN community_messages.message_type IS 'Message type: regular, announcement, system, etc.';

-- Also check for RLS INSERT policy on community_messages
-- First check what policies exist
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO policy_count
    FROM pg_policies
    WHERE tablename = 'community_messages'
    AND cmd = 'INSERT';

    IF policy_count = 0 THEN
        RAISE NOTICE 'No INSERT policy found for community_messages - creating one';
    ELSE
        RAISE NOTICE 'INSERT policy already exists for community_messages';
    END IF;
END $$;

-- Create INSERT policy if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE tablename = 'community_messages'
        AND policyname = 'community_messages_insert_own'
    ) THEN
        CREATE POLICY "community_messages_insert_own" ON community_messages
            FOR INSERT TO authenticated
            WITH CHECK (author_id = auth.uid());
        RAISE NOTICE 'Created INSERT policy for community_messages';
    END IF;
END $$;

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'community_messages'
ORDER BY ordinal_position;
