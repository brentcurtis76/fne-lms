-- =============================================================================
-- 20261118105000_feedback_replies.sql — GENERA fixes F15e (GES-2.18).
--
-- What an admin writes on a Soporte ticket is from now on either a reply (the
-- person who reported sees it) or an internal note (only admins see it).
-- A reply is a feedback_activity row with visible_to_reporter = true; every
-- other row, including every row written before this change, is hidden from
-- the reporter's ticket-wide read rule. The reporter keeps reading the rows
-- they wrote themselves through "feedback_activity_user_view_own" (unchanged).
--
-- Additive: one new column with a default (cannot fail on existing rows) and
-- one narrowed read rule. The other three rules of the table are not changed.
-- Test: supabase/tests/143-feedback-replies.sql.
-- =============================================================================

ALTER TABLE public.feedback_activity
  ADD COLUMN IF NOT EXISTS visible_to_reporter boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.feedback_activity.visible_to_reporter IS
  'True when an admin wrote this comment as a reply for the person who reported the ticket, who can then read it. False for internal notes (only admins read them), system lines and every comment written before replies existed.';

ALTER POLICY "Users can view activity for their feedback" ON public.feedback_activity
  USING (
    visible_to_reporter IS TRUE
    AND EXISTS (
      SELECT 1
      FROM public.platform_feedback pf
      WHERE pf.id = feedback_activity.feedback_id
        AND pf.created_by = auth.uid()
    )
  );
