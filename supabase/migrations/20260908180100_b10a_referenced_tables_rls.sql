-- =============================================================================
-- 20260907120100_b10a_referenced_tables_rls.sql — W-B10a-01 (lote B10a)
--
-- Row security for exactly the six repository-REFERENCED legacy tables that
-- remained in the 001-rls-enabled.sql allowlist after W-B2b-01:
--   group_assignment_discussions, growth_community_transformation_access,
--   instructors, modules, propuesta_rate_limits, qa_tester_time_logs.
-- Unlike the fourteen B2b tables these have product-code consumers, so each
-- gets a policy designed from its verified consumers (listed per table
-- below; repository search at base 92df72a6) instead of a blanket lockdown.
-- None contains minor data.
--
-- Committed-baseline state for all six (00000000000000_baseline.sql): GRANT
-- ALL to anon / authenticated / service_role, row security OFF. `modules`
-- already carried three policies (modules_admin_all, modules_student_view,
-- modules_teacher_manage) that were inert because row security was off.
--
-- Uniform steps per table:
--   1. REVOKE ALL … FROM PUBLIC, anon (anon keeps nothing; no consumer uses
--      the anon client for any of these tables).
--   2. REVOKE TRUNCATE, REFERENCES, TRIGGER … FROM authenticated (TRUNCATE
--      is not subject to row security).
--   3. ALTER TABLE … ENABLE ROW LEVEL SECURITY.
--   4. The policies the consumers need — every predicate derived from
--      auth.uid() through the existing helpers (auth_is_admin,
--      is_admin_or_consultor, auth_is_learning_path_member, user_is_in_group)
--      or the W-B2c-01 helper auth_is_assigned_group_member.
--   5. SELECT public.apply_forced_password_change_guard('public', <table>)
--      — the repository-wide authentication boundary (053 invariant).
-- service_role is untouched (baseline GRANT ALL, bypasses row security).
-- Additive only: no DROP, no TRUNCATE, no destructive ALTER, row security
-- only ever switched ON.
--
-- pgTAP evidence: supabase/tests/071-b10a-referenced-tables-rls.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- group_assignment_discussions — maps (assignment, group) to a message thread.
-- Consumers (browser client, authenticated): lib/services/groupAssignments*.js
-- SELECT + INSERT for members opening a group discussion; the admin
-- assignment overview reads stats. No UPDATE / DELETE anywhere.
-- Visibility is delegated to the group row: the subquery runs as the caller,
-- so group_assignment_groups' own policies (admin, community member, school
-- member) decide, and this table never becomes a side channel around them.
-- INSERT additionally requires the mapping to be internally consistent: the
-- assignment_id is the group's own assignment, the workspace (when given) is
-- the workspace of the group's community, and the thread was created by the
-- caller in that same workspace (groupAssignments.getOrCreateDiscussion creates
-- the thread first, as the caller, then links it). A member can therefore not
-- attach a foreign assignment id, another community's workspace or someone
-- else's thread to their group. For a school-scoped group (community_id NULL)
-- there is no community workspace to compare with, so only the assignment and
-- thread relationships are enforced there.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.group_assignment_discussions FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.group_assignment_discussions FROM authenticated;
ALTER TABLE public.group_assignment_discussions ENABLE ROW LEVEL SECURITY;

CREATE POLICY group_assignment_discussions_admin_manage ON public.group_assignment_discussions
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY group_assignment_discussions_visible_group_read ON public.group_assignment_discussions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.group_assignment_groups g
       WHERE g.id = group_assignment_discussions.group_id
    )
  );

CREATE POLICY group_assignment_discussions_member_insert ON public.group_assignment_discussions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.user_is_in_group(group_id, auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.group_assignment_groups g
       WHERE g.id = group_assignment_discussions.group_id
         AND g.assignment_id = group_assignment_discussions.assignment_id
         AND (
           group_assignment_discussions.workspace_id IS NULL
           OR g.community_id IS NULL
           OR EXISTS (
             SELECT 1 FROM public.community_workspaces cw
              WHERE cw.id = group_assignment_discussions.workspace_id
                AND cw.community_id = g.community_id
           )
         )
    )
    AND EXISTS (
      SELECT 1 FROM public.message_threads mt
       WHERE mt.id = group_assignment_discussions.thread_id
         AND mt.created_by = auth.uid()
         AND mt.workspace_id IS NOT DISTINCT FROM group_assignment_discussions.workspace_id
    )
  );

SELECT public.apply_forced_password_change_guard('public', 'group_assignment_discussions');

-- -----------------------------------------------------------------------------
-- growth_community_transformation_access — which growth communities may run
-- the transformation assessment.
-- Consumers: lib/transformation/accessControl.ts through the caller's session
-- client — hasTransformationAccess (SELECT, any community member creating an
-- assessment; pages/api/transformation/assessments.ts), assign / revoke
-- (UPSERT / UPDATE, admin routes and the admin-only auto-assign),
-- getCommunitiesWithAccess (SELECT); pages/admin/transformation.tsx (SELECT,
-- admin page). Policies elsewhere consume has_transformation_access(), a
-- SECURITY DEFINER helper that is unaffected by this table's row security.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.growth_community_transformation_access FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.growth_community_transformation_access FROM authenticated;
ALTER TABLE public.growth_community_transformation_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY growth_community_transformation_access_admin_manage ON public.growth_community_transformation_access
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

-- Active membership of a growth community (user_roles.community_id is a
-- growth_communities.id — NOT a workspace id; the learning-path helper
-- auth_is_assigned_group_member takes a workspace and must not be used here).
CREATE OR REPLACE FUNCTION public.auth_is_community_member(p_community_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_community_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.user_roles ur
        WHERE ur.community_id = p_community_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = true
     );
$$;

COMMENT ON FUNCTION public.auth_is_community_member(uuid) IS
  'W-B10a-01 helper: TRUE when auth.uid() holds an active user_roles row for the given growth community. The actor is never a parameter.';

REVOKE ALL ON FUNCTION public.auth_is_community_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_community_member(uuid) TO authenticated, service_role;

-- Read: FNE staff roles (admin / consultor / equipo_directivo, the same set
-- the transformation_assessments policies use) and active members of the
-- community itself.
CREATE POLICY growth_community_transformation_access_staff_or_member_read ON public.growth_community_transformation_access
  FOR SELECT TO authenticated
  USING (
    public.is_admin_or_consultor(auth.uid())
    OR public.auth_is_community_member(growth_community_id)
  );

SELECT public.apply_forced_password_change_guard('public', 'growth_community_transformation_access');

-- -----------------------------------------------------------------------------
-- instructors — public-facing course catalog metadata (name, photo, bio,
-- specialty). Consumers: joined from courses / upcoming_courses by every
-- authenticated surface (coursesService, dashboard, admin course builder);
-- the public upcoming-courses listing reads through service_role. No product
-- code writes instructors through an application role.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.instructors FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.instructors FROM authenticated;
ALTER TABLE public.instructors ENABLE ROW LEVEL SECURITY;

CREATE POLICY instructors_admin_manage ON public.instructors
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY instructors_authenticated_read ON public.instructors
  FOR SELECT TO authenticated
  USING (true);

SELECT public.apply_forced_password_change_guard('public', 'instructors');

-- -----------------------------------------------------------------------------
-- modules — course structure. Row security was OFF while three policies
-- already existed; switching it on activates them:
--   modules_admin_all       (auth_is_admin)
--   modules_student_view    (auth_is_course_student: enrolled in the course)
--   modules_teacher_manage  (auth_is_course_teacher)
-- which is exactly the shape `lessons` already enforces. One policy is added
-- so a learning-path assignee sees the modules of a course they can already
-- see through courses_learning_path_member_view.
--
-- Consumption chain of an assigned course, by table and predicate:
--   courses  courses_learning_path_member_view  auth_is_learning_path_member(id)
--   modules  modules_learning_path_member_view  auth_is_learning_path_member(course_id)
--   lessons  lessons_learning_path_member_view  (added below) via the module's course
--   blocks   already readable by every authenticated user (pre-existing
--            permissive `Allow read blocks` / `blocks_select_policy`, out of
--            this unit's scope and left untouched)
--   own progress rows (lesson_progress, user_progress, quiz_submissions,
--            course_completions) are user_id = auth.uid() policies that do not
--            depend on enrolment.
-- Without the lessons policy an assignee without an independent
-- course_enrollments row (the enrolment batch_assign creates is a side effect,
-- not the authority) could open the module but none of its lessons.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.modules FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.modules FROM authenticated;
ALTER TABLE public.modules ENABLE ROW LEVEL SECURITY;

CREATE POLICY modules_learning_path_member_view ON public.modules
  FOR SELECT TO authenticated
  USING (public.auth_is_learning_path_member(course_id));

SELECT public.apply_forced_password_change_guard('public', 'modules');

-- lessons already has row security and the admin / enrolled-student / teacher
-- policies; this completes the assigned-content chain (additive SELECT only).
CREATE POLICY lessons_learning_path_member_view ON public.lessons
  FOR SELECT TO authenticated
  USING (
    public.auth_is_learning_path_member(
      (SELECT m.course_id FROM public.modules m WHERE m.id = lessons.module_id)
    )
  );

-- -----------------------------------------------------------------------------
-- propuesta_rate_limits — per-IP failed-attempt counter for the public
-- proposal access code. Its only consumers (lib/propuestas-web/
-- access-rate-limit.ts via pages/api/propuestas/web/[slug]/verify.ts and
-- lib/propuestas-web/download-access.ts) use the service-role client, so no
-- application role needs any privilege: same lockdown shape as W-B2b-01,
-- including its sequence.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.propuesta_rate_limits FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.propuesta_rate_limits_id_seq FROM PUBLIC, anon, authenticated;
ALTER TABLE public.propuesta_rate_limits ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'propuesta_rate_limits');

-- -----------------------------------------------------------------------------
-- qa_tester_time_logs — QA tester time reporting. Sole consumer:
-- pages/api/qa/time-tracking.ts, admin-only (checkIsAdmin) through the
-- caller's session client, SELECT only.
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.qa_tester_time_logs FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.qa_tester_time_logs FROM authenticated;
ALTER TABLE public.qa_tester_time_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY qa_tester_time_logs_admin_manage ON public.qa_tester_time_logs
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

SELECT public.apply_forced_password_change_guard('public', 'qa_tester_time_logs');
