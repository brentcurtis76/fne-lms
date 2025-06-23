-- Add closed_at column to platform_feedback table if it doesn't exist
ALTER TABLE platform_feedback 
ADD COLUMN IF NOT EXISTS closed_at timestamptz;

-- Add comment for clarity
COMMENT ON COLUMN platform_feedback.closed_at IS 'Timestamp when the feedback was closed';

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_platform_feedback_closed_at ON platform_feedback(closed_at);