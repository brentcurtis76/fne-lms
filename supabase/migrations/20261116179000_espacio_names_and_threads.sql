-- GENERA fixes F11 (16 Nov 2026), EC-S5: other people's names in Espacio Colaborativo.
--
-- The rules on public.profiles do not change: a person reads only their own
-- row, admins all. Names of other people reach the screens through this one
-- function, which returns a small card (id, first_name, last_name, avatar_url)
-- and nothing else, and only for people the caller may know:
--   * the caller themself, or any id when the caller is an admin;
--   * a person sharing an ACTIVE role in the same community or the same school;
--   * the foundation's staff (an active 'admin' or 'consultor' role);
--   * for a consultor caller: a person with an active role in a school the
--     consultor is assigned to (active consultant_assignments, as
--     lib/permissions/resultsSchoolScope.ts reads them, that have not ended:
--     ends_at null or in the future, the condition of the baseline helper
--     get_reportable_users_enhanced).
-- At most the first 200 ids of a call are looked at. An id the caller may not
-- know gives no row. Add-only: no rule, table or existing function changes.

CREATE FUNCTION public.get_profile_cards(p_ids uuid[])
RETURNS TABLE (id uuid, first_name text, last_name text, avatar_url text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  WITH caller AS (
    SELECT auth.uid() AS uid, public.auth_is_admin() AS is_admin
  ), wanted AS (
    SELECT DISTINCT w.pid FROM unnest((p_ids)[1:200]) AS w(pid) WHERE w.pid IS NOT NULL
  )
  SELECT p.id, p.first_name, p.last_name, p.avatar_url
    FROM wanted w
    JOIN public.profiles p ON p.id = w.pid
    CROSS JOIN caller c
   WHERE c.uid IS NOT NULL
     AND (
       p.id = c.uid
       OR c.is_admin
       OR EXISTS (
         SELECT 1 FROM public.user_roles mine JOIN public.user_roles theirs
             ON theirs.community_id = mine.community_id OR theirs.school_id = mine.school_id
          WHERE mine.user_id = c.uid AND mine.is_active = true
            AND theirs.user_id = p.id AND theirs.is_active = true)
       OR EXISTS (
         SELECT 1 FROM public.user_roles staff
          WHERE staff.user_id = p.id AND staff.is_active = true
            AND staff.role_type IN ('admin', 'consultor'))
       OR EXISTS (
         SELECT 1 FROM public.consultant_assignments ca JOIN public.user_roles theirs
             ON theirs.school_id = ca.school_id
          WHERE ca.consultant_id = c.uid AND ca.is_active = true
            -- Inside the assignment's dates, as the database's own consultor
            -- helper (get_reportable_users_enhanced) counts it: active and
            -- not ended; it does not look at starts_at (send-back 1, 4).
            AND (ca.ends_at IS NULL OR ca.ends_at > now())
            AND theirs.user_id = p.id AND theirs.is_active = true
            AND EXISTS (SELECT 1 FROM public.user_roles me
                         WHERE me.user_id = c.uid AND me.is_active = true AND me.role_type = 'consultor'))
     )
$$;

REVOKE ALL ON FUNCTION public.get_profile_cards(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_profile_cards(uuid[]) TO authenticated, service_role;
