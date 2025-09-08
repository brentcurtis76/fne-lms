-- RBAC Phase 0 — SQL Draft (STAGING-first)
-- 1) Ensure both superadmin helper functions exist (capability-based)

-- Param version: checks an explicit user_id
CREATE OR REPLACE FUNCTION auth_is_superadmin(check_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM superadmins s
    WHERE s.user_id = check_user_id
      AND s.is_active = true
  );
$$;

-- No-arg wrapper: checks current session user
CREATE OR REPLACE FUNCTION auth_is_superadmin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth_is_superadmin(auth.uid());
$$;

-- 2) Update events policy to use capability function (avoid treating 'superadmin' as a user_roles role)
-- Existing policy name (as per repo): "Authorized roles can manage events"

ALTER POLICY "Authorized roles can manage events" ON public.events
  USING (
    -- Admin or Community Manager via user_roles OR capability-based superadmin
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'community_manager')
    ) OR auth_is_superadmin()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.is_active = true
        AND ur.role_type IN ('admin', 'community_manager')
    ) OR auth_is_superadmin()
  );

-- 3) Reference: Non-recursive SELECT policy for superadmins (do NOT apply inside this policy the helper functions)
-- Keep superadmins SELECT as:
-- CREATE POLICY superadmins_read_own ON public.superadmins FOR SELECT
--   USING (user_id = auth.uid() AND is_active = true);

-- Note: Do not reference auth_is_superadmin() or re-query superadmins inside superadmins RLS policies to avoid recursion.

