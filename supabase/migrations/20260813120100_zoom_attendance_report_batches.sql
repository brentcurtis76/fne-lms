-- =============================================================================
-- zoom_internal.zoom_attendance_report_batches + atomic promotion (plan §15.3.9;
-- Z7-3).
--
-- ## What a batch is
--
-- One candidate fetch of `GET /report/meetings/{occurrence_uuid}/participants`.
-- §15.3.9: the report is authoritative WHOLESALE, per occurrence, and only a
-- COMPLETE batch may become authoritative — every page traversed with unchanged
-- parameters to an empty `next_page_token`, accumulated rows == `total_records`,
-- metadata consistent across pages. Anything less rejects the ENTIRE candidate.
--
-- ## Why authority is a DB-owned sequence and a status, not a client clock
--
-- `report_fetched_at` is retained for audit but never decides anything: two batches
-- can tie or arrive out of order on a client timestamp. `seq` is
-- database-assigned and monotonic; the effective set for an occurrence is the rows
-- of the HIGHEST-seq `complete` batch, else the webhook rows. A later partial
-- fetch therefore cannot displace an earlier complete one — it simply never
-- becomes `complete`.
--
-- ## Lifecycle
--
-- `pending` (created when a fetch starts; a crash leaves it here, visible)
--   → `complete` (promote_attendance_report_batch: rows + flip, ONE transaction)
--   → `rejected` (any page error, token rejection, count drift, invalid interval;
--      carries the reason for the §18 health panel).
-- Rows exist in `public.zoom_attendance` for a batch IF AND ONLY IF it is
-- `complete` — a rejected or pending batch is never partially visible.
-- =============================================================================

CREATE TABLE zoom_internal.zoom_attendance_report_batches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    school_id integer NOT NULL,
    surface_type text NOT NULL CHECK (surface_type IN ('consultor_session', 'community_meeting')),
    surface_id uuid NOT NULL,
    zoom_meeting_uuid text NOT NULL,
    -- The DB-owned monotonic promotion order. NEVER compared against a clock.
    seq bigint GENERATED ALWAYS AS IDENTITY,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'complete', 'rejected')),
    -- Metadata of the fetch, written at promotion (or partially at rejection, for
    -- the audit trail). page_size/page_count/total_records are Zoom's own values.
    page_size integer,
    page_count integer,
    total_records integer,
    row_count integer,
    rejection_reason text,
    -- Audit only. Authority is `seq` + `status`, never this value.
    report_fetched_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    -- A complete batch always knows its counts, and they agree.
    CONSTRAINT zoom_report_batches_complete_counts CHECK (
      status <> 'complete'
      OR (total_records IS NOT NULL AND row_count IS NOT NULL AND row_count = total_records)
    ),
    -- A rejected batch always says why.
    CONSTRAINT zoom_report_batches_rejected_reason CHECK (
      status <> 'rejected' OR rejection_reason IS NOT NULL
    )
);

CREATE INDEX zoom_report_batches_occurrence_idx
  ON zoom_internal.zoom_attendance_report_batches (zoom_meeting_uuid, status, seq DESC);

COMMENT ON TABLE zoom_internal.zoom_attendance_report_batches IS
  'One candidate fetch of the Zoom participant report per row (§15.3.9). The effective attendance set for an occurrence is the rows of the highest-seq COMPLETE batch, else the webhook rows. seq is database-assigned; report_fetched_at is audit only and never decides authority. Rejected/pending batches have no attendance rows — never partially visible.';

ALTER TABLE zoom_internal.zoom_attendance_report_batches ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- public.zoom_attendance.report_batch_id — which batch a report row belongs to.
--
-- Additive and nullable; every existing (webhook) row reads NULL. The paired CHECKs
-- make the §6 `source` column and the batch reference agree BY CONSTRUCTION:
--   · a report row always names its batch (effective-set selection filters on it);
--   · a webhook row never does;
--   · a report row is always a CLOSED interval — §6.2: report rows arrive with
--     join_time AND leave_time already paired by Zoom, and §15.3.9 rejects any
--     batch containing an invalid interval, so an open report row is a writer bug.
-- -----------------------------------------------------------------------------

ALTER TABLE public.zoom_attendance
  ADD COLUMN report_batch_id uuid REFERENCES zoom_internal.zoom_attendance_report_batches(id);

ALTER TABLE public.zoom_attendance
  ADD CONSTRAINT zoom_attendance_report_batch_source
  CHECK ((source = 'report') = (report_batch_id IS NOT NULL));

ALTER TABLE public.zoom_attendance
  ADD CONSTRAINT zoom_attendance_report_rows_closed
  CHECK (source <> 'report' OR left_at IS NOT NULL);

CREATE INDEX zoom_attendance_report_batch_idx
  ON public.zoom_attendance (report_batch_id)
  WHERE report_batch_id IS NOT NULL;

COMMENT ON COLUMN public.zoom_attendance.report_batch_id IS
  'The zoom_internal.zoom_attendance_report_batches row this report interval belongs to. NOT NULL exactly when source=report. Effective-set selection filters report rows by the highest-seq complete batch of the occurrence; superseded batches'' rows stay for audit.';

-- -----------------------------------------------------------------------------
-- zoom_internal.promote_attendance_report_batch — rows + completion, atomically.
--
-- §15.3.9: "Promotion is atomic: the last page's rows and the batch's flip to
-- complete commit in one transaction, so no reader ever sees a half-promoted batch
-- win." The job hands the WHOLE validated row set here; nothing is written
-- page-by-page, so a mid-fetch crash leaves only a pending batch row and zero
-- attendance rows.
--
-- Defense in depth: the function re-checks that the row count matches
-- p_total_records and that the batch is still pending (FOR UPDATE — a concurrent
-- duplicate job cannot double-promote). The table CHECKs enforce closed, ordered
-- intervals; any violation aborts the whole transaction and the batch stays
-- pending for the caller to mark rejected.
--
-- Webhook rows are NOT touched here — supersession is a read-time rule
-- (lib/zoom/attendance-effective.ts), and §15.3.9 forbids editing, closing or
-- deleting webhook rows during reconcile.
--
-- SECURITY INVOKER, service_role only, like the other zoom_internal appliers.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION zoom_internal.promote_attendance_report_batch(
  p_batch_id uuid,
  p_rows jsonb,
  p_page_size integer,
  p_page_count integer,
  p_total_records integer,
  p_report_fetched_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  v_batch zoom_internal.zoom_attendance_report_batches;
  v_inserted integer := 0;
BEGIN
  SELECT * INTO v_batch
    FROM zoom_internal.zoom_attendance_report_batches
   WHERE id = p_batch_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'batch_not_found';
  END IF;
  -- Only a pending batch can be promoted: a rejected one stays rejected, and a
  -- complete one cannot be promoted twice (the FOR UPDATE serialises racers).
  IF v_batch.status <> 'pending' THEN
    RETURN 'batch_not_pending';
  END IF;

  INSERT INTO public.zoom_attendance
    (surface_type, surface_id, school_id, zoom_meeting_uuid,
     participant_uuid, user_id, customer_key, display_name, transient_email,
     matched_by, joined_at, left_at, identity_tokens, source_event_key,
     source, report_batch_id)
  SELECT
    v_batch.surface_type, v_batch.surface_id, v_batch.school_id, v_batch.zoom_meeting_uuid,
    -- §6.2: report rows carry NO participant_uuid, so none is ever stored here.
    NULL,
    NULLIF(r.value->>'user_id', '')::uuid,
    NULLIF(r.value->>'customer_key', ''),
    NULLIF(r.value->>'display_name', ''),
    NULLIF(r.value->>'transient_email', ''),
    COALESCE(NULLIF(r.value->>'matched_by', ''), 'unmatched'),
    (r.value->>'joined_at')::timestamptz,
    (r.value->>'left_at')::timestamptz,
    CASE
      WHEN jsonb_typeof(r.value->'identity_tokens') = 'array'
       AND jsonb_array_length(r.value->'identity_tokens') > 0
      THEN ARRAY(SELECT jsonb_array_elements_text(r.value->'identity_tokens'))
      ELSE NULL
    END,
    NULL,
    'report',
    v_batch.id
  FROM jsonb_array_elements(COALESCE(p_rows, '[]'::jsonb)) AS r;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  -- The completeness contract, enforced where the flip happens: a row set that does
  -- not match Zoom's own total aborts EVERYTHING — rows and flip together.
  IF p_total_records IS NULL OR v_inserted <> p_total_records THEN
    RAISE EXCEPTION
      'promote_attendance_report_batch: % rows inserted but total_records is % — batch incomplete',
      v_inserted, p_total_records;
  END IF;

  UPDATE zoom_internal.zoom_attendance_report_batches
     SET status = 'complete',
         page_size = p_page_size,
         page_count = p_page_count,
         total_records = p_total_records,
         row_count = v_inserted,
         report_fetched_at = p_report_fetched_at,
         updated_at = now()
   WHERE id = p_batch_id;

  RETURN 'promoted';
END
$$;

COMMENT ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz) IS
  'Inserts a complete report batch''s attendance rows and flips the batch pending→complete in ONE transaction (§15.3.9). Re-validates row count against Zoom''s total_records inside the transaction; any mismatch or constraint violation aborts everything, leaving the batch pending and zero rows visible. Never touches webhook rows.';

REVOKE EXECUTE ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz)
  TO service_role;

-- Blanket re-run, as every zoom_internal migration does.
REVOKE ALL ON ALL TABLES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA zoom_internal FROM PUBLIC, anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA zoom_internal TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA zoom_internal TO service_role;
