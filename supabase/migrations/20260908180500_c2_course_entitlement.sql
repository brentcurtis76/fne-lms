-- =============================================================================
-- 20260907120500_c2_course_entitlement.sql — RLS closure C2: explicit course-
-- enrolment provenance and live learning-path entitlement (decision D1,
-- 2026-09-07: when the last valid learning-path entitlement disappears, course
-- access obtained solely through that path ends; independently granted access,
-- other active entitlement sources, and learning history/progress are kept;
-- historical origins are never guessed or bulk-deleted).
--
-- Depends on: 20260907120000 (batch_assign_learning_path signature/authority,
-- auth_is_learning_path_assignee, learning_path_has_course,
-- courses_learning_path_member_view), 20260907120300 (the assignment seed /
-- ensure triggers stay in place; auth_is_backend_caller tightened),
-- 20260907120400 (auth_actor_bound, is_admin_or_consultor bound — the courses
-- policy altered below keeps calling it). Additive only: three nullable /
-- defaulted columns, one trigger, helper functions, one ALTER POLICY that
-- narrows a SELECT predicate, batch_assign_learning_path recreated with the
-- same signature and result shape.
--
-- Revised 2026-09-08 for the closure review (rls-c-closure-review-2026-09-08.md)
-- WITHOUT a later repair migration, so no supported prefix carries the defect:
--   C-R1-01 enrolment identity / provenance / grant authority are not
--           client-writable (column privileges + a guard on every UPDATE);
--   C-R1-02 the new SECURITY DEFINER readers and writers apply
--           password_change_gate_ok() themselves;
--   C-R1-03 admin_grant_course_access is the atomic, admin-only independent
--           grant; batch_assign_courses declares its provenance.
--   C-R2-01 explicit non-cancelled course assignments independently grant
--           access over an existing enrollment; batch retries ensure that row.
--
-- Model
-- -----
-- course_enrollments.access_origin ∈ {'independent','learning_path','unknown'}
--   'learning_path'  — the row was created by a learning-path assignment
--                      (batch_assign_learning_path, a group membership joining
--                      an assigned community, or a course added to an assigned
--                      path). It grants access ONLY while the user still holds
--                      a CURRENT entitlement to that course through SOME path
--                      (a direct assignment or an active membership of an
--                      assigned group, evaluated live), OR a non-cancelled
--                      explicit course_assignments source (C-R2-01). No stored revocation
--                      write is needed: unassignment, membership deactivation,
--                      course removal from the path and path deletion all end
--                      the access automatically, and reassignment restores it.
--   'independent'    — an explicit non-path grant (admin course assignment,
--                      seed/QA scripts, any future self-enrolment). Durable.
--   'unknown'        — every row that existed before this migration, and any
--                      writer not yet declaring an origin. EXPLICITLY
--                      UNRESOLVED: treated like 'independent' (existing access
--                      preserved) until reconciled by a separately authorized,
--                      aggregate-first procedure
--                      (docs/reviews/rls-course-entitlement-reconciliation-2026-09-07.md).
-- The enrolment row itself (progress, completion, certificate, timestamps) is
-- never deleted or rewritten by an entitlement change: a progress record
-- grants no access, and losing access discards no history. Explicit batch
-- grants may reactivate status and refresh total_lessons without rewriting
-- identity, provenance, enrollment time or learning history.
-- course_enrollments.source_path_id — informational: the path whose assignment
-- created the row (ON DELETE SET NULL). Never an authority source.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Provenance columns
-- -----------------------------------------------------------------------------
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS access_origin text NOT NULL DEFAULT 'unknown'
    CONSTRAINT course_enrollments_access_origin_check
    CHECK (access_origin IN ('independent', 'learning_path', 'unknown'));
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS source_path_id uuid REFERENCES public.learning_paths(id) ON DELETE SET NULL;
ALTER TABLE public.course_enrollments
  ADD COLUMN IF NOT EXISTS access_origin_set_at timestamptz;

COMMENT ON COLUMN public.course_enrollments.access_origin IS
  'C2 / D1 (2026-09-07): independent = durable explicit grant; learning_path = grants access only while a CURRENT learning-path entitlement to the course exists (live); unknown = pre-existing row of unresolved origin, access preserved until separately reconciled. Not client-writable (course_enrollments_origin_guard).';
COMMENT ON COLUMN public.course_enrollments.source_path_id IS
  'C2 (2026-09-07): the learning path whose assignment created this row (informational, never an authority source).';

CREATE INDEX IF NOT EXISTS idx_course_enrollments_access_origin
  ON public.course_enrollments (access_origin);

-- -----------------------------------------------------------------------------
-- 1b. Enrolment identity and authority are not client-writable (C-R1-01,
--     closure review 2026-09-08).
-- -----------------------------------------------------------------------------
-- Application principals hold table-level UPDATE on course_enrollments and an
-- own-row UPDATE policy (baseline "Users can update own enrollment progress",
-- USING / WITH CHECK user_id = auth.uid()). That policy is what lets a learner
-- write their own progress; it also let them change course_id, so an
-- independent or unknown-origin row could be MOVED to another course and the
-- entitlement-aware predicate would honour it (Codex reproduction). Two layers
-- close that, both compatible with every legitimate writer:
--
--   (a) column privileges: anon loses UPDATE entirely (no policy ever admitted
--       anon and no application path writes as anon); authenticated keeps
--       UPDATE on every column EXCEPT the identity and provenance columns
--       (id, user_id, course_id, access_origin, source_path_id,
--       access_origin_set_at). A future column must be granted explicitly —
--       pgTAP 078 §1 pins the list. service_role keeps table-level UPDATE.
--   (b) the guard trigger below fires on EVERY update and refuses a change to
--       any AUTHORITY-BEARING column — the six above plus enrolled_by and
--       enrollment_type (who granted, and how) — unless the actor is a literal
--       admin or a trusted backend principal. It runs inside SECURITY DEFINER
--       writers too, so an alternate RPC path cannot do what a direct UPDATE
--       cannot.
--
-- Legitimate writers, re-evaluated against both layers:
--   * learner progress (own-row PATCH; update_course_enrollment_progress
--     trigger fired by lesson_progress writes; lp_record_progress): progress,
--     completion, timing and status columns only — unaffected;
--   * admin grants: admin_grant_course_access (below) / batch_assign_courses
--     (admin or consultor; INSERT declares 'independent', the ON CONFLICT
--     branch no longer rewrites grant provenance) / the service-role seeds and
--     the previously deployed admin route (backend principal) — pass;
--   * path-derived rows: lp_ensure_path_enrollments and the two triggers only
--     INSERT (ON CONFLICT DO NOTHING) — pass.
REVOKE UPDATE ON public.course_enrollments FROM anon;
REVOKE UPDATE ON public.course_enrollments FROM authenticated;
GRANT UPDATE (
  enrolled_at, progress_percentage, lessons_completed, total_lessons, is_completed,
  completed_at, completion_certificate_url, total_time_spent_seconds,
  estimated_completion_time_seconds, status, overall_score, passing_threshold,
  has_passed, access_expires_at, enrollment_data, created_at, updated_at,
  completion_notification_sent, enrolled_by, enrollment_type
) ON public.course_enrollments TO authenticated;

CREATE OR REPLACE FUNCTION public.course_enrollments_origin_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_identity_changed boolean;
  v_provenance_changed boolean;
  v_grant_changed boolean;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_identity_changed := OLD.id IS DISTINCT FROM NEW.id
                       OR OLD.user_id IS DISTINCT FROM NEW.user_id
                       OR OLD.course_id IS DISTINCT FROM NEW.course_id;
    v_provenance_changed := OLD.access_origin IS DISTINCT FROM NEW.access_origin
                         OR OLD.source_path_id IS DISTINCT FROM NEW.source_path_id
                         OR OLD.access_origin_set_at IS DISTINCT FROM NEW.access_origin_set_at;
    v_grant_changed := OLD.enrolled_by IS DISTINCT FROM NEW.enrolled_by
                    OR OLD.enrollment_type IS DISTINCT FROM NEW.enrollment_type;
    IF v_identity_changed OR v_provenance_changed OR v_grant_changed THEN
      IF auth.uid() IS NOT NULL THEN
        IF NOT public.auth_is_admin() THEN
          RAISE EXCEPTION 'Enrollment identity, provenance and grant authority are not client-writable' USING ERRCODE = '42501';
        END IF;
      ELSIF NOT public.auth_is_backend_caller() THEN
        RAISE EXCEPTION 'Enrollment identity, provenance and grant authority are not client-writable' USING ERRCODE = '42501';
      END IF;
      IF OLD.access_origin IS DISTINCT FROM NEW.access_origin
         OR OLD.source_path_id IS DISTINCT FROM NEW.source_path_id THEN
        NEW.access_origin_set_at := now();
      END IF;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.access_origin <> 'unknown' AND NEW.access_origin_set_at IS NULL THEN
    NEW.access_origin_set_at := now();
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.course_enrollments_origin_guard() FROM PUBLIC, anon, authenticated, service_role;

-- Fires on every UPDATE (not only UPDATE OF the provenance columns): the check
-- is a handful of comparisons per row, and the alternative — a column list —
-- is exactly the shape that left course_id open. CREATE OR REPLACE replaces
-- the earlier UPDATE OF (access_origin, source_path_id) definition in place.
CREATE OR REPLACE TRIGGER course_enrollments_origin_guard
  BEFORE INSERT OR UPDATE ON public.course_enrollments
  FOR EACH ROW EXECUTE FUNCTION public.course_enrollments_origin_guard();

-- -----------------------------------------------------------------------------
-- 2. Live entitlement and access helpers (internal unless noted)
-- -----------------------------------------------------------------------------

-- Does p_user_id CURRENTLY hold a learning-path entitlement to p_course_id?
-- (a direct assignment, or an active membership of the community behind an
-- assigned workspace, for ANY path that contains the course). Same membership
-- resolution as auth_is_learning_path_assignee (R2).
CREATE OR REPLACE FUNCTION public.lp_user_entitled_to_course(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT p_user_id IS NOT NULL AND p_course_id IS NOT NULL AND EXISTS (
    SELECT 1
      FROM public.learning_path_courses lpc
      JOIN public.learning_path_assignments lpa ON lpa.path_id = lpc.learning_path_id
     WHERE lpc.course_id = p_course_id
       AND (
         lpa.user_id = p_user_id
         OR (
           lpa.group_id IS NOT NULL
           AND EXISTS (
             SELECT 1
               FROM public.community_workspaces cw
               JOIN public.user_roles ur ON ur.community_id = cw.community_id
              WHERE cw.id = lpa.group_id
                AND ur.user_id = p_user_id
                AND ur.is_active = true
           )
         )
       )
  );
$$;
REVOKE ALL ON FUNCTION public.lp_user_entitled_to_course(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Does the enrolment row of (p_user_id, p_course_id) grant access NOW?
-- C-R2-01: non-cancelled course_assignments are explicit independent sources,
-- including existing assignments. Only admin RLS / trusted backend and the
-- actor-checked batch RPC write this table; path writers and progress do not.
-- No historical enrollment origin is inferred or rewritten.
CREATE OR REPLACE FUNCTION public.course_enrollment_grants_access(p_user_id uuid, p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.course_enrollments ce
     WHERE ce.user_id = p_user_id
       AND ce.course_id = p_course_id
       AND (ce.access_origin <> 'learning_path'
            OR public.lp_user_entitled_to_course(p_user_id, p_course_id)
            OR EXISTS (SELECT 1 FROM public.course_assignments ca
                        WHERE ca.teacher_id = p_user_id AND ca.course_id = p_course_id
                          AND ca.status IS DISTINCT FROM 'cancelled'))
  );
$$;
REVOKE ALL ON FUNCTION public.course_enrollment_grants_access(uuid, uuid) FROM PUBLIC, anon, authenticated, service_role;

-- The policy predicate used by modules / lessons / blocks / lesson_assignments /
-- assignment_instances student views: same signature and grants as before, now
-- entitlement-aware.
CREATE OR REPLACE FUNCTION public.auth_is_course_student(p_course_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT auth.uid() IS NOT NULL
     AND public.course_enrollment_grants_access(auth.uid(), p_course_id);
$$;
REVOKE ALL ON FUNCTION public.auth_is_course_student(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.auth_is_course_student(uuid) TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.auth_is_course_student(uuid) IS
  'C2 / D1 (2026-09-07): TRUE when the caller holds an enrolment that grants access NOW — an independent/unknown-origin row, or a learning_path-origin row backed by a current path entitlement or an explicit non-cancelled course assignment.';

-- The course ids the caller may open now (used by the my-courses listing so a
-- lapsed path-only enrolment is not listed while its history is retained).
CREATE OR REPLACE FUNCTION public.auth_accessible_course_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT ce.course_id
    FROM public.course_enrollments ce
   WHERE auth.uid() IS NOT NULL
     -- C-R1-02: a SECURITY DEFINER reader bypasses the restrictive
     -- forced_password_change_guard policy, so it applies the same predicate.
     AND public.password_change_gate_ok()
     AND ce.user_id = auth.uid()
     AND public.course_enrollment_grants_access(ce.user_id, ce.course_id);
$$;
REVOKE ALL ON FUNCTION public.auth_accessible_course_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auth_accessible_course_ids() TO authenticated, service_role;

-- The courses row itself: the pre-existing public-targeted policy tested the
-- bare existence of an enrolment row. It now uses the entitlement-aware
-- predicate (independent / unknown rows: unchanged; lapsed learning_path rows:
-- no longer readable through this policy — the LP member view policy already
-- covers current assignees).
ALTER POLICY enrolled_or_owner_can_read_courses ON public.courses
  USING (
    public.auth_is_course_student(id)
    OR created_by = auth.uid()
    OR public.is_admin_or_consultor(auth.uid())
  );

-- -----------------------------------------------------------------------------
-- 3. Path-derived enrolment writer (one helper, used by every path-side writer)
-- -----------------------------------------------------------------------------
-- Inserts the missing (user, course) enrolments for every course of p_path_id
-- with access_origin = 'learning_path' and source_path_id = p_path_id. Existing
-- rows are left exactly as they are (an 'unknown' row is NOT reclassified — its
-- origin is still unknown; an 'independent' row stays durable). Returns the
-- number of rows created.
CREATE OR REPLACE FUNCTION public.lp_ensure_path_enrollments(p_path_id uuid, p_user_ids uuid[], p_enrolled_by uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer := 0;
BEGIN
  IF p_path_id IS NULL OR p_user_ids IS NULL OR coalesce(array_length(p_user_ids, 1), 0) = 0 THEN
    RETURN 0;
  END IF;
  WITH ins AS (
    INSERT INTO public.course_enrollments (
      course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status, total_lessons,
      access_origin, source_path_id, access_origin_set_at
    )
    SELECT lpc.course_id, u.user_id, 'assigned', p_enrolled_by, now(), 'active',
           (SELECT count(*) FROM public.lessons l WHERE l.course_id = lpc.course_id),
           'learning_path', p_path_id, now()
      FROM public.learning_path_courses lpc
     CROSS JOIN unnest(p_user_ids) AS u(user_id)
     WHERE lpc.learning_path_id = p_path_id
       AND EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = u.user_id)
     ORDER BY lpc.sequence_order
    ON CONFLICT (user_id, course_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.lp_ensure_path_enrollments(uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated, service_role;

-- Active members of the community behind an assigned workspace.
CREATE OR REPLACE FUNCTION public.lp_group_member_ids(p_group_id uuid)
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT coalesce(array_agg(DISTINCT ur.user_id), '{}'::uuid[])
    FROM public.community_workspaces cw
    JOIN public.user_roles ur ON ur.community_id = cw.community_id
   WHERE cw.id = p_group_id AND ur.is_active = true;
$$;
REVOKE ALL ON FUNCTION public.lp_group_member_ids(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- batch_assign_learning_path: identical signature, authority, result keys and
-- skip/success accounting as 20260907120000; the enrolment side effect now goes
-- through lp_ensure_path_enrollments (origin recorded).
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
  -- C-R1-02: the forced-password-change boundary holds inside the definer
  -- writer too (the restrictive table policy does not apply to it).
  IF NOT public.password_change_gate_ok() THEN
    RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
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
      v_enroll_count := v_enroll_count + public.lp_ensure_path_enrollments(p_path_id, ARRAY[v_user_id], v_actor);
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
      v_enroll_count := v_enroll_count + public.lp_ensure_path_enrollments(p_path_id, public.lp_group_member_ids(v_group_id), v_actor);
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
REVOKE ALL ON FUNCTION public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.batch_assign_learning_path(uuid, uuid[], uuid[], uuid) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3b. Independent (non-path) grant writers declare their provenance
--     (C-R1-03, closure review 2026-09-08).
-- -----------------------------------------------------------------------------
-- The designated independent-entitlement writer for the admin course
-- assignment surface (pages/api/admin/course-assignments.ts). Atomic: the
-- course_assignments rows and the course_enrollments rows (created as
-- 'independent', or an existing path-derived / unknown row PROMOTED to
-- 'independent') succeed or fail together, so the API can never report a
-- durable grant whose enrolment or provenance write failed. Authority is the
-- verified caller: a literal active admin (auth_is_admin(), the role row —
-- never user metadata) who is not held by the forced-password-change gate, or
-- a trusted backend principal. Idempotent: a repeated call reports 0 created /
-- n existing. Progress, completion, certificate and timestamps of an existing
-- row are never touched; only status ('active'), provenance and total_lessons
-- are refreshed.
CREATE OR REPLACE FUNCTION public.admin_grant_course_access(p_course_id uuid, p_user_ids uuid[])
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_actor uuid := auth.uid();
  v_ids uuid[];
  v_missing integer;
  v_total_lessons integer;
  v_assign_created integer := 0;
  v_enrol_created integer := 0;
  v_enrol_promoted integer := 0;
  v_enrol_unchanged integer := 0;
  v_new_users uuid[] := '{}';
BEGIN
  IF v_actor IS NOT NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
    END IF;
    IF NOT public.password_change_gate_ok() THEN
      RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  IF p_course_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.courses c WHERE c.id = p_course_id) THEN
    RAISE EXCEPTION 'Course not found';
  END IF;

  SELECT coalesce(array_agg(DISTINCT u ORDER BY u), '{}'::uuid[]) INTO v_ids
    FROM unnest(coalesce(p_user_ids, '{}'::uuid[])) AS u
   WHERE u IS NOT NULL;
  IF coalesce(array_length(v_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'At least one recipient is required';
  END IF;
  IF array_length(v_ids, 1) > 200 THEN
    RAISE EXCEPTION 'At most 200 recipients per call';
  END IF;

  SELECT count(*) INTO v_missing
    FROM unnest(v_ids) AS u
   WHERE NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = u);
  IF v_missing > 0 THEN
    -- counts only: no identifiers in the error text
    RAISE EXCEPTION '% recipient(s) do not exist', v_missing;
  END IF;

  SELECT count(*) INTO v_total_lessons FROM public.lessons l WHERE l.course_id = p_course_id;

  WITH ins AS (
    INSERT INTO public.course_assignments (course_id, teacher_id, assigned_by, assigned_at)
    SELECT p_course_id, u, v_actor, now()
      FROM unnest(v_ids) AS u
    ON CONFLICT (course_id, teacher_id) DO NOTHING
    RETURNING teacher_id
  )
  SELECT count(*), coalesce(array_agg(teacher_id), '{}'::uuid[]) INTO v_assign_created, v_new_users FROM ins;

  -- C-R2-01: serialize result classification with batch grants and other admin
  -- retries on the same explicit source. Lock in recipient order before reading
  -- enrollment origins; a waiting call then classifies the committed outcome.
  PERFORM 1 FROM public.course_assignments ca
   WHERE ca.course_id = p_course_id AND ca.teacher_id = ANY(v_ids)
   ORDER BY ca.teacher_id FOR UPDATE;

  WITH before AS (
    SELECT ce.user_id, ce.access_origin
      FROM public.course_enrollments ce
     WHERE ce.course_id = p_course_id AND ce.user_id = ANY (v_ids)
  ), up AS (
    INSERT INTO public.course_enrollments AS ce (
      course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status, total_lessons,
      access_origin, source_path_id, access_origin_set_at
    )
    SELECT p_course_id, u, 'assigned', v_actor, now(), 'active', v_total_lessons,
           'independent', NULL, now()
      FROM unnest(v_ids) AS u
    ON CONFLICT (user_id, course_id) DO UPDATE
      SET status = 'active',
          total_lessons = EXCLUDED.total_lessons,
          access_origin = 'independent',
          source_path_id = NULL,
          access_origin_set_at = CASE WHEN ce.access_origin = 'independent' THEN ce.access_origin_set_at ELSE now() END,
          updated_at = now()
    RETURNING ce.user_id, (ce.xmax = 0) AS inserted
  )
  SELECT count(*) FILTER (WHERE up.inserted),
         count(*) FILTER (WHERE NOT up.inserted AND b.access_origin IS DISTINCT FROM 'independent'),
         count(*) FILTER (WHERE NOT up.inserted AND b.access_origin = 'independent')
    INTO v_enrol_created, v_enrol_promoted, v_enrol_unchanged
    FROM up LEFT JOIN before b ON b.user_id = up.user_id;

  RETURN jsonb_build_object(
    'success', true,
    'assignments_created', v_assign_created,
    'assignments_existing', array_length(v_ids, 1) - v_assign_created,
    'enrollments_created', v_enrol_created,
    'enrollments_promoted', v_enrol_promoted,
    'enrollments_unchanged', v_enrol_unchanged,
    'newly_assigned_user_ids', to_jsonb(v_new_users)
  );
END;
$$;
REVOKE ALL ON FUNCTION public.admin_grant_course_access(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_grant_course_access(uuid, uuid[]) TO authenticated, service_role;
COMMENT ON FUNCTION public.admin_grant_course_access(uuid, uuid[]) IS
  'C2 / C-R1-03 (2026-09-08): atomic admin course grant — course_assignments row + course_enrollments row created as independent or promoted to independent, progress untouched. Literal active admin (role row) not held by the password gate, or trusted backend; 42501 otherwise. Idempotent.';

-- C-R2-01: course_assignments is an explicit independent source. Path writers
-- never insert it. Existing enrollment provenance remains historical fact; the
-- access helper honors a non-cancelled assignment without relaxing the guard.
-- The old API's result keys stay available. Assignment skips mean an existing
-- assignment, NOT a skipped entitlement check. Enrollment promotion counters
-- describe effective independent entitlement, not an access_origin rewrite.
CREATE OR REPLACE FUNCTION public.batch_assign_courses(p_course_id uuid, p_user_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_caller_id uuid := auth.uid();
    v_user_id uuid;
    v_assignment_id uuid;
    v_assignment_status text;
    v_origin text;
    v_existing_assignment boolean;
    v_existing_enrollment boolean;
    v_success_count int := 0;
    v_skip_count int := 0;
    v_enroll_count int := 0;
    v_promoted_count int := 0;
    v_unchanged_count int := 0;
    v_assignments uuid[] := '{}';
    v_new_users uuid[] := '{}';
    v_total_lessons int;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'Authentication required';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.user_roles
         WHERE user_id = v_caller_id AND is_active = true
           AND role_type IN ('admin', 'consultor')
    ) THEN
        RAISE EXCEPTION 'User does not have permission to assign courses';
    END IF;
    IF NOT public.password_change_gate_ok() THEN
        RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.courses WHERE id = p_course_id) THEN
        RAISE EXCEPTION 'Course not found';
    END IF;
    SELECT count(*) INTO v_total_lessons FROM public.lessons WHERE course_id = p_course_id;

    -- Deduplicate and order recipients: overlapping calls take assignment row
    -- locks in the same order. ON CONFLICT closes the absent-row race; the next
    -- statement sees the winner at READ COMMITTED. Any error rolls back ALL
    -- recipients, including their assignments, enrollments and result counts.
    FOR v_user_id IN SELECT DISTINCT u FROM unnest(p_user_ids) u ORDER BY u
    LOOP
        IF v_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = v_user_id) THEN
            RAISE EXCEPTION 'Recipient does not exist';
        END IF;
        v_assignment_id := NULL;
        INSERT INTO public.course_assignments (course_id, teacher_id, assigned_by, assigned_at)
        VALUES (p_course_id, v_user_id, v_caller_id, now())
        ON CONFLICT (course_id, teacher_id) DO NOTHING
        RETURNING id INTO v_assignment_id;
        v_existing_assignment := v_assignment_id IS NULL;
        IF v_existing_assignment THEN
            SELECT id, status INTO STRICT v_assignment_id, v_assignment_status
              FROM public.course_assignments
             WHERE course_id = p_course_id AND teacher_id = v_user_id FOR UPDATE;
            v_skip_count := v_skip_count + 1;
        ELSE
            v_assignment_status := 'active';
            v_success_count := v_success_count + 1;
            v_assignments := array_append(v_assignments, v_assignment_id);
            v_new_users := array_append(v_new_users, v_user_id);
        END IF;

        -- Always ensure the enrollment, including the formerly early-skipped
        -- existing-assignment case. Conflict never overwrites identity, origin,
        -- enrollment time, progress, completion or certificate history.
        INSERT INTO public.course_enrollments (
            course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status,
            total_lessons, access_origin, source_path_id, access_origin_set_at
        ) VALUES (
            p_course_id, v_user_id, 'assigned', v_caller_id, now(), 'active',
            v_total_lessons, 'independent', NULL, now()
        ) ON CONFLICT (course_id, user_id) DO NOTHING;
        v_existing_enrollment := NOT FOUND;
        IF NOT v_existing_enrollment THEN
            v_enroll_count := v_enroll_count + 1;
        ELSE
            SELECT access_origin INTO STRICT v_origin FROM public.course_enrollments
             WHERE course_id = p_course_id AND user_id = v_user_id FOR UPDATE;
            IF v_origin = 'learning_path'
               AND (NOT v_existing_assignment OR v_assignment_status = 'cancelled') THEN
                v_promoted_count := v_promoted_count + 1;
            ELSE
                v_unchanged_count := v_unchanged_count + 1;
            END IF;
            UPDATE public.course_enrollments SET status = 'active', total_lessons = v_total_lessons
             WHERE course_id = p_course_id AND user_id = v_user_id
               AND (status IS DISTINCT FROM 'active' OR total_lessons IS DISTINCT FROM v_total_lessons);
        END IF;
        -- An explicit regrant reactivates a cancelled source, preserving its
        -- assignment identity, actor and learning history.
        IF v_assignment_status = 'cancelled' THEN
            UPDATE public.course_assignments SET status = 'active' WHERE id = v_assignment_id;
        END IF;
    END LOOP;
    RETURN json_build_object(
        'success', true,
        'assignments_created', v_success_count,
        'assignments_skipped', v_skip_count,
        'enrollments_created', v_enroll_count,
        'enrollments_promoted', v_promoted_count,
        'enrollments_unchanged', v_unchanged_count,
        'assignment_ids', v_assignments,
        'newly_assigned_user_ids', v_new_users,
        'message', format('%s assignment(s) created, %s existing; %s enrollment(s) created, %s independent entitlement(s) promoted, %s unchanged',
                         v_success_count, v_skip_count, v_enroll_count, v_promoted_count, v_unchanged_count)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. The other two ways a path entitlement appears — covered, so every
--    entitled user has an enrolment row (progress tracking, my-courses) and
--    every such row carries its origin.
-- -----------------------------------------------------------------------------

-- 4a. A course added to a path (update_full_learning_path deletes and
--     re-inserts the course list; ON CONFLICT DO NOTHING keeps this idempotent).
CREATE OR REPLACE FUNCTION public.learning_path_courses_enroll_assignees()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_users uuid[];
BEGIN
  SELECT coalesce(array_agg(DISTINCT u), '{}'::uuid[]) INTO v_users
    FROM (
      SELECT lpa.user_id AS u
        FROM public.learning_path_assignments lpa
       WHERE lpa.path_id = NEW.learning_path_id AND lpa.user_id IS NOT NULL
      UNION
      SELECT unnest(public.lp_group_member_ids(lpa.group_id))
        FROM public.learning_path_assignments lpa
       WHERE lpa.path_id = NEW.learning_path_id AND lpa.group_id IS NOT NULL
    ) x;
  IF coalesce(array_length(v_users, 1), 0) > 0 THEN
    INSERT INTO public.course_enrollments (
      course_id, user_id, enrollment_type, enrolled_by, enrolled_at, status, total_lessons,
      access_origin, source_path_id, access_origin_set_at
    )
    SELECT NEW.course_id, u, 'assigned', auth.uid(), now(), 'active',
           (SELECT count(*) FROM public.lessons l WHERE l.course_id = NEW.course_id),
           'learning_path', NEW.learning_path_id, now()
      FROM unnest(v_users) AS u
     WHERE EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = u)
    ON CONFLICT (user_id, course_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.learning_path_courses_enroll_assignees() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER learning_path_courses_enroll_assignees
  AFTER INSERT ON public.learning_path_courses
  FOR EACH ROW EXECUTE FUNCTION public.learning_path_courses_enroll_assignees();

-- 4b. A membership that becomes active in a community whose workspace holds a
--     group assignment (join / reactivation). Deactivation and leaving need no
--     write: the entitlement is evaluated live.
CREATE OR REPLACE FUNCTION public.user_roles_enroll_group_paths()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
BEGIN
  IF NEW.is_active IS DISTINCT FROM true OR NEW.community_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND OLD.is_active IS NOT DISTINCT FROM true AND OLD.community_id IS NOT DISTINCT FROM NEW.community_id THEN
    RETURN NEW; -- nothing became newly active
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles pr WHERE pr.id = NEW.user_id) THEN
    RETURN NEW;
  END IF;
  FOR r IN
    SELECT DISTINCT lpa.path_id, lpa.assigned_by
      FROM public.learning_path_assignments lpa
      JOIN public.community_workspaces cw ON cw.id = lpa.group_id
     WHERE cw.community_id = NEW.community_id
  LOOP
    PERFORM public.lp_ensure_path_enrollments(r.path_id, ARRAY[NEW.user_id], r.assigned_by);
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.user_roles_enroll_group_paths() FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE TRIGGER user_roles_enroll_group_paths
  AFTER INSERT OR UPDATE OF is_active, community_id ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.user_roles_enroll_group_paths();

-- -----------------------------------------------------------------------------
-- 5. Aggregate-only reconciliation report for the historical 'unknown' rows
--    (service_role / admin; counts only, no row identifiers, no PII).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lp_enrollment_origin_report()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v jsonb;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT public.auth_is_admin() THEN
      RAISE EXCEPTION 'Admin only' USING ERRCODE = '42501';
    END IF;
    IF NOT public.password_change_gate_ok() THEN   -- C-R1-02
      RAISE EXCEPTION 'Password change required' USING ERRCODE = '42501';
    END IF;
  ELSIF NOT public.auth_is_backend_caller() THEN
    RAISE EXCEPTION 'Authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT jsonb_build_object(
    'total_enrollments', count(*),
    'by_origin', (SELECT jsonb_object_agg(o, c) FROM (SELECT access_origin o, count(*) c FROM public.course_enrollments GROUP BY 1) t),
    'unknown_total', count(*) FILTER (WHERE ce.access_origin = 'unknown'),
    'unknown_with_current_path_entitlement', count(*) FILTER (WHERE ce.access_origin = 'unknown' AND public.lp_user_entitled_to_course(ce.user_id, ce.course_id)),
    'unknown_without_current_path_entitlement', count(*) FILTER (WHERE ce.access_origin = 'unknown' AND NOT public.lp_user_entitled_to_course(ce.user_id, ce.course_id)),
    -- heuristic CANDIDATES only (never acted on automatically): assigned-type
    -- rows whose enrolment time is within 60 s of an assignment of a path that
    -- contains the course, for the same user
    'unknown_assigned_type_near_a_path_assignment', count(*) FILTER (
      WHERE ce.access_origin = 'unknown' AND ce.enrollment_type = 'assigned' AND EXISTS (
        SELECT 1 FROM public.learning_path_assignments lpa
          JOIN public.learning_path_courses lpc ON lpc.learning_path_id = lpa.path_id AND lpc.course_id = ce.course_id
         WHERE lpa.user_id = ce.user_id
           AND abs(extract(epoch FROM (ce.enrolled_at - lpa.assigned_at))) <= 60)),
    'learning_path_origin_lapsed', count(*) FILTER (WHERE ce.access_origin = 'learning_path' AND NOT public.lp_user_entitled_to_course(ce.user_id, ce.course_id)),
    'unknown_created_after_provenance_started', count(*) FILTER (
      WHERE ce.access_origin = 'unknown'
        AND ce.created_at > (SELECT min(access_origin_set_at) FROM public.course_enrollments WHERE access_origin_set_at IS NOT NULL)),
    'generated_at', now()
  ) INTO v
  FROM public.course_enrollments ce;
  RETURN v;
END;
$$;
REVOKE ALL ON FUNCTION public.lp_enrollment_origin_report() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_enrollment_origin_report() TO authenticated, service_role;
COMMENT ON FUNCTION public.lp_enrollment_origin_report() IS
  'C2 (2026-09-07): aggregate-only counts for the historical unknown-origin enrolment reconciliation (admin or backend). Never returns row identifiers; never changes data.';
