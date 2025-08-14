-- Update RLS policies for events table to include community_manager role
-- This ensures Community Managers can create, read, update, and delete events

-- First, drop existing policies to recreate them
DROP POLICY IF EXISTS "events_select_policy" ON events;
DROP POLICY IF EXISTS "events_insert_policy" ON events;
DROP POLICY IF EXISTS "events_update_policy" ON events;
DROP POLICY IF EXISTS "events_delete_policy" ON events;

-- Create new policies that include community_manager role

-- 1. SELECT policy - Everyone can view published events, admins and community managers can view all
CREATE POLICY "events_select_policy" ON events
FOR SELECT USING (
  is_published = true
  OR EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'community_manager')
    AND ur.is_active = true
  )
);

-- 2. INSERT policy - Only admins and community managers can create events
CREATE POLICY "events_insert_policy" ON events
FOR INSERT WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'community_manager')
    AND ur.is_active = true
  )
);

-- 3. UPDATE policy - Only admins and community managers can update events
CREATE POLICY "events_update_policy" ON events
FOR UPDATE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'community_manager')
    AND ur.is_active = true
  )
);

-- 4. DELETE policy - Only admins and community managers can delete events
CREATE POLICY "events_delete_policy" ON events
FOR DELETE USING (
  EXISTS (
    SELECT 1 FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type IN ('admin', 'community_manager')
    AND ur.is_active = true
  )
);

-- Verify the policies are created
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'events'
ORDER BY policyname;