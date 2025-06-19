-- Comprehensive cleanup script for document system
-- Run this BEFORE running document-system.sql to avoid all duplicate errors

-- ============================================
-- 1. DROP ALL POLICIES
-- ============================================

-- Drop all policies on document_folders
DROP POLICY IF EXISTS "Users can view folders in accessible workspaces" ON document_folders;
DROP POLICY IF EXISTS "Users can create folders in accessible workspaces" ON document_folders;
DROP POLICY IF EXISTS "Users can update their own folders or leaders can update any" ON document_folders;
DROP POLICY IF EXISTS "Users can delete their own folders or leaders can delete any" ON document_folders;

-- Drop all policies on community_documents
DROP POLICY IF EXISTS "Users can view documents in accessible workspaces" ON community_documents;
DROP POLICY IF EXISTS "Users can upload documents to accessible workspaces" ON community_documents;
DROP POLICY IF EXISTS "Users can update their own documents or leaders can update any" ON community_documents;
DROP POLICY IF EXISTS "Users can delete their own documents or leaders can delete any" ON community_documents;

-- Drop all policies on document_versions
DROP POLICY IF EXISTS "Users can view versions of accessible documents" ON document_versions;
DROP POLICY IF EXISTS "Users can create versions for documents they can access" ON document_versions;

-- Drop all policies on document_access_log
DROP POLICY IF EXISTS "Leaders and document owners can view access logs" ON document_access_log;
DROP POLICY IF EXISTS "System can insert access logs" ON document_access_log;

-- ============================================
-- 2. DROP ALL TRIGGERS
-- ============================================

-- Drop triggers on document_folders
DROP TRIGGER IF EXISTS update_document_folders_timestamp ON document_folders;

-- Drop triggers on community_documents  
DROP TRIGGER IF EXISTS update_community_documents_timestamp ON community_documents;

-- Drop any other triggers that might exist
DO $$
DECLARE
    trig RECORD;
BEGIN
    FOR trig IN 
        SELECT trigger_name, event_object_table
        FROM information_schema.triggers
        WHERE event_object_schema = 'public'
        AND event_object_table IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON %I', trig.trigger_name, trig.event_object_table);
        RAISE NOTICE 'Dropped trigger: % on %', trig.trigger_name, trig.event_object_table;
    END LOOP;
END $$;

-- ============================================
-- 3. DROP ALL FUNCTIONS (if they exist)
-- ============================================

-- Drop document-related functions
DROP FUNCTION IF EXISTS get_folder_breadcrumb(UUID);
DROP FUNCTION IF EXISTS get_folder_path(UUID);
DROP FUNCTION IF EXISTS get_document_statistics(UUID);
DROP FUNCTION IF EXISTS get_user_workspace_role(UUID, UUID);
DROP FUNCTION IF EXISTS create_document_version(UUID, TEXT, BIGINT, VARCHAR);

-- ============================================
-- 4. DROP ALL INDEXES (except primary keys)
-- ============================================

-- Drop indexes on document_folders
DROP INDEX IF EXISTS idx_document_folders_workspace;
DROP INDEX IF EXISTS idx_document_folders_parent;
DROP INDEX IF EXISTS idx_document_folders_created_by;

-- Drop indexes on community_documents
DROP INDEX IF EXISTS idx_community_documents_workspace;
DROP INDEX IF EXISTS idx_community_documents_folder;
DROP INDEX IF EXISTS idx_community_documents_uploaded_by;
DROP INDEX IF EXISTS idx_community_documents_tags;
DROP INDEX IF EXISTS idx_community_documents_active;

-- Drop indexes on document_versions
DROP INDEX IF EXISTS idx_document_versions_document;
DROP INDEX IF EXISTS idx_document_versions_uploaded_by;

-- Drop indexes on document_access_log
DROP INDEX IF EXISTS idx_document_access_log_document;
DROP INDEX IF EXISTS idx_document_access_log_user;
DROP INDEX IF EXISTS idx_document_access_log_workspace;
DROP INDEX IF EXISTS idx_document_access_log_accessed_at;

-- ============================================
-- 5. VERIFICATION
-- ============================================

-- Show remaining policies
SELECT 'Policies' as object_type, COUNT(*) as count
FROM pg_policies
WHERE tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
AND schemaname = 'public'

UNION ALL

-- Show remaining triggers
SELECT 'Triggers' as object_type, COUNT(*) as count
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')

UNION ALL

-- Show remaining indexes
SELECT 'Indexes' as object_type, COUNT(*) as count
FROM pg_indexes
WHERE schemaname = 'public'
AND tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
AND indexname NOT LIKE '%_pkey';

-- Final message
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== Document System Cleanup Complete ===';
    RAISE NOTICE 'You can now run document-system.sql without conflicts';
    RAISE NOTICE '';
END $$;