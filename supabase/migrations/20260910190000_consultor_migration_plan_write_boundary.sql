-- PROC-CONSULTOR-C0: write boundary for public.ab_migration_plan.
--
-- Adds RESTRICTIVE policies so INSERT/UPDATE/DELETE require an active
-- assessment admin (any school) or an active equipo_directivo of the row's
-- school. Restrictive policies are ANDed with the existing permissive
-- policies, which are intentionally left in place, as are RLS, the SELECT
-- policy and the forced_password_change_guard. Helpers are not modified.
-- Service role keeps BYPASSRLS. A NULL school_id fails closed for
-- non-admins.

CREATE POLICY ab_migration_plan_write_boundary_insert
  ON public.ab_migration_plan
  AS RESTRICTIVE
  FOR INSERT
  TO public
  WITH CHECK (
    public.auth_is_assessment_admin()
    OR public.auth_is_school_directivo(school_id)
  );

CREATE POLICY ab_migration_plan_write_boundary_update
  ON public.ab_migration_plan
  AS RESTRICTIVE
  FOR UPDATE
  TO public
  USING (
    public.auth_is_assessment_admin()
    OR public.auth_is_school_directivo(school_id)
  )
  WITH CHECK (
    public.auth_is_assessment_admin()
    OR public.auth_is_school_directivo(school_id)
  );

CREATE POLICY ab_migration_plan_write_boundary_delete
  ON public.ab_migration_plan
  AS RESTRICTIVE
  FOR DELETE
  TO public
  USING (
    public.auth_is_assessment_admin()
    OR public.auth_is_school_directivo(school_id)
  );
