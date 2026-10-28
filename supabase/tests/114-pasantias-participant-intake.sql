-- =============================================================================
-- 114-pasantias-participant-intake.sql — PASANT-PARTICIPANT-INTAKE-DB-01
-- Covers migration 20261028020000_pasantias_participant_intake.sql against
-- docs/plan/evidence/pasant-intake/db-contract.md (FIRST review §3 and §8):
--   D1 structure: columns, every CHECK refused one at a time next to a valid
--      base row, funding has no default, generated school key + uniqueness,
--      index, triggers, FK (RESTRICT)
--   D2 access: exact table and function ACLs (service_role only), SECURITY
--      INVOKER + search_path = '', frozen signatures, only the restrictive
--      password guard; anon + 12 personas (admin and flagged admin included)
--      denied SELECT/INSERT/UPDATE/DELETE/TRUNCATE/EXECUTE; service_role allowed
--   D3 behaviour: create, replay (changed fields not applied), duplicate RUT,
--      update, stale, no-op (no bump, no reopen), unknown and cross-roster ids,
--      finalize (stale, idempotent replay, empty), reopen on edit, rotation and
--      revocation under the token predicate, 60-person cap, every invalid input
--      -> 22023 with nothing written
-- Real cross-session concurrency is proven by the app unit's Playwright
-- Promise.all journeys (FIRST N3), not here. Synthetic data only
-- (*@qa.local.test, fixed UUIDs 99114000-...). Rolls back.
-- =============================================================================

BEGIN;

SELECT plan(176);

CREATE TEMP TABLE p114_ids (tag text PRIMARY KEY, id uuid NOT NULL);

-- Helpers ---------------------------------------------------------------------
-- h(tag): the synthetic token hash of a fixture roster (SHA-256 hex).
CREATE FUNCTION pg_temp.h(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to('p114-' || t, 'UTF8')), 'hex') $$;
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
CREATE FUNCTION pg_temp.matrix(p_kind text, p_ident text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE v text[];
BEGIN
  PERFORM pg_temp.act(p_kind, p_ident);
  SELECT array_agg(pg_temp.probe(q) ORDER BY n) INTO v FROM unnest(ARRAY[
    $q$SELECT count(*)::text FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P114 %'$q$,
    $q$SELECT count(*)::text FROM public.pasantias_intake_participants p
        WHERE p.roster_id IN (SELECT r.id FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P114 %')$q$,
    $q$INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash, expires_at)
       VALUES ('enero-2027', 'inspira', 'P114 Probe', pg_temp.h('probe'), now() + interval '1 day')$q$,
    $q$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
         flights_funding, lodging_funding, acknowledged_at, notice_version)
       VALUES ('99114000-0000-4000-8000-0000000000a1', gen_random_uuid(), 'Probe', 'Prueba', '33333333-3', 'sep', 'sep', now(), 'v1')$q$,
    $q$UPDATE public.pasantias_intake_rosters SET version = version WHERE school_name LIKE 'P114 %'$q$,
    $q$UPDATE public.pasantias_intake_participants SET version = version WHERE roster_id = '99114000-0000-4000-8000-0000000000a2'$q$,
    $q$DELETE FROM public.pasantias_intake_rosters WHERE school_name LIKE 'P114 %'$q$,
    $q$DELETE FROM public.pasantias_intake_participants WHERE roster_id = '99114000-0000-4000-8000-0000000000a2'$q$,
    'TRUNCATE public.pasantias_intake_participants',
    $q$SELECT count(*)::text FROM public.pasantias_intake_save_participant('not-a-hash', NULL::uuid, NULL::integer,
       '99114000-0000-4000-8000-0000000000ee'::uuid, 'Ana', 'Prueba', '12345678-5', NULL::text, 'sep', 'sep',
       NULL::date, NULL::date, NULL::text, '{}'::text[], NULL::text, 'v1')$q$,
    $q$SELECT count(*)::text FROM public.pasantias_intake_finalize('not-a-hash', 1)$q$]) WITH ORDINALITY u(q, n);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- call(o): a save call (as SQL text) from a jsonb overlay on a valid base:
--   tok roster tag (hashed) | hash raw hash | pid raw id | pt tagged id | ev | crid
--   (absent -> fresh uuid) | fn ln rut pp ff lf ad dd focus | diet json array |
--   diet_raw text[] literal | other | nv
CREATE FUNCTION pg_temp.call(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.pasantias_intake_save_participant(%s, %s::uuid, %s::integer, %s::uuid, %s, %s, %s, '
                '%s, %s, %s, %s::date, %s::date, %s, %s::text[], %s, %s)',
    quote_nullable(CASE WHEN b ? 'hash' THEN b->>'hash' ELSE pg_temp.h(b->>'tok') END),
    quote_nullable(coalesce(b->>'pid', (SELECT t.id::text FROM p114_ids t WHERE t.tag = b->>'pt'))),
    quote_nullable(b->>'ev'),
    quote_nullable(CASE WHEN b ? 'crid' THEN b->>'crid' ELSE gen_random_uuid()::text END),
    quote_nullable(b->>'fn'), quote_nullable(b->>'ln'), quote_nullable(b->>'rut'), quote_nullable(b->>'pp'),
    quote_nullable(b->>'ff'), quote_nullable(b->>'lf'), quote_nullable(b->>'ad'), quote_nullable(b->>'dd'),
    quote_nullable(b->>'focus'),
    quote_nullable(CASE WHEN b ? 'diet_raw' THEN b->>'diet_raw'
                        WHEN jsonb_typeof(b->'diet') = 'array'
                          THEN ARRAY(SELECT e.v FROM jsonb_array_elements_text(b->'diet') WITH ORDINALITY e(v, n) ORDER BY e.n)::text END),
    quote_nullable(b->>'other'), quote_nullable(b->>'nv'))
  FROM (SELECT '{"tok": "A", "fn": "Ana María", "ln": "O''Higgins-Prueba", "rut": "12345678-5", "ff": "sep",
                 "lf": "colegio", "diet": [], "nv": "2026-10-v1"}'::jsonb || o AS b) x
$$;
-- sv(tag, o): runs call(o) as service_role; records the participant id under tag.
CREATE FUNCTION pg_temp.sv(p_tag text, o jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_sql text := pg_temp.call(o); x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  EXECUTE v_sql INTO x;
  PERFORM pg_temp.unact();
  IF p_tag IS NOT NULL THEN INSERT INTO p114_ids VALUES (p_tag, x.participant_id); END IF;
  RETURN concat_ws('|', x.participant_version::text, x.replayed::text, x.roster_status, x.roster_version::text);
END $$;
CREATE FUNCTION pg_temp.fin(p_hash text, p_ev integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  SELECT * INTO x FROM public.pasantias_intake_finalize(p_hash, p_ev);
  PERFORM pg_temp.unact();
  RETURN concat_ws('|', x.roster_status, x.roster_version::text, pg_temp.ts(x.submitted_at));
END $$;
-- Direct-write builders for the structural CHECK tests (valid base + overlay).
CREATE FUNCTION pg_temp.rins(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash, expires_at, status, '
                'submitted_at, version) VALUES (%s, %s, %s, %s, now() + interval ''1 day'', %s, %s::timestamptz, %s::integer)',
    quote_nullable(b->>'cohort'), quote_nullable(b->>'program'), quote_nullable(b->>'school'), quote_nullable(b->>'hash'),
    quote_nullable(b->>'status'), quote_nullable(b->>'sub'), quote_nullable(b->>'version'))
  FROM (SELECT jsonb_build_object('cohort', 'enero-2027', 'program', 'inspira', 'school', 'P114 Check Base',
                                  'hash', pg_temp.h('chkbase'), 'status', 'open', 'version', 1) || o AS b) x
$$;
CREATE FUNCTION pg_temp.pins(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut, '
                'passport_number, flights_funding, lodging_funding, arrival_date, departure_date, focus, dietary_restrictions, '
                'dietary_other, acknowledged_at, notice_version, version) VALUES (''99114000-0000-4000-8000-0000000000a8'', '
                'gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s::date, %s::date, %s, %s::text[], %s, now(), %s, %s::integer)',
    quote_nullable(b->>'fn'), quote_nullable(b->>'ln'), quote_nullable(b->>'rut'), quote_nullable(b->>'pp'),
    quote_nullable(b->>'ff'), quote_nullable(b->>'lf'), quote_nullable(b->>'ad'), quote_nullable(b->>'dd'),
    quote_nullable(b->>'focus'), quote_nullable(b->>'diet'), quote_nullable(b->>'other'), quote_nullable(b->>'nv'),
    quote_nullable(b->>'version'))
  FROM (SELECT '{"fn": "Base", "ln": "Prueba", "rut": "22222222-2", "ff": "sep", "lf": "sep", "diet": "{}",
                 "nv": "v1", "version": 1}'::jsonb || o AS b) x
$$;
-- Readers (VOLATILE, so they see writes made earlier in the same statement).
CREATE FUNCTION pg_temp.q(p_sql text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  EXECUTE p_sql INTO v;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.ts(t timestamptz) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT CASE WHEN t IS NULL THEN '-' WHEN t = now() THEN 'now'
              ELSE to_char(t AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') END $$;
CREATE FUNCTION pg_temp.pid(p_tag text) RETURNS uuid LANGUAGE sql AS $$
  SELECT t.id FROM p114_ids t WHERE t.tag = p_tag $$;
CREATE FUNCTION pg_temp.pr(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', r.school_name, x.first_names, x.last_names, x.rut, coalesce(x.passport_number, '-'),
                   x.flights_funding, x.lodging_funding, coalesce(to_char(x.arrival_date, 'YYYY-MM-DD'), '-'),
                   coalesce(to_char(x.departure_date, 'YYYY-MM-DD'), '-'), coalesce(x.focus, '-'),
                   x.dietary_restrictions::text, coalesce(x.dietary_other, '-'), x.notice_version, x.version::text,
                   pg_temp.ts(x.acknowledged_at), right(x.client_request_id::text, 2))
    FROM public.pasantias_intake_participants x JOIN public.pasantias_intake_rosters r ON r.id = x.roster_id
   WHERE x.id = p_id $$;
CREATE FUNCTION pg_temp.rs(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', r.status, r.version::text, pg_temp.ts(r.submitted_at), pg_temp.ts(r.last_submitted_at))
    FROM public.pasantias_intake_rosters r WHERE r.id = p_id $$;
-- state(): every fixture roster and participant, for "nothing was written" checks.
CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('/',
    (SELECT string_agg(concat_ws(':', r.school_name, r.status, r.version::text, pg_temp.ts(r.submitted_at)), ',' ORDER BY r.id)
       FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P114 %'),
    (SELECT string_agg(concat_ws(':', p.id::text, p.version::text, p.rut), ',' ORDER BY p.id)
       FROM public.pasantias_intake_participants p JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
      WHERE r.school_name LIKE 'P114 %')) $$;

-- Fixtures (postgres) -----------------------------------------------------------
--   A   inspira          open, empty            (main journey)
--   B   mirada-profunda  open, participant B01  (other school; validation target)
--   REV revoked, participant REV01 | EXP expired 1 min ago | EXP0 expires exactly now()
--   CAP 60-person cap | EMPTY never filled | CHK direct-write CHECK tests
DO $fx$
DECLARE
  v_t text; v_id uuid;
BEGIN
  INSERT INTO public.schools (id, name) VALUES (9114, 'P114 QA School') ON CONFLICT (id) DO NOTHING;
  FOREACH v_t IN ARRAY ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
      'admin_inactive', 'norole', 'admin_flagged'] LOOP
    v_id := tests.create_supabase_user('p114_' || v_t, 'p114-' || replace(v_t, '_', '-') || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, school_id, must_change_password)
    VALUES (v_id, 'p114-' || replace(v_t, '_', '-') || '@qa.local.test', 'P114 ' || v_t, 'approved', 9114,
            v_t = 'admin_flagged');
    IF v_t = 'admin' THEN
      INSERT INTO public.redes_de_colegios (id, nombre, created_by)
      VALUES ('99114000-0000-4000-8000-0000000000ad', 'P114 QA Red', v_id);
    END IF;
  END LOOP;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active, red_id)
  SELECT tests.get_supabase_uid('p114_' || t), t::public.user_role_type, CASE WHEN t <> 'admin' THEN 9114 END, true,
         CASE WHEN t = 'supervisor_de_red' THEN '99114000-0000-4000-8000-0000000000ad'::uuid END
    FROM unnest(ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
                      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion']) t;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
    (tests.get_supabase_uid('p114_admin_inactive'), 'admin', NULL, false),
    (tests.get_supabase_uid('p114_admin_flagged'), 'admin', NULL, true);

  INSERT INTO public.pasantias_intake_rosters (id, cohort, program, school_name, token_hash, expires_at, revoked_at) VALUES
    ('99114000-0000-4000-8000-0000000000a1', 'enero-2027', 'inspira', 'P114 Colegio A', pg_temp.h('A'), now() + interval '30 days', NULL),
    ('99114000-0000-4000-8000-0000000000a2', 'enero-2027', 'mirada-profunda', 'P114 Colegio B', pg_temp.h('B'), now() + interval '30 days', NULL),
    ('99114000-0000-4000-8000-0000000000a3', 'enero-2027', 'inspira', 'P114 Colegio Revocado', pg_temp.h('REV'), now() + interval '30 days', now()),
    ('99114000-0000-4000-8000-0000000000a4', 'enero-2027', 'inspira', 'P114 Colegio Vencido', pg_temp.h('EXP'), now() - interval '1 minute', NULL),
    ('99114000-0000-4000-8000-0000000000a5', 'enero-2027', 'inspira', 'P114 Colegio Borde', pg_temp.h('EXP0'), now(), NULL),
    ('99114000-0000-4000-8000-0000000000a6', 'enero-2027', 'inspira', 'P114 Colegio Cupo', pg_temp.h('CAP'), now() + interval '30 days', NULL),
    ('99114000-0000-4000-8000-0000000000a7', 'enero-2027', 'inspira', 'P114 Colegio Vacio', pg_temp.h('EMPTY'), now() + interval '30 days', NULL),
    ('99114000-0000-4000-8000-0000000000a8', 'enero-2027', 'inspira', 'P114 Colegio Check', pg_temp.h('CHK'), now() + interval '30 days', NULL);
  INSERT INTO public.pasantias_intake_participants (id, roster_id, client_request_id, first_names, last_names, rut,
      flights_funding, lodging_funding, acknowledged_at, notice_version) VALUES
    ('99114000-0000-4000-8000-0000000000b1', '99114000-0000-4000-8000-0000000000a2', '99114000-0000-4000-8000-0000000000c1',
     'Beto', 'Prueba', '11111111-1', 'colegio', 'colegio', now(), '2026-10-v1'),
    ('99114000-0000-4000-8000-0000000000b3', '99114000-0000-4000-8000-0000000000a3', '99114000-0000-4000-8000-0000000000c3',
     'Rita', 'Prueba', '11111111-1', 'sep', 'sep', now(), '2026-10-v1');
END
$fx$;

-- D1 — structure --------------------------------------------------------------
SELECT has_table('public', 'pasantias_intake_rosters', 'D1: rosters table exists');
SELECT has_table('public', 'pasantias_intake_participants', 'D1: participants table exists');
SELECT tests.rls_enabled('public', 'pasantias_intake_rosters');
SELECT tests.rls_enabled('public', 'pasantias_intake_participants');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef,
                      coalesce(nullif(attgenerated::text, ''), '-'))
          FROM pg_attribute WHERE attrelid = 'public.pasantias_intake_rosters'::regclass AND attnum > 0 AND NOT attisdropped
         ORDER BY attnum),
  ARRAY['id:uuid:t:t:-', 'cohort:text:t:f:-', 'program:text:t:f:-', 'school_name:text:t:f:-', 'school_name_key:text:t:t:s',
        'token_hash:text:t:f:-', 'expires_at:timestamp with time zone:t:f:-', 'revoked_at:timestamp with time zone:f:f:-',
        'status:text:t:t:-', 'submitted_at:timestamp with time zone:f:f:-', 'last_submitted_at:timestamp with time zone:f:f:-',
        'version:integer:t:t:-', 'created_by:uuid:f:f:-', 'created_at:timestamp with time zone:t:t:-',
        'updated_at:timestamp with time zone:t:t:-'],
  'D1: roster columns, types, nullability, defaults; school_name_key is a stored generated column');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef,
                      coalesce(nullif(attgenerated::text, ''), '-'))
          FROM pg_attribute WHERE attrelid = 'public.pasantias_intake_participants'::regclass AND attnum > 0 AND NOT attisdropped
         ORDER BY attnum),
  ARRAY['id:uuid:t:t:-', 'roster_id:uuid:t:f:-', 'client_request_id:uuid:t:f:-', 'first_names:text:t:f:-',
        'last_names:text:t:f:-', 'rut:text:t:f:-', 'passport_number:text:f:f:-', 'flights_funding:text:t:f:-',
        'lodging_funding:text:t:f:-', 'arrival_date:date:f:f:-', 'departure_date:date:f:f:-', 'focus:text:f:f:-',
        'dietary_restrictions:text[]:t:t:-', 'dietary_other:text:f:f:-', 'acknowledged_at:timestamp with time zone:t:f:-',
        'notice_version:text:t:f:-', 'version:integer:t:t:-', 'created_at:timestamp with time zone:t:t:-',
        'updated_at:timestamp with time zone:t:t:-'],
  'D1: participant columns; both funding columns NOT NULL with no default; dates are plain date; dietary text[]');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_intake_rosters_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_intake_rosters'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['identity_check:CHECK', 'pkey:PRIMARY KEY (id)', 'school_key:UNIQUE (cohort, program, school_name_key)',
        'school_name_check:CHECK', 'status_check:CHECK', 'submitted_check:CHECK', 'token_hash_check:CHECK',
        'token_hash_key:UNIQUE (token_hash)', 'version_check:CHECK'],
  'D1: roster constraint set (each CHECK is exercised below)');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_intake_participants_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_intake_participants'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['client_request_key:UNIQUE (roster_id, client_request_id)', 'dates_check:CHECK', 'dietary_check:CHECK',
        'dietary_other_check:CHECK', 'focus_check:CHECK', 'funding_check:CHECK', 'names_check:CHECK',
        'notice_version_check:CHECK', 'passport_check:CHECK', 'pkey:PRIMARY KEY (id)',
        'roster_fkey:FOREIGN KEY (roster_id) REFERENCES pasantias_intake_rosters(id) ON DELETE RESTRICT',
        'rut_check:CHECK', 'rut_key:UNIQUE (roster_id, rut)', 'version_check:CHECK'],
  'D1: participant constraint set: per-roster UNIQUE request id and RUT, FK ON DELETE RESTRICT');
SELECT has_index('public', 'pasantias_intake_participants', 'pasantias_intake_participants_roster_created_idx',
  ARRAY['roster_id', 'created_at', 'id']::name[], 'D1: participants indexed on (roster_id, created_at, id)');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', t.tgname, p.proname, t.tgtype) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid IN ('public.pasantias_intake_rosters'::regclass, 'public.pasantias_intake_participants'::regclass)
           AND NOT t.tgisinternal ORDER BY t.tgname),
  ARRAY['trg_pasantias_intake_participants_updated_at:set_updated_at:19', 'trg_pasantias_intake_rosters_updated_at:set_updated_at:19'],
  'D1: BEFORE UPDATE set_updated_at trigger on both tables');

SET ROLE service_role;
SELECT lives_ok($$INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash, expires_at)
  VALUES ('enero-2027', 'inspira', 'P114  Key' || chr(9) || 'School', pg_temp.h('KEY1'), now() + interval '1 day')$$,
  'D1: a school name with inner runs of whitespace is accepted');
SELECT is((SELECT school_name_key FROM public.pasantias_intake_rosters WHERE token_hash = pg_temp.h('KEY1')), 'p114 key school',
  'D1: school_name_key is lowercase with whitespace runs collapsed');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash, expires_at)
  VALUES ('enero-2027', 'inspira', 'p114 KEY school', pg_temp.h('KEY2'), now() + interval '1 day')$$,
  '23505', 'duplicate key value violates unique constraint "pasantias_intake_rosters_school_key"',
  'D1: the same school differing only in case/whitespace, same program -> unique violation');
SELECT lives_ok($$INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash, expires_at)
  VALUES ('enero-2027', 'mirada-profunda', 'P114 Key School', pg_temp.h('KEY3'), now() + interval '1 day')$$,
  'D1: the same school for the other program is a separate roster');

SELECT throws_ok(pg_temp.rins(o), '23514',
  format('new row for relation "pasantias_intake_rosters" violates check constraint "pasantias_intake_rosters_%s"', c),
  format('D1: roster %s -> %s', d, c))
  FROM (VALUES
    ('cohort octubre-2026', '{"cohort": "octubre-2026"}'::jsonb, 'identity_check'),
    ('program otro', '{"program": "otro"}', 'identity_check'),
    ('school name with a leading space', '{"school": " P114 X"}', 'school_name_check'),
    ('one-character school name', '{"school": "A"}', 'school_name_check'),
    ('school name over 160', jsonb_build_object('school', repeat('a', 161)), 'school_name_check'),
    ('uppercase hex token hash', jsonb_build_object('hash', upper(pg_temp.h('chkbase'))), 'token_hash_check'),
    ('63-character token hash', jsonb_build_object('hash', left(pg_temp.h('chkbase'), 63)), 'token_hash_check'),
    ('status draft', '{"status": "draft"}', 'status_check'),
    ('submitted without submitted_at', '{"status": "submitted"}', 'submitted_check'),
    ('open with submitted_at', '{"sub": "2026-11-01 10:00+00"}', 'submitted_check'),
    ('version 0', '{"version": 0}', 'version_check')
  ) v(d, o, c);
SELECT lives_ok(pg_temp.rins('{}'), 'D1: the base roster row is valid, so each refusal above isolates one CHECK');

SELECT throws_ok(pg_temp.pins(o), '23514',
  format('new row for relation "pasantias_intake_participants" violates check constraint "pasantias_intake_participants_%s"', c),
  format('D1: participant %s -> %s', d, c))
  FROM (VALUES
    ('empty first names', '{"fn": ""}'::jsonb, 'names_check'),
    ('first names with a leading space', '{"fn": " Ana"}', 'names_check'),
    ('last names over 80', jsonb_build_object('ln', repeat('a', 81)), 'names_check'),
    ('RUT with a leading zero', '{"rut": "01234567-8"}', 'rut_check'),
    ('RUT with a 6-digit body', '{"rut": "123456-0"}', 'rut_check'),
    ('RUT with a 9-digit body', '{"rut": "123456789-0"}', 'rut_check'),
    ('RUT with a lowercase k', '{"rut": "12345678-k"}', 'rut_check'),
    ('dotted RUT', '{"rut": "12.345.678-5"}', 'rut_check'),
    ('lowercase passport', '{"pp": "ab123"}', 'passport_check'),
    ('4-character passport', '{"pp": "A123"}', 'passport_check'),
    ('flights funding fne', '{"ff": "fne"}', 'funding_check'),
    ('lodging funding SEP', '{"lf": "SEP"}', 'funding_check'),
    ('departure equal to arrival', '{"ad": "2027-01-17", "dd": "2027-01-17"}', 'dates_check'),
    ('focus media', '{"focus": "media"}', 'focus_check'),
    ('unknown dietary code', '{"diet": "{kosher}"}', 'dietary_check'),
    ('NULL dietary element', '{"diet": "{NULL}"}', 'dietary_check'),
    ('six dietary elements', '{"diet": "{otra,otra,otra,otra,otra,otra}"}', 'dietary_check'),
    ('two-dimensional dietary array', '{"diet": "{{vegano}}"}', 'dietary_check'),
    ('dietary detail without otra', '{"other": "x"}', 'dietary_other_check'),
    ('dietary detail with a leading space', '{"diet": "{otra}", "other": " x"}', 'dietary_other_check'),
    ('dietary detail over 200', jsonb_build_object('diet', '{otra}', 'other', repeat('a', 201)), 'dietary_other_check'),
    ('empty notice version', '{"nv": ""}', 'notice_version_check'),
    ('version 0', '{"version": 0}', 'version_check')
  ) v(d, o, c);
SELECT lives_ok(pg_temp.pins('{}'), 'D1: the base participant row is valid, so each refusal above isolates one CHECK');
SELECT lives_ok($$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    flights_funding, lodging_funding, acknowledged_at, notice_version)
  VALUES ('99114000-0000-4000-8000-0000000000a8', gen_random_uuid(), 'Sin', 'Dieta', '22222223-0', 'colegio', 'sep', now(), 'v1')$$,
  'D1: a participant row without dietary columns is accepted');
SELECT is((SELECT concat_ws('|', dietary_restrictions::text, coalesce(dietary_other, '-'), version::text)
             FROM public.pasantias_intake_participants
            WHERE roster_id = '99114000-0000-4000-8000-0000000000a8' AND rut = '22222223-0'),
  '{}|-|1', 'D1: dietary_restrictions defaults to the empty array (= not provided), version to 1');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    lodging_funding, acknowledged_at, notice_version)
  VALUES ('99114000-0000-4000-8000-0000000000a8', gen_random_uuid(), 'Sin', 'Pasaje', '22222224-9', 'sep', now(), 'v1')$$,
  '23502', 'null value in column "flights_funding" of relation "pasantias_intake_participants" violates not-null constraint',
  'D1: flights_funding has no default: omitting it is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    flights_funding, acknowledged_at, notice_version)
  VALUES ('99114000-0000-4000-8000-0000000000a8', gen_random_uuid(), 'Sin', 'Estadia', '22222225-7', 'sep', now(), 'v1')$$,
  '23502', 'null value in column "lodging_funding" of relation "pasantias_intake_participants" violates not-null constraint',
  'D1: lodging_funding has no default: omitting it is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_rosters (cohort, program, school_name, token_hash)
  VALUES ('enero-2027', 'inspira', 'P114 Sin Plazo', pg_temp.h('noexp'))$$,
  '23502', 'null value in column "expires_at" of relation "pasantias_intake_rosters" violates not-null constraint',
  'D1: a roster without expires_at is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    flights_funding, lodging_funding, acknowledged_at, notice_version)
  VALUES ('99114000-0000-4000-8000-0000000000ff', gen_random_uuid(), 'Sin', 'Nomina', '22222226-5', 'sep', 'sep', now(), 'v1')$$,
  '23503', 'insert or update on table "pasantias_intake_participants" violates foreign key constraint "pasantias_intake_participants_roster_fkey"',
  'D1: a participant on an unknown roster is refused');
RESET ROLE;
SELECT throws_ok($$DELETE FROM public.pasantias_intake_rosters WHERE id = '99114000-0000-4000-8000-0000000000a2'$$,
  '23503', 'update or delete on table "pasantias_intake_rosters" violates foreign key constraint "pasantias_intake_participants_roster_fkey" on table "pasantias_intake_participants"',
  'D1: even the owner cannot delete a roster that has participants (ON DELETE RESTRICT)');

-- D2 — privileges, functions, policies, matrix --------------------------------
SELECT is(
  ARRAY(SELECT format('%s:%s', g.r, coalesce((SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
                       FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = t::regclass AND a.grantee = g.oid), '-'))
          FROM (VALUES (1, 'PUBLIC', 0::oid), (2, 'anon', 'anon'::regrole::oid), (3, 'authenticated', 'authenticated'::regrole::oid),
                       (4, 'service_role', 'service_role'::regrole::oid)) g(n, r, oid) ORDER BY g.n),
  ARRAY['PUBLIC:-', 'anon:-', 'authenticated:-', 'service_role:INSERT,SELECT,UPDATE'],
  format('D2: %s ACL is exactly service_role SELECT/INSERT/UPDATE; nothing for PUBLIC, anon, authenticated', t))
  FROM unnest(ARRAY['public.pasantias_intake_rosters', 'public.pasantias_intake_participants']) t;
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', l.lanname, p.provolatile, p.prosecdef, p.proconfig,
                 (SELECT string_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type, ',')
                    FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner))
     FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f::regprocedure),
  'plpgsql|v|f|{"search_path=\"\""}|service_role:EXECUTE',
  format('D2: %s is plpgsql VOLATILE SECURITY INVOKER, search_path pinned, EXECUTE for service_role only', f))
  FROM unnest(ARRAY['public.pasantias_intake_save_participant(text, uuid, integer, uuid, text, text, text, text, text, text, date, date, text, text[], text, text)',
                    'public.pasantias_intake_finalize(text, integer)']) f;
SELECT is(
  ARRAY(SELECT format('%s(%s) -> %s', p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid))
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'pasantias\_intake\_%' ORDER BY p.proname),
  ARRAY['pasantias_intake_finalize(p_token_hash text, p_expected_roster_version integer) -> TABLE(roster_status text, roster_version integer, submitted_at timestamp with time zone)',
        'pasantias_intake_save_participant(p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid, p_first_names text, p_last_names text, p_rut text, p_passport_number text, p_flights_funding text, p_lodging_funding text, p_arrival_date date, p_departure_date date, p_focus text, p_dietary_restrictions text[], p_dietary_other text, p_notice_version text) -> TABLE(participant_id uuid, participant_version integer, replayed boolean, roster_status text, roster_version integer)'],
  'D2: exactly two pasantias_intake_* functions, with the frozen argument lists and result shapes (no overloads)');
SELECT is(
  ARRAY(SELECT format('%s|%s|%s|%s|%s', tablename, policyname, permissive, cmd, roles) FROM pg_policies
         WHERE schemaname = 'public' AND tablename IN ('pasantias_intake_rosters', 'pasantias_intake_participants')
         ORDER BY tablename, policyname),
  ARRAY['pasantias_intake_participants|forced_password_change_guard|RESTRICTIVE|ALL|{authenticated}',
        'pasantias_intake_rosters|forced_password_change_guard|RESTRICTIVE|ALL|{authenticated}'],
  'D2: the only policy on either table is the restrictive forced_password_change_guard (no permissive policy)');

CREATE TEMP TABLE p114_m (n int, kind text, ident text, expected text[]);
INSERT INTO p114_m
SELECT n, kind, ident, CASE
    WHEN kind = 'service_role' THEN ARRAY[
      (SELECT count(*)::text FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P114 %'),
      (SELECT count(*)::text FROM public.pasantias_intake_participants p JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
        WHERE r.school_name LIKE 'P114 %'),
      'ok', 'ok', 'ok', 'ok', '42501', '42501', '42501', '22023', '22023']
    ELSE array_fill('42501'::text, ARRAY[11]) END
  FROM unnest(ARRAY['anon', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'service_role'],
              ARRAY[NULL, 'p114_admin', 'p114_consultor', 'p114_equipo_directivo', 'p114_lider_generacion', 'p114_lider_comunidad',
                    'p114_supervisor_de_red', 'p114_community_manager', 'p114_docente', 'p114_encargado_licitacion',
                    'p114_admin_inactive', 'p114_norole', 'p114_admin_flagged', NULL]) WITH ORDINALITY u(kind, ident, n);
SELECT is(pg_temp.matrix(kind, ident), expected,
          format('D2: %s -> [SELECT rosters, SELECT participants, INSERT r, INSERT p, UPDATE r, UPDATE p, DELETE r, DELETE p, TRUNCATE p, save, finalize]',
                 coalesce(ident, kind)))
  FROM p114_m ORDER BY n;

-- D3 — save semantics (service_role through the RPC) ---------------------------
SELECT is(pg_temp.sv('p1', '{"crid": "99114000-0000-4000-8000-0000000000d1"}'), '1|false|open|2',
  'D3: create on a live link -> participant v1, not replayed, roster open v2');
SELECT is(pg_temp.pr(pg_temp.pid('p1')),
  $$P114 Colegio A|Ana María|O'Higgins-Prueba|12345678-5|-|sep|colegio|-|-|-|{}|-|2026-10-v1|1|now|d1$$,
  'D3: stored exactly as given on the token''s own roster; optional fields NULL; acknowledged now');
SELECT is(pg_temp.sv('p1r', '{"crid": "99114000-0000-4000-8000-0000000000d1", "fn": "Cambiado", "rut": "1000001-7"}')
          || '|' || (pg_temp.pid('p1r') = pg_temp.pid('p1'))::text,
  '1|true|open|2|true', 'D3: same client_request_id -> replayed, same participant, roster not bumped');
SELECT is(concat_ws('|',
    (SELECT first_names FROM public.pasantias_intake_participants WHERE id = pg_temp.pid('p1')),
    (SELECT count(*) FROM public.pasantias_intake_participants WHERE roster_id = '99114000-0000-4000-8000-0000000000a1')::text,
    (SELECT version FROM public.pasantias_intake_rosters WHERE id = '99114000-0000-4000-8000-0000000000a1')::text),
  'Ana María|1|2', 'D3: the replay applied none of the retry''s changed fields and wrote nothing');
SELECT is(pg_temp.sv('p2', '{"crid": "99114000-0000-4000-8000-0000000000d2", "fn": "José", "ln": "Núñez", "rut": "1000005-K",
            "pp": "AB12345", "ad": "2027-01-17", "dd": "2027-01-29", "focus": "primer_ciclo", "diet": ["otra", "vegano"],
            "other": "Sin mariscos"}'),
  '1|false|open|3', 'D3: second participant (7-digit RUT with K, every optional field) -> roster v3');
SELECT is(pg_temp.pr(pg_temp.pid('p2')),
  'P114 Colegio A|José|Núñez|1000005-K|AB12345|sep|colegio|2027-01-17|2027-01-29|primer_ciclo|{otra,vegano}|Sin mariscos|2026-10-v1|1|now|d2',
  'D3: optional passport, dates, focus, multi-select dietary and Otra detail stored');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"crid": "99114000-0000-4000-8000-0000000000d3", "rut": "12345678-5"}')$$,
  '22023', 'pasantias_intake_save_participant: duplicate_rut', 'D3: create with a RUT already on the roster -> duplicate_rut');
SELECT is(concat_ws('|',
    (SELECT count(*) FROM public.pasantias_intake_participants WHERE roster_id = '99114000-0000-4000-8000-0000000000a1')::text,
    (SELECT version FROM public.pasantias_intake_rosters WHERE id = '99114000-0000-4000-8000-0000000000a1')::text,
    (SELECT count(*) FROM public.pasantias_intake_participants WHERE client_request_id = '99114000-0000-4000-8000-0000000000d3')::text),
  '2|3|0', 'D3: the duplicate RUT wrote nothing');

UPDATE public.pasantias_intake_participants SET acknowledged_at = '2026-10-01 00:00+00' WHERE id = pg_temp.pid('p1');
SELECT is(pg_temp.sv(NULL, '{"pt": "p1", "ev": 1, "fn": "Ana Sofía", "crid": "99114000-0000-4000-8000-0000000000d9"}'),
  '2|false|open|4', 'D3: update with the current version -> participant v2, roster v4');
SELECT is(pg_temp.pr(pg_temp.pid('p1')),
  $$P114 Colegio A|Ana Sofía|O'Higgins-Prueba|12345678-5|-|sep|colegio|-|-|-|{}|-|2026-10-v1|2|now|d1$$,
  'D3: update applied, acknowledgement re-stamped, client_request_id never rewritten');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"pt": "p1", "ev": 1, "fn": "Ana Vieja"}')$$,
  '22023', 'pasantias_intake_save_participant: stale_version', 'D3: update with an old version -> stale_version');
SELECT is(concat_ws('|',
    (SELECT first_names FROM public.pasantias_intake_participants WHERE id = pg_temp.pid('p1')),
    (SELECT version FROM public.pasantias_intake_participants WHERE id = pg_temp.pid('p1'))::text,
    (SELECT version FROM public.pasantias_intake_rosters WHERE id = '99114000-0000-4000-8000-0000000000a1')::text),
  'Ana Sofía|2|4', 'D3: the stale update overwrote nothing');
UPDATE public.pasantias_intake_participants SET acknowledged_at = '2026-10-01 00:00+00' WHERE id = pg_temp.pid('p1');
SELECT is(pg_temp.sv(NULL, '{"pt": "p1", "ev": 2, "fn": "Ana Sofía", "nv": "2026-11-v2"}'), '2|true|open|4',
  'D3: update with identical participant data -> replayed, no participant or roster bump');
SELECT is(pg_temp.pr(pg_temp.pid('p1')),
  $$P114 Colegio A|Ana Sofía|O'Higgins-Prueba|12345678-5|-|sep|colegio|-|-|-|{}|-|2026-10-v1|2|2026-10-01 00:00|d1$$,
  'D3: the no-op wrote nothing (notice version and acknowledgement untouched)');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"pt": "p1", "ev": 2, "fn": "Ana Sofía", "rut": "1000005-K"}')$$,
  '22023', 'pasantias_intake_save_participant: duplicate_rut', 'D3: update to another participant''s RUT -> duplicate_rut');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"pid": "99114000-0000-4000-8000-0000000000ff", "ev": 1}')$$,
  '22023', 'pasantias_intake_save_participant: unknown_participant', 'D3: update of a nonexistent id -> unknown_participant');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"pid": "99114000-0000-4000-8000-0000000000b1", "ev": 1, "rut": "11111111-1"}')$$,
  '22023', 'pasantias_intake_save_participant: unknown_participant',
  'D3: token A updating roster B''s participant (correct version) -> unknown_participant, not stale');
SELECT is(concat_ws('|',
    (SELECT first_names FROM public.pasantias_intake_participants WHERE id = '99114000-0000-4000-8000-0000000000b1'),
    (SELECT version FROM public.pasantias_intake_participants WHERE id = '99114000-0000-4000-8000-0000000000b1')::text,
    pg_temp.rs('99114000-0000-4000-8000-0000000000a2')),
  'Beto|1|open|1|-|-', 'D3: roster B and its participant are untouched by token A');
SELECT is(pg_temp.sv('p3', '{"crid": "99114000-0000-4000-8000-0000000000c1", "fn": "Carla", "rut": "1000001-7"}')
          || '|' || (pg_temp.pid('p3') <> '99114000-0000-4000-8000-0000000000b1')::text,
  '1|false|open|5|true', 'D3: roster B''s client_request_id is not a replay on roster A (lookup scoped to the token''s roster)');

-- D3 — finalize and reopen -----------------------------------------------------
SELECT throws_ok($$SELECT pg_temp.fin(pg_temp.h('A'), 4)$$,
  '22023', 'pasantias_intake_finalize: stale_version', 'D3: finalize an open roster with an old version -> stale_version');
SELECT is(pg_temp.fin(pg_temp.h('A'), 5), 'submitted|6|now', 'D3: finalize with the current version -> submitted v6 at now()');
SELECT is(pg_temp.rs('99114000-0000-4000-8000-0000000000a1'), 'submitted|6|now|now',
  'D3: submitted_at and last_submitted_at stamped');
UPDATE public.pasantias_intake_rosters SET submitted_at = '2026-11-01 10:00+00', last_submitted_at = '2026-11-01 10:00+00'
 WHERE id = '99114000-0000-4000-8000-0000000000a1';
SELECT is(pg_temp.fin(pg_temp.h('A'), 5) || '|' || pg_temp.fin(pg_temp.h('A'), 6) || '|' || pg_temp.rs('99114000-0000-4000-8000-0000000000a1'),
  'submitted|6|2026-11-01 10:00|submitted|6|2026-11-01 10:00|submitted|6|2026-11-01 10:00|2026-11-01 10:00',
  'D3: finalize replay (expected v5) and repeat (expected v6) return the roster as is: no bump, no re-stamp');
SELECT throws_ok($$SELECT pg_temp.fin(pg_temp.h('A'), 4)$$,
  '22023', 'pasantias_intake_finalize: stale_version', 'D3: finalize of a submitted roster from an older view -> stale_version');
SELECT is(pg_temp.sv(NULL, '{"pt": "p1", "ev": 2, "fn": "Ana Sofía"}') || '|' || pg_temp.rs('99114000-0000-4000-8000-0000000000a1'),
  '2|true|submitted|6|submitted|6|2026-11-01 10:00|2026-11-01 10:00', 'D3: a no-op update after submission does not reopen');
SELECT is(pg_temp.sv(NULL, '{"crid": "99114000-0000-4000-8000-0000000000d1"}') || '|' || pg_temp.rs('99114000-0000-4000-8000-0000000000a1'),
  '2|true|submitted|6|submitted|6|2026-11-01 10:00|2026-11-01 10:00', 'D3: a create replay after submission does not reopen');
SELECT is(pg_temp.sv(NULL, '{"pt": "p2", "ev": 1, "fn": "José", "ln": "Núñez", "rut": "1000005-K", "pp": "AB12345",
            "ad": "2027-01-17", "dd": "2027-01-29", "focus": "tercer_ciclo", "diet": ["otra", "vegano"], "other": "Sin mariscos"}'),
  '2|false|open|7', 'D3: a real edit after submission -> roster reopened (open v7)');
SELECT is(pg_temp.rs('99114000-0000-4000-8000-0000000000a1'), 'open|7|-|2026-11-01 10:00',
  'D3: reopening clears submitted_at and keeps last_submitted_at');
SELECT is(pg_temp.fin(pg_temp.h('A'), 7) || '|' || pg_temp.rs('99114000-0000-4000-8000-0000000000a1'),
  'submitted|8|now|submitted|8|now|now', 'D3: sending again -> submitted v8, last_submitted_at re-stamped');
SELECT is(pg_temp.sv('p4', '{"crid": "99114000-0000-4000-8000-0000000000d4", "fn": "Dora", "rut": "1000002-5"}')
          || '|' || pg_temp.rs('99114000-0000-4000-8000-0000000000a1'),
  '1|false|open|9|open|9|-|now', 'D3: a create after submission reopens too');

-- D3 — every refused input -> 22023, nothing written ---------------------------
CREATE TEMP TABLE p114_snap AS SELECT pg_temp.state() AS s;
SELECT throws_ok(format('SELECT pg_temp.sv(NULL, %L::jsonb)', '{"tok": "B", "rut": "1000004-1"}'::jsonb || o),
                 '22023', 'pasantias_intake_save_participant: ' || code, format('D3: save %s -> %s', d, code))
  FROM (VALUES
    ('participant id without expected version', '{"pid": "99114000-0000-4000-8000-0000000000b1"}'::jsonb, 'invalid_argument'),
    ('expected version without participant id', '{"ev": 1}', 'invalid_argument'),
    ('create without client request id', '{"crid": null}', 'invalid_argument'),
    ('expected version 0', '{"pid": "99114000-0000-4000-8000-0000000000b1", "ev": 0}', 'invalid_argument'),
    ('empty first names', '{"fn": ""}', 'invalid_first_names'),
    ('first names with a leading space', '{"fn": " Ana"}', 'invalid_first_names'),
    ('first names over 80', jsonb_build_object('fn', repeat('a', 81)), 'invalid_first_names'),
    ('first names with a control character', '{"fn": "Ana\u0007"}', 'invalid_first_names'),
    ('NULL last names', '{"ln": null}', 'invalid_last_names'),
    ('last names with a trailing tab', '{"ln": "Prueba\t"}', 'invalid_last_names'),
    ('RUT with a wrong check digit', '{"rut": "12345678-4"}', 'invalid_rut'),
    ('dotted RUT', '{"rut": "12.345.678-5"}', 'invalid_rut'),
    ('RUT 0-0', '{"rut": "0-0"}', 'invalid_rut'),
    ('RUT under 1,000,000', '{"rut": "999999-3"}', 'invalid_rut'),
    ('RUT with a leading zero', '{"rut": "01000005-K"}', 'invalid_rut'),
    ('RUT with a lowercase k', '{"rut": "1000005-k"}', 'invalid_rut'),
    ('RUT with a 9-digit body', '{"rut": "123456789-0"}', 'invalid_rut'),
    ('NULL RUT', '{"rut": null}', 'invalid_rut'),
    ('lowercase passport', '{"pp": "ab12345"}', 'invalid_passport_number'),
    ('passport with a hyphen', '{"pp": "AB-12345"}', 'invalid_passport_number'),
    ('4-character passport', '{"pp": "A123"}', 'invalid_passport_number'),
    ('NULL flights funding (never defaulted)', '{"ff": null}', 'invalid_flights_funding'),
    ('flights funding SEP', '{"ff": "SEP"}', 'invalid_flights_funding'),
    ('NULL lodging funding (never defaulted)', '{"lf": null}', 'invalid_lodging_funding'),
    ('lodging funding fne', '{"lf": "fne"}', 'invalid_lodging_funding'),
    ('departure equal to arrival', '{"ad": "2027-01-17", "dd": "2027-01-17"}', 'invalid_dates'),
    ('departure before arrival', '{"ad": "2027-01-17", "dd": "2027-01-11"}', 'invalid_dates'),
    ('unknown focus', '{"focus": "media"}', 'invalid_focus'),
    ('Otra without a detail', '{"diet": ["otra"]}', 'invalid_dietary'),
    ('unsorted dietary codes', '{"diet": ["vegano", "otra"], "other": "x"}', 'invalid_dietary'),
    ('repeated dietary code', '{"diet": ["vegano", "vegano"]}', 'invalid_dietary'),
    ('unknown dietary code', '{"diet": ["kosher"]}', 'invalid_dietary'),
    ('NULL dietary element', '{"diet": [null]}', 'invalid_dietary'),
    ('NULL dietary array', '{"diet": null}', 'invalid_dietary'),
    ('two-dimensional dietary array', '{"diet_raw": "{{vegano}}"}', 'invalid_dietary'),
    ('dietary detail without Otra', '{"other": "x"}', 'invalid_dietary'),
    ('dietary detail with a leading space', '{"diet": ["otra"], "other": " x"}', 'invalid_dietary'),
    ('dietary detail over 200', jsonb_build_object('diet', jsonb_build_array('otra'), 'other', repeat('a', 201)), 'invalid_dietary'),
    ('empty dietary detail', '{"diet": ["otra"], "other": ""}', 'invalid_dietary'),
    ('NULL notice version', '{"nv": null}', 'invalid_notice_version'),
    ('notice version over 64', jsonb_build_object('nv', repeat('v', 65)), 'invalid_notice_version'),
    ('malformed token hash', '{"hash": "XYZ"}', 'link_unavailable'),
    ('uppercase token hash', jsonb_build_object('hash', upper(pg_temp.h('B'))), 'link_unavailable'),
    ('NULL token hash', '{"hash": null}', 'link_unavailable'),
    ('unknown token', '{"tok": "nope"}', 'link_unavailable'),
    ('create on a revoked link', '{"tok": "REV"}', 'link_unavailable'),
    ('create on an expired link', '{"tok": "EXP"}', 'link_unavailable'),
    ('create on a link expiring exactly now', '{"tok": "EXP0"}', 'link_unavailable'),
    ('update on a revoked link (own participant, correct version)',
     '{"tok": "REV", "pid": "99114000-0000-4000-8000-0000000000b3", "ev": 1, "rut": "11111111-1", "fn": "Rita Nueva"}', 'link_unavailable')
  ) v(d, o, code);
SELECT throws_ok(q, '22023', 'pasantias_intake_finalize: ' || code, format('D3: finalize %s -> %s', d, code))
  FROM (VALUES
    ('NULL expected roster version', 'SELECT pg_temp.fin(pg_temp.h(''B''), NULL)', 'invalid_argument'),
    ('expected roster version 0', 'SELECT pg_temp.fin(pg_temp.h(''B''), 0)', 'invalid_argument'),
    ('malformed token hash', 'SELECT pg_temp.fin(''XYZ'', 1)', 'link_unavailable'),
    ('NULL token hash', 'SELECT pg_temp.fin(NULL, 1)', 'link_unavailable'),
    ('unknown token', 'SELECT pg_temp.fin(pg_temp.h(''nope''), 1)', 'link_unavailable'),
    ('revoked link (roster has a participant)', 'SELECT pg_temp.fin(pg_temp.h(''REV''), 1)', 'link_unavailable'),
    ('expired link', 'SELECT pg_temp.fin(pg_temp.h(''EXP''), 1)', 'link_unavailable'),
    ('link expiring exactly now', 'SELECT pg_temp.fin(pg_temp.h(''EXP0''), 1)', 'link_unavailable')
  ) v(d, q, code);
SELECT is(pg_temp.state(), (SELECT s FROM p114_snap), 'D3: no refused save or finalize wrote any roster or participant');

-- D3 — rotation and revocation are honoured by the token predicate -------------
UPDATE public.pasantias_intake_rosters SET token_hash = pg_temp.h('A2') WHERE id = '99114000-0000-4000-8000-0000000000a1';
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"rut": "1000003-3"}')$$,
  '22023', 'pasantias_intake_save_participant: link_unavailable', 'D3: after rotation the old link is refused at once');
SELECT is(pg_temp.sv(NULL, '{"tok": "A2", "fn": "Eva", "rut": "1000003-3"}'), '1|false|open|10',
  'D3: after rotation the new link reaches the same roster');
UPDATE public.pasantias_intake_rosters SET revoked_at = now() WHERE id = '99114000-0000-4000-8000-0000000000a1';
SELECT throws_ok($$SELECT pg_temp.fin(pg_temp.h('A2'), 10)$$,
  '22023', 'pasantias_intake_finalize: link_unavailable', 'D3: after revocation finalize is refused');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"tok": "A2", "rut": "1000004-1"}')$$,
  '22023', 'pasantias_intake_save_participant: link_unavailable', 'D3: after revocation save is refused');
SELECT is(pg_temp.rs('99114000-0000-4000-8000-0000000000a1') || '|'
          || pg_temp.q($$SELECT count(*) FROM public.pasantias_intake_participants WHERE roster_id = '99114000-0000-4000-8000-0000000000a1'$$),
  'open|10|-|now|5', 'D3: the revoked roster is unchanged by the refused calls');

-- D3 — 60-person cap ----------------------------------------------------------
INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    flights_funding, lodging_funding, acknowledged_at, notice_version)
SELECT '99114000-0000-4000-8000-0000000000a6', gen_random_uuid(), 'Cupo', 'Prueba ' || g, (10000000 + g)::text || '-0',
       'sep', 'sep', now(), 'v1'
  FROM generate_series(1, 59) g;
SELECT is(pg_temp.sv('cap60', '{"tok": "CAP", "crid": "99114000-0000-4000-8000-0000000000e1"}'), '1|false|open|2',
  'D3: the 60th participant is accepted (a RUT used on another roster is fine)');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"tok": "CAP", "rut": "1000001-7"}')$$,
  '22023', 'pasantias_intake_save_participant: roster_full', 'D3: the 61st participant -> roster_full');
SELECT is(pg_temp.sv(NULL, '{"tok": "CAP", "crid": "99114000-0000-4000-8000-0000000000e1", "rut": "1000009-2"}'), '1|true|open|2',
  'D3: a replay of the 60th still answers while the roster is full');
SELECT is((SELECT count(*)::int FROM public.pasantias_intake_participants WHERE roster_id = '99114000-0000-4000-8000-0000000000a6'), 60,
  'D3: the capped roster holds exactly 60');

-- D3 — empty roster -------------------------------------------------------------
SELECT throws_ok($$SELECT pg_temp.fin(pg_temp.h('EMPTY'), 1)$$,
  '22023', 'pasantias_intake_finalize: empty_roster', 'D3: finalize with no participants -> empty_roster');
SELECT is(pg_temp.rs('99114000-0000-4000-8000-0000000000a7'), 'open|1|-|-', 'D3: the empty roster stays open v1');

SELECT * FROM finish();
ROLLBACK;
