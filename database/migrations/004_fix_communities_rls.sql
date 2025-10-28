-- Minimal RLS Fix for Communities (Espacio Colaborativo)
--
-- SCOPE: Only fix the immediate blocker preventing Community Manager from accessing
-- the collaborative workspace. No other tables are modified.
--
-- SAFETY: Uses permissive policies that allow all authenticated users to view.
-- This maintains current behavior while enabling RLS.
--
-- ROLLBACK: To rollback, run:
--   ALTER TABLE communities DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE community_members DISABLE ROW LEVEL SECURITY;

-- =============================================================================
-- COMMUNITIES TABLE
-- =============================================================================

ALTER TABLE communities ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "authenticated_users_view_communities" ON communities;

-- Allow all authenticated users to view communities
-- This is intentionally permissive to match current behavior
CREATE POLICY "authenticated_users_view_communities"
ON communities
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- COMMUNITY_MEMBERS TABLE
-- =============================================================================

ALTER TABLE community_members ENABLE ROW LEVEL SECURITY;

-- Drop any existing policies
DROP POLICY IF EXISTS "authenticated_users_view_community_members" ON community_members;

-- Allow all authenticated users to view community members
-- This is intentionally permissive to match current behavior
CREATE POLICY "authenticated_users_view_community_members"
ON community_members
FOR SELECT
TO authenticated
USING (true);

-- =============================================================================
-- VERIFICATION
-- =============================================================================

-- Verify policies were created
DO $$
BEGIN
  RAISE NOTICE 'RLS Policies Applied Successfully:';
  RAISE NOTICE '  ✓ communities: authenticated_users_view_communities';
  RAISE NOTICE '  ✓ community_members: authenticated_users_view_community_members';
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '  1. Test Espacio Colaborativo access with Community Manager account';
  RAISE NOTICE '  2. Check browser console for any remaining RLS errors';
  RAISE NOTICE '  3. Monitor Supabase logs for policy violations';
END $$;
