-- Fix RLS policies for blocks table to allow proper deletion
-- Run this script in Supabase SQL Editor

-- First, check if RLS is enabled on blocks table
DO $$
BEGIN
    -- Enable RLS on blocks table if not already enabled
    ALTER TABLE blocks ENABLE ROW LEVEL SECURITY;
EXCEPTION
    WHEN others THEN
        -- RLS already enabled, continue
        NULL;
END $$;

-- Drop existing policies if they exist (to start fresh)
DROP POLICY IF EXISTS "blocks_select_policy" ON blocks;
DROP POLICY IF EXISTS "blocks_insert_policy" ON blocks;
DROP POLICY IF EXISTS "blocks_update_policy" ON blocks;
DROP POLICY IF EXISTS "blocks_delete_policy" ON blocks;

-- Create comprehensive RLS policies for blocks table

-- SELECT: Authenticated users can view all blocks
CREATE POLICY "blocks_select_policy" ON blocks
FOR SELECT
TO authenticated
USING (true);

-- INSERT: Authenticated users can insert blocks
CREATE POLICY "blocks_insert_policy" ON blocks
FOR INSERT
TO authenticated
WITH CHECK (true);

-- UPDATE: Authenticated users can update blocks
CREATE POLICY "blocks_update_policy" ON blocks
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

-- DELETE: Authenticated users can delete blocks
CREATE POLICY "blocks_delete_policy" ON blocks
FOR DELETE
TO authenticated
USING (true);

-- Verify the policies were created
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
WHERE tablename = 'blocks'
ORDER BY policyname;

-- Check if RLS is enabled
SELECT 
    schemaname,
    tablename,
    rowsecurity
FROM pg_tables 
WHERE tablename = 'blocks' 
AND schemaname = 'public';