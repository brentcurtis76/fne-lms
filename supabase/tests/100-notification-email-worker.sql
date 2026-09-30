-- =============================================================================
-- 100-notification-email-worker.sql — NOTIF N3-03
-- Covers migration 20260930020000_notification_email_worker_claim.sql:
--   D1 source table shape/RLS/grants/CHECKs/cascade; the three worker RPCs are
--      SECURITY INVOKER, pinned search_path, VOLATILE, EXECUTE for service_role
--      only; role x operation matrix (anon / authenticated owner, other, admin:
--      42501; service_role allowed); claim: limit, order, disjoint owners,
--      SKIP LOCKED in the definition, digest/future/terminal/live-lease rows
--      never returned, expired lease re-claimed; stale owner changes nothing
--   D3 the send snapshot is frozen on the first attempt and returned unchanged
--      afterwards; retry keeps it, every terminal outcome clears it; it is
--      bytea and no browser role can select it
-- Two-session SKIP LOCKED behaviour cannot run inside one pgTAP transaction; it
-- is proven separately against a live stack.
-- Synthetic fixtures only (*@test.local, fixed UUIDs). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(96);

-- D1 — shape and privileges (postgres)
SELECT has_table('public', 'notification_email_outbox_source', 'D1: public.notification_email_outbox_source exists');
SELECT tests.rls_enabled('public', 'notification_email_outbox_source');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull) FROM pg_attribute
         WHERE attrelid = 'public.notification_email_outbox_source'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['outbox_id:uuid:t', 'source_kind:text:t', 'source_id:text:t', 'created_at:timestamp with time zone:t'],
  'D1: columns, all NOT NULL, no free-text column beyond the checked kind and id');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s', replace(conname, 'notification_email_outbox_source_', ''), contype,
                           CASE WHEN contype = 'f' THEN format('%s:%s', (SELECT relname FROM pg_class WHERE oid = confrelid), confdeltype) END)
                    ORDER BY conname)
     FROM pg_constraint WHERE conrelid = 'public.notification_email_outbox_source'::regclass),
  ARRAY['id_check:c:', 'kind_check:c:', 'outbox_id_fkey:f:notification_email_outbox:c', 'pkey:p:'],
  'D1: primary key, two CHECKs and the FK to the outbox ON DELETE CASCADE');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s:%s', polname, polcmd, polpermissive, polroles::regrole[]::text))
     FROM pg_policy WHERE polrelid = 'public.notification_email_outbox_source'::regclass),
  ARRAY['forced_password_change_guard:*:f:{authenticated}'],
  'D1: the restrictive forced_password_change_guard is the only policy');
SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.notification_email_outbox_source'::regclass
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, 'D1: no table grant to PUBLIC, anon or authenticated');
SELECT is(
  ARRAY(SELECT has_table_privilege('service_role', 'public.notification_email_outbox_source', p)
          FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
  ARRAY[true, true, true, true], 'D1: service_role has SELECT/INSERT/UPDATE/DELETE');

CREATE TEMP TABLE n14_fn (sig text, shape text) ON COMMIT DROP;
INSERT INTO n14_fn VALUES
  ('public.claim_notification_emails(text, integer, integer)',
   'p_owner text, p_limit integer, p_lease_seconds integer -> TABLE(id uuid, idempotency_key text, event_type text, user_id uuid, related_url text, payload jsonb, has_snapshot boolean, source_kind text, source_id text)'),
  ('public.begin_notification_email_attempt(uuid, text, bytea)', 'p_id uuid, p_owner text, p_snapshot bytea -> bytea'),
  ('public.finish_notification_email(uuid, text, text, text, text, integer)',
   'p_id uuid, p_owner text, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer -> boolean');
SELECT is(
  (SELECT format('%s|%s|%s|%s', prosecdef, provolatile, proconfig,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = f.sig::regprocedure),
  'f|v|{"search_path=\"\""}|0',
  format('D1: %s is SECURITY INVOKER, VOLATILE, search_path pinned; ACL has no PUBLIC/anon/authenticated entry', f.sig))
  FROM n14_fn f;
SELECT is(
  ARRAY(SELECT has_function_privilege(r, f.sig, 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false], format('D1: EXECUTE on %s for service_role only', f.sig))
  FROM n14_fn f;
SELECT is(pg_get_function_arguments(f.sig::regprocedure) || ' -> ' || pg_get_function_result(f.sig::regprocedure), f.shape,
  format('D1: parameter names, order and return shape of %s', f.sig))
  FROM n14_fn f;
SELECT ok(pg_get_functiondef('public.claim_notification_emails(text, integer, integer)'::regprocedure)
            ~ 'FOR UPDATE OF o SKIP LOCKED', 'D1: the claim locks only the outbox row, SKIP LOCKED');
SELECT is(
  ARRAY[(SELECT format_type(atttypid, atttypmod) FROM pg_attribute
          WHERE attrelid = 'public.notification_email_outbox'::regclass AND attname = 'send_snapshot')]
  || ARRAY(SELECT has_column_privilege(r, 'public.notification_email_outbox', 'send_snapshot', 'SELECT')::text
             FROM unnest(ARRAY['anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY['bytea', 'false', 'false', 'false'],
  'D3: send_snapshot is bytea (encrypted by the worker) and no anon/authenticated/PUBLIC role can select it');

-- Synthetic fixtures (postgres) and helpers
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('n14_a', 'n14-a@test.local');
  v_b uuid := tests.create_supabase_user('n14_b', 'n14-b@test.local');
  v_admin uuid := tests.create_supabase_user('n14_admin', 'n14-admin@test.local');
BEGIN
  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password) VALUES
    (v_a, 'n14-a@test.local', 'N14 A', 'approved', false),
    (v_b, 'n14-b@test.local', 'N14 B', 'approved', false),
    (v_admin, 'n14-admin@test.local', 'N14 Admin', 'approved', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_admin, 'admin', NULL, true);
  PERFORM set_config('n14.a', v_a::text, false);
  PERFORM set_config('n14.admin', v_admin::text, false);
  -- Rows other than these fixtures (none on a fresh stack) leave the due window, so claim results are exact.
  UPDATE public.notification_email_outbox SET next_attempt_at = now() + interval '1 day' WHERE next_attempt_at <= now();
END
$fixture$;

-- r1..r5 are due and pending (ids run against the due order); o1 is 'sending'
-- with no lease; d1 digest, f1 future, t1 terminal and l1 under a live lease
-- must never be claimed; x1 is for the source-table checks.
INSERT INTO public.notification_email_outbox
  (id, idempotency_key, event_type, occurrence_id, user_id, category, email_mode, email_reason, related_url, payload,
   status, next_attempt_at, lease_owner, lease_expires_at)
SELECT ('14000000-0000-4000-8000-0000000000' || t.n)::uuid, 'n14-' || t.tag, 'n14_evt', 'occ:' || t.tag,
       current_setting('n14.a')::uuid, 'courses', t.mode, 'catalog_default', '/n14/' || t.tag, '{"k": "v"}',
       t.status, now() + t.due, t.owner, now() + t.lease
  FROM (VALUES
    ('05', 'r1', 'immediate', 'pending', interval '-50 minutes', NULL::text, NULL::interval),
    ('04', 'r2', 'immediate', 'pending', '-40 minutes', NULL, NULL),
    ('03', 'r3', 'immediate', 'pending', '-30 minutes', NULL, NULL),
    ('06', 'o1', 'immediate', 'sending', '-25 minutes', NULL, NULL),
    ('02', 'r4', 'immediate', 'pending', '-20 minutes', NULL, NULL),
    ('01', 'r5', 'immediate', 'pending', '-10 minutes', NULL, NULL),
    ('11', 'd1', 'digest', 'pending', '-60 minutes', NULL, NULL),
    ('12', 'f1', 'immediate', 'pending', '1 second', NULL, NULL),
    ('13', 't1', 'immediate', 'sent', '-60 minutes', NULL, NULL),
    ('14', 'l1', 'immediate', 'sending', '-60 minutes', 'other', '1 second'),
    ('15', 'x1', 'immediate', 'pending', '1 day', NULL, NULL)
  ) t(n, tag, mode, status, due, owner, lease);

CREATE FUNCTION pg_temp.rid(t text) RETURNS uuid LANGUAGE sql AS $$
  SELECT id FROM public.notification_email_outbox WHERE idempotency_key = 'n14-' || t $$;
-- Claim; one 'tag:has_snapshot:source_kind:source_id' per returned row, in returned order.
CREATE FUNCTION pg_temp.claim(o text, n integer, s integer) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(format('%s:%s:%s:%s', replace(c.idempotency_key, 'n14-', ''), c.has_snapshot, c.source_kind, c.source_id)
                            ORDER BY c.ord), '{}')
    FROM public.claim_notification_emails(o, n, s) WITH ORDINALITY
         c(id, idempotency_key, event_type, user_id, related_url, payload, has_snapshot, source_kind, source_id, ord) $$;
-- The worker fields of one row; times are relative to now().
CREATE FUNCTION pg_temp.st(t text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s/%s owner=%s lease=%s err=%s msg=%s snap=%s n=%s first=%s last=%s next=%s done=%s',
           status, email_mode, lease_owner, lease_expires_at - now(), last_error_code, provider_message_id,
           encode(send_snapshot, 'hex'), attempt_count, first_attempt_at - now(), last_attempt_at - now(),
           next_attempt_at - now(), completed_at - now())
    FROM public.notification_email_outbox WHERE idempotency_key = 'n14-' || t $$;
CREATE FUNCTION pg_temp.img(t text) RETURNS text LANGUAGE sql AS $$
  SELECT o::text FROM public.notification_email_outbox o WHERE o.idempotency_key = 'n14-' || t $$;
CREATE FUNCTION pg_temp.img_all() RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg(o::text, ',' ORDER BY o.id)) FROM public.notification_email_outbox o $$;
-- begin / finish on row t: 'result|same' when the whole row is byte-identical afterwards, else 'result|changed'.
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
-- Try every operation on both tables and the three RPCs; return the SQLSTATEs.
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v_id uuid := '14000000-0000-4000-8000-0000000000ff';
BEGIN
  BEGIN PERFORM count(send_snapshot) FROM public.notification_email_outbox; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox (id, idempotency_key, event_type, occurrence_id, user_id, email_mode, email_reason)
        VALUES (v_id, 'n14-probe', 'n14_x', 'occ:p', current_setting('n14.a')::uuid, 'immediate', 'unmapped_event'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_email_outbox_source; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id) VALUES (v_id, 'course', '1'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox_source SET source_id = '2' WHERE outbox_id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.claim_notification_emails('n14-probe', 1, 30); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.begin_notification_email_attempt(v_id, 'n14-probe', '\x01'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.finish_notification_email(v_id, 'n14-probe', 'retry', 'probe', NULL, 60); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox_source WHERE outbox_id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox SET status = 'cancelled', send_snapshot = NULL WHERE id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox WHERE id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;

-- D1 — source table CHECKs and cascade (postgres)
SELECT lives_ok($$INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id) VALUES
    (pg_temp.rid('r1'), 'session', '14000000-0000-4000-8000-0000000000aa'), (pg_temp.rid('r2'), 'quiz_submission', '42'),
    (pg_temp.rid('r4'), 'workspace', '9999999999999999'), (pg_temp.rid('x1'), 'course', '7')$$,
  'D1: a lowercase UUID and positive integers (up to 16 digits) are accepted');
SELECT throws_ok(format($$INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id)
                          VALUES (pg_temp.rid('r3'), %L, %L)$$, t.kind, t.sid), '23514', NULL, 'D1: the source table rejects ' || t.label)
  FROM (VALUES
    ('invoice', '7', 'an unknown kind'), ('workspace_message', '7', 'the retired workspace_message kind'),
    ('course', 'Curso de prueba', 'a free-text id'),
    ('course', '14000000-0000-4000-8000-0000000000AA', 'an uppercase UUID'),
    ('course', '0', 'a zero id'), ('course', '-5', 'a negative id'), ('course', '007', 'a zero-padded id'),
    ('course', '12345678901234567', 'an integer over 16 digits')
  ) t(kind, sid, label);
SELECT lives_ok($q$DO $d$ DECLARE k text; BEGIN
    FOREACH k IN ARRAY ARRAY['session', 'licitacion', 'course', 'assignment', 'consultant_assignment', 'group', 'quiz_submission', 'workspace'] LOOP
      UPDATE public.notification_email_outbox_source SET source_kind = k WHERE outbox_id = pg_temp.rid('x1');
    END LOOP; END $d$ $q$, 'D1: each of the eight source kinds is accepted');
DELETE FROM public.notification_email_outbox WHERE idempotency_key = 'n14-x1';
SELECT is((SELECT count(*)::int FROM public.notification_email_outbox_source
            WHERE outbox_id = '14000000-0000-4000-8000-000000000015'), 0, 'D1: deleting an outbox row removes its source row');

-- D1 — claim (service_role). now() is fixed inside this transaction.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT throws_ok(format('SELECT public.claim_notification_emails(%s)', t.args), '22023', NULL, 'D1: claim rejects ' || t.label)
  FROM (VALUES
    ('NULL, 1, 30', 'a NULL owner'), ($$'  ', 1, 30$$, 'a blank owner'),
    (format('%L, 1, 30', repeat('w', 201)), 'an owner over 200 chars'),
    ($$'wa', NULL, 30$$, 'a NULL limit'), ($$'wa', 0, 30$$, 'a zero limit'), ($$'wa', 101, 30$$, 'a limit over 100'),
    ($$'wa', 1, NULL$$, 'a NULL lease'), ($$'wa', 1, 29$$, 'a lease under 30 seconds'), ($$'wa', 1, 901$$, 'a lease over 900 seconds')
  ) t(args, label);
SELECT is(pg_temp.claim('wa', 2, 30),
  ARRAY['r1:f:session:14000000-0000-4000-8000-0000000000aa', 'r2:f:quiz_submission:42'],
  'D1: worker A gets the two oldest due rows, ordered by next_attempt_at, with their source reference');
SELECT is(pg_temp.claim('wb', 100, 900), ARRAY['r3:f::', 'o1:f::', 'r4:f:workspace:9999999999999999', 'r5:f::'],
  'D1: worker B gets only the remaining due rows (NULL source when absent), including a sending row without a lease');
SELECT is(
  ARRAY(SELECT format('%s=%s/%s', replace(idempotency_key, 'n14-', ''), status, lease_owner)
          FROM public.notification_email_outbox WHERE idempotency_key LIKE 'n14-%' ORDER BY idempotency_key),
  ARRAY['d1=pending/', 'f1=pending/', 'l1=sending/other', 'o1=sending/wb', 'r1=sending/wa', 'r2=sending/wa',
        'r3=sending/wb', 'r4=sending/wb', 'r5=sending/wb', 't1=sent/'],
  'D1: every due row has exactly one owner; digest, future, terminal and live-lease rows are untouched');
SELECT is(ARRAY[pg_temp.st('r1'), pg_temp.st('r5'), pg_temp.st('l1')],
  ARRAY['sending/immediate owner=wa lease=00:00:30 err= msg= snap= n=0 first= last= next=-00:50:00 done=',
        'sending/immediate owner=wb lease=00:15:00 err= msg= snap= n=0 first= last= next=-00:10:00 done=',
        'sending/immediate owner=other lease=00:00:01 err= msg= snap= n=0 first= last= next=-01:00:00 done='],
  'D1: a claim sets only status and lease (database clock + lease seconds); a live lease is not taken over');
SELECT is(pg_temp.claim(repeat('w', 200), 100, 30), '{}'::text[], 'D1: nothing is left to claim (a 200-char owner is valid)');

-- D1/D3 — begin: stale owner and snapshot freeze (service_role)
SELECT is(pg_temp.bg('r1', 'wb', '\x01'), 'NULL|same', 'D1: begin by a non-owner returns NULL and leaves the row unchanged');
SELECT is(pg_temp.bg('r2', 'wa', NULL), 'NULL|same', 'D3: begin without a snapshot to freeze returns NULL and changes nothing');
SELECT is(public.begin_notification_email_attempt('14000000-0000-4000-8000-0000000000ee', 'wa', '\x01'), NULL::bytea,
  'D1: begin on an unknown id returns NULL');
SELECT is(pg_temp.bg('r1', 'wa', '\x0a0b'), '0a0b|changed', 'D3: begin by the live owner returns the stored snapshot');
SELECT is(pg_temp.st('r1'),
  'sending/immediate owner=wa lease=00:00:30 err= msg= snap=0a0b n=1 first=00:00:00 last=00:00:00 next=-00:50:00 done=',
  'D3: the first begin stores the snapshot, first/last attempt time and attempt_count = 1');
-- The first attempt happened ten minutes ago.
UPDATE public.notification_email_outbox SET first_attempt_at = now() - interval '10 minutes', last_attempt_at = now() - interval '10 minutes'
 WHERE idempotency_key = 'n14-r1';
SELECT is(pg_temp.bg('r1', 'wa', '\xffff'), '0a0b|changed', 'D3: a second begin with different bytes returns the original bytes');
SELECT is(pg_temp.st('r1'),
  'sending/immediate owner=wa lease=00:00:30 err= msg= snap=0a0b n=2 first=-00:10:00 last=00:00:00 next=-00:50:00 done=',
  'D3: the frozen snapshot and first_attempt_at are kept; attempt_count = 2');
SELECT throws_ok(format('SELECT public.begin_notification_email_attempt(%s)', t.args), '22023', NULL, 'D3: begin rejects ' || t.label)
  FROM (VALUES
    ($$NULL, 'wa', '\x01'$$, 'a NULL id'), ($$'14000000-0000-4000-8000-000000000005', NULL, '\x01'$$, 'a NULL owner'),
    ($$'14000000-0000-4000-8000-000000000005', 'wa', ''$$, 'an empty snapshot'),
    ($$'14000000-0000-4000-8000-000000000005', 'wa', decode(repeat('00', 262145), 'hex')$$, 'a snapshot over 262144 bytes')
  ) t(args, label);
SELECT is(octet_length(public.begin_notification_email_attempt(pg_temp.rid('r5'), 'wb', decode(repeat('00', 262144), 'hex'))), 262144,
  'D3: a 262144-byte snapshot is accepted');

-- The lease of r1 runs out (a lease that expires exactly now is expired).
UPDATE public.notification_email_outbox SET lease_expires_at = now(), last_attempt_at = now() - interval '10 minutes'
 WHERE idempotency_key = 'n14-r1';
SELECT is(pg_temp.bg('r1', 'wa', '\x01'), 'NULL|same', 'D1: begin by an expired owner returns NULL and leaves the row unchanged');
SELECT is(pg_temp.fin('r1', 'wa', 'sent', NULL, 'n14-msg', NULL), 'f|same', 'D1: finish by an expired owner returns false and leaves the row unchanged');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s|%s|%s|%s|%s', c.id, c.idempotency_key, c.event_type, c.user_id = current_setting('n14.a')::uuid,
                 c.related_url, c.payload, c.has_snapshot, c.source_kind, c.source_id)
     FROM public.claim_notification_emails('wc', 100, 60) c),
  '14000000-0000-4000-8000-000000000005|n14-r1|n14_evt|t|/n14/r1|{"k": "v"}|t|session|14000000-0000-4000-8000-0000000000aa',
  'D1: the expired lease, and only it, is re-claimed by another owner with has_snapshot = true; all returned columns');
SELECT is(pg_temp.st('r1'),
  'sending/immediate owner=wc lease=00:01:00 err= msg= snap=0a0b n=2 first=-00:10:00 last=-00:10:00 next=-00:50:00 done=',
  'D3: the re-claim keeps the snapshot, first_attempt_at and attempt_count');
SELECT is(pg_temp.bg('r1', 'wa', '\x01') || ' ' || pg_temp.fin('r1', 'wa', 'failed', 'late_owner', NULL, NULL), 'NULL|same f|same',
  'D1: the previous owner can neither begin nor finish the re-claimed row');
SELECT is(pg_temp.bg('r1', 'wc', '\xffff') || ' ' || pg_temp.st('r1'),
  '0a0b|changed sending/immediate owner=wc lease=00:01:00 err= msg= snap=0a0b n=3 first=-00:10:00 last=00:00:00 next=-00:50:00 done=',
  'D3: the new owner resends the frozen bytes, not its own');

-- D1/D3 — finish (service_role)
SELECT is(pg_temp.fin('r1', 'wb', 'sent', NULL, 'n14-msg', NULL), 'f|same', 'D1: finish by a foreign owner returns false, row unchanged');
SELECT is(pg_temp.fin('r2', 'wa', 'sent', NULL, 'n14-msg', NULL), 'f|same', 'D3: sent without a begun attempt returns false, row unchanged');
SELECT is(pg_temp.fin('r1', 'wc', 'digest', NULL, NULL, NULL), 'f|same', 'D3: digest after a begun attempt returns false, row unchanged');
SELECT is(public.finish_notification_email('14000000-0000-4000-8000-0000000000ee', 'wa', 'failed', 'gone', NULL, NULL), false,
  'D1: finish on an unknown id returns false');
SELECT set_config('n14.before', pg_temp.img_all(), false);
SELECT throws_ok(format($$SELECT public.finish_notification_email('14000000-0000-4000-8000-000000000005', 'wc', %s)$$, t.args),
                 '22023', NULL, 'D1: finish rejects ' || t.label)
  FROM (VALUES
    ($$'bogus', NULL, NULL, NULL$$, 'an unknown outcome'), ($$NULL, NULL, NULL, NULL$$, 'a NULL outcome'),
    ($$'unknown', 'ambiguous', NULL, NULL$$, 'the unknown outcome (owned by N3-04)'),
    ($$'failed', 'Bad-Code', NULL, NULL$$, 'a malformed error code'),
    (format($$'failed', %L, NULL, NULL$$, repeat('e', 101)), 'an error code over 100 chars'),
    ($$'failed', NULL, NULL, NULL$$, 'failed without an error code'),
    ($$'cancelled', NULL, NULL, NULL$$, 'cancelled without an error code'),
    ($$'retry', NULL, NULL, 60$$, 'retry without an error code'),
    (format($$'sent', NULL, %L, NULL$$, repeat('m', 256)), 'a provider message id over 255 chars'),
    ($$'retry', 'provider_5xx', NULL, NULL$$, 'retry without a delay'),
    ($$'retry', 'provider_5xx', NULL, 59$$, 'a retry delay under 60 seconds'),
    ($$'retry', 'provider_5xx', NULL, 86401$$, 'a retry delay over 86400 seconds')
  ) t(args, label);
SELECT is(pg_temp.img_all(), current_setting('n14.before'), 'D1: the rejected finish calls changed no row');

-- retry: back to pending with the frozen snapshot; due again only after next_attempt_at.
SELECT is(pg_temp.fin('r1', 'wc', 'retry', 'provider_5xx', 'n14-ignored', 120) || ' ' || pg_temp.st('r1'),
  't|changed pending/immediate owner= lease= err=provider_5xx msg= snap=0a0b n=3 first=-00:10:00 last=00:00:00 next=00:02:00 done=',
  'D3: retry keeps snapshot, first_attempt_at and attempt_count, sets the error code and next_attempt_at, clears the lease');
SELECT is(pg_temp.claim('wd', 100, 60), '{}'::text[], 'D1: a retried row is not claimable before next_attempt_at');
UPDATE public.notification_email_outbox SET next_attempt_at = now() WHERE idempotency_key = 'n14-r1';
SELECT is(pg_temp.claim('wd', 100, 60), ARRAY['r1:t:session:14000000-0000-4000-8000-0000000000aa'],
  'D3: once next_attempt_at is reached the row is claimed again with has_snapshot = true');
SELECT is(pg_temp.bg('r1', 'wd', NULL), '0a0b|changed', 'D3: begin without new bytes returns the frozen snapshot for the resend');
-- sent
SELECT is(pg_temp.fin('r1', 'wd', 'sent', NULL, 'n14-msg-1', NULL) || ' ' || pg_temp.st('r1'),
  't|changed sent/immediate owner= lease= err= msg=n14-msg-1 snap= n=4 first=-00:10:00 last=00:00:00 next=00:00:00 done=00:00:00',
  'D3: sent stores the provider id and completed_at, clears the error code, the snapshot and the lease');
SELECT is(pg_temp.fin('r1', 'wd', 'failed', 'late', NULL, NULL) || ' ' || pg_temp.bg('r1', 'wd', '\x01'), 'f|same NULL|same',
  'D1: a finished row cannot be finished or begun again');
-- digest (no attempt begun)
SELECT is(pg_temp.fin('r2', 'wa', 'digest', 'pref_digest', NULL, NULL) || ' ' || pg_temp.st('r2'),
  't|changed pending/digest owner= lease= err= msg= snap= n=0 first= last= next=-00:40:00 done=',
  'D1: digest hands the row to the digest: email_mode digest, pending, no error code, lease cleared');
-- failed (after a begun attempt) and cancelled (before one)
SELECT is(pg_temp.bg('r3', 'wb', '\x03') || ' ' || pg_temp.fin('r3', 'wb', 'failed', 'provider:rejected', 'n14-ignored', NULL) || ' ' || pg_temp.st('r3'),
  '03|changed t|changed failed/immediate owner= lease= err=provider:rejected msg= snap= n=1 first=00:00:00 last=00:00:00 next=-00:30:00 done=00:00:00',
  'D3: failed stores the error code and completed_at, clears the snapshot and the lease');
SELECT is(pg_temp.fin('r4', 'wb', 'cancelled', 'recipient_missing', NULL, NULL) || ' ' || pg_temp.st('r4'),
  't|changed cancelled/immediate owner= lease= err=recipient_missing msg= snap= n=0 first= last= next=-00:20:00 done=00:00:00',
  'D1: cancelled stores the error code and completed_at and clears the lease');
SELECT is(pg_temp.fin('r5', 'wb', 'sent', NULL, NULL, NULL) || ' ' || pg_temp.st('r5'),
  't|changed sent/immediate owner= lease= err= msg= snap= n=1 first=00:00:00 last=00:00:00 next=-00:10:00 done=00:00:00',
  'D3: sent without a provider id still clears the snapshot');
SELECT is(
  (SELECT format('%s/%s', count(*), count(send_snapshot)) FROM public.notification_email_outbox
    WHERE idempotency_key LIKE 'n14-%' AND status IN ('sent', 'failed', 'cancelled')),
  '5/0', 'D3: every terminal row has send_snapshot IS NULL');
SELECT is(pg_temp.claim('we', 100, 60), '{}'::text[], 'D1: finished and digest rows are never claimed again');
RESET ROLE;

-- D1 — role x operation matrix: outbox select(send_snapshot)/insert, source
-- select/insert/update, claim/begin/finish, source delete, outbox update/delete.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[11]), 'D1: anon cannot read or write either table nor execute the three RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n14_a');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[11]), 'D1: the authenticated recipient cannot read or write either table nor execute the three RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n14_b');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[11]), 'D1: another authenticated user cannot read or write either table nor execute the three RPCs');
RESET ROLE;
SELECT tests.authenticate_as('n14_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n14.admin'), 'role', 'authenticated',
  'email', 'n14-admin@test.local', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[11]), 'D1: an authenticated admin cannot read or write either table nor execute the three RPCs');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), array_fill('ok'::text, ARRAY[11]), 'D1: service_role can do all of it');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.notification_email_outbox WHERE idempotency_key = 'n14-probe'), 0,
  'D1: no probe row survived');

SELECT * FROM finish();

ROLLBACK;
