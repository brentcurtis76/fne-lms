-- =============================================================================
-- The forced-password-change boundary (F1) — pgTAP
--
-- WHAT THIS SUITE IS FOR. `must_change_password` used to be enforced in exactly
-- one place, `middleware.ts`, and two holes followed from that:
--
--   1. The baseline policy "Allow users to update their own profile" covers the
--      WHOLE row, so the account the flag exists to restrain could clear it with
--      one PostgREST PATCH.
--   2. Next middleware is only on the path of requests to the Next server. A
--      flagged account holds a valid Supabase token and can talk to
--      `/rest/v1/*` directly, which no middleware of ours sees.
--
-- Both are now closed IN THE DATABASE, and this suite is the proof:
--
--   A. A BEFORE UPDATE trigger refuses any change to the column from
--      `authenticated` or `anon`, while leaving every other column exactly as
--      permissive as it was.
--   B. `gate_password_change()` — installed as PostgREST's `db_pre_request` —
--      refuses EVERY request made as `authenticated` by a flagged account,
--      except the one probe the middleware needs.
--
-- WHAT THIS SUITE CANNOT DO, stated plainly: pgTAP speaks SQL, not HTTP, so it
-- cannot send a request through PostgREST. What it CAN do, and does, is assert
-- the two halves that together make the control real — that the gate function
-- refuses the right callers, and that `pg_db_role_setting` actually names it as
-- the pre-request hook. A gate that refuses correctly but is not installed would
-- pass the first and fail the second.
--
-- Per role x operation, as CLAUDE.md requires: all nine roles in types/roles.ts,
-- flagged and unflagged, for the gate and for the protected column.
--
-- Runs inside a transaction and rolls back. DO NOT run against production.
-- =============================================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap;

SELECT plan(89);

\set school_id 9601

-- -----------------------------------------------------------------------------
-- Structure
-- -----------------------------------------------------------------------------
SELECT has_function('public', 'gate_password_change', ARRAY[]::text[],
  'gate_password_change() exists');
SELECT has_function('public', 'current_password_change_state', ARRAY[]::text[],
  'current_password_change_state() exists');
SELECT has_function('public', 'set_password_change_required', ARRAY['uuid', 'boolean'],
  'set_password_change_required(uuid, boolean) exists');
SELECT has_function('public', 'protect_must_change_password', ARRAY[]::text[],
  'protect_must_change_password() exists');

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'gate_password_change'),
  true,
  'the gate is SECURITY DEFINER — it must read profiles regardless of the caller'
);

SELECT is(
  (SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_password_change_state'),
  true,
  'the state probe is SECURITY DEFINER'
);

SELECT is(
  (SELECT p.pronargs::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'current_password_change_state'),
  0,
  'the state probe takes NO argument — there is nothing to point at another account'
);

-- The trigger, on the right table, at the right time.
SELECT is(
  (SELECT count(*)::int FROM pg_trigger t
    WHERE t.tgrelid = 'public.profiles'::regclass
      AND t.tgname = 'protect_must_change_password'
      AND NOT t.tgisinternal),
  1,
  'profiles carries the protect_must_change_password trigger'
);

-- THE WIRING. Without this line the gate function is dead code: it would refuse
-- correctly and never be called.
SELECT ok(
  EXISTS (
    SELECT 1
      FROM pg_db_role_setting s
      JOIN pg_roles r ON r.oid = s.setrole
     WHERE r.rolname = 'authenticator'
       AND 'pgrst.db_pre_request=public.gate_password_change' = ANY (s.setconfig)
  ),
  'pgrst.db_pre_request on the authenticator role NAMES the gate — it is actually installed'
);

-- -----------------------------------------------------------------------------
-- Function privileges
-- -----------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.set_password_change_required(uuid, boolean)', 'EXECUTE'),
  'anon cannot execute set_password_change_required'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.set_password_change_required(uuid, boolean)', 'EXECUTE'),
  'authenticated cannot execute set_password_change_required — the trusted write path is server-only'
);
SELECT ok(
  has_function_privilege('service_role', 'public.set_password_change_required(uuid, boolean)', 'EXECUTE'),
  'service_role can execute set_password_change_required'
);
SELECT ok(
  has_function_privilege('authenticated', 'public.current_password_change_state()', 'EXECUTE'),
  'authenticated can execute the state probe — the middleware calls it as the user'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.current_password_change_state()', 'EXECUTE'),
  'anon cannot execute the state probe — there is no account to report on'
);

-- -----------------------------------------------------------------------------
-- Fixtures: one FLAGGED and one UNFLAGGED account for every one of the nine roles.
-- -----------------------------------------------------------------------------
INSERT INTO schools (id, name)
VALUES (:school_id, 'Forced Change Boundary Test School')
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION pg_temp.seed_role(p_role text, p_flagged boolean)
RETURNS uuid AS $$
DECLARE
  v_id uuid := gen_random_uuid();
  v_email text := p_role || (CASE WHEN p_flagged THEN '-flagged' ELSE '-clear' END) || '@fpc.local';
BEGIN
  INSERT INTO auth.users (id, email, instance_id, aud, role)
  VALUES (v_id, v_email, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');

  INSERT INTO profiles (id, email, name, approval_status, school_id, must_change_password)
  VALUES (v_id, v_email, 'FPC ' || p_role, 'approved', 9601, p_flagged);

  INSERT INTO user_roles (user_id, role_type, school_id, is_active)
  VALUES (v_id, p_role::public.user_role_type, 9601, true);

  RETURN v_id;
END;
$$ LANGUAGE plpgsql;

CREATE TEMP TABLE fpc_users (role_type text, flagged boolean, uid uuid);

INSERT INTO fpc_users (role_type, flagged, uid)
SELECT r, f, pg_temp.seed_role(r, f)
  FROM unnest(ARRAY[
        'admin', 'consultor', 'equipo_directivo', 'lider_generacion',
        'lider_comunidad', 'supervisor_de_red', 'community_manager',
        'docente', 'encargado_licitacion'
      ]) AS r,
       unnest(ARRAY[true, false]) AS f;

SELECT is(
  (SELECT count(*)::int FROM fpc_users),
  18,
  'fixtures: nine roles x {flagged, clear} — the gate is asserted for every role in types/roles.ts'
);

-- -----------------------------------------------------------------------------
-- Impersonation helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pg_temp.act_as(uid uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', 'authenticated')::text,
    true
  );
  -- No `request.path`: this is the default for every REST call that is not the
  -- allow-listed probe.
  PERFORM set_config('request.path', '', true);
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION pg_temp.act_as_role(uid uuid, p_role text) RETURNS void AS $$
BEGIN
  PERFORM set_config('role', p_role, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', uid::text, 'role', p_role)::text,
    true
  );
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

-- How many rows a write actually touched. With the restrictive guard in place a
-- refused write raises nothing and reaches nothing, so ROW_COUNT is the thing to
-- read. SECURITY INVOKER (the default), so every policy still applies.
CREATE OR REPLACE FUNCTION pg_temp.rows_affected(p_sql text) RETURNS integer AS $$
DECLARE
  n integer;
BEGIN
  EXECUTE p_sql;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql;

-- Reading the flag back has to bypass the guard, or the assertion would be
-- asserting the guard against itself.
CREATE OR REPLACE FUNCTION pg_temp.flag_of(p_id uuid)
RETURNS TABLE (must_change_password boolean)
SECURITY DEFINER
AS $$
  SELECT p.must_change_password FROM public.profiles p WHERE p.id = p_id;
$$ LANGUAGE sql;

-- SECURITY DEFINER because most of the assertions below run while impersonating
-- `authenticated`, which cannot read a temp table owned by postgres. The
-- fixture lookup is test scaffolding, not part of what is under test.
CREATE OR REPLACE FUNCTION pg_temp.uid(p_role text, p_flagged boolean) RETURNS uuid
SECURITY DEFINER
AS $$
  SELECT uid FROM fpc_users WHERE role_type = p_role AND flagged = p_flagged;
$$ LANGUAGE sql;

-- =============================================================================
-- A. THE PROTECTED COLUMN — per role
--
-- WHAT CHANGED, and why the assertions below are shaped differently from the
-- round that wrote them. The forced-password boundary is now a RESTRICTIVE RLS
-- policy on every row-secured table (20260819120200), so for a FLAGGED account
-- the row is filtered out before the trigger is reached: the UPDATE raises
-- nothing and touches nothing. The security property is unchanged and the flag
-- still cannot move; the MECHANISM that stops it is now the outer of two layers.
--
-- So each role is asserted twice, once per layer:
--
--   FLAGGED   the row is not reachable at all, and the flag survives the attempt.
--             (The guard. Proved by counting rows, not by catching an exception —
--             an exception that no longer fires is not evidence of anything.)
--   UNFLAGGED the trigger still raises 42501 for a write to this column, which is
--             the layer that matters for an account the guard does NOT hold.
--
-- The second half is the one that would silently disappear if the trigger were
-- ever dropped, because the guard would keep the flagged case green on its own.
-- =============================================================================

-- admin
SELECT pg_temp.act_as(pg_temp.uid('admin', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('admin', true))),
  0,
  'admin (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('admin', true))),
  true,
  'admin (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('admin', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('admin', false) $$,
  '42501', NULL,
  'admin (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('admin', false) $$,
  'admin (clear): ordinary profile edits still work'
);

-- consultor
SELECT pg_temp.act_as(pg_temp.uid('consultor', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('consultor', true))),
  0,
  'consultor (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('consultor', true))),
  true,
  'consultor (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('consultor', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('consultor', false) $$,
  '42501', NULL,
  'consultor (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('consultor', false) $$,
  'consultor (clear): ordinary profile edits still work'
);

-- equipo_directivo
SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('equipo_directivo', true))),
  0,
  'equipo_directivo (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('equipo_directivo', true))),
  true,
  'equipo_directivo (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('equipo_directivo', false) $$,
  '42501', NULL,
  'equipo_directivo (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('equipo_directivo', false) $$,
  'equipo_directivo (clear): ordinary profile edits still work'
);

-- lider_generacion
SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('lider_generacion', true))),
  0,
  'lider_generacion (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('lider_generacion', true))),
  true,
  'lider_generacion (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('lider_generacion', false) $$,
  '42501', NULL,
  'lider_generacion (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('lider_generacion', false) $$,
  'lider_generacion (clear): ordinary profile edits still work'
);

-- lider_comunidad
SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('lider_comunidad', true))),
  0,
  'lider_comunidad (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('lider_comunidad', true))),
  true,
  'lider_comunidad (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('lider_comunidad', false) $$,
  '42501', NULL,
  'lider_comunidad (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('lider_comunidad', false) $$,
  'lider_comunidad (clear): ordinary profile edits still work'
);

-- supervisor_de_red
SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('supervisor_de_red', true))),
  0,
  'supervisor_de_red (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('supervisor_de_red', true))),
  true,
  'supervisor_de_red (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('supervisor_de_red', false) $$,
  '42501', NULL,
  'supervisor_de_red (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('supervisor_de_red', false) $$,
  'supervisor_de_red (clear): ordinary profile edits still work'
);

-- community_manager
SELECT pg_temp.act_as(pg_temp.uid('community_manager', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('community_manager', true))),
  0,
  'community_manager (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('community_manager', true))),
  true,
  'community_manager (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('community_manager', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('community_manager', false) $$,
  '42501', NULL,
  'community_manager (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('community_manager', false) $$,
  'community_manager (clear): ordinary profile edits still work'
);

-- docente
SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('docente', true))),
  0,
  'docente (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('docente', true))),
  true,
  'docente (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('docente', false) $$,
  '42501', NULL,
  'docente (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('docente', false) $$,
  'docente (clear): ordinary profile edits still work'
);

-- encargado_licitacion
SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', true));
SELECT is(
  pg_temp.rows_affected(format(
    'UPDATE profiles SET must_change_password = false WHERE id = %L', pg_temp.uid('encargado_licitacion', true))),
  0,
  'encargado_licitacion (flagged): the attempt to clear its own must_change_password reaches no row'
);
SELECT is(
  (SELECT must_change_password FROM pg_temp.flag_of(pg_temp.uid('encargado_licitacion', true))),
  true,
  'encargado_licitacion (flagged): ...and the flag survived the attempt'
);

-- The UNFLAGGED account of the same role: the guard does not hold it, so the
-- TRIGGER is what refuses the column — and ordinary edits still work.
SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('encargado_licitacion', false) $$,
  '42501', NULL,
  'encargado_licitacion (clear): the trigger refuses a write to must_change_password'
);
SELECT lives_ok(
  $$ UPDATE profiles SET first_name = 'Editado' WHERE id = pg_temp.uid('encargado_licitacion', false) $$,
  'encargado_licitacion (clear): ordinary profile edits still work'
);

-- The other direction: an UNFLAGGED account cannot SET the flag either. A user
-- who could flag themselves could flag anybody the policy lets them write.
SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('docente', false) $$,
  '42501', NULL,
  'an unflagged user cannot SET the flag either — the column is protected in both directions'
);

-- An admin is not special here. `is_admin()` widens the POLICY to other rows;
-- the trigger is about the column, and it does not care who you are.
SELECT pg_temp.act_as(pg_temp.uid('admin', false));
SELECT throws_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('docente', false) $$,
  '42501', NULL,
  'an authenticated ADMIN cannot write the flag directly either — it goes through the server'
);

-- A no-op write of the same value is not a change, so it is not refused. This is
-- what keeps whole-row upserts from ordinary profile screens working.
SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT lives_ok(
  $$ UPDATE profiles SET must_change_password = false, first_name = 'Sin Cambio'
      WHERE id = pg_temp.uid('docente', false) $$,
  'a whole-row write that leaves the flag UNCHANGED is allowed — ordinary upserts keep working'
);

SELECT pg_temp.reset_role();

-- The trusted paths. `postgres` here stands in for the migration/ops role.
SELECT lives_ok(
  $$ UPDATE profiles SET must_change_password = true WHERE id = pg_temp.uid('docente', false) $$,
  'a trusted role CAN set the flag — the boundary is about who, not about whether'
);

SELECT is(
  (SELECT public.set_password_change_required(pg_temp.uid('docente', false), false)),
  true,
  'set_password_change_required returns true when it actually updated a row'
);

SELECT is(
  (SELECT must_change_password FROM profiles WHERE id = pg_temp.uid('docente', false)),
  false,
  'and the flag really is cleared'
);

SELECT is(
  (SELECT public.set_password_change_required('00000000-0000-0000-0000-0000000000ff'::uuid, false)),
  false,
  'set_password_change_required returns FALSE for an account that does not exist — "no row" is not "cleared"'
);

-- =============================================================================
-- B. THE PRE-REQUEST GATE — per role, flagged and clear
-- =============================================================================

-- Flagged: refused. Nine roles, one assertion each.
SELECT pg_temp.act_as(pg_temp.uid('admin', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: admin (flagged) is refused at the PostgREST boundary');

SELECT pg_temp.act_as(pg_temp.uid('consultor', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: consultor (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: equipo_directivo (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: lider_generacion (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: lider_comunidad (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: supervisor_de_red (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('community_manager', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: community_manager (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: docente (flagged) is refused');

SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', true));
SELECT throws_ok($$ SELECT public.gate_password_change() $$, '42501', NULL,
  'gate: encargado_licitacion (flagged) is refused');

-- Unflagged: untouched. The gate must be invisible to everybody else, or it is
-- an outage rather than a control.
SELECT pg_temp.act_as(pg_temp.uid('admin', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: admin (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('consultor', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: consultor (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('equipo_directivo', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: equipo_directivo (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('lider_generacion', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: lider_generacion (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('lider_comunidad', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: lider_comunidad (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('supervisor_de_red', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: supervisor_de_red (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('community_manager', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: community_manager (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: docente (clear) passes through');

SELECT pg_temp.act_as(pg_temp.uid('encargado_licitacion', false));
SELECT lives_ok($$ SELECT public.gate_password_change() $$,
  'gate: encargado_licitacion (clear) passes through');

-- =============================================================================
-- BOTH LAYERS ARE LOAD-BEARING, and each is shown to bite on its own.
--
-- The round that wrote this suite asserted that RLS ALONE would hand a flagged
-- account its own profile row, and that the pre-request gate was the only thing
-- stopping the request that would carry it. That is no longer true, and saying
-- so is the point of this branch: 20260819120200 put a restrictive policy under
-- every row-secured table, so RLS now refuses first.
--
--   LAYER 1 (the data layer)     the row is not reachable — asserted here, and
--                                exhaustively in 053.
--   LAYER 2 (the request layer)  the pre-request gate still refuses the request,
--                                which is what covers SECURITY DEFINER RPCs and
--                                the legacy tables that carry no row security at
--                                all, neither of which a policy can reach.
--
-- The UNFLAGGED control underneath is what makes layer 1 evidence rather than a
-- table nobody could read anyway.
-- =============================================================================
SELECT pg_temp.act_as(pg_temp.uid('docente', true));

SELECT is(
  (SELECT count(*)::int FROM profiles WHERE id = pg_temp.uid('docente', true)),
  0,
  'LAYER 1: a flagged docente cannot reach its own profile row — the restrictive guard refuses before any request-layer check'
);

SELECT throws_ok(
  $$ SELECT public.gate_password_change() $$,
  '42501', NULL,
  'LAYER 2: and the pre-request gate independently refuses the request that would have carried it'
);

SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT is(
  (SELECT count(*)::int FROM profiles WHERE id = pg_temp.uid('docente', false)),
  1,
  'CONTROL: an UNFLAGGED docente DOES reach its own profile row — so layer 1 is the flag, not the policy'
);

-- =============================================================================
-- The single allowance, and its edges
-- =============================================================================
SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT set_config('request.path', '/rpc/current_password_change_state', true);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: the state probe stays reachable for a flagged account — the way out is not behind the door'
);

SELECT is(
  (SELECT public.current_password_change_state()),
  true,
  'and it answers TRUE for the flagged caller'
);

SELECT pg_temp.act_as(pg_temp.uid('docente', false));
SELECT is(
  (SELECT public.current_password_change_state()),
  false,
  'the state probe answers FALSE for an unflagged caller'
);

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT set_config('request.path', '/rpc/refresh_user_roles_cache', true);
SELECT throws_ok(
  $$ SELECT public.gate_password_change() $$,
  '42501', NULL,
  'gate: a DIFFERENT rpc is still refused — the allowance is one function, not "rpc"'
);

SELECT pg_temp.act_as(pg_temp.uid('docente', true));
SELECT set_config('request.path', '/profiles', true);
SELECT throws_ok(
  $$ SELECT public.gate_password_change() $$,
  '42501', NULL,
  'gate: a flagged account cannot even read its own profiles row over REST'
);

-- =============================================================================
-- Who the gate does NOT apply to
-- =============================================================================
SELECT pg_temp.reset_role();
SELECT set_config('role', 'anon', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: anon is untouched — there is no account to flag'
);

SELECT pg_temp.reset_role();
SELECT set_config('role', 'service_role', true);
SELECT set_config(
  'request.jwt.claims',
  json_build_object('sub', pg_temp.uid('docente', true), 'role', 'service_role')::text,
  true
);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: service_role is untouched even when the JWT names a flagged account — it is the role that CLEARS the flag'
);

-- An authenticated request whose claims name nobody has nothing to gate, and
-- still has to satisfy RLS on whatever it touches.
SELECT pg_temp.reset_role();
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: an authenticated request with no `sub` passes through rather than erroring'
);

SELECT pg_temp.reset_role();
SELECT set_config('role', 'authenticated', true);
SELECT set_config('request.jwt.claims', 'not-json-at-all', true);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: a malformed claims blob does not turn the gate into a 500 for everybody'
);

-- An account with NO profile row is not flagged. Locking out every account in
-- the window between sign-up and the profile trigger would be a defect, not a
-- defence (the same rule verdictFromProfile applies, and the same rule Z1a set).
SELECT pg_temp.reset_role();
INSERT INTO auth.users (id, email, instance_id, aud, role)
VALUES ('00000000-0000-0000-0000-0000000009f1', 'no-profile@fpc.local',
        '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated');
SELECT pg_temp.act_as('00000000-0000-0000-0000-0000000009f1'::uuid);
SELECT lives_ok(
  $$ SELECT public.gate_password_change() $$,
  'gate: an account with no profile row is not flagged — a successful query is authoritative'
);

SELECT pg_temp.reset_role();

SELECT * FROM finish();
ROLLBACK;
