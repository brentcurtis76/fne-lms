-- =============================================================================
-- 105-notification-digest-runs.sql — NOTIF N5-01 (storage phase)
-- Covers migration 20261008000000_notification_digest_runs.sql:
--   S1 shape of both tables (columns, keys, CHECKs, indexes, RLS, the one
--      restrictive policy, grants, triggers) and of the eleven RPCs and two
--      trigger functions (SECURITY INVOKER, pinned search_path, volatility,
--      ACL, signature); role x operation matrix (anon / authenticated
--      recipient, other, admin, docente, equipo_directivo: 42501 on every
--      table operation and RPC; service_role allowed, member UPDATE/DELETE
--      refused); every malformed argument is 22023 and writes nothing; the
--      run and member guards (identity, frozen snapshot/address, transitions,
--      terminal rows, member rows never updated, only eligible rows join)
--   S2 eligibility (pending digest rows, email-only included; immediate,
--      mandatory, terminal, frozen, sending, at/after-due and already-member
--      rows excluded; a handed-over row joins); one run per user and date with
--      a derived provider key; oldest backlog first under p_limit, the next call
--      takes the rest and never re-picks a user that has a run for the date
--      (empty or terminal included); p_max_members overflow stays pending;
--      delayed catch-up joins one run; the Santiago due date across the 23 h
--      and 25 h days, a UTC/Santiago date split and any session TimeZone
--   S3 claim (recovery gate first, disjoint claimers, new token per claim),
--      renew, state, members, release (retry); an expired lease is re-claimed
--      under a new token and the old token can no longer do anything; a valid
--      token of another run is refused
--   S4 freeze (exact member set, suppressed address, missing/extra/cancelled
--      member), frozen retry returns the stored bytes, direct replacement of
--      snapshot/address/key/date refused, 24 h expiry, suppression after the
--      freeze, sent/failed/cancelled/retry, cancelled_after_ambiguous/unknown,
--      truthful member outcomes (cancelled stays cancelled), terminal rows
--      clear the snapshot and never change, provider id on the members'
--      address rows (a later bounce suppresses; an earlier bounce is applied
--      at finish), retention (only terminal runs > 90 days; outbox purge
--      cascades a member)
--   S5 the real immediate-worker RPCs never claim or move a digest member;
--      apply_notification_unsubscribe cancels an unfrozen member (the old set
--      then cannot freeze) and leaves a frozen one alone; settlement never
--      resurrects a cancelled row
-- Concurrency between independent sessions cannot run inside one pgTAP
-- transaction; it is proven by a separate multi-session script.
-- Synthetic fixtures only (*@qa.local.test, fixed outbox UUIDs 22000000-...,
-- digests are one hex character repeated). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(202);

-- S1 — shape and privileges (postgres)
SELECT has_table('public', 'notification_digest_runs', 'S1: public.notification_digest_runs exists');
SELECT has_table('public', 'notification_digest_run_members', 'S1: public.notification_digest_run_members exists');
SELECT tests.rls_enabled('public', 'notification_digest_runs');
SELECT tests.rls_enabled('public', 'notification_digest_run_members');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull) FROM pg_attribute
         WHERE attrelid = 'public.notification_digest_runs'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['id:uuid:t', 'user_id:uuid:t', 'local_date:date:t', 'provider_key:text:t', 'status:text:t', 'attempt_count:integer:t',
        'next_attempt_at:timestamp with time zone:t', 'lease_token:uuid:f', 'lease_expires_at:timestamp with time zone:f',
        'first_attempt_at:timestamp with time zone:f', 'last_attempt_at:timestamp with time zone:f',
        'completed_at:timestamp with time zone:f', 'last_error_code:text:f', 'provider_message_id:text:f',
        'address_digest:text:f', 'send_snapshot:bytea:f', 'created_at:timestamp with time zone:t',
        'updated_at:timestamp with time zone:t'],
  'S1: run columns; no free text beyond checked codes, the snapshot is bytea (ciphertext), no address column');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull) FROM pg_attribute
         WHERE attrelid = 'public.notification_digest_run_members'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['outbox_id:uuid:t', 'run_id:uuid:t', 'created_at:timestamp with time zone:t'],
  'S1: member columns; no status column (the outbox row is the member state)');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s', replace(conname, 'notification_digest_runs_', ''), contype,
                           CASE WHEN contype = 'f' THEN format('%s:%s', (SELECT relname FROM pg_class WHERE oid = confrelid), confdeltype) END)
                    ORDER BY conname)
     FROM pg_constraint WHERE conrelid = 'public.notification_digest_runs'::regclass),
  ARRAY['address_digest_check:c:', 'attempt_count_check:c:', 'error_code_check:c:', 'frozen_check:c:', 'lease_check:c:',
        'local_date_check:c:', 'pkey:p:', 'provider_id_check:c:', 'provider_key_check:c:', 'provider_key_key:u:',
        'snapshot_size_check:c:', 'status_check:c:', 'terminal_check:c:', 'user_date_key:u:', 'user_id_fkey:f:profiles:c'],
  'S1: run keys (one per user and date, unique provider key), CHECKs and the FK to profiles ON DELETE CASCADE');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s', replace(conname, 'notification_digest_run_members_', ''), contype,
                           CASE WHEN contype = 'f' THEN format('%s:%s', (SELECT relname FROM pg_class WHERE oid = confrelid), confdeltype) END)
                    ORDER BY conname)
     FROM pg_constraint WHERE conrelid = 'public.notification_digest_run_members'::regclass),
  ARRAY['outbox_id_fkey:f:notification_email_outbox:c', 'pkey:p:', 'run_id_fkey:f:notification_digest_runs:c'],
  'S1: an outbox row is a member at most once (primary key); both FKs ON DELETE CASCADE');
SELECT is(
  ARRAY(SELECT format('%s:%s', x.indexname, coalesce(pg_get_expr(i.indpred, i.indrelid), ''))
          FROM pg_indexes x JOIN pg_index i ON i.indexrelid = format('public.%I', x.indexname)::regclass
         WHERE x.schemaname = 'public' AND x.tablename IN ('notification_digest_runs', 'notification_digest_run_members')
         ORDER BY x.indexname),
  ARRAY['notification_digest_run_members_pkey:', 'notification_digest_run_members_run_id_idx:',
        'notification_digest_runs_claim_idx:(status = ANY (ARRAY[''pending''::text, ''sending''::text]))',
        'notification_digest_runs_created_at_idx:', 'notification_digest_runs_pkey:', 'notification_digest_runs_provider_key_key:',
        'notification_digest_runs_user_date_key:'],
  'S1: indexes; the claim index is partial over pending/sending');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s:%s', polrelid::regclass, polname, polcmd, polpermissive, polroles::regrole[]::text) FROM pg_policy
         WHERE polrelid IN ('public.notification_digest_runs'::regclass, 'public.notification_digest_run_members'::regclass)
         ORDER BY 1),
  ARRAY['notification_digest_run_members:forced_password_change_guard:*:f:{authenticated}',
        'notification_digest_runs:forced_password_change_guard:*:f:{authenticated}'],
  'S1: the restrictive forced_password_change_guard is the only policy on each table');
SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid IN ('public.notification_digest_runs'::regclass, 'public.notification_digest_run_members'::regclass)
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, 'S1: no table grant to PUBLIC, anon or authenticated');
SELECT is(
  ARRAY(SELECT format('%s:%s', t, has_table_privilege('service_role', 'public.' || t, p))
          FROM unnest(ARRAY['notification_digest_runs', 'notification_digest_run_members']) t,
               unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) WITH ORDINALITY u(p, n) ORDER BY t DESC, n),
  ARRAY['notification_digest_runs:t', 'notification_digest_runs:t', 'notification_digest_runs:t', 'notification_digest_runs:t',
        'notification_digest_run_members:t', 'notification_digest_run_members:t',
        'notification_digest_run_members:f', 'notification_digest_run_members:f'],
  'S1: service_role has SELECT/INSERT/UPDATE/DELETE on runs and only SELECT/INSERT on members');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s', t.tgrelid::regclass, t.tgname, p.proname, t.tgtype) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid IN ('public.notification_digest_runs'::regclass, 'public.notification_digest_run_members'::regclass,
                             'public.notification_email_outbox'::regclass) AND NOT t.tgisinternal
         ORDER BY 1),
  ARRAY['notification_digest_run_members:notification_digest_run_members_guard:notification_digest_run_members_guard:23',
        'notification_digest_runs:notification_digest_runs_guard:notification_digest_runs_guard:23',
        'notification_digest_runs:update_notification_digest_runs_updated_at:update_updated_at_column:19',
        'notification_email_outbox:update_notification_email_outbox_updated_at:update_updated_at_column:19'],
  'S1: BEFORE INSERT OR UPDATE row guards on both tables, the updated_at trigger on runs; the outbox keeps its single trigger');

CREATE TEMP TABLE n22_fn (sig text, vol text, shape text) ON COMMIT DROP;
INSERT INTO n22_fn VALUES
  ('public.notification_digest_due(timestamp with time zone)', 's',
   'p_at timestamp with time zone -> TABLE(local_date date, due_at timestamp with time zone)'),
  ('public.open_notification_digest_runs(integer, integer)', 'v',
   'p_limit integer, p_max_members integer -> TABLE(run_id uuid, user_id uuid, local_date date, members integer)'),
  ('public.claim_notification_digest_runs(integer, integer)', 'v',
   'p_limit integer, p_lease_seconds integer -> TABLE(run_id uuid, lease_token uuid, user_id uuid, local_date date, provider_key text, status text, attempt_count integer, has_snapshot boolean, expired boolean)'),
  ('public.renew_notification_digest_run(uuid, uuid, integer)', 'v',
   'p_run_id uuid, p_lease_token uuid, p_lease_seconds integer -> boolean'),
  ('public.notification_digest_run_state(uuid, uuid)', 's',
   'p_run_id uuid, p_lease_token uuid -> TABLE(status text, attempt_count integer, has_snapshot boolean, expired boolean, address_suppressed boolean)'),
  ('public.notification_digest_run_members(uuid, uuid)', 's',
   'p_run_id uuid, p_lease_token uuid -> TABLE(outbox_id uuid, status text, event_type text, category text, email_reason text, related_url text, payload jsonb, notification_id uuid, created_at timestamp with time zone, source_kind text, source_id text)'),
  ('public.cancel_notification_digest_member(uuid, uuid, uuid, text)', 'v',
   'p_run_id uuid, p_lease_token uuid, p_outbox_id uuid, p_error_code text -> boolean'),
  ('public.begin_notification_digest_attempt(uuid, uuid, bytea, uuid[], text)', 'v',
   'p_run_id uuid, p_lease_token uuid, p_snapshot bytea, p_member_ids uuid[], p_address_digest text -> bytea'),
  ('public.finish_notification_digest_run(uuid, uuid, text, text, text, integer)', 'v',
   'p_run_id uuid, p_lease_token uuid, p_outcome text, p_error_code text, p_provider_message_id text, p_retry_seconds integer -> boolean'),
  ('public.settle_ambiguous_notification_digest_run(uuid, uuid, text, text)', 'v',
   'p_run_id uuid, p_lease_token uuid, p_outcome text, p_error_code text -> boolean'),
  ('public.purge_notification_digest_runs(integer)', 'v', 'p_limit integer -> integer');
SELECT is(
  (SELECT format('%s|%s|%s|%s', prosecdef, provolatile, proconfig,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = f.sig::regprocedure),
  format('f|%s|{"search_path=\"\""}|0', f.vol),
  format('S1: %s is SECURITY INVOKER, volatility %s, search_path pinned; ACL has no PUBLIC/anon/authenticated entry', f.sig, f.vol))
  FROM n22_fn f;
SELECT is(
  ARRAY(SELECT has_function_privilege(r, f.sig, 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false], format('S1: EXECUTE on %s for service_role only', f.sig))
  FROM n22_fn f;
SELECT is(pg_get_function_arguments(f.sig::regprocedure) || ' -> ' || pg_get_function_result(f.sig::regprocedure), f.shape,
  format('S1: parameter names, order and return shape of %s', f.sig))
  FROM n22_fn f;
SELECT is(
  ARRAY(SELECT format('%s|%s|%s|%s|%s', p.proname, p.prosecdef, p.proconfig, pg_get_function_result(p.oid),
                      (SELECT count(*) FROM aclexplode(p.proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
          FROM pg_proc p WHERE p.oid IN ('public.notification_digest_runs_guard()'::regprocedure,
                                         'public.notification_digest_run_members_guard()'::regprocedure) ORDER BY 1),
  ARRAY['notification_digest_run_members_guard|f|{"search_path=\"\""}|trigger|0',
        'notification_digest_runs_guard|f|{"search_path=\"\""}|trigger|0'],
  'S1: both trigger functions are SECURITY INVOKER with a pinned search_path and no PUBLIC/anon/authenticated EXECUTE');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ 'digest'
      AND (p.prosecdef OR p.proconfig IS DISTINCT FROM ARRAY['search_path=""']
           OR EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole))
           OR p.proacl IS NULL)),
  0, 'S1: no public function named *digest* is SECURITY DEFINER, unpinned, or executable by PUBLIC/anon/authenticated');
SELECT is((SELECT count(*)::int FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname ~ 'digest'), 13,
  'S1: exactly the eleven RPCs and two trigger functions exist under that name');
SELECT ok(pg_get_functiondef('public.claim_notification_digest_runs(integer, integer)'::regprocedure) ~ 'FOR UPDATE OF r SKIP LOCKED'
          AND pg_get_functiondef('public.open_notification_digest_runs(integer, integer)'::regprocedure) ~ 'FOR NO KEY UPDATE OF o SKIP LOCKED'
          AND pg_get_functiondef('public.open_notification_digest_runs(integer, integer)'::regprocedure) ~ 'pg_try_advisory_xact_lock'
          AND pg_get_functiondef('public.begin_notification_digest_attempt(uuid, uuid, bytea, uuid[], text)'::regprocedure) ~ 'FOR NO KEY UPDATE OF o SKIP LOCKED',
  'S1: claim, open and begin never wait on a row another transaction holds (SKIP LOCKED); open uses a per-user try-lock');
SELECT is(
  ARRAY(SELECT has_column_privilege(r, 'public.notification_digest_runs', 'send_snapshot', 'SELECT')::text
          FROM unnest(ARRAY['anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY['false', 'false', 'false'], 'S1: no anon/authenticated/PUBLIC role can select the encrypted snapshot');

-- Synthetic fixtures (postgres) and helpers
DO $fixture$
DECLARE
  v_t text;
  v_id uuid;
  v_school integer;
BEGIN
  FOREACH v_t IN ARRAY ARRAY['a', 'b', 'c', 'd', 'e', 'f', 'p', 'other', 'admin', 'docente', 'directivo'] LOOP
    v_id := tests.create_supabase_user('n22_' || v_t, 'n22-' || v_t || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, must_change_password)
    VALUES (v_id, 'n22-' || v_t || '@qa.local.test', 'N22 ' || v_t, 'approved', false) ON CONFLICT (id) DO NOTHING;
    PERFORM set_config('n22.' || v_t, v_id::text, false);
  END LOOP;
  INSERT INTO public.schools (name) VALUES ('N22 QA School') RETURNING id INTO v_school;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
    (current_setting('n22.admin')::uuid, 'admin', NULL, true),
    (current_setting('n22.docente')::uuid, 'docente', v_school, true),
    (current_setting('n22.directivo')::uuid, 'equipo_directivo', v_school, true);
  -- Rows other than these fixtures (none on a fresh stack) leave the open, claim and purge windows.
  UPDATE public.notification_email_outbox SET created_at = now() + interval '1 day', next_attempt_at = now() + interval '1 day';
  UPDATE auth_security.password_recovery_outbox SET available_at = clock_timestamp() + interval '1 day'
   WHERE state IN ('queued', 'processing');
  PERFORM set_config('n22.date', d.local_date::text, false), set_config('n22.due', d.due_at::text, false)
     FROM public.notification_digest_due(now()) d;
END
$fixture$;

CREATE FUNCTION pg_temp.uid(t text) RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('n22.' || t)::uuid $$;
CREATE FUNCTION pg_temp.dd() RETURNS date LANGUAGE sql STABLE AS $$ SELECT current_setting('n22.date')::date $$;
CREATE FUNCTION pg_temp.due() RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT current_setting('n22.due')::timestamptz $$;
CREATE FUNCTION pg_temp.tag(u uuid) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT t FROM unnest(ARRAY['a', 'b', 'c', 'd', 'e', 'f', 'p']) t WHERE current_setting('n22.' || t)::uuid = u $$;

-- The in-app row of a1; every other fixture row is email-only (notification_id NULL).
INSERT INTO public.user_notifications (id, user_id, title) VALUES ('22000000-0000-4000-8000-0000000000aa', pg_temp.uid('a'), 'N22 aviso');

-- Outbox fixtures; created_at is relative to the due instant of today's digest date D.
INSERT INTO public.notification_email_outbox
  (id, idempotency_key, event_type, occurrence_id, user_id, notification_id, category, email_mode, email_reason, related_url,
   payload, status, send_snapshot, created_at, next_attempt_at)
SELECT ('22000000-0000-4000-8000-0000000000' || t.n)::uuid, 'n22-' || t.tag, 'n22_evt', 'occ:' || t.tag, pg_temp.uid(t.u),
       CASE WHEN t.tag = 'a1' THEN '22000000-0000-4000-8000-0000000000aa'::uuid END,
       t.cat, t.mode, t.reason, '/n22/' || t.tag, '{"k": "v"}', t.status, t.snap, pg_temp.due() + t.created,
       now() + interval '1 day'
  FROM (VALUES
    ('01', 'a1', 'a', 'courses', 'digest', 'category_mode', 'pending', NULL::bytea, interval '-3 days'),
    ('02', 'a2', 'a', 'assignments', 'digest', 'catalog_default', 'pending', NULL, '-2 days'),
    ('03', 'a3', 'a', 'community', 'digest', 'category_mode', 'pending', NULL, '-1 hour'),
    ('04', 'ai', 'a', 'courses', 'immediate', 'catalog_default', 'pending', NULL, '-4 days'),
    ('05', 'am', 'a', 'system', 'digest', 'mandatory', 'pending', NULL, '-4 days'),
    ('06', 'at', 'a', 'courses', 'digest', 'category_mode', 'sent', NULL, '-4 days'),
    ('07', 'ac', 'a', 'courses', 'digest', 'category_mode', 'cancelled', NULL, '-4 days'),
    ('08', 'af', 'a', 'courses', 'digest', 'category_mode', 'pending', '\xaf', '-4 days'),
    ('09', 'as', 'a', 'courses', 'digest', 'category_mode', 'sending', NULL, '-4 days'),
    ('10', 'ae', 'a', 'sessions', 'digest', 'category_mode', 'pending', NULL, '0 seconds'),
    ('11', 'al', 'a', 'sessions', 'digest', 'category_mode', 'pending', NULL, '1 hour'),
    ('12', 'a0', 'a', 'sessions', 'digest', 'category_mode', 'pending', NULL, '-5 days'),
    ('21', 'b1', 'b', 'community', 'immediate', 'catalog_default', 'pending', NULL, '-1 day'),
    ('31', 'c1', 'c', 'sessions', 'digest', 'catalog_default', 'pending', NULL, '-10 days'),
    ('41', 'd1', 'd', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-60 hours'),
    ('42', 'd2', 'd', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-59 hours'),
    ('43', 'd3', 'd', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-58 hours'),
    ('44', 'd4', 'd', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-57 hours'),
    ('45', 'd5', 'd', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-56 hours'),
    ('51', 'e1', 'e', 'courses', 'digest', 'catalog_default', 'pending', NULL, '-20 days'),
    ('61', 'f1', 'f', 'advisory', 'digest', 'category_mode', 'pending', NULL, '-2 days'),
    ('62', 'f2', 'f', 'advisory', 'digest', 'category_mode', 'pending', NULL, '-47 hours'),
    ('71', 'p1', 'p', 'qa_support', 'digest', 'category_mode', 'pending', NULL, '1 second')
  ) t(n, tag, u, cat, mode, reason, status, snap, created);
-- b1 is due for the immediate worker, which hands it over to the digest later.
UPDATE public.notification_email_outbox SET next_attempt_at = now() - interval '1 minute' WHERE idempotency_key = 'n22-b1';
INSERT INTO public.notification_email_outbox_source (outbox_id, source_kind, source_id)
VALUES ('22000000-0000-4000-8000-000000000001', 'course', '7');
-- A's run of the day before (a0 is its member), and E's run of today, already cancelled.
INSERT INTO public.notification_digest_runs (user_id, local_date) VALUES (pg_temp.uid('a'), pg_temp.dd() - 1), (pg_temp.uid('e'), pg_temp.dd());
INSERT INTO public.notification_digest_run_members (run_id, outbox_id)
SELECT id, '22000000-0000-4000-8000-000000000012' FROM public.notification_digest_runs WHERE user_id = pg_temp.uid('a');
UPDATE public.notification_digest_runs SET status = 'cancelled', completed_at = now(), last_error_code = 'n22_fixture'
 WHERE user_id = pg_temp.uid('e');

-- Run of user t for D ('a0' = A's run of D - 1).
CREATE FUNCTION pg_temp.run(t text) RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT id FROM public.notification_digest_runs
   WHERE user_id = pg_temp.uid(left(t, 1)) AND local_date = pg_temp.dd() - CASE WHEN t = 'a0' THEN 1 ELSE 0 END $$;
CREATE FUNCTION pg_temp.tok(t text) RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT lease_token FROM public.notification_digest_runs WHERE id = pg_temp.run(t) $$;
CREATE FUNCTION pg_temp.oid(t text) RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT id FROM public.notification_email_outbox WHERE idempotency_key = 'n22-' || t $$;
CREATE FUNCTION pg_temp.ids(t text[]) RETURNS uuid[] LANGUAGE sql VOLATILE AS $$
  SELECT array_agg(pg_temp.oid(x) ORDER BY n) FROM unnest(t) WITH ORDINALITY u(x, n) $$;
CREATE FUNCTION pg_temp.hex(c text) RETURNS text LANGUAGE sql IMMUTABLE AS $$ SELECT repeat(c, 64) $$;
-- Open: one 'user:members:is today's date' per run opened, in returned order.
CREATE FUNCTION pg_temp.open(l integer, m integer) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(format('%s:%s:%s', pg_temp.tag(o.user_id), o.members, o.local_date = pg_temp.dd()) ORDER BY o.ord), '{}')
    FROM public.open_notification_digest_runs(l, m) WITH ORDINALITY o(run_id, user_id, local_date, members, ord) $$;
-- Claim: sorted 'run tag:status:attempts:has_snapshot:expired' (the claim order between runs due at the same instant is by id).
CREATE FUNCTION pg_temp.claim(l integer, s integer) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(q.x ORDER BY q.x COLLATE "C"), '{}')
    FROM (SELECT format('%s:%s:%s:%s:%s', pg_temp.tag(c.user_id) || CASE WHEN c.local_date < pg_temp.dd() THEN '0' ELSE '' END,
                        c.status, c.attempt_count, c.has_snapshot, c.expired) AS x
            FROM public.claim_notification_digest_runs(l, s) c) q $$;
-- Members of run t as stored: 'outbox tag:outbox status', oldest first.
CREATE FUNCTION pg_temp.mem(t text) RETURNS text[] LANGUAGE sql VOLATILE AS $$
  SELECT coalesce(array_agg(format('%s:%s', replace(o.idempotency_key, 'n22-', ''), o.status) ORDER BY o.created_at, o.id), '{}')
    FROM public.notification_digest_run_members m JOIN public.notification_email_outbox o ON o.id = m.outbox_id
   WHERE m.run_id = pg_temp.run(t) $$;
-- Worker fields of run t; times relative to now().
CREATE FUNCTION pg_temp.rst(t text) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT format('%s n=%s lease=%s snap=%s addr=%s err=%s msg=%s first=%s next=%s done=%s',
           status, attempt_count, lease_expires_at - now(), encode(send_snapshot, 'hex'), left(address_digest, 1),
           last_error_code, provider_message_id, first_attempt_at - now(), next_attempt_at - now(), completed_at - now())
    FROM public.notification_digest_runs WHERE id = pg_temp.run(t) $$;
-- Worker fields of outbox row t.
CREATE FUNCTION pg_temp.ost(t text) RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT format('%s/%s owner=%s lease=%s err=%s msg=%s snap=%s first=%s done=%s', status, email_mode, lease_owner,
           lease_expires_at - now(), last_error_code, provider_message_id, encode(send_snapshot, 'hex'),
           first_attempt_at - now(), completed_at - now())
    FROM public.notification_email_outbox WHERE idempotency_key = 'n22-' || t $$;
-- Everything these RPCs can write, as one hash.
CREATE FUNCTION pg_temp.img_all() RETURNS text LANGUAGE sql VOLATILE AS $$
  SELECT md5(concat_ws('|',
    (SELECT string_agg(r::text, ',' ORDER BY r.id) FROM public.notification_digest_runs r),
    (SELECT string_agg(m::text, ',' ORDER BY m.outbox_id) FROM public.notification_digest_run_members m),
    (SELECT string_agg(o::text, ',' ORDER BY o.id) FROM public.notification_email_outbox o),
    (SELECT string_agg(a::text, ',' ORDER BY a.outbox_id) FROM public.notification_email_outbox_address a),
    (SELECT string_agg(s::text, ',' ORDER BY s.address_digest) FROM public.notification_email_suppressions s),
    (SELECT string_agg(e::text, ',' ORDER BY e.provider_message_id) FROM public.notification_email_bounce_events e))) $$;
-- Run a statement; 'ok' or its SQLSTATE.
CREATE FUNCTION pg_temp.try(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'ok'; EXCEPTION WHEN OTHERS THEN RETURN SQLSTATE; END $$;
-- begin on run t: 'stored bytes|same or changed (everything)'.
CREATE FUNCTION pg_temp.bg(t text, k uuid, s bytea, m text[], a text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img_all(); r bytea;
BEGIN
  r := public.begin_notification_digest_attempt(pg_temp.run(t), k, s, pg_temp.ids(m), a);
  RETURN format('%s|%s', coalesce(encode(r, 'hex'), 'NULL'), CASE WHEN pg_temp.img_all() = v_img THEN 'same' ELSE 'changed' END);
END $$;
CREATE FUNCTION pg_temp.fin(t text, k uuid, outcome text, err text, msg text, retry integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img_all(); r boolean;
BEGIN
  r := public.finish_notification_digest_run(pg_temp.run(t), k, outcome, err, msg, retry);
  RETURN format('%s|%s', r, CASE WHEN pg_temp.img_all() = v_img THEN 'same' ELSE 'changed' END);
END $$;
CREATE FUNCTION pg_temp.settle(t text, k uuid, outcome text, err text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img_all(); r boolean;
BEGIN
  r := public.settle_ambiguous_notification_digest_run(pg_temp.run(t), k, outcome, err);
  RETURN format('%s|%s', r, CASE WHEN pg_temp.img_all() = v_img THEN 'same' ELSE 'changed' END);
END $$;
CREATE FUNCTION pg_temp.cancel(t text, k uuid, o text, err text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img_all(); r boolean;
BEGIN
  r := public.cancel_notification_digest_member(pg_temp.run(t), k, pg_temp.oid(o), err);
  RETURN format('%s|%s', r, CASE WHEN pg_temp.img_all() = v_img THEN 'same' ELSE 'changed' END);
END $$;
-- State as 'status:attempts:has_snapshot:expired:address_suppressed', or 'none'.
CREATE FUNCTION pg_temp.state(t text, k uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s:%s:%s:%s:%s', s.status, s.attempt_count, s.has_snapshot, s.expired, s.address_suppressed), ','), 'none')
    FROM public.notification_digest_run_state(pg_temp.run(t), k) s $$;
-- Every operation a stale or foreign token could try on run t: 'renew|state|members|cancel|begin|finish|settle|same or changed'.
CREATE FUNCTION pg_temp.stale(t text, k uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_img text := pg_temp.img_all(); v text;
BEGIN
  v := concat_ws('|',
    public.renew_notification_digest_run(pg_temp.run(t), k, 60),
    pg_temp.state(t, k),
    (SELECT count(*) FROM public.notification_digest_run_members(pg_temp.run(t), k)),
    public.cancel_notification_digest_member(pg_temp.run(t), k, (SELECT m.outbox_id FROM public.notification_digest_run_members m
                                                                  WHERE m.run_id = pg_temp.run(t) LIMIT 1), 'stale'),
    coalesce(encode(public.begin_notification_digest_attempt(pg_temp.run(t), k, '\x01',
               ARRAY(SELECT m.outbox_id FROM public.notification_digest_run_members m WHERE m.run_id = pg_temp.run(t)), pg_temp.hex('1')), 'hex'), 'NULL'),
    public.finish_notification_digest_run(pg_temp.run(t), k, 'retry', 'stale', NULL, 60),
    public.settle_ambiguous_notification_digest_run(pg_temp.run(t), k, 'cancelled_after_ambiguous', 'stale'));
  RETURN v || '|' || CASE WHEN pg_temp.img_all() = v_img THEN 'same' ELSE 'changed' END;
END $$;
-- The one recovery fixture row in a given shape (no row for a NULL state); auth_security is closed to service_role.
CREATE FUNCTION pg_temp.recovery(p_state text) RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM auth_security.password_recovery_outbox WHERE idempotency_key = 'password-recovery/n22';
  INSERT INTO auth_security.password_recovery_outbox (candidate_fingerprint, idempotency_key, state, available_at, provider_attempts)
  SELECT repeat('f2', 32), 'password-recovery/n22', p_state, clock_timestamp() - interval '1 minute', 0 WHERE p_state IS NOT NULL $$;
-- Try every table operation and every RPC; return the SQLSTATEs (19 entries).
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v_run uuid := '22000000-0000-4000-8000-0000000000ff'; v_k uuid := '22000000-0000-4000-8000-0000000000fe';
BEGIN
  BEGIN PERFORM count(send_snapshot) FROM public.notification_digest_runs; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_digest_runs (id, user_id, local_date) VALUES (v_run, current_setting('n22.p')::uuid, '1999-12-31');
        s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_digest_runs SET next_attempt_at = now() WHERE id = v_run; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_digest_run_members; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (v_run, '22000000-0000-4000-8000-000000000071');
        s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_digest_run_members SET created_at = now() WHERE run_id = v_run; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_digest_run_members WHERE run_id = v_run; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_digest_runs WHERE id = v_run; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.notification_digest_due(now()); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.open_notification_digest_runs(1, 1); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.claim_notification_digest_runs(1, 30); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.renew_notification_digest_run(v_run, v_k, 30); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.notification_digest_run_state(v_run, v_k); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.notification_digest_run_members(v_run, v_k); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.cancel_notification_digest_member(v_run, v_k, v_run, 'probe'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.begin_notification_digest_attempt(v_run, v_k, '\x01', ARRAY[v_run], repeat('1', 64)); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.finish_notification_digest_run(v_run, v_k, 'retry', 'probe', NULL, 60); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.settle_ambiguous_notification_digest_run(v_run, v_k, 'unknown', 'probe'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM public.purge_notification_digest_runs(1); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;

-- S2 — the due date (service_role). Expected instants verified against the container tzdata:
-- Santiago is UTC-4 until 2026-09-06 00:00 local (then UTC-3) and UTC-3 until 2026-04-05 00:00 local (then UTC-4).
CREATE FUNCTION pg_temp.due_of(p timestamptz) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s|%s', d.local_date, to_char(d.due_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI')) FROM public.notification_digest_due(p) d $$;
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(
  ARRAY(SELECT pg_temp.due_of(t::timestamptz) FROM unnest(ARRAY[
    '2026-09-05 12:59:59+00', '2026-09-05 13:00:00+00', '2026-09-06 03:59:59+00', '2026-09-06 04:00:00+00',
    '2026-09-06 11:59:59+00', '2026-09-06 12:00:00+00']) WITH ORDINALITY u(t, n) ORDER BY n),
  ARRAY['2026-09-04|2026-09-04 13:00', '2026-09-05|2026-09-05 13:00', '2026-09-05|2026-09-05 13:00', '2026-09-05|2026-09-05 13:00',
        '2026-09-05|2026-09-05 13:00', '2026-09-06|2026-09-06 12:00'],
  'S2: spring forward (2026-09-05 -> 06, the skipped hour 00:00-01:00 included): 08:59:59 / 09:00 local on both sides');
SELECT is(
  ARRAY(SELECT pg_temp.due_of(t::timestamptz) FROM unnest(ARRAY[
    '2026-04-04 11:59:59+00', '2026-04-04 12:00:00+00', '2026-04-05 03:30:00+00', '2026-04-05 04:30:00+00',
    '2026-04-05 12:59:59+00', '2026-04-05 13:00:00+00']) WITH ORDINALITY u(t, n) ORDER BY n),
  ARRAY['2026-04-03|2026-04-03 12:00', '2026-04-04|2026-04-04 12:00', '2026-04-04|2026-04-04 12:00', '2026-04-04|2026-04-04 12:00',
        '2026-04-04|2026-04-04 12:00', '2026-04-05|2026-04-05 13:00'],
  'S2: fall back (2026-04-04 -> 05, the repeated hour 23:00-00:00 included): 08:59:59 / 09:00 local on both sides');
SELECT is(
  ARRAY[(SELECT d.due_at FROM public.notification_digest_due('2026-09-06 12:00:00+00') d)
          - (SELECT d.due_at FROM public.notification_digest_due('2026-09-05 13:00:00+00') d),
        (SELECT d.due_at FROM public.notification_digest_due('2026-04-05 13:00:00+00') d)
          - (SELECT d.due_at FROM public.notification_digest_due('2026-04-04 12:00:00+00') d),
        (SELECT d.due_at FROM public.notification_digest_due('2026-10-09 12:00:00+00') d)
          - (SELECT d.due_at FROM public.notification_digest_due('2026-10-08 12:00:00+00') d)],
  ARRAY[interval '23 hours', interval '25 hours', interval '24 hours'],
  'S2: due(D+1) - due(D) is 23 h on the spring day, 25 h on the fall day, 24 h otherwise (civil dates, not 24 h steps)');
SELECT is(pg_temp.due_of('2026-10-09 02:00:00+00'), '2026-10-08|2026-10-08 12:00',
  'S2: 2026-10-09 02:00 UTC is 2026-10-08 23:00 in Santiago: the digest date follows Santiago, not UTC');
SET LOCAL timezone = 'Asia/Tokyo';
SELECT is(ARRAY[pg_temp.due_of('2026-09-06 12:00:00+00'), pg_temp.due_of('2026-10-09 02:00:00+00')],
  ARRAY['2026-09-06|2026-09-06 12:00', '2026-10-08|2026-10-08 12:00'], 'S2: the session TimeZone does not change the result');
SET LOCAL timezone = 'UTC';
SELECT is((SELECT format('%s|%s', d.local_date = pg_temp.dd(), d.due_at = pg_temp.due() AND d.due_at <= now() AND d.due_at > now() - interval '25 hours')
             FROM public.notification_digest_due(now()) d), 't|t',
  'S2: the date due now is the fixture date D; its due instant is in the last 25 hours');
SELECT throws_ok(format('SELECT public.notification_digest_due(%s)', t.arg), '22023', NULL, 'S1: due rejects ' || t.label)
  FROM (VALUES ('NULL', 'a NULL instant'), ($$'infinity'$$, 'infinity'), ($$'-infinity'$$, '-infinity')) t(arg, label);

-- S1 — malformed input (service_role): every RPC, before any lookup; nothing is written.
SELECT set_config('n22.before', pg_temp.img_all(), false);
SELECT throws_ok(t.q, '22023', NULL, 'S1: ' || t.label)
  FROM (VALUES
    ('SELECT public.open_notification_digest_runs(NULL, 1)', 'open rejects a NULL limit'),
    ('SELECT public.open_notification_digest_runs(0, 1)', 'open rejects a zero limit'),
    ('SELECT public.open_notification_digest_runs(101, 1)', 'open rejects a limit over 100'),
    ('SELECT public.open_notification_digest_runs(1, NULL)', 'open rejects NULL max members'),
    ('SELECT public.open_notification_digest_runs(1, 0)', 'open rejects zero max members'),
    ('SELECT public.open_notification_digest_runs(1, 201)', 'open rejects max members over 200'),
    ('SELECT public.claim_notification_digest_runs(NULL, 30)', 'claim rejects a NULL limit'),
    ('SELECT public.claim_notification_digest_runs(0, 30)', 'claim rejects a zero limit'),
    ('SELECT public.claim_notification_digest_runs(101, 30)', 'claim rejects a limit over 100'),
    ('SELECT public.claim_notification_digest_runs(1, NULL)', 'claim rejects a NULL lease'),
    ('SELECT public.claim_notification_digest_runs(1, 29)', 'claim rejects a lease under 30 seconds'),
    ('SELECT public.claim_notification_digest_runs(1, 901)', 'claim rejects a lease over 900 seconds'),
    ($$SELECT public.renew_notification_digest_run(NULL, gen_random_uuid(), 30)$$, 'renew rejects a NULL run'),
    ($$SELECT public.renew_notification_digest_run(gen_random_uuid(), NULL, 30)$$, 'renew rejects a NULL token'),
    ($$SELECT public.renew_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 29)$$, 'renew rejects a lease under 30 seconds'),
    ($$SELECT public.renew_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 901)$$, 'renew rejects a lease over 900 seconds'),
    ($$SELECT public.notification_digest_run_state(NULL, gen_random_uuid())$$, 'state rejects a NULL run'),
    ($$SELECT public.notification_digest_run_state(gen_random_uuid(), NULL)$$, 'state rejects a NULL token'),
    ($$SELECT public.notification_digest_run_members(NULL, gen_random_uuid())$$, 'members rejects a NULL run'),
    ($$SELECT public.notification_digest_run_members(gen_random_uuid(), NULL)$$, 'members rejects a NULL token'),
    ($$SELECT public.cancel_notification_digest_member(gen_random_uuid(), gen_random_uuid(), NULL, 'x')$$, 'cancel rejects a NULL member'),
    ($$SELECT public.cancel_notification_digest_member(gen_random_uuid(), NULL, gen_random_uuid(), 'x')$$, 'cancel rejects a NULL token'),
    ($$SELECT public.cancel_notification_digest_member(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), NULL)$$, 'cancel rejects a NULL error code'),
    ($$SELECT public.cancel_notification_digest_member(gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'Bad-Code')$$, 'cancel rejects a malformed error code'),
    ($$SELECT public.begin_notification_digest_attempt(NULL, gen_random_uuid(), '\x01', NULL, NULL)$$, 'begin rejects a NULL run'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), NULL, '\x01', NULL, NULL)$$, 'begin rejects a NULL token'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '', NULL, NULL)$$, 'begin rejects an empty snapshot'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), decode(repeat('00', 262145), 'hex'), NULL, NULL)$$,
     'begin rejects a snapshot over 262144 bytes'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01', NULL, repeat('A', 64))$$, 'begin rejects an uppercase digest'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01', NULL, repeat('a', 63))$$, 'begin rejects a 63-character digest'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01', '{}', NULL)$$, 'begin rejects an empty member set'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01', ARRAY[NULL::uuid], NULL)$$, 'begin rejects a NULL member id'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01',
         ARRAY['22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000001']::uuid[], NULL)$$, 'begin rejects a repeated member id'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01',
         ARRAY[ARRAY[gen_random_uuid()], ARRAY[gen_random_uuid()]], NULL)$$, 'begin rejects a two-dimensional member set'),
    ($$SELECT public.begin_notification_digest_attempt(gen_random_uuid(), gen_random_uuid(), '\x01',
         ARRAY(SELECT gen_random_uuid() FROM generate_series(1, 201)), NULL)$$, 'begin rejects more than 200 member ids'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), NULL, NULL, NULL, NULL)$$, 'finish rejects a NULL outcome'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'digest', NULL, NULL, NULL)$$, 'finish rejects the digest outcome'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'unknown', 'x', NULL, NULL)$$, 'finish rejects unknown (settle owns it)'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'cancelled_after_ambiguous', 'x', NULL, NULL)$$,
     'finish rejects cancelled_after_ambiguous (settle owns it)'),
    ($$SELECT public.finish_notification_digest_run(NULL, gen_random_uuid(), 'sent', NULL, NULL, NULL)$$, 'finish rejects a NULL run'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), NULL, 'sent', NULL, NULL, NULL)$$, 'finish rejects a NULL token'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'failed', NULL, NULL, NULL)$$, 'finish rejects failed without an error code'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'cancelled', NULL, NULL, NULL)$$, 'finish rejects cancelled without an error code'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'retry', NULL, NULL, 60)$$, 'finish rejects retry without an error code'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'failed', 'Bad-Code', NULL, NULL)$$, 'finish rejects a malformed error code'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'sent', NULL, repeat('m', 256), NULL)$$, 'finish rejects a provider id over 255 chars'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'retry', 'x', NULL, NULL)$$, 'finish rejects retry without a delay'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'retry', 'x', NULL, 59)$$, 'finish rejects a delay under 60 seconds'),
    ($$SELECT public.finish_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'retry', 'x', NULL, 86401)$$, 'finish rejects a delay over 86400 seconds'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'sent', 'x')$$, 'settle rejects sent'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'cancelled', 'x')$$, 'settle rejects cancelled'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(gen_random_uuid(), gen_random_uuid(), NULL, 'x')$$, 'settle rejects a NULL outcome'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'unknown', NULL)$$, 'settle rejects a NULL error code'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(gen_random_uuid(), gen_random_uuid(), 'unknown', 'Bad-Code')$$, 'settle rejects a malformed error code'),
    ($$SELECT public.settle_ambiguous_notification_digest_run(NULL, gen_random_uuid(), 'unknown', 'x')$$, 'settle rejects a NULL run'),
    ($$SELECT public.purge_notification_digest_runs(NULL)$$, 'purge rejects a NULL limit'),
    ($$SELECT public.purge_notification_digest_runs(0)$$, 'purge rejects a zero limit'),
    ($$SELECT public.purge_notification_digest_runs(5001)$$, 'purge rejects a limit over 5000')
  ) t(q, label);
SELECT is(pg_temp.img_all(), current_setting('n22.before'), 'S1: the rejected calls changed nothing');

-- S2 — open (service_role). Backlog order: E (-20 d, but E already has a run for D), C (-10 d), A (-3 d), D (-60 h), F (-2 d); B later.
SELECT is(pg_temp.open(2, 3), ARRAY['c:1:t', 'a:3:t'],
  'S2: with p_limit 2 the two users with the oldest backlog get today''s run; E (oldest, already has a cancelled run for D) is not re-picked');
SELECT is(ARRAY[array_to_string(pg_temp.mem('a'), ','), array_to_string(pg_temp.mem('c'), ','), array_to_string(pg_temp.mem('a0'), ',')],
  ARRAY['a1:pending,a2:pending,a3:pending', 'c1:pending', 'a0:pending'],
  'S2: A''s rows from -3 d, -2 d and -1 h join one run of D (delayed catch-up), oldest first; a0 stays in its D-1 run');
SELECT is(
  ARRAY(SELECT replace(o.idempotency_key, 'n22-', '') FROM public.notification_email_outbox o
         WHERE o.user_id = pg_temp.uid('a') AND NOT EXISTS (SELECT 1 FROM public.notification_digest_run_members m WHERE m.outbox_id = o.id)
         ORDER BY 1),
  ARRAY['ac', 'ae', 'af', 'ai', 'al', 'am', 'as', 'at'],
  'S2: immediate, mandatory, sent, cancelled, frozen (snapshot), sending and at/after-due rows never join');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', r.status, r.attempt_count, r.lease_token IS NULL, r.send_snapshot IS NULL,
                 r.provider_key = 'notif-digest-' || encode(sha256(convert_to(format('["%s","%s"]', pg_temp.uid('a'), to_char(pg_temp.dd(), 'YYYY-MM-DD')), 'UTF8')), 'hex'))
     FROM public.notification_digest_runs r WHERE r.id = pg_temp.run('a')),
  'pending|0|t|t|t', 'S2: a new run is pending, unleased, unfrozen; its provider key is notif-digest-sha256(["user","YYYY-MM-DD"])');
SELECT is(
  (SELECT count(DISTINCT provider_key)::int FROM public.notification_digest_runs
    WHERE provider_key = 'notif-digest-' || encode(sha256(convert_to(format('["%s","%s"]', user_id, to_char(local_date, 'YYYY-MM-DD')), 'UTF8')), 'hex')),
  (SELECT count(*)::int FROM public.notification_digest_runs), 'S2: every run''s key is derived from its own (user, date), all distinct');
-- The immediate worker hands b1 over to the digest (the real N3-03 RPCs).
SELECT is(
  ARRAY(SELECT replace(c.idempotency_key, 'n22-', '') FROM public.claim_notification_emails('n22-wi', 100, 60) c),
  ARRAY['b1'], 'S5: the immediate worker claims only due immediate rows: b1, no digest row');
SELECT ok(public.finish_notification_email(pg_temp.oid('b1'), 'n22-wi', 'digest', NULL, NULL, NULL), 'S2: finish(..., digest) hands b1 to the digest');
SELECT is(pg_temp.open(100, 3), ARRAY['d:3:t', 'f:2:t', 'b:1:t'],
  'S2: the next call takes the remaining users, oldest backlog first; the handed-over email-only row b1 is eligible');
SELECT is(ARRAY[array_to_string(pg_temp.mem('d'), ','), array_to_string(pg_temp.mem('f'), ','), array_to_string(pg_temp.mem('b'), ',')],
  ARRAY['d1:pending,d2:pending,d3:pending', 'f1:pending,f2:pending', 'b1:pending'],
  'S2: p_max_members caps D''s run at its three oldest rows');
SELECT is(pg_temp.open(100, 200), '{}'::text[],
  'S2: a third call opens nothing: D''s overflow (d4, d5) is not added and no user gets a second run for D');
SELECT is(
  ARRAY[pg_temp.ost('d4'), pg_temp.ost('d5')]
  || ARRAY(SELECT format('%s=%s', pg_temp.tag(user_id), count(*)) FROM public.notification_digest_runs
            WHERE local_date = pg_temp.dd() GROUP BY user_id ORDER BY 1),
  ARRAY['pending/digest owner= lease= err= msg= snap= first= done=', 'pending/digest owner= lease= err= msg= snap= first= done=',
        'a=1', 'b=1', 'c=1', 'd=1', 'e=1', 'f=1'],
  'S2: overflow rows stay pending for a later date; exactly one run per user for D');
SELECT is(
  (SELECT format('%s|%s', count(*), count(*) FILTER (WHERE o.email_mode = 'digest' AND o.status = 'pending' AND o.email_reason <> 'mandatory'
                                                     AND o.created_at < pg_temp.due() AND o.user_id = r.user_id))
     FROM public.notification_digest_run_members m JOIN public.notification_digest_runs r ON r.id = m.run_id
     JOIN public.notification_email_outbox o ON o.id = m.outbox_id WHERE r.local_date = pg_temp.dd()),
  '10|10', 'S2: all ten members of D''s runs are pending digest rows of the run''s own user created before the due instant');

-- S1 — guards (postgres, which bypasses grants: only the triggers and constraints stop it)
RESET ROLE;
SELECT is(
  ARRAY[pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('a0'), pg_temp.oid('a1'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('a0'), pg_temp.oid('ai'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('a0'), pg_temp.oid('am'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('a0'), pg_temp.oid('af'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('a0'), pg_temp.oid('d4'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (%L, %L)$$, pg_temp.run('e'), pg_temp.oid('e1'))),
        pg_temp.try(format($$UPDATE public.notification_digest_run_members SET created_at = now() WHERE run_id = %L$$, pg_temp.run('a'))),
        pg_temp.try(format($$UPDATE public.notification_digest_run_members SET run_id = %L WHERE run_id = %L$$, pg_temp.run('a0'), pg_temp.run('a')))],
  ARRAY['23505', 'P0409', 'P0409', 'P0409', 'P0409', 'P0409', 'P0409', 'P0409'],
  'S1: a member of one run cannot join another (23505); immediate, mandatory, frozen rows, another user''s row and a finished run are refused; member rows are never updated');
SELECT is(
  ARRAY[pg_temp.try(format($$INSERT INTO public.notification_digest_runs (user_id, local_date) VALUES (%L, %L)$$, pg_temp.uid('a'), pg_temp.dd())),
        pg_temp.try(format($$INSERT INTO public.notification_digest_runs (user_id, local_date, status, completed_at) VALUES (%L, '2001-01-01', 'sent', now())$$, pg_temp.uid('p'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_runs (user_id, local_date, lease_token, lease_expires_at) VALUES (%L, '2001-01-01', gen_random_uuid(), now())$$, pg_temp.uid('p'))),
        pg_temp.try(format($$INSERT INTO public.notification_digest_runs (user_id, local_date, address_digest) VALUES (%L, '2001-01-01', %L)$$, pg_temp.uid('p'), pg_temp.hex('1'))),
        pg_temp.try(format($$UPDATE public.notification_digest_runs SET status = 'sent', completed_at = now() WHERE id = %L$$, pg_temp.run('c'))),
        pg_temp.try(format($$UPDATE public.notification_digest_runs SET last_error_code = 'x' WHERE id = %L$$, pg_temp.run('e'))),
        pg_temp.try(format($$UPDATE public.notification_digest_runs SET created_at = now() - interval '1 day' WHERE id = %L$$, pg_temp.run('c')))],
  ARRAY['23505', 'P0409', 'P0409', 'P0409', 'P0409', 'P0409', 'P0409'],
  'S1: one run per user and date; a run starts pending, unleased and unfrozen; pending -> sent is refused; a finished run never changes; created_at is immutable');
WITH ins AS (
  INSERT INTO public.notification_digest_runs (user_id, local_date, provider_key)
  VALUES (pg_temp.uid('p'), '2001-01-02', 'notif-digest-' || repeat('0', 64)) RETURNING provider_key)
SELECT is(
  (SELECT provider_key = 'notif-digest-' || encode(sha256(convert_to(format('["%s","2001-01-02"]', pg_temp.uid('p')), 'UTF8')), 'hex') FROM ins),
  true, 'S1: a provider key passed on INSERT is ignored; the derived key is stored');
DELETE FROM public.notification_digest_runs WHERE user_id = pg_temp.uid('p') AND local_date = '2001-01-02';

-- S3 — claim (service_role)
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.recovery('queued');
SELECT set_config('n22.before', pg_temp.img_all(), false);
SELECT is(ARRAY[public.password_recovery_email_due()::text] || pg_temp.claim(100, 60) || ARRAY[(pg_temp.img_all() = current_setting('n22.before'))::text],
  ARRAY['true', 'true'], 'S5: while password-recovery mail is due the digest claim leases nothing and changes nothing');
SELECT pg_temp.recovery(NULL);
SELECT set_config('n22.c2', array_to_string(pg_temp.claim(2, 30), ','), false);
SELECT set_config('n22.c100', array_to_string(pg_temp.claim(100, 900), ','), false);
SELECT is(
  ARRAY[cardinality(string_to_array(current_setting('n22.c2'), ',')), cardinality(string_to_array(current_setting('n22.c100'), ','))],
  ARRAY[2, 4], 'S3: claimer one gets two runs, claimer two the remaining four');
SELECT is(
  ARRAY(SELECT x FROM unnest(string_to_array(current_setting('n22.c2'), ',') || string_to_array(current_setting('n22.c100'), ',')) x ORDER BY x COLLATE "C"),
  ARRAY['a0:pending:0:f:f', 'a:pending:0:f:f', 'b:pending:0:f:f', 'c:pending:0:f:f', 'd:pending:0:f:f', 'f:pending:0:f:f'],
  'S3: together they hold every due run exactly once (disjoint); the terminal run of E is never claimed');
SELECT is(
  (SELECT format('%s|%s|%s', count(*), count(DISTINCT lease_token), count(*) FILTER (WHERE lease_expires_at - now() IN (interval '30 seconds', interval '900 seconds')))
     FROM public.notification_digest_runs WHERE lease_token IS NOT NULL),
  '6|6|6', 'S3: six live leases, six distinct tokens, each of the requested length');
SELECT is(pg_temp.claim(100, 60), '{}'::text[], 'S3: live leases are not taken over');
SELECT is(
  ARRAY[public.renew_notification_digest_run(pg_temp.run('a'), pg_temp.tok('a'), 120)::text, pg_temp.rst('a'),
        public.renew_notification_digest_run(pg_temp.run('a'), pg_temp.tok('c'), 600)::text,
        public.renew_notification_digest_run(pg_temp.run('c'), pg_temp.tok('a'), 600)::text, pg_temp.rst('a')],
  ARRAY['true', 'pending n=0 lease=00:02:00 snap= addr= err= msg= first= next=00:00:00 done=', 'false', 'false',
        'pending n=0 lease=00:02:00 snap= addr= err= msg= first= next=00:00:00 done='],
  'S3: the live token renews; the token of another run is refused on either run');
SELECT is(ARRAY[pg_temp.state('a', pg_temp.tok('a')), pg_temp.state('a', pg_temp.tok('c')), pg_temp.state('c', pg_temp.tok('a'))],
  ARRAY['pending:0:f:f:f', 'none', 'none'], 'S3: state answers the live token only');
SELECT is(
  ARRAY(SELECT format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', replace(o.idempotency_key, 'n22-', ''), m.status, m.event_type, m.category,
                      m.email_reason, m.related_url, m.payload, m.notification_id, m.source_kind, m.source_id)
          FROM public.notification_digest_run_members(pg_temp.run('a'), pg_temp.tok('a')) m
          JOIN public.notification_email_outbox o ON o.id = m.outbox_id),
  ARRAY['a1|pending|n22_evt|courses|category_mode|/n22/a1|{"k": "v"}|22000000-0000-4000-8000-0000000000aa|course|7',
        'a2|pending|n22_evt|assignments|catalog_default|/n22/a2|{"k": "v"}|||', 'a3|pending|n22_evt|community|category_mode|/n22/a3|{"k": "v"}|||'],
  'S3: members returns every member oldest first with its source reference; email-only rows have no in-app id');
SELECT is((SELECT count(*)::int FROM public.notification_digest_run_members(pg_temp.run('a'), pg_temp.tok('c'))), 0,
  'S3: members returns nothing for another run''s token');
-- A's lease runs out (a lease that expires exactly now is expired).
RESET ROLE;
SELECT set_config('n22.old', pg_temp.tok('a')::text, false);
UPDATE public.notification_digest_runs SET lease_expires_at = now() WHERE id = pg_temp.run('a');
SET LOCAL ROLE service_role;
SELECT is(pg_temp.stale('a', current_setting('n22.old')::uuid), 'f|none|0|f|NULL|f|f|same',
  'S3: an expired token can neither renew, read state or members, cancel, begin, finish nor settle; nothing changes');
SELECT is(pg_temp.claim(100, 60), ARRAY['a:pending:0:f:f'], 'S3: the expired lease, and only it, is re-claimed');
SELECT is(ARRAY[(pg_temp.tok('a') <> current_setting('n22.old')::uuid)::text,
                pg_temp.stale('a', current_setting('n22.old')::uuid)],
  ARRAY['true', 'f|none|0|f|NULL|f|f|same'],
  'S3: the re-claim issues a new token; the old owner still cannot do anything');
SELECT is(pg_temp.stale('a', pg_temp.tok('c')), 'f|none|0|f|NULL|f|f|same',
  'S3: a live token of another run cannot act on this run');
SELECT is(pg_temp.fin('a', pg_temp.tok('a'), 'retry', 'n22_retry', NULL, 60) || ' ' || pg_temp.rst('a') || ' ' || array_to_string(pg_temp.mem('a'), ','),
  't|changed pending n=0 lease= snap= addr= err=n22_retry msg= first= next=00:01:00 done= a1:pending,a2:pending,a3:pending',
  'S3: retry releases the lease until now + 60 s; membership is unchanged');
SELECT is(pg_temp.claim(100, 60), '{}'::text[], 'S3: a released run is not claimable before next_attempt_at');
RESET ROLE;
UPDATE public.notification_digest_runs SET next_attempt_at = now() WHERE id = pg_temp.run('a');
SET LOCAL ROLE service_role;
SELECT is(pg_temp.claim(100, 300), ARRAY['a:pending:0:f:f'], 'S3: once due again it is claimed again');

-- S4 — freeze of A (service_role). The address 'e' is suppressed.
RESET ROLE;
INSERT INTO public.notification_email_suppressions (address_digest) VALUES (pg_temp.hex('e'));
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES
  (pg_temp.uid('a'), 'community', 'digest'), (pg_temp.uid('a'), 'courses', 'digest');
SET LOCAL ROLE service_role;
SELECT is(
  ARRAY[pg_temp.bg('a', pg_temp.tok('a'), NULL, ARRAY['a1', 'a2', 'a3'], pg_temp.hex('a')),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', NULL, pg_temp.hex('a')),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2', 'a3'], NULL),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2'], pg_temp.hex('a')),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2', 'a3', 'ai'], pg_temp.hex('a')),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2', 'a3', 'd4'], pg_temp.hex('a')),
        pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2', 'a3'], pg_temp.hex('e'))],
  array_fill('NULL|same'::text, ARRAY[7]),
  'S4: no freeze without snapshot, member set or address, with a missing member, an extra row, another user''s row, or a suppressed address');
-- S5: unsubscribe from community before the freeze cancels the unfrozen member a3.
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', u.category, u.outcome, u.cancelled) FROM public.apply_notification_unsubscribe(pg_temp.uid('a'), ARRAY['community'],
          ARRAY[(SELECT pref_version FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('a') AND category = 'community')]) u)
  || ARRAY[pg_temp.ost('a3')],
  ARRAY['community:unsubscribed:1', 'cancelled/digest owner= lease= err=unsubscribed msg= snap= first= done=00:00:00'],
  'S5: apply_notification_unsubscribe cancels the unfrozen member a3');
SELECT is(pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a1', 'a2', 'a3'], pg_temp.hex('a')), 'NULL|same',
  'S4/S5: the member set read before the unsubscribe can no longer freeze');
SELECT is(pg_temp.bg('a', pg_temp.tok('a'), '\x0a01', ARRAY['a2', 'a1'], pg_temp.hex('a')), '0a01|changed',
  'S4: the exact set of still-pending members (any order) freezes and returns the snapshot');
SELECT is(
  ARRAY[pg_temp.rst('a'), pg_temp.ost('a1'), pg_temp.ost('a2'), pg_temp.ost('a3')],
  ARRAY['sending n=1 lease=00:05:00 snap=0a01 addr=a err=n22_retry msg= first=00:00:00 next=00:00:00 done=',
        'sending/digest owner= lease= err= msg= snap= first=00:00:00 done=', 'sending/digest owner= lease= err= msg= snap= first=00:00:00 done=',
        'cancelled/digest owner= lease= err=unsubscribed msg= snap= first= done=00:00:00'],
  'S4: the run stores snapshot and address and is sending (the earlier retry code stays until a terminal outcome); the frozen members are sending without a lease; a3 stays cancelled');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', replace(o.idempotency_key, 'n22-', ''), left(a.address_digest, 1), a.provider_message_id)
          FROM public.notification_email_outbox_address a JOIN public.notification_email_outbox o ON o.id = a.outbox_id
         WHERE o.user_id = pg_temp.uid('a') ORDER BY 1),
  ARRAY['a1:a:', 'a2:a:'], 'S4: the freeze records the address digest of each frozen member');
SELECT is(pg_temp.bg('a', pg_temp.tok('a'), '\xffff', ARRAY['ai'], pg_temp.hex('b')) || ' ' || pg_temp.rst('a'),
  '0a01|changed sending n=2 lease=00:05:00 snap=0a01 addr=a err=n22_retry msg= first=00:00:00 next=00:00:00 done=',
  'S4: a retry with other bytes, members and address gets the stored bytes back; only the attempt is counted');
SELECT is(pg_temp.cancel('a', pg_temp.tok('a'), 'a1', 'too_late'), 'f|same', 'S4: a frozen member cannot be cancelled');
-- S5: the immediate worker and its RPCs never take or move a frozen member.
RESET ROLE;
UPDATE public.notification_email_outbox SET next_attempt_at = now() - interval '1 minute' WHERE idempotency_key LIKE 'n22-%';
SET LOCAL ROLE service_role;
SELECT is(ARRAY(SELECT replace(c.idempotency_key, 'n22-', '') FROM public.claim_notification_emails('n22-wi2', 100, 60) c),
  ARRAY['ai'], 'S5: claim_notification_emails takes only the immediate row ai: no pending or sending digest member');
SELECT ok(public.finish_notification_email(pg_temp.oid('ai'), 'n22-wi2', 'retry', 'n22_later', NULL, 3600), 'S5: ai is released again');
SELECT set_config('n22.before', pg_temp.img_all(), false);
SELECT is(
  ARRAY[public.finish_notification_email(pg_temp.oid('a1'), 'n22-wi2', 'sent', NULL, 'n22-x', NULL)::text,
        public.finish_notification_email(pg_temp.oid('a1'), '', 'cancelled', 'x', NULL, NULL)::text,
        coalesce(encode(public.begin_notification_email_attempt(pg_temp.oid('a1'), 'n22-wi2', '\x01'), 'hex'), 'NULL'),
        public.settle_ambiguous_notification_email(pg_temp.oid('a1'), 'n22-wi2', 'cancelled_after_ambiguous', 'x')::text,
        coalesce(public.check_notification_email_address(pg_temp.oid('a1'), 'n22-wi2', pg_temp.hex('1')), 'NULL'),
        (SELECT count(*) FROM public.notification_email_retry_state(pg_temp.oid('a1'), 'n22-wi2'))::text,
        public.finish_notification_email(pg_temp.oid('f1'), 'n22-wi2', 'digest', NULL, NULL, NULL)::text,
        (pg_temp.img_all() = current_setting('n22.before'))::text],
  ARRAY['false', 'false', 'NULL', 'false', 'NULL', '0', 'false', 'true'],
  'S5: finish, begin, settle, check-address and retry-state of the immediate worker cannot touch a frozen or pending digest member');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', u.category, u.outcome, u.cancelled) FROM public.apply_notification_unsubscribe(pg_temp.uid('a'), ARRAY['courses'],
          ARRAY[(SELECT pref_version FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('a') AND category = 'courses')]) u)
  || ARRAY[pg_temp.ost('a1'), pg_temp.ost('ai')],
  ARRAY['courses:unsubscribed:1', 'sending/digest owner= lease= err= msg= snap= first=00:00:00 done=',
        'cancelled/immediate owner= lease= err=unsubscribed msg= snap= first= done=00:00:00'],
  'S5: unsubscribing from courses after the freeze cancels the pending immediate row ai but leaves the frozen member a1 sending');
-- Direct writes that would break the freeze (postgres).
RESET ROLE;
SELECT is(
  ARRAY(SELECT pg_temp.try(format('UPDATE public.notification_digest_runs SET %s WHERE id = %L', s, pg_temp.run('a')))
          FROM unnest(ARRAY[$$send_snapshot = '\xffff'$$, format('address_digest = %L', pg_temp.hex('b')),
                            $$provider_key = 'notif-digest-' || repeat('0', 64)$$, 'local_date = local_date + 1',
                            format('user_id = %L', pg_temp.uid('b')), 'id = gen_random_uuid()',
                            $$status = 'pending', send_snapshot = NULL$$, $$status = 'cancelled', send_snapshot = NULL, completed_at = now(), lease_token = NULL, lease_expires_at = NULL$$])
               WITH ORDINALITY u(s, n) ORDER BY n),
  array_fill('P0409'::text, ARRAY[8]),
  'S4: the frozen snapshot, address, provider key, date, user and id cannot be replaced; a frozen run never unfreezes or becomes cancelled');
SELECT is(pg_temp.try(format($$UPDATE public.notification_digest_runs SET send_snapshot = NULL WHERE id = %L$$, pg_temp.run('a'))), '23514',
  'S4: a sending run cannot lose its snapshot (frozen_check)');
SET LOCAL ROLE service_role;
SELECT is(
  ARRAY[pg_temp.fin('a', pg_temp.tok('a'), 'cancelled', 'x', NULL, NULL), pg_temp.settle('a', pg_temp.tok('a'), 'unknown', 'x')],
  ARRAY['f|same', 'f|same'], 'S4: a frozen run cannot be cancelled, nor settled unknown before it expires');
SELECT is(pg_temp.fin('a', pg_temp.tok('a'), 'retry', 'provider_5xx', NULL, 60) || ' ' || pg_temp.rst('a'),
  't|changed sending n=2 lease= snap=0a01 addr=a err=provider_5xx msg= first=00:00:00 next=00:01:00 done=',
  'S4: retry of a frozen run keeps snapshot and address and releases the lease');
RESET ROLE;
UPDATE public.notification_digest_runs SET next_attempt_at = now() WHERE id = pg_temp.run('a');
SET LOCAL ROLE service_role;
SELECT is(pg_temp.claim(100, 60), ARRAY['a:sending:2:t:f'], 'S4: the frozen run is claimed again with has_snapshot, not expired');
SELECT is(pg_temp.bg('a', pg_temp.tok('a'), '\x02', ARRAY['a1'], pg_temp.hex('c')), '0a01|changed', 'S4: the new owner resends the frozen bytes');
-- The first attempt is 24 hours old.
RESET ROLE;
UPDATE public.notification_digest_runs SET first_attempt_at = now() - interval '24 hours' WHERE id = pg_temp.run('a');
SET LOCAL ROLE service_role;
SELECT is(ARRAY[pg_temp.bg('a', pg_temp.tok('a'), '\x02', ARRAY['a1'], pg_temp.hex('c')), pg_temp.state('a', pg_temp.tok('a'))],
  ARRAY['NULL|same', 'sending:3:t:t:f'], 'S4: an expired run begins no attempt; state reports expired');
SELECT is(pg_temp.settle('a', pg_temp.tok('a'), 'unknown', 'expired_24h') || ' ' || pg_temp.rst('a') || ' ' || array_to_string(pg_temp.mem('a'), ','),
  't|changed unknown n=3 lease= snap= addr=a err=expired_24h msg= first=-1 days next=00:00:00 done=00:00:00 a1:unknown,a2:unknown,a3:cancelled',
  'S4/S5: unknown once expired: snapshot and lease cleared, the sending members follow, the unsubscribed a3 stays cancelled');
SELECT is(
  ARRAY[pg_temp.settle('a', current_setting('n22.old')::uuid, 'unknown', 'again'),
        pg_temp.fin('a', current_setting('n22.old')::uuid, 'failed', 'again', NULL, NULL),
        pg_temp.cancel('a', gen_random_uuid(), 'a2', 'again')],
  ARRAY['f|same', 'f|same', 'f|same'], 'S4: a settled run holds no lease: it cannot be settled, finished or changed again');
RESET ROLE;
SELECT is(pg_temp.try(format('UPDATE public.notification_digest_runs SET next_attempt_at = now() WHERE id = %L', pg_temp.run('a'))), 'P0409',
  'S4: a terminal run never changes, not even directly');
SET LOCAL ROLE service_role;

-- S4 — B: the frozen address is suppressed after the freeze -> cancelled_after_ambiguous.
SELECT is(pg_temp.bg('b', pg_temp.tok('b'), '\x0b', ARRAY['b1'], pg_temp.hex('b')), '0b|changed', 'S4: B freezes its email-only member b1');
RESET ROLE;
INSERT INTO public.notification_email_suppressions (address_digest) VALUES (pg_temp.hex('b'));
SET LOCAL ROLE service_role;
SELECT is(
  ARRAY[pg_temp.state('b', pg_temp.tok('b')), pg_temp.bg('b', pg_temp.tok('b'), '\x0b', ARRAY['b1'], pg_temp.hex('b')),
        pg_temp.settle('b', pg_temp.tok('b'), 'unknown', 'too_early')],
  ARRAY['sending:1:t:f:t', 'NULL|same', 'f|same'],
  'S4: state reports the suppressed frozen address; no retry attempt begins; unknown is refused before expiry');
SELECT is(pg_temp.settle('b', pg_temp.tok('b'), 'cancelled_after_ambiguous', 'address_suppressed') || ' ' || pg_temp.rst('b') || ' ' || pg_temp.ost('b1'),
  't|changed cancelled_after_ambiguous n=1 lease= snap= addr=b err=address_suppressed msg= first=00:00:00 next=00:00:00 done=00:00:00 '
  || 'cancelled_after_ambiguous/digest owner= lease= err=address_suppressed msg= snap= first=00:00:00 done=00:00:00',
  'S4: cancelled_after_ambiguous ends the run and its frozen member; snapshot and lease cleared');

-- S4 — C: failed.
SELECT is(
  ARRAY[pg_temp.fin('c', pg_temp.tok('c'), 'sent', NULL, 'n22-msg-c', NULL), pg_temp.fin('c', pg_temp.tok('c'), 'failed', 'x', NULL, NULL)],
  ARRAY['f|same', 'f|same'], 'S4: sent and failed need a frozen snapshot');
SELECT is(pg_temp.bg('c', pg_temp.tok('c'), '\x0c', ARRAY['c1'], pg_temp.hex('c')), '0c|changed', 'S4: C freezes');
SELECT is(pg_temp.fin('c', pg_temp.tok('c'), 'failed', 'provider:rejected', 'n22-ignored', NULL) || ' ' || pg_temp.rst('c') || ' ' || pg_temp.ost('c1'),
  't|changed failed n=1 lease= snap= addr=c err=provider:rejected msg= first=00:00:00 next=00:00:00 done=00:00:00 '
  || 'failed/digest owner= lease= err=provider:rejected msg= snap= first=00:00:00 done=00:00:00',
  'S4: failed ends the run and its member with the error code; no provider id is stored; snapshot cleared');

-- S4 — D: sent, then a bounce of that provider id.
SELECT is(pg_temp.bg('d', pg_temp.tok('d'), '\x0d', ARRAY['d3', 'd1', 'd2'], pg_temp.hex('d')), '0d|changed', 'S4: D freezes three members');
SELECT is(pg_temp.fin('d', pg_temp.tok('d'), 'sent', NULL, 'n22-msg-d', NULL) || ' ' || pg_temp.rst('d'),
  't|changed sent n=1 lease= snap= addr=d err= msg=n22-msg-d first=00:00:00 next=00:00:00 done=00:00:00',
  'S4: sent stores the provider id and completed_at and clears snapshot and lease');
SELECT is(
  ARRAY[pg_temp.ost('d1'), pg_temp.ost('d3'), pg_temp.ost('d4')]
  || ARRAY(SELECT format('%s:%s:%s', replace(o.idempotency_key, 'n22-', ''), left(a.address_digest, 1), a.provider_message_id)
             FROM public.notification_email_outbox_address a JOIN public.notification_email_outbox o ON o.id = a.outbox_id
            WHERE o.user_id = pg_temp.uid('d') ORDER BY 1),
  ARRAY['sent/digest owner= lease= err= msg=n22-msg-d snap= first=00:00:00 done=00:00:00',
        'sent/digest owner= lease= err= msg=n22-msg-d snap= first=00:00:00 done=00:00:00',
        'pending/digest owner= lease= err= msg= snap= first= done=',
        'd1:d:n22-msg-d', 'd2:d:n22-msg-d', 'd3:d:n22-msg-d'],
  'S4: the members are sent under the provider id, recorded next to each frozen address; the overflow row d4 is untouched');
SELECT is(public.record_notification_email_bounce('n22-msg-d'), 'suppressed', 'S4: a later bounce of the digest''s provider id matches the members'' address rows (N3-06 RPC)');
SELECT is(public.notification_email_address_suppressed(pg_temp.hex('d')), true, 'S4: that bounce suppressed the digest''s frozen address');

-- S4 — A's run of D-1: a bounce that arrives before finish.
SELECT is(public.record_notification_email_bounce('n22-msg-early'), 'pending', 'S4: a bounce that arrives before the digest is finished matches nothing yet');
SELECT is(pg_temp.bg('a0', pg_temp.tok('a0'), '\x00a0', ARRAY['a0'], pg_temp.hex('9')), '00a0|changed', 'S4: A''s run of D-1 freezes its member a0');
SELECT is(pg_temp.fin('a0', pg_temp.tok('a0'), 'sent', NULL, 'n22-msg-early', NULL) || ' ' || pg_temp.ost('a0'),
  't|changed sent/digest owner= lease= err= msg=n22-msg-early snap= first=00:00:00 done=00:00:00', 'S4: A''s run of D-1 is sent');
SELECT is(
  ARRAY[public.notification_email_address_suppressed(pg_temp.hex('9')),
        (SELECT applied_at IS NOT NULL FROM public.notification_email_bounce_events WHERE provider_message_id = 'n22-msg-early')],
  ARRAY[true, true], 'S4: finish(sent) applied the earlier bounce under the advisory lock: the frozen address is suppressed, the evidence stamped');

-- S4 — F: per-member cancellation, then the run is cancelled.
SELECT is(
  ARRAY[pg_temp.cancel('f', pg_temp.tok('f'), 'f1', 'access_revoked'), pg_temp.ost('f1'),
        pg_temp.cancel('f', pg_temp.tok('f'), 'f1', 'again'), pg_temp.cancel('f', pg_temp.tok('f'), 'd4', 'not_member'),
        pg_temp.cancel('f', pg_temp.tok('f'), 'a2', 'other_run'), pg_temp.cancel('f', gen_random_uuid(), 'f2', 'wrong_token')],
  ARRAY['t|changed', 'cancelled/digest owner= lease= err=access_revoked msg= snap= first= done=00:00:00',
        'f|same', 'f|same', 'f|same', 'f|same'],
  'S4: the live owner cancels one pending member once; a non-member, another run''s member or a wrong token change nothing');
SELECT is(
  ARRAY[pg_temp.fin('f', pg_temp.tok('f'), 'sent', NULL, 'x', NULL), pg_temp.fin('f', pg_temp.tok('f'), 'failed', 'x', NULL, NULL),
        pg_temp.settle('f', pg_temp.tok('f'), 'cancelled_after_ambiguous', 'x')],
  ARRAY['f|same', 'f|same', 'f|same'], 'S4: an unfrozen run can be neither sent, failed nor settled');
SELECT is(pg_temp.fin('f', pg_temp.tok('f'), 'cancelled', 'empty_digest', 'n22-ignored', NULL) || ' ' || pg_temp.rst('f') || ' '
          || pg_temp.ost('f1') || ' ' || pg_temp.ost('f2'),
  't|changed cancelled n=0 lease= snap= addr= err=empty_digest msg= first= next=00:00:00 done=00:00:00 '
  || 'cancelled/digest owner= lease= err=access_revoked msg= snap= first= done=00:00:00 '
  || 'cancelled/digest owner= lease= err=empty_digest msg= snap= first= done=00:00:00',
  'S4: cancelled ends an unfrozen run and its still-pending member; the earlier cancellation keeps its own code');
SELECT is(
  (SELECT format('%s/%s/%s/%s', count(*), count(send_snapshot), count(lease_token), count(completed_at))
     FROM public.notification_digest_runs WHERE status NOT IN ('pending', 'sending'))
  || ' ' || (SELECT count(*) FROM public.notification_digest_run_members m JOIN public.notification_digest_runs r ON r.id = m.run_id
              JOIN public.notification_email_outbox o ON o.id = m.outbox_id
             WHERE r.status NOT IN ('pending', 'sending') AND o.status IN ('pending', 'sending')),
  '7/0/0/7 0', 'S4: seven terminal runs, none keeps a snapshot or a lease; no member of a terminal run is left pending or sending');

-- S4 — retention (postgres builds old runs for P).
RESET ROLE;
INSERT INTO public.notification_digest_runs (user_id, local_date, created_at)
SELECT pg_temp.uid('p'), d::date, now() - c
  FROM (VALUES ('2000-01-01', interval '100 days'), ('2000-01-02', '120 days'), ('2000-01-03', '100 days'),
               ('2000-01-04', '100 days'), ('2000-01-05', '100 days')) t(d, c);
CREATE FUNCTION pg_temp.prun(d text) RETURNS uuid LANGUAGE sql VOLATILE AS $$
  SELECT id FROM public.notification_digest_runs WHERE user_id = pg_temp.uid('p') AND local_date = d::date $$;
INSERT INTO public.notification_digest_run_members (run_id, outbox_id) VALUES (pg_temp.prun('2000-01-01'), pg_temp.oid('p1'));
UPDATE public.notification_digest_runs SET status = 'cancelled', completed_at = now() - interval '95 days', last_error_code = 'n22_old'
 WHERE id = pg_temp.prun('2000-01-01');
UPDATE public.notification_digest_runs SET status = 'sending', send_snapshot = '\x01', address_digest = pg_temp.hex('1'),
       first_attempt_at = now() - interval '100 days'
 WHERE id IN (pg_temp.prun('2000-01-02'), pg_temp.prun('2000-01-05'));
UPDATE public.notification_digest_runs SET status = 'sent', send_snapshot = NULL, completed_at = now() - interval '91 days'
 WHERE id = pg_temp.prun('2000-01-02');
UPDATE public.notification_digest_runs SET status = 'cancelled', completed_at = now() - interval '10 days', last_error_code = 'n22_recent'
 WHERE id = pg_temp.prun('2000-01-03');
SET LOCAL ROLE service_role;
SELECT is(ARRAY[public.purge_notification_digest_runs(1), public.purge_notification_digest_runs(100), public.purge_notification_digest_runs(100)],
  ARRAY[1, 1, 0], 'S4: purge deletes terminal runs completed and created over 90 days ago, oldest created first, up to the limit');
SELECT is(
  ARRAY(SELECT format('%s:%s', local_date, status) FROM public.notification_digest_runs WHERE user_id = pg_temp.uid('p') ORDER BY 1)
  || ARRAY[(SELECT count(*) FROM public.notification_digest_run_members WHERE outbox_id = pg_temp.oid('p1'))::text,
           (SELECT count(*) FROM public.notification_digest_runs WHERE local_date = pg_temp.dd() OR local_date = pg_temp.dd() - 1)::text],
  ARRAY['2000-01-03:cancelled', '2000-01-04:pending', '2000-01-05:sending', '0', '7'],
  'S4: a recently completed, a pending and a sending run stay however old; the purged run''s member row went with it; today''s runs stay');
RESET ROLE;
UPDATE public.notification_email_outbox SET created_at = now() - interval '100 days', completed_at = now() - interval '95 days'
 WHERE idempotency_key = 'n22-c1';
SET LOCAL ROLE service_role;
SELECT is(ARRAY[public.purge_notification_email_outbox(100)::text, array_to_string(pg_temp.mem('c'), ','), left(pg_temp.rst('c'), 8)],
  ARRAY['1', '', 'failed n'],
  'S4: the outbox purge removes an old finished member row through the FK cascade (service_role needs no member DELETE grant); the run stays');
RESET ROLE;

-- S1 — role x operation matrix: runs select/insert/update, members select/insert/update/delete, runs delete, then the eleven RPCs.
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]), 'S1: anon can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.authenticate_as('n22_a');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]), 'S1: the authenticated recipient can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.authenticate_as('n22_other');
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]), 'S1: another authenticated user can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.authenticate_as('n22_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n22.admin'), 'role', 'authenticated',
  'email', 'n22-admin@qa.local.test', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]),
  'S1: an authenticated admin (user_roles row + JWT role claims) can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.authenticate_as('n22_docente');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n22.docente'), 'role', 'authenticated',
  'email', 'n22-docente@qa.local.test', 'app_metadata', json_build_object('role', 'docente', 'roles', json_build_array('docente')),
  'user_metadata', json_build_object('role', 'docente'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]),
  'S1: an authenticated docente (user_roles row + JWT role claims) can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.authenticate_as('n22_directivo');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n22.directivo'), 'role', 'authenticated',
  'email', 'n22-directivo@qa.local.test', 'app_metadata', json_build_object('role', 'equipo_directivo', 'roles', json_build_array('equipo_directivo')),
  'user_metadata', json_build_object('role', 'equipo_directivo'))::text, true);
SELECT is(pg_temp.probe(), array_fill('42501'::text, ARRAY[19]),
  'S1: an authenticated equipo_directivo (user_roles row + JWT role claims) can neither read nor write either table nor execute any digest RPC');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), ARRAY['ok', 'ok', 'ok', 'ok', 'ok', '42501', '42501', 'ok'] || array_fill('ok'::text, ARRAY[11]),
  'S1: service_role can do all of it except UPDATE or DELETE a member row');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.notification_digest_runs WHERE id = '22000000-0000-4000-8000-0000000000ff'), 0,
  'S1: no probe row survived');

SELECT * FROM finish();

ROLLBACK;
