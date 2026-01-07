-- Migration: Extend instructors table with photo, bio, and specialty fields
-- For Netflix-style course visualization
-- Date: 2026-01-07

-- Add new columns to instructors table
ALTER TABLE public.instructors
ADD COLUMN IF NOT EXISTS photo_url text,
ADD COLUMN IF NOT EXISTS bio text,
ADD COLUMN IF NOT EXISTS specialty text;

-- Add comments for documentation
COMMENT ON COLUMN public.instructors.photo_url IS 'URL to instructor profile photo in instructor-photos bucket';
COMMENT ON COLUMN public.instructors.bio IS 'Short biography or description of the instructor';
COMMENT ON COLUMN public.instructors.specialty IS 'Area of expertise or specialization';

-- Create index for specialty searches (optional, for future filtering)
CREATE INDEX IF NOT EXISTS idx_instructors_specialty ON public.instructors(specialty);
