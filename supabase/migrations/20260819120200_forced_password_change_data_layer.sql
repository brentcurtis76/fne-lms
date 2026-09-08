-- =============================================================================
-- The forced-password-change boundary, at the DATA layer
--
-- WHAT THE PREVIOUS MIGRATION GOT WRONG, and this one fixes.
--
-- `20260819120000_forced_password_change_boundary.sql` installed the gate on
-- `pgrst.db_pre_request`. PostgREST calls that function before every request it
-- serves, so the gate covers the whole Data API -- and NOTHING ELSE. The review
-- request claimed no non-PostgREST browser path existed. That was wrong. This
-- application talks to two more Supabase services straight from the browser:
--
--   STORAGE   lib/supabaseEnhanced.ts uploads, components/meetings/persistMeeting.ts
--             removes objects, components/assignments/CollaborativeSubmissionModal.tsx
--             reads public URLs, utils/storage.js and pages/admin/bucket-test.tsx
--             list buckets. Storage speaks to Postgres through storage-api, not
--             through PostgREST, so `pgrst.db_pre_request` never runs.
--
--   REALTIME  contexts/AvatarContext.tsx, utils/messagingUtils-simple.ts,
--             utils/activityUtils.ts, lib/realtimeNotifications.js and
--             pages/noticias.tsx all open `postgres_changes` channels. Row
--             delivery is decided by the Realtime service, again not by
--             PostgREST.
--
-- A flagged account holds a perfectly ordinary access token. Until this
-- migration it could keep uploading files, deleting meeting documents and
-- receiving live rows for everything its policies allowed, while the application
-- believed it was held at /change-password.
--
-- WHAT THIS MIGRATION DOES.
--
--   1. ONE PREDICATE. `public.password_change_gate_ok()` answers a single
--      question -- "may auth.uid() use protected data right now?" -- and is the
--      only place the rule is written down. It is an ALLOW predicate (true means
--      permitted) so it can be dropped straight into a policy expression.
--
--   2. RESTRICTIVE POLICIES, EVERYWHERE ROW SECURITY EXISTS. A restrictive
--      policy is ANDed with whatever permissive policies a table already has, so
--      it can only ever narrow access; it cannot grant anything. One is created
--      on every row-secured table in `public`, and on the browser-reachable
--      tables in `storage`. Because the check lives under the tables themselves,
--      it holds for PostgREST, Storage and Realtime alike -- and for any future
--      service that reaches these rows as `authenticated`.
--
--   3. A HELPER A FUTURE MIGRATION CAN CALL IN ONE LINE.
--      `public.apply_forced_password_change_guard('public','new_table')`.
--      `supabase/tests/053-forced-password-change-data-layer.sql` enumerates the
--      catalog and FAILS if a row-secured table does not carry the guard, so a
--      future table cannot join the schema without joining this boundary.
--
-- WHAT IS STILL COVERED BY THE PRE-REQUEST GATE ALONE, stated plainly:
--
--   * RPCs declared SECURITY DEFINER bypass row security by definition -- that
--     is what SECURITY DEFINER means -- so no policy can gate them. The
--     pre-request gate refuses them for a flagged caller, and the sensitive ones
--     in this branch (`set_password_change_required`, `claim_invitation_resend`)
--     additionally REVOKE EXECUTE from `authenticated`.
--   * The 22 legacy tables in `public` that have row security switched off
--     (pinned by `supabase/tests/001-rls-enabled.sql`) cannot carry a policy at
--     all. They are reachable only through PostgREST, where the gate covers
--     them. Emptying that allowlist is tracked separately and is out of scope
--     here.
--
-- SERVICE-ROLE OPERATIONS ARE UNAFFECTED. `service_role` holds BYPASSRLS, and
-- every policy below names `authenticated` only. The endpoints that COMPLETE a
-- forced change all run on the service-role client, so the way out never runs
-- through the door being held shut.
--
-- ADDITIVE. Creates two functions and one policy per table. Nothing is dropped,
-- truncated or destructively altered; no statement turns row security off; no
-- existing policy is modified. `scripts/ci/check-destructive-migrations.mjs`
-- enforces that mechanically.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. The one predicate
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.password_change_gate_ok()
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid uuid;
BEGIN
  -- TRUE means "allowed". The question is asked of `auth.uid()` and of nothing
  -- the caller supplies, so there is no argument to point at another account.
  --
  -- SECURITY DEFINER matters twice over. It makes the read reliable (the owner
  -- is not subject to a `profiles` policy that might stop exposing the row), and
  -- it is what makes this safe to reference from a policy ON `public.profiles`:
  -- the owner holds BYPASSRLS, so evaluating the policy does not re-enter policy
  -- evaluation.
  BEGIN
    v_uid := auth.uid();
  EXCEPTION WHEN others THEN
    -- A claims blob that will not parse is not an identity we can clear. There
    -- is no verified token that produces one, so this is a misconfiguration
    -- rather than a caller -- and a predicate that cannot identify the caller
    -- must DENY, not wave them through. Note this is the opposite choice from
    -- `gate_password_change()` at the request layer, on purpose: there the blast
    -- radius of raising is the whole API, here it is one query.
    RETURN false;
  END;

  IF v_uid IS NULL THEN
    -- No subject at all: anon, or a server role. There is no account to hold,
    -- and the policy is TO authenticated anyway.
    RETURN true;
  END IF;

  -- NOT EXISTS, deliberately: an account with no profile row is NOT flagged and
  -- is allowed. That is the rule `verdictFromProfile` applies in
  -- lib/auth/forced-password-change.ts and the rule `gate_password_change()`
  -- applies at the request layer -- the alternative locks out every account in
  -- the window between sign-up and the profile trigger.
  RETURN NOT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.id = v_uid
       AND p.must_change_password IS TRUE
  );
END;
$$;

COMMENT ON FUNCTION public.password_change_gate_ok() IS
  'The single forced-password-change predicate. TRUE when the calling account may use protected data; FALSE while profiles.must_change_password is set for auth.uid(). Referenced by the restrictive forced_password_change_guard policy on every row-secured table in public and on the browser-reachable storage tables, so the rule holds for PostgREST, Storage and Realtime alike. Takes no argument by design.';

REVOKE ALL ON FUNCTION public.password_change_gate_ok() FROM PUBLIC;
-- Every role that can be the invoker of a policy check needs EXECUTE, including
-- anon (a row-secured table may be read anonymously) and the storage/realtime
-- service roles, which evaluate policies while impersonating `authenticated`.
GRANT EXECUTE ON FUNCTION public.password_change_gate_ok() TO anon;
GRANT EXECUTE ON FUNCTION public.password_change_gate_ok() TO authenticated;
GRANT EXECUTE ON FUNCTION public.password_change_gate_ok() TO service_role;
GRANT EXECUTE ON FUNCTION public.password_change_gate_ok() TO authenticator;

-- -----------------------------------------------------------------------------
-- 2. The helper that installs the guard on one table
--
-- Idempotent, and it refuses silently to do nothing: a table without row
-- security cannot carry a policy, so it raises instead of leaving a hole that
-- looks closed. Not granted to any API role -- it performs DDL, and the only
-- caller is a migration running as the schema owner.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_forced_password_change_guard(
  p_schema text,
  p_table  text
)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  v_oid oid;
  v_rls boolean;
BEGIN
  SELECT c.oid, c.relrowsecurity
    INTO v_oid, v_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = p_schema
     AND c.relname = p_table
     AND c.relkind = 'r';

  IF v_oid IS NULL THEN
    RAISE EXCEPTION 'apply_forced_password_change_guard: %.% is not an ordinary table', p_schema, p_table
      USING ERRCODE = 'undefined_table';
  END IF;

  IF NOT v_rls THEN
    RAISE EXCEPTION 'apply_forced_password_change_guard: row level security is not enabled on %.%, so a restrictive policy would enforce nothing', p_schema, p_table
      USING ERRCODE = 'invalid_table_definition',
            HINT = 'Enable row level security on the table first (CLAUDE.md: every table in public has it).';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_policy WHERE polrelid = v_oid AND polname = 'forced_password_change_guard'
  ) THEN
    RETURN false;   -- already installed; nothing to do and nothing to replace
  END IF;

  EXECUTE format(
    'CREATE POLICY forced_password_change_guard ON %I.%I'
    || ' AS RESTRICTIVE FOR ALL TO authenticated'
    -- Wrapped in a scalar sub-select so the planner evaluates it once per query
    -- as an InitPlan rather than once per row.
    || ' USING ((SELECT public.password_change_gate_ok()))'
    || ' WITH CHECK ((SELECT public.password_change_gate_ok()))',
    p_schema, p_table
  );

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.apply_forced_password_change_guard(text, text) IS
  'Installs the restrictive forced_password_change_guard policy on one row-secured table. Idempotent. Raises rather than returning quietly when the table does not exist or has row security switched off, because a guard that enforces nothing is worse than no guard. A future migration that adds a table calls this once; supabase/tests/053 fails CI if it does not.';

REVOKE ALL ON FUNCTION public.apply_forced_password_change_guard(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_forced_password_change_guard(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.apply_forced_password_change_guard(text, text) FROM authenticated;
REVOKE ALL ON FUNCTION public.apply_forced_password_change_guard(text, text) FROM service_role;

-- -----------------------------------------------------------------------------
-- 3. Install it on every row-secured table in `public`
--
-- Driven off the catalog rather than a hand-maintained list, because a
-- hand-maintained list is exactly the kind of evidence the review refused.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  r          record;
  v_created  integer := 0;
  v_skipped  integer := 0;
BEGIN
  FOR r IN
    SELECT n.nspname AS schema_name, c.relname AS table_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND c.relrowsecurity
     ORDER BY c.relname
  LOOP
    IF public.apply_forced_password_change_guard(r.schema_name, r.table_name) THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'forced_password_change_guard: % created, % already present in public', v_created, v_skipped;

  IF v_created + v_skipped = 0 THEN
    RAISE EXCEPTION 'forced_password_change_guard: no row-secured table found in public -- refusing to report success on an empty boundary';
  END IF;
END
$$;

-- -----------------------------------------------------------------------------
-- 4. Storage -- the service the pre-request gate never saw
--
-- `storage.objects` is where listing, download, upload, update and delete are
-- all authorised; `storage.buckets` is where `listBuckets()` is. The multipart
-- tables are the resumable-upload path. All four are row-secured out of the box
-- on Supabase.
--
-- The DDL runs as the migration role. If that role cannot create a policy on the
-- storage tables the migration FAILS -- deliberately. A storage boundary that
-- quietly did not install is the exact shape of the finding this migration
-- exists to answer.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  t          text;
  v_applied  integer := 0;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'storage') THEN
    RAISE EXCEPTION 'forced_password_change_guard: schema "storage" is absent -- this migration targets a Supabase stack';
  END IF;

  FOREACH t IN ARRAY ARRAY['objects', 'buckets', 's3_multipart_uploads', 's3_multipart_uploads_parts']
  LOOP
    IF EXISTS (
      SELECT 1
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'storage' AND c.relname = t AND c.relkind = 'r'
    ) THEN
      PERFORM public.apply_forced_password_change_guard('storage', t);
      v_applied := v_applied + 1;
    END IF;
  END LOOP;

  IF v_applied = 0 THEN
    RAISE EXCEPTION 'forced_password_change_guard: no storage table was guarded -- refusing to leave Storage uncovered';
  END IF;

  RAISE NOTICE 'forced_password_change_guard: % storage table(s) guarded', v_applied;
END
$$;

-- -----------------------------------------------------------------------------
-- 5. Realtime
--
-- Realtime needs no separate object. `postgres_changes` delivers a row to a
-- subscriber only if that subscriber could SELECT it, and the check runs as
-- `authenticated` with the subscriber's own JWT claims installed -- so the
-- restrictive policy created in step 3 is exactly the control that stops
-- delivery. Every table this application subscribes to is in `public` and row
-- secured, so all of them are covered by construction.
--
-- This block asserts that rather than assuming it: if a table is published to
-- `supabase_realtime` and does NOT carry the guard, the migration fails.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  v_missing text[];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    RAISE NOTICE 'forced_password_change_guard: publication supabase_realtime is absent; nothing to check';
    RETURN;
  END IF;

  SELECT coalesce(array_agg(format('%s.%s', pt.schemaname, pt.tablename) ORDER BY pt.tablename), '{}')
    INTO v_missing
    FROM pg_publication_tables pt
   WHERE pt.pubname = 'supabase_realtime'
     AND NOT EXISTS (
       SELECT 1
         FROM pg_policy po
         JOIN pg_class c   ON c.oid = po.polrelid
         JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = pt.schemaname
          AND c.relname = pt.tablename
          AND po.polname = 'forced_password_change_guard'
     );

  IF array_length(v_missing, 1) IS NOT NULL THEN
    RAISE EXCEPTION 'forced_password_change_guard: realtime publishes table(s) with no guard: %', array_to_string(v_missing, ', ');
  END IF;
END
$$;

-- The pre-request gate stays installed as defence in depth: it still refuses
-- SECURITY DEFINER RPCs and the legacy tables that carry no row security, which
-- no policy can reach.
NOTIFY pgrst, 'reload config';
