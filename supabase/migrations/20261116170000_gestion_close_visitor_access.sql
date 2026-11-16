-- F7 — Gestión: things open to visitors and outsiders.
-- Closes:
--   GES-1.2  programme catalogue (programas): visitors lose all access; signed-in people read; only an active admin writes.
--   GES-1.1a Pasantías quotes and their travel groups: visitors lose all access; an active admin sees and changes every
--            quote; an active consultor sees and changes only their own; a group follows its quote.
--   N20      stored role summary (user_roles_cache): no direct access for visitors or signed-in people;
--            support-ticket counters (feedback_stats): run with the caller's rights; visitors lose access.
-- Statements: ALTER POLICY, CREATE POLICY, REVOKE (table and sequence privileges), ALTER VIEW ... SET (security_invoker).
-- Test: supabase/tests/122-gestion-visitor-access.sql

-- GES-1.2 ---------------------------------------------------------------------
ALTER POLICY "Permitir todo en programas" ON public.programas TO authenticated
  USING (public.access_active_admin()) WITH CHECK (public.access_active_admin());
CREATE POLICY "programas_read_signed_in" ON public.programas FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.programas FROM anon;

-- GES-1.1a --------------------------------------------------------------------
ALTER POLICY "Quotes are viewable by ID" ON public.pasantias_quotes TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
            AND ur.role_type = 'admin'::public.user_role_type)
    OR (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
                AND ur.role_type = 'consultor'::public.user_role_type)
        AND created_by = auth.uid())
  );
ALTER POLICY "Quotes are manageable by admins and consultors" ON public.pasantias_quotes TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
            AND ur.role_type = 'admin'::public.user_role_type)
    OR (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
                AND ur.role_type = 'consultor'::public.user_role_type)
        AND created_by = auth.uid())
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
            AND ur.role_type = 'admin'::public.user_role_type)
    OR (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.is_active = true
                AND ur.role_type = 'consultor'::public.user_role_type)
        AND created_by = auth.uid())
  );
ALTER POLICY "Quote groups are viewable by ID" ON public.pasantias_quote_groups TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pasantias_quotes q WHERE q.id = pasantias_quote_groups.quote_id));
ALTER POLICY "Quote groups are manageable by admins and consultors" ON public.pasantias_quote_groups TO authenticated
  USING (EXISTS (SELECT 1 FROM public.pasantias_quotes q WHERE q.id = pasantias_quote_groups.quote_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.pasantias_quotes q WHERE q.id = pasantias_quote_groups.quote_id));
REVOKE ALL ON public.pasantias_quotes, public.pasantias_quote_groups FROM anon;
REVOKE ALL ON SEQUENCE public.pasantias_quote_number_seq FROM anon;

-- N20 -------------------------------------------------------------------------
REVOKE ALL ON public.user_roles_cache FROM anon, authenticated;
ALTER VIEW public.feedback_stats SET (security_invoker = true);
REVOKE ALL ON public.feedback_stats FROM anon;
