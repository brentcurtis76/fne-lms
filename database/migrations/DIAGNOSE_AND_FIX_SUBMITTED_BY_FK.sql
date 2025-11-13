-- ==============================================================================
-- DIAGNOSIS AND FIX: submitted_by Foreign Key Constraint
-- ==============================================================================
-- This script will:
-- 1. Show current FK constraints on lesson_assignment_submissions
-- 2. Drop the incorrect constraint (if it points to auth.users)
-- 3. Create the correct constraint (pointing to profiles)
-- 4. Verify the fix
-- 5. Reload the schema cache
-- ==============================================================================

-- STEP 1: DIAGNOSE CURRENT STATE
-- ==============================================================================
\echo '================================'
\echo 'STEP 1: Current FK Constraints'
\echo '================================'

SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'lesson_assignment_submissions'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'submitted_by';

-- STEP 2: DROP EXISTING CONSTRAINT
-- ==============================================================================
\echo ''
\echo '================================'
\echo 'STEP 2: Dropping Old Constraint'
\echo '================================'

DO $$
BEGIN
  -- Check if constraint exists
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'lesson_assignment_submissions_submitted_by_fkey'
    AND table_name = 'lesson_assignment_submissions'
    AND table_schema = 'public'
  ) THEN
    -- Drop it
    ALTER TABLE public.lesson_assignment_submissions
      DROP CONSTRAINT lesson_assignment_submissions_submitted_by_fkey;
    RAISE NOTICE '✓ Dropped existing constraint: lesson_assignment_submissions_submitted_by_fkey';
  ELSE
    RAISE NOTICE '✓ No existing constraint found (this is ok)';
  END IF;
END $$;

-- STEP 3: CREATE CORRECT CONSTRAINT
-- ==============================================================================
\echo ''
\echo '================================'
\echo 'STEP 3: Creating New Constraint'
\echo '================================'

-- Create FK constraint pointing to public.profiles(id)
ALTER TABLE public.lesson_assignment_submissions
  ADD CONSTRAINT lesson_assignment_submissions_submitted_by_fkey
  FOREIGN KEY (submitted_by)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;

\echo '✓ Created new constraint: submitted_by -> profiles(id)'

-- STEP 4: VERIFY THE FIX
-- ==============================================================================
\echo ''
\echo '================================'
\echo 'STEP 4: Verify New Constraint'
\echo '================================'

SELECT
  tc.constraint_name,
  tc.table_name,
  kcu.column_name,
  ccu.table_schema AS foreign_table_schema,
  ccu.table_name AS foreign_table_name,
  ccu.column_name AS foreign_column_name
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
  ON tc.constraint_name = kcu.constraint_name
  AND tc.table_schema = kcu.table_schema
JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_name = tc.constraint_name
  AND ccu.table_schema = tc.table_schema
WHERE tc.table_name = 'lesson_assignment_submissions'
  AND tc.constraint_type = 'FOREIGN KEY'
  AND kcu.column_name = 'submitted_by';

-- STEP 5: RELOAD SCHEMA CACHE
-- ==============================================================================
\echo ''
\echo '================================'
\echo 'STEP 5: Reload PostgREST Cache'
\echo '================================'

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';

\echo '✓ Schema cache reload signal sent'
\echo ''
\echo '================================'
\echo 'FIX COMPLETE!'
\echo '================================'
\echo 'Expected output above should show:'
\echo '  foreign_table_name: profiles'
\echo '  foreign_column_name: id'
\echo ''
\echo 'Now test the join with:'
\echo 'SELECT id, submitted_by, profiles:submitted_by(full_name) FROM lesson_assignment_submissions LIMIT 1;'
