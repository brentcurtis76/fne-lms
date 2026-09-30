-- N3-04: notification email failure semantics — recovery priority, the 24-hour
-- limit on ambiguous rows, their two terminal outcomes and retention (dormant).
--
-- Why: N3-03 moves a row through claim, begin and finish, but an answer from
-- the provider is not always definite. A row whose attempt may have reached the
-- provider ("ambiguous": it holds a frozen send snapshot) is retried with the
-- same bytes and idempotency key, but only for 24 hours after its first
-- attempt: from then on no attempt begins and the row ends as 'unknown'. When
-- the recipient stops being eligible in between, it ends as
-- 'cancelled_after_ambiguous'. Password-recovery mail goes first: while that
-- outbox has work due or in flight, the notification claim leases nothing.
-- Finished rows are deleted 90 days after they completed.
--
-- Dormant: no application code calls these objects until N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). Service-role only. Additive only: no table,
-- column, constraint or index changes, and finish_notification_email is as
-- N3-03 created it. Every clock is the database clock.

-- 1. Recovery priority. auth_security is closed to service_role, so this one is
--    SECURITY DEFINER like the recovery RPCs and reveals a single boolean.
--    "Due" and the clock are those of claim_password_recovery_outbox, except
--    that a live lease still counts: that mail is being sent right now.
CREATE FUNCTION public.password_recovery_email_due()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth_security.password_recovery_outbox o
     WHERE o.state IN ('queued', 'processing') AND o.available_at <= pg_catalog.clock_timestamp()
       AND o.provider_attempts < o.max_provider_attempts);
$$;

COMMENT ON FUNCTION public.password_recovery_email_due() IS
  'True while the password-recovery outbox has work that is due or in flight (queued or processing, available, attempts left; a live lease counts). Reveals only the boolean. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.password_recovery_email_due() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.password_recovery_email_due() TO service_role;

-- 2. Claim, as in N3-03, plus the recovery gate: after argument validation and
--    before any row is locked. Replaced in place: signature, owner and ACL stay.
CREATE OR REPLACE FUNCTION public.claim_notification_emails(p_owner text, p_limit integer, p_lease_seconds integer)
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

  -- Recovery mail goes first: no row, no lease.
  IF public.password_recovery_email_due() THEN
    RETURN;
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
  'Leases up to p_limit due immediate outbox rows to p_owner for p_lease_seconds (database clock, FOR UPDATE SKIP LOCKED) and returns them with their source reference. Returns no row and leases nothing while password-recovery mail is due. Expired leases are re-claimed; snapshot and attempt fields are untouched. Dormant until N5-02; server-only (service_role).';

-- 3. Begin, as in N3-03, plus the 24-hour limit: no attempt begins on an
--    ambiguous row whose first attempt is 24 hours old or older.
CREATE OR REPLACE FUNCTION public.begin_notification_email_attempt(p_id uuid, p_owner text, p_snapshot bytea)
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
     AND NOT COALESCE(o.send_snapshot IS NOT NULL
                      AND o.first_attempt_at <= pg_catalog.now() - interval '24 hours', false)
  RETURNING o.send_snapshot INTO v_stored;

  RETURN v_stored;
END;
$$;

COMMENT ON FUNCTION public.begin_notification_email_attempt(uuid, text, bytea) IS
  'Live lease owner only: freezes the encrypted send snapshot on the first attempt (never overwritten afterwards), counts the attempt and returns the stored snapshot. NULL and no change for a stale owner, an unknown row, no snapshot, or an ambiguous row whose first attempt is 24 hours old or older. Dormant until N5-02; server-only (service_role).';

-- 4. Retry state: what the live owner needs to decide between another attempt
--    and a terminal outcome. No row for a stale owner, an unknown id or a row
--    that is not 'sending'.
CREATE FUNCTION public.notification_email_retry_state(p_id uuid, p_owner text)
RETURNS TABLE (attempt_count integer, expired boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  IF p_id IS NULL OR p_owner IS NULL THEN
    RAISE EXCEPTION 'notification_email_retry_state: invalid id or owner' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT o.attempt_count,
         COALESCE(o.send_snapshot IS NOT NULL
                  AND o.first_attempt_at <= pg_catalog.now() - interval '24 hours', false)
    FROM public.notification_email_outbox o
   WHERE o.id = p_id AND o.status = 'sending' AND o.lease_owner = p_owner
     AND o.lease_expires_at > pg_catalog.now();
END;
$$;

COMMENT ON FUNCTION public.notification_email_retry_state(uuid, text) IS
  'Live lease owner only, read-only: the attempt count of a claimed outbox row and whether it is expired (frozen snapshot and first attempt 24 hours old or older, database clock). No row otherwise. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.notification_email_retry_state(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_email_retry_state(uuid, text) TO service_role;

-- 5. Settle an ambiguous row: the two terminal outcomes finish does not take.
--    Only the live owner, only a row with a frozen snapshot; 'unknown' only
--    once the row is expired. One UPDATE applies the outcome, clears the
--    snapshot (notification_email_outbox_snapshot_check) and releases the lease.
CREATE FUNCTION public.settle_ambiguous_notification_email(p_id uuid, p_owner text, p_outcome text, p_error_code text)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_done uuid;
BEGIN
  -- Messages never echo ids, owners or codes.
  IF p_outcome IS NULL OR p_outcome NOT IN ('cancelled_after_ambiguous', 'unknown') THEN
    RAISE EXCEPTION 'settle_ambiguous_notification_email: invalid outcome' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NULL OR p_error_code !~ '^[a-z0-9_:]{1,100}$' THEN
    RAISE EXCEPTION 'settle_ambiguous_notification_email: invalid error code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.notification_email_outbox o
     SET status = p_outcome, completed_at = pg_catalog.now(), last_error_code = p_error_code,
         send_snapshot = NULL, lease_owner = NULL, lease_expires_at = NULL
   WHERE o.id = p_id AND o.status = 'sending' AND o.lease_owner = p_owner
     AND o.lease_expires_at > pg_catalog.now()
     AND o.send_snapshot IS NOT NULL
     AND (p_outcome <> 'unknown'
          OR COALESCE(o.first_attempt_at <= pg_catalog.now() - interval '24 hours', false))
  RETURNING o.id INTO v_done;

  RETURN v_done IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.settle_ambiguous_notification_email(uuid, text, text, text) IS
  'Live lease owner only: ends a claimed outbox row that holds a frozen snapshot as cancelled_after_ambiguous, or as unknown once its first attempt is 24 hours old or older; clears the snapshot and the lease. False and no change otherwise. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.settle_ambiguous_notification_email(uuid, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_ambiguous_notification_email(uuid, text, text, text) TO service_role;

-- 6. Retention: delete up to p_limit terminal rows completed more than 90 days
--    ago, oldest created first; source rows go through the FK cascade. A row
--    completed that long ago was also created that long ago, which lets
--    notification_email_outbox_created_at_idx bound and order the scan.
CREATE FUNCTION public.purge_notification_email_outbox(p_limit integer)
RETURNS integer
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 5000 THEN
    RAISE EXCEPTION 'purge_notification_email_outbox: invalid limit (1..5000)' USING ERRCODE = '22023';
  END IF;

  WITH old AS (
    SELECT o.id FROM public.notification_email_outbox o
     WHERE o.status IN ('sent', 'failed', 'cancelled', 'cancelled_after_ambiguous', 'unknown')
       AND o.completed_at < pg_catalog.now() - interval '90 days'
       AND o.created_at < pg_catalog.now() - interval '90 days'
     ORDER BY o.created_at, o.id
     LIMIT p_limit
       FOR UPDATE OF o SKIP LOCKED
  ), gone AS (
    DELETE FROM public.notification_email_outbox o USING old WHERE o.id = old.id RETURNING o.id
  )
  SELECT pg_catalog.count(*)::integer INTO v_deleted FROM gone;

  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.purge_notification_email_outbox(integer) IS
  'Deletes up to p_limit (1..5000) terminal outbox rows completed more than 90 days ago, oldest created first, with their source rows (FK cascade), and returns the number deleted. Pending and sending rows are never deleted. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.purge_notification_email_outbox(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_notification_email_outbox(integer) TO service_role;
