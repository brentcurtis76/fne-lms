-- Add lesson_id column to blocks table
-- This migration adds the missing lesson_id column that the code expects

-- Step 1: Add the lesson_id column (nullable initially)
ALTER TABLE blocks 
ADD COLUMN lesson_id UUID REFERENCES lessons(id) ON DELETE CASCADE;

-- Step 2: Add index for performance
CREATE INDEX idx_blocks_lesson_id ON blocks(lesson_id);

-- Step 3: Clear existing blocks that don't have proper lesson association
-- WARNING: This will delete all existing blocks! Only run if you're okay with rebuilding content.
-- Comment out the next line if you want to preserve existing blocks:
DELETE FROM blocks WHERE lesson_id IS NULL;

-- Step 4: After migration, you can make lesson_id required (optional)
-- Uncomment the following when you've properly assigned lesson_ids:
-- ALTER TABLE blocks ALTER COLUMN lesson_id SET NOT NULL;

-- Note: Run this migration in your Supabase SQL Editor
-- After running this, you'll need to recreate your lesson content in the lesson editor.