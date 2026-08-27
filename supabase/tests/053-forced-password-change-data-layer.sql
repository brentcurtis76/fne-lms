-- =============================================================================
-- The forced-password-change boundary at the DATA layer — pgTAP
--
-- WHAT THIS SUITE EXISTS TO PROVE, and what it refuses to accept as proof.
--
-- The previous round installed the boundary on `pgrst.db_pre_request` and
-- claimed it covered every browser-accessible Supabase service. It did not: it
-- covered PostgREST. Storage and Realtime reach these rows without ever calling
-- the pre-request hook, and this application uses both directly from the
-- browser. So the control moved UNDER the tables, as a restrictive policy, and
-- this suite is the proof that it is there and that it bites.
--
-- Three kinds of assertion, deliberately:
--
--   A. CATALOG INVARIANT. Every row-secured table in `public`, every
--      browser-reachable table in `storage`, and every table published to
--      `supabase_realtime` carries the guard — enumerated from `pg_class` and
--      `pg_policy`, not from a list somebody has to remember to update. A future
--      migration that adds a table fails THIS test until the table joins the
--      boundary.
--
--   B. BEHAVIOUR, per role x operation. Nine roles x {flagged, clear} x
--      {SELECT, INSERT, UPDATE, DELETE}, against a fixture table whose permissive
--      policy WOULD allow every one of them. Plus the same four operations on
--      `storage.objects`, which is the service the previous round missed.
--
--   C. NEGATIVE CONTROLS. A second fixture table, identical except that the
--      guard is NOT applied, is reachable by the same flagged account — which is
--      what makes B evidence about the guard rather than about the fixture. And
--      the catalog invariant is shown to NAME that unguarded table, which is what
--      makes A evidence that a future omission would fail CI.
--
-- WHAT THIS SUITE CANNOT DO. pgTAP speaks SQL, not HTTP and not WebSocket. It
-- cannot open a Realtime channel or PUT an object through storage-api. What it
-- can do — and does — is prove the control that BOTH of those services consult.
-- `tests/e2e/auth-lifecycle.spec.ts` closes the last inch against the running
-- stack with real tokens over real HTTP and a real Realtime subscription.
--
-- Runs inside a transaction and rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(124);

\set school_id 9603

-- =============================================================================
-- A0. The predicate itself
-- =============================================================================

SELECT has_function('public', 'password_change_gate_ok', ARRAY[]::text[],
  'password_change_gate_ok() exists — the single predicate the whole boundary is written in terms of');

SELECT is(
  (SELECT p.pronargs::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'password_change_gate_ok'),
  0,
  'the predicate takes NO argument — there is nothing a caller could point at another account'
);

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'password_change_gate_ok'),
  true,
  'the predicate is SECURITY DEFINER — it must read profiles reliably, and that is also what keeps a policy ON profiles from re-entering policy evaluation'
);

SELECT ok(
  has_function_privilege('authenticated', 'public.password_change_gate_ok()', 'EXECUTE'),
  'authenticated can execute the predicate — it is the invoker of every policy check'
);
SELECT ok(
  has_function_privilege('anon', 'public.password_change_gate_ok()', 'EXECUTE'),
  'anon can execute the predicate — a row-secured table may also be read anonymously'
);
SELECT ok(
  has_function_privilege('service_role', 'public.password_change_gate_ok()', 'EXECUTE'),
  'service_role can execute the predicate'
);

SELECT has_function('public', 'apply_forced_password_change_guard', ARRAY['text', 'text'],
  'apply_forced_password_change_guard(text, text) exists — the one line a future migration calls');

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.apply_forced_password_change_guard(text, text)', 'EXECUTE'),
  'authenticated cannot execute the installer — it performs DDL'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.apply_forced_password_change_guard(text, text)', 'EXECUTE'),
  'anon cannot execute the installer'
);
SELECT ok(
  NOT has_function_privilege('service_role', 'public.apply_forced_password_change_guard(text, text)', 'EXECUTE'),
  'service_role cannot execute the installer either — only the schema owner runs migrations'
);

-- =============================================================================
-- A. THE CATALOG INVARIANT
--
-- Run BEFORE any fixture exists, so it describes the real schema.
-- =============================================================================

-- The enumeration is not silently empty: this repository has hundreds of tables.
SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity),
  '>', 200,
  'the enumeration finds the real schema (200+ row-secured tables in public), so an empty result cannot pass by accident'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy po
         WHERE po.polrelid = c.oid AND po.polname = 'forced_password_change_guard'
      )),
  '{}'::text[],
  'CATALOG INVARIANT: every row-secured table in public carries forced_password_change_guard — a new table fails this until it joins the boundary'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_policy po
     JOIN pg_class c ON c.oid = po.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE po.polname = 'forced_password_change_guard'
      AND n.nspname IN ('public', 'storage')
      AND po.polpermissive),
  '{}'::text[],
  'every guard policy is RESTRICTIVE — a permissive one would GRANT access rather than narrow it, which is the opposite of the control'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_policy po
     JOIN pg_class c ON c.oid = po.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE po.polname = 'forced_password_change_guard'
      AND n.nspname IN ('public', 'storage')
      AND po.polcmd <> '*'),
  '{}'::text[],
  'every guard policy is FOR ALL — reads, inserts, updates and deletes alike'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_policy po
     JOIN pg_class c ON c.oid = po.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE po.polname = 'forced_password_change_guard'
      AND n.nspname IN ('public', 'storage')
      AND po.polroles <> ARRAY['authenticated'::regrole]::oid[]),
  '{}'::text[],
  'every guard policy names exactly the authenticated role — service_role holds BYPASSRLS and anon has no account to hold'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_policy po
     JOIN pg_class c ON c.oid = po.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE po.polname = 'forced_password_change_guard'
      AND n.nspname IN ('public', 'storage')
      AND (
        pg_get_expr(po.polqual, po.polrelid) IS NULL
        OR pg_get_expr(po.polqual, po.polrelid) NOT LIKE '%password_change_gate_ok%'
      )),
  '{}'::text[],
  'every guard policy USING clause calls the one predicate — reads and deletes'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_policy po
     JOIN pg_class c ON c.oid = po.polrelid
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE po.polname = 'forced_password_change_guard'
      AND n.nspname IN ('public', 'storage')
      AND (
        pg_get_expr(po.polwithcheck, po.polrelid) IS NULL
        OR pg_get_expr(po.polwithcheck, po.polrelid) NOT LIKE '%password_change_gate_ok%'
      )),
  '{}'::text[],
  'every guard policy WITH CHECK clause calls the one predicate — inserts and updates'
);

-- --- Storage: the service the pre-request gate never saw -----------------------

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy po WHERE po.polrelid = 'storage.objects'::regclass
            AND po.polname = 'forced_password_change_guard'),
  'STORAGE: storage.objects carries the guard — listing, download, upload, update and delete are all authorised here'
);

SELECT ok(
  EXISTS (SELECT 1 FROM pg_policy po WHERE po.polrelid = 'storage.buckets'::regclass
            AND po.polname = 'forced_password_change_guard'),
  'STORAGE: storage.buckets carries the guard — listBuckets() reads this table'
);

SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'storage'
      AND c.relkind = 'r'
      AND c.relname IN ('objects', 'buckets', 's3_multipart_uploads', 's3_multipart_uploads_parts')
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy po
         WHERE po.polrelid = c.oid AND po.polname = 'forced_password_change_guard'
      )),
  '{}'::text[],
  'STORAGE: every browser-reachable storage table carries the guard, resumable-upload tables included'
);

-- --- Realtime -----------------------------------------------------------------

SELECT cmp_ok(
  (SELECT count(*)::int FROM pg_publication_tables WHERE pubname = 'supabase_realtime'),
  '>', 0,
  'REALTIME: the supabase_realtime publication is not empty, so the coverage check below is not vacuous'
);

SELECT is(
  (SELECT coalesce(array_agg(format('%s.%s', pt.schemaname, pt.tablename) ORDER BY pt.tablename), '{}'::text[])
     FROM pg_publication_tables pt
    WHERE pt.pubname = 'supabase_realtime'
      AND NOT EXISTS (
        SELECT 1
          FROM pg_policy po
          JOIN pg_class c ON c.oid = po.polrelid
          JOIN pg_namespace n ON n.oid = c.relnamespace
         WHERE n.nspname = pt.schemaname
           AND c.relname = pt.tablename
           AND po.polname = 'forced_password_change_guard'
      )),
  '{}'::text[],
  'REALTIME: every published table carries the guard — postgres_changes delivers a row only to a subscriber that could SELECT it, so this IS the delivery control'
);

-- --- The legacy allowlist has not grown ---------------------------------------
-- A table with row security switched off cannot carry a policy at all. The
-- allowlist is pinned in 001-rls-enabled.sql; this asserts its SIZE here too, so
-- "add the table to the allowlist" cannot be used to escape the boundary.
SELECT is(
  (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity),
  22,
  'the 22-table legacy no-row-security allowlist has not grown — escaping the boundary by omitting row security would fail here and in 001'
);

-- =============================================================================
-- Fixtures
-- =============================================================================

INSERT INTO schools (id, name)
VALUES (:school_id, 'Forced Change Data Layer Test School')
ON CONFLICT (id) DO NOTHING;

-- B2a r2: chk_user_roles_active_supervisor_needs_red (migration
-- 20260827160000) forbids an ACTIVE supervisor_de_red row with red_id NULL.
-- This sweep seeds ACTIVE rows for all nine roles, so the supervisor fixtures
-- need a real network to point at. Synthetic, rolled back with the rest.
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES ('00000000-0000-0000-0000-00000000f052', 'fpcdl-red-creator@fpcdl.local', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;

INSERT INTO profiles (id, email, name, approval_status)
VALUES ('00000000-0000-0000-0000-00000000f052', 'fpcdl-red-creator@fpcdl.local', 'FPCDL Red Creator Sintetico', 'approved')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.redes_de_colegios (id, nombre, descripcion, created_by)
VALUES ('00000000-0000-0000-0000-00000000f053', 'Red Sintetica FPCDL Data Layer', 'Red sintetica para pgTAP. No es una red real.', '00000000-0000-0000-0000-00000000f052')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.seed_role(p_role text, p_flagged boolean)
RETURNS uuid AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := p_role || (CASE WHEN p_flagged THEN '-flagged' ELSE '-clear' END) || '@fpcdl.local';
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (v_id, v_email, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  INSERT INTO profiles (id, email, name, approval_status, school_id, must_change_password)
  VALUES (v_id, v_email, 'FPCDL ' || p_role, 'approved', 9603, p_flagged);

  -- supervisor_de_red rows are ACTIVE and must therefore carry a red_id
  -- (chk_user_roles_active_supervisor_needs_red); every other role keeps NULL.
  INSERT INTO user_roles (user_id, role_type, school_id, is_active, red_id)
  VALUES (v_id, p_role::public.user_role_type, 9603, true,
          CASE WHEN p_role = 'supervisor_de_red'
               THEN '00000000-0000-0000-0000-00000000f053'::uuid
          END);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE fpcdl_users (role_type text, flagged boolean, uid uuid);

INSERT INTO fpcdl_users (role_type, flagged, uid)
SELECT r, f, pg_temp.seed_role(r, f)
  FROM unnest(ARRAY[
        'admin', 'consultor', 'equipo_directivo', 'lider_generacion',
        'lider_comunidad', 'supervisor_de_red', 'community_manager',
        'docente', 'encargado_licitacion'
      ]) AS r,
       unnest(ARRAY[true, false]) AS f;

SELECT is(
  (SELECT count(*)::int FROM fpcdl_users),
  18,
  'fixtures: nine roles x {flagged, clear} — every role in types/roles.ts is exercised'
);

CREATE OR REPLACE FUNCTION pg_temp.uid(p_role text, p_flagged boolean) RETURNS uuid
SECURITY DEFINER
AS $$
  SELECT uid FROM fpcdl_users WHERE role_type = p_role AND flagged = p_flagged;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.act_as(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  -- No `request.path`: Storage and Realtime never set one, which is precisely
  -- why the pre-request allowance is irrelevant to them.
  PERFORM set_config('request.path', '', true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.reset_role() RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'postgres', true);
  PERFORM set_config('request.jwt.claims', NULL, true);
  PERFORM set_config('request.path', '', true);
END;
$$ LANGUAGE plpgsql;

-- Counting the rows a write actually touched. `WITH ... UPDATE ... RETURNING`
-- cannot be used as a scalar sub-select, and the number that matters here is
-- "how many rows did row security let this statement reach", so the statement is
-- executed and ROW_COUNT read. SECURITY INVOKER (the default), so every policy
-- still applies as the impersonated role.
CREATE OR REPLACE FUNCTION pg_temp.affected(p_sql text) RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- --- The probe table: row-secured, fully permissive for authenticated, GUARDED.
CREATE TABLE public._fpcdl_probe (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  payload     text
);
ALTER TABLE public._fpcdl_probe ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._fpcdl_probe TO authenticated;
CREATE POLICY probe_all ON public._fpcdl_probe
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
SELECT ok(
  public.apply_forced_password_change_guard('public', '_fpcdl_probe'),
  'the installer returns true the first time it guards a table'
);
SELECT ok(
  NOT public.apply_forced_password_change_guard('public', '_fpcdl_probe'),
  'the installer is idempotent — a second call reports "already present" rather than replacing anything'
);

-- --- The NEGATIVE CONTROL table: identical, but NOT guarded.
CREATE TABLE public._fpcdl_control (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id    uuid NOT NULL,
  payload     text
);
ALTER TABLE public._fpcdl_control ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public._fpcdl_control TO authenticated;
CREATE POLICY control_all ON public._fpcdl_control
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- One row per fixture account in each table, written as the owner.
INSERT INTO public._fpcdl_probe (owner_id, payload)
SELECT uid, 'seed' FROM fpcdl_users;
INSERT INTO public._fpcdl_control (owner_id, payload)
SELECT uid, 'seed' FROM fpcdl_users;

-- --- THE CATALOG INVARIANT, SHOWN TO BITE --------------------------------------
-- The control table is row-secured and unguarded. If the invariant above is real,
-- it names exactly this table now. If it does not, the invariant is decoration.
SELECT is(
  (SELECT coalesce(array_agg(c.relname::text ORDER BY c.relname), '{}'::text[])
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND NOT EXISTS (
        SELECT 1 FROM pg_policy po
         WHERE po.polrelid = c.oid AND po.polname = 'forced_password_change_guard'
      )),
  ARRAY['_fpcdl_control']::text[],
  'NEGATIVE CONTROL: the catalog invariant NAMES a newly added row-secured table that skipped the guard — this is what fails CI for a future migration'
);

SELECT throws_ok(
  $$ SELECT public.apply_forced_password_change_guard('public', '_fpcdl_no_such_table') $$,
  '42P01', NULL,
  'the installer refuses a table that does not exist rather than reporting success'
);

CREATE TABLE public._fpcdl_no_rls (id int);
SELECT throws_ok(
  $$ SELECT public.apply_forced_password_change_guard('public', '_fpcdl_no_rls') $$,
  '42P16', NULL,
  'the installer refuses a table with row security switched off — a restrictive policy there would enforce nothing'
);

-- =============================================================================
-- B0. The predicate's own answers
-- =============================================================================

SELECT pg_temp.reset_role();
SELECT ok(public.password_change_gate_ok(), 'no claims at all (a server role): allowed');

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT ok(NOT public.password_change_gate_ok(), 'a flagged account: DENIED');

SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT ok(public.password_change_gate_ok(), 'an unflagged account: allowed');

SELECT pg_temp.act_as(gen_random_uuid());
SELECT ok(public.password_change_gate_ok(),
  'an account with no profile row: allowed — zero rows means zero flags, the same rule verdictFromProfile applies');

SELECT pg_temp.reset_role();
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);
SELECT ok(public.password_change_gate_ok(), 'authenticated with no sub claim: allowed — there is no account to hold');

SELECT set_config('request.jwt.claims', 'not json at all', true);
SELECT ok(NOT public.password_change_gate_ok(),
  'a claims blob that will not parse: DENIED, and it does not raise — a predicate that cannot identify the caller must fail closed');

SELECT pg_temp.reset_role();

-- =============================================================================
-- B. BEHAVIOUR — nine roles x {flagged, clear} x {SELECT, INSERT, UPDATE, DELETE}
--
-- The permissive policy on _fpcdl_probe would allow every one of these. The
-- restrictive guard is the only difference between the two halves.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.probe_visible(p_uid uuid) RETURNS integer AS $$
  SELECT count(*)::int FROM public._fpcdl_probe WHERE owner_id = p_uid;
$$ LANGUAGE sql;

-- admin
SELECT pg_temp.act_as(pg_temp.uid('admin', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('admin', true)), 0, 'admin (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('admin', true), 'x') $$, '42501', NULL, 'admin (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('admin', true))), 0, 'admin (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('admin', true))), 0, 'admin (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('admin', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('admin', false)), 1, 'admin (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('admin', false), 'x') $$, 'admin (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('admin', false))), '>', 0, 'admin (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('admin', false))), '>', 0, 'admin (clear): DELETE works');

-- consultor
SELECT pg_temp.act_as(pg_temp.uid('consultor', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('consultor', true)), 0, 'consultor (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('consultor', true), 'x') $$, '42501', NULL, 'consultor (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('consultor', true))), 0, 'consultor (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('consultor', true))), 0, 'consultor (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('consultor', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('consultor', false)), 1, 'consultor (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('consultor', false), 'x') $$, 'consultor (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('consultor', false))), '>', 0, 'consultor (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('consultor', false))), '>', 0, 'consultor (clear): DELETE works');

-- equipo_directivo
SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('equipo_directivo', true)), 0, 'equipo_directivo (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('equipo_directivo', true), 'x') $$, '42501', NULL, 'equipo_directivo (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('equipo_directivo', true))), 0, 'equipo_directivo (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('equipo_directivo', true))), 0, 'equipo_directivo (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('equipo_directivo', false)), 1, 'equipo_directivo (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('equipo_directivo', false), 'x') $$, 'equipo_directivo (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('equipo_directivo', false))), '>', 0, 'equipo_directivo (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('equipo_directivo', false))), '>', 0, 'equipo_directivo (clear): DELETE works');

-- lider_generacion
SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('lider_generacion', true)), 0, 'lider_generacion (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('lider_generacion', true), 'x') $$, '42501', NULL, 'lider_generacion (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('lider_generacion', true))), 0, 'lider_generacion (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('lider_generacion', true))), 0, 'lider_generacion (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('lider_generacion', false)), 1, 'lider_generacion (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('lider_generacion', false), 'x') $$, 'lider_generacion (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('lider_generacion', false))), '>', 0, 'lider_generacion (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('lider_generacion', false))), '>', 0, 'lider_generacion (clear): DELETE works');

-- lider_comunidad
SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('lider_comunidad', true)), 0, 'lider_comunidad (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('lider_comunidad', true), 'x') $$, '42501', NULL, 'lider_comunidad (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('lider_comunidad', true))), 0, 'lider_comunidad (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('lider_comunidad', true))), 0, 'lider_comunidad (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('lider_comunidad', false)), 1, 'lider_comunidad (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('lider_comunidad', false), 'x') $$, 'lider_comunidad (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('lider_comunidad', false))), '>', 0, 'lider_comunidad (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('lider_comunidad', false))), '>', 0, 'lider_comunidad (clear): DELETE works');

-- supervisor_de_red
SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('supervisor_de_red', true)), 0, 'supervisor_de_red (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('supervisor_de_red', true), 'x') $$, '42501', NULL, 'supervisor_de_red (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('supervisor_de_red', true))), 0, 'supervisor_de_red (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('supervisor_de_red', true))), 0, 'supervisor_de_red (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('supervisor_de_red', false)), 1, 'supervisor_de_red (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('supervisor_de_red', false), 'x') $$, 'supervisor_de_red (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('supervisor_de_red', false))), '>', 0, 'supervisor_de_red (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('supervisor_de_red', false))), '>', 0, 'supervisor_de_red (clear): DELETE works');

-- community_manager
SELECT pg_temp.act_as(pg_temp.uid('community_manager', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('community_manager', true)), 0, 'community_manager (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('community_manager', true), 'x') $$, '42501', NULL, 'community_manager (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('community_manager', true))), 0, 'community_manager (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('community_manager', true))), 0, 'community_manager (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('community_manager', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('community_manager', false)), 1, 'community_manager (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('community_manager', false), 'x') $$, 'community_manager (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('community_manager', false))), '>', 0, 'community_manager (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('community_manager', false))), '>', 0, 'community_manager (clear): DELETE works');

-- docente
SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('docente', true)), 0, 'docente (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('docente', true), 'x') $$, '42501', NULL, 'docente (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('docente', true))), 0, 'docente (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('docente', true))), 0, 'docente (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('docente', false)), 1, 'docente (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('docente', false), 'x') $$, 'docente (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('docente', false))), '>', 0, 'docente (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('docente', false))), '>', 0, 'docente (clear): DELETE works');

-- encargado_licitacion
SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', true));
SELECT is(pg_temp.probe_visible(pg_temp.uid('encargado_licitacion', true)), 0, 'encargado_licitacion (flagged): SELECT on a guarded table returns nothing');
SELECT throws_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('encargado_licitacion', true), 'x') $$, '42501', NULL, 'encargado_licitacion (flagged): INSERT refused');
SELECT is(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('encargado_licitacion', true))), 0, 'encargado_licitacion (flagged): UPDATE touches no row');
SELECT is(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('encargado_licitacion', true))), 0, 'encargado_licitacion (flagged): DELETE touches no row');
SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', false));
SELECT is(pg_temp.probe_visible(pg_temp.uid('encargado_licitacion', false)), 1, 'encargado_licitacion (clear): SELECT works — the positive control');
SELECT lives_ok($$ INSERT INTO public._fpcdl_probe (owner_id, payload) VALUES (pg_temp.uid('encargado_licitacion', false), 'x') $$, 'encargado_licitacion (clear): INSERT works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE public._fpcdl_probe SET payload = ''y'' WHERE owner_id = %L', pg_temp.uid('encargado_licitacion', false))), '>', 0, 'encargado_licitacion (clear): UPDATE works');
SELECT cmp_ok(pg_temp.affected(format('DELETE FROM public._fpcdl_probe WHERE owner_id = %L', pg_temp.uid('encargado_licitacion', false))), '>', 0, 'encargado_licitacion (clear): DELETE works');

-- =============================================================================
-- C. THE NEGATIVE CONTROL — the same flagged account, an UNGUARDED table
--
-- Without this pair, every assertion above is equally consistent with "the
-- fixture was broken" or "authenticated cannot reach this table at all".
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.control_visible(p_uid uuid) RETURNS integer AS $$
  SELECT count(*)::int FROM public._fpcdl_control WHERE owner_id = p_uid;
$$ LANGUAGE sql;

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT is(pg_temp.control_visible(pg_temp.uid('docente', true)), 1,
  'NEGATIVE CONTROL: the same flagged account CAN read the identical table that skipped the guard — so the refusals above are the guard, not the fixture');
SELECT lives_ok(
  $$ INSERT INTO public._fpcdl_control (owner_id, payload) VALUES (pg_temp.uid('docente', true), 'x') $$,
  'NEGATIVE CONTROL: and CAN insert into it');

-- =============================================================================
-- D. STORAGE — behaviour, not catalog
--
-- The permissive policy below is what a normal Supabase project writes for a
-- user-owned bucket. The guard is the only reason a flagged account cannot use
-- it. Note there is no `request.path` set anywhere in this suite: Storage never
-- sets one, which is exactly why the PostgREST pre-request hook was never on
-- this path.
-- =============================================================================

SELECT pg_temp.reset_role();

INSERT INTO storage.buckets (id, name, public)
VALUES ('fpcdl-bucket', 'fpcdl-bucket', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY fpcdl_objects_all ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'fpcdl-bucket' AND owner = auth.uid())
  WITH CHECK (bucket_id = 'fpcdl-bucket' AND owner = auth.uid());

CREATE POLICY fpcdl_buckets_read ON storage.buckets
  FOR SELECT TO authenticated
  USING (id = 'fpcdl-bucket');

INSERT INTO storage.objects (bucket_id, name, owner)
SELECT 'fpcdl-bucket', 'seed/' || uid::text, uid FROM fpcdl_users;

CREATE OR REPLACE FUNCTION pg_temp.objects_visible(p_uid uuid) RETURNS integer AS $$
  SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'fpcdl-bucket' AND owner = p_uid;
$$ LANGUAGE sql;

CREATE OR REPLACE FUNCTION pg_temp.buckets_visible() RETURNS integer AS $$
  SELECT count(*)::int FROM storage.buckets WHERE id = 'fpcdl-bucket';
$$ LANGUAGE sql;

-- FLAGGED
SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT is(pg_temp.objects_visible(pg_temp.uid('docente', true)), 0,
  'STORAGE (flagged): listing and download see nothing — storage.objects is where both are authorised');
SELECT throws_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('fpcdl-bucket', 'upload/x', pg_temp.uid('docente', true)) $$,
  '42501', NULL,
  'STORAGE (flagged): upload refused');
SELECT is(pg_temp.affected(format('UPDATE storage.objects SET name = ''renamed'' WHERE owner = %L', pg_temp.uid('docente', true))), 0,
  'STORAGE (flagged): update touches no object');
-- Deletion, on this stack, cannot be asserted by running one: storage installs a
-- STATEMENT-level trigger (`storage.protect_delete`) that refuses EVERY direct
-- SQL delete from `storage.objects`, for postgres included. So deletion
-- authorisation is asserted here for what it is -- the same USING clause the
-- SELECT above exercised, under a FOR ALL policy -- and the real delete is
-- driven through the Storage API with a flagged token in
-- tests/e2e/auth-lifecycle.spec.ts.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger t
           WHERE t.tgrelid = 'storage.objects'::regclass
             AND t.tgname = 'protect_objects_delete'
             AND NOT t.tgisinternal),
  'STORAGE: this stack blocks direct SQL DELETE on storage.objects, which is why deletion is proved structurally here and behaviourally through the Storage API in the e2e');
SELECT is(pg_temp.buckets_visible(), 0, 'STORAGE (flagged): listBuckets() sees nothing');

-- UNFLAGGED positive control
SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT is(pg_temp.objects_visible(pg_temp.uid('docente', false)), 1,
  'STORAGE (clear): listing and download work — the positive control');
SELECT lives_ok(
  $$ INSERT INTO storage.objects (bucket_id, name, owner) VALUES ('fpcdl-bucket', 'upload/ok', pg_temp.uid('docente', false)) $$,
  'STORAGE (clear): upload works');
SELECT cmp_ok(pg_temp.affected(format('UPDATE storage.objects SET metadata = ''{}''::jsonb WHERE owner = %L', pg_temp.uid('docente', false))), '>', 0,
  'STORAGE (clear): update works');
SELECT is(
  (SELECT po.polcmd FROM pg_policy po
    WHERE po.polrelid = 'storage.objects'::regclass
      AND po.polname = 'forced_password_change_guard'),
  '*'::"char",
  'STORAGE: the guard on storage.objects is FOR ALL, so the USING clause proved above governs DELETE exactly as it governs SELECT');
SELECT is(pg_temp.buckets_visible(), 1, 'STORAGE (clear): listBuckets() works');

-- =============================================================================
-- E. REALTIME — the row-delivery decision, at the layer Realtime consults
--
-- `postgres_changes` hands a subscriber a row only if that subscriber could
-- SELECT it, checked as `authenticated` with the subscriber's own claims. So the
-- assertion that matters is exactly the SELECT assertion, made against the tables
-- this application actually subscribes to.
-- =============================================================================

CREATE OR REPLACE FUNCTION pg_temp.notifications_visible() RETURNS integer AS $$
  SELECT count(*)::int FROM public.notifications WHERE title = 'FPCDL';
$$ LANGUAGE sql;

SELECT pg_temp.reset_role();
INSERT INTO public.notification_types (id, name, category)
VALUES ('fpcdl_synthetic', 'FPCDL synthetic', 'system')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.notifications (user_id, title, message, type)
SELECT uid, 'FPCDL', 'synthetic', 'fpcdl_synthetic' FROM fpcdl_users;

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT is(pg_temp.notifications_visible(), 0,
  'REALTIME (flagged): a published table this app subscribes to yields no row — which is the same check Realtime makes before delivering one');

SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT cmp_ok(pg_temp.notifications_visible(), '>', 0,
  'REALTIME (clear): the same subscriber sees rows — the positive control');

SELECT pg_temp.reset_role();

-- =============================================================================
-- F. SERVICE-ROLE OPERATIONS MUST STILL WORK
--
-- Every endpoint that COMPLETES a forced change runs on the service-role client.
-- If the guard caught service_role too, the boundary would be a lockout.
-- =============================================================================

SELECT ok(
  (SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role'),
  'service_role holds BYPASSRLS — the endpoints that clear the flag are not held by the boundary they clear'
);

SELECT set_config('role', 'service_role', true);
SELECT set_config('request.jwt.claims', json_build_object('sub', pg_temp.uid('docente', true)::text, 'role', 'service_role')::text, true);
SELECT cmp_ok(
  (SELECT count(*)::int FROM public.profiles WHERE id = pg_temp.uid('docente', true)),
  '>', 0,
  'service_role can still read a FLAGGED account profile — this is the read /api/auth/force-password-change makes');
SELECT lives_ok(
  $$ SELECT public.set_password_change_required(pg_temp.uid('docente', true), false) $$,
  'service_role can still clear the flag — the way out does not run through the door being held shut');

SELECT pg_temp.reset_role();

SELECT * FROM finish();
ROLLBACK;
