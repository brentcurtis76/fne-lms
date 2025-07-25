-- Find the community_progress_report view that's blocking our migration
-- This view depends on schools.id column

-- First, let's see what this view looks like
SELECT definition 
FROM pg_views 
WHERE viewname = 'community_progress_report'
AND schemaname = 'public';

-- Find ALL views that might reference schools
SELECT 
    schemaname,
    viewname
FROM pg_views 
WHERE schemaname = 'public'
AND (
    definition LIKE '%schools%' 
    OR definition LIKE '%school_id%'
    OR viewname LIKE '%school%'
    OR viewname LIKE '%community%'
)
ORDER BY viewname;

-- Generate DROP statements for all potentially problematic views
SELECT 
    'DROP VIEW IF EXISTS public.' || viewname || ' CASCADE;' as drop_statement
FROM pg_views 
WHERE schemaname = 'public'
AND (
    definition LIKE '%schools%' 
    OR definition LIKE '%school_id%'
    OR viewname LIKE '%school%'
    OR viewname LIKE '%community%'
)
ORDER BY viewname;