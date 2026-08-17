-- =============================================================================
-- RPC-only attendance evidence writers (Z7 remediation R9).
--
-- The service role is an exposed Data API role, not a database owner. Every
-- legitimate mutation is therefore performed by a narrowly granted, owner-executed
-- function with an empty search_path. Direct table mutation is revoked only after
-- the complete join/leave/report lifecycle below is available.
-- =============================================================================

CREATE FUNCTION zoom_internal.create_attendance_report_batch(
  p_school_id integer,
  p_surface_type text,
  p_surface_id uuid,
  p_zoom_meeting_uuid text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_batch_id uuid;
BEGIN
  IF p_zoom_meeting_uuid IS NULL OR btrim(p_zoom_meeting_uuid) = '' THEN
    RAISE EXCEPTION 'attendance report batch requires an occurrence UUID'
      USING ERRCODE = 'P0400';
  END IF;

  -- A report candidate may name only the exact occurrence established for the
  -- exact surface and school. Unlike participant fallback, report reconciliation
  -- never claims a NULL occurrence: it runs only after the meeting ended.
  PERFORM 1
    FROM zoom_internal.zoom_meetings m
   WHERE m.school_id = p_school_id
     AND m.surface_type = p_surface_type
     AND m.surface_id = p_surface_id
     AND m.zoom_meeting_uuid = p_zoom_meeting_uuid
   FOR KEY SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'attendance report batch occurrence does not match its surface'
      USING ERRCODE = 'P0404';
  END IF;

  INSERT INTO zoom_internal.zoom_attendance_report_batches (
    school_id, surface_type, surface_id, zoom_meeting_uuid, status
  ) VALUES (
    p_school_id, p_surface_type, p_surface_id, p_zoom_meeting_uuid, 'pending'
  )
  RETURNING id INTO v_batch_id;

  RETURN v_batch_id;
END
$$;

COMMENT ON FUNCTION zoom_internal.create_attendance_report_batch(integer, text, uuid, text) IS
  'Owner-executed sole creator for report candidates. Validates the exact established meeting occurrence and always inserts pending; authority can be gained only through atomic promotion.';

-- Replace the identical signatures additively. Historical migration text remains
-- immutable; these active definitions add owner authority and retain all outcomes.
CREATE OR REPLACE FUNCTION zoom_internal.reject_attendance_report_batch(
  p_batch_id uuid,
  p_reason text
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
BEGIN
  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RAISE EXCEPTION 'attendance report batch rejection requires a reason'
      USING ERRCODE = 'P0400';
  END IF;

  UPDATE zoom_internal.zoom_attendance_report_batches
     SET status = 'rejected',
         rejection_reason = p_reason,
         updated_at = now()
   WHERE id = p_batch_id
     AND status = 'pending'
  RETURNING status INTO v_status;
  IF FOUND THEN
    RETURN 'rejected';
  END IF;

  SELECT status INTO v_status
    FROM zoom_internal.zoom_attendance_report_batches
   WHERE id = p_batch_id;
  IF NOT FOUND THEN
    RETURN 'batch_not_found';
  END IF;
  RETURN 'batch_not_pending';
END
$$;

CREATE OR REPLACE FUNCTION zoom_internal.promote_attendance_report_batch(
  p_batch_id uuid,
  p_rows jsonb,
  p_page_size integer,
  p_page_count integer,
  p_total_records integer,
  p_report_fetched_at timestamptz
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
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
  IF v_batch.status <> 'pending' THEN
    RETURN 'batch_not_pending';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION 'attendance report promotion rows must be a JSON array'
      USING ERRCODE = 'P0400';
  END IF;

  INSERT INTO public.zoom_attendance (
    surface_type, surface_id, school_id, zoom_meeting_uuid,
    participant_uuid, user_id, customer_key, display_name, transient_email,
    matched_by, joined_at, left_at, identity_tokens, source_event_key,
    source, report_batch_id
  )
  SELECT
    v_batch.surface_type, v_batch.surface_id, v_batch.school_id,
    v_batch.zoom_meeting_uuid, NULL,
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
    NULL, 'report', v_batch.id
  FROM jsonb_array_elements(p_rows) AS r;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

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

COMMENT ON FUNCTION zoom_internal.reject_attendance_report_batch(uuid, text) IS
  'Owner-executed conditional pending-to-rejected resolver. Direct batch updates are denied to exposed roles.';
COMMENT ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz) IS
  'Owner-executed sole authority path: inserts the exact validated report rows and completes their pending batch atomically.';

REVOKE EXECUTE ON FUNCTION zoom_internal.create_attendance_report_batch(integer, text, uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.create_attendance_report_batch(integer, text, uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION zoom_internal.reject_attendance_report_batch(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.reject_attendance_report_batch(uuid, text)
  TO service_role;

REVOKE EXECUTE ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION zoom_internal.promote_attendance_report_batch(
  uuid, jsonb, integer, integer, integer, timestamptz)
  TO service_role;

-- Legitimate owner-executed paths now exist for joins, leaves, report creation,
-- rejection, and promotion. Remove every direct table mutation capability from
-- every exposed role. SELECT remains available where it was already required.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE public.zoom_attendance
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE zoom_internal.zoom_attendance_observations
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, TRIGGER
  ON TABLE zoom_internal.zoom_attendance_report_batches
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.zoom_attendance TO service_role;
GRANT SELECT ON TABLE zoom_internal.zoom_attendance_observations TO service_role;
GRANT SELECT ON TABLE zoom_internal.zoom_attendance_report_batches TO service_role;

-- seq is minted only by the owner-executed creation function.
REVOKE ALL ON SEQUENCE zoom_internal.zoom_attendance_report_batches_seq_seq
  FROM PUBLIC, anon, authenticated, service_role;
