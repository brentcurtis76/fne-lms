-- =============================================================================
-- 20261002130000_audit_log_director_scope.sql — W-B2c-01 release review (P1):
-- school-scope the direct (PostgREST) read of public.assignment_audit_log for
-- directors.
--
-- Before: the baseline PERMISSIVE policy admin_consultor_directivo_view lets
-- ANY active equipo_directivo read EVERY audit row (every school's people,
-- workspaces, paths and provenance) straight from /rest/v1, although the
-- audit-log API only ever returns a director the history (course and
-- learning-path rows) of ONE person of their own school.
--
-- After (additive: one RESTRICTIVE SELECT policy, nothing removed or altered):
--   * active admin / active consultor: unchanged — every row (same predicate
--     as the baseline policy: is_active = true);
--   * anyone else the baseline admits (an active equipo_directivo): only rows
--     about a PERSON (entity_type = 'user') they may see under the learning-
--     path report rule, auth_lp_report_sees_user(entity_id) = an active
--     user_roles row in one of the director's schools. Rows about a workspace
--     (group) are never returned to a director: a group spans people whose
--     schools are not checked here, matching the API, which refuses them;
--   * every other authenticated caller: unchanged (the baseline policy
--     already admits nothing);
--   * service_role bypasses RLS (backend, unchanged); the RESTRICTIVE
--     forced_password_change_guard still applies (and the helper is gated too).
-- No write path changes: the table has no INSERT / UPDATE / DELETE policy.
-- =============================================================================

DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_policies
     WHERE schemaname = 'public'
       AND tablename = 'assignment_audit_log'
       AND policyname = 'assignment_audit_log_director_school_scope'
  ) THEN
    CREATE POLICY assignment_audit_log_director_school_scope
      ON public.assignment_audit_log
      AS RESTRICTIVE
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
            FROM public.user_roles ur
           WHERE ur.user_id = auth.uid()
             AND ur.is_active = true
             AND ur.role_type = ANY (ARRAY['admin'::public.user_role_type, 'consultor'::public.user_role_type])
        )
        OR (
          entity_type = 'user'::public.assignment_entity_type
          AND public.auth_lp_report_sees_user(entity_id) IS TRUE
        )
      );
  END IF;
END
$do$;

COMMENT ON POLICY assignment_audit_log_director_school_scope ON public.assignment_audit_log IS
  'W-B2c-01 (2026-10-02): RESTRICTIVE. Active admin / consultor read every row (unchanged); any other caller only rows about a person (entity_type user) visible under auth_lp_report_sees_user — for an active equipo_directivo, people with an active role in their school. Workspace rows are never returned to directors.';
