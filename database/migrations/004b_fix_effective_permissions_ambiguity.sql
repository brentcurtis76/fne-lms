-- Migration: 004b_fix_effective_permissions_ambiguity.sql
-- Purpose: Fix column ambiguity in get_effective_permissions RPC
-- Date: 2025-01-08
-- Author: Executor (Claude)
-- Status: Ready for STAGING

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
  WITH baseline AS (
    SELECT b.permission_key, b.granted, 'baseline'::text AS source
    FROM role_permission_baseline b
    WHERE b.role_type = p_role_type
  ),
  overlays AS (
    SELECT o.permission_key, o.granted, 'test_overlay'::text AS source
    FROM role_permissions o
    WHERE o.role_type = p_role_type
      AND o.is_test = true
      AND o.active = true
      AND (o.expires_at IS NULL OR o.expires_at > now())
      AND o.test_run_id = p_test_run_id
  ),
  combined AS (
    SELECT ov.permission_key, ov.granted, ov.source FROM overlays ov
    UNION ALL
    SELECT b.permission_key, b.granted, b.source
    FROM baseline b
    WHERE NOT EXISTS (
      SELECT 1 FROM overlays ov WHERE ov.permission_key = b.permission_key
    )
  )
  SELECT c.permission_key, c.granted, c.source
  FROM combined c
  ORDER BY c.permission_key;
END;
$$;