-- Quick fix for thread_category enum
-- Run this in Supabase SQL Editor to fix the "invalid input value for enum thread_category: 'ideas'" error

-- Add the missing enum values
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'ideas';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'tasks';
ALTER TYPE thread_category ADD VALUE IF NOT EXISTS 'questions';

-- Show the updated enum values
SELECT enum_range(NULL::thread_category) as current_categories;

-- Test that it worked
-- This should now succeed without error
SELECT 'ideas'::thread_category as test_ideas,
       'tasks'::thread_category as test_tasks,
       'questions'::thread_category as test_questions;