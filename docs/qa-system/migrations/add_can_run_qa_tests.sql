-- Migration: Add can_run_qa_tests column to profiles table
-- This controls who can access the QA testing features (in addition to admins)
-- Run this in the Supabase SQL Editor

-- Add the column with default false
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS can_run_qa_tests BOOLEAN DEFAULT FALSE;

-- Add a comment explaining the column
COMMENT ON COLUMN public.profiles.can_run_qa_tests IS 'When true, user can access /qa pages and run test scenarios. Admins always have access.';

-- Optional: Grant QA testing access to specific users by email
-- UPDATE public.profiles SET can_run_qa_tests = TRUE WHERE id IN (
--   SELECT id FROM auth.users WHERE email IN ('tester@fne.cl', 'qa@fne.cl')
-- );

-- Verify the column was added
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'profiles' AND column_name = 'can_run_qa_tests';
