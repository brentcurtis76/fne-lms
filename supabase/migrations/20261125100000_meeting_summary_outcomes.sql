-- =============================================================================
-- 20261125100000_meeting_summary_outcomes.sql — GENERA fixes F25, build A,
-- item EC-R7b.
--
-- Owner decision (20 Nov 2026, answer 18): the band of a finalised meeting
-- names WHOM the summary e-mail was sent to, instead of just "sent".
--
-- A new table stores, once per meeting, whom the finalize route addressed and
-- whom the e-mail reached. Only the finalize route writes it (service key);
-- whoever can see the meeting reads it. Nothing already stored is changed.
-- Additive only.
-- =============================================================================

CREATE TABLE public.meeting_summary_outcomes (
  meeting_id  uuid PRIMARY KEY REFERENCES public.community_meetings(id) ON DELETE CASCADE,
  sent_to     uuid[] NOT NULL DEFAULT '{}',
  not_sent_to uuid[] NOT NULL DEFAULT '{}',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.meeting_summary_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.meeting_summary_outcomes FROM anon, authenticated;
GRANT SELECT ON TABLE public.meeting_summary_outcomes TO authenticated;
SELECT public.apply_forced_password_change_guard('public', 'meeting_summary_outcomes');
COMMENT ON TABLE public.meeting_summary_outcomes IS
  'EC-R7b: whom the summary e-mail of a finalised meeting reached (sent_to) and whom it did not (not_sent_to), as profile ids. Written once by the finalize route with the service key; readable by whoever can see the meeting.';

-- The subquery runs under the caller's community_meetings policies, so a row
-- is visible exactly when its meeting is.
CREATE POLICY "Meeting readers see whom the summary reached" ON public.meeting_summary_outcomes
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.community_meetings cm WHERE cm.id = meeting_summary_outcomes.meeting_id));
