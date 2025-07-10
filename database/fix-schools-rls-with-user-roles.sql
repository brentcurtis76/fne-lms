-- ====================================================================
-- FIX RLS POLICIES FOR SCHOOLS TABLE - UPDATED FOR USER_ROLES
-- Updates policies to use user_roles.role_type instead of profiles.role
-- ====================================================================

-- First, ensure RLS is enabled
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Drop all existing policies
DROP POLICY IF EXISTS "Admin can do everything with schools" ON schools;
DROP POLICY IF EXISTS "Users can view schools" ON schools;
DROP POLICY IF EXISTS "Admin full access to schools" ON schools;
DROP POLICY IF EXISTS "Public read access to schools" ON schools;
DROP POLICY IF EXISTS "Authenticated users can view schools" ON schools;

-- Create comprehensive admin policy using user_roles
CREATE POLICY "Admin full access to schools" ON schools
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  );

-- Create read policy for all authenticated users
CREATE POLICY "Authenticated users can view schools" ON schools
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Also update generations table policies
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to generations" ON generations;
DROP POLICY IF EXISTS "Users can view generations" ON generations;
DROP POLICY IF EXISTS "Authenticated users can view generations" ON generations;

-- Admin can manage generations using user_roles
CREATE POLICY "Admin full access to generations" ON generations
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  );

-- All users can view generations
CREATE POLICY "Authenticated users can view generations" ON generations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Also update growth_communities policies
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to communities" ON growth_communities;
DROP POLICY IF EXISTS "Users can view communities" ON growth_communities;
DROP POLICY IF EXISTS "Authenticated users can view communities" ON growth_communities;

-- Admin can manage communities using user_roles
CREATE POLICY "Admin full access to communities" ON growth_communities
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE user_roles.user_id = auth.uid() 
      AND user_roles.role_type = 'admin'
    )
  );

-- All users can view communities
CREATE POLICY "Authenticated users can view communities" ON growth_communities
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Verify the policies were created correctly
SELECT 
    schemaname,
    tablename,
    policyname,
    permissive,
    roles,
    cmd,
    qual
FROM pg_policies 
WHERE tablename IN ('schools', 'generations', 'growth_communities')
ORDER BY tablename, policyname;