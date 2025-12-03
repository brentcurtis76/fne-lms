-- Migration 044: Transform Vías de Transformación to School-Based Model
-- This migration adds school-based ownership and collaborator support to transformation assessments
--
-- CRITICAL: Preserves all 14 existing assessments by:
-- 1. Adding new columns as nullable
-- 2. Backfilling school_id from creator's user_roles
-- 3. Adding creators to collaborators table
-- 4. Maintaining growth_community_id for backwards compatibility

-- =============================================================================
-- Part 1: Add new columns to transformation_assessments
-- =============================================================================

-- Add school_id column for school-based ownership
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transformation_assessments'
        AND column_name = 'school_id'
    ) THEN
        ALTER TABLE transformation_assessments
        ADD COLUMN school_id INTEGER REFERENCES schools(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added school_id column to transformation_assessments';
    ELSE
        RAISE NOTICE 'school_id column already exists in transformation_assessments';
    END IF;
END $$;

-- Add grades column for grade selection (JSONB array)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'transformation_assessments'
        AND column_name = 'grades'
    ) THEN
        ALTER TABLE transformation_assessments
        ADD COLUMN grades JSONB DEFAULT '[]'::jsonb;
        RAISE NOTICE 'Added grades column to transformation_assessments';
    ELSE
        RAISE NOTICE 'grades column already exists in transformation_assessments';
    END IF;
END $$;

-- Create index for school_id lookups
CREATE INDEX IF NOT EXISTS idx_transformation_assessments_school
ON transformation_assessments(school_id);

-- =============================================================================
-- Part 2: Create collaborators junction table
-- =============================================================================

-- Drop existing table if it exists (for clean re-runs during development)
DROP TABLE IF EXISTS transformation_assessment_collaborators CASCADE;

CREATE TABLE transformation_assessment_collaborators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assessment_id UUID NOT NULL REFERENCES transformation_assessments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'collaborator' CHECK (role IN ('creator', 'collaborator')),
    can_edit BOOLEAN NOT NULL DEFAULT true,
    added_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    added_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Each user can only be in an assessment once
    UNIQUE(assessment_id, user_id)
);

-- Create indexes for efficient lookups
CREATE INDEX idx_transformation_collaborators_assessment
ON transformation_assessment_collaborators(assessment_id);

CREATE INDEX idx_transformation_collaborators_user
ON transformation_assessment_collaborators(user_id);

CREATE INDEX idx_transformation_collaborators_role
ON transformation_assessment_collaborators(role);

-- Add comments
COMMENT ON TABLE transformation_assessment_collaborators IS
'Junction table linking users to transformation assessments they collaborate on';
COMMENT ON COLUMN transformation_assessment_collaborators.role IS
'Role in the assessment: creator (original author) or collaborator (added later)';
COMMENT ON COLUMN transformation_assessment_collaborators.can_edit IS
'Whether this user can edit the assessment (all collaborators can edit by default)';

-- =============================================================================
-- Part 3: Backfill school_id for existing assessments
-- =============================================================================

-- Derive school_id from the created_by user's user_roles
-- Priority: docente > equipo_directivo > lider_generacion > any role with school_id
WITH creator_schools AS (
    SELECT DISTINCT ON (ta.id)
        ta.id as assessment_id,
        ur.school_id
    FROM transformation_assessments ta
    JOIN user_roles ur ON ur.user_id = ta.created_by
    WHERE ta.school_id IS NULL
      AND ur.is_active = true
      AND ur.school_id IS NOT NULL
    ORDER BY ta.id,
        CASE ur.role_type
            WHEN 'docente' THEN 1
            WHEN 'equipo_directivo' THEN 2
            WHEN 'lider_generacion' THEN 3
            ELSE 4
        END,
        ur.created_at DESC
)
UPDATE transformation_assessments ta
SET school_id = cs.school_id
FROM creator_schools cs
WHERE ta.id = cs.assessment_id;

-- Log how many were updated
DO $$
DECLARE
    updated_count INT;
BEGIN
    SELECT COUNT(*) INTO updated_count
    FROM transformation_assessments
    WHERE school_id IS NOT NULL;
    RAISE NOTICE 'Backfilled school_id for % assessments', updated_count;
END $$;

-- =============================================================================
-- Part 4: Add existing creators to collaborators table
-- =============================================================================

INSERT INTO transformation_assessment_collaborators (assessment_id, user_id, role, can_edit, added_by)
SELECT
    id as assessment_id,
    created_by as user_id,
    'creator' as role,
    true as can_edit,
    created_by as added_by
FROM transformation_assessments
WHERE created_by IS NOT NULL
ON CONFLICT (assessment_id, user_id) DO NOTHING;

-- Log how many were added
DO $$
DECLARE
    collab_count INT;
BEGIN
    SELECT COUNT(*) INTO collab_count
    FROM transformation_assessment_collaborators;
    RAISE NOTICE 'Added % creators to collaborators table', collab_count;
END $$;

-- =============================================================================
-- Part 5: Helper functions for school-based access
-- =============================================================================

-- NOTE: is_admin_or_consultor already exists and is used by other RLS policies
-- We only create new functions that don't exist yet

-- Function to get all school IDs for a user
CREATE OR REPLACE FUNCTION user_school_ids(uid UUID)
RETURNS INTEGER[] AS $$
    SELECT COALESCE(
        ARRAY_AGG(DISTINCT school_id),
        '{}'::INTEGER[]
    )
    FROM user_roles
    WHERE user_id = uid
      AND is_active = true
      AND school_id IS NOT NULL;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Function to check if user is collaborator on an assessment
CREATE OR REPLACE FUNCTION is_assessment_collaborator(assessment_uuid UUID, uid UUID)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM transformation_assessment_collaborators
        WHERE assessment_id = assessment_uuid
          AND user_id = uid
          AND can_edit = true
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- =============================================================================
-- Part 6: RLS Policies for transformation_assessments
-- =============================================================================

-- Enable RLS if not already enabled
ALTER TABLE transformation_assessments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to recreate with new logic
DROP POLICY IF EXISTS "transformation_assessments_select" ON transformation_assessments;
DROP POLICY IF EXISTS "transformation_assessments_insert" ON transformation_assessments;
DROP POLICY IF EXISTS "transformation_assessments_update" ON transformation_assessments;
DROP POLICY IF EXISTS "transformation_assessments_delete" ON transformation_assessments;
DROP POLICY IF EXISTS "school_members_read_transformation_assessments" ON transformation_assessments;
DROP POLICY IF EXISTS "collaborators_update_transformation_assessments" ON transformation_assessments;
DROP POLICY IF EXISTS "school_members_insert_transformation_assessments" ON transformation_assessments;

-- SELECT: School members can view their school's assessments
-- Also supports legacy community-based access for existing assessments
CREATE POLICY "transformation_assessments_select" ON transformation_assessments
    FOR SELECT
    TO authenticated
    USING (
        -- Admin/consultor can see all
        is_admin_or_consultor(auth.uid())
        OR
        -- School members can see their school's assessments
        school_id = ANY(user_school_ids(auth.uid()))
        OR
        -- Legacy: community members for old assessments without school_id
        (school_id IS NULL AND growth_community_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.is_active = true
              AND ur.community_id = growth_community_id
        ))
        OR
        -- Collaborators can always see their assessments
        is_assessment_collaborator(id, auth.uid())
        OR
        -- Creator can always see
        created_by = auth.uid()
    );

-- INSERT: Users can create assessments for their school
CREATE POLICY "transformation_assessments_insert" ON transformation_assessments
    FOR INSERT
    TO authenticated
    WITH CHECK (
        -- Must specify a school_id that the user belongs to
        (school_id IS NOT NULL AND school_id = ANY(user_school_ids(auth.uid())))
        OR
        -- Admin can create for any school
        is_admin_or_consultor(auth.uid())
    );

-- UPDATE: Only collaborators and admins can edit
CREATE POLICY "transformation_assessments_update" ON transformation_assessments
    FOR UPDATE
    TO authenticated
    USING (
        -- Admin/consultor can edit all
        is_admin_or_consultor(auth.uid())
        OR
        -- Collaborators can edit
        is_assessment_collaborator(id, auth.uid())
        OR
        -- Creator can always edit (fallback for legacy)
        created_by = auth.uid()
    )
    WITH CHECK (
        -- Can only update school_id to a school user belongs to
        (school_id IS NULL OR school_id = ANY(user_school_ids(auth.uid())))
        OR
        is_admin_or_consultor(auth.uid())
    );

-- DELETE: Only admins can delete
CREATE POLICY "transformation_assessments_delete" ON transformation_assessments
    FOR DELETE
    TO authenticated
    USING (
        is_admin_or_consultor(auth.uid())
    );

-- =============================================================================
-- Part 7: RLS Policies for transformation_assessment_collaborators
-- =============================================================================

ALTER TABLE transformation_assessment_collaborators ENABLE ROW LEVEL SECURITY;

-- SELECT: Anyone who can see the assessment can see its collaborators
CREATE POLICY "collaborators_select" ON transformation_assessment_collaborators
    FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM transformation_assessments ta
            WHERE ta.id = assessment_id
              AND (
                  is_admin_or_consultor(auth.uid())
                  OR ta.school_id = ANY(user_school_ids(auth.uid()))
                  OR ta.created_by = auth.uid()
                  OR is_assessment_collaborator(ta.id, auth.uid())
              )
        )
    );

-- INSERT: Collaborators and creators can add new collaborators
CREATE POLICY "collaborators_insert" ON transformation_assessment_collaborators
    FOR INSERT
    TO authenticated
    WITH CHECK (
        is_admin_or_consultor(auth.uid())
        OR
        EXISTS (
            SELECT 1 FROM transformation_assessments ta
            WHERE ta.id = assessment_id
              AND (
                  ta.created_by = auth.uid()
                  OR is_assessment_collaborator(ta.id, auth.uid())
              )
        )
    );

-- DELETE: Creator can remove collaborators, users can remove themselves
CREATE POLICY "collaborators_delete" ON transformation_assessment_collaborators
    FOR DELETE
    TO authenticated
    USING (
        is_admin_or_consultor(auth.uid())
        OR
        -- User can remove themselves
        user_id = auth.uid()
        OR
        -- Creator can remove anyone
        EXISTS (
            SELECT 1 FROM transformation_assessments ta
            WHERE ta.id = assessment_id
              AND ta.created_by = auth.uid()
        )
    );

-- Service role bypass for all operations
CREATE POLICY "collaborators_service_role" ON transformation_assessment_collaborators
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- =============================================================================
-- Part 8: Grant permissions
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON transformation_assessment_collaborators TO authenticated;
GRANT ALL ON transformation_assessment_collaborators TO service_role;

-- =============================================================================
-- Verification
-- =============================================================================

DO $$
DECLARE
    assessment_count INT;
    collab_count INT;
    school_filled INT;
BEGIN
    SELECT COUNT(*) INTO assessment_count FROM transformation_assessments;
    SELECT COUNT(*) INTO collab_count FROM transformation_assessment_collaborators;
    SELECT COUNT(*) INTO school_filled FROM transformation_assessments WHERE school_id IS NOT NULL;

    RAISE NOTICE '=== Migration 044 Complete ===';
    RAISE NOTICE 'Total assessments: %', assessment_count;
    RAISE NOTICE 'Assessments with school_id: %', school_filled;
    RAISE NOTICE 'Total collaborator records: %', collab_count;

    IF assessment_count > 0 AND school_filled = 0 THEN
        RAISE WARNING 'No assessments have school_id - backfill may have failed';
    END IF;
END $$;
