-- =============================================================================
-- 20260907120000_learning_path_governance.sql — W-B2c-01 (lote B2c)
--
-- Learning-path security correction under the owner decisions of 2026-08-29
-- (docs/reviews/w-b2c-01-learning-path-governance-correction-2026-08-29.md §1,
-- access model §5, acceptance criteria §7):
--
--   * learning_paths rows are GLOBAL FNE templates — no school or generation
--     owns a path; school_id / generation_id NULL is intentional global scope.
--   * Only the literal RBAC role `admin` (public.auth_is_admin(), derived from
--     auth.uid()) may create, edit, delete, assign or unassign paths.
--   * An assigned user, or an active member of an assigned group, may READ
--     the assigned template and its course links and may update ONLY their
--     own progress (their own assignment progress columns and their own
--     progress-session rows).
--   * Anonymous callers have no access of any kind.
--   * Authority is derived from the authenticated identity (auth.uid()).
--     Caller-supplied actor identifiers (p_created_by, p_updated_by,
--     p_assigned_by, p_user_id) are no longer authorization inputs: they are
--     kept only because CREATE OR REPLACE cannot change a signature, and a
--     value that disagrees with auth.uid() is rejected.
--
-- Scope (exactly the frozen W-B2c-01 inventory): the four tables
-- learning_paths, learning_path_courses, learning_path_assignments,
-- learning_path_progress_sessions and the eight SECURITY DEFINER functions
-- create_full_learning_path, update_full_learning_path,
-- batch_assign_learning_path, start_learning_path_session,
-- end_learning_path_session, auth_is_learning_path_member,
-- increment_path_assignment_time, update_session_heartbeat — plus two new
-- auth.uid()-derived helpers the policies need.
--
-- Committed-baseline state (00000000000000_baseline.sql):
--   learning_paths / learning_path_courses: row security OFF, zero policies,
--     GRANT ALL to anon, authenticated, service_role.
--   learning_path_assignments: row security ON, four permissive USING (true)
--     policies with no TO clause (they applied to anon too), one own-row
--     UPDATE policy, GRANT ALL to anon, authenticated, service_role.
--   learning_path_progress_sessions: row security ON, own-row policies +
--     admin + service_role; GRANT ALL to anon (no policy — denied by row
--     security, but the TRUNCATE privilege is not governed by it).
--   All eight functions: EXECUTE to PUBLIC (Postgres default), anon,
--     authenticated, service_role; two without a configured search_path.
--
-- Method (additive, forward-only: no DROP, no TRUNCATE, no destructive
-- ALTER, and row security is only ever switched ON):
--   * REVOKE ALL from PUBLIC and anon on the four tables. anon keeps nothing.
--   * REVOKE TRUNCATE, REFERENCES, TRIGGER from authenticated: TRUNCATE is
--     not subject to row security, so a GRANT ALL left a bypass.
--   * ENABLE ROW LEVEL SECURITY on the two open tables; install the
--     repository-required restrictive forced_password_change_guard (053
--     catalog invariant) through the existing installer.
--   * Policies: admin-manage (FOR ALL) + assignee-read (FOR SELECT) on the two
--     template tables; the four open assignment policies are tightened with
--     ALTER POLICY (TO authenticated, admin-only writes, admin-or-own-or-group
--     reads); assignment UPDATE for authenticated is restricted at the column
--     level to the three columns the activity route writes (no authoritative
--     timing column); progress-session INSERT / UPDATE are column-level too
--     (no timing, identity or settlement column) and the policies require the
--     path to be assigned to the caller AND the session's course to belong to
--     that path.
--   * Group membership is resolved through community_workspaces.community_id
--     (workspace -> growth community -> user_roles); the workspace id is never
--     compared with user_roles.community_id.
--   * Functions: CREATE OR REPLACE with the same signatures, actor derived
--     from auth.uid(), search_path pinned, EXECUTE revoked from PUBLIC and
--     anon everywhere and from service_role where no backend caller exists.
--     Session minutes are credited to the assignment only by the settlement
--     pair (settle_learning_path_sessions, internal; close_stale_…, service
--     role) from server-computed minutes, at most once per session
--     (settled_at); increment_path_assignment_time (caller-supplied minutes)
--     is executable by no application role.
--   * service_role keeps its baseline table grants: the two maintenance
--     routes (update-learning-path-summaries, cleanup-learning-path-sessions),
--     pages/api/admin/users.ts and the assignment-matrix reads use it and are
--     gated at the API boundary (CRON_SECRET / literal admin).
--
-- R3 corrections folded into this (uncommitted) migration on 2026-09-07 so no
-- migration-prefix state carries the defect (Codex re-review R3):
--   R3-01 update_session_heartbeat / end_learning_path_session require CURRENT
--         assignment authority for new activity; an open session of a learner
--         who lost it settles up to their last authorized heartbeat only.
--   R3-02 one global lock order for every session writer:
--         advisory(user, path) -> session rows -> progress rows (helper
--         lp_lock_session_pairs; end and the maintenance close take the
--         advisory lock(s) before any row lock).
--   R3-05 updated_at is in the authenticated UPDATE grant from this migration
--         on, so the previously deployed activity route keeps working at every
--         prefix of the sequence (the row trigger overwrites the value).
--
-- R4 correction folded into this (uncommitted) migration on 2026-09-07
-- (Codex re-review R4, rls-rereview-r3-2026-09-07.md):
--   R4-01 last_heartbeat is SERVER-DERIVED on every permitted write path. The
--         column stays in the authenticated UPDATE grant (the previously
--         deployed activity route writes it, R3-05), but a BEFORE INSERT OR
--         UPDATE OF last_heartbeat trigger replaces whatever an application
--         principal sends with now() and clamps every other writer to now()
--         (never the future). Final settlement of a revoked learner and the
--         maintenance close read the heartbeat through
--         lp_last_authorized_heartbeat() uses a protected persisted ceiling
--         (R5-01) rather than the current clock. Historical values beyond the
--         migration boundary never gain eligibility through passage of time.
--         New authorized activity establishes a new server-derived mark.
--
-- pgTAP evidence: supabase/tests/070-learning-path-governance.sql,
-- supabase/tests/074-r3-remediation.sql, supabase/tests/075-r4-remediation.sql;
-- scripts/ci/lp-session-settlement-proof.mjs.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Helpers — actor derived from auth.uid(), never from a parameter.
-- -----------------------------------------------------------------------------

-- An assigned group is a community WORKSPACE (learning_path_assignments.group_id
-- REFERENCES community_workspaces.id). Membership lives on the growth community
-- behind that workspace (user_roles.community_id REFERENCES growth_communities.id;
-- community_workspaces.community_id is UNIQUE, so the relation is 1:1). The two
-- identifiers are different uuids and are never compared to each other: every
-- membership resolution below joins workspace -> community -> user_roles.
--
-- TRUE when the calling user is an ACTIVE member of the community behind the
-- given assigned group (workspace).
CREATE OR REPLACE FUNCTION public.auth_is_assigned_group_member(p_group_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_group_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.community_workspaces cw
         JOIN public.user_roles ur ON ur.community_id = cw.community_id
        WHERE cw.id = p_group_id
          AND ur.user_id = auth.uid()
          AND ur.is_active = true
     );
$$;

COMMENT ON FUNCTION public.auth_is_assigned_group_member(uuid) IS
  'W-B2c-01 helper: TRUE when auth.uid() holds an active user_roles row for the growth community behind the given assigned group (community_workspaces.id -> community_workspaces.community_id -> user_roles.community_id). Takes the group only; the actor is never a parameter.';

REVOKE ALL ON FUNCTION public.auth_is_assigned_group_member(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_assigned_group_member(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_is_assigned_group_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_assigned_group_member(uuid) TO service_role;

-- TRUE when the calling user is assigned to the given path directly or
-- through an active membership of an assigned group.
CREATE OR REPLACE FUNCTION public.auth_is_learning_path_assignee(p_path_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_path_id IS NOT NULL
     AND auth.uid() IS NOT NULL
     AND EXISTS (
       SELECT 1
         FROM public.learning_path_assignments lpa
        WHERE lpa.path_id = p_path_id
          AND (
            lpa.user_id = auth.uid()
            OR (
              lpa.group_id IS NOT NULL
              AND EXISTS (
                SELECT 1
                  FROM public.community_workspaces cw
                  JOIN public.user_roles ur ON ur.community_id = cw.community_id
                 WHERE cw.id = lpa.group_id
                   AND ur.user_id = auth.uid()
                   AND ur.is_active = true
              )
            )
          )
     );
$$;

COMMENT ON FUNCTION public.auth_is_learning_path_assignee(uuid) IS
  'W-B2c-01 helper: TRUE when auth.uid() is assigned to the path directly or via an active membership of the community behind an assigned group workspace. Consumption authority for templates and course links; the actor is never a parameter.';

REVOKE ALL ON FUNCTION public.auth_is_learning_path_assignee(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.auth_is_learning_path_assignee(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.auth_is_learning_path_assignee(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_learning_path_assignee(uuid) TO service_role;

-- TRUE when the course is part of the path (NULL course = path-level activity).
-- Used by the progress-session policies and RPC so a session can never be
-- attributed to a course outside its own path.
CREATE OR REPLACE FUNCTION public.learning_path_has_course(p_path_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_course_id IS NULL
      OR EXISTS (
        SELECT 1
          FROM public.learning_path_courses lpc
         WHERE lpc.learning_path_id = p_path_id
           AND lpc.course_id = p_course_id
      );
$$;

COMMENT ON FUNCTION public.learning_path_has_course(uuid, uuid) IS
  'W-B2c-01 helper: TRUE when p_course_id is NULL or belongs to the given path. Session course scope predicate.';

REVOKE ALL ON FUNCTION public.learning_path_has_course(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.learning_path_has_course(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.learning_path_has_course(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.learning_path_has_course(uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- 2. learning_paths — global FNE templates
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.learning_paths FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_paths FROM authenticated;
ALTER TABLE public.learning_paths ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_paths_admin_manage ON public.learning_paths
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY learning_paths_assignee_read ON public.learning_paths
  FOR SELECT TO authenticated
  USING (public.auth_is_learning_path_assignee(id));

SELECT public.apply_forced_password_change_guard('public', 'learning_paths');

COMMENT ON TABLE public.learning_paths IS
  'Global FNE learning-path templates (owner decision 2026-08-29): no school or generation owns a path; school_id / generation_id NULL is intentional global scope. Management is literal-admin-only; assigned users read their assigned templates.';

-- -----------------------------------------------------------------------------
-- 3. learning_path_courses — composition of a template
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.learning_path_courses FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_courses FROM authenticated;
ALTER TABLE public.learning_path_courses ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_path_courses_admin_manage ON public.learning_path_courses
  FOR ALL TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

CREATE POLICY learning_path_courses_assignee_read ON public.learning_path_courses
  FOR SELECT TO authenticated
  USING (public.auth_is_learning_path_assignee(learning_path_id));

SELECT public.apply_forced_password_change_guard('public', 'learning_path_courses');

-- -----------------------------------------------------------------------------
-- 4. learning_path_assignments — availability, not ownership
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.learning_path_assignments FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_assignments FROM authenticated;

-- Column-level UPDATE for the application role: exactly the progress columns
-- the product writes through the caller's session (pages/api/learning-paths/
-- session/activity.ts: current_course_sequence + last_activity_at on
-- course_start, completed_at + last_activity_at on path_complete). The own-row
-- policy below still binds WHICH rows; this binds WHICH columns, so an assignee
-- cannot move their row to another path, user or group, forge assigned_by /
-- assigned_at, nor write the authoritative timing columns (started_at,
-- total_time_spent_minutes) — those are set only by the SECURITY DEFINER
-- session functions from server-side clocks. progress_percentage has no
-- application writer and stays server-side as well.
REVOKE UPDATE ON TABLE public.learning_path_assignments FROM authenticated;
GRANT UPDATE (
  last_activity_at,
  completed_at,
  current_course_sequence
) ON TABLE public.learning_path_assignments TO authenticated;

-- The four baseline policies were USING (true) with no TO clause. ALTER POLICY
-- keeps the names (no DROP) and rewrites their meaning.
ALTER POLICY learning_path_assignments_select_policy ON public.learning_path_assignments
  TO authenticated
  USING (
    public.auth_is_admin()
    OR user_id = auth.uid()
    OR (group_id IS NOT NULL AND public.auth_is_assigned_group_member(group_id))
  );

ALTER POLICY learning_path_assignments_insert_policy ON public.learning_path_assignments
  TO authenticated
  WITH CHECK (public.auth_is_admin());

ALTER POLICY learning_path_assignments_update_policy ON public.learning_path_assignments
  TO authenticated
  USING (public.auth_is_admin())
  WITH CHECK (public.auth_is_admin());

ALTER POLICY learning_path_assignments_delete_policy ON public.learning_path_assignments
  TO authenticated
  USING (public.auth_is_admin());

-- learning_path_assignments_user_progress_update (own-row UPDATE, TO
-- authenticated, USING / WITH CHECK user_id = auth.uid()) is kept as is: with
-- the column-level grant above it now means "own progress columns only".

-- -----------------------------------------------------------------------------
-- 5. learning_path_progress_sessions — own progress only
-- -----------------------------------------------------------------------------

REVOKE ALL ON TABLE public.learning_path_progress_sessions FROM PUBLIC, anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.learning_path_progress_sessions FROM authenticated;

-- Settlement marker (additive): when the closed session's minutes were folded
-- into the assignment (or found no assignment row to credit). NULL on every
-- open session. Set only by settle_learning_path_sessions(); never by a client.
ALTER TABLE public.learning_path_progress_sessions
  ADD COLUMN IF NOT EXISTS settled_at timestamptz;

-- R5-01: a fixed historical boundary, installed atomically with the guard.
-- now() is the migration transaction's start, NOT a moving settlement clock.
-- Existing raw heartbeats and earned credit are preserved. Values beyond this
-- boundary (including infinity) remain ineligible until a permitted heartbeat
-- write replaces the raw value AND ceiling together. A concurrent legacy write
-- later than this boundary is conservatively ineligible too. No historical
-- authorization history is inferred from a plausible legacy timestamp.
ALTER TABLE public.learning_path_progress_sessions
  ADD COLUMN heartbeat_trust_ceiling timestamptz NOT NULL DEFAULT now();
COMMENT ON COLUMN public.learning_path_progress_sessions.heartbeat_trust_ceiling IS
  'R5-01 protected fixed boundary: historical heartbeat eligibility is last_heartbeat <= this ceiling. Initialized at migration transaction start; only a new guarded heartbeat refreshes it. Passage of time never changes eligibility.';

COMMENT ON COLUMN public.learning_path_progress_sessions.settled_at IS
  'W-B2c-01: set once by settle_learning_path_sessions() when the closed session was credited to learning_path_assignments (at most once) or had no assignment row to credit. NULL while open or unsettled.';

-- Sessions closed before this migration were credited by the retired client
-- path (end.ts -> increment_path_assignment_time with caller minutes). They
-- are marked settled so the new server-side settlement never credits them a
-- second time. Row values are otherwise untouched.
UPDATE public.learning_path_progress_sessions
   SET settled_at = session_end
 WHERE session_end IS NOT NULL
   AND settled_at IS NULL;

-- Column-level INSERT / UPDATE for the application role. Identity and
-- attribution (id, user_id, path_id after insert), the authoritative timing
-- columns (session_start, session_end, time_spent_minutes, created_at) and the
-- settlement marker are never client-writable: they are set by defaults, the
-- updated_at trigger and the SECURITY DEFINER session functions. The only
-- direct writer in the product is pages/api/learning-paths/session/activity.ts
-- (activity_type, course_id, last_heartbeat on the caller's own open session).
-- updated_at stays in the UPDATE grant (R3-05): the application version that
-- is deployed while this migration applies writes it in that route, and the
-- BEFORE UPDATE row trigger overwrites whatever value arrives with now(), so
-- the grant exposes nothing and keeps every migration-prefix state compatible
-- with the running application. last_heartbeat stays in the grant for the same
-- reason and is protected the same way (R4-01, section 5a below): the value an
-- application principal sends is discarded and replaced by the server clock,
-- so the grant exposes the column name, never its timing. Nothing deletes
-- sessions through an application role (cleanup archives through service_role).
REVOKE INSERT, UPDATE, DELETE ON TABLE public.learning_path_progress_sessions FROM authenticated;
GRANT INSERT (user_id, path_id, course_id, activity_type, session_data)
  ON TABLE public.learning_path_progress_sessions TO authenticated;
GRANT UPDATE (course_id, activity_type, last_heartbeat, session_data, updated_at)
  ON TABLE public.learning_path_progress_sessions TO authenticated;

-- Own rows AND an assigned path (or admin) AND a course inside that path: a
-- user could previously insert a session against any path id, and a session
-- on path A could name a course that belongs only to path B.
ALTER POLICY "Users can insert own progress sessions" ON public.learning_path_progress_sessions
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (public.auth_is_admin() OR public.auth_is_learning_path_assignee(path_id))
    AND public.learning_path_has_course(path_id, course_id)
  );

ALTER POLICY "Users can update own progress sessions" ON public.learning_path_progress_sessions
  TO authenticated
  USING (user_id = auth.uid() AND session_end IS NULL)
  WITH CHECK (
    user_id = auth.uid()
    AND (public.auth_is_admin() OR public.auth_is_learning_path_assignee(path_id))
    AND public.learning_path_has_course(path_id, course_id)
  );

-- -----------------------------------------------------------------------------
-- 5a. The heartbeat is server-derived on EVERY write path (R4-01).
--
-- last_heartbeat is the mark final settlement and the maintenance close trust
-- as "the last moment the learner was authorized and active". The RPCs write
-- now() and require current assignment authority; the previously deployed
-- activity route (and any PostgREST caller holding the learner's token) writes
-- the column directly through the UPDATE grant above and could send any value —
-- a distant future timestamp or infinity would make settlement choose the time
-- of the end request instead of the last authorized mark. The invariant is
-- therefore enforced at the table, for every writer:
--   * an application principal (anon / authenticated) never chooses the value:
--     whatever arrives is replaced by now();
--   * every other writer (the SECURITY DEFINER session functions, service_role,
--     migrations, tests) may backdate — a backdate only reduces credit — but is
--     clamped to now(): the heartbeat can never be later than the server clock.
-- The own-row policy still decides WHETHER the learner may write (current
-- assignment, own open session); this decides WHAT is written.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.learning_path_sessions_heartbeat_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Not SECURITY DEFINER on purpose: current_user is the role the statement
  -- runs as — authenticated for a direct table write through PostgREST, the
  -- function owner inside the SECURITY DEFINER session functions.
  IF current_user IN ('anon', 'authenticated') THEN
    NEW.last_heartbeat := now();
  ELSE
    NEW.last_heartbeat := least(coalesce(NEW.last_heartbeat, now()), now());
  END IF;
  NEW.heartbeat_trust_ceiling := now();
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.learning_path_sessions_heartbeat_guard() IS
  'R4-01: BEFORE INSERT / UPDATE OF last_heartbeat — an application principal''s value is replaced by now(); any other writer is clamped to now(). The heartbeat is server-derived on every write path. Internal trigger function: no EXECUTE grant.';

REVOKE ALL ON FUNCTION public.learning_path_sessions_heartbeat_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER learning_path_progress_sessions_heartbeat_guard
  BEFORE INSERT OR UPDATE OF last_heartbeat ON public.learning_path_progress_sessions
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_sessions_heartbeat_guard();

-- Internal fixed-boundary reader. A raw timestamp without a persisted ceiling
-- establishes no trust (the default is deliberately -infinity). No wall-clock
-- comparison appears here: eligibility survives time, retries and every prefix.
CREATE OR REPLACE FUNCTION public.lp_last_authorized_heartbeat(
  p_last_heartbeat timestamptz, p_session_start timestamptz,
  p_trust_ceiling timestamptz DEFAULT '-infinity')
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN p_last_heartbeat IS NULL OR NOT isfinite(p_last_heartbeat)
      OR p_trust_ceiling IS NULL OR p_last_heartbeat > p_trust_ceiling
      THEN p_session_start
    ELSE greatest(p_last_heartbeat, p_session_start)
  END;
$$;
COMMENT ON FUNCTION public.lp_last_authorized_heartbeat(timestamptz, timestamptz, timestamptz) IS
  'R5-01: fixed persisted ceiling, never the current clock, determines historical eligibility. Raw timestamps without a ceiling are not evidence. Internal; no EXECUTE grant.';
REVOKE ALL ON FUNCTION public.lp_last_authorized_heartbeat(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;

-- The old application's service-role maintenance writes session_end directly.
-- Enforce the same disposition there, before either settlement implementation
-- can see a closed interval. Already closed history is never rewritten.
CREATE OR REPLACE FUNCTION public.learning_path_sessions_historical_close_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.session_end IS NULL AND NEW.session_end IS NOT NULL
     AND (OLD.last_heartbeat IS NULL OR NOT isfinite(OLD.last_heartbeat)
       OR OLD.last_heartbeat > OLD.heartbeat_trust_ceiling) THEN
    NEW.session_end := OLD.session_start;
    NEW.time_spent_minutes := 0;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.learning_path_sessions_historical_close_guard() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE TRIGGER learning_path_progress_sessions_historical_close_guard
  BEFORE UPDATE OF session_end ON public.learning_path_progress_sessions
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_sessions_historical_close_guard();

-- -----------------------------------------------------------------------------
-- 6. The eight SECURITY DEFINER functions — same signatures, actor from
--    auth.uid(). ERRCODE 42501 (insufficient_privilege) for every refusal.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_full_learning_path(
  p_name text,
  p_description text,
  p_course_ids uuid[],
  p_created_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_path_id uuid;
  v_course_id uuid;
  v_sequence integer := 1;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- p_created_by is not an authorization input. It is tolerated only when it
  -- names the authenticated user; any other value is a spoof attempt.
  IF p_created_by IS NOT NULL AND p_created_by <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied actor does not match the authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'User does not have permission to create learning paths' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Learning path name cannot be empty';
  END IF;
  IF p_description IS NULL OR trim(p_description) = '' THEN
    RAISE EXCEPTION 'Learning path description cannot be empty';
  END IF;

  INSERT INTO public.learning_paths (name, description, created_by)
  VALUES (p_name, p_description, v_actor)
  RETURNING id INTO v_path_id;

  IF array_length(p_course_ids, 1) > 0 THEN
    FOREACH v_course_id IN ARRAY p_course_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = v_course_id) THEN
        RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
      END IF;
      INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order)
      VALUES (v_path_id, v_course_id, v_sequence);
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;

  SELECT json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'created_by', created_by,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.learning_paths
  WHERE id = v_path_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_full_learning_path(
  p_path_id uuid,
  p_name text,
  p_description text,
  p_course_ids uuid[],
  p_updated_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_course_id uuid;
  v_sequence integer := 1;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_updated_by IS NOT NULL AND p_updated_by <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied actor does not match the authenticated user' USING ERRCODE = '42501';
  END IF;
  -- Literal admin only. The former "created_by owner may edit" path is
  -- retired: no non-admin role may edit a global template.
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'User does not have permission to update learning paths' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR trim(p_name) = '' THEN
    RAISE EXCEPTION 'Learning path name cannot be empty';
  END IF;
  IF p_description IS NULL OR trim(p_description) = '' THEN
    RAISE EXCEPTION 'Learning path description cannot be empty';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.learning_paths WHERE id = p_path_id) THEN
    RAISE EXCEPTION 'Learning path not found';
  END IF;

  UPDATE public.learning_paths
     SET name = p_name,
         description = p_description,
         updated_at = now()
   WHERE id = p_path_id;

  DELETE FROM public.learning_path_courses WHERE learning_path_id = p_path_id;

  IF array_length(p_course_ids, 1) > 0 THEN
    FOREACH v_course_id IN ARRAY p_course_ids LOOP
      IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = v_course_id) THEN
        RAISE EXCEPTION 'Course with ID % does not exist', v_course_id;
      END IF;
      INSERT INTO public.learning_path_courses (learning_path_id, course_id, sequence_order)
      VALUES (p_path_id, v_course_id, v_sequence);
      v_sequence := v_sequence + 1;
    END LOOP;
  END IF;

  SELECT json_build_object(
    'id', id,
    'name', name,
    'description', description,
    'created_by', created_by,
    'created_at', created_at,
    'updated_at', updated_at
  ) INTO v_result
  FROM public.learning_paths
  WHERE id = p_path_id;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.batch_assign_learning_path(
  p_path_id uuid,
  p_user_ids uuid[],
  p_group_ids uuid[],
  p_assigned_by uuid
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user_id uuid;
  v_group_id uuid;
  v_course_id uuid;
  v_group_member_id uuid;
  v_assignment_id uuid;
  v_success_count integer := 0;
  v_skip_count integer := 0;
  v_enroll_count integer := 0;
  v_assignments uuid[] := '{}';
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_assigned_by IS NOT NULL AND p_assigned_by <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied actor does not match the authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT public.auth_is_admin() THEN
    RAISE EXCEPTION 'User does not have permission to assign learning paths' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.learning_paths WHERE id = p_path_id) THEN
    RAISE EXCEPTION 'Learning path not found';
  END IF;

  IF p_user_ids IS NOT NULL AND array_length(p_user_ids, 1) > 0 THEN
    FOREACH v_user_id IN ARRAY p_user_ids LOOP
      IF EXISTS (
        SELECT 1 FROM public.learning_path_assignments
         WHERE path_id = p_path_id AND user_id = v_user_id
      ) THEN
        v_skip_count := v_skip_count + 1;
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
        RAISE EXCEPTION 'User with ID % does not exist', v_user_id;
      END IF;

      INSERT INTO public.learning_path_assignments (path_id, user_id, assigned_by)
      VALUES (p_path_id, v_user_id, v_actor)
      RETURNING id INTO v_assignment_id;

      v_assignments := array_append(v_assignments, v_assignment_id);
      v_success_count := v_success_count + 1;

      -- Side effect preserved from the baseline: assignment auto-enrols the
      -- user in every course of the path (enrollment_type = 'assigned').
      -- enrolled_by is the authenticated actor, never the parameter.
      FOR v_course_id IN
        SELECT course_id FROM public.learning_path_courses
         WHERE learning_path_id = p_path_id ORDER BY sequence_order
      LOOP
        INSERT INTO public.course_enrollments (
          course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status, total_lessons
        ) VALUES (
          v_course_id, v_user_id, 'assigned', v_actor, now(), 'active',
          (SELECT count(*) FROM public.lessons WHERE course_id = v_course_id)
        )
        ON CONFLICT (course_id, user_id) DO NOTHING;
        IF FOUND THEN
          v_enroll_count := v_enroll_count + 1;
        END IF;
      END LOOP;
    END LOOP;
  END IF;

  IF p_group_ids IS NOT NULL AND array_length(p_group_ids, 1) > 0 THEN
    FOREACH v_group_id IN ARRAY p_group_ids LOOP
      IF EXISTS (
        SELECT 1 FROM public.learning_path_assignments
         WHERE path_id = p_path_id AND group_id = v_group_id
      ) THEN
        v_skip_count := v_skip_count + 1;
        CONTINUE;
      END IF;

      IF NOT EXISTS (SELECT 1 FROM public.community_workspaces WHERE id = v_group_id) THEN
        RAISE EXCEPTION 'Group with ID % does not exist', v_group_id;
      END IF;

      INSERT INTO public.learning_path_assignments (path_id, group_id, assigned_by)
      VALUES (p_path_id, v_group_id, v_actor)
      RETURNING id INTO v_assignment_id;

      v_assignments := array_append(v_assignments, v_assignment_id);
      v_success_count := v_success_count + 1;

      -- Members are resolved through the workspace's growth community
      -- (community_workspaces.community_id), never by comparing the
      -- workspace id with user_roles.community_id.
      FOR v_group_member_id IN
        SELECT DISTINCT ur.user_id
          FROM public.community_workspaces cw
          JOIN public.user_roles ur ON ur.community_id = cw.community_id
         WHERE cw.id = v_group_id AND ur.is_active = true
      LOOP
        FOR v_course_id IN
          SELECT course_id FROM public.learning_path_courses
           WHERE learning_path_id = p_path_id ORDER BY sequence_order
        LOOP
          INSERT INTO public.course_enrollments (
            course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status, total_lessons
          ) VALUES (
            v_course_id, v_group_member_id, 'assigned', v_actor, now(), 'active',
            (SELECT count(*) FROM public.lessons WHERE course_id = v_course_id)
          )
          ON CONFLICT (course_id, user_id) DO NOTHING;
          IF FOUND THEN
            v_enroll_count := v_enroll_count + 1;
          END IF;
        END LOOP;
      END LOOP;
    END LOOP;
  END IF;

  RETURN json_build_object(
    'success', true,
    'assignments_created', v_success_count,
    'assignments_skipped', v_skip_count,
    'enrollments_created', v_enroll_count,
    'assignment_ids', v_assignments,
    'message', format('%s assignment(s) created, %s enrollment(s) created, %s skipped',
                      v_success_count, v_enroll_count, v_skip_count)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.start_learning_path_session(
  p_user_id uuid,
  p_path_id uuid,
  p_course_id uuid DEFAULT NULL::uuid,
  p_activity_type character varying DEFAULT 'path_view'::character varying
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_session_id uuid;
  v_closed uuid[];
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  -- The session belongs to the authenticated user. A p_user_id naming anyone
  -- else is rejected outright; nothing is written.
  IF p_user_id IS NULL OR p_user_id <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied user does not match the authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_is_learning_path_assignee(p_path_id)) THEN
    RAISE EXCEPTION 'User is not assigned to this learning path' USING ERRCODE = '42501';
  END IF;
  -- A session may only be attributed to a course of its own path.
  IF NOT public.learning_path_has_course(p_path_id, p_course_id) THEN
    RAISE EXCEPTION 'Course is not part of this learning path' USING ERRCODE = '22023';
  END IF;

  -- Close the caller's open sessions on this path with server-side timing and
  -- settle them (credit at most once) so no minutes are lost when a client
  -- never calls end.
  -- Starting again is current authorized activity. Establish a fresh guarded
  -- mark before closing historical predecessors (the close guard reads OLD).
  PERFORM pg_advisory_xact_lock(hashtext(v_actor::text), hashtext(p_path_id::text));
  UPDATE public.learning_path_progress_sessions SET last_heartbeat = now()
   WHERE user_id = v_actor AND path_id = p_path_id AND session_end IS NULL;

  -- Closure round (2026-09-07, found by an E2E retry of the concurrent-start
  -- test): two concurrent starts of one (user, path) serialise on the pair
  -- lock, but the transaction that BEGAN earlier can be the one that runs
  -- second; its now() then precedes the other's freshly inserted session_start
  -- and the close violated learning_path_progress_sessions_time_valid
  -- (session_end >= session_start), failing the whole start. A predecessor
  -- that started after this transaction's now() is closed AT ITS OWN START
  -- with zero minutes (it earned nothing before we closed it).
  WITH closed AS (
    UPDATE public.learning_path_progress_sessions
       SET session_end = greatest(now(), session_start),
           time_spent_minutes = greatest(0, floor(extract(epoch FROM (greatest(now(), session_start) - session_start)) / 60)),
           updated_at = now()
     WHERE user_id = v_actor
       AND path_id = p_path_id
       AND session_end IS NULL
    RETURNING id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_closed FROM closed;
  IF coalesce(array_length(v_closed, 1), 0) > 0 THEN
    PERFORM public.settle_learning_path_sessions(v_closed);
  END IF;

  INSERT INTO public.learning_path_progress_sessions (user_id, path_id, course_id, activity_type)
  VALUES (v_actor, p_path_id, p_course_id, p_activity_type)
  RETURNING id INTO v_session_id;

  UPDATE public.learning_path_assignments
     SET started_at = coalesce(started_at, now()),
         last_activity_at = now()
   WHERE user_id = v_actor
     AND path_id = p_path_id;

  RETURN v_session_id;
END;
$$;

-- Lock protocol (R3-02, shared by every session writer): the per-(user, path)
-- transaction advisory lock is taken BEFORE any session row is locked. The
-- session's user_id / path_id are immutable (no application role may update
-- them), so they can be read without a lock to compute the lock key.
--   start:    advisory(user, path) -> session rows -> assignment row -> progress row
--   end:      advisory(user, path) -> session row  -> assignment row -> progress row
--   activity: advisory(user, path) -> session row  -> assignment row -> progress row
--   settle:   advisory(every pair, sorted) -> session rows -> assignment rows -> progress rows
--   cleanup:  advisory(every pair, sorted) -> session rows -> assignment rows -> progress rows
--   legacy activity route (previously deployed app, direct table writes, one
--   PostgREST transaction each): session row | assignment row -> progress row
--   (the R4-02 sync trigger on learning_path_assignments; 20260907120300)
-- No path takes a row lock while it still has an advisory lock to acquire, and
-- the assignment row is always locked before the progress row, so the
-- start-versus-end, start-versus-cleanup and legacy-write-versus-settlement
-- cycles cannot form.
CREATE OR REPLACE FUNCTION public.end_learning_path_session(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_user uuid;
  v_path uuid;
  v_session_record public.learning_path_progress_sessions;
  v_end timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT user_id, path_id INTO v_user, v_path
    FROM public.learning_path_progress_sessions
   WHERE id = p_session_id;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Someone else's session is indistinguishable from a missing one: nothing
  -- is written and nothing about its existence is confirmed.
  IF v_user <> v_actor AND NOT public.auth_is_admin() THEN
    RETURN false;
  END IF;

  -- Advisory lock first, row lock second (see the lock protocol above).
  PERFORM pg_advisory_xact_lock(hashtext(v_user::text), hashtext(v_path::text));

  SELECT * INTO v_session_record
    FROM public.learning_path_progress_sessions
   WHERE id = p_session_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF v_session_record.session_end IS NULL THEN
    -- Final settlement of an open session is always permitted (earned credit is
    -- never discarded), but a learner who is no longer assigned to the path
    -- (R3-01) is credited only up to their last authorized heartbeat — the
    -- same server-side clock the maintenance close uses — not up to the wall
    -- clock at the moment they chose to end. Every heartbeat write requires
    -- current assignment and is server-derived (R4-01 guard), so that mark
    -- cannot be advanced after revocation nor placed in the future by the
    -- client; a pre-guard value beyond its fixed ceiling counts for nothing (helper).
    IF public.auth_is_admin() OR public.auth_is_learning_path_assignee(v_session_record.path_id) THEN
      UPDATE public.learning_path_progress_sessions SET last_heartbeat = now()
       WHERE id = p_session_id;
      v_end := now();
    ELSE
      v_end := least(now(), public.lp_last_authorized_heartbeat(v_session_record.last_heartbeat, v_session_record.session_start, v_session_record.heartbeat_trust_ceiling));
    END IF;

    UPDATE public.learning_path_progress_sessions
       SET session_end = v_end,
           time_spent_minutes = greatest(0, floor(extract(epoch FROM (v_end - session_start)) / 60)),
           updated_at = now()
     WHERE id = p_session_id;
  END IF;

  -- Credit the assignment from the server-computed minutes, at most once. A
  -- repeated end call (retry, double click) is a no-op for the credit.
  PERFORM public.settle_learning_path_sessions(ARRAY[p_session_id]);

  RETURN true;
END;
$$;

-- Actor already derived from auth.uid(); the group branch now resolves the
-- assigned workspace to its community before looking at user_roles (the
-- committed body compared community_workspaces.id with user_roles.community_id,
-- two different identifiers). pg_temp is appended to the search_path and the
-- grants are tightened below.
CREATE OR REPLACE FUNCTION public.auth_is_learning_path_member(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND EXISTS (
    SELECT 1
      FROM public.learning_path_courses lpc
      JOIN public.learning_path_assignments lpa ON lpa.path_id = lpc.learning_path_id
     WHERE lpc.course_id = p_course_id
       AND (
         lpa.user_id = auth.uid()
         OR (
           lpa.group_id IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.community_workspaces cw
               JOIN public.user_roles ur ON ur.community_id = cw.community_id
              WHERE cw.id = lpa.group_id
                AND ur.user_id = auth.uid()
                AND ur.is_active = true
           )
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION public.increment_path_assignment_time(
  p_user_id uuid,
  p_path_id uuid,
  p_minutes integer
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL OR p_user_id <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied user does not match the authenticated user' USING ERRCODE = '42501';
  END IF;

  UPDATE public.learning_path_assignments
     SET total_time_spent_minutes = coalesce(total_time_spent_minutes, 0) + greatest(coalesce(p_minutes, 0), 0),
         last_activity_at = now()
   WHERE user_id = v_actor
     AND path_id = p_path_id;

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_session_heartbeat(p_session_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_path uuid;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT path_id INTO v_path
    FROM public.learning_path_progress_sessions
   WHERE id = p_session_id
     AND user_id = v_actor
     AND session_end IS NULL;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- R3-01: a heartbeat extends the creditable interval of the session, so it
  -- is new activity and requires CURRENT assignment authority (or admin).
  -- Nothing is written when the caller has lost it.
  IF NOT (public.auth_is_admin() OR public.auth_is_learning_path_assignee(v_path)) THEN
    RAISE EXCEPTION 'User is not assigned to this learning path' USING ERRCODE = '42501';
  END IF;

  UPDATE public.learning_path_progress_sessions
     SET last_heartbeat = now(),
         updated_at = now()
   WHERE id = p_session_id
     AND user_id = v_actor
     AND session_end IS NULL;

  RETURN FOUND;
END;
$$;

-- -----------------------------------------------------------------------------
-- 6a. Lock-order helper (R3-02). Takes the per-(user, path) transaction
--     advisory lock — the same key start_learning_path_session uses — for every
--     pair referenced by the given session ids, in (user_id, path_id) order,
--     without locking any row. Callers invoke it BEFORE their first row lock so
--     that every session writer acquires locks in the same global order:
--     advisory(pairs, sorted) -> session rows -> progress rows. Advisory
--     transaction locks are re-entrant, so a caller that already holds a pair's
--     lock is unaffected. Internal: no EXECUTE grant.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.lp_lock_session_pairs(p_session_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_pairs integer := 0;
BEGIN
  IF p_session_ids IS NULL OR coalesce(array_length(p_session_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  FOR r IN
    SELECT DISTINCT s.user_id, s.path_id
      FROM public.learning_path_progress_sessions s
     WHERE s.id = ANY (p_session_ids)
     ORDER BY s.user_id, s.path_id
  LOOP
    PERFORM pg_advisory_xact_lock(hashtext(r.user_id::text), hashtext(r.path_id::text));
    v_pairs := v_pairs + 1;
  END LOOP;
  RETURN v_pairs;
END;
$$;

COMMENT ON FUNCTION public.lp_lock_session_pairs(uuid[]) IS
  'R3-02 lock-order helper: advisory-locks every (user, path) pair of the given sessions in canonical order before any row lock. Internal: no EXECUTE grant.';

REVOKE ALL ON FUNCTION public.lp_lock_session_pairs(uuid[]) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 6b. Session settlement — one transactional path for crediting session minutes
--     to the assignment, used by end_learning_path_session (own session),
--     start_learning_path_session (auto-closed predecessors) and the
--     maintenance route (stale sessions, service_role). Minutes are always the
--     server-computed time_spent_minutes of a CLOSED session; a session is
--     settled at most once (FOR UPDATE SKIP LOCKED + settled_at IS NULL
--     re-checked under the lock); the credit is an in-place increment so
--     concurrent legitimate increments are preserved; last_activity_at never
--     moves backwards. A session whose (user, path) has no assignment row
--     (group members have no per-user row) is marked settled without a credit.
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.settle_learning_path_sessions(p_session_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_settled integer := 0;
BEGIN
  IF p_session_ids IS NULL OR coalesce(array_length(p_session_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Lock protocol (R3-02): every (user, path) pair touched by this batch is
  -- advisory-locked in a canonical order BEFORE any session row is locked.
  PERFORM public.lp_lock_session_pairs(p_session_ids);

  WITH claimed AS (
    SELECT s.id
      FROM public.learning_path_progress_sessions s
     WHERE s.id = ANY (p_session_ids)
       AND s.session_end IS NOT NULL
       AND s.settled_at IS NULL
     ORDER BY s.id
       FOR UPDATE SKIP LOCKED
  ), settled AS (
    UPDATE public.learning_path_progress_sessions s
       SET settled_at = now()
      FROM claimed c
     WHERE s.id = c.id
       AND s.settled_at IS NULL
    RETURNING s.user_id, s.path_id, s.time_spent_minutes, s.session_end
  ), totals AS (
    SELECT user_id,
           path_id,
           sum(greatest(coalesce(time_spent_minutes, 0), 0))::integer AS minutes,
           max(session_end) AS last_end
      FROM settled
     GROUP BY user_id, path_id
  ), credited AS (
    UPDATE public.learning_path_assignments a
       SET total_time_spent_minutes = coalesce(a.total_time_spent_minutes, 0) + t.minutes,
           last_activity_at = greatest(coalesce(a.last_activity_at, t.last_end), t.last_end)
      FROM totals t
     WHERE a.user_id = t.user_id
       AND a.path_id = t.path_id
    RETURNING a.id
  )
  SELECT count(*)::integer INTO v_settled FROM settled;

  RETURN v_settled;
END;
$$;

COMMENT ON FUNCTION public.settle_learning_path_sessions(uuid[]) IS
  'W-B2c-01: credits the server-computed minutes of CLOSED, unsettled sessions to learning_path_assignments exactly once (SKIP LOCKED + settled_at). Internal: no EXECUTE grant; called only from the SECURITY DEFINER session functions.';

-- Maintenance: close sessions whose heartbeat is older than the cutoff using
-- the last heartbeat as the end time, then settle exactly those sessions, in
-- one transaction. Overlapping calls claim disjoint rows (SKIP LOCKED); a
-- failure rolls back both the close and the credit so nothing is lost or
-- credited twice on retry. service_role only (the CRON_SECRET-guarded route).
CREATE OR REPLACE FUNCTION public.close_stale_learning_path_sessions(p_stale_cutoff timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_closed uuid[];
  v_settled integer;
  v_candidates uuid[];
BEGIN
  IF p_stale_cutoff IS NULL OR p_stale_cutoff > now() THEN
    RAISE EXCEPTION 'Stale cutoff must be a past timestamp' USING ERRCODE = '22023';
  END IF;

  -- Lock protocol (R3-02): pick a bounded batch of candidates WITHOUT locking
  -- their rows, advisory-lock their (user, path) pairs in canonical order, and
  -- only then claim rows. A pair a concurrent start/end/activity is working on
  -- is waited for (never both held and waited on), and the candidates are
  -- re-evaluated under the locks — a session that was closed meanwhile is
  -- simply not stale any more. Overlapping maintenance runs of the same pairs
  -- serialise instead of interleaving; the batch bound keeps the number of
  -- advisory locks per transaction small (the route is idempotent and
  -- re-runs). Candidates beyond the batch bound are left for the next run.
  --
  -- Candidates are (a) OPEN sessions whose last AUTHORIZED heartbeat
  -- (lp_last_authorized_heartbeat: a historical value beyond its fixed ceiling counts as the
  -- session start, R4-01) is older than the cutoff and (b) CLOSED sessions
  -- that were never settled. (b) exists only for
  -- sessions the previously deployed maintenance route closed during the
  -- migration-apply-to-deploy window (it closed without crediting: its credit
  -- RPC did not exist) — the first maintenance run after the deploy credits
  -- them exactly once, union-clipped like any other session (R3-05).
  -- Sessions closed before the first migration were marked settled by its
  -- backfill and are never candidates.
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_candidates
    FROM (
      SELECT s.id
        FROM public.learning_path_progress_sessions s
       WHERE (s.session_end IS NULL AND public.lp_last_authorized_heartbeat(s.last_heartbeat, s.session_start, s.heartbeat_trust_ceiling) < p_stale_cutoff)
          OR (s.session_end IS NOT NULL AND s.settled_at IS NULL)
       ORDER BY s.user_id, s.path_id, s.id
       LIMIT 500
    ) c;
  PERFORM public.lp_lock_session_pairs(v_candidates);

  WITH claimed AS (
    SELECT s.id,
           public.lp_last_authorized_heartbeat(s.last_heartbeat, s.session_start, s.heartbeat_trust_ceiling) AS end_at
      FROM public.learning_path_progress_sessions s
     WHERE s.id = ANY (v_candidates)
       AND s.session_end IS NULL
       AND public.lp_last_authorized_heartbeat(s.last_heartbeat, s.session_start, s.heartbeat_trust_ceiling) < p_stale_cutoff
     ORDER BY s.id
       FOR UPDATE SKIP LOCKED
  ), closed AS (
    UPDATE public.learning_path_progress_sessions s
       SET session_end = c.end_at,
           time_spent_minutes = greatest(0, floor(extract(epoch FROM (c.end_at - s.session_start)) / 60))::integer,
           updated_at = now()
      FROM claimed c
     WHERE s.id = c.id
       AND s.session_end IS NULL
    RETURNING s.id
  )
  SELECT coalesce(array_agg(id), '{}'::uuid[]) INTO v_closed FROM closed;

  -- Settle what was just closed plus any closed-but-unsettled candidate (b).
  v_settled := public.settle_learning_path_sessions(v_candidates);

  RETURN jsonb_build_object(
    'closed', coalesce(array_length(v_closed, 1), 0),
    'settled', coalesce(v_settled, 0)
  );
END;
$$;

COMMENT ON FUNCTION public.close_stale_learning_path_sessions(timestamptz) IS
  'W-B2c-01 / R3-02 / R3-05 / R4-01 maintenance: advisory-locks the (user, path) pairs of a bounded candidate batch first, then atomically closes open sessions whose last AUTHORIZED heartbeat (lp_last_authorized_heartbeat) is < cutoff (end = that mark) and settles those plus any closed-but-unsettled session (left by the previous application''s maintenance route during the deploy window), exactly once. service_role only; called by pages/api/cron/cleanup-learning-path-sessions.ts after the CRON_SECRET guard.';

-- -----------------------------------------------------------------------------
-- 7. Function grants. Postgres grants EXECUTE to PUBLIC by default, so every
--    function is revoked from PUBLIC explicitly and re-granted by name.
--    service_role has no backend caller for the actor-bound functions; it
--    keeps auth_is_learning_path_member (a policy predicate) and receives
--    close_stale_learning_path_sessions (the maintenance route's only write).
--    increment_path_assignment_time keeps its signature (CREATE OR REPLACE) but
--    is executable by NO application role: its p_minutes argument was
--    caller-supplied time that end.ts forwarded from the request body, i.e. a
--    client could credit itself arbitrary minutes. The credit now comes from
--    the server-computed session minutes via settle_learning_path_sessions.
--    settle_learning_path_sessions itself has no EXECUTE grant at all (it runs
--    only inside the SECURITY DEFINER functions above, as their owner).
-- -----------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.create_full_learning_path(text, text, uuid[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_full_learning_path(text, text, uuid[], uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.update_full_learning_path(uuid, text, text, uuid[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_full_learning_path(uuid, text, text, uuid[], uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.start_learning_path_session(uuid, uuid, uuid, character varying) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.start_learning_path_session(uuid, uuid, uuid, character varying) TO authenticated;

REVOKE ALL ON FUNCTION public.end_learning_path_session(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.end_learning_path_session(uuid) TO authenticated;

REVOKE ALL ON FUNCTION public.auth_is_learning_path_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_is_learning_path_member(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auth_is_learning_path_member(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.increment_path_assignment_time(uuid, uuid, integer) FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_learning_path_sessions(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lp_lock_session_pairs(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.lp_last_authorized_heartbeat(timestamptz, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.learning_path_sessions_heartbeat_guard() FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.close_stale_learning_path_sessions(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.close_stale_learning_path_sessions(timestamptz) TO service_role;

REVOKE ALL ON FUNCTION public.update_session_heartbeat(uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.update_session_heartbeat(uuid) TO authenticated;
