-- Migration: 054_assignment_audit_log.sql
-- Description: Create audit log table for tracking assignment/unassignment actions
-- Phase 4 of Assignment Matrix feature
--
-- ENTITY TYPE SEMANTICS:
-- - 'user': Individual user assignment (entity_id = auth.users.id UUID)
-- - 'community_workspace': Workspace/group assignment (entity_id = community_workspaces.id UUID)
--   NOTE: This is NOT growth_communities. LP group assignments use community_workspaces.
--
-- EXCLUDED ENTITY TYPES:
-- - 'school': schools.id is INTEGER, not UUID - incompatible with entity_id column
-- - 'growth_community': Not currently used for assignments (only for user membership)
--
-- SECURITY MODEL:
-- - INSERT: Server-only via service_role key (no authenticated INSERT policy)
-- - SELECT: Role-gated to admin, consultor, equipo_directivo
-- - This prevents users from spoofing audit entries
--
-- ENUM SAFETY:
-- This migration creates NEW enum types. If these types already exist with DIFFERENT
-- values (e.g., from a previous version), the DO...EXCEPTION block will silently
-- reuse the existing type, which may cause runtime errors.
--
-- BEFORE RUNNING: Verify these types don't exist, or if they do, have matching values:
--   SELECT enumlabel FROM pg_enum WHERE enumtypid = 'assignment_entity_type'::regtype;
--
-- TO MODIFY ENUMS AFTER DEPLOYMENT:
-- - ADD VALUE: ALTER TYPE assignment_entity_type ADD VALUE 'new_value';
-- - REMOVE/RENAME: Create new type, migrate column, drop old type (separate migration)

-- Create enum types for audit logging
DO $$ BEGIN
    CREATE TYPE assignment_action AS ENUM ('assigned', 'unassigned');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 'community_workspace' instead of 'community' to be explicit about what we're tracking
DO $$ BEGIN
    CREATE TYPE assignment_entity_type AS ENUM ('user', 'community_workspace');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assignment_content_type AS ENUM ('course', 'learning_path');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE assignment_source AS ENUM ('direct', 'learning_path');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create the audit log table
CREATE TABLE IF NOT EXISTS assignment_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action assignment_action NOT NULL,
    entity_type assignment_entity_type NOT NULL,
    entity_id UUID NOT NULL,
    content_type assignment_content_type NOT NULL,
    content_id UUID NOT NULL,
    source assignment_source NOT NULL,
    source_learning_path_id UUID,
    performed_by UUID NOT NULL REFERENCES auth.users(id),
    performed_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

-- Add accurate comments describing the table and columns
COMMENT ON TABLE assignment_audit_log IS 'Tracks all assignment and unassignment actions for courses and learning paths. INSERT is server-only (service_role).';
COMMENT ON COLUMN assignment_audit_log.action IS 'Whether content was assigned or unassigned';
COMMENT ON COLUMN assignment_audit_log.entity_type IS 'Type of entity receiving the assignment: user (individual) or community_workspace (group)';
COMMENT ON COLUMN assignment_audit_log.entity_id IS 'UUID of the user (auth.users.id) or workspace (community_workspaces.id)';
COMMENT ON COLUMN assignment_audit_log.content_type IS 'Type of content being assigned (course or learning_path)';
COMMENT ON COLUMN assignment_audit_log.content_id IS 'ID of the course or learning path';
COMMENT ON COLUMN assignment_audit_log.source IS 'Whether this was a direct assignment or via learning path enrollment';
COMMENT ON COLUMN assignment_audit_log.source_learning_path_id IS 'If source is learning_path, the ID of that LP (for course enrollments derived from LP assignment)';
COMMENT ON COLUMN assignment_audit_log.performed_by IS 'User who performed the action (from auth.uid() at API level)';
COMMENT ON COLUMN assignment_audit_log.metadata IS 'Additional context: batchSize, viaWorkspaceGroup, bulkUnassignment, memberCount, etc.';

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_audit_entity
    ON assignment_audit_log(entity_type, entity_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_content
    ON assignment_audit_log(content_type, content_id, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_performer
    ON assignment_audit_log(performed_by, performed_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_performed_at
    ON assignment_audit_log(performed_at DESC);

-- Enable Row Level Security
ALTER TABLE assignment_audit_log ENABLE ROW LEVEL SECURITY;

-- SELECT policy: admins, consultors, and equipo_directivo can view audit logs
CREATE POLICY "admin_consultor_directivo_view" ON assignment_audit_log
FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND is_active = true
        AND role_type IN ('admin', 'consultor', 'equipo_directivo')
    )
);

-- NO INSERT POLICY FOR authenticated role
-- Audit entries are written server-side using service_role key only.
-- This prevents users from spoofing audit history.
--
-- The API endpoints (courses/batch-assign, learning-paths/unassign, etc.)
-- use createApiSupabaseClient which has service_role access, bypassing RLS.

-- Grant SELECT only to authenticated users (INSERT requires service_role)
GRANT SELECT ON assignment_audit_log TO authenticated;

-- Service role has full access by default (bypasses RLS)
-- No explicit GRANT needed for service_role
