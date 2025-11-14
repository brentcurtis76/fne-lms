-- Migration 103: Create Debugging Infrastructure
-- Date: 2025-11-14
-- Purpose: Establishes comprehensive debugging tables for tracking bugs, logs, and debug sessions
--
-- This migration creates:
--   1. debug_bugs - Main table for bug tracking with categorization and metadata
--   2. debug_logs - Structured logging with context and relationships
--   3. debug_sessions - Debug session tracking for agent workflows
--
-- Features:
--   - Full-text search capabilities on bug descriptions
--   - RLS policies for role-based access control
--   - Optimized indexes for common query patterns
--   - Similarity search function for finding related bugs

-- =============================================================================
-- CUSTOM TYPES (ENUMS)
-- =============================================================================

-- Bug categories based on system architecture
CREATE TYPE debug_bug_category AS ENUM (
  'auth',
  'database',
  'ui',
  'rls',
  'realtime',
  'performance',
  'api'
);

-- Severity levels following standard bug tracking
CREATE TYPE debug_bug_severity AS ENUM (
  'critical',
  'high',
  'medium',
  'low'
);

-- Bug lifecycle status
CREATE TYPE debug_bug_status AS ENUM (
  'open',
  'investigating',
  'resolved',
  'wont_fix'
);

-- Environment where bug occurred
CREATE TYPE debug_bug_environment AS ENUM (
  'development',
  'staging',
  'production'
);

-- Log levels following standard logging practices
CREATE TYPE debug_log_level AS ENUM (
  'error',
  'warn',
  'info',
  'debug'
);

-- =============================================================================
-- TABLE: debug_bugs
-- =============================================================================

CREATE TABLE IF NOT EXISTS debug_bugs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core bug information
  title text NOT NULL,
  category debug_bug_category NOT NULL,
  severity debug_bug_severity NOT NULL,
  description text,
  error_message text,
  stack_trace text,
  reproduction_steps text,
  solution text,

  -- Affected resources
  affected_files text[],
  related_roles text[],

  -- Status and environment
  status debug_bug_status NOT NULL DEFAULT 'open',
  environment debug_bug_environment NOT NULL DEFAULT 'development',

  -- User and timeline
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  reported_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,

  -- Flexible metadata
  tags text[] DEFAULT '{}',
  metadata jsonb DEFAULT '{}'::jsonb,

  -- Constraints
  CONSTRAINT valid_resolution_date CHECK (
    resolved_at IS NULL OR resolved_at >= reported_at
  ),
  CONSTRAINT resolved_status_requires_date CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL) OR
    (status != 'resolved')
  )
);

-- Add comments for documentation
COMMENT ON TABLE debug_bugs IS 'Main bug tracking table with categorization, severity, and full lifecycle tracking';
COMMENT ON COLUMN debug_bugs.title IS 'Short, descriptive title of the bug';
COMMENT ON COLUMN debug_bugs.category IS 'System area where bug occurred (auth, database, ui, etc.)';
COMMENT ON COLUMN debug_bugs.severity IS 'Bug severity level (critical, high, medium, low)';
COMMENT ON COLUMN debug_bugs.affected_files IS 'Array of file paths affected by this bug';
COMMENT ON COLUMN debug_bugs.related_roles IS 'User roles that may be affected by this bug';
COMMENT ON COLUMN debug_bugs.metadata IS 'Flexible JSON field for additional context';

-- =============================================================================
-- TABLE: debug_logs
-- =============================================================================

CREATE TABLE IF NOT EXISTS debug_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Log information
  log_level debug_log_level NOT NULL,
  message text NOT NULL,
  context jsonb DEFAULT '{}'::jsonb,
  source text,

  -- User and session tracking
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id text,

  -- Bug relationship
  bug_id uuid REFERENCES debug_bugs(id) ON DELETE CASCADE,

  -- Timestamp
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Add comments
COMMENT ON TABLE debug_logs IS 'Structured logging table with context and bug relationships';
COMMENT ON COLUMN debug_logs.log_level IS 'Severity level of the log entry';
COMMENT ON COLUMN debug_logs.context IS 'JSON context including request data, state, etc.';
COMMENT ON COLUMN debug_logs.source IS 'Source component or file that generated the log';
COMMENT ON COLUMN debug_logs.session_id IS 'Browser/user session identifier';
COMMENT ON COLUMN debug_logs.bug_id IS 'Related bug if this log is part of bug investigation';

-- =============================================================================
-- TABLE: debug_sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS debug_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Bug relationship
  bug_id uuid NOT NULL REFERENCES debug_bugs(id) ON DELETE CASCADE,

  -- Session information
  agent_version text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,

  -- Session tracking
  steps_taken jsonb[] DEFAULT '{}',
  outcome text,
  files_modified text[] DEFAULT '{}',

  -- Constraints
  CONSTRAINT valid_completion_date CHECK (
    completed_at IS NULL OR completed_at >= started_at
  )
);

-- Add comments
COMMENT ON TABLE debug_sessions IS 'Tracks debugging sessions including agent actions and outcomes';
COMMENT ON COLUMN debug_sessions.agent_version IS 'Version of Claude or debugging agent used';
COMMENT ON COLUMN debug_sessions.steps_taken IS 'Array of JSON objects describing each debugging step';
COMMENT ON COLUMN debug_sessions.outcome IS 'Final result or resolution notes';
COMMENT ON COLUMN debug_sessions.files_modified IS 'List of files modified during this debug session';

-- =============================================================================
-- INDEXES FOR PERFORMANCE
-- =============================================================================

-- debug_bugs indexes
CREATE INDEX idx_debug_bugs_status ON debug_bugs(status);
CREATE INDEX idx_debug_bugs_severity ON debug_bugs(severity);
CREATE INDEX idx_debug_bugs_category ON debug_bugs(category);
CREATE INDEX idx_debug_bugs_environment ON debug_bugs(environment);
CREATE INDEX idx_debug_bugs_user_id ON debug_bugs(user_id);
CREATE INDEX idx_debug_bugs_reported_at ON debug_bugs(reported_at DESC);

-- GIN index for array and JSONB fields
CREATE INDEX idx_debug_bugs_tags ON debug_bugs USING GIN(tags);
CREATE INDEX idx_debug_bugs_metadata ON debug_bugs USING GIN(metadata);
CREATE INDEX idx_debug_bugs_affected_files ON debug_bugs USING GIN(affected_files);
CREATE INDEX idx_debug_bugs_related_roles ON debug_bugs USING GIN(related_roles);

-- Composite index for common queries
CREATE INDEX idx_debug_bugs_status_severity ON debug_bugs(status, severity);
CREATE INDEX idx_debug_bugs_category_status ON debug_bugs(category, status);

-- Full-text search index on searchable text fields
CREATE INDEX idx_debug_bugs_search ON debug_bugs USING GIN(
  to_tsvector('english',
    coalesce(title, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(error_message, '') || ' ' ||
    coalesce(solution, '')
  )
);

-- debug_logs indexes
CREATE INDEX idx_debug_logs_log_level ON debug_logs(log_level);
CREATE INDEX idx_debug_logs_bug_id ON debug_logs(bug_id);
CREATE INDEX idx_debug_logs_user_id ON debug_logs(user_id);
CREATE INDEX idx_debug_logs_session_id ON debug_logs(session_id);
CREATE INDEX idx_debug_logs_created_at ON debug_logs(created_at DESC);
CREATE INDEX idx_debug_logs_context ON debug_logs USING GIN(context);

-- debug_sessions indexes
CREATE INDEX idx_debug_sessions_bug_id ON debug_sessions(bug_id);
CREATE INDEX idx_debug_sessions_started_at ON debug_sessions(started_at DESC);
CREATE INDEX idx_debug_sessions_steps_taken ON debug_sessions USING GIN(steps_taken);

-- =============================================================================
-- SIMILARITY SEARCH FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION search_bugs_by_similarity(
  search_query text,
  similarity_threshold float DEFAULT 0.3,
  result_limit int DEFAULT 10
)
RETURNS TABLE (
  bug_id uuid,
  title text,
  category debug_bug_category,
  severity debug_bug_severity,
  status debug_bug_status,
  similarity_score float
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT
    db.id as bug_id,
    db.title,
    db.category,
    db.severity,
    db.status,
    ts_rank(
      to_tsvector('english',
        coalesce(db.title, '') || ' ' ||
        coalesce(db.description, '') || ' ' ||
        coalesce(db.error_message, '')
      ),
      plainto_tsquery('english', search_query)
    ) as similarity_score
  FROM debug_bugs db
  WHERE to_tsvector('english',
    coalesce(db.title, '') || ' ' ||
    coalesce(db.description, '') || ' ' ||
    coalesce(db.error_message, '')
  ) @@ plainto_tsquery('english', search_query)
  AND ts_rank(
    to_tsvector('english',
      coalesce(db.title, '') || ' ' ||
      coalesce(db.description, '') || ' ' ||
      coalesce(db.error_message, '')
    ),
    plainto_tsquery('english', search_query)
  ) >= similarity_threshold
  ORDER BY similarity_score DESC
  LIMIT result_limit;
END;
$$;

COMMENT ON FUNCTION search_bugs_by_similarity IS
'Searches bugs using full-text search with configurable similarity threshold';

-- =============================================================================
-- HELPER FUNCTION: Get Related Bugs by Tags
-- =============================================================================

CREATE OR REPLACE FUNCTION get_related_bugs(
  target_bug_id uuid,
  result_limit int DEFAULT 5
)
RETURNS TABLE (
  bug_id uuid,
  title text,
  common_tags text[],
  common_files text[],
  relevance_score int
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN QUERY
  WITH target_bug AS (
    SELECT tags, affected_files, category
    FROM debug_bugs
    WHERE id = target_bug_id
  )
  SELECT
    db.id as bug_id,
    db.title,
    array(SELECT unnest(db.tags) INTERSECT SELECT unnest(tb.tags)) as common_tags,
    array(SELECT unnest(db.affected_files) INTERSECT SELECT unnest(tb.affected_files)) as common_files,
    (
      cardinality(array(SELECT unnest(db.tags) INTERSECT SELECT unnest(tb.tags))) +
      cardinality(array(SELECT unnest(db.affected_files) INTERSECT SELECT unnest(tb.affected_files))) +
      CASE WHEN db.category = tb.category THEN 2 ELSE 0 END
    ) as relevance_score
  FROM debug_bugs db, target_bug tb
  WHERE db.id != target_bug_id
  AND (
    db.tags && tb.tags OR
    db.affected_files && tb.affected_files OR
    db.category = tb.category
  )
  ORDER BY relevance_score DESC
  LIMIT result_limit;
END;
$$;

COMMENT ON FUNCTION get_related_bugs IS
'Finds related bugs based on common tags, affected files, and category';

-- =============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE debug_bugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE debug_sessions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- debug_bugs RLS Policies
-- -----------------------------------------------------------------------------

-- Policy 1: Admins can view all bugs
CREATE POLICY "admins_read_all_bugs"
ON debug_bugs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 2: Consultors can view bugs in their scope (their schools)
CREATE POLICY "consultors_read_scoped_bugs"
ON debug_bugs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND ur.role_type = 'consultor'
    AND (
      -- Can see bugs they reported
      debug_bugs.user_id = auth.uid()
      OR
      -- Can see bugs related to their schools (if metadata contains school_id)
      debug_bugs.metadata->>'school_id' IN (
        SELECT school_id::text
        FROM user_roles
        WHERE user_id = auth.uid()
        AND is_active = true
        AND school_id IS NOT NULL
      )
    )
  )
);

-- Policy 3: Other authenticated users can only see bugs they reported
CREATE POLICY "users_read_own_bugs"
ON debug_bugs
FOR SELECT
TO authenticated
USING (
  debug_bugs.user_id = auth.uid()
);

-- Policy 4: Admins can insert bugs
CREATE POLICY "admins_insert_bugs"
ON debug_bugs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 5: Consultors can insert bugs
CREATE POLICY "consultors_insert_bugs"
ON debug_bugs
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'consultor'
  )
);

-- Policy 6: Any authenticated user can insert bugs
CREATE POLICY "authenticated_insert_bugs"
ON debug_bugs
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
);

-- Policy 7: Admins can update all bugs
CREATE POLICY "admins_update_all_bugs"
ON debug_bugs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 8: Consultors can update bugs in their scope
CREATE POLICY "consultors_update_scoped_bugs"
ON debug_bugs
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND ur.role_type = 'consultor'
    AND (
      debug_bugs.user_id = auth.uid()
      OR
      debug_bugs.metadata->>'school_id' IN (
        SELECT school_id::text
        FROM user_roles
        WHERE user_id = auth.uid()
        AND is_active = true
        AND school_id IS NOT NULL
      )
    )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.is_active = true
    AND ur.role_type = 'consultor'
  )
);

-- Policy 9: Users can update their own bugs
CREATE POLICY "users_update_own_bugs"
ON debug_bugs
FOR UPDATE
TO authenticated
USING (debug_bugs.user_id = auth.uid())
WITH CHECK (debug_bugs.user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- debug_logs RLS Policies
-- -----------------------------------------------------------------------------

-- Policy 1: Admins can view all logs
CREATE POLICY "admins_read_all_logs"
ON debug_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 2: Users can view their own logs
CREATE POLICY "users_read_own_logs"
ON debug_logs
FOR SELECT
TO authenticated
USING (debug_logs.user_id = auth.uid());

-- Policy 3: Users can view logs for bugs they can access
CREATE POLICY "users_read_bug_logs"
ON debug_logs
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM debug_bugs
    WHERE debug_bugs.id = debug_logs.bug_id
    AND debug_bugs.user_id = auth.uid()
  )
);

-- Policy 4: Authenticated users can insert logs
CREATE POLICY "authenticated_insert_logs"
ON debug_logs
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() IS NOT NULL);

-- -----------------------------------------------------------------------------
-- debug_sessions RLS Policies
-- -----------------------------------------------------------------------------

-- Policy 1: Admins can view all sessions
CREATE POLICY "admins_read_all_sessions"
ON debug_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- Policy 2: Users can view sessions for bugs they can access
CREATE POLICY "users_read_bug_sessions"
ON debug_sessions
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM debug_bugs
    WHERE debug_bugs.id = debug_sessions.bug_id
    AND debug_bugs.user_id = auth.uid()
  )
);

-- Policy 3: Admins and consultors can insert sessions
CREATE POLICY "admins_consultors_insert_sessions"
ON debug_sessions
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type IN ('admin', 'consultor')
  )
);

-- Policy 4: Admins can update all sessions
CREATE POLICY "admins_update_all_sessions"
ON debug_sessions
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.is_active = true
    AND user_roles.role_type = 'admin'
  )
);

-- =============================================================================
-- VERIFICATION AND SUMMARY
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ Migration 103 Applied Successfully';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Tables:';
  RAISE NOTICE '  1. debug_bugs - Bug tracking with full metadata';
  RAISE NOTICE '  2. debug_logs - Structured logging with context';
  RAISE NOTICE '  3. debug_sessions - Debug session tracking';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Types:';
  RAISE NOTICE '  - debug_bug_category (7 categories)';
  RAISE NOTICE '  - debug_bug_severity (4 levels)';
  RAISE NOTICE '  - debug_bug_status (4 states)';
  RAISE NOTICE '  - debug_bug_environment (3 environments)';
  RAISE NOTICE '  - debug_log_level (4 levels)';
  RAISE NOTICE '';
  RAISE NOTICE 'Created Functions:';
  RAISE NOTICE '  - search_bugs_by_similarity() - Full-text search';
  RAISE NOTICE '  - get_related_bugs() - Find related bugs';
  RAISE NOTICE '';
  RAISE NOTICE 'Indexes:';
  RAISE NOTICE '  - Standard B-tree indexes on foreign keys and status fields';
  RAISE NOTICE '  - GIN indexes for full-text search';
  RAISE NOTICE '  - GIN indexes for JSONB and array fields';
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Policies:';
  RAISE NOTICE '  - Admins: Full access to all tables';
  RAISE NOTICE '  - Consultors: Scoped access to bugs in their schools';
  RAISE NOTICE '  - Users: Access to their own bugs and related data';
  RAISE NOTICE '';
  RAISE NOTICE 'Security Features:';
  RAISE NOTICE '  ✅ Row Level Security enabled on all tables';
  RAISE NOTICE '  ✅ Role-based access control';
  RAISE NOTICE '  ✅ Data integrity constraints';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Test bug creation with different roles';
  RAISE NOTICE '  2. Test similarity search function';
  RAISE NOTICE '  3. Verify RLS policies with test users';
  RAISE NOTICE '  4. Integrate with debugging agent workflow';
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
END $$;
