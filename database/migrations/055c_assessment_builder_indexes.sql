-- ============================================================
-- 055c_assessment_builder_indexes.sql
-- PART 2: Create all indexes (run after 055b)
-- ============================================================

-- Indexes for school_transversal_context
CREATE INDEX IF NOT EXISTS idx_transversal_context_school ON school_transversal_context(school_id);
CREATE INDEX IF NOT EXISTS idx_transversal_context_completed ON school_transversal_context(completed_at);

-- Indexes for school_course_structure
CREATE INDEX IF NOT EXISTS idx_course_structure_school ON school_course_structure(school_id);
CREATE INDEX IF NOT EXISTS idx_course_structure_context ON school_course_structure(context_id);

-- Indexes for school_course_docente_assignments
CREATE INDEX IF NOT EXISTS idx_course_docente_course ON school_course_docente_assignments(course_structure_id);
CREATE INDEX IF NOT EXISTS idx_course_docente_docente ON school_course_docente_assignments(docente_id);
CREATE INDEX IF NOT EXISTS idx_course_docente_active ON school_course_docente_assignments(is_active) WHERE is_active = true;

-- Indexes for assessment_templates
CREATE INDEX IF NOT EXISTS idx_templates_area ON assessment_templates(area);
CREATE INDEX IF NOT EXISTS idx_templates_status ON assessment_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_published ON assessment_templates(status, published_at) WHERE status = 'published';

-- Indexes for assessment_context_questions
CREATE INDEX IF NOT EXISTS idx_context_questions_template ON assessment_context_questions(template_id);
CREATE INDEX IF NOT EXISTS idx_context_questions_order ON assessment_context_questions(template_id, display_order);

-- Indexes for assessment_modules
CREATE INDEX IF NOT EXISTS idx_modules_template ON assessment_modules(template_id);
CREATE INDEX IF NOT EXISTS idx_modules_order ON assessment_modules(template_id, display_order);

-- Indexes for assessment_indicators
CREATE INDEX IF NOT EXISTS idx_indicators_module ON assessment_indicators(module_id);
CREATE INDEX IF NOT EXISTS idx_indicators_category ON assessment_indicators(category);
CREATE INDEX IF NOT EXISTS idx_indicators_order ON assessment_indicators(module_id, display_order);

-- Indexes for assessment_sub_questions
CREATE INDEX IF NOT EXISTS idx_sub_questions_indicator ON assessment_sub_questions(indicator_id);
CREATE INDEX IF NOT EXISTS idx_sub_questions_parent ON assessment_sub_questions(parent_question_id);

-- Indexes for assessment_year_expectations
CREATE INDEX IF NOT EXISTS idx_expectations_template ON assessment_year_expectations(template_id);
CREATE INDEX IF NOT EXISTS idx_expectations_indicator ON assessment_year_expectations(indicator_id);

-- Indexes for assessment_template_snapshots
CREATE INDEX IF NOT EXISTS idx_snapshots_template ON assessment_template_snapshots(template_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_version ON assessment_template_snapshots(template_id, version);

-- Indexes for assessment_instances
CREATE INDEX IF NOT EXISTS idx_instances_snapshot ON assessment_instances(template_snapshot_id);
CREATE INDEX IF NOT EXISTS idx_instances_community ON assessment_instances(growth_community_id);
CREATE INDEX IF NOT EXISTS idx_instances_school ON assessment_instances(school_id);
CREATE INDEX IF NOT EXISTS idx_instances_course ON assessment_instances(course_structure_id);
CREATE INDEX IF NOT EXISTS idx_instances_status ON assessment_instances(status);
CREATE INDEX IF NOT EXISTS idx_instances_year ON assessment_instances(transformation_year);

-- Indexes for assessment_instance_assignees
CREATE INDEX IF NOT EXISTS idx_assignees_instance ON assessment_instance_assignees(instance_id);
CREATE INDEX IF NOT EXISTS idx_assignees_user ON assessment_instance_assignees(user_id);
CREATE INDEX IF NOT EXISTS idx_assignees_pending ON assessment_instance_assignees(user_id, has_submitted) WHERE has_submitted = false;

-- Indexes for assessment_responses
CREATE INDEX IF NOT EXISTS idx_responses_instance ON assessment_responses(instance_id);
CREATE INDEX IF NOT EXISTS idx_responses_indicator ON assessment_responses(indicator_id);
CREATE INDEX IF NOT EXISTS idx_responses_user ON assessment_responses(responded_by);

-- Indexes for assessment_instance_results
CREATE INDEX IF NOT EXISTS idx_results_instance ON assessment_instance_results(instance_id);

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'All indexes created successfully!';
  RAISE NOTICE 'Now run 055d_assessment_builder_rls.sql';
END;
$$;
