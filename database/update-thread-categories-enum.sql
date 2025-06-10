-- Update thread_category enum to include new categories
-- This fixes the "invalid input value for enum thread_category" error

-- First, check what values are currently in the enum
SELECT enum_range(NULL::thread_category);

-- Add the new enum values
-- Note: PostgreSQL doesn't allow direct modification of enums, so we need to be careful
-- We'll use ALTER TYPE to add new values

ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'ideas';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'tasks';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'questions';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'announcements';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'resources';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'trabajos'; -- Spanish for tasks
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'custom'; -- For custom categories

-- Verify the updated enum values
SELECT enum_range(NULL::thread_category);

-- If the above doesn't work because the enum doesn't exist or has different structure,
-- here's an alternative approach:

-- Option 2: Recreate the constraint with expanded values
-- First, drop the existing constraint (if it exists as a CHECK constraint instead of enum)
/*
ALTER TABLE message_threads 
DROP CONSTRAINT IF EXISTS message_threads_category_check;

-- Add new constraint with all allowed values
ALTER TABLE message_threads 
ADD CONSTRAINT message_threads_category_check 
CHECK (category IN ('general', 'ideas', 'tasks', 'trabajos', 'questions', 'announcements', 'resources', 'custom'));
*/

-- Option 3: If you need to completely recreate the enum type
-- WARNING: This is more complex and requires updating all references
/*
-- Create new enum type with all values
CREATE TYPE thread_category_new AS ENUM (
    'general',
    'ideas',
    'tasks',
    'trabajos',
    'questions', 
    'announcements',
    'resources',
    'custom'
);

-- Update the column to use the new type
ALTER TABLE message_threads 
ALTER COLUMN category TYPE thread_category_new 
USING category::text::thread_category_new;

-- Drop the old type
DROP TYPE thread_category;

-- Rename the new type
ALTER TYPE thread_category_new RENAME TO thread_category;
*/