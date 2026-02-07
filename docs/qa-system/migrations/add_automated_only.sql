-- Migration: Add automated_only column to qa_scenarios
-- Purpose: Separate scenarios that require logout (must run via Playwright) from manual testing
-- Date: 2024-01-14

-- Add the column with default false (most scenarios are manual)
ALTER TABLE qa_scenarios
ADD COLUMN IF NOT EXISTS automated_only BOOLEAN DEFAULT FALSE;

-- Add a comment explaining the column
COMMENT ON COLUMN qa_scenarios.automated_only IS
'If true, this scenario requires automated testing (Playwright) because it tests logged-out behavior or other states incompatible with manual QA testing';

-- Create an index for filtering
CREATE INDEX IF NOT EXISTS idx_qa_scenarios_automated_only ON qa_scenarios(automated_only);

-- Update existing auth scenarios that test logged-out behavior to be automated_only
-- These are scenarios that require the user to NOT be logged in
UPDATE qa_scenarios
SET automated_only = TRUE
WHERE feature_area = 'authentication'
  AND (
    -- Scenarios about protected page redirects (require no session)
    name ILIKE '%protegida sin autenticación%'
    OR name ILIKE '%página protegida%'
    OR name ILIKE '%sin sesión%'
    OR name ILIKE '%no autenticado%'
    -- Look for preconditions mentioning logout
    OR preconditions::text ILIKE '%no tiene sesión%'
    OR preconditions::text ILIKE '%cerrar sesión%'
    OR preconditions::text ILIKE '%sin sesión activa%'
  );

-- Verify the update
SELECT id, name, automated_only
FROM qa_scenarios
WHERE feature_area = 'authentication'
ORDER BY automated_only DESC, name;
