-- =============================================================================
-- W-B3c-01 (SM-27): NOT NULL on meeting_tasks.due_date. Protocol class 3.
--
-- Forward-only schema guarantee. Owner decision: no backfill, no invented
-- deadline, no row is updated. due_date is already of type date, so the
-- migration needs no data transformation; SET NOT NULL only scans the table.
--
-- Fail closed: the table is locked ACCESS EXCLUSIVE (the lock SET NOT NULL
-- takes anyway) before counting, so no NULL row can appear between the check
-- and the ALTER. Any NULL due_date aborts the migration with SQLSTATE 23502
-- and the count; the rows go back to the owner for an explicit decision.
--
-- Release gate: a separately authorized read-only count of NULL due_date rows
-- on the actual target, run immediately before applying. Nonzero = stop.
-- =============================================================================

DO $$
DECLARE
  null_rows bigint;
BEGIN
  LOCK TABLE public.meeting_tasks IN ACCESS EXCLUSIVE MODE;
  SELECT count(*) INTO null_rows FROM public.meeting_tasks WHERE due_date IS NULL;
  IF null_rows > 0 THEN
    RAISE EXCEPTION 'W-B3c-01: % meeting_tasks row(s) have NULL due_date; no date was invented and NOT NULL was not applied. Return to the owner for a decision.', null_rows
      USING ERRCODE = 'not_null_violation',
            HINT = 'Resolve the count by an explicit owner decision before re-applying; this migration never backfills.';
  END IF;
  ALTER TABLE public.meeting_tasks ALTER COLUMN due_date SET NOT NULL;
END;
$$;
