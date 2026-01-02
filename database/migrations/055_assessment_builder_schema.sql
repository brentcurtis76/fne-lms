-- ============================================================
-- Migration: 055_assessment_builder_schema.sql
-- Purpose: Create tables for the Assessment Builder system
-- Date: 2025-12-30
--
-- This creates a PARALLEL system to the existing transformation_*
-- tables. The old system remains untouched for historical data.
--
-- Run this in Supabase SQL Editor. If you get errors about
-- existing objects, you may need to drop them first or run
-- the rollback script.
-- ============================================================

-- ============================================================
-- PART 1: SCHOOL CONTEXT TABLES
-- ============================================================

-- TABLA: school_transversal_context
-- Propósito: Respuestas del cuestionario transversal del directivo
CREATE TABLE IF NOT EXISTS school_transversal_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  total_students INTEGER NOT NULL,
  grade_levels TEXT[] NOT NULL,
  courses_per_level JSONB NOT NULL,
  implementation_year_2026 INTEGER NOT NULL CHECK (implementation_year_2026 BETWEEN 1 AND 5),
  subjects_per_level JSONB,
  generacion_tractor_history JSONB,
  generacion_innova_history JSONB,
  programa_inicia_completed BOOLEAN DEFAULT false,
  programa_inicia_hours INTEGER CHECK (programa_inicia_hours IS NULL OR programa_inicia_hours IN (20, 40, 80)),
  programa_inicia_year INTEGER,
  period_system TEXT NOT NULL CHECK (period_system IN ('semestral', 'trimestral')),
  completed_by UUID REFERENCES auth.users(id),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_transversal_context_school ON school_transversal_context(school_id);
CREATE INDEX IF NOT EXISTS idx_transversal_context_completed ON school_transversal_context(completed_at);

-- TABLA: school_course_structure
CREATE TABLE IF NOT EXISTS school_course_structure (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id INTEGER NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  context_id UUID NOT NULL REFERENCES school_transversal_context(id) ON DELETE CASCADE,
  grade_level TEXT NOT NULL,
  course_name TEXT NOT NULL,
  professionals JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(context_id, grade_level, course_name)
);

CREATE INDEX IF NOT EXISTS idx_course_structure_school ON school_course_structure(school_id);
CREATE INDEX IF NOT EXISTS idx_course_structure_context ON school_course_structure(context_id);

-- TABLA: school_course_docente_assignments
CREATE TABLE IF NOT EXISTS school_course_docente_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  course_structure_id UUID NOT NULL REFERENCES school_course_structure(id) ON DELETE CASCADE,
  docente_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_by UUID REFERENCES auth.users(id),
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  is_active BOOLEAN DEFAULT true,
  UNIQUE(course_structure_id, docente_id)
);

CREATE INDEX IF NOT EXISTS idx_course_docente_course ON school_course_docente_assignments(course_structure_id);
CREATE INDEX IF NOT EXISTS idx_course_docente_docente ON school_course_docente_assignments(docente_id);
CREATE INDEX IF NOT EXISTS idx_course_docente_active ON school_course_docente_assignments(is_active) WHERE is_active = true;

-- ============================================================
-- PART 2: ASSESSMENT TEMPLATE TABLES
-- ============================================================

-- TABLA: assessment_templates
CREATE TABLE IF NOT EXISTS assessment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  area TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  published_at TIMESTAMPTZ,
  published_by UUID REFERENCES auth.users(id),
  scoring_config JSONB DEFAULT '{"level_thresholds":{"consolidated":87.5,"advanced":62.5,"developing":37.5,"emerging":12.5},"default_weights":{"module":1.0,"indicator":1.0}}'::jsonb,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(area, version)
);

CREATE INDEX IF NOT EXISTS idx_templates_area ON assessment_templates(area);
CREATE INDEX IF NOT EXISTS idx_templates_status ON assessment_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_published ON assessment_templates(status, published_at) WHERE status = 'published';

-- TABLA: assessment_context_questions
CREATE TABLE IF NOT EXISTS assessment_context_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'number', 'select', 'multiselect', 'boolean', 'scale')),
  options JSONB,
  placeholder TEXT,
  help_text TEXT,
  is_required BOOLEAN DEFAULT true,
  validation_rules JSONB,
  display_order INTEGER NOT NULL,
  visibility_condition JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_context_questions_template ON assessment_context_questions(template_id);
CREATE INDEX IF NOT EXISTS idx_context_questions_order ON assessment_context_questions(template_id, display_order);

-- TABLA: assessment_modules
CREATE TABLE IF NOT EXISTS assessment_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  display_order INTEGER NOT NULL,
  weight DECIMAL(5,4) DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_modules_template ON assessment_modules(template_id);
CREATE INDEX IF NOT EXISTS idx_modules_order ON assessment_modules(template_id, display_order);

-- TABLA: assessment_indicators
CREATE TABLE IF NOT EXISTS assessment_indicators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id UUID NOT NULL REFERENCES assessment_modules(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL CHECK (category IN ('cobertura', 'frecuencia', 'profundidad')),
  frequency_config JSONB,
  level_0_descriptor TEXT,
  level_1_descriptor TEXT,
  level_2_descriptor TEXT,
  level_3_descriptor TEXT,
  level_4_descriptor TEXT,
  display_order INTEGER NOT NULL,
  weight DECIMAL(5,4) DEFAULT 1.0 CHECK (weight >= 0 AND weight <= 10),
  visibility_condition JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_indicators_module ON assessment_indicators(module_id);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON assessment_indicators(category);
CREATE INDEX IF NOT EXISTS idx_indicators_order ON assessment_indicators(module_id, display_order);

-- TABLA: assessment_sub_questions
CREATE TABLE IF NOT EXISTS assessment_sub_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_id UUID REFERENCES assessment_indicators(id) ON DELETE CASCADE,
  parent_question_id UUID REFERENCES assessment_sub_questions(id) ON DELETE CASCADE,
  question_text TEXT NOT NULL,
  question_type TEXT NOT NULL CHECK (question_type IN ('text', 'number', 'select', 'multiselect', 'boolean', 'scale')),
  options JSONB,
  help_text TEXT,
  is_required BOOLEAN DEFAULT false,
  validation_rules JSONB,
  trigger_condition JSONB NOT NULL,
  display_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT has_single_parent CHECK (
    (indicator_id IS NOT NULL AND parent_question_id IS NULL) OR
    (indicator_id IS NULL AND parent_question_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_sub_questions_indicator ON assessment_sub_questions(indicator_id);
CREATE INDEX IF NOT EXISTS idx_sub_questions_parent ON assessment_sub_questions(parent_question_id);

-- TABLA: assessment_year_expectations
CREATE TABLE IF NOT EXISTS assessment_year_expectations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL REFERENCES assessment_indicators(id) ON DELETE CASCADE,
  year_1_expected INTEGER CHECK (year_1_expected IS NULL OR year_1_expected BETWEEN 0 AND 4),
  year_2_expected INTEGER CHECK (year_2_expected IS NULL OR year_2_expected BETWEEN 0 AND 4),
  year_3_expected INTEGER CHECK (year_3_expected IS NULL OR year_3_expected BETWEEN 0 AND 4),
  year_4_expected INTEGER CHECK (year_4_expected IS NULL OR year_4_expected BETWEEN 0 AND 4),
  year_5_expected INTEGER CHECK (year_5_expected IS NULL OR year_5_expected BETWEEN 0 AND 4),
  tolerance INTEGER DEFAULT 1 CHECK (tolerance BETWEEN 0 AND 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(template_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS idx_expectations_template ON assessment_year_expectations(template_id);
CREATE INDEX IF NOT EXISTS idx_expectations_indicator ON assessment_year_expectations(indicator_id);

-- TABLA: assessment_template_snapshots
CREATE TABLE IF NOT EXISTS assessment_template_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES assessment_templates(id) ON DELETE RESTRICT,
  version TEXT NOT NULL,
  snapshot_data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(template_id, version)
);

CREATE INDEX IF NOT EXISTS idx_snapshots_template ON assessment_template_snapshots(template_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_version ON assessment_template_snapshots(template_id, version);

-- ============================================================
-- PART 3: ASSESSMENT INSTANCE TABLES
-- ============================================================

-- TABLA: assessment_instances
CREATE TABLE IF NOT EXISTS assessment_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_snapshot_id UUID NOT NULL REFERENCES assessment_template_snapshots(id) ON DELETE RESTRICT,
  growth_community_id UUID REFERENCES growth_communities(id) ON DELETE SET NULL,
  school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL,
  course_structure_id UUID REFERENCES school_course_structure(id) ON DELETE SET NULL,
  transformation_year INTEGER NOT NULL CHECK (transformation_year BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'archived')),
  context_responses JSONB,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_instances_snapshot ON assessment_instances(template_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_instances_community ON assessment_instances(growth_community_id);
CREATE INDEX IF NOT EXISTS idx_instances_school ON assessment_instances(school_id);
CREATE INDEX IF NOT EXISTS idx_instances_course ON assessment_instances(course_structure_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON assessment_instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_year ON assessment_instances(transformation_year);

-- TABLA: assessment_instance_assignees
CREATE TABLE IF NOT EXISTS assessment_instance_assignees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES assessment_instances(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  can_edit BOOLEAN DEFAULT true,
  can_submit BOOLEAN DEFAULT true,
  has_started BOOLEAN DEFAULT false,
  has_submitted BOOLEAN DEFAULT false,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES auth.users(id),
  UNIQUE(instance_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_assignees_instance ON assessment_instance_assignees(instance_id);
CREATE INDEX IF NOT EXISTS idx_assignees_user ON assessment_instance_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_assignees_pending ON assessment_instance_assignees(user_id, has_submitted) WHERE has_submitted = false;

-- TABLA: assessment_responses
CREATE TABLE IF NOT EXISTS assessment_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES assessment_instances(id) ON DELETE CASCADE,
  indicator_id UUID NOT NULL,
  coverage_value BOOLEAN,
  frequency_value DECIMAL(10,2),
  profundity_level INTEGER CHECK (profundity_level IS NULL OR profundity_level BETWEEN 0 AND 4),
  rationale TEXT,
  evidence_notes TEXT,
  sub_responses JSONB,
  responded_by UUID REFERENCES auth.users(id),
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(instance_id, indicator_id)
);

CREATE INDEX IF NOT EXISTS idx_responses_instance ON assessment_responses(instance_id);
CREATE INDEX IF NOT EXISTS idx_responses_indicator ON assessment_responses(indicator_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON assessment_responses(responded_by);

-- TABLA: assessment_instance_results
CREATE TABLE IF NOT EXISTS assessment_instance_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instance_id UUID NOT NULL REFERENCES assessment_instances(id) ON DELETE CASCADE,
  total_score DECIMAL(5,2),
  overall_level INTEGER CHECK (overall_level IS NULL OR overall_level BETWEEN 0 AND 4),
  module_scores JSONB,
  expected_level INTEGER,
  meets_expectations BOOLEAN,
  calculated_at TIMESTAMPTZ DEFAULT NOW(),
  calculated_by UUID REFERENCES auth.users(id),
  UNIQUE(instance_id)
);

CREATE INDEX IF NOT EXISTS idx_results_instance ON assessment_instance_results(instance_id);

-- ============================================================
-- PART 4: ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all new tables
ALTER TABLE school_transversal_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_course_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_course_docente_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_context_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_sub_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_year_expectations ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_template_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_instance_assignees ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_responses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assessment_instance_results ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- PART 5: HELPER FUNCTIONS
-- ============================================================

-- Check if user is admin or consultor
CREATE OR REPLACE FUNCTION auth_is_assessment_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type IN ('admin', 'consultor')
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is directivo of a school
-- Note: The role_type enum value is 'equipo_directivo', not 'directivo'
CREATE OR REPLACE FUNCTION auth_is_school_directivo(p_school_id INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type = 'equipo_directivo'
    AND school_id = p_school_id
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- PART 6: RLS POLICIES - TEMPLATES
-- ============================================================

DROP POLICY IF EXISTS "assessment_templates_select" ON assessment_templates;
CREATE POLICY "assessment_templates_select" ON assessment_templates
  FOR SELECT USING (auth_is_assessment_admin() OR status = 'published');

DROP POLICY IF EXISTS "assessment_templates_insert" ON assessment_templates;
CREATE POLICY "assessment_templates_insert" ON assessment_templates
  FOR INSERT WITH CHECK (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_templates_update" ON assessment_templates;
CREATE POLICY "assessment_templates_update" ON assessment_templates
  FOR UPDATE USING (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_templates_delete" ON assessment_templates;
CREATE POLICY "assessment_templates_delete" ON assessment_templates
  FOR DELETE USING (auth_is_assessment_admin() AND status = 'draft');

-- ============================================================
-- PART 7: RLS POLICIES - MODULES
-- ============================================================

DROP POLICY IF EXISTS "assessment_modules_select" ON assessment_modules;
CREATE POLICY "assessment_modules_select" ON assessment_modules
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_templates t
      WHERE t.id = assessment_modules.template_id AND t.status = 'published'
    )
  );

DROP POLICY IF EXISTS "assessment_modules_insert" ON assessment_modules;
CREATE POLICY "assessment_modules_insert" ON assessment_modules
  FOR INSERT WITH CHECK (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_modules_update" ON assessment_modules;
CREATE POLICY "assessment_modules_update" ON assessment_modules
  FOR UPDATE USING (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_modules_delete" ON assessment_modules;
CREATE POLICY "assessment_modules_delete" ON assessment_modules
  FOR DELETE USING (auth_is_assessment_admin());

-- ============================================================
-- PART 8: RLS POLICIES - INDICATORS
-- ============================================================

DROP POLICY IF EXISTS "assessment_indicators_select" ON assessment_indicators;
CREATE POLICY "assessment_indicators_select" ON assessment_indicators
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_modules m
      JOIN assessment_templates t ON t.id = m.template_id
      WHERE m.id = assessment_indicators.module_id AND t.status = 'published'
    )
  );

DROP POLICY IF EXISTS "assessment_indicators_insert" ON assessment_indicators;
CREATE POLICY "assessment_indicators_insert" ON assessment_indicators
  FOR INSERT WITH CHECK (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_indicators_update" ON assessment_indicators;
CREATE POLICY "assessment_indicators_update" ON assessment_indicators
  FOR UPDATE USING (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_indicators_delete" ON assessment_indicators;
CREATE POLICY "assessment_indicators_delete" ON assessment_indicators
  FOR DELETE USING (auth_is_assessment_admin());

-- ============================================================
-- PART 9: RLS POLICIES - SCHOOL CONTEXT
-- ============================================================

DROP POLICY IF EXISTS "school_transversal_context_select" ON school_transversal_context;
CREATE POLICY "school_transversal_context_select" ON school_transversal_context
  FOR SELECT USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_transversal_context_insert" ON school_transversal_context;
CREATE POLICY "school_transversal_context_insert" ON school_transversal_context
  FOR INSERT WITH CHECK (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_transversal_context_update" ON school_transversal_context;
CREATE POLICY "school_transversal_context_update" ON school_transversal_context
  FOR UPDATE USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_structure_select" ON school_course_structure;
CREATE POLICY "school_course_structure_select" ON school_course_structure
  FOR SELECT USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_structure_insert" ON school_course_structure;
CREATE POLICY "school_course_structure_insert" ON school_course_structure
  FOR INSERT WITH CHECK (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_structure_update" ON school_course_structure;
CREATE POLICY "school_course_structure_update" ON school_course_structure
  FOR UPDATE USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_docente_assignments_select" ON school_course_docente_assignments;
CREATE POLICY "school_course_docente_assignments_select" ON school_course_docente_assignments
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    docente_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM school_course_structure cs
      WHERE cs.id = school_course_docente_assignments.course_structure_id
      AND auth_is_school_directivo(cs.school_id)
    )
  );

DROP POLICY IF EXISTS "school_course_docente_assignments_insert" ON school_course_docente_assignments;
CREATE POLICY "school_course_docente_assignments_insert" ON school_course_docente_assignments
  FOR INSERT WITH CHECK (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM school_course_structure cs
      WHERE cs.id = school_course_docente_assignments.course_structure_id
      AND auth_is_school_directivo(cs.school_id)
    )
  );

DROP POLICY IF EXISTS "school_course_docente_assignments_update" ON school_course_docente_assignments;
CREATE POLICY "school_course_docente_assignments_update" ON school_course_docente_assignments
  FOR UPDATE USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM school_course_structure cs
      WHERE cs.id = school_course_docente_assignments.course_structure_id
      AND auth_is_school_directivo(cs.school_id)
    )
  );

-- ============================================================
-- PART 10: RLS POLICIES - INSTANCES
-- ============================================================

DROP POLICY IF EXISTS "assessment_instances_select" ON assessment_instances;
CREATE POLICY "assessment_instances_select" ON assessment_instances
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    (school_id IS NOT NULL AND auth_is_school_directivo(school_id)) OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_instances.id AND aia.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assessment_instances_insert" ON assessment_instances;
CREATE POLICY "assessment_instances_insert" ON assessment_instances
  FOR INSERT WITH CHECK (auth_is_assessment_admin());

DROP POLICY IF EXISTS "assessment_instances_update" ON assessment_instances;
CREATE POLICY "assessment_instances_update" ON assessment_instances
  FOR UPDATE USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_instances.id
      AND aia.user_id = auth.uid() AND aia.can_edit = true
    )
  );

-- ============================================================
-- PART 11: RLS POLICIES - RESPONSES
-- ============================================================

DROP POLICY IF EXISTS "assessment_responses_select" ON assessment_responses;
CREATE POLICY "assessment_responses_select" ON assessment_responses
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_responses.instance_id AND aia.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assessment_responses_insert" ON assessment_responses;
CREATE POLICY "assessment_responses_insert" ON assessment_responses
  FOR INSERT WITH CHECK (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_responses.instance_id
      AND aia.user_id = auth.uid() AND aia.can_edit = true
    )
  );

DROP POLICY IF EXISTS "assessment_responses_update" ON assessment_responses;
CREATE POLICY "assessment_responses_update" ON assessment_responses
  FOR UPDATE USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_responses.instance_id
      AND aia.user_id = auth.uid() AND aia.can_edit = true
    )
  );

-- ============================================================
-- PART 12: RLS POLICIES - OTHER TABLES
-- ============================================================

-- Context questions (read for all, write for admin)
DROP POLICY IF EXISTS "assessment_context_questions_select" ON assessment_context_questions;
CREATE POLICY "assessment_context_questions_select" ON assessment_context_questions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "assessment_context_questions_write" ON assessment_context_questions;
CREATE POLICY "assessment_context_questions_write" ON assessment_context_questions
  FOR ALL USING (auth_is_assessment_admin());

-- Sub questions
DROP POLICY IF EXISTS "assessment_sub_questions_select" ON assessment_sub_questions;
CREATE POLICY "assessment_sub_questions_select" ON assessment_sub_questions
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "assessment_sub_questions_write" ON assessment_sub_questions;
CREATE POLICY "assessment_sub_questions_write" ON assessment_sub_questions
  FOR ALL USING (auth_is_assessment_admin());

-- Year expectations
DROP POLICY IF EXISTS "assessment_year_expectations_select" ON assessment_year_expectations;
CREATE POLICY "assessment_year_expectations_select" ON assessment_year_expectations
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "assessment_year_expectations_write" ON assessment_year_expectations;
CREATE POLICY "assessment_year_expectations_write" ON assessment_year_expectations
  FOR ALL USING (auth_is_assessment_admin());

-- Template snapshots
DROP POLICY IF EXISTS "assessment_template_snapshots_select" ON assessment_template_snapshots;
CREATE POLICY "assessment_template_snapshots_select" ON assessment_template_snapshots
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "assessment_template_snapshots_insert" ON assessment_template_snapshots;
CREATE POLICY "assessment_template_snapshots_insert" ON assessment_template_snapshots
  FOR INSERT WITH CHECK (auth_is_assessment_admin());

-- Instance assignees
DROP POLICY IF EXISTS "assessment_instance_assignees_select" ON assessment_instance_assignees;
CREATE POLICY "assessment_instance_assignees_select" ON assessment_instance_assignees
  FOR SELECT USING (auth_is_assessment_admin() OR user_id = auth.uid());

DROP POLICY IF EXISTS "assessment_instance_assignees_write" ON assessment_instance_assignees;
CREATE POLICY "assessment_instance_assignees_write" ON assessment_instance_assignees
  FOR ALL USING (auth_is_assessment_admin());

-- Instance results
DROP POLICY IF EXISTS "assessment_instance_results_select" ON assessment_instance_results;
CREATE POLICY "assessment_instance_results_select" ON assessment_instance_results
  FOR SELECT USING (
    auth_is_assessment_admin() OR
    EXISTS (
      SELECT 1 FROM assessment_instance_assignees aia
      WHERE aia.instance_id = assessment_instance_results.instance_id AND aia.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "assessment_instance_results_write" ON assessment_instance_results;
CREATE POLICY "assessment_instance_results_write" ON assessment_instance_results
  FOR ALL USING (auth_is_assessment_admin());

-- ============================================================
-- PART 13: TRIGGERS
-- ============================================================

-- The update_updated_at_column function should already exist
-- If not, create it:
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for all tables with updated_at
DROP TRIGGER IF EXISTS update_school_transversal_context_updated_at ON school_transversal_context;
CREATE TRIGGER update_school_transversal_context_updated_at
  BEFORE UPDATE ON school_transversal_context
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_templates_updated_at ON assessment_templates;
CREATE TRIGGER update_assessment_templates_updated_at
  BEFORE UPDATE ON assessment_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_context_questions_updated_at ON assessment_context_questions;
CREATE TRIGGER update_assessment_context_questions_updated_at
  BEFORE UPDATE ON assessment_context_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_modules_updated_at ON assessment_modules;
CREATE TRIGGER update_assessment_modules_updated_at
  BEFORE UPDATE ON assessment_modules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_indicators_updated_at ON assessment_indicators;
CREATE TRIGGER update_assessment_indicators_updated_at
  BEFORE UPDATE ON assessment_indicators
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_sub_questions_updated_at ON assessment_sub_questions;
CREATE TRIGGER update_assessment_sub_questions_updated_at
  BEFORE UPDATE ON assessment_sub_questions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_year_expectations_updated_at ON assessment_year_expectations;
CREATE TRIGGER update_assessment_year_expectations_updated_at
  BEFORE UPDATE ON assessment_year_expectations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_instances_updated_at ON assessment_instances;
CREATE TRIGGER update_assessment_instances_updated_at
  BEFORE UPDATE ON assessment_instances
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_assessment_responses_updated_at ON assessment_responses;
CREATE TRIGGER update_assessment_responses_updated_at
  BEFORE UPDATE ON assessment_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- PART 14: TABLE COMMENTS
-- ============================================================

COMMENT ON TABLE assessment_templates IS 'Assessment templates by transformation area (versioned)';
COMMENT ON TABLE assessment_modules IS 'Modules/sections within an assessment template';
COMMENT ON TABLE assessment_indicators IS 'Evaluation criteria/indicators within modules';
COMMENT ON TABLE assessment_instances IS 'Assigned assessment instances to schools/courses';
COMMENT ON TABLE assessment_responses IS 'Individual responses per indicator';
COMMENT ON TABLE school_transversal_context IS 'School context questionnaire responses (11 questions)';
COMMENT ON TABLE school_course_structure IS 'Course structure derived from transversal questionnaire';
COMMENT ON TABLE school_course_docente_assignments IS 'Docente assignments to courses (triggers auto-assignment via API)';

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
