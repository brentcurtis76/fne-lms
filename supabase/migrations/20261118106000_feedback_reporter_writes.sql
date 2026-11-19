-- =============================================================================
-- 20261118106000_feedback_reporter_writes.sql — GENERA fixes F15e, build 4.
--
-- Soporte: what the person who reported a problem may WRITE.
--
-- B. A reporter creates their ticket and reads it; changing or deleting a
--    ticket is for admins. The server's own maintenance (service role) does not
--    go through these rules.
--
-- Additive only: two new RESTRICTIVE rules; no existing rule is changed.
-- (Item A of the build, a restrictive rule on feedback_activity, was stopped.)
-- Tested by supabase/tests/144-feedback-reporter-writes.sql.
-- =============================================================================

-- B. A reporter does not change or delete their ticket.
CREATE POLICY "platform_feedback_change_by_admins" ON public.platform_feedback
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY "platform_feedback_delete_by_admins" ON public.platform_feedback
  AS RESTRICTIVE FOR DELETE TO authenticated
  USING (public.auth_is_admin());
