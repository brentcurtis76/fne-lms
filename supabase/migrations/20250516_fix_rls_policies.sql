-- Fix Row Level Security Policies for lessons table

-- First, enable RLS on the lessons table if not already enabled
ALTER TABLE lessons ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Allow authenticated users to select lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to insert lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to update lessons" ON lessons;
DROP POLICY IF EXISTS "Allow authenticated users to delete lessons" ON lessons;

-- Create more permissive policies for authenticated users
-- Allow all authenticated users to select lessons
CREATE POLICY "Allow authenticated users to select lessons"
ON lessons
FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow all authenticated users to insert lessons
CREATE POLICY "Allow authenticated users to insert lessons"
ON lessons
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to update lessons
CREATE POLICY "Allow authenticated users to update lessons"
ON lessons
FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to delete lessons
CREATE POLICY "Allow authenticated users to delete lessons"
ON lessons
FOR DELETE
USING (auth.role() = 'authenticated');

-- Special policy for admin users to have full access
CREATE POLICY "Allow admin users full access to lessons"
ON lessons
USING (
  auth.role() = 'authenticated' AND 
  EXISTS (
    SELECT 1 FROM profiles 
    WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )
);

-- Refresh the schema cache
SELECT pg_catalog.pg_reload_conf();
