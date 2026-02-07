-- Migration: Create Code Coverage and Load Test Tables
-- Created: 2026-01-16
-- Purpose: Track code coverage reports and load testing results

-- ============================================
-- Code Coverage Reports Table
-- ============================================
CREATE TABLE IF NOT EXISTS qa_coverage_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_name TEXT,
  overall_lines DECIMAL CHECK (overall_lines >= 0 AND overall_lines <= 100),
  overall_statements DECIMAL CHECK (overall_statements >= 0 AND overall_statements <= 100),
  overall_functions DECIMAL CHECK (overall_functions >= 0 AND overall_functions <= 100),
  overall_branches DECIMAL CHECK (overall_branches >= 0 AND overall_branches <= 100),
  file_coverage JSONB,
  git_commit TEXT,
  git_branch TEXT,
  test_suite TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Add comments for documentation
COMMENT ON TABLE qa_coverage_reports IS 'Stores code coverage reports from test runs';
COMMENT ON COLUMN qa_coverage_reports.report_name IS 'Optional name/identifier for the report';
COMMENT ON COLUMN qa_coverage_reports.overall_lines IS 'Overall line coverage percentage (0-100)';
COMMENT ON COLUMN qa_coverage_reports.overall_statements IS 'Overall statement coverage percentage (0-100)';
COMMENT ON COLUMN qa_coverage_reports.overall_functions IS 'Overall function coverage percentage (0-100)';
COMMENT ON COLUMN qa_coverage_reports.overall_branches IS 'Overall branch coverage percentage (0-100)';
COMMENT ON COLUMN qa_coverage_reports.file_coverage IS 'JSON object with per-file coverage data';
COMMENT ON COLUMN qa_coverage_reports.git_commit IS 'Git commit hash for this coverage report';
COMMENT ON COLUMN qa_coverage_reports.git_branch IS 'Git branch name for this coverage report';
COMMENT ON COLUMN qa_coverage_reports.test_suite IS 'Name of test suite (unit, integration, e2e)';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_coverage_created ON qa_coverage_reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coverage_branch ON qa_coverage_reports(git_branch);
CREATE INDEX IF NOT EXISTS idx_coverage_commit ON qa_coverage_reports(git_commit);
CREATE INDEX IF NOT EXISTS idx_coverage_suite ON qa_coverage_reports(test_suite);

-- ============================================
-- Load Test Results Table
-- ============================================
CREATE TABLE IF NOT EXISTS qa_load_test_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  test_name TEXT NOT NULL,
  test_script TEXT,
  description TEXT,
  duration_seconds INTEGER,
  virtual_users INTEGER,
  requests_total INTEGER,
  requests_per_second DECIMAL,
  response_time_avg DECIMAL,
  response_time_min DECIMAL,
  response_time_max DECIMAL,
  response_time_p50 DECIMAL,
  response_time_p90 DECIMAL,
  response_time_p95 DECIMAL,
  response_time_p99 DECIMAL,
  error_rate DECIMAL CHECK (error_rate >= 0 AND error_rate <= 100),
  errors_total INTEGER,
  data_received_kb DECIMAL,
  data_sent_kb DECIMAL,
  iterations_total INTEGER,
  target_url TEXT,
  environment TEXT,
  metrics_json JSONB,
  status TEXT CHECK (status IN ('passed', 'failed', 'warning')) DEFAULT 'passed',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Add comments for documentation
COMMENT ON TABLE qa_load_test_results IS 'Stores load testing results from k6/Artillery runs';
COMMENT ON COLUMN qa_load_test_results.test_name IS 'Name of the load test scenario';
COMMENT ON COLUMN qa_load_test_results.test_script IS 'Name of the test script file';
COMMENT ON COLUMN qa_load_test_results.duration_seconds IS 'Total test duration in seconds';
COMMENT ON COLUMN qa_load_test_results.virtual_users IS 'Maximum number of virtual users';
COMMENT ON COLUMN qa_load_test_results.requests_per_second IS 'Average requests per second achieved';
COMMENT ON COLUMN qa_load_test_results.response_time_p50 IS 'Median response time in ms';
COMMENT ON COLUMN qa_load_test_results.response_time_p95 IS '95th percentile response time in ms';
COMMENT ON COLUMN qa_load_test_results.response_time_p99 IS '99th percentile response time in ms';
COMMENT ON COLUMN qa_load_test_results.error_rate IS 'Percentage of failed requests (0-100)';
COMMENT ON COLUMN qa_load_test_results.metrics_json IS 'Full metrics data in JSON format';
COMMENT ON COLUMN qa_load_test_results.status IS 'Overall test status based on thresholds';

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_loadtest_created ON qa_load_test_results(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loadtest_name ON qa_load_test_results(test_name);
CREATE INDEX IF NOT EXISTS idx_loadtest_status ON qa_load_test_results(status);
CREATE INDEX IF NOT EXISTS idx_loadtest_environment ON qa_load_test_results(environment);

-- ============================================
-- Row Level Security (RLS)
-- ============================================
ALTER TABLE qa_coverage_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE qa_load_test_results ENABLE ROW LEVEL SECURITY;

-- Coverage Reports: Only admins can manage
CREATE POLICY "Admins can manage coverage reports"
  ON qa_coverage_reports
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Load Test Results: Only admins can manage
CREATE POLICY "Admins can manage load test results"
  ON qa_load_test_results
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- ============================================
-- Coverage Thresholds Table (optional, for CI/CD)
-- ============================================
CREATE TABLE IF NOT EXISTS qa_coverage_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL CHECK (metric_name IN ('lines', 'statements', 'functions', 'branches')),
  threshold_warning DECIMAL NOT NULL CHECK (threshold_warning >= 0 AND threshold_warning <= 100),
  threshold_error DECIMAL NOT NULL CHECK (threshold_error >= 0 AND threshold_error <= 100),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE qa_coverage_thresholds IS 'Defines coverage thresholds for CI/CD integration';

-- Enable RLS on thresholds
ALTER TABLE qa_coverage_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage coverage thresholds"
  ON qa_coverage_thresholds
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Insert default coverage thresholds
INSERT INTO qa_coverage_thresholds (metric_name, threshold_warning, threshold_error) VALUES
  ('lines', 80, 60),
  ('statements', 80, 60),
  ('functions', 80, 60),
  ('branches', 70, 50)
ON CONFLICT DO NOTHING;

-- ============================================
-- Load Test Thresholds Table (optional, for CI/CD)
-- ============================================
CREATE TABLE IF NOT EXISTS qa_load_test_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_name TEXT NOT NULL CHECK (metric_name IN ('response_time_p95', 'response_time_p99', 'error_rate', 'requests_per_second')),
  threshold_warning DECIMAL NOT NULL,
  threshold_error DECIMAL NOT NULL,
  comparison TEXT NOT NULL CHECK (comparison IN ('less_than', 'greater_than')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE qa_load_test_thresholds IS 'Defines load test thresholds for pass/fail determination';

-- Enable RLS on load test thresholds
ALTER TABLE qa_load_test_thresholds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage load test thresholds"
  ON qa_load_test_thresholds
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid()
      AND role_type = 'admin'
      AND is_active = true
    )
  );

-- Insert default load test thresholds
INSERT INTO qa_load_test_thresholds (metric_name, threshold_warning, threshold_error, comparison) VALUES
  ('response_time_p95', 500, 1000, 'less_than'),
  ('response_time_p99', 1000, 2000, 'less_than'),
  ('error_rate', 1, 5, 'less_than'),
  ('requests_per_second', 100, 50, 'greater_than')
ON CONFLICT DO NOTHING;

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_qa_thresholds_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for auto-updating timestamps
DROP TRIGGER IF EXISTS trg_update_coverage_thresholds_timestamp ON qa_coverage_thresholds;
CREATE TRIGGER trg_update_coverage_thresholds_timestamp
  BEFORE UPDATE ON qa_coverage_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_qa_thresholds_timestamp();

DROP TRIGGER IF EXISTS trg_update_loadtest_thresholds_timestamp ON qa_load_test_thresholds;
CREATE TRIGGER trg_update_loadtest_thresholds_timestamp
  BEFORE UPDATE ON qa_load_test_thresholds
  FOR EACH ROW
  EXECUTE FUNCTION update_qa_thresholds_timestamp();
