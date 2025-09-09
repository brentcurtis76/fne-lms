-- Tighten RLS for finance-related tables: clientes, contratos, cuotas
-- Scope: admin/consultor/equipo_directivo only (via user_roles)
-- Service role retains full bypass. No anonymous access.

BEGIN;

-- Ensure helper exists to avoid exposing user_roles in error paths
CREATE OR REPLACE FUNCTION public.is_admin_or_consultor(p_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    WHERE ur.user_id = p_uid
      AND COALESCE(ur.is_active, true)
      AND ur.role_type IN ('admin','consultor','equipo_directivo')
  );
$$;
REVOKE ALL ON FUNCTION public.is_admin_or_consultor(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_or_consultor(uuid) TO anon, authenticated, service_role;

-- Helper macro via DO block to reduce repetition
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['clientes','contratos','cuotas'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY;', t);

    -- Permissions
    EXECUTE format('REVOKE ALL ON public.%I FROM anon;', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM public;', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated;', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role;', t);

    -- Clean old/broad policies if any
    EXECUTE format('DROP POLICY IF EXISTS "authenticated_read_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "admin_or_consultor_can_read_%s" ON public.%I;', t, t);
    EXECUTE format('DROP POLICY IF EXISTS "service_role_bypass_%s" ON public.%I;', t, t);

    -- Scoped read policy
    EXECUTE format($sql$
      CREATE POLICY "admin_or_consultor_can_read_%1$s"
      ON public.%1$I
      FOR SELECT TO authenticated
      USING ( public.is_admin_or_consultor(auth.uid()) );
    $sql$, t);

    -- Service role bypass
    EXECUTE format($sql$
      CREATE POLICY "service_role_bypass_%1$s"
      ON public.%1$I
      FOR ALL TO service_role
      USING (true) WITH CHECK (true);
    $sql$, t);
  END LOOP;
END
$$;

COMMIT;

-- Rollback (restore temporary authenticated-only read if needed)
/*
BEGIN;
  DO $$
  DECLARE t text; BEGIN
    FOREACH t IN ARRAY ARRAY['clientes','contratos','cuotas'] LOOP
      EXECUTE format('DROP POLICY IF EXISTS "admin_or_consultor_can_read_%1$s" ON public.%1$I;', t);
      EXECUTE format('DROP POLICY IF EXISTS "service_role_bypass_%1$s" ON public.%1$I;', t);
      EXECUTE format($rb$
        CREATE POLICY "authenticated_read_%1$s" ON public.%1$I FOR SELECT TO authenticated USING (true);
      $rb$, t);
    END LOOP;
  END $$;
COMMIT;
*/

