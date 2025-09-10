BEGIN;

-- 1) Helper: are you an events manager?
-- Runs with definer privileges so policies never directly read user_roles as anon.
CREATE OR REPLACE FUNCTION public.fn_is_events_manager(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
SELECT 
  EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_user_id
    AND ur.is_active = true
    AND ur.role_type IN ('admin','community_manager')
  )
  -- Check superadmins table if it exists
  OR EXISTS (
    SELECT 1
    FROM public.superadmins sa
    WHERE sa.user_id = p_user_id
    AND sa.is_active = true
  )
$$;

-- 2) Ensure RLS is enabled
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- 3) Public read-only policy (anon can view only published)
DROP POLICY IF EXISTS "Public can view published events" ON public.events;
CREATE POLICY "Public can view published events" ON public.events
  FOR SELECT
  TO public
  USING (is_published = true);

-- 4) Authenticated manager policies (use helper; cover SELECT and writes)
-- Drop any broad/all policies referencing user_roles for PUBLIC
DROP POLICY IF EXISTS "Authorized roles can manage events" ON public.events;
DROP POLICY IF EXISTS "Authorized roles can manage events (auth)" ON public.events;

-- SELECT: managers can view all events (published or not)
DROP POLICY IF EXISTS "Managers can read all events" ON public.events;
CREATE POLICY "Managers can read all events" ON public.events
  FOR SELECT
  TO authenticated
  USING (fn_is_events_manager(auth.uid()));

-- INSERT/UPDATE/DELETE: only managers may modify; WITH CHECK guards new/updated rows
DROP POLICY IF EXISTS "Managers can modify events" ON public.events;
CREATE POLICY "Managers can modify events" ON public.events
  FOR INSERT
  TO authenticated
  WITH CHECK (fn_is_events_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can update events" ON public.events;
CREATE POLICY "Managers can update events" ON public.events
  FOR UPDATE
  TO authenticated
  USING (fn_is_events_manager(auth.uid()))
  WITH CHECK (fn_is_events_manager(auth.uid()));

DROP POLICY IF EXISTS "Managers can delete events" ON public.events;
CREATE POLICY "Managers can delete events" ON public.events
  FOR DELETE
  TO authenticated
  USING (fn_is_events_manager(auth.uid()));

-- 5) Grants for function (execute for authenticated; not needed for anon)
GRANT EXECUTE ON FUNCTION public.fn_is_events_manager(uuid) TO authenticated;

COMMIT;

