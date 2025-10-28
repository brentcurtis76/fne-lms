-- =====================================================
-- Migration 003: Add Missing Columns to Generations Table
-- =====================================================
-- Author: Claude Code
-- Date: 2025-10-06
-- Status: CRITICAL FIX
--
-- Problem: Production database missing 'description' and 'updated_at' columns
-- Error: "Could not find the 'description' column of 'generations' in the schema cache"
-- Impact: Cannot create or update generations in production
--
-- Changes:
-- 1. Add description column (TEXT, nullable)
-- 2. Add updated_at column (TIMESTAMPTZ, auto-updating)
-- 3. Add trigger for automatic updated_at management
-- 4. Add performance indexes
-- 5. Update table comments for documentation
--
-- Rollback: See 003_add_generations_columns_rollback.sql
-- =====================================================

BEGIN;

-- =====================================================
-- STEP 1: Add Missing Columns
-- =====================================================

-- Add description column (nullable to avoid breaking existing records)
ALTER TABLE public.generations
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add updated_at column with default to NOW()
-- Set default for existing rows to match created_at
ALTER TABLE public.generations
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Backfill updated_at for existing records (set to created_at if exists)
UPDATE public.generations
SET updated_at = created_at
WHERE updated_at IS NULL AND created_at IS NOT NULL;

-- =====================================================
-- STEP 2: Create Auto-Update Trigger Function
-- =====================================================

-- Create or replace the trigger function
-- This ensures updated_at is always current when a row is modified
CREATE OR REPLACE FUNCTION public.update_generations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    -- Only update if the row actually changed
    IF (NEW.* IS DISTINCT FROM OLD.*) THEN
        NEW.updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql
   SECURITY DEFINER
   SET search_path = public;

-- Add comment to function
COMMENT ON FUNCTION public.update_generations_updated_at() IS
    'Automatically updates the updated_at column when a generation record is modified';

-- Drop trigger if it already exists (idempotent)
DROP TRIGGER IF EXISTS generations_updated_at_trigger ON public.generations;

-- Create the trigger
CREATE TRIGGER generations_updated_at_trigger
    BEFORE UPDATE ON public.generations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_generations_updated_at();

-- =====================================================
-- STEP 3: Add Performance Indexes
-- =====================================================

-- Index on school_id for fast lookups by school
CREATE INDEX IF NOT EXISTS idx_generations_school_id
    ON public.generations(school_id)
    WHERE school_id IS NOT NULL;

-- Index on name for search/filtering
CREATE INDEX IF NOT EXISTS idx_generations_name
    ON public.generations(name);

-- Composite index for common query pattern (school + grade_range)
CREATE INDEX IF NOT EXISTS idx_generations_school_grade
    ON public.generations(school_id, grade_range)
    WHERE school_id IS NOT NULL AND grade_range IS NOT NULL;

-- Index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_generations_created_at
    ON public.generations(created_at DESC);

-- =====================================================
-- STEP 4: Add Table and Column Documentation
-- =====================================================

-- Update table comment
COMMENT ON TABLE public.generations IS
    'Academic generations/cohorts within schools. Typically represents grade-level groupings like Tractor (PreK-2nd) or Innova (3rd-12th)';

-- Add column comments
COMMENT ON COLUMN public.generations.id IS
    'Unique identifier (UUID)';

COMMENT ON COLUMN public.generations.school_id IS
    'Foreign key to schools table (integer)';

COMMENT ON COLUMN public.generations.name IS
    'Name of the generation (e.g., Tractor, Innova)';

COMMENT ON COLUMN public.generations.grade_range IS
    'Grade range description (e.g., PreKinder-8vo, 3rd-12th)';

COMMENT ON COLUMN public.generations.description IS
    'Optional description providing additional context about the generation';

COMMENT ON COLUMN public.generations.created_at IS
    'Timestamp when the generation was created';

COMMENT ON COLUMN public.generations.updated_at IS
    'Timestamp when the generation was last modified (auto-updated by trigger)';

-- =====================================================
-- STEP 5: Verification Queries
-- =====================================================

-- Verify the new columns exist
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
    IF v_desc_exists AND v_updated_exists THEN
        RAISE NOTICE '✅ Migration successful: Both columns added';
    ELSIF v_desc_exists THEN
        RAISE WARNING '⚠️ Only description column added';
    ELSIF v_updated_exists THEN
        RAISE WARNING '⚠️ Only updated_at column added';
    ELSE
        RAISE EXCEPTION '❌ Migration failed: No columns added';
    END IF;
END $$;

COMMIT;

-- =====================================================
-- Post-Migration Verification
-- =====================================================

-- Display final schema
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_schema = 'public'
    AND table_name = 'generations'
ORDER BY ordinal_position;

-- Display indexes
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'generations'
    AND schemaname = 'public';

-- Display trigger
SELECT
    trigger_name,
    event_manipulation,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'generations'
    AND trigger_schema = 'public';

-- Count existing generations
SELECT
    COUNT(*) as total_generations,
    COUNT(DISTINCT school_id) as schools_with_generations
FROM public.generations;

-- =====================================================
-- END OF MIGRATION
-- =====================================================
