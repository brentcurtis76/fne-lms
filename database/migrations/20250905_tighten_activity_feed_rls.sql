-- Tighten RLS for activity_feed by workspace membership
-- Phase: RLS Hardening (staging-first)
-- Rollout: STAGING -> verify -> PROD

BEGIN;

-- Ensure RLS is enabled and forced
ALTER TABLE public.activity_feed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_feed FORCE ROW LEVEL SECURITY;

-- Drop temporary broad read policy if present
DROP POLICY IF EXISTS "authenticated_read_activity_feed" ON public.activity_feed;
DROP POLICY IF EXISTS "workspace_members_can_read_activity" ON public.activity_feed;

-- Create policy with environment-aware fallback.
-- If community_workspaces/community_members exist, include membership check; otherwise fall back to author/admin-only.
DO $$
BEGIN
  IF to_regclass('public.community_workspaces') IS NOT NULL AND to_regclass('public.community_members') IS NOT NULL THEN
    EXECUTE $$
      CREATE POLICY "workspace_members_can_read_activity"
      ON public.activity_feed
      FOR SELECT
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND (ur.is_active IS NULL OR ur.is_active = true)
            AND ur.role_type IN ('admin', 'consultor', 'equipo_directivo')
        )
        OR EXISTS (
          SELECT 1
          FROM public.community_workspaces cw
          JOIN public.community_members cm ON cm.community_id = cw.community_id
          WHERE cw.id = activity_feed.workspace_id
            AND cm.user_id = auth.uid()
        )
      );
    $$;
  ELSE
    EXECUTE $$
      CREATE POLICY "workspace_members_can_read_activity"
      ON public.activity_feed
      FOR SELECT
      USING (
        user_id = auth.uid()
        OR EXISTS (
          SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = auth.uid()
            AND (ur.is_active IS NULL OR ur.is_active = true)
            AND ur.role_type IN ('admin', 'consultor', 'equipo_directivo')
        )
      );
    $$;
  END IF;
END
$$;

-- Write policies remain as-is; service role has separate ALL policy

COMMIT;

-- Verification (run in STAGING with role-scoped JWTs)
-- 1) Anonymous: should fail
-- 2) Authenticated non-member: should NOT see other workspaces' activity
-- 3) Member: should see their workspace activity
-- 4) Admin/consultant: should see all

/*
-- Rollback
BEGIN;
DROP POLICY IF EXISTS "workspace_members_can_read_activity" ON public.activity_feed;
CREATE POLICY "authenticated_read_activity_feed" 
ON public.activity_feed 
FOR SELECT 
TO authenticated
USING (true);
COMMIT;
*/
