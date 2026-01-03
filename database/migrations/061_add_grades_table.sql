-- ============================================================
-- 061_add_grades_table.sql
-- Creates grades reference table and links to assessment templates
--
-- Purpose: Templates need to be grade-specific. This migration adds
-- a grades reference table and links templates to grades for
-- grade-specific expectations.
-- ============================================================

-- Create ab_grades reference table
CREATE TABLE IF NOT EXISTS ab_grades (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INT NOT NULL UNIQUE,
  is_always_gt BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add comment on table
COMMENT ON TABLE ab_grades IS 'Reference table for grade levels in assessment builder';
COMMENT ON COLUMN ab_grades.is_always_gt IS 'Whether this grade is always part of Generación Tractor (pre-K through 2nd grade)';

-- Insert all 16 grades in order
INSERT INTO ab_grades (name, sort_order, is_always_gt) VALUES
  ('Medio Menor', 1, true),
  ('Medio Mayor', 2, true),
  ('Pre-Kinder', 3, true),
  ('Kinder', 4, true),
  ('Primero Básico', 5, true),
  ('Segundo Básico', 6, true),
  ('Tercero Básico', 7, false),
  ('Cuarto Básico', 8, false),
  ('Quinto Básico', 9, false),
  ('Sexto Básico', 10, false),
  ('Séptimo Básico', 11, false),
  ('Octavo Básico', 12, false),
  ('Primero Medio', 13, false),
  ('Segundo Medio', 14, false),
  ('Tercero Medio', 15, false),
  ('Cuarto Medio', 16, false)
ON CONFLICT (name) DO NOTHING;

-- Add grade_id column to assessment_templates (nullable initially for existing templates)
ALTER TABLE assessment_templates
ADD COLUMN IF NOT EXISTS grade_id INT REFERENCES ab_grades(id) ON DELETE SET NULL;

-- Add index for grade lookups
CREATE INDEX IF NOT EXISTS idx_assessment_templates_grade_id ON assessment_templates(grade_id);

-- Enable RLS on ab_grades
ALTER TABLE ab_grades ENABLE ROW LEVEL SECURITY;

-- RLS Policy: All authenticated users can read grades
CREATE POLICY "ab_grades_read_authenticated"
  ON ab_grades FOR SELECT
  TO authenticated
  USING (true);

-- Verify the changes
DO $$
BEGIN
  -- Check ab_grades table exists with correct number of rows
  IF NOT EXISTS (SELECT 1 FROM ab_grades WHERE sort_order = 16) THEN
    RAISE EXCEPTION 'ab_grades table not populated correctly';
  END IF;

  -- Check grade_id column exists on assessment_templates
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'assessment_templates'
    AND column_name = 'grade_id'
  ) THEN
    RAISE EXCEPTION 'grade_id column not added to assessment_templates';
  END IF;

  RAISE NOTICE 'Migration 061 completed successfully: ab_grades table created and grade_id added to assessment_templates';
END;
$$;

-- ============================================================
-- ROLLBACK SQL (to remove grades if needed):
--
-- ALTER TABLE assessment_templates DROP COLUMN IF EXISTS grade_id;
-- DROP POLICY IF EXISTS "ab_grades_read_authenticated" ON ab_grades;
-- DROP TABLE IF EXISTS ab_grades;
-- ============================================================
