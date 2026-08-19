-- =============================================================================
-- The forced-password-change boundary — moving S4 from middleware into the database
--
-- WHAT WAS WRONG. `must_change_password` on `public.profiles` was enforced in
-- exactly one place: `middleware.ts`. Two holes followed from that, and both are
-- reachable from an ordinary browser with a valid session:
--
--   1. THE FLAG WAS SELF-SERVICE. The baseline policy "Allow users to update
--      their own profile" is `FOR UPDATE USING (auth.uid() = id) WITH CHECK
--      (auth.uid() = id)` over the WHOLE row. `must_change_password` is a column
--      on that row, so the account the flag exists to restrain could clear it:
--
--        PATCH /rest/v1/profiles?id=eq.<self>
--        {"must_change_password": false}
--
--      One request, and the gate is gone for good.
--
--   2. THE GATE WAS BYPASSABLE BY GOING AROUND IT. Next middleware only sees
--      requests to the Next server. A flagged account holds a perfectly valid
--      Supabase access token, and `https://<project>.supabase.co/rest/v1/...`
--      is a different origin that no middleware of ours is on the path of. The
--      account could read and write every table its RLS policies allow while
--      the application believed it was held at /change-password.
--
-- WHAT THIS MIGRATION DOES, in three pieces, all additive:
--
--   A. A PROTECTED COLUMN. A BEFORE UPDATE trigger refuses any change to
--      `must_change_password` that arrives as `authenticated` or `anon`. The
--      column becomes writable only by the trusted roles — `service_role` (every
--      server endpoint in this application) and the migration/ops roles. Hole 1
--      closes at the storage layer, where no policy edit or new call site can
--      reopen it by accident. Every OTHER column keeps exactly the permissions
--      it had, so ordinary profile edits are untouched.
--
--   B. A POSTGREST PRE-REQUEST GATE. `pgrst.db_pre_request` names a function
--      PostgREST executes before EVERY request, after it has switched to the
--      request's role. `public.gate_password_change()` raises 42501 (which
--      PostgREST returns as HTTP 403) for any request made as `authenticated`
--      by an account whose flag is set. Hole 2 closes for the whole REST
--      surface at once — every table, every view, every RPC, present and
--      future — rather than table by table. It is role-agnostic by
--      construction, so all nine roles in types/roles.ts are covered by the
--      same three lines; there is no per-role list to forget to update.
--
--   C. ONE DELIBERATE HOLE IN (B), and only one. `public.current_password_change_state()`
--      stays reachable, because the middleware has to be able to ASK whether the
--      flag is set in order to send the user to /change-password. Everything the
--      flagged account needs in order to finish — GoTrue's /auth/v1 endpoints,
--      and this application's service-role endpoints — lives outside PostgREST
--      and is unaffected. So the gate can be total without stranding anybody:
--      the way out never runs through the door being held shut.
--
-- NOT STRANDING PEOPLE (the failure modes, stated so they are not a surprise):
--
--   * No profile row -> NOT flagged -> allowed. A successful query is
--     authoritative and zero rows means zero flags, which is the same rule
--     `verdictFromProfile` applies in lib/auth/forced-password-change.ts and the
--     same rule Z1a set for roles. The alternative locks out every account in
--     the window between sign-up and the profile trigger.
--   * `request.path` unavailable -> the allowance in (C) does not fire -> the
--     flagged user is refused everywhere, INCLUDING the state RPC. The
--     middleware then reads `unavailable`, fails closed, and sends the user to
--     /change-password?estado=no-verificado — a page with a retry and a sign-out,
--     not a loop. The forced change itself still completes, because it does not
--     go through PostgREST.
--   * An operator can always clear a stuck flag with
--     `SELECT public.set_password_change_required('<uuid>', false);` as
--     service_role or postgres. Documented in docs/runbooks/auth-security.md.
--
-- ROLLBACK is forward-only, as always in this repository. To disable the gate
-- without dropping anything:
--     ALTER ROLE authenticator RESET pgrst.db_pre_request;
--     NOTIFY pgrst, 'reload config';
-- Nothing here is dropped, truncated or destructively altered, and no statement
-- disables row-level security.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. The protected column
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.protect_must_change_password()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_catalog
AS $$
BEGIN
  -- Nothing to police unless the value actually moves. `IS DISTINCT FROM` and
  -- not `<>` so a NULL on either side counts as a change rather than silently
  -- comparing to unknown.
  IF NEW.must_change_password IS NOT DISTINCT FROM OLD.must_change_password THEN
    RETURN NEW;
  END IF;

  -- SECURITY INVOKER, so `current_user` is the role that issued the UPDATE:
  -- `authenticated` or `anon` for anything arriving through PostgREST with a
  -- browser's token, `service_role` for this application's server endpoints,
  -- `postgres`/`supabase_admin` for migrations and operator sessions.
  IF current_user IN ('authenticated', 'anon') THEN
    RAISE EXCEPTION
      'must_change_password is not writable by %; it is set and cleared only by trusted server operations',
      current_user
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'Complete the password change at /change-password, or have an administrator use public.set_password_change_required().';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.protect_must_change_password() IS
  'Refuses any UPDATE that moves profiles.must_change_password when the caller is authenticated or anon. The baseline profiles UPDATE policy covers the whole row, so without this the account the flag restrains can clear it with one PostgREST PATCH. Every other column keeps its existing permissions.';

-- Created ADDITIVELY, guarded on the catalog.
--
-- An earlier form of this migration opened with `DROP TRIGGER IF EXISTS`. That
-- is a destructive statement in a repository whose Hard Rules say migrations are
-- additive only (CLAUDE.md -> Database Safety), and it was unnecessary: the
-- trigger does not exist on the clean base this branch is cut from. The
-- existence check makes the migration re-runnable without a DROP, and
-- `scripts/ci/check-destructive-migrations.mjs` now fails CI if a DROP,
-- TRUNCATE, row-security disable or destructive ALTER reappears in any
-- migration.
--
-- The trigger's BEHAVIOUR is upgraded by CREATE OR REPLACE on the function
-- above, which is where all the logic lives, so nothing has to be recreated to
-- change what it does.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM pg_trigger t
      JOIN pg_class c ON c.oid = t.tgrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relname = 'profiles'
       AND t.tgname  = 'protect_must_change_password'
       AND NOT t.tgisinternal
  ) THEN
    CREATE TRIGGER protect_must_change_password
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW
      EXECUTE FUNCTION public.protect_must_change_password();
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- The trusted write path
--
-- `service_role` may write the column directly (the trigger permits it, and the
-- provisioning endpoints do exactly that inside larger upserts). This function
-- exists for the password-completion endpoints, where two extra properties
-- matter: the write is one statement with a single well-known name, and the
-- return value says whether a row was actually touched — so "the account did not
-- exist" cannot be mistaken for "the flag was cleared".
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_password_change_required(
  p_user_id uuid,
  p_required boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_user_id IS NULL OR p_required IS NULL THEN
    RAISE EXCEPTION 'set_password_change_required requires a user id and a boolean'
      USING ERRCODE = 'invalid_parameter_value';
  END IF;

  UPDATE public.profiles
     SET must_change_password = p_required
   WHERE id = p_user_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.set_password_change_required(uuid, boolean) IS
  'The trusted write path for profiles.must_change_password. Returns true only when a row was actually updated, so a caller cannot report success for an account that does not exist. service_role only — REVOKEd from PUBLIC, anon and authenticated.';

REVOKE ALL ON FUNCTION public.set_password_change_required(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_password_change_required(uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.set_password_change_required(uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.set_password_change_required(uuid, boolean) TO service_role;

-- -----------------------------------------------------------------------------
-- C. The one route that stays open while the flag is set
--
-- SECURITY DEFINER and it reads only the caller's OWN row: the argument is
-- `auth.uid()`, never a parameter, so it cannot be pointed at anybody else.
-- Returns a boolean, not the profile.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.current_password_change_state()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT COALESCE(
    (SELECT p.must_change_password FROM public.profiles p WHERE p.id = auth.uid()),
    false
  );
$$;

COMMENT ON FUNCTION public.current_password_change_state() IS
  'Whether the CALLING account must change its password. Takes no argument by design — it reads auth.uid() and nothing else, so it cannot disclose another account state. This is the single PostgREST route gate_password_change() leaves open for a flagged account, because the middleware must be able to ask.';

REVOKE ALL ON FUNCTION public.current_password_change_state() FROM PUBLIC;
-- Supabase's ALTER DEFAULT PRIVILEGES grants EXECUTE on new public functions to
-- anon and authenticated, and revoking from PUBLIC does not take away an
-- explicit grant. anon is named so the revoke actually lands.
REVOKE ALL ON FUNCTION public.current_password_change_state() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_password_change_state() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_password_change_state() TO service_role;

-- -----------------------------------------------------------------------------
-- B. The pre-request gate
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.gate_password_change()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_claims   jsonb;
  v_uid      uuid;
  v_required boolean;
  v_path     text;
BEGIN
  -- WHICH REQUESTS ARE GATED, and why the test is what it is.
  --
  -- PostgREST switches to the request's role (anon / authenticated /
  -- service_role) and THEN calls this function. The obvious test would be
  -- `current_user = 'authenticated'` — and it is wrong here, because this
  -- function is SECURITY DEFINER: inside it, `current_user` is the OWNER
  -- (postgres), never the API role. A gate written that way silently never
  -- fires, which is exactly the failure mode it exists to prevent.
  --
  -- The role in `request.jwt.claims` is the right thing to read. PostgREST puts
  -- it there from the VERIFIED token, and it is the same claim PostgREST used to
  -- decide which role to switch to — so trusting it is no weaker than trusting
  -- the switch. A caller cannot claim `service_role` without holding a token
  -- signed with the project secret, and if they held one they would not need
  -- this bypass.
  --
  -- Only browser traffic is gated: `anon` has no account to flag, and
  -- `service_role` is this application's own server code, which is what CLEARS
  -- the flag.
  BEGIN
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
  EXCEPTION WHEN others THEN
    -- A malformed claims blob is not an authenticated user we can identify.
    -- There is nothing to gate, and the request still has to satisfy RLS on
    -- whatever it touches. Turning this into an exception would take the whole
    -- API down for everyone.
    RETURN;
  END;

  IF v_claims IS NULL OR v_claims ->> 'role' IS DISTINCT FROM 'authenticated' THEN
    RETURN;
  END IF;

  BEGIN
    v_uid := (v_claims ->> 'sub')::uuid;
  EXCEPTION WHEN others THEN
    v_uid := NULL;
  END;

  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  -- The account's own row. SECURITY DEFINER is what makes this read reliable:
  -- the owner bypasses RLS, so the answer does not depend on a `profiles` policy
  -- continuing to expose the row. Zero rows means no flag (see the header).
  SELECT p.must_change_password
    INTO v_required
    FROM public.profiles p
   WHERE p.id = v_uid;

  IF v_required IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Flagged. One allowance, and one only: the state probe the middleware calls.
  v_path := current_setting('request.path', true);
  IF v_path IS NOT NULL AND v_path LIKE '%/rpc/current_password_change_state' THEN
    RETURN;
  END IF;

  -- 42501 -> HTTP 403 at PostgREST. Not 401: the caller IS authenticated, and a
  -- 401 sends well-behaved clients into a re-authentication loop that cannot
  -- possibly clear the flag.
  RAISE EXCEPTION 'PASSWORD_CHANGE_REQUIRED'
    USING ERRCODE = 'insufficient_privilege',
          DETAIL  = 'Debes cambiar tu contraseña antes de continuar.',
          HINT    = 'Complete the forced password change before using the API.';
END;
$$;

COMMENT ON FUNCTION public.gate_password_change() IS
  'PostgREST pre-request gate. Refuses every REST request made as authenticated by an account whose profiles.must_change_password is set, except the current_password_change_state() probe the middleware needs. Role-agnostic, so it covers all nine roles without a per-role list. Installed via ALTER ROLE authenticator SET pgrst.db_pre_request.';

REVOKE ALL ON FUNCTION public.gate_password_change() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.gate_password_change() TO authenticator;
GRANT EXECUTE ON FUNCTION public.gate_password_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.gate_password_change() TO anon;
GRANT EXECUTE ON FUNCTION public.gate_password_change() TO service_role;

-- Install it. `authenticator` is the role PostgREST logs in as before switching
-- to anon/authenticated/service_role, so the setting belongs there.
--
-- Guarded on the role existing so the migration is portable to a bare Postgres
-- (a plain `psql` restore of the schema, for instance) — but NOT swallowed if
-- the ALTER itself fails, because a gate that silently did not install is worse
-- than one that fails the deploy. `supabase/tests/051-...` re-reads
-- pg_db_role_setting afterwards and fails if the wiring is absent, so a skipped
-- install cannot pass CI either.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticator') THEN
    EXECUTE 'ALTER ROLE authenticator SET pgrst.db_pre_request = ''public.gate_password_change''';
  ELSE
    RAISE WARNING 'role "authenticator" is absent; pgrst.db_pre_request was not installed (expected only outside a Supabase stack)';
  END IF;
END
$$;

NOTIFY pgrst, 'reload config';
