-- Complete fix for meeting system issues
-- This migration creates all missing tables and fixes permissions

-- 1. Create meeting_attachments table (if not exists)
CREATE TABLE IF NOT EXISTS meeting_attachments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meeting_id UUID NOT NULL,
    filename TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    file_type TEXT NOT NULL,
    uploaded_by UUID NOT NULL REFERENCES auth.users(id),
    uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_attachments_meeting_id ON meeting_attachments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attachments_uploaded_by ON meeting_attachments(uploaded_by);

-- Enable RLS
ALTER TABLE meeting_attachments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view meeting attachments" ON meeting_attachments;
DROP POLICY IF EXISTS "Users can upload meeting attachments" ON meeting_attachments;
DROP POLICY IF EXISTS "Users can delete their own meeting attachments" ON meeting_attachments;

-- RLS Policy: Users can view attachments for meetings they have access to
CREATE POLICY "Users can view meeting attachments" ON meeting_attachments
    FOR SELECT
    USING (
        -- Allow authenticated users to see attachments
        auth.uid() IS NOT NULL
    );

-- RLS Policy: Users can upload attachments to meetings
CREATE POLICY "Users can upload meeting attachments" ON meeting_attachments
    FOR INSERT
    WITH CHECK (
        uploaded_by = auth.uid()
    );

-- RLS Policy: Users can delete their own attachments
CREATE POLICY "Users can delete their own meeting attachments" ON meeting_attachments
    FOR DELETE
    USING (uploaded_by = auth.uid());

-- Grant permissions
GRANT SELECT, INSERT, DELETE ON meeting_attachments TO authenticated;

-- 2. Create meeting_commitments table (if missing)
CREATE TABLE IF NOT EXISTS meeting_commitments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES simple_meetings(id) ON DELETE CASCADE,
    description TEXT NOT NULL,
    responsible_id UUID REFERENCES auth.users(id),
    due_date DATE,
    status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_progreso', 'completado')),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_meeting_id ON meeting_commitments(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_commitments_responsible_id ON meeting_commitments(responsible_id);

-- Enable RLS
ALTER TABLE meeting_commitments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view meeting commitments" ON meeting_commitments;
DROP POLICY IF EXISTS "Users can create meeting commitments" ON meeting_commitments;
DROP POLICY IF EXISTS "Users can update meeting commitments" ON meeting_commitments;
DROP POLICY IF EXISTS "Users can delete meeting commitments" ON meeting_commitments;

-- RLS Policies for meeting_commitments
CREATE POLICY "Users can view meeting commitments" ON meeting_commitments
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can create meeting commitments" ON meeting_commitments
    FOR INSERT
    WITH CHECK (created_by = auth.uid());

CREATE POLICY "Users can update meeting commitments" ON meeting_commitments
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete meeting commitments" ON meeting_commitments
    FOR DELETE
    USING (created_by = auth.uid());

-- Grant permissions
GRANT ALL ON meeting_commitments TO authenticated;

-- 3. Create meeting_attendees table (if missing)
CREATE TABLE IF NOT EXISTS meeting_attendees (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES simple_meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    attended BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_meeting_id ON meeting_attendees(meeting_id);
CREATE INDEX IF NOT EXISTS idx_meeting_attendees_user_id ON meeting_attendees(user_id);

-- Create unique constraint to prevent duplicate attendees
CREATE UNIQUE INDEX IF NOT EXISTS idx_meeting_attendees_unique ON meeting_attendees(meeting_id, user_id);

-- Enable RLS
ALTER TABLE meeting_attendees ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view meeting attendees" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can insert meeting attendees" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can update meeting attendees" ON meeting_attendees;
DROP POLICY IF EXISTS "Users can delete meeting attendees" ON meeting_attendees;

-- RLS Policies for meeting_attendees
CREATE POLICY "Users can view meeting attendees" ON meeting_attendees
    FOR SELECT
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can insert meeting attendees" ON meeting_attendees
    FOR INSERT
    WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Users can update meeting attendees" ON meeting_attendees
    FOR UPDATE
    USING (auth.uid() IS NOT NULL);

CREATE POLICY "Users can delete meeting attendees" ON meeting_attendees
    FOR DELETE
    USING (auth.uid() IS NOT NULL);

-- Grant permissions
GRANT ALL ON meeting_attendees TO authenticated;

-- 4. Create simple_meetings table if it doesn't exist
CREATE TABLE IF NOT EXISTS simple_meetings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    workspace_id UUID NOT NULL REFERENCES community_workspaces(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    meeting_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 60,
    location TEXT,
    summary TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pendiente' CHECK (status IN ('pendiente', 'en_progreso', 'completada', 'cancelada')),
    created_by UUID NOT NULL REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_simple_meetings_workspace_id ON simple_meetings(workspace_id);
CREATE INDEX IF NOT EXISTS idx_simple_meetings_created_by ON simple_meetings(created_by);

-- Enable RLS
ALTER TABLE simple_meetings ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view meetings in their workspace" ON simple_meetings;
DROP POLICY IF EXISTS "Users can create meetings" ON simple_meetings;
DROP POLICY IF EXISTS "Users can update meetings" ON simple_meetings;
DROP POLICY IF EXISTS "Users can delete their meetings" ON simple_meetings;

-- RLS Policies
CREATE POLICY "Users can view meetings in their workspace" ON simple_meetings
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM community_workspace_members cwm
            WHERE cwm.workspace_id = simple_meetings.workspace_id
            AND cwm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can create meetings" ON simple_meetings
    FOR INSERT
    WITH CHECK (
        created_by = auth.uid() AND
        EXISTS (
            SELECT 1 FROM community_workspace_members cwm
            WHERE cwm.workspace_id = simple_meetings.workspace_id
            AND cwm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update meetings" ON simple_meetings
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM community_workspace_members cwm
            WHERE cwm.workspace_id = simple_meetings.workspace_id
            AND cwm.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their meetings" ON simple_meetings
    FOR DELETE
    USING (created_by = auth.uid());

-- Grant permissions
GRANT ALL ON simple_meetings TO authenticated;

-- 5. Create function to update timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_simple_meetings_updated_at ON simple_meetings;
CREATE TRIGGER update_simple_meetings_updated_at 
    BEFORE UPDATE ON simple_meetings 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_meeting_commitments_updated_at ON meeting_commitments;
CREATE TRIGGER update_meeting_commitments_updated_at 
    BEFORE UPDATE ON meeting_commitments 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Meeting system tables and policies created/updated successfully';
END $$;