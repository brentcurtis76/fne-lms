-- =============================================================================
-- 112-pasantias-program-interests-rls.sql — PASANT-B002a (PASANT-09)
-- Covers migration 20261013020000_pasantias_january_program_interests.sql
-- against docs/plan/evidence/pasant-january/b002-database-contract.md:
--   D1 structure; October (historical) leads can never receive an interest; bad
--      cohort/program pairs refused; the historical row is byte-identical after
--      January submissions, including one for the same address
--   D2 complete ACL pins (table and the three RPCs), SECURITY INVOKER + pinned
--      search_path, the single permissive admin SELECT policy plus the
--      restrictive forced_password_change_guard; principal x operation matrix
--   D3 submission semantics (upsert, idempotency, contact overwrite, D-03
--      reopen, marketing never cleared, source_path kept, normalization) and
--      every invalid input -> 22023 with nothing written
--   D4 reply claim / settle (24 h window, per-program, stale token, not_sent
--      restore, provider_accepted, ambiguous) and brochure_sent_at untouched
-- Cross-session concurrency is proven by the PASANT-09 race scripts, not here.
-- Synthetic fixtures only (*@qa.local.test, fixed UUIDs 99112000-...). Rolls back.
-- =============================================================================

BEGIN;

SELECT plan(114);

-- Fixtures (postgres) -----------------------------------------------------------
DO $fx$
DECLARE
  v_t text; v_id uuid;
BEGIN
  INSERT INTO public.schools (id, name) VALUES (9112, 'P112 QA School') ON CONFLICT (id) DO NOTHING;
  FOREACH v_t IN ARRAY ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
      'admin_inactive', 'norole', 'admin_flagged'] LOOP
    v_id := tests.create_supabase_user('p112_' || v_t, 'p112-' || replace(v_t, '_', '-') || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, school_id, must_change_password)
    VALUES (v_id, 'p112-' || replace(v_t, '_', '-') || '@qa.local.test', 'P112 ' || v_t, 'approved', 9112,
            v_t = 'admin_flagged');
    IF v_t = 'admin' THEN
      INSERT INTO public.redes_de_colegios (id, nombre, created_by)
      VALUES ('99112000-0000-4000-8000-0000000000ad', 'P112 QA Red', v_id);
    END IF;
  END LOOP;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active, red_id)
  SELECT tests.get_supabase_uid('p112_' || t), t::public.user_role_type, CASE WHEN t <> 'admin' THEN 9112 END, true,
         CASE WHEN t = 'supervisor_de_red' THEN '99112000-0000-4000-8000-0000000000ad'::uuid END
    FROM unnest(ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
                      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion']) t;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
    (tests.get_supabase_uid('p112_admin_inactive'), 'admin', NULL, false),
    (tests.get_supabase_uid('p112_admin_flagged'), 'admin', NULL, true);

  INSERT INTO public.pasantias_leads (id, cohort, first_name, last_name, email, email_normalized, institution,
      phone, source_path, notes, num_people, status, consent_accepted_at, consent_notice_version,
      marketing_opt_in, marketing_opt_in_at, marketing_notice_version, brochure_sent_at, created_at, updated_at)
  VALUES
    ('99112000-0000-4000-8000-000000000001', 'octubre-2026', 'Hist', 'Orica', 'Hist@QA.local.test',
     'hist@qa.local.test', 'Colegio Historico', '+56 2 0000', '/pasantias', 'Nota historica', 4, 'contacted',
     '2026-08-01 10:00+00', '2026-07-v1', true, '2026-08-01 10:00+00', '2026-07-v1', '2026-08-01 10:05+00',
     '2026-08-01 10:00+00', '2026-08-02 09:00+00'),
    ('99112000-0000-4000-8000-000000000011', 'enero-2027', 'Jota', 'Uno', 'j1@qa.local.test', 'j1@qa.local.test',
     'Colegio J', NULL, NULL, NULL, NULL, 'new', now(), '2026-07-v1', false, NULL, NULL, NULL, now(), now()),
    ('99112000-0000-4000-8000-000000000012', 'enero-2027', 'Jota', 'Dos', 'j2@qa.local.test', 'j2@qa.local.test',
     'Colegio J', NULL, NULL, NULL, NULL, 'new', now(), '2026-07-v1', false, NULL, NULL, NULL, now(), now());
  INSERT INTO public.pasantias_lead_program_interests (id, lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES ('99112000-0000-4000-8000-000000000021', '99112000-0000-4000-8000-000000000011', 'enero-2027', 'inspira', now(), '2026-07-v1'),
         ('99112000-0000-4000-8000-000000000022', '99112000-0000-4000-8000-000000000012', 'enero-2027', 'mirada-profunda', now(), '2026-07-v1');
END
$fx$;

CREATE TEMP TABLE p112_snap AS
  SELECT row_to_json(l)::text AS j FROM public.pasantias_leads l WHERE l.id = '99112000-0000-4000-8000-000000000001';
CREATE TEMP TABLE p112_r (tag text PRIMARY KEY, lead_id uuid, interest_id uuid, lc boolean, ic boolean);
CREATE TEMP TABLE p112_tok (tag text PRIMARY KEY, token uuid);

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
-- Back to postgres (tests.clear_authentication lives in a schema authenticated cannot use).
CREATE FUNCTION pg_temp.unact() RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
END $$;
CREATE FUNCTION pg_temp.matrix(p_kind text, p_ident text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE v text[];
BEGIN
  PERFORM pg_temp.act(p_kind, p_ident);
  SELECT array_agg(pg_temp.probe(q) ORDER BY n) INTO v FROM unnest(ARRAY[
    $q$SELECT count(*)::text FROM public.pasantias_lead_program_interests WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])$q$,
    $q$INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
       VALUES ('99112000-0000-4000-8000-000000000011', 'enero-2027', 'mirada-profunda', now(), 'v1')$q$,
    $q$UPDATE public.pasantias_lead_program_interests SET consent_notice_version = 'x' WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])$q$,
    $q$DELETE FROM public.pasantias_lead_program_interests WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])$q$,
    'TRUNCATE public.pasantias_lead_program_interests',
    $q$SELECT count(*)::text FROM public.pasantias_submit_program_interest('enero-2027', 'inspira', 'P', 'Q',
       'probe@qa.local.test', 'I', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, true, 'v1', false, NULL)$q$,
    $q$SELECT count(*)::text FROM public.pasantias_claim_program_reply('99112000-0000-4000-8000-000000000021')$q$,
    $q$SELECT public.pasantias_settle_program_reply('99112000-0000-4000-8000-000000000021',
       '00000000-0000-4000-8000-000000000000', 'ambiguous')::text$q$]) WITH ORDINALITY u(q, n);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- Submission as service_role from a jsonb overlay on a valid base call.
CREATE FUNCTION pg_temp.call(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.pasantias_submit_program_interest(%s, %s, %s, %s, %s, %s, %s, %s, %s::integer, %s, '
                '%s, %s, %s, %s, %s::boolean, %s, %s::boolean, %s)',
    quote_nullable(b->>'cohort'), quote_nullable(b->>'program'), quote_nullable(b->>'first'), quote_nullable(b->>'last'),
    quote_nullable(b->>'email'), quote_nullable(b->>'inst'), quote_nullable(b->>'phone'), quote_nullable(b->>'role'),
    quote_nullable(b->>'num'), quote_nullable(b->>'msg'), quote_nullable(b->>'path'), quote_nullable(b->>'utm_s'),
    quote_nullable(b->>'utm_m'), quote_nullable(b->>'utm_c'), quote_nullable(b->>'consent'), quote_nullable(b->>'cver'),
    quote_nullable(b->>'mkt'), quote_nullable(b->>'mver'))
  FROM (SELECT '{"cohort": "enero-2027", "program": "inspira", "first": "Ana", "last": "Prueba", "email": "base@qa.local.test",
                 "inst": "Colegio QA", "num": 2, "consent": true, "cver": "2026-07-v1", "mkt": false}'::jsonb || o AS b) x
$$;
CREATE FUNCTION pg_temp.s(p_tag text, o jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  EXECUTE pg_temp.call(o) INTO x;
  PERFORM pg_temp.unact();
  INSERT INTO p112_r VALUES (p_tag, x.lead_id, x.interest_id, x.lead_created, x.interest_created);
  RETURN x.lead_created::text || '|' || x.interest_created::text;
END $$;
CREATE FUNCTION pg_temp.c(p_tag text, p_id uuid) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  SELECT * INTO x FROM public.pasantias_claim_program_reply(p_id);
  PERFORM pg_temp.unact();
  IF x.claimed THEN INSERT INTO p112_tok VALUES (p_tag, x.claim_token); END IF;
  RETURN concat_ws('|', x.claimed::text, (x.claim_token IS NOT NULL)::text, (x.claimed_at IS NOT DISTINCT FROM now())::text);
END $$;
CREATE FUNCTION pg_temp.st(p_id uuid, p_tag text, p_outcome text) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE v boolean; t uuid := (SELECT token FROM p112_tok WHERE tag = p_tag);
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  v := public.pasantias_settle_program_reply(p_id, t, p_outcome);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- Read helpers are VOLATILE so they see writes made earlier in the same statement.
CREATE FUNCTION pg_temp.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.ts(t timestamptz) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t IS NULL THEN '-' WHEN t = now() THEN 'now' WHEN t = now() - interval '25 hours' THEN 'now-25h'
              ELSE to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') END $$;
CREATE FUNCTION pg_temp.rid(p_tag text, p_col text) RETURNS uuid LANGUAGE sql AS $$
  SELECT CASE p_col WHEN 'lead' THEN lead_id ELSE interest_id END FROM p112_r WHERE tag = p_tag $$;
CREATE FUNCTION pg_temp.lr(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', status, email, first_name, coalesce(phone, '-'), institution,
                coalesce(notes, '-'), coalesce(source_path, '-'), marketing_opt_in::text, pg_temp.ts(marketing_opt_in_at),
                coalesce(marketing_notice_version, '-'), pg_temp.ts(brochure_sent_at), consent_notice_version)
    FROM public.pasantias_leads WHERE id = p $$;
CREATE FUNCTION pg_temp.ir(p uuid) RETURNS text LANGUAGE sql AS $$
  SELECT format('%s|%s|%s|%s', pg_temp.ts(reply_claimed_at),
                coalesce((SELECT t.tag FROM p112_tok t WHERE t.token = i.reply_claim_token), '-'),
                pg_temp.ts(reply_claim_previous_at), pg_temp.ts(reply_provider_accepted_at))
    FROM public.pasantias_lead_program_interests i WHERE i.id = p $$;

-- D1 — structure --------------------------------------------------------------
SELECT has_table('public', 'pasantias_lead_program_interests', 'D1: table exists');
SELECT tests.rls_enabled('public', 'pasantias_lead_program_interests');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef) FROM pg_attribute
         WHERE attrelid = 'public.pasantias_lead_program_interests'::regclass AND attnum > 0 AND NOT attisdropped ORDER BY attnum),
  ARRAY['id:uuid:t:t', 'lead_id:uuid:t:f', 'cohort:text:t:f', 'program:text:t:f',
        'consent_accepted_at:timestamp with time zone:t:f', 'consent_notice_version:text:t:f',
        'reply_claimed_at:timestamp with time zone:f:f', 'reply_claim_token:uuid:f:f',
        'reply_claim_previous_at:timestamp with time zone:f:f', 'reply_provider_accepted_at:timestamp with time zone:f:f',
        'created_at:timestamp with time zone:t:t', 'updated_at:timestamp with time zone:t:t'],
  'D1: columns, types, nullability; consent evidence has no default; no delivery column');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_lead_program_interests_', ''), pg_get_constraintdef(oid))
          FROM pg_constraint WHERE conrelid = 'public.pasantias_lead_program_interests'::regclass ORDER BY conname),
  ARRAY['claim_previous_check:CHECK (((reply_claim_previous_at IS NULL) OR (reply_claim_token IS NOT NULL)))',
        'claim_token_check:CHECK (((reply_claim_token IS NULL) OR (reply_claimed_at IS NOT NULL)))',
        'identity_check:CHECK (((cohort = ''enero-2027''::text) AND (program = ANY (ARRAY[''inspira''::text, ''mirada-profunda''::text]))))',
        'lead_fkey:FOREIGN KEY (lead_id, cohort) REFERENCES pasantias_leads(id, cohort) ON DELETE CASCADE',
        'lead_program_key:UNIQUE (lead_id, program)',
        'notice_version_check:CHECK (((char_length(consent_notice_version) >= 1) AND (char_length(consent_notice_version) <= 64)))',
        'pkey:PRIMARY KEY (id)'],
  'D1: CHECKs (January identity, claim coherence, notice version), UNIQUE (lead_id, program), composite FK');
SELECT is(
  ARRAY(SELECT format('%s:%s', conname, pg_get_constraintdef(oid)) FROM pg_constraint
         WHERE conrelid = 'public.pasantias_leads'::regclass AND contype = 'u' ORDER BY conname),
  ARRAY['pasantias_leads_email_cohort_key:UNIQUE (email_normalized, cohort)', 'pasantias_leads_id_cohort_key:UNIQUE (id, cohort)'],
  'D1: leads keep the (email_normalized, cohort) contact key and gain the (id, cohort) key');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', t.tgname, p.proname, t.tgtype) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid = 'public.pasantias_lead_program_interests'::regclass AND NOT t.tgisinternal),
  ARRAY['trg_pasantias_lead_program_interests_updated_at:set_updated_at:19'], 'D1: BEFORE UPDATE set_updated_at trigger');

SET ROLE service_role;
SELECT throws_ok($$INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES ('99112000-0000-4000-8000-000000000001', 'octubre-2026', 'inspira', now(), 'v1')$$, '23514', NULL,
  'D1: service insert of an interest for an October lead with its own cohort -> CHECK violation');
SELECT throws_ok($$INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES ('99112000-0000-4000-8000-000000000001', 'enero-2027', 'inspira', now(), 'v1')$$, '23503', NULL,
  'D1: service insert claiming January for an October lead -> composite FK violation');
SELECT throws_ok($$INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES ('99112000-0000-4000-8000-000000000011', 'enero-2027', 'otro', now(), 'v1')$$, '23514', NULL,
  'D1: service insert with an unratified program -> CHECK violation');
SELECT throws_ok($$INSERT INTO public.pasantias_lead_program_interests (lead_id, cohort, program, consent_accepted_at, consent_notice_version)
  VALUES ('99112000-0000-4000-8000-000000000011', 'enero-2027', 'inspira', now(), 'v1')$$, '23505', NULL,
  'D1: a second interest for the same (lead, program) -> unique violation');
RESET ROLE;
SELECT throws_ok($$SELECT pg_temp.s('x', '{"cohort": "octubre-2026", "email": "hist@qa.local.test"}')$$, '22023',
  'pasantias_submit_program_interest: invalid_identity', 'D1: RPC with cohort octubre-2026 -> 22023');
SELECT is(pg_temp.s('h1', '{"email": "HIST@qa.local.test", "mkt": true, "mver": "2026-07-v1"}'), 'true|true',
  'D1: the October address submitting for January creates a new January contact');
SELECT is(
  (SELECT format('%s|%s', count(*), bool_and(cohort = CASE WHEN id = '99112000-0000-4000-8000-000000000001' THEN 'octubre-2026' ELSE 'enero-2027' END))
     FROM public.pasantias_leads WHERE email_normalized = 'hist@qa.local.test'),
  '2|t', 'D1: two separate contacts (one per cohort) for the same address');
-- Row-count assertions below count only this suite's fixture rows (J1, J2 and h1's
-- contact), so pre-existing interest rows on a shared stack cannot change them.
SELECT is(set_config('p112.leads', format('{99112000-0000-4000-8000-000000000011,99112000-0000-4000-8000-000000000012,%s}',
            (SELECT lead_id FROM p112_r WHERE tag = 'h1')), true) IS NOT NULL, true,
  'D2: fixture contact set recorded (row counts are scoped to it)');

-- D2 — privileges, policies, matrix -------------------------------------------
SELECT is(
  ARRAY(SELECT format('%s:%s', g.r, coalesce((SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
                       FROM pg_class c, aclexplode(c.relacl) a
                      WHERE c.oid = 'public.pasantias_lead_program_interests'::regclass AND a.grantee = g.oid), '-'))
          FROM (VALUES (1, 'PUBLIC', 0::oid), (2, 'anon', 'anon'::regrole::oid), (3, 'authenticated', 'authenticated'::regrole::oid),
                       (4, 'service_role', 'service_role'::regrole::oid)) g(n, r, oid) ORDER BY g.n),
  ARRAY['PUBLIC:-', 'anon:-', 'authenticated:SELECT', 'service_role:DELETE,INSERT,SELECT,UPDATE'],
  'D2: table ACL is exactly the grant-list (no TRUNCATE/REFERENCES/TRIGGER/MAINTAIN for anyone but the owner)');
SELECT is(
  (SELECT format('%s|%s|%s', p.prosecdef, p.proconfig,
                 (SELECT string_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type, ',')
                    FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner))
     FROM pg_proc p WHERE p.oid = f::regprocedure),
  'f|{"search_path=\"\""}|service_role:EXECUTE', format('D2: %s is SECURITY INVOKER, search_path pinned, EXECUTE for service_role only', f))
  FROM unnest(ARRAY['public.pasantias_submit_program_interest(text, text, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, text, boolean, text)',
                    'public.pasantias_claim_program_reply(uuid)', 'public.pasantias_settle_program_reply(uuid, uuid, text)']) f;
SELECT is(
  (SELECT pg_get_function_arguments(p.oid) || ' -> ' || pg_get_function_result(p.oid) FROM pg_proc p
    WHERE p.oid = 'public.pasantias_claim_program_reply(uuid)'::regprocedure)
  || ' / ' || pg_get_function_result('public.pasantias_submit_program_interest(text, text, text, text, text, text, text, text, integer, text, text, text, text, text, boolean, text, boolean, text)'::regprocedure),
  'p_interest_id uuid -> TABLE(claimed boolean, claim_token uuid, claimed_at timestamp with time zone) / TABLE(lead_id uuid, interest_id uuid, lead_created boolean, interest_created boolean)',
  'D2: RPC result shapes match the contract');
SELECT is(
  ARRAY(SELECT format('%s|%s|%s|%s', policyname, cmd, roles, with_check IS NULL) FROM pg_policies
         WHERE schemaname = 'public' AND tablename = 'pasantias_lead_program_interests' AND permissive = 'PERMISSIVE'),
  ARRAY['pasantias_lead_program_interests_admin_select|SELECT|{authenticated}|t'],
  'D2: the permissive policy set is exactly the admin SELECT policy, without WITH CHECK');
SELECT ok(
  (SELECT qual ~ 'user_roles' AND qual ~ 'auth\.uid\(\)' AND qual ~ '''admin''::user_role_type' AND qual ~ 'is_active = true'
          AND qual !~ 'password_change_gate_ok'
     FROM pg_policies WHERE tablename = 'pasantias_lead_program_interests' AND policyname = 'pasantias_lead_program_interests_admin_select'),
  'D2: the admin policy is the literal active-admin predicate and does not fold in the password gate');
SELECT is(
  (SELECT format('%s|%s|%s', permissive, cmd, roles) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pasantias_lead_program_interests' AND policyname = 'forced_password_change_guard'),
  'RESTRICTIVE|ALL|{authenticated}', 'D2: the restrictive forced_password_change_guard is installed');

CREATE TEMP TABLE p112_m (n int, kind text, ident text, expected text[]);
INSERT INTO p112_m
SELECT n, kind, ident, CASE
    WHEN kind = 'anon' THEN array_fill('42501'::text, ARRAY[8])
    WHEN kind = 'service_role' THEN ARRAY['3', 'ok', 'ok', 'ok', '42501', '1', '1', 'false']
    ELSE ARRAY[CASE WHEN ident = 'p112_admin' THEN '3' ELSE '0' END] || array_fill('42501'::text, ARRAY[7]) END
  FROM unnest(ARRAY['anon', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'service_role'],
              ARRAY[NULL, 'p112_admin', 'p112_consultor', 'p112_equipo_directivo', 'p112_lider_generacion', 'p112_lider_comunidad',
                    'p112_supervisor_de_red', 'p112_community_manager', 'p112_docente', 'p112_encargado_licitacion',
                    'p112_admin_inactive', 'p112_norole', 'p112_admin_flagged', NULL]) WITH ORDINALITY u(kind, ident, n);
SELECT is(pg_temp.matrix(kind, ident), expected,
          format('D2: %s -> [SELECT rows, INSERT, UPDATE, DELETE, TRUNCATE, submit, claim, settle]', coalesce(ident, kind)))
  FROM p112_m ORDER BY n;

-- The guard, not the permissive predicate, is what hides rows from a flagged admin.
SELECT set_config('request.jwt.claims', json_build_object('sub', tests.get_supabase_uid('p112_admin_flagged'), 'role', 'authenticated')::text, true);
SELECT ok(EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid()
                     AND ur.role_type = 'admin'::public.user_role_type AND ur.is_active = true),
  'D2: for the flagged admin the literal admin predicate is TRUE (evaluated over the real data)');
SELECT tests.authenticate_as('p112_admin_flagged');
SELECT is((SELECT count(*)::int FROM public.pasantias_lead_program_interests WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])), 0, 'D2: ...yet the flagged admin reads 0 rows');
SELECT pg_temp.unact();
UPDATE public.profiles SET must_change_password = false WHERE id = tests.get_supabase_uid('p112_admin_flagged');
SELECT tests.authenticate_as('p112_admin_flagged');
SELECT is((SELECT count(*)::int FROM public.pasantias_lead_program_interests WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])), 3, 'D2: the same admin with the flag cleared reads the rows');
SELECT pg_temp.unact();
SELECT tests.authenticate_as('p112_admin');
SELECT is((SELECT count(*)::int FROM public.pasantias_lead_program_interests WHERE lead_id = ANY (current_setting('p112.leads')::uuid[])), 3, 'D2: the valid admin still reads');
SELECT pg_temp.unact();

-- D3 — submission semantics ---------------------------------------------------
SELECT is(pg_temp.s('a1', '{"email": " D3@QA.local.test ", "path": "/pasantias/enero", "phone": "   "}'), 'true|true',
  'D3: first submission creates contact and interest');
SELECT is(pg_temp.lr(pg_temp.rid('a1', 'lead')), 'new|D3@QA.local.test|Ana|-|Colegio QA|-|/pasantias/enero|false|-|-|-|2026-07-v1',
  'D3: new contact: status new, trimmed email, empty optional -> NULL, false marketing tuple, no notes/brochure');
SELECT is((SELECT format('%s|%s|%s', email_normalized, pg_temp.ts(consent_accepted_at), pg_temp.ts(created_at))
             FROM public.pasantias_leads WHERE id = pg_temp.rid('a1', 'lead')), 'd3@qa.local.test|now|now',
  'D3: normalized email and server-clock consent');
UPDATE public.pasantias_leads SET consent_accepted_at = '2026-01-01 00:00+00' WHERE id = pg_temp.rid('a1', 'lead');
UPDATE public.pasantias_lead_program_interests SET consent_accepted_at = '2026-01-01 00:00+00' WHERE id = pg_temp.rid('a1', 'interest');
SELECT is(pg_temp.s('a2', '{"email": "d3@qa.local.test", "cver": "2026-08-v2"}'), 'false|false', 'D3: same program again -> both created flags false');
SELECT is((SELECT format('%s|%s', a.lead_id = b.lead_id, a.interest_id = b.interest_id) FROM p112_r a, p112_r b WHERE a.tag = 'a1' AND b.tag = 'a2'),
  't|t', 'D3: same program again returns the same lead and interest ids');
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', count(*), pg_temp.ts(min(i.consent_accepted_at)), min(i.consent_notice_version),
                 pg_temp.ts(min(l.consent_accepted_at)), min(l.consent_notice_version))
     FROM public.pasantias_lead_program_interests i JOIN public.pasantias_leads l ON l.id = i.lead_id WHERE i.lead_id = pg_temp.rid('a1', 'lead')),
  '1|now|2026-08-v2|now|2026-08-v2', 'D3: still one interest; consent re-stamped on interest and contact');
SELECT is(pg_temp.s('a3', '{"email": "d3@qa.local.test", "program": "mirada-profunda"}'), 'false|true', 'D3: other program adds an interest');
SELECT is((SELECT format('%s|%s', pg_temp.rid('a3', 'lead') = pg_temp.rid('a1', 'lead'), count(*)) FROM public.pasantias_lead_program_interests
            WHERE lead_id = pg_temp.rid('a1', 'lead')), 't|2', 'D3: second interest on the same contact');
UPDATE public.pasantias_leads SET status = 'contacted', notes = 'Nota interna QA', brochure_sent_at = '2026-09-01 12:00+00'
 WHERE id = pg_temp.rid('a1', 'lead');
SELECT is(pg_temp.s('a4', '{"email": "d3@qa.local.test", "first": "Anita", "phone": "+56 9 1111", "inst": "Otro Colegio"}'), 'false|false',
  'D3: resubmission of a contacted contact');
SELECT is(pg_temp.lr(pg_temp.rid('a1', 'lead')), 'contacted|d3@qa.local.test|Anita|+56 9 1111|Otro Colegio|Nota interna QA|/pasantias/enero|false|-|-|2026-09-01 12:00|2026-07-v1',
  'D3: contact overwritten; notes, brochure_sent_at, source_path and status contacted kept');
UPDATE public.pasantias_leads SET status = 'dismissed' WHERE id = pg_temp.rid('a1', 'lead');
SELECT is(pg_temp.s('a5', '{"email": "d3@qa.local.test"}') || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 1),
  'false|false|new', 'D3: dismissed reopens to new (D-03)');
UPDATE public.pasantias_leads SET status = 'converted' WHERE id = pg_temp.rid('a1', 'lead');
SELECT is(pg_temp.s('a6', '{"email": "d3@qa.local.test"}') || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 1),
  'false|false|converted', 'D3: converted stays converted');
SELECT is(pg_temp.s('m1', '{"email": "d3@qa.local.test", "mkt": true, "mver": "2026-07-v1"}')
          || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 8) || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 9)
          || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 10),
  'false|false|true|now|2026-07-v1', 'D3: opting in writes the complete marketing tuple');
UPDATE public.pasantias_leads SET marketing_opt_in_at = '2026-02-01 00:00+00' WHERE id = pg_temp.rid('a1', 'lead');
SELECT is(pg_temp.s('m2', '{"email": "d3@qa.local.test", "mkt": false, "mver": "ignorada"}')
          || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 8) || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 9)
          || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 10),
  'false|false|true|2026-02-01 00:00|2026-07-v1', 'D3: a later unchecked box never clears or rewrites the opt-in');
SELECT is(split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 7), '/pasantias/enero', 'D3: source_path NULL on resubmit keeps the previous path');
SELECT is(pg_temp.s('p1', '{"email": "d3@qa.local.test", "path": "/pasantias/otra"}') || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 7),
  'false|false|/pasantias/otra', 'D3: a fresh source_path replaces it');
SELECT is(pg_temp.s('c1', '{"email": "\t d3@qa.LOCAL.test  "}') || '|' || (pg_temp.rid('c1', 'lead') = pg_temp.rid('a1', 'lead'))
          || '|' || pg_temp.q($$SELECT count(*) FROM public.pasantias_leads WHERE email_normalized = 'd3@qa.local.test'$$)
          || '|' || split_part(pg_temp.lr(pg_temp.rid('a1', 'lead')), '|', 2),
  'false|false|true|1|d3@qa.LOCAL.test', 'D3: casing/whitespace variants normalize to one contact (latest casing kept)');

CREATE TEMP TABLE p112_counts AS
  SELECT (SELECT count(*) FROM public.pasantias_leads) AS leads, (SELECT count(*) FROM public.pasantias_lead_program_interests) AS interests;
SELECT throws_ok(format('SELECT pg_temp.s(%L, %L::jsonb)', 'bad', o), '22023', 'pasantias_submit_program_interest: ' || reason,
                 format('D3: %s -> 22023 %s', d, reason))
  FROM (VALUES
    ('processing consent false', '{"consent": false}'::jsonb, 'processing_consent_required'),
    ('processing consent NULL', '{"consent": null}', 'processing_consent_required'),
    ('malformed email', '{"email": "no-es-correo@qa"}', 'invalid_email'),
    ('empty email', '{"email": "  "}', 'invalid_email'),
    ('email over 140', jsonb_build_object('email', repeat('a', 128) || '@qa.local.test'), 'invalid_email'),
    ('empty first name', '{"first": " "}', 'invalid_first_name'),
    ('NULL last name', '{"last": null}', 'invalid_last_name'),
    ('empty institution', '{"inst": ""}', 'invalid_institution'),
    ('first name over 80', jsonb_build_object('first', repeat('a', 81)), 'invalid_first_name'),
    ('last name over 80', jsonb_build_object('last', repeat('a', 81)), 'invalid_last_name'),
    ('institution over 140', jsonb_build_object('inst', repeat('a', 141)), 'invalid_institution'),
    ('phone over 40', jsonb_build_object('phone', repeat('1', 41)), 'invalid_phone'),
    ('role over 140', jsonb_build_object('role', repeat('a', 141)), 'invalid_role_title'),
    ('message over 1000', jsonb_build_object('msg', repeat('a', 1001)), 'invalid_message'),
    ('utm_source over 140', jsonb_build_object('utm_s', repeat('a', 141)), 'invalid_utm_source'),
    ('utm_medium over 140', jsonb_build_object('utm_m', repeat('a', 141)), 'invalid_utm_medium'),
    ('utm_campaign over 140', jsonb_build_object('utm_c', repeat('a', 141)), 'invalid_utm_campaign'),
    ('num_people 0', '{"num": 0}', 'invalid_num_people'),
    ('num_people 61', '{"num": 61}', 'invalid_num_people'),
    ('protocol-relative source_path', '{"path": "//evil.example/x"}', 'invalid_source_path'),
    ('backslash source_path', '{"path": "/\\evil.example"}', 'invalid_source_path'),
    ('absolute URL source_path', '{"path": "https://evil.example/"}', 'invalid_source_path'),
    ('source_path with whitespace', '{"path": " /pasantias"}', 'invalid_source_path'),
    ('source_path over 200', jsonb_build_object('path', '/' || repeat('a', 200)), 'invalid_source_path'),
    ('missing consent notice version', '{"cver": null}', 'invalid_consent_notice_version'),
    ('consent notice version over 64', jsonb_build_object('cver', repeat('v', 65)), 'invalid_consent_notice_version'),
    ('opt-in without marketing version', '{"mkt": true}', 'invalid_marketing_notice_version'),
    ('NULL marketing flag', '{"mkt": null}', 'invalid_marketing_opt_in'),
    ('unratified program', '{"program": "otro"}', 'invalid_identity'),
    ('NULL program', '{"program": null}', 'invalid_identity'),
    ('wrong cohort', '{"cohort": "enero-2026"}', 'invalid_identity')
  ) v(d, o, reason);
SELECT is((SELECT format('%s|%s', count(*) = c.leads, (SELECT count(*) FROM public.pasantias_lead_program_interests) = c.interests)
             FROM public.pasantias_leads, p112_counts c GROUP BY c.leads, c.interests),
  't|t', 'D3: no invalid submission wrote a lead or an interest');

-- D4 — reply claim / settle ---------------------------------------------------
SELECT is(pg_temp.s('d4i', '{"email": "d4@qa.local.test"}') || '|' || pg_temp.s('d4m', '{"email": "d4@qa.local.test", "program": "mirada-profunda"}'),
  'true|true|false|true', 'D4: contact with both programs');
UPDATE public.pasantias_leads SET brochure_sent_at = '2026-09-02 08:00+00' WHERE id = pg_temp.rid('d4i', 'lead');
SELECT is(pg_temp.c('A', pg_temp.rid('d4i', 'interest')), 'true|true|true', 'D4: first claim succeeds with a token at now()');
SELECT is(pg_temp.ir(pg_temp.rid('d4i', 'interest')), 'now|A|-|-', 'D4: claim recorded (previous NULL)');
SELECT is(pg_temp.c('x1', pg_temp.rid('d4i', 'interest')), 'false|false|false', 'D4: second claim inside 24 h refused');
SELECT is(pg_temp.c('M', pg_temp.rid('d4m', 'interest')), 'true|true|true', 'D4: the other program of the same contact is claimable');
UPDATE public.pasantias_lead_program_interests SET reply_claimed_at = now() - interval '25 hours' WHERE id = pg_temp.rid('d4i', 'interest');
SELECT is(pg_temp.c('B', pg_temp.rid('d4i', 'interest')) || '|' || pg_temp.ir(pg_temp.rid('d4i', 'interest')),
  'true|true|true|now|B|now-25h|-', 'D4: an expired (25 h) claim is reclaimable; previous_at records the old stamp');
SELECT is(pg_temp.st(pg_temp.rid('d4i', 'interest'), 'A', 'not_sent')::text || '|' || pg_temp.ir(pg_temp.rid('d4i', 'interest')),
  'false|now|B|now-25h|-', 'D4: stale owner A settling not_sent -> false; B''s claim unchanged');
SELECT is(pg_temp.st(pg_temp.rid('d4i', 'interest'), 'B', 'not_sent')::text || '|' || pg_temp.ir(pg_temp.rid('d4i', 'interest')),
  'true|now-25h|-|-|-', 'D4: owner not_sent restores the expired pre-claim stamp and clears token/previous');
SELECT is(pg_temp.c('C', pg_temp.rid('d4i', 'interest')), 'true|true|true', 'D4: after not_sent the interest is claimable again');
SELECT is(pg_temp.st(pg_temp.rid('d4i', 'interest'), 'C', 'provider_accepted')::text || '|' || pg_temp.ir(pg_temp.rid('d4i', 'interest')),
  'true|now|-|-|now', 'D4: provider_accepted stamps reply_provider_accepted_at and keeps the claim');
SELECT is(pg_temp.st(pg_temp.rid('d4i', 'interest'), 'C', 'provider_accepted'), false, 'D4: a second settle with the same token -> false');
SELECT is(pg_temp.c('x2', pg_temp.rid('d4i', 'interest')), 'false|false|false', 'D4: claim after provider_accepted inside 24 h refused');
SELECT is(pg_temp.st(pg_temp.rid('d4m', 'interest'), 'M', 'ambiguous')::text || '|' || pg_temp.ir(pg_temp.rid('d4m', 'interest')),
  'true|now|-|-|-', 'D4: ambiguous keeps the claim, labels nothing');
SELECT is(pg_temp.c('x3', pg_temp.rid('d4m', 'interest')), 'false|false|false', 'D4: claim after ambiguous inside 24 h refused');
SELECT is(pg_temp.c('N', pg_temp.rid('a3', 'interest')) || '|' || pg_temp.st(pg_temp.rid('a3', 'interest'), 'N', 'not_sent')::text
          || '|' || pg_temp.ir(pg_temp.rid('a3', 'interest')) || '|' || pg_temp.c('N2', pg_temp.rid('a3', 'interest')),
  'true|true|true|true|-|-|-|-|true|true|true', 'D4: not_sent on a never-claimed interest restores NULL; claimable again');
SELECT throws_ok(q, '22023', NULL, 'D4: ' || d)
  FROM (VALUES
    ('SELECT pg_temp.st(pg_temp.rid(''d4i'', ''interest''), ''C'', ''sent'')', 'unknown outcome -> 22023'),
    ('SELECT pg_temp.st(pg_temp.rid(''d4i'', ''interest''), ''C'', NULL)', 'NULL outcome -> 22023'),
    ('SELECT pg_temp.st(pg_temp.rid(''d4i'', ''interest''), ''nope'', ''ambiguous'')', 'NULL token -> 22023'),
    ('SELECT pg_temp.st(NULL, ''C'', ''ambiguous'')', 'NULL interest id on settle -> 22023'),
    ('SELECT pg_temp.st(''99112000-0000-4000-8000-0000000000ff'', ''C'', ''ambiguous'')', 'unknown interest on settle -> 22023'),
    ('SELECT pg_temp.c(''e1'', NULL)', 'NULL interest id on claim -> 22023'),
    ('SELECT pg_temp.c(''e2'', ''99112000-0000-4000-8000-0000000000ff'')', 'unknown interest on claim -> 22023')
  ) v(q, d);
SELECT is(
  (SELECT string_agg(pg_temp.ts(brochure_sent_at), ',' ORDER BY email_normalized) FROM public.pasantias_leads
    WHERE email_normalized IN ('d3@qa.local.test', 'd4@qa.local.test')),
  '2026-09-01 12:00,2026-09-02 08:00', 'D4: claims and settles never touch pasantias_leads.brochure_sent_at');

-- D1 — the historical row after everything ------------------------------------
SELECT is((SELECT row_to_json(l)::text FROM public.pasantias_leads l WHERE l.id = '99112000-0000-4000-8000-000000000001'),
  (SELECT j FROM p112_snap), 'D1: the October lead (status, notes, brochure, consent, marketing, timestamps) is byte-identical');
SELECT is((SELECT count(*)::int FROM public.pasantias_lead_program_interests i JOIN public.pasantias_leads l ON l.id = i.lead_id
            WHERE l.cohort <> 'enero-2027'), 0, 'D1: no interest references a non-January lead');

SELECT * FROM finish();
ROLLBACK;
