-- FNE LMS Database Schema (Basic Structure)
-- Generated on: 2025-07-19T01:40:25.723Z
-- Note: This is a basic schema extraction. For complete DDL with all constraints,
-- indexes, and RLS policies, use pg_dump or Supabase dashboard export.

-- Table: profiles
CREATE TABLE IF NOT EXISTS public.profiles (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: user_roles
CREATE TABLE IF NOT EXISTS public.user_roles (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: schools
CREATE TABLE IF NOT EXISTS public.schools (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: generations
CREATE TABLE IF NOT EXISTS public.generations (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: community_workspaces
CREATE TABLE IF NOT EXISTS public.community_workspaces (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: courses
CREATE TABLE IF NOT EXISTS public.courses (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: course_enrollments
CREATE TABLE IF NOT EXISTS public.course_enrollments (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: lessons
CREATE TABLE IF NOT EXISTS public.lessons (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: blocks
CREATE TABLE IF NOT EXISTS public.blocks (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: assignments
CREATE TABLE IF NOT EXISTS public.assignments (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: assignment_submissions
CREATE TABLE IF NOT EXISTS public.assignment_submissions (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: quizzes
CREATE TABLE IF NOT EXISTS public.quizzes (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: quiz_submissions
CREATE TABLE IF NOT EXISTS public.quiz_submissions (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: user_notifications
CREATE TABLE IF NOT EXISTS public.user_notifications (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: notification_types
CREATE TABLE IF NOT EXISTS public.notification_types (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: message_attachments
CREATE TABLE IF NOT EXISTS public.message_attachments (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: cuotas
CREATE TABLE IF NOT EXISTS public.cuotas (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: expense_reports
CREATE TABLE IF NOT EXISTS public.expense_reports (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: expense_items
CREATE TABLE IF NOT EXISTS public.expense_items (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: post_media
CREATE TABLE IF NOT EXISTS public.post_media (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);

-- Table: post_comments
CREATE TABLE IF NOT EXISTS public.post_comments (
    -- Column definitions would go here
    -- Use Supabase dashboard or pg_dump for complete structure
);


-- Common Column Patterns in FNE LMS:
-- Most tables include:
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4()
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())

-- User-related tables typically have:
--   user_id UUID REFERENCES auth.users(id)

-- School-related tables typically have:
--   school_id UUID REFERENCES schools(id)

-- Important Enums:
-- role_type: admin, docente, inspirador, socio_comunitario, consultor,
--            equipo_directivo, lider_generacion, lider_comunidad, supervisor_de_red

-- For complete schema with all constraints, indexes, and RLS policies,
-- please use one of these methods:
-- 1. Supabase Dashboard: Settings > Database > Backups > Download schema
-- 2. pg_dump with connection string from dashboard
-- 3. Supabase CLI: supabase db dump
