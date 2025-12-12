-- Migration 039: Add category column to message_threads table
-- Fixes: "Could not find the 'category' column of 'message_threads' in the schema cache"

-- Check if column exists first, then add it
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'message_threads'
        AND column_name = 'category'
    ) THEN
        ALTER TABLE message_threads ADD COLUMN category TEXT DEFAULT 'general';
        RAISE NOTICE 'Added category column to message_threads';
    ELSE
        RAISE NOTICE 'category column already exists in message_threads';
    END IF;
END $$;

-- Add comment
COMMENT ON COLUMN message_threads.category IS 'Thread category: general, announcement, question, discussion, etc.';

-- Verify
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'message_threads'
ORDER BY ordinal_position;
