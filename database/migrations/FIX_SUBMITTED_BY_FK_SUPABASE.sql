-- ==============================================================================
-- FIX: submitted_by Foreign Key for PostgREST Auto-Join
-- ==============================================================================
-- Run this in Supabase SQL Editor to fix the PGRST200 error
-- ==============================================================================

-- STEP 1: Show current constraint (for verification)
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema AS foreign_schema,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'lesson_assignment_submissions'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'submitted_by';

-- STEP 2: Drop existing constraint
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_assignment_submissions_submitted_by_fkey'
    AND table_name = 'lesson_assignment_submissions'
  ) THEN
    ALTER TABLE lesson_assignment_submissions
      DROP CONSTRAINT lesson_assignment_submissions_submitted_by_fkey;
    RAISE NOTICE 'Dropped existing constraint';
  END IF;
END $$;

-- STEP 3: Create new constraint pointing to profiles(id)
ALTER TABLE lesson_assignment_submissions
  ADD CONSTRAINT lesson_assignment_submissions_submitted_by_fkey
  FOREIGN KEY (submitted_by)
  REFERENCES profiles(id)
  ON DELETE CASCADE;

-- STEP 4: Verify new constraint
SELECT
  tc.constraint_name,
  kcu.column_name,
  ccu.table_schema AS foreign_schema,
  ccu.table_name AS foreign_table,
  ccu.column_name AS foreign_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'lesson_assignment_submissions'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'submitted_by';

-- STEP 5: Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';

-- ==============================================================================
-- EXPECTED OUTPUT from final SELECT:
-- constraint_name: lesson_assignment_submissions_submitted_by_fkey
-- column_name: submitted_by
-- foreign_schema: public
-- foreign_table: profiles
-- foreign_column: id
-- ==============================================================================
