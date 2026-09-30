-- =============================================================================
-- 101-notification-email-failure-semantics.sql — NOTIF N3-04
-- Covers migration 20260930030000_notification_email_failure_semantics.sql:
--   shape of the four new and two replaced functions (security mode,
--      volatility, pinned search_path, ACL, signature) and the role x operation
--      matrix (anon / authenticated recipient, other, admin: 42501;
--      service_role allowed, but never into auth_security)
--   D4 recovery priority: while recovery mail is due or in flight the claim
--      returns nothing and leases nothing; argument validation still first
--   D1 state transitions: sent, failed, 409 -> failed/provider_conflict,
--      ambiguous -> pending with the same bytes, key and attempt count
--   D2 begin, retry-state and settle refuse a foreign or stale owner
--   D3 the 24-hour limit (23h59m, exactly 24h, beyond), the two outcomes of
--      settle, and every terminal status: no snapshot, no lease, never reclaimed
--   D5 retention: terminal and older than 90 days only, bounded, oldest first
-- Synthetic fixtures only (*@test.local, fixed UUIDs). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(89);

-- Shape and privileges (postgres)
CREATE TEMP TABLE n15_fn (sig text, mode text, shape text) ON COMMIT DROP;
INSERT INTO n15_fn VALUES
  ('public.password_recovery_email_due()', 't|s', ' -> boolean'),
  ('public.claim_notification_emails(text, integer, integer)', 'f|v',
   'p_owner text, p_limit integer, p_lease_seconds integer -> TABLE(id uuid, idempotency_key text, event_type text, user_id uuid, related_url text, payload jsonb, has_snapshot boolean, source_kind text, source_id text)'),
  ('public.begin_notification_email_attempt(uuid, text, bytea)', 'f|v', 'p_id uuid, p_owner text, p_snapshot bytea -> bytea'),
  ('public.notification_email_retry_state(uuid, text)', 'f|s',
   'p_id uuid, p_owner text -> TABLE(attempt_count integer, expired boolean)'),
  ('public.settle_ambiguous_notification_email(uuid, text, text, text)', 'f|v',
   'p_id uuid, p_owner text, p_outcome text, p_error_code text -> boolean'),
  ('public.purge_notification_email_outbox(integer)', 'f|v', 'p_limit integer -> integer');
SELECT is(
  (SELECT format('%s|%s|%s|%s', prosecdef, provolatile, proconfig,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = f.sig::regprocedure),
  f.mode || '|{"search_path=\"\""}|0',
  format('%s: security mode and volatility (%s), search_path pinned; ACL has no PUBLIC/anon/authenticated entry', f.sig, f.mode))
  FROM n15_fn f;
SELECT is(
  ARRAY(SELECT has_function_privilege(r, f.sig, 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false], format('EXECUTE on %s for service_role only', f.sig))
  FROM n15_fn f;
SELECT is(pg_get_function_arguments(f.sig::regprocedure) || ' -> ' || pg_get_function_result(f.sig::regprocedure), f.shape,
  format('parameter names, order and return shape of %s', f.sig))
  FROM n15_fn f;

-- Synthetic fixtures (postgres) and helpers
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('n15_a', 'n15-a@test.local');
  v_b uuid := tests.create_supabase_user('n15_b', 'n15-b@test.local');
  v_admin uuid := tests.create_supabase_user('n15_admin', 'n15-admin@test.local');
BEGIN
  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password) VALUES
    (v_a, 'n15-a@test.local', 'N15 A', 'approved', false),
    (v_b, 'n15-b@test.local', 'N15 B', 'approved', false),
    (v_admin, 'n15-admin@test.local', 'N15 Admin', 'approved', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_admin, 'admin', NULL, true);
  PERFORM set_config('n15.a', v_a::text, false);
  PERFORM set_config('n15.admin', v_admin::text, false);
  -- Rows other than these fixtures (none on a fresh stack) leave the due and purge windows, so results are exact.
  UPDATE public.notification_email_outbox SET next_attempt_at = now() + interval '1 day' WHERE next_attempt_at <= now();
  UPDATE public.notification_email_outbox SET completed_at = now() WHERE completed_at < now() - interval '90 days';
  UPDATE auth_security.password_recovery_outbox SET available_at = clock_timestamp() + interval '1 day'
   WHERE state IN ('queued', 'processing');
END
$fixture$;

-- ok..can are due and pending. h1..h4 are leased to w1 with a frozen snapshot
-- whose first attempt is 23h59m, exactly 24h, 3 days and 25h old; ns has no
-- snapshot (its first_attempt_at is set by hand); e1/e2 are leased to w1 but
-- the lease ran out; pn is not 'sending'.
-- p1..p5 are terminal and older than 90 days (p1 created first, p2 completed
-- first); k1..k4 must survive the purge: 89 days, exactly 90 days, and a
-- pending and a sending row whose completed_at is set by hand, so that only
-- the status keeps them.
INSERT INTO public.notification_email_outbox
  (id, idempotency_key, event_type, occurrence_id, user_id, category, email_mode, email_reason, payload, status,
   next_attempt_at, lease_owner, lease_expires_at, send_snapshot, first_attempt_at, attempt_count, completed_at, created_at)
SELECT ('15000000-0000-4000-8000-0000000000' || t.n)::uuid, 'n15-' || t.tag, 'n15_evt', 'occ:' || t.tag,
       current_setting('n15.a')::uuid, 'courses', 'immediate', 'catalog_default', '{"k": "v"}', t.status,
       now() + t.due, t.owner, now() + t.lease, t.snap, now() + t.first, t.cnt, now() + t.done, now() + coalesce(t.born, '0')
  FROM (VALUES
    ('01', 'ok', 'pending', interval '-50 minutes', NULL::text, NULL::interval, NULL::bytea, NULL::interval, 0, NULL::interval, NULL::interval),
    ('02', 'rej', 'pending', '-40 minutes', NULL, NULL, NULL, NULL, 0, NULL, NULL),
    ('03', 'dup', 'pending', '-30 minutes', NULL, NULL, NULL, NULL, 0, NULL, NULL),
    ('04', 'amb', 'pending', '-20 minutes', NULL, NULL, NULL, NULL, 0, NULL, NULL),
    ('05', 'can', 'pending', '-10 minutes', NULL, NULL, NULL, NULL, 0, NULL, NULL),
    ('11', 'h1', 'sending', '1 day', 'w1', '5 minutes', '\xa1', '-23 hours -59 minutes', 3, NULL, NULL),
    ('12', 'h2', 'sending', '1 day', 'w1', '5 minutes', '\xa2', '-24 hours', 4, NULL, NULL),
    ('13', 'h3', 'sending', '1 day', 'w1', '5 minutes', '\xa3', '-3 days', 5, NULL, NULL),
    ('14', 'h4', 'sending', '1 day', 'w1', '5 minutes', '\xa4', '-25 hours', 6, NULL, NULL),
    ('15', 'ns', 'sending', '1 day', 'w1', '5 minutes', NULL, '-2 days', 0, NULL, NULL),
    ('16', 'e1', 'sending', '1 day', 'w1', '0', '\xa6', '-1 hour', 1, NULL, NULL),
    ('17', 'e2', 'sending', '1 day', 'w1', '0', '\xa7', '-2 days', 2, NULL, NULL),
    ('18', 'pn', 'pending', '1 day', 'w1', '5 minutes', '\xa8', '-2 days', 2, NULL, NULL),
    ('21', 'p1', 'sent', '-1 day', NULL, NULL, NULL, NULL, 1, '-91 days', '-300 days'),
    ('22', 'p2', 'failed', '-1 day', NULL, NULL, NULL, NULL, 1, '-120 days', '-121 days'),
    ('23', 'p3', 'cancelled', '-1 day', NULL, NULL, NULL, NULL, 0, '-100 days', '-101 days'),
    ('24', 'p4', 'cancelled_after_ambiguous', '-1 day', NULL, NULL, NULL, NULL, 2, '-95 days', '-96 days'),
    ('25', 'p5', 'unknown', '-1 day', NULL, NULL, NULL, NULL, 9, '-90 days -1 second', '-91 days'),
    ('26', 'k1', 'sent', '-1 day', NULL, NULL, NULL, NULL, 1, '-89 days', '-200 days'),
    ('27', 'k2', 'failed', '-1 day', NULL, NULL, NULL, NULL, 1, '-90 days', '-200 days'),
    ('28', 'k3', 'pending', '1 day', NULL, NULL, NULL, NULL, 0, '-200 days', '-400 days'),
    ('29', 'k4', 'sending', '1 day', 'w1', '5 minutes', '\xa9', '-1 hour', 1, '-200 days', '-400 days')
  ) t(n, tag, status, due, owner, lease, snap, first, cnt, done, born);
INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id) VALUES
  ('15000000-0000-4000-8000-000000000021', 'course', '7'), ('15000000-0000-4000-8000-000000000023', 'quiz_submission', '42'),
  ('15000000-0000-4000-8000-000000000026', 'course', '8');

CREATE FUNCTION pg_temp.rid(t text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.notification_email_outbox WHERE idempotency_key = 'n15-' || t $$;
-- Claim; the tag and has_snapshot of each returned row, in returned order.
CREATE FUNCTION pg_temp.claim(o text, n integer, s integer) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(format('%s:%s', replace(c.idempotency_key, 'n15-', ''), c.has_snapshot) ORDER BY c.ord), '{}')
    FROM public.claim_notification_emails(o, n, s) WITH ORDINALITY
         c(id, idempotency_key, event_type, user_id, related_url, payload, has_snapshot, source_kind, source_id, ord) $$;
-- The worker fields of one row; times are relative to now().
CREATE FUNCTION pg_temp.st(t text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s owner=%s lease=%s err=%s msg=%s snap=%s n=%s first=%s next=%s done=%s',
           status, lease_owner, lease_expires_at - now(), last_error_code, provider_message_id,
           encode(send_snapshot, 'hex'), attempt_count, first_attempt_at - now(), next_attempt_at - now(), completed_at - now())
    FROM public.notification_email_outbox WHERE idempotency_key = 'n15-' || t $$;
CREATE FUNCTION pg_temp.img(t text) RETURNS text LANGUAGE sql AS $$
  SELECT o::text FROM public.notification_email_outbox o WHERE o.idempotency_key = 'n15-' || t $$;
CREATE FUNCTION pg_temp.img_all() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(o::text, ',' ORDER BY o.id)) FROM public.notification_email_outbox o $$;
-- begin / finish / settle on row t: 'result|same' when the whole row is byte-identical afterwards, else 'result|changed'.
CREATE FUNCTION pg_temp.bg(t text, o text, s bytea) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img(t); r bytea;
BEGIN
  r := public.begin_notification_email_attempt(pg_temp.rid(t), o, s);
  RETURN format('%s|%s', coalesce(encode(r, 'hex'), 'NULL'), CASE WHEN pg_temp.img(t) = v_img THEN 'same' ELSE 'changed' END);
END $$;
CREATE FUNCTION pg_temp.fin(t text, o text, outcome text, err text, msg text, retry integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img(t); r boolean;
BEGIN
  r := public.finish_notification_email(pg_temp.rid(t), o, outcome, err, msg, retry);
  RETURN format('%s|%s', r, CASE WHEN pg_temp.img(t) = v_img THEN 'same' ELSE 'changed' END);
END $$;
CREATE FUNCTION pg_temp.stl(t text, o text, outcome text, err text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img(t); r boolean;
BEGIN
  r := public.settle_ambiguous_notification_email(pg_temp.rid(t), o, outcome, err);
  RETURN format('%s|%s', r, CASE WHEN pg_temp.img(t) = v_img THEN 'same' ELSE 'changed' END);
END $$;
-- Retry state of row t as 'attempt_count:expired', or 'none' when no row comes back.
CREATE FUNCTION pg_temp.rs(t text, o text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s:%s', r.attempt_count, r.expired), ','), 'none')
    FROM public.notification_email_retry_state(pg_temp.rid(t), o) r $$;
-- The one recovery fixture row in a given shape (no row for a NULL state). SECURITY DEFINER: auth_security is
-- closed to service_role, so postgres writes it, directly in the table.
CREATE FUNCTION pg_temp.recovery(p_state text, p_due interval, p_attempts integer, p_lease interval) RETURNS void
LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM auth_security.password_recovery_outbox WHERE idempotency_key = 'password-recovery/n15';
  INSERT INTO auth_security.password_recovery_outbox
    (candidate_fingerprint, idempotency_key, state, available_at, provider_attempts, lease_token, lease_expires_at)
  SELECT repeat('f5', 32), 'password-recovery/n15', p_state, clock_timestamp() + p_due, p_attempts,
         CASE WHEN p_lease IS NOT NULL THEN '15000000-0000-4000-8000-0000000000aa'::uuid END, clock_timestamp() + p_lease
   WHERE p_state IS NOT NULL $$;
-- 'due|rows claimed|same or changed (the whole outbox)' under one recovery shape; claimed rows are released again.
CREATE FUNCTION pg_temp.gate(p_state text, p_due interval, p_attempts integer, p_lease interval) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text; v_due boolean; v_n integer; v_same boolean;
BEGIN
  PERFORM pg_temp.recovery(p_state, p_due, p_attempts, p_lease);
  v_img := pg_temp.img_all();
  v_due := public.password_recovery_email_due();
  v_n := cardinality(pg_temp.claim('wg', 100, 60));
  v_same := pg_temp.img_all() = v_img;
  UPDATE public.notification_email_outbox SET status = 'pending', lease_owner = NULL, lease_expires_at = NULL WHERE lease_owner = 'wg';
  RETURN format('%s|%s|%s', v_due, v_n, CASE WHEN v_same THEN 'same' ELSE 'changed' END);
END $$;
-- Try the outbox operations, the four new RPCs and the recovery table; return the SQLSTATEs.
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v_id uuid := '15000000-0000-4000-8000-0000000000ff';
BEGIN
  BEGIN PERFORM count(send_snapshot) FROM public.notification_email_outbox; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox (id, idempotency_key, event_type, occurrence_id, user_id, email_mode, email_reason)
        VALUES (v_id, 'n15-probe', 'n15_x', 'occ:p', current_setting('n15.a')::uuid, 'immediate', 'unmapped_event'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox SET next_attempt_at = now() + interval '1 day' WHERE id = v_id; s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.password_recovery_email_due(); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.notification_email_retry_state(v_id, 'n15-probe'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.settle_ambiguous_notification_email(v_id, 'n15-probe', 'cancelled_after_ambiguous', 'probe'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.purge_notification_email_outbox(1); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox WHERE id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM auth_security.password_recovery_outbox; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;

-- D4 — recovery priority (service_role). now() is fixed inside this transaction; the recovery clock is not.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.gate(t.state, t.due, t.attempts, t.lease), t.expect, 'D4: ' || t.label)
  FROM (VALUES
    (NULL::text, NULL::interval, NULL::integer, NULL::interval, 'f|5|changed', 'no recovery row: not due, the claim proceeds'),
    ('queued', '-1 second', 0, NULL, 't|0|same', 'a queued recovery row: due, the claim returns nothing and leases nothing'),
    ('queued', '-1 second', 7, NULL, 't|0|same', 'a queued recovery row with one attempt left: due'),
    ('processing', '-1 minute', 0, '1 minute', 't|0|same', 'a recovery row being sent under a live lease: due'),
    ('processing', '-1 minute', 0, '-1 second', 't|0|same', 'a processing recovery row whose lease ran out: due'),
    ('queued', '1 hour', 0, NULL, 'f|5|changed', 'a future recovery row: not due, the claim proceeds'),
    ('queued', '-1 second', 8, NULL, 'f|5|changed', 'an attempts-exhausted recovery row: not due'),
    ('processing', '-1 minute', 8, '1 minute', 'f|5|changed', 'an attempts-exhausted recovery row under a lease: not due'),
    ('discarded', '-1 minute', 0, NULL, 'f|5|changed', 'a discarded recovery row: not due'),
    ('provider_accepted', '-1 minute', 1, NULL, 'f|5|changed', 'an accepted recovery row: not due'),
    ('provider_rejected', '-1 minute', 1, NULL, 'f|5|changed', 'a rejected recovery row: not due'),
    ('delivered', '-1 minute', 1, NULL, 'f|5|changed', 'a delivered recovery row: not due'),
    ('bounced', '-1 minute', 1, NULL, 'f|5|changed', 'a bounced recovery row: not due'),
    ('dead', '-1 minute', 3, NULL, 'f|5|changed', 'a dead recovery row: not due')
  ) t(state, due, attempts, lease, expect, label);
SELECT pg_temp.recovery('queued', '-1 second', 0, NULL);
SELECT throws_ok($$SELECT public.claim_notification_emails(NULL, 1, 30)$$, '22023', NULL,
  'D4: argument validation still comes before the recovery gate');
SELECT pg_temp.recovery(NULL, NULL, NULL, NULL);

-- D1 — state transitions through claim, begin and finish (service_role)
SELECT is(pg_temp.claim('w1', 100, 60), ARRAY['ok:f', 'rej:f', 'dup:f', 'amb:f', 'can:f'],
  'D1: with no recovery mail due the five due rows are leased, in due order');
SELECT is(pg_temp.bg('ok', 'w1', '\x01') || ' ' || pg_temp.fin('ok', 'w1', 'sent', NULL, 'n15-msg', NULL) || ' ' || pg_temp.st('ok'),
  '01|changed t|changed sent owner= lease= err= msg=n15-msg snap= n=1 first=00:00:00 next=-00:50:00 done=00:00:00',
  'D1: accepted -> sent');
SELECT is(pg_temp.bg('rej', 'w1', '\x02') || ' ' || pg_temp.fin('rej', 'w1', 'failed', 'provider_rejected', NULL, NULL) || ' ' || pg_temp.st('rej'),
  '02|changed t|changed failed owner= lease= err=provider_rejected msg= snap= n=1 first=00:00:00 next=-00:40:00 done=00:00:00',
  'D1: definite rejection -> failed');
SELECT is(pg_temp.bg('dup', 'w1', '\x03') || ' ' || pg_temp.fin('dup', 'w1', 'failed', 'provider_conflict', NULL, NULL) || ' ' || pg_temp.st('dup'),
  '03|changed t|changed failed owner= lease= err=provider_conflict msg= snap= n=1 first=00:00:00 next=-00:30:00 done=00:00:00',
  'D3: a 409 -> failed / provider_conflict on its first response (one attempt)');
SELECT is(pg_temp.fin('can', 'w1', 'cancelled', 'recipient_missing', NULL, NULL) || ' ' || pg_temp.st('can'),
  't|changed cancelled owner= lease= err=recipient_missing msg= snap= n=0 first= next=-00:10:00 done=00:00:00',
  'D1: cancelled before any attempt');
SELECT is(pg_temp.bg('amb', 'w1', '\x0a0b') || ' ' || pg_temp.fin('amb', 'w1', 'retry', 'provider_5xx', NULL, 300) || ' ' || pg_temp.st('amb'),
  '0a0b|changed t|changed pending owner= lease= err=provider_5xx msg= snap=0a0b n=1 first=00:00:00 next=00:05:00 done=',
  'D1: ambiguous -> pending with the snapshot bytes and attempt count kept, lease released');
UPDATE public.notification_email_outbox SET next_attempt_at = now() WHERE idempotency_key = 'n15-amb';
SELECT is(pg_temp.claim('w2', 100, 60), ARRAY['amb:t'],
  'D1: the retried row, and only it, is claimed again under the same idempotency key with has_snapshot = true');
SELECT is(pg_temp.bg('amb', 'w2', '\xffff') || ' ' || pg_temp.rs('amb', 'w2'), '0a0b|changed 2:f',
  'D2: the retry gets the identical snapshot bytes, not the new ones; attempt_count = 2, not expired');

-- D2 — foreign owner, stale owner, not sending, unknown id: every call refuses and changes nothing.
-- h1 and e1 are younger than 24 hours, so begin and cancelled_after_ambiguous are refused for the owner alone;
-- h3 and e2 are older, so 'unknown' is.
SELECT is(ARRAY[pg_temp.bg(t.tag, t.o, '\xff'), pg_temp.rs(t.tag, t.o),
                pg_temp.stl(t.tag, t.o, 'cancelled_after_ambiguous', 'revoked'), pg_temp.stl(t.tag, t.o, 'unknown', 'ambiguous_24h')],
  ARRAY['NULL|same', 'none', 'f|same', 'f|same'], 'D2: begin, retry-state and settle refuse ' || t.label)
  FROM (VALUES
    ('h1', 'w2', 'a foreign owner (row younger than 24 hours)'), ('h3', 'w2', 'a foreign owner (expired row)'),
    ('e1', 'w1', 'an owner whose lease ran out (row younger than 24 hours)'),
    ('e2', 'w1', 'an owner whose lease ran out (expired row)'), ('pn', 'w1', 'a row that is not sending')
  ) t(tag, o, label);
SELECT is(
  ARRAY[(SELECT count(*)::text FROM public.notification_email_retry_state('15000000-0000-4000-8000-0000000000ee', 'w1')),
        public.settle_ambiguous_notification_email('15000000-0000-4000-8000-0000000000ee', 'w1', 'unknown', 'ambiguous_24h')::text,
        public.settle_ambiguous_notification_email(NULL, 'w1', 'unknown', 'ambiguous_24h')::text,
        public.settle_ambiguous_notification_email(pg_temp.rid('h3'), NULL, 'unknown', 'ambiguous_24h')::text],
  ARRAY['0', 'false', 'false', 'false'], 'D2: an unknown id gets no retry-state row; settle is false for an unknown or NULL id and a NULL owner');
SELECT set_config('n15.before', pg_temp.img_all(), false);
SELECT throws_ok(format('SELECT * FROM public.notification_email_retry_state(%s)', t.args), '22023', NULL, 'D2: retry-state rejects ' || t.label)
  FROM (VALUES ($$NULL, 'w1'$$, 'a NULL id'), ($$'15000000-0000-4000-8000-000000000013', NULL$$, 'a NULL owner')) t(args, label);
SELECT throws_ok(format($$SELECT public.settle_ambiguous_notification_email('15000000-0000-4000-8000-000000000013', 'w1', %s)$$, t.args),
                 '22023', NULL, 'D3: settle rejects ' || t.label)
  FROM (VALUES
    ($$NULL, 'gone'$$, 'a NULL outcome'), ($$'bogus', 'gone'$$, 'an unknown outcome'),
    ($$'sent', 'gone'$$, 'the sent outcome'), ($$'failed', 'gone'$$, 'the failed outcome'),
    ($$'cancelled', 'gone'$$, 'the cancelled outcome'), ($$'retry', 'gone'$$, 'the retry outcome'),
    ($$'unknown', NULL$$, 'a NULL error code'), ($$'unknown', ''$$, 'an empty error code'),
    ($$'unknown', 'Bad-Code'$$, 'a malformed error code'),
    (format($$'unknown', %L$$, repeat('e', 101)), 'an error code over 100 chars')
  ) t(args, label);
SELECT is(pg_temp.img_all(), current_setting('n15.before'), 'D3: the rejected calls changed no row');

-- D3 — the 24-hour limit (service_role; w1 holds the live lease of h1..h4 and ns)
SELECT is(ARRAY[pg_temp.rs('h1', 'w1'), pg_temp.rs('h2', 'w1'), pg_temp.rs('h3', 'w1'), pg_temp.rs('h4', 'w1'), pg_temp.rs('ns', 'w1')],
  ARRAY['3:f', '4:t', '5:t', '6:t', '0:f'],
  'D3: retry-state gives the attempt count; expired is false at 23h59m and without a snapshot, true at exactly 24h and beyond');
SELECT is(pg_temp.stl('h1', 'w1', 'unknown', 'ambiguous_24h'), 'f|same', 'D3: at 23h59m unknown is refused, row unchanged');
SELECT is(pg_temp.bg('h1', 'w1', '\xffff') || ' ' || pg_temp.st('h1'),
  'a1|changed sending owner=w1 lease=00:05:00 err= msg= snap=a1 n=4 first=-23:59:00 next=1 day done=',
  'D3: at 23h59m an attempt still begins, with the frozen bytes');
SELECT is(ARRAY[pg_temp.bg('h2', 'w1', NULL), pg_temp.bg('h3', 'w1', '\xff'), pg_temp.bg('h4', 'w1', NULL)],
  ARRAY['NULL|same', 'NULL|same', 'NULL|same'], 'D3: at exactly 24h and beyond begin returns NULL and changes nothing');
SELECT is(pg_temp.stl('ns', 'w1', 'cancelled_after_ambiguous', 'revoked') || ' ' || pg_temp.stl('ns', 'w1', 'unknown', 'ambiguous_24h'),
  'f|same f|same', 'D3: settle on a row without a snapshot is refused, whatever its age');
SELECT is(pg_temp.bg('ns', 'w1', '\x0c'), '0c|changed', 'D3: a row without a snapshot is not ambiguous: its first attempt still begins');
SELECT is(pg_temp.stl('h1', 'w1', 'cancelled_after_ambiguous', 'revoked') || ' ' || pg_temp.st('h1'),
  't|changed cancelled_after_ambiguous owner= lease= err=revoked msg= snap= n=4 first=-23:59:00 next=1 day done=00:00:00',
  'D3: cancelled_after_ambiguous is accepted before 24h: error code and completed_at set, snapshot and lease cleared');
SELECT is(pg_temp.stl('h2', 'w1', 'unknown', 'ambiguous_24h') || ' ' || pg_temp.st('h2'),
  't|changed unknown owner= lease= err=ambiguous_24h msg= snap= n=4 first=-1 days next=1 day done=00:00:00',
  'D3: unknown is accepted at exactly 24h, without another attempt');
SELECT is(pg_temp.stl('h3', 'w1', 'unknown', 'ambiguous_24h') || ' ' || pg_temp.stl('h4', 'w1', 'cancelled_after_ambiguous', 'revoked')
          || ' ' || pg_temp.stl('amb', 'w2', 'cancelled_after_ambiguous', 'revoked'),
  't|changed t|changed t|changed', 'D3: unknown beyond 24h; cancelled_after_ambiguous after 24h and on the retried row');
SELECT is(pg_temp.stl('h2', 'w1', 'unknown', 'ambiguous_24h') || ' ' || pg_temp.bg('h2', 'w1', '\x01') || ' '
          || pg_temp.fin('h4', 'w1', 'failed', 'late', NULL, NULL) || ' ' || pg_temp.rs('h4', 'w1'),
  'f|same NULL|same f|same none', 'D3: a settled row cannot be settled, begun or finished again and has no retry state');
SELECT is(
  ARRAY(SELECT format('%s:%s/%s/%s/%s', status, count(*), count(send_snapshot), count(lease_owner) + count(lease_expires_at), count(completed_at))
          FROM public.notification_email_outbox WHERE idempotency_key LIKE 'n15-%' AND completed_at = now() GROUP BY status ORDER BY status),
  ARRAY['cancelled:1/0/0/1', 'cancelled_after_ambiguous:3/0/0/3', 'failed:2/0/0/2', 'sent:1/0/0/1', 'unknown:2/0/0/2'],
  'D3: every terminal status (rows/snapshots/lease fields/completed_at): no snapshot, no lease, completed_at set');
UPDATE public.notification_email_outbox SET next_attempt_at = now() - interval '1 hour' WHERE idempotency_key LIKE 'n15-%' AND completed_at = now();
SELECT is(pg_temp.claim('w3', 100, 60), '{}'::text[], 'D3: terminal rows are never claimed again, even when due');

-- D5 — retention (service_role)
SELECT throws_ok(format('SELECT public.purge_notification_email_outbox(%s)', t.arg), '22023', NULL, 'D5: purge rejects ' || t.label)
  FROM (VALUES ('NULL', 'a NULL limit'), ('0', 'a zero limit'), ('-1', 'a negative limit'), ('5001', 'a limit over 5000')) t(arg, label);
SELECT is(public.purge_notification_email_outbox(2), 2, 'D5: the limit bounds one call');
SELECT is(ARRAY(SELECT replace(idempotency_key, 'n15-', '') FROM public.notification_email_outbox
                 WHERE idempotency_key ~ '^n15-p[0-9]$' ORDER BY idempotency_key),
  ARRAY['p3', 'p4', 'p5'], 'D5: the two oldest created rows went first');
SELECT is(public.purge_notification_email_outbox(5000), 3, 'D5: the remaining terminal rows older than 90 days are deleted (5000 is a valid limit)');
SELECT is(ARRAY(SELECT format('%s=%s', replace(idempotency_key, 'n15-', ''), status) FROM public.notification_email_outbox
                 WHERE idempotency_key ~ '^n15-[pk][0-9]$' ORDER BY idempotency_key),
  ARRAY['k1=sent', 'k2=failed', 'k3=pending', 'k4=sending'],
  'D5: all five terminal statuses are purged; 89 days, exactly 90 days, pending and sending rows survive');
SELECT is((SELECT count(*)::int FROM public.notification_email_outbox WHERE idempotency_key LIKE 'n15-%'), 17,
  'D5: no other row was deleted (terminal rows completed now, leased and pending rows)');
SELECT is(ARRAY(SELECT right(outbox_id::text, 2) FROM public.notification_email_outbox_source
                 WHERE outbox_id::text LIKE '15000000-0000-4000-8000-0000000000%' ORDER BY 1),
  ARRAY['26'], 'D5: the source rows of purged rows are gone (FK cascade); the survivor keeps its own');
SELECT is(public.purge_notification_email_outbox(1), 0, 'D5: nothing is left to purge');
RESET ROLE;

-- Role x operation matrix: outbox select(send_snapshot)/insert/update, recovery-due, retry-state, settle, purge,
-- outbox delete, and a direct read of the recovery outbox.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[9]), 'anon cannot read or write the outbox nor execute the four RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n15_a');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[9]), 'the authenticated recipient cannot read or write the outbox nor execute the four RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n15_b');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[9]), 'another authenticated user cannot read or write the outbox nor execute the four RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n15_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n15.admin'), 'role', 'authenticated',
  'email', 'n15-admin@test.local', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[9]), 'an authenticated admin cannot read or write the outbox nor execute the four RPCs');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), array_fill('ok'::text, ARRAY[8]) || '42501'::text,
  'service_role can do all of it, and learns the recovery state only through the boolean: the table itself stays closed');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.notification_email_outbox WHERE idempotency_key = 'n15-probe'), 0, 'no probe row survived');

SELECT * FROM finish();

ROLLBACK;
