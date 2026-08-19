-- =============================================================================
-- Durable self-service recovery: distributed throttling, encrypted outbox, and
-- bounded retry grants.
--
-- PRIVACY. The objects live in a non-exposed schema and store no direct user
-- identifier, e-mail address, recovery URL, password, or grant token:
--   * request/message bodies are AES-GCM ciphertext produced by the application;
--   * account and IP keys are one-way fingerprints;
--   * recovery grants are represented only by SHA-256 hashes.
-- The current LMS population is adult staff. No student/minor table or field is
-- introduced, so the Fase-2 consent-record/EIPD gate is not entered.
--
-- SECURITY. Browser roles have neither USAGE on auth_security nor EXECUTE on
-- any helper below. The public functions are an RPC transport for service_role;
-- all state transitions are decided while holding a row/advisory lock.
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS auth_security;

REVOKE ALL ON SCHEMA auth_security FROM PUBLIC;
REVOKE ALL ON SCHEMA auth_security FROM anon;
REVOKE ALL ON SCHEMA auth_security FROM authenticated;

CREATE TABLE IF NOT EXISTS auth_security.password_recovery_ip_buckets (
  scope text NOT NULL,
  subject_hash text NOT NULL,
  window_started_at timestamp with time zone NOT NULL,
  request_count integer NOT NULL DEFAULT 1 CHECK (request_count > 0),
  PRIMARY KEY (scope, subject_hash, window_started_at),
  CONSTRAINT password_recovery_ip_subject_hash_check
    CHECK (subject_hash ~ '^[0-9a-f]{64}$')
);

CREATE TABLE IF NOT EXISTS auth_security.password_recovery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_fingerprint text NOT NULL,
  request_envelope text NOT NULL,
  message_envelope text,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'queued' CHECK (state = ANY (ARRAY[
    'queued'::text,
    'processing'::text,
    'provider_accepted'::text,
    'provider_rejected'::text,
    'delivered'::text,
    'bounced'::text,
    'dead'::text
  ])),
  queued_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  available_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  provider_attempts integer NOT NULL DEFAULT 0 CHECK (provider_attempts >= 0),
  max_provider_attempts integer NOT NULL DEFAULT 8 CHECK (max_provider_attempts BETWEEN 1 AND 20),
  lease_token uuid,
  lease_expires_at timestamp with time zone,
  provider_message_id text,
  completed_at timestamp with time zone,
  CONSTRAINT password_recovery_account_fingerprint_check
    CHECK (account_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT password_recovery_request_envelope_size_check
    CHECK (length(request_envelope) BETWEEN 24 AND 16384),
  CONSTRAINT password_recovery_message_envelope_size_check
    CHECK (message_envelope IS NULL OR length(message_envelope) BETWEEN 24 AND 65536),
  CONSTRAINT password_recovery_lease_pair_check CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS password_recovery_outbox_account_cooldown_idx
  ON auth_security.password_recovery_outbox (account_fingerprint, queued_at DESC);

CREATE INDEX IF NOT EXISTS password_recovery_outbox_dispatch_idx
  ON auth_security.password_recovery_outbox (state, available_at, queued_at);

CREATE TABLE IF NOT EXISTS auth_security.recovery_attempt_grants (
  grant_hash text PRIMARY KEY,
  state text NOT NULL DEFAULT 'active' CHECK (state = ANY (ARRAY[
    'active'::text,
    'succeeded'::text,
    'expired'::text,
    'exhausted'::text
  ])),
  created_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  expires_at timestamp with time zone NOT NULL,
  attempts_used integer NOT NULL DEFAULT 0 CHECK (attempts_used >= 0),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  lease_token uuid,
  lease_expires_at timestamp with time zone,
  completed_at timestamp with time zone,
  CONSTRAINT recovery_attempt_grant_hash_check CHECK (grant_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT recovery_attempt_grant_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT recovery_attempt_grant_attempts_check CHECK (attempts_used <= max_attempts),
  CONSTRAINT recovery_attempt_grant_lease_pair_check CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

-- Atomic IP budget + per-account cooldown + durable enqueue. The caller receives
-- a coarse status for tests/operations, but the public endpoint deliberately
-- ignores it and always emits the same acknowledgement.
CREATE OR REPLACE FUNCTION public.enqueue_password_recovery(
  p_email text,
  p_ip_hash text,
  p_request_envelope text,
  p_cooldown_seconds integer DEFAULT 600,
  p_ip_limit integer DEFAULT 10,
  p_ip_window_seconds integer DEFAULT 60
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_ip_count integer;
  v_target_user_id uuid;
  v_account_fingerprint text;
  v_job_id uuid := gen_random_uuid();
BEGIN
  IF p_ip_hash IS NULL OR p_ip_hash !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'enqueue_password_recovery requires a SHA-256 IP fingerprint'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_request_envelope IS NULL OR length(p_request_envelope) NOT BETWEEN 24 AND 16384 THEN
    RAISE EXCEPTION 'enqueue_password_recovery requires a bounded encrypted envelope'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
  IF p_cooldown_seconds NOT BETWEEN 60 AND 86400
     OR p_ip_limit NOT BETWEEN 1 AND 100
     OR p_ip_window_seconds NOT BETWEEN 10 AND 3600 THEN
    RAISE EXCEPTION 'enqueue_password_recovery received an invalid limit'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  v_window_start := to_timestamp(
    floor(extract(epoch FROM v_now) / p_ip_window_seconds) * p_ip_window_seconds
  );

  INSERT INTO auth_security.password_recovery_ip_buckets
    (scope, subject_hash, window_started_at, request_count)
  VALUES ('password_recovery', p_ip_hash, v_window_start, 1)
  ON CONFLICT (scope, subject_hash, window_started_at)
  DO UPDATE SET request_count =
    auth_security.password_recovery_ip_buckets.request_count + 1
  RETURNING request_count INTO v_ip_count;

  -- Opportunistic bounded cleanup. It is independent of whether this request is
  -- known, so it does not create an account-existence branch before the budget.
  DELETE FROM auth_security.password_recovery_ip_buckets
   WHERE window_started_at < v_now - interval '1 day';

  IF v_ip_count > p_ip_limit THEN
    RETURN 'suppressed';
  END IF;

  SELECT p.id
    INTO v_target_user_id
    FROM public.profiles p
   WHERE lower(btrim(p.email)) = lower(btrim(COALESCE(p_email, '')))
   LIMIT 1;

  IF v_target_user_id IS NULL THEN
    -- Equal-cost one-way work on the unknown path; the HTTP layer additionally
    -- applies a fixed response floor because SQL timing can never be identical.
    PERFORM encode(extensions.digest(COALESCE(p_email, ''), 'sha256'), 'hex');
    RETURN 'suppressed';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('public.enqueue_password_recovery'),
    hashtext(v_target_user_id::text)
  );

  v_account_fingerprint := encode(
    extensions.digest(v_target_user_id::text, 'sha256'),
    'hex'
  );

  IF EXISTS (
    SELECT 1
      FROM auth_security.password_recovery_outbox o
     WHERE o.account_fingerprint = v_account_fingerprint
       AND o.queued_at >= v_now - make_interval(secs => p_cooldown_seconds)
  ) THEN
    RETURN 'suppressed';
  END IF;

  INSERT INTO auth_security.password_recovery_outbox
    (id, account_fingerprint, request_envelope, idempotency_key, queued_at, available_at)
  VALUES (
    v_job_id,
    v_account_fingerprint,
    p_request_envelope,
    'password-recovery/' || v_job_id::text,
    v_now,
    v_now
  );

  INSERT INTO public.security_audit_events
    (action, outcome, actor_user_id, target_user_id, metadata)
  VALUES (
    'password_recovery_requested',
    'queued',
    NULL,
    v_target_user_id,
    jsonb_build_object('delivery_state', 'queued')
  );

  RETURN 'queued';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_password_recovery_outbox(
  p_worker_token uuid,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 60
)
RETURNS TABLE (
  job_id uuid,
  request_envelope text,
  message_envelope text,
  idempotency_key text,
  provider_attempts integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
BEGIN
  IF p_worker_token IS NULL OR p_limit NOT BETWEEN 1 AND 50
     OR p_lease_seconds NOT BETWEEN 10 AND 300 THEN
    RAISE EXCEPTION 'claim_password_recovery_outbox received invalid arguments'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT o.id
      FROM auth_security.password_recovery_outbox o
     WHERE o.state IN ('queued', 'processing')
       AND o.available_at <= clock_timestamp()
       AND o.provider_attempts < o.max_provider_attempts
       AND (o.lease_expires_at IS NULL OR o.lease_expires_at <= clock_timestamp())
     ORDER BY o.available_at, o.queued_at
     FOR UPDATE SKIP LOCKED
     LIMIT p_limit
  ), claimed AS (
    UPDATE auth_security.password_recovery_outbox o
       SET state = 'processing',
           lease_token = p_worker_token,
           lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
      FROM candidates c
     WHERE o.id = c.id
     RETURNING o.id, o.request_envelope, o.message_envelope,
               o.idempotency_key, o.provider_attempts
  )
  SELECT c.id, c.request_envelope, c.message_envelope,
         c.idempotency_key, c.provider_attempts
    FROM claimed c;
END;
$$;

CREATE OR REPLACE FUNCTION public.prepare_password_recovery_outbox(
  p_job_id uuid,
  p_worker_token uuid,
  p_message_envelope text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE auth_security.password_recovery_outbox
     SET message_envelope = COALESCE(message_envelope, p_message_envelope)
   WHERE id = p_job_id
     AND state = 'processing'
     AND lease_token = p_worker_token
     AND lease_expires_at > clock_timestamp()
     AND p_message_envelope IS NOT NULL
     AND length(p_message_envelope) BETWEEN 24 AND 65536
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_password_recovery_outbox(
  p_job_id uuid,
  p_worker_token uuid,
  p_state text,
  p_provider_message_id text DEFAULT NULL,
  p_retry_delay_seconds integer DEFAULT 60
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_updated boolean;
BEGIN
  IF p_state NOT IN ('queued', 'provider_accepted', 'provider_rejected', 'dead')
     OR p_retry_delay_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'finish_password_recovery_outbox received an invalid state'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE auth_security.password_recovery_outbox
     SET state = CASE
           WHEN p_state = 'queued' AND provider_attempts + 1 >= max_provider_attempts
             THEN 'dead'
           ELSE p_state
         END,
         provider_attempts = provider_attempts + 1,
         provider_message_id = CASE
           WHEN p_state = 'provider_accepted' THEN left(p_provider_message_id, 256)
           ELSE provider_message_id
         END,
         available_at = CASE
           WHEN p_state = 'queued'
             THEN clock_timestamp() + make_interval(secs => p_retry_delay_seconds)
           ELSE available_at
         END,
         completed_at = CASE
           WHEN p_state = 'queued' AND provider_attempts + 1 >= max_provider_attempts
             THEN clock_timestamp()
           WHEN p_state IN ('provider_accepted', 'provider_rejected', 'dead')
             THEN clock_timestamp()
           ELSE NULL
         END,
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE id = p_job_id
     AND state = 'processing'
     AND lease_token = p_worker_token
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.create_recovery_attempt_grant(
  p_grant_hash text,
  p_expires_at timestamp with time zone,
  p_max_attempts integer DEFAULT 5
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
BEGIN
  IF p_grant_hash IS NULL OR p_grant_hash !~ '^[0-9a-f]{64}$'
     OR p_expires_at <= clock_timestamp()
     OR p_expires_at > clock_timestamp() + interval '1 hour'
     OR p_max_attempts NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'create_recovery_attempt_grant received invalid arguments'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO auth_security.recovery_attempt_grants
    (grant_hash, expires_at, max_attempts)
  VALUES (p_grant_hash, p_expires_at, p_max_attempts);
  RETURN true;
EXCEPTION WHEN unique_violation THEN
  RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_recovery_attempt_grant(
  p_grant_hash text,
  p_lease_token uuid,
  p_lease_seconds integer DEFAULT 45
)
RETURNS TABLE (status text, attempts_remaining integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_grant auth_security.recovery_attempt_grants%ROWTYPE;
BEGIN
  IF p_grant_hash IS NULL OR p_grant_hash !~ '^[0-9a-f]{64}$'
     OR p_lease_token IS NULL OR p_lease_seconds NOT BETWEEN 10 AND 120 THEN
    status := 'invalid'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_grant
    FROM auth_security.recovery_attempt_grants
   WHERE grant_hash = p_grant_hash
   FOR UPDATE;

  IF NOT FOUND THEN
    status := 'invalid'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_grant.state = 'succeeded' THEN
    status := 'succeeded'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_grant.expires_at <= clock_timestamp() OR v_grant.state = 'expired' THEN
    UPDATE auth_security.recovery_attempt_grants
       SET state = 'expired', lease_token = NULL, lease_expires_at = NULL
     WHERE grant_hash = p_grant_hash;
    status := 'expired'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_grant.attempts_used >= v_grant.max_attempts OR v_grant.state = 'exhausted' THEN
    UPDATE auth_security.recovery_attempt_grants
       SET state = 'exhausted', lease_token = NULL, lease_expires_at = NULL
     WHERE grant_hash = p_grant_hash;
    status := 'exhausted'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_grant.lease_expires_at IS NOT NULL
     AND v_grant.lease_expires_at > clock_timestamp() THEN
    status := 'busy';
    attempts_remaining := v_grant.max_attempts - v_grant.attempts_used;
    RETURN NEXT; RETURN;
  END IF;

  UPDATE auth_security.recovery_attempt_grants
     SET attempts_used = attempts_used + 1,
         lease_token = p_lease_token,
         lease_expires_at = clock_timestamp() + make_interval(secs => p_lease_seconds)
   WHERE grant_hash = p_grant_hash
  RETURNING max_attempts - attempts_used INTO attempts_remaining;

  status := 'claimed';
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_recovery_attempt_grant(
  p_grant_hash text,
  p_lease_token uuid,
  p_succeeded boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE auth_security.recovery_attempt_grants
     SET state = CASE
           WHEN p_succeeded THEN 'succeeded'
           WHEN attempts_used >= max_attempts THEN 'exhausted'
           ELSE 'active'
         END,
         completed_at = CASE WHEN p_succeeded THEN clock_timestamp() ELSE completed_at END,
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE grant_hash = p_grant_hash
     AND lease_token = p_lease_token
     AND state = 'active'
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_recovery_attempt_grant_succeeded(
  p_grant_hash text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_updated boolean;
BEGIN
  UPDATE auth_security.recovery_attempt_grants
     SET state = 'succeeded',
         completed_at = COALESCE(completed_at, clock_timestamp()),
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE grant_hash = p_grant_hash
     AND state <> 'succeeded'
  RETURNING true INTO v_updated;
  RETURN COALESCE(v_updated, false);
END;
$$;

-- Only a verified provider webhook calls this transition. The provider message
-- id locates the encrypted outbox row; the target id is reconstructed only for
-- the audit insert and is never added to the private queue schema. Duplicate
-- webhook deliveries are idempotent, bounced may follow delivered, and an
-- out-of-order delivered event can never overwrite a terminal bounce.
CREATE OR REPLACE FUNCTION public.record_password_recovery_delivery(
  p_provider_message_id text,
  p_outcome text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_job_id uuid;
  v_current_state text;
  v_target_user_id uuid;
  v_next_state text;
BEGIN
  IF p_provider_message_id IS NULL OR length(p_provider_message_id) NOT BETWEEN 1 AND 256
     OR p_outcome NOT IN ('delivered', 'bounced') THEN
    RAISE EXCEPTION 'record_password_recovery_delivery received invalid arguments'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT o.id, o.state, p.id
    INTO v_job_id, v_current_state, v_target_user_id
    FROM auth_security.password_recovery_outbox o
    LEFT JOIN public.profiles p
      ON encode(extensions.digest(p.id::text, 'sha256'), 'hex') = o.account_fingerprint
   WHERE o.provider_message_id = p_provider_message_id
   FOR UPDATE OF o;

  IF v_job_id IS NULL THEN
    RETURN false;
  END IF;

  v_next_state := CASE
    WHEN p_outcome = 'bounced' AND v_current_state IN ('provider_accepted', 'delivered')
      THEN 'bounced'
    WHEN p_outcome = 'delivered' AND v_current_state = 'provider_accepted'
      THEN 'delivered'
    ELSE NULL
  END;

  IF v_next_state IS NULL THEN
    RETURN true;
  END IF;

  UPDATE auth_security.password_recovery_outbox
     SET state = v_next_state,
         completed_at = clock_timestamp()
   WHERE id = v_job_id;

  IF v_target_user_id IS NOT NULL THEN
    INSERT INTO public.security_audit_events
      (action, outcome, actor_user_id, target_user_id, metadata)
    VALUES (
      'password_recovery_requested',
      v_next_state,
      NULL,
      v_target_user_id,
      jsonb_build_object('delivery_state', v_next_state)
    );
  END IF;

  RETURN true;
END;
$$;

COMMENT ON SCHEMA auth_security IS
  'Non-exposed authentication security state. Contains only encrypted recovery envelopes and one-way fingerprints/hashes; no direct user id, e-mail, recovery URL, password, or grant token.';

COMMENT ON TABLE auth_security.password_recovery_outbox IS
  'Durable recovery-email queue. Request and prepared-message payloads are AES-GCM ciphertext; account identity is a one-way fingerprint. A message is prepared and persisted before the first provider attempt so retries never mint a superseding recovery link.';

COMMENT ON TABLE auth_security.recovery_attempt_grants IS
  'Bounded retry ledger for recovery grants. Stores only SHA-256 hashes plus lifetime, attempt and lease state. User identity is carried only inside the authenticated encrypted grant held by the browser.';

DO $$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.enqueue_password_recovery(text,text,text,integer,integer,integer)'::regprocedure,
    'public.claim_password_recovery_outbox(uuid,integer,integer)'::regprocedure,
    'public.prepare_password_recovery_outbox(uuid,uuid,text)'::regprocedure,
    'public.finish_password_recovery_outbox(uuid,uuid,text,text,integer)'::regprocedure,
    'public.create_recovery_attempt_grant(text,timestamp with time zone,integer)'::regprocedure,
    'public.claim_recovery_attempt_grant(text,uuid,integer)'::regprocedure,
    'public.finish_recovery_attempt_grant(text,uuid,boolean)'::regprocedure,
    'public.mark_recovery_attempt_grant_succeeded(text)'::regprocedure,
    'public.record_password_recovery_delivery(text,text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$$;
