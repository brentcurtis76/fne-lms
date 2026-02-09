-- Add Supervisor Network Support
-- QA Pipeline: supervisor-de-red-schema-fix-001
-- Fixes critical schema mismatch where supervisor_de_red role cannot access network data
--
-- CHANGES:
-- 1. Add red_id column to user_roles (links supervisor to network)
-- 2. Add RLS policies for supervisor network access
-- 3. Add DB helper function supervisor_can_access_user()
--
-- ISSUE: 4 API routes query red_escuelas.supervisor_id which doesn't exist
-- SOLUTION: Add user_roles.red_id and use red_id chain for network scoping

-- ============================================================
-- Step 1: Add red_id column to user_roles
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'user_roles'
      AND column_name = 'red_id'
  ) THEN
    ALTER TABLE user_roles
    ADD COLUMN red_id UUID REFERENCES redes_de_colegios(id) ON DELETE SET NULL;

    COMMENT ON COLUMN user_roles.red_id IS 'Network assignment for supervisor_de_red role (links to redes_de_colegios)';
  END IF;
END $$;

-- ============================================================
-- Step 2: RLS Policies for supervisor_de_red access
-- ============================================================

-- Allow supervisors to read schools in their assigned network
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'red_escuelas'
      AND policyname = 'red_escuelas_supervisor_network_select'
  ) THEN
    CREATE POLICY "red_escuelas_supervisor_network_select"
      ON red_escuelas
      FOR SELECT
      USING (
        -- Supervisors can see schools in their network
        red_id IN (
          SELECT ur.red_id FROM user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
            AND ur.red_id IS NOT NULL
        )
        OR
        -- Admins can see all
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role_type = 'admin'
            AND user_roles.is_active = true
        )
      );
  END IF;
END $$;

-- Allow supervisors to view their assigned network details
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'redes_de_colegios'
      AND policyname = 'redes_de_colegios_supervisor_select'
  ) THEN
    CREATE POLICY "redes_de_colegios_supervisor_select"
      ON redes_de_colegios
      FOR SELECT
      USING (
        -- Supervisors can see their assigned network
        id IN (
          SELECT ur.red_id FROM user_roles ur
          WHERE ur.user_id = auth.uid()
            AND ur.role_type = 'supervisor_de_red'
            AND ur.is_active = true
            AND ur.red_id IS NOT NULL
        )
        OR
        -- Admins can see all
        EXISTS (
          SELECT 1 FROM user_roles
          WHERE user_roles.user_id = auth.uid()
            AND user_roles.role_type = 'admin'
            AND user_roles.is_active = true
        )
      );
  END IF;
END $$;

-- ============================================================
-- Step 3: Helper function for supervisor access checks
-- ============================================================
CREATE OR REPLACE FUNCTION supervisor_can_access_user(
  supervisor_user_id UUID,
  target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  supervisor_network_id UUID;
  target_school_id INTEGER;
  school_in_network BOOLEAN;
BEGIN
  -- Get supervisor's network ID
  SELECT red_id INTO supervisor_network_id
  FROM user_roles
  WHERE user_id = supervisor_user_id
    AND role_type = 'supervisor_de_red'
    AND is_active = true
    AND red_id IS NOT NULL
  LIMIT 1;

  -- If supervisor has no network assignment, deny access
  IF supervisor_network_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Get target user's school ID (from their active role)
  SELECT school_id INTO target_school_id
  FROM user_roles
  WHERE user_id = target_user_id
    AND is_active = true
    AND school_id IS NOT NULL
  LIMIT 1;

  -- If target user has no school assignment, deny access
  IF target_school_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Check if target user's school is in supervisor's network
  SELECT EXISTS (
    SELECT 1 FROM red_escuelas
    WHERE red_id = supervisor_network_id
      AND school_id = target_school_id
  ) INTO school_in_network;

  RETURN school_in_network;
END;
$$;

COMMENT ON FUNCTION supervisor_can_access_user IS 'Check if a supervisor_de_red can access a user based on network-school membership (used by roleUtils.ts)';
