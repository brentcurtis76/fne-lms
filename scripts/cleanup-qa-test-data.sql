-- ============================================================================
-- QA Test Data Cleanup Script
-- ============================================================================
-- Purpose: Remove all QA test scenarios, runs, and related data
--
-- WHAT THIS SCRIPT DELETES:
--   - qa_scenario_assignments (scenario-to-tester assignments)
--   - qa_step_results (individual step outcomes)
--   - qa_test_runs (test execution records)
--   - qa_tester_time_logs (time tracking data)
--   - qa_scenarios (test scenario definitions)
--
-- WHAT THIS SCRIPT PRESERVES:
--   - QA test users (*.qa@fne.cl accounts)
--   - codebase_index entries
--
-- USAGE:
--   1. For DRY RUN (preview what will be deleted):
--      - Run the script as-is (ends with ROLLBACK)
--      - Check the counts in the output
--
--   2. For ACTUAL DELETION:
--      - Change ROLLBACK to COMMIT at the bottom of the script
--      - Run the script
--
-- WARNING: This script deletes data permanently when COMMIT is used!
-- ============================================================================

BEGIN;

-- ============================================================================
-- PREVIEW: Show counts of what will be deleted
-- ============================================================================

DO $$
DECLARE
  assignment_count INTEGER;
  step_result_count INTEGER;
  test_run_count INTEGER;
  time_log_count INTEGER;
  scenario_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO assignment_count FROM qa_scenario_assignments;
  SELECT COUNT(*) INTO step_result_count FROM qa_step_results;
  SELECT COUNT(*) INTO test_run_count FROM qa_test_runs;
  SELECT COUNT(*) INTO time_log_count FROM qa_tester_time_logs;
  SELECT COUNT(*) INTO scenario_count FROM qa_scenarios;

  RAISE NOTICE '=== DATA TO BE DELETED ===';
  RAISE NOTICE 'qa_scenario_assignments: % rows', assignment_count;
  RAISE NOTICE 'qa_step_results: % rows', step_result_count;
  RAISE NOTICE 'qa_test_runs: % rows', test_run_count;
  RAISE NOTICE 'qa_tester_time_logs: % rows', time_log_count;
  RAISE NOTICE 'qa_scenarios: % rows', scenario_count;
  RAISE NOTICE '==========================';
END $$;

-- ============================================================================
-- STEP 1: Delete scenario assignments
-- ============================================================================
-- These link scenarios to testers. Must be deleted first due to FK constraints.
-- ============================================================================

DO $$
DECLARE
  row_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM qa_scenario_assignments;
  RAISE NOTICE '[1/5] qa_scenario_assignments: % rows to delete', row_count;

  DELETE FROM qa_scenario_assignments;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[1/5] Deleted % rows from qa_scenario_assignments', deleted_count;
END $$;

-- ============================================================================
-- STEP 2: Delete step results
-- ============================================================================
-- Individual step outcomes from test runs. FK to qa_test_runs.
-- ============================================================================

DO $$
DECLARE
  row_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM qa_step_results;
  RAISE NOTICE '[2/5] qa_step_results: % rows to delete', row_count;

  DELETE FROM qa_step_results;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[2/5] Deleted % rows from qa_step_results', deleted_count;
END $$;

-- ============================================================================
-- STEP 3: Delete test runs
-- ============================================================================
-- Test execution records. FK to qa_scenarios and profiles.
-- ============================================================================

DO $$
DECLARE
  row_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM qa_test_runs;
  RAISE NOTICE '[3/5] qa_test_runs: % rows to delete', row_count;

  DELETE FROM qa_test_runs;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[3/5] Deleted % rows from qa_test_runs', deleted_count;
END $$;

-- ============================================================================
-- STEP 4: Delete tester time logs
-- ============================================================================
-- Time tracking for QA testers. FK to qa_scenarios.
-- ============================================================================

DO $$
DECLARE
  row_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM qa_tester_time_logs;
  RAISE NOTICE '[4/5] qa_tester_time_logs: % rows to delete', row_count;

  DELETE FROM qa_tester_time_logs;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[4/5] Deleted % rows from qa_tester_time_logs', deleted_count;
END $$;

-- ============================================================================
-- STEP 5: Delete scenarios
-- ============================================================================
-- The test scenario definitions themselves.
-- ============================================================================

DO $$
DECLARE
  row_count INTEGER;
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO row_count FROM qa_scenarios;
  RAISE NOTICE '[5/5] qa_scenarios: % rows to delete', row_count;

  DELETE FROM qa_scenarios;
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '[5/5] Deleted % rows from qa_scenarios', deleted_count;
END $$;

-- ============================================================================
-- VERIFICATION: Confirm all tables are empty
-- ============================================================================

DO $$
DECLARE
  assignment_count INTEGER;
  step_result_count INTEGER;
  test_run_count INTEGER;
  time_log_count INTEGER;
  scenario_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO assignment_count FROM qa_scenario_assignments;
  SELECT COUNT(*) INTO step_result_count FROM qa_step_results;
  SELECT COUNT(*) INTO test_run_count FROM qa_test_runs;
  SELECT COUNT(*) INTO time_log_count FROM qa_tester_time_logs;
  SELECT COUNT(*) INTO scenario_count FROM qa_scenarios;

  RAISE NOTICE '=== REMAINING DATA (should all be 0) ===';
  RAISE NOTICE 'qa_scenario_assignments: % rows', assignment_count;
  RAISE NOTICE 'qa_step_results: % rows', step_result_count;
  RAISE NOTICE 'qa_test_runs: % rows', test_run_count;
  RAISE NOTICE 'qa_tester_time_logs: % rows', time_log_count;
  RAISE NOTICE 'qa_scenarios: % rows', scenario_count;
  RAISE NOTICE '========================================';
END $$;

-- ============================================================================
-- PRESERVED DATA: Show what was NOT deleted
-- ============================================================================

DO $$
DECLARE
  qa_user_count INTEGER;
  index_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO qa_user_count FROM profiles WHERE email LIKE '%.qa@fne.cl';
  SELECT COUNT(*) INTO index_count FROM codebase_index;

  RAISE NOTICE '=== PRESERVED DATA (not deleted) ===';
  RAISE NOTICE 'QA test users (*.qa@fne.cl): % accounts', qa_user_count;
  RAISE NOTICE 'codebase_index entries: % rows', index_count;
  RAISE NOTICE '====================================';
END $$;

-- ============================================================================
-- CHANGE TO COMMIT FOR ACTUAL DELETION
-- ============================================================================
ROLLBACK;
-- COMMIT;
