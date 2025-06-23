-- Create Feedback Screenshots Storage Bucket
-- Run this in your Supabase SQL Editor FIRST if the bucket doesn't exist

-- Create the feedback-screenshots bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
SELECT 'feedback-screenshots', 'feedback-screenshots', true
WHERE NOT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'feedback-screenshots'
);

-- Verify the bucket was created
SELECT 
    id,
    name,
    public,
    created_at
FROM storage.buckets 
WHERE name = 'feedback-screenshots';