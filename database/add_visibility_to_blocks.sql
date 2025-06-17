-- Add visibility column to blocks table
-- This migration adds a visibility field to persist block visibility state

-- Step 1: Add the is_visible column (default to true for existing blocks)
ALTER TABLE blocks 
ADD COLUMN is_visible BOOLEAN DEFAULT true;

-- Step 2: Add index for performance when filtering by visibility
CREATE INDEX idx_blocks_is_visible ON blocks(is_visible);

-- Note: Run this migration in your Supabase SQL Editor
-- All existing blocks will be visible by default