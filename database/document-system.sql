-- =============================================================================
-- FNE LMS - Document Repository System
-- =============================================================================
-- Professional document management system for growth community collaborative workspaces
-- Supports folder organization, file versioning, access control, and tracking

-- =============================================================================
-- 1. DOCUMENT FOLDERS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  folder_name VARCHAR(100) NOT NULL,
  parent_folder_id UUID REFERENCES document_folders(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT folder_name_not_empty CHECK (LENGTH(TRIM(folder_name)) > 0),
  CONSTRAINT no_self_parent CHECK (id != parent_folder_id)
);

-- =============================================================================
-- 2. COMMUNITY DOCUMENTS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS community_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  folder_id UUID REFERENCES document_folders(id) ON DELETE SET NULL,
  
  -- Document metadata
  title VARCHAR(200) NOT NULL,
  description TEXT,
  tags TEXT[] DEFAULT '{}',
  
  -- File information
  file_name VARCHAR(255) NOT NULL,
  file_size BIGINT NOT NULL, -- Size in bytes
  mime_type VARCHAR(100) NOT NULL,
  storage_path TEXT NOT NULL, -- Supabase Storage path
  thumbnail_url TEXT, -- Generated thumbnail for images/PDFs
  
  -- Version control
  current_version INTEGER DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  
  -- Access tracking
  download_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  
  -- Audit fields
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT document_title_not_empty CHECK (LENGTH(TRIM(title)) > 0),
  CONSTRAINT file_name_not_empty CHECK (LENGTH(TRIM(file_name)) > 0),
  CONSTRAINT file_size_positive CHECK (file_size > 0),
  CONSTRAINT current_version_positive CHECK (current_version > 0)
);

-- =============================================================================
-- 3. DOCUMENT VERSIONS TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES community_documents(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  uploaded_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT version_number_positive CHECK (version_number > 0),
  CONSTRAINT file_size_positive CHECK (file_size > 0),
  CONSTRAINT unique_document_version UNIQUE (document_id, version_number)
);

-- =============================================================================
-- 4. DOCUMENT ACCESS LOG TABLE
-- =============================================================================
CREATE TABLE IF NOT EXISTS document_access_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES community_documents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id),
  workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
  action_type VARCHAR(20) NOT NULL, -- 'view', 'download', 'upload', 'delete'
  ip_address INET,
  user_agent TEXT,
  accessed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT valid_action_type CHECK (action_type IN ('view', 'download', 'upload', 'delete'))
);

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- Document Folders indexes
CREATE INDEX IF NOT EXISTS idx_document_folders_workspace ON document_folders(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_document_folders_created_by ON document_folders(created_by);

-- Community Documents indexes
CREATE INDEX IF NOT EXISTS idx_community_documents_workspace ON community_documents(workspace_id);
CREATE INDEX IF NOT EXISTS idx_community_documents_folder ON community_documents(folder_id);
CREATE INDEX IF NOT EXISTS idx_community_documents_uploaded_by ON community_documents(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_community_documents_created_at ON community_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_community_documents_tags ON community_documents USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_community_documents_active ON community_documents(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_community_documents_file_name ON community_documents(file_name);

-- Document Versions indexes
CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_at ON document_versions(created_at DESC);

-- Document Access Log indexes
CREATE INDEX IF NOT EXISTS idx_document_access_log_document ON document_access_log(document_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_user ON document_access_log(user_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_workspace ON document_access_log(workspace_id);
CREATE INDEX IF NOT EXISTS idx_document_access_log_accessed_at ON document_access_log(accessed_at DESC);

-- =============================================================================
-- HELPER FUNCTIONS
-- =============================================================================

-- Function to get document statistics for a workspace
CREATE OR REPLACE FUNCTION get_document_statistics(workspace_uuid UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_documents', COALESCE(total_docs.count, 0),
    'total_folders', COALESCE(total_folders.count, 0),
    'total_storage_bytes', COALESCE(total_storage.sum, 0),
    'total_downloads', COALESCE(total_downloads.sum, 0),
    'recent_uploads', COALESCE(recent_uploads.count, 0),
    'file_types', COALESCE(file_types.types, '[]'::json),
    'top_uploaders', COALESCE(top_uploaders.uploaders, '[]'::json)
  ) INTO result
  FROM 
    (SELECT COUNT(*) as count FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_docs
  CROSS JOIN
    (SELECT COUNT(*) as count FROM document_folders WHERE workspace_id = workspace_uuid) total_folders
  CROSS JOIN
    (SELECT COALESCE(SUM(file_size), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_storage
  CROSS JOIN
    (SELECT COALESCE(SUM(download_count), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_downloads
  CROSS JOIN
    (SELECT COUNT(*) as count FROM community_documents 
     WHERE workspace_id = workspace_uuid AND is_active = true AND created_at >= NOW() - INTERVAL '7 days') recent_uploads
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('mime_type', mime_type, 'count', count)), '[]'::json) as types
     FROM (SELECT mime_type, COUNT(*) as count 
           FROM community_documents 
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY mime_type
           ORDER BY count DESC
           LIMIT 10) types) file_types
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('user_id', uploaded_by, 'count', count)), '[]'::json) as uploaders
     FROM (SELECT uploaded_by, COUNT(*) as count 
           FROM community_documents 
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY uploaded_by
           ORDER BY count DESC
           LIMIT 5) uploaders) top_uploaders;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get recent document activity
CREATE OR REPLACE FUNCTION get_recent_document_activity(workspace_uuid UUID, limit_count INTEGER DEFAULT 20)
RETURNS TABLE (
  document_id UUID,
  document_title VARCHAR,
  action_type VARCHAR,
  user_id UUID,
  accessed_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    dal.document_id,
    cd.title as document_title,
    dal.action_type,
    dal.user_id,
    dal.accessed_at
  FROM document_access_log dal
  JOIN community_documents cd ON dal.document_id = cd.id
  WHERE dal.workspace_id = workspace_uuid
    AND cd.is_active = true
  ORDER BY dal.accessed_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to increment document counters
CREATE OR REPLACE FUNCTION increment_document_counter(
  document_uuid UUID,
  counter_type TEXT,
  user_uuid UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  workspace_uuid UUID;
BEGIN
  -- Get workspace ID
  SELECT workspace_id INTO workspace_uuid 
  FROM community_documents 
  WHERE id = document_uuid;
  
  -- Update document counters
  IF counter_type = 'view' THEN
    UPDATE community_documents 
    SET view_count = view_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  ELSIF counter_type = 'download' THEN
    UPDATE community_documents 
    SET download_count = download_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  END IF;
  
  -- Log the access if user is provided
  IF user_uuid IS NOT NULL AND workspace_uuid IS NOT NULL THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (document_uuid, user_uuid, workspace_uuid, counter_type);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to create new document version
CREATE OR REPLACE FUNCTION create_document_version(
  document_uuid UUID,
  new_storage_path TEXT,
  new_file_size BIGINT,
  new_mime_type VARCHAR,
  user_uuid UUID
)
RETURNS INTEGER AS $$
DECLARE
  new_version_number INTEGER;
BEGIN
  -- Get next version number
  SELECT COALESCE(MAX(version_number), 0) + 1 
  INTO new_version_number
  FROM document_versions
  WHERE document_id = document_uuid;
  
  -- Insert new version
  INSERT INTO document_versions (
    document_id, 
    version_number, 
    storage_path, 
    file_size, 
    mime_type, 
    uploaded_by
  ) VALUES (
    document_uuid, 
    new_version_number, 
    new_storage_path, 
    new_file_size, 
    new_mime_type, 
    user_uuid
  );
  
  -- Update current document
  UPDATE community_documents 
  SET 
    current_version = new_version_number,
    storage_path = new_storage_path,
    file_size = new_file_size,
    mime_type = new_mime_type,
    updated_at = NOW()
  WHERE id = document_uuid;
  
  RETURN new_version_number;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get folder breadcrumb path
CREATE OR REPLACE FUNCTION get_folder_breadcrumb(folder_uuid UUID)
RETURNS JSON AS $$
DECLARE
  breadcrumb JSON;
BEGIN
  WITH RECURSIVE folder_path AS (
    -- Base case: start with the target folder
    SELECT id, folder_name, parent_folder_id, 0 as level
    FROM document_folders
    WHERE id = folder_uuid
    
    UNION ALL
    
    -- Recursive case: get parent folders
    SELECT df.id, df.folder_name, df.parent_folder_id, fp.level + 1
    FROM document_folders df
    JOIN folder_path fp ON df.id = fp.parent_folder_id
  )
  SELECT json_agg(
    json_build_object(
      'id', id,
      'name', folder_name
    ) ORDER BY level DESC
  ) INTO breadcrumb
  FROM folder_path;
  
  RETURN COALESCE(breadcrumb, '[]'::json);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE community_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_access_log ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- DOCUMENT FOLDERS POLICIES
-- =============================================================================

-- View folders policy
CREATE POLICY "Users can view folders in accessible workspaces"
  ON document_folders FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
  );

-- Create folders policy  
CREATE POLICY "Users can create folders in accessible workspaces"
  ON document_folders FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND created_by = auth.uid()
  );

-- Update folders policy
CREATE POLICY "Users can update their own folders or leaders can update any"
  ON document_folders FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND (
      created_by = auth.uid() 
      OR get_user_workspace_role(auth.uid(), workspace_id) IN ('admin', 'lider_comunidad')
    )
  );

-- Delete folders policy
CREATE POLICY "Users can delete their own folders or leaders can delete any"
  ON document_folders FOR DELETE
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND (
      created_by = auth.uid() 
      OR get_user_workspace_role(auth.uid(), workspace_id) IN ('admin', 'lider_comunidad')
    )
  );

-- =============================================================================
-- COMMUNITY DOCUMENTS POLICIES
-- =============================================================================

-- View documents policy
CREATE POLICY "Users can view documents in accessible workspaces"
  ON community_documents FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND is_active = true
  );

-- Create documents policy
CREATE POLICY "Users can upload documents to accessible workspaces"
  ON community_documents FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND uploaded_by = auth.uid()
  );

-- Update documents policy
CREATE POLICY "Users can update their own documents or leaders can update any"
  ON community_documents FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND (
      uploaded_by = auth.uid() 
      OR get_user_workspace_role(auth.uid(), workspace_id) IN ('admin', 'lider_comunidad')
    )
  );

-- Delete documents policy (soft delete by setting is_active = false)
CREATE POLICY "Users can delete their own documents or leaders can delete any"
  ON community_documents FOR UPDATE
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND (
      uploaded_by = auth.uid() 
      OR get_user_workspace_role(auth.uid(), workspace_id) IN ('admin', 'lider_comunidad')
    )
  );

-- =============================================================================
-- DOCUMENT VERSIONS POLICIES
-- =============================================================================

-- View versions policy
CREATE POLICY "Users can view versions of accessible documents"
  ON document_versions FOR SELECT
  USING (
    document_id IN (
      SELECT id FROM community_documents cd
      WHERE cd.workspace_id IN (
        SELECT id FROM community_workspaces 
        WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
      )
      AND cd.is_active = true
    )
  );

-- Create versions policy
CREATE POLICY "Users can create versions for documents they can access"
  ON document_versions FOR INSERT
  WITH CHECK (
    document_id IN (
      SELECT id FROM community_documents cd
      WHERE cd.workspace_id IN (
        SELECT id FROM community_workspaces 
        WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
      )
      AND (
        cd.uploaded_by = auth.uid() 
        OR get_user_workspace_role(auth.uid(), cd.workspace_id) IS NOT NULL
      )
    )
    AND uploaded_by = auth.uid()
  );

-- =============================================================================
-- DOCUMENT ACCESS LOG POLICIES
-- =============================================================================

-- View access log policy (leaders and document owners only)
CREATE POLICY "Leaders and document owners can view access logs"
  ON document_access_log FOR SELECT
  USING (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IN ('admin', 'lider_comunidad')
    )
    OR document_id IN (
      SELECT id FROM community_documents 
      WHERE uploaded_by = auth.uid()
    )
  );

-- Insert access log policy
CREATE POLICY "System can insert access logs"
  ON document_access_log FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT id FROM community_workspaces 
      WHERE get_user_workspace_role(auth.uid(), id) IS NOT NULL
    )
    AND user_id = auth.uid()
  );

-- =============================================================================
-- TRIGGERS FOR AUTOMATIC UPDATES
-- =============================================================================

-- Update timestamp trigger for folders
CREATE OR REPLACE FUNCTION update_folder_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_document_folders_timestamp
  BEFORE UPDATE ON document_folders
  FOR EACH ROW EXECUTE FUNCTION update_folder_timestamp();

-- Update timestamp trigger for documents
CREATE OR REPLACE FUNCTION update_document_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_community_documents_timestamp
  BEFORE UPDATE ON community_documents
  FOR EACH ROW EXECUTE FUNCTION update_document_timestamp();

-- Trigger to log document access when counters are updated
CREATE OR REPLACE FUNCTION log_document_access()
RETURNS TRIGGER AS $$
BEGIN
  -- Only log if view_count or download_count changed
  IF (OLD.view_count != NEW.view_count) THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (NEW.id, auth.uid(), NEW.workspace_id, 'view');
  END IF;
  
  IF (OLD.download_count != NEW.download_count) THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (NEW.id, auth.uid(), NEW.workspace_id, 'download');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER log_community_documents_access
  AFTER UPDATE ON community_documents
  FOR EACH ROW EXECUTE FUNCTION log_document_access();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- This will be populated by the migration script with sample folders
-- for testing and development

-- =============================================================================
-- DOCUMENTATION
-- =============================================================================

/*
DOCUMENT REPOSITORY SYSTEM OVERVIEW:

1. FOLDER ORGANIZATION:
   - Hierarchical folder structure with unlimited nesting
   - Breadcrumb navigation support
   - Workspace-specific folder organization

2. DOCUMENT MANAGEMENT:
   - File metadata with title, description, and tags
   - Version control system with history tracking
   - Soft delete with is_active flag
   - Thumbnail support for visual files

3. ACCESS CONTROL:
   - Role-based permissions following workspace patterns
   - Admins: Full access across all workspaces
   - Líderes de Comunidad: Full control within their community
   - Docentes: Upload/download, delete own files only
   - Consultants: Access to assigned communities

4. TRACKING & ANALYTICS:
   - View and download counters
   - Detailed access logs with IP and user agent
   - Storage usage statistics
   - Recent activity tracking

5. FILE VERSIONING:
   - Complete version history
   - Automatic version numbering
   - Storage path tracking for each version

6. INTEGRATION:
   - Uses existing community_workspaces system
   - Leverages established role-based access patterns
   - Follows RLS security model

USAGE EXAMPLES:
- get_document_statistics('workspace-uuid') - Get workspace document stats
- get_recent_document_activity('workspace-uuid', 20) - Get recent activity
- increment_document_counter('doc-uuid', 'view', 'user-uuid') - Track access
- create_document_version('doc-uuid', 'path', 12345, 'application/pdf', 'user-uuid') - New version
- get_folder_breadcrumb('folder-uuid') - Get folder navigation path
*/