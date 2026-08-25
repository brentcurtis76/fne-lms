-- Durable password-recovery ceremonies: isolation, anti-enumeration enqueue,
-- canonical worker-side resolution, atomic state transitions, cooldowns,
-- fenced leases, retries, exhaustion, interruption, replay, durable delivery
-- evidence across ordering races, retention, and audit semantics.
--
-- Synthetic adult-staff fixtures only. Transactional and safe for local repeat.
-- EVERY count and claim is scoped to this file's own synthetic candidate
-- fingerprints, grant hashes and fixture user ids, so the suite passes on a
-- database that contains unrelated queued recovery work.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(125);

\set user_one    '''00000000-0000-4000-8000-000000005401'''
\set user_two    '''00000000-0000-4000-8000-000000005402'''
\set user_three  '''00000000-0000-4000-8000-000000005403'''
\set cand_one    '''a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1'''
\set cand_two    '''a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2a2'''
\set cand_three  '''a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3a3'''
\set cand_unknown '''a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4a4'''
\set cand_old    '''a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5a5'''
\set cand_scrub  '''a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6a6'''
\set ip_one      '''b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1b1'''
\set ip_two      '''b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2'''
\set ip_shared   '''b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3b3'''
\set ip_three    '''b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4b4'''
\set ip_old      '''b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5b5'''
\set grant_one   '''c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1c1'''
\set grant_two   '''c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2c2'''
\set grant_fence '''c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3c3'''
\set grant_int   '''c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4c4'''
\set grant_inv   '''c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5c5'''
\set grant_peek  '''c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6'''
\set grant_old   '''c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7c7'''
\set grant_ret   '''c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8c8'''
\set worker_one  '''10000000-0000-4000-8000-000000005401'''
\set worker_two  '''20000000-0000-4000-8000-000000005402'''

-- ---------------------------------------------------------------------------
-- 1–16: Structure and privilege posture. auth_security is intentionally
-- non-exposed; service_role reaches it only through fixed SECURITY DEFINER
-- functions, and the internal delivery helper is callable by no role at all.
-- ---------------------------------------------------------------------------
SELECT has_schema('auth_security', 'private auth_security schema exists');
SELECT has_table('auth_security', 'password_recovery_ip_buckets', 'IP budget table exists');
SELECT has_table('auth_security', 'password_recovery_outbox', 'durable recovery outbox exists');
SELECT has_table('auth_security', 'recovery_attempt_grants', 'bounded grant ledger exists');
SELECT has_table('auth_security', 'password_recovery_delivery_events',
  'durable delivery-evidence table exists');

SELECT is(
  (SELECT count(*)::int
     FROM information_schema.columns
    WHERE table_schema = 'auth_security'
      AND lower(column_name) ~ '(email|user_id|recovery_url|token_hash|grant_token)'),
  0,
  'private tables have no direct e-mail, user-id, link, token-hash, or grant-token column'
);

SELECT ok(NOT has_schema_privilege('anon', 'auth_security', 'USAGE'),
  'anon has no USAGE on auth_security');
SELECT ok(NOT has_schema_privilege('authenticated', 'auth_security', 'USAGE'),
  'authenticated has no USAGE on auth_security');
SELECT ok(NOT has_schema_privilege('service_role', 'auth_security', 'USAGE'),
  'service_role does not bypass the fixed public RPC surface with direct schema access');

SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'enqueue_password_recovery', 'claim_password_recovery_outbox',
        'resolve_password_recovery_outbox',
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'interrupt_recovery_attempt_grant',
        'invalidate_recovery_attempt_grant', 'peek_recovery_attempt_grant',
        'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery', 'run_auth_security_retention'
      ])
      AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon can execute none of the fourteen recovery state functions'
);
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'enqueue_password_recovery', 'claim_password_recovery_outbox',
        'resolve_password_recovery_outbox',
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'interrupt_recovery_attempt_grant',
        'invalidate_recovery_attempt_grant', 'peek_recovery_attempt_grant',
        'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery', 'run_auth_security_retention'
      ])
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'authenticated can execute none of the fourteen recovery state functions'
);
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'enqueue_password_recovery', 'claim_password_recovery_outbox',
        'resolve_password_recovery_outbox',
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'interrupt_recovery_attempt_grant',
        'invalidate_recovery_attempt_grant', 'peek_recovery_attempt_grant',
        'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery', 'run_auth_security_retention'
      ])
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  14,
  'service_role can execute exactly the fourteen fixed recovery state functions'
);

SELECT is(
  (SELECT count(*)::int FROM (VALUES ('anon'), ('authenticated'), ('service_role')) AS r(rolname)
    WHERE has_function_privilege(r.rolname,
      'auth_security.apply_recovery_delivery_outcome(uuid,text,text,text)'::regprocedure,
      'EXECUTE')),
  0,
  'the internal delivery helper is callable by no application role at all'
);

SELECT ok(NOT has_table_privilege('anon', 'auth_security.password_recovery_outbox', 'SELECT'),
  'anon has no direct outbox privilege');
SELECT ok(NOT has_table_privilege('authenticated', 'auth_security.password_recovery_outbox', 'SELECT'),
  'authenticated has no direct outbox privilege');
SELECT ok(NOT has_table_privilege('service_role', 'auth_security.password_recovery_outbox', 'SELECT'),
  'service_role has no direct outbox privilege; SECURITY DEFINER functions are the surface');

-- ---------------------------------------------------------------------------
-- Synthetic adult-staff fixtures. user_one's profile e-mail deliberately
-- carries mixed case AND surrounding whitespace: the canonical resolution path
-- must match it from the normalized address.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:user_one::uuid, 'recovery-one@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_two::uuid, 'recovery-two@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_three::uuid, 'recovery-three@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, first_name, approval_status)
VALUES
  (:user_one::uuid, '  Recovery-ONE@Synthetic.Local ', 'Recovery One', 'One', 'approved'),
  (:user_two::uuid, 'recovery-two@synthetic.local', 'Recovery Two', 'Two', 'approved'),
  (:user_three::uuid, 'recovery-three@synthetic.local', 'Recovery Three', 'Three', 'approved')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 17–26: Anti-enumeration enqueue. The transaction sees only fingerprints and
-- ciphertext: no profile read, no account lock, no account-targeted audit row,
-- and unknown candidates queue exactly like known ones.
-- ---------------------------------------------------------------------------
SELECT is(
  public.enqueue_password_recovery(
    :cand_one, :ip_one, 'v1.synthetic.request.envelope.one.1234567890',
    600, 10, 60),
  'queued',
  'a candidate is durably queued with no account lookup'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_one),
  1,
  'one outbox row exists for this candidate after the first request'
);
SELECT is(
  (SELECT account_fingerprint FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_one),
  NULL,
  'the public request path records no account fact of any kind'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested'
      AND target_user_id IN (:user_one::uuid, :user_two::uuid, :user_three::uuid)),
  0,
  'the public request path writes no account-targeted audit row'
);
SELECT is(
  public.enqueue_password_recovery(
    :cand_one, :ip_two, 'v1.synthetic.request.envelope.two.1234567890',
    600, 10, 60),
  'suppressed',
  'the same candidate from a different IP is suppressed by the durable cooldown'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_one),
  1,
  'cooldown suppression creates no second job for the candidate'
);
SELECT is(
  public.enqueue_password_recovery(
    :cand_unknown, :ip_two, 'v1.synthetic.request.envelope.unknown.1234567890',
    600, 10, 60),
  'queued',
  'an unknown-address candidate is queued IDENTICALLY — existence is not resolved here'
);
SELECT is(
  public.enqueue_password_recovery(
    :cand_two, :ip_shared, 'v1.synthetic.request.envelope.shared.one.1234567890',
    600, 1, 60),
  'queued',
  'first request in a distributed IP window is accepted'
);
SELECT is(
  public.enqueue_password_recovery(
    :cand_three, :ip_shared, 'v1.synthetic.request.envelope.shared.two.1234567890',
    600, 1, 60),
  'suppressed',
  'a second candidate on the same IP window is suppressed by the shared budget'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_three),
  0,
  'IP suppression creates no job for the second candidate'
);

-- ---------------------------------------------------------------------------
-- 27–39: Canonical worker-side resolution. One case-insensitive, whitespace-
-- normalized comparison decides existence; unknown candidates are discarded
-- terminally with scrubbed envelopes and no audit row anywhere.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE claimed_one AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_one::uuid, 5, 60, :cand_one);

SELECT is((SELECT count(*)::int FROM claimed_one), 1,
  'first worker claims exactly one job, scoped to its own candidate');
SELECT is_empty(
  format(
    'SELECT 1 FROM public.claim_password_recovery_outbox(%L::uuid, 5, 60, %L)',
    :worker_two, :cand_one
  ),
  'second worker cannot claim the same leased job'
);
SELECT is(
  (SELECT status FROM public.resolve_password_recovery_outbox(
    (SELECT job_id FROM claimed_one), :worker_two::uuid, 'recovery-one@synthetic.local')),
  'lease_lost',
  'a worker without the lease cannot resolve the account'
);
SELECT is(
  (SELECT status || '|' || user_id::text
     FROM public.resolve_password_recovery_outbox(
       (SELECT job_id FROM claimed_one), :worker_one::uuid, 'recovery-one@synthetic.local')),
  'resolved|' || :user_one,
  'resolution matches a mixed-case, whitespace-padded profile from the normalized address'
);
SELECT is(
  (SELECT account_fingerprint FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_one)),
  encode(extensions.digest(:user_one::uuid::text, 'sha256'), 'hex'),
  'resolution stamps the one-way account fingerprint onto the job'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'queued'
      AND actor_user_id IS NULL AND target_user_id = :user_one::uuid),
  1,
  'the targeted actorless queued audit row exists only after resolution'
);
SELECT is(
  (SELECT status FROM public.resolve_password_recovery_outbox(
    (SELECT job_id FROM claimed_one), :worker_one::uuid, 'recovery-one@synthetic.local')),
  'resolved',
  're-resolution under the same lease is idempotent'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'queued'
      AND target_user_id = :user_one::uuid),
  1,
  're-resolution writes no duplicate queued audit row'
);

CREATE TEMP TABLE claimed_unknown AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_two::uuid, 5, 60, :cand_unknown);

SELECT is((SELECT count(*)::int FROM claimed_unknown), 1,
  'the unknown-candidate job is claimable like any other');
SELECT is(
  (SELECT status FROM public.resolve_password_recovery_outbox(
    (SELECT job_id FROM claimed_unknown), :worker_two::uuid, 'unknown@synthetic.local')),
  'discarded',
  'an unknown candidate is discarded by the worker without sending mail'
);
SELECT is(
  (SELECT state
     || '|' || (request_envelope IS NULL)::text
     || '|' || (message_envelope IS NULL)::text
     || '|' || (scrubbed_at IS NOT NULL)::text
     || '|' || (completed_at IS NOT NULL)::text
     FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_unknown)),
  'discarded|true|true|true|true',
  'a discarded job is terminal with its encrypted envelopes scrubbed immediately'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested'
      AND target_user_id IN (:user_one::uuid, :user_two::uuid, :user_three::uuid)),
  1,
  'discarding an unknown candidate writes no audit row for any fixture account'
);
SELECT is_empty(
  format(
    'SELECT 1 FROM public.claim_password_recovery_outbox(%L::uuid, 5, 60, %L)',
    :worker_one, :cand_unknown
  ),
  'a discarded job is terminal and cannot be reclaimed'
);

-- ---------------------------------------------------------------------------
-- 40–50: Outbox leases, prepared-message reuse, terminal scrubbing, and the
-- refusal of an untrackable accepted state.
-- ---------------------------------------------------------------------------
SELECT is(
  public.prepare_password_recovery_outbox(
    (SELECT job_id FROM claimed_one), :worker_two::uuid,
    'v1.synthetic.message.envelope.wrong.1234567890'),
  false,
  'a different worker cannot prepare the message'
);
SELECT is(
  public.prepare_password_recovery_outbox(
    (SELECT job_id FROM claimed_one), :worker_one::uuid,
    'v1.synthetic.message.envelope.stable.1234567890'),
  true,
  'lease owner persists the encrypted message before provider contact'
);
SELECT is(
  public.finish_password_recovery_outbox(
    (SELECT job_id FROM claimed_one), :worker_one::uuid, 'queued', NULL, 1),
  true,
  'transient provider failure releases the job for retry'
);
SELECT is(
  (SELECT state || '|' || provider_attempts::text || '|' || coalesce(lease_token::text, 'NULL')
     FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_one)),
  'queued|1|NULL',
  'retry increments the bounded attempt counter and clears the lease'
);
SELECT ok(
  (SELECT request_envelope IS NOT NULL AND message_envelope IS NOT NULL
     FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_one)),
  'a retryable job keeps its envelopes — only terminal states scrub'
);

UPDATE auth_security.password_recovery_outbox
   SET available_at = clock_timestamp() - interval '1 second'
 WHERE id = (SELECT job_id FROM claimed_one);

CREATE TEMP TABLE claimed_two AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_two::uuid, 5, 60, :cand_one);

SELECT is(
  (SELECT message_envelope || '|' || idempotency_key FROM claimed_two),
  (SELECT 'v1.synthetic.message.envelope.stable.1234567890|' || idempotency_key FROM claimed_one),
  'retry reuses both the prepared message/link and stable provider idempotency key'
);
SELECT throws_ok(
  format(
    'SELECT public.finish_password_recovery_outbox(%L::uuid, %L::uuid, %L, NULL, 1)',
    (SELECT job_id::text FROM claimed_two), :worker_two, 'provider_accepted'
  ),
  '22023', NULL,
  'provider acceptance WITHOUT a provider message id is refused, not stored'
);
SELECT throws_ok(
  format(
    'SELECT public.finish_password_recovery_outbox(%L::uuid, %L::uuid, %L, %L, 1)',
    (SELECT job_id::text FROM claimed_two), :worker_two, 'provider_accepted', '   '
  ),
  '22023', NULL,
  'a whitespace-only provider message id is refused too'
);
SELECT is(
  public.finish_password_recovery_outbox(
    (SELECT job_id FROM claimed_two), :worker_two::uuid,
    'provider_accepted', 'synthetic-provider-id', 1),
  true,
  'provider acceptance with a usable message id completes the leased job'
);
SELECT is(
  (SELECT state
     || '|' || (request_envelope IS NULL)::text
     || '|' || (message_envelope IS NULL)::text
     || '|' || (scrubbed_at IS NOT NULL)::text
     FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'provider_accepted|true|true|true',
  'the terminal transition scrubs the credential-bearing envelopes in the same statement'
);
SELECT is_empty(
  format(
    'SELECT 1 FROM public.claim_password_recovery_outbox(%L::uuid, 10, 60, %L)',
    :worker_one, :cand_one
  ),
  'a provider-accepted job is terminal and cannot be reclaimed'
);

-- ---------------------------------------------------------------------------
-- 51–74: Delivery evidence, in BOTH orders. Acceptance-then-event applies
-- directly; event-then-acceptance persists the evidence and converges
-- transactionally when acceptance stores the provider id.
-- ---------------------------------------------------------------------------
SELECT is(
  public.record_password_recovery_delivery('synthetic-provider-id', 'delivered'),
  'applied',
  'verified provider delivery evidence advances the recovery message'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'delivered',
  'provider acceptance is distinguished from delivered state'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'delivered'
      AND actor_user_id IS NULL AND target_user_id = :user_one::uuid),
  1,
  'delivery writes exactly one actorless targeted audit event'
);
SELECT is(
  public.record_password_recovery_delivery('synthetic-provider-id', 'delivered'),
  'noop',
  'a duplicate delivered webhook is idempotently a no-op'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'delivered'
      AND target_user_id = :user_one::uuid),
  1,
  'the duplicate wrote no second delivered audit event'
);
SELECT is(
  public.record_password_recovery_delivery('synthetic-provider-id', 'bounced'),
  'applied',
  'a later verified bounce may supersede delivered'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'bounced',
  'bounce is the terminal delivery state'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'bounced'
      AND actor_user_id IS NULL AND target_user_id = :user_one::uuid),
  1,
  'the bounce audit is provider-evidenced, actorless, and targeted'
);
SELECT is(
  public.record_password_recovery_delivery('synthetic-provider-id', 'delivered'),
  'noop',
  'an out-of-order delivered event can never overwrite a terminal bounce'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'bounced',
  'the terminal bounce stands'
);

-- EVENT-BEFORE-ACCEPTANCE: the webhook outruns the worker's commit.
SELECT is(
  public.record_password_recovery_delivery('early-provider-id', 'delivered'),
  'pending',
  'a delivery event with no matching outbox row is persisted as pending, not lost'
);
SELECT ok(
  (SELECT applied_at IS NULL FROM auth_security.password_recovery_delivery_events
    WHERE provider_message_id = 'early-provider-id' AND outcome = 'delivered'),
  'the pending evidence row is durable and unapplied'
);

CREATE TEMP TABLE claimed_three AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_one::uuid, 5, 60, :cand_two);

SELECT is(
  (SELECT status || '|' || user_id::text
     FROM public.resolve_password_recovery_outbox(
       (SELECT job_id FROM claimed_three), :worker_one::uuid, 'recovery-two@synthetic.local')),
  'resolved|' || :user_two,
  'the second fixture account resolves canonically'
);
SELECT is(
  public.finish_password_recovery_outbox(
    (SELECT job_id FROM claimed_three), :worker_one::uuid,
    'provider_accepted', 'early-provider-id', 1),
  true,
  'acceptance commits with the provider id the pending event already names'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_three)),
  'delivered',
  'event-before-acceptance converges: the stored evidence applied transactionally'
);
SELECT ok(
  (SELECT applied_at IS NOT NULL FROM auth_security.password_recovery_delivery_events
    WHERE provider_message_id = 'early-provider-id' AND outcome = 'delivered'),
  'the reconciled evidence row is stamped applied'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'delivered'
      AND target_user_id = :user_two::uuid),
  1,
  'the reconciled delivery wrote its targeted audit event'
);

-- BOUNCE-BEFORE-ACCEPTANCE, same shape, opposite outcome.
SELECT is(
  public.enqueue_password_recovery(
    :cand_three, :ip_three, 'v1.synthetic.request.envelope.three.1234567890',
    600, 10, 60),
  'queued',
  'the third candidate queues once its own IP window is clean'
);
SELECT is(
  public.record_password_recovery_delivery('early-bounce-id', 'bounced'),
  'pending',
  'a bounce event with no matching outbox row is persisted as pending'
);

CREATE TEMP TABLE claimed_four AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_one::uuid, 5, 60, :cand_three);

SELECT is(
  (SELECT status || '|' || user_id::text
     FROM public.resolve_password_recovery_outbox(
       (SELECT job_id FROM claimed_four), :worker_one::uuid, 'recovery-three@synthetic.local')),
  'resolved|' || :user_three,
  'the third fixture account resolves canonically'
);
SELECT is(
  public.finish_password_recovery_outbox(
    (SELECT job_id FROM claimed_four), :worker_one::uuid,
    'provider_accepted', 'early-bounce-id', 1),
  true,
  'acceptance commits with the provider id the pending bounce already names'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_four)),
  'bounced',
  'bounce-before-acceptance converges on the terminal bounce'
);
SELECT is(
  public.record_password_recovery_delivery('unmatched-synthetic-id', 'delivered'),
  'pending',
  'an unrelated provider message is stored as pending and matches nothing'
);
SELECT ok(
  (SELECT applied_at IS NULL FROM auth_security.password_recovery_delivery_events
    WHERE provider_message_id = 'unmatched-synthetic-id'),
  'the unrelated evidence stays unapplied, awaiting retention'
);

-- ---------------------------------------------------------------------------
-- 75–107: Grant leases: bounded retries, exhaustion, success, replay, expiry —
-- and the fourth-pass fencing: a lost lease can never complete, and an expired
-- held lease closes the grant as interrupted instead of re-leasing it.
-- ---------------------------------------------------------------------------
SELECT ok(public.create_recovery_attempt_grant(:grant_one, clock_timestamp() + interval '15 minutes', 2),
  'grant hash is created with a bounded lifetime and attempts');
SELECT ok(NOT public.create_recovery_attempt_grant(:grant_one, clock_timestamp() + interval '15 minutes', 2),
  'duplicate grant hash is rejected');
SELECT is(
  (SELECT status || '|' || attempts_remaining::text
     FROM public.claim_recovery_attempt_grant(:grant_one, :worker_one::uuid, 45)),
  'claimed|1',
  'first provider attempt is atomically leased');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_one, :worker_two::uuid, 45)),
  'busy',
  'simultaneous second worker sees a busy grant');
SELECT ok(public.finish_recovery_attempt_grant(:grant_one, :worker_one::uuid, false),
  'a RESOLVED provider failure releases the first grant lease');
SELECT is(
  (SELECT status || '|' || attempts_remaining::text
     FROM public.claim_recovery_attempt_grant(:grant_one, :worker_two::uuid, 45)),
  'claimed|0',
  'same grant may retry once after a resolved provider failure');
SELECT ok(public.finish_recovery_attempt_grant(:grant_one, :worker_two::uuid, false),
  'final failed provider attempt completes its lease');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_one, :worker_one::uuid, 45)),
  'exhausted',
  'attempt budget is enforced after the configured maximum');

SELECT ok(public.create_recovery_attempt_grant(:grant_two, clock_timestamp() + interval '15 minutes', 2),
  'second grant hash is created for the success/replay case');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_two, :worker_one::uuid, 45)),
  'claimed',
  'success-case grant is leased once');
SELECT ok(public.finish_recovery_attempt_grant(:grant_two, :worker_one::uuid, true),
  'successful password write marks the grant succeeded');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_two, :worker_two::uuid, 45)),
  'succeeded',
  'successful grant replay is refused');

-- FENCING: the lease expires while held; the writer may not complete, and a
-- second submission gets a closed grant rather than a fresh lease.
SELECT ok(public.create_recovery_attempt_grant(:grant_fence, clock_timestamp() + interval '15 minutes', 2),
  'fencing grant is created');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_fence, :worker_one::uuid, 45)),
  'claimed',
  'fencing grant is leased by the delayed writer');

UPDATE auth_security.recovery_attempt_grants
   SET lease_expires_at = clock_timestamp() - interval '1 second'
 WHERE grant_hash = :grant_fence;

SELECT ok(NOT public.finish_recovery_attempt_grant(:grant_fence, :worker_one::uuid, true),
  'a writer whose lease expired can NOT record a completion — the fence holds');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_fence, :worker_two::uuid, 45)),
  'interrupted',
  'a second submission after lease expiry finds the grant closed, never a new lease');
SELECT is(
  public.peek_recovery_attempt_grant(:grant_fence),
  'interrupted',
  'the read-only peek reports the interrupted grant');

-- EXPLICIT INTERRUPTION: the writer itself declares an ambiguous outcome.
SELECT ok(public.create_recovery_attempt_grant(:grant_int, clock_timestamp() + interval '15 minutes', 2),
  'interruption grant is created');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_int, :worker_one::uuid, 45)),
  'claimed',
  'interruption grant is leased');
SELECT ok(NOT public.interrupt_recovery_attempt_grant(:grant_int, :worker_two::uuid),
  'only the lease owner may declare the interruption');
SELECT ok(public.interrupt_recovery_attempt_grant(:grant_int, :worker_one::uuid),
  'the lease owner closes the grant on an ambiguous provider outcome');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_int, :worker_two::uuid, 45)),
  'interrupted',
  'an interrupted grant refuses every further attempt');
SELECT ok(public.mark_recovery_attempt_grant_succeeded(:grant_int),
  'the provider marker may still settle an interrupted grant as succeeded');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_int, :worker_one::uuid, 45)),
  'succeeded',
  'a marker-settled grant reads as succeeded, not retryable'
);

-- EXPLICIT INVALIDATION: the holder abandoned the ceremony.
SELECT ok(public.create_recovery_attempt_grant(:grant_inv, clock_timestamp() + interval '15 minutes', 2),
  'invalidation grant is created');
SELECT ok(public.invalidate_recovery_attempt_grant(:grant_inv),
  'the holder explicitly invalidates the grant');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_inv, :worker_one::uuid, 45)),
  'invalidated',
  'an invalidated grant refuses every attempt');
SELECT ok(NOT public.invalidate_recovery_attempt_grant(:grant_inv),
  'invalidating a non-active grant reports no row changed');
SELECT is(public.peek_recovery_attempt_grant(:grant_inv), 'invalidated',
  'the peek reports the invalidated grant');

-- PEEK is read-only.
SELECT ok(public.create_recovery_attempt_grant(:grant_peek, clock_timestamp() + interval '15 minutes', 2),
  'peek grant is created');
SELECT is(public.peek_recovery_attempt_grant(:grant_peek), 'active',
  'the peek reports an open ceremony');
SELECT is(
  (SELECT attempts_used FROM auth_security.recovery_attempt_grants
    WHERE grant_hash = :grant_peek),
  0,
  'peeking consumed no attempt'
);
SELECT is(public.peek_recovery_attempt_grant(repeat('9', 64)), 'invalid',
  'peeking an unknown grant hash reveals nothing');

INSERT INTO auth_security.recovery_attempt_grants
  (grant_hash, state, created_at, expires_at, max_attempts)
VALUES (:grant_old, 'active', clock_timestamp() - interval '2 hours',
        clock_timestamp() - interval '1 hour', 2);

SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(:grant_old, :worker_one::uuid, 45)),
  'expired',
  'expired grant is refused and normalized to expired state');
SELECT is(
  (SELECT status FROM public.claim_recovery_attempt_grant(repeat('9', 64), :worker_one::uuid, 45)),
  'invalid',
  'unknown grant hash reveals no subject and is refused');
SELECT throws_ok(
  $$ SELECT public.create_recovery_attempt_grant('not-a-hash', clock_timestamp() + interval '5 minutes', 2) $$,
  '22023', NULL,
  'malformed persisted grant hash is rejected structurally'
);

-- ---------------------------------------------------------------------------
-- 108–119: Bounded retention, scoped to seeded synthetic rows.
-- ---------------------------------------------------------------------------
INSERT INTO auth_security.password_recovery_ip_buckets
  (scope, subject_hash, window_started_at, request_count)
VALUES ('password_recovery', :ip_old, clock_timestamp() - interval '2 days', 3);

INSERT INTO auth_security.password_recovery_outbox
  (candidate_fingerprint, request_envelope, message_envelope, idempotency_key,
   state, queued_at, available_at, provider_attempts, completed_at, scrubbed_at)
VALUES
  (:cand_old, NULL, NULL, 'password-recovery/retention-old',
   'dead', clock_timestamp() - interval '40 days',
   clock_timestamp() - interval '40 days', 8,
   clock_timestamp() - interval '40 days', clock_timestamp() - interval '40 days'),
  (:cand_scrub, 'v1.synthetic.request.envelope.scrub.1234567890',
   'v1.synthetic.message.envelope.scrub.1234567890', 'password-recovery/retention-scrub',
   'dead', clock_timestamp() - interval '2 hours',
   clock_timestamp() - interval '2 hours', 8,
   clock_timestamp() - interval '2 hours', NULL);

INSERT INTO auth_security.recovery_attempt_grants
  (grant_hash, state, created_at, expires_at, max_attempts, completed_at)
VALUES (:grant_ret, 'succeeded', clock_timestamp() - interval '9 days',
        clock_timestamp() - interval '9 days' + interval '15 minutes', 2,
        clock_timestamp() - interval '8 days');

INSERT INTO auth_security.password_recovery_delivery_events
  (provider_message_id, outcome, first_seen_at, applied_at)
VALUES
  ('old-applied-id', 'delivered', clock_timestamp() - interval '9 days',
   clock_timestamp() - interval '8 days'),
  ('old-unmatched-id', 'bounced', clock_timestamp() - interval '40 days', NULL);

INSERT INTO public.security_audit_events
  (action, outcome, actor_user_id, target_user_id, metadata, occurred_at)
VALUES ('password_recovery_requested', 'queued', NULL, :user_one::uuid,
        '{"delivery_state": "queued"}'::jsonb, clock_timestamp() - interval '800 days');

SELECT ok(
  (public.run_auth_security_retention(1000, 730)) ?& ARRAY[
    'ip_buckets_deleted', 'outbox_envelopes_scrubbed', 'outbox_rows_deleted',
    'grants_deleted', 'delivery_events_deleted', 'audit_events_deleted'],
  'the retention sweep reports every category it touched'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_ip_buckets
    WHERE subject_hash = :ip_old),
  0,
  'day-old IP buckets are pruned outside the public request path'
);
SELECT ok(
  (SELECT count(*) > 0 FROM auth_security.password_recovery_ip_buckets
    WHERE subject_hash = :ip_one),
  'current IP buckets survive the sweep'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_old),
  0,
  'terminal outbox rows past their retention are deleted'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_one),
  1,
  'recent outbox rows survive the sweep'
);
SELECT is(
  (SELECT (request_envelope IS NULL)::text || '|' || (scrubbed_at IS NOT NULL)::text
     FROM auth_security.password_recovery_outbox
    WHERE candidate_fingerprint = :cand_scrub),
  'true|true',
  'a terminal row that somehow kept its envelopes is scrubbed by the sweep'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.recovery_attempt_grants
    WHERE grant_hash = :grant_ret),
  0,
  'terminal grants past their retention are deleted'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_delivery_events
    WHERE provider_message_id IN ('old-applied-id', 'old-unmatched-id')),
  0,
  'applied and never-matched delivery evidence is bounded by retention'
);
SELECT is(
  (SELECT count(*)::int FROM auth_security.password_recovery_delivery_events
    WHERE provider_message_id = 'unmatched-synthetic-id'),
  1,
  'recent unmatched evidence is retained, still awaiting acceptance'
);
SELECT is(
  (SELECT count(*)::int FROM public.security_audit_events
    WHERE target_user_id = :user_one::uuid
      AND occurred_at < clock_timestamp() - interval '730 days'),
  0,
  'audit events beyond the documented compliance retention are deleted'
);
SELECT is(
  (SELECT count(*)::int FROM public.security_audit_events
    WHERE action = 'password_recovery_requested' AND outcome = 'delivered'
      AND target_user_id = :user_one::uuid),
  1,
  'audit events inside the retention period survive'
);
SELECT throws_ok(
  $$ SELECT public.run_auth_security_retention(0, 730) $$,
  '22023', NULL,
  'retention refuses unbounded or invalid batch limits'
);

-- ---------------------------------------------------------------------------
-- 120–122: Role-boundary negative controls.
-- ---------------------------------------------------------------------------
SET LOCAL ROLE anon;
SELECT throws_ok(
  $$ SELECT public.claim_recovery_attempt_grant(repeat('9', 64), gen_random_uuid(), 45) $$,
  '42501', NULL,
  'anon cannot invoke the grant claim function'
);
SELECT throws_ok(
  $$ SELECT 1 FROM auth_security.recovery_attempt_grants $$,
  '42501', NULL,
  'anon cannot read the private grant ledger directly'
);
SELECT throws_ok(
  $$ SELECT public.run_auth_security_retention(10, 730) $$,
  '42501', NULL,
  'anon cannot run the retention sweep'
);
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
