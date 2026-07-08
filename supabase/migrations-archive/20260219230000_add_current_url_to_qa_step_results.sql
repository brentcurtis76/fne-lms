-- Migration: add_current_url_to_qa_step_results
-- Date: 2026-02-19
-- Purpose: Store the browser URL at the moment a QA test step is executed.
--          Used by the QA failure diagnostic system to show exactly which page
--          was open when a step failed or passed.
--
-- This is a purely additive change:
--   - Nullable TEXT column (no backfill required for existing rows)
--   - No index needed (current_url is diagnostic read-once data, never filtered)
--   - No RLS changes needed (qa_step_results already has RLS enabled)

ALTER TABLE qa_step_results
  ADD COLUMN IF NOT EXISTS current_url TEXT;

COMMENT ON COLUMN qa_step_results.current_url IS
  'Browser URL (window.location.href) captured at the time the step result was saved. Used for QA failure diagnostics.';
