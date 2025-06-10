-- Add support for custom categories in message threads
-- This migration adds a custom_category_name field to the message_threads table

-- Add custom_category_name column to message_threads table
ALTER TABLE message_threads 
ADD COLUMN IF NOT EXISTS custom_category_name VARCHAR(50);

-- Add a comment to explain the field
COMMENT ON COLUMN message_threads.custom_category_name IS 'Name of custom category when category type is "custom"';

-- Update the category check constraint to include the new category types
ALTER TABLE message_threads 
DROP CONSTRAINT IF EXISTS message_threads_category_check;

ALTER TABLE message_threads 
ADD CONSTRAINT message_threads_category_check 
CHECK (category IN ('general', 'resources', 'questions', 'projects', 'ideas', 'tasks', 'custom'));

-- Create an index on custom_category_name for faster queries
CREATE INDEX IF NOT EXISTS idx_message_threads_custom_category 
ON message_threads(custom_category_name) 
WHERE category = 'custom';