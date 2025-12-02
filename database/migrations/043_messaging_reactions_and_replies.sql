-- Migration 043: Add message reactions table and reply_to_id column
-- Enables reactions (likes, hearts, etc.) and reply threading in community messages

-- =============================================================================
-- Part 1: Add reply_to_id column to community_messages
-- =============================================================================

-- Add reply_to_id column for message threading
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'community_messages'
        AND column_name = 'reply_to_id'
    ) THEN
        ALTER TABLE community_messages ADD COLUMN reply_to_id UUID REFERENCES community_messages(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added reply_to_id column to community_messages';
    ELSE
        RAISE NOTICE 'reply_to_id column already exists in community_messages';
    END IF;
END $$;

-- Create index for reply lookups
CREATE INDEX IF NOT EXISTS idx_community_messages_reply_to ON community_messages(reply_to_id);

-- =============================================================================
-- Part 2: Create message_reactions table (drop if exists to start fresh)
-- =============================================================================

-- Drop the table if it exists with incomplete schema
DROP TABLE IF EXISTS message_reactions CASCADE;

-- Create the message_reactions table
CREATE TABLE message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES community_messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    reaction_type TEXT NOT NULL CHECK (reaction_type IN ('thumbs_up', 'heart', 'lightbulb', 'celebration', 'eyes', 'question')),
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Each user can only have one reaction of each type per message
    UNIQUE(message_id, user_id, reaction_type)
);

-- Create indexes for message_reactions
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
CREATE INDEX idx_message_reactions_user ON message_reactions(user_id);
CREATE INDEX idx_message_reactions_type ON message_reactions(reaction_type);

-- Add comments
COMMENT ON TABLE message_reactions IS 'Stores user reactions (likes, hearts, etc.) on community messages';
COMMENT ON COLUMN message_reactions.reaction_type IS 'Type of reaction: thumbs_up, heart, lightbulb, celebration, eyes, question';

-- =============================================================================
-- Part 3: RLS Policies for message_reactions
-- =============================================================================

-- Enable RLS
ALTER TABLE message_reactions ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can view reactions
CREATE POLICY "message_reactions_select" ON message_reactions
    FOR SELECT
    TO authenticated
    USING (true);

-- Users can add reactions (only for themselves)
CREATE POLICY "message_reactions_insert" ON message_reactions
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can remove their own reactions
CREATE POLICY "message_reactions_delete" ON message_reactions
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- Service role can do everything
CREATE POLICY "message_reactions_service_role" ON message_reactions
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- Part 4: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, DELETE ON message_reactions TO authenticated;
GRANT ALL ON message_reactions TO service_role;

-- =============================================================================
-- Verification
-- =============================================================================

-- Verify the table was created correctly
DO $$
DECLARE
    col_count INT;
BEGIN
    SELECT COUNT(*) INTO col_count
    FROM information_schema.columns
    WHERE table_name = 'message_reactions';

    IF col_count >= 5 THEN
        RAISE NOTICE 'Migration 043 complete: message_reactions table created with % columns', col_count;
    ELSE
        RAISE WARNING 'Migration 043 issue: message_reactions only has % columns', col_count;
    END IF;
END $$;

-- Verify reply_to_id column exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'community_messages'
        AND column_name = 'reply_to_id'
    ) THEN
        RAISE NOTICE 'reply_to_id column exists in community_messages';
    ELSE
        RAISE WARNING 'reply_to_id column NOT FOUND in community_messages';
    END IF;
END $$;
