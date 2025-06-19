-- Drop ALL existing policies on document system tables
-- This will clean up any partial migration attempts

-- 1. Drop all policies on document_folders
DROP POLICY IF EXISTS "Users can view folders in accessible workspaces" ON document_folders;
DROP POLICY IF EXISTS "Users can create folders in accessible workspaces" ON document_folders;
DROP POLICY IF EXISTS "Users can update their own folders or leaders can update any" ON document_folders;
DROP POLICY IF EXISTS "Users can delete their own folders or leaders can delete any" ON document_folders;

-- 2. Drop all policies on community_documents
DROP POLICY IF EXISTS "Users can view documents in accessible workspaces" ON community_documents;
DROP POLICY IF EXISTS "Users can upload documents to accessible workspaces" ON community_documents;
DROP POLICY IF EXISTS "Users can update their own documents or leaders can update any" ON community_documents;
DROP POLICY IF EXISTS "Users can delete their own documents or leaders can delete any" ON community_documents;

-- 3. Drop all policies on document_versions
DROP POLICY IF EXISTS "Users can view versions of accessible documents" ON document_versions;
DROP POLICY IF EXISTS "Users can create versions for documents they can access" ON document_versions;

-- 4. Drop all policies on document_access_log
DROP POLICY IF EXISTS "Leaders and document owners can view access logs" ON document_access_log;
DROP POLICY IF EXISTS "System can insert access logs" ON document_access_log;

-- 5. Show what policies remain (should be none)
SELECT 
    'Remaining policies:' as status,
    COUNT(*) as count
FROM pg_policies
WHERE tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
AND schemaname = 'public';

-- 6. List any remaining policies (for debugging)
SELECT 
    tablename,
    policyname
FROM pg_policies
WHERE tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
AND schemaname = 'public'
ORDER BY tablename, policyname;