-- =============================================================================
-- 20261002200000_docente_course_select.sql — Procesos de Cambio, pilot
-- rehearsal finding (PROC-B010, 2026-10-02).
--
-- PROBLEM
--   school_course_structure_select admits assessment admins and the school's
--   directivos (consultores since 20261001190000), not docentes. The docente
--   assessment APIs embed the course through the user-scoped client, so a
--   docente's evaluation card shows no course and the evaluation page shows
--   "Sin curso asignado".
--
-- WHAT THIS ADDS (additive, read-only)
--   1. public.auth_docente_has_course(course uuid): true when the caller holds
--      an ACTIVE assignment on that course, or an assignee grant on any of the
--      course's assessment instances (live or archived — the docente's own
--      history keeps its course name). SECURITY DEFINER with an empty
--      search_path so the policy below never re-enters the RLS of the
--      assignment / instance / assignee tables.
--   2. Policy school_course_structure_docente_select: SELECT only, for
--      authenticated users, on exactly those courses. Insert / update / delete
--      policies are unchanged; no other course becomes visible.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auth_docente_has_course(p_course_structure_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
     AND (
       EXISTS (
         SELECT 1 FROM public.school_course_docente_assignments a
          WHERE a.course_structure_id = p_course_structure_id
            AND a.docente_id = auth.uid()
            AND a.is_active
       )
       OR EXISTS (
         SELECT 1
           FROM public.assessment_instances i
           JOIN public.assessment_instance_assignees x ON x.instance_id = i.id
          WHERE i.course_structure_id = p_course_structure_id
            AND x.user_id = auth.uid()
       )
     );
$$;

COMMENT ON FUNCTION public.auth_docente_has_course(uuid) IS
  'True when the caller has an active assignment on the course or an assignee grant on one of its assessment instances. Used by school_course_structure_docente_select (read-only).';

REVOKE ALL ON FUNCTION public.auth_docente_has_course(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_docente_has_course(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_docente_has_course(uuid) TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'public' AND tablename = 'school_course_structure'
       AND policyname = 'school_course_structure_docente_select'
  ) THEN
    CREATE POLICY school_course_structure_docente_select
      ON public.school_course_structure
      AS PERMISSIVE
      FOR SELECT
      TO authenticated
      USING (public.auth_docente_has_course(id));
  END IF;
END;
$$;
