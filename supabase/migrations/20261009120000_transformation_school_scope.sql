-- =============================================================================
-- 20261009120000_transformation_school_scope.sql — vías de transformación:
-- staff access is scoped to the school.
--
-- THE DEFECT
--   The row policies on transformation_assessments, its collaborators, its
--   conversation messages and its results granted global access through
--   is_admin_or_consultor(auth.uid()) or an inline "role_type IN ('admin',
--   'consultor')". is_admin_or_consultor also counts equipo_directivo. So any
--   active consultor, and any equipo directivo of ANY school, could read and
--   update every school's vías assessments (context_metadata responses,
--   conversation, results, collaborators) directly through PostgREST and
--   through the routes that rely on row security
--   (/api/transformation/assessments/[id], .../responses). The vías API
--   routes are scoped in the same change (lib/transformation/viasAssessmentAccess.ts).
--
-- WHAT THIS CHANGES
--   transformation_school_staff(p_uid, p_school_id) — actor-bound like the
--   other policy predicates (20260908180400): an active admin is staff for
--   every school (and for rows without a school); an active consultor only
--   for a school of their ACTIVE consultant_assignments. Nothing else.
--   Every policy below that granted global staff access now asks
--   transformation_school_staff(auth.uid(), <the row's school>) instead
--   (ALTER POLICY: same name, command and roles; only the expressions change).
--   Unchanged: school membership (user_school_ids), growth-community
--   membership, creator and collaborator rights, has_transformation_access,
--   service_role, the forced-password-change guard, and every other table's
--   use of is_admin_or_consultor.
--   Not changed here: transformation_access_audit_log.admins_read_audit_log
--   (global admin/consultor read of the access audit log; separate decision).
--
-- PRODUCTION (read-only, 2026-10-08): policies and helpers hash-identical to
-- a fresh local stack; 22 assessments, none without a school; no consultor
-- created or collaborates on an assessment outside their assignments.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.transformation_school_staff(p_uid uuid, p_school_id integer)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.auth_actor_bound(p_uid)
     AND (
       EXISTS (
         SELECT 1 FROM public.user_roles ur
          WHERE ur.user_id = p_uid
            AND COALESCE(ur.is_active, true)
            AND ur.role_type = 'admin'
       )
       OR (
         p_school_id IS NOT NULL
         AND EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = p_uid
              AND COALESCE(ur.is_active, true)
              AND ur.role_type = 'consultor'
         )
         AND EXISTS (
           SELECT 1 FROM public.consultant_assignments ca
            WHERE ca.consultant_id = p_uid
              AND ca.is_active = true
              AND ca.school_id = p_school_id
         )
       )
     );
$$;

COMMENT ON FUNCTION public.transformation_school_staff(uuid, integer) IS
  'Vías de transformación staff scope (20261009120000): admin = every school; consultor = schools of active consultant_assignments. Actor-bound.';

REVOKE ALL ON FUNCTION public.transformation_school_staff(uuid, integer) FROM PUBLIC;
-- Policy predicate: the public-targeted policies evaluate it for anon too
-- (it answers false for anon: auth_actor_bound).
GRANT EXECUTE ON FUNCTION public.transformation_school_staff(uuid, integer) TO anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- transformation_assessments
-- -----------------------------------------------------------------------------
ALTER POLICY "transformation_assessments_select" ON public.transformation_assessments
  USING (
    public.transformation_school_staff(auth.uid(), school_id)
    OR school_id = ANY (public.user_school_ids(auth.uid()))
    OR (school_id IS NULL AND growth_community_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = auth.uid() AND ur.is_active = true
             AND ur.community_id = transformation_assessments.growth_community_id))
    OR public.is_assessment_collaborator(id, auth.uid())
    OR created_by = auth.uid()
  );

ALTER POLICY "transformation_assessments_insert" ON public.transformation_assessments
  WITH CHECK (
    (school_id IS NOT NULL AND school_id = ANY (public.user_school_ids(auth.uid())))
    OR public.transformation_school_staff(auth.uid(), school_id)
  );

ALTER POLICY "transformation_assessments_update" ON public.transformation_assessments
  USING (
    public.transformation_school_staff(auth.uid(), school_id)
    OR public.is_assessment_collaborator(id, auth.uid())
    OR created_by = auth.uid()
  )
  WITH CHECK (
    school_id IS NULL
    OR school_id = ANY (public.user_school_ids(auth.uid()))
    OR public.transformation_school_staff(auth.uid(), school_id)
  );

ALTER POLICY "transformation_assessments_delete" ON public.transformation_assessments
  USING (public.transformation_school_staff(auth.uid(), school_id));

ALTER POLICY "members_read_transformation_assessments" ON public.transformation_assessments
  USING (
    public.transformation_school_staff(auth.uid(), school_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.is_active = true
         AND ur.community_id = transformation_assessments.growth_community_id)
  );

ALTER POLICY "members_update_transformation_assessments" ON public.transformation_assessments
  USING (
    public.transformation_school_staff(auth.uid(), school_id)
    OR EXISTS (
      SELECT 1 FROM public.user_roles ur
       WHERE ur.user_id = auth.uid() AND ur.is_active = true
         AND ur.community_id = transformation_assessments.growth_community_id)
  )
  WITH CHECK (
    public.has_transformation_access(growth_community_id)
    AND (
      public.transformation_school_staff(auth.uid(), school_id)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = auth.uid() AND ur.is_active = true
           AND ur.community_id = transformation_assessments.growth_community_id)
    )
  );

ALTER POLICY "members_insert_transformation_assessments" ON public.transformation_assessments
  WITH CHECK (
    public.has_transformation_access(growth_community_id)
    AND (
      public.transformation_school_staff(auth.uid(), school_id)
      OR EXISTS (
        SELECT 1 FROM public.user_roles ur
         WHERE ur.user_id = auth.uid() AND ur.is_active = true
           AND ur.community_id = transformation_assessments.growth_community_id)
    )
  );

-- -----------------------------------------------------------------------------
-- transformation_assessment_collaborators
-- -----------------------------------------------------------------------------
ALTER POLICY "collaborators_select" ON public.transformation_assessment_collaborators
  USING (EXISTS (
    SELECT 1 FROM public.transformation_assessments ta
     WHERE ta.id = transformation_assessment_collaborators.assessment_id
       AND (public.transformation_school_staff(auth.uid(), ta.school_id)
            OR ta.school_id = ANY (public.user_school_ids(auth.uid()))
            OR ta.created_by = auth.uid()
            OR public.is_assessment_collaborator(ta.id, auth.uid()))
  ));

ALTER POLICY "collaborators_insert" ON public.transformation_assessment_collaborators
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.transformation_assessments ta
     WHERE ta.id = transformation_assessment_collaborators.assessment_id
       AND (public.transformation_school_staff(auth.uid(), ta.school_id)
            OR ta.created_by = auth.uid()
            OR public.is_assessment_collaborator(ta.id, auth.uid()))
  ));

ALTER POLICY "collaborators_delete" ON public.transformation_assessment_collaborators
  USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.transformation_assessments ta
       WHERE ta.id = transformation_assessment_collaborators.assessment_id
         AND (ta.created_by = auth.uid()
              OR public.transformation_school_staff(auth.uid(), ta.school_id))
    )
  );

-- -----------------------------------------------------------------------------
-- transformation_conversation_messages / transformation_results (read)
-- -----------------------------------------------------------------------------
ALTER POLICY "members_read_transformation_conversation_messages" ON public.transformation_conversation_messages
  USING (
    EXISTS (
      SELECT 1 FROM public.transformation_assessments ta
        JOIN public.user_roles ur ON ur.community_id = ta.growth_community_id
       WHERE ta.id = transformation_conversation_messages.assessment_id
         AND ur.user_id = auth.uid() AND ur.is_active = true)
    OR EXISTS (
      SELECT 1 FROM public.transformation_assessments ta
       WHERE ta.id = transformation_conversation_messages.assessment_id
         AND public.transformation_school_staff(auth.uid(), ta.school_id))
  );

ALTER POLICY "members_read_transformation_results" ON public.transformation_results
  USING (
    EXISTS (
      SELECT 1 FROM public.transformation_assessments ta
        JOIN public.user_roles ur ON ur.community_id = ta.growth_community_id
       WHERE ta.id = transformation_results.assessment_id
         AND ur.user_id = auth.uid() AND ur.is_active = true)
    OR EXISTS (
      SELECT 1 FROM public.transformation_assessments ta
       WHERE ta.id = transformation_results.assessment_id
         AND public.transformation_school_staff(auth.uid(), ta.school_id))
  );
