-- =====================================================
-- FNE LMS Sandbox: Schools Table UUID Migration
-- FINAL VERSION - HANDLES ALL VIEWS AND DEPENDENCIES
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 1: DROP ALL VIEWS THAT DEPEND ON SCHOOLS
-- =====================================================

-- Drop the specific view mentioned in the error
DROP VIEW IF EXISTS public.community_progress_report CASCADE;

-- Drop any other views that might reference schools
-- (Add more as discovered from the query above)
DROP VIEW IF EXISTS public.school_summary CASCADE;
DROP VIEW IF EXISTS public.school_statistics CASCADE;
DROP VIEW IF EXISTS public.school_health_metrics CASCADE;
DROP VIEW IF EXISTS public.community_summary CASCADE;
DROP VIEW IF EXISTS public.community_statistics CASCADE;
DROP VIEW IF EXISTS public.school_performance CASCADE;
DROP VIEW IF EXISTS public.school_activity CASCADE;

-- Drop any materialized views
DROP MATERIALIZED VIEW IF EXISTS public.school_metrics CASCADE;
DROP MATERIALIZED VIEW IF EXISTS public.community_metrics CASCADE;

-- =====================================================
-- PHASE 2: DROP ALL FOREIGN KEY CONSTRAINTS
-- =====================================================

-- Drop ALL foreign key constraints that reference schools.id
ALTER TABLE IF EXISTS public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;
ALTER TABLE IF EXISTS public.profiles DROP CONSTRAINT IF EXISTS profiles_school_id_fkey;
ALTER TABLE IF EXISTS public.communities DROP CONSTRAINT IF EXISTS communities_school_id_fkey;
ALTER TABLE IF EXISTS public.announcements DROP CONSTRAINT IF EXISTS announcements_school_id_fkey;
ALTER TABLE IF EXISTS public.community_members DROP CONSTRAINT IF EXISTS community_members_school_id_fkey;
ALTER TABLE IF EXISTS public.assignment_instances DROP CONSTRAINT IF EXISTS assignment_instances_school_id_fkey;
ALTER TABLE IF EXISTS public.clientes DROP CONSTRAINT IF EXISTS clientes_school_id_fkey;
ALTER TABLE IF EXISTS public.consultant_assignments DROP CONSTRAINT IF EXISTS consultant_assignments_school_id_fkey;
ALTER TABLE IF EXISTS public.dev_role_sessions DROP CONSTRAINT IF EXISTS dev_role_sessions_school_id_fkey;
ALTER TABLE IF EXISTS public.growth_communities DROP CONSTRAINT IF EXISTS growth_communities_school_id_fkey;
ALTER TABLE IF EXISTS public.learning_paths DROP CONSTRAINT IF EXISTS learning_paths_school_id_fkey;
ALTER TABLE IF EXISTS public.user_roles DROP CONSTRAINT IF EXISTS user_roles_school_id_fkey;
ALTER TABLE IF EXISTS public.red_escuelas DROP CONSTRAINT IF EXISTS red_escuelas_school_id_fkey;
ALTER TABLE IF EXISTS public.supervisor_auditorias DROP CONSTRAINT IF EXISTS supervisor_auditorias_school_id_fkey;

-- =====================================================
-- PHASE 3: CONVERT SCHOOLS TABLE
-- =====================================================

-- Drop primary key WITH CASCADE
ALTER TABLE public.schools DROP CONSTRAINT schools_pkey CASCADE;

-- Drop sequence
DROP SEQUENCE IF EXISTS public.schools_id_seq CASCADE;

-- Convert id to UUID
ALTER TABLE public.schools ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE public.schools ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.schools ALTER COLUMN id SET NOT NULL;

-- Re-add primary key
ALTER TABLE public.schools ADD PRIMARY KEY (id);

-- =====================================================
-- PHASE 4: CONVERT ALL FOREIGN KEY COLUMNS TO UUID
-- =====================================================

-- Convert all school_id columns to UUID (set to NULL first to avoid conversion errors)
ALTER TABLE public.generations ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.assignment_instances ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.clientes ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.consultant_assignments ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.dev_role_sessions ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.growth_communities ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.learning_paths ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.user_roles ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.red_escuelas ALTER COLUMN school_id TYPE uuid USING NULL;
ALTER TABLE public.supervisor_auditorias ALTER COLUMN school_id TYPE uuid USING NULL;

-- Convert columns that might exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'school_id') THEN
        ALTER TABLE public.profiles ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'communities' AND column_name = 'school_id') THEN
        ALTER TABLE public.communities ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'school_id') THEN
        ALTER TABLE public.announcements ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_members' AND column_name = 'school_id') THEN
        ALTER TABLE public.community_members ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
END $$;

-- =====================================================
-- PHASE 5: RECREATE ALL FOREIGN KEY CONSTRAINTS
-- =====================================================

-- Re-add all foreign key constraints
ALTER TABLE public.generations ADD CONSTRAINT generations_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.assignment_instances ADD CONSTRAINT assignment_instances_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.clientes ADD CONSTRAINT clientes_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.consultant_assignments ADD CONSTRAINT consultant_assignments_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.dev_role_sessions ADD CONSTRAINT dev_role_sessions_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.growth_communities ADD CONSTRAINT growth_communities_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.learning_paths ADD CONSTRAINT learning_paths_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.red_escuelas ADD CONSTRAINT red_escuelas_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
ALTER TABLE public.supervisor_auditorias ADD CONSTRAINT supervisor_auditorias_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);

-- Add optional foreign keys if tables exist
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'school_id') THEN
        ALTER TABLE public.profiles ADD CONSTRAINT profiles_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'communities' AND column_name = 'school_id') THEN
        ALTER TABLE public.communities ADD CONSTRAINT communities_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'school_id') THEN
        ALTER TABLE public.announcements ADD CONSTRAINT announcements_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_members' AND column_name = 'school_id') THEN
        ALTER TABLE public.community_members ADD CONSTRAINT community_members_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
END $$;

-- =====================================================
-- PHASE 6: VERIFICATION
-- =====================================================

SELECT 
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns 
WHERE table_name = 'schools' 
    AND table_schema = 'public'
    AND column_name = 'id';

COMMIT;

-- =====================================================
-- POST-MIGRATION NOTES
-- =====================================================
-- IMPORTANT: After running this migration, you may need to:
-- 1. Recreate any views that were dropped
-- 2. The community_progress_report view will need to be recreated
-- 3. Any application code that creates these views should be re-run
-- =====================================================