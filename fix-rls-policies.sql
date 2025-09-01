-- Fix RLS policies for pasantias_quotes table
-- This allows users with community_manager role to manage their own quotes

-- First, check existing policies
SELECT policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'pasantias_quotes';

-- Drop existing policies if they exist (be careful in production!)
DROP POLICY IF EXISTS "Users can view all quotes" ON pasantias_quotes;
DROP POLICY IF EXISTS "Users can create quotes" ON pasantias_quotes;
DROP POLICY IF EXISTS "Users can update their own quotes" ON pasantias_quotes;
DROP POLICY IF EXISTS "Users can delete their own quotes" ON pasantias_quotes;

-- Enable RLS on the table
ALTER TABLE pasantias_quotes ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anyone authenticated can view quotes (for sharing)
CREATE POLICY "Anyone can view quotes"
ON pasantias_quotes FOR SELECT
TO authenticated
USING (true);

-- Policy 2: Users with specific roles can create quotes
CREATE POLICY "Authorized roles can create quotes"
ON pasantias_quotes FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type IN ('admin', 'consultor', 'community_manager')
  )
);

-- Policy 3: Users can update their own quotes, admins can update any
CREATE POLICY "Users can update own quotes or admins update any"
ON pasantias_quotes FOR UPDATE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type = 'admin'
  )
)
WITH CHECK (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type = 'admin'
  )
);

-- Policy 4: Users can delete their own quotes, admins can delete any
CREATE POLICY "Users can delete own quotes or admins delete any"
ON pasantias_quotes FOR DELETE
TO authenticated
USING (
  created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_id = auth.uid()
    AND is_active = true
    AND role_type = 'admin'
  )
);

-- Also fix the pasantias_quote_groups table if it exists
ALTER TABLE pasantias_quote_groups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage quote groups" ON pasantias_quote_groups;

CREATE POLICY "Users can manage quote groups"
ON pasantias_quote_groups FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM pasantias_quotes
    WHERE pasantias_quotes.id = pasantias_quote_groups.quote_id
    AND (
      pasantias_quotes.created_by = auth.uid()
      OR EXISTS (
        SELECT 1 FROM user_roles
        WHERE user_id = auth.uid()
        AND is_active = true
        AND role_type = 'admin'
      )
    )
  )
);

-- Check the policies were created
SELECT tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE tablename IN ('pasantias_quotes', 'pasantias_quote_groups')
ORDER BY tablename, policyname;