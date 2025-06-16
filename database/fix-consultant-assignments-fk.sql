-- Fix consultant_assignments foreign key relationships
-- This ensures all foreign keys are properly defined

-- First, check if the foreign key constraints exist
DO $$
BEGIN
    -- Drop existing foreign key constraints if they exist
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'consultant_assignments_school_id_fkey' 
        AND table_name = 'consultant_assignments'
    ) THEN
        ALTER TABLE consultant_assignments DROP CONSTRAINT consultant_assignments_school_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'consultant_assignments_generation_id_fkey' 
        AND table_name = 'consultant_assignments'
    ) THEN
        ALTER TABLE consultant_assignments DROP CONSTRAINT consultant_assignments_generation_id_fkey;
    END IF;

    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE constraint_name = 'consultant_assignments_community_id_fkey' 
        AND table_name = 'consultant_assignments'
    ) THEN
        ALTER TABLE consultant_assignments DROP CONSTRAINT consultant_assignments_community_id_fkey;
    END IF;
END $$;

-- Re-add the foreign key constraints with proper naming
ALTER TABLE consultant_assignments
ADD CONSTRAINT consultant_assignments_school_id_fkey 
    FOREIGN KEY (school_id) REFERENCES schools(id) ON DELETE SET NULL;

ALTER TABLE consultant_assignments
ADD CONSTRAINT consultant_assignments_generation_id_fkey 
    FOREIGN KEY (generation_id) REFERENCES generations(id) ON DELETE SET NULL;

ALTER TABLE consultant_assignments
ADD CONSTRAINT consultant_assignments_community_id_fkey 
    FOREIGN KEY (community_id) REFERENCES growth_communities(id) ON DELETE SET NULL;

-- Verify the foreign keys are in place
SELECT 
    tc.constraint_name,
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS referenced_table,
    ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_name = 'consultant_assignments' 
    AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY tc.constraint_name;

-- Refresh Supabase schema cache (this might need to be done from Supabase dashboard)
-- NOTIFY pgrst, 'reload schema';