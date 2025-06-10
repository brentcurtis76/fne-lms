-- Add custom_category_name column to message_threads table
-- This fixes the "Could not find the 'custom_category_name' column" error

-- Add the column if it doesn't exist
ALTER TABLE message_threads 
ADD COLUMN IF NOT EXISTS custom_category_name VARCHAR(100);

-- Add a comment to explain the column's purpose
COMMENT ON COLUMN message_threads.custom_category_name IS 'Name for custom thread categories when category = "custom"';

-- Verify the column was added
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'message_threads' 
AND column_name = 'custom_category_name';

-- If you want to see all columns in the table
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'message_threads'
ORDER BY ordinal_position;