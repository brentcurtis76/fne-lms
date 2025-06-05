-- Fix user_notifications table schema
-- Add missing columns that the notification system expects

-- Add category column if it doesn't exist
ALTER TABLE user_notifications 
ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'general';

-- Add related_url column if it doesn't exist  
ALTER TABLE user_notifications 
ADD COLUMN IF NOT EXISTS related_url TEXT;

-- Add importance column if it doesn't exist
ALTER TABLE user_notifications 
ADD COLUMN IF NOT EXISTS importance VARCHAR(20) DEFAULT 'normal' CHECK (importance IN ('low', 'normal', 'high'));

-- Update existing notifications to have a category if they don't
UPDATE user_notifications 
SET category = 'general' 
WHERE category IS NULL;

-- Verify the table structure
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'user_notifications' 
AND table_schema = 'public'
ORDER BY ordinal_position;