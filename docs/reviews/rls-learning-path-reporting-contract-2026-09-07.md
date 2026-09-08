# Learning-path reporting — metric contract (closure C3, decision D2, 2026-09-07)

> Governs migration `20260907120600_c3_reporting_retention.sql` and its readers (`pages/api/learning-paths/analytics.ts`, `pages/api/reports/overview.ts`, `lib/services/reports.js`). Decision D2 (Brent, 2026-09-07): finish the existing learning-path reports; cross-user learning-path reporting stays literal-admin-only; independently authorized course reporting keeps its audiences. Written before implementation; every definition below is tested with known values in `supabase/tests/079-c3-reporting-retention.sql` and `__tests__/api/learning-paths/analytics-contract.test.ts`.

## 1. Architecture (simplest correct design)

| Relation | Kind | Why |
|---|---|---|
| `learning_path_daily_user_activity` | **durable table** (path, user, activity day) | sessions are deleted after 7 days (C4); daily / monthly activity needs evidence that outlives them. Written exactly once per settled session by `settle_learning_path_sessions` (same transaction, same locks) and once by the migration backfill. |
| `learning_path_assigned_users` | live view | deduplicated assignment population |
| `user_learning_path_summary` | live view | per (user, path) — the reader of `overview.ts`, `reports.js`, `analytics.ts` (path detail) |
| `learning_path_performance_summary` | live view | per path — `analytics.ts` overview and detail |
| `learning_path_daily_summary` | live view over the grain + completions + assignment rows | `analytics.ts` trends / heatmap |
| `learning_path_monthly_summary` | live view over the grain | monthly rollup (distinct users counted over the month) |

No refresh job exists any more: `pages/api/cron/update-learning-path-summaries.ts` is **retired** (410 after its unchanged authentication guard, no database work). The three `update_*_summary` RPCs it called never existed in any migration; the in-process monthly rollup it computed summed daily distinct users. Nothing is created by a seeder: every relation above is established by the migration.

## 2. Definitions

| Metric | Definition | Empty / missing |
|---|---|---|
| **Assigned population** of a path | DISTINCT `user_id` over: direct rows (`learning_path_assignments.user_id`) ∪ active members (`user_roles.is_active`) of the community behind each assigned workspace (`community_workspaces.id → community_id`). A user who is both direct and member counts **once**; `via_direct` / `via_group` record both facts; `first_assigned_at` = the earliest source. | a path with no assignment has population 0 |
| **Course completion** (per user, course) | `course_enrollments.is_completed OR progress_percentage >= 100` for a course of the path | no enrolment row = not completed |
| **Path completion** | `learning_path_user_progress.completed_at IS NOT NULL` (status `completed`) | — |
| **Status** | `completed` (above); `in_progress` when `started_at` is set or credited minutes > 0; else `not_started` | — |
| **Progress %** | completed courses / courses in the path × 100, 2 decimals | path without courses → 0 |
| **Credited time** (user, path) | `learning_path_user_progress.total_time_spent_minutes` — the union-clipped, exactly-once settlement credit (R2-03 / R5) | 0 |
| **Daily credited time** | grain `credited_minutes` summed per (path, day); `session_minutes` keeps the recorded durations (overlap not deducted) for audit | — |
| **Day boundary / timezone** | `activity_date = (session_start AT TIME ZONE 'America/Santiago')::date` (`lp_activity_date`, `lp_reporting_timezone`). A session spanning midnight belongs to the day it started. Course completions and assignment rows use the same conversion of `completed_at` / `assigned_at`. | — |
| **Daily distinct users** | `count(DISTINCT user_id)` over the grain for (path, day) | 0 |
| **Monthly distinct users** | `count(DISTINCT user_id)` over the grain for (path, calendar month) — **never** the sum of the days | 0 |
| **avg_daily_active_users** (month) | Σ daily distinct users / days elapsed in the month (calendar days; the current month uses the days elapsed so far) | 0 |
| **avg_session_duration_minutes** (month) | credited minutes / sessions | NULL when no session |
| **course_completions** (day) | completions (by `completed_at` day) of assigned users for the path's courses | 0 |
| **new_enrollments** (day) | assignment **rows** created that day (a direct row counts 1, a group row counts 1 — group members are not expanded historically) | 0 |
| **recent_enrollments** (path, 30 days) | assigned users whose `first_assigned_at` is within 30 days | 0 |
| **recent_completions** (path, 30 days) | path completions within 30 days | 0 |
| **overall_completion_rate** (path) | completed users / assigned users × 100 | **NULL** when the population is empty (never 0) |
| **avg_completion_time_days** (path) | mean of `completed_at − started_at` over completed users that have a `started_at` | NULL when none |
| **engagement_score**, **is_at_risk**, daily **completion_rate**, monthly **avg_completion_rate** | **UNAVAILABLE — NULL.** No governing document defines them (the former `calculateEngagementScore` weighted three ad-hoc factors and was never approved). Readers list them under `unavailable`; the UI must not render them as 0 / false. Follow-up: a product definition owned by Brent before any formula ships. | NULL |

## 3. Historical and unassigned data

- Sessions settled before `credited_minutes` existed (the R1 backfill marked them settled) contribute their recorded duration to the grain (overlap was never deducted for them); this is stated, not corrected.
- Sessions the previous maintenance route deleted before this migration are unknown and absent; daily/monthly history starts with the rows present at apply time.
- A user who is no longer assigned is not in the population; their progress row and grain rows remain (history) and are readable to a literal admin and to the user themselves.
- `learning_path_user_progress` rows without a matching current assignment are not summarised (history, not reporting population).

## 4. Exposure and failure behaviour

- **C-R1-02 (2026-09-08):** every view filter also applies `public.password_change_gate_ok()` — an owner view bypasses the RESTRICTIVE `forced_password_change_guard` of the tables it reads, so it must ask the same question itself; `security_barrier` only orders predicates and is not an RLS or password boundary. The nested views inherit and repeat the predicate. Verified by actual SELECTs as flagged / unflagged admin and learner (pgTAP 079 §8), by real tokens through PostgREST and by the established completion flow (E2E `C-R1-02`).
- Views are **owner (security_barrier) views with explicit caller filters**: `user_learning_path_summary` / `learning_path_assigned_users` return the caller's own rows, or every row for a literal admin (`auth_is_admin()`) or a trusted backend (`auth_is_backend_caller()`); the cross-user views (`performance`, `daily`, `monthly`) return rows only for a literal admin or backend. `anon` holds no SELECT. Tested through PostgREST tokens (pgTAP 079 §4, E2E C3).
- Service-role readers gate **again** in code: `overview.ts` issues no learning-path query unless the requester's primary role is literal `admin`, reports `learning_path_reporting: 'admin_only'` and `total_time_spent: null` otherwise; `reports.js` does the same. `analytics.ts` runs on the caller's session client behind `hasManagePermission` (literal admin).
- A failed query is an error: `analytics.ts` answers **502** naming the relation; `overview.ts` surfaces the warning and reports learning-path time as **null**; an internal failure of `overview.ts` is a **500**, not a zeroed 200. No metric is ever substituted by 0 because a query failed.

## 5. Retention coupling (C4)

The grain is written at settlement, so `archive_settled_learning_path_sessions` may delete a settled session only when its day already has a grain row (and no unsettled session of the same pair could still overlap it). A session that fails either check is retained and counted in the maintenance response (`retainedMissingEvidence`, `retainedOpenOverlap`). See `docs/reviews/rls-maintenance-operations-2026-09-07.md`.

## 6. UI contract (C-R1-04, 2026-09-08)

The types in `types/learning-path-analytics.ts` are the shared contract of `pages/api/learning-paths/analytics.ts` and `components/reports/LearningPathAnalytics.tsx`. A consumer must:

- render a `null` rate as **"No disponible"** (with the reason: no paths, or no assigned population) and a numeric `0` as **`0.0%`** — the two are different facts;
- never draw a metric listed under `unavailable` as a chart series or a number (the engagement score, at-risk flag and the daily / monthly completion rates are named as unavailable in the UI);
- keep a failed query (**502** naming the relation), a denial (**403**, "solo para administradores") and a network / malformed response as distinct states — none of them is rendered as an empty report;
- list paths without an assigned population separately instead of charting them as 0.

`pages/reports.tsx` shows the admin-only notice to the other reporting roles without issuing the request. Browser coverage: E2E `C-R1-04` (live data, the empty-population contract, the 502 contract, the non-admin notice); component coverage: `__tests__/components/LearningPathAnalytics.nullMetrics.test.tsx`.
