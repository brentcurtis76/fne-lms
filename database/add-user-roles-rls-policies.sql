-- =====================================================
-- RLS Policies for user_roles Table
-- =====================================================
-- This migration adds Row Level Security policies to the user_roles table
-- to ensure proper access control at the database level.
-- 
-- Security Model:
-- - Users can view their own roles
-- - Admins can view all roles
-- - ALL mutations blocked at database level - must use API endpoints
-- =====================================================

-- Enable RLS on user_roles table
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (for idempotency)
DROP POLICY IF EXISTS "Users can view their own roles" ON user_roles;
DROP POLICY IF EXISTS "Admins can view all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can manage all roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can insert roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can update roles" ON user_roles;
DROP POLICY IF EXISTS "Service role can delete roles" ON user_roles;
DROP POLICY IF EXISTS "Block all direct mutations from authenticated users" ON user_roles;

-- =====================================================
-- SELECT Policies
-- =====================================================

-- Policy 1: Users can view their own roles
CREATE POLICY "Users can view their own roles" ON user_roles
  FOR SELECT
  USING (auth.uid() = user_id);

-- Policy 2: Admins can view all roles (checks current user's admin status)
CREATE POLICY "Admins can view all roles" ON user_roles
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid() 
      AND ur.role_type = 'admin'
    )
  );

-- =====================================================
-- Mutation Policy - Block ALL direct mutations
-- =====================================================
-- CRITICAL: This policy explicitly blocks ALL mutations (INSERT, UPDATE, DELETE)
-- from any user subject to RLS. Only the service role, which bypasses RLS
-- entirely, can perform mutations. This ensures all changes must go through
-- our secure API endpoints.

CREATE POLICY "Block all direct mutations from authenticated users" ON user_roles
  FOR ALL
  USING (false)
  WITH CHECK (false);

-- =====================================================
-- Performance Indexes
-- =====================================================

-- Index for fast lookups by user_id (if not already exists)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON user_roles(user_id);

-- Index for fast lookups by role_type (useful for admin checks)
CREATE INDEX IF NOT EXISTS idx_user_roles_role_type ON user_roles(role_type);

-- Composite index for checking if a user has a specific role
CREATE INDEX IF NOT EXISTS idx_user_roles_user_role ON user_roles(user_id, role_type);

-- Index for organizational lookups
CREATE INDEX IF NOT EXISTS idx_user_roles_school_id ON user_roles(school_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_generation_id ON user_roles(generation_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_community_id ON user_roles(community_id);

-- =====================================================
-- Add Comments for Documentation
-- =====================================================

COMMENT ON POLICY "Users can view their own roles" ON user_roles IS 
  'Allows users to see their own role assignments for proper UI rendering and authorization checks';

COMMENT ON POLICY "Admins can view all roles" ON user_roles IS 
  'Allows administrators to view all role assignments for user management purposes';

COMMENT ON POLICY "Block all direct mutations from authenticated users" ON user_roles IS 
  'Explicitly blocks ALL mutations (INSERT, UPDATE, DELETE) from any user subject to RLS. Only service role can bypass RLS to perform mutations.';

-- =====================================================
-- Security Notes
-- =====================================================
-- 1. ALL mutations are explicitly BLOCKED by the "false" policy
--    This ensures NO authenticated user can modify roles directly
-- 2. Only the service role (which bypasses RLS) can perform mutations
-- 3. Regular users can only view their own roles
-- 4. Admins can view all roles for management purposes
-- 5. The admin check uses EXISTS to avoid infinite recursion
-- 6. Indexes are added for performance optimization
-- =====================================================