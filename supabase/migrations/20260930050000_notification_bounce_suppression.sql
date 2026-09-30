-- N3-06: notification bounce suppression — which address an outbox row is sent
-- to, the suppression list, signature-verified bounce evidence, and the RPCs
-- that record, reconcile and read them (dormant).
--
-- Why: a bounced notification email must stop every later send to that
-- address, for every user who has it, frozen retries included. The webhook
-- hands over only the provider message id: the address suppressed is the one
-- the database recorded for the outbox row that carries that id, so an unknown
-- id can never suppress anything. The database never sees an address: the
-- worker hands over a keyed HMAC-SHA256 of the normalised address (64 lowercase
-- hex characters, server-only key). A bounce can arrive before the provider id
-- commits, so the evidence is kept and finish reconciles it.
--
-- Dormant: no application code calls these objects until N5-02
-- (NOTIFICATION_OUTBOX_DELIVERY). Service-role only. Additive only: three
-- tables, three functions, and finish_notification_email replaced in place.
-- public.notification_email_outbox itself is as N3-01 created it. Nothing
-- removes a suppression. Every clock is the database clock.

-- 1. The address (digest) an outbox row is sent to and the provider id it was
--    accepted under. A side table, like the source reference of N3-03. The
--    provider id is not unique: bookkeeping must never make finish fail.
CREATE TABLE public.notification_email_outbox_address (
  outbox_id uuid PRIMARY KEY REFERENCES public.notification_email_outbox(id) ON DELETE CASCADE,
  address_digest text NOT NULL,
  provider_message_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_outbox_address_digest_check CHECK (address_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notification_email_outbox_address_provider_id_check CHECK (char_length(provider_message_id) BETWEEN 1 AND 255)
);

CREATE INDEX notification_email_outbox_address_provider_id_idx
  ON public.notification_email_outbox_address (provider_message_id) WHERE provider_message_id IS NOT NULL;

-- 2. Suppressed addresses. No user id: suppression is per address, across users.
CREATE TABLE public.notification_email_suppressions (
  address_digest text PRIMARY KEY,
  reason text NOT NULL DEFAULT 'bounced',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notification_email_suppressions_digest_check CHECK (address_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT notification_email_suppressions_reason_check CHECK (reason = 'bounced')
);

-- 3. Bounce evidence, kept even when no row carries the provider id yet.
--    applied_at NULL = not matched yet.
CREATE TABLE public.notification_email_bounce_events (
  provider_message_id text PRIMARY KEY,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  applied_at timestamptz NULL,
  CONSTRAINT notification_email_bounce_events_provider_id_check CHECK (char_length(provider_message_id) BETWEEN 1 AND 256)
);

CREATE INDEX notification_email_bounce_events_seen_idx ON public.notification_email_bounce_events (first_seen_at);

-- 4. RLS on immediately, then the restrictive guard required on every
--    row-secured public table (pgTAP 053). No other policy: browser roles hold
--    no grant, and service_role bypasses RLS.
ALTER TABLE public.notification_email_outbox_address ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_email_bounce_events ENABLE ROW LEVEL SECURITY;
SELECT public.apply_forced_password_change_guard('public', 'notification_email_outbox_address');
SELECT public.apply_forced_password_change_guard('public', 'notification_email_suppressions');
SELECT public.apply_forced_password_change_guard('public', 'notification_email_bounce_events');

-- Privileges: service_role only.
REVOKE ALL ON TABLE public.notification_email_outbox_address, public.notification_email_suppressions,
  public.notification_email_bounce_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.notification_email_outbox_address, public.notification_email_suppressions,
  public.notification_email_bounce_events TO service_role;

COMMENT ON TABLE public.notification_email_outbox_address IS
  'One row per outbox row the worker has checked: the keyed digest of the address it is sent to (never the address) and, once sent, the provider message id. Final once the send snapshot is frozen. Deleted with its outbox row (FK cascade). Service-role only.';
COMMENT ON TABLE public.notification_email_suppressions IS
  'Address digests no notification email may be sent to, across users (reason: bounced). Written only from a bounce matched to an outbox row; nothing removes a row. No address, no user id. Service-role only.';
COMMENT ON TABLE public.notification_email_bounce_events IS
  'Signature-verified bounce evidence by provider message id; applied_at is NULL until an outbox row carries the id. No recipient, subject or body. Rows older than 90 days are deleted by record_notification_email_bounce. Service-role only.';

-- 5. Address check, before every attempt and before begin. Only the live
--    owner (the predicate of begin); the row lock keeps it the owner, and the
--    row unfrozen, until the digest is written. Nothing frozen: the digest
--    passed in is recorded, replacing one from an earlier attempt that froze
--    nothing (the address may have changed). Frozen: the recorded digest is
--    final and the argument is ignored.
CREATE FUNCTION public.check_notification_email_address(p_id uuid, p_owner text, p_address_digest text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_frozen boolean;
  v_digest text;
BEGIN
  -- Messages never echo ids, owners or digests.
  IF p_id IS NULL OR p_owner IS NULL
     OR (p_address_digest IS NOT NULL AND p_address_digest !~ '^[0-9a-f]{64}$') THEN
    RAISE EXCEPTION 'check_notification_email_address: invalid id, owner or address digest (64 lowercase hex characters)' USING ERRCODE = '22023';
  END IF;

  SELECT o.send_snapshot IS NOT NULL INTO v_frozen
    FROM public.notification_email_outbox o
   WHERE o.id = p_id AND o.status = 'sending' AND o.lease_owner = p_owner
     AND o.lease_expires_at > pg_catalog.now()
     FOR UPDATE OF o;
  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF v_frozen THEN
    SELECT a.address_digest INTO v_digest FROM public.notification_email_outbox_address a WHERE a.outbox_id = p_id;
  ELSIF p_address_digest IS NOT NULL THEN
    INSERT INTO public.notification_email_outbox_address (outbox_id, address_digest)
    VALUES (p_id, p_address_digest)
    ON CONFLICT (outbox_id) DO UPDATE SET address_digest = EXCLUDED.address_digest;
    v_digest := p_address_digest;
  END IF;

  IF v_digest IS NULL THEN
    RETURN 'unrecorded';
  END IF;
  RETURN CASE WHEN EXISTS (SELECT 1 FROM public.notification_email_suppressions s WHERE s.address_digest = v_digest)
              THEN 'suppressed' ELSE 'clear' END;
END;
$$;

COMMENT ON FUNCTION public.check_notification_email_address(uuid, text, text) IS
  'Live lease owner only, before every attempt: records the address digest of a claimed outbox row while nothing is frozen (replacing an earlier one), keeps the recorded digest once the send snapshot is frozen (the argument is then ignored), and answers suppressed, clear, or unrecorded (no digest). NULL and no write for a stale owner or an unknown row. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.check_notification_email_address(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_notification_email_address(uuid, text, text) TO service_role;

-- 6. Record a bounce. The evidence is stored first; the digests suppressed are
--    those recorded for the rows that carry the id, never an argument. The
--    advisory lock orders this call against the finish that stores the same id
--    (step 8). No exception handler: a failed write rolls the whole call back.
CREATE FUNCTION public.record_notification_email_bounce(p_provider_message_id text)
RETURNS text
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_matched integer;
  v_added integer;
BEGIN
  -- The message never echoes the provider id.
  IF p_provider_message_id IS NULL OR pg_catalog.char_length(p_provider_message_id) NOT BETWEEN 1 AND 256 THEN
    RAISE EXCEPTION 'record_notification_email_bounce: invalid provider message id (1..256 characters)' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('notification_email_bounce:' || p_provider_message_id, 0));

  INSERT INTO public.notification_email_bounce_events (provider_message_id) VALUES (p_provider_message_id)
  ON CONFLICT (provider_message_id) DO NOTHING;

  -- Digest order, so two calls that share digests cannot deadlock.
  WITH hit AS (
    SELECT DISTINCT a.address_digest FROM public.notification_email_outbox_address a
     WHERE a.provider_message_id = p_provider_message_id
  ), added AS (
    INSERT INTO public.notification_email_suppressions (address_digest)
    SELECT h.address_digest FROM hit h ORDER BY h.address_digest
    ON CONFLICT (address_digest) DO NOTHING
    RETURNING 1
  )
  SELECT (SELECT pg_catalog.count(*) FROM hit), (SELECT pg_catalog.count(*) FROM added) INTO v_matched, v_added;

  IF v_matched > 0 THEN
    -- Stamped once: a duplicate event rewrites nothing.
    UPDATE public.notification_email_bounce_events e SET applied_at = pg_catalog.now()
     WHERE e.provider_message_id = p_provider_message_id AND e.applied_at IS NULL;
  END IF;

  -- Bounded self-cleaning. 90 days is the outbox retention: no row can match
  -- older evidence.
  DELETE FROM public.notification_email_bounce_events e
   WHERE e.provider_message_id IN (
     SELECT x.provider_message_id FROM public.notification_email_bounce_events x
      WHERE x.first_seen_at < pg_catalog.now() - interval '90 days'
      ORDER BY x.first_seen_at, x.provider_message_id
      LIMIT 20
        FOR UPDATE OF x SKIP LOCKED);

  RETURN CASE WHEN v_matched = 0 THEN 'pending' WHEN v_added > 0 THEN 'suppressed' ELSE 'noop' END;
END;
$$;

COMMENT ON FUNCTION public.record_notification_email_bounce(text) IS
  'Stores signature-verified bounce evidence for a provider message id and suppresses the address digest recorded for every outbox row that carries it: suppressed (a suppression was added), noop (duplicate event, or already suppressed) or pending (no row carries the id yet; finish_notification_email reconciles it). Serialised per id by an advisory lock; deletes up to 20 evidence rows older than 90 days. Any failed write raises and rolls the call back. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.record_notification_email_bounce(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_notification_email_bounce(text) TO service_role;

-- 7. The private read contract for the in-app notice (N4-02).
CREATE FUNCTION public.notification_email_address_suppressed(p_address_digest text)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
BEGIN
  -- The message never echoes the digest.
  IF p_address_digest IS NULL OR p_address_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'notification_email_address_suppressed: invalid address digest (64 lowercase hex characters)' USING ERRCODE = '22023';
  END IF;

  RETURN EXISTS (SELECT 1 FROM public.notification_email_suppressions s WHERE s.address_digest = p_address_digest);
END;
$$;

COMMENT ON FUNCTION public.notification_email_address_suppressed(text) IS
  'Read-only: true when the address digest (64 lowercase hex characters) is suppressed. Dormant until N5-02; server-only (service_role).';

REVOKE ALL ON FUNCTION public.notification_email_address_suppressed(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.notification_email_address_suppressed(text) TO service_role;

-- 8. Finish, as in N3-03, plus the provider id bookkeeping on 'sent'. Replaced
--    in place: signature, owner and ACL stay; validation and the UPDATE are
--    unchanged. A bounce may have arrived before this call commits: the
--    advisory lock of step 6 makes whoever comes second see the other's commit
--    (READ COMMITTED: a new statement snapshot after the lock), so either the
--    webhook finds the id on the row or this call finds the unapplied evidence.
CREATE OR REPLACE FUNCTION public.finish_notification_email(
  p_id uuid, p_owner text, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer
)
RETURNS boolean
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  v_terminal boolean;
  v_done uuid;
  v_digest text;
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

  -- An empty id is no id: the address table refuses it, and finish must not fail.
  IF v_done IS NOT NULL AND p_outcome = 'sent' AND p_provider_message_id <> '' THEN
    UPDATE public.notification_email_outbox_address a SET provider_message_id = p_provider_message_id
     WHERE a.outbox_id = p_id
    RETURNING a.address_digest INTO v_digest;

    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('notification_email_bounce:' || p_provider_message_id, 0));

    -- Evidence that arrived first and matched nothing: apply it now.
    IF v_digest IS NOT NULL THEN
      UPDATE public.notification_email_bounce_events e SET applied_at = pg_catalog.now()
       WHERE e.provider_message_id = p_provider_message_id AND e.applied_at IS NULL;
      IF FOUND THEN
        INSERT INTO public.notification_email_suppressions (address_digest) VALUES (v_digest)
        ON CONFLICT (address_digest) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN v_done IS NOT NULL;
END;
$$;

COMMENT ON FUNCTION public.finish_notification_email(uuid, text, text, text, text, integer) IS
  'Live lease owner only: records the outcome of a claimed outbox row (sent, failed, cancelled, retry, digest) and releases the lease; false and no change otherwise. Terminal outcomes clear the send snapshot; retry keeps it. On sent with a provider message id, stores the id next to the row''s address digest and, under the bounce advisory lock, applies bounce evidence that arrived before this call (suppresses that digest). Dormant until N5-02; server-only (service_role).';
