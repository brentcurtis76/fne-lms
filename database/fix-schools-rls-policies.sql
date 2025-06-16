-- ====================================================================
-- FIX RLS POLICIES FOR SCHOOLS TABLE
-- Ensure admins can update schools properly
-- ====================================================================

-- First, check if RLS is enabled
ALTER TABLE schools ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Admin can do everything with schools" ON schools;
DROP POLICY IF EXISTS "Users can view schools" ON schools;
DROP POLICY IF EXISTS "Admin full access to schools" ON schools;
DROP POLICY IF EXISTS "Public read access to schools" ON schools;

-- Create comprehensive admin policy
CREATE POLICY "Admin full access to schools" ON schools
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- Create read policy for all authenticated users
CREATE POLICY "Authenticated users can view schools" ON schools
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Also ensure generations table has proper policies
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to generations" ON generations;
DROP POLICY IF EXISTS "Users can view generations" ON generations;

-- Admin can manage generations
CREATE POLICY "Admin full access to generations" ON generations
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- All users can view generations
CREATE POLICY "Authenticated users can view generations" ON generations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Also check growth_communities policies
ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin full access to communities" ON growth_communities;
DROP POLICY IF EXISTS "Users can view communities" ON growth_communities;

-- Admin can manage communities
CREATE POLICY "Admin full access to communities" ON growth_communities
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles 
      WHERE profiles.id = auth.uid() 
      AND profiles.role = 'admin'
    )
  );

-- All users can view communities
CREATE POLICY "Authenticated users can view communities" ON growth_communities
  FOR SELECT
  USING (auth.uid() IS NOT NULL);