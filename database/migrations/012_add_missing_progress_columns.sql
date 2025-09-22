-- ============================================================================
-- Add Missing Progress Tracking Columns
-- Ensures learning_path_assignments has all required columns for progress tracking
-- ============================================================================

-- Check current columns
SELECT 
  '=== CURRENT COLUMNS IN learning_path_assignments ===' as section,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'learning_path_assignments'
ORDER BY ordinal_position;

-- Add missing columns if they don't exist
DO $$
BEGIN
  -- Add total_time_spent_minutes if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_assignments'
      AND column_name = 'total_time_spent_minutes'
  ) THEN
    ALTER TABLE public.learning_path_assignments
    ADD COLUMN total_time_spent_minutes integer DEFAULT 0;
    
    RAISE NOTICE 'Added total_time_spent_minutes column';
  ELSE
    RAISE NOTICE 'total_time_spent_minutes column already exists';
  END IF;

  -- Add last_activity_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_assignments'
      AND column_name = 'last_activity_at'
  ) THEN
    ALTER TABLE public.learning_path_assignments
    ADD COLUMN last_activity_at timestamp with time zone;
    
    RAISE NOTICE 'Added last_activity_at column';
  ELSE
    RAISE NOTICE 'last_activity_at column already exists';
  END IF;

  -- Add progress_percentage if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_assignments'
      AND column_name = 'progress_percentage'
  ) THEN
    ALTER TABLE public.learning_path_assignments
    ADD COLUMN progress_percentage integer DEFAULT 0 CHECK (progress_percentage >= 0 AND progress_percentage <= 100);
    
    RAISE NOTICE 'Added progress_percentage column';
  ELSE
    RAISE NOTICE 'progress_percentage column already exists';
  END IF;

  -- Add completed_at if missing
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'learning_path_assignments'
      AND column_name = 'completed_at'
  ) THEN
    ALTER TABLE public.learning_path_assignments
    ADD COLUMN completed_at timestamp with time zone;
    
    RAISE NOTICE 'Added completed_at column';
  ELSE
    RAISE NOTICE 'completed_at column already exists';
  END IF;
END $$;

-- Verify columns were added
SELECT 
  '=== UPDATED COLUMNS IN learning_path_assignments ===' as section,
  column_name,
  data_type,
  column_default,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'learning_path_assignments'
ORDER BY ordinal_position;