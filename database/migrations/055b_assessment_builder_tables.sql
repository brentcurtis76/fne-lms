-- ============================================================
-- 055b_assessment_builder_tables.sql
-- PART 1: Create all tables (run this first)
-- ============================================================

-- TABLA: school_transversal_context
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

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'All 14 tables created successfully!';
  RAISE NOTICE 'Now run 055c_assessment_builder_indexes.sql';
END;
$$;
