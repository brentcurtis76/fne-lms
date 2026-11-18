-- =============================================================================
-- 20261118101000_consultor_workspace_entry.sql — GENERA fixes F12e, item V5a.
--
-- Brent, 17 Nov 2026: "The assignment, everywhere": a consultor reaches a
-- school's spaces only while they hold a current assignment to that school.
-- The entry points of the community workspace (middleware gate, list of
-- communities, ensure-workspace, member list, mention search) run with the
-- caller's session, which cannot read consultant_assignments (admins only).
-- This adds ONE read-only helper about the caller and ONE additional read rule:
--
--   public.auth_consultor_assigned_school_ids() RETURNS SETOF integer
--     the distinct school_id of the caller's consultant_assignments rows that
--     are current — school_id not null, is_active true, started (starts_at
--     null or not in the future), not ended (ends_at null or in the future) —
--     and only while the caller holds an active consultor role; no rows
--     otherwise. Rows naming only a generation, community or person (no
--     school_id) do not count, as in public.auth_is_assigned_consultor.
--
--   rule "consultants_read_assigned_school_workspaces" on community_workspaces
--     (send-back 1, 18 Nov 2026): a permissive SELECT rule for authenticated —
--     the workspace's own row (name, picture, settings) is readable by a
--     consultor currently assigned to the school of the workspace's community,
--     whatever school their role row names. It sits next to the role-school
--     rule "consultants_read_school_workspaces", which stays as it is. What a
--     consultor reads inside a workspace (posts, documents, messages,
--     meetings) is not changed here.
--
-- Additive: no table, row, existing rule, existing function or grant is changed.
-- =============================================================================

CREATE FUNCTION public.auth_consultor_assigned_school_ids()
RETURNS SETOF integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ca.school_id
    FROM public.consultant_assignments ca
   WHERE auth.uid() IS NOT NULL
     AND ca.consultant_id = auth.uid()
     AND ca.school_id IS NOT NULL
     AND ca.is_active IS TRUE
     AND (ca.starts_at IS NULL OR ca.starts_at <= now())
     AND (ca.ends_at IS NULL OR ca.ends_at > now())
     AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role_type = 'consultor'::public.user_role_type
              AND ur.is_active IS TRUE);
$$;

COMMENT ON FUNCTION public.auth_consultor_assigned_school_ids() IS
  'F12e V5a (18 Nov 2026): the distinct school_id of the caller''s current consultant_assignments rows '
  '(school_id not null, is_active, started: starts_at null or not future, not ended: ends_at null or future), '
  'only while the caller holds an active consultor role; no rows otherwise. Answers only about the caller. '
  'Note: public.auth_is_assigned_consultor(integer) does not look at starts_at; this function does.';

REVOKE ALL ON FUNCTION public.auth_consultor_assigned_school_ids() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_consultor_assigned_school_ids() FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_consultor_assigned_school_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_consultor_assigned_school_ids() TO service_role;

CREATE POLICY "consultants_read_assigned_school_workspaces" ON public.community_workspaces FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.growth_communities gc
                  WHERE gc.id = community_workspaces.community_id
                    AND gc.school_id IN (SELECT public.auth_consultor_assigned_school_ids())));
