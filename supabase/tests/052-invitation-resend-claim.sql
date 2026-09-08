-- =============================================================================
-- claim_invitation_resend — the atomic cooldown claim (F5) — pgTAP
--
-- WHAT WAS BROKEN. `/api/admin/tractor-signups/resend-invite` enforced its
-- ten-minute per-recipient cooldown in three round trips with nothing holding a
-- lock between them: SELECT the ledger, INSERT a reservation, send. Two requests
-- for the same recipient both read "no recent resend", both inserted, and both
-- sent — so the recipient received two recovery links and the second silently
-- invalidated the first. The cooldown was advisory in exactly the situation it
-- exists for.
--
-- The claim is now one call that takes a transaction-scoped advisory lock on the
-- TARGET USER ID before it looks at the ledger, then checks and reserves inside
-- that lock.
--
-- WHAT THIS SUITE PROVES, and what it does not. pgTAP runs statements
-- sequentially in one session, so it cannot itself produce two genuinely
-- simultaneous requests. What it CAN establish is every property the
-- concurrency argument rests on: that the lock is really taken (asserted
-- against `pg_locks`), that it is keyed on the target so different recipients do
-- not serialise, that the check and the insert are one statement's worth of
-- work, and that the window behaves. The interleaving itself is exercised in
-- `__tests__/api/admin/resend-invite.test.ts`, which drives two concurrent
-- handler invocations against one shared ledger and includes a negative control
-- showing read-then-insert lets both through.
--
-- Runs inside a transaction and rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(23);

\set target_a  '''00000000-0000-0000-0000-000000052a01'''
\set target_b  '''00000000-0000-0000-0000-000000052b01'''
\set actor_uid '''00000000-0000-0000-0000-0000000520ad'''

-- -----------------------------------------------------------------------------
-- Structure and privileges
-- -----------------------------------------------------------------------------
SELECT has_function(
  'public', 'claim_invitation_resend', ARRAY['uuid', 'uuid', 'integer', 'jsonb'],
  'claim_invitation_resend(uuid, uuid, integer, jsonb) exists'
);

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_invitation_resend'),
  true,
  'it is SECURITY DEFINER — it writes the append-only audit table'
);

SELECT ok(
  NOT has_function_privilege(
    'anon', 'public.claim_invitation_resend(uuid, uuid, integer, jsonb)', 'EXECUTE'),
  'anon cannot execute it'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated', 'public.claim_invitation_resend(uuid, uuid, integer, jsonb)', 'EXECUTE'),
  'authenticated cannot execute it — a browser must not be able to burn a cooldown or forge a reservation'
);

SELECT ok(
  has_function_privilege(
    'service_role', 'public.claim_invitation_resend(uuid, uuid, integer, jsonb)', 'EXECUTE'),
  'service_role can execute it — the endpoint is the only caller'
);

-- -----------------------------------------------------------------------------
-- Argument validation
-- -----------------------------------------------------------------------------
SELECT throws_ok(
  $$ SELECT * FROM public.claim_invitation_resend(NULL, '00000000-0000-0000-0000-0000000520ad'::uuid, 600, '{}'::jsonb) $$,
  '22023', NULL,
  'a NULL target is refused rather than claimed'
);

SELECT throws_ok(
  $$ SELECT * FROM public.claim_invitation_resend('00000000-0000-0000-0000-000000052a01'::uuid, '00000000-0000-0000-0000-0000000520ad'::uuid, 0, '{}'::jsonb) $$,
  '22023', NULL,
  'a zero cooldown is refused — it would be an unlimited allowance'
);

SELECT throws_ok(
  $$ SELECT * FROM public.claim_invitation_resend('00000000-0000-0000-0000-000000052a01'::uuid, '00000000-0000-0000-0000-0000000520ad'::uuid, -60, '{}'::jsonb) $$,
  '22023', NULL,
  'a negative cooldown is refused too'
);

-- -----------------------------------------------------------------------------
-- The first claim
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(:target_a::uuid, :actor_uid::uuid, 600, '{"signup_id": "s-1"}'::jsonb)),
  true,
  'the first claim for a recipient is granted'
);

SELECT is(
  (SELECT count(*)::int FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  1,
  'and it wrote exactly one reservation row'
);

SELECT is(
  (SELECT outcome FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  'failure',
  'the reservation is written as `failure` — before the send, that is what it is'
);

SELECT is(
  (SELECT metadata ->> 'stage' FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  'requested',
  'the stage is forced to `requested`, whatever the caller passed'
);

SELECT is(
  (SELECT metadata ->> 'signup_id' FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  's-1',
  'the caller context is merged in'
);

SELECT is(
  (SELECT actor_user_id FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  :actor_uid::uuid,
  'the acting administrator is recorded'
);

-- THE LOCK. Without it the check and the insert are two steps a second session
-- can slip between, which is the defect verbatim.
SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_locks
     WHERE locktype = 'advisory'
       AND pid = pg_backend_pid()
       AND classid = hashtext('public.claim_invitation_resend')
       AND objid   = hashtext(:target_a::text)
  ),
  'a transaction-scoped advisory lock keyed on THIS recipient is held after the claim'
);

-- -----------------------------------------------------------------------------
-- The second claim inside the window
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(:target_a::uuid, :actor_uid::uuid, 600, '{}'::jsonb)),
  false,
  'a second claim inside the cooldown is refused'
);

SELECT is(
  (SELECT count(*)::int FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  1,
  'and it wrote NO second reservation — a refused claim leaves the ledger alone'
);

SELECT ok(
  (SELECT retry_after_seconds FROM public.claim_invitation_resend(:target_a::uuid, :actor_uid::uuid, 600, '{}'::jsonb))
    BETWEEN 1 AND 600,
  'the refusal reports how long is left, inside the window it was given'
);

-- A FAILED provider attempt still consumes the cooldown: the reservation was
-- written before the send, and nothing about the outcome row is required for the
-- next claim to be refused. That is what stops a broken mailer from being
-- retried into a mail-bomb.
SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(:target_a::uuid, :actor_uid::uuid, 600, '{}'::jsonb)),
  false,
  'a failed attempt still consumes the window — no `delivered` row is needed to hold it'
);

-- A SUCCESSFUL outcome row counts as well: the check is outcome-agnostic.
INSERT INTO public.security_audit_events (action, outcome, actor_user_id, target_user_id, metadata)
VALUES ('invitation_resent', 'success', :actor_uid::uuid, :target_b::uuid, '{"stage": "delivered"}'::jsonb);

SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(:target_b::uuid, :actor_uid::uuid, 600, '{}'::jsonb)),
  false,
  'a recent SUCCESS blocks a new claim too — any attempt counts, not just failures'
);

-- -----------------------------------------------------------------------------
-- Isolation between recipients, and the window expiring
-- -----------------------------------------------------------------------------
SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(
      '00000000-0000-0000-0000-000000052c01'::uuid, :actor_uid::uuid, 600, '{}'::jsonb)),
  true,
  'a DIFFERENT recipient is unaffected — the lock and the ledger check are both per target'
);

-- Age the recipient A row past the window and claim again.
UPDATE public.security_audit_events
   SET occurred_at = now() - interval '20 minutes'
 WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid;

SELECT is(
  (SELECT claimed FROM public.claim_invitation_resend(:target_a::uuid, :actor_uid::uuid, 600, '{}'::jsonb)),
  true,
  'once the window has passed, a new claim is granted'
);

SELECT is(
  (SELECT count(*)::int FROM public.security_audit_events
    WHERE action = 'invitation_resent' AND target_user_id = :target_a::uuid),
  2,
  'and that claim wrote its own reservation'
);

SELECT * FROM finish();
ROLLBACK;
