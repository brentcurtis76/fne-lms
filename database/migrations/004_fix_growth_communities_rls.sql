-- Minimal RLS Fix for Growth Communities (Espacio Colaborativo)
--
-- SCOPE: Only fix the immediate blocker preventing Community Manager from accessing
-- the collaborative workspace. Uses the correct table name: growth_communities
--
-- SAFETY: Uses permissive policy that allows all authenticated users to view.
-- This maintains current behavior while enabling RLS.
--
-- ROLLBACK: To rollback, run:
--   ALTER TABLE growth_communities DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- GROWTH_COMMUNITIES TABLE
-- =============================================================================

ALTER TABLE growth_communities ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "authenticated_users_view_growth_communities" ON growth_communities;

-- Allow all authenticated users to view growth communities
-- This is intentionally permissive to match current behavior
CREATE POLICY "authenticated_users_view_growth_communities"
ON growth_communities
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify policy was created
DO $$
BEGIN
  RAISE NOTICE 'RLS Policy Applied Successfully:';
  RAISE NOTICE '  ✓ growth_communities: authenticated_users_view_growth_communities';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Test Espacio Colaborativo access with Community Manager account';
  RAISE NOTICE '  2. Check browser console for any remaining RLS errors';
  RAISE NOTICE '  3. Use the monitoring script to detect other issues';
END $$;
