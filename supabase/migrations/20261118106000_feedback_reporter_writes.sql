-- =============================================================================
-- 20261118106000_feedback_reporter_writes.sql — GENERA fixes F15e, build 4.
--
-- Soporte: what the person who reported a problem may WRITE.
--
-- Additive only: three new RESTRICTIVE rules for signed-in people; no existing
-- rule is changed.
--
-- A. feedback_activity_system_lines_by_admins (feedback_activity, INSERT):
--    only an admin writes a SYSTEM line (is_system_message true); everybody
--    else's rows are ordinary comments. The system's own state-change line is
--    written by add_feedback_activity, SECURITY DEFINER owned by postgres, which
--    bypasses row level security (the table is not under FORCE), so it is still
--    written whoever changes the state.
-- B. platform_feedback_change_by_admins (platform_feedback, UPDATE) and
--    platform_feedback_delete_by_admins (platform_feedback, DELETE): a reporter
--    creates their ticket and reads it; changing or deleting a ticket is for
--    admins. The server's own maintenance (service role) does not go through
--    these rules.
--
-- Tested by supabase/tests/144-feedback-reporter-writes.sql.
-- =============================================================================

-- A. Only an admin, or the system itself, writes a system line on a ticket.
CREATE POLICY "feedback_activity_system_lines_by_admins" ON public.feedback_activity AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK (is_system_message IS NOT TRUE OR public.auth_is_admin());

-- B. A reporter does not change or delete their ticket.
CREATE POLICY "platform_feedback_change_by_admins" ON public.platform_feedback
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "platform_feedback_delete_by_admins" ON public.platform_feedback
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.auth_is_admin());
