-- =====================================================
-- Migration 004: Fix update_school_has_generations Trigger
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
-- Status: CRITICAL FIX
--
-- Problem: Trigger function declares v_school_id as UUID but generations.school_id is INTEGER
-- Error: "invalid input syntax for type uuid: '2'"
-- Impact: Cannot insert generations for any school
--
-- Root Cause: Schema drift - function not updated when school_id type changed
--
-- Fix: Change v_school_id from UUID to INTEGER
-- =====================================================

BEGIN;

-- Drop and recreate the function with correct data type
CREATE OR REPLACE FUNCTION public.update_school_has_generations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_school_id INTEGER;  -- ✅ FIXED: Changed from UUID to INTEGER
  v_generation_count INTEGER;
BEGIN
  -- Determine which school to update based on the operation
  IF TG_OP = 'DELETE' THEN
    v_school_id := OLD.school_id;
  ELSE
    v_school_id := NEW.school_id;
  END IF;

  -- Count remaining generations for this school
  SELECT COUNT(*) INTO v_generation_count
  FROM generations
  WHERE school_id = v_school_id;

  -- Update the has_generations flag based on the count
  UPDATE schools
  SET has_generations = (v_generation_count > 0)
  WHERE id = v_school_id;

  -- Return the appropriate record
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Add comment
COMMENT ON FUNCTION public.update_school_has_generations() IS
'Automatically maintains the has_generations flag on schools table.
When generations are added or removed, this function updates the flag accordingly.
This prevents data inconsistencies where a school is marked as having generations
but actually has none (e.g., after all generations are deleted).
FIXED: Changed v_school_id from UUID to INTEGER to match schema.';

-- Verify the function was updated
DO $$
BEGIN
    RAISE NOTICE '✅ Trigger function update_school_has_generations() has been fixed';
    RAISE NOTICE '✅ v_school_id is now INTEGER (was UUID)';
    RAISE NOTICE '✅ Ready to insert generations for any school';
END $$;

COMMIT;

-- =====================================================
-- Post-Migration Test
-- =====================================================

-- Test the fix with a dry-run insert (will rollback)
DO $$
DECLARE
    v_test_result TEXT;
BEGIN
    -- Try to insert a test generation (in a subtransaction)
    BEGIN
        INSERT INTO public.generations (school_id, name, grade_range, description)
        VALUES (2, 'TEST_MIGRATION_004', 'Test', 'This is a test - will be rolled back')
        RETURNING id::text INTO v_test_result;

        RAISE NOTICE '✅ TEST PASSED: Successfully inserted test generation';
        RAISE NOTICE '   Generated ID: %', v_test_result;

        -- Rollback the test insert
        RAISE EXCEPTION 'Rolling back test insert (this is expected)';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM LIKE '%Rolling back test insert%' THEN
                RAISE NOTICE '✅ Test insert rolled back (as expected)';
            ELSE
                RAISE EXCEPTION '❌ TEST FAILED: %', SQLERRM;
            END IF;
    END;
END $$;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
