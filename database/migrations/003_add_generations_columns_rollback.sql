-- =====================================================
-- Migration 003 ROLLBACK: Remove Generations Columns
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
--
-- WARNING: This will remove the description and updated_at columns
-- WARNING: Data in these columns will be permanently lost
-- WARNING: Only run this if migration 003 needs to be reverted
--
-- Rollback Steps:
-- 1. Drop triggers
-- 2. Drop trigger function
-- 3. Drop indexes
-- 4. Remove columns
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Drop Triggers
-- =====================================================

DROP TRIGGER IF EXISTS generations_updated_at_trigger ON public.generations;

-- =====================================================
-- STEP 2: Drop Trigger Function
-- =====================================================

DROP FUNCTION IF EXISTS public.update_generations_updated_at();

-- =====================================================
-- STEP 3: Drop Indexes Created in Migration 003
-- =====================================================

-- Drop indexes (only those added in migration 003)
DROP INDEX IF EXISTS public.idx_generations_school_id;
DROP INDEX IF EXISTS public.idx_generations_name;
DROP INDEX IF EXISTS public.idx_generations_school_grade;
DROP INDEX IF EXISTS public.idx_generations_created_at;

-- =====================================================
-- STEP 4: Remove Columns
-- =====================================================

-- Remove description column
ALTER TABLE public.generations
DROP COLUMN IF EXISTS description;

-- Remove updated_at column
ALTER TABLE public.generations
DROP COLUMN IF EXISTS updated_at;

-- =====================================================
-- STEP 5: Verification
-- =====================================================

-- Verify the columns are removed
DO $$
DECLARE
    v_desc_exists BOOLEAN;
    v_updated_exists BOOLEAN;
BEGIN
    -- Check for description column
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'generations'
        AND column_name = 'description'
    ) INTO v_desc_exists;

    -- Check for updated_at column
    SELECT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
        AND table_name = 'generations'
        AND column_name = 'updated_at'
    ) INTO v_updated_exists;

    -- Report results
    IF NOT v_desc_exists AND NOT v_updated_exists THEN
        RAISE NOTICE '✅ Rollback successful: Both columns removed';
    ELSIF NOT v_desc_exists THEN
        RAISE WARNING '⚠️ Only description column removed';
    ELSIF NOT v_updated_exists THEN
        RAISE WARNING '⚠️ Only updated_at column removed';
    ELSE
        RAISE EXCEPTION '❌ Rollback failed: Columns still exist';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Post-Rollback Verification
-- =====================================================

-- Display current schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'generations'
ORDER BY ordinal_position;

-- =====================================================
-- END OF ROLLBACK
-- =====================================================
