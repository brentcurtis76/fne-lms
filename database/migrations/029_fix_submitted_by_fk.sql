-- Fix submitted_by Foreign Key Constraint
-- Changes FK from auth.users(id) to profiles(id) for PostgREST auto-join support
-- Run this in Supabase SQL Editor if migration 029 was already applied

-- Step 1: Drop existing constraint if it references auth.users
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
  ELSE
    RAISE NOTICE 'No existing constraint found';
  END IF;
END $$;

-- Step 2: Add new constraint referencing profiles(id) for PostgREST joins
ALTER TABLE lesson_assignment_submissions
  ADD CONSTRAINT lesson_assignment_submissions_submitted_by_fkey
  FOREIGN KEY (submitted_by) REFERENCES profiles(id) ON DELETE CASCADE;

-- Verify the constraint was created
SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_name = 'lesson_assignment_submissions_submitted_by_fkey';
