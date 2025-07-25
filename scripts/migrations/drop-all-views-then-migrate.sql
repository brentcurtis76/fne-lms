-- =====================================================
-- FNE LMS: DROP ALL VIEWS THEN MIGRATE
-- =====================================================

BEGIN;

-- =====================================================
-- PHASE 1: FIND AND DROP *ALL* VIEWS IN THE DATABASE
-- =====================================================

DO $$
DECLARE
    view_record RECORD;
BEGIN
    -- Drop EVERY SINGLE VIEW in the public schema
    FOR view_record IN 
        SELECT schemaname, viewname 
        FROM pg_views 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP VIEW IF EXISTS %I.%I CASCADE', view_record.schemaname, view_record.viewname);
        RAISE NOTICE 'Dropped view: %', view_record.viewname;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 2: DROP ALL MATERIALIZED VIEWS
-- =====================================================

DO $$
DECLARE
    mv_record RECORD;
BEGIN
    FOR mv_record IN 
        SELECT schemaname, matviewname 
        FROM pg_matviews 
        WHERE schemaname = 'public'
    LOOP
        EXECUTE format('DROP MATERIALIZED VIEW IF EXISTS %I.%I CASCADE', mv_record.schemaname, mv_record.matviewname);
        RAISE NOTICE 'Dropped materialized view: %', mv_record.matviewname;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 3: NOW DO THE MIGRATION
-- =====================================================

-- Drop primary key WITH CASCADE (this will drop all FK constraints)
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
-- PHASE 4: CONVERT ALL FOREIGN KEY COLUMNS
-- =====================================================

-- Find and convert ALL columns named school_id to UUID
DO $$
DECLARE
    col_record RECORD;
BEGIN
    FOR col_record IN 
        SELECT table_name, column_name
        FROM information_schema.columns
        WHERE column_name = 'school_id'
        AND table_schema = 'public'
        AND data_type IN ('integer', 'bigint')
    LOOP
        EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE uuid USING NULL', 
                      col_record.table_name, col_record.column_name);
        RAISE NOTICE 'Converted %.% to UUID', col_record.table_name, col_record.column_name;
    END LOOP;
END $$;

-- =====================================================
-- PHASE 5: RECREATE FOREIGN KEYS
-- =====================================================

-- Recreate foreign keys for all tables with school_id
DO $$
DECLARE
    table_record RECORD;
BEGIN
    FOR table_record IN 
        SELECT DISTINCT table_name
        FROM information_schema.columns
        WHERE column_name = 'school_id'
        AND table_schema = 'public'
    LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I_school_id_fkey FOREIGN KEY (school_id) REFERENCES public.schools(id)', 
                          table_record.table_name, table_record.table_name);
            RAISE NOTICE 'Added FK constraint for %', table_record.table_name;
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Could not add FK for %: %', table_record.table_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =====================================================
-- VERIFICATION
-- =====================================================

SELECT 
    'Schools table converted to UUID' as status,
    column_name,
    data_type,
    column_default
FROM information_schema.columns 
WHERE table_name = 'schools' 
    AND table_schema = 'public'
    AND column_name = 'id';

COMMIT;

-- =====================================================
-- IMPORTANT: ALL VIEWS HAVE BEEN DROPPED!
-- You will need to recreate any views after this migration
-- =====================================================