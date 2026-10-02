-- =============================================================================
-- 20261002120000_lp_reporting_scope.sql — W-B2c-01 follow-on: learning-path
-- reporting scope + defined figures (Brent's decisions, 2 Oct 2026; reverses
-- the D2 "literal-admin-only" reporting scope of 20260908180600).
--
-- Read scope of learning-path REPORT data (who is assigned, progress, time,
-- figures), enforced INSIDE the owner-run views so an API filter mistake can
-- never leak another school and every aggregate is built from in-scope people:
--   * admin, backend caller, active consultor ........ every person (all schools)
--   * active equipo_directivo with a school S ......... people holding an ACTIVE
--     user_roles row with school_id = S (the "people of my school" rule of
--     pages/api/reports/detailed.ts; group members count by their OWN role)
--   * everyone else ................................... only themselves (the
--     per-user rows); no cross-user aggregate at all
-- Managing paths (create / update / assign / unassign / delete) stays literal
-- admin only. No table policy, grant or write path is changed here.
--
-- Figure definitions (docs: W-B2C-01-REPORTING-PLAN, "Figure definitions"):
--   * FINISHED: the path has >= 1 course and every course of it has a
--     course_enrollments row with is_completed or progress_percentage >= 100;
--     finished_at = latest coalesce(completed_at, updated_at) of those rows.
--     Replaces the self-reported learning_path_user_progress.completed_at for
--     status 'completed' and every completion figure (the raw completed_at
--     column of user_learning_path_summary is kept as it was, for history).
--   * COMPLETION RATE = finished / assigned, in percent, NULL when nobody is
--     assigned. Daily = cumulative (finished by that day / assigned by that
--     day: people assigned by day D whose finished_at day is <= D, over people
--     assigned by D); monthly = people assigned by the end of M whose
--     finished_at falls in M, over people assigned by the end of M. The
--     numerator is always a subset of the denominator, so the rate never
--     exceeds 100 %; someone who finished before being assigned counts in the
--     daily cumulative rate from their assignment day; in the monthly rate
--     they count only if assignment and finish fall in the same month, never
--     when they were assigned in a later month (owner wording: "finished that
--     month"). Days and months are
--     America/Santiago (lp_activity_date). Finish days are also report keys,
--     so a completion with no other event that day / month still appears.
--   * AT RISK = assigned, not finished, and last activity older than
--     now() - 14 days; never for a path with no courses (decided 2026-10-02:
--     such assignees stay not-finished and still count in the completion-rate
--     denominator, but are never at risk). Last activity = latest of
--     learning_path_user_progress.last_activity_at and lesson_progress
--     .updated_at on lessons of the path's courses; else the first assignment.
--   * New assignees per day / month = DISTINCT in-scope people by their first
--     assigned day (a group assignment counts each active member once, on the
--     group assignment date). Changed for admins too: before, raw assignment
--     rows were counted (a group row = 1, an empty group = 1, other schools'
--     group rows visible to every reader of the view).
--   * Learning-path engagement score: retired. The column stays NULL because
--     view columns can only be appended (forward-only rule).
--
-- Additive / forward-only: three new SECURITY DEFINER helpers, CREATE OR
-- REPLACE of the five C3 views with the SAME columns in the SAME order (new
-- columns appended only), one new view. Every view keeps security_barrier,
-- the owner (postgres) and password_change_gate_ok().
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Scope helpers. SECURITY DEFINER so the caller's own user_roles rows are
--    read reliably whatever user_roles policies say; they only ever ask about
--    auth.uid(). is_active IS TRUE: NULL / false fails closed. Each helper is
--    itself gated by password_change_gate_ok(): it is callable directly over
--    RPC, so a caller held by the forced-password-change flag gets FALSE
--    (a backend caller has no identity, the gate is TRUE for it).
-- -----------------------------------------------------------------------------

-- Every person: literal admin, backend caller (no end-user identity), or an
-- active consultor (all schools — consistent with the transformation decision).
CREATE OR REPLACE FUNCTION public.auth_lp_report_all()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.password_change_gate_ok() IS TRUE
     AND (public.auth_is_admin()
      OR public.auth_is_backend_caller()
      OR EXISTS (
           SELECT 1
             FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role_type = 'consultor'::public.user_role_type
              AND ur.is_active IS TRUE
         ));
$$;

-- May the caller see learning-path report data about p_user? report_all, or the
-- caller holds an active equipo_directivo role with school S and p_user holds
-- an active user_roles row (any role) with school_id = S. Own rows are granted
-- separately by the views (user_id = auth.uid()), not here.
CREATE OR REPLACE FUNCTION public.auth_lp_report_sees_user(p_user uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.password_change_gate_ok() IS TRUE
     AND (public.auth_lp_report_all()
      OR (p_user IS NOT NULL AND EXISTS (
           SELECT 1
             FROM public.user_roles me
             JOIN public.user_roles t
               ON t.school_id = me.school_id
            WHERE me.user_id = auth.uid()
              AND me.role_type = 'equipo_directivo'::public.user_role_type
              AND me.is_active IS TRUE
              AND me.school_id IS NOT NULL
              AND t.user_id = p_user
              AND t.is_active IS TRUE
         )));
$$;

-- Does the caller get cross-user aggregates at all? report_all, or an active
-- equipo_directivo role with a school.
CREATE OR REPLACE FUNCTION public.auth_lp_reporter()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.password_change_gate_ok() IS TRUE
     AND (public.auth_lp_report_all()
      OR EXISTS (
           SELECT 1
             FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role_type = 'equipo_directivo'::public.user_role_type
              AND ur.is_active IS TRUE
              AND ur.school_id IS NOT NULL
         ));
$$;

REVOKE ALL ON FUNCTION public.auth_lp_report_all() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_lp_report_sees_user(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auth_lp_reporter() FROM PUBLIC, anon;
-- authenticated needs EXECUTE: functions inside a view are checked against the
-- querying role, not the view owner.
GRANT EXECUTE ON FUNCTION public.auth_lp_report_all() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_lp_report_sees_user(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.auth_lp_reporter() TO authenticated, service_role;

COMMENT ON FUNCTION public.auth_lp_report_all() IS
  'W-B2c-01 (2026-10-02): TRUE when the caller may read learning-path report data about every person: literal admin, backend caller, or active consultor. FALSE while the caller is held by the forced-password-change flag.';
COMMENT ON FUNCTION public.auth_lp_report_sees_user(uuid) IS
  'W-B2c-01 (2026-10-02): TRUE when the caller may read learning-path report data about p_user: auth_lp_report_all(), or an active equipo_directivo of school S and p_user has an active user_roles row in S. Own rows are granted by the views, not here. FALSE while the caller is held by the forced-password-change flag.';
COMMENT ON FUNCTION public.auth_lp_reporter() IS
  'W-B2c-01 (2026-10-02): TRUE when the caller receives learning-path cross-user aggregates (scoped by auth_lp_report_sees_user): auth_lp_report_all() or an active equipo_directivo with a school. FALSE while the caller is held by the forced-password-change flag.';

-- -----------------------------------------------------------------------------
-- 2. Views (owner-run, security_barrier, privacy filtered inside; see the C3
--    migration for why they are owner views and carry password_change_gate_ok).
-- -----------------------------------------------------------------------------

-- 2a. Deduplicated assigned population — own rows, or people in the caller's
--     report scope.
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
   WHERE (x.user_id = auth.uid() OR public.auth_lp_report_sees_user(x.user_id))
     AND public.password_change_gate_ok()
   GROUP BY x.path_id, x.user_id;

COMMENT ON VIEW public.learning_path_assigned_users IS
  'W-B2c-01 (2026-10-02): distinct assigned people per path (direct OR active member of the community behind an assigned workspace). Own rows for anyone; every row for admin / backend / active consultor; people with an active role in the caller''s school for an active equipo_directivo.';

-- 2b. Per (user, path) summary. Columns 1-15 unchanged in name, type and order;
--     is_at_risk is now defined; is_finished, finished_at and
--     last_activity_effective_at are appended.
CREATE OR REPLACE VIEW public.user_learning_path_summary
WITH (security_barrier = true) AS
  SELECT au.user_id,
         au.path_id,
         au.via_direct,
         au.via_group,
         au.first_assigned_at,
         CASE WHEN cc.is_finished THEN 'completed'
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
         (NOT cc.is_finished
          AND cc.total_courses > 0
          AND coalesce(greatest(p.last_activity_at, la.lesson_activity_at), au.first_assigned_at)
              < now() - interval '14 days') AS is_at_risk,
         cc.is_finished,
         CASE WHEN cc.is_finished THEN cc.finished_at END AS finished_at,
         coalesce(greatest(p.last_activity_at, la.lesson_activity_at), au.first_assigned_at) AS last_activity_effective_at
    FROM public.learning_path_assigned_users au
    LEFT JOIN public.learning_path_user_progress p
           ON p.user_id = au.user_id AND p.path_id = au.path_id
    CROSS JOIN LATERAL (
      SELECT c0.total_courses,
             c0.completed_courses,
             (c0.total_courses > 0 AND c0.completed_courses = c0.total_courses) AS is_finished,
             c0.finished_at
        FROM (
          SELECT count(*)::integer AS total_courses,
                 count(*) FILTER (WHERE ce.is_completed OR coalesce(ce.progress_percentage, 0) >= 100)::integer AS completed_courses,
                 max(coalesce(ce.completed_at, ce.updated_at))
                   FILTER (WHERE ce.is_completed OR coalesce(ce.progress_percentage, 0) >= 100) AS finished_at
            FROM public.learning_path_courses lpc
            LEFT JOIN public.course_enrollments ce ON ce.course_id = lpc.course_id AND ce.user_id = au.user_id
           WHERE lpc.learning_path_id = au.path_id
        ) c0
    ) cc
    CROSS JOIN LATERAL (
      SELECT max(lpr.updated_at) AS lesson_activity_at
        FROM public.lesson_progress lpr
        JOIN public.lessons l ON l.id = lpr.lesson_id
        LEFT JOIN public.modules m ON m.id = l.module_id
       WHERE lpr.user_id = au.user_id
         AND EXISTS (
               SELECT 1
                 FROM public.learning_path_courses lpc2
                WHERE lpc2.learning_path_id = au.path_id
                  AND (lpc2.course_id = l.course_id OR lpc2.course_id = m.course_id)
             )
    ) la
   WHERE public.password_change_gate_ok();

COMMENT ON VIEW public.user_learning_path_summary IS
  'W-B2c-01 (2026-10-02): live per-(user, path) summary over learning_path_assigned_users (same scope: own rows; all for admin / backend / consultor; own-school people for equipo_directivo). status ''completed'' = is_finished (every course of a non-empty path completed in course_enrollments); finished_at = latest completion of those courses. is_at_risk = the path has >= 1 course, not finished and last_activity_effective_at older than 14 days (never for a courseless path); last_activity_effective_at = latest of the path progress last activity and lesson progress on the path''s courses, else the first assignment. completed_at is the raw self-reported path completion, kept for history only.';

-- 2c. Per-path performance — reporters only; a director sees only paths with
--     >= 1 in-scope assignee, and every figure is built from in-scope people.
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
              THEN round(100.0 * count(*) FILTER (WHERE s.is_finished) / count(s.user_id), 2)
              ELSE NULL END AS overall_completion_rate,
         CASE WHEN count(*) FILTER (WHERE s.is_finished AND s.started_at IS NOT NULL) > 0
              THEN round((extract(epoch FROM avg(s.finished_at - s.started_at) FILTER (WHERE s.is_finished AND s.started_at IS NOT NULL)) / 86400.0)::numeric, 2)
              ELSE NULL END AS avg_completion_time_days,
         NULL::numeric AS engagement_score,
         count(*) FILTER (WHERE s.first_assigned_at >= now() - interval '30 days')::integer AS recent_enrollments,
         count(*) FILTER (WHERE s.finished_at >= now() - interval '30 days')::integer AS recent_completions,
         round(coalesce((SELECT sum(a.credited_minutes) FROM public.learning_path_daily_user_activity a
                          WHERE a.path_id = lp.id AND a.activity_date >= public.lp_activity_date(now() - interval '30 days')
                            AND public.auth_lp_report_sees_user(a.user_id)), 0) / 60.0, 2)
           AS recent_session_time_hours,
         count(*) FILTER (WHERE s.is_at_risk)::integer AS at_risk_users
    FROM public.learning_paths lp
    LEFT JOIN public.user_learning_path_summary s ON s.path_id = lp.id
   WHERE public.auth_lp_reporter()
     AND public.password_change_gate_ok()
   GROUP BY lp.id, lp.name, lp.description, lp.is_active
  HAVING public.auth_lp_report_all() OR count(s.user_id) > 0;

COMMENT ON VIEW public.learning_path_performance_summary IS
  'W-B2c-01 (2026-10-02): live per-path aggregates over the in-scope assigned population. Every path for admin / backend / active consultor; for an active equipo_directivo only paths with >= 1 assignee from their school, counted from those people only; nothing for anyone else. overall_completion_rate = finished / assigned (percent, NULL when nobody is assigned); at_risk_users = assignees with is_at_risk. engagement_score is RETIRED (always NULL; kept only because view columns cannot be removed).';

-- 2d. Daily summary per path — reporters only, in-scope people only.
CREATE OR REPLACE VIEW public.learning_path_daily_summary
WITH (security_barrier = true) AS
  WITH pop AS (
    SELECT s.path_id,
           public.lp_activity_date(s.first_assigned_at) AS assigned_on,
           CASE WHEN s.is_finished
                THEN public.lp_activity_date(s.finished_at) END AS finished_on
      FROM public.user_learning_path_summary s
  ), act AS (
    SELECT a.path_id, a.activity_date AS summary_date,
           count(DISTINCT a.user_id)::integer AS total_active_users,
           sum(a.sessions_count)::integer AS total_sessions_count,
           sum(a.credited_minutes)::integer AS total_session_time_minutes
      FROM public.learning_path_daily_user_activity a
     WHERE public.auth_lp_report_sees_user(a.user_id)
     GROUP BY a.path_id, a.activity_date
  ), comp AS (
    SELECT lpc.learning_path_id AS path_id,
           public.lp_activity_date(ce.completed_at) AS summary_date,
           count(*)::integer AS course_completions
      FROM public.course_enrollments ce
      JOIN public.learning_path_courses lpc ON lpc.course_id = ce.course_id
      JOIN public.learning_path_assigned_users au ON au.path_id = lpc.learning_path_id AND au.user_id = ce.user_id
     WHERE ce.completed_at IS NOT NULL
       AND public.auth_lp_report_sees_user(au.user_id)
     GROUP BY 1, 2
  ), newa AS (
    SELECT pop.path_id, pop.assigned_on AS summary_date,
           count(*)::integer AS new_enrollments
      FROM pop
     GROUP BY 1, 2
  ), keys AS (
    SELECT path_id, summary_date FROM act
    UNION SELECT path_id, summary_date FROM comp
    UNION SELECT path_id, summary_date FROM newa
    UNION SELECT path_id, finished_on FROM pop WHERE finished_on IS NOT NULL
  )
  SELECT k.path_id, k.summary_date,
         coalesce(act.total_active_users, 0) AS total_active_users,
         coalesce(act.total_sessions_count, 0) AS total_sessions_count,
         coalesce(act.total_session_time_minutes, 0) AS total_session_time_minutes,
         coalesce(comp.course_completions, 0) AS course_completions,
         coalesce(newa.new_enrollments, 0) AS new_enrollments,
         (SELECT CASE WHEN count(*) > 0
                      THEN round(100.0 * count(*) FILTER (WHERE pop.finished_on <= k.summary_date) / count(*), 2)
                      ELSE NULL END
            FROM pop
           WHERE pop.path_id = k.path_id
             AND pop.assigned_on <= k.summary_date) AS completion_rate
    FROM keys k
    LEFT JOIN act  ON act.path_id = k.path_id AND act.summary_date = k.summary_date
    LEFT JOIN comp ON comp.path_id = k.path_id AND comp.summary_date = k.summary_date
    LEFT JOIN newa ON newa.path_id = k.path_id AND newa.summary_date = k.summary_date
   WHERE public.auth_lp_reporter()
     AND public.password_change_gate_ok();

COMMENT ON VIEW public.learning_path_daily_summary IS
  'W-B2c-01 (2026-10-02): per-(path, day in America/Santiago) figures from in-scope people only (all for admin / backend / consultor; own-school people for equipo_directivo; nothing for anyone else): distinct active users, settled sessions and credited minutes (durable grain), course completions of assignees, new_enrollments = distinct people first assigned that day (not assignment rows), completion_rate = cumulative percent finished by that day of those assigned by that day (NULL when none).';

-- 2e. Monthly summary per path — reporters only, in-scope people only.
CREATE OR REPLACE VIEW public.learning_path_monthly_summary
WITH (security_barrier = true) AS
  WITH pop AS (
    SELECT s.path_id,
           public.lp_activity_date(s.first_assigned_at) AS assigned_on,
           CASE WHEN s.is_finished
                THEN public.lp_activity_date(s.finished_at) END AS finished_on
      FROM public.user_learning_path_summary s
  ), grain AS (
    SELECT a.path_id, a.user_id, a.activity_date, a.sessions_count, a.credited_minutes
      FROM public.learning_path_daily_user_activity a
     WHERE public.auth_lp_report_sees_user(a.user_id)
  ), act AS (
    SELECT a.path_id, date_trunc('month', a.activity_date)::date AS summary_month,
           count(DISTINCT a.user_id)::integer AS total_active_users,
           sum(a.sessions_count)::integer AS total_sessions,
           sum(a.credited_minutes)::integer AS total_session_time_minutes,
           count(DISTINCT a.activity_date)::integer AS active_days
      FROM grain a
     GROUP BY 1, 2
  ), daily_users AS (
    SELECT a.path_id, date_trunc('month', a.activity_date)::date AS summary_month,
           sum(cnt) AS user_days
      FROM (SELECT path_id, activity_date, count(DISTINCT user_id) AS cnt
              FROM grain GROUP BY 1, 2) a
     GROUP BY 1, 2
  ), d AS (
    SELECT path_id, date_trunc('month', summary_date)::date AS summary_month,
           sum(course_completions)::integer AS total_completions,
           sum(new_enrollments)::integer AS total_new_enrollments
      FROM public.learning_path_daily_summary
     GROUP BY 1, 2
  ), keys AS (
    SELECT path_id, summary_month FROM act
    UNION SELECT path_id, summary_month FROM d
    UNION SELECT path_id, date_trunc('month', finished_on)::date FROM pop WHERE finished_on IS NOT NULL
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
         (SELECT CASE WHEN count(*) > 0
                      THEN round(100.0 * count(*) FILTER (WHERE pop.finished_on >= k.summary_month
                                                            AND pop.finished_on < (k.summary_month + interval '1 month')::date)
                                 / count(*), 2)
                      ELSE NULL END
            FROM pop
           WHERE pop.path_id = k.path_id
             AND pop.assigned_on < (k.summary_month + interval '1 month')::date) AS avg_completion_rate
    FROM keys k
    LEFT JOIN act ON act.path_id = k.path_id AND act.summary_month = k.summary_month
    LEFT JOIN daily_users du ON du.path_id = k.path_id AND du.summary_month = k.summary_month
    LEFT JOIN d ON d.path_id = k.path_id AND d.summary_month = k.summary_month
   WHERE public.auth_lp_reporter()
     AND public.password_change_gate_ok();

COMMENT ON VIEW public.learning_path_monthly_summary IS
  'W-B2c-01 (2026-10-02): per-(path, calendar month in America/Santiago) figures from in-scope people only (same scope as the daily view): distinct active users (over the month, not summed from days), sessions, credited minutes/hours, course completions, distinct new assignees, average daily active users over the elapsed days. avg_completion_rate = percent of people assigned by the end of the month who finished in that month (NULL when none assigned).';

-- 2f. Courses of a path for the report screen (replaces the raw
--     learning_path_courses read in pages/api/learning-paths/analytics.ts).
CREATE OR REPLACE VIEW public.learning_path_report_courses
WITH (security_barrier = true) AS
  SELECT lpc.learning_path_id AS path_id,
         lpc.course_id,
         lpc.sequence_order,
         c.title AS course_title
    FROM public.learning_path_courses lpc
    JOIN public.courses c ON c.id = lpc.course_id
   WHERE public.password_change_gate_ok()
     AND (public.auth_lp_report_all()
          OR EXISTS (
               SELECT 1
                 FROM public.learning_path_assigned_users au
                WHERE au.path_id = lpc.learning_path_id
                  AND public.auth_lp_report_sees_user(au.user_id)
             ));

COMMENT ON VIEW public.learning_path_report_courses IS
  'W-B2c-01 (2026-10-02): courses (id, order, title) of each path for learning-path reports. Every path for admin / backend / active consultor; for an active equipo_directivo only paths with >= 1 assignee from their school; nothing for anyone else (learners read their own paths through the learning_path_courses table policy).';

-- The five C3 views keep the grants they had (unchanged here; none of them is
-- updatable). The new view gets SELECT only: the schema default privileges
-- would otherwise hand authenticated / service_role every table privilege.
REVOKE ALL ON public.learning_path_assigned_users, public.user_learning_path_summary,
              public.learning_path_performance_summary, public.learning_path_daily_summary,
              public.learning_path_monthly_summary FROM PUBLIC, anon;
REVOKE ALL ON public.learning_path_report_courses FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.learning_path_assigned_users, public.user_learning_path_summary,
                public.learning_path_performance_summary, public.learning_path_daily_summary,
                public.learning_path_monthly_summary, public.learning_path_report_courses TO authenticated, service_role;
