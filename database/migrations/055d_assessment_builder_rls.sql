-- ============================================================
-- 055d_assessment_builder_rls.sql
-- PART 3: Enable RLS, create functions, and policies (run after 055c)
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

-- Helper function: Check if user is admin or consultor
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

-- Helper function: Check if user is directivo of a school
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
-- POLICIES: assessment_templates
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
-- POLICIES: assessment_modules
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
-- POLICIES: assessment_indicators
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
-- POLICIES: school_transversal_context
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

-- ============================================================
-- POLICIES: school_course_structure
-- ============================================================
DROP POLICY IF EXISTS "school_course_structure_select" ON school_course_structure;
CREATE POLICY "school_course_structure_select" ON school_course_structure
  FOR SELECT USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_structure_insert" ON school_course_structure;
CREATE POLICY "school_course_structure_insert" ON school_course_structure
  FOR INSERT WITH CHECK (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

DROP POLICY IF EXISTS "school_course_structure_update" ON school_course_structure;
CREATE POLICY "school_course_structure_update" ON school_course_structure
  FOR UPDATE USING (auth_is_assessment_admin() OR auth_is_school_directivo(school_id));

-- ============================================================
-- POLICIES: school_course_docente_assignments
-- ============================================================
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
-- POLICIES: assessment_instances
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
-- POLICIES: assessment_responses
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
-- POLICIES: Other tables (read for all, write for admin)
-- ============================================================

-- Context questions
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
-- TRIGGERS
-- ============================================================

-- The update_updated_at_column function should already exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
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
-- TABLE COMMENTS
-- ============================================================
COMMENT ON TABLE assessment_templates IS 'Assessment templates by transformation area (versioned)';
COMMENT ON TABLE assessment_modules IS 'Modules/sections within an assessment template';
COMMENT ON TABLE assessment_indicators IS 'Evaluation criteria/indicators within modules';
COMMENT ON TABLE assessment_instances IS 'Assigned assessment instances to schools/courses';
COMMENT ON TABLE assessment_responses IS 'Individual responses per indicator';
COMMENT ON TABLE school_transversal_context IS 'School context questionnaire responses (11 questions)';
COMMENT ON TABLE school_course_structure IS 'Course structure derived from transversal questionnaire';
COMMENT ON TABLE school_course_docente_assignments IS 'Docente assignments to courses (triggers auto-assignment via API)';

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'RLS, functions, policies, and triggers created successfully!';
  RAISE NOTICE 'Migration complete!';
END;
$$;
