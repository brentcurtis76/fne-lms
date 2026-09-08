-- =============================================================================
-- 20260908120000_consultor_scope.sql — Procesos de Cambio review remediation,
-- Codex round 1 finding 2: the temporary consultor denial on the
-- transversal-context surface must hold at the database, not only in the API.
--
-- Before this migration three permissive policies let a consultor read, with
-- a plain user-scoped Supabase client (no API route involved):
--   * context_general_responses — EVERY school's custom context responses,
--     for any active consultor, assigned or not;
--   * school_change_history     — every feature's history of an assigned
--     school, including transversal_context and context_responses;
--   * school_plan_completion_status — every feature's completion state of an
--     assigned school, including context_responses.
--
-- Until the product decision (deny entirely vs. designed read-only access)
-- the consultor surface is DENIED consistently. The documented exceptions
-- are preserved: the schools listing (service role, no table policy) and the
-- migration-plan feature. So:
--   * context_general_responses: the admin+consultor SELECT policy becomes
--     admin-only (the policy keeps its historical name — renames are a
--     destructive ALTER — and carries a COMMENT stating the new predicate);
--   * school_change_history / school_plan_completion_status: the consultor
--     SELECT policies are narrowed to feature = 'migration_plan'.
--
-- Additive-only: no object is removed, ALTER POLICY only replaces the USING
-- predicate (row security stays enabled; admin / directivo policies are
-- untouched). Verified by supabase/tests/074-consultor-scope.sql.
-- =============================================================================

ALTER POLICY "Admin and consultor can read all responses"
  ON public.context_general_responses
  USING (
    EXISTS (
      SELECT 1
        FROM public.user_roles
       WHERE user_roles.user_id = auth.uid()
         AND user_roles.role_type = 'admin'::public.user_role_type
         AND user_roles.is_active = true
    )
  );

COMMENT ON POLICY "Admin and consultor can read all responses"
  ON public.context_general_responses IS
  'Historical name. Since 20260908120000 (Procesos de Cambio, R5 / Codex round 1 finding 2) the predicate admits ADMIN ONLY: consultor access to the transversal-context surface is denied pending the product decision.';

ALTER POLICY "school_change_history_consultor_select"
  ON public.school_change_history
  USING (
    school_change_history.feature = 'migration_plan'
    AND EXISTS (
      SELECT 1
        FROM public.consultant_assignments ca
       WHERE ca.consultant_id = auth.uid()
         AND ca.school_id = school_change_history.school_id
         AND ca.is_active = true
    )
  );

COMMENT ON POLICY "school_change_history_consultor_select"
  ON public.school_change_history IS
  'Assigned consultores read the migration_plan history only (20260908120000): transversal_context and context_responses history is denied pending the product decision.';

ALTER POLICY "school_plan_completion_consultor_select"
  ON public.school_plan_completion_status
  USING (
    school_plan_completion_status.feature = 'migration_plan'
    AND EXISTS (
      SELECT 1
        FROM public.consultant_assignments ca
       WHERE ca.consultant_id = auth.uid()
         AND ca.school_id = school_plan_completion_status.school_id
         AND ca.is_active = true
    )
  );

COMMENT ON POLICY "school_plan_completion_consultor_select"
  ON public.school_plan_completion_status IS
  'Assigned consultores read the migration_plan completion state only (20260908120000): context_responses completion is denied pending the product decision.';
