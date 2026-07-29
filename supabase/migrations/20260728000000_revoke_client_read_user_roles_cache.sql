-- =============================================================================
-- Revoke anon/authenticated access to the user_roles_cache materialized view.
--
-- The baseline grants ALL on public.user_roles_cache to anon and authenticated.
-- Materialized views cannot carry RLS, so any client holding the anon key
-- could read EVERY user's role assignments (user_id, role, school_id,
-- community_id, generation_id) — a cross-tenant information disclosure
-- (fase-1 PM dossier, residual risks; Z1a-4 caller audit).
--
-- Server-side consumers are unaffected:
--   * service_role keeps its grant — degraded-path reads in
--     utils/roleUtils.ts go through the service-role client.
--   * auth_get_user_role(), auth_is_teacher(), auth_has_school_access(),
--     auth_has_school_access_uuid() and refresh_user_roles_cache() are
--     SECURITY DEFINER owned by postgres, so they read the view with the
--     owner's privileges, not the caller's.
--
-- No client-facing read wrapper is added: legitimate self-reads already flow
-- through public.user_roles under its own-row RLS policies; no client-side
-- code needs the view. If the view is ever re-created, Supabase default
-- privileges would re-grant it to client roles —
-- supabase/tests/030-user-roles-cache-grants.sql fails CI if that happens.
-- =============================================================================

REVOKE ALL ON TABLE public.user_roles_cache FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles_cache FROM anon;
REVOKE ALL ON TABLE public.user_roles_cache FROM authenticated;
