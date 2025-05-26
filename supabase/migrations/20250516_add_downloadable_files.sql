-- Add downloadable_files column to lessons table
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS downloadable_files JSONB;

-- Add has_files column if it doesn't exist
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS has_files BOOLEAN DEFAULT false;

-- Add entry_quiz and exit_quiz columns if they don't exist
ALTER TABLE lessons 
ADD COLUMN IF NOT EXISTS entry_quiz JSONB,
ADD COLUMN IF NOT EXISTS exit_quiz JSONB,
ADD COLUMN IF NOT EXISTS has_entry_quiz BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS has_exit_quiz BOOLEAN DEFAULT false;

-- Comment on columns
COMMENT ON COLUMN lessons.downloadable_files IS 'Array of file URLs for lesson resources';
COMMENT ON COLUMN lessons.has_files IS 'Flag indicating if lesson has downloadable files';
COMMENT ON COLUMN lessons.entry_quiz IS 'Quiz to be taken before the lesson';
COMMENT ON COLUMN lessons.exit_quiz IS 'Quiz to be taken after the lesson';
COMMENT ON COLUMN lessons.has_entry_quiz IS 'Flag indicating if lesson has an entry quiz';
COMMENT ON COLUMN lessons.has_exit_quiz IS 'Flag indicating if lesson has an exit quiz';

-- Update schema cache
SELECT pg_catalog.pg_reload_conf();
