-- =====================================================
-- FNE LMS Sandbox: Schools Table UUID Migration
-- SIMPLIFIED VERSION - NO FUNCTION SCANNING
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 1: DROP DEPENDENCIES
-- =====================================================

-- Drop any views that might reference schools
DROP VIEW IF EXISTS public.school_summary CASCADE;
DROP VIEW IF EXISTS public.school_statistics CASCADE;
DROP VIEW IF EXISTS public.school_health_metrics CASCADE;

-- Drop foreign key constraints
ALTER TABLE IF EXISTS public.generations DROP CONSTRAINT IF EXISTS generations_school_id_fkey;
ALTER TABLE IF EXISTS public.profiles DROP CONSTRAINT IF EXISTS profiles_school_id_fkey;
ALTER TABLE IF EXISTS public.communities DROP CONSTRAINT IF EXISTS communities_school_id_fkey;
ALTER TABLE IF EXISTS public.announcements DROP CONSTRAINT IF EXISTS announcements_school_id_fkey;
ALTER TABLE IF EXISTS public.community_members DROP CONSTRAINT IF EXISTS community_members_school_id_fkey;

-- =====================================================
-- PHASE 2: CONVERT SCHOOLS TABLE
-- =====================================================

-- Drop primary key
ALTER TABLE public.schools DROP CONSTRAINT IF EXISTS schools_pkey;

-- Drop sequence
DROP SEQUENCE IF EXISTS public.schools_id_seq CASCADE;

-- Convert id to UUID
ALTER TABLE public.schools ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE public.schools ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.schools ALTER COLUMN id SET NOT NULL;

-- Re-add primary key
ALTER TABLE public.schools ADD PRIMARY KEY (id);

-- =====================================================
-- PHASE 3: CONVERT FOREIGN KEY COLUMNS
-- =====================================================

-- Convert generations.school_id to UUID
ALTER TABLE public.generations ALTER COLUMN school_id TYPE uuid USING NULL;

-- Convert other tables if they exist
DO $$
BEGIN
    -- profiles.school_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'school_id') THEN
        ALTER TABLE public.profiles ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    -- communities.school_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'communities' AND column_name = 'school_id') THEN
        ALTER TABLE public.communities ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    -- announcements.school_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'school_id') THEN
        ALTER TABLE public.announcements ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
    
    -- community_members.school_id
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_members' AND column_name = 'school_id') THEN
        ALTER TABLE public.community_members ALTER COLUMN school_id TYPE uuid USING NULL;
    END IF;
END $$;

-- =====================================================
-- PHASE 4: RECREATE FOREIGN KEYS
-- =====================================================

-- Re-add foreign key constraints
ALTER TABLE public.generations 
    ADD CONSTRAINT generations_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES public.schools(id);

-- Add other foreign keys if tables exist
DO $$
BEGIN
    -- profiles
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'school_id') THEN
        ALTER TABLE public.profiles 
            ADD CONSTRAINT profiles_school_id_fkey 
            FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    -- communities
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'communities' AND column_name = 'school_id') THEN
        ALTER TABLE public.communities 
            ADD CONSTRAINT communities_school_id_fkey 
            FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    -- announcements
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'announcements' AND column_name = 'school_id') THEN
        ALTER TABLE public.announcements 
            ADD CONSTRAINT announcements_school_id_fkey 
            FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
    
    -- community_members
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'community_members' AND column_name = 'school_id') THEN
        ALTER TABLE public.community_members 
            ADD CONSTRAINT community_members_school_id_fkey 
            FOREIGN KEY (school_id) REFERENCES public.schools(id);
    END IF;
END $$;

-- =====================================================
-- PHASE 5: VERIFICATION
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
-- MIGRATION COMPLETE
-- =====================================================
-- Expected result:
-- column_name | data_type | column_default    | is_nullable
-- id          | uuid      | gen_random_uuid() | NO
-- =====================================================