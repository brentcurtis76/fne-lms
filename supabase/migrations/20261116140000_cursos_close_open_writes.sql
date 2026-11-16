-- =============================================================================
-- F4 — Cursos: close open writes on course content and classmates' data.
--
-- Closes:
--   CUR-S5  every learner given a course counted as its "course teacher"
--           (course_assignments.teacher_id holds the LEARNER); the helper
--           auth_is_course_teacher now answers true for admins only.
--   CUR-S1  any signed-in person could insert, update or delete any block;
--           the five unconditioned block write rules now require an admin.
--
-- Statements: one CREATE OR REPLACE FUNCTION (same signature, no grant change)
-- and five ALTER POLICY on public.blocks. Additive only; RLS stays enabled.
-- =============================================================================

-- CUR-S5
CREATE OR REPLACE FUNCTION public.auth_is_course_teacher(p_course_id uuid) RETURNS boolean
  LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
  AS $$
BEGIN
  -- No table records a real teacher of a course as a user: course_assignments.teacher_id is the
  -- LEARNER the course was given to. Until a real teacher exists, only admins pass.
  RETURN public.auth_is_admin();
END;
$$;

-- CUR-S1
ALTER POLICY "Allow insert if course exists" ON public.blocks WITH CHECK (public.auth_is_admin());
ALTER POLICY "Allow update if course exists" ON public.blocks
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
ALTER POLICY "blocks_delete_policy" ON public.blocks USING (public.auth_is_admin());
ALTER POLICY "blocks_insert_policy" ON public.blocks WITH CHECK (public.auth_is_admin());
ALTER POLICY "blocks_update_policy" ON public.blocks
  USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
