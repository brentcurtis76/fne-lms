-- =============================================================================
-- 102-notification-unsubscribe.sql — NOTIF N3-05
-- Covers migration 20260930040000_notification_unsubscribe.sql:
--   shape of the column, the sequence, the trigger and the two functions
--      (security mode, volatility, pinned search_path, ACL, signature), RLS
--      still on for both tables
--   D1 the version is server-controlled (authenticated owner, real RLS): a
--      forged pref_version is never stored, a mode change advances it
--   D1 one category, matching version, and a row the signer created (a link
--      is only signed for an existing row: the signer inserts it first, in
--      mode default): mode off once, version advanced, exactly the matching
--      pending optional rows cancelled; a replay is already_off and writes
--      nothing
--   D2 (database side) a wrong, foreign or outdated version, a missing row
--      and an unknown user are stale, and the RPC never creates a row; every
--      invalid argument, version 0 included, is 22023; nothing is written
--   D3 two users x two categories: what is cancelled and what is kept; a
--      later choice by the owner is never undone, a DELETE included (no link
--      signed for a deleted row applies again or brings the row back); one
--      call for several categories; a failure rolls the whole call back;
--      role x operation matrix (anon / authenticated recipient, other,
--      admin: 42501; service_role allowed; the owner's own preference DML
--      still works)
-- Synthetic fixtures only (*@test.local, fixed UUIDs). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(115);

-- Shape and privileges (postgres)
SELECT is(
  (SELECT format('%s|%s|%s', format_type(a.atttypid, a.atttypmod), a.attnotnull, pg_get_expr(d.adbin, d.adrelid))
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
    WHERE a.attrelid = 'public.user_notification_category_prefs'::regclass AND a.attname = 'pref_version' AND NOT a.attisdropped),
  'bigint|t|1', 'D1: pref_version is bigint NOT NULL DEFAULT 1');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', seqtypid::regtype, seqstart, seqmin, seqincrement, seqcycle) FROM pg_sequence
    WHERE seqrelid = 'public.user_notification_category_pref_version_seq'::regclass),
  'bigint|2|2|1|f', 'D1: the version sequence is bigint, starts at 2 (minimum 2), step 1, no cycle');
SELECT is(
  ARRAY(SELECT has_sequence_privilege(r, 'public.user_notification_category_pref_version_seq', p)
          FROM unnest(ARRAY['anon', 'authenticated', 'public']) r, unnest(ARRAY['USAGE', 'SELECT', 'UPDATE']) p),
  array_fill(false, ARRAY[9]), 'D3: PUBLIC, anon and authenticated hold no USAGE, SELECT or UPDATE on the version sequence');
SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.user_notification_category_pref_version_seq'::regclass
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, 'D3: the sequence ACL has no PUBLIC/anon/authenticated entry');
-- tgtype 23 = BEFORE INSERT OR UPDATE, FOR EACH ROW; 19 = BEFORE UPDATE, FOR EACH ROW.
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s.%s:%s', t.tgname, t.tgtype, t.tgenabled, p.pronamespace::regnamespace, p.proname, p.prosecdef)
          FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.user_notification_category_prefs'::regclass AND NOT t.tgisinternal ORDER BY t.tgname),
  ARRAY['set_user_notification_category_prefs_version:23:O:public.set_user_notification_category_pref_version:t',
        'update_user_notification_category_prefs_updated_at:19:O:public.update_updated_at_column:f'],
  'D1: the table has the version trigger (BEFORE INSERT OR UPDATE, each row, enabled, SECURITY DEFINER function) and the updated_at trigger');

CREATE TEMP TABLE n16_fn (sig text, mode text, shape text) ON COMMIT DROP;
INSERT INTO n16_fn VALUES
  ('public.set_user_notification_category_pref_version()', 't|v', ' -> trigger'),
  ('public.apply_notification_unsubscribe(uuid, text[], bigint[])', 'f|v',
   'p_user_id uuid, p_categories text[], p_versions bigint[] -> TABLE(category text, outcome text, cancelled integer)');
SELECT is(
  (SELECT format('%s|%s|%s|%s', prosecdef, provolatile, proconfig,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = f.sig::regprocedure),
  f.mode || '|{"search_path=\"\""}|0',
  format('D3: %s: security mode and volatility (%s), search_path pinned; ACL has no PUBLIC/anon/authenticated entry', f.sig, f.mode))
  FROM n16_fn f;
SELECT is(
  ARRAY(SELECT has_function_privilege(r, f.sig, 'EXECUTE')
          FROM unnest(ARRAY['anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[false, false, false], format('D3: no EXECUTE on %s for anon, authenticated or PUBLIC', f.sig))
  FROM n16_fn f;
SELECT ok(has_function_privilege('service_role', 'public.apply_notification_unsubscribe(uuid, text[], bigint[])', 'EXECUTE'),
  'D3: service_role may EXECUTE apply_notification_unsubscribe');
SELECT is(pg_get_function_arguments(f.sig::regprocedure) || ' -> ' || pg_get_function_result(f.sig::regprocedure), f.shape,
  format('D1: parameter names, order and return shape of %s', f.sig))
  FROM n16_fn f;
SELECT tests.rls_enabled('public', 'user_notification_category_prefs');
SELECT tests.rls_enabled('public', 'notification_email_outbox');

-- Synthetic fixtures (postgres) and helpers. 'ghost' has no auth user and no profile.
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('n16_a', 'n16-a@test.local');
  v_b uuid := tests.create_supabase_user('n16_b', 'n16-b@test.local');
  v_v uuid := tests.create_supabase_user('n16_v', 'n16-v@test.local');
  v_admin uuid := tests.create_supabase_user('n16_admin', 'n16-admin@test.local');
BEGIN
  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password) VALUES
    (v_a, 'n16-a@test.local', 'N16 A', 'approved', false),
    (v_b, 'n16-b@test.local', 'N16 B', 'approved', false),
    (v_v, 'n16-v@test.local', 'N16 V', 'approved', false),
    (v_admin, 'n16-admin@test.local', 'N16 Admin', 'approved', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_admin, 'admin', NULL, true);
  PERFORM set_config('n16.a', v_a::text, false);
  PERFORM set_config('n16.b', v_b::text, false);
  PERFORM set_config('n16.v', v_v::text, false);
  PERFORM set_config('n16.admin', v_admin::text, false);
  PERFORM set_config('n16.ghost', '16000000-0000-4000-8000-0000000000ee', false);
END
$fixture$;

-- A fixture user by tag, the tag of a user, and a stored version by key.
CREATE FUNCTION pg_temp.uid(t text) RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('n16.' || t)::uuid $$;
CREATE FUNCTION pg_temp.utag(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT t FROM unnest(ARRAY['a', 'b', 'v', 'admin']) t WHERE pg_temp.uid(t) = p), '?') $$;
CREATE FUNCTION pg_temp.g(k text) RETURNS bigint LANGUAGE sql AS $$ SELECT current_setting('n16.' || k)::bigint $$;
CREATE FUNCTION pg_temp.ver(u text, cat text) RETURNS bigint LANGUAGE sql AS $$
  SELECT c.pref_version FROM public.user_notification_category_prefs c WHERE c.user_id = pg_temp.uid(u) AND c.category = cat $$;
-- One preference row as 'mode|same' (the version is still p_old), 'mode|fresh' (a later version that is also the
-- newest value the sequence has handed out to any row) or 'mode|other'; 'no row' when there is none.
CREATE FUNCTION pg_temp.pst(u text, cat text, p_old bigint) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT format('%s|%s', c.email_mode, CASE
             WHEN c.pref_version = p_old THEN 'same'
             WHEN c.pref_version > p_old AND c.pref_version = (SELECT max(x.pref_version) FROM public.user_notification_category_prefs x)
               THEN 'fresh' ELSE 'other' END)
            FROM public.user_notification_category_prefs c WHERE c.user_id = pg_temp.uid(u) AND c.category = cat), 'no row') $$;
CREATE FUNCTION pg_temp.modes(u text) RETURNS text[] LANGUAGE sql AS $$
  SELECT ARRAY(SELECT c.category || ':' || c.email_mode FROM public.user_notification_category_prefs c
                WHERE c.user_id = pg_temp.uid(u) ORDER BY c.category) $$;
-- The whole state: every outbox row and every preference row, except the listed outbox tags and 'user:category'
-- preference rows. ctid is part of the image, so an UPDATE that rewrites a row with the same values is seen too.
CREATE FUNCTION pg_temp.img(p_out text[] DEFAULT '{}', p_pref text[] DEFAULT '{}') RETURNS text LANGUAGE sql AS $$
  SELECT md5(coalesce((SELECT string_agg(o.ctid::text || o::text, ',' ORDER BY o.id) FROM public.notification_email_outbox o
                        WHERE replace(o.idempotency_key, 'n16-', '') <> ALL (p_out)), ''))
      || md5(coalesce((SELECT string_agg(c.ctid::text || c::text, ',' ORDER BY c.user_id, c.category)
                         FROM public.user_notification_category_prefs c
                        WHERE pg_temp.utag(c.user_id) || ':' || c.category <> ALL (p_pref)), '')) $$;
-- One outbox fixture row; times are relative to now().
CREATE FUNCTION pg_temp.put(p_n text, p_tag text, p_u text, p_cat text, p_mode text, p_reason text, p_status text,
                            p_owner text DEFAULT NULL, p_lease interval DEFAULT NULL, p_snap bytea DEFAULT NULL,
                            p_done interval DEFAULT NULL) RETURNS void LANGUAGE sql AS $$
  INSERT INTO public.notification_email_outbox
    (id, idempotency_key, event_type, occurrence_id, user_id, category, email_mode, email_reason, payload, status,
     lease_owner, lease_expires_at, send_snapshot, completed_at)
  VALUES (('16000000-0000-4000-8000-0000000000' || p_n)::uuid, 'n16-' || p_tag, 'n16_evt', 'occ:' || p_tag, pg_temp.uid(p_u),
          p_cat, p_mode, p_reason, '{"k": "v"}', p_status, p_owner, now() + p_lease, p_snap, now() + p_done) $$;
-- What a cancel may change on one outbox row, and everything else on the listed rows.
CREATE FUNCTION pg_temp.st(t text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s err=%s done=%s owner=%s lease=%s', status, last_error_code, completed_at - now(), lease_owner, lease_expires_at - now())
    FROM public.notification_email_outbox WHERE idempotency_key = 'n16-' || t $$;
CREATE FUNCTION pg_temp.core(p_tags text[]) RETURNS text LANGUAGE sql AS $$
  SELECT md5(string_agg((to_jsonb(o) - ARRAY['status', 'completed_at', 'last_error_code', 'lease_owner', 'lease_expires_at', 'updated_at'])::text,
                        ',' ORDER BY o.id))
    FROM public.notification_email_outbox o WHERE replace(o.idempotency_key, 'n16-', '') = ANY (p_tags) $$;
-- The tags of the rows the unsubscribe RPC has cancelled so far, and tag=status of every fixture row.
CREATE FUNCTION pg_temp.gone() RETURNS text[] LANGUAGE sql AS $$
  SELECT ARRAY(SELECT replace(idempotency_key, 'n16-', '') FROM public.notification_email_outbox
                WHERE idempotency_key LIKE 'n16-%' AND status = 'cancelled' AND last_error_code = 'unsubscribed' ORDER BY id) $$;
-- The RPC for a fixture user: 'category|outcome|cancelled' of each returned row, in returned order.
CREATE FUNCTION pg_temp.unsub(u text, cats text[], vers bigint[]) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(format('%s|%s|%s', r.category, r.outcome, r.cancelled), ' ' ORDER BY r.ord), 'no rows')
    FROM public.apply_notification_unsubscribe(pg_temp.uid(u), cats, vers) WITH ORDINALITY r(category, outcome, cancelled, ord) $$;
-- The version trigger seen by a client: INSERT or UPDATE one row of user v sending p_forged as pref_version
-- (UPDATE: NULL keeps the mode or sends no version); the stored version, NULL when no row was written.
CREATE FUNCTION pg_temp.vins(cat text, p_mode text, p_forged bigint) RETURNS bigint LANGUAGE sql AS $$
  INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode, pref_version)
  VALUES (pg_temp.uid('v'), cat, p_mode, p_forged) RETURNING pref_version $$;
CREATE FUNCTION pg_temp.vupd(cat text, p_mode text, p_forged bigint) RETURNS bigint LANGUAGE sql AS $$
  UPDATE public.user_notification_category_prefs c
     SET email_mode = coalesce(p_mode, c.email_mode), pref_version = coalesce(p_forged, c.pref_version)
   WHERE c.user_id = pg_temp.uid('v') AND c.category = cat RETURNING c.pref_version $$;
-- Try the RPC (for the unknown user: no write), the four outbox operations and, for a browser role, the sequence;
-- return the SQLSTATEs. setval is given a value nextval just handed out, so it could never move the sequence back.
CREATE FUNCTION pg_temp.probe(p_seq boolean) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; v_id uuid := '16000000-0000-4000-8000-0000000000ff';
BEGIN
  BEGIN PERFORM public.apply_notification_unsubscribe(pg_temp.uid('ghost'), ARRAY['courses'], ARRAY[1::bigint]); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM count(*) FROM public.notification_email_outbox; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox (id, idempotency_key, event_type, occurrence_id, user_id, email_mode, email_reason)
        VALUES (v_id, 'n16-probe', 'n16_x', 'occ:p', pg_temp.uid('a'), 'immediate', 'unmapped_event'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox SET next_attempt_at = now() + interval '1 day' WHERE id = v_id; s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox WHERE id = v_id; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  IF p_seq THEN
    BEGIN PERFORM nextval('public.user_notification_category_pref_version_seq'); s := s || 'ok'::text;
    EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
    BEGIN PERFORM setval('public.user_notification_category_pref_version_seq', nextval('public.user_notification_category_pref_version_seq'));
          s := s || 'ok'::text;
    EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  END IF;
  RETURN s;
END $$;
-- Preference DML on the rows of user p_u: rows read ('system'), INSERT 'qa_support', rows updated and rows
-- deleted (both categories); a SQLSTATE where the statement was refused.
CREATE FUNCTION pg_temp.prefs_probe(p_u text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}'; n bigint; v_u uuid := pg_temp.uid(p_u);
BEGIN
  BEGIN SELECT count(*) INTO n FROM public.user_notification_category_prefs WHERE user_id = v_u AND category = 'system'; s := s || n::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (v_u, 'qa_support', 'digest'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.user_notification_category_prefs SET email_mode = 'immediate' WHERE user_id = v_u AND category IN ('qa_support', 'system');
        GET DIAGNOSTICS n = ROW_COUNT; s := s || n::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.user_notification_category_prefs WHERE user_id = v_u AND category IN ('qa_support', 'system');
        GET DIAGNOSTICS n = ROW_COUNT; s := s || n::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;

-- D1 — the version is server-controlled (the authenticated owner v, real RLS)
SELECT tests.authenticate_as('n16_v');
SELECT set_config('n16.v1', pg_temp.vins('courses', 'immediate', 1)::text, false);
SELECT ok(pg_temp.g('v1') >= 2 AND pg_temp.ver('v', 'courses') = pg_temp.g('v1'),
  'D1: an INSERT that sends pref_version 1 stores a sequence value (>= 2), not the forged one');
SELECT set_config('n16.v2', pg_temp.vins('sessions', 'digest', 9000000000000000)::text, false);
SELECT ok(pg_temp.g('v2') > pg_temp.g('v1') AND pg_temp.g('v2') < 9000000000000000,
  'D1: an INSERT that sends a far-future pref_version stores the next sequence value, not the forged one');
SELECT set_config('n16.v3', pg_temp.vupd('courses', 'digest', NULL)::text, false);
SELECT ok(pg_temp.g('v3') > pg_temp.g('v2'), 'D1: an UPDATE of email_mode advances the version');
SELECT is(ARRAY[pg_temp.vupd('courses', NULL, 1), pg_temp.vupd('courses', NULL, pg_temp.g('v1')),
                pg_temp.vupd('courses', 'digest', 9000000000000000), pg_temp.vupd('courses', NULL, NULL)],
  array_fill(pg_temp.g('v3'), ARRAY[4]),
  'D1: an UPDATE that forges a version (1, an old one, a far-future one) without changing the mode leaves the version unchanged');
SELECT set_config('n16.v4', pg_temp.vupd('courses', 'immediate', pg_temp.g('v1'))::text, false);
SELECT ok(pg_temp.g('v4') > pg_temp.g('v3'), 'D1: a forged old version together with a mode change stores a new sequence value, not the forged one');
WITH up AS (
  INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode, pref_version)
  VALUES (pg_temp.uid('v'), 'courses', 'immediate', 1)
  ON CONFLICT (user_id, category) DO UPDATE SET email_mode = EXCLUDED.email_mode, pref_version = EXCLUDED.pref_version
  RETURNING pref_version)
SELECT is((SELECT pref_version FROM up), pg_temp.g('v4'), 'D1: an upsert with the same mode and a forged version leaves the version unchanged');
WITH up AS (
  INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode, pref_version)
  VALUES (pg_temp.uid('v'), 'courses', 'off', 1)
  ON CONFLICT (user_id, category) DO UPDATE SET email_mode = EXCLUDED.email_mode, pref_version = EXCLUDED.pref_version
  RETURNING pref_version)
SELECT set_config('n16.v5', (SELECT pref_version FROM up)::text, false);
SELECT ok(pg_temp.g('v5') > pg_temp.g('v4'), 'D1: an upsert that changes the mode advances the version');
DELETE FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('v') AND category = 'courses';
SELECT set_config('n16.v6', pg_temp.vins('courses', 'off', pg_temp.g('v1'))::text, false);
SELECT ok(pg_temp.g('v6') > pg_temp.g('v5'), 'D1: DELETE then INSERT gives a version greater than every earlier one (no version is handed out twice)');
WITH up AS (
  UPDATE public.user_notification_category_prefs SET category = 'advisory', pref_version = 1
   WHERE user_id = pg_temp.uid('v') AND category = 'sessions' RETURNING pref_version)
SELECT ok((SELECT pref_version FROM up) > pg_temp.g('v6'), 'D1: an UPDATE of category advances the version');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT set_config('n16.vimg', pg_temp.img(), false);
SELECT tests.authenticate_as('n16_b');
WITH up AS (
  UPDATE public.user_notification_category_prefs SET email_mode = 'immediate', pref_version = 1
   WHERE user_id = pg_temp.uid('v') RETURNING 1)
SELECT is((SELECT count(*)::int FROM up), 0, 'D1: another user''s UPDATE of mode and version matches no row (empty result)');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.img(), current_setting('n16.vimg'), 'D1: and it changed nothing');
WITH up AS (
  UPDATE public.user_notification_category_prefs SET user_id = pg_temp.uid('admin')
   WHERE user_id = pg_temp.uid('v') AND category = 'advisory' RETURNING pref_version)
SELECT ok((SELECT pref_version FROM up) > pg_temp.g('v6') + 1, 'D1: an UPDATE of user_id (server side) advances the version');

-- Fixtures for D1..D3 (postgres). Preference rows; user a has no row for community and qa_support, user b none
-- for advisory and sessions. Both system rows are off, and they are the only ones of that category.
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode)
SELECT pg_temp.uid(t.u), t.cat, t.mode
  FROM (VALUES ('a', 'courses', 'immediate'), ('a', 'assignments', 'immediate'), ('a', 'sessions', 'immediate'),
               ('a', 'advisory', 'immediate'), ('a', 'licitaciones', 'immediate'), ('a', 'system', 'off'),
               ('b', 'assignments', 'immediate'), ('b', 'courses', 'immediate'), ('b', 'community', 'default'),
               ('b', 'system', 'off')) t(u, cat, mode);
SELECT set_config('n16.' || t.k, pg_temp.ver(t.u, t.cat)::text, false)
  FROM (VALUES ('vc', 'a', 'courses'), ('va', 'a', 'assignments'), ('vs', 'a', 'sessions'), ('vd', 'a', 'advisory'),
               ('vl', 'a', 'licitaciones'), ('vy', 'a', 'system'), ('vba', 'b', 'assignments'), ('vbc', 'b', 'courses'),
               ('vbm', 'b', 'community')) t(k, u, cat);
-- Outbox rows. c* and m* belong to D1 (a/courses, a/community). s1..sb are the unsubscribed pair of D3
-- (a/assignments): two pending optional rows (s2 with a leftover lease), then every row that must survive:
-- mandatory, sending without and with a snapshot, pending with a snapshot (ambiguous) and the five terminal
-- statuses. sn has no category, so is another category of a, su the same category of b. b1..b4 serve the
-- call for several categories, x1/x2 the atomicity case.
SELECT pg_temp.put(t.n, t.tag, t.u, t.cat, t.mode, t.reason, t.status, t.owner, t.lease, t.snap, t.done)
  FROM (VALUES
    ('01', 'c1', 'a', 'courses', 'immediate', 'category_mode', 'pending', NULL::text, NULL::interval, NULL::bytea, NULL::interval),
    ('02', 'c2', 'a', 'courses', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL),
    ('03', 'c3', 'a', 'courses', 'immediate', 'mandatory', 'pending', NULL, NULL, NULL, NULL),
    ('04', 'm1', 'a', 'community', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL),
    ('05', 'm2', 'a', 'community', 'immediate', 'mandatory', 'pending', NULL, NULL, NULL, NULL),
    ('11', 's1', 'a', 'assignments', 'immediate', 'category_mode', 'pending', NULL, NULL, NULL, NULL),
    ('12', 's2', 'a', 'assignments', 'digest', 'catalog_default', 'pending', 'w0', '-1 hour', NULL, NULL),
    ('13', 's3', 'a', 'assignments', 'immediate', 'mandatory', 'pending', NULL, NULL, NULL, NULL),
    ('14', 's4', 'a', 'assignments', 'immediate', 'category_mode', 'sending', 'w1', '5 minutes', NULL, NULL),
    ('15', 's5', 'a', 'assignments', 'immediate', 'category_mode', 'sending', 'w1', '5 minutes', '\xa5', NULL),
    ('16', 's6', 'a', 'assignments', 'immediate', 'category_mode', 'pending', NULL, NULL, '\xa6', NULL),
    ('17', 's7', 'a', 'assignments', 'immediate', 'category_mode', 'sent', NULL, NULL, NULL, '-1 hour'),
    ('18', 's8', 'a', 'assignments', 'immediate', 'category_mode', 'failed', NULL, NULL, NULL, '-1 hour'),
    ('19', 's9', 'a', 'assignments', 'immediate', 'category_mode', 'cancelled', NULL, NULL, NULL, '-1 hour'),
    ('20', 'sa', 'a', 'assignments', 'immediate', 'category_mode', 'cancelled_after_ambiguous', NULL, NULL, NULL, '-1 hour'),
    ('21', 'sb', 'a', 'assignments', 'immediate', 'category_mode', 'unknown', NULL, NULL, NULL, '-1 hour'),
    ('22', 'sn', 'a', NULL, 'immediate', 'unmapped_event', 'pending', NULL, NULL, NULL, NULL),
    ('23', 'so', 'a', 'sessions', 'immediate', 'category_mode', 'pending', NULL, NULL, NULL, NULL),
    ('24', 'su', 'b', 'assignments', 'immediate', 'category_mode', 'pending', NULL, NULL, NULL, NULL),
    ('25', 'b1', 'b', 'courses', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL),
    ('26', 'b2', 'b', 'sessions', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL),
    ('27', 'b3', 'b', 'sessions', 'immediate', 'mandatory', 'pending', NULL, NULL, NULL, NULL),
    ('28', 'b4', 'b', 'community', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL),
    ('31', 'x1', 'a', 'advisory', 'immediate', 'category_mode', 'pending', NULL, NULL, NULL, NULL),
    ('32', 'x2', 'a', 'licitaciones', 'digest', 'catalog_default', 'pending', NULL, NULL, NULL, NULL)
  ) t(n, tag, u, cat, mode, reason, status, owner, lease, snap, done);
-- Test-only: while n16.refuse is 'on', the cancel of x2 fails (D3 atomicity).
CREATE FUNCTION pg_temp.refuse() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'n16: cancel refused'; END $$;
CREATE TRIGGER n16_refuse BEFORE UPDATE ON public.notification_email_outbox
  FOR EACH ROW WHEN (OLD.idempotency_key = 'n16-x2' AND current_setting('n16.refuse', true) = 'on')
  EXECUTE FUNCTION pg_temp.refuse();

-- D1 — one category, matching version (service_role)
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT set_config('n16.keep', pg_temp.img(ARRAY['c1', 'c2'], ARRAY['a:courses']), false);
SELECT set_config('n16.core', pg_temp.core(ARRAY['c1', 'c2']), false);
SELECT is(pg_temp.unsub('a', '{courses}', ARRAY[pg_temp.g('vc')]), 'courses|unsubscribed|2',
  'D1: a matching version unsubscribes the category and reports the two cancelled rows');
SELECT is(pg_temp.pst('a', 'courses', pg_temp.g('vc')), 'off|fresh', 'D1: the mode is off and the version advanced to a new sequence value');
SELECT is(ARRAY[pg_temp.st('c1'), pg_temp.st('c2')], array_fill('cancelled err=unsubscribed done=00:00:00 owner= lease='::text, ARRAY[2]),
  'D1: the pending optional rows, immediate and digest, are cancelled: last_error_code unsubscribed, completed_at set');
SELECT is(pg_temp.core(ARRAY['c1', 'c2']), current_setting('n16.core'), 'D1: nothing else changed on the cancelled rows');
SELECT is(pg_temp.gone(), ARRAY['c1', 'c2'], 'D1: exactly those two rows were cancelled: the mandatory row of the category is still pending');
SELECT is(pg_temp.img(ARRAY['c1', 'c2'], ARRAY['a:courses']), current_setting('n16.keep'),
  'D1: every other outbox row and preference row is byte-identical');
-- A pending optional row that appears afterwards must survive a replay.
SELECT pg_temp.put('41', 'c4', 'a', 'courses', 'immediate', 'category_mode', 'pending');
SELECT set_config('n16.vcu', pg_temp.ver('a', 'courses')::text, false);
SELECT set_config('n16.all', pg_temp.img(), false);
SELECT is(ARRAY[pg_temp.unsub('a', '{courses}', ARRAY[pg_temp.g('vc')]), pg_temp.unsub('a', '{courses}', ARRAY[pg_temp.g('vcu')])],
  array_fill('courses|already_off|0'::text, ARRAY[2]), 'D1: a replay with the same version, or with the new one, is already_off');
SELECT is(pg_temp.img(), current_setting('n16.all'), 'D1: the replays left the whole state byte-identical, a newly pending row included');

-- D1 — a row the signer created (service_role). A link is only signed for an existing row: for a category
-- without one the signer first inserts (user_id, category), which stores mode default, and signs that version.
SELECT set_config('n16.keep', pg_temp.img('{}', ARRAY['a:community']), false);
INSERT INTO public.user_notification_category_prefs (user_id, category)
VALUES (pg_temp.uid('a'), 'community'), (pg_temp.uid('a'), 'courses') ON CONFLICT (user_id, category) DO NOTHING;
SELECT is(ARRAY[pg_temp.pst('a', 'community', pg_temp.g('vcu')), pg_temp.img('{}', ARRAY['a:community'])],
  ARRAY['default|fresh', current_setting('n16.keep')],
  'D1: the signer''s insert creates the missing row as default with a new sequence value and leaves an existing row byte-identical');
SELECT set_config('n16.vm', pg_temp.ver('a', 'community')::text, false);
SELECT set_config('n16.keep', pg_temp.img(ARRAY['m1'], ARRAY['a:community']), false);
SELECT set_config('n16.core', pg_temp.core(ARRAY['m1']), false);
SELECT is(pg_temp.unsub('a', '{community}', ARRAY[pg_temp.g('vm')]), 'community|unsubscribed|1',
  'D1: the version of the signer-created row unsubscribes the category');
SELECT is(pg_temp.pst('a', 'community', pg_temp.g('vm')), 'off|fresh', 'D1: the default row is now off and its version advanced to a new sequence value');
SELECT is(pg_temp.st('m1') || ' / ' || pg_temp.gone()::text, 'cancelled err=unsubscribed done=00:00:00 owner= lease= / {c1,c2,m1}',
  'D1: the pending optional row of that category, and only it, is cancelled');
SELECT is(ARRAY[pg_temp.core(ARRAY['m1']), pg_temp.img(ARRAY['m1'], ARRAY['a:community'])],
  ARRAY[current_setting('n16.core'), current_setting('n16.keep')],
  'D1: nothing else changed on the cancelled row, and every other row is byte-identical');
SELECT set_config('n16.vmu', pg_temp.ver('a', 'community')::text, false);
SELECT set_config('n16.all', pg_temp.img(), false);
SELECT is(ARRAY[pg_temp.unsub('a', '{community}', ARRAY[pg_temp.g('vm')]), pg_temp.unsub('a', '{community}', ARRAY[pg_temp.g('vmu')])],
  array_fill('community|already_off|0'::text, ARRAY[2]), 'D1: a replay of that link, or one with the new version, is already_off');
SELECT is(pg_temp.img(), current_setting('n16.all'), 'D1: the replays left the whole state byte-identical');

-- D2 — stale versions, missing rows and the unknown user (service_role). a/assignments is immediate at version
-- va. The RPC never creates a row: b has none for advisory and sessions, v only courses (off), and the unknown
-- user none at all, whatever rows other users hold in the category.
SELECT is(pg_temp.unsub(t.u, t.cats, t.vers), t.expect, 'D2: ' || t.label)
  FROM (VALUES
    ('a', '{assignments}'::text[], ARRAY[pg_temp.g('va') - 1], 'assignments|stale|0', 'the version before the current one is stale'),
    ('a', '{assignments}', ARRAY[9000000000000000], 'assignments|stale|0', 'a version the sequence has not reached is stale'),
    ('a', '{assignments}', ARRAY[pg_temp.g('vs')], 'assignments|stale|0', 'a version valid for another category of the user is stale'),
    ('a', '{assignments}', ARRAY[pg_temp.g('vba')], 'assignments|stale|0', 'another user''s version for the same category is stale'),
    ('b', '{assignments}', ARRAY[pg_temp.g('va')], 'assignments|stale|0', 'a version valid for another user is stale for this one'),
    ('a', '{assignments}', '{1}', 'assignments|stale|0', 'version 1 (a row older than the column) is stale for a row with a later version'),
    ('b', '{community}', '{1}', 'community|stale|0', 'version 1 while a default row exists is stale'),
    ('b', '{advisory}', '{1}', 'advisory|stale|0', 'with no row for the category, version 1 is stale'),
    ('b', '{advisory}', ARRAY[pg_temp.g('vbc')], 'advisory|stale|0', 'with no row, a version that belongs to another row of the user is stale'),
    ('b', '{advisory}', ARRAY[9000000000000000], 'advisory|stale|0', 'with no row, a version the sequence has not reached is stale'),
    ('b', '{sessions}', ARRAY[pg_temp.g('vs')], 'sessions|stale|0', 'with no row, another user''s version for the category is stale'),
    ('v', '{sessions}', '{1}', 'sessions|stale|0', 'with no row, an off row of the user in another category does not make it already_off'),
    ('ghost', '{assignments}', '{1}', 'assignments|stale|0', 'an unknown user with version 1 is stale'),
    ('ghost', '{courses,assignments}', ARRAY[pg_temp.g('vcu'), pg_temp.g('va')], 'assignments|stale|0 courses|stale|0',
     'an unknown user with existing versions is stale in every category'),
    ('ghost', '{system,qa_support,licitaciones,advisory,sessions,community,assignments,courses}', '{1,1,1,1,1,1,1,1}',
     'advisory|stale|0 assignments|stale|0 community|stale|0 courses|stale|0 licitaciones|stale|0 qa_support|stale|0 sessions|stale|0 system|stale|0',
     'eight categories are accepted and answered in category order: an unknown user is stale even where every other row is off'),
    ('a', '{system}', ARRAY[pg_temp.g('vy')], 'system|already_off|0', 'the current version of a row that is off is already_off'),
    ('a', '{system}', '{1}', 'system|already_off|0', 'another version while an off row exists is already_off')
  ) t(u, cats, vers, expect, label);
SELECT is(pg_temp.img(), current_setting('n16.all'), 'D2: no stale or already_off call wrote anything: the whole state is byte-identical');
SELECT is(ARRAY[pg_temp.pst('b', 'advisory', 0), pg_temp.pst('b', 'sessions', 0), pg_temp.pst('v', 'sessions', 0),
                (SELECT count(*)::text FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('ghost'))],
  ARRAY['no row', 'no row', 'no row', '0'],
  'D2: the RPC created no preference row: none for a category without one, none for the unknown user');

-- D2 — invalid arguments (service_role). The two messages are fixed texts: they never echo an id or a value.
-- Apart from the fault it names, every case carries version 1. Version 0 could only mean "no row", which a
-- DELETE makes true again: it is refused, also where there is no row and where the other categories would apply
-- (the last two cases are user b: no advisory row; assignments and courses match).
SELECT throws_ok(format('SELECT * FROM public.apply_notification_unsubscribe(' || t.args || ')', pg_temp.uid('a'),
                        pg_temp.uid('b'), pg_temp.g('vba'), pg_temp.g('vbc')), '22023',
    'apply_notification_unsubscribe: ' || CASE t.msg
      WHEN 1 THEN 'invalid user or arrays (one dimension, same length, 1..8 elements)'
      ELSE 'invalid, repeated or NULL category, or NULL version or version below 1' END,
    'D2: rejects ' || t.label)
  FROM (VALUES
    ($$NULL, '{courses}', '{1}'$$, 1, 'a NULL user'),
    ($$%L, NULL, '{1}'$$, 1, 'NULL categories'),
    ($$%L, '{courses}', NULL$$, 1, 'NULL versions'),
    ($$%L, '{}', '{}'$$, 1, 'empty arrays'),
    ($$%L, '{{courses},{sessions}}', '{1,1}'$$, 1, 'two-dimensional categories'),
    ($$%L, '{courses,sessions}', '{{1},{1}}'$$, 1, 'two-dimensional versions'),
    ($$%L, '{courses,sessions}', '{1}'$$, 1, 'fewer versions than categories'),
    ($$%L, '{courses}', '{1,1}'$$, 1, 'more versions than categories'),
    ($$%L, '{courses,assignments,community,sessions,advisory,licitaciones,qa_support,system,courses}', '{1,1,1,1,1,1,1,1,1}'$$, 1, 'nine elements'),
    ($$%L, '{courses,NULL}', '{1,1}'$$, 2, 'a NULL category'),
    ($$%L, '{courses}', '{NULL}'$$, 2, 'a NULL version'),
    ($$%L, '{bogus}', '{1}'$$, 2, 'an unknown category'),
    ($$%L, '{Courses}', '{1}'$$, 2, 'a category in another case'),
    ($$%L, '{courses,sessions,courses}', '{1,1,1}'$$, 2, 'a repeated category'),
    ($$%L, '{sessions}', '{-1}'$$, 2, 'a negative version'),
    ($$%L, '{sessions}', '{0}'$$, 2, 'version 0 for a category that has a row'),
    ($$%2$L, '{advisory}', '{0}'$$, 2, 'version 0 for a category without a row'),
    ($$%2$L, '{assignments,advisory,courses}', ARRAY[%3$s, 0, %4$s]$$, 2, 'version 0 for a category without a row, next to two categories whose versions match')
  ) t(args, msg, label);
SELECT is(ARRAY[pg_temp.img(), pg_temp.pst('b', 'advisory', 0)], ARRAY[current_setting('n16.all'), 'no row'],
  'D2: the rejected calls changed no row and inserted none');

-- D3 — two users x two categories: a/assignments is unsubscribed (service_role)
SELECT set_config('n16.keep', pg_temp.img(ARRAY['s1', 's2'], ARRAY['a:assignments']), false);
SELECT set_config('n16.core', pg_temp.core(ARRAY['s1', 's2']), false);
SELECT is(pg_temp.unsub('a', '{assignments}', ARRAY[pg_temp.g('va')]) || ' ' || pg_temp.pst('a', 'assignments', pg_temp.g('va')),
  'assignments|unsubscribed|2 off|fresh', 'D3: the category is unsubscribed: two rows cancelled, mode off, version advanced');
SELECT is(ARRAY[pg_temp.st('s1'), pg_temp.st('s2')], array_fill('cancelled err=unsubscribed done=00:00:00 owner= lease='::text, ARRAY[2]),
  'D3: the pending optional immediate and digest rows are cancelled, a leftover lease cleared');
SELECT is(pg_temp.core(ARRAY['s1', 's2']), current_setting('n16.core'), 'D3: nothing else changed on the cancelled rows');
SELECT is(
  ARRAY(SELECT replace(idempotency_key, 'n16-', '') || '=' || status FROM public.notification_email_outbox
         WHERE idempotency_key ~ '^n16-s' ORDER BY id),
  ARRAY['s1=cancelled', 's2=cancelled', 's3=pending', 's4=sending', 's5=sending', 's6=pending', 's7=sent', 's8=failed', 's9=cancelled',
        'sa=cancelled_after_ambiguous', 'sb=unknown', 'sn=pending', 'so=pending', 'su=pending'],
  'D3: mandatory, sending, snapshot-holding and terminal rows keep their status, as do the row without a category, the other category and the other user');
SELECT is(pg_temp.gone(), ARRAY['c1', 'c2', 'm1', 's1', 's2'], 'D3: no other row carries the unsubscribed cancel');
SELECT is(pg_temp.img(ARRAY['s1', 's2'], ARRAY['a:assignments']), current_setting('n16.keep'),
  'D3: every kept outbox row and every other preference row (other category, other user) is byte-identical, compared whole');
SELECT set_config('n16.vau', pg_temp.ver('a', 'assignments')::text, false);
RESET ROLE;

-- D3 — a later choice is never undone. The owner (real RLS) turns assignments back on (UPDATE), replaces the
-- courses row (DELETE + INSERT), deletes the community row the RPC turned off, and inserts and deletes a
-- qa_support row; then new optional mail is pending. A deleted row takes its version with it: no link signed for
-- it may apply again or bring the row back, and version 0 ("no row", true again after a DELETE) is refused.
SELECT tests.authenticate_as('n16_a');
UPDATE public.user_notification_category_prefs SET email_mode = 'immediate' WHERE user_id = pg_temp.uid('a') AND category = 'assignments';
DELETE FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('a') AND category = 'courses';
INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode) VALUES (pg_temp.uid('a'), 'courses', 'digest');
DELETE FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('a') AND category = 'community';
WITH ins AS (
  INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode)
  VALUES (pg_temp.uid('a'), 'qa_support', 'immediate') RETURNING pref_version)
SELECT set_config('n16.vq', (SELECT pref_version FROM ins)::text, false);
DELETE FROM public.user_notification_category_prefs WHERE user_id = pg_temp.uid('a') AND category = 'qa_support';
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT pg_temp.put(t.n, t.tag, 'a', t.cat, 'immediate', 'category_mode', 'pending')
  FROM (VALUES ('42', 'l1', 'assignments'), ('43', 'l2', 'community'), ('44', 'l3', 'qa_support')) t(n, tag, cat);
SELECT set_config('n16.all', pg_temp.img(), false);
SELECT is(pg_temp.unsub('a', t.cats, t.vers), t.expect, 'D3: after the owner''s later choice, ' || t.label)
  FROM (VALUES
    ('{assignments}'::text[], ARRAY[pg_temp.g('va')], 'assignments|stale|0', 'the old link''s version is stale'),
    ('{assignments}', ARRAY[pg_temp.g('vau')], 'assignments|stale|0', 'the version the unsubscribe itself produced is stale'),
    ('{assignments}', '{1}', 'assignments|stale|0', 'version 1 is stale'),
    ('{courses}', ARRAY[pg_temp.g('vc')], 'courses|stale|0', 'the old version of a deleted and re-inserted row is stale'),
    ('{courses}', ARRAY[pg_temp.g('vcu')], 'courses|stale|0', 'the last version of the deleted row is stale'),
    ('{community}', ARRAY[pg_temp.g('vm')], 'community|stale|0', 'the version a link was signed with is stale once the row it turned off is deleted'),
    ('{community}', ARRAY[pg_temp.g('vmu')], 'community|stale|0', 'the version that unsubscribe produced is stale for the deleted row too'),
    ('{qa_support}', ARRAY[pg_temp.g('vq')], 'qa_support|stale|0', 'the version of a row the owner inserted as immediate and then deleted is stale'),
    ('{qa_support,courses,community,assignments}', ARRAY[pg_temp.g('vq'), pg_temp.g('vc'), pg_temp.g('vm'), pg_temp.g('va')],
     'assignments|stale|0 community|stale|0 courses|stale|0 qa_support|stale|0', 'one call with all four old versions is stale everywhere')
  ) t(cats, vers, expect, label);
SELECT throws_ok(format($$SELECT * FROM public.apply_notification_unsubscribe(%L, %L, '{0}')$$, pg_temp.uid('a'), t.cats), '22023',
    'apply_notification_unsubscribe: invalid, repeated or NULL category, or NULL version or version below 1',
    'D3: after the owner''s DELETE, version 0 is refused for ' || t.label)
  FROM (VALUES ('{community}', 'the row that was unsubscribed and then deleted'),
               ('{qa_support}', 'the row that was inserted and then deleted')) t(cats, label);
SELECT is(pg_temp.modes('a'), ARRAY['advisory:immediate', 'assignments:immediate', 'courses:digest', 'licitaciones:immediate', 'sessions:immediate', 'system:off'],
  'D3: the owner''s later modes stand, and no deleted row came back');
SELECT is(ARRAY[pg_temp.st('l1'), pg_temp.st('l2'), pg_temp.st('l3'), pg_temp.img()],
  array_fill('pending err= done= owner= lease='::text, ARRAY[3]) || current_setting('n16.all'),
  'D3: the newly pending rows are untouched and the whole state is byte-identical');

-- D3 — one call for four categories of user b (digest-wide link): assignments and community match, courses was
-- changed later (stale), sessions has no row (stale, and none is created).
UPDATE public.user_notification_category_prefs SET email_mode = 'digest' WHERE user_id = pg_temp.uid('b') AND category = 'courses';
SELECT set_config('n16.keep', pg_temp.img(ARRAY['su', 'b4'], ARRAY['b:assignments', 'b:community']), false);
SELECT set_config('n16.core', pg_temp.core(ARRAY['su', 'b4']), false);
SELECT is(pg_temp.unsub('b', '{sessions,courses,community,assignments}', ARRAY[1, pg_temp.g('vbc'), pg_temp.g('vbm'), pg_temp.g('vba')]),
  'assignments|unsubscribed|1 community|unsubscribed|1 courses|stale|0 sessions|stale|0',
  'D3: one call, four categories: one outcome each, in category order');
SELECT is(ARRAY[pg_temp.pst('b', 'assignments', pg_temp.g('vba')), pg_temp.pst('b', 'community', pg_temp.g('vbm'))] || pg_temp.modes('b'),
  ARRAY['off|other', 'off|fresh', 'assignments:off', 'community:off', 'courses:digest', 'system:off'],
  'D3: the two applied categories are off with two new versions; the stale one keeps its later mode and the category without a row gets none');
SELECT is(pg_temp.gone(), ARRAY['c1', 'c2', 'm1', 's1', 's2', 'su', 'b4'],
  'D3: only the pending optional rows of the two applied categories are cancelled (not the stale category, not the one without a row, not mandatory mail)');
SELECT is(ARRAY[pg_temp.core(ARRAY['su', 'b4']), pg_temp.img(ARRAY['su', 'b4'], ARRAY['b:assignments', 'b:community'])],
  ARRAY[current_setting('n16.core'), current_setting('n16.keep')],
  'D3: nothing else changed on the cancelled rows, and every other row of both users is byte-identical');

-- D3 — atomicity. The cancel of x2 (a/licitaciones) fails; advisory sorts first, so it has already been applied
-- when the error is raised. throws_ok runs the call in a subtransaction.
SELECT set_config('n16.all', pg_temp.img(), false);
SELECT set_config('n16.refuse', 'on', false);
SELECT throws_ok(format($$SELECT * FROM public.apply_notification_unsubscribe(%L, '{licitaciones,advisory}', ARRAY[%s, %s])$$,
                        pg_temp.uid('a'), pg_temp.g('vl'), pg_temp.g('vd')), 'P0001', 'n16: cancel refused',
  'D3: a failing cancel in the second category raises');
SELECT is(pg_temp.img(), current_setting('n16.all'),
  'D3: the whole call rolled back: the first category''s preference and outbox rows and everything else are byte-identical');
SELECT throws_ok(format($$SELECT * FROM public.apply_notification_unsubscribe(%L, '{licitaciones}', ARRAY[%s])$$, pg_temp.uid('a'), pg_temp.g('vl')),
  'P0001', 'n16: cancel refused', 'D3: a failing cancel in a single-category call raises');
SELECT is(ARRAY[pg_temp.img(), pg_temp.pst('a', 'licitaciones', pg_temp.g('vl')), pg_temp.pst('a', 'advisory', pg_temp.g('vd')), pg_temp.st('x1'), pg_temp.st('x2')],
  ARRAY[current_setting('n16.all'), 'immediate|same', 'immediate|same', 'pending err= done= owner= lease=', 'pending err= done= owner= lease='],
  'D3: no preference row was changed (mode and version as before) and no outbox row was cancelled');
SELECT set_config('n16.refuse', 'off', false);
SELECT is(pg_temp.unsub('a', '{licitaciones,advisory}', ARRAY[pg_temp.g('vl'), pg_temp.g('vd')]), 'advisory|unsubscribed|1 licitaciones|unsubscribed|1',
  'D3: the same call succeeds once the cancel no longer fails');
RESET ROLE;

-- Role x operation matrix: the RPC, outbox select/insert/update/delete, nextval and setval on the sequence; then
-- preference select/insert/update/delete on the rows of one user (a and b each hold a 'system' row).
SELECT set_config('n16.all', pg_temp.img('{}', ARRAY['a:system']), false);
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(true) || pg_temp.prefs_probe('a'), array_fill('42501'::text, ARRAY[11]),
  'D3: anon cannot execute the RPC, read or write the outbox, use the sequence, nor read or write preferences');
RESET ROLE;
SELECT tests.authenticate_as('n16_b');
SELECT is(pg_temp.probe(true) || pg_temp.prefs_probe('a'), array_fill('42501'::text, ARRAY[7]) || ARRAY['0', '42501', '0', '0'],
  'D3: another authenticated user cannot execute the RPC, touch the outbox or the sequence, nor see or write the recipient''s preferences');
RESET ROLE;
SELECT tests.authenticate_as('n16_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n16.admin'), 'role', 'authenticated',
  'email', 'n16-admin@test.local', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(true) || pg_temp.prefs_probe('a'), array_fill('42501'::text, ARRAY[7]) || ARRAY['0', '42501', '0', '0'],
  'D3: an authenticated admin cannot execute the RPC, touch the outbox or the sequence, nor see or write the recipient''s preferences');
RESET ROLE;
SELECT tests.authenticate_as('n16_a');
SELECT is(pg_temp.probe(true) || pg_temp.prefs_probe('b'), array_fill('42501'::text, ARRAY[7]) || ARRAY['0', '42501', '0', '0'],
  'D3: the authenticated recipient cannot execute the RPC, touch the outbox or the sequence, nor see or write another user''s preferences');
SELECT is(pg_temp.prefs_probe('a'), ARRAY['1', 'ok', '2', '2'],
  'D3: the recipient''s own preference DML still works: select, insert, update and delete of own rows');
RESET ROLE;
SELECT tests.clear_authentication();
SELECT is(pg_temp.img('{}', ARRAY['a:system']), current_setting('n16.all'),
  'D3: the denied attempts changed no outbox row and no preference row');
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(false) || pg_temp.prefs_probe('b'), array_fill('ok'::text, ARRAY[5]) || ARRAY['1', 'ok', '2', '2'],
  'D3: service_role can execute the RPC, read and write the outbox and manage any user''s preferences');
RESET ROLE;
SELECT is((SELECT count(*)::int FROM public.notification_email_outbox WHERE idempotency_key = 'n16-probe'), 0, 'D3: no probe row survived');

SELECT * FROM finish();

ROLLBACK;
