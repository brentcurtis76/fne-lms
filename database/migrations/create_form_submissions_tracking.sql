-- Create table to track form submissions for Formspree limit monitoring
CREATE TABLE IF NOT EXISTS form_submissions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    submission_date TIMESTAMP WITH TIME ZONE NOT NULL,
    form_type VARCHAR(50) DEFAULT 'contact',
    recipient_email VARCHAR(255) NOT NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient monthly queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_date 
ON form_submissions(submission_date DESC);

-- Create index for form type queries
CREATE INDEX IF NOT EXISTS idx_form_submissions_type 
ON form_submissions(form_type);

-- Enable RLS
ALTER TABLE form_submissions ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role to insert
CREATE POLICY "Service role can insert form submissions" ON form_submissions
    FOR INSERT
    TO service_role
    USING (true);

-- Create policy to allow service role to read
CREATE POLICY "Service role can read form submissions" ON form_submissions
    FOR SELECT
    TO service_role
    USING (true);

-- Create policy to allow authenticated users (admins) to read
CREATE POLICY "Admins can view form submissions" ON form_submissions
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM user_roles
            WHERE user_roles.user_id = auth.uid()
            AND user_roles.role_type = 'admin'
            AND user_roles.is_active = true
        )
    );

-- Add comment to table
COMMENT ON TABLE form_submissions IS 'Tracks all form submissions to monitor Formspree usage limits (50/month free tier)';