-- Quick fix for duplicate policy error on document_folders table
-- Run this before running document-system.sql

-- Drop the specific policy that's causing the error
DROP POLICY IF EXISTS "Users can view folders in accessible workspaces" ON document_folders;

-- You can now run document-system.sql without the duplicate policy error

-- Optional: Check if the policy was dropped
SELECT 
    tablename,
    policyname
FROM pg_policies
WHERE tablename = 'document_folders'
AND policyname = 'Users can view folders in accessible workspaces';