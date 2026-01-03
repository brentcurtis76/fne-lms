-- ============================================================
-- Migration: 062_migration_plan.sql
-- Purpose: Create ab_migration_plan table for school GT/GI grade planning
-- Date: 2026-01-02
--
-- The Migration Plan defines which grades are Generación Tractor (GT)
-- vs Generación Innova (GI) for each of the 5 transformation years.
--
-- Business Rules:
-- - Grades 1-6 (Medio Menor through Segundo Básico) are ALWAYS GT
-- - Grades 7-16 (Tercero Básico through Cuarto Medio) start as GI
-- - Schools plan transition of GI grades to GT over 5 years
-- - By Year 5, all grades should be GT
-- ============================================================

-- Create enum for generation type if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'generation_type') THEN
    CREATE TYPE generation_type AS ENUM ('GT', 'GI');
  END IF;
END$$;

-- Create ab_migration_plan table
CREATE TABLE IF NOT EXISTS ab_migration_plan (
  id SERIAL PRIMARY KEY,
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  year_number INTEGER NOT NULL CHECK (year_number BETWEEN 1 AND 5),
  grade_id INTEGER NOT NULL REFERENCES ab_grades(id) ON DELETE CASCADE,
  generation_type generation_type NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Each school can only have one entry per year/grade combination
  UNIQUE(school_id, year_number, grade_id)
);

-- Add comments
COMMENT ON TABLE ab_migration_plan IS 'Stores the migration plan for each school defining GT vs GI status per grade per year';
COMMENT ON COLUMN ab_migration_plan.year_number IS 'Transformation year (1-5)';
COMMENT ON COLUMN ab_migration_plan.generation_type IS 'GT = Generación Tractor, GI = Generación Innova';

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_migration_plan_school ON ab_migration_plan(school_id);
CREATE INDEX IF NOT EXISTS idx_migration_plan_school_year ON ab_migration_plan(school_id, year_number);

-- Enable RLS
ALTER TABLE ab_migration_plan ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies
-- ============================================================

-- Helper function: Check if user belongs to school (any role)
CREATE OR REPLACE FUNCTION auth_belongs_to_school(p_school_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND school_id = p_school_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- SELECT: School users can read their own school's plan, admins can read all
DROP POLICY IF EXISTS "ab_migration_plan_select" ON ab_migration_plan;
CREATE POLICY "ab_migration_plan_select" ON ab_migration_plan
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    auth_belongs_to_school(school_id)
  );

-- INSERT: School directivos and admins can insert
DROP POLICY IF EXISTS "ab_migration_plan_insert" ON ab_migration_plan;
CREATE POLICY "ab_migration_plan_insert" ON ab_migration_plan
  FOR INSERT WITH CHECK (
    auth_is_assessment_admin() OR
    auth_is_school_directivo(school_id)
  );

-- UPDATE: School directivos and admins can update
DROP POLICY IF EXISTS "ab_migration_plan_update" ON ab_migration_plan;
CREATE POLICY "ab_migration_plan_update" ON ab_migration_plan
  FOR UPDATE USING (
    auth_is_assessment_admin() OR
    auth_is_school_directivo(school_id)
  );

-- DELETE: School directivos and admins can delete
DROP POLICY IF EXISTS "ab_migration_plan_delete" ON ab_migration_plan;
CREATE POLICY "ab_migration_plan_delete" ON ab_migration_plan
  FOR DELETE USING (
    auth_is_assessment_admin() OR
    auth_is_school_directivo(school_id)
  );

-- ============================================================
-- Trigger for updated_at
-- ============================================================

DROP TRIGGER IF EXISTS update_ab_migration_plan_updated_at ON ab_migration_plan;
CREATE TRIGGER update_ab_migration_plan_updated_at
  BEFORE UPDATE ON ab_migration_plan
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
  -- Check table exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'ab_migration_plan'
  ) THEN
    RAISE EXCEPTION 'ab_migration_plan table was not created';
  END IF;

  RAISE NOTICE 'Migration 062 completed successfully: ab_migration_plan table created';
END;
$$;

-- ============================================================
-- ROLLBACK SQL (uncomment and run to revert):
--
-- DROP TRIGGER IF EXISTS update_ab_migration_plan_updated_at ON ab_migration_plan;
-- DROP POLICY IF EXISTS "ab_migration_plan_delete" ON ab_migration_plan;
-- DROP POLICY IF EXISTS "ab_migration_plan_update" ON ab_migration_plan;
-- DROP POLICY IF EXISTS "ab_migration_plan_insert" ON ab_migration_plan;
-- DROP POLICY IF EXISTS "ab_migration_plan_select" ON ab_migration_plan;
-- DROP TABLE IF EXISTS ab_migration_plan;
-- DROP FUNCTION IF EXISTS auth_belongs_to_school(INTEGER);
-- DROP TYPE IF EXISTS generation_type;
-- ============================================================
