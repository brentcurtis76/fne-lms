-- Fix foreign key relationships for messaging tables

-- First, let's check if the foreign key constraint exists and recreate it if needed
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'message_threads_created_by_fkey'
    ) THEN
        ALTER TABLE message_threads DROP CONSTRAINT message_threads_created_by_fkey;
    END IF;
    
    -- Create the proper foreign key constraint
    ALTER TABLE message_threads 
    ADD CONSTRAINT message_threads_created_by_fkey 
    FOREIGN KEY (created_by) 
    REFERENCES profiles(id) 
    ON DELETE SET NULL;
    
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Error creating foreign key: %', SQLERRM;
END $$;

-- Also ensure the workspace_id foreign key is correct
DO $$ 
BEGIN
    -- Drop existing constraint if it exists
    IF EXISTS (
        SELECT 1 
        FROM information_schema.table_constraints 
        WHERE constraint_name = 'message_threads_workspace_id_fkey'
    ) THEN
        ALTER TABLE message_threads DROP CONSTRAINT message_threads_workspace_id_fkey;
    END IF;
    
    -- Create the proper foreign key constraint
    ALTER TABLE message_threads 
    ADD CONSTRAINT message_threads_workspace_id_fkey 
    FOREIGN KEY (workspace_id) 
    REFERENCES community_workspaces(id) 
    ON DELETE CASCADE;
    
EXCEPTION
    WHEN others THEN
        RAISE NOTICE 'Error creating workspace foreign key: %', SQLERRM;
END $$;

-- Let's also check the select query issue
-- The error shows it's trying to do a join with profiles table
-- We need to ensure the RLS policies allow this

-- Drop and recreate the select policy to ensure it works
DROP POLICY IF EXISTS "Users can view threads in their workspace" ON message_threads;

CREATE POLICY "Users can view threads in their workspace" ON message_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 
      FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = message_threads.workspace_id
        AND ur.user_id = auth.uid()
    )
  );

-- Also update the insert policy
DROP POLICY IF EXISTS "Users can create threads in their workspace" ON message_threads;

CREATE POLICY "Users can create threads in their workspace" ON message_threads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 
      FROM community_workspaces cw
      JOIN user_roles ur ON ur.community_id = cw.community_id
      WHERE cw.id = workspace_id
        AND ur.user_id = auth.uid()
    )
    AND created_by = auth.uid()
  );