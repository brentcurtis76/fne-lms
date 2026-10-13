-- N5-02a: source-aware notification enqueue RPC (dormant).
--
-- Why: the worker of N3-03 fails closed for a record-bound event whose outbox
-- row has no notification_email_outbox_source row, and the enqueue of N3-01
-- writes none. public.enqueue_notification_with_source checks the event and
-- its typed source record first, then reuses public.enqueue_notification and
-- writes the source row in the same transaction, so a committed outbox row of
-- a record-bound event never lacks its source and a stored source is never
-- replaced.
--
-- Supported events are exactly the RULES keys of lib/email/notification-access.ts
-- with the same kinds (message events: workspace, or group for an
-- assignment-group thread); any other event is rejected here (the old RPC
-- still accepts it). Source checks run before any write, so they also fail when the
-- preferences produce no outbox row.
--
-- Reused occurrences: the source insert is ON CONFLICT DO NOTHING on the
-- outbox id. When it inserts, the outbox row must have been written by this
-- very call: it must not have been visible before the call (an earlier write
-- in this transaction or a committed one) and its xmin must equal the new
-- source row's xmin (same transaction and subtransaction; a concurrent writer
-- of the same key that committed while this call waited has another xmin).
-- Otherwise the row is a pre-existing source-less row and the call fails. When
-- it does not insert, the stored source must be the same kind and id. Every
-- failure raises, so the whole call rolls back.
--
-- The stored source is checked independently of the current channel outcome:
-- when the preferences now give no outbox_id (email turned off after the
-- first enqueue), the occurrence's existing outbox row is looked up by its
-- key and checked the same way, so a different-source or source-less retry
-- raises and its bell write rolls back. A transaction-scoped advisory lock on
-- the occurrence serialises callers of this function, so a retry with email
-- off waits for an uncommitted same-key enqueue and then sees its row. The
-- old RPC takes no such lock: a source-less row it writes concurrently is
-- caught by the xmin guard when email is on, but not when email is off here
-- (that row stays source-less and the N3-03 worker fails closed on it).
--
-- Dormant: no application code calls it until stage c of N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). Service-role only. Additive only: the old
-- RPC, the source table, its RLS and grants, and the worker functions are as
-- they were.

CREATE FUNCTION public.enqueue_notification_with_source(
  p_event_type text, p_occurrence_id text, p_user_id uuid, p_category text,
  p_email_default text, p_mandatory boolean, p_title text, p_description text,
  p_related_url text, p_importance text, p_notification_type_id text, p_email_payload jsonb,
  p_source_kind text, p_source_id text
)
RETURNS TABLE (notification_id uuid, outbox_id uuid, idempotency_key text,
               in_app boolean, email_mode text, email_reason text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
DECLARE
  v_kind text; v_uuid uuid; v_found boolean; v_pre uuid[]; v_r record;
  v_src_xmin xid; v_row_xmin xid; v_kind_s text; v_id_s text; v_oid uuid;
BEGIN
  -- 1. Event -> expected source kind ('' = no source record). Messages never
  --    echo ids, titles or payload values.
  v_kind := CASE
    WHEN p_event_type IN ('course_assigned', 'course_completed', 'module_completed') THEN 'course'
    WHEN p_event_type IN ('assignment_created', 'assignment_feedback', 'assignment_due_soon') THEN 'assignment'
    WHEN p_event_type IN ('group_invitation', 'group_assignment_submitted') THEN 'group'
    WHEN p_event_type IN ('quiz_review_pending', 'quiz_reviewed') THEN 'quiz_submission'
    WHEN p_event_type IN ('message_sent', 'user_mentioned') THEN
      CASE WHEN p_source_kind = 'group' THEN 'group' ELSE 'workspace' END
    WHEN p_event_type IN ('session_created', 'session_rescheduled', 'session_cancelled', 'session_reminder_24h',
                          'session_reminder_1h', 'session_edit_request_submitted', 'session_edit_request_approved',
                          'session_edit_request_rejected') THEN 'session'
    WHEN p_event_type = 'consultant_assigned' THEN 'consultant_assignment'
    WHEN p_event_type IN ('licitacion_created', 'licitacion_published', 'licitacion_bases_deadline_1d',
                          'licitacion_bases_deadline', 'licitacion_consultas_deadline_1d', 'licitacion_consultas_deadline',
                          'licitacion_propuestas_open', 'licitacion_propuestas_deadline_1d', 'licitacion_propuestas_deadline',
                          'licitacion_evaluacion_start', 'licitacion_evaluacion_deadline_1d', 'licitacion_evaluacion_complete',
                          'licitacion_adjudicada', 'licitacion_contrato_generado') THEN 'licitacion'
    WHEN p_event_type IN ('qa_scenario_assigned', 'new_feedback', 'qa_test_failed', 'data_quality_alert',
                          'system_update') THEN ''
  END;
  IF v_kind IS NULL THEN
    RAISE EXCEPTION 'enqueue_notification_with_source: unsupported event' USING ERRCODE = '22023';
  END IF;

  -- 2. Source shape, format and existence, before any write.
  IF (v_kind = '' AND (p_source_kind IS NOT NULL OR p_source_id IS NOT NULL))
     OR (v_kind <> '' AND (p_source_kind IS NULL OR p_source_id IS NULL OR p_source_kind <> v_kind)) THEN
    RAISE EXCEPTION 'enqueue_notification_with_source: source shape does not match the event' USING ERRCODE = '22023';
  END IF;
  IF v_kind <> '' THEN
    IF p_source_id !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'enqueue_notification_with_source: malformed source id' USING ERRCODE = '22023';
    END IF;
    v_uuid := p_source_id::uuid;
    v_found := CASE v_kind
      WHEN 'session' THEN EXISTS (SELECT 1 FROM public.consultor_sessions t WHERE t.id = v_uuid)
      WHEN 'licitacion' THEN EXISTS (SELECT 1 FROM public.licitaciones t WHERE t.id = v_uuid)
      WHEN 'course' THEN EXISTS (SELECT 1 FROM public.courses t WHERE t.id = v_uuid)
      WHEN 'assignment' THEN EXISTS (SELECT 1 FROM public.lesson_assignments t WHERE t.id = v_uuid)
      WHEN 'consultant_assignment' THEN EXISTS (SELECT 1 FROM public.consultant_assignments t WHERE t.id = v_uuid)
      WHEN 'group' THEN EXISTS (SELECT 1 FROM public.group_assignment_groups t WHERE t.id = v_uuid)
      WHEN 'quiz_submission' THEN EXISTS (SELECT 1 FROM public.quiz_submissions t WHERE t.id = v_uuid)
      WHEN 'workspace' THEN EXISTS (SELECT 1 FROM public.community_workspaces t WHERE t.id = v_uuid)
    END;
    IF NOT v_found THEN
      RAISE EXCEPTION 'enqueue_notification_with_source: unknown source record' USING ERRCODE = '22023';
    END IF;
    -- One new-RPC caller per occurrence at a time (until transaction end); the
    -- statements below then see any such caller that committed first.
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(pg_catalog.format(
      'enqueue_notification_with_source|%s|%s|%s', p_event_type, p_occurrence_id, p_user_id), 0));
    -- Outbox rows of this occurrence already visible (the key is derived from
    -- exactly these three values).
    v_pre := ARRAY(SELECT o.id FROM public.notification_email_outbox o
                    WHERE o.user_id = p_user_id AND o.event_type = p_event_type AND o.occurrence_id = p_occurrence_id);
  END IF;

  -- 3. The channel decision and the bell/outbox writes are the old RPC's.
  SELECT * INTO v_r FROM public.enqueue_notification(
    p_event_type, p_occurrence_id, p_user_id, p_category, p_email_default, p_mandatory, p_title,
    p_description, p_related_url, p_importance, p_notification_type_id, p_email_payload);

  -- 4. Attach the source to the occurrence's outbox row, never replacing one;
  --    with no outbox_id (email now off) check the existing row, if any.
  IF v_kind <> '' THEN
    v_oid := COALESCE(v_r.outbox_id, (SELECT o.id FROM public.notification_email_outbox o
                                       WHERE o.idempotency_key = v_r.idempotency_key));
  END IF;
  IF v_oid IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox_source AS s (outbox_id, source_kind, source_id)
    VALUES (v_oid, v_kind, p_source_id)
    ON CONFLICT (outbox_id) DO NOTHING
    RETURNING s.xmin INTO v_src_xmin;
    IF v_src_xmin IS NOT NULL THEN
      SELECT o.xmin INTO v_row_xmin FROM public.notification_email_outbox o WHERE o.id = v_oid;
      IF v_oid = ANY (v_pre) OR v_row_xmin IS DISTINCT FROM v_src_xmin THEN
        RAISE EXCEPTION 'enqueue_notification_with_source: source conflicts with the stored outbox row' USING ERRCODE = '22023';
      END IF;
    ELSE
      SELECT s.source_kind, s.source_id INTO v_kind_s, v_id_s
        FROM public.notification_email_outbox_source s WHERE s.outbox_id = v_oid;
      IF v_kind_s IS DISTINCT FROM v_kind OR v_id_s IS DISTINCT FROM p_source_id THEN
        RAISE EXCEPTION 'enqueue_notification_with_source: source conflicts with the stored outbox row' USING ERRCODE = '22023';
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_r.notification_id, v_r.outbox_id, v_r.idempotency_key, v_r.in_app, v_r.email_mode, v_r.email_reason;
END;
$$;

COMMENT ON FUNCTION public.enqueue_notification_with_source(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb, text, text) IS
  'Validates the event (notification-access RULES) and its typed source record, then calls enqueue_notification and stores the outbox row''s source in the same transaction; a different stored source, or a pre-existing source-less outbox row, raises and rolls back, also when email is now off. Dormant until stage c of N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.enqueue_notification_with_source(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_notification_with_source(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb, text, text) TO service_role;
