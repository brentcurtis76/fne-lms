-- =============================================================================
-- 099-notification-email-outbox.sql — NOTIF N3-01
-- Covers migration 20260930010000_notification_email_outbox.sql:
--   D1 table/constraint/RLS/grant shape; RPC SECURITY INVOKER, pinned
--      search_path, EXECUTE for service_role only
--   D2 channel matrix (resolve-preference.ts precedence); failed reads write nothing
--   D3 idempotency; key equals the live notif- vector; sync-path bell row reused;
--      retries after preference or metadata changes never rewrite the outbox row
--   D4 anon / authenticated owner, other, admin: 42501; service_role allowed
--   D5 invalid input -> 22023 and no rows; failing outbox insert undoes the bell row
-- Synthetic fixtures only (*@test.local, fixed UUIDs). Everything rolls back.
-- =============================================================================

BEGIN;

SELECT plan(83);

-- D1 — shape and privileges (postgres)
SELECT has_table('public', 'notification_email_outbox', 'D1: public.notification_email_outbox exists');
SELECT tests.rls_enabled('public', 'notification_email_outbox');
SELECT is(
  ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid = 'public.notification_email_outbox'::regclass
          AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['id', 'idempotency_key', 'event_type', 'occurrence_id', 'user_id', 'notification_id', 'category',
        'email_mode', 'email_reason', 'related_url', 'payload', 'status', 'attempt_count', 'next_attempt_at',
        'lease_owner', 'lease_expires_at', 'first_attempt_at', 'last_attempt_at', 'completed_at',
        'last_error_code', 'provider_message_id', 'send_snapshot', 'created_at', 'updated_at'],
  'D1: columns');
SELECT is(
  ARRAY(SELECT attname::text FROM pg_attribute WHERE attrelid = 'public.notification_email_outbox'::regclass
          AND attnum > 0 AND NOT attisdropped AND NOT attnotnull ORDER BY attnum),
  ARRAY['notification_id', 'category', 'related_url', 'lease_owner', 'lease_expires_at', 'first_attempt_at',
        'last_attempt_at', 'completed_at', 'last_error_code', 'provider_message_id', 'send_snapshot'],
  'D1: nullable columns (notification_id nullable for email-only rows)');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s', cf.relname, c.confdeltype, a.attname) ORDER BY cf.relname)
     FROM pg_constraint c JOIN pg_class cf ON cf.oid = c.confrelid
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
    WHERE c.conrelid = 'public.notification_email_outbox'::regclass AND c.contype = 'f'),
  ARRAY['profiles:c:user_id', 'user_notifications:n:notification_id'],
  'D1: FKs profiles ON DELETE CASCADE and user_notifications ON DELETE SET NULL');
SELECT is(
  (SELECT array_agg(replace(conname, 'notification_email_outbox_', '') ORDER BY conname) FROM pg_constraint
    WHERE conrelid = 'public.notification_email_outbox'::regclass AND contype IN ('c', 'u')),
  ARRAY['attempt_count_check', 'category_check', 'email_mode_check', 'email_reason_check', 'error_code_check',
        'event_type_check', 'idempotency_key_key', 'key_check', 'lease_owner_check', 'occurrence_check', 'payload_check',
        'provider_id_check', 'related_url_check', 'snapshot_check', 'status_check', 'unmapped_check'],
  'D1: unique key and CHECK constraints exist');
SELECT col_is_unique('public', 'notification_email_outbox', ARRAY['idempotency_key'], 'D1: idempotency_key is unique');
SELECT is(
  (SELECT array_agg(replace(indexname, 'notification_email_outbox_', '') || coalesce(':' || pg_get_expr(i.indpred, i.indrelid), '')
                    ORDER BY indexname)
     FROM pg_indexes x JOIN pg_index i ON i.indexrelid = format('public.%I', x.indexname)::regclass
    WHERE schemaname = 'public' AND tablename = 'notification_email_outbox'),
  ARRAY['claim_idx:(status = ANY (ARRAY[''pending''::text, ''sending''::text]))', 'created_at_idx', 'idempotency_key_key',
        'notification_id_idx', 'pkey', 'user_id_idx'],
  'D1: indexes; the claim index is partial over pending/sending');
SELECT is(
  (SELECT array_agg(format('%s:%s:%s:%s', polname, polcmd, polpermissive, polroles::regrole[]::text))
     FROM pg_policy WHERE polrelid = 'public.notification_email_outbox'::regclass),
  ARRAY['forced_password_change_guard:*:f:{authenticated}'],
  'D1: the restrictive forced_password_change_guard is the only policy');
SELECT is(
  (SELECT count(*)::int FROM pg_class c, aclexplode(c.relacl) a
    WHERE c.oid = 'public.notification_email_outbox'::regclass
      AND a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)),
  0, 'D1: no table grant to PUBLIC, anon or authenticated');
SELECT is(
  ARRAY(SELECT has_table_privilege('service_role', 'public.notification_email_outbox', p)
          FROM unnest(ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p),
  ARRAY[true, true, true, true], 'D1: service_role has SELECT/INSERT/UPDATE/DELETE');
SELECT is(
  (SELECT array_agg(format('%s:%s', t.tgname, p.proname)) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE t.tgrelid = 'public.notification_email_outbox'::regclass AND NOT t.tgisinternal),
  ARRAY['update_notification_email_outbox_updated_at:update_updated_at_column'], 'D1: updated_at trigger');

SELECT is(
  (SELECT format('%s|%s|%s|%s', prosecdef, provolatile, proconfig,
                 (SELECT count(*) FROM aclexplode(proacl) a WHERE a.grantee IN (0, 'anon'::regrole, 'authenticated'::regrole)))
     FROM pg_proc WHERE oid = 'public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb)'::regprocedure),
  'f|v|{"search_path=\"\""}|0', 'D1: RPC is SECURITY INVOKER, VOLATILE, search_path pinned; ACL has no PUBLIC/anon/authenticated entry');
SELECT is(
  ARRAY(SELECT has_function_privilege(r, 'public.enqueue_notification(text, text, uuid, text, text, boolean, text, text, text, text, text, jsonb)', 'EXECUTE')
          FROM unnest(ARRAY['service_role', 'anon', 'authenticated', 'public']) WITH ORDINALITY u(r, n) ORDER BY n),
  ARRAY[true, false, false, false], 'D1: EXECUTE for service_role only');

-- Synthetic fixtures (postgres) and helpers
DO $fixture$
DECLARE
  v_a uuid := tests.create_supabase_user('n12_a', 'n12-a@test.local');
  v_b uuid := tests.create_supabase_user('n12_b', 'n12-b@test.local');
  v_admin uuid := tests.create_supabase_user('n12_admin', 'n12-admin@test.local');
  v_vec uuid := '11111111-1111-1111-1111-111111111111';
BEGIN
  INSERT INTO auth.users (id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (v_vec, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'n12-vec@test.local',
          '{}', '{"provider":"email","providers":["email"]}', now(), now())
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.profiles (id, email, name, approval_status, must_change_password) VALUES
    (v_a, 'n12-a@test.local', 'N12 A', 'approved', false),
    (v_b, 'n12-b@test.local', 'N12 B', 'approved', false),
    (v_admin, 'n12-admin@test.local', 'N12 Admin', 'approved', false),
    (v_vec, 'n12-vec@test.local', 'N12 Vec', 'approved', false)
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_admin, 'admin', NULL, true);
  INSERT INTO public.notification_types (id, name, category) VALUES
    ('n12_course_evt', 'N12 course', 'courses'), ('n12_unmapped_evt', 'N12 unmapped', 'system'),
    ('n12_other_evt', 'N12 other', 'system')
  ON CONFLICT (id) DO NOTHING;
  PERFORM set_config('n12.a', v_a::text, false);
  PERFORM set_config('n12.b', v_b::text, false);
  PERFORM set_config('n12.admin', v_admin::text, false);
END
$fixture$;

-- Call the RPC with defaults overridden by o (explicit JSON null = SQL NULL;
-- "u": "b" picks the fixture user n12.b).
CREATE FUNCTION pg_temp.enqr(o jsonb) RETURNS TABLE (nid uuid, oid uuid, k text, in_app boolean, mode text, reason text)
LANGUAGE sql AS $$
  WITH d AS (SELECT jsonb_build_object('ev', 'n12_course_evt', 'occ', 'occ:x', 'user', current_setting('n12.a'),
       'cat', 'courses', 'def', 'immediate', 'mand', false, 'title', 'N12 synthetic title',
       'desc', 'Synthetic description', 'url', '/n12/path', 'imp', NULL, 'type', NULL,
       'payload', '{"course.title": "Curso sintetico", "n": 1}'::jsonb) || o AS j)
  SELECT e.* FROM d, public.enqueue_notification(j->>'ev', j->>'occ',
    (CASE WHEN j ? 'u' THEN current_setting('n12.' || (j->>'u')) ELSE j->>'user' END)::uuid,
    j->>'cat', j->>'def', (j->>'mand')::boolean, j->>'title', j->>'desc', j->>'url', j->>'imp', j->>'type',
    NULLIF(j->'payload', 'null'::jsonb)) e
$$;
CREATE FUNCTION pg_temp.key(ev text, occ text, u text) RETURNS text LANGUAGE sql AS $$
  SELECT 'notif-' || encode(sha256(convert_to(format('[%s,%s,%s]', to_json(ev), to_json(occ),
         to_json(current_setting('n12.' || u))), 'UTF8')), 'hex') $$;
-- Call, then summarize the result and the rows stored under its key.
CREATE FUNCTION pg_temp.run(o jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r record; nb int; bid uuid; no int; oid uuid; onid uuid;
BEGIN
  SELECT * INTO r FROM pg_temp.enqr(o);
  SELECT count(*), (array_agg(id))[1] INTO nb, bid FROM public.user_notifications WHERE idempotency_key = r.k;
  SELECT count(*), (array_agg(id))[1], (array_agg(notification_id))[1] INTO no, oid, onid
    FROM public.notification_email_outbox WHERE idempotency_key = r.k;
  RETURN format('in_app=%s %s/%s bell=%s outbox=%s ids=%s', r.in_app, r.mode, r.reason, nb, no,
    bid IS NOT DISTINCT FROM r.nid AND oid IS NOT DISTINCT FROM r.oid AND (no = 0 OR onid IS NOT DISTINCT FROM r.nid));
END $$;
-- Set user u's legacy row for ev (when em is not NULL) and 'courses' mode (when m is not NULL), then run(o).
CREATE FUNCTION pg_temp.cas(u text, ev text, em boolean, ia boolean, m text, o jsonb) RETURNS text LANGUAGE plpgsql AS $$
BEGIN
  IF em IS NOT NULL THEN
    INSERT INTO public.user_notification_preferences (user_id, notification_type, email_enabled, in_app_enabled)
    VALUES (current_setting('n12.' || u)::uuid, ev, em, ia)
    ON CONFLICT (user_id, notification_type) DO UPDATE SET email_enabled = em, in_app_enabled = ia;
  END IF;
  IF m IS NOT NULL THEN
    INSERT INTO public.user_notification_category_prefs (user_id, category, email_mode)
    VALUES (current_setting('n12.' || u)::uuid, 'courses', m) ON CONFLICT (user_id, category) DO UPDATE SET email_mode = m;
  END IF;
  RETURN pg_temp.run(o);
END $$;
CREATE FUNCTION pg_temp.cnt(u text) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s/%s', (SELECT count(*) FROM public.user_notifications WHERE user_id = current_setting('n12.' || u)::uuid),
                         (SELECT count(*) FROM public.notification_email_outbox WHERE user_id = current_setting('n12.' || u)::uuid)) $$;
-- Try every outbox operation and the RPC; return the SQLSTATEs.
CREATE FUNCTION pg_temp.probe() RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE s text[] := '{}';
BEGIN
  BEGIN PERFORM count(*) FROM public.notification_email_outbox; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN INSERT INTO public.notification_email_outbox (idempotency_key, event_type, occurrence_id, user_id, email_mode, email_reason)
        VALUES ('n12-probe', 'n12_x', 'occ:p', current_setting('n12.a')::uuid, 'immediate', 'unmapped_event'); s := s || 'ok'::text;
  EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN UPDATE public.notification_email_outbox SET status = 'cancelled' WHERE idempotency_key = 'n12-probe'; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN DELETE FROM public.notification_email_outbox WHERE idempotency_key = 'n12-probe'; s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  BEGIN PERFORM pg_temp.enqr('{"occ": "occ:probe"}'); s := s || 'ok'::text; EXCEPTION WHEN OTHERS THEN s := s || SQLSTATE; END;
  RETURN s;
END $$;

-- D2 — channel matrix (service_role). Event n12_course_evt maps to 'courses'.
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.cas('a', NULL, NULL, NULL, NULL, '{"occ": "occ:both"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D2: no preferences -> bell and outbox, outbox linked to the bell row');
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, false, NULL, '{"occ": "occ:email-only"}'),
  'in_app=f immediate/catalog_default bell=0 outbox=1 ids=t', 'D2: in_app_enabled=false -> email-only row, NULL notification_id');
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, true, 'off', '{"occ": "occ:cat-off"}'),
  'in_app=t off/category_mode bell=1 outbox=0 ids=t', 'D2: category off -> in-app only');
SELECT is(pg_temp.cas('a', 'n12_course_evt', false, true, 'default', '{"occ": "occ:legacy-off"}'),
  'in_app=t off/legacy_suppressed bell=1 outbox=0 ids=t', 'D2: category default falls through to legacy email_enabled=false');
SELECT is(pg_temp.cas('a', 'n12_course_evt', false, false, 'default', '{"occ": "occ:neither"}'),
  'in_app=f off/legacy_suppressed bell=0 outbox=0 ids=t', 'D2: neither channel -> no rows');
SELECT is(pg_temp.cas('a', 'n12_course_evt', false, true, 'off', '{"occ": "occ:mandatory", "mand": true}'),
  'in_app=t immediate/mandatory bell=1 outbox=1 ids=t', 'D2: mandatory overrides category off and legacy suppression');
SELECT is(pg_temp.cas('a', 'n12_course_evt', false, true, 'immediate', '{"occ": "occ:cat-imm"}'),
  'in_app=t immediate/category_mode bell=1 outbox=1 ids=t', 'D2: category immediate overrides legacy suppression');
SELECT is(pg_temp.cas('a', 'n12_course_evt', false, true, 'digest', '{"occ": "occ:cat-digest"}'),
  'in_app=t digest/category_mode bell=1 outbox=1 ids=t', 'D2: category digest overrides legacy suppression');
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, true, 'default', '{"occ": "occ:def-digest", "def": "digest"}'),
  'in_app=t digest/catalog_default bell=1 outbox=1 ids=t', 'D2: catalog default digest');
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, true, 'default', '{"occ": "occ:def-off", "def": "off"}'),
  'in_app=t off/catalog_default bell=1 outbox=0 ids=t', 'D2: catalog default off -> in-app only');
SELECT is(pg_temp.cas('a', NULL, NULL, NULL, NULL, '{"ev": "n12_unmapped_evt", "occ": "occ:unmapped", "cat": null, "def": null}'),
  'in_app=t immediate/unmapped_event bell=1 outbox=1 ids=t', 'D2: unmapped event -> immediate');
SELECT is(
  (SELECT format('%s|%s', u.category, o.category IS NULL) FROM public.notification_email_outbox o
     JOIN public.user_notifications u ON u.id = o.notification_id WHERE o.occurrence_id = 'occ:unmapped'),
  'general|t', 'D2: unmapped rows: bell category general, outbox category NULL');
SELECT is(pg_temp.cas('a', 'n12_unmapped_evt', false, true, NULL, '{"ev": "n12_unmapped_evt", "occ": "occ:unmapped-off", "cat": null, "def": null}'),
  'in_app=t off/legacy_suppressed bell=1 outbox=0 ids=t', 'D2: unmapped event with legacy email off -> in-app only');
SELECT is(pg_temp.cas('b', 'n12_other_evt', false, true, NULL, '{"ev": "meeting_finalized", "occ": "occ:meet", "u": "b", "cat": "community"}'),
  'in_app=t off/legacy_suppressed bell=1 outbox=0 ids=t', 'D2: meeting_finalized: any legacy row with email off suppresses');
SELECT is(pg_temp.run('{"occ": "occ:exact", "u": "b"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D2: other events use only the exact legacy row');
SELECT is(pg_temp.run('{"ev": "meeting_finalized", "occ": "occ:meet2", "u": "admin", "cat": "community"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D2: meeting_finalized without any email-off row sends');
RESET ROLE;

-- A failed preference read propagates and writes nothing.
REVOKE SELECT ON public.user_notification_category_prefs FROM service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT pg_temp.enqr('{"occ": "occ:readfail"}')$$, '42501', NULL,
  'D2: category preference read failure raises');
SELECT is(pg_temp.run('{"occ": "occ:readfail-mand", "mand": true}'),
  'in_app=t immediate/mandatory bell=1 outbox=1 ids=t', 'D2: a mandatory event does not read the category preference');
RESET ROLE;
GRANT SELECT ON public.user_notification_category_prefs TO service_role;
REVOKE SELECT ON public.user_notification_preferences FROM service_role;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT pg_temp.enqr('{"occ": "occ:readfail", "mand": true}')$$, '42501', NULL,
  'D2: legacy preference read failure raises, even for a mandatory event');
RESET ROLE;
GRANT SELECT ON public.user_notification_preferences TO service_role;
SELECT is(
  (SELECT count(*)::int FROM public.notification_email_outbox WHERE occurrence_id = 'occ:readfail')
  + (SELECT count(*)::int FROM public.user_notifications WHERE idempotency_key = pg_temp.key('n12_course_evt', 'occ:readfail', 'a')),
  0, 'D2: the failed calls left no bell or outbox row');

-- D3 — idempotency (service_role)
SET LOCAL ROLE service_role;
SELECT set_config('n12.first', (SELECT row(nid, oid, k)::text FROM pg_temp.enqr('{"occ": "occ:idem"}')), false);
SELECT is((SELECT row(nid, oid, k)::text FROM pg_temp.enqr('{"occ": "occ:idem"}')), current_setting('n12.first'),
  'D3: a repeated call returns the same bell id, outbox id and key');
SELECT is(pg_temp.run('{"occ": "occ:idem"}'), 'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t',
  'D3: after three calls there is one bell row and one outbox row');
SELECT isnt((SELECT row(nid, oid, k)::text FROM pg_temp.enqr('{"occ": "occ:idem2"}')), current_setting('n12.first'),
  'D3: a different occurrence gets new rows');
SELECT is(pg_temp.run('{"occ": "occ:idem", "u": "b"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D3: a different recipient gets its own rows');
SELECT is(
  (SELECT k FROM pg_temp.enqr('{"ev": "course_assigned", "occ": "occ:abc", "user": "11111111-1111-1111-1111-111111111111"}')),
  'notif-9cd8f71e1731b488285d1c10208720c8b9057d97a1f9858b84369a3f285be4df',
  'D3: key equals notif- || sha256(JSON.stringify([eventType, occurrence, userId])) (node vector)');
SELECT is(
  (SELECT format('%s/%s', count(DISTINCT u.id), count(DISTINCT o.id)) FROM public.user_notifications u
     JOIN public.notification_email_outbox o ON o.notification_id = u.id
    WHERE u.idempotency_key = 'notif-9cd8f71e1731b488285d1c10208720c8b9057d97a1f9858b84369a3f285be4df'
      AND o.idempotency_key = u.idempotency_key),
  '1/1', 'D3: the bell row and the outbox row carry the same key');
RESET ROLE;
-- A bell row the live sync path already wrote under the key is reused.
INSERT INTO public.user_notifications (user_id, title, idempotency_key)
VALUES (current_setting('n12.b')::uuid, 'N12 sync row', pg_temp.key('n12_course_evt', 'occ:sync', 'b'));
SET LOCAL ROLE service_role;
SELECT is(pg_temp.run('{"occ": "occ:sync", "u": "b"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D3: a pre-existing sync-path bell row is reused and linked');
SELECT is((SELECT u.title FROM pg_temp.enqr('{"occ": "occ:sync", "u": "b"}') r
             JOIN public.user_notifications u ON u.id = r.nid), 'N12 sync row', 'D3: the reused row is the sync-path row');
-- An email-only event retried after in-app is re-enabled gains one bell row;
-- the original outbox row is kept as written (ids=f: its notification_id stays NULL).
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, false, 'default', '{"occ": "occ:reenable"}'),
  'in_app=f immediate/catalog_default bell=0 outbox=1 ids=t', 'D3: first call is email-only');
SELECT set_config('n12.reen', (SELECT id::text FROM public.notification_email_outbox
                                WHERE idempotency_key = pg_temp.key('n12_course_evt', 'occ:reenable', 'a')), false);
SELECT is(pg_temp.cas('a', 'n12_course_evt', true, true, NULL, '{"occ": "occ:reenable"}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=f', 'D3: retry after in-app is re-enabled adds one bell row and no second outbox row');
SELECT is((SELECT format('%s|%s', o.id::text = current_setting('n12.reen'), o.notification_id IS NULL)
             FROM public.notification_email_outbox o WHERE o.idempotency_key = pg_temp.key('n12_course_evt', 'occ:reenable', 'a')),
  't|t', 'D3: the retry keeps the original outbox row unchanged');
-- A retry with changed metadata and a changed preference never rewrites the original rows.
SELECT is(pg_temp.run('{"occ": "occ:meta", "title": "N12 original", "url": "/n12/original", "payload": {"k": "original"}}'),
  'in_app=t immediate/catalog_default bell=1 outbox=1 ids=t', 'D3: first call with the original metadata');
SELECT is(pg_temp.cas('a', NULL, NULL, NULL, 'digest',
    '{"occ": "occ:meta", "title": "N12 changed", "url": "/n12/changed", "payload": {"k": "changed"}, "imp": "high"}'),
  'in_app=t digest/category_mode bell=1 outbox=1 ids=t', 'D3: a retry with changed metadata and preference still has one bell and one outbox row');
SELECT is((SELECT format('%s|%s|%s|%s|%s|%s', o.related_url, o.payload->>'k', o.email_mode, o.email_reason, u.title, u.importance)
             FROM public.notification_email_outbox o JOIN public.user_notifications u ON u.id = o.notification_id
            WHERE o.idempotency_key = pg_temp.key('n12_course_evt', 'occ:meta', 'a')),
  '/n12/original|original|immediate|catalog_default|N12 original|normal', 'D3: changed metadata never overwrites the original outbox or bell row');
RESET ROLE;

-- D4 — role matrix
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D4: anon cannot select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n12_a');
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D4: authenticated owner cannot select/insert/update/delete/execute');
SELECT throws_ok(
  format($$INSERT INTO public.user_notifications (user_id, title) VALUES (%L, 'N12 forged')$$, current_setting('n12.a')),
  '42501', NULL, 'D4: authenticated still cannot insert into user_notifications');
RESET ROLE;
SELECT tests.authenticate_as('n12_b');
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D4: authenticated other user cannot select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.authenticate_as('n12_admin');
SELECT set_config('request.jwt.claims', json_build_object('sub', current_setting('n12.admin'), 'role', 'authenticated',
  'email', 'n12-admin@test.local', 'app_metadata', json_build_object('role', 'admin', 'roles', json_build_array('admin')),
  'user_metadata', json_build_object('role', 'admin'))::text, true);
SELECT is(pg_temp.probe(), ARRAY['42501', '42501', '42501', '42501', '42501'], 'D4: authenticated admin cannot select/insert/update/delete/execute');
RESET ROLE;
SELECT tests.clear_authentication();
SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SELECT is(pg_temp.probe(), ARRAY['ok', 'ok', 'ok', 'ok', 'ok'], 'D4: service_role can select/insert/update/delete/execute');
RESET ROLE;

-- D1 (continued) — snapshot and payload checks (postgres)
SELECT set_config('n12.row', (SELECT oid::text FROM pg_temp.enqr('{"occ": "occ:snap"}')), false);
SELECT lives_ok($$UPDATE public.notification_email_outbox SET status = 'sending', send_snapshot = '\x01'
                   WHERE id = current_setting('n12.row')::uuid$$, 'D1: a sending row may hold a send snapshot');
SELECT throws_ok($$UPDATE public.notification_email_outbox SET status = 'sent' WHERE id = current_setting('n12.row')::uuid$$,
  '23514', NULL, 'D1: a terminal status with a snapshot is rejected');
SELECT lives_ok($$UPDATE public.notification_email_outbox SET status = 'sent', send_snapshot = NULL
                   WHERE id = current_setting('n12.row')::uuid$$, 'D1: a terminal status without a snapshot is accepted');
SELECT throws_ok($$UPDATE public.notification_email_outbox SET payload = '{"a": [1]}' WHERE id = current_setting('n12.row')::uuid$$,
  '23514', NULL, 'D1: the table rejects a nested payload value');
SELECT throws_ok($$UPDATE public.notification_email_outbox SET related_url = '//evil.test/x' WHERE id = current_setting('n12.row')::uuid$$,
  '23514', NULL, 'D1: the table rejects a protocol-relative URL');

-- D5 — invalid input -> 22023 and no rows (service_role)
SELECT set_config('n12.before', pg_temp.cnt('a'), false);
SET LOCAL ROLE service_role;
SELECT throws_ok(format($$SELECT pg_temp.enqr(%L)$$, t.o), '22023', NULL, 'D5: rejects ' || t.label)
  FROM (VALUES
    ('{"ev": "Bad-Type"}', 'a malformed event type'),
    ('{"occ": "  "}', 'a blank occurrence'),
    ('{"occ": "' || repeat('x', 256) || '"}', 'an occurrence over 255 chars'),
    ('{"user": null}', 'a NULL recipient'), ('{"mand": null}', 'a NULL mandatory flag'),
    ('{"user": "00000000-0000-4000-8000-000000000012"}', 'a recipient without a profile'),
    ('{"title": " "}', 'a blank title'),
    ('{"title": "' || repeat('t', 256) || '"}', 'a title over 255 chars'),
    ('{"desc": "' || repeat('d', 2001) || '"}', 'a description over 2000 chars'),
    ('{"cat": "bogus"}', 'an unknown category'),
    ('{"def": null}', 'a mapped event without email default'),
    ('{"def": "weekly"}', 'an unknown email default'),
    ('{"cat": null}', 'an unmapped event with an email default'),
    ('{"cat": null, "def": null, "mand": true}', 'a mandatory unmapped event'),
    ('{"url": "https://evil.test/x"}', 'an absolute URL'),
    ('{"url": "/\\evil.test"}', 'a backslash URL'),
    ('{"imp": "urgent"}', 'an unknown importance'),
    ('{"payload": [1]}', 'an array payload'),
    ('{"payload": {"a": {"b": 1}}}', 'a nested object value'),
    ('{"payload": {"a": true}}', 'a boolean value'),
    ('{"payload": {"a": "' || repeat('p', 4100) || '"}}', 'an oversized payload')
  ) t(o, label);
RESET ROLE;
SELECT is(pg_temp.cnt('a'), current_setting('n12.before'), 'D5: the rejected calls wrote no bell or outbox row');

-- A failing outbox insert undoes the in-app insert made earlier in the call.
ALTER TABLE public.notification_email_outbox ADD CONSTRAINT n12_test_reject CHECK (event_type <> 'n12_boom_evt') NOT VALID;
SET LOCAL ROLE service_role;
SELECT throws_ok($$SELECT pg_temp.enqr('{"ev": "n12_boom_evt", "occ": "occ:boom"}')$$, '23514', NULL,
  'D5: a failing outbox insert raises');
RESET ROLE;
SELECT is(pg_temp.cnt('a'), current_setting('n12.before'), 'D5: the in-app row of the failed call did not survive');

SELECT * FROM finish();

ROLLBACK;
