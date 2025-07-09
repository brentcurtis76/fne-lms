-- Create meeting_attachments table to store document references for meetings
-- This table works with both simple_meetings and community_meetings tables
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

-- Create indexes for better performance
CREATE INDEX idx_meeting_attachments_meeting_id ON meeting_attachments(meeting_id);
CREATE INDEX idx_meeting_attachments_uploaded_by ON meeting_attachments(uploaded_by);

-- Enable RLS
ALTER TABLE meeting_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view attachments for meetings they have access to
-- This works with both simple_meetings and community_meetings tables
CREATE POLICY "Users can view meeting attachments" ON meeting_attachments
    FOR SELECT
    USING (
        -- Check if user has access to the meeting via simple_meetings
        EXISTS (
            SELECT 1 FROM simple_meetings sm
            WHERE sm.id = meeting_attachments.meeting_id
        )
        OR
        -- Check if user has access to the meeting via community_meetings
        EXISTS (
            SELECT 1 FROM community_meetings cm
            WHERE cm.id = meeting_attachments.meeting_id
        )
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