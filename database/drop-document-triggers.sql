-- Drop all existing triggers on document system tables
-- This handles cases where the migration was partially run

-- 1. Drop triggers on document_folders
DROP TRIGGER IF EXISTS update_document_folders_timestamp ON document_folders;

-- 2. Drop triggers on community_documents  
DROP TRIGGER IF EXISTS update_community_documents_timestamp ON community_documents;

-- 3. Show existing triggers on document tables (for verification)
SELECT 
    event_object_table as table_name,
    trigger_name,
    event_manipulation as event,
    action_timing as timing
FROM information_schema.triggers
WHERE event_object_schema = 'public'
AND event_object_table IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
ORDER BY event_object_table, trigger_name;