-- =============================================================================
-- CORRECTED DATABASE PERFORMANCE OPTIMIZATION FOR REPORTS
-- Apply these indexes to resolve report loading timeouts
-- Execute in Supabase SQL Editor: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/editor
-- =============================================================================

-- Index for user_id on course_enrollments (CONFIRMED EXISTS)
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id ON public.course_enrollments(user_id);

-- Index for user_id on lesson_progress (CORRECTED TABLE NAME)
CREATE INDEX IF NOT EXISTS idx_lesson_progress_user_id ON public.lesson_progress(user_id);

-- Indexes for filtering on the profiles table (CONFIRMED EXISTS)
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_generation_id ON public.profiles(generation_id);
CREATE INDEX IF NOT EXISTS idx_profiles_community_id ON public.profiles(community_id);

-- Index on course_enrollments updated_at for sorting by last activity (CONFIRMED EXISTS)
CREATE INDEX IF NOT EXISTS idx_course_enrollments_updated_at ON public.course_enrollments(updated_at);

-- Additional indexes for user_roles table (CONFIRMED EXISTS)
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON public.user_roles(user_id, is_active) WHERE is_active = true;

-- Index for consultant_assignments (CONFIRMED EXISTS)
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_consultant ON public.consultant_assignments(consultant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_student ON public.consultant_assignments(student_id) WHERE is_active = true;

-- =============================================================================
-- NETWORK SUPERVISOR INDEXES (CONDITIONAL - MAY NOT EXIST)
-- =============================================================================
-- Only execute if the network tables exist in your database
-- You can check by running: SELECT table_name FROM information_schema.tables WHERE table_name IN ('redes_de_colegios', 'red_escuelas');

-- Uncomment these lines if network tables exist:
-- CREATE INDEX IF NOT EXISTS idx_red_escuelas_supervisor ON public.red_escuelas(supervisor_id);
-- CREATE INDEX IF NOT EXISTS idx_redes_de_colegios_supervisor ON public.redes_de_colegios(supervisor_id);

-- =============================================================================
-- VERIFICATION QUERIES (Optional - run after applying indexes)
-- =============================================================================

-- Check that indexes were created successfully
SELECT 
    schemaname,
    tablename,
    indexname,
    indexdef
FROM pg_indexes 
WHERE indexname LIKE 'idx_%course_enrollments%' 
   OR indexname LIKE 'idx_%profiles%'
   OR indexname LIKE 'idx_%user_roles%'
   OR indexname LIKE 'idx_%consultant%'
   OR indexname LIKE 'idx_%lesson_progress%'
ORDER BY tablename, indexname;

-- =============================================================================
-- INSTRUCTIONS:
-- 1. Copy this entire SQL script
-- 2. Open Supabase dashboard: https://supabase.com/dashboard/project/sxlogxqzmarhqsblxmtj/editor  
-- 3. Paste and execute the CREATE INDEX commands
-- 4. Verify with the SELECT query at the end
-- 5. Test the detailed reports page - data should now load successfully
-- =============================================================================