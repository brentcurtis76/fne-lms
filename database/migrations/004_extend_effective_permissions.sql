-- Phase 2: Extend get_effective_permissions RPC to include baseline
-- This function combines baseline permissions with test overlays
-- Overlays take precedence over baseline for the same permission_key

-- Drop existing function if it exists (to replace with new signature)
DROP FUNCTION IF EXISTS get_effective_permissions(text, uuid);

-- Create or replace the function with baseline support
CREATE OR REPLACE FUNCTION get_effective_permissions(
  p_role_type TEXT,
  p_test_run_id UUID DEFAULT NULL
)
RETURNS TABLE (
  permission_key TEXT,
  granted BOOLEAN,
  source TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH 
  -- Get baseline permissions for this role
  baseline AS (
    SELECT 
      b.permission_key,
      b.granted,
      'baseline'::text as source
    FROM role_permission_baseline b
    WHERE b.role_type = p_role_type
  ),
  -- Get test overlays if test_run_id provided
  overlays AS (
    SELECT 
      o.permission_key,
      o.granted,
      'test_overlay'::text as source
    FROM role_permissions o
    WHERE o.role_type = p_role_type
      AND o.test_run_id = p_test_run_id
      AND o.is_test = true
      AND o.active = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
  ),
  -- Combine with overlay precedence
  combined AS (
    -- First, all overlays (they take precedence)
    SELECT permission_key, granted, source FROM overlays
    UNION ALL
    -- Then baseline permissions that aren't overridden
    SELECT b.permission_key, b.granted, b.source 
    FROM baseline b
    WHERE NOT EXISTS (
      SELECT 1 FROM overlays o 
      WHERE o.permission_key = b.permission_key
    )
  )
  SELECT 
    permission_key,
    granted,
    source
  FROM combined
  ORDER BY permission_key;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_effective_permissions(text, uuid) TO authenticated;

-- Add helpful comment
COMMENT ON FUNCTION get_effective_permissions IS 
'Returns effective permissions for a role, combining baseline with test overlays. 
Overlays take precedence over baseline. Returns source to indicate origin of each permission.';

-- Also create a simpler version without test_run_id for convenience
CREATE OR REPLACE FUNCTION get_baseline_permissions(
  p_role_type TEXT
)
RETURNS TABLE (
  permission_key TEXT,
  granted BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    permission_key,
    granted
  FROM role_permission_baseline
  WHERE role_type = p_role_type
  ORDER BY permission_key;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_baseline_permissions(text) TO authenticated;

COMMENT ON FUNCTION get_baseline_permissions IS 
'Returns only baseline permissions for a role, without any overlays.';