-- Deployment Script for Consultant-Managed Groups
-- Run this script to deploy all security and functionality updates

-- IMPORTANT: Review each section before running in production
-- This script is idempotent and can be run multiple times safely

BEGIN;

-- =====================================================
-- 1. ENABLE RLS ON REQUIRED TABLES
-- =====================================================

ALTER TABLE group_assignment_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE group_assignment_groups ENABLE ROW LEVEL SECURITY;

-- =====================================================
-- 2. DROP EXISTING POLICIES (for clean deployment)
-- =====================================================

DROP POLICY IF EXISTS "Consultants can manage assignment settings" ON group_assignment_settings;
DROP POLICY IF EXISTS "Consultants can manage consultant-managed groups" ON group_assignment_groups;
DROP POLICY IF EXISTS "Students can view their assigned groups" ON group_assignment_groups;
DROP POLICY IF EXISTS "Auto-created groups are accessible to members" ON group_assignment_groups;

-- =====================================================
-- 3. CREATE RLS POLICIES
-- =====================================================

-- Policy for group_assignment_settings
CREATE POLICY "Consultants can manage assignment settings"
ON group_assignment_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 
    FROM consultant_roles cr
    JOIN group_assignments ga ON ga.community_id = cr.community_id
    WHERE cr.consultant_id = auth.uid()
    AND ga.id = group_assignment_settings.assignment_id
    AND cr.is_active = true
  )
);

-- Policy for consultant-managed groups (full access)
CREATE POLICY "Consultants can manage consultant-managed groups"
ON group_assignment_groups
FOR ALL
USING (
  is_consultant_managed = true
  AND EXISTS (
    SELECT 1 
    FROM consultant_roles cr
    JOIN group_assignments ga ON ga.community_id = cr.community_id
    WHERE cr.consultant_id = auth.uid()
    AND ga.id = group_assignment_groups.assignment_id
    AND cr.is_active = true
  )
);

-- Policy for students to view their assigned groups
CREATE POLICY "Students can view their assigned groups"
ON group_assignment_groups
FOR SELECT
USING (
  auth.uid() = ANY(member_ids)
  OR EXISTS (
    SELECT 1 
    FROM user_roles ur
    WHERE ur.user_id = auth.uid()
    AND ur.role_type = 'admin'
    AND ur.is_active = true
  )
);

-- Ensure auto-created groups remain accessible
CREATE POLICY "Auto-created groups are accessible to members"
ON group_assignment_groups
FOR SELECT
USING (
  is_consultant_managed = false
  AND auth.uid() = ANY(member_ids)
);

-- =====================================================
-- 4. CREATE ATOMIC SAVE FUNCTION
-- =====================================================

CREATE OR REPLACE FUNCTION save_consultant_groups(
  p_assignment_id UUID,
  p_community_id UUID,
  p_groups JSONB
) RETURNS JSONB AS $$
DECLARE
  v_consultant_id UUID;
  v_is_authorized BOOLEAN;
  v_group JSONB;
  v_group_id UUID;
  v_existing_ids UUID[];
  v_result JSONB;
BEGIN
  -- Get the authenticated user
  v_consultant_id := auth.uid();
  
  -- Verify consultant permission for this community
  SELECT EXISTS(
    SELECT 1 
    FROM consultant_roles 
    WHERE consultant_id = v_consultant_id
    AND community_id = p_community_id
    AND is_active = true
  ) INTO v_is_authorized;
  
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: User is not a consultant for this community';
  END IF;
  
  -- Begin transaction logic
  BEGIN
    -- First, enable consultant-managed mode for this assignment
    INSERT INTO group_assignment_settings (
      assignment_id,
      consultant_managed,
      max_group_size,
      updated_at
    ) VALUES (
      p_assignment_id,
      true,
      8,
      NOW()
    )
    ON CONFLICT (assignment_id) DO UPDATE
    SET consultant_managed = true,
        updated_at = NOW();
    
    -- Collect IDs of groups to keep
    v_existing_ids := ARRAY[]::UUID[];
    FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
    LOOP
      IF v_group->>'id' IS NOT NULL THEN
        v_existing_ids := array_append(v_existing_ids, (v_group->>'id')::UUID);
      END IF;
    END LOOP;
    
    -- Delete groups that are no longer in the list
    DELETE FROM group_assignment_groups
    WHERE assignment_id = p_assignment_id
    AND is_consultant_managed = true
    AND (v_existing_ids = '{}' OR id != ALL(v_existing_ids));
    
    -- Process each group
    FOR v_group IN SELECT * FROM jsonb_array_elements(p_groups)
    LOOP
      -- Skip empty groups
      IF jsonb_array_length(v_group->'member_ids') = 0 THEN
        CONTINUE;
      END IF;
      
      IF v_group->>'id' IS NOT NULL THEN
        -- Update existing group
        UPDATE group_assignment_groups
        SET name = v_group->>'name',
            member_ids = ARRAY(
              SELECT jsonb_array_elements_text(v_group->'member_ids')
            )::UUID[],
            updated_at = NOW()
        WHERE id = (v_group->>'id')::UUID
        AND assignment_id = p_assignment_id
        AND is_consultant_managed = true;
      ELSE
        -- Insert new group
        INSERT INTO group_assignment_groups (
          assignment_id,
          name,
          member_ids,
          created_by,
          is_consultant_managed,
          created_at,
          updated_at
        ) VALUES (
          p_assignment_id,
          v_group->>'name',
          ARRAY(
            SELECT jsonb_array_elements_text(v_group->'member_ids')
          )::UUID[],
          v_consultant_id,
          true,
          NOW(),
          NOW()
        );
      END IF;
    END LOOP;
    
    -- Return success
    v_result := jsonb_build_object(
      'success', true,
      'message', 'Groups saved successfully',
      'timestamp', NOW()
    );
    
    RETURN v_result;
    
  EXCEPTION
    WHEN OTHERS THEN
      -- Rollback is automatic in case of error
      RAISE;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION save_consultant_groups(UUID, UUID, JSONB) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION save_consultant_groups IS 
'Atomically saves consultant-managed groups for an assignment. 
Requires the caller to be an active consultant for the specified community.
Handles updates, insertions, and deletions in a single transaction.';

-- =====================================================
-- 5. CREATE EFFICIENT QUERY FUNCTIONS
-- =====================================================

-- Function for consultant overview dashboard
CREATE OR REPLACE FUNCTION get_consultant_groups_overview(
  p_community_id UUID,
  p_consultant_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_is_authorized BOOLEAN;
BEGIN
  -- Verify consultant permission
  SELECT EXISTS(
    SELECT 1 
    FROM consultant_roles 
    WHERE consultant_id = p_consultant_id
    AND community_id = p_community_id
    AND is_active = true
  ) INTO v_is_authorized;
  
  IF NOT v_is_authorized THEN
    RAISE EXCEPTION 'Unauthorized: User is not a consultant for this community';
  END IF;

  -- Single efficient query to get all overview data
  WITH assignment_data AS (
    SELECT 
      ga.id AS assignment_id,
      ga.title AS assignment_title,
      COALESCE(
        json_agg(
          DISTINCT jsonb_build_object(
            'id', gag.id,
            'name', gag.name,
            'member_count', array_length(gag.member_ids, 1),
            'submission_count', COALESCE(sub_counts.count, 0),
            'last_activity', sub_counts.last_submission
          )
        ) FILTER (WHERE gag.id IS NOT NULL), 
        '[]'::json
      ) AS groups,
      COUNT(DISTINCT cm.user_id) AS total_students,
      COUNT(DISTINCT cm.user_id) - COUNT(DISTINCT unnest_members.member_id) AS unassigned_students
    FROM group_assignments ga
    INNER JOIN group_assignment_settings gas 
      ON gas.assignment_id = ga.id 
      AND gas.consultant_managed = true
    LEFT JOIN group_assignment_groups gag 
      ON gag.assignment_id = ga.id 
      AND gag.is_consultant_managed = true
    LEFT JOIN LATERAL (
      SELECT unnest(gag.member_ids) AS member_id
    ) unnest_members ON true
    LEFT JOIN community_members cm 
      ON cm.community_id = ga.community_id 
      AND cm.is_active = true
    LEFT JOIN LATERAL (
      SELECT 
        COUNT(*) AS count,
        MAX(submitted_at) AS last_submission
      FROM group_assignment_submissions
      WHERE group_id = gag.id
    ) sub_counts ON true
    WHERE ga.community_id = p_community_id
    GROUP BY ga.id, ga.title
  )
  SELECT jsonb_build_object(
    'success', true,
    'overviews', jsonb_agg(
      jsonb_build_object(
        'assignment_id', assignment_id,
        'assignment_title', assignment_title,
        'groups', groups,
        'total_students', total_students,
        'unassigned_students', unassigned_students
      )
    )
  ) INTO v_result
  FROM assignment_data;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function for efficient assignment loading with user groups
CREATE OR REPLACE FUNCTION get_assignments_with_user_groups(
  p_community_id UUID,
  p_user_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_result JSONB;
  v_is_consultant BOOLEAN;
BEGIN
  -- Check if user is a consultant for this community
  SELECT EXISTS(
    SELECT 1 
    FROM consultant_roles 
    WHERE consultant_id = p_user_id
    AND community_id = p_community_id
    AND is_active = true
  ) INTO v_is_consultant;

  -- Get all assignments with settings and user's groups in one query
  WITH assignment_data AS (
    SELECT 
      ga.id,
      ga.title,
      ga.description,
      ga.type,
      ga.due_date,
      gas.consultant_managed,
      gas.max_group_size,
      CASE 
        WHEN v_is_consultant THEN NULL
        ELSE (
          SELECT jsonb_build_object(
            'id', gag.id,
            'name', gag.name,
            'member_ids', gag.member_ids,
            'members', COALESCE(
              jsonb_agg(
                jsonb_build_object(
                  'id', p.id,
                  'first_name', p.first_name,
                  'last_name', p.last_name,
                  'email', p.email
                )
              ) FILTER (WHERE p.id IS NOT NULL),
              '[]'::jsonb
            )
          )
          FROM group_assignment_groups gag
          LEFT JOIN LATERAL (
            SELECT * FROM profiles 
            WHERE id = ANY(gag.member_ids)
          ) p ON true
          WHERE gag.assignment_id = ga.id
          AND gag.is_consultant_managed = true
          AND p_user_id = ANY(gag.member_ids)
          GROUP BY gag.id, gag.name, gag.member_ids
          LIMIT 1
        )
      END AS user_group
    FROM group_assignments ga
    LEFT JOIN group_assignment_settings gas ON gas.assignment_id = ga.id
    WHERE ga.community_id = p_community_id
    AND ga.is_active = true
  )
  SELECT jsonb_build_object(
    'success', true,
    'is_consultant', v_is_consultant,
    'assignments', jsonb_agg(
      jsonb_build_object(
        'id', id,
        'title', title,
        'description', description,
        'type', type,
        'due_date', due_date,
        'settings', jsonb_build_object(
          'consultant_managed', COALESCE(consultant_managed, false),
          'max_group_size', max_group_size
        ),
        'user_group', user_group
      )
    )
  ) INTO v_result
  FROM assignment_data;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION get_consultant_groups_overview(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION get_assignments_with_user_groups(UUID, UUID) TO authenticated;

-- =====================================================
-- 6. CREATE INDEXES FOR PERFORMANCE
-- =====================================================

-- Index for consultant role lookups
CREATE INDEX IF NOT EXISTS idx_consultant_roles_lookup 
ON consultant_roles(consultant_id, community_id, is_active);

-- Index for group member lookups
CREATE INDEX IF NOT EXISTS idx_group_members_gin 
ON group_assignment_groups USING GIN (member_ids);

-- Index for assignment settings
CREATE INDEX IF NOT EXISTS idx_assignment_settings 
ON group_assignment_settings(assignment_id, consultant_managed);

-- =====================================================
-- 7. VERIFY DEPLOYMENT
-- =====================================================

-- Check that all objects were created
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Check policies
  SELECT COUNT(*) INTO v_count
  FROM pg_policies 
  WHERE tablename IN ('group_assignment_settings', 'group_assignment_groups');
  
  IF v_count < 4 THEN
    RAISE EXCEPTION 'Not all RLS policies were created';
  END IF;
  
  -- Check functions
  SELECT COUNT(*) INTO v_count
  FROM pg_proc 
  WHERE proname IN ('save_consultant_groups', 'get_consultant_groups_overview', 'get_assignments_with_user_groups');
  
  IF v_count < 3 THEN
    RAISE EXCEPTION 'Not all functions were created';
  END IF;
  
  RAISE NOTICE 'Deployment verification passed!';
END $$;

COMMIT;

-- =====================================================
-- POST-DEPLOYMENT NOTES
-- =====================================================
-- 1. Test with a consultant user to verify permissions
-- 2. Monitor performance of the new RPC functions
-- 3. Check that existing auto-groups still work
-- 4. Verify students can see their assigned groups
-- 5. Enable feature flag in application code