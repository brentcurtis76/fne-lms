-- Database Performance Optimization for Reports
-- Add indexes to foreign key columns to speed up joins and filtering

-- Index for user_id on course_enrollments
-- Speeds up fetching all enrollments for a set of users
CREATE INDEX IF NOT EXISTS idx_course_enrollments_user_id ON public.course_enrollments(user_id);

-- Index for user_id on user_lesson_progress
-- Speeds up calculating total time spent for a set of users
CREATE INDEX IF NOT EXISTS idx_user_lesson_progress_user_id ON public.user_lesson_progress(user_id);

-- Indexes for filtering on the profiles table
-- These support the role-based and user-selected filters
CREATE INDEX IF NOT EXISTS idx_profiles_school_id ON public.profiles(school_id);
CREATE INDEX IF NOT EXISTS idx_profiles_generation_id ON public.profiles(generation_id);
CREATE INDEX IF NOT EXISTS idx_profiles_community_id ON public.profiles(community_id);

-- Index on course_enrollments updated_at for sorting by last activity
-- Speeds up the default sort order of the report
CREATE INDEX IF NOT EXISTS idx_course_enrollments_updated_at ON public.course_enrollments(updated_at);

-- Additional indexes for user_roles table used by getUserRoles function
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_active ON public.user_roles(user_id, is_active) WHERE is_active = true;

-- Index for consultant_assignments used by consultor role filtering
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_consultant ON public.consultant_assignments(consultant_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_consultant_assignments_student ON public.consultant_assignments(student_id) WHERE is_active = true;

-- Index for network supervisor role filtering
CREATE INDEX IF NOT EXISTS idx_red_escuelas_supervisor ON public.red_escuelas(supervisor_id);