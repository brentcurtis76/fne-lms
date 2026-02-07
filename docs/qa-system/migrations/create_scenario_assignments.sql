-- Migration: Create QA Scenario Assignments Table
-- Created: 2026-01-14
-- Purpose: Track which testers are assigned to which scenarios

-- Create the assignments table
CREATE TABLE IF NOT EXISTS qa_scenario_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scenario_id UUID NOT NULL REFERENCES qa_scenarios(id) ON DELETE CASCADE,
  tester_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ DEFAULT NOW(),
  assigned_by UUID REFERENCES profiles(id),
  due_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'skipped')),
  notes TEXT,
  completed_at TIMESTAMPTZ,
  UNIQUE(scenario_id, tester_id)
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_qa_assignments_tester ON qa_scenario_assignments(tester_id);
CREATE INDEX IF NOT EXISTS idx_qa_assignments_scenario ON qa_scenario_assignments(scenario_id);
CREATE INDEX IF NOT EXISTS idx_qa_assignments_status ON qa_scenario_assignments(status);
CREATE INDEX IF NOT EXISTS idx_qa_assignments_due_date ON qa_scenario_assignments(due_date) WHERE due_date IS NOT NULL;

-- Enable RLS
ALTER TABLE qa_scenario_assignments ENABLE ROW LEVEL SECURITY;

-- Policy: Admins can do everything
CREATE POLICY "Admins can manage all assignments"
  ON qa_scenario_assignments
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

-- Policy: Testers can view their own assignments
CREATE POLICY "Testers can view own assignments"
  ON qa_scenario_assignments
  FOR SELECT
  TO authenticated
  USING (tester_id = auth.uid());

-- Policy: Testers can update status of their own assignments
CREATE POLICY "Testers can update own assignment status"
  ON qa_scenario_assignments
  FOR UPDATE
  TO authenticated
  USING (tester_id = auth.uid())
  WITH CHECK (tester_id = auth.uid());

-- Add comment for documentation
COMMENT ON TABLE qa_scenario_assignments IS 'Tracks which QA testers are assigned to which test scenarios';
COMMENT ON COLUMN qa_scenario_assignments.status IS 'pending: not started, in_progress: being worked on, completed: finished, skipped: not applicable';

-- Function to auto-update assignment status when test run completes
-- NOTE: Failed tests do NOT mark assignment as complete - this is intentional
-- so that testers can re-run failed scenarios. Only pass/partial mark completion.
CREATE OR REPLACE FUNCTION update_assignment_on_test_completion()
RETURNS TRIGGER AS $$
BEGIN
  -- When a test run is completed, update the corresponding assignment
  IF NEW.status = 'completed' AND NEW.overall_result IS NOT NULL THEN
    UPDATE qa_scenario_assignments
    SET
      status = CASE
        WHEN NEW.overall_result IN ('pass', 'partial') THEN 'completed'
        WHEN NEW.overall_result = 'fail' THEN 'in_progress' -- Failed tests stay in progress for re-testing
        ELSE status
      END,
      completed_at = CASE
        WHEN NEW.overall_result IN ('pass', 'partial') THEN NOW()
        ELSE completed_at
      END
    WHERE scenario_id = NEW.scenario_id
      AND tester_id = NEW.tester_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for auto-updating assignments
DROP TRIGGER IF EXISTS trg_update_assignment_on_completion ON qa_test_runs;
CREATE TRIGGER trg_update_assignment_on_completion
  AFTER UPDATE ON qa_test_runs
  FOR EACH ROW
  WHEN (NEW.status = 'completed')
  EXECUTE FUNCTION update_assignment_on_test_completion();
