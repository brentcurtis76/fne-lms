-- Add nullable JSONB columns for TipTap rich-text documents on meeting tables.
-- No backfill; existing plain-text columns remain authoritative until the
-- rich-text editor rollout is complete.

ALTER TABLE community_meetings
  ADD COLUMN IF NOT EXISTS summary_doc JSONB,
  ADD COLUMN IF NOT EXISTS notes_doc JSONB;

ALTER TABLE meeting_agreements
  ADD COLUMN IF NOT EXISTS agreement_doc JSONB;

ALTER TABLE meeting_commitments
  ADD COLUMN IF NOT EXISTS commitment_doc JSONB;

ALTER TABLE meeting_tasks
  ADD COLUMN IF NOT EXISTS task_description_doc JSONB;
