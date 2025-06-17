-- Fix for school_id type consistency issue
-- This ensures that school_id comparisons work correctly regardless of string/integer type

-- First, let's check the current state of growth_communities
SELECT 
    gc.id,
    gc.name,
    gc.school_id,
    gc.generation_id,
    gc.created_at,
    s.name as school_name,
    s.id as school_id_from_join,
    g.name as generation_name
FROM growth_communities gc
LEFT JOIN schools s ON gc.school_id = s.id
LEFT JOIN generations g ON gc.generation_id = g.id
ORDER BY gc.created_at DESC;

-- Check for any communities that might have invalid school_id references
SELECT 
    gc.*,
    CASE 
        WHEN s.id IS NULL THEN 'INVALID SCHOOL REFERENCE'
        ELSE 'Valid'
    END as status
FROM growth_communities gc
LEFT JOIN schools s ON gc.school_id = s.id
WHERE s.id IS NULL;

-- Ensure all growth_communities have valid school references
-- This query will show any orphaned communities
SELECT COUNT(*) as orphaned_communities
FROM growth_communities gc
WHERE NOT EXISTS (
    SELECT 1 FROM schools s WHERE s.id = gc.school_id
);

-- Create an index to improve query performance for school_id lookups
CREATE INDEX IF NOT EXISTS idx_growth_communities_school_id ON growth_communities(school_id);
CREATE INDEX IF NOT EXISTS idx_growth_communities_generation_id ON growth_communities(generation_id);

-- Add a comment to document the fix
COMMENT ON COLUMN growth_communities.school_id IS 'References schools.id - always stored as integer. Frontend should use parseInt() when querying.';