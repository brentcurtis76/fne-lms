-- ============================================================
-- QA Cleanup Script for Assessment Builder
-- ============================================================
-- This script removes all test data with the TEST_QA_ prefix.
-- Run this BEFORE seeding and AFTER E2E tests to clean up.
--
-- Usage: Execute in Supabase SQL Editor or via psql
-- Note: This is idempotent - safe to run multiple times
-- ============================================================

-- Disable triggers temporarily for faster deletion
SET session_replication_role = replica;

BEGIN;

-- ============================================================
-- 1. Delete assessment responses (most dependent)
-- ============================================================
DELETE FROM assessment_responses
WHERE instance_id IN (
  SELECT ai.id FROM assessment_instances ai
  JOIN assessment_template_snapshots ats ON ai.template_snapshot_id = ats.id
  JOIN assessment_templates at ON ats.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 2. Delete assessment instance results
-- ============================================================
DELETE FROM assessment_instance_results
WHERE instance_id IN (
  SELECT ai.id FROM assessment_instances ai
  JOIN assessment_template_snapshots ats ON ai.template_snapshot_id = ats.id
  JOIN assessment_templates at ON ats.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 3. Delete assessment instance assignees
-- ============================================================
DELETE FROM assessment_instance_assignees
WHERE instance_id IN (
  SELECT ai.id FROM assessment_instances ai
  JOIN assessment_template_snapshots ats ON ai.template_snapshot_id = ats.id
  JOIN assessment_templates at ON ats.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 4. Delete assessment instances
-- ============================================================
DELETE FROM assessment_instances
WHERE template_snapshot_id IN (
  SELECT ats.id FROM assessment_template_snapshots ats
  JOIN assessment_templates at ON ats.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- Also delete instances linked to TEST_QA_ schools
DELETE FROM assessment_instances
WHERE school_id IN (
  SELECT id FROM schools WHERE name LIKE 'TEST_QA_%'
);

-- Also delete instances linked to TEST_QA_ course structures
DELETE FROM assessment_instances
WHERE course_structure_id IN (
  SELECT id FROM school_course_structure
  WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'TEST_QA_%')
);

-- ============================================================
-- 5. Delete docente assignments to courses
-- ============================================================
DELETE FROM school_course_docente_assignments
WHERE course_structure_id IN (
  SELECT id FROM school_course_structure
  WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'TEST_QA_%')
);

-- ============================================================
-- 6. Delete course structure records
-- ============================================================
DELETE FROM school_course_structure
WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'TEST_QA_%');

-- ============================================================
-- 7. Delete transversal context
-- ============================================================
DELETE FROM school_transversal_context
WHERE school_id IN (SELECT id FROM schools WHERE name LIKE 'TEST_QA_%');

-- ============================================================
-- 8. Delete year expectations
-- ============================================================
DELETE FROM assessment_year_expectations
WHERE template_id IN (
  SELECT id FROM assessment_templates WHERE name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 9. Delete sub-questions (nested under indicators)
-- ============================================================
DELETE FROM assessment_sub_questions
WHERE indicator_id IN (
  SELECT ai.id FROM assessment_indicators ai
  JOIN assessment_modules am ON ai.module_id = am.id
  JOIN assessment_templates at ON am.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 10. Delete indicators
-- ============================================================
DELETE FROM assessment_indicators
WHERE module_id IN (
  SELECT am.id FROM assessment_modules am
  JOIN assessment_templates at ON am.template_id = at.id
  WHERE at.name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 11. Delete context questions
-- ============================================================
DELETE FROM assessment_context_questions
WHERE template_id IN (
  SELECT id FROM assessment_templates WHERE name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 12. Delete modules
-- ============================================================
DELETE FROM assessment_modules
WHERE template_id IN (
  SELECT id FROM assessment_templates WHERE name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 13. Delete template snapshots
-- ============================================================
DELETE FROM assessment_template_snapshots
WHERE template_id IN (
  SELECT id FROM assessment_templates WHERE name LIKE 'TEST_QA_%'
);

-- ============================================================
-- 14. Delete templates (root level)
-- ============================================================
DELETE FROM assessment_templates
WHERE name LIKE 'TEST_QA_%';

-- ============================================================
-- 15. Delete test schools
-- ============================================================
DELETE FROM schools WHERE name LIKE 'TEST_QA_%';

-- ============================================================
-- 16. Delete test users from user_roles
-- ============================================================
DELETE FROM user_roles
WHERE user_id IN (
  SELECT id FROM auth.users WHERE email LIKE 'test_qa_%@test.com'
);

-- ============================================================
-- 17. Delete test profiles
-- ============================================================
DELETE FROM profiles
WHERE id IN (
  SELECT id FROM auth.users WHERE email LIKE 'test_qa_%@test.com'
);

-- Note: We don't delete from auth.users directly as that requires
-- admin privileges. Test users should be deleted via Supabase Dashboard
-- or using the service role key in a separate script.

COMMIT;

-- Re-enable triggers
SET session_replication_role = DEFAULT;

-- ============================================================
-- Verification: Count remaining TEST_QA_ data
-- ============================================================
DO $$
DECLARE
  template_count INTEGER;
  school_count INTEGER;
  instance_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO template_count FROM assessment_templates WHERE name LIKE 'TEST_QA_%';
  SELECT COUNT(*) INTO school_count FROM schools WHERE name LIKE 'TEST_QA_%';
  SELECT COUNT(*) INTO instance_count FROM assessment_instances ai
    JOIN assessment_template_snapshots ats ON ai.template_snapshot_id = ats.id
    JOIN assessment_templates at ON ats.template_id = at.id
    WHERE at.name LIKE 'TEST_QA_%';

  RAISE NOTICE 'Cleanup complete!';
  RAISE NOTICE 'Remaining TEST_QA_ templates: %', template_count;
  RAISE NOTICE 'Remaining TEST_QA_ schools: %', school_count;
  RAISE NOTICE 'Remaining TEST_QA_ instances: %', instance_count;

  IF template_count > 0 OR school_count > 0 OR instance_count > 0 THEN
    RAISE WARNING 'Some test data may remain. Check for foreign key constraints.';
  END IF;
END;
$$;
