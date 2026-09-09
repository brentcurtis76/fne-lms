-- =============================================================================
-- 20260907120300_r2_remediation.sql — Codex re-review R2 (2026-09-07) corrections
--
-- Independent re-review of the cumulative RLS candidate
-- (rls-rereview-2026-09-07.md) returned five findings. This migration carries
-- the database half of four of them; the application half ships in the same
-- working tree (pages/api/propuestas/web/[slug]/verify.ts,
-- lib/propuestas-web/*, pages/api/learning-paths/session/activity.ts,
-- pages/api/learning-paths/[id]/enhanced-progress.ts). Additive only: no
-- DROP, no TRUNCATE, no destructive ALTER, row security only ever switched ON.
--
--   R2-02  Proposal access-code limiter: attempt accounting becomes a
--          prerequisite of verification. reserve_propuesta_access_attempt()
--          counts AND records the attempt atomically under a per-(ip, slug)
--          advisory lock and returns the decision; the application never
--          verifies a code without a successful reservation.
--          release_propuesta_access_attempt() gives a successful (correct-code)
--          reservation back so a legitimate recipient does not consume a slot,
--          preserving the previous "only failed attempts count" contract.
--          service_role only (the two callers use the service-role client).
--
--   R2-03  Overlapping sessions can no longer multiply credited time:
--          * authenticated loses INSERT on learning_path_progress_sessions —
--            start_learning_path_session() is the only supported creator;
--          * a BEFORE INSERT trigger refuses a second OPEN session for the same
--            (user, path) — the invariant holds for every creator, including
--            backend principals, and only for NEW rows (historical rows are
--            never rewritten);
--          * start_learning_path_session() serialises concurrent starts of the
--            same (user, path) with a transaction advisory lock;
--          * settle_learning_path_sessions() credits the UNION of the settled
--            intervals, never their sum: sessions are swept in session_start
--            order per (user, path) behind a high-water mark seeded from the
--            already-settled sessions of that pair, and each session's credit is
--            the part of its interval that lies beyond the mark (sessions.
--            credited_minutes records it; time_spent_minutes keeps the session's
--            own duration). Overlap can therefore only ever reduce a credit; a
--            settlement race between two disjoint claims of the same pair is
--            serialised by the same advisory lock so the mark is always read
--            after the competing commit.
--          * updated_at stays in the authenticated UPDATE column grant on
--            sessions (granted by 20260907120000, R3-05): the previous
--            application version writes it in its activity route and the row
--            trigger overwrites it with now() anyway.
--
--   R2-04  Group-only assignees keep their progress: learning_path_user_progress
--          is the per-(user, path) OWN-PROGRESS record, written only by the
--          SECURITY DEFINER session functions (start, activity, settlement) for
--          every learner, and mirrored into the learner's learning_path_assignments
--          row when — and only when — such a row exists (direct assignees), so
--          existing reporting keeps its numbers. A progress row grants NOTHING:
--          no policy or helper reads it for authority, the assignee predicates
--          are unchanged, and after a membership ends the row stays (credit is
--          never discarded) while start_learning_path_session() refuses.
--          record_learning_path_activity() replaces the activity route's direct
--          table writes so the same rule applies to activity progress.
--
--   R2-01  Confirmed function exposures (docs/reviews/drls-function-inventory-
--          2026-09-07.md §0.1 / Part B): the anonymous account enumeration
--          (get_all_auth_users) Codex reproduced, the dev-impersonation trio,
--          the reporting, notification, badge, document and workspace-stat
--          functions. Each signature is corrected against its actual callers:
--          backend-only boundary (service_role EXECUTE only) where no
--          application-role caller exists; caller-supplied actor bound to
--          auth.uid() and a membership check where a browser caller exists;
--          search_path pinned everywhere. auth_is_backend_caller() is
--          tightened so that "no identity" alone is not backend authority.
--          Dispositions per signature: docs/reviews/drls-function-inventory-
--          2026-09-07.md §0.3.
--
-- R3 corrections folded into this (uncommitted) migration on 2026-09-07 so no
-- migration-prefix state carries the defect (Codex re-review R3,
-- rls-rereview-r2-2026-09-07.md):
--   R3-01 record_learning_path_activity requires CURRENT assignment authority
--         (literal admin excepted) before any write; a learner whose direct
--         assignment or group membership ended keeps every earned credit but
--         can record no new activity, sequence or completion.
--   R3-02 one global lock order for every session writer — advisory(user,
--         path) -> session rows -> assignment row -> progress row (activity
--         reads the immutable session identity, takes the pair lock, THEN
--         locks the row; settle pre-locks every pair of its batch in canonical
--         order; the assignment-before-progress step is R4-02).
--   R3-03 get_folder_breadcrumb keeps every recursive step inside the
--         authorized workspace, is cycle- and depth-bounded, and a BEFORE
--         INSERT/UPDATE guard on document_folders enforces parent/workspace
--         consistency and rejects cycles for new writes (existing rows are not
--         rewritten; a legacy foreign ancestor is simply never returned).
--   R3-04 learning_path_user_progress is the ONE authoritative own-progress
--         record: it is backfilled from every existing direct assignment row,
--         seeded from the direct row when it is first written for a pair, and a
--         new direct assignment row is seeded from an existing progress row —
--         values are copied, never summed; increments are applied to both.
--   R3-05 the updated_at re-grant this migration used to carry now lives in
--         20260907120000 (the grant is present at every prefix).
--
-- R4 correction folded into this (uncommitted) migration on 2026-09-07
-- (Codex re-review R4, rls-rereview-r3-2026-09-07.md):
--   R4-02 legitimate progress writes the PREVIOUSLY DEPLOYED application makes
--         after this migration (its activity route updates
--         current_course_sequence / completed_at / last_activity_at directly on
--         the learner's own direct assignment row — the only progress columns
--         in its UPDATE grant) are reconciled into learning_path_user_progress
--         by an AFTER UPDATE trigger on learning_path_assignments
--         (learning_path_assignments_sync_progress): the course sequence is
--         copied, completion keeps its first value, last activity never moves
--         backwards. The one authoritative read model is unchanged. The
--         mirror write lp_record_progress() itself makes is flagged
--         (transaction-local lp.mirror_write) so the trigger never re-enters,
--         and lp_record_progress() now locks the assignment row BEFORE the
--         progress row so the trigger path (assignment row -> progress row)
--         and every session writer share one lock order:
--         advisory(user, path) -> session rows -> assignment row -> progress row.
--
-- pgTAP evidence: supabase/tests/073-r2-remediation.sql (+ 070 / 072 updated),
-- supabase/tests/074-r3-remediation.sql, supabase/tests/075-r4-remediation.sql.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Trusted backend authority — explicit, never inferred from absence of identity.
--    TRUE only when there is no end-user identity AND either the request carries
--    a service_role JWT claim, or there is no request claim at all and the session
--    is a direct database session (no SET ROLE to an application role, and the
--    login role is not PostgREST's `authenticator`). anon / authenticated are
--    refused in every branch.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.auth_is_backend_caller()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NULL
     AND (
       coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
       OR (
         nullif(current_setting('request.jwt.claims', true), '') IS NULL
         AND coalesce(current_setting('role', true), 'none') IN ('none', '')
         AND session_user NOT IN ('anon', 'authenticated', 'authenticator')
       )
     );
$$;

COMMENT ON FUNCTION public.auth_is_backend_caller() IS
  'D-RLS-02 / R2-01: TRUE only for a trusted backend principal — a service_role JWT, or a direct database session with no request claims and no application role active. anon and authenticated are FALSE in every branch; no end-user identity alone is never backend authority.';

-- =============================================================================
-- R2-02 — proposal access-code attempt reservation
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reserve_propuesta_access_attempt(
  p_ip text,
  p_slug text,
  p_max_attempts integer DEFAULT 5,
  p_window interval DEFAULT interval '1 hour'
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
  v_id bigint;
BEGIN
  IF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Backend principal required' USING ERRCODE = '42501';
  END IF;
  IF p_ip IS NULL OR btrim(p_ip) = '' OR p_slug IS NULL OR btrim(p_slug) = '' THEN
    RAISE EXCEPTION 'ip and slug are required' USING ERRCODE = '22023';
  END IF;
  IF p_max_attempts IS NULL OR p_max_attempts < 1 OR p_window IS NULL OR p_window <= interval '0' THEN
    RAISE EXCEPTION 'invalid limiter parameters' USING ERRCODE = '22023';
  END IF;

  -- Serialise concurrent attempts of the same (ip, slug): the count and the
  -- reservation are one critical section, so N concurrent guesses admit at most
  -- p_max_attempts of them.
  PERFORM pg_advisory_xact_lock(hashtext('propuesta_rate_limit:' || p_ip), hashtext(p_slug));

  SELECT count(*)::integer INTO v_count
    FROM public.propuesta_rate_limits
   WHERE ip_address = p_ip
     AND slug = p_slug
     AND attempted_at >= now() - p_window;

  IF v_count >= p_max_attempts THEN
    RETURN jsonb_build_object('allowed', false, 'remaining', 0, 'attempt_id', NULL);
  END IF;

  INSERT INTO public.propuesta_rate_limits (ip_address, slug)
  VALUES (p_ip, p_slug)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object(
    'allowed', true,
    'remaining', p_max_attempts - v_count - 1,
    'attempt_id', v_id
  );
END;
$$;

COMMENT ON FUNCTION public.reserve_propuesta_access_attempt(text, text, integer, interval) IS
  'R2-02: atomically counts the recent attempts of (ip, slug) and records this one under an advisory lock. allowed=false when the window is exhausted (nothing recorded). The application must not verify an access code without allowed=true. service_role only.';

CREATE OR REPLACE FUNCTION public.release_propuesta_access_attempt(p_attempt_id bigint)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Backend principal required' USING ERRCODE = '42501';
  END IF;
  IF p_attempt_id IS NULL THEN
    RETURN false;
  END IF;
  DELETE FROM public.propuesta_rate_limits WHERE id = p_attempt_id;
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.release_propuesta_access_attempt(bigint) IS
  'R2-02: gives a reservation back after a CORRECT access code so a legitimate recipient does not consume a failed-attempt slot. A failed release leaves the slot consumed (fail-closed). service_role only.';

REVOKE ALL ON FUNCTION public.reserve_propuesta_access_attempt(text, text, integer, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_propuesta_access_attempt(text, text, integer, interval) TO service_role;
REVOKE ALL ON FUNCTION public.release_propuesta_access_attempt(bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_propuesta_access_attempt(bigint) TO service_role;

-- =============================================================================
-- R2-04 — own-progress record, separate from assignment authority
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.learning_path_user_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  path_id uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  started_at timestamptz,
  last_activity_at timestamptz,
  completed_at timestamptz,
  current_course_sequence integer NOT NULL DEFAULT 1,
  total_time_spent_minutes integer NOT NULL DEFAULT 0 CHECK (total_time_spent_minutes >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT learning_path_user_progress_unique_path_user UNIQUE (path_id, user_id)
);

COMMENT ON TABLE public.learning_path_user_progress IS
  'R2-04: per-(user, path) OWN progress (started, last activity, completion, course sequence, credited minutes) for every learner — direct or group assignee. Written only by the SECURITY DEFINER session functions; mirrored into learning_path_assignments when the learner has a direct row. Grants NO access: assignment authority is decided by learning_path_assignments + membership only, and the row outlives a membership so credit is never discarded.';

CREATE INDEX IF NOT EXISTS idx_lp_user_progress_user ON public.learning_path_user_progress (user_id, path_id);

CREATE OR REPLACE TRIGGER learning_path_user_progress_updated_at
  BEFORE UPDATE ON public.learning_path_user_progress
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

REVOKE ALL ON TABLE public.learning_path_user_progress FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.learning_path_user_progress TO authenticated;
GRANT ALL ON TABLE public.learning_path_user_progress TO service_role;
ALTER TABLE public.learning_path_user_progress ENABLE ROW LEVEL SECURITY;

CREATE POLICY learning_path_user_progress_own_read ON public.learning_path_user_progress
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_admin());

CREATE POLICY learning_path_user_progress_service ON public.learning_path_user_progress
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

SELECT public.apply_forced_password_change_guard('public', 'learning_path_user_progress');

-- Progress continuity across assignment sources (R3-04). One authoritative
-- own-progress record per (user, path): learning_path_user_progress. The direct
-- learning_path_assignments row, when one exists, is a MIRROR kept for the
-- existing reporting readers. The two are reconciled whenever either record is
-- created, by COPYING history (never by adding the two totals, which would
-- double-count the mirrored increments):
--   * this migration backfills a progress row from every existing direct
--     assignment row (below, after the table exists);
--   * lp_record_progress() seeds the progress row from the direct row when it
--     writes a pair for the first time (covers rows created outside this
--     sequence, e.g. seeds that insert assignments directly);
--   * a new direct assignment row is seeded from an existing progress row
--     (BEFORE INSERT trigger) — the group-only history a learner earned is
--     visible the moment an admin adds a direct assignment — and a progress row
--     is created for a direct row that has none (AFTER INSERT trigger).
--   * a legitimate progress write made directly on a direct assignment row —
--     the previously deployed activity route during the migration-to-deploy
--     window (course sequence, completion, last activity: the only progress
--     columns in its UPDATE grant) — is reconciled into the progress row by
--     the AFTER UPDATE trigger learning_path_assignments_sync_progress (R4-02),
--     so the authoritative record never trails a supported legacy write.
-- Removing an assignment row never touches the progress row; the progress row
-- grants nothing (no policy or helper reads it for authority).

-- Internal writer (no EXECUTE grant; runs only inside the SECURITY DEFINER
-- session functions as their owner). Seeds/upserts the own-progress row and
-- mirrors the same change into the learner's direct assignment row when one
-- exists. Minutes are additive; last_activity_at never moves backwards;
-- started_at and completed_at keep their first value (from either record).
-- Lock order (R3-02 / R4-02): the direct assignment row is locked BEFORE the
-- progress row — the same order the legacy-write sync trigger uses — and the
-- mirror write is flagged (lp.mirror_write, transaction-local) so that trigger
-- does not re-enter for it.
CREATE OR REPLACE FUNCTION public.lp_record_progress(
  p_user_id uuid,
  p_path_id uuid,
  p_minutes integer,
  p_activity_at timestamptz,
  p_course_sequence integer,
  p_completed_at timestamptz,
  p_mark_started boolean
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_minutes integer := greatest(coalesce(p_minutes, 0), 0);
  v_at timestamptz := coalesce(p_activity_at, now());
  v_a public.learning_path_assignments;
BEGIN
  IF p_user_id IS NULL OR p_path_id IS NULL THEN
    RETURN;
  END IF;

  -- The direct assignment row of the pair, if any (its history seeds a first
  -- progress row and its first-value fields are reconciled below).
  SELECT * INTO v_a
    FROM public.learning_path_assignments a
   WHERE a.user_id = p_user_id
     AND a.path_id = p_path_id
   ORDER BY coalesce(a.total_time_spent_minutes, 0) DESC, a.assigned_at
   LIMIT 1;

  -- First progress row for the pair: COPY the direct row's history (no sum).
  -- (ON CONFLICT DO NOTHING takes no lock on an existing row.)
  INSERT INTO public.learning_path_user_progress
    (user_id, path_id, started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes)
  VALUES
    (p_user_id, p_path_id,
     v_a.started_at, v_a.last_activity_at, v_a.completed_at,
     coalesce(v_a.current_course_sequence, 1),
     greatest(coalesce(v_a.total_time_spent_minutes, 0), 0))
  ON CONFLICT (path_id, user_id) DO NOTHING;

  -- Mirror into the direct assignment row when present (same increment, same
  -- first-value fields), so the existing reporting readers keep their numbers.
  -- Assignment row FIRST (lock order), flagged so the R4-02 sync trigger does
  -- not treat this mirror write as a legacy write to reconcile back.
  PERFORM set_config('lp.mirror_write', '1', true);
  UPDATE public.learning_path_assignments a
     SET total_time_spent_minutes = coalesce(a.total_time_spent_minutes, 0) + v_minutes,
         last_activity_at = greatest(coalesce(a.last_activity_at, v_at), v_at),
         started_at = coalesce(a.started_at, CASE WHEN p_mark_started THEN v_at END),
         current_course_sequence = coalesce(p_course_sequence, a.current_course_sequence),
         completed_at = coalesce(a.completed_at, p_completed_at)
   WHERE a.user_id = p_user_id
     AND a.path_id = p_path_id;
  PERFORM set_config('lp.mirror_write', '', true);

  -- Apply this write to the authoritative record (progress row LAST).
  UPDATE public.learning_path_user_progress up
     SET started_at = coalesce(up.started_at, CASE WHEN p_mark_started THEN v_at END, v_a.started_at),
         last_activity_at = greatest(coalesce(up.last_activity_at, v_at), v_at, coalesce(v_a.last_activity_at, v_at)),
         total_time_spent_minutes = up.total_time_spent_minutes + v_minutes,
         current_course_sequence = coalesce(p_course_sequence, up.current_course_sequence),
         completed_at = coalesce(up.completed_at, p_completed_at, v_a.completed_at)
   WHERE up.user_id = p_user_id
     AND up.path_id = p_path_id;
END;
$$;

REVOKE ALL ON FUNCTION public.lp_record_progress(uuid, uuid, integer, timestamptz, integer, timestamptz, boolean) FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.lp_record_progress(uuid, uuid, integer, timestamptz, integer, timestamptz, boolean) IS
  'R2-04 / R3-04 / R4-02 internal: seeds (copy, never sum) and upserts learning_path_user_progress for (user, path) — the authoritative own-progress record — and mirrors the same change into the direct learning_path_assignments row when present (assignment row locked first; mirror write flagged lp.mirror_write). No EXECUTE grant.';

-- New direct assignment rows inherit the pair's existing own progress (R3-04:
-- group-only history survives an admin adding a direct assignment). Values
-- are copied only into fields the new row does not already carry.
CREATE OR REPLACE FUNCTION public.learning_path_assignments_seed_from_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_p public.learning_path_user_progress;
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_p
    FROM public.learning_path_user_progress up
   WHERE up.user_id = NEW.user_id
     AND up.path_id = NEW.path_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;
  NEW.started_at := coalesce(NEW.started_at, v_p.started_at);
  NEW.completed_at := coalesce(NEW.completed_at, v_p.completed_at);
  NEW.last_activity_at := greatest(coalesce(NEW.last_activity_at, v_p.last_activity_at), coalesce(v_p.last_activity_at, NEW.last_activity_at));
  IF coalesce(NEW.current_course_sequence, 1) <= 1 THEN
    NEW.current_course_sequence := greatest(coalesce(v_p.current_course_sequence, 1), 1);
  END IF;
  IF coalesce(NEW.total_time_spent_minutes, 0) = 0 THEN
    NEW.total_time_spent_minutes := greatest(coalesce(v_p.total_time_spent_minutes, 0), 0);
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.learning_path_assignments_seed_from_progress() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER learning_path_assignments_seed_from_progress
  BEFORE INSERT ON public.learning_path_assignments
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_assignments_seed_from_progress();

-- A direct assignment row that has no progress row yet gets one, copied from
-- the row just inserted (which was itself seeded above when history existed).
CREATE OR REPLACE FUNCTION public.learning_path_assignments_ensure_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.learning_path_user_progress
    (user_id, path_id, started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes)
  VALUES
    (NEW.user_id, NEW.path_id, NEW.started_at, NEW.last_activity_at, NEW.completed_at,
     greatest(coalesce(NEW.current_course_sequence, 1), 1),
     greatest(coalesce(NEW.total_time_spent_minutes, 0), 0))
  ON CONFLICT (path_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.learning_path_assignments_ensure_progress() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER learning_path_assignments_ensure_progress
  AFTER INSERT ON public.learning_path_assignments
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_assignments_ensure_progress();

-- R4-02: a legitimate progress write made DIRECTLY on a direct assignment row
-- is reconciled into the authoritative record. The only such writer in the
-- product is the previously deployed activity route during the
-- migration-to-deploy window (course_start -> current_course_sequence +
-- last_activity_at; path_complete -> completed_at + last_activity_at; exactly
-- the authenticated UPDATE column grant of 20260907120000), and the rule holds
-- for any backend principal that writes those columns the same way. Copy
-- semantics, never a sum:
--   * current_course_sequence: the new value is the learner's position;
--   * completed_at: first value wins (the old route re-stamps it on every
--     path_complete; completion STATE is what is preserved);
--   * last_activity_at: never moves backwards.
-- total_time_spent_minutes and started_at are not reconciled here: no
-- application role may write them on the assignment row (column grant), and
-- their only supported writer is lp_record_progress(), which already writes
-- both records. The mirror write lp_record_progress() makes is flagged
-- (lp.mirror_write) and skipped — there is no mirror-of-a-mirror. Lock order:
-- the assignment row is already locked when an AFTER ROW trigger runs, then
-- the progress row — the same assignment -> progress order every session
-- writer uses (lp_record_progress), so no cycle can form. A pair that has no
-- progress row yet (a direct row written with triggers bypassed) gets one
-- copied from the assignment row first (R3-04 seed semantics).
CREATE OR REPLACE FUNCTION public.learning_path_assignments_sync_progress()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF coalesce(current_setting('lp.mirror_write', true), '') = '1' THEN
    RETURN NULL;
  END IF;
  IF NEW.user_id IS NULL OR NEW.path_id IS NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.learning_path_user_progress
    (user_id, path_id, started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes)
  VALUES
    (NEW.user_id, NEW.path_id, NEW.started_at, NEW.last_activity_at, NEW.completed_at,
     greatest(coalesce(NEW.current_course_sequence, 1), 1),
     greatest(coalesce(NEW.total_time_spent_minutes, 0), 0))
  ON CONFLICT (path_id, user_id) DO NOTHING;

  UPDATE public.learning_path_user_progress up
     SET current_course_sequence = CASE
           WHEN NEW.current_course_sequence IS DISTINCT FROM OLD.current_course_sequence
             THEN greatest(coalesce(NEW.current_course_sequence, 1), 1)
           ELSE up.current_course_sequence END,
         completed_at = CASE
           WHEN NEW.completed_at IS DISTINCT FROM OLD.completed_at
             THEN coalesce(up.completed_at, NEW.completed_at)
           ELSE up.completed_at END,
         last_activity_at = greatest(coalesce(up.last_activity_at, NEW.last_activity_at),
                                     coalesce(NEW.last_activity_at, up.last_activity_at))
   WHERE up.user_id = NEW.user_id
     AND up.path_id = NEW.path_id;
  RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.learning_path_assignments_sync_progress() FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.learning_path_assignments_sync_progress() IS
  'R4-02: AFTER UPDATE OF current_course_sequence, completed_at, last_activity_at on a DIRECT assignment row — reconciles a legacy/direct progress write into learning_path_user_progress (sequence copied, completion first-value, last activity monotonic). Skipped for lp_record_progress()''s own mirror write (lp.mirror_write). Internal trigger function: no EXECUTE grant.';

CREATE OR REPLACE TRIGGER learning_path_assignments_sync_progress
  AFTER UPDATE OF current_course_sequence, completed_at, last_activity_at ON public.learning_path_assignments
  FOR EACH ROW
  WHEN (NEW.user_id IS NOT NULL
        AND (OLD.current_course_sequence IS DISTINCT FROM NEW.current_course_sequence
             OR OLD.completed_at IS DISTINCT FROM NEW.completed_at
             OR OLD.last_activity_at IS DISTINCT FROM NEW.last_activity_at))
  EXECUTE FUNCTION public.learning_path_assignments_sync_progress();

-- Backfill (R3-04, additive data initialisation): one progress row per existing
-- direct assignment row, copied from it. Assignment rows are not modified. A
-- pair with several direct rows (no UNIQUE exists) contributes its richest
-- row. Preservation check: after apply, for every direct assignment row the
-- progress row of its pair carries the same total / started_at / completed_at /
-- current_course_sequence (rollout doc, postflight Q5).
INSERT INTO public.learning_path_user_progress
  (user_id, path_id, started_at, last_activity_at, completed_at, current_course_sequence, total_time_spent_minutes)
SELECT DISTINCT ON (a.user_id, a.path_id)
       a.user_id, a.path_id, a.started_at, a.last_activity_at, a.completed_at,
       greatest(coalesce(a.current_course_sequence, 1), 1),
       greatest(coalesce(a.total_time_spent_minutes, 0), 0)
  FROM public.learning_path_assignments a
 WHERE a.user_id IS NOT NULL
 ORDER BY a.user_id, a.path_id, coalesce(a.total_time_spent_minutes, 0) DESC, a.assigned_at
ON CONFLICT (path_id, user_id) DO NOTHING;

-- =============================================================================
-- R2-03 — one open session per (user, path); union-of-intervals credit
-- =============================================================================

-- What was actually credited for this session by settlement (the part of its
-- interval beyond the (user, path) high-water mark). time_spent_minutes keeps
-- the session's own duration. NULL until settled.
ALTER TABLE public.learning_path_progress_sessions
  ADD COLUMN IF NOT EXISTS credited_minutes integer;

COMMENT ON COLUMN public.learning_path_progress_sessions.credited_minutes IS
  'R2-03: minutes actually credited by settle_learning_path_sessions() — the part of [session_start, session_end] beyond the high-water mark of the already-settled sessions of the same (user, path). Overlap reduces it; it never exceeds time_spent_minutes. NULL until settled; NULL on rows settled before this column existed (their credit was time_spent_minutes).';

-- The RPC is the only supported creator. Table- and column-level INSERT are
-- both revoked (a column-level grant survives a table-level REVOKE).
REVOKE INSERT ON TABLE public.learning_path_progress_sessions FROM authenticated;
REVOKE INSERT (user_id, path_id, course_id, activity_type, session_data)
  ON TABLE public.learning_path_progress_sessions FROM authenticated;

-- updated_at compatibility grant: granted in 20260907120000 (R3-05) so that the
-- previously deployed activity route works at every migration-prefix state,
-- not only after this migration. Nothing to add here.

-- Invariant for NEW rows, whoever inserts them: at most one OPEN session per
-- (user, path). Historical rows are not touched.
CREATE OR REPLACE FUNCTION public.learning_path_sessions_single_open_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.session_end IS NULL AND EXISTS (
    SELECT 1 FROM public.learning_path_progress_sessions s
     WHERE s.user_id = NEW.user_id
       AND s.path_id = NEW.path_id
       AND s.session_end IS NULL
       AND s.id <> NEW.id
  ) THEN
    RAISE EXCEPTION 'An open learning-path session already exists for this user and path'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER learning_path_sessions_single_open
  BEFORE INSERT ON public.learning_path_progress_sessions
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_sessions_single_open_guard();

-- Settlement: union of intervals per (user, path), exactly once per session,
-- serialised per (user, path) by an advisory lock taken BEFORE the high-water
-- mark is read (READ COMMITTED gives that read a snapshot that includes the
-- competing settlement's commit).
-- Measure (in whole minutes) of [p_lo, p_hi] NOT covered by the union of the
-- covered intervals in the parallel epoch-second arrays. Correct for disjoint
-- and overlapping covered intervals in any order (a scalar high-water mark is
-- not: it wrongly treats every second below the maximum covered end as covered,
-- so a session settled after a later one but with an earlier, disjoint interval
-- would lose its credit).
CREATE OR REPLACE FUNCTION public.lp_novel_minutes(
  p_lo bigint, p_hi bigint, p_los bigint[], p_his bigint[]
) RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  WITH cov AS (
    SELECT lo, hi FROM unnest(coalesce(p_los, '{}'::bigint[]), coalesce(p_his, '{}'::bigint[])) AS c(lo, hi)
  ),
  clip AS (
    SELECT greatest(lo, p_lo) AS lo, least(hi, p_hi) AS hi
      FROM cov
     WHERE least(hi, p_hi) > greatest(lo, p_lo)
  ),
  ordered AS (
    SELECT lo, hi,
           max(hi) OVER (ORDER BY lo, hi ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING) AS prev_max
      FROM clip
  ),
  overlap AS (
    SELECT coalesce(sum(greatest(0, hi - greatest(lo, coalesce(prev_max, lo)))), 0) AS ov FROM ordered
  )
  SELECT greatest(0, floor((greatest(0, p_hi - p_lo) - (SELECT ov FROM overlap)) / 60.0))::integer;
$$;
REVOKE ALL ON FUNCTION public.lp_novel_minutes(bigint, bigint, bigint[], bigint[]) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.settle_learning_path_sessions(p_session_ids uuid[])
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $BODY$
DECLARE
  r record;
  v_settled integer := 0;
  v_cur_user uuid;
  v_cur_path uuid;
  v_los bigint[];
  v_his bigint[];
  v_group_minutes integer := 0;
  v_group_last_end timestamptz;
  v_lo bigint;
  v_hi bigint;
  v_credit integer;
BEGIN
  IF p_session_ids IS NULL OR coalesce(array_length(p_session_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;

  -- Lock protocol (R3-02): every (user, path) pair of the batch is advisory-
  -- locked in canonical order BEFORE the first row lock below. The per-pair
  -- lock inside the loop is then a re-entrant no-op that documents the
  -- critical section.
  PERFORM public.lp_lock_session_pairs(p_session_ids);

  FOR r IN
    SELECT s.id, s.user_id, s.path_id, s.session_start, s.session_end, s.time_spent_minutes
      FROM public.learning_path_progress_sessions s
     WHERE s.id = ANY (p_session_ids)
       AND s.session_end IS NOT NULL
       AND s.settled_at IS NULL
     ORDER BY s.user_id, s.path_id, s.session_start, s.id
       FOR UPDATE SKIP LOCKED
  LOOP
    IF v_cur_user IS DISTINCT FROM r.user_id OR v_cur_path IS DISTINCT FROM r.path_id THEN
      IF v_cur_user IS NOT NULL THEN
        PERFORM public.lp_record_progress(v_cur_user, v_cur_path, v_group_minutes, v_group_last_end, NULL, NULL, false);
      END IF;
      v_cur_user := r.user_id;
      v_cur_path := r.path_id;
      v_group_minutes := 0;
      v_group_last_end := NULL;
      PERFORM pg_advisory_xact_lock(hashtext(r.user_id::text), hashtext(r.path_id::text));
      -- Seed the covered set from the already-settled sessions of this pair
      -- (their credited minutes are already in the assignment total).
      SELECT coalesce(array_agg(extract(epoch FROM s2.session_start)::bigint), '{}'::bigint[]),
             coalesce(array_agg(extract(epoch FROM s2.session_end)::bigint), '{}'::bigint[])
        INTO v_los, v_his
        FROM public.learning_path_progress_sessions s2
       WHERE s2.user_id = r.user_id
         AND s2.path_id = r.path_id
         AND s2.settled_at IS NOT NULL
         AND s2.session_end IS NOT NULL;
    END IF;

    v_lo := extract(epoch FROM r.session_start)::bigint;
    v_hi := extract(epoch FROM r.session_end)::bigint;
    -- Credit only the part of this interval not already covered, clipped to the
    -- session's own recorded duration.
    v_credit := least(
      public.lp_novel_minutes(v_lo, v_hi, v_los, v_his),
      greatest(coalesce(r.time_spent_minutes, 0), 0)
    );

    UPDATE public.learning_path_progress_sessions
       SET settled_at = now(),
           credited_minutes = v_credit
     WHERE id = r.id
       AND settled_at IS NULL;

    IF FOUND THEN
      v_settled := v_settled + 1;
      v_group_minutes := v_group_minutes + v_credit;
      v_group_last_end := greatest(coalesce(v_group_last_end, r.session_end), r.session_end);
      -- This interval is now covered for the rest of the group.
      v_los := array_append(v_los, v_lo);
      v_his := array_append(v_his, v_hi);
    END IF;
  END LOOP;

  IF v_cur_user IS NOT NULL THEN
    PERFORM public.lp_record_progress(v_cur_user, v_cur_path, v_group_minutes, v_group_last_end, NULL, NULL, false);
  END IF;

  RETURN v_settled;
END;
$BODY$;

COMMENT ON FUNCTION public.settle_learning_path_sessions(uuid[]) IS
  'W-B2c-01 / R2-03 / R2-04: settles CLOSED, unsettled sessions exactly once (SKIP LOCKED + settled_at) and credits the UNION of their intervals per (user, path) to learning_path_user_progress and, when present, the direct assignment row. Each session is credited only for the part of its interval not already covered by the pair''s already-settled or earlier-in-batch sessions (lp_novel_minutes over the covered set, correct for disjoint and out-of-order intervals), clipped to its own duration; under a per-(user, path) advisory lock. Internal: no EXECUTE grant.';

REVOKE ALL ON FUNCTION public.settle_learning_path_sessions(uuid[]) FROM PUBLIC, anon, authenticated, service_role;

-- start: serialised per (user, path); closes and settles the caller's open
-- sessions on the path; records own progress (started) for every assignee.
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
  IF p_user_id IS NULL OR p_user_id <> v_actor THEN
    RAISE EXCEPTION 'Caller-supplied user does not match the authenticated user' USING ERRCODE = '42501';
  END IF;
  IF NOT (public.auth_is_admin() OR public.auth_is_learning_path_assignee(p_path_id)) THEN
    RAISE EXCEPTION 'User is not assigned to this learning path' USING ERRCODE = '42501';
  END IF;
  IF NOT public.learning_path_has_course(p_path_id, p_course_id) THEN
    RAISE EXCEPTION 'Course is not part of this learning path' USING ERRCODE = '22023';
  END IF;

  -- Concurrent starts of the same (user, path) run one after the other: the
  -- second sees (and closes) the first's session instead of racing it.
  PERFORM pg_advisory_xact_lock(hashtext(v_actor::text), hashtext(p_path_id::text));

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

  PERFORM public.lp_record_progress(v_actor, p_path_id, 0, now(), NULL, NULL, true);

  RETURN v_session_id;
END;
$$;

-- Activity on the caller's own OPEN session: activity type, course (must
-- belong to the path), heartbeat; course_start advances the course sequence,
-- path_complete records completion — for every assignee, in the own-progress
-- row (and the direct assignment row when present).
CREATE OR REPLACE FUNCTION public.record_learning_path_activity(
  p_session_id uuid,
  p_activity_type character varying,
  p_course_id uuid DEFAULT NULL::uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_path uuid;
  v_session public.learning_path_progress_sessions;
  v_sequence integer;
  v_completed timestamptz;
BEGIN
  IF v_actor IS NULL THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_activity_type IS NULL OR p_activity_type NOT IN ('path_view', 'course_start', 'course_progress', 'course_complete', 'path_complete') THEN
    RAISE EXCEPTION 'Invalid activity type' USING ERRCODE = '22023';
  END IF;

  -- Identity of the session (immutable columns), read without a lock.
  SELECT path_id INTO v_path
    FROM public.learning_path_progress_sessions
   WHERE id = p_session_id
     AND user_id = v_actor;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- R3-01: new activity requires CURRENT assignment authority — a direct
  -- assignment or an active membership of an assigned group — exactly as a
  -- new start does (literal admin excepted). Session ownership alone is not
  -- authority: a learner whose assignment or membership ended keeps every
  -- credit already recorded but can record no further activity, course
  -- sequence or completion. Nothing has been written at this point.
  IF NOT (public.auth_is_admin() OR public.auth_is_learning_path_assignee(v_path)) THEN
    RAISE EXCEPTION 'User is not assigned to this learning path' USING ERRCODE = '42501';
  END IF;

  -- Lock protocol (R3-02): advisory(user, path) BEFORE the session row lock.
  PERFORM pg_advisory_xact_lock(hashtext(v_actor::text), hashtext(v_path::text));

  SELECT * INTO v_session
    FROM public.learning_path_progress_sessions
   WHERE id = p_session_id
     AND user_id = v_actor
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_session.session_end IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ended');
  END IF;
  IF p_course_id IS NOT NULL AND NOT public.learning_path_has_course(v_session.path_id, p_course_id) THEN
    RAISE EXCEPTION 'Course is not part of this learning path' USING ERRCODE = '22023';
  END IF;

  UPDATE public.learning_path_progress_sessions
     SET activity_type = p_activity_type,
         course_id = coalesce(p_course_id, course_id),
         last_heartbeat = now(),
         updated_at = now()
   WHERE id = p_session_id;

  IF p_activity_type = 'course_start' AND p_course_id IS NOT NULL THEN
    SELECT lpc.sequence_order INTO v_sequence
      FROM public.learning_path_courses lpc
     WHERE lpc.learning_path_id = v_session.path_id
       AND lpc.course_id = p_course_id;
  END IF;
  IF p_activity_type = 'path_complete' THEN
    v_completed := now();
  END IF;

  PERFORM public.lp_record_progress(v_actor, v_session.path_id, 0, now(), v_sequence, v_completed, false);

  RETURN jsonb_build_object('ok', true, 'sessionId', p_session_id, 'activityType', p_activity_type,
                            'courseId', coalesce(p_course_id, v_session.course_id));
END;
$$;

COMMENT ON FUNCTION public.record_learning_path_activity(uuid, character varying, uuid) IS
  'R2-04 / R3-01: records activity on the caller''s own open session and the matching own progress (course sequence on course_start, completion on path_complete) for direct and group assignees alike, only while the caller holds CURRENT assignment authority (42501 otherwise; admin excepted). Advisory(user, path) is taken before the row lock (R3-02). Replaces the activity route''s direct table writes.';

REVOKE ALL ON FUNCTION public.record_learning_path_activity(uuid, character varying, uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.record_learning_path_activity(uuid, character varying, uuid) TO authenticated;

-- end_learning_path_session / close_stale_learning_path_sessions are unchanged:
-- they already delegate the credit to settle_learning_path_sessions().

-- =============================================================================
-- R2-01 — confirmed function exposures
-- =============================================================================

-- Internal guard: an end user must be able to access the workspace (existing
-- can_access_workspace: admin, community member, or consultor of the school);
-- with no end-user identity only a trusted backend principal passes.
CREATE OR REPLACE FUNCTION public.assert_workspace_access(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_workspace_id IS NULL OR NOT public.can_access_workspace(auth.uid(), p_workspace_id) THEN
      RAISE EXCEPTION 'No access to this workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_workspace_access(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Internal guard: a caller-supplied user id must be the authenticated user
-- (an admin may name anyone); with no end-user identity only a backend
-- principal may name a user.
CREATE OR REPLACE FUNCTION public.assert_actor_matches(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_user_id IS NULL OR (p_user_id <> auth.uid() AND NOT public.auth_is_admin()) THEN
      RAISE EXCEPTION 'Caller-supplied user does not match the authenticated user' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_actor_matches(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- R2-01.a  Backend-only boundary: no application-role caller exists (repository
--          search at base 92df72a6; service-role callers listed where present).
--          EXECUTE: service_role only. search_path pinned. Bodies unchanged
--          except where noted.
-- -----------------------------------------------------------------------------

-- get_all_auth_users(): reads auth.users for every account; no repository
-- caller. Codex reproduced anonymous enumeration. Grants close the anonymous
-- path; the body additionally requires a literal admin or a backend principal
-- so a future grant widening cannot silently reopen it.
CREATE OR REPLACE FUNCTION public.get_all_auth_users()
 RETURNS TABLE(id uuid, email text, created_at timestamp with time zone, email_confirmed_at timestamp with time zone, last_sign_in_at timestamp with time zone, first_name text, last_name text, school_id integer, school_name text, approval_status text, role_type text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF NOT (public.auth_is_admin() OR public.auth_is_backend_caller()) THEN
    RAISE EXCEPTION 'Administrator or backend principal required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (au.id)
    au.id,
    au.email::TEXT,
    au.created_at,
    au.email_confirmed_at,
    au.last_sign_in_at,
    p.first_name::TEXT,
    p.last_name::TEXT,
    p.school_id,
    s.name::TEXT AS school_name,
    p.approval_status::TEXT,
    (
      SELECT ur.role_type::TEXT
      FROM public.user_roles ur
      WHERE ur.user_id = au.id
        AND ur.is_active = TRUE
      ORDER BY
        CASE ur.role_type
          WHEN 'admin' THEN 1
          WHEN 'consultor' THEN 2
          WHEN 'equipo_directivo' THEN 3
          WHEN 'supervisor_de_red' THEN 4
          WHEN 'community_manager' THEN 5
          WHEN 'lider_generacion' THEN 6
          WHEN 'lider_comunidad' THEN 7
          WHEN 'docente' THEN 8
          ELSE 99
        END,
        ur.assigned_at DESC NULLS LAST,
        ur.created_at DESC NULLS LAST
      LIMIT 1
    ) AS role_type
  FROM auth.users au
  LEFT JOIN public.profiles p ON au.id = p.id
  LEFT JOIN public.schools s ON p.school_id = s.id
  WHERE au.deleted_at IS NULL
  ORDER BY au.id, au.created_at DESC;
END;
$function$;

-- Backend-only boundary applied explicitly per signature (no dynamic EXECUTE:
-- the statements are static so the additive-migration guard and the ledger
-- authority inventory can read every grant literally).
ALTER FUNCTION public.get_all_auth_users() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_all_auth_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_all_auth_users() TO service_role;

ALTER FUNCTION public.refresh_user_roles_cache() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_user_roles_cache() TO service_role;

ALTER FUNCTION public.cleanup_expired_test_runs() SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.cleanup_expired_test_runs() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_test_runs() TO service_role;

ALTER FUNCTION public.create_assignment_template_from_block(uuid, uuid, jsonb, uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_assignment_template_from_block(uuid, uuid, jsonb, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_assignment_template_from_block(uuid, uuid, jsonb, uuid) TO service_role;

ALTER FUNCTION public.create_document_version(uuid, text, bigint, character varying, uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_document_version(uuid, text, bigint, character varying, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_document_version(uuid, text, bigint, character varying, uuid) TO service_role;

ALTER FUNCTION public.create_notification(uuid, character varying, character varying, text, character varying, uuid, jsonb) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_notification(uuid, character varying, character varying, text, character varying, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_notification(uuid, character varying, character varying, text, character varying, uuid, jsonb) TO service_role;

ALTER FUNCTION public.create_sample_notifications_for_user(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_sample_notifications_for_user(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_sample_notifications_for_user(uuid) TO service_role;

ALTER FUNCTION public.create_user_notification(uuid, character varying, character varying, text, character varying) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.create_user_notification(uuid, character varying, character varying, text, character varying) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_notification(uuid, character varying, character varying, text, character varying) TO service_role;

ALTER FUNCTION public.grade_quiz_open_responses(uuid, uuid, jsonb) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.grade_quiz_open_responses(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grade_quiz_open_responses(uuid, uuid, jsonb) TO service_role;

ALTER FUNCTION public.get_or_create_community_workspace(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_or_create_community_workspace(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_community_workspace(uuid) TO service_role;

ALTER FUNCTION public.award_course_completion_badge(uuid, uuid, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.award_course_completion_badge(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.award_course_completion_badge(uuid, uuid, text) TO service_role;

ALTER FUNCTION public.start_dev_impersonation(uuid, user_role_type, uuid, integer, uuid, uuid, inet, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.start_dev_impersonation(uuid, user_role_type, uuid, integer, uuid, uuid, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_dev_impersonation(uuid, user_role_type, uuid, integer, uuid, uuid, inet, text) TO service_role;

ALTER FUNCTION public.end_dev_impersonation(uuid, inet, text) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.end_dev_impersonation(uuid, inet, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.end_dev_impersonation(uuid, inet, text) TO service_role;

ALTER FUNCTION public.get_active_dev_impersonation(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_active_dev_impersonation(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_dev_impersonation(uuid) TO service_role;

ALTER FUNCTION public.get_reportable_users(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_reportable_users(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reportable_users(uuid) TO service_role;

ALTER FUNCTION public.get_reportable_users_enhanced(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_reportable_users_enhanced(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_reportable_users_enhanced(uuid) TO service_role;

ALTER FUNCTION public.get_activity_stats(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_activity_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_activity_stats(uuid) TO service_role;

ALTER FUNCTION public.get_thread_statistics(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_thread_statistics(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_thread_statistics(uuid) TO service_role;

ALTER FUNCTION public.get_workspace_messaging_stats(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.get_workspace_messaging_stats(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_workspace_messaging_stats(uuid) TO service_role;

ALTER FUNCTION public.calculate_quiz_score(uuid) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.calculate_quiz_score(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_quiz_score(uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- R2-01.b  Actor / membership binding: a browser caller exists (utils/
--          documentUtils.ts, utils/meetingUtils.ts, utils/activityUtils.ts,
--          pages/community/workspace.tsx), so authenticated keeps EXECUTE and
--          the body binds the caller-supplied identifiers to auth.uid() and the
--          caller's workspace access. anon / PUBLIC revoked; service_role kept.
-- -----------------------------------------------------------------------------

-- create_activity: the actor is the authenticated user. A p_user_id naming
-- anyone else is refused (admins excepted); related users are data, not actors.
CREATE OR REPLACE FUNCTION public.create_activity(p_workspace_id uuid, p_activity_type activity_type, p_entity_type entity_type, p_user_id uuid DEFAULT NULL::uuid, p_entity_id uuid DEFAULT NULL::uuid, p_title text DEFAULT NULL::text, p_description text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb, p_importance_score integer DEFAULT 1, p_tags text[] DEFAULT '{}'::text[], p_related_users uuid[] DEFAULT '{}'::uuid[])
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
    activity_id UUID;
    v_actor uuid := coalesce(p_user_id, auth.uid());
BEGIN
    PERFORM public.assert_workspace_access(p_workspace_id);
    PERFORM public.assert_actor_matches(v_actor);

    INSERT INTO activity_feed (
        workspace_id,
        user_id,
        activity_type,
        entity_type,
        entity_id,
        title,
        description,
        metadata,
        importance_score,
        tags,
        related_users
    ) VALUES (
        p_workspace_id,
        v_actor,
        p_activity_type,
        p_entity_type,
        p_entity_id,
        COALESCE(p_title, p_activity_type::text),
        p_description,
        p_metadata,
        p_importance_score,
        p_tags,
        p_related_users
    ) RETURNING id INTO activity_id;

    RETURN activity_id;
END;
$function$;

-- increment_document_counter: the access log names the authenticated user; the
-- document's workspace must be accessible to the caller; counter_type is closed.
CREATE OR REPLACE FUNCTION public.increment_document_counter(document_uuid uuid, counter_type text, user_uuid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  workspace_uuid UUID;
  v_actor uuid := coalesce(user_uuid, auth.uid());
BEGIN
  IF counter_type NOT IN ('view', 'download') THEN
    RAISE EXCEPTION 'Invalid counter type' USING ERRCODE = '22023';
  END IF;

  SELECT workspace_id INTO workspace_uuid
  FROM community_documents
  WHERE id = document_uuid;

  IF workspace_uuid IS NULL THEN
    RETURN;  -- unknown document: nothing to count, nothing disclosed
  END IF;

  PERFORM public.assert_workspace_access(workspace_uuid);
  IF v_actor IS NOT NULL THEN
    PERFORM public.assert_actor_matches(v_actor);
  END IF;

  IF counter_type = 'view' THEN
    UPDATE community_documents
    SET view_count = view_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  ELSE
    UPDATE community_documents
    SET download_count = download_count + 1, updated_at = NOW()
    WHERE id = document_uuid;
  END IF;

  IF v_actor IS NOT NULL THEN
    INSERT INTO document_access_log (document_id, user_id, workspace_id, action_type)
    VALUES (document_uuid, v_actor, workspace_uuid, counter_type);
  END IF;
END;
$function$;

-- get_document_statistics / get_recent_document_activity / get_meeting_stats:
-- workspace aggregates for members of that workspace only.
CREATE OR REPLACE FUNCTION public.get_document_statistics(workspace_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  result JSON;
BEGIN
  PERFORM public.assert_workspace_access(workspace_uuid);

  SELECT json_build_object(
    'total_documents', COALESCE(total_docs.count, 0),
    'total_folders', COALESCE(total_folders.count, 0),
    'total_storage_bytes', COALESCE(total_storage.sum, 0),
    'total_downloads', COALESCE(total_downloads.sum, 0),
    'recent_uploads', COALESCE(recent_uploads.count, 0),
    'file_types', COALESCE(file_types.types, '[]'::json),
    'top_uploaders', COALESCE(top_uploaders.uploaders, '[]'::json)
  ) INTO result
  FROM
    (SELECT COUNT(*) as count FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_docs
  CROSS JOIN
    (SELECT COUNT(*) as count FROM document_folders WHERE workspace_id = workspace_uuid) total_folders
  CROSS JOIN
    (SELECT COALESCE(SUM(file_size), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_storage
  CROSS JOIN
    (SELECT COALESCE(SUM(download_count), 0) as sum FROM community_documents WHERE workspace_id = workspace_uuid AND is_active = true) total_downloads
  CROSS JOIN
    (SELECT COUNT(*) as count FROM community_documents
     WHERE workspace_id = workspace_uuid AND is_active = true AND created_at >= NOW() - INTERVAL '7 days') recent_uploads
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('mime_type', mime_type, 'count', count)), '[]'::json) as types
     FROM (SELECT mime_type, COUNT(*) as count
           FROM community_documents
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY mime_type
           ORDER BY count DESC
           LIMIT 10) types) file_types
  CROSS JOIN
    (SELECT COALESCE(json_agg(json_build_object('user_id', uploaded_by, 'count', count)), '[]'::json) as uploaders
     FROM (SELECT uploaded_by, COUNT(*) as count
           FROM community_documents
           WHERE workspace_id = workspace_uuid AND is_active = true
           GROUP BY uploaded_by
           ORDER BY count DESC
           LIMIT 5) uploaders) top_uploaders;

  RETURN result;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_recent_document_activity(workspace_uuid uuid, limit_count integer DEFAULT 20)
 RETURNS TABLE(document_id uuid, document_title character varying, action_type character varying, user_id uuid, accessed_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.assert_workspace_access(workspace_uuid);

  RETURN QUERY
  SELECT
    dal.document_id,
    cd.title as document_title,
    dal.action_type,
    dal.user_id,
    dal.accessed_at
  FROM document_access_log dal
  JOIN community_documents cd ON dal.document_id = cd.id
  WHERE dal.workspace_id = workspace_uuid
    AND cd.is_active = true
  ORDER BY dal.accessed_at DESC
  LIMIT limit_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_meeting_stats(p_workspace_id uuid)
 RETURNS TABLE(total_meetings bigint, upcoming_meetings bigint, completed_meetings bigint, total_tasks bigint, completed_tasks bigint, overdue_tasks bigint, total_commitments bigint, completed_commitments bigint, overdue_commitments bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.assert_workspace_access(p_workspace_id);

  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.is_active = TRUE),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'programada' AND cm.meeting_date > NOW()),
    (SELECT COUNT(*) FROM community_meetings cm WHERE cm.workspace_id = p_workspace_id AND cm.status = 'completada'),

    (SELECT COUNT(*) FROM meeting_tasks mt
     JOIN community_meetings cm ON cm.id = mt.meeting_id
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_tasks mt
     JOIN community_meetings cm ON cm.id = mt.meeting_id
     WHERE cm.workspace_id = p_workspace_id AND mt.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_tasks mt
     JOIN community_meetings cm ON cm.id = mt.meeting_id
     WHERE cm.workspace_id = p_workspace_id AND mt.status IN ('pendiente', 'en_progreso') AND mt.due_date < CURRENT_DATE),

    (SELECT COUNT(*) FROM meeting_commitments mc
     JOIN community_meetings cm ON cm.id = mc.meeting_id
     WHERE cm.workspace_id = p_workspace_id),
    (SELECT COUNT(*) FROM meeting_commitments mc
     JOIN community_meetings cm ON cm.id = mc.meeting_id
     WHERE cm.workspace_id = p_workspace_id AND mc.status = 'completado'),
    (SELECT COUNT(*) FROM meeting_commitments mc
     JOIN community_meetings cm ON cm.id = mc.meeting_id
     WHERE cm.workspace_id = p_workspace_id AND mc.status IN ('pendiente', 'en_progreso') AND mc.due_date < CURRENT_DATE);
END;
$function$;

-- get_overdue_items: a workspace filter requires access to that workspace; a
-- user filter must name the caller (admins excepted); a non-admin end user
-- with neither filter sees only the items assigned to them.
CREATE OR REPLACE FUNCTION public.get_overdue_items(p_workspace_id uuid DEFAULT NULL::uuid, p_user_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(item_type text, item_id uuid, title text, due_date date, days_overdue integer, assigned_to uuid, meeting_title text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_user_filter uuid := p_user_id;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_workspace_id IS NOT NULL THEN
      PERFORM public.assert_workspace_access(p_workspace_id);
    END IF;
    IF p_user_id IS NOT NULL THEN
      PERFORM public.assert_actor_matches(p_user_id);
    ELSIF p_workspace_id IS NULL AND NOT public.auth_is_admin() THEN
      v_user_filter := auth.uid();
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    'commitment'::TEXT as item_type,
    mc.id as item_id,
    mc.commitment_text as title,
    mc.due_date,
    (CURRENT_DATE - mc.due_date)::INTEGER as days_overdue,
    mc.assigned_to,
    cm.title as meeting_title
  FROM meeting_commitments mc
  JOIN community_meetings cm ON cm.id = mc.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mc.status IN ('pendiente', 'en_progreso')
    AND mc.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (v_user_filter IS NULL OR mc.assigned_to = v_user_filter)

  UNION ALL

  SELECT
    'task'::TEXT as item_type,
    mt.id as item_id,
    mt.task_title as title,
    mt.due_date,
    (CURRENT_DATE - mt.due_date)::INTEGER as days_overdue,
    mt.assigned_to,
    cm.title as meeting_title
  FROM meeting_tasks mt
  JOIN community_meetings cm ON cm.id = mt.meeting_id
  JOIN community_workspaces cw ON cw.id = cm.workspace_id
  WHERE mt.status IN ('pendiente', 'en_progreso')
    AND mt.due_date < CURRENT_DATE
    AND (p_workspace_id IS NULL OR cw.id = p_workspace_id)
    AND (v_user_filter IS NULL OR mt.assigned_to = v_user_filter)

  ORDER BY days_overdue DESC, due_date DESC;
END;
$function$;

-- get_folder_breadcrumb (R2-01 + R3-03): folder names of a workspace the
-- caller can access. The caller must be able to access the starting folder's
-- workspace AND every recursive step stays inside that workspace: an ancestor
-- link that leaves the workspace (a legacy inconsistent row, or a parent that
-- was moved) ends the chain instead of disclosing the foreign folder. The
-- traversal refuses to revisit a folder (cycle guard) and stops at 64 levels
-- (depth bound), so a hostile or corrupt hierarchy cannot recurse unboundedly.
CREATE OR REPLACE FUNCTION public.get_folder_breadcrumb(folder_uuid uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  breadcrumb JSON;
  v_workspace uuid;
BEGIN
  SELECT workspace_id INTO v_workspace FROM document_folders WHERE id = folder_uuid;
  IF v_workspace IS NULL THEN
    RETURN '[]'::json;
  END IF;
  PERFORM public.assert_workspace_access(v_workspace);

  WITH RECURSIVE folder_path AS (
    SELECT id, folder_name, parent_folder_id, 0 AS level, ARRAY[id] AS visited
    FROM document_folders
    WHERE id = folder_uuid
      AND workspace_id = v_workspace

    UNION ALL

    SELECT df.id, df.folder_name, df.parent_folder_id, fp.level + 1, fp.visited || df.id
    FROM document_folders df
    JOIN folder_path fp ON df.id = fp.parent_folder_id
    WHERE df.workspace_id = v_workspace          -- every step stays in the authorized workspace
      AND NOT (df.id = ANY (fp.visited))         -- cycle guard
      AND fp.level < 64                          -- depth bound
  )
  SELECT json_agg(
    json_build_object(
      'id', id,
      'name', folder_name
    ) ORDER BY level DESC
  ) INTO breadcrumb
  FROM folder_path;

  RETURN COALESCE(breadcrumb, '[]'::json);
END;
$function$;

-- document_folders hierarchy integrity (R3-03). The INSERT/UPDATE policies
-- bind a folder to a workspace the caller can access, but nothing bound its
-- parent to the SAME workspace (the parent foreign key is workspace-agnostic).
-- For every new write the parent must exist in the row's workspace, must not
-- be the row itself or one of its descendants (no cycle), and the chain above
-- it must stay within 64 levels. Runs with the invoker's privileges under row
-- security, so a parent the caller cannot see is "not found" — nothing about a
-- foreign folder is disclosed. Existing rows are neither validated nor
-- rewritten (renames of a legacy inconsistent folder keep working: the guard
-- fires only for INSERT and for UPDATE OF parent_folder_id / workspace_id);
-- get_folder_breadcrumb above never returns a foreign ancestor regardless.
CREATE OR REPLACE FUNCTION public.document_folders_parent_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_parent_workspace uuid;
  v_cur uuid;
  v_steps integer := 0;
BEGIN
  IF NEW.parent_folder_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.parent_folder_id = NEW.id THEN
    RAISE EXCEPTION 'A folder cannot be its own parent' USING ERRCODE = '23514';
  END IF;

  SELECT workspace_id INTO v_parent_workspace
    FROM public.document_folders
   WHERE id = NEW.parent_folder_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent folder not found in this workspace' USING ERRCODE = '23514';
  END IF;
  IF v_parent_workspace IS DISTINCT FROM NEW.workspace_id THEN
    RAISE EXCEPTION 'Parent folder must belong to the same workspace' USING ERRCODE = '23514';
  END IF;

  -- Walk up from the parent: reaching NEW.id would close a cycle; more than 64
  -- links is rejected (a legacy cycle above the parent surfaces here too).
  v_cur := NEW.parent_folder_id;
  WHILE v_cur IS NOT NULL LOOP
    IF v_cur = NEW.id THEN
      RAISE EXCEPTION 'Folder hierarchy would form a cycle' USING ERRCODE = '23514';
    END IF;
    v_steps := v_steps + 1;
    IF v_steps > 64 THEN
      RAISE EXCEPTION 'Folder hierarchy is too deep or cyclic' USING ERRCODE = '23514';
    END IF;
    SELECT parent_folder_id INTO v_cur
      FROM public.document_folders
     WHERE id = v_cur;
    IF NOT FOUND THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.document_folders_parent_guard() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER document_folders_parent_guard
  BEFORE INSERT OR UPDATE OF parent_folder_id, workspace_id ON public.document_folders
  FOR EACH ROW EXECUTE FUNCTION public.document_folders_parent_guard();

-- Per-user notification / badge readers and writers: the user id must be the
-- caller (admins excepted); backend principals may name anyone.
CREATE OR REPLACE FUNCTION public.get_unread_notification_count(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  unread_count INTEGER;
BEGIN
  PERFORM public.assert_actor_matches(p_user_id);
  SELECT COUNT(*) INTO unread_count
  FROM user_notifications
  WHERE user_id = p_user_id AND is_read = FALSE;
  RETURN unread_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_user_badges(p_user_id uuid)
 RETURNS TABLE(id uuid, badge_name text, badge_description text, badge_type text, icon_name text, color_primary text, color_secondary text, course_id uuid, course_name text, earned_at timestamp with time zone, points_value integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
    PERFORM public.assert_actor_matches(p_user_id);
    RETURN QUERY
    SELECT
        ub.id,
        b.name AS badge_name,
        b.description AS badge_description,
        b.badge_type,
        b.icon_name,
        b.color_primary,
        b.color_secondary,
        ub.course_id,
        COALESCE(ub.metadata->>'course_name', c.title) AS course_name,
        ub.earned_at,
        b.points_value
    FROM user_badges ub
    JOIN badges b ON b.id = ub.badge_id
    LEFT JOIN courses c ON c.id = ub.course_id
    WHERE ub.user_id = p_user_id
    ORDER BY ub.earned_at DESC;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_all_notifications_read(p_user_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  affected_count INTEGER;
BEGIN
  PERFORM public.assert_actor_matches(p_user_id);
  UPDATE user_notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE user_id = p_user_id AND is_read = FALSE;
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  RETURN affected_count;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(p_notification_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
BEGIN
  PERFORM public.assert_actor_matches(p_user_id);
  UPDATE user_notifications
  SET is_read = TRUE, read_at = NOW()
  WHERE id = p_notification_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$function$;

-- add_feedback_activity: its only legitimate invoker is the
-- feedback_status_change trigger (SECURITY INVOKER, fired by the platform_feedback
-- UPDATE of an admin), which attributes a system message to the feedback's
-- author — so the actor is legitimately not the caller there. Outside a trigger
-- only a backend principal may call it; authenticated keeps EXECUTE because the
-- trigger runs with the invoker's privileges.
CREATE OR REPLACE FUNCTION public.add_feedback_activity(p_feedback_id uuid, p_message text, p_user_id uuid, p_is_system boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pg_temp
AS $function$
DECLARE
  v_activity_id UUID;
BEGIN
  IF pg_trigger_depth() = 0 AND NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Feedback activity is written by the platform, not by clients' USING ERRCODE = '42501';
  END IF;

  INSERT INTO feedback_activity (
    feedback_id,
    message,
    created_by,
    is_system_message
  ) VALUES (
    p_feedback_id,
    p_message,
    p_user_id,
    p_is_system
  ) RETURNING id INTO v_activity_id;

  RETURN v_activity_id;
END;
$function$;

-- update_overdue_status: browser caller utils/meetingUtils.ts:655. The body
-- takes no caller input and derives status deterministically from due dates
-- (idempotent), so an authenticated caller cannot misuse it; anon and PUBLIC
-- are revoked and the search_path is pinned.
ALTER FUNCTION public.update_overdue_status() SET search_path = public, pg_temp;

-- Actor / membership-bound functions: anon/PUBLIC revoked, authenticated and
-- service_role keep EXECUTE (search_path was pinned in each body above, or by the
-- explicit ALTER for update_overdue_status). Static statements, per signature.
REVOKE ALL ON FUNCTION public.create_activity(uuid, activity_type, entity_type, uuid, uuid, text, text, jsonb, integer, text[], uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_activity(uuid, activity_type, entity_type, uuid, uuid, text, text, jsonb, integer, text[], uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_activity(uuid, activity_type, entity_type, uuid, uuid, text, text, jsonb, integer, text[], uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.increment_document_counter(uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.increment_document_counter(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_document_counter(uuid, text, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_document_statistics(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_document_statistics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_document_statistics(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_recent_document_activity(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_recent_document_activity(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_document_activity(uuid, integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_meeting_stats(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_meeting_stats(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_stats(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_overdue_items(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_overdue_items(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_overdue_items(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_folder_breadcrumb(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_folder_breadcrumb(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_folder_breadcrumb(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_unread_notification_count(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_unread_notification_count(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.get_user_badges(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_badges(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_all_notifications_read(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_all_notifications_read(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.mark_notification_read(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid, uuid) TO service_role;

REVOKE ALL ON FUNCTION public.add_feedback_activity(uuid, text, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.add_feedback_activity(uuid, text, uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_feedback_activity(uuid, text, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.update_overdue_status() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_overdue_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_overdue_status() TO service_role;
