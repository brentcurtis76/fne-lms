BEGIN;
-- Rollback script for 006_fix_events_rls.sql

-- Restore original structure; disable helper usage
DROP POLICY IF EXISTS "Managers can read all events" ON public.events;
DROP POLICY IF EXISTS "Managers can modify events" ON public.events;
DROP POLICY IF EXISTS "Managers can update events" ON public.events;
DROP POLICY IF EXISTS "Managers can delete events" ON public.events;

-- Keep public read policy (safe default)
CREATE POLICY IF NOT EXISTS "Public can view published events" ON public.events
  FOR SELECT 
  TO public 
  USING (is_published = true);

-- Restore original admin policy (if needed)
CREATE POLICY IF NOT EXISTS "Authorized roles can manage events" ON public.events
  FOR ALL
  TO authenticated
  USING (
    auth_is_superadmin() OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND ur.role_type IN ('admin','community_manager')
    )
  )
  WITH CHECK (
    auth_is_superadmin() OR
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
      AND ur.is_active = true
      AND ur.role_type IN ('admin','community_manager')
    )
  );

-- Drop helper function
DROP FUNCTION IF EXISTS public.fn_is_events_manager(uuid);

COMMIT;