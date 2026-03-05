-- ============================================================
-- Migration: Add Objetivo (Objective) layer to Assessment Builder
--
-- New hierarchy: Evaluación → Objetivo → Acciones (Módulos) → Indicadores
--
-- The table name assessment_objectives was previously used by an orphaned
-- transformation-rubric table (Dec 2025) with a different schema (area_id,
-- objective_number, title). That table had 1 seed row, no FK references,
-- and no application code. We DROP it here and recreate with the correct
-- Assessment Builder schema.
--
-- Changes:
--   1. Drop old assessment_objectives table
--   2. Create assessment_objectives with correct schema
--   3. Add objective_id FK to assessment_modules
--   4. RLS policies for assessment_objectives
--   5. Updated_at trigger
-- ============================================================

-- 0. Drop old orphaned table and its policy
DROP POLICY IF EXISTS "admin_full_access_assessment_objectives" ON assessment_objectives;
DROP TABLE IF EXISTS assessment_objectives CASCADE;

-- 1. Create assessment_objectives table
CREATE TABLE assessment_objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER NOT NULL DEFAULT 1,
  weight DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_assessment_objectives_template_id
  ON assessment_objectives(template_id);
CREATE INDEX idx_assessment_objectives_display_order
  ON assessment_objectives(template_id, display_order);

-- 2. Add objective_id to assessment_modules
ALTER TABLE assessment_modules
  ADD COLUMN IF NOT EXISTS objective_id UUID REFERENCES assessment_objectives(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_assessment_modules_objective_id
  ON assessment_modules(objective_id);

-- 3. Enable RLS on assessment_objectives
ALTER TABLE assessment_objectives ENABLE ROW LEVEL SECURITY;

-- RLS Policies (mirror assessment_modules policies)
CREATE POLICY "assessment_objectives_select_authenticated"
  ON assessment_objectives
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "assessment_objectives_insert_authenticated"
  ON assessment_objectives
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "assessment_objectives_update_authenticated"
  ON assessment_objectives
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "assessment_objectives_delete_authenticated"
  ON assessment_objectives
  FOR DELETE
  TO authenticated
  USING (true);

-- 4. Updated_at trigger
CREATE OR REPLACE FUNCTION update_assessment_objectives_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_assessment_objectives_updated_at
  BEFORE UPDATE ON assessment_objectives
  FOR EACH ROW
  EXECUTE FUNCTION update_assessment_objectives_updated_at();
