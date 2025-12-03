-- Migration: Add RLS policies for message_attachments table
-- This allows authenticated users to insert/view their own message attachments

-- Enable RLS if not already enabled
ALTER TABLE message_attachments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "message_attachments_select" ON message_attachments;
DROP POLICY IF EXISTS "message_attachments_insert" ON message_attachments;
DROP POLICY IF EXISTS "message_attachments_delete" ON message_attachments;
DROP POLICY IF EXISTS "Users can view message attachments" ON message_attachments;
DROP POLICY IF EXISTS "Users can insert message attachments" ON message_attachments;
DROP POLICY IF EXISTS "Users can delete own attachments" ON message_attachments;

-- Policy: Authenticated users can view all message attachments
CREATE POLICY "Users can view message attachments"
ON message_attachments
FOR SELECT
TO authenticated
USING (true);

-- Policy: Authenticated users can insert their own attachments
CREATE POLICY "Users can insert message attachments"
ON message_attachments
FOR INSERT
TO authenticated
WITH CHECK (uploaded_by = auth.uid());

-- Policy: Users can delete their own attachments
CREATE POLICY "Users can delete own attachments"
ON message_attachments
FOR DELETE
TO authenticated
USING (uploaded_by = auth.uid());
