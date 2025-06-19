-- Fix for duplicate policy errors in document system tables
-- This script safely drops and recreates all policies to avoid duplicates

-- 1. First, let's see what policies currently exist
DO $$
BEGIN
    RAISE NOTICE 'Current document system policies before cleanup:';
END $$;

SELECT 
    tablename,
    policyname,
    cmd
FROM pg_policies
WHERE tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
ORDER BY tablename, policyname;

-- 2. Drop ALL existing policies on document system tables
DO $$ 
DECLARE
    pol RECORD;
BEGIN
    -- Drop all policies on document_folders
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'document_folders'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON document_folders', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on document_folders', pol.policyname;
    END LOOP;
    
    -- Drop all policies on community_documents
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'community_documents'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON community_documents', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on community_documents', pol.policyname;
    END LOOP;
    
    -- Drop all policies on document_versions
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'document_versions'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON document_versions', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on document_versions', pol.policyname;
    END LOOP;
    
    -- Drop all policies on document_access_log
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'public' 
        AND tablename = 'document_access_log'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON document_access_log', pol.policyname);
        RAISE NOTICE 'Dropped policy: % on document_access_log', pol.policyname;
    END LOOP;
END $$;

-- 3. Enable RLS on all tables (safe to run multiple times)
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_log ENABLE ROW LEVEL SECURITY;

-- 4. Recreate all document system policies

-- ============ DOCUMENT FOLDERS POLICIES ============

-- Users can view folders in accessible workspaces
CREATE POLICY "Users can view folders in accessible workspaces" ON document_folders
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = document_folders.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community member access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.is_active = TRUE
            )
            OR
            -- Consultant access to assigned communities
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN growth_communities gc ON gc.id = cw.community_id
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'consultor'
                AND ur.school_id = gc.school_id
                AND ur.is_active = TRUE
            )
        )
    )
);

-- Community leaders and admins can create folders
CREATE POLICY "Community leaders and admins can create folders" ON document_folders
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = document_folders.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community leader access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.role_type = 'lider_comunidad'
                AND ur.is_active = TRUE
            )
        )
    )
);

-- Community leaders and admins can update folders
CREATE POLICY "Community leaders and admins can update folders" ON document_folders
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = document_folders.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community leader access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.role_type = 'lider_comunidad'
                AND ur.is_active = TRUE
            )
        )
    )
);

-- Community leaders and admins can delete folders
CREATE POLICY "Community leaders and admins can delete folders" ON document_folders
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = document_folders.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community leader access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.role_type = 'lider_comunidad'
                AND ur.is_active = TRUE
            )
        )
    )
    AND
    -- Prevent deletion if folder has documents
    NOT EXISTS (
        SELECT 1 FROM community_documents
        WHERE folder_id = document_folders.id
    )
);

-- ============ COMMUNITY DOCUMENTS POLICIES ============

-- Users can view documents in accessible workspaces
CREATE POLICY "Users can view documents in accessible workspaces" ON community_documents
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = community_documents.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community member access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.is_active = TRUE
            )
            OR
            -- Consultant access to assigned communities
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN growth_communities gc ON gc.id = cw.community_id
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'consultor'
                AND ur.school_id = gc.school_id
                AND ur.is_active = TRUE
            )
        )
    )
);

-- Authorized users can upload documents
CREATE POLICY "Authorized users can upload documents" ON community_documents
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        WHERE cw.id = community_documents.workspace_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community member with upload permission
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.is_active = TRUE
                AND (cw.settings->>'all_can_upload')::boolean = TRUE
            )
            OR
            -- Community leader (always can upload)
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.role_type = 'lider_comunidad'
                AND ur.is_active = TRUE
            )
            OR
            -- Consultant can upload to assigned communities
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN growth_communities gc ON gc.id = cw.community_id
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'consultor'
                AND ur.school_id = gc.school_id
                AND ur.is_active = TRUE
            )
        )
    )
);

-- Users can update their own documents
CREATE POLICY "Users can update their own documents" ON community_documents
FOR UPDATE USING (
    uploaded_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'admin'
        AND ur.is_active = TRUE
    )
);

-- Users can delete their own documents or admins/leaders can delete any
CREATE POLICY "Users can delete documents based on permissions" ON community_documents
FOR DELETE USING (
    uploaded_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'admin'
        AND ur.is_active = TRUE
    )
    OR
    EXISTS (
        SELECT 1 FROM community_workspaces cw
        JOIN user_roles ur ON ur.community_id = cw.community_id
        WHERE cw.id = community_documents.workspace_id
        AND ur.user_id = auth.uid()
        AND ur.role_type = 'lider_comunidad'
        AND ur.is_active = TRUE
    )
);

-- ============ DOCUMENT VERSIONS POLICIES ============

-- Users can view versions of accessible documents
CREATE POLICY "Users can view versions of accessible documents" ON document_versions
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM community_documents cd
        JOIN community_workspaces cw ON cw.id = cd.workspace_id
        WHERE cd.id = document_versions.document_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community member access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.is_active = TRUE
            )
            OR
            -- Consultant access
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN growth_communities gc ON gc.id = cw.community_id
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'consultor'
                AND ur.school_id = gc.school_id
                AND ur.is_active = TRUE
            )
        )
    )
);

-- System can create versions automatically
CREATE POLICY "System can create document versions" ON document_versions
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM community_documents cd
        WHERE cd.id = document_versions.document_id
        AND cd.uploaded_by = auth.uid()
    )
);

-- ============ DOCUMENT ACCESS LOG POLICIES ============

-- Users can view their own access logs
CREATE POLICY "Users can view their own access logs" ON document_access_log
FOR SELECT USING (
    accessed_by = auth.uid()
    OR
    EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'admin'
        AND ur.is_active = TRUE
    )
);

-- Users can create access logs for documents they access
CREATE POLICY "Users can log document access" ON document_access_log
FOR INSERT WITH CHECK (
    accessed_by = auth.uid()
    AND
    EXISTS (
        SELECT 1 FROM community_documents cd
        JOIN community_workspaces cw ON cw.id = cd.workspace_id
        WHERE cd.id = document_access_log.document_id
        AND (
            -- Admin access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'admin'
                AND ur.is_active = TRUE
            )
            OR
            -- Community member access
            EXISTS (
                SELECT 1 FROM user_roles ur
                WHERE ur.user_id = auth.uid()
                AND ur.community_id = cw.community_id
                AND ur.is_active = TRUE
            )
            OR
            -- Consultant access
            EXISTS (
                SELECT 1 FROM user_roles ur
                JOIN growth_communities gc ON gc.id = cw.community_id
                WHERE ur.user_id = auth.uid()
                AND ur.role_type = 'consultor'
                AND ur.school_id = gc.school_id
                AND ur.is_active = TRUE
            )
        )
    )
);

-- 5. Verify the final state
DO $$
DECLARE
    df_count INTEGER;
    cd_count INTEGER;
    dv_count INTEGER;
    dal_count INTEGER;
BEGIN
    -- Count policies on each table
    SELECT COUNT(*) INTO df_count FROM pg_policies WHERE tablename = 'document_folders' AND schemaname = 'public';
    SELECT COUNT(*) INTO cd_count FROM pg_policies WHERE tablename = 'community_documents' AND schemaname = 'public';
    SELECT COUNT(*) INTO dv_count FROM pg_policies WHERE tablename = 'document_versions' AND schemaname = 'public';
    SELECT COUNT(*) INTO dal_count FROM pg_policies WHERE tablename = 'document_access_log' AND schemaname = 'public';
    
    RAISE NOTICE '';
    RAISE NOTICE '=== Document System Policy Creation Summary ===';
    RAISE NOTICE 'document_folders policies: %', df_count;
    RAISE NOTICE 'community_documents policies: %', cd_count;
    RAISE NOTICE 'document_versions policies: %', dv_count;
    RAISE NOTICE 'document_access_log policies: %', dal_count;
    RAISE NOTICE '';
END $$;

-- 6. Show final policies
SELECT 
    tablename,
    policyname,
    cmd,
    qual IS NOT NULL as has_using_clause,
    with_check IS NOT NULL as has_check_clause
FROM pg_policies
WHERE tablename IN ('document_folders', 'community_documents', 'document_versions', 'document_access_log')
ORDER BY tablename, policyname;