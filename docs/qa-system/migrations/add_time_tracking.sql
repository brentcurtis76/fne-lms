-- Migration: Add time tracking columns for QA billing
-- Purpose: Track active time (excluding idle time) for tester billing
-- Date: 2024-01-14

-- ============================================================
-- 1. Add active_seconds to qa_step_results
-- ============================================================

-- Add column to track active time per step
ALTER TABLE qa_step_results
ADD COLUMN IF NOT EXISTS active_seconds INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN qa_step_results.active_seconds IS
'Active time spent on this step in seconds (excludes idle time)';

-- ============================================================
-- 2. Add total_active_seconds to qa_test_runs
-- ============================================================

-- Add column to track total active time for the entire test run
ALTER TABLE qa_test_runs
ADD COLUMN IF NOT EXISTS total_active_seconds INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN qa_test_runs.total_active_seconds IS
'Total active time for this test run in seconds (excludes idle time)';

-- ============================================================
-- 3. Create qa_tester_time_logs table for daily summaries
-- ============================================================

CREATE TABLE IF NOT EXISTS qa_tester_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  log_date DATE NOT NULL,
  total_active_seconds INTEGER DEFAULT 0,
  total_idle_seconds INTEGER DEFAULT 0,
  tests_started INTEGER DEFAULT 0,
  tests_completed INTEGER DEFAULT 0,
  tests_passed INTEGER DEFAULT 0,
  tests_failed INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Unique constraint: one log per tester per day
  CONSTRAINT uq_tester_time_log_date UNIQUE (tester_id, log_date)
);

-- Add comments
COMMENT ON TABLE qa_tester_time_logs IS
'Daily time tracking summaries for QA testers, used for billing';

COMMENT ON COLUMN qa_tester_time_logs.tester_id IS
'Reference to the tester profile';

COMMENT ON COLUMN qa_tester_time_logs.log_date IS
'The date this log entry covers';

COMMENT ON COLUMN qa_tester_time_logs.total_active_seconds IS
'Total active testing time for this day in seconds';

COMMENT ON COLUMN qa_tester_time_logs.total_idle_seconds IS
'Total idle time (paused due to inactivity) in seconds';

COMMENT ON COLUMN qa_tester_time_logs.tests_started IS
'Number of test runs started on this day';

COMMENT ON COLUMN qa_tester_time_logs.tests_completed IS
'Number of test runs completed on this day';

COMMENT ON COLUMN qa_tester_time_logs.tests_passed IS
'Number of test runs with pass result';

COMMENT ON COLUMN qa_tester_time_logs.tests_failed IS
'Number of test runs with fail result';

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qa_tester_time_logs_tester_id
ON qa_tester_time_logs(tester_id);

CREATE INDEX IF NOT EXISTS idx_qa_tester_time_logs_log_date
ON qa_tester_time_logs(log_date);

CREATE INDEX IF NOT EXISTS idx_qa_tester_time_logs_tester_date
ON qa_tester_time_logs(tester_id, log_date);

-- ============================================================
-- 4. Create function to update daily time logs
-- ============================================================

CREATE OR REPLACE FUNCTION update_qa_tester_time_log()
RETURNS TRIGGER AS $$
DECLARE
  v_log_date DATE;
  v_is_completed BOOLEAN;
  v_result TEXT;
BEGIN
  -- Get the date of the test run
  v_log_date := DATE(COALESCE(NEW.completed_at, NEW.started_at));
  v_is_completed := NEW.status = 'completed';
  v_result := NEW.overall_result;

  -- Insert or update the daily log
  INSERT INTO qa_tester_time_logs (
    tester_id,
    log_date,
    total_active_seconds,
    tests_started,
    tests_completed,
    tests_passed,
    tests_failed
  )
  VALUES (
    NEW.tester_id,
    v_log_date,
    COALESCE(NEW.total_active_seconds, 0),
    1,
    CASE WHEN v_is_completed THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'pass' THEN 1 ELSE 0 END,
    CASE WHEN v_result = 'fail' THEN 1 ELSE 0 END
  )
  ON CONFLICT (tester_id, log_date)
  DO UPDATE SET
    total_active_seconds = qa_tester_time_logs.total_active_seconds + COALESCE(NEW.total_active_seconds, 0) - COALESCE(OLD.total_active_seconds, 0),
    tests_started = qa_tester_time_logs.tests_started + CASE WHEN TG_OP = 'INSERT' THEN 1 ELSE 0 END,
    tests_completed = qa_tester_time_logs.tests_completed +
      CASE WHEN NEW.status = 'completed' AND (OLD IS NULL OR OLD.status != 'completed') THEN 1 ELSE 0 END,
    tests_passed = qa_tester_time_logs.tests_passed +
      CASE WHEN NEW.overall_result = 'pass' AND (OLD IS NULL OR OLD.overall_result != 'pass') THEN 1 ELSE 0 END,
    tests_failed = qa_tester_time_logs.tests_failed +
      CASE WHEN NEW.overall_result = 'fail' AND (OLD IS NULL OR OLD.overall_result != 'fail') THEN 1 ELSE 0 END,
    updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger (drop first if exists)
DROP TRIGGER IF EXISTS trg_update_qa_tester_time_log ON qa_test_runs;

CREATE TRIGGER trg_update_qa_tester_time_log
AFTER INSERT OR UPDATE ON qa_test_runs
FOR EACH ROW
EXECUTE FUNCTION update_qa_tester_time_log();

-- ============================================================
-- 5. Enable RLS on qa_tester_time_logs
-- ============================================================

ALTER TABLE qa_tester_time_logs ENABLE ROW LEVEL SECURITY;

-- Admins can see all time logs
CREATE POLICY qa_tester_time_logs_admin_all ON qa_tester_time_logs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND role_type = 'admin'
    AND is_active = true
  )
);

-- Testers can see their own time logs
CREATE POLICY qa_tester_time_logs_own ON qa_tester_time_logs
FOR SELECT
TO authenticated
USING (tester_id = auth.uid());

-- ============================================================
-- 6. Verify the migration
-- ============================================================

-- Check columns exist
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'qa_step_results' AND column_name = 'active_seconds'
UNION ALL
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'qa_test_runs' AND column_name = 'total_active_seconds';

-- Check table exists
SELECT table_name
FROM information_schema.tables
WHERE table_name = 'qa_tester_time_logs';
