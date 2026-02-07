-- User onboarding state table
-- Tracks which tours users have completed or skipped

CREATE TABLE IF NOT EXISTS user_onboarding_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) NOT NULL UNIQUE,
  tours_completed JSONB DEFAULT '{}',
  tours_skipped JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster lookups by user_id
CREATE INDEX IF NOT EXISTS idx_user_onboarding_state_user_id
  ON user_onboarding_state(user_id);

-- Enable RLS
ALTER TABLE user_onboarding_state ENABLE ROW LEVEL SECURITY;

-- Users can only manage their own onboarding state
CREATE POLICY "Users can manage own onboarding state"
  ON user_onboarding_state FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Add comment for documentation
COMMENT ON TABLE user_onboarding_state IS 'Tracks which onboarding tours users have completed or skipped';
COMMENT ON COLUMN user_onboarding_state.tours_completed IS 'JSONB object mapping tour_id to completion timestamp';
COMMENT ON COLUMN user_onboarding_state.tours_skipped IS 'JSONB object mapping tour_id to skip timestamp';
