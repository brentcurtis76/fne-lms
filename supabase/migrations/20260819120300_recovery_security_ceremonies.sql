-- =============================================================================
-- Durable self-service recovery: distributed throttling, encrypted outbox,
-- bounded retry grants, durable delivery evidence, and bounded retention.
--
-- PRIVACY. The objects live in a non-exposed schema and store no direct user
-- identifier, e-mail address, recovery URL, password, or grant token:
--   * request/message bodies are AES-GCM ciphertext produced by the application,
--     and they are scrubbed the moment no retry can need them again;
--   * candidate identity is a KEYED one-way fingerprint of the normalized
--     address; account identity is a one-way fingerprint set only after the
--     asynchronous worker resolves a real account;
--   * recovery grants are represented only by SHA-256 hashes;
--   * delivery evidence keeps only the provider's message id and the outcome.
-- The current LMS population is adult staff. No student/minor table or field is
-- introduced, so the Fase-2 consent-record/EIPD gate is not entered.
--
-- ANTI-ENUMERATION (fourth-pass finding 1). The public enqueue performs
-- STRUCTURALLY IDENTICAL work for every candidate address: IP budget, advisory
-- lock on the candidate fingerprint, candidate cooldown, and encrypted enqueue.
-- It never reads public.profiles, never takes an account-specific lock, and
-- never writes an account-targeted audit row. Account existence is resolved
-- asynchronously by the worker (resolve_password_recovery_outbox), which is the
-- single canonical, case-insensitive resolution path; unknown candidates are
-- discarded there without sending mail, and targeted audit rows exist only
-- after a real account has been resolved.
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

-- Retention prunes by window age; the primary key alone would force a full scan.
CREATE INDEX IF NOT EXISTS password_recovery_ip_buckets_window_idx
  ON auth_security.password_recovery_ip_buckets (window_started_at);

CREATE TABLE IF NOT EXISTS auth_security.password_recovery_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Keyed HMAC fingerprint of the normalized candidate ADDRESS, written for
  -- every request whether or not an account exists. Cooldowns key on it.
  candidate_fingerprint text NOT NULL,
  -- One-way fingerprint of the RESOLVED account id. NULL until the worker
  -- resolves the candidate; never written on the public request path.
  account_fingerprint text,
  request_envelope text,
  message_envelope text,
  idempotency_key text NOT NULL UNIQUE,
  state text NOT NULL DEFAULT 'queued' CHECK (state = ANY (ARRAY[
    'queued'::text,
    'processing'::text,
    'discarded'::text,
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
  scrubbed_at timestamp with time zone,
  CONSTRAINT password_recovery_candidate_fingerprint_check
    CHECK (candidate_fingerprint ~ '^[0-9a-f]{64}$'),
  CONSTRAINT password_recovery_account_fingerprint_check
    CHECK (account_fingerprint IS NULL OR account_fingerprint ~ '^[0-9a-f]{64}$'),
  -- Nullable so terminal rows can be scrubbed; the enqueue function refuses to
  -- insert a row without one.
  CONSTRAINT password_recovery_request_envelope_size_check
    CHECK (request_envelope IS NULL OR length(request_envelope) BETWEEN 24 AND 16384),
  CONSTRAINT password_recovery_message_envelope_size_check
    CHECK (message_envelope IS NULL OR length(message_envelope) BETWEEN 24 AND 65536),
  CONSTRAINT password_recovery_lease_pair_check CHECK (
    (lease_token IS NULL AND lease_expires_at IS NULL)
    OR (lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS password_recovery_outbox_candidate_cooldown_idx
  ON auth_security.password_recovery_outbox (candidate_fingerprint, queued_at DESC);

CREATE INDEX IF NOT EXISTS password_recovery_outbox_dispatch_idx
  ON auth_security.password_recovery_outbox (state, available_at, queued_at);

-- The webhook correlates by provider id, and retention prunes by completion age.
CREATE INDEX IF NOT EXISTS password_recovery_outbox_provider_message_idx
  ON auth_security.password_recovery_outbox (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS password_recovery_outbox_completed_idx
  ON auth_security.password_recovery_outbox (completed_at)
  WHERE completed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS auth_security.recovery_attempt_grants (
  grant_hash text PRIMARY KEY,
  state text NOT NULL DEFAULT 'active' CHECK (state = ANY (ARRAY[
    'active'::text,
    'succeeded'::text,
    'expired'::text,
    'exhausted'::text,
    -- A provider attempt ended ambiguously (deadline passed, or its writer died
    -- holding the lease). The mutation may still land, so the grant is closed:
    -- at most ONE candidate password was ever in flight under it.
    'interrupted'::text,
    -- Explicitly abandoned by its holder.
    'invalidated'::text
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

CREATE INDEX IF NOT EXISTS recovery_attempt_grants_expiry_idx
  ON auth_security.recovery_attempt_grants (expires_at);

-- Signature-verified provider delivery/bounce evidence, persisted even when the
-- corresponding provider message id has not yet been committed to the outbox
-- (webhook-before-acceptance ordering race). Idempotent by (message, outcome);
-- carries NO recipient, subject, body, or URL. Reconciled transactionally when
-- provider acceptance is stored, and bounded by retention.
CREATE TABLE IF NOT EXISTS auth_security.password_recovery_delivery_events (
  provider_message_id text NOT NULL CHECK (length(provider_message_id) BETWEEN 1 AND 256),
  outcome text NOT NULL CHECK (outcome = ANY (ARRAY['delivered'::text, 'bounced'::text])),
  first_seen_at timestamp with time zone NOT NULL DEFAULT clock_timestamp(),
  -- Stamped when the event has been evaluated against a matched outbox row,
  -- whether or not it changed the state. NULL = still unmatched.
  applied_at timestamp with time zone,
  PRIMARY KEY (provider_message_id, outcome)
);

CREATE INDEX IF NOT EXISTS password_recovery_delivery_events_seen_idx
  ON auth_security.password_recovery_delivery_events (first_seen_at);

-- =============================================================================
-- Internal helper (auth_security, callable by NO application role): apply one
-- verified delivery outcome to an outbox row the caller has locked. Owns the
-- precedence rule — bounce may supersede accepted/delivered; delivered only
-- advances accepted — and the targeted audit insert.
-- =============================================================================
CREATE OR REPLACE FUNCTION auth_security.apply_recovery_delivery_outcome(
  p_job_id uuid,
  p_current_state text,
  p_account_fingerprint text,
  p_outcome text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_next_state text;
  v_target_user_id uuid;
BEGIN
  v_next_state := CASE
    WHEN p_outcome = 'bounced' AND p_current_state IN ('provider_accepted', 'delivered')
      THEN 'bounced'
    WHEN p_outcome = 'delivered' AND p_current_state = 'provider_accepted'
      THEN 'delivered'
    ELSE NULL
  END;

  IF v_next_state IS NULL THEN
    RETURN false;
  END IF;

  UPDATE auth_security.password_recovery_outbox
     SET state = v_next_state,
         completed_at = clock_timestamp()
   WHERE id = p_job_id;

  IF p_account_fingerprint IS NOT NULL THEN
    SELECT p.id INTO v_target_user_id
      FROM public.profiles p
     WHERE encode(extensions.digest(p.id::text, 'sha256'), 'hex') = p_account_fingerprint
     LIMIT 1;

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
  END IF;

  RETURN true;
END;
$$;

-- =============================================================================
-- Atomic IP budget + candidate cooldown + durable enqueue.
--
-- FOURTH-PASS FINDING 1: this function must be free of account-existence
-- branches. It receives only one-way fingerprints and ciphertext, performs the
-- same operations for every candidate, and returns only the throttle verdict.
-- The public endpoint discards even that and always emits the same 200 behind a
-- fixed response floor (defense in depth, not the control).
-- =============================================================================
CREATE OR REPLACE FUNCTION public.enqueue_password_recovery(
  p_candidate_fingerprint text,
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
  v_job_id uuid := gen_random_uuid();
BEGIN
  IF p_candidate_fingerprint IS NULL OR p_candidate_fingerprint !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'enqueue_password_recovery requires a keyed candidate fingerprint'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;
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

  IF v_ip_count > p_ip_limit THEN
    RETURN 'suppressed';
  END IF;

  -- The SAME lock for every candidate: keyed by the candidate fingerprint, so
  -- concurrent requests for one address serialize while requests for different
  -- addresses — known or unknown alike — do not contend at all.
  PERFORM pg_advisory_xact_lock(
    hashtext('public.enqueue_password_recovery'),
    hashtext(p_candidate_fingerprint)
  );

  IF EXISTS (
    SELECT 1
      FROM auth_security.password_recovery_outbox o
     WHERE o.candidate_fingerprint = p_candidate_fingerprint
       AND o.queued_at >= v_now - make_interval(secs => p_cooldown_seconds)
  ) THEN
    RETURN 'suppressed';
  END IF;

  INSERT INTO auth_security.password_recovery_outbox
    (id, candidate_fingerprint, request_envelope, idempotency_key, queued_at, available_at)
  VALUES (
    v_job_id,
    p_candidate_fingerprint,
    p_request_envelope,
    'password-recovery/' || v_job_id::text,
    v_now,
    v_now
  );

  RETURN 'queued';
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_password_recovery_outbox(
  p_worker_token uuid,
  p_limit integer DEFAULT 10,
  p_lease_seconds integer DEFAULT 60,
  -- Test-isolation scope: a proof may restrict its claims to its own synthetic
  -- candidate so it never leases unrelated queued work. The production worker
  -- passes NULL and claims everything.
  p_candidate_fingerprint text DEFAULT NULL
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
     OR p_lease_seconds NOT BETWEEN 10 AND 300
     OR (p_candidate_fingerprint IS NOT NULL
         AND p_candidate_fingerprint !~ '^[0-9a-f]{64}$') THEN
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
       AND (p_candidate_fingerprint IS NULL
            OR o.candidate_fingerprint = p_candidate_fingerprint)
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

-- =============================================================================
-- THE canonical account-resolution path (fourth-pass finding 1). Called only by
-- the worker, under its lease, AFTER the public request already returned. One
-- case-insensitive, whitespace-normalized comparison decides existence for the
-- whole pipeline; nothing else — enqueue included — looks up profiles by
-- address. Unknown candidates are discarded (terminal, envelopes scrubbed, no
-- mail, no audit). Known candidates get the account fingerprint and, exactly
-- once, the targeted actorless `queued` audit row.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.resolve_password_recovery_outbox(
  p_job_id uuid,
  p_worker_token uuid,
  p_email text
)
RETURNS TABLE (status text, user_id uuid, first_name text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_job auth_security.password_recovery_outbox%ROWTYPE;
  v_user_id uuid;
  v_first_name text;
  v_fingerprint text;
BEGIN
  SELECT * INTO v_job
    FROM auth_security.password_recovery_outbox o
   WHERE o.id = p_job_id
     AND o.state = 'processing'
     AND o.lease_token = p_worker_token
     AND o.lease_expires_at > clock_timestamp()
   FOR UPDATE;

  IF NOT FOUND THEN
    status := 'lease_lost'; user_id := NULL; first_name := NULL;
    RETURN NEXT; RETURN;
  END IF;

  SELECT p.id, p.first_name
    INTO v_user_id, v_first_name
    FROM public.profiles p
   WHERE lower(btrim(p.email)) = lower(btrim(COALESCE(p_email, '')))
   ORDER BY p.id
   LIMIT 1;

  IF v_user_id IS NULL THEN
    UPDATE auth_security.password_recovery_outbox
       SET state = 'discarded',
           completed_at = clock_timestamp(),
           request_envelope = NULL,
           message_envelope = NULL,
           scrubbed_at = clock_timestamp(),
           lease_token = NULL,
           lease_expires_at = NULL
     WHERE id = p_job_id;
    status := 'discarded'; user_id := NULL; first_name := NULL;
    RETURN NEXT; RETURN;
  END IF;

  v_fingerprint := encode(extensions.digest(v_user_id::text, 'sha256'), 'hex');

  IF v_job.account_fingerprint IS NULL THEN
    UPDATE auth_security.password_recovery_outbox
       SET account_fingerprint = v_fingerprint
     WHERE id = p_job_id;

    INSERT INTO public.security_audit_events
      (action, outcome, actor_user_id, target_user_id, metadata)
    VALUES (
      'password_recovery_requested',
      'queued',
      NULL,
      v_user_id,
      jsonb_build_object('delivery_state', 'queued')
    );
  END IF;

  status := 'resolved'; user_id := v_user_id; first_name := v_first_name;
  RETURN NEXT;
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

-- Terminal transitions scrub the credential-bearing envelopes in the same
-- statement (fourth-pass finding 6): once a job can never be retried, nothing
-- may keep a ciphertext whose plaintext contains a live recovery URL.
-- `provider_accepted` REQUIRES a provider message id (fourth-pass finding 5): a
-- success the webhook can never correlate must stay retryable instead of
-- becoming an untrackable terminal state. On acceptance, pending verified
-- delivery evidence for that id is reconciled in the same transaction.
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
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_job auth_security.password_recovery_outbox%ROWTYPE;
  v_final_state text;
  v_terminal boolean;
BEGIN
  IF p_state NOT IN ('queued', 'provider_accepted', 'provider_rejected', 'dead')
     OR p_retry_delay_seconds NOT BETWEEN 1 AND 86400 THEN
    RAISE EXCEPTION 'finish_password_recovery_outbox received an invalid state'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  IF p_state = 'provider_accepted'
     AND (p_provider_message_id IS NULL
          OR length(btrim(p_provider_message_id)) NOT BETWEEN 1 AND 256) THEN
    RAISE EXCEPTION 'provider acceptance requires a usable provider message id'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  SELECT * INTO v_job
    FROM auth_security.password_recovery_outbox o
   WHERE o.id = p_job_id
     AND o.state = 'processing'
     AND o.lease_token = p_worker_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  v_final_state := CASE
    WHEN p_state = 'queued' AND v_job.provider_attempts + 1 >= v_job.max_provider_attempts
      THEN 'dead'
    ELSE p_state
  END;
  v_terminal := v_final_state IN ('provider_accepted', 'provider_rejected', 'dead');

  UPDATE auth_security.password_recovery_outbox
     SET state = v_final_state,
         provider_attempts = v_job.provider_attempts + 1,
         provider_message_id = CASE
           WHEN p_state = 'provider_accepted' THEN left(btrim(p_provider_message_id), 256)
           ELSE provider_message_id
         END,
         available_at = CASE
           WHEN v_final_state = 'queued'
             THEN clock_timestamp() + make_interval(secs => p_retry_delay_seconds)
           ELSE available_at
         END,
         completed_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE NULL END,
         request_envelope = CASE WHEN v_terminal THEN NULL ELSE request_envelope END,
         message_envelope = CASE WHEN v_terminal THEN NULL ELSE message_envelope END,
         scrubbed_at = CASE WHEN v_terminal THEN clock_timestamp() ELSE scrubbed_at END,
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE id = p_job_id;

  -- Ordering race (fourth-pass finding 5): a signature-verified delivery or
  -- bounce webhook may have arrived BEFORE this acceptance committed. Reconcile
  -- it here, in the same transaction that stores the provider message id, so
  -- event-before-acceptance and acceptance-before-event converge on one state.
  IF p_state = 'provider_accepted' THEN
    DECLARE
      v_message_id text := left(btrim(p_provider_message_id), 256);
      v_pending_bounce boolean;
      v_pending_delivery boolean;
    BEGIN
      SELECT
        bool_or(e.outcome = 'bounced'),
        bool_or(e.outcome = 'delivered')
        INTO v_pending_bounce, v_pending_delivery
        FROM auth_security.password_recovery_delivery_events e
       WHERE e.provider_message_id = v_message_id
         AND e.applied_at IS NULL;

      IF COALESCE(v_pending_delivery, false) THEN
        PERFORM auth_security.apply_recovery_delivery_outcome(
          p_job_id, 'provider_accepted', v_job.account_fingerprint, 'delivered');
      END IF;
      IF COALESCE(v_pending_bounce, false) THEN
        PERFORM auth_security.apply_recovery_delivery_outcome(
          p_job_id,
          CASE WHEN COALESCE(v_pending_delivery, false)
               THEN 'delivered' ELSE 'provider_accepted' END,
          v_job.account_fingerprint,
          'bounced');
      END IF;

      UPDATE auth_security.password_recovery_delivery_events
         SET applied_at = clock_timestamp()
       WHERE provider_message_id = v_message_id
         AND applied_at IS NULL;
    END;
  END IF;

  RETURN true;
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

-- FOURTH-PASS FINDING 3: an EXPIRED lease is never re-leased. A lease is only
-- ever released explicitly, by a writer that observed a resolved provider
-- response (or never contacted the provider at all). A lease that expired while
-- held means its writer died mid-attempt — the provider mutation may still land
-- at any later moment — so the grant is closed as `interrupted` rather than
-- handed to a second writer whose different password would race the first.
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
  IF v_grant.state = 'interrupted' THEN
    status := 'interrupted'; attempts_remaining := 0; RETURN NEXT; RETURN;
  END IF;
  IF v_grant.state = 'invalidated' THEN
    status := 'invalidated'; attempts_remaining := 0; RETURN NEXT; RETURN;
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
  IF v_grant.lease_token IS NOT NULL THEN
    IF v_grant.lease_expires_at > clock_timestamp() THEN
      status := 'busy';
      attempts_remaining := v_grant.max_attempts - v_grant.attempts_used;
      RETURN NEXT; RETURN;
    END IF;
    -- The writer holding this lease vanished with its provider outcome unknown.
    UPDATE auth_security.recovery_attempt_grants
       SET state = 'interrupted',
           completed_at = COALESCE(completed_at, clock_timestamp()),
           lease_token = NULL,
           lease_expires_at = NULL
     WHERE grant_hash = p_grant_hash;
    status := 'interrupted'; attempts_remaining := 0; RETURN NEXT; RETURN;
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

-- Completion is FENCED: it requires the lease to be both owned and UNEXPIRED,
-- so a writer that lost its lease can never record an outcome. Release-for-
-- retry is legitimate only for a writer that saw a resolved provider response.
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
     AND lease_expires_at > clock_timestamp()
     AND state = 'active'
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

-- Declared by a writer whose provider attempt ended AMBIGUOUSLY (deadline
-- passed with the request possibly still in flight). Terminal: at most one
-- candidate password was ever issued under this grant, so exactly one password
-- can become authoritative — the old one, or the single submitted one.
CREATE OR REPLACE FUNCTION public.interrupt_recovery_attempt_grant(
  p_grant_hash text,
  p_lease_token uuid
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
     SET state = 'interrupted',
         completed_at = COALESCE(completed_at, clock_timestamp()),
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE grant_hash = p_grant_hash
     AND lease_token = p_lease_token
     AND state = 'active'
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

-- Explicit invalidation: the holder abandoned the ceremony. Terminal.
CREATE OR REPLACE FUNCTION public.invalidate_recovery_attempt_grant(
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
     SET state = 'invalidated',
         completed_at = COALESCE(completed_at, clock_timestamp()),
         lease_token = NULL,
         lease_expires_at = NULL
   WHERE grant_hash = p_grant_hash
     AND state = 'active'
  RETURNING true INTO v_updated;

  RETURN COALESCE(v_updated, false);
END;
$$;

-- Read-only status probe: lets the ceremony report whether a stored grant is
-- still usable (page refresh, tab remount) WITHOUT consuming an attempt.
CREATE OR REPLACE FUNCTION public.peek_recovery_attempt_grant(
  p_grant_hash text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_grant auth_security.recovery_attempt_grants%ROWTYPE;
BEGIN
  IF p_grant_hash IS NULL OR p_grant_hash !~ '^[0-9a-f]{64}$' THEN
    RETURN 'invalid';
  END IF;

  SELECT * INTO v_grant
    FROM auth_security.recovery_attempt_grants
   WHERE grant_hash = p_grant_hash;

  IF NOT FOUND THEN
    RETURN 'invalid';
  END IF;
  IF v_grant.state = 'active' AND v_grant.expires_at <= clock_timestamp() THEN
    RETURN 'expired';
  END IF;
  IF v_grant.state = 'active'
     AND v_grant.lease_token IS NOT NULL
     AND v_grant.lease_expires_at <= clock_timestamp() THEN
    -- The same evidence claim_recovery_attempt_grant acts on: a dead writer.
    RETURN 'interrupted';
  END IF;
  RETURN v_grant.state;
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

-- =============================================================================
-- Delivery evidence transition (fourth-pass finding 5). The evidence row is
-- persisted FIRST, unconditionally and idempotently, so a webhook that arrives
-- before the outbox commit of its provider message id is never lost. Returns:
--   'applied'  — a matched outbox row changed state (audit row written)
--   'noop'     — matched, but precedence refused the transition (idempotent
--                duplicate, or delivered arriving after a terminal bounce)
--   'pending'  — no outbox row carries this provider id yet; the evidence is
--                stored and will be reconciled when acceptance commits
-- A database failure RAISES, which the webhook route maps to a retryable 500.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_password_recovery_delivery(
  p_provider_message_id text,
  p_outcome text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, extensions, pg_catalog
AS $$
DECLARE
  v_job auth_security.password_recovery_outbox%ROWTYPE;
  v_applied boolean;
BEGIN
  IF p_provider_message_id IS NULL OR length(p_provider_message_id) NOT BETWEEN 1 AND 256
     OR p_outcome NOT IN ('delivered', 'bounced') THEN
    RAISE EXCEPTION 'record_password_recovery_delivery received invalid arguments'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  INSERT INTO auth_security.password_recovery_delivery_events
    (provider_message_id, outcome)
  VALUES (p_provider_message_id, p_outcome)
  ON CONFLICT (provider_message_id, outcome) DO NOTHING;

  SELECT * INTO v_job
    FROM auth_security.password_recovery_outbox o
   WHERE o.provider_message_id = p_provider_message_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'pending';
  END IF;

  v_applied := auth_security.apply_recovery_delivery_outcome(
    v_job.id, v_job.state, v_job.account_fingerprint, p_outcome);

  UPDATE auth_security.password_recovery_delivery_events
     SET applied_at = COALESCE(applied_at, clock_timestamp())
   WHERE provider_message_id = p_provider_message_id
     AND outcome = p_outcome;

  RETURN CASE WHEN v_applied THEN 'applied' ELSE 'noop' END;
END;
$$;

-- =============================================================================
-- Bounded, indexed, observable retention (fourth-pass finding 6). Runs from a
-- scheduled worker — NEVER from the public request path. Every delete is
-- bounded by p_limit and walks an index. Terminal envelopes are already
-- scrubbed at their transition; the sweep here is the belt for rows that
-- reached a terminal state before this migration's inline scrubbing existed.
--
-- Retention periods:
--   * IP buckets: 1 day (the widest budget window is one hour).
--   * Terminal outbox rows: 30 days — kept only for webhook correlation and
--     operator triage; the envelopes inside them are already NULL.
--   * Grants: 7 days after any terminal state; stale never-claimed grants one
--     day after expiry. Only hashes and counters are stored.
--   * Delivery evidence: 7 days once applied; 30 days if never matched
--     (an unrelated provider message will never match).
--   * security_audit_events: the documented compliance retention period —
--     two years (730 days) per docs/runbooks/auth-security.md §7 — enforced
--     here as a parameter so an operator decision changes one call site.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.run_auth_security_retention(
  p_limit integer DEFAULT 5000,
  p_audit_retention_days integer DEFAULT 730
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth_security, pg_catalog
AS $$
DECLARE
  v_now timestamptz := clock_timestamp();
  v_ip_buckets integer;
  v_outbox_scrubbed integer;
  v_outbox_deleted integer;
  v_grants integer;
  v_events integer;
  v_audit integer;
BEGIN
  IF p_limit NOT BETWEEN 1 AND 50000 OR p_audit_retention_days NOT BETWEEN 90 AND 3700 THEN
    RAISE EXCEPTION 'run_auth_security_retention received invalid bounds'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  DELETE FROM auth_security.password_recovery_ip_buckets b
   WHERE (b.scope, b.subject_hash, b.window_started_at) IN (
     SELECT scope, subject_hash, window_started_at
       FROM auth_security.password_recovery_ip_buckets
      WHERE window_started_at < v_now - interval '1 day'
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_ip_buckets = ROW_COUNT;

  -- Belt: any terminal row that still carries an envelope loses it now.
  UPDATE auth_security.password_recovery_outbox o
     SET request_envelope = NULL,
         message_envelope = NULL,
         scrubbed_at = v_now
   WHERE o.id IN (
     SELECT id FROM auth_security.password_recovery_outbox
      WHERE state IN ('discarded', 'provider_accepted', 'provider_rejected',
                      'delivered', 'bounced', 'dead')
        AND scrubbed_at IS NULL
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_outbox_scrubbed = ROW_COUNT;

  DELETE FROM auth_security.password_recovery_outbox o
   WHERE o.id IN (
     SELECT id FROM auth_security.password_recovery_outbox
      WHERE completed_at IS NOT NULL
        AND completed_at < v_now - interval '30 days'
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_outbox_deleted = ROW_COUNT;

  DELETE FROM auth_security.recovery_attempt_grants g
   WHERE g.grant_hash IN (
     SELECT grant_hash FROM auth_security.recovery_attempt_grants
      WHERE (state <> 'active'
             AND COALESCE(completed_at, expires_at) < v_now - interval '7 days')
         OR (state = 'active' AND expires_at < v_now - interval '1 day')
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_grants = ROW_COUNT;

  DELETE FROM auth_security.password_recovery_delivery_events e
   WHERE (e.provider_message_id, e.outcome) IN (
     SELECT provider_message_id, outcome
       FROM auth_security.password_recovery_delivery_events
      WHERE (applied_at IS NOT NULL AND applied_at < v_now - interval '7 days')
         OR (applied_at IS NULL AND first_seen_at < v_now - interval '30 days')
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_events = ROW_COUNT;

  DELETE FROM public.security_audit_events a
   WHERE a.id IN (
     SELECT id FROM public.security_audit_events
      WHERE occurred_at < v_now - make_interval(days => p_audit_retention_days)
      LIMIT p_limit
   );
  GET DIAGNOSTICS v_audit = ROW_COUNT;

  RETURN jsonb_build_object(
    'ip_buckets_deleted', v_ip_buckets,
    'outbox_envelopes_scrubbed', v_outbox_scrubbed,
    'outbox_rows_deleted', v_outbox_deleted,
    'grants_deleted', v_grants,
    'delivery_events_deleted', v_events,
    'audit_events_deleted', v_audit,
    'limit', p_limit
  );
END;
$$;

COMMENT ON SCHEMA auth_security IS
  'Non-exposed authentication security state. Contains only encrypted recovery envelopes (scrubbed at terminal transitions), keyed one-way fingerprints/hashes, and provider delivery evidence; no direct user id, e-mail, recovery URL, password, or grant token.';

COMMENT ON TABLE auth_security.password_recovery_outbox IS
  'Durable recovery-email queue. Enqueued for EVERY candidate address with structurally identical work (anti-enumeration); account existence is resolved asynchronously by resolve_password_recovery_outbox, the single canonical case-insensitive resolution path. Payloads are AES-GCM ciphertext, scrubbed the moment the row is terminal. A message is prepared and persisted before the first provider attempt so retries never mint a superseding recovery link.';

COMMENT ON TABLE auth_security.recovery_attempt_grants IS
  'Bounded retry ledger for recovery grants. Stores only SHA-256 hashes plus lifetime, attempt and lease state. Completion is fenced to an unexpired owned lease; an expired held lease closes the grant as interrupted so a second writer can never race a possibly-in-flight password mutation. User identity is carried only inside the authenticated encrypted grant held by the browser.';

COMMENT ON TABLE auth_security.password_recovery_delivery_events IS
  'Signature-verified provider delivery/bounce evidence, durable across ordering races: an event arriving before its provider message id is committed to the outbox is stored here and reconciled transactionally when acceptance commits. Idempotent by (provider_message_id, outcome); no recipient, subject, body, or URL; bounded by run_auth_security_retention.';

DO $$
DECLARE
  v_signature regprocedure;
BEGIN
  FOREACH v_signature IN ARRAY ARRAY[
    'public.enqueue_password_recovery(text,text,text,integer,integer,integer)'::regprocedure,
    'public.claim_password_recovery_outbox(uuid,integer,integer,text)'::regprocedure,
    'public.resolve_password_recovery_outbox(uuid,uuid,text)'::regprocedure,
    'public.prepare_password_recovery_outbox(uuid,uuid,text)'::regprocedure,
    'public.finish_password_recovery_outbox(uuid,uuid,text,text,integer)'::regprocedure,
    'public.create_recovery_attempt_grant(text,timestamp with time zone,integer)'::regprocedure,
    'public.claim_recovery_attempt_grant(text,uuid,integer)'::regprocedure,
    'public.finish_recovery_attempt_grant(text,uuid,boolean)'::regprocedure,
    'public.interrupt_recovery_attempt_grant(text,uuid)'::regprocedure,
    'public.invalidate_recovery_attempt_grant(text)'::regprocedure,
    'public.peek_recovery_attempt_grant(text)'::regprocedure,
    'public.mark_recovery_attempt_grant_succeeded(text)'::regprocedure,
    'public.record_password_recovery_delivery(text,text)'::regprocedure,
    'public.run_auth_security_retention(integer,integer)'::regprocedure,
    'auth_security.apply_recovery_delivery_outcome(uuid,text,text,text)'::regprocedure
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', v_signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', v_signature);
  END LOOP;

  -- The internal helper is callable by NO application role, service_role
  -- included: it exists only for the SECURITY DEFINER functions above.
  EXECUTE 'REVOKE ALL ON FUNCTION auth_security.apply_recovery_delivery_outcome(uuid,text,text,text) FROM service_role';

  FOREACH v_signature IN ARRAY ARRAY[
    'public.enqueue_password_recovery(text,text,text,integer,integer,integer)'::regprocedure,
    'public.claim_password_recovery_outbox(uuid,integer,integer,text)'::regprocedure,
    'public.resolve_password_recovery_outbox(uuid,uuid,text)'::regprocedure,
    'public.prepare_password_recovery_outbox(uuid,uuid,text)'::regprocedure,
    'public.finish_password_recovery_outbox(uuid,uuid,text,text,integer)'::regprocedure,
    'public.create_recovery_attempt_grant(text,timestamp with time zone,integer)'::regprocedure,
    'public.claim_recovery_attempt_grant(text,uuid,integer)'::regprocedure,
    'public.finish_recovery_attempt_grant(text,uuid,boolean)'::regprocedure,
    'public.interrupt_recovery_attempt_grant(text,uuid)'::regprocedure,
    'public.invalidate_recovery_attempt_grant(text)'::regprocedure,
    'public.peek_recovery_attempt_grant(text)'::regprocedure,
    'public.mark_recovery_attempt_grant_succeeded(text)'::regprocedure,
    'public.record_password_recovery_delivery(text,text)'::regprocedure,
    'public.run_auth_security_retention(integer,integer)'::regprocedure
  ] LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END
$$;
