-- =============================================================================
-- 113-pasantias-admin-leads-export.sql — PASANT-B004 C009 snapshot export
-- Covers migration 20261021180000_pasantias_admin_leads_export.sql:
--   A  one function, exact signature, STABLE + SECURITY INVOKER + plpgsql +
--      pinned search_path (never inlined); EXECUTE for service_role only (anon
--      and an active admin JWT are refused); table grants unchanged
--   F  filter parity with the screen's PostgREST query (status, search over the
--      four columns with ILIKE wildcards, each program keeping the contact's
--      other interest, sin-programa, combinations), order created_at DESC,
--      id DESC, the exact envelope and row shape, total = array length
--   M  p_max_bytes: NULL no limit, the exact boundary, one byte under refuses
--   V  every invalid argument -> 22023 invalid_argument
--   B  1205 synthetic contacts returned complete in one call; 20 status x
--      program cases against an independent reference query
--   C  exactly 100 000 matching contacts complete in one call; 100 001 refused
--      as too_large_rows with no array built
-- The snapshot itself (one statement under concurrent commits) is proven by the
-- real-stack C009 browser check, not here. Every assertion is scoped by a search
-- token only this suite's rows carry, except the unfiltered case, which compares
-- against the table in the same transaction.
-- Synthetic fixtures only (*@qa.local.test, fixed UUIDs 99113000-/99113001-...).
-- Rolls back.
-- =============================================================================

BEGIN;

SELECT plan(83);

-- JSON renders timestamptz in the session zone; pin it so the shape pins are exact.
SET LOCAL TimeZone TO 'UTC';

-- Helpers ---------------------------------------------------------------------
-- probe(q): runs q as the current role inside a rolled-back block; returns the
-- query's single text value, 'ok' for a command, or the SQLSTATE it raised.
CREATE FUNCTION pg_temp.probe(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  BEGIN
    IF q ~* '^\s*select' THEN EXECUTE q INTO v; ELSE EXECUTE q; v := 'ok'; END IF;
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'probe:' || coalesce(v, 'null');
  EXCEPTION WHEN OTHERS THEN
    RETURN CASE WHEN SQLERRM LIKE 'probe:%' THEN substr(SQLERRM, 7) ELSE SQLSTATE END;
  END;
END $$;
CREATE FUNCTION pg_temp.act(p_kind text, p_ident text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_kind = 'user' THEN PERFORM tests.authenticate_as(p_ident);
  ELSE
    PERFORM set_config('request.jwt.claims', json_build_object('role', p_kind)::text, true);
    PERFORM set_config('role', p_kind, true);
  END IF;
END $$;
CREATE FUNCTION pg_temp.unact() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;
-- The export as service_role, the route's only caller.
CREATE FUNCTION pg_temp.x(p_status text, p_search text, p_program text, p_max integer) RETURNS json LANGUAGE plpgsql AS $$
DECLARE v json;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  v := public.pasantias_admin_leads_export(p_status, p_search, p_program, p_max);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.callas(p_kind text, p_ident text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM pg_temp.act(p_kind, p_ident);
  v := pg_temp.probe($q$SELECT json_typeof(public.pasantias_admin_leads_export(NULL, 'q113zq', NULL, NULL))$q$);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.summary(j json) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s|%s|%s|%s', j->>'total', j->>'too_large_rows', j->>'too_large_bytes', json_array_length(j->'leads')) $$;
CREATE FUNCTION pg_temp.ids(j json) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(e.v->>'id' ORDER BY e.n), '{}') FROM json_array_elements(j->'leads') WITH ORDINALITY e(v, n) $$;
-- Fixture contacts 99113000-...-00000000000N print as rN.
CREATE FUNCTION pg_temp.names(j json) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(CASE WHEN e.v->>'id' LIKE '99113000-%' THEN 'r' || ltrim(right(e.v->>'id', 12), '0') ELSE e.v->>'id' END
                            ORDER BY e.n), '{}')
    FROM json_array_elements(j->'leads') WITH ORDINALITY e(v, n) $$;
CREATE FUNCTION pg_temp.lead(j json, p_n integer) RETURNS json LANGUAGE sql AS $$
  SELECT e.v FROM json_array_elements(j->'leads') e(v)
   WHERE e.v->>'id' = format('99113000-0000-4000-8000-%s', lpad(p_n::text, 12, '0')) $$;
CREATE FUNCTION pg_temp.programs(l json) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce(string_agg(e.v->>'program', ',' ORDER BY e.n), '') FROM json_array_elements(l->'program_interests') WITH ORDINALITY e(v, n) $$;
CREATE FUNCTION pg_temp.bid(n integer) RETURNS text LANGUAGE sql AS $$
  SELECT format('99113001-0000-4000-8000-%s', lpad(to_hex(n), 12, '0')) $$;
-- Independent reference for the bulk contacts: IN / NOT IN over interests, no
-- cohort join (every bulk contact is enero-2027), search token in institution only.
CREATE FUNCTION pg_temp.ref(p_status text, p_program text) RETURNS text[] LANGUAGE sql AS $$
  SELECT coalesce(array_agg(l.id::text ORDER BY l.created_at DESC, l.id DESC), '{}')
    FROM public.pasantias_leads l
   WHERE l.institution ILIKE '%b113bulk%'
     AND (p_status IS NULL OR l.status = p_status)
     AND (p_program IS NULL
          OR (p_program = 'sin-programa' AND l.id NOT IN (SELECT i.lead_id FROM public.pasantias_lead_program_interests i))
          OR l.id IN (SELECT i.lead_id FROM public.pasantias_lead_program_interests i WHERE i.program = p_program)) $$;

-- Fixtures (postgres) -----------------------------------------------------------
-- Search token q113zq sits in exactly one search column per contact: r1
-- first_name, r2 last_name (upper case), r3 email, r4/r5/r7 institution; r6 has
-- it only in message, which is not searched. r1 and r7 share created_at.
DO $fx$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.schools (id, name) VALUES (9113, 'P113 QA School') ON CONFLICT (id) DO NOTHING;
  v_id := tests.create_supabase_user('p113_admin', 'p113-admin@qa.local.test');
  INSERT INTO public.profiles (id, email, name, approval_status, school_id, must_change_password)
  VALUES (v_id, 'p113-admin@qa.local.test', 'P113 admin', 'approved', 9113, false);
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES (v_id, 'admin', NULL, true);

  INSERT INTO public.pasantias_leads (id, cohort, first_name, last_name, email, email_normalized, institution,
      phone, role_title, num_people, message, notes, status, source_path, utm_source, consent_accepted_at,
      consent_notice_version, marketing_opt_in, marketing_opt_in_at, marketing_notice_version, created_at, updated_at)
  VALUES
    ('99113000-0000-4000-8000-000000000001', 'enero-2027', 'Q113zq Ana', 'Uno', 'p113-r1@qa.local.test',
     'p113-r1@qa.local.test', 'Colegio Uno', NULL, NULL, NULL, NULL, NULL, 'new', NULL, NULL,
     '2026-10-01 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-10-01 10:00+00', '2026-10-01 10:00+00'),
    ('99113000-0000-4000-8000-000000000002', 'enero-2027', 'Beto', 'Q113ZQ Dos', 'p113-r2@qa.local.test',
     'p113-r2@qa.local.test', 'Colegio Dos', '+56 2 2222', 'Directora', 3, 'Mensaje dos', 'Nota dos', 'contacted',
     '/pasantias', 'qa', '2026-10-02 10:00+00', '2026-07-v1', true, '2026-10-02 10:00+00', '2026-07-v1',
     '2026-10-02 10:00+00', '2026-10-02 11:30:00.123456+00'),
    ('99113000-0000-4000-8000-000000000003', 'enero-2027', 'Carla', 'Tres', 'p113-r3-q113zq@qa.local.test',
     'p113-r3-q113zq@qa.local.test', 'Colegio Tres', NULL, NULL, NULL, NULL, NULL, 'converted', NULL, NULL,
     '2026-10-03 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-10-03 10:00+00', '2026-10-03 10:00+00'),
    ('99113000-0000-4000-8000-000000000004', 'enero-2027', 'Dani', 'Cuatro', 'p113-r4@qa.local.test',
     'p113-r4@qa.local.test', 'Colegio q113zq Cuatro', NULL, NULL, NULL, NULL, NULL, 'dismissed', NULL, NULL,
     '2026-10-04 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-10-04 10:00+00', '2026-10-04 10:00+00'),
    ('99113000-0000-4000-8000-000000000005', 'octubre-2026', 'Eva', 'Cinco', 'p113-r5@qa.local.test',
     'p113-r5@qa.local.test', 'Colegio q113zq Cinco', NULL, NULL, NULL, NULL, NULL, 'new', NULL, NULL,
     '2026-09-01 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-09-01 10:00+00', '2026-09-01 10:00+00'),
    ('99113000-0000-4000-8000-000000000006', 'enero-2027', 'Fede', 'Seis', 'p113-r6@qa.local.test',
     'p113-r6@qa.local.test', 'Colegio Seis', NULL, NULL, NULL, 'menciona q113zq', NULL, 'new', NULL, NULL,
     '2026-10-05 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-10-05 10:00+00', '2026-10-05 10:00+00'),
    ('99113000-0000-4000-8000-000000000007', 'enero-2027', 'Gabi', 'Siete', 'p113-r7@qa.local.test',
     'p113-r7@qa.local.test', 'Colegio q113zq Siete', NULL, NULL, NULL, NULL, NULL, 'new', NULL, NULL,
     '2026-10-01 10:00+00', '2026-07-v1', false, NULL, NULL, '2026-10-01 10:00+00', '2026-10-01 10:00+00');
  -- r2's mirada-profunda is inserted and created first: interest order is program order, not time.
  INSERT INTO public.pasantias_lead_program_interests (id, lead_id, cohort, program, consent_accepted_at,
      consent_notice_version, created_at, updated_at)
  VALUES
    ('99113000-0000-4000-8000-000000000102', '99113000-0000-4000-8000-000000000002', 'enero-2027', 'mirada-profunda',
     '2026-10-02 10:05+00', 'v-m', '2026-10-02 10:05+00', '2026-10-02 10:05+00'),
    ('99113000-0000-4000-8000-000000000112', '99113000-0000-4000-8000-000000000002', 'enero-2027', 'inspira',
     '2026-10-02 10:10+00', 'v-i', '2026-10-02 10:10+00', '2026-10-02 10:10+00'),
    ('99113000-0000-4000-8000-000000000101', '99113000-0000-4000-8000-000000000001', 'enero-2027', 'inspira',
     '2026-10-01 10:00+00', '2026-07-v1', '2026-10-01 10:00+00', '2026-10-01 10:00+00'),
    ('99113000-0000-4000-8000-000000000103', '99113000-0000-4000-8000-000000000003', 'enero-2027', 'mirada-profunda',
     '2026-10-03 10:00+00', '2026-07-v1', '2026-10-03 10:00+00', '2026-10-03 10:00+00'),
    ('99113000-0000-4000-8000-000000000106', '99113000-0000-4000-8000-000000000006', 'enero-2027', 'inspira',
     '2026-10-05 10:00+00', '2026-07-v1', '2026-10-05 10:00+00', '2026-10-05 10:00+00'),
    ('99113000-0000-4000-8000-000000000107', '99113000-0000-4000-8000-000000000007', 'enero-2027', 'inspira',
     '2026-10-01 10:00+00', '2026-07-v1', '2026-10-01 10:00+00', '2026-10-01 10:00+00');
END
$fx$;

-- A — function attributes and privileges --------------------------------------
SELECT is((SELECT count(*)::int FROM pg_proc WHERE proname = 'pasantias_admin_leads_export'
                                             AND pronamespace = 'public'::regnamespace),
  1, 'A: exactly one pasantias_admin_leads_export (no overload)');
SELECT is(
  (SELECT pg_get_function_arguments(p.oid) || ' -> ' || pg_get_function_result(p.oid) FROM pg_proc p
    WHERE p.oid = 'public.pasantias_admin_leads_export(text, text, text, integer)'::regprocedure),
  'p_status text, p_search text, p_program text, p_max_bytes integer -> json',
  'A: signature and json (not jsonb) result');
SELECT is(
  (SELECT format('%s|%s|%s|%s', p.provolatile, p.prosecdef, p.proconfig, l.lanname)
     FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
    WHERE p.oid = 'public.pasantias_admin_leads_export(text, text, text, integer)'::regprocedure),
  's|f|{"search_path=\"\""}|plpgsql',
  'A: STABLE (reads under the calling statement''s snapshot), SECURITY INVOKER, plpgsql with SET clause (never inlined)');
SELECT is(
  (SELECT string_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type, ',')
     FROM pg_proc p, aclexplode(p.proacl) a
    WHERE p.oid = 'public.pasantias_admin_leads_export(text, text, text, integer)'::regprocedure AND a.grantee <> p.proowner),
  'service_role:EXECUTE', 'A: EXECUTE for service_role only (no PUBLIC, anon or authenticated)');
SELECT is(pg_temp.callas('anon', NULL), '42501', 'A: anon calling the export -> 42501');
SELECT is(pg_temp.callas('user', 'p113_admin'), '42501', 'A: an active admin JWT calling the export -> 42501');
SELECT is(pg_temp.callas('service_role', NULL), 'object', 'A: service_role calling the export -> json object');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', t.n, g.r, coalesce((SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
                       FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = t.rel AND a.grantee = g.roid), '-'))
          FROM (VALUES (1, 'pasantias_leads', 'public.pasantias_leads'::regclass::oid),
                       (2, 'pasantias_lead_program_interests', 'public.pasantias_lead_program_interests'::regclass::oid)) t(k, n, rel)
         CROSS JOIN (VALUES (1, 'anon', 'anon'::regrole::oid), (2, 'authenticated', 'authenticated'::regrole::oid)) g(k, r, roid)
         ORDER BY t.k, g.k),
  ARRAY['pasantias_leads:anon:-', 'pasantias_leads:authenticated:SELECT',
        'pasantias_lead_program_interests:anon:-', 'pasantias_lead_program_interests:authenticated:SELECT'],
  'A: table grants for anon/authenticated unchanged (the migration grants nothing on tables)');

-- F — filters, order, shape ---------------------------------------------------
CREATE TEMP TABLE p113_all AS SELECT pg_temp.x(NULL, '', NULL, NULL) AS j;
CREATE TEMP TABLE p113_q AS SELECT pg_temp.x(NULL, 'q113zq', NULL, NULL) AS j;

SELECT is(pg_temp.ids(j), ARRAY(SELECT id::text FROM public.pasantias_leads ORDER BY created_at DESC, id DESC),
  'F: no filter -> every contact in the table, created_at DESC, id DESC') FROM p113_all;
SELECT is(format('%s|%s', (j->>'total')::bigint = c.n, json_array_length(j->'leads') = c.n), 't|t',
  'F: no filter -> total and array length equal the table count')
  FROM p113_all, (SELECT count(*) AS n FROM public.pasantias_leads) c;
SELECT is(ARRAY(SELECT json_object_keys(j)), ARRAY['total', 'too_large_rows', 'too_large_bytes', 'bytes', 'leads'],
  'F: envelope keys exactly, in order') FROM p113_q;
SELECT is(format('%s|%s|%s|%s|%s', json_typeof(j->'total'), json_typeof(j->'too_large_rows'), json_typeof(j->'too_large_bytes'),
                 json_typeof(j->'bytes'), json_typeof(j->'leads')),
  'number|boolean|boolean|number|array', 'F: envelope value types') FROM p113_q;
SELECT is(pg_temp.names(j), ARRAY['r4', 'r3', 'r2', 'r7', 'r1', 'r5'],
  'F: search hits first_name, last_name, email, institution case-insensitively, not message; equal created_at -> id DESC')
  FROM p113_q;
SELECT is(pg_temp.summary(j), '6|false|false|6', 'F: total equals the array length') FROM p113_q;
SELECT is(pg_temp.names(pg_temp.x(NULL, 'Q113ZQ', NULL, NULL)), ARRAY['r4', 'r3', 'r2', 'r7', 'r1', 'r5'],
  'F: an upper-case search term matches the same contacts');
SELECT is(pg_temp.names(pg_temp.x(NULL, 'q11_zq', NULL, NULL)), ARRAY['r4', 'r3', 'r2', 'r7', 'r1', 'r5'],
  'F: _ stays an ILIKE wildcard, as in the PostgREST ilike filter');
SELECT is(pg_temp.names(pg_temp.x(s, 'q113zq', p, NULL)), e, format('F: status %s x program %s', coalesce(s, 'all'), coalesce(p, 'all')))
  FROM (VALUES
    (1, 'new', NULL, ARRAY['r7', 'r1', 'r5']),
    (2, 'contacted', NULL, ARRAY['r2']),
    (3, 'converted', NULL, ARRAY['r3']),
    (4, 'dismissed', NULL, ARRAY['r4']),
    (5, NULL, 'inspira', ARRAY['r2', 'r7', 'r1']),
    (6, NULL, 'mirada-profunda', ARRAY['r3', 'r2']),
    (7, NULL, 'sin-programa', ARRAY['r4', 'r5']),
    (8, 'new', 'inspira', ARRAY['r7', 'r1']),
    (9, 'new', 'sin-programa', ARRAY['r5']),
    (10, 'contacted', 'mirada-profunda', ARRAY['r2'])
  ) v(k, s, p, e) ORDER BY k;
SELECT is(pg_temp.summary(pg_temp.x('dismissed', 'q113zq', 'inspira', NULL)), '0|false|false|0',
  'F: a combination matching nothing -> total 0, empty array');
SELECT is(pg_temp.programs(pg_temp.lead(pg_temp.x(NULL, 'q113zq', 'inspira', NULL), 2)) || '|'
          || pg_temp.programs(pg_temp.lead(pg_temp.x(NULL, 'q113zq', 'mirada-profunda', NULL), 2)),
  'inspira,mirada-profunda|inspira,mirada-profunda', 'F: a program filter keeps the contact''s other interest, in program order');
SELECT is(ARRAY(SELECT json_object_keys(pg_temp.lead(j, 1))),
  ARRAY['id', 'cohort', 'first_name', 'last_name', 'email', 'institution', 'phone', 'role_title', 'num_people', 'message',
        'notes', 'status', 'source_path', 'utm_source', 'utm_medium', 'utm_campaign', 'consent_accepted_at',
        'consent_notice_version', 'marketing_opt_in', 'marketing_opt_in_at', 'brochure_sent_at', 'created_at', 'updated_at',
        'program_interests'],
  'F: row keys are the route''s 23 LEAD_COLUMNS plus program_interests (no email_normalized, no marketing_notice_version)')
  FROM p113_q;
SELECT is(ARRAY(SELECT json_object_keys(pg_temp.lead(j, 2)->'program_interests'->0)),
  ARRAY['program', 'consent_accepted_at', 'consent_notice_version', 'created_at'],
  'F: interest keys exactly (no reply_* claim columns)') FROM p113_q;
SELECT is(pg_temp.lead(j, 2)::jsonb,
  '{"id": "99113000-0000-4000-8000-000000000002", "cohort": "enero-2027", "first_name": "Beto", "last_name": "Q113ZQ Dos",
    "email": "p113-r2@qa.local.test", "institution": "Colegio Dos", "phone": "+56 2 2222", "role_title": "Directora",
    "num_people": 3, "message": "Mensaje dos", "notes": "Nota dos", "status": "contacted", "source_path": "/pasantias",
    "utm_source": "qa", "utm_medium": null, "utm_campaign": null, "consent_accepted_at": "2026-10-02T10:00:00+00:00",
    "consent_notice_version": "2026-07-v1", "marketing_opt_in": true, "marketing_opt_in_at": "2026-10-02T10:00:00+00:00",
    "brochure_sent_at": null, "created_at": "2026-10-02T10:00:00+00:00", "updated_at": "2026-10-02T11:30:00.123456+00:00",
    "program_interests": [
      {"program": "inspira", "consent_accepted_at": "2026-10-02T10:10:00+00:00", "consent_notice_version": "v-i",
       "created_at": "2026-10-02T10:10:00+00:00"},
      {"program": "mirada-profunda", "consent_accepted_at": "2026-10-02T10:05:00+00:00", "consent_notice_version": "v-m",
       "created_at": "2026-10-02T10:05:00+00:00"}]}'::jsonb,
  'F: row values: JSON number/boolean/null, ISO timestamps with microseconds, interests in program order not time order')
  FROM p113_q;
SELECT is((pg_temp.lead(j, 4)->'program_interests')::text || '|' || (pg_temp.lead(j, 5)->'program_interests')::text, '[]|[]',
  'F: unclassified and historical contacts carry program_interests []') FROM p113_q;
SELECT is((j->>'bytes')::bigint, octet_length((j->'leads')::text)::bigint, 'F: bytes is the octet length of the leads array')
  FROM p113_q;
SELECT is((SELECT pg_temp.summary(e) || '|' || (e->>'bytes') || '|' || (e->'leads')::text
             FROM pg_temp.x(NULL, 'q113-ninguno-zz', NULL, NULL) e),
  '0|false|false|0|2|[]', 'F: no match -> total 0, flags false, bytes 2, leads []');

-- M — p_max_bytes -------------------------------------------------------------
SELECT is(pg_temp.summary(pg_temp.x(NULL, 'q113zq', NULL, (j->>'bytes')::integer)), '6|false|false|6',
  'M: p_max_bytes equal to bytes -> complete') FROM p113_q;
SELECT is((SELECT pg_temp.summary(e) || '|' || ((e->>'bytes')::integer = (j->>'bytes')::integer) || '|' || (e->'leads')::text
             FROM pg_temp.x(NULL, 'q113zq', NULL, (j->>'bytes')::integer - 1) e),
  '6|false|true|0|true|[]', 'M: one byte under -> too_large_bytes, bytes still reported, leads []') FROM p113_q;
SELECT is(pg_temp.summary(pg_temp.x(NULL, 'q113zq', NULL, 1000000000)), '6|false|false|6', 'M: p_max_bytes 1 000 000 000 is accepted');

-- V — invalid arguments -------------------------------------------------------
SELECT throws_ok(format('SELECT pg_temp.x(%L, %L, %L, %L)', s, q, p, m), '22023', 'pasantias_admin_leads_export: invalid_argument',
                 format('V: %s -> 22023', d))
  FROM (VALUES
    (1, 'unknown status', 'nuevo', '', NULL, NULL),
    (2, 'empty status', '', '', NULL, NULL),
    (3, 'upper-case status', 'NEW', '', NULL, NULL),
    (4, 'unknown program', NULL, '', 'otro', NULL),
    (5, 'empty program', NULL, '', '', NULL),
    (6, 'upper-case program', NULL, '', 'Inspira', NULL),
    (7, 'NULL search', NULL, NULL, NULL, NULL),
    (8, 'search over 120 characters', NULL, repeat('z', 121), NULL, NULL),
    (9, 'search with a comma', NULL, 'a,b', NULL, NULL),
    (10, 'search with (', NULL, 'a(b', NULL, NULL),
    (11, 'search with )', NULL, 'a)b', NULL, NULL),
    (12, 'search with a double quote', NULL, 'a"b', NULL, NULL),
    (13, 'search with a backslash', NULL, 'a' || chr(92) || 'b', NULL, NULL),
    (14, 'search with *', NULL, 'a*b', NULL, NULL),
    (15, 'p_max_bytes 0', NULL, '', NULL, '0'),
    (16, 'p_max_bytes -1', NULL, '', NULL, '-1'),
    (17, 'p_max_bytes 1 000 000 001', NULL, '', NULL, '1000000001')
  ) v(k, d, s, q, p, m) ORDER BY k;
SELECT is(pg_temp.summary(pg_temp.x(NULL, repeat('z', 120), NULL, NULL)), '0|false|false|0', 'V: a 120-character search is accepted');

-- B — 1205 contacts in one call ---------------------------------------------------
-- Status cycles new/contacted/converted/dismissed; inspira when n % 3 = 0 or
-- n % 5 = 0, mirada-profunda when n % 3 = 1 or n % 5 = 0 (both on multiples of
-- 5), none otherwise; created_at repeats in runs of three, so id DESC decides.
INSERT INTO public.pasantias_leads (id, cohort, first_name, last_name, email, email_normalized, institution, status,
    consent_accepted_at, consent_notice_version, created_at, updated_at)
SELECT pg_temp.bid(n)::uuid, 'enero-2027', 'Bulk', 'P113 ' || n, 'p113-bulk-' || n || '@qa.local.test',
       'p113-bulk-' || n || '@qa.local.test', 'Colegio b113bulk', (ARRAY['new', 'contacted', 'converted', 'dismissed'])[n % 4 + 1],
       '2026-06-01 00:00+00', '2026-07-v1', '2026-06-01 00:00+00'::timestamptz + (n / 3) * interval '1 minute', '2026-06-01 00:00+00'
  FROM generate_series(1, 1205) n;
INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
SELECT pg_temp.bid(n)::uuid, 'enero-2027', p, '2026-06-01 00:00+00', '2026-07-v1'
  FROM generate_series(1, 1205) n, unnest(ARRAY['inspira', 'mirada-profunda']) p
 WHERE (p = 'inspira' AND (n % 3 = 0 OR n % 5 = 0)) OR (p = 'mirada-profunda' AND (n % 3 = 1 OR n % 5 = 0));

CREATE TEMP TABLE p113_b AS SELECT pg_temp.x(NULL, 'b113bulk', NULL, NULL) AS j;
SELECT is(pg_temp.summary(j), '1205|false|false|1205', 'B: 1205 matching contacts -> all 1205 in one call') FROM p113_b;
SELECT is(pg_temp.ids(j), pg_temp.ref(NULL, NULL), 'B: the 1205 ids, unique, in created_at DESC, id DESC order') FROM p113_b;
SELECT is(pg_temp.ids(pg_temp.x(s, 'b113bulk', p, NULL)), pg_temp.ref(s, p),
          format('B: status %s x program %s equals the reference query', coalesce(s, 'all'), coalesce(p, 'all')))
  FROM unnest(ARRAY[NULL, 'new', 'contacted', 'converted', 'dismissed']) WITH ORDINALITY s(s, i)
 CROSS JOIN unnest(ARRAY[NULL, 'inspira', 'mirada-profunda', 'sin-programa']) WITH ORDINALITY p(p, k)
 ORDER BY s.i, p.k;
SELECT is(json_array_length(pg_temp.x('converted', 'b113bulk', 'inspira', NULL)->'leads'), 140,
  'B: converted x inspira over the bulk contacts is exactly 140 (hand count)');

-- C — the 100 000-contact ceiling -------------------------------------------------
-- 98 795 more contacts with the bulk token (all new, no interests, older than
-- the 1205): exactly 100 000 match.
INSERT INTO public.pasantias_leads (id, cohort, first_name, last_name, email, email_normalized, institution, status,
    consent_accepted_at, consent_notice_version, created_at, updated_at)
SELECT pg_temp.bid(n)::uuid, 'enero-2027', 'Bulk', 'P113 ' || n, 'p113-bulk-' || n || '@qa.local.test',
       'p113-bulk-' || n || '@qa.local.test', 'Colegio b113bulk', 'new',
       '2026-05-01 00:00+00', '2026-07-v1', '2026-05-01 00:00+00'::timestamptz + n * interval '1 second', '2026-05-01 00:00+00'
  FROM generate_series(1206, 100000) n;

CREATE TEMP TABLE p113_big AS SELECT pg_temp.x(NULL, 'b113bulk', NULL, NULL) AS j;
SELECT is(pg_temp.summary(j), '100000|false|false|100000', 'C: exactly 100 000 matching -> complete in one call') FROM p113_big;
SELECT is((j->>'bytes')::bigint, octet_length((j->'leads')::text)::bigint, 'C: bytes reported for the 100 000-contact array')
  FROM p113_big;
SELECT is(format('%s|%s|%s', j->'leads'->0->>'id', j->'leads'-> (-1) ->>'id',
                 (SELECT count(DISTINCT e.v->>'id') FROM json_array_elements(j->'leads') e(v))),
  format('%s|%s|100000', pg_temp.bid(1205), pg_temp.bid(1206)), 'C: newest first, oldest last, 100 000 distinct ids')
  FROM p113_big;

INSERT INTO public.pasantias_leads (id, cohort, first_name, last_name, email, email_normalized, institution, status,
    consent_accepted_at, consent_notice_version, created_at, updated_at)
VALUES (pg_temp.bid(100001)::uuid, 'enero-2027', 'Bulk', 'P113 100001', 'p113-bulk-100001@qa.local.test',
        'p113-bulk-100001@qa.local.test', 'Colegio b113bulk', 'new', '2026-05-01 00:00+00', '2026-07-v1',
        '2026-05-03 00:00+00', '2026-05-03 00:00+00');
SELECT is((SELECT pg_temp.summary(e) || '|' || coalesce(e->>'bytes', 'null') || '|' || (e->'leads')::text
             FROM pg_temp.x(NULL, 'b113bulk', NULL, NULL) e),
  '100001|true|false|0|null|[]', 'C: 100 001 matching -> too_large_rows, bytes null, leads [] (never truncated)');
SELECT is((SELECT pg_temp.summary(e) || '|' || coalesce(e->>'bytes', 'null') FROM pg_temp.x(NULL, 'b113bulk', NULL, 1) e),
  '100001|true|false|0|null', 'C: over the row ceiling a byte limit is not evaluated (rows decide)');

SELECT * FROM finish();
ROLLBACK;
