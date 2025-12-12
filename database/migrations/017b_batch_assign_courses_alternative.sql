-- ALTERNATIVE VERSION: batch_assign_courses with request.jwt.claims fallback
-- Use this version if auth.uid() is not available in your Supabase setup
-- This should NOT be needed for standard Supabase projects

/*
-- Drop existing function if it exists
DROP FUNCTION IF EXISTS public.batch_assign_courses(UUID, UUID[]);

-- Create batch assignment function with request.jwt.claims fallback
CREATE OR REPLACE FUNCTION public.batch_assign_courses(
    p_course_id UUID,
    p_user_ids UUID[]
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
    v_caller_id UUID;
    v_user_id UUID;
    v_assignment_id UUID;
    v_success_count INT := 0;
    v_skip_count INT := 0;
    v_enroll_count INT := 0;
    v_assignments UUID[] := '{}';
    v_total_lessons INT;
BEGIN
    -- SECURITY: Get authenticated caller ID from JWT
    -- Try auth.uid() first (Supabase standard)
    BEGIN
        v_caller_id := auth.uid();
    EXCEPTION
        WHEN undefined_function THEN
            -- Fallback: Extract from request.jwt.claims
            v_caller_id := current_setting('request.jwt.claim.sub', true)::uuid;
    END;

    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;

    -- Rest of function remains the same...
    -- (Same as 017_batch_assign_courses.sql)

END;
$$;

-- Comment and grant remain the same
*/

-- NOTE: This file is provided for reference only
-- Standard Supabase installations should use 017_batch_assign_courses.sql
-- which uses auth.uid() directly
