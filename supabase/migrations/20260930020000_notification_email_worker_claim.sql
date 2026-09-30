-- N3-03: notification email worker RPCs — claim, attempt freeze, finish (dormant).
--
-- Why: the outbox of N3-01 is durable but nothing drains it. A worker must take
-- due rows without two workers ever sending the same email, must send the same
-- bytes again after a crash or a retry, and a worker whose lease ran out must
-- not be able to change a row another worker now owns. These three functions
-- are the only way the worker moves a row: claim (lease, SKIP LOCKED), begin
-- (freeze the encrypted send snapshot once, count the attempt) and finish
-- (terminal outcome, retry, or hand-over to the digest), each guarded by the
-- live lease. The lease clock is always the database clock.
--
-- Dormant: no application code calls these objects until N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). Service-role only. Additive only.
-- N3-04 owns retry classification, backoff, the 'unknown' outcome and purge;
-- this migration only stores the outcome and delay the worker passes in.

-- 1. Typed source-record reference. A side table, so the outbox itself stays as
--    N3-01 created it. Worker metadata only: no free text, no PII.
CREATE TABLE public.notification_email_outbox_source (
  outbox_id uuid PRIMARY KEY REFERENCES public.notification_email_outbox(id) ON DELETE CASCADE,
  source_kind text NOT NULL,
  source_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_outbox_source_kind_check CHECK (source_kind IN (
    'session', 'licitacion', 'course', 'assignment', 'consultant_assignment', 'group', 'quiz_submission',
    'workspace')),
  -- A lowercase UUID or a positive integer of at most 16 digits.
  CONSTRAINT notification_email_outbox_source_id_check CHECK (
    source_id ~ '^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[1-9][0-9]{0,15})$')
);

-- 2. RLS on immediately, then the restrictive guard required on every
--    row-secured public table (pgTAP 053). No other policy: browser roles hold
--    no grant, and service_role bypasses RLS.
ALTER TABLE public.notification_email_outbox_source ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'notification_email_outbox_source');

-- 3. Privileges: service_role only.
REVOKE ALL ON TABLE public.notification_email_outbox_source FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_email_outbox_source TO service_role;

COMMENT ON TABLE public.notification_email_outbox_source IS
  'One row per outbox row that is tied to a source record (typed kind + id). N5-02''s enqueue writes it in the same transaction as the outbox row. No row = no reference: the worker fails closed for record-bound events. Service-role only.';

-- 4. Claim: lease up to p_limit due immediate rows to p_owner. Rows another
--    transaction is claiming are skipped, never waited on, so concurrent
--    workers get disjoint rows. A 'sending' row whose lease ran out is due again.
CREATE FUNCTION public.claim_notification_emails(p_owner text, p_limit integer, p_lease_seconds integer)
RETURNS TABLE (id uuid, idempotency_key text, event_type text, user_id uuid, related_url text,
               payload jsonb, has_snapshot boolean, source_kind text, source_id text)
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
#variable_conflict use_column
BEGIN
  IF p_owner IS NULL OR pg_catalog.btrim(p_owner) = '' OR pg_catalog.char_length(p_owner) > 200
     OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RAISE EXCEPTION 'claim_notification_emails: invalid owner, limit (1..100) or lease seconds (30..900)' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH due AS (
    SELECT o.id FROM public.notification_email_outbox o
     WHERE o.email_mode = 'immediate' AND o.next_attempt_at <= pg_catalog.now()
       AND (o.status = 'pending'
            OR (o.status = 'sending' AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= pg_catalog.now())))
     ORDER BY o.next_attempt_at, o.id
     LIMIT p_limit
       FOR UPDATE OF o SKIP LOCKED
  ), claimed AS (
    -- Only the lease changes: attempt_count, first_attempt_at and send_snapshot are kept.
    UPDATE public.notification_email_outbox o
       SET status = 'sending', lease_owner = p_owner,
           lease_expires_at = pg_catalog.now() + pg_catalog.make_interval(secs => p_lease_seconds)
      FROM due
     WHERE o.id = due.id
    RETURNING o.id, o.idempotency_key, o.event_type, o.user_id, o.related_url, o.payload,
              o.send_snapshot IS NOT NULL AS has_snapshot, o.next_attempt_at
  )
  SELECT c.id, c.idempotency_key, c.event_type, c.user_id, c.related_url, c.payload, c.has_snapshot,
         s.source_kind, s.source_id
    FROM claimed c
    LEFT JOIN public.notification_email_outbox_source s ON s.outbox_id = c.id
   ORDER BY c.next_attempt_at, c.id;
END;
$$;

COMMENT ON FUNCTION public.claim_notification_emails(text, integer, integer) IS
  'Leases up to p_limit due immediate outbox rows to p_owner for p_lease_seconds (database clock, FOR UPDATE SKIP LOCKED) and returns them with their source reference. Expired leases are re-claimed; snapshot and attempt fields are untouched. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.claim_notification_emails(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_notification_emails(text, integer, integer) TO service_role;

-- 5. Begin an attempt: only the live owner. The first snapshot stored is frozen;
--    a later call gets the stored bytes back, whatever it passes in. Returns
--    NULL and changes nothing for a stale owner, an unknown row, or when there
--    is no snapshot to freeze.
CREATE FUNCTION public.begin_notification_email_attempt(p_id uuid, p_owner text, p_snapshot bytea)
RETURNS bytea
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_stored bytea;
BEGIN
  -- Messages never echo ids, owners or snapshot bytes.
  IF p_id IS NULL OR p_owner IS NULL
     OR (p_snapshot IS NOT NULL AND pg_catalog.octet_length(p_snapshot) NOT BETWEEN 1 AND 262144) THEN
    RAISE EXCEPTION 'begin_notification_email_attempt: invalid id, owner or snapshot size (1..262144 bytes)' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_email_outbox o
     SET send_snapshot = COALESCE(o.send_snapshot, p_snapshot),
         first_attempt_at = COALESCE(o.first_attempt_at, pg_catalog.now()),
         last_attempt_at = pg_catalog.now(),
         attempt_count = o.attempt_count + 1
   WHERE o.id = p_id AND o.status = 'sending' AND o.lease_owner = p_owner
     AND o.lease_expires_at > pg_catalog.now()
     AND COALESCE(o.send_snapshot, p_snapshot) IS NOT NULL
  RETURNING o.send_snapshot INTO v_stored;

  RETURN v_stored;
END;
$$;

COMMENT ON FUNCTION public.begin_notification_email_attempt(uuid, text, bytea) IS
  'Live lease owner only: freezes the encrypted send snapshot on the first attempt (never overwritten afterwards), counts the attempt and returns the stored snapshot. NULL and no change for a stale owner, an unknown row or no snapshot. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.begin_notification_email_attempt(uuid, text, bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_notification_email_attempt(uuid, text, bytea) TO service_role;

-- 6. Finish: only the live owner. One UPDATE applies the outcome and releases
--    the lease; false (and no change) for a stale owner, an unknown row, 'sent'
--    without a begun attempt, or 'digest' after one. A terminal outcome clears
--    the snapshot (notification_email_outbox_snapshot_check); 'retry' keeps it
--    so the next claim resends the frozen bytes.
CREATE FUNCTION public.finish_notification_email(
  p_id uuid, p_owner text, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_terminal boolean;
  v_done uuid;
BEGIN
  -- Messages never echo ids, owners, codes or provider ids.
  IF p_outcome IS NULL OR p_outcome NOT IN ('sent', 'failed', 'cancelled', 'retry', 'digest') THEN
    RAISE EXCEPTION 'finish_notification_email: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF (p_error_code IS NOT NULL AND p_error_code !~ '^[a-z0-9_:]{1,100}$')
     OR (p_error_code IS NULL AND p_outcome IN ('failed', 'cancelled', 'retry'))
     OR pg_catalog.char_length(p_provider_message_id) > 255
     OR (p_outcome = 'retry' AND (p_retry_seconds IS NULL OR p_retry_seconds NOT BETWEEN 60 AND 86400)) THEN
    RAISE EXCEPTION 'finish_notification_email: invalid error code, provider message id or retry seconds (60..86400)' USING ERRCODE = '22023';
  END IF;
  v_terminal := p_outcome IN ('sent', 'failed', 'cancelled');

  UPDATE public.notification_email_outbox o
     SET status = CASE WHEN v_terminal THEN p_outcome ELSE 'pending' END,
         email_mode = CASE WHEN p_outcome = 'digest' THEN 'digest' ELSE o.email_mode END,
         last_error_code = CASE WHEN p_outcome IN ('sent', 'digest') THEN NULL ELSE p_error_code END,
         provider_message_id = CASE WHEN p_outcome = 'sent' THEN p_provider_message_id ELSE o.provider_message_id END,
         completed_at = CASE WHEN v_terminal THEN pg_catalog.now() ELSE o.completed_at END,
         next_attempt_at = CASE WHEN p_outcome = 'retry'
                                THEN pg_catalog.now() + pg_catalog.make_interval(secs => p_retry_seconds)
                                ELSE o.next_attempt_at END,
         send_snapshot = CASE WHEN v_terminal THEN NULL ELSE o.send_snapshot END,
         lease_owner = NULL, lease_expires_at = NULL
   WHERE o.id = p_id AND o.status = 'sending' AND o.lease_owner = p_owner
     AND o.lease_expires_at > pg_catalog.now()
     AND (p_outcome <> 'sent' OR o.send_snapshot IS NOT NULL)
     AND (p_outcome <> 'digest' OR o.send_snapshot IS NULL)
  RETURNING o.id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.finish_notification_email(uuid, text, text, text, text, integer) IS
  'Live lease owner only: records the outcome of a claimed outbox row (sent, failed, cancelled, retry, digest) and releases the lease; false and no change otherwise. Terminal outcomes clear the send snapshot; retry keeps it. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.finish_notification_email(uuid, text, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finish_notification_email(uuid, text, text, text, text, integer) TO service_role;
