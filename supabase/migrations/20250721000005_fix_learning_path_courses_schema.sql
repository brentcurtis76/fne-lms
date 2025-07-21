-- Documentation: Fix learning_path_courses table schema mismatch
-- Issue: E2E tests were using incorrect column names (path_id instead of learning_path_id, sequence instead of sequence_order)
-- This migration ensures the table has the correct structure expected by the application

-- Verify the learning_path_courses table exists with correct structure
DO $$
BEGIN
    -- Check if the table exists and has the expected columns
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'learning_path_courses' 
        AND column_name = 'learning_path_id'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'learning_path_courses table missing learning_path_id column. Expected schema: (id, learning_path_id, course_id, sequence_order, is_required, unlock_criteria, created_at)';
    END IF;

    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'learning_path_courses' 
        AND column_name = 'sequence_order'
        AND table_schema = 'public'
    ) THEN
        RAISE EXCEPTION 'learning_path_courses table missing sequence_order column. Expected schema: (id, learning_path_id, course_id, sequence_order, is_required, unlock_criteria, created_at)';
    END IF;

    RAISE NOTICE 'learning_path_courses table schema verification passed';
END
$$;