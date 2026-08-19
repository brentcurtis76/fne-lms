-- Durable password-recovery ceremonies: isolation, atomic state transitions,
-- cooldowns, leases, retries, exhaustion, replay, and audit semantics.
-- Synthetic adult-staff fixtures only. Transactional and safe for local repeat.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(57);

\set user_one   '''00000000-0000-4000-8000-000000005401'''
\set user_two   '''00000000-0000-4000-8000-000000005402'''
\set user_three '''00000000-0000-4000-8000-000000005403'''
\set ip_one     '''aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'''
\set ip_two     '''bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'''
\set ip_shared  '''cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'''
\set grant_one  '''dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd'''
\set grant_two  '''eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'''
\set grant_old  '''ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'''
\set worker_one '''10000000-0000-4000-8000-000000005401'''
\set worker_two '''20000000-0000-4000-8000-000000005402'''

-- ---------------------------------------------------------------------------
-- Structure and privilege posture. auth_security is intentionally non-exposed;
-- service_role reaches it only through fixed SECURITY DEFINER functions.
-- ---------------------------------------------------------------------------
SELECT has_schema('auth_security', 'private auth_security schema exists');
SELECT has_table('auth_security', 'password_recovery_ip_buckets', 'IP budget table exists');
SELECT has_table('auth_security', 'password_recovery_outbox', 'durable recovery outbox exists');
SELECT has_table('auth_security', 'recovery_attempt_grants', 'bounded grant ledger exists');

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
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery'
      ])
      AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon can execute none of the nine recovery state functions'
);
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'enqueue_password_recovery', 'claim_password_recovery_outbox',
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery'
      ])
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'authenticated can execute none of the nine recovery state functions'
);
SELECT is(
  (SELECT count(*)::int
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (ARRAY[
        'enqueue_password_recovery', 'claim_password_recovery_outbox',
        'prepare_password_recovery_outbox', 'finish_password_recovery_outbox',
        'create_recovery_attempt_grant', 'claim_recovery_attempt_grant',
        'finish_recovery_attempt_grant', 'mark_recovery_attempt_grant_succeeded',
        'record_password_recovery_delivery'
      ])
      AND has_function_privilege('service_role', p.oid, 'EXECUTE')),
  9,
  'service_role can execute exactly the nine fixed recovery state functions'
);

SELECT ok(NOT has_table_privilege('anon', 'auth_security.password_recovery_outbox', 'SELECT'),
  'anon has no direct outbox privilege');
SELECT ok(NOT has_table_privilege('authenticated', 'auth_security.password_recovery_outbox', 'SELECT'),
  'authenticated has no direct outbox privilege');
SELECT ok(NOT has_table_privilege('service_role', 'auth_security.password_recovery_outbox', 'SELECT'),
  'service_role has no direct outbox privilege; SECURITY DEFINER functions are the surface');

-- ---------------------------------------------------------------------------
-- Synthetic adult-staff fixtures.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES
  (:user_one::uuid, 'recovery-one@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_two::uuid, 'recovery-two@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated'),
  (:user_three::uuid, 'recovery-three@synthetic.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, first_name, approval_status)
VALUES
  (:user_one::uuid, 'recovery-one@synthetic.local', 'Recovery One', 'One', 'approved'),
  (:user_two::uuid, 'recovery-two@synthetic.local', 'Recovery Two', 'Two', 'approved'),
  (:user_three::uuid, 'recovery-three@synthetic.local', 'Recovery Three', 'Three', 'approved')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- Account cooldown + IP budget + public audit semantics.
-- ---------------------------------------------------------------------------
SELECT is(
  public.enqueue_password_recovery(
    'recovery-one@synthetic.local', :ip_one, 'v1.synthetic.request.envelope.one.1234567890',
    600, 10, 60),
  'queued',
  'known account is durably queued'
);
SELECT is((SELECT count(*)::int FROM auth_security.password_recovery_outbox), 1,
  'one outbox row exists after the first request');
SELECT is(
  (SELECT outcome || '|' || coalesce(actor_user_id::text, 'NULL') || '|' || target_user_id::text
     FROM security_audit_events
    WHERE action = 'password_recovery_requested' AND target_user_id = :user_one::uuid
    ORDER BY occurred_at DESC LIMIT 1),
  'queued|NULL|' || :user_one,
  'queued audit is precise, actorless, and targeted to the account'
);
SELECT is(
  public.enqueue_password_recovery(
    'recovery-one@synthetic.local', :ip_two, 'v1.synthetic.request.envelope.two.1234567890',
    600, 10, 60),
  'suppressed',
  'same account from a different IP is suppressed by the durable cooldown'
);
SELECT is((SELECT count(*)::int FROM auth_security.password_recovery_outbox), 1,
  'cooldown suppression creates no second job');
SELECT is(
  public.enqueue_password_recovery(
    'unknown@synthetic.local', :ip_two, 'v1.synthetic.request.envelope.unknown.1234567890',
    600, 10, 60),
  'suppressed',
  'unknown address uses the same coarse suppression result'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested'),
  1,
  'unknown address creates no user-attributable audit row'
);

SELECT is(
  public.enqueue_password_recovery(
    'recovery-two@synthetic.local', :ip_shared, 'v1.synthetic.request.envelope.shared.one.1234567890',
    600, 1, 60),
  'queued',
  'first request in a distributed IP window is accepted'
);
SELECT is(
  public.enqueue_password_recovery(
    'recovery-three@synthetic.local', :ip_shared, 'v1.synthetic.request.envelope.shared.two.1234567890',
    600, 1, 60),
  'suppressed',
  'second account on the same IP window is suppressed by the shared budget'
);
SELECT is((SELECT count(*)::int FROM auth_security.password_recovery_outbox), 2,
  'IP suppression creates no job for the second account');

-- ---------------------------------------------------------------------------
-- Outbox leases, prepared-message reuse, and terminal state.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE claimed_one AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_one::uuid, 1, 60);

SELECT is((SELECT count(*)::int FROM claimed_one), 1,
  'first worker claims exactly one job');
SELECT is_empty(
  format(
    'SELECT 1 FROM public.claim_password_recovery_outbox(%L::uuid, 1, 60) WHERE job_id = %L::uuid',
    :worker_two,
    (SELECT job_id::text FROM claimed_one)
  ),
  'second worker cannot claim the same leased job'
);
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

UPDATE auth_security.password_recovery_outbox
   SET available_at = clock_timestamp() - interval '1 second'
 WHERE id = (SELECT job_id FROM claimed_one);

CREATE TEMP TABLE claimed_two AS
SELECT * FROM public.claim_password_recovery_outbox(:worker_two::uuid, 1, 60);

SELECT is(
  (SELECT message_envelope || '|' || idempotency_key FROM claimed_two),
  (SELECT 'v1.synthetic.message.envelope.stable.1234567890|' || idempotency_key FROM claimed_one),
  'retry reuses both the prepared message/link and stable provider idempotency key'
);
SELECT is(
  public.finish_password_recovery_outbox(
    (SELECT job_id FROM claimed_two), :worker_two::uuid,
    'provider_accepted', 'synthetic-provider-id', 1),
  true,
  'provider acceptance completes the leased job'
);
SELECT is_empty(
  format('SELECT 1 FROM public.claim_password_recovery_outbox(%L::uuid, 10, 60) WHERE job_id = %L::uuid',
    :worker_one, (SELECT job_id::text FROM claimed_two)),
  'provider-accepted job is terminal and cannot be reclaimed'
);
SELECT ok(
  public.record_password_recovery_delivery('synthetic-provider-id', 'delivered'),
  'verified provider delivery evidence advances the recovery message'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'delivered',
  'provider acceptance is distinguished from delivered state'
);
SELECT ok(
  public.record_password_recovery_delivery('synthetic-provider-id', 'delivered'),
  'duplicate delivered webhook is idempotently accepted'
);
SELECT is(
  (SELECT count(*)::int FROM security_audit_events
    WHERE action = 'password_recovery_requested'
      AND target_user_id = :user_one::uuid
      AND outcome = 'delivered'),
  1,
  'duplicate webhook writes exactly one delivered audit event'
);
SELECT ok(
  public.record_password_recovery_delivery('synthetic-provider-id', 'bounced'),
  'later verified bounce may supersede delivered'
);
SELECT is(
  (SELECT state FROM auth_security.password_recovery_outbox
    WHERE id = (SELECT job_id FROM claimed_two)),
  'bounced',
  'bounce is the terminal delivery state'
);
SELECT is(
  (SELECT outcome || '|' || coalesce(actor_user_id::text, 'NULL') || '|' || target_user_id::text
     FROM security_audit_events
    WHERE action = 'password_recovery_requested'
      AND target_user_id = :user_one::uuid
      AND outcome = 'bounced'),
  'bounced|NULL|' || :user_one,
  'bounced audit is provider-evidenced, actorless, and targeted'
);

-- ---------------------------------------------------------------------------
-- Grant leases: bounded retries, exhaustion, success, replay, and expiry.
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
  'provider failure releases the first grant lease');
SELECT is(
  (SELECT status || '|' || attempts_remaining::text
     FROM public.claim_recovery_attempt_grant(:grant_one, :worker_two::uuid, 45)),
  'claimed|0',
  'same grant may retry once after provider failure');
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
RESET ROLE;

SELECT * FROM finish();
ROLLBACK;
