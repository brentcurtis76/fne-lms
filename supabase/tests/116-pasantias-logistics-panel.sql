-- =============================================================================
-- 116-pasantias-logistics-panel.sql — FNE's logistics panel for the enero-2027
-- Pasantías cohort. Covers migration 20261109210000_pasantias_logistics_panel.sql:
--   E1 structure: the four tables' exact columns and constraint sets, RLS on,
--      FKs ON DELETE RESTRICT, the private bucket (10 MB, four MIME types, no
--      storage.objects policy naming it)
--   E2 access: exact ACLs (service_role SELECT/INSERT/UPDATE; activity
--      SELECT/INSERT only), SECURITY INVOKER + search_path = '', only the
--      restrictive password guard; anon + 12 personas (active admin included)
--      denied every table operation and every function; service_role allowed,
--      with no DELETE anywhere and no UPDATE on activity
--   E3 behaviour: tracking save (first, replay under any version, stale, edit,
--      refusals with nothing written, notes never copied into the log), bulk
--      set (creates missing rows, skips equal ones, all-or-nothing on an
--      unknown id, limits), admin correction (changes + focus side row, roster
--      NOT reopened but version bumped, school acknowledgement untouched,
--      replay, stale, duplicate RUT per roster, every field refusal, works on a
--      revoked link), table CHECKs on direct writes
-- pgTAP 114 and 115 are untouched and still pin the intake objects. Synthetic
-- data only (*@qa.local.test, fixed UUIDs 99116000-...). Rolls back.
-- =============================================================================

BEGIN;

SELECT plan(94);

-- Helpers ---------------------------------------------------------------------
CREATE FUNCTION pg_temp.h(t text) RETURNS text LANGUAGE sql STABLE AS $$
  SELECT encode(sha256(convert_to('p116-' || t, 'UTF8')), 'hex') $$;
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
-- sr(q): runs q as service_role and KEEPS its effect; returns the single text
-- value, or '<SQLSTATE>:<message>' when it raised (nothing written then).
CREATE FUNCTION pg_temp.sr(q text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  PERFORM pg_temp.act('service_role', NULL);
  BEGIN
    EXECUTE q INTO v;
  EXCEPTION WHEN OTHERS THEN
    v := SQLSTATE || ':' || SQLERRM;
  END;
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- The 19 probes of the access matrix: 4 SELECT, 4 INSERT, 4 UPDATE, 4 DELETE, 3 functions.
CREATE FUNCTION pg_temp.matrix(p_kind text, p_ident text) RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE v text[];
BEGIN
  PERFORM pg_temp.act(p_kind, p_ident);
  SELECT array_agg(pg_temp.probe(q) ORDER BY n) INTO v FROM unnest(ARRAY[
    $q$SELECT count(*)::text FROM public.pasantias_panel_logistics WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$SELECT count(*)::text FROM public.pasantias_panel_roster_details WHERE roster_id = '99116000-0000-4000-8000-0000000000a9'$q$,
    $q$SELECT count(*)::text FROM public.pasantias_panel_documents WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$SELECT count(*)::text FROM public.pasantias_panel_activity WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id) VALUES ('99116000-0000-4000-8000-0000000000b8')$q$,
    $q$INSERT INTO public.pasantias_panel_roster_details (roster_id) VALUES ('99116000-0000-4000-8000-0000000000a8')$q$,
    $q$INSERT INTO public.pasantias_panel_documents (participant_id, kind, storage_path, file_name, mime_type, size_bytes)
       VALUES ('99116000-0000-4000-8000-0000000000b9', 'ticket',
               'participants/99116000-0000-4000-8000-0000000000b9/99116000-0000-4000-8000-0000000000e1.pdf', 'a.pdf', 'application/pdf', 10)$q$,
    $q$INSERT INTO public.pasantias_panel_activity (participant_id, action) VALUES ('99116000-0000-4000-8000-0000000000b9', 'letter_generated')$q$,
    $q$UPDATE public.pasantias_panel_logistics SET version = version WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$UPDATE public.pasantias_panel_roster_details SET version = version WHERE roster_id = '99116000-0000-4000-8000-0000000000a9'$q$,
    $q$UPDATE public.pasantias_panel_documents SET description = description WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$UPDATE public.pasantias_panel_activity SET action = action WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$DELETE FROM public.pasantias_panel_logistics WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$DELETE FROM public.pasantias_panel_roster_details WHERE roster_id = '99116000-0000-4000-8000-0000000000a9'$q$,
    $q$DELETE FROM public.pasantias_panel_documents WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$DELETE FROM public.pasantias_panel_activity WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$,
    $q$SELECT count(*)::text FROM public.pasantias_panel_save_logistics('99116000-0000-4000-8000-0000000000b9'::uuid, 1,
       'pending', 'pending', false, false, NULL::text, NULL::text, '99116000-0000-4000-8000-0000000000f1'::uuid)$q$,
    $q$SELECT public.pasantias_panel_bulk_set(ARRAY['99116000-0000-4000-8000-0000000000b9']::uuid[], 'flight_status', 'pending',
       '99116000-0000-4000-8000-0000000000f1'::uuid)::text$q$,
    $q$SELECT count(*)::text FROM public.pasantias_panel_save_participant('99116000-0000-4000-8000-0000000000b9'::uuid, 1,
       'Fixture', 'Acceso', '44444444-4', NULL::text, NULL::date, NULL::date, NULL::text, '{}'::text[], NULL::text,
       '99116000-0000-4000-8000-0000000000f1'::uuid)$q$]) WITH ORDINALITY u(q, n);
  PERFORM pg_temp.unact();
  RETURN v;
END $$;
-- lg(pid, expected, overlay): a pasantias_panel_save_logistics call as SQL text.
--   overlay keys: fs ls dep bal sal notes actor (JSON null for sal/notes/actor = SQL NULL)
CREATE FUNCTION pg_temp.lg(p_pid text, p_ev text, o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT concat_ws(''|'', logistics_version, replayed::text) FROM public.pasantias_panel_save_logistics('
                '%s::uuid, %s::integer, %s, %s, %s::boolean, %s::boolean, %s, %s, %s::uuid)',
    quote_nullable(p_pid), quote_nullable(p_ev), quote_nullable(b->>'fs'), quote_nullable(b->>'ls'),
    quote_nullable(b->>'dep'), quote_nullable(b->>'bal'), quote_nullable(b->>'sal'), quote_nullable(b->>'notes'),
    quote_nullable(b->>'actor'))
  FROM (SELECT '{"fs": "pending", "ls": "pending", "dep": "false", "bal": "false", "sal": null, "notes": null,
                 "actor": "99116000-0000-4000-8000-0000000000f1"}'::jsonb || o AS b) x
$$;
-- bk(ids, field, value): a pasantias_panel_bulk_set call as SQL text.
CREATE FUNCTION pg_temp.bk(p_ids text, p_field text, p_value text) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT public.pasantias_panel_bulk_set(%s::uuid[], %s, %s, ''99116000-0000-4000-8000-0000000000f1''::uuid)::text',
    quote_nullable(p_ids), quote_nullable(p_field), quote_nullable(p_value)) $$;
-- pc(pid, expected, overlay): a pasantias_panel_save_participant call as SQL text.
--   overlay keys: fn ln rut pp ad dd focus diet (text[] literal) other actor
CREATE FUNCTION pg_temp.pc(p_pid text, p_ev text, o jsonb) RETURNS text LANGUAGE sql AS $$
  SELECT format('SELECT concat_ws(''|'', participant_version, replayed::text) FROM public.pasantias_panel_save_participant('
                '%s::uuid, %s::integer, %s, %s, %s, %s, %s::date, %s::date, %s, %s::text[], %s, %s::uuid)',
    quote_nullable(p_pid), quote_nullable(p_ev), quote_nullable(b->>'fn'), quote_nullable(b->>'ln'),
    quote_nullable(b->>'rut'), quote_nullable(b->>'pp'), quote_nullable(b->>'ad'), quote_nullable(b->>'dd'),
    quote_nullable(b->>'focus'), quote_nullable(b->>'diet'), quote_nullable(b->>'other'), quote_nullable(b->>'actor'))
  FROM (SELECT '{"fn": "Fixture", "ln": "Uno", "rut": "11111111-1", "pp": null, "ad": null, "dd": null, "focus": null,
                 "diet": "{}", "other": null, "actor": "99116000-0000-4000-8000-0000000000f1"}'::jsonb || o AS b) x
$$;
-- Readers (VOLATILE, so they see writes made earlier in the same statement).
CREATE FUNCTION pg_temp.lr(p_id text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT concat_ws('|', l.flight_status, l.lodging_status, l.deposit_received::text, l.balance_received::text,
                   coalesce(l.salutation, '-'), coalesce(l.notes, '-'), l.version,
                   coalesce(right(l.updated_by::text, 2), '-'))
    INTO v FROM public.pasantias_panel_logistics l WHERE l.participant_id = p_id::uuid;
  RETURN coalesce(v, 'none');
END $$;
CREATE FUNCTION pg_temp.ac(p_id text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT count(*)::text INTO v FROM public.pasantias_panel_activity a WHERE a.participant_id = p_id::uuid;
  RETURN v;
END $$;
-- al(id): the newest activity row of a participant as 'action|details'.
CREATE FUNCTION pg_temp.al(p_id text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT a.action || '|' || a.details::text INTO v FROM public.pasantias_panel_activity a
   WHERE a.participant_id = p_id::uuid ORDER BY a.created_at DESC, a.id DESC LIMIT 1;
  RETURN coalesce(v, 'none');
END $$;
CREATE FUNCTION pg_temp.pr(p_id text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT concat_ws('|', x.first_names, x.last_names, x.rut, coalesce(x.passport_number, '-'),
                   coalesce(to_char(x.arrival_date, 'YYYY-MM-DD'), '-'), coalesce(to_char(x.departure_date, 'YYYY-MM-DD'), '-'),
                   coalesce(x.focus, '-'), coalesce(f.all_levels::text, 'none'), x.dietary_restrictions::text,
                   coalesce(x.dietary_other, '-'), x.version, x.notice_version,
                   to_char(x.acknowledged_at AT TIME ZONE 'UTC', 'YYYY-MM-DD'), x.flights_funding, x.lodging_funding)
    INTO v FROM public.pasantias_intake_participants x
    LEFT JOIN public.pasantias_nomina_participant_focus f ON f.participant_id = x.id
   WHERE x.id = p_id::uuid;
  RETURN v;
END $$;
CREATE FUNCTION pg_temp.rs(p_id text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT concat_ws('|', r.status, r.version, (r.submitted_at IS NOT NULL)::text) INTO v
    FROM public.pasantias_intake_rosters r WHERE r.id = p_id::uuid;
  RETURN v;
END $$;
-- state(): every fixture tracking row, activity count and participant version.
CREATE FUNCTION pg_temp.state() RETURNS text LANGUAGE plpgsql AS $$
DECLARE v text;
BEGIN
  SELECT concat_ws('/',
    (SELECT string_agg(concat_ws(':', right(l.participant_id::text, 2), l.flight_status, l.lodging_status,
                                 l.deposit_received, l.balance_received, l.version), ',' ORDER BY l.participant_id)
       FROM public.pasantias_panel_logistics l WHERE l.participant_id::text LIKE '99116000-%'),
    (SELECT count(*)::text FROM public.pasantias_panel_activity a WHERE a.participant_id::text LIKE '99116000-%'),
    (SELECT string_agg(concat_ws(':', right(p.id::text, 2), p.version, p.rut, p.last_names), ',' ORDER BY p.id)
       FROM public.pasantias_intake_participants p WHERE p.id::text LIKE '99116000-%'),
    (SELECT string_agg(concat_ws(':', right(r.id::text, 2), r.status, r.version), ',' ORDER BY r.id)
       FROM public.pasantias_intake_rosters r WHERE r.id::text LIKE '99116000-%'))
    INTO v;
  RETURN v;
END $$;
-- keep(tag): remembers state() under a tag; same(tag): state() still equals it.
CREATE TEMP TABLE p116_state (tag text PRIMARY KEY, s text);
CREATE FUNCTION pg_temp.keep(p_tag text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO p116_state VALUES (p_tag, pg_temp.state()) ON CONFLICT (tag) DO UPDATE SET s = EXCLUDED.s;
END $$;
CREATE FUNCTION pg_temp.same(p_tag text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  RETURN (SELECT t.s FROM p116_state t WHERE t.tag = p_tag) = pg_temp.state();
END $$;

-- Fixtures (postgres) -----------------------------------------------------------
--   a1 'P116 Colegio Uno'  inspira, SUBMITTED, funding sep/colegio: b1 (focus level row), b2
--   a2 'P116 Colegio Dos'  mirada-profunda, open, link REVOKED, no funding: b3
--   a8 / a9                rosters for the access matrix; b8, b9 their participants
--                          (b9 has a tracking row, a details row, a document, an activity row)
DO $fx$
DECLARE
  v_t text; v_id uuid;
BEGIN
  INSERT INTO public.schools (id, name) VALUES (9116, 'P116 QA School') ON CONFLICT (id) DO NOTHING;
  FOREACH v_t IN ARRAY ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
      'admin_inactive', 'norole', 'admin_flagged'] LOOP
    v_id := tests.create_supabase_user('p116_' || v_t, 'p116-' || replace(v_t, '_', '-') || '@qa.local.test');
    INSERT INTO public.profiles (id, email, name, approval_status, school_id, must_change_password)
    VALUES (v_id, 'p116-' || replace(v_t, '_', '-') || '@qa.local.test', 'P116 ' || v_t, 'approved', 9116,
            v_t = 'admin_flagged');
    IF v_t = 'admin' THEN
      INSERT INTO public.redes_de_colegios (id, nombre, created_by)
      VALUES ('99116000-0000-4000-8000-0000000000ad', 'P116 QA Red', v_id);
    END IF;
  END LOOP;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active, red_id)
  SELECT tests.get_supabase_uid('p116_' || t), t::public.user_role_type, CASE WHEN t <> 'admin' THEN 9116 END, true,
         CASE WHEN t = 'supervisor_de_red' THEN '99116000-0000-4000-8000-0000000000ad'::uuid END
    FROM unnest(ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
                      'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion']) t;
  INSERT INTO public.user_roles (user_id, role_type, school_id, is_active) VALUES
    (tests.get_supabase_uid('p116_admin_inactive'), 'admin', NULL, false),
    (tests.get_supabase_uid('p116_admin_flagged'), 'admin', NULL, true);

  INSERT INTO public.pasantias_intake_rosters (id, cohort, program, school_name, token_hash, expires_at, revoked_at,
      status, submitted_at, last_submitted_at) VALUES
    ('99116000-0000-4000-8000-0000000000a1', 'enero-2027', 'inspira', 'P116 Colegio Uno', pg_temp.h('A'),
     now() + interval '30 days', NULL, 'submitted', now(), now()),
    ('99116000-0000-4000-8000-0000000000a2', 'enero-2027', 'mirada-profunda', 'P116 Colegio Dos', pg_temp.h('B'),
     now() + interval '30 days', now(), 'open', NULL, NULL),
    ('99116000-0000-4000-8000-0000000000a8', 'enero-2027', 'inspira', 'P116 Colegio Acceso A', pg_temp.h('X8'),
     now() + interval '30 days', NULL, 'open', NULL, NULL),
    ('99116000-0000-4000-8000-0000000000a9', 'enero-2027', 'inspira', 'P116 Colegio Acceso B', pg_temp.h('X9'),
     now() + interval '30 days', NULL, 'open', NULL, NULL);
  INSERT INTO public.pasantias_nomina_school_funding (roster_id, flights_funding, lodging_funding) VALUES
    ('99116000-0000-4000-8000-0000000000a1', 'sep', 'colegio');
  INSERT INTO public.pasantias_intake_participants (id, roster_id, client_request_id, first_names, last_names, rut,
      flights_funding, lodging_funding, acknowledged_at, notice_version, version) VALUES
    ('99116000-0000-4000-8000-0000000000b1', '99116000-0000-4000-8000-0000000000a1', '99116000-0000-4000-8000-0000000000c1',
     'Fixture', 'Uno', '11111111-1', 'sep', 'colegio', '2026-11-01T12:00:00Z', 'notice-school-v1', 1),
    ('99116000-0000-4000-8000-0000000000b2', '99116000-0000-4000-8000-0000000000a1', '99116000-0000-4000-8000-0000000000c2',
     'Fixture', 'Dos', '22222222-2', 'sep', 'colegio', '2026-11-01T12:00:00Z', 'notice-school-v1', 1),
    ('99116000-0000-4000-8000-0000000000b3', '99116000-0000-4000-8000-0000000000a2', '99116000-0000-4000-8000-0000000000c3',
     'Fixture', 'Tres', '33333333-3', 'sep', 'sep', '2026-11-01T12:00:00Z', 'notice-school-v1', 1),
    ('99116000-0000-4000-8000-0000000000b8', '99116000-0000-4000-8000-0000000000a8', '99116000-0000-4000-8000-0000000000c8',
     'Fixture', 'Acceso', '44444444-4', 'sep', 'sep', '2026-11-01T12:00:00Z', 'notice-school-v1', 1),
    ('99116000-0000-4000-8000-0000000000b9', '99116000-0000-4000-8000-0000000000a9', '99116000-0000-4000-8000-0000000000c9',
     'Fixture', 'Acceso', '44444444-4', 'sep', 'sep', '2026-11-01T12:00:00Z', 'notice-school-v1', 1);
  INSERT INTO public.pasantias_nomina_participant_focus (participant_id, all_levels) VALUES
    ('99116000-0000-4000-8000-0000000000b1', false);
  INSERT INTO public.pasantias_panel_logistics (participant_id) VALUES ('99116000-0000-4000-8000-0000000000b9');
  INSERT INTO public.pasantias_panel_roster_details (roster_id, letter_school_line)
  VALUES ('99116000-0000-4000-8000-0000000000a9', 'del Colegio Acceso');
  INSERT INTO public.pasantias_panel_documents (participant_id, kind, storage_path, file_name, mime_type, size_bytes) VALUES
    ('99116000-0000-4000-8000-0000000000b9', 'other',
     'participants/99116000-0000-4000-8000-0000000000b9/99116000-0000-4000-8000-0000000000e0.png', 'foto.png', 'image/png', 10);
  INSERT INTO public.pasantias_panel_activity (participant_id, action)
  VALUES ('99116000-0000-4000-8000-0000000000b9', 'document_uploaded');
END
$fx$;

-- E1 — structure (17) -----------------------------------------------------------
SELECT has_table('public', 'pasantias_panel_logistics', 'E1: tracking table exists');
SELECT has_table('public', 'pasantias_panel_roster_details', 'E1: roster details table exists');
SELECT has_table('public', 'pasantias_panel_documents', 'E1: documents table exists');
SELECT has_table('public', 'pasantias_panel_activity', 'E1: activity table exists');
SELECT tests.rls_enabled('public', 'pasantias_panel_logistics');
SELECT tests.rls_enabled('public', 'pasantias_panel_roster_details');
SELECT tests.rls_enabled('public', 'pasantias_panel_documents');
SELECT tests.rls_enabled('public', 'pasantias_panel_activity');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s:%s', attname, format_type(atttypid, atttypmod), attnotnull, atthasdef)
          FROM pg_attribute WHERE attrelid = 'public.pasantias_panel_logistics'::regclass AND attnum > 0 AND NOT attisdropped
         ORDER BY attnum),
  ARRAY['participant_id:uuid:t:f', 'flight_status:text:t:t', 'lodging_status:text:t:t', 'deposit_received:boolean:t:t',
        'balance_received:boolean:t:t', 'salutation:text:f:f', 'notes:text:f:f', 'version:integer:t:t',
        'updated_by:uuid:f:f', 'created_at:timestamp with time zone:t:t', 'updated_at:timestamp with time zone:t:t'],
  'E1: tracking columns');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_panel_logistics_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_panel_logistics'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['flight_check:CHECK', 'lodging_check:CHECK', 'notes_check:CHECK',
        'participant_fkey:FOREIGN KEY (participant_id) REFERENCES pasantias_intake_participants(id) ON DELETE RESTRICT',
        'pkey:PRIMARY KEY (participant_id)', 'salutation_check:CHECK', 'version_check:CHECK'],
  'E1: tracking constraint set: one row per participant, FK ON DELETE RESTRICT');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_panel_roster_details_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_panel_roster_details'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['lodging_line_check:CHECK', 'pkey:PRIMARY KEY (roster_id)',
        'roster_fkey:FOREIGN KEY (roster_id) REFERENCES pasantias_intake_rosters(id) ON DELETE RESTRICT',
        'school_line_check:CHECK', 'version_check:CHECK'],
  'E1: roster details constraint set');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_panel_documents_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_panel_documents'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['description_check:CHECK', 'file_name_check:CHECK', 'kind_check:CHECK', 'mime_check:CHECK',
        'participant_fkey:FOREIGN KEY (participant_id) REFERENCES pasantias_intake_participants(id) ON DELETE RESTRICT',
        'pkey:PRIMARY KEY (id)', 'removed_check:CHECK', 'size_check:CHECK', 'storage_path_check:CHECK',
        'storage_path_key:UNIQUE (storage_path)'],
  'E1: documents constraint set: unique storage path, FK ON DELETE RESTRICT');
SELECT is(
  ARRAY(SELECT format('%s:%s', replace(conname, 'pasantias_panel_activity_', ''),
                      CASE contype WHEN 'c' THEN 'CHECK' ELSE pg_get_constraintdef(oid) END)
          FROM pg_constraint WHERE conrelid = 'public.pasantias_panel_activity'::regclass AND contype <> 'n' ORDER BY conname),
  ARRAY['action_check:CHECK', 'details_check:CHECK',
        'participant_fkey:FOREIGN KEY (participant_id) REFERENCES pasantias_intake_participants(id) ON DELETE RESTRICT',
        'pkey:PRIMARY KEY (id)'],
  'E1: activity constraint set');
SELECT is(
  (SELECT concat_ws('|', b.public::text, b.file_size_limit, array_to_string(b.allowed_mime_types, ','))
     FROM storage.buckets b WHERE b.id = 'pasantias-documents'),
  'false|10485760|application/pdf,image/jpeg,image/png,image/webp',
  'E1: bucket pasantias-documents is private, 10 MB, PDF/JPEG/PNG/WebP only');
SELECT is(
  (SELECT count(*)::integer FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects'
      AND (coalesce(qual, '') || coalesce(with_check, '')) LIKE '%pasantias-documents%'),
  0, 'E1: no storage.objects policy names the bucket (service-role API only)');
SELECT is(
  ARRAY(SELECT tgname::text FROM pg_trigger
         WHERE tgrelid IN ('public.pasantias_panel_logistics'::regclass, 'public.pasantias_panel_roster_details'::regclass)
           AND NOT tgisinternal ORDER BY tgname),
  ARRAY['trg_pasantias_panel_logistics_updated_at', 'trg_pasantias_panel_roster_details_updated_at'],
  'E1: updated_at triggers on the two versioned tables');
SELECT is(
  ARRAY(SELECT format('%s:%s', c.relname, p.polname)
          FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
         WHERE c.relname LIKE 'pasantias_panel_%' AND p.polpermissive ORDER BY 1),
  ARRAY[]::text[], 'E1: no permissive policy on any panel table');

-- E2 — access (22) --------------------------------------------------------------
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', table_name, grantee, string_agg(privilege_type, ',' ORDER BY privilege_type))
          FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND table_name LIKE 'pasantias_panel_%'
           AND grantee IN ('PUBLIC', 'anon', 'authenticated', 'service_role')
         GROUP BY table_name, grantee ORDER BY table_name, grantee),
  ARRAY['pasantias_panel_activity:service_role:INSERT,SELECT',
        'pasantias_panel_documents:service_role:INSERT,SELECT,UPDATE',
        'pasantias_panel_logistics:service_role:INSERT,SELECT,UPDATE',
        'pasantias_panel_roster_details:service_role:INSERT,SELECT,UPDATE'],
  'E2: table grants: service_role only; no DELETE anywhere; activity is append-only');
SELECT is(
  ARRAY(SELECT format('%s:%s:%s', p.proname, p.prosecdef::text, array_to_string(p.proconfig, ','))
          FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'pasantias_panel_%' ORDER BY p.proname),
  ARRAY['pasantias_panel_bulk_set:false:search_path=""', 'pasantias_panel_save_logistics:false:search_path=""',
        'pasantias_panel_save_participant:false:search_path=""'],
  'E2: the three functions are SECURITY INVOKER with an empty search_path');
SELECT is(
  ARRAY(SELECT format('%s:%s', p.proname, r.rolname)
          FROM pg_proc p CROSS JOIN LATERAL aclexplode(p.proacl) a JOIN pg_roles r ON r.oid = a.grantee
         WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'pasantias_panel_%'
           AND a.privilege_type = 'EXECUTE' AND r.rolname IN ('anon', 'authenticated', 'service_role')
         ORDER BY 1),
  ARRAY['pasantias_panel_bulk_set:service_role', 'pasantias_panel_save_logistics:service_role',
        'pasantias_panel_save_participant:service_role'],
  'E2: EXECUTE for service_role only');
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname LIKE 'pasantias_panel_%'
      AND EXISTS (SELECT 1 FROM aclexplode(p.proacl) a WHERE a.grantee = 0)),
  0, 'E2: no function is executable by PUBLIC');
SELECT is(
  (SELECT count(*)::integer FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname LIKE 'pasantias_panel_%' AND NOT p.polpermissive),
  4, 'E2: the restrictive forced-password guard is installed on all four tables');

SELECT is(pg_temp.matrix('anon', NULL), array_fill('42501'::text, ARRAY[19]), 'E2: anon is denied everything');
SELECT is(pg_temp.matrix('user', 'p116_' || t), array_fill('42501'::text, ARRAY[19]),
          format('E2: %s is denied every table operation and every function', t))
  FROM unnest(ARRAY['admin', 'consultor', 'equipo_directivo', 'lider_generacion', 'lider_comunidad',
                    'supervisor_de_red', 'community_manager', 'docente', 'encargado_licitacion',
                    'admin_inactive', 'norole', 'admin_flagged']) WITH ORDINALITY u(t, n) ORDER BY n;
SELECT is(
  pg_temp.matrix('service_role', NULL),
  ARRAY['1', '1', '1', '1', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', 'ok', '42501', '42501', '42501', '42501', '42501', '1', '0', '1'],
  'E2: service_role reads, inserts, updates and calls the functions; no DELETE anywhere, no UPDATE on activity');
SELECT is(left(pg_temp.sr('TRUNCATE public.pasantias_panel_activity'), 5), '42501',
          'E2: service_role cannot TRUNCATE the activity log');

-- E3a — tracking save (17) --------------------------------------------------------
SELECT pg_temp.keep('t0');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', NULL, '{"fs": "purchased", "sal": "estimada"}')),
          '1|false', 'E3a: first save inserts version 1');
SELECT is(pg_temp.lr('99116000-0000-4000-8000-0000000000b1'), 'purchased|pending|false|false|estimada|-|1|f1',
          'E3a: the row holds the six values and the admin id');
SELECT is(pg_temp.al('99116000-0000-4000-8000-0000000000b1'),
          'logistics_updated|{"fields": {"salutation": {"new": "estimada", "old": null}, "flight_status": {"new": "purchased", "old": "pending"}}}',
          'E3a: one activity row names each changed field with old and new value');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '7', '{"fs": "purchased", "sal": "estimada"}')),
          '1|true', 'E3a: identical values replay under ANY expected version');
SELECT is(pg_temp.ac('99116000-0000-4000-8000-0000000000b1'), '1', 'E3a: a replay writes no activity');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', NULL, '{"fs": "paid"}')),
          '22023:pasantias_panel_save_logistics: stale_version', 'E3a: a change expecting no row is stale');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"fs": "paid"}')),
          '22023:pasantias_panel_save_logistics: stale_version', 'E3a: a change expecting a newer version is stale');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '1',
            '{"fs": "paid", "ls": "reserved", "dep": "true", "sal": "estimada", "notes": "Llamar al colegio\nantes del viernes"}')),
          '2|false', 'E3a: an edit at the right version bumps it');
SELECT is(pg_temp.lr('99116000-0000-4000-8000-0000000000b1'),
          E'paid|reserved|true|false|estimada|Llamar al colegio\nantes del viernes|2|f1', 'E3a: the edit is stored, line break kept');
SELECT ok(pg_temp.al('99116000-0000-4000-8000-0000000000b1') LIKE '%"notes": {"changed": true}%'
          AND pg_temp.al('99116000-0000-4000-8000-0000000000b1') NOT LIKE '%Llamar%',
          'E3a: the log says the notes changed and never copies their text');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b2', NULL, '{}')), '1|false',
          'E3a: a first save equal to the defaults still creates the row');
SELECT is(pg_temp.ac('99116000-0000-4000-8000-0000000000b2'), '0', 'E3a: …and logs nothing, since nothing changed');
SELECT pg_temp.keep('t1');
SELECT is(
  ARRAY[pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"fs": "bought"}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"ls": "paid ", "fs": "paid"}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"dep": null}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"sal": "sr"}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', jsonb_build_object('notes', repeat('x', 2001)))),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"notes": ""}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '0', '{}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2', '{"actor": null}')),
        pg_temp.sr(pg_temp.lg(NULL, '2', '{}')),
        pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000ff', NULL, '{"fs": "paid"}'))],
  ARRAY['22023:pasantias_panel_save_logistics: invalid_flight_status',
        '22023:pasantias_panel_save_logistics: invalid_lodging_status',
        '22023:pasantias_panel_save_logistics: invalid_payment',
        '22023:pasantias_panel_save_logistics: invalid_salutation',
        '22023:pasantias_panel_save_logistics: invalid_notes',
        '22023:pasantias_panel_save_logistics: invalid_notes',
        '22023:pasantias_panel_save_logistics: invalid_argument',
        '22023:pasantias_panel_save_logistics: invalid_argument',
        '22023:pasantias_panel_save_logistics: invalid_argument',
        '22023:pasantias_panel_save_logistics: unknown_participant'],
  'E3a: every refusal answers its frozen code');
SELECT ok(pg_temp.same('t1'), 'E3a: a refused save writes nothing');
SELECT is(pg_temp.sr(pg_temp.lg('99116000-0000-4000-8000-0000000000b1', '2',
            '{"fs": "paid", "ls": "reserved", "dep": "true", "sal": null, "notes": null}')),
          '3|false', 'E3a: greeting and notes can be cleared back to NULL');
SELECT is(pg_temp.lr('99116000-0000-4000-8000-0000000000b1'), 'paid|reserved|true|false|-|-|3|f1', 'E3a: cleared values are NULL');
SELECT is(pg_temp.rs('99116000-0000-4000-8000-0000000000a1'), 'submitted|1|true',
          'E3a: tracking never touches the school roster (status, version)');

-- E3b — bulk set (12) -----------------------------------------------------------
SELECT is(pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b3,99116000-0000-4000-8000-0000000000b1,99116000-0000-4000-8000-0000000000b2,99116000-0000-4000-8000-0000000000b1}',
                                'flight_status', 'paid')),
          '2', 'E3b: bulk changes only the rows not already at the value (duplicates ignored)');
SELECT is(
  ARRAY[pg_temp.lr('99116000-0000-4000-8000-0000000000b1'), pg_temp.lr('99116000-0000-4000-8000-0000000000b2'),
        pg_temp.lr('99116000-0000-4000-8000-0000000000b3')],
  ARRAY['paid|reserved|true|false|-|-|3|f1', 'paid|pending|false|false|-|-|2|f1', 'paid|pending|false|false|-|-|1|f1'],
  'E3b: untouched row keeps its version; existing row bumps; missing row is created at version 1');
SELECT is(pg_temp.al('99116000-0000-4000-8000-0000000000b3'),
          'logistics_updated|{"bulk": true, "fields": {"flight_status": {"new": "paid", "old": "pending"}}}',
          'E3b: each changed traveller gets its own activity row, marked bulk');
SELECT pg_temp.keep('b1');
SELECT is(pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1,99116000-0000-4000-8000-0000000000b2,99116000-0000-4000-8000-0000000000b3}',
                                'flight_status', 'paid')), '0', 'E3b: repeating the same bulk changes nothing');
SELECT ok(pg_temp.same('b1'), 'E3b: …and writes nothing (no version bump, no activity)');
SELECT is(pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b2}', 'deposit_received', 'true')), '1',
          'E3b: a payment flag is set from the text value');
SELECT is(pg_temp.al('99116000-0000-4000-8000-0000000000b2'),
          'logistics_updated|{"bulk": true, "fields": {"deposit_received": {"new": true, "old": false}}}',
          'E3b: payment flags are logged as booleans');
SELECT is(pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b2}', 'lodging_status', 'reserved')), '1',
          'E3b: lodging status');
SELECT is(pg_temp.lr('99116000-0000-4000-8000-0000000000b2'), 'paid|reserved|true|false|-|-|4|f1',
          'E3b: three bulk changes after the first save leave version 4');
SELECT pg_temp.keep('b2');
SELECT is(pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1,99116000-0000-4000-8000-0000000000ff}',
                                'balance_received', 'true')),
          '22023:pasantias_panel_bulk_set: unknown_participant', 'E3b: one unknown id refuses the whole call');
SELECT is(
  ARRAY[pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1}', 'notes', 'x')),
        pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1}', 'flight_status', 'reserved')),
        pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1}', 'deposit_received', 'yes')),
        pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1}', 'salutation', 'estimado')),
        pg_temp.sr(pg_temp.bk('{}', 'flight_status', 'paid')),
        pg_temp.sr(pg_temp.bk(NULL, 'flight_status', 'paid')),
        pg_temp.sr(pg_temp.bk('{99116000-0000-4000-8000-0000000000b1,NULL}', 'flight_status', 'pending')),
        pg_temp.sr(pg_temp.bk((SELECT array_agg(gen_random_uuid())::text FROM generate_series(1, 201)), 'flight_status', 'paid'))],
  ARRAY['22023:pasantias_panel_bulk_set: invalid_field_value', '22023:pasantias_panel_bulk_set: invalid_field_value',
        '22023:pasantias_panel_bulk_set: invalid_field_value', '22023:pasantias_panel_bulk_set: invalid_field_value',
        '22023:pasantias_panel_bulk_set: invalid_argument', '22023:pasantias_panel_bulk_set: invalid_argument',
        '22023:pasantias_panel_bulk_set: invalid_argument', '22023:pasantias_panel_bulk_set: invalid_argument'],
  'E3b: field/value pairs outside the four allowed, empty, NULL and over-200 selections are refused');
SELECT ok(pg_temp.same('b2'), 'E3b: a refused bulk writes nothing, including for the valid ids before the unknown one');

-- E3c — admin correction (20) ---------------------------------------------------
SELECT is(pg_temp.pr('99116000-0000-4000-8000-0000000000b1'),
          'Fixture|Uno|11111111-1|-|-|-|-|false|{}|-|1|notice-school-v1|2026-11-01|sep|colegio', 'E3c: (baseline) participant b1');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '1',
            '{"ln": "Uno Corregido", "pp": "AB123456", "ad": "2027-01-17", "dd": "2027-01-29", "focus": "todos", "diet": "{otra,vegano}", "other": "Sin mariscos"}')),
          '2|false', 'E3c: a correction at the right version bumps the participant');
SELECT is(pg_temp.pr('99116000-0000-4000-8000-0000000000b1'),
          'Fixture|Uno Corregido|11111111-1|AB123456|2027-01-17|2027-01-29|-|true|{otra,vegano}|Sin mariscos|2|notice-school-v1|2026-11-01|sep|colegio',
          'E3c: fields stored; todos = focus NULL + all_levels true; the school''s acknowledgement and funding copy are untouched');
SELECT is(pg_temp.rs('99116000-0000-4000-8000-0000000000a1'), 'submitted|2|true',
          'E3c: the roster stays SUBMITTED (not reopened) and its version is bumped');
SELECT ok(pg_temp.al('99116000-0000-4000-8000-0000000000b1') LIKE 'participant_corrected|%'
          AND (substr(pg_temp.al('99116000-0000-4000-8000-0000000000b1'), 23)::jsonb -> 'fields') ?& ARRAY['last_names', 'passport_number', 'arrival_date', 'departure_date', 'focus', 'dietary']
          AND NOT (substr(pg_temp.al('99116000-0000-4000-8000-0000000000b1'), 23)::jsonb -> 'fields') ?| ARRAY['first_names', 'rut'],
          'E3c: the activity row lists exactly the changed fields');
SELECT is(substr(pg_temp.al('99116000-0000-4000-8000-0000000000b1'), 23)::jsonb #>> '{fields,last_names,old}', 'Uno',
          'E3c: …with the old value');
SELECT pg_temp.keep('c1');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2',
            '{"ln": "Uno Corregido", "pp": "AB123456", "ad": "2027-01-17", "dd": "2027-01-29", "focus": "todos", "diet": "{otra,vegano}", "other": "Sin mariscos"}')),
          '2|true', 'E3c: identical data is a replay');
SELECT ok(pg_temp.same('c1'), 'E3c: a replay writes nothing (no version bump, no roster bump, no activity)');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '1', '{"ln": "Otro"}')),
          '22023:pasantias_panel_save_participant: stale_version', 'E3c: an edit on an old version is stale');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"rut": "22222222-2"}')),
          '22023:pasantias_panel_save_participant: duplicate_rut', 'E3c: a RUT already in the same roster is refused');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000ff', '1', '{}')),
          '22023:pasantias_panel_save_participant: unknown_participant', 'E3c: unknown participant');
SELECT is(
  ARRAY[pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"fn": " Ana"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"fn": null}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', jsonb_build_object('ln', repeat('a', 81)))),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"rut": "11111111-2"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"rut": "11.111.111-1"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"pp": "ab123456"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"ad": "2027-01-29", "dd": "2027-01-29"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"focus": "media"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"diet": "{vegano,otra}", "other": "x"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"diet": "{otra}"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"other": "sin otra"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"diet": "{carnivoro}"}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', NULL, '{}')),
        pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2', '{"actor": null}'))],
  ARRAY['22023:pasantias_panel_save_participant: invalid_first_names',
        '22023:pasantias_panel_save_participant: invalid_first_names',
        '22023:pasantias_panel_save_participant: invalid_last_names',
        '22023:pasantias_panel_save_participant: invalid_rut',
        '22023:pasantias_panel_save_participant: invalid_rut',
        '22023:pasantias_panel_save_participant: invalid_passport_number',
        '22023:pasantias_panel_save_participant: invalid_dates',
        '22023:pasantias_panel_save_participant: invalid_focus',
        '22023:pasantias_panel_save_participant: invalid_dietary',
        '22023:pasantias_panel_save_participant: invalid_dietary',
        '22023:pasantias_panel_save_participant: invalid_dietary',
        '22023:pasantias_panel_save_participant: invalid_dietary',
        '22023:pasantias_panel_save_participant: invalid_argument',
        '22023:pasantias_panel_save_participant: invalid_argument'],
  'E3c: every field refusal answers its frozen code (same rules as the school''s save)');
SELECT ok(pg_temp.same('c1'), 'E3c: a refused correction writes nothing');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b1', '2',
            '{"ln": "Uno Corregido", "rut": "33333333-3", "focus": "infantil"}')),
          '3|false', 'E3c: a RUT used in ANOTHER roster is allowed; focus back to one level');
SELECT is(pg_temp.pr('99116000-0000-4000-8000-0000000000b1'),
          'Fixture|Uno Corregido|33333333-3|-|-|-|infantil|false|{}|-|3|notice-school-v1|2026-11-01|sep|colegio',
          'E3c: optional values cleared to NULL; all_levels back to false');
SELECT is(pg_temp.sr(pg_temp.pc('99116000-0000-4000-8000-0000000000b3', '1', '{"fn": "Fixture", "ln": "Tres Corregido", "rut": "33333333-3"}')),
          '2|false', 'E3c: a correction works on a roster whose link is revoked and that has no funding row');
SELECT is(pg_temp.pr('99116000-0000-4000-8000-0000000000b3'),
          'Fixture|Tres Corregido|33333333-3|-|-|-|-|false|{}|-|2|notice-school-v1|2026-11-01|sep|sep',
          'E3c: …and creates the missing focus row (all_levels false)');
SELECT is(pg_temp.rs('99116000-0000-4000-8000-0000000000a2'), 'open|2|false', 'E3c: …bumping that roster''s version only');
SELECT is(pg_temp.lr('99116000-0000-4000-8000-0000000000b1'), 'paid|reserved|true|false|-|-|3|f1',
          'E3c: a correction never touches the tracking row');
SELECT is(
  (SELECT count(*)::integer FROM public.pasantias_panel_activity a
    WHERE a.participant_id::text LIKE '99116000-%' AND a.actor_id IS DISTINCT FROM '99116000-0000-4000-8000-0000000000f1'
      AND a.participant_id <> '99116000-0000-4000-8000-0000000000b9'),
  0, 'E3c: every activity row written by the functions carries the acting admin');

-- E3d — table CHECKs on direct writes, as service_role (8) ------------------------
SELECT is(
  ARRAY(SELECT left(pg_temp.sr(q), 5) FROM unnest(ARRAY[
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id, flight_status) VALUES ('99116000-0000-4000-8000-0000000000b8', 'bought')$q$,
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id, lodging_status) VALUES ('99116000-0000-4000-8000-0000000000b8', 'purchased')$q$,
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id, salutation) VALUES ('99116000-0000-4000-8000-0000000000b8', 'Estimado')$q$,
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id, notes) VALUES ('99116000-0000-4000-8000-0000000000b8', '')$q$,
    $q$INSERT INTO public.pasantias_panel_logistics (participant_id, version) VALUES ('99116000-0000-4000-8000-0000000000b8', 0)$q$]) WITH ORDINALITY u(q, n) ORDER BY n),
  array_fill('23514'::text, ARRAY[5]), 'E3d: tracking CHECKs refuse unknown statuses, greetings, empty notes and version 0');
SELECT is(left(pg_temp.sr($q$INSERT INTO public.pasantias_panel_logistics (participant_id) VALUES ('99116000-0000-4000-8000-0000000000ff')$q$), 5),
          '23503', 'E3d: a tracking row needs an existing participant');
SELECT is(
  ARRAY(SELECT left(pg_temp.sr(q), 5) FROM unnest(ARRAY[
    $q$INSERT INTO public.pasantias_panel_roster_details (roster_id, letter_school_line) VALUES ('99116000-0000-4000-8000-0000000000a8', '')$q$,
    $q$INSERT INTO public.pasantias_panel_roster_details (roster_id, letter_lodging_line) VALUES ('99116000-0000-4000-8000-0000000000a8', E'dos\nlineas')$q$,
    $q$INSERT INTO public.pasantias_panel_roster_details (roster_id, letter_school_line) VALUES ('99116000-0000-4000-8000-0000000000a8', repeat('x', 301))$q$]) WITH ORDINALITY u(q, n) ORDER BY n),
  array_fill('23514'::text, ARRAY[3]), 'E3d: letter lines are 1–300 characters on one line');
SELECT is(
  ARRAY(SELECT left(pg_temp.sr(format(
      'INSERT INTO public.pasantias_panel_documents (participant_id, kind, description, storage_path, file_name, mime_type, size_bytes) '
      'VALUES (''99116000-0000-4000-8000-0000000000b8'', %L, %L, %L, %L, %L, %s)',
      d->>'kind', d->>'descr', d->>'path', d->>'name', d->>'mime', d->>'size')), 5)
    FROM (SELECT '{"kind": "ticket", "descr": null, "path": "participants/99116000-0000-4000-8000-0000000000b8/99116000-0000-4000-8000-0000000000e2.pdf", "name": "a.pdf", "mime": "application/pdf", "size": 10}'::jsonb || o AS d, n
            FROM unnest(ARRAY['{"kind": "passport"}', '{"path": "participants/../x.pdf"}', '{"path": "letter-assets/logo"}',
                              '{"path": "participants/99116000-0000-4000-8000-0000000000b8/99116000-0000-4000-8000-0000000000e2.exe"}',
                              '{"name": "a/b.pdf"}', '{"name": ""}', '{"mime": "text/html"}', '{"size": 0}', '{"size": 10485761}',
                              '{"descr": ""}']::jsonb[]) WITH ORDINALITY u(o, n)) x ORDER BY n),
  array_fill('23514'::text, ARRAY[10]),
  'E3d: document CHECKs: kind, storage path shape, file name, MIME type, size, description');
SELECT is(left(pg_temp.sr($q$INSERT INTO public.pasantias_panel_documents (participant_id, kind, storage_path, file_name, mime_type, size_bytes)
       VALUES ('99116000-0000-4000-8000-0000000000b8', 'ticket',
               'participants/99116000-0000-4000-8000-0000000000b9/99116000-0000-4000-8000-0000000000e0.png', 'b.png', 'image/png', 10)$q$), 5),
          '23505', 'E3d: a storage path is used by one document only');
SELECT is(
  ARRAY[left(pg_temp.sr($q$UPDATE public.pasantias_panel_documents SET removed_at = now() WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$), 5),
        left(pg_temp.sr($q$UPDATE public.pasantias_panel_documents SET removed_by = '99116000-0000-4000-8000-0000000000f1' WHERE participant_id = '99116000-0000-4000-8000-0000000000b9'$q$), 5)],
  ARRAY['23514', '23514'], 'E3d: a removal always carries both when and who');
SELECT is(
  ARRAY[left(pg_temp.sr($q$INSERT INTO public.pasantias_panel_activity (participant_id, action) VALUES ('99116000-0000-4000-8000-0000000000b8', 'deleted')$q$), 5),
        left(pg_temp.sr($q$INSERT INTO public.pasantias_panel_activity (participant_id, action, details) VALUES ('99116000-0000-4000-8000-0000000000b8', 'letter_generated', '[]')$q$), 5)],
  ARRAY['23514', '23514'], 'E3d: activity accepts only the five known actions and an object of details');
SELECT is(
  (SELECT concat_ws('|', count(*), count(*) FILTER (WHERE removed_at IS NOT NULL))
     FROM public.pasantias_panel_documents WHERE participant_id::text LIKE '99116000-%'),
  '1|0', 'E3d: nothing from the refused writes was stored');

SELECT * FROM finish();
ROLLBACK;
