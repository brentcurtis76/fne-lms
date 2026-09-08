-- =============================================================================
-- 20260907120600_c3_reporting_retention.sql — RLS closure C3 + C4: the four
-- learning-path summary relations (decision D2, 2026-09-07: finish the existing
-- reports, literal-admin-only across users) and the durable daily activity
-- grain that lets session retention run without losing reporting history.
--
-- Depends on: 20260907120300 (settle_learning_path_sessions union-credit body,
-- credited_minutes, learning_path_user_progress, lp_record_progress,
-- lp_lock_session_pairs), 20260907120000 (settled_at, close_stale_learning_
-- path_sessions — unchanged, it calls settle), 20260907120400
-- (auth_is_backend_caller usage), 20260907120500 (access_origin is not used by
-- the views; ordering only). Additive: one table, five views, helper and
-- retention functions, settle_learning_path_sessions recreated with the same
-- signature (one extra upsert per settled session), one backfill INSERT.
-- Revised 2026-09-08 (closure review C-R1-02): every view filter also applies
-- password_change_gate_ok(); no later repair migration.
--
-- Metric contract (docs/reviews/rls-learning-path-reporting-contract-2026-09-07.md)
-- ------------------------------------------------------------------------------
-- * Assigned population of a path = DISTINCT users holding a direct assignment
--   OR an active membership of the community behind an assigned workspace
--   (learning_path_assigned_users). Never counted twice.
-- * Course completion = course_enrollments row for a course of the path with
--   is_completed OR progress_percentage >= 100. Path completion =
--   learning_path_user_progress.completed_at. Progress % = completed courses /
--   courses in the path (0 when the path has no course).
-- * Credited time = learning_path_user_progress.total_time_spent_minutes
--   (union-clipped settlement); daily credited time = the per-(path, user,
--   day) grain written at settlement (lp session start day, reporting
--   timezone America/Santiago).
-- * Daily / monthly distinct users are counted from the per-user grain
--   (a month is NOT the sum of its days).
-- * Historical: sessions settled before credited_minutes existed contribute
--   their recorded duration; sessions deleted by earlier maintenance are
--   unknown and absent (documented limit). Users no longer assigned are not in
--   the population; their progress rows and grain remain readable to admins.
-- * No engagement / risk score is defined by any governing document:
--   engagement_score and is_at_risk are NULL (unavailable), never 0 / false.
-- * Every view is a security_barrier view that filters INSIDE to the caller's
--   own rows (user summary) or to literal admin / backend (cross-user views);
--   the API readers gate again (never rely on this alone for a service client).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 0. Reporting timezone
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lp_reporting_timezone()
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$ SELECT 'America/Santiago'::text $$;
REVOKE ALL ON FUNCTION public.lp_reporting_timezone() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_reporting_timezone() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.lp_activity_date(p_ts timestamptz)
RETURNS date
LANGUAGE sql
STABLE
AS $$ SELECT (p_ts AT TIME ZONE public.lp_reporting_timezone())::date $$;
REVOKE ALL ON FUNCTION public.lp_activity_date(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.lp_activity_date(timestamptz) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 1. Durable per-(path, user, day) activity grain — written at settlement,
--    survives session deletion. Learning-path data is global FNE template data
--    keyed by user; like learning_path_user_progress (approved R2–R5) it has no
--    school_id column (tenant scoping is derived through the user, never stored
--    on the path record).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.learning_path_daily_user_activity (
  path_id           uuid NOT NULL REFERENCES public.learning_paths(id) ON DELETE CASCADE,
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activity_date     date NOT NULL,
  sessions_count    integer NOT NULL DEFAULT 0 CHECK (sessions_count >= 0),
  credited_minutes  integer NOT NULL DEFAULT 0 CHECK (credited_minutes >= 0),
  session_minutes   integer NOT NULL DEFAULT 0 CHECK (session_minutes >= 0),
  last_session_end  timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (path_id, user_id, activity_date)
);
CREATE INDEX IF NOT EXISTS idx_lp_daily_user_activity_date ON public.learning_path_daily_user_activity (activity_date);
CREATE INDEX IF NOT EXISTS idx_lp_daily_user_activity_user ON public.learning_path_daily_user_activity (user_id);

COMMENT ON TABLE public.learning_path_daily_user_activity IS
  'C3 (2026-09-07): per-(path, user, activity day in America/Santiago) settled session counts and minutes. Written only by settle_learning_path_sessions (owner) and the migration backfill; this is the reporting evidence that survives the 7-day session retention.';

ALTER TABLE public.learning_path_daily_user_activity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.learning_path_daily_user_activity FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.learning_path_daily_user_activity TO authenticated;
GRANT ALL ON TABLE public.learning_path_daily_user_activity TO service_role;

CREATE POLICY learning_path_daily_user_activity_own_read
  ON public.learning_path_daily_user_activity FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.auth_is_admin());
CREATE POLICY learning_path_daily_user_activity_service
  ON public.learning_path_daily_user_activity FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Every row-secured table joins the forced-password-change boundary (pgTAP 053
-- catalog invariant; same helper the other candidate tables use).
SELECT public.apply_forced_password_change_guard('public', 'learning_path_daily_user_activity');

-- Backfill from every session that is already closed AND settled. Rows settled
-- before credited_minutes existed (R1 backfill) contribute their recorded
-- duration (their overlap was never deducted — documented). Closed-but-
-- unsettled sessions are written when settlement reaches them; open sessions
-- are not activity yet.
INSERT INTO public.learning_path_daily_user_activity
  (path_id, user_id, activity_date, sessions_count, credited_minutes, session_minutes, last_session_end)
SELECT s.path_id, s.user_id, public.lp_activity_date(s.session_start),
       count(*),
       sum(greatest(0, coalesce(s.credited_minutes, s.time_spent_minutes, 0))),
       sum(greatest(0, coalesce(s.time_spent_minutes, 0))),
       max(s.session_end)
  FROM public.learning_path_progress_sessions s
 WHERE s.session_end IS NOT NULL AND s.settled_at IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = s.user_id)
   AND EXISTS (SELECT 1 FROM public.learning_paths lp WHERE lp.id = s.path_id)
 GROUP BY 1, 2, 3
ON CONFLICT (path_id, user_id, activity_date) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. settle_learning_path_sessions — identical to 20260907120300 plus the grain
--    upsert for every session it settles (same transaction, same locks).
-- -----------------------------------------------------------------------------
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
      v_los := array_append(v_los, v_lo);
      v_his := array_append(v_his, v_hi);

      -- C3: durable reporting evidence, exactly once per settled session.
      INSERT INTO public.learning_path_daily_user_activity AS a
        (path_id, user_id, activity_date, sessions_count, credited_minutes, session_minutes, last_session_end)
      VALUES (r.path_id, r.user_id, public.lp_activity_date(r.session_start), 1, v_credit,
              greatest(coalesce(r.time_spent_minutes, 0), 0), r.session_end)
      ON CONFLICT (path_id, user_id, activity_date) DO UPDATE
        SET sessions_count   = a.sessions_count + 1,
            credited_minutes = a.credited_minutes + EXCLUDED.credited_minutes,
            session_minutes  = a.session_minutes + EXCLUDED.session_minutes,
            last_session_end = greatest(a.last_session_end, EXCLUDED.last_session_end),
            updated_at       = now();
    END IF;
  END LOOP;

  IF v_cur_user IS NOT NULL THEN
    PERFORM public.lp_record_progress(v_cur_user, v_cur_path, v_group_minutes, v_group_last_end, NULL, NULL, false);
  END IF;

  RETURN v_settled;
END;
$BODY$;
REVOKE ALL ON FUNCTION public.settle_learning_path_sessions(uuid[]) FROM PUBLIC, anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 3. Reporting views. They run with the OWNER's privileges (postgres) on
--    purpose: user_roles has no admin read policy, so a security_invoker view
--    could not expand group memberships even for a literal admin. Privacy is
--    enforced INSIDE every view by an explicit caller filter (own rows for the
--    user summary; literal admin / backend for the cross-user views), and the
--    views are security_barrier so no caller-supplied predicate runs before
--    that filter. The API readers gate again on top of this.
--
--    C-R1-02 (closure review 2026-09-08): an owner view also bypasses the
--    RESTRICTIVE forced_password_change_guard policy of every table it reads,
--    so each view's filter carries public.password_change_gate_ok() as well —
--    the SAME predicate the table policies use (TRUE for a backend principal
--    with no end-user identity, FALSE while profiles.must_change_password is
--    set for auth.uid()). The nested views inherit it (user summary ← assigned
--    users; performance ← user summary; monthly ← daily) and carry it
--    themselves. security_barrier is a predicate-ordering property, not a
--    password or RLS boundary.
-- -----------------------------------------------------------------------------

-- 3a. Deduplicated assigned population.
CREATE OR REPLACE VIEW public.learning_path_assigned_users
WITH (security_barrier = true) AS
  SELECT x.path_id,
         x.user_id,
         bool_or(x.via_direct) AS via_direct,
         bool_or(x.via_group)  AS via_group,
         min(x.assigned_at)    AS first_assigned_at
    FROM (
      SELECT lpa.path_id, lpa.user_id, true AS via_direct, false AS via_group, lpa.assigned_at
        FROM public.learning_path_assignments lpa
       WHERE lpa.user_id IS NOT NULL
      UNION ALL
      SELECT lpa.path_id, ur.user_id, false, true, lpa.assigned_at
        FROM public.learning_path_assignments lpa
        JOIN public.community_workspaces cw ON cw.id = lpa.group_id
        JOIN public.user_roles ur ON ur.community_id = cw.community_id AND ur.is_active = true
       WHERE lpa.group_id IS NOT NULL
    ) x
   WHERE (x.user_id = auth.uid() OR public.auth_is_admin() OR public.auth_is_backend_caller())
     AND public.password_change_gate_ok()
   GROUP BY x.path_id, x.user_id;

-- 3b. Per (user, path) summary — own rows for any authenticated user, every
--     row for a literal admin / backend.
CREATE OR REPLACE VIEW public.user_learning_path_summary
WITH (security_barrier = true) AS
  SELECT au.user_id,
         au.path_id,
         au.via_direct,
         au.via_group,
         au.first_assigned_at,
         CASE WHEN p.completed_at IS NOT NULL THEN 'completed'
              WHEN p.started_at IS NOT NULL OR coalesce(p.total_time_spent_minutes, 0) > 0 THEN 'in_progress'
              ELSE 'not_started' END AS status,
         coalesce(p.current_course_sequence, 1) AS current_course_sequence,
         p.started_at,
         p.completed_at,
         p.last_activity_at AS last_session_date,
         coalesce(p.total_time_spent_minutes, 0) AS total_time_spent_minutes,
         cc.total_courses,
         cc.completed_courses,
         CASE WHEN cc.total_courses > 0
              THEN round(100.0 * cc.completed_courses / cc.total_courses, 2)
              ELSE 0 END AS overall_progress_percentage,
         NULL::boolean AS is_at_risk
    FROM public.learning_path_assigned_users au
    LEFT JOIN public.learning_path_user_progress p
           ON p.user_id = au.user_id AND p.path_id = au.path_id
    CROSS JOIN LATERAL (
      SELECT count(*)::integer AS total_courses,
             count(*) FILTER (WHERE ce.is_completed OR coalesce(ce.progress_percentage, 0) >= 100)::integer AS completed_courses
        FROM public.learning_path_courses lpc
        LEFT JOIN public.course_enrollments ce ON ce.course_id = lpc.course_id AND ce.user_id = au.user_id
       WHERE lpc.learning_path_id = au.path_id
    ) cc
   WHERE public.password_change_gate_ok();

COMMENT ON VIEW public.user_learning_path_summary IS
  'C3 (2026-09-07): live per-(user, path) summary over the deduplicated assigned population. Own rows for any authenticated user; every row for a literal admin or backend. is_at_risk is NULL: no governing definition exists.';

-- 3c. Per-path performance (cross-user: admin / backend only).
CREATE OR REPLACE VIEW public.learning_path_performance_summary
WITH (security_barrier = true) AS
  SELECT lp.id AS path_id,
         lp.name AS path_name,
         lp.description AS path_description,
         lp.is_active,
         (SELECT count(*)::integer FROM public.learning_path_courses lpc WHERE lpc.learning_path_id = lp.id) AS total_courses,
         count(s.user_id)::integer AS total_enrolled_users,
         count(*) FILTER (WHERE s.status = 'completed')::integer AS total_completed_users,
         count(*) FILTER (WHERE s.status = 'in_progress')::integer AS total_in_progress_users,
         round(coalesce(sum(s.total_time_spent_minutes), 0) / 60.0, 2) AS total_time_spent_hours,
         CASE WHEN count(s.user_id) > 0
              THEN round(100.0 * count(*) FILTER (WHERE s.status = 'completed') / count(s.user_id), 2)
              ELSE NULL END AS overall_completion_rate,
         CASE WHEN count(*) FILTER (WHERE s.status = 'completed' AND s.started_at IS NOT NULL) > 0
              THEN round((extract(epoch FROM avg(s.completed_at - s.started_at) FILTER (WHERE s.status = 'completed' AND s.started_at IS NOT NULL)) / 86400.0)::numeric, 2)
              ELSE NULL END AS avg_completion_time_days,
         NULL::numeric AS engagement_score,
         count(*) FILTER (WHERE s.first_assigned_at >= now() - interval '30 days')::integer AS recent_enrollments,
         count(*) FILTER (WHERE s.completed_at >= now() - interval '30 days')::integer AS recent_completions,
         round(coalesce((SELECT sum(a.credited_minutes) FROM public.learning_path_daily_user_activity a
                          WHERE a.path_id = lp.id AND a.activity_date >= public.lp_activity_date(now() - interval '30 days')), 0) / 60.0, 2)
           AS recent_session_time_hours
    FROM public.learning_paths lp
    LEFT JOIN public.user_learning_path_summary s ON s.path_id = lp.id
   WHERE (public.auth_is_admin() OR public.auth_is_backend_caller())
     AND public.password_change_gate_ok()
   GROUP BY lp.id, lp.name, lp.description, lp.is_active;

COMMENT ON VIEW public.learning_path_performance_summary IS
  'C3 (2026-09-07): live per-path aggregates over the deduplicated assigned population; admin / backend only (empty otherwise). engagement_score is NULL (no governing definition); rates are NULL when the population is empty.';

-- 3d. Daily summary per path (admin / backend only).
CREATE OR REPLACE VIEW public.learning_path_daily_summary
WITH (security_barrier = true) AS
  WITH act AS (
    SELECT a.path_id, a.activity_date AS summary_date,
           count(DISTINCT a.user_id)::integer AS total_active_users,
           sum(a.sessions_count)::integer AS total_sessions_count,
           sum(a.credited_minutes)::integer AS total_session_time_minutes
      FROM public.learning_path_daily_user_activity a
     GROUP BY a.path_id, a.activity_date
  ), comp AS (
    SELECT lpc.learning_path_id AS path_id,
           public.lp_activity_date(ce.completed_at) AS summary_date,
           count(*)::integer AS course_completions
      FROM public.course_enrollments ce
      JOIN public.learning_path_courses lpc ON lpc.course_id = ce.course_id
      JOIN public.learning_path_assigned_users au ON au.path_id = lpc.learning_path_id AND au.user_id = ce.user_id
     WHERE ce.completed_at IS NOT NULL
     GROUP BY 1, 2
  ), newa AS (
    SELECT lpa.path_id, public.lp_activity_date(lpa.assigned_at) AS summary_date,
           count(*)::integer AS new_enrollments
      FROM public.learning_path_assignments lpa
     GROUP BY 1, 2
  ), keys AS (
    SELECT path_id, summary_date FROM act
    UNION SELECT path_id, summary_date FROM comp
    UNION SELECT path_id, summary_date FROM newa
  )
  SELECT k.path_id, k.summary_date,
         coalesce(act.total_active_users, 0) AS total_active_users,
         coalesce(act.total_sessions_count, 0) AS total_sessions_count,
         coalesce(act.total_session_time_minutes, 0) AS total_session_time_minutes,
         coalesce(comp.course_completions, 0) AS course_completions,
         coalesce(newa.new_enrollments, 0) AS new_enrollments,
         NULL::numeric AS completion_rate
    FROM keys k
    LEFT JOIN act  ON act.path_id = k.path_id AND act.summary_date = k.summary_date
    LEFT JOIN comp ON comp.path_id = k.path_id AND comp.summary_date = k.summary_date
    LEFT JOIN newa ON newa.path_id = k.path_id AND newa.summary_date = k.summary_date
   WHERE (public.auth_is_admin() OR public.auth_is_backend_caller())
     AND public.password_change_gate_ok();

COMMENT ON VIEW public.learning_path_daily_summary IS
  'C3 (2026-09-07): per-(path, day in America/Santiago) distinct active users, settled sessions and credited minutes (from the durable grain), course completions of assigned users, and assignment rows created; admin / backend only. completion_rate is NULL (no per-day definition).';

-- 3e. Monthly summary per path (admin / backend only). Distinct users are
--     counted over the month from the per-user grain, never summed from days.
CREATE OR REPLACE VIEW public.learning_path_monthly_summary
WITH (security_barrier = true) AS
  WITH act AS (
    SELECT a.path_id, date_trunc('month', a.activity_date)::date AS summary_month,
           count(DISTINCT a.user_id)::integer AS total_active_users,
           sum(a.sessions_count)::integer AS total_sessions,
           sum(a.credited_minutes)::integer AS total_session_time_minutes,
           count(DISTINCT a.activity_date)::integer AS active_days
      FROM public.learning_path_daily_user_activity a
     GROUP BY 1, 2
  ), daily_users AS (
    SELECT a.path_id, date_trunc('month', a.activity_date)::date AS summary_month,
           sum(cnt) AS user_days
      FROM (SELECT path_id, activity_date, count(DISTINCT user_id) AS cnt
              FROM public.learning_path_daily_user_activity GROUP BY 1, 2) a
     GROUP BY 1, 2
  ), d AS (
    SELECT path_id, date_trunc('month', summary_date)::date AS summary_month,
           sum(course_completions)::integer AS total_completions,
           sum(new_enrollments)::integer AS total_new_enrollments
      FROM public.learning_path_daily_summary
     GROUP BY 1, 2
  ), keys AS (
    SELECT path_id, summary_month FROM act UNION SELECT path_id, summary_month FROM d
  )
  SELECT k.path_id, k.summary_month,
         coalesce(act.total_active_users, 0) AS total_active_users,
         coalesce(act.total_sessions, 0) AS total_sessions,
         coalesce(act.total_session_time_minutes, 0) AS total_session_time_minutes,
         round(coalesce(act.total_session_time_minutes, 0) / 60.0, 2) AS total_session_time_hours,
         coalesce(d.total_completions, 0) AS total_completions,
         coalesce(d.total_new_enrollments, 0) AS total_new_enrollments,
         round(coalesce(du.user_days, 0)::numeric
               / greatest(1, least(
                   extract(day FROM (k.summary_month + interval '1 month' - interval '1 day'))::integer,
                   CASE WHEN date_trunc('month', public.lp_activity_date(now()))::date = k.summary_month
                        THEN extract(day FROM public.lp_activity_date(now()))::integer
                        ELSE extract(day FROM (k.summary_month + interval '1 month' - interval '1 day'))::integer END)), 2)
           AS avg_daily_active_users,
         CASE WHEN coalesce(act.total_sessions, 0) > 0
              THEN round(act.total_session_time_minutes::numeric / act.total_sessions, 2)
              ELSE NULL END AS avg_session_duration_minutes,
         NULL::numeric AS avg_completion_rate
    FROM keys k
    LEFT JOIN act ON act.path_id = k.path_id AND act.summary_month = k.summary_month
    LEFT JOIN daily_users du ON du.path_id = k.path_id AND du.summary_month = k.summary_month
    LEFT JOIN d ON d.path_id = k.path_id AND d.summary_month = k.summary_month
   WHERE (public.auth_is_admin() OR public.auth_is_backend_caller())
     AND public.password_change_gate_ok();

COMMENT ON VIEW public.learning_path_monthly_summary IS
  'C3 (2026-09-07): per-(path, calendar month in America/Santiago) distinct active users (counted over the month, not summed from days), sessions, credited minutes/hours, completions, new assignment rows, average daily active users over the elapsed days of the month; admin / backend only. avg_completion_rate is NULL (no governing definition).';

REVOKE ALL ON public.learning_path_assigned_users, public.user_learning_path_summary,
              public.learning_path_performance_summary, public.learning_path_daily_summary,
              public.learning_path_monthly_summary FROM PUBLIC, anon;
GRANT SELECT ON public.learning_path_assigned_users, public.user_learning_path_summary,
                public.learning_path_performance_summary, public.learning_path_daily_summary,
                public.learning_path_monthly_summary TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. C4 — bounded, evidence-preserving session retention (service_role only).
--    Deletes CLOSED, SETTLED sessions older than p_before, at most p_limit per
--    call (has_more tells the caller to continue), and only when
--      (a) no unsettled session of the same (user, path) could still overlap
--          the interval (its start is not before this session's end) — that
--          interval is still evidence for union-clipped settlement; and
--      (b) the session's day already has a grain row (reporting evidence).
--    p_before may not be later than 7 days ago (the retention contract).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_settled_learning_path_sessions(p_before timestamptz, p_limit integer DEFAULT 1000)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_deleted integer := 0;
  v_has_more boolean := false;
  v_blocked_overlap integer := 0;
  v_missing_evidence integer := 0;
BEGIN
  IF p_before IS NULL OR p_before > now() - interval '7 days' THEN
    RAISE EXCEPTION 'Retention boundary must be at least 7 days in the past' USING ERRCODE = '22023';
  END IF;

  WITH cand AS (
    SELECT s.id
      FROM public.learning_path_progress_sessions s
     WHERE s.session_end IS NOT NULL
       AND s.settled_at IS NOT NULL
       AND s.session_end < p_before
       AND s.session_start < p_before
       AND NOT EXISTS (
         SELECT 1 FROM public.learning_path_progress_sessions o
          WHERE o.user_id = s.user_id AND o.path_id = s.path_id
            AND o.settled_at IS NULL
            AND o.session_start <= s.session_end
       )
       AND EXISTS (
         SELECT 1 FROM public.learning_path_daily_user_activity a
          WHERE a.path_id = s.path_id AND a.user_id = s.user_id
            AND a.activity_date = public.lp_activity_date(s.session_start)
       )
     ORDER BY s.session_end, s.id
     LIMIT v_limit
       FOR UPDATE SKIP LOCKED
  ), del AS (
    DELETE FROM public.learning_path_progress_sessions s
     USING cand
     WHERE s.id = cand.id
    RETURNING s.id
  )
  SELECT count(*) INTO v_deleted FROM del;

  SELECT EXISTS (
    SELECT 1 FROM public.learning_path_progress_sessions s
     WHERE s.session_end IS NOT NULL AND s.settled_at IS NOT NULL
       AND s.session_end < p_before AND s.session_start < p_before
       AND NOT EXISTS (
         SELECT 1 FROM public.learning_path_progress_sessions o
          WHERE o.user_id = s.user_id AND o.path_id = s.path_id
            AND o.settled_at IS NULL AND o.session_start <= s.session_end)
       AND EXISTS (
         SELECT 1 FROM public.learning_path_daily_user_activity a
          WHERE a.path_id = s.path_id AND a.user_id = s.user_id
            AND a.activity_date = public.lp_activity_date(s.session_start))
  ) INTO v_has_more;

  SELECT count(*) INTO v_blocked_overlap
    FROM public.learning_path_progress_sessions s
   WHERE s.session_end IS NOT NULL AND s.settled_at IS NOT NULL
     AND s.session_end < p_before
     AND EXISTS (
       SELECT 1 FROM public.learning_path_progress_sessions o
        WHERE o.user_id = s.user_id AND o.path_id = s.path_id
          AND o.settled_at IS NULL AND o.session_start <= s.session_end);

  SELECT count(*) INTO v_missing_evidence
    FROM public.learning_path_progress_sessions s
   WHERE s.session_end IS NOT NULL AND s.settled_at IS NOT NULL
     AND s.session_end < p_before
     AND NOT EXISTS (
       SELECT 1 FROM public.learning_path_daily_user_activity a
        WHERE a.path_id = s.path_id AND a.user_id = s.user_id
          AND a.activity_date = public.lp_activity_date(s.session_start));

  RETURN jsonb_build_object(
    'deleted', v_deleted,
    'has_more', v_has_more,
    'retained_open_overlap', v_blocked_overlap,
    'retained_missing_evidence', v_missing_evidence,
    'before', p_before
  );
END;
$$;
REVOKE ALL ON FUNCTION public.archive_settled_learning_path_sessions(timestamptz, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_settled_learning_path_sessions(timestamptz, integer) TO service_role;

COMMENT ON FUNCTION public.archive_settled_learning_path_sessions(timestamptz, integer) IS
  'C4 (2026-09-07): bounded deletion of closed+settled sessions older than p_before (>= 7 days ago), skipping any session whose interval is still settlement evidence for an unsettled session of the same (user, path) or whose day has no durable activity grain. Returns deleted / has_more / retained counts. service_role only; idempotent; SKIP LOCKED.';
