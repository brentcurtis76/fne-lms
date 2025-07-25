-- =====================================================
-- Fix generations table: Convert school_id from UUID to INTEGER
-- =====================================================

BEGIN;

-- Clear any existing data first
TRUNCATE TABLE public.generations CASCADE;

-- Drop foreign key constraint
ALTER TABLE public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;

-- Convert school_id column from UUID to INTEGER
ALTER TABLE public.generations ALTER COLUMN school_id TYPE integer USING NULL;

-- Re-add foreign key constraint to schools table
ALTER TABLE public.generations ADD CONSTRAINT generations_school_id_fkey 
  FOREIGN KEY (school_id) REFERENCES public.schools(id);

-- Verify the change
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns 
WHERE table_name = 'generations' 
  AND table_schema = 'public'
  AND column_name = 'school_id';

COMMIT;

-- =====================================================
-- RESULT: generations.school_id is now INTEGER
-- =====================================================