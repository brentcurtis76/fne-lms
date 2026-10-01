-- Consultor read-only Contexto SELECT foundation.
--
-- Grants SELECT on the three Contexto read tables to any authenticated caller
-- who holds an ACTIVE consultor role, across all schools (accepted product
-- decision: all-school read-only Contexto/Plan for consultores).
--
-- Additive only: no existing policy, helper, grant, RLS flag or write
-- permission is altered. Existing admin/directivo/docente policies and the
-- RESTRICTIVE forced_password_change_guard remain in force and still apply.
--
-- The role check is an explicit direct subquery on public.user_roles evaluated
-- under caller RLS. Filtering on user_id = auth.uid() is essential: community
-- member visibility can expose other users' role rows, which must not confer
-- this permission. A null auth.uid(), a null/false is_active, or any non-
-- consultor role fails closed.

CREATE POLICY school_transversal_context_consultor_select
  ON public.school_transversal_context
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'consultor'::public.user_role_type
        AND ur.is_active IS TRUE
    )
  );

CREATE POLICY school_course_structure_consultor_select
  ON public.school_course_structure
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'consultor'::public.user_role_type
        AND ur.is_active IS TRUE
    )
  );

CREATE POLICY school_course_docente_assignments_consultor_select
  ON public.school_course_docente_assignments
  AS PERMISSIVE
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role_type = 'consultor'::public.user_role_type
        AND ur.is_active IS TRUE
    )
  );
