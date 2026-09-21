-- =============================================================================
-- 20260921003500_b10a_transformation_access_school_scope.sql — W-B10a-02
--
-- Closes SM10-R0-B1. W-B10a-01 gave
-- public.growth_community_transformation_access this read policy:
--
--   growth_community_transformation_access_staff_or_member_read (PERMISSIVE, SELECT)
--     USING (is_admin_or_consultor(auth.uid()) OR auth_is_community_member(growth_community_id))
--
-- public.is_admin_or_consultor deliberately answers TRUE for `equipo_directivo`
-- (20260908180400_c1_function_exposure.sql:286) and takes no row as input, so a
-- school leader of school A could read the transformation-access rows of every
-- community in every other school. `equipo_directivo` is a SCHOOL-level role —
-- the same tenancy boundary transformation_assessments already draws with
-- `school_id = ANY (user_school_ids(auth.uid()))`.
--
-- ADDITIVE ONLY. The W-B10a-01 policy is left exactly as it is: tightening a
-- permissive policy by rewriting it would mean DROP or ALTER, both forbidden.
-- Instead this adds one RESTRICTIVE SELECT policy, which PostgreSQL ANDs with
-- the permissive set, so the effective read predicate becomes
--
--   ( is_admin_or_consultor(uid) OR auth_is_community_member(gc) )   -- unchanged
--   AND ( NOT equipo_directivo-only                                  -- new
--         OR auth_is_community_member(gc)
--         OR community is in one of the actor's schools )
--
-- Effect, by actor:
--   admin, consultor            unchanged (first clause of the new predicate is
--                               TRUE for them — see auth_is_equipo_directivo_only)
--   equipo_directivo            same-school communities only (was: all), with a
--                               NULL user_roles.is_active read as active on both
--                               sides of the boundary (SM12-R0-B1)
--   active community member     unchanged, own community only
--   inactive role, outsider     unchanged, nothing
--   anon / PUBLIC               unchanged, no privilege at all (W-B10a-01 REVOKEs)
--   service_role                unchanged, bypasses row security
--   INSERT / UPDATE / DELETE    unchanged — this policy is FOR SELECT, and only
--                               ..._admin_manage ever granted a write
--
-- No DROP, no TRUNCATE, no destructive ALTER, no row-security disable, no change
-- to is_admin_or_consultor / auth_is_community_member / user_school_ids: the
-- helpers below are new and used by this policy alone, so nothing else in the
-- repository shifts semantics.
--
-- pgTAP evidence: supabase/tests/071-b10a-referenced-tables-rls.sql.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- Who is school-scoped for this boundary: an actor holding an active
-- `equipo_directivo` role and NOT also an active `admin` or `consultor` role.
-- The second condition is what keeps FNE-global staff out of the restriction —
-- a user carrying both roles is treated as the wider one, exactly as
-- is_admin_or_consultor already does. `COALESCE(is_active, true)` mirrors
-- is_admin_or_consultor so the two never disagree about the same row.
-- SECURITY DEFINER because public.user_roles is itself row-secured; the actor
-- is auth.uid() and is never a parameter.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_equipo_directivo_only()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND COALESCE(ur.is_active, true)
          AND ur.role_type = 'equipo_directivo'
     )
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles ur
        WHERE ur.user_id = auth.uid()
          AND COALESCE(ur.is_active, true)
          AND ur.role_type IN ('admin', 'consultor')
     );
$$;

COMMENT ON FUNCTION public.auth_is_equipo_directivo_only() IS
  'W-B10a-02 helper: TRUE when auth.uid() holds an active equipo_directivo role and no active admin or consultor role. The actor is never a parameter.';

REVOKE ALL ON FUNCTION public.auth_is_equipo_directivo_only() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_equipo_directivo_only() TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Does a growth community belong to one of the actor's schools?
-- growth_communities.school_id is an integer and user_school_ids returns
-- integer[], the same pairing transformation_assessments_select uses. A
-- community whose school_id IS NULL belongs to no school and therefore matches
-- nobody's school — it stays reachable through membership, not through a
-- school leader's role.
--
-- SM12-R0-B1: user_roles.is_active is NULLABLE, and the two sides disagreed
-- about NULL. is_admin_or_consultor and auth_is_equipo_directivo_only above
-- both read it as COALESCE(is_active, true), so a leader whose role row has
-- is_active NULL is classified school-scoped — but user_school_ids accepts only
-- is_active = true, so that leader's own school never matched and the
-- restrictive policy hid even their OWN school's row. The second branch below
-- closes exactly that gap: it adds the schools of the actor's NULL-active
-- `equipo_directivo` role rows, which is what COALESCE(is_active, true) means
-- for the very rows that make the actor school-scoped. It deliberately does NOT
-- widen any other role: a NULL-active docente, consultor or admin role still
-- contributes no school here, because user_school_ids is left untouched.
--
-- SECURITY DEFINER so the answer does not depend on whether the caller can read
-- growth_communities through its own policies.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_community_in_actor_schools(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_community_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.growth_communities gc
        WHERE gc.id = p_community_id
          AND gc.school_id IS NOT NULL
          AND (
            gc.school_id = ANY (public.user_school_ids(auth.uid()))
            OR EXISTS (
              SELECT 1 FROM public.user_roles ur
               WHERE ur.user_id = auth.uid()
                 AND ur.school_id = gc.school_id
                 AND ur.is_active IS NULL
                 AND ur.role_type = 'equipo_directivo'
            )
          )
     );
$$;

COMMENT ON FUNCTION public.auth_community_in_actor_schools(uuid) IS
  'W-B10a-02 helper: TRUE when the given growth community carries a school_id that is among auth.uid()''s active roles'' schools, reading is_active as COALESCE(is_active, true) for equipo_directivo role rows so the answer agrees with auth_is_equipo_directivo_only. The actor is never a parameter.';

REVOKE ALL ON FUNCTION public.auth_community_in_actor_schools(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_community_in_actor_schools(uuid) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- The boundary itself. RESTRICTIVE, so it is ANDed with every permissive SELECT
-- policy on the table (present and future) instead of widening anything.
-- The membership branch is repeated here on purpose: without it a school leader
-- who is also an active member of a community in ANOTHER school would lose the
-- read their membership grants, which is not what this unit is fixing.
-- ----------------------------------------------------------------------------
CREATE POLICY growth_community_transformation_access_school_scope
  ON public.growth_community_transformation_access
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    NOT public.auth_is_equipo_directivo_only()
    OR public.auth_is_community_member(growth_community_id)
    OR public.auth_community_in_actor_schools(growth_community_id)
  );
