-- =============================================================================
-- 115-pasantias-nomina-school-funding-focus.sql — PASANT-PARTICIPANT-INTAKE-CORRECTIONS-DB-01
-- Covers migration 20261030120000_pasantias_nomina_school_funding_focus.sql
-- against docs/plan/evidence/pasant-intake/db-contract-corrections-01.md
-- (FIRST corrections review §3, §6, §8; C1-C5, C8-C9):
--   E1 structure: exact columns/constraints/triggers of the two new tables,
--      funding NOT NULL without default, all_levels NOT NULL without default,
--      FKs ON DELETE RESTRICT, old participants focus CHECK still refuses todos
--   E2 access: exact ACLs (service_role SELECT/INSERT/UPDATE only), SECURITY
--      INVOKER + search_path = '', frozen signatures, only the restrictive
--      password guard; anon + 12 personas denied everything; service_role allowed
--   E3 behaviour: school funding save (first, replay under any version, stale,
--      real change, two programs independent, refusals with nothing written,
--      rotation), I1 copy to participants created before and after, participant
--      save without funding (school_data_missing ordering, todos / level / NULL
--      round trips with all_levels false for NULL, refused focus values, DB-01
--      guards), 60-person cap, reopen on funding change, old finalize stale
--      after a funding change, invariants I1 and I2
-- pgTAP 114 is untouched and still pins the DB-01 objects. Cross-session races
-- are proven by the app unit's Playwright Promise.all journeys. Synthetic data
-- only (*@qa.local.test, fixed UUIDs 99115000-...). Rolls back.
-- =============================================================================

BEGIN;

SELECT plan(140);

CREATE TEMP TABLE p115_ids (tag text PRIMARY KEY, id uuid NOT NULL);

-- Helpers ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.h(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to('p115-' || t, 'UTF8')), 'hex') $$;
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
    $q$SELECT count(*)::text FROM public.pasantias_nomina_school_funding f
        WHERE f.roster_id IN (SELECT r.id FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P115 %')$q$,
    $q$SELECT count(*)::text FROM public.pasantias_nomina_participant_focus f
        WHERE f.participant_id IN (SELECT p.id FROM public.pasantias_intake_participants p
                                     JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id WHERE r.school_name LIKE 'P115 %')$q$,
    $q$INSERT INTO public.pasantias_nomina_school_funding (roster_id, flights_funding, lodging_funding)
       VALUES ('99115000-0000-4000-8000-0000000000a6', 'sep', 'sep')$q$,
    $q$INSERT INTO public.pasantias_nomina_participant_focus (participant_id, all_levels)
       VALUES ('99115000-0000-4000-8000-0000000000b6', false)$q$,
    $q$UPDATE public.pasantias_nomina_school_funding SET version = version WHERE roster_id = '99115000-0000-4000-8000-0000000000a4'$q$,
    $q$UPDATE public.pasantias_nomina_participant_focus SET all_levels = all_levels WHERE participant_id = '99115000-0000-4000-8000-0000000000b7'$q$,
    $q$DELETE FROM public.pasantias_nomina_school_funding WHERE roster_id = '99115000-0000-4000-8000-0000000000a4'$q$,
    $q$DELETE FROM public.pasantias_nomina_participant_focus WHERE participant_id = '99115000-0000-4000-8000-0000000000b7'$q$,
    'TRUNCATE public.pasantias_nomina_school_funding',
    'TRUNCATE public.pasantias_nomina_participant_focus',
    $q$SELECT count(*)::text FROM public.pasantias_nomina_save_school_funding('not-a-hash', NULL::integer, 'sep', 'sep')$q$,
    $q$SELECT count(*)::text FROM public.pasantias_nomina_save_participant('not-a-hash', NULL::uuid, NULL::integer,
       '99115000-0000-4000-8000-0000000000ee'::uuid, 'Ana', 'Prueba', '12345678-5', NULL::text,
       NULL::date, NULL::date, NULL::text, '{}'::text[], NULL::text, 'v1')$q$]) WITH ORDINALITY u(q, n);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- call(o): a pasantias_nomina_save_participant call (as SQL text) from a jsonb
-- overlay on a valid base:
--   tok roster tag (hashed) | hash raw hash | pid raw id | pt tagged id | ev | crid
--   (absent -> fresh uuid) | fn ln rut pp ad dd focus | diet json array |
--   diet_raw text[] literal | other | nv
CREATE FUNCTION pg_temp.call(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT * FROM public.pasantias_nomina_save_participant(%s, %s::uuid, %s::integer, %s::uuid, %s, %s, %s, '
                '%s, %s::date, %s::date, %s, %s::text[], %s, %s)',
    quote_nullable(CASE WHEN b ? 'hash' THEN b->>'hash' ELSE pg_temp.h(b->>'tok') END),
    quote_nullable(coalesce(b->>'pid', (SELECT t.id::text FROM p115_ids t WHERE t.tag = b->>'pt'))),
    quote_nullable(b->>'ev'),
    quote_nullable(CASE WHEN b ? 'crid' THEN b->>'crid' ELSE gen_random_uuid()::text END),
    quote_nullable(b->>'fn'), quote_nullable(b->>'ln'), quote_nullable(b->>'rut'), quote_nullable(b->>'pp'),
    quote_nullable(b->>'ad'), quote_nullable(b->>'dd'), quote_nullable(b->>'focus'),
    quote_nullable(CASE WHEN b ? 'diet_raw' THEN b->>'diet_raw'
                        WHEN jsonb_typeof(b->'diet') = 'array'
                          THEN ARRAY(SELECT e.v FROM jsonb_array_elements_text(b->'diet') WITH ORDINALITY e(v, n) ORDER BY e.n)::text END),
    quote_nullable(b->>'other'), quote_nullable(b->>'nv'))
  FROM (SELECT '{"tok": "A", "fn": "Ana María", "ln": "O''Higgins-Prueba", "rut": "12345678-5",
                 "diet": [], "nv": "2026-10-v1"}'::jsonb || o AS b) x
$$;
-- sv(tag, o): runs call(o) as service_role; records the participant id under tag.
CREATE FUNCTION pg_temp.sv(p_tag text, o jsonb) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v_sql text := pg_temp.call(o); x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  EXECUTE v_sql INTO x;
  PERFORM pg_temp.unact();
  IF p_tag IS NOT NULL THEN INSERT INTO p115_ids VALUES (p_tag, x.participant_id); END IF;
  RETURN concat_ws('|', x.participant_version::text, x.replayed::text, x.roster_status, x.roster_version::text);
END $$;
-- fund(hash, expected, flights, lodging): the school funding save as service_role.
CREATE FUNCTION pg_temp.fund(p_hash text, p_ev integer, p_ff text, p_lf text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  SELECT * INTO x FROM public.pasantias_nomina_save_school_funding(p_hash, p_ev, p_ff, p_lf);
  PERFORM pg_temp.unact();
  RETURN concat_ws('|', x.funding_flights, x.funding_lodging, x.funding_version::text, x.replayed::text,
                   x.roster_status, x.roster_version::text);
END $$;
-- fin(hash, expected): the UNCHANGED DB-01 finalize as service_role.
CREATE FUNCTION pg_temp.fin(p_hash text, p_ev integer) RETURNS text LANGUAGE plpgsql AS $$
DECLARE x record;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  SELECT * INTO x FROM public.pasantias_intake_finalize(p_hash, p_ev);
  PERFORM pg_temp.unact();
  RETURN concat_ws('|', x.roster_status, x.roster_version::text, pg_temp.ts(x.submitted_at));
END $$;
CREATE FUNCTION pg_temp.fins(o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('INSERT INTO public.pasantias_nomina_school_funding (roster_id, flights_funding, lodging_funding, version) '
                'VALUES (%s::uuid, %s, %s, %s::integer)',
    quote_nullable(b->>'roster'), quote_nullable(b->>'ff'), quote_nullable(b->>'lf'), quote_nullable(b->>'version'))
  FROM (SELECT '{"roster": "99115000-0000-4000-8000-0000000000a9", "ff": "sep", "lf": "sep", "version": 1}'::jsonb || o AS b) x
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
  SELECT t.id FROM p115_ids t WHERE t.tag = p_tag $$;
-- pf(id): stored focus | all_levels ('none' = no focus row) | effective focus | funding copy.
CREATE FUNCTION pg_temp.pf(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', coalesce(p.focus, '-'), coalesce(f.all_levels::text, 'none'),
                   coalesce(CASE WHEN f.all_levels THEN 'todos' ELSE p.focus END, '-'),
                   p.flights_funding, p.lodging_funding)
    FROM public.pasantias_intake_participants p
    LEFT JOIN public.pasantias_nomina_participant_focus f ON f.participant_id = p.id
   WHERE p.id = p_id $$;
CREATE FUNCTION pg_temp.pr(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', r.school_name, x.first_names, x.last_names, x.rut, coalesce(x.passport_number, '-'),
                   coalesce(to_char(x.arrival_date, 'YYYY-MM-DD'), '-'), coalesce(to_char(x.departure_date, 'YYYY-MM-DD'), '-'),
                   coalesce(x.focus, '-'), coalesce(f.all_levels::text, 'none'), x.dietary_restrictions::text,
                   coalesce(x.dietary_other, '-'), x.notice_version, x.version::text, pg_temp.ts(x.acknowledged_at),
                   right(x.client_request_id::text, 2), x.flights_funding, x.lodging_funding)
    FROM public.pasantias_intake_participants x
    JOIN public.pasantias_intake_rosters r ON r.id = x.roster_id
    LEFT JOIN public.pasantias_nomina_participant_focus f ON f.participant_id = x.id
   WHERE x.id = p_id $$;
CREATE FUNCTION pg_temp.rs(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('|', r.status, r.version::text, pg_temp.ts(r.submitted_at), pg_temp.ts(r.last_submitted_at))
    FROM public.pasantias_intake_rosters r WHERE r.id = p_id $$;
CREATE FUNCTION pg_temp.fr(p_id uuid) RETURNS text LANGUAGE sql AS $$
  SELECT coalesce((SELECT concat_ws('|', f.flights_funding, f.lodging_funding, f.version::text)
                     FROM public.pasantias_nomina_school_funding f WHERE f.roster_id = p_id), 'none') $$;
-- state(): every fixture roster, participant, funding row and focus row.
CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE sql AS $$
  SELECT concat_ws('/',
    (SELECT string_agg(concat_ws(':', r.school_name, r.program, r.status, r.version::text), ',' ORDER BY r.id)
       FROM public.pasantias_intake_rosters r WHERE r.school_name LIKE 'P115 %'),
    (SELECT string_agg(concat_ws(':', p.id::text, p.version::text, p.rut, p.flights_funding, p.lodging_funding,
                                 coalesce(p.focus, '-')), ',' ORDER BY p.id)
       FROM public.pasantias_intake_participants p JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
      WHERE r.school_name LIKE 'P115 %'),
    (SELECT string_agg(concat_ws(':', f.roster_id::text, f.flights_funding, f.lodging_funding, f.version::text), ',' ORDER BY f.roster_id)
       FROM public.pasantias_nomina_school_funding f JOIN public.pasantias_intake_rosters r ON r.id = f.roster_id
      WHERE r.school_name LIKE 'P115 %'),
    (SELECT string_agg(concat_ws(':', fo.participant_id::text, fo.all_levels::text), ',' ORDER BY fo.participant_id)
       FROM public.pasantias_nomina_participant_focus fo
       JOIN public.pasantias_intake_participants p ON p.id = fo.participant_id
       JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
      WHERE r.school_name LIKE 'P115 %')) $$;

-- Fixtures (postgres) -----------------------------------------------------------
--   a1 A    inspira          'P115 Colegio Uno'   open, no funding, empty (main journey)
--   a2 M    mirada-profunda  'P115 Colegio Uno'   same school, other program (independent)
--   a3 PRE  participants written before any funding (PRE01 v1 sep/sep, PRE02 v3 colegio/sep)
--   a4 B    funding colegio/colegio, participant B01 (cross-roster target)
--   a5 REV  revoked; funding sep/sep; participant REV01
--   a6 EXP  expired 1 min ago; no funding
--   a7 NOF  no funding; participant NOF01 (school_data_missing ordering)
--   a8 CAP  funding sep/sep; 59 participants (cap)
--   a9 CHK  direct-write funding CHECKs | aa CHKP participant CHKP01 for focus-row CHECKs
-- Direct-insert participants are named 'Fixture' / 'Cupo'; every other
-- participant is written by pasantias_nomina_save_participant.
DO $fx$
DECLARE
  v_t text; v_id uuid;
BEGIN
  INSERT INTO public.schools (id, name) VALUES (9115, 'P115 QA School') ON CONFLICT (id) DO NOTHING;
  FOREACH v_t IN ARRAY ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
      'admin_inactive', 'norole', 'admin_flagged'] LOOP
    v_id := tests.create_supabase_user('p115_' || v_t, 'p115-' || replace(v_t, '_', '-') || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, school_id, must_change_password)
    VALUES (v_id, 'p115-' || replace(v_t, '_', '-') || '@qa.local.test', 'P115 ' || v_t, 'approved', 9115,
            v_t = 'admin_flagged');
    IF v_t = 'admin' THEN
      INSERT INTO public.redes_de_colegios (id, nombre, created_by)
      VALUES ('99115000-0000-4000-8000-0000000000ad', 'P115 QA Red', v_id);
    END IF;
  END LOOP;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active, red_id)
  SELECT tests.get_supabase_uid('p115_' || t), t::public.user_role_type, CASE WHEN t <> 'admin' THEN 9115 END, true,
         CASE WHEN t = 'supervisor_de_red' THEN '99115000-0000-4000-8000-0000000000ad'::uuid END
    FROM unnest(ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
                      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion']) t;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
    (tests.get_supabase_uid('p115_admin_inactive'), 'admin', NULL, false),
    (tests.get_supabase_uid('p115_admin_flagged'), 'admin', NULL, true);

  INSERT INTO public.pasantias_intake_rosters (id, cohort, program, school_name, token_hash, expires_at, revoked_at) VALUES
    ('99115000-0000-4000-8000-0000000000a1', 'enero-2027', 'inspira', 'P115 Colegio Uno', pg_temp.h('A'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a2', 'enero-2027', 'mirada-profunda', 'P115 Colegio Uno', pg_temp.h('M'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a3', 'enero-2027', 'inspira', 'P115 Colegio Previo', pg_temp.h('PRE'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a4', 'enero-2027', 'inspira', 'P115 Colegio Otro', pg_temp.h('B'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a5', 'enero-2027', 'inspira', 'P115 Colegio Revocado', pg_temp.h('REV'), now() + interval '30 days', now()),
    ('99115000-0000-4000-8000-0000000000a6', 'enero-2027', 'inspira', 'P115 Colegio Vencido', pg_temp.h('EXP'), now() - interval '1 minute', NULL),
    ('99115000-0000-4000-8000-0000000000a7', 'enero-2027', 'inspira', 'P115 Colegio Sin Datos', pg_temp.h('NOF'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a8', 'enero-2027', 'inspira', 'P115 Colegio Cupo', pg_temp.h('CAP'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000a9', 'enero-2027', 'inspira', 'P115 Colegio Check', pg_temp.h('CHK'), now() + interval '30 days', NULL),
    ('99115000-0000-4000-8000-0000000000aa', 'enero-2027', 'inspira', 'P115 Colegio Check P', pg_temp.h('CHKP'), now() + interval '30 days', NULL);
  INSERT INTO public.pasantias_nomina_school_funding (roster_id, flights_funding, lodging_funding) VALUES
    ('99115000-0000-4000-8000-0000000000a4', 'colegio', 'colegio'),
    ('99115000-0000-4000-8000-0000000000a5', 'sep', 'sep'),
    ('99115000-0000-4000-8000-0000000000a8', 'sep', 'sep');
  INSERT INTO public.pasantias_intake_participants (id, roster_id, client_request_id, first_names, last_names, rut,
      flights_funding, lodging_funding, acknowledged_at, notice_version, version) VALUES
    ('99115000-0000-4000-8000-0000000000b1', '99115000-0000-4000-8000-0000000000a4', '99115000-0000-4000-8000-0000000000c1',
     'Fixture', 'Prueba', '11111111-1', 'colegio', 'colegio', now(), '2026-10-v1', 1),
    ('99115000-0000-4000-8000-0000000000b3', '99115000-0000-4000-8000-0000000000a5', '99115000-0000-4000-8000-0000000000c3',
     'Fixture', 'Prueba', '11111111-1', 'sep', 'sep', now(), '2026-10-v1', 1),
    ('99115000-0000-4000-8000-0000000000b4', '99115000-0000-4000-8000-0000000000a3', '99115000-0000-4000-8000-0000000000c4',
     'Fixture', 'Prueba', '11111111-1', 'sep', 'sep', now(), '2026-10-v1', 1),
    ('99115000-0000-4000-8000-0000000000b5', '99115000-0000-4000-8000-0000000000a3', '99115000-0000-4000-8000-0000000000c5',
     'Fixture', 'Prueba', '22222222-2', 'colegio', 'sep', now(), '2026-10-v1', 3),
    ('99115000-0000-4000-8000-0000000000b6', '99115000-0000-4000-8000-0000000000a7', '99115000-0000-4000-8000-0000000000c6',
     'Fixture', 'Prueba', '11111111-1', 'sep', 'sep', now(), '2026-10-v1', 1),
    ('99115000-0000-4000-8000-0000000000b7', '99115000-0000-4000-8000-0000000000aa', '99115000-0000-4000-8000-0000000000c7',
     'Fixture', 'Prueba', '11111111-1', 'sep', 'sep', now(), '2026-10-v1', 1);
  INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
      flights_funding, lodging_funding, acknowledged_at, notice_version)
  SELECT '99115000-0000-4000-8000-0000000000a8', gen_random_uuid(), 'Cupo', 'Prueba ' || g, (10000000 + g)::text || '-0',
         'sep', 'sep', now(), 'v1'
    FROM generate_series(1, 59) g;
END
$fx$;

-- E1 — structure (24) -----------------------------------------------------------
SELECT has_table('public', 'pasantias_nomina_school_funding', 'E1: school funding table exists');
SELECT has_table('public', 'pasantias_nomina_participant_focus', 'E1: participant focus table exists');
SELECT tests.rls_enabled('public', 'pasantias_nomina_school_funding');
SELECT tests.rls_enabled('public', 'pasantias_nomina_participant_focus');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef,
                      coalesce(nullif(attgenerated::text, ''), '-'))
          FROM pg_attribute WHERE attrelid = 'public.pasantias_nomina_school_funding'::regclass AND attnum > 0 AND NOT attisdropped
         ORDER BY attnum),
  ARRAY['roster_id:uuid:t:f:-', 'flights_funding:text:t:f:-', 'lodging_funding:text:t:f:-', 'version:integer:t:t:-',
        'created_at:timestamp with time zone:t:t:-', 'updated_at:timestamp with time zone:t:t:-'],
  'E1: funding columns; Pasajes and Estadía NOT NULL with no default');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef,
                      coalesce(nullif(attgenerated::text, ''), '-'))
          FROM pg_attribute WHERE attrelid = 'public.pasantias_nomina_participant_focus'::regclass AND attnum > 0 AND NOT attisdropped
         ORDER BY attnum),
  ARRAY['participant_id:uuid:t:f:-', 'all_levels:boolean:t:f:-', 'created_at:timestamp with time zone:t:t:-',
        'updated_at:timestamp with time zone:t:t:-'],
  'E1: focus columns; all_levels NOT NULL with no default (never SQL NULL)');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_nomina_school_funding_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_nomina_school_funding'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['funding_check:CHECK', 'pkey:PRIMARY KEY (roster_id)',
        'roster_fkey:FOREIGN KEY (roster_id) REFERENCES pasantias_intake_rosters(id) ON DELETE RESTRICT', 'version_check:CHECK'],
  'E1: funding constraint set: one row per roster, FK ON DELETE RESTRICT');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_nomina_participant_focus_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_nomina_participant_focus'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['participant_fkey:FOREIGN KEY (participant_id) REFERENCES pasantias_intake_participants(id) ON DELETE RESTRICT',
        'pkey:PRIMARY KEY (participant_id)'],
  'E1: focus constraint set: one row per participant, FK ON DELETE RESTRICT');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', t.tgname, p.proname, t.tgtype) FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
         WHERE t.tgrelid IN ('public.pasantias_nomina_school_funding'::regclass, 'public.pasantias_nomina_participant_focus'::regclass)
           AND NOT t.tgisinternal ORDER BY t.tgname),
  ARRAY['trg_pasantias_nomina_participant_focus_updated_at:set_updated_at:19',
        'trg_pasantias_nomina_school_funding_updated_at:set_updated_at:19'],
  'E1: BEFORE UPDATE set_updated_at trigger on both new tables');

SET ROLE service_role;
SELECT throws_ok(pg_temp.fins(o), '23514',
  format('new row for relation "pasantias_nomina_school_funding" violates check constraint "pasantias_nomina_school_funding_%s"', c),
  format('E1: funding %s -> %s', d, c))
  FROM (VALUES
    ('Pasajes fne', '{"ff": "fne"}'::jsonb, 'funding_check'),
    ('Estadía SEP (uppercase)', '{"lf": "SEP"}', 'funding_check'),
    ('version 0', '{"version": 0}', 'version_check')
  ) v(d, o, c);
SELECT throws_ok($$INSERT INTO public.pasantias_nomina_school_funding (roster_id, lodging_funding)
  VALUES ('99115000-0000-4000-8000-0000000000a9', 'sep')$$,
  '23502', 'null value in column "flights_funding" of relation "pasantias_nomina_school_funding" violates not-null constraint',
  'E1: school Pasajes has no default: omitting it is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_nomina_school_funding (roster_id, flights_funding)
  VALUES ('99115000-0000-4000-8000-0000000000a9', 'sep')$$,
  '23502', 'null value in column "lodging_funding" of relation "pasantias_nomina_school_funding" violates not-null constraint',
  'E1: school Estadía has no default: omitting it is refused');
SELECT throws_ok(pg_temp.fins('{"roster": "99115000-0000-4000-8000-0000000000ff"}'), '23503',
  'insert or update on table "pasantias_nomina_school_funding" violates foreign key constraint "pasantias_nomina_school_funding_roster_fkey"',
  'E1: funding for an unknown roster is refused');
SELECT lives_ok(pg_temp.fins('{}'), 'E1: the base funding row is valid, so each refusal above isolates one constraint');
SELECT throws_ok(pg_temp.fins('{}'), '23505',
  'duplicate key value violates unique constraint "pasantias_nomina_school_funding_pkey"',
  'E1: a second funding row for the same roster is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_nomina_participant_focus (participant_id)
  VALUES ('99115000-0000-4000-8000-0000000000b7')$$,
  '23502', 'null value in column "all_levels" of relation "pasantias_nomina_participant_focus" violates not-null constraint',
  'E1: all_levels has no default and is never SQL NULL');
SELECT throws_ok($$INSERT INTO public.pasantias_nomina_participant_focus (participant_id, all_levels)
  VALUES ('99115000-0000-4000-8000-0000000000ff', false)$$,
  '23503', 'insert or update on table "pasantias_nomina_participant_focus" violates foreign key constraint "pasantias_nomina_participant_focus_participant_fkey"',
  'E1: a focus row for an unknown participant is refused');
SELECT lives_ok($$INSERT INTO public.pasantias_nomina_participant_focus (participant_id, all_levels)
  VALUES ('99115000-0000-4000-8000-0000000000b7', false)$$, 'E1: a valid focus row is accepted');
SELECT throws_ok($$INSERT INTO public.pasantias_nomina_participant_focus (participant_id, all_levels)
  VALUES ('99115000-0000-4000-8000-0000000000b7', true)$$,
  '23505', 'duplicate key value violates unique constraint "pasantias_nomina_participant_focus_pkey"',
  'E1: a second focus row for the same participant is refused');
SELECT throws_ok($$INSERT INTO public.pasantias_intake_participants (roster_id, client_request_id, first_names, last_names, rut,
    flights_funding, lodging_funding, focus, acknowledged_at, notice_version)
  VALUES ('99115000-0000-4000-8000-0000000000aa', gen_random_uuid(), 'Fixture', 'Todos', '22222222-2', 'sep', 'sep', 'todos', now(), 'v1')$$,
  '23514', 'new row for relation "pasantias_intake_participants" violates check constraint "pasantias_intake_participants_focus_check"',
  'E1: the DB-01 focus CHECK is unchanged (todos lives only in all_levels)');
RESET ROLE;
SELECT throws_ok($$DELETE FROM public.pasantias_intake_rosters WHERE id = '99115000-0000-4000-8000-0000000000a9'$$,
  '23503', 'update or delete on table "pasantias_intake_rosters" violates foreign key constraint "pasantias_nomina_school_funding_roster_fkey" on table "pasantias_nomina_school_funding"',
  'E1: even the owner cannot delete a roster that has school funding (ON DELETE RESTRICT)');
SELECT throws_ok($$DELETE FROM public.pasantias_intake_participants WHERE id = '99115000-0000-4000-8000-0000000000b7'$$,
  '23503', 'update or delete on table "pasantias_intake_participants" violates foreign key constraint "pasantias_nomina_participant_focus_participant_fkey" on table "pasantias_nomina_participant_focus"',
  'E1: even the owner cannot delete a participant that has a focus row (ON DELETE RESTRICT)');

-- E2 — privileges, functions, policies, matrix (20) -----------------------------
SELECT is(
  ARRAY(SELECT format('%s:%s', g.r, coalesce((SELECT string_agg(a.privilege_type, ',' ORDER BY a.privilege_type)
                       FROM pg_class c, aclexplode(c.relacl) a WHERE c.oid = t::regclass AND a.grantee = g.oid), '-'))
          FROM (VALUES (1, 'PUBLIC', 0::oid), (2, 'anon', 'anon'::regrole::oid), (3, 'authenticated', 'authenticated'::regrole::oid),
                       (4, 'service_role', 'service_role'::regrole::oid)) g(n, r, oid) ORDER BY g.n),
  ARRAY['PUBLIC:-', 'anon:-', 'authenticated:-', 'service_role:INSERT,SELECT,UPDATE'],
  format('E2: %s ACL is exactly service_role SELECT/INSERT/UPDATE (no DELETE/TRUNCATE); nothing for PUBLIC, anon, authenticated', t))
  FROM unnest(ARRAY['public.pasantias_nomina_school_funding', 'public.pasantias_nomina_participant_focus']) t;
SELECT is(
  (SELECT format('%s|%s|%s|%s|%s', l.lanname, p.provolatile, p.prosecdef, p.proconfig,
                 (SELECT string_agg(CASE a.grantee WHEN 0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' || a.privilege_type, ',')
                    FROM aclexplode(p.proacl) a WHERE a.grantee <> p.proowner))
     FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang WHERE p.oid = f::regprocedure),
  'plpgsql|v|f|{"search_path=\"\""}|service_role:EXECUTE',
  format('E2: %s is plpgsql VOLATILE SECURITY INVOKER, search_path pinned, EXECUTE for service_role only', f))
  FROM unnest(ARRAY['public.pasantias_nomina_save_school_funding(text, integer, text, text)',
                    'public.pasantias_nomina_save_participant(text, uuid, integer, uuid, text, text, text, text, date, date, text, text[], text, text)']) f;
SELECT is(
  ARRAY(SELECT format('%s(%s) -> %s', p.proname, pg_get_function_arguments(p.oid), pg_get_function_result(p.oid))
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'pasantias\_nomina\_%' ORDER BY p.proname),
  ARRAY['pasantias_nomina_save_participant(p_token_hash text, p_participant_id uuid, p_expected_version integer, p_client_request_id uuid, p_first_names text, p_last_names text, p_rut text, p_passport_number text, p_arrival_date date, p_departure_date date, p_focus text, p_dietary_restrictions text[], p_dietary_other text, p_notice_version text) -> TABLE(participant_id uuid, participant_version integer, replayed boolean, roster_status text, roster_version integer)',
        'pasantias_nomina_save_school_funding(p_token_hash text, p_expected_funding_version integer, p_flights_funding text, p_lodging_funding text) -> TABLE(funding_flights text, funding_lodging text, funding_version integer, replayed boolean, roster_status text, roster_version integer)'],
  'E2: exactly two pasantias_nomina_* functions, frozen argument lists and result shapes; no funding argument on the participant save');
SELECT is(
  ARRAY(SELECT format('%s|%s|%s|%s|%s', tablename, policyname, permissive, cmd, roles) FROM pg_policies
         WHERE schemaname = 'public' AND tablename IN ('pasantias_nomina_school_funding', 'pasantias_nomina_participant_focus')
         ORDER BY tablename, policyname),
  ARRAY['pasantias_nomina_participant_focus|forced_password_change_guard|RESTRICTIVE|ALL|{authenticated}',
        'pasantias_nomina_school_funding|forced_password_change_guard|RESTRICTIVE|ALL|{authenticated}'],
  'E2: the only policy on either new table is the restrictive forced_password_change_guard');

CREATE TEMP TABLE p115_m (n int, kind text, ident text, expected text[]);
INSERT INTO p115_m
SELECT n, kind, ident, CASE
    WHEN kind = 'service_role' THEN ARRAY[
      (SELECT count(*)::text FROM public.pasantias_nomina_school_funding f
         JOIN public.pasantias_intake_rosters r ON r.id = f.roster_id WHERE r.school_name LIKE 'P115 %'),
      (SELECT count(*)::text FROM public.pasantias_nomina_participant_focus f
         JOIN public.pasantias_intake_participants p ON p.id = f.participant_id
         JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id WHERE r.school_name LIKE 'P115 %'),
      'ok', 'ok', 'ok', 'ok', '42501', '42501', '42501', '42501', '22023', '22023']
    ELSE array_fill('42501'::text, ARRAY[12]) END
  FROM unnest(ARRAY['anon', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'user', 'service_role'],
              ARRAY[NULL, 'p115_admin', 'p115_consultor', 'p115_equipo_directivo', 'p115_lider_generacion', 'p115_lider_comunidad',
                    'p115_supervisor_de_red', 'p115_community_manager', 'p115_docente', 'p115_encargado_licitacion',
                    'p115_admin_inactive', 'p115_norole', 'p115_admin_flagged', NULL]) WITH ORDINALITY u(kind, ident, n);
SELECT is(pg_temp.matrix(kind, ident), expected,
          format('E2: %s -> [SELECT funding, SELECT focus, INSERT f, INSERT fo, UPDATE f, UPDATE fo, DELETE f, DELETE fo, TRUNCATE f, TRUNCATE fo, save funding, save participant]',
                 coalesce(ident, kind)))
  FROM p115_m ORDER BY n;

-- E3 — school funding save (24) -------------------------------------------------
SELECT is(pg_temp.fund(pg_temp.h('A'), NULL, 'sep', 'colegio'), 'sep|colegio|1|false|open|2',
  'E3: first funding save (expected NULL) -> funding v1, roster bumped to v2');
SELECT is(pg_temp.fr('99115000-0000-4000-8000-0000000000a1') || '|' || pg_temp.rs('99115000-0000-4000-8000-0000000000a1'),
  'sep|colegio|1|open|2|-|-', 'E3: funding stored exactly; roster open v2');
SELECT is(pg_temp.fund(pg_temp.h('A'), NULL, 'sep', 'colegio'), 'sep|colegio|1|true|open|2',
  'E3: the same values again (double click, expected NULL) -> replayed, nothing bumped');
SELECT is(pg_temp.fund(pg_temp.h('A'), 1, 'sep', 'colegio') || '/' || pg_temp.fund(pg_temp.h('A'), 7, 'sep', 'colegio'),
  'sep|colegio|1|true|open|2/sep|colegio|1|true|open|2', 'E3: same values under any expected version -> replayed');
SELECT throws_ok($$SELECT pg_temp.fund(pg_temp.h('A'), NULL, 'colegio', 'colegio')$$,
  '22023', 'pasantias_nomina_save_school_funding: stale_version',
  'E3: different values expecting no row while one exists (competing first save) -> stale_version');
SELECT throws_ok($$SELECT pg_temp.fund(pg_temp.h('A'), 2, 'colegio', 'colegio')$$,
  '22023', 'pasantias_nomina_save_school_funding: stale_version', 'E3: different values with a wrong version -> stale_version');
SELECT is(pg_temp.fr('99115000-0000-4000-8000-0000000000a1') || '|' || pg_temp.rs('99115000-0000-4000-8000-0000000000a1'),
  'sep|colegio|1|open|2|-|-', 'E3: the stale saves wrote nothing');
SELECT is(pg_temp.fund(pg_temp.h('A'), 1, 'colegio', 'colegio'), 'colegio|colegio|2|false|open|3',
  'E3: a real change with the current version -> funding v2, roster v3');
SELECT is(pg_temp.fund(pg_temp.h('M'), NULL, 'colegio', 'sep'), 'colegio|sep|1|false|open|2',
  'E3: the same school in the other program saves its own answer');
SELECT is(pg_temp.fr('99115000-0000-4000-8000-0000000000a1') || '/' || pg_temp.fr('99115000-0000-4000-8000-0000000000a2'),
  'colegio|colegio|2/colegio|sep|1', 'E3: the two programs of one school stay independent');

CREATE TEMP TABLE p115_snap1 AS SELECT pg_temp.state() AS s;
SELECT throws_ok(q, '22023', 'pasantias_nomina_save_school_funding: ' || code, format('E3: funding %s -> %s', d, code))
  FROM (VALUES
    ('expected version 0', 'SELECT pg_temp.fund(pg_temp.h(''A''), 0, ''sep'', ''sep'')', 'invalid_argument'),
    ('expected version -1', 'SELECT pg_temp.fund(pg_temp.h(''A''), -1, ''sep'', ''sep'')', 'invalid_argument'),
    ('NULL Pasajes (never defaulted)', 'SELECT pg_temp.fund(pg_temp.h(''A''), 2, NULL, ''sep'')', 'invalid_flights_funding'),
    ('Pasajes SEP (uppercase)', 'SELECT pg_temp.fund(pg_temp.h(''A''), 2, ''SEP'', ''sep'')', 'invalid_flights_funding'),
    ('Pasajes fne', 'SELECT pg_temp.fund(pg_temp.h(''A''), 2, ''fne'', ''sep'')', 'invalid_flights_funding'),
    ('NULL Estadía (never defaulted)', 'SELECT pg_temp.fund(pg_temp.h(''A''), 2, ''sep'', NULL)', 'invalid_lodging_funding'),
    ('Estadía Colegio (capitalised)', 'SELECT pg_temp.fund(pg_temp.h(''A''), 2, ''sep'', ''Colegio'')', 'invalid_lodging_funding'),
    ('malformed token hash', 'SELECT pg_temp.fund(''XYZ'', NULL, ''sep'', ''sep'')', 'link_unavailable'),
    ('NULL token hash', 'SELECT pg_temp.fund(NULL, NULL, ''sep'', ''sep'')', 'link_unavailable'),
    ('unknown token', 'SELECT pg_temp.fund(pg_temp.h(''nope''), NULL, ''sep'', ''sep'')', 'link_unavailable'),
    ('revoked link (row exists, different values)', 'SELECT pg_temp.fund(pg_temp.h(''REV''), 1, ''colegio'', ''colegio'')', 'link_unavailable'),
    ('expired link', 'SELECT pg_temp.fund(pg_temp.h(''EXP''), NULL, ''sep'', ''sep'')', 'link_unavailable'),
    ('expected version 1 while no row exists', 'SELECT pg_temp.fund(pg_temp.h(''PRE''), 1, ''sep'', ''sep'')', 'stale_version')
  ) v(d, q, code);
SELECT is(pg_temp.state(), (SELECT s FROM p115_snap1), 'E3: no refused funding save wrote any roster, participant, funding or focus row');

-- E3 — I1: funding copied to participants written before and after (6) ---------
SELECT is(pg_temp.fund(pg_temp.h('PRE'), NULL, 'colegio', 'colegio'), 'colegio|colegio|1|false|open|2',
  'E3: first funding save on a roster that already has participants');
SELECT is((SELECT string_agg(concat_ws('|', p.flights_funding, p.lodging_funding, p.version::text), ',' ORDER BY p.rut)
             FROM public.pasantias_intake_participants p WHERE p.roster_id = '99115000-0000-4000-8000-0000000000a3'),
  'colegio|colegio|1,colegio|colegio|3', 'E3: I1 earlier participants now carry the school values; their versions are unchanged');
SELECT is(pg_temp.sv('pre3', '{"tok": "PRE", "crid": "99115000-0000-4000-8000-0000000000e3", "rut": "1000002-5"}'),
  '1|false|open|3', 'E3: a participant created after the funding save');
SELECT is(pg_temp.pf(pg_temp.pid('pre3')), '-|false|-|colegio|colegio',
  'E3: I1 the later participant got the school values; NULL focus stored as all_levels false');
SELECT is(pg_temp.fund(pg_temp.h('PRE'), 1, 'sep', 'colegio'), 'sep|colegio|2|false|open|4',
  'E3: changing the school funding');
SELECT is((SELECT string_agg(concat_ws('|', p.flights_funding, p.lodging_funding, p.version::text), ',' ORDER BY p.rut)
             FROM public.pasantias_intake_participants p WHERE p.roster_id = '99115000-0000-4000-8000-0000000000a3'),
  'sep|colegio|1,sep|colegio|1,sep|colegio|3', 'E3: I1 every participant follows the change; no participant version bumped');

-- E3 — participant save without per-person funding (48) ------------------------
SELECT is(pg_temp.sv('t1', '{"crid": "99115000-0000-4000-8000-0000000000d1", "focus": "todos"}'), '1|false|open|4',
  'E3: create with focus todos -> participant v1, roster v4');
SELECT is(pg_temp.pf(pg_temp.pid('t1')), '-|true|todos|colegio|colegio',
  'E3: I2 todos stores participants.focus NULL and all_levels true; funding copied from the school');
SELECT is(pg_temp.sv('n1', '{"crid": "99115000-0000-4000-8000-0000000000d2", "rut": "1000005-K"}'), '1|false|open|5',
  'E3: create with no focus (Sin indicar)');
SELECT is(pg_temp.pf(pg_temp.pid('n1')), '-|false|-|colegio|colegio', 'E3: NULL focus -> focus row with all_levels false');
SELECT is((SELECT f.all_levels FROM public.pasantias_nomina_participant_focus f WHERE f.participant_id = pg_temp.pid('n1')), false,
  'E3: NULL focus maps to boolean false, not SQL NULL');
SELECT is(pg_temp.sv('l1', '{"crid": "99115000-0000-4000-8000-0000000000d3", "fn": "José", "ln": "Núñez", "rut": "1000001-7",
            "pp": "AB12345", "ad": "2027-01-17", "dd": "2027-01-29", "focus": "infantil", "diet": ["otra", "vegano"],
            "other": "Sin mariscos"}'),
  '1|false|open|6', 'E3: create with a level and every optional field');
SELECT is(pg_temp.pr(pg_temp.pid('l1')),
  'P115 Colegio Uno|José|Núñez|1000001-7|AB12345|2027-01-17|2027-01-29|infantil|false|{otra,vegano}|Sin mariscos|2026-10-v1|1|now|d3|colegio|colegio',
  'E3: stored exactly as given, level in participants.focus, all_levels false, funding copied');
SELECT is(pg_temp.sv(NULL, '{"pt": "t1", "ev": 1, "focus": "segundo_ciclo"}'), '2|false|open|7', 'E3: Todos -> a level');
SELECT is(pg_temp.pf(pg_temp.pid('t1')), 'segundo_ciclo|false|segundo_ciclo|colegio|colegio', 'E3: the level stored, all_levels false');
SELECT is(pg_temp.sv(NULL, '{"pt": "t1", "ev": 2}'), '3|false|open|8', 'E3: a level -> Sin indicar');
SELECT is(pg_temp.pf(pg_temp.pid('t1')), '-|false|-|colegio|colegio', 'E3: Sin indicar stored as NULL with all_levels false');
SELECT is(pg_temp.sv(NULL, '{"pt": "t1", "ev": 3, "focus": "todos"}'), '4|false|open|9', 'E3: Sin indicar -> Todos');
SELECT is(pg_temp.pf(pg_temp.pid('t1')), '-|true|todos|colegio|colegio', 'E3: Todos stored again (I2)');
SELECT is(pg_temp.sv(NULL, '{"pt": "t1", "ev": 4, "focus": "todos"}'), '4|true|open|9',
  'E3: no-op with focus todos (compared as effective focus) -> replayed, no bump');
SELECT is(pg_temp.sv(NULL, '{"pt": "n1", "ev": 1, "rut": "1000005-K"}'), '1|true|open|9',
  'E3: no-op with NULL focus -> replayed, no bump');
SELECT is(pg_temp.sv(NULL, '{"crid": "99115000-0000-4000-8000-0000000000d1", "fn": "Cambiado", "focus": "infantil", "rut": "1000009-2"}')
          || '|' || pg_temp.pf(pg_temp.pid('t1'))
          || '|' || pg_temp.q($$SELECT first_names FROM public.pasantias_intake_participants WHERE client_request_id = '99115000-0000-4000-8000-0000000000d1'$$),
  '4|true|open|9|-|true|todos|colegio|colegio|Ana María',
  'E3: create replay returns the stored row; the retry''s name and focus are not applied');
SELECT is(pg_temp.sv('x1', '{"crid": "99115000-0000-4000-8000-0000000000c1", "rut": "1000003-3"}')
          || '|' || (pg_temp.pid('x1') <> '99115000-0000-4000-8000-0000000000b1')::text,
  '1|false|open|10|true', 'E3: roster B''s client_request_id is not a replay on roster A');

SELECT is(pg_temp.sv(NULL, '{"tok": "NOF", "crid": "99115000-0000-4000-8000-0000000000c6", "rut": "1000009-2"}'), '1|true|open|1',
  'E3: without school funding a create replay still answers (replay precedes school_data_missing)');
SELECT is(pg_temp.sv(NULL, '{"tok": "NOF", "pid": "99115000-0000-4000-8000-0000000000b6", "ev": 1, "fn": "Fixture",
            "ln": "Prueba", "rut": "11111111-1"}'), '1|true|open|1',
  'E3: without school funding an identical update is still a no-op (no-op precedes school_data_missing)');

CREATE TEMP TABLE p115_snap2 AS SELECT pg_temp.state() AS s;
SELECT throws_ok(format('SELECT pg_temp.sv(NULL, %L::jsonb)', '{"tok": "A", "rut": "1000004-1"}'::jsonb || o),
                 '22023', 'pasantias_nomina_save_participant: ' || code, format('E3: save %s -> %s', d, code))
  FROM (VALUES
    ('focus media', '{"focus": "media"}'::jsonb, 'invalid_focus'),
    ('focus Todos (capitalised)', '{"focus": "Todos"}', 'invalid_focus'),
    ('focus all', '{"focus": "all"}', 'invalid_focus'),
    ('participant id without expected version', '{"pid": "99115000-0000-4000-8000-0000000000b1"}', 'invalid_argument'),
    ('create without client request id', '{"crid": null}', 'invalid_argument'),
    ('empty first names', '{"fn": ""}', 'invalid_first_names'),
    ('NULL last names', '{"ln": null}', 'invalid_last_names'),
    ('RUT with a wrong check digit', '{"rut": "12345678-4"}', 'invalid_rut'),
    ('lowercase passport', '{"pp": "ab12345"}', 'invalid_passport_number'),
    ('departure equal to arrival', '{"ad": "2027-01-17", "dd": "2027-01-17"}', 'invalid_dates'),
    ('Otra without a detail', '{"diet": ["otra"]}', 'invalid_dietary'),
    ('unsorted dietary codes', '{"diet": ["vegano", "otra"], "other": "x"}', 'invalid_dietary'),
    ('NULL notice version', '{"nv": null}', 'invalid_notice_version'),
    ('malformed token hash', '{"hash": "XYZ"}', 'link_unavailable'),
    ('unknown token', '{"tok": "nope"}', 'link_unavailable'),
    ('create on a revoked link', '{"tok": "REV"}', 'link_unavailable'),
    ('create on an expired link', '{"tok": "EXP"}', 'link_unavailable'),
    ('update on a revoked link (own participant, correct version)',
     '{"tok": "REV", "pid": "99115000-0000-4000-8000-0000000000b3", "ev": 1, "fn": "Fixture Nueva"}', 'link_unavailable'),
    ('create with a RUT already on the roster', '{"rut": "12345678-5"}', 'duplicate_rut'),
    ('update to another participant''s RUT', '{"pt": "l1", "ev": 1, "rut": "12345678-5"}', 'duplicate_rut'),
    ('update of a nonexistent id', '{"pid": "99115000-0000-4000-8000-0000000000ff", "ev": 1}', 'unknown_participant'),
    ('token A updating roster B''s participant', '{"pid": "99115000-0000-4000-8000-0000000000b1", "ev": 1, "rut": "11111111-1"}', 'unknown_participant'),
    ('update with an old version', '{"pt": "t1", "ev": 1}', 'stale_version'),
    ('create without school funding', '{"tok": "NOF"}', 'school_data_missing'),
    ('create without school funding and a duplicate RUT (school check first)', '{"tok": "NOF", "rut": "11111111-1"}', 'school_data_missing'),
    ('real update without school funding', '{"tok": "NOF", "pid": "99115000-0000-4000-8000-0000000000b6", "ev": 1, "fn": "Fixture Nueva", "ln": "Prueba", "rut": "11111111-1"}', 'school_data_missing'),
    ('stale update without school funding (stale first)', '{"tok": "NOF", "pid": "99115000-0000-4000-8000-0000000000b6", "ev": 2, "fn": "Fixture Nueva"}', 'stale_version'),
    ('unknown id without school funding (unknown first)', '{"tok": "NOF", "pid": "99115000-0000-4000-8000-0000000000ff", "ev": 1}', 'unknown_participant')
  ) v(d, o, code);
SELECT is(pg_temp.state(), (SELECT s FROM p115_snap2), 'E3: no refused participant save wrote any roster, participant, funding or focus row');

-- E3 — 60-person cap (4) --------------------------------------------------------
SELECT is(pg_temp.sv('cap60', '{"tok": "CAP", "crid": "99115000-0000-4000-8000-0000000000e1"}'), '1|false|open|2',
  'E3: the 60th participant is accepted');
SELECT throws_ok($$SELECT pg_temp.sv(NULL, '{"tok": "CAP", "rut": "1000001-7"}')$$,
  '22023', 'pasantias_nomina_save_participant: roster_full', 'E3: the 61st participant -> roster_full');
SELECT is(pg_temp.sv(NULL, '{"tok": "CAP", "crid": "99115000-0000-4000-8000-0000000000e1", "rut": "1000009-2"}'), '1|true|open|2',
  'E3: a replay of the 60th still answers while the roster is full');
SELECT is(pg_temp.q($$SELECT count(*) FROM public.pasantias_intake_participants WHERE roster_id = '99115000-0000-4000-8000-0000000000a8'$$)
          || '|' || pg_temp.pf(pg_temp.pid('cap60')),
  '60|-|false|-|sep|sep', 'E3: the capped roster holds exactly 60; the 60th carries the school funding');

-- E3 — reopen on funding change; old finalize sees it (8) -----------------------
SELECT is(pg_temp.fin(pg_temp.h('A'), 10), 'submitted|11|now', 'E3: the unchanged finalize sends the roster (v11)');
SELECT is(pg_temp.fund(pg_temp.h('A'), 2, 'colegio', 'colegio'), 'colegio|colegio|2|true|submitted|11',
  'E3: a funding no-op after sending does not reopen');
SELECT is(pg_temp.fund(pg_temp.h('A'), 2, 'sep', 'colegio'), 'sep|colegio|3|false|open|12',
  'E3: a real funding change after sending reopens the roster (v12)');
SELECT is(pg_temp.rs('99115000-0000-4000-8000-0000000000a1') || '|'
          || pg_temp.q($$SELECT count(*) FROM public.pasantias_intake_participants
                          WHERE roster_id = '99115000-0000-4000-8000-0000000000a1'
                            AND (flights_funding, lodging_funding) IS DISTINCT FROM ('sep', 'colegio')$$),
  'open|12|-|now|0', 'E3: reopening clears submitted_at, keeps last_submitted_at; every participant follows the new funding');
SELECT throws_ok($$SELECT pg_temp.fin(pg_temp.h('A'), 11)$$,
  '22023', 'pasantias_intake_finalize: stale_version',
  'E3: finalize from a view taken before the funding change (old roster version) -> stale_version');
SELECT is(pg_temp.fin(pg_temp.h('A'), 12), 'submitted|13|now', 'E3: finalize with the current version sends again');
SELECT is(pg_temp.sv(NULL, '{"pt": "l1", "ev": 1, "fn": "José", "ln": "Núñez", "rut": "1000001-7", "pp": "AB12345",
            "ad": "2027-01-17", "dd": "2027-01-29", "focus": "todos", "diet": ["otra", "vegano"], "other": "Sin mariscos"}')
          || '|' || pg_temp.rs('99115000-0000-4000-8000-0000000000a1'),
  '2|false|open|14|open|14|-|now', 'E3: a real participant edit (level -> Todos) after sending reopens too');
SELECT is(pg_temp.pf(pg_temp.pid('l1')), '-|true|todos|sep|colegio',
  'E3: level -> Todos clears participants.focus (I2) and the funding copy is current');

-- E3 — rotation (3) -------------------------------------------------------------
UPDATE public.pasantias_intake_rosters SET token_hash = pg_temp.h('M2') WHERE id = '99115000-0000-4000-8000-0000000000a2';
SELECT throws_ok($$SELECT pg_temp.fund(pg_temp.h('M'), 1, 'sep', 'sep')$$,
  '22023', 'pasantias_nomina_save_school_funding: link_unavailable', 'E3: after rotation the old link cannot save funding');
SELECT is(pg_temp.fund(pg_temp.h('M2'), 1, 'sep', 'sep'), 'sep|sep|2|false|open|3',
  'E3: after rotation the new link saves funding on the same roster');
SELECT is(pg_temp.fr('99115000-0000-4000-8000-0000000000a1') || '/' || pg_temp.fr('99115000-0000-4000-8000-0000000000a2'),
  'sep|colegio|3/sep|sep|2', 'E3: the other program''s changes never touched roster A');

-- E3 — invariants over every fixture roster (3) ---------------------------------
SELECT is(
  (SELECT format('%s|%s', count(*) FILTER (WHERE (p.flights_funding, p.lodging_funding) IS DISTINCT FROM (f.flights_funding, f.lodging_funding)),
                 count(*))
     FROM public.pasantias_intake_participants p
     JOIN public.pasantias_nomina_school_funding f ON f.roster_id = p.roster_id
     JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
    WHERE r.school_name LIKE 'P115 %'),
  '0|69', 'E3: I1 no participant of a funded roster differs from its school funding (69 checked)');
SELECT is(
  (SELECT format('%s|%s', count(*) FILTER (WHERE p.focus IS NOT NULL), count(*))
     FROM public.pasantias_nomina_participant_focus fo
     JOIN public.pasantias_intake_participants p ON p.id = fo.participant_id
     JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
    WHERE r.school_name LIKE 'P115 %' AND fo.all_levels),
  '0|2', 'E3: I2 every all_levels row has participants.focus NULL (2 Todos rows checked)');
SELECT is(
  (SELECT format('%s|%s', count(*) FILTER (WHERE NOT EXISTS (SELECT 1 FROM public.pasantias_nomina_participant_focus fo
                                                               WHERE fo.participant_id = p.id)),
                 count(*))
     FROM public.pasantias_intake_participants p
     JOIN public.pasantias_intake_rosters r ON r.id = p.roster_id
    WHERE r.school_name LIKE 'P115 %' AND p.first_names NOT IN ('Fixture', 'Cupo')),
  '0|6', 'E3: every participant written by the new save has a focus row (6 checked)');

SELECT * FROM finish();
ROLLBACK;
