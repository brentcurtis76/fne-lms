-- =============================================================================
-- F4c — Tareas: task and group-work records are written through the
-- application only; cross-school and cross-group reads closed.
--
-- Closes:
--   T-WRITES  learners and other signed-in people (and, for answer shares,
--             visitors) could write task feedback, task answers with any
--             grade, answer shares, task templates and instances, groups,
--             group work with any grade, group settings and course
--             completions directly, and could leave a group and join another
--             one directly. Every person's write goes through the
--             application's server routes, which write as the service role;
--             direct writes to these tables now require an admin.
--   T-WRITES-b  tasks (lesson_assignments): direct insert / update now admin only; creators keep deleting their own.
--   T-READS   every active consultor / admin / equipo_directivo /
--             lider_generacion read every lesson task answer and every answer
--             share of every school; any active role of a group's community
--             read every group's work record, grade and feedback; signed-in
--             people read four summary views that run with their owner's
--             rights (visitors lost them in 20261006180000).
--
-- Statements: CREATE POLICY ... AS RESTRICTIVE (insert / update / delete,
-- admin only) on eight tables, insert / update on lesson_assignments and an
-- insert one on course_completions; four
-- ALTER POLICY; one REVOKE on four views. Additive only; RLS stays enabled.
-- public.auth_is_admin() is executable by anon, authenticated and
-- service_role (baseline grants), so the new rules carry no role clause.
-- =============================================================================

-- T-WRITES 1: restrictive admin-only direct writes.
CREATE POLICY "assignment_feedback_direct_insert_admin_only" ON public.assignment_feedback
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_feedback_direct_update_admin_only" ON public.assignment_feedback
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_feedback_direct_delete_admin_only" ON public.assignment_feedback
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

CREATE POLICY "assignment_instances_direct_insert_admin_only" ON public.assignment_instances
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_instances_direct_update_admin_only" ON public.assignment_instances
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_instances_direct_delete_admin_only" ON public.assignment_instances
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

CREATE POLICY "assignment_templates_direct_insert_admin_only" ON public.assignment_templates
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_templates_direct_update_admin_only" ON public.assignment_templates
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_templates_direct_delete_admin_only" ON public.assignment_templates
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

CREATE POLICY "lesson_assignment_submissions_direct_insert_admin_only" ON public.lesson_assignment_submissions
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_assignment_submissions_direct_update_admin_only" ON public.lesson_assignment_submissions
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_assignment_submissions_direct_delete_admin_only" ON public.lesson_assignment_submissions
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

CREATE POLICY "assignment_submission_shares_direct_insert_admin_only" ON public.assignment_submission_shares
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_submission_shares_direct_update_admin_only" ON public.assignment_submission_shares
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "assignment_submission_shares_direct_delete_admin_only" ON public.assignment_submission_shares
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

-- group_assignment_groups: no delete rule here; the restrictive
-- "discussion_group_delete_boundary" (20261006220000) keeps governing deletes.
CREATE POLICY "group_assignment_groups_direct_insert_admin_only" ON public.group_assignment_groups
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "group_assignment_groups_direct_update_admin_only" ON public.group_assignment_groups
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());

CREATE POLICY "group_assignment_submissions_direct_insert_admin_only" ON public.group_assignment_submissions
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "group_assignment_submissions_direct_update_admin_only" ON public.group_assignment_submissions
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "group_assignment_submissions_direct_delete_admin_only" ON public.group_assignment_submissions
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

CREATE POLICY "group_assignment_settings_direct_insert_admin_only" ON public.group_assignment_settings
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "group_assignment_settings_direct_update_admin_only" ON public.group_assignment_settings
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
CREATE POLICY "group_assignment_settings_direct_delete_admin_only" ON public.group_assignment_settings
  AS RESTRICTIVE FOR DELETE USING (public.auth_is_admin());

-- T-WRITES 2: course completions are recorded by the server routes only.
CREATE POLICY "course_completions_direct_insert_admin_only" ON public.course_completions
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());

-- T-WRITES 3: joining a group directly is for admins only (the server routes
-- add members as the service role). Leaving (DELETE) is not touched; the
-- restrictive update rule there already says false.
ALTER POLICY "discussion_membership_insert_boundary" ON public.group_assignment_members
  WITH CHECK (public.auth_is_admin());

-- T-READS
ALTER POLICY "Teachers can view course submissions" ON public.lesson_assignment_submissions
  USING (public.auth_is_admin());
ALTER POLICY "Teachers can view shares" ON public.assignment_submission_shares
  USING (public.auth_is_admin());
-- First three branches exactly as in the baseline; the last branch ("any
-- active role in the group's community") becomes "a member of this group".
ALTER POLICY "Users can view submissions based on role" ON public.group_assignment_submissions
  USING (
    (EXISTS ( SELECT 1
       FROM public.user_roles ur
      WHERE ((ur.user_id = auth.uid()) AND (ur.role_type = 'admin'::public.user_role_type) AND (ur.is_active = true))))
    OR (user_id = auth.uid())
    OR (EXISTS ( SELECT 1
       FROM (public.group_assignment_groups gag
         JOIN public.user_roles consultant_role ON (((consultant_role.community_id = gag.community_id) AND (consultant_role.role_type = 'consultor'::public.user_role_type) AND (consultant_role.is_active = true))))
      WHERE ((gag.id = group_assignment_submissions.group_id) AND (consultant_role.user_id = auth.uid()))))
    OR public.user_is_in_group(group_id, auth.uid())
  );

REVOKE ALL ON public.group_assignments_with_status, public.quiz_statistics,
  public.school_progress_report, public.community_progress_report FROM authenticated;

-- T-WRITES-b: tasks are created and changed directly by admins only (no screen
-- does it with a non-admin session); deletes are not touched, the tasks page
-- (pages/assignments.tsx:125) lets creators delete their own.
CREATE POLICY "lesson_assignments_direct_insert_admin_only" ON public.lesson_assignments
  AS RESTRICTIVE FOR INSERT WITH CHECK (public.auth_is_admin());
CREATE POLICY "lesson_assignments_direct_update_admin_only" ON public.lesson_assignments
  AS RESTRICTIVE FOR UPDATE USING (public.auth_is_admin()) WITH CHECK (public.auth_is_admin());
