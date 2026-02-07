-- Migration: Add is_multi_user column to qa_scenarios
-- Date: 2026-01-16
-- Description: Adds support for multi-user scenarios that require
--              multiple browser tabs with different users

-- Add the is_multi_user column with default false
ALTER TABLE qa_scenarios
ADD COLUMN IF NOT EXISTS is_multi_user BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN qa_scenarios.is_multi_user IS 'If true, scenario requires multiple users in different browser tabs for testing collaborative features';

-- Update any existing scenarios that have multi-user steps
-- (This is a safety measure - existing scenarios should default to false)
UPDATE qa_scenarios
SET is_multi_user = false
WHERE is_multi_user IS NULL;
