-- ============================================================
-- 055a_cleanup_before_migration.sql
-- Run this FIRST if migration 055 fails with errors about
-- existing objects or missing columns
-- ============================================================

-- Drop all tables in reverse dependency order
DROP TABLE IF EXISTS assessment_instance_results CASCADE;
DROP TABLE IF EXISTS assessment_responses CASCADE;
DROP TABLE IF EXISTS assessment_instance_assignees CASCADE;
DROP TABLE IF EXISTS assessment_instances CASCADE;
DROP TABLE IF EXISTS assessment_template_snapshots CASCADE;
DROP TABLE IF EXISTS assessment_year_expectations CASCADE;
DROP TABLE IF EXISTS assessment_sub_questions CASCADE;
DROP TABLE IF EXISTS assessment_indicators CASCADE;
DROP TABLE IF EXISTS assessment_modules CASCADE;
DROP TABLE IF EXISTS assessment_context_questions CASCADE;
DROP TABLE IF EXISTS assessment_templates CASCADE;
DROP TABLE IF EXISTS school_course_docente_assignments CASCADE;
DROP TABLE IF EXISTS school_course_structure CASCADE;
DROP TABLE IF EXISTS school_transversal_context CASCADE;

-- Drop functions (if they exist)
DROP FUNCTION IF EXISTS auth_is_assessment_admin();
DROP FUNCTION IF EXISTS auth_is_school_directivo(INTEGER);

-- Verify cleanup
DO $$
BEGIN
  RAISE NOTICE 'Cleanup complete. You can now run 055_assessment_builder_schema.sql';
END;
$$;
