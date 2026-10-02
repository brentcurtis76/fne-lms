-- =============================================================================
-- 103-notification-bounce-suppression.sql — NOTIF N3-06
-- Covers migration 20260930050000_notification_bounce_suppression.sql:
--   shape of the three tables (columns, keys, CHECKs, indexes, RLS, the one
--      restrictive policy, grants) and of the three new functions and the
--      replaced finish (security mode, volatility, pinned search_path, owner,
--      ACL, signature); the outbox keeps its single trigger
--   D1 a bounce suppresses exactly the address recorded for the row that
--      carries the provider id, once; a duplicate is a noop; a bounce that
--      arrives before the provider id is stored is applied by finish; recovery
--      answers as before; only 'sent' with a provider id records one
--   D2 an unknown provider id suppresses nothing; invalid ids are 22023; a
--      failed suppression write raises and rolls the whole call back; no
--      message echoes an argument
--   D3 the same address on two users is suppressed for both, another address
--      is not; an address change on an unfrozen row is recorded; a frozen
--      row's digest is final, a frozen retry included; stale owners write
--      nothing; invalid digests are 22023
--   D4 role x operation matrix (anon / authenticated recipient, other, admin:
--      42501 everywhere; service_role allowed). The concurrency proof (duplicate
--      events, bounce versus commit) is a two-session script, not pgTAP.
--   D5 no column can hold an address, a subject, a body or a user id; the
--      CHECKs refuse a raw address; evidence older than 90 days is deleted, at
--      most 20 per call; the outbox purge takes the address row and leaves the
--      suppression
-- Synthetic fixtures only (*@qa.local.test, fixed UUIDs 17000000-..., digests
-- are one hex character repeated). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(124);

-- Shape and privileges (postgres)
CREATE TEMP TABLE n17_tab (tab text, cols text[], cons text[], idx text[]) ON COMMIT DROP;
INSERT INTO n17_tab VALUES
  ('notification_email_outbox_address',
   ARRAY['outbox_id:uuid:t:', 'address_digest:text:t:', 'provider_message_id:text:f:', 'created_at:timestamp with time zone:t:now()'],
   ARRAY['digest_check:CHECK ((address_digest ~ ''^[0-9a-f]{64}$''::text))', 'outbox_id_fkey:f:notification_email_outbox:c',
         'pkey:PRIMARY KEY (outbox_id)',
         'provider_id_check:CHECK (((char_length(provider_message_id) >= 1) AND (char_length(provider_message_id) <= 255)))'],
   ARRAY['pkey:unique btree (outbox_id)', 'provider_id_idx:btree (provider_message_id) WHERE (provider_message_id IS NOT NULL)']),
  ('notification_email_suppressions',
   ARRAY['address_digest:text:t:', 'reason:text:t:''bounced''::text', 'created_at:timestamp with time zone:t:now()'],
   ARRAY['digest_check:CHECK ((address_digest ~ ''^[0-9a-f]{64}$''::text))', 'pkey:PRIMARY KEY (address_digest)',
         'reason_check:CHECK ((reason = ''bounced''::text))'],
   ARRAY['pkey:unique btree (address_digest)']),
  ('notification_email_bounce_events',
   ARRAY['provider_message_id:text:t:', 'first_seen_at:timestamp with time zone:t:now()', 'applied_at:timestamp with time zone:f:'],
   ARRAY['pkey:PRIMARY KEY (provider_message_id)',
         'provider_id_check:CHECK (((char_length(provider_message_id) >= 1) AND (char_length(provider_message_id) <= 256)))'],
   ARRAY['pkey:unique btree (provider_message_id)', 'seen_idx:btree (first_seen_at)']);
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s', a.attname, format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid))
          FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
         WHERE a.attrelid = format('public.%I', t.tab)::regclass AND a.attnum > 0 AND NOT a.attisdropped ORDER BY a.attnum),
  t.cols, format('D5: %s has exactly these columns (type, NOT NULL, default): no address, subject, body, user id or free text', t.tab))
  FROM n17_tab t;
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(c.conname, t.tab || '_', ''), CASE WHEN c.contype = 'f'
                 THEN format('f:%s:%s', (SELECT relname FROM pg_class WHERE oid = c.confrelid), c.confdeltype)
                 ELSE pg_get_constraintdef(c.oid) END)
          FROM pg_constraint c WHERE c.conrelid = format('public.%I', t.tab)::regclass ORDER BY c.conname),
  t.cons, format('D5: %s: primary key, CHECKs and (address table) the FK to the outbox ON DELETE CASCADE', t.tab))
  FROM n17_tab t;
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(c.relname, t.tab || '_', ''),
                      regexp_replace(pg_get_indexdef(i.indexrelid), '^.* USING ', CASE WHEN i.indisunique THEN 'unique ' ELSE '' END))
          FROM pg_index i JOIN pg_class c ON c.oid = i.indexrelid
         WHERE i.indrelid = format('public.%I', t.tab)::regclass ORDER BY c.relname),
  t.idx, format('D1: %s: indexes (the provider id index is partial and not unique)', t.tab))
  FROM n17_tab t;
SELECT tests.rls_enabled('public', t.tab) FROM n17_tab t;
SELECT is(
  (SELECT array_agg(format('%s:%s:%s:%s', polname, polcmd, polpermissive, polroles::regrole[]::text))
     FROM pg_policy WHERE polrelid = format('public.%I', t.tab)::regclass),
  ARRAY['forced_password_change_guard:*:f:{authenticated}'],
  format('D4: %s: the restrictive forced_password_change_guard is the only policy', t.tab))
  FROM n17_tab t;
SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = format('public.%I', t.tab)::regclass AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, format('D4: %s: no table grant to PUBLIC, anon or authenticated', t.tab))
  FROM n17_tab t;
SELECT is(
  ARRAY(SELECT has_table_privilege('service_role', format('public.%I', t.tab), p) FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
  ARRAY[true, true, true, true], format('D4: %s: service_role has SELECT/INSERT/UPDATE/DELETE', t.tab))
  FROM n17_tab t;

CREATE TEMP TABLE n17_fn (sig text, mode text, shape text) ON COMMIT DROP;
INSERT INTO n17_fn VALUES
  ('public.check_notification_email_address(uuid, text, text)', 'f|v', 'p_id uuid, p_owner text, p_address_digest text -> text'),
  ('public.record_notification_email_bounce(text)', 'f|v', 'p_provider_message_id text -> text'),
  ('public.notification_email_address_suppressed(text)', 'f|s', 'p_address_digest text -> boolean'),
  ('public.finish_notification_email(uuid, text, text, text, text, integer)', 'f|v',
   'p_id uuid, p_owner text, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer -> boolean');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', prosecdef, provolatile, proconfig, proowner::regrole,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = f.sig::regprocedure),
  f.mode || '|{"search_path=\"\""}|postgres|0',
  format('D4: %s: SECURITY INVOKER, volatility (%s), search_path pinned, owner postgres; ACL has no PUBLIC/anon/authenticated entry', f.sig, f.mode))
  FROM n17_fn f;
SELECT is(
  ARRAY(SELECT has_function_privilege(r, f.sig, 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false], format('D4: EXECUTE on %s for service_role only', f.sig))
  FROM n17_fn f;
SELECT is(pg_get_function_arguments(f.sig::regprocedure) || ' -> ' || pg_get_function_result(f.sig::regprocedure), f.shape,
  format('D1: parameter names, order and return shape of %s', f.sig))
  FROM n17_fn f;
SELECT is(
  (SELECT array_agg(format('%s:%s', t.tgname, p.proname)) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.notification_email_outbox'::regclass AND NOT t.tgisinternal),
  ARRAY['update_notification_email_outbox_updated_at:update_updated_at_column'],
  'D1: the outbox still has exactly the one updated_at trigger');

-- Synthetic fixtures (postgres) and helpers
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('n17_a', 'n17-a@qa.local.test');
  v_b uuid := tests.create_supabase_user('n17_b', 'n17-b@qa.local.test');
  v_admin uuid := tests.create_supabase_user('n17_admin', 'n17-admin@qa.local.test');
BEGIN
  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password) VALUES
    (v_a, 'n17-a@qa.local.test', 'N17 A', 'approved', false),
    (v_b, 'n17-b@qa.local.test', 'N17 B', 'approved', false),
    (v_admin, 'n17-admin@qa.local.test', 'N17 Admin', 'approved', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_admin, 'admin', NULL, true);
  PERFORM set_config('n17.a', v_a::text, false);
  PERFORM set_config('n17.b', v_b::text, false);
  PERFORM set_config('n17.admin', v_admin::text, false);
  -- Rows other than these fixtures (none on a fresh stack) leave the due, purge and cleaning windows, and no
  -- recovery mail is due, so results are exact.
  UPDATE public.notification_email_outbox SET next_attempt_at = now() + interval '1 day' WHERE next_attempt_at <= now();
  UPDATE public.notification_email_outbox SET completed_at = now() WHERE completed_at < now() - interval '90 days';
  UPDATE public.notification_email_bounce_events SET first_seen_at = now() WHERE first_seen_at < now() - interval '90 days';
  UPDATE auth_security.password_recovery_outbox SET available_at = clock_timestamp() + interval '1 day'
   WHERE state IN ('queued', 'processing');
END
$fixture$;

-- d1..pr are due and pending, in this order. d1 is the bounced row of user a; q1 the row whose bounce arrives
-- first; u2 and u3 belong to user b (same address as d1, another address); z1 is frozen before the bounce, z2
-- frozen without a recorded digest; n1 is never checked with a digest; f1..f7 are the finishes that must record
-- nothing and f8 the one sent under an id whose bounce is already applied; e1 and g1 serve the failing write; pr
-- is the probe row of the matrix.
-- xl is leased to w1 but the lease ran out; pn is not 'sending'; old is terminal and older than 90 days.
INSERT INTO public.notification_email_outbox
  (id, idempotency_key, event_type, occurrence_id, user_id, category, email_mode, email_reason, payload, status,
   next_attempt_at, lease_owner, lease_expires_at, completed_at, created_at)
SELECT ('17000000-0000-4000-8000-0000000000' || t.n)::uuid, 'n17-' || t.tag, 'n17_evt', 'occ:' || t.tag,
       current_setting('n17.' || t.u)::uuid, 'courses', 'immediate', 'catalog_default', '{"k": "v"}', t.status,
       now() + t.due, t.owner, now() + t.lease, now() + t.done, now() + coalesce(t.born, '0')
  FROM (VALUES
    ('01', 'd1', 'a', 'pending', interval '-59 minutes', NULL::text, NULL::interval, NULL::interval, NULL::interval),
    ('02', 'q1', 'a', 'pending', '-58 minutes', NULL, NULL, NULL, NULL), ('03', 'u2', 'b', 'pending', '-57 minutes', NULL, NULL, NULL, NULL),
    ('04', 'u3', 'b', 'pending', '-56 minutes', NULL, NULL, NULL, NULL), ('05', 'z1', 'a', 'pending', '-55 minutes', NULL, NULL, NULL, NULL),
    ('06', 'z2', 'a', 'pending', '-54 minutes', NULL, NULL, NULL, NULL), ('07', 'n1', 'a', 'pending', '-53 minutes', NULL, NULL, NULL, NULL),
    ('08', 'f1', 'a', 'pending', '-52 minutes', NULL, NULL, NULL, NULL), ('09', 'f2', 'a', 'pending', '-51 minutes', NULL, NULL, NULL, NULL),
    ('10', 'f3', 'a', 'pending', '-50 minutes', NULL, NULL, NULL, NULL), ('11', 'f4', 'a', 'pending', '-49 minutes', NULL, NULL, NULL, NULL),
    ('12', 'f5', 'a', 'pending', '-48 minutes', NULL, NULL, NULL, NULL), ('13', 'f6', 'a', 'pending', '-47 minutes', NULL, NULL, NULL, NULL),
    ('14', 'f7', 'a', 'pending', '-46 minutes', NULL, NULL, NULL, NULL), ('15', 'e1', 'a', 'pending', '-45 minutes', NULL, NULL, NULL, NULL),
    ('16', 'g1', 'a', 'pending', '-44 minutes', NULL, NULL, NULL, NULL), ('17', 'pr', 'a', 'pending', '-43 minutes', NULL, NULL, NULL, NULL),
    ('18', 'f8', 'a', 'pending', '-42 minutes', NULL, NULL, NULL, NULL),
    ('21', 'xl', 'a', 'sending', '1 day', 'w1', '-1 second', NULL, NULL),
    ('22', 'pn', 'a', 'pending', '1 day', 'w1', '5 minutes', NULL, NULL),
    ('23', 'old', 'a', 'sent', '-1 day', NULL, NULL, '-91 days', '-92 days')
  ) t(n, tag, u, status, due, owner, lease, done, born);

-- A synthetic digest: one hex character, 64 times; and its character back ('?' for anything else).
CREATE FUNCTION pg_temp.dg(c text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT repeat(c, 64) $$;
CREATE FUNCTION pg_temp.lt(d text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN d = repeat(left(d, 1), 64) THEN left(d, 1) ELSE '?' END $$;
CREATE FUNCTION pg_temp.rid(t text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.notification_email_outbox WHERE idempotency_key = 'n17-' || t $$;
-- Claim everything due; the tags in returned order.
CREATE FUNCTION pg_temp.claim(o text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(replace(c.idempotency_key, 'n17-', '') ORDER BY c.ord), '{}')
    FROM public.claim_notification_emails(o, 100, 300) WITH ORDINALITY
         c(id, idempotency_key, event_type, user_id, related_url, payload, has_snapshot, source_kind, source_id, ord) $$;
-- The three RPCs of the worker on row t: the check verdict ('NULL' for no answer), begin (true = a snapshot is
-- stored) and finish.
CREATE FUNCTION pg_temp.chk(t text, o text, d text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(public.check_notification_email_address(pg_temp.rid(t), o, d), 'NULL') $$;
CREATE FUNCTION pg_temp.bg(t text, o text) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.begin_notification_email_attempt(pg_temp.rid(t), o, '\x17') IS NOT NULL $$;
CREATE FUNCTION pg_temp.fin(t text, o text, outcome text, err text, msg text, retry integer) RETURNS boolean LANGUAGE sql AS $$
  SELECT public.finish_notification_email(pg_temp.rid(t), o, outcome, err, msg, retry) $$;
-- What is stored: the address row of t as 'digest|provider id' ('none' without a row), the outbox row as
-- 'status/provider id', the suppression list, and one evidence row (applied, unapplied, none).
CREATE FUNCTION pg_temp.addr(t text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT format('%s|%s', pg_temp.lt(a.address_digest), a.provider_message_id)
                     FROM public.notification_email_outbox_address a WHERE a.outbox_id = pg_temp.rid(t)), 'none') $$;
CREATE FUNCTION pg_temp.st(t text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s/%s', status, provider_message_id) FROM public.notification_email_outbox WHERE idempotency_key = 'n17-' || t $$;
CREATE FUNCTION pg_temp.sup() RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(pg_temp.lt(s.address_digest) || ':' || s.reason, ',' ORDER BY s.address_digest), '')
    FROM public.notification_email_suppressions s $$;
CREATE FUNCTION pg_temp.ev(p text) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT CASE WHEN e.applied_at IS NULL THEN 'unapplied' ELSE 'applied' END
                     FROM public.notification_email_bounce_events e WHERE e.provider_message_id = p), 'none') $$;
-- The whole state of the three tables, and of the three tables and the outbox. ctid is part of the image, so
-- an UPDATE that rewrites a row with the same values is seen too.
CREATE FUNCTION pg_temp.s3() RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce((SELECT string_agg(a.ctid::text || a::text, ',' ORDER BY a.outbox_id) FROM public.notification_email_outbox_address a), ''))
      || md5(coalesce((SELECT string_agg(s.ctid::text || s::text, ',' ORDER BY s.address_digest) FROM public.notification_email_suppressions s), ''))
      || md5(coalesce((SELECT string_agg(e.ctid::text || e::text, ',' ORDER BY e.provider_message_id)
                         FROM public.notification_email_bounce_events e), '')) $$;
CREATE FUNCTION pg_temp.s4() RETURNS text LANGUAGE sql AS $$
  SELECT pg_temp.s3() || md5(coalesce((SELECT string_agg(o.ctid::text || o::text, ',' ORDER BY o.id) FROM public.notification_email_outbox o), '')) $$;
-- Try the four RPCs and every operation on the three tables; return the SQLSTATEs. Whatever it writes it deletes.
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v_pr uuid := '17000000-0000-4000-8000-000000000017'; v_no uuid := '17000000-0000-4000-8000-0000000000ee';
        v_f text := repeat('f', 64);
BEGIN
  BEGIN PERFORM public.check_notification_email_address(v_no, 'n17-probe', v_f); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.record_notification_email_bounce('n17-probe-rpc'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.notification_email_address_suppressed(v_f); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.finish_notification_email(v_no, 'n17-probe', 'retry', 'probe', NULL, 60); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_email_outbox_address; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox_address (outbox_id, address_digest) VALUES (v_pr, v_f); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox_address SET provider_message_id = 'n17-probe' WHERE outbox_id = v_pr; s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox_address WHERE outbox_id = v_pr; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_email_suppressions; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_suppressions (address_digest) VALUES (v_f); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_suppressions SET created_at = now() - interval '1 day' WHERE address_digest = v_f; s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_suppressions WHERE address_digest = v_f; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_email_bounce_events; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_bounce_events (provider_message_id) VALUES ('n17-probe'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_bounce_events SET applied_at = now() WHERE provider_message_id = 'n17-probe'; s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_bounce_events WHERE provider_message_id IN ('n17-probe', 'n17-probe-rpc'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;
-- The address row of the old terminal row (D5 purge), written by hand.
INSERT INTO public.notification_email_outbox_address (outbox_id, address_digest, provider_message_id)
VALUES (pg_temp.rid('old'), pg_temp.dg('a'), 'n17-msg-old');
-- Test-only: while n17.refuse is 'on', no suppression can be written (D2 atomicity).
CREATE FUNCTION pg_temp.refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'n17: suppression refused'; END $$;
CREATE TRIGGER n17_refuse BEFORE INSERT ON public.notification_email_suppressions
  FOR EACH ROW WHEN (current_setting('n17.refuse', true) = 'on') EXECUTE FUNCTION pg_temp.refuse();

-- D1 — claim, check, begin, finish, bounce (service_role). now() is fixed inside this transaction.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.claim('w1'),
  ARRAY['d1', 'q1', 'u2', 'u3', 'z1', 'z2', 'n1', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'e1', 'g1', 'pr', 'f8'],
  'D1: the worker claims the eighteen due rows');
SELECT is(
  ARRAY[pg_temp.chk('d1', 'w1', pg_temp.dg('a')), pg_temp.chk('u2', 'w1', pg_temp.dg('a')), pg_temp.chk('u3', 'w1', pg_temp.dg('b')),
        pg_temp.chk('z1', 'w1', pg_temp.dg('a')), pg_temp.chk('q1', 'w1', pg_temp.dg('c')), pg_temp.chk('e1', 'w1', pg_temp.dg('e')),
        pg_temp.chk('g1', 'w1', pg_temp.dg('1'))]
  || ARRAY(SELECT pg_temp.chk(t, 'w1', pg_temp.dg('d')) FROM unnest(ARRAY['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f8']) t),
  array_fill('clear'::text, ARRAY[14]), 'D3: before any bounce, the first check of every row answers clear');
SELECT is(ARRAY[pg_temp.addr('d1'), pg_temp.addr('u2'), pg_temp.addr('u3'), pg_temp.addr('z1'), pg_temp.addr('q1'), pg_temp.addr('f1'),
                pg_temp.addr('z2'), pg_temp.addr('n1'), pg_temp.addr('f7')],
  ARRAY['a|', 'a|', 'b|', 'a|', 'c|', 'd|', 'none', 'none', 'none'],
  'D3: each check recorded its digest and no provider id (users a and b share digest a; a third row has b); unchecked rows have no address row');
SELECT is(ARRAY(SELECT pg_temp.bg(t, 'w1') FROM unnest(ARRAY['d1', 'q1', 'z1', 'z2', 'f1', 'f2', 'f3', 'f5', 'f6', 'f7', 'f8', 'e1', 'g1']) t),
  array_fill(true, ARRAY[13]), 'D1: the attempts begin as before (snapshot frozen)');
SELECT is(pg_temp.fin('d1', 'w1', 'sent', NULL, 'n17-msg-p', NULL), true, 'D1: finish sent with provider id P returns true');
SELECT is(ARRAY[pg_temp.st('d1'), pg_temp.addr('d1'), pg_temp.sup(), pg_temp.ev('n17-msg-p')], ARRAY['sent/n17-msg-p', 'a|n17-msg-p', '', 'none'],
  'D1: P is stored on the outbox row and next to the row''s digest; without a bounce nothing is suppressed and no evidence exists');
SELECT is(public.record_notification_email_bounce('n17-msg-p'), 'suppressed', 'D1: the bounce of P answers suppressed');
SELECT is(ARRAY[pg_temp.sup(), pg_temp.ev('n17-msg-p')], ARRAY['a:bounced', 'applied'],
  'D1: exactly one suppression row, the digest recorded for the row that carries P; the evidence is applied');
SELECT set_config('n17.s3', pg_temp.s3(), false);
SELECT is(public.record_notification_email_bounce('n17-msg-p'), 'noop', 'D1: a duplicate bounce of P is a noop');
SELECT is(pg_temp.s3(), current_setting('n17.s3'), 'D1: and the address, suppression and evidence tables are byte-identical');

-- D1 — the bounce arrives before the provider id is stored
SELECT is(public.record_notification_email_bounce('n17-msg-q'), 'pending', 'D1: a bounce of Q before any row carries Q answers pending');
SELECT is(ARRAY[pg_temp.sup(), pg_temp.ev('n17-msg-q'), pg_temp.addr('q1')], ARRAY['a:bounced', 'unapplied', 'c|'],
  'D1: nothing new is suppressed; the evidence is kept, not applied');
SELECT is(pg_temp.fin('q1', 'w1', 'sent', NULL, 'n17-msg-q', NULL), true, 'D1: finish sent with Q still returns true');
SELECT is(ARRAY[pg_temp.sup(), pg_temp.ev('n17-msg-q'), pg_temp.addr('q1'), pg_temp.st('q1')],
  ARRAY['a:bounced,c:bounced', 'applied', 'c|n17-msg-q', 'sent/n17-msg-q'],
  'D1: that same call suppressed the row''s digest and applied the evidence');
SELECT set_config('n17.s3', pg_temp.s3(), false);
SELECT is(ARRAY[public.record_notification_email_bounce('n17-msg-q'), pg_temp.s3()], ARRAY['noop', current_setting('n17.s3')],
  'D1: a later bounce of Q is a noop and leaves the three tables byte-identical');

-- D1 — recovery is untouched, and a delivery reverses nothing
SELECT is(ARRAY[public.record_password_recovery_delivery('n17-msg-p', 'delivered'), public.record_password_recovery_delivery('n17-msg-p', 'bounced')],
  ARRAY['pending', 'pending'], 'D1: the recovery RPC answers pending for P, delivered and bounced, as it does today');
SELECT is(ARRAY[pg_temp.s3(), pg_temp.sup()], ARRAY[current_setting('n17.s3'), 'a:bounced,c:bounced'],
  'D1: and the three tables are byte-identical: no suppression was added or removed');

-- D1 — only 'sent' with a provider id records one, and only waiting evidence is reconciled. Evidence for X is
-- waiting; f1..f6 and f8 carry digest d, f7 none.
SELECT is(public.record_notification_email_bounce('n17-msg-x'), 'pending', 'D1: evidence for X is waiting (pending)');
SELECT set_config('n17.s3', pg_temp.s3(), false);
SELECT is(
  ARRAY[pg_temp.fin('f1', 'w1', 'retry', 'provider_5xx', 'n17-msg-x', 300), pg_temp.fin('f2', 'w1', 'failed', 'provider_rejected', 'n17-msg-x', NULL),
        pg_temp.fin('f3', 'w1', 'cancelled', 'recipient_missing', 'n17-msg-x', NULL), pg_temp.fin('f4', 'w1', 'digest', NULL, 'n17-msg-x', NULL),
        pg_temp.fin('f5', 'w1', 'sent', NULL, NULL, NULL), pg_temp.fin('f6', 'w1', 'sent', NULL, '', NULL),
        pg_temp.fin('f7', 'w1', 'sent', NULL, 'n17-msg-x', NULL)],
  array_fill(true, ARRAY[7]),
  'D1: finish applies retry, failed, cancelled and digest passing X, sent with a NULL and an empty id, and sent with X on a row without a digest');
SELECT is(ARRAY(SELECT pg_temp.st(t) FROM unnest(ARRAY['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7']) t),
  ARRAY['pending/', 'failed/', 'cancelled/', 'pending/', 'sent/', 'sent/', 'sent/n17-msg-x'], 'D1: the outbox rows are as finish always left them');
SELECT is(ARRAY[pg_temp.s3(), pg_temp.ev('n17-msg-x'), pg_temp.addr('f1'), pg_temp.addr('f6')], ARRAY[current_setting('n17.s3'), 'unapplied', 'd|', 'd|'],
  'D1: none of them recorded a provider id or suppressed anything: the three tables are byte-identical');
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT is(ARRAY[pg_temp.fin('z1', 'w9', 'sent', NULL, 'n17-msg-x', NULL)::text, pg_temp.s4()], ARRAY['false', current_setting('n17.s4')],
  'D1: finish sent with X by another owner is refused and writes nothing, although its row has a digest');
SELECT is(ARRAY[pg_temp.fin('f8', 'w1', 'sent', NULL, 'n17-msg-p', NULL)::text, pg_temp.addr('f8'), pg_temp.sup(), pg_temp.ev('n17-msg-x')],
  ARRAY['true', 'd|n17-msg-p', 'a:bounced,c:bounced', 'unapplied'],
  'D1: a row sent under an id whose bounce is already applied stores the id; finish reconciles waiting evidence only, so nothing is suppressed');

-- D2 — unknown and invalid provider ids (service_role)
SELECT is(ARRAY[public.record_notification_email_bounce('n17-msg-unknown'), public.record_notification_email_bounce(pg_temp.dg('e')),
                public.record_notification_email_bounce(pg_temp.rid('e1')::text), public.record_notification_email_bounce(repeat('p', 256))],
  array_fill('pending'::text, ARRAY[4]),
  'D2: an unknown provider id, a recorded digest or an outbox id passed as the id, and a 256-character id are pending');
SELECT is(ARRAY[pg_temp.sup(), pg_temp.ev('n17-msg-unknown'), (SELECT count(*)::text FROM public.notification_email_outbox_address)],
  ARRAY['a:bounced,c:bounced', 'unapplied', '15'], 'D2: they suppressed nothing, whatever the fifteen digests recorded for other rows');
SELECT set_config('n17.s3', pg_temp.s3(), false);
SELECT throws_ok(format('SELECT public.record_notification_email_bounce(%s)', t.arg), '22023',
    'record_notification_email_bounce: invalid provider message id (1..256 characters)', 'D2: the bounce RPC rejects ' || t.label)
  FROM (VALUES ('NULL', 'a NULL id'), ($$''$$, 'an empty id'), (format('%L', repeat('p', 257)), 'a 257-character id')) t(arg, label);
SELECT is(pg_temp.s3(), current_setting('n17.s3'), 'D2: the rejected calls left the three tables byte-identical; the message names no argument');

-- D2 — a failing suppression write. e1 (digest e) is sent with E; g1 (digest 1) is still sending and the bounce
-- of G is waiting. throws_ok runs each call in a subtransaction.
SELECT is(ARRAY[pg_temp.fin('e1', 'w1', 'sent', NULL, 'n17-msg-e', NULL)::text, public.record_notification_email_bounce('n17-msg-g')],
  ARRAY['true', 'pending'], 'D2: E is stored on its row; the bounce of G is pending');
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT set_config('n17.refuse', 'on', false);
SELECT throws_ok($$SELECT public.record_notification_email_bounce('n17-msg-e')$$, 'P0001', 'n17: suppression refused',
  'D2: a failing suppression write makes the bounce RPC raise');
SELECT throws_ok(format($$SELECT public.finish_notification_email(%L, 'w1', 'sent', NULL, 'n17-msg-g', NULL)$$, pg_temp.rid('g1')),
  'P0001', 'n17: suppression refused', 'D2: and makes the finish that would reconcile a waiting bounce raise');
SELECT is(ARRAY[pg_temp.s4(), pg_temp.ev('n17-msg-e'), pg_temp.st('g1'), pg_temp.addr('g1')],
  ARRAY[current_setting('n17.s4'), 'none', 'sending/', '1|'],
  'D2: both calls rolled back whole: no evidence row for E, the row of G still sending without a provider id, everything byte-identical');
SELECT set_config('n17.refuse', 'off', false);
SELECT is(ARRAY[public.record_notification_email_bounce('n17-msg-e'), pg_temp.fin('g1', 'w1', 'sent', NULL, 'n17-msg-g', NULL)::text, pg_temp.sup()],
  ARRAY['suppressed', 'true', '1:bounced,a:bounced,c:bounced,e:bounced'], 'D2: the same calls succeed once the write no longer fails');

-- D3 — the same address on two users, another address, an address change (service_role)
SELECT is(ARRAY[pg_temp.chk('u2', 'w1', pg_temp.dg('a')), pg_temp.chk('u3', 'w1', pg_temp.dg('b'))], ARRAY['suppressed', 'clear'],
  'D3: after the bounce of user a''s row, user b''s row to the same address is suppressed; a row to another address is clear');
SELECT is(ARRAY[public.notification_email_address_suppressed(pg_temp.dg('a')), public.notification_email_address_suppressed(pg_temp.dg('b'))],
  ARRAY[true, false], 'D4: notification_email_address_suppressed answers true for the bounced digest and false for another');
-- z1 was frozen with digest a before the bounce.
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT is(ARRAY[pg_temp.chk('z1', 'w1', NULL), pg_temp.chk('z1', 'w1', pg_temp.dg('b')), pg_temp.addr('z1')], ARRAY['suppressed', 'suppressed', 'a|'],
  'D3: a frozen row answers with its recorded digest, with a NULL argument and with another digest: suppressed, digest unchanged');
SELECT is(ARRAY[pg_temp.chk('z2', 'w1', NULL), pg_temp.chk('z2', 'w1', pg_temp.dg('b')), pg_temp.addr('z2')], ARRAY['unrecorded', 'unrecorded', 'none'],
  'D3: a frozen row with no recorded digest is unrecorded, and a digest passed now is not recorded');
SELECT is(ARRAY[pg_temp.chk('n1', 'w1', NULL), pg_temp.addr('n1')], ARRAY['unrecorded', 'none'], 'D3: an unfrozen row checked with a NULL digest is unrecorded');
SELECT is(pg_temp.s4(), current_setting('n17.s4'), 'D3: none of those checks wrote anything');
-- u2 and z1 are released and claimed again by w2: u2 unfrozen (its user changed address), z1 a frozen retry.
SELECT is(ARRAY[pg_temp.fin('u2', 'w1', 'retry', 'address_suppressed', NULL, 60), pg_temp.fin('z1', 'w1', 'retry', 'provider_5xx', NULL, 60)],
  ARRAY[true, true], 'D3: both rows are released for a retry');
UPDATE public.notification_email_outbox SET next_attempt_at = now() WHERE idempotency_key IN ('n17-u2', 'n17-z1');
SELECT is(pg_temp.claim('w2'), ARRAY['u2', 'z1'], 'D3: and claimed again by another worker, and only they');
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT is(ARRAY[pg_temp.chk('u2', 'w2', NULL), pg_temp.addr('u2'), pg_temp.s4()], ARRAY['unrecorded', 'a|', current_setting('n17.s4')],
  'D3: an unfrozen row with an earlier digest, checked with NULL, is unrecorded and nothing is written');
SELECT is(ARRAY[pg_temp.chk('u2', 'w2', pg_temp.dg('b')), pg_temp.addr('u2')], ARRAY['clear', 'b|'],
  'D3: address change on an unfrozen row: checked with the new digest it is clear and the recorded digest is replaced');
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT is(ARRAY[pg_temp.chk('z1', 'w2', pg_temp.dg('b')), pg_temp.chk('z1', 'w2', NULL), pg_temp.addr('z1'), pg_temp.s4()],
  ARRAY['suppressed', 'suppressed', 'a|', current_setting('n17.s4')],
  'D3: a frozen retry stays suppressed whatever digest the new worker passes: the recorded digest is final, nothing is written');
SELECT is(pg_temp.bg('u3', 'w1'), true, 'D3: the row with digest b is frozen');
SELECT set_config('n17.s4', pg_temp.s4(), false);
SELECT is(ARRAY[pg_temp.chk('u3', 'w1', pg_temp.dg('a')), pg_temp.chk('u3', 'w1', NULL), pg_temp.addr('u3'), pg_temp.s4()],
  ARRAY['clear', 'clear', 'b|', current_setting('n17.s4')],
  'D3: a frozen row with a clear digest stays clear when a suppressed digest is passed: the argument is ignored');

-- D3 — no answer and no write for anyone but the live owner; invalid arguments
SELECT is(pg_temp.chk(t.tag, t.o, pg_temp.dg('b')), 'NULL', 'D3: the check gives no answer for ' || t.label)
  FROM (VALUES ('n1', 'w9', 'another owner'), ('u2', 'w1', 'a former owner (the row is leased to another worker)'),
               ('xl', 'w1', 'an owner whose lease ran out'), ('pn', 'w1', 'a row that is not sending'),
               ('d1', 'w1', 'a row that is already sent')) t(tag, o, label);
SELECT is(public.check_notification_email_address('17000000-0000-4000-8000-0000000000ee', 'w1', pg_temp.dg('b')), NULL,
  'D3: the check gives no answer for an unknown id');
SELECT is(pg_temp.s4(), current_setting('n17.s4'), 'D3: none of those calls wrote anything');
SELECT throws_ok(format('SELECT public.check_notification_email_address(%s)', format(t.args, pg_temp.rid('n1'))), '22023',
    'check_notification_email_address: invalid id, owner or address digest (64 lowercase hex characters)', 'D3: the check rejects ' || t.label)
  FROM (VALUES
    (format($$%%L, 'w1', %L$$, repeat('A', 64)), 'uppercase hex'), (format($$%%L, 'w1', %L$$, repeat('a', 63)), '63 characters'),
    (format($$%%L, 'w1', %L$$, repeat('a', 65)), '65 characters'), ($$%L, 'w1', 'x@qa.local.test'$$, 'a raw address'),
    (format($$%%L, 'w1', %L$$, repeat('a', 64) || E'\n'), '64 hex characters and a newline'), ($$%L, 'w1', ''$$, 'an empty digest'),
    (format($$NULL, 'w1', %L$$, repeat('b', 64)), 'a NULL id'), (format($$%%L, NULL, %L$$, repeat('b', 64)), 'a NULL owner')
  ) t(args, label);
SELECT throws_ok(format('SELECT public.notification_email_address_suppressed(%s)', t.arg), '22023',
    'notification_email_address_suppressed: invalid address digest (64 lowercase hex characters)', 'D3: the read contract rejects ' || t.label)
  FROM (VALUES ('NULL', 'a NULL digest'), (format('%L', repeat('A', 64)), 'uppercase hex'), (format('%L', repeat('a', 63)), '63 characters'),
               ($$'x@qa.local.test'$$, 'a raw address')) t(arg, label);
SELECT is(ARRAY[pg_temp.s4(), pg_temp.addr('n1')], ARRAY[current_setting('n17.s4'), 'none'],
  'D3: the rejected calls wrote nothing; both messages are fixed texts that name no argument');

-- D5 — the CHECKs refuse a raw address wherever a digest could be written, and any free text (service_role)
SELECT throws_ok(format(t.stmt, pg_temp.rid(t.tag)), '23514', NULL, 'D5: ' || t.label)
  FROM (VALUES
    ($$INSERT INTO public.notification_email_outbox_address (outbox_id, address_digest) VALUES (%L, 'x@qa.local.test')$$, 'n1',
     'the address table refuses a raw address on INSERT'),
    ($$UPDATE public.notification_email_outbox_address SET address_digest = 'x@qa.local.test' WHERE outbox_id = %L$$, 'z1',
     'the address table refuses a raw address on UPDATE'),
    ($$INSERT INTO public.notification_email_suppressions (address_digest) VALUES ('x@qa.local.test')$$, 'n1',
     'the suppression table refuses a raw address'),
    (format($$INSERT INTO public.notification_email_suppressions (address_digest) VALUES (%L)$$, repeat('F', 64)), 'n1',
     'the suppression table refuses uppercase hex'),
    (format($$INSERT INTO public.notification_email_suppressions (address_digest, reason) VALUES (%L, 'x@qa.local.test')$$, repeat('f', 64)), 'n1',
     'the suppression table refuses a reason other than bounced'),
    ($$UPDATE public.notification_email_outbox_address SET provider_message_id = '' WHERE outbox_id = %L$$, 'z1',
     'the address table refuses an empty provider id'),
    (format($$UPDATE public.notification_email_outbox_address SET provider_message_id = %L WHERE outbox_id = %%L$$, repeat('p', 256)), 'z1',
     'the address table refuses a 256-character provider id'),
    ($$INSERT INTO public.notification_email_bounce_events (provider_message_id) VALUES ('')$$, 'n1', 'the evidence table refuses an empty provider id'),
    (format($$INSERT INTO public.notification_email_bounce_events (provider_message_id) VALUES (%L)$$, repeat('p', 257)), 'n1',
     'the evidence table refuses a 257-character provider id')
  ) t(stmt, tag, label);
SELECT is(pg_temp.s4(), current_setting('n17.s4'), 'D5: the refused writes changed nothing');

-- D5 — self-cleaning. 25 evidence rows older than 90 days (old-25 the oldest, every second one applied), one
-- exactly 90 days old and one 89 days old.
INSERT INTO public.notification_email_bounce_events (provider_message_id, first_seen_at, applied_at)
SELECT 'n17-old-' || lpad(i::text, 2, '0'), now() - interval '90 days' - i * interval '1 minute', CASE WHEN i % 2 = 0 THEN now() END
  FROM generate_series(1, 25) i
UNION ALL SELECT 'n17-keep-90', now() - interval '90 days', NULL
UNION ALL SELECT 'n17-keep-89', now() - interval '89 days', now();
SELECT set_config('n17.recent', (SELECT count(*)::text FROM public.notification_email_bounce_events WHERE provider_message_id NOT LIKE 'n17-old-%'), false);
SELECT is(public.record_notification_email_bounce('n17-msg-unknown'), 'pending', 'D5: one more bounce call (a duplicate of an unknown id)');
SELECT is(ARRAY(SELECT provider_message_id FROM public.notification_email_bounce_events WHERE provider_message_id LIKE 'n17-old-%' ORDER BY 1),
  ARRAY['n17-old-01', 'n17-old-02', 'n17-old-03', 'n17-old-04', 'n17-old-05'],
  'D5: it deleted the 20 oldest evidence rows older than 90 days, applied or not, and no more');
SELECT is(public.record_notification_email_bounce('n17-msg-q'), 'noop', 'D5: and one more (a duplicate of a matched id)');
SELECT is(ARRAY[(SELECT count(*)::text FROM public.notification_email_bounce_events WHERE provider_message_id LIKE 'n17-old-%'),
                (SELECT count(*)::text FROM public.notification_email_bounce_events WHERE provider_message_id NOT LIKE 'n17-old-%'),
                pg_temp.ev('n17-keep-90'), pg_temp.ev('n17-keep-89'), pg_temp.ev('n17-msg-p'), pg_temp.ev('n17-msg-x')],
  ARRAY['0', current_setting('n17.recent'), 'unapplied', 'applied', 'applied', 'unapplied'],
  'D5: the rest is gone; evidence exactly 90 days old and newer is kept, every row of this test included');

-- D5 — the outbox purge takes the address row with it and leaves the suppression
SELECT is(ARRAY[pg_temp.addr('old'), public.purge_notification_email_outbox(100)::text], ARRAY['a|n17-msg-old', '1'],
  'D5: the old terminal row has an address row with a suppressed digest, and the purge deletes that outbox row');
SELECT is(ARRAY[(SELECT count(*)::text FROM public.notification_email_outbox_address WHERE outbox_id = '17000000-0000-4000-8000-000000000023'),
                (SELECT count(*)::text FROM public.notification_email_outbox_address), pg_temp.sup()],
  ARRAY['0', '14', '1:bounced,a:bounced,c:bounced,e:bounced'],
  'D5: its address row went with it (FK cascade), no other did, and every suppression is still in place');
RESET ROLE;

-- D4 — role x operation matrix: the four RPCs, then select/insert/update/delete on each of the three tables.
SELECT set_config('n17.s4', pg_temp.s4(), false);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[16]), 'D4: anon cannot execute the four RPCs nor read or write the three tables');
RESET ROLE;
SELECT tests.authenticate_as('n17_a');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[16]),
  'D4: the authenticated recipient cannot execute the four RPCs nor read or write the three tables');
RESET ROLE;
SELECT tests.authenticate_as('n17_b');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[16]),
  'D4: another authenticated user cannot execute the four RPCs nor read or write the three tables');
RESET ROLE;
SELECT tests.authenticate_as('n17_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n17.admin'), 'role', 'authenticated',
  'email', 'n17-admin@qa.local.test', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[16]),
  'D4: an authenticated admin cannot execute the four RPCs nor read or write the three tables');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.s4(), current_setting('n17.s4'), 'D4: the denied attempts changed nothing');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), array_fill('ok'::text, ARRAY[16]), 'D4: service_role can execute the four RPCs and read and write the three tables');
RESET ROLE;
SELECT is(pg_temp.s4(), current_setting('n17.s4'), 'D4: and its probe left no row behind');

SELECT * FROM finish();

ROLLBACK;
