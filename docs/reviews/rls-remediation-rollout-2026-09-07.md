> **Current-main integration (2026-09-08): DO NOT MERGE.** Actual main `097b62ed` is merged in executable candidate `97f735be`; final published identity/CI are recorded in the current-main integration review request and external report. Fresh actual-main P0–P7 and injected-failure rehearsal: 563 checks; exact wrappers: 52 checks; mandatory E2E: 219, no skips/flakes. The seven renamed payloads and wrappers are unchanged. All older source/deployment/preflight observations below are historical; Production needs a separately authorized live re-lock.

> **Local packaging revision (2026-09-08; review pending):** deployment filenames now use `20260908180000`–`20260908180600`; payload bytes are unchanged. Earlier version numbers inside payload comments and historical evidence identify the original reviewed files. Follow the manifest and updated operator checklist; no Production apply is authorized.

# RLS remediation (W-B2c-01 + W-B10a-01 + D-RLS-01/02/03 + R2–R5 corrections + closure C1–C4) — CURRENT rollout, containment and compensation procedure

> **Release integration update (2026-09-08):** original candidate independently APPROVE WITH NOTES; current-main integrated-tree review remains pending. Fresh current-main (`3d13ddb5`) archive/build rehearsal passes 533 P0–P7/injected-failure checks; integrated mandatory E2E passes 219 tests with zero skips/flakes. See the current review request and `rls-release-operator-checklist-2026-09-08.md` for evidence and query prerequisites. The historical rehearsal counts below are not fresh integrated evidence.

> **C-R2-01 update (2026-09-08):** migration #6 is revised in place to honor explicit non-cancelled course assignments as independent sources and repair existing-assignment retries. Provenance privileges remain unchanged. Local validation: 533 old-app prefix/failure checks, 3,753 pgTAP assertions and 217 mandatory E2E tests passed; exact evidence is in the current review request. Independent approval and all Production steps remain pending.

> **This section is the only active procedure.** Everything under "Historical material (superseded)" at the end of this file is kept for the audit trail and must not be executed. Last revised 2026-09-08 for the C-R1 correction round (closure review `rls-c-closure-review-2026-09-08.md`: migrations #5–#7 revised in place — no repair migration — for enrolment identity privileges, the password gate inside the owner views and the definer readers/writers, and the atomic admin grant `admin_grant_course_access`; the old-app rehearsal gained the independent-grant transition); previously revised 2026-09-07 for the closure round C1–C6 (seven migrations; the three new ones are additive and follow the four reviewed R1–R5 migrations); previously revised for R5-01; the R4 validation below is historical evidence; R5 local validation is recorded at the end of this current section. Previously revised after Codex re-review R4 (`rls-rereview-r3-2026-09-07.md`, findings R4-01 / R4-02 — the R3-05 procedure is kept; §2 now states the *demonstrated* heartbeat and progress-continuity behaviour of the transition window).
>
> **Authority.** This document is instructions only. Nothing in it was executed against Production and nothing in it authorizes anyone to do so. Every Production step below (SQL, migration apply, deployment, maintenance call) is a **separately authorized operator action** on Brent's controlled path (`main` auto-deploy). **CI applies these migrations only to disposable, ephemeral test stacks (`supabase db reset` on the runner); CI never applies Production migrations.** Everything bounded to Production is metadata/aggregate-only: no row content, no PII.

## 1. What ships — the seven migrations, in order, and their dependencies

The seven reviewed payloads are preserved byte-for-byte from commit `ce24dba2`; their deployment filenames are mapped in `rls-release-migration-manifest-2026-09-08.json`. The 2026-09-08 packaging revision avoids Production's occupied `20260907120000` version without editing or removing that history. Use `db reset` only for an explicitly identified disposable test database. Production requires the reviewed, project-bound per-file transaction wrappers: payload and migration-history insert commit atomically, followed by prefix verification; do not use a generic migration push against its divergent historical registry. Apply in the listed order, each in its own transaction (a failure rolls that migration back completely and leaves the previous prefix state, which is compatible with the deployed application — §2). Migrations 1–4 are the R1–R5 candidate approved by the R5 review; 5–7 are the closure round (C1 function exposure, C2 course entitlement, C3/C4 reporting and retention). No earlier migration was edited by the closure round except `20260907120600`'s own dependencies on them; the deployable prefixes P1–P4 remain exactly what R5 reviewed.

| # | Migration | Depends on (already shipped) | Creates / changes (summary) | Data touched | Reversibility |
|---|---|---|---|---|---|
| 1 | `20260908180000_learning_path_governance.sql` | `learning_paths`, `learning_path_courses`, `learning_path_assignments`, `learning_path_progress_sessions`, `community_workspaces` (`community_id` UNIQUE), `user_roles`, `auth_is_admin()`, `apply_forced_password_change_guard()` | helpers `auth_is_assigned_group_member`, `auth_is_learning_path_assignee`, `learning_path_has_course`, `lp_lock_session_pairs` (R3-02); RLS ON + policies on the two template tables; `ALTER POLICY` on the four assignment policies; column-level INSERT/UPDATE grants on assignments and sessions — the sessions UPDATE grant **includes `updated_at`** from this migration on (R3-05); additive columns `learning_path_progress_sessions.settled_at` and protected `heartbeat_trust_ceiling` (R5-01, §2b); the eight learning-path functions recreated (same signatures; `end` and `update_session_heartbeat` re-check assignment authority, R3-01; `end`, `settle`, `close_stale` take the per-(user, path) advisory lock before any row lock, R3-02); `settle_learning_path_sessions` (no grants), `close_stale_learning_path_sessions` (service_role); **R4-01**: BEFORE INSERT / UPDATE OF `last_heartbeat` trigger `learning_path_progress_sessions_heartbeat_guard` (an application principal's value is replaced by `now()`, every other writer is clamped to `now()`) and internal helper `lp_last_authorized_heartbeat()` used by `end` (revoked learner) and the maintenance close (a historical heartbeat beyond its persisted ceiling counts as the session start; a second guard enforces this for old maintenance direct closures) | **one backfill UPDATE**: closed sessions get `settled_at = session_end` (their `updated_at` moves to the apply time via the row trigger — cosmetic; minutes and `session_end` untouched) | forward-only; the column is nullable; policies/grants re-tightenable by a later additive migration |
| 2 | `20260908180100_b10a_referenced_tables_rls.sql` | #1 (`auth_is_learning_path_member`), `group_assignment_groups`, `group_assignment_members`, `message_threads`, `user_is_in_group`, `is_admin_or_consultor`, `lessons` | RLS ON + policies on the six B10a tables; helper `auth_is_community_member`; `lessons_learning_path_member_view`; sequence lockdown for `propuesta_rate_limits` | none | forward-only |
| 3 | `20260908180200_drls_function_exposure.sql` | `quiz_submissions`, `user_roles`, `auth_is_admin()` (not #2) | search_path pin + grant tightening on the five D-RLS-01 functions; `auth_is_backend_caller`; `submit_quiz` / `has_global_workspace_access` bodies | none | forward-only |
| 4 | `20260908180300_r2_remediation.sql` | #1 (settlement functions, `lp_lock_session_pairs`), #3 (`auth_is_backend_caller`), `document_folders`, `profiles` | `reserve_/release_propuesta_access_attempt`; `learning_path_user_progress` (own-progress record) + `lp_record_progress` + `record_learning_path_activity` (authority re-checked, R3-01; lock order, R3-02) + the two `learning_path_assignments` seed/ensure triggers (R3-04) + **R4-02** AFTER UPDATE OF `current_course_sequence, completed_at, last_activity_at` trigger `learning_path_assignments_sync_progress` (a direct progress write on a direct row — the previously deployed activity route's shape — is reconciled into the progress record; `lp_record_progress` locks the assignment row before the progress row and flags its own mirror write); `credited_minutes` column; single-open-session trigger; session INSERT revoked from `authenticated`; union-credit `settle_learning_path_sessions`; `get_folder_breadcrumb` workspace-bound + `document_folders_parent_guard` trigger (R3-03); the R2-01 function corrections | **one backfill INSERT**: one `learning_path_user_progress` row per existing direct assignment row, values COPIED from it (assignment rows are not modified) | forward-only; the table and triggers are additive |

| 5 | `20260908180400_c1_function_exposure.sql` | #3 (`auth_is_backend_caller`), #4 (its tightened body), `auth_is_admin()`, committed tables (`user_roles`, `superadmins`, `dev_users`, `feedback_permissions`, `community_*`, `meeting_attendees`, `transformation_assessment_collaborators`, `group_assignment_members`, `red_escuelas`, `role_permission*`, `assignment_templates`, `modules`, `lessons`) | internal `auth_actor_bound(uuid)`; the 21 D-RLS dispositions: 12 policy predicates recreated actor-bound (same signatures, grants anon + authenticated + service_role, PUBLIC revoked, search_path pinned, STABLE), 7 endpoints restricted to service_role, `auth_is_superadmin` service-only, `get_school_user_counts` admin-gated with authenticated EXECUTE kept; `get_available_assignment_templates` ORDER BY repaired | none | forward-only (grants re-widenable by an additive migration) |
| 6 | `20260908180500_c2_course_entitlement.sql` | #1 (`batch_assign_learning_path` authority, `auth_is_learning_path_assignee`), #4 (assignment seed/ensure triggers stay), #5 (`is_admin_or_consultor` bound — the altered `courses` policy calls it) | `course_enrollments.access_origin` (`independent` / `learning_path` / `unknown`, default `unknown`), `source_path_id`, `access_origin_set_at`; origin guard trigger; `lp_user_entitled_to_course`, `course_enrollment_grants_access`, `auth_is_course_student` (entitlement-aware, same signature/grants), `auth_accessible_course_ids`; `ALTER POLICY enrolled_or_owner_can_read_courses`; `lp_ensure_path_enrollments`, `lp_group_member_ids`; `batch_assign_learning_path` recreated (same signature/result, password gate); triggers on `learning_path_courses` (course added) and `user_roles` (membership activated); `lp_enrollment_origin_report()` (password gate); **C-R1 (2026-09-08):** `anon` loses UPDATE on `course_enrollments`, `authenticated` keeps a column-level UPDATE grant on every column except `id`, `user_id`, `course_id`, `access_origin`, `source_path_id`, `access_origin_set_at`; `course_enrollments_origin_guard` fires on every UPDATE and refuses identity / provenance / grant-column changes by non-admin, non-backend actors; new `admin_grant_course_access(uuid, uuid[])` (authenticated + service_role EXECUTE; admin + gate re-checked inside); `batch_assign_courses` recreated (same signature; declares `independent`; no provenance rewrite on conflict; password gate) | **no row data change** — the new column's default marks every existing enrolment `unknown` (access preserved) | forward-only; the policy can be re-widened additively |
| 7 | `20260908180600_c3_reporting_retention.sql` | #4 (`settle_learning_path_sessions` union body, `credited_minutes`, `learning_path_user_progress`, `lp_record_progress`, `lp_lock_session_pairs`), #1 (`settled_at`, `close_stale_learning_path_sessions` unchanged), #5 (`auth_is_backend_caller` use), #6 (ordering only) | `lp_reporting_timezone`, `lp_activity_date`; table `learning_path_daily_user_activity` (RLS, own-read / service policies + forced-password guard); `settle_learning_path_sessions` recreated with the grain upsert; five `security_barrier` views (`learning_path_assigned_users`, `user_learning_path_summary`, `learning_path_performance_summary`, `learning_path_daily_summary`, `learning_path_monthly_summary`) — **C-R1 (2026-09-08): each filter also applies `password_change_gate_ok()`**; `archive_settled_learning_path_sessions(timestamptz, integer)` (service_role) | **one backfill INSERT** into the grain from every closed + settled session (aggregated; sessions untouched) | forward-only; the table and views are additive |

Closure-round edit to two reviewed migrations (one statement each, #1 and #4): the predecessor-closing `UPDATE` inside `start_learning_path_session` closes a predecessor that started after the transaction's `now()` at its own start with zero minutes (`greatest(now(), session_start)`) instead of violating `learning_path_progress_sessions_time_valid` — a pre-existing concurrent-start race surfaced by an E2E retry (review request C.4 item 8; pgTAP 079 §7). No prefix carries the race; no other reviewed statement changed.

Guards: `npm run guard:migrations` (no `DROP` / `TRUNCATE` / destructive `ALTER` / RLS disable) and the CI migration guard pass on all seven.

## 2. Application/schema compatibility — the transition interval is safe in ONE direction

The migration set is **backward-compatible with the currently deployed application at every prefix** (after 0, 1, …, 7 migrations). The application on this branch is **not** compatible with the committed schema (it calls `record_learning_path_activity`, `reserve_propuesta_access_attempt`, `learning_path_user_progress`, the summary views, `archive_settled_learning_path_sessions`, `auth_accessible_course_ids`, which do not exist there). Therefore the order is fixed:

1. **Database first** — the operator applies the seven migrations to Production (separately authorized), in file order.
2. **Application second** — the `main` merge deploys the application.

Between 1 and 2 the previously deployed application runs against the new schema. That interval was **rehearsed with the actual previously deployed application** (a `git archive` of `92df72a6` built and served against the disposable stack, driven through real browser-cookie sessions of the seeded personas) at every prefix state, including a failed apply of each migration before its real apply:

| Old app behaviour (cookie session) | committed schema (P0) | after 1 | after 2 | after 3 | after 4 | Rehearsal evidence |
|---|---|---|---|---|---|---|
| `session/activity.ts` — direct `UPDATE` of `activity_type, course_id, last_heartbeat, updated_at` on the own open session, then the assignment sequence / completion | 200 | 200 (`updated_at` is in the grant from #1 — **the R3-05 gap is closed**; from #1 on the `last_heartbeat` it sends is **replaced by the server clock**, R4-01) | 200 | 200 | 200 — and its sequence / completion writes on the assignment row are **reconciled into `learning_path_user_progress`** (R4-02, §2a) | `migration-prefix-rehearsal-run5.log`, `migration-prefix-rehearsal-r4-run1.log` |
| `session/heartbeat.ts` (RPC) | 200 | 200 | 200 | 200 | 200 | same |
| `session/end.ts` — `end_learning_path_session` then `increment_path_assignment_time` with body minutes | 200 (body minutes credited — the pre-existing self-credit) | 200 (increment refused → warning only; credit comes from server-side settlement) | 200 | 200 | 200 | same |
| `[id]/enhanced-progress.ts` (direct assignee) | 200 | 200 | 200 | 200 | 200 | same |
| `my-paths` (docente / group member) | 200 | 200 | 200 | 200 | 200 | same |
| `cron/cleanup-learning-path-sessions.ts` (service role; closes at last heartbeat, its credit RPC `increment_path_time` does not exist at any state → warning, never credited) | 200 | 200 | 200 | 200 | 200 | same; window artefact handled in §4 |
| `session/start.ts` for a **non-admin** | 403 at **every** state: the old route's PostgREST filter `group_id.is.not.null` is invalid syntax (`PGRST100`) — a pre-existing old-app defect independent of the schema | 403 | 403 | 403 | 403 | same (`PGRST100` confirmed against PostgREST directly) |
| `analytics` (admin) | identical status at every state (the old `getUserPrimaryRole` gate; schema-independent) | = | = | = | = | same |

No combination in the database-first order produces a missing column, function, table or privilege error for the old application. **The new application must never lead the database.**

The same old-app rounds were rehearsed at **P5, P6 and P7** and after an injected failure of each of the three closure migrations (`prefix-run1.log`, this round): every old route above keeps its P4 status. **C-R1 (2026-09-08, `prefix-c-r1.log`):** at P6 the OLD admin course-assignment route (service-role upsert, no provenance) still grants — its new rows are explicitly `unknown`, its rewrite of `enrolled_by`/`enrollment_type` on an existing row passes as a backend principal and does not promote the origin; the OLD batch-assign route (unchanged RPC signature) creates `independent` rows; a learner token writes own progress through PostgREST but cannot re-associate the row; at P7 a flagged admin token reads nothing through the owner views until the flag is cleared; the NEW route promotes the old route's `unknown` row to `independent` (0 created / 1 existing / 1 promoted) and is idempotent; a docente cookie session is refused. Closure-specific window facts: (P5) the old admin schools page keeps calling `get_school_user_counts` with the authenticated client — allowed for a literal admin; the old `roleUtils.supervisorCanAccessUser` helper already answered 404 (wrong argument name) and still does; (P6) the old `assign.ts` route calls `batch_assign_learning_path` with the unchanged signature and the enrolments it creates carry `access_origin = 'learning_path'`; the old `unassign.ts` still deletes members' direct rows during the window (the pre-existing defect; not made worse; fixed by the application deploy); (P7) the old cleanup route's direct `DELETE` of settled sessions older than 7 days bypasses the new evidence checks — it is **not scheduled** in the deployed `vercel.json` and nothing invokes it during the window; the migration backfill has already written the grain for every settled session, and the first NEW maintenance run writes it for the window's closed-but-unsettled sessions before any retention deletes them.

### 2c. Explicit course grants during the database-first window (C-R2-01)

At P6 and P7, both the old batch route and the old service-role admin route establish effective independent access through `course_assignments`, even when the enrollment was created by a path. Existing explicit assignments are recognized without relabeling historical enrollment origins. The batch RPC signature and legacy JSON keys are preserved; enrollment creation counts are now actual inserts. Its retry repairs a missing enrollment and preserves existing history. New batch responses additionally expose effective promoted/unchanged counts. The new admin RPC retains literal-admin origin promotion. Source locks serialize admin and batch retries in recipient order.

Apply #6 atomically before shipping the new application. If #6 fails, its helper/writer changes roll back together; do not publish an application ahead of the required schema. Rehearse P6/P7 with old cookie sessions: assign a path, grant the course independently as admin/consultor, remove the path, retry, and verify actual course/content and my-courses access plus progress. Repeat independent-first and path-first. Rehearse old service-role admin grants too. The legacy admin route uses Bearer authentication and plain assignment INSERT: a duplicate retry returns its existing unique-key 500 while the established grant remains effective. The current admin RPC is idempotent. Batch retries succeed in both application versions. Exact current execution results are in the C-R2-01 review-request section; older C-R1 logs remain historical evidence.

### 2a. Progress continuity during the window — demonstrated, no write-quiescence required (R4-02)

The previously deployed activity route keeps writing progress **directly on the learner's own direct assignment row** after migration #4 initialises `learning_path_user_progress` from that row. The columns it can write are exactly its UPDATE grant: `current_course_sequence` + `last_activity_at` (course_start) and `completed_at` + `last_activity_at` (path_complete). Nothing else on that row is application-writable (`total_time_spent_minutes`, `started_at`, `progress_percentage` are server-side; the old `end.ts` credit RPC is refused and the credit comes from settlement). From #4 on, every such write is reconciled into the progress record by `learning_path_assignments_sync_progress` — sequence copied, completion first-value, last activity monotonic — so the record the new `enhanced-progress` reader prefers never trails the old app. Group-only members have no direct row: the old route's assignment UPDATE matches nothing for them (unchanged from today) and their record starts with the first session after the app deploys.

Rehearsed with the actual previously deployed application at P4 (`migration-prefix-rehearsal-r4-run1.log`): the old route changes the sequence to a value **different** from the initialised one (2 → 1 → 2), completes the path, heartbeats, and ends through the real RPC; the record follows each change and the settlement keeps it; then this branch's application is served beside it (production build, port 3003) and its `enhanced-progress` reports the old-app-written values, including a change the old app makes **while the new app is live** (the deploy-rolled-back case). Concurrency between a legacy assignment write and a settlement is proved in both orders in `scripts/ci/lp-session-settlement-proof.mjs` §9 (the second writer waits on the assignment row; no `40P01`). Therefore there is **no write-quiescence interval to enforce**: the database-first order above is sufficient, and a slow or failed deploy leaves the old app writing into a schema that preserves its writes.

### 2b. Stable historical heartbeat disposition (R5-01)

Migration #1 adds protected `heartbeat_trust_ceiling timestamptz NOT NULL DEFAULT now()` in the same transaction as both guards and the settlement readers. Every existing row receives the **migration transaction start** as its fixed ceiling. An open historical heartbeat is ineligible if it is NULL, non-finite (including infinity), or later than that ceiling. This classification is established at #1, not at settlement. A legacy write committed while the migration waits for its table lock can also exceed that boundary and is conservatively ineligible. Historical values already at or before the boundary retain their existing treatment; this is preservation of legacy evidence, **not reconstruction or certification of historical authorization**.

The raw heartbeat, session start/end, stored minutes, assignment totals and existing progress are preserved. The new column's default initializes historical rows without an UPDATE, so it adds no `updated_at` changes; the existing closed-session `settled_at` backfill still has its documented audit-timestamp effect. Previously settled credit is not clawed back. Ordinary legacy intervals remain eligible, and #4 still copies direct-assignment progress and performs overlap-safe accounting.

`lp_last_authorized_heartbeat(hb, start, ceiling)` compares against the persisted ceiling, never the current clock. Omitting the ceiling returns the start conservatively. An unchanged ineligible heartbeat remains ineligible across its finite deadline, settlement retries, a failed later migration, and a slow or rolled-back application deployment. At P0 no new protection exists; failure of #1 rolls it back atomically and requires retry before release. A rolled-back first apply establishes no durable classification; its successful retry establishes its own boundary. Values that had already matured before the successful boundary cannot be identified as formerly future by this rule. From P1 onward the rule is enforced even if a later migration fails.

Every permitted heartbeat write replaces an application's supplied value with server `now()` and refreshes the protected ceiling in the same row write. The RPCs require current assignment; direct old-app activity remains subject to the current-assignment RLS check. Backend backdates remain bounded by server time. Neither authenticated INSERT nor UPDATE grants include the ceiling. A legitimate new authorized heartbeat therefore establishes a new mark; passage of time and unrelated session-data writes do not. An authorized `end` or `start` refreshes a guarded heartbeat before closing, retaining existing authorized-activity behavior and lock order.

A revoked user's `end` and new maintenance close use the start for an ineligible session, with zero new minutes; repeat settlement adds nothing. The BEFORE UPDATE OF `session_end` historical-close guard also clamps an ineligible **open** session to its start and zero stored minutes when the old service-role cleanup closes it directly. The subsequent settlement cannot credit a fabricated interval. It never rewrites already closed history. A fresh authorized heartbeat before revocation is still credited normally.

API contracts that change with the application deploy: `session/end` returns server-computed `timeSpentMinutes`/`endedAt`; `session/activity` and `session/heartbeat` answer **403** once a learner has lost assignment authority (R3-01); `enhanced-progress` reports `totalTimeSpent` / `currentCourse` / `startDate` / `completedAt` from the own-progress record (R3-04); the cleanup route's JSON gains `settled`; the matrix routes keep their shapes; `verify.ts`/`download-access.ts` gain a 503 when the limiter is unreadable.

R5 local execution status: **IMPLEMENTED_AND_TESTED**, pending independent Codex review. Fresh 45-migration apply; full pgTAP 32 files / 3,155 assertions; 18 settlement/concurrency checks including 62-second revocation and three finite-deadline scenarios; old-app/prefix rehearsal 180 checks / zero failures; type-check/lint/Vitest/build passed; mandatory E2E 208 passed and 14 specs with no skips; ledger baseline unchanged (67 failures). The negative control restored the moving-clock rule transactionally and failed 6/26 R5 assertions, then rolled back. Evidence: `/Users/brentcurtis/Documents/ChatGPT/RLS Review/r5-evidence/EXECUTION-REPORT.md`. These are disposable/local results, not authorization for operator actions or a Production-safety claim.

### 2c. What the closure round changes for users at the application deploy (C1–C4)

- Function oracles answer only about the caller (admin / backend excepted): no user-visible change for legitimate flows (all policy callers pass `auth.uid()`); `get_school_user_counts` refuses non-admins (only the admin page calls it).
- Course access obtained solely through a learning path ends when the learner's last valid entitlement disappears (D1) — for rows created **from P6 on**. Every pre-existing enrolment is `unknown` and keeps its access (§4 Q9 counts them; reconciliation is a separate, aggregate-first decision: `docs/reviews/rls-course-entitlement-reconciliation-2026-09-07.md`).
- Learning-path reports work (D2): `analytics` reads live views (502 on a failed query, `null` for undefined metrics); `overview` reports learning-path time only to literal admins (`null` = unavailable for other audiences, course half unchanged); `update-learning-path-summaries` answers 410 after authentication; the cleanup route becomes hourly (§6) with truthful two-stage accounting.

## 3. Bounded Production preflight (metadata/aggregate only — operator action, separately authorized)

Run **before** applying anything, read-only, and stop on any unexpected answer. No row content is selected.

```sql
-- P1 sanity: tables exist and their RLS state is the expected pre-state (all FALSE except lessons TRUE)
SELECT c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('learning_paths','learning_path_courses','group_assignment_discussions',
                     'growth_community_transformation_access','instructors','modules',
                     'propuesta_rate_limits','qa_tester_time_logs','lessons')
 ORDER BY 1;

-- P2 the policy names the migrations ALTER / CREATE must (assignments: exist) / (others: not exist)
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public'
   AND (tablename = 'learning_path_assignments'
        OR policyname IN ('lessons_learning_path_member_view','learning_paths_admin_manage',
                          'group_assignment_discussions_member_insert','learning_path_user_progress_own_read'))
 ORDER BY 1, 2;

-- P3 shape of the relations the join relies on
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.community_workspaces'::regclass AND contype = 'u';   -- expect community_workspaces_community_id_key

-- P4 aggregate-only data preview (counts, no content)
SELECT (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL) AS closed_sessions_to_mark_settled,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL)     AS open_sessions,
       (SELECT count(*) FROM public.learning_path_assignments WHERE group_id IS NOT NULL)          AS group_assignments,
       (SELECT count(*) FROM public.learning_path_assignments WHERE user_id IS NOT NULL)           AS user_assignments,
       (SELECT count(DISTINCT (user_id, path_id)) FROM public.learning_path_assignments WHERE user_id IS NOT NULL) AS user_assignment_pairs,
       (SELECT count(*) FROM public.group_assignment_discussions)                                 AS discussion_mappings,
       (SELECT count(*) FROM public.group_assignment_discussions d
          LEFT JOIN public.group_assignment_groups g ON g.id = d.group_id
         WHERE g.assignment_id IS DISTINCT FROM d.assignment_id)                                  AS discussion_mappings_inconsistent,
       (SELECT count(*) FROM public.document_folders f JOIN public.document_folders p ON p.id = f.parent_folder_id
         WHERE p.workspace_id <> f.workspace_id)                                                  AS folders_with_foreign_parent;

-- P5 preflight aggregates the operator RECORDS to compare in postflight Q3/Q5
SELECT sum(coalesce(total_time_spent_minutes,0)) AS assignment_minutes_total,
       count(*)                                  AS assignment_rows,
       sum(coalesce(total_time_spent_minutes,0)) FILTER (WHERE user_id IS NOT NULL) AS direct_assignment_minutes_total,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL) AS closed_sessions,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL)     AS open_sessions
  FROM public.learning_path_assignments;
```

R5 preflight P6 (record as a preview only; the actual fixed boundary is established atomically by #1):

```sql
SELECT count(*) FILTER (WHERE session_end IS NULL AND
  (last_heartbeat IS NULL OR NOT isfinite(last_heartbeat) OR last_heartbeat > statement_timestamp())) AS potentially_ineligible_open
FROM public.learning_path_progress_sessions;
SELECT column_name FROM information_schema.columns
WHERE table_schema='public' AND table_name='learning_path_progress_sessions'
  AND column_name='heartbeat_trust_ceiling'; -- expect absent at P0
```

Closure preflight P7–P9 (record as previews; aggregate only):

```sql
-- P7 the objects the closure migrations create must NOT exist yet (an existing one means an unknown prefix: stop)
SELECT to_regclass('public.learning_path_daily_user_activity') AS grain_table,           -- expect NULL
       to_regclass('public.user_learning_path_summary') AS summary_view,                  -- expect NULL (W-B6d-01: never migrated)
       (SELECT count(*) FROM pg_proc WHERE proname IN ('auth_actor_bound','lp_user_entitled_to_course','archive_settled_learning_path_sessions')) AS closure_fns, -- expect 0
       (SELECT count(*) FROM information_schema.columns WHERE table_name='course_enrollments' AND column_name='access_origin') AS origin_col; -- expect 0
-- P8 enrolment population the C2 default will mark 'unknown' (counts only)
SELECT count(*) AS enrollments, count(*) FILTER (WHERE enrollment_type='assigned') AS assigned_type FROM public.course_enrollments;
-- P9 sessions the C3 backfill will aggregate into the grain (counts only) — compare with Q8
SELECT count(*) FILTER (WHERE session_end IS NOT NULL AND settled_at IS NOT NULL) AS settled_sessions,
       count(DISTINCT (path_id, user_id, (session_start AT TIME ZONE 'America/Santiago')::date)) FILTER (WHERE session_end IS NOT NULL AND settled_at IS NOT NULL) AS expected_grain_rows
  FROM public.learning_path_progress_sessions;   -- at P0 settled_at does not exist: run P9 right AFTER #4 and BEFORE #7 instead
```

An unexpected existing ceiling means an unknown/previous prefix: stop and identify it before applying. Nonzero P6 is not a deployment race or a demand to deploy promptly: #1 persistently contains those rows. Immediately after #1 and after each later prefix, **stop the release** if any Q7 check is missing or differs, any helper/trigger is missing, or the helper body differs from the independently reviewed migration. Do not deploy the new application; investigate the failed apply and restore the reviewed additive sequence. Q6's suspect count alone is not a failure and need not reach zero. Preserve aggregate snapshots and account for actual activity between snapshots; do not call a naturally falling moving-clock count a repair.

**Stop conditions (do not apply):** P1 shows RLS already ON for a table the migration enables (a partial earlier apply — see §5); P2 shows any "must not exist" policy present or an assignment policy missing; P3 returns no row; P4 `discussion_mappings_inconsistent > 0` (existing rows the new INSERT policy would refuse — they stay readable; investigate first); P4 `group_assignments > 0` — the membership semantics change to workspace→community members (§1 of migration #1), review with the owner before applying; P4 `folders_with_foreign_parent > 0` is **not** a stop condition (those rows are neither validated nor rewritten; the breadcrumb simply never returns the foreign ancestor, and the guard applies only to new writes) but record the number.

## 4. Postflight (aggregate only) — data-preservation checks, immediately after the four migrations and again after the application deploy

```sql
-- Q1 backfill completeness: right after apply, no closed session is unsettled
SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL AND settled_at IS NULL;   -- expect 0 immediately after apply (see the window note below)
-- Q2 open sessions untouched
SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL AND settled_at IS NOT NULL;   -- expect 0
-- Q3 totals preserved: identical to the P5 snapshot (the migrations never change assignment totals or delete assignment rows)
SELECT sum(coalesce(total_time_spent_minutes,0)) AS assignment_minutes_total, count(*) AS assignment_rows FROM public.learning_path_assignments;
-- Q4 RLS now ON for all eight + lessons; grants as intended
SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('learning_paths','learning_path_courses','group_assignment_discussions',
   'growth_community_transformation_access','instructors','modules','propuesta_rate_limits','qa_tester_time_logs','learning_path_user_progress');  -- all TRUE
SELECT has_table_privilege('authenticated','public.learning_path_progress_sessions','DELETE');                      -- FALSE
SELECT has_table_privilege('authenticated','public.learning_path_progress_sessions','INSERT');                      -- FALSE
SELECT has_column_privilege('authenticated','public.learning_path_progress_sessions','updated_at','UPDATE');         -- TRUE (R3-05 compatibility grant)
SELECT count(*) FROM pg_trigger WHERE tgname IN ('learning_path_progress_sessions_heartbeat_guard','learning_path_assignments_sync_progress') AND tgenabled <> 'D'; -- 2 (R4-01 / R4-02)
SELECT has_function_privilege('authenticated','public.increment_path_assignment_time(uuid,uuid,integer)','EXECUTE'); -- FALSE
SELECT has_function_privilege('anon','public.submit_quiz(uuid,text,uuid,uuid,jsonb,jsonb,integer)','EXECUTE');       -- FALSE
-- Q5 the own-progress backfill (R3-04): one row per direct (user, path) pair, values COPIED — compare with P5
SELECT count(*) AS progress_rows, sum(total_time_spent_minutes) AS progress_minutes FROM public.learning_path_user_progress;
--   expect progress_rows = P4 user_assignment_pairs; progress_minutes = P5 direct_assignment_minutes_total (pairs with several direct rows contribute their richest row)
SELECT count(*) FROM public.learning_path_assignments a
  LEFT JOIN public.learning_path_user_progress p ON p.user_id = a.user_id AND p.path_id = a.path_id
 WHERE a.user_id IS NOT NULL AND (p.user_id IS NULL OR p.completed_at IS DISTINCT FROM a.completed_at OR p.started_at IS DISTINCT FROM a.started_at);  -- expect 0
SELECT count(*) FROM public.learning_path_progress_sessions WHERE credited_minutes IS NOT NULL;                       -- expect 0 right after apply (filled forward by settlement)
-- Q6 stable historical disposition (R5-01). Record BOTH counts. The first
-- cannot fall just because the clock passes; it changes only with guarded new
-- activity, explicit separately authorized data work, or archival/deletion.
SELECT count(*) FILTER (WHERE last_heartbeat IS NULL OR NOT isfinite(last_heartbeat)
                         OR last_heartbeat > heartbeat_trust_ceiling) AS ineligible_rows,
       count(*) FILTER (WHERE session_end IS NULL AND
         (last_heartbeat IS NULL OR NOT isfinite(last_heartbeat)
          OR last_heartbeat > heartbeat_trust_ceiling)) AS ineligible_open_rows
  FROM public.learning_path_progress_sessions;
-- Q7 mandatory protection checks FROM P1 ON: expect false, false, 0, 2.
SELECT has_column_privilege('authenticated','public.learning_path_progress_sessions','heartbeat_trust_ceiling','INSERT');
SELECT has_column_privilege('authenticated','public.learning_path_progress_sessions','heartbeat_trust_ceiling','UPDATE');
SELECT count(*) FROM public.learning_path_progress_sessions WHERE heartbeat_trust_ceiling IS NULL;
SELECT count(*) FROM pg_trigger WHERE tgrelid='public.learning_path_progress_sessions'::regclass
  AND tgname IN ('learning_path_progress_sessions_heartbeat_guard','learning_path_progress_sessions_historical_close_guard')
  AND tgenabled='O';
-- Confirm the fixed-boundary helper exists and is immutable; expect one row, 'i'.
SELECT provolatile FROM pg_proc WHERE oid='public.lp_last_authorized_heartbeat(timestamptz,timestamptz,timestamptz)'::regprocedure;
```

Closure postflight Q8–Q10 (aggregate only), right after #7 and again after the application deploy:

```sql
-- Q8 grain backfill completeness: no settled session without its grain row; grain rows = P9 expected_grain_rows
SELECT count(*) FROM public.learning_path_progress_sessions s
 WHERE s.session_end IS NOT NULL AND s.settled_at IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM public.learning_path_daily_user_activity a
                    WHERE a.path_id = s.path_id AND a.user_id = s.user_id AND a.activity_date = public.lp_activity_date(s.session_start)); -- expect 0
SELECT count(*) AS grain_rows, sum(sessions_count) AS sessions_counted FROM public.learning_path_daily_user_activity;   -- grain_rows = P9; sessions_counted = P9 settled_sessions
-- Q9 provenance: every pre-existing enrolment is 'unknown' (access preserved); nothing reclassified; the aggregate report runs
SELECT access_origin, count(*) FROM public.course_enrollments GROUP BY 1;   -- expect only 'unknown' = P8 enrollments right after #6
SELECT public.lp_enrollment_origin_report();                                -- run as service_role / the operator's DB session; record the JSON
-- Q10 closure protections
SELECT has_function_privilege('anon','public.get_effective_user_role(uuid)','EXECUTE');                       -- FALSE
SELECT has_function_privilege('authenticated','public.get_school_user_counts()','EXECUTE');                  -- TRUE
SELECT has_function_privilege('authenticated','public.archive_settled_learning_path_sessions(timestamptz,integer)','EXECUTE'); -- FALSE
SELECT has_table_privilege('anon','public.user_learning_path_summary','SELECT');                              -- FALSE
SELECT count(*) FROM pg_class WHERE relkind='v' AND relname IN ('user_learning_path_summary','learning_path_performance_summary','learning_path_daily_summary','learning_path_monthly_summary','learning_path_assigned_users') AND 'security_barrier=true' = ANY(reloptions); -- 5
SELECT count(*) FROM pg_trigger WHERE tgname IN ('course_enrollments_origin_guard','learning_path_courses_enroll_assignees','user_roles_enroll_group_paths') AND tgenabled='O'; -- 3
-- Q10 (C-R1, 2026-09-08): identity privileges, the guard's scope, the password gate inside the views, the atomic grant
SELECT has_table_privilege('anon','public.course_enrollments','UPDATE');                                    -- FALSE
SELECT has_table_privilege('authenticated','public.course_enrollments','UPDATE');                           -- FALSE (column grant instead)
SELECT has_column_privilege('authenticated','public.course_enrollments','course_id','UPDATE');              -- FALSE
SELECT has_column_privilege('authenticated','public.course_enrollments','progress_percentage','UPDATE');    -- TRUE
SELECT pg_get_triggerdef(oid) ~ 'BEFORE INSERT OR UPDATE ON' FROM pg_trigger WHERE tgname='course_enrollments_origin_guard'; -- TRUE
SELECT count(*) FROM pg_views WHERE viewname IN ('user_learning_path_summary','learning_path_performance_summary','learning_path_daily_summary','learning_path_monthly_summary','learning_path_assigned_users') AND definition LIKE '%password_change_gate_ok%'; -- 5
SELECT has_function_privilege('authenticated','public.admin_grant_course_access(uuid, uuid[])','EXECUTE');  -- TRUE (body: admin + gate)
SELECT has_function_privilege('anon','public.admin_grant_course_access(uuid, uuid[])','EXECUTE');           -- FALSE
SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname IN ('can_access_workspace','can_edit_meeting','fn_is_events_manager','get_user_workspace_role','has_feedback_permission','is_admin_or_consultor','is_assessment_collaborator','is_dev_user','is_global_admin','supervisor_can_access_user','user_is_in_group','user_school_ids') AND 'search_path=public, pg_temp' = ANY(coalesce(p.proconfig,'{}')); -- 12
```

**The migration-apply-to-deploy window and Q1.** Q1 is 0 immediately after apply. During the window, the *old* maintenance route (if anyone invokes it — it is **not scheduled**, see §6) closes stale sessions without crediting them (its credit RPC never existed), leaving `session_end IS NOT NULL AND settled_at IS NULL` rows. This is expected and self-healing: the **first maintenance run of the new code** (`close_stale_learning_path_sessions`) settles those rows exactly once, union-clipped (rehearsed: `P4 + new maintenance run` in `migration-prefix-rehearsal-run5.log`). Re-run Q1 after that run and expect 0. A learner's own next `start` also settles their previous open session, so credit never depends on the maintenance route.

Postflight functional smoke (operator, real accounts, no data written beyond the operator's own session): an admin opens `/admin/learning-paths`, `/admin/schools` (user counts render) and the learning-path analytics; an assigned docente opens an assigned path, a lesson and `Mis cursos`; a consultor opens the assignment matrix (course half only) and `/reports` (learning-path time shows "No disponible", course figures render). After the application deploy the **hourly cleanup job is scheduled** (§6): read its first run's JSON (`ok: true`; `settlement.settled` = the window's closed-but-unsettled count; `retention.archived`).

## 5. If the apply or the deploy stops partway — recovery and containment (forward-only)

Each migration is one transaction: a failure leaves the previous prefix state, which the deployed application tolerates (§2, rehearsed with an injected failure before each migration). Therefore:

| Situation | State you are in | Action |
|---|---|---|
| Migration k fails to apply | prefix k−1 (P0…P6), old app running normally | fix the cause, re-apply migration k, continue in order; do **not** deploy the application until all seven applied; do not hand-edit the schema |
| Apply completed, deploy not started or failed | P7, old app running (compatible) | finish/redo the deploy; sessions closed by the old maintenance route meanwhile are credited by the first new maintenance run (§4) |
| Deploy started, must be rolled back to the old application | P7, old app | supported: the old app runs on P7 (rehearsed); do **not** roll the database back |
| New application deployed against a schema that is not P7 (someone deployed first) | unsupported | stop the deploy (Vercel rollback to the previous deployment) — the new app 500s / 502s on the missing RPCs, views and table until P7 is reached; no data is corrupted (no writes reach a missing relation); then apply the remaining migrations and redeploy |
| A preflight stop condition fires after a partial earlier apply (P1 shows RLS already ON) | unknown prefix | determine the applied prefix from `supabase_migrations.schema_migrations` and the P2/Q4 catalog checks; continue from the next migration; never re-run a migration that already applied (they are not idempotent for the backfills only in the sense that `ON CONFLICT DO NOTHING` / `settled_at IS NULL` make them safe to re-run, but re-running is not the documented path) |

Symptom-level containment (additive only; never reopen a grant or disable RLS):

| Symptom | Containment |
|---|---|
| Assigned users cannot open lessons | verify `lessons_learning_path_member_view` exists and `auth_is_learning_path_member` answers; do not widen the LP policy |
| Group members do not see a group-assigned path | confirm `community_workspaces.community_id` for the assigned `group_id`; a data question for the owner (P4), not a policy change |
| Activity/heartbeat route answers 403 for a learner | the learner's assignment or membership ended (R3-01); reassign through the admin UI (the progress record is intact and is inherited by the new direct row) — do not touch the DB |
| A session was closed with 0 minutes although the learner reports having been active | its historical heartbeat exceeded the fixed migration ceiling or was non-finite/NULL (postflight Q6), and no new authorized heartbeat superseded it (R5-01); by design conservative; an operator data question, never a policy or trigger change |
| A learner's course position or completion "went back" after the deploy | it cannot from the window: the old app's sequence/completion writes are reconciled into the record (R4-02, §2a); compare `learning_path_assignments` and `learning_path_user_progress` for the pair; a difference is a data question, not a policy change |
| Session credit missing after an app crash | run the maintenance route once (idempotent): stale and window-closed sessions are settled at most once; or the operator's one-off `SELECT public.settle_learning_path_sessions(array_agg(id)) …` as a separately authorized action |
| A learner reports "two timers running" | impossible post-migration (single-open trigger); a historical duplicate-open row is closed and union-credited on their next `start` or by maintenance |
| A learner's progress "looks reset" after being assigned directly | it cannot: the direct row is seeded from the progress record (R3-04); check `learning_path_user_progress` for the pair (postflight Q5) |
| Folder creation fails with `23514` | the parent is in another workspace, or would form a cycle / exceed 64 levels (R3-03): choose a parent in the same workspace; a legacy inconsistent parent is a data question, never a policy change |
| Proposal access-code checks answer 503 | the limiter's reservation RPC or table is unreadable by service_role: restore the service-role grant with an additive migration; do not restore fail-open |
| Quiz submissions fail for a legitimate flow | the caller passed a `p_student_id` that is not the signed-in user: fix the caller; seed/QA scripts use the service-role key |
| A consultor needs learning-path reporting | owner decision (literal-admin-only); no grant change without a recorded decision |
| Deadlock (`40P01`) on the session routes | not expected (one global lock order, R3-02, proved by `scripts/ci/lp-session-settlement-proof.mjs`); if seen, capture `pg_stat_activity`/`pg_locks` and stop — do not add retries or timeouts as a fix |
| A learner reports that a progress write on a course fails with `42501` after the deploy | the write touches an identity / provenance / grant column (`id`, `user_id`, `course_id`, `access_origin`, `source_path_id`, `access_origin_set_at`, `enrolled_by`, `enrollment_type`): by design (C-R1-01); a legitimate client writes progress / completion / status columns only; never widen the grant |
| An admin's course grant fails with 403 `PASSWORD_CHANGE_REQUIRED` or with `Admin only` | the admin is held by the forced-password gate (complete the change), or holds no ACTIVE literal `admin` role row (user metadata is never consulted, C-R1-03); grant the role through the role UI, never edit metadata |
| A learner lost access to a course after the deploy | check `course_enrollments.access_origin` for the pair: `learning_path` with neither a current path assignment/membership nor an explicit non-cancelled course assignment is D1 by design (reassign through the admin UI, or record an explicit independent grant as an admin — never edit the origin of an `unknown` row); `unknown` rows never lose access from this release |
| A user cannot see a co-worker's learning-path time in `/reports` | literal-admin-only by decision (D2); "No disponible" is the intended rendering, not a failure |
| `analytics` answers 502 | a summary view is unreadable (missing at P<7, or a grant regression): apply the missing migration / restore the SELECT grant additively; never re-point the route at raw sessions |
| The cleanup job reports `retainedMissingEvidence > 0` persistently | a settled session without its grain row: data question for the owner (Q8), never a manual delete |
| Anything else unexpected | stop; the release can be held at the `main` merge — no partial revert of a single migration |

## 6. Stop conditions and separately authorized operator actions

- **Stop**: any preflight stop condition (§3, incl. P7); any gate red in CI on the PR; a changed approved SHA; a Production error-rate change on `/api/learning-paths/*`, `/api/reports/overview`, `/api/my-courses`, `/api/propuestas/web/*` or the cleanup route after deploy; Q8 ≠ 0 or Q10 mismatch right after #7.
- **Scheduled by this release**: `vercel.json` now carries `/api/cron/cleanup-learning-path-sessions` at `0 * * * *` (hourly, 15-minute stale threshold, 7-day retention). The schedule becomes active only with the application deploy, i.e. after P7. Before deploying: confirm `CRON_SECRET` is present in Vercel Production (`vercel env ls production`, presence only — never print it) and that the plan allows sub-daily cron cadence. After deploying: confirm the entry in the Vercel Cron Jobs dashboard and read the first run's JSON (operating procedure: `docs/reviews/rls-maintenance-operations-2026-09-07.md`). Credit still does not depend on it (a learner's next `start` settles their previous session).
- **Retired**: `/api/cron/update-learning-path-summaries` answers 410 after authentication and must not be scheduled.
- **Separately authorized (never part of this task)**: merging/pushing `main`; applying the migrations to Production; running any SQL against Production (including §3/§4 and the reconciliation report); any relabelling of `unknown` enrolments; the one-off settlement in §5; the ownership decisions in `docs/reviews/rls-ownership-action-register-2026-09-07.md`.

---

# Historical material (superseded — do not execute)

> The two sections below are the R1 rollout plan and the R2 addendum as they were reviewed. They are superseded by the CURRENT procedure above (in particular: they describe **three** migrations, the R1 text claimed the backfill "never touches timestamps", and the R1 postflight relied on an **hourly cleanup cron** — all corrected above). Kept verbatim for the audit trail.

## [HISTORICAL R1] RLS remediation (W-B2c-01 + W-B10a-01 + D-RLS-01/02) — rollout, containment and compensation plan (three-migration version, superseded)

**Scope:** the three uncommitted migrations on `fix/rls-learn` (`20260907120000_learning_path_governance.sql`, `20260907120100_b10a_referenced_tables_rls.sql`, `20260907120200_drls_function_exposure.sql`) and the application changes that ship with them. **This document is instructions only. Nothing here was executed against Production, and nothing here authorizes anyone to do so** — every Production step below is a separately authorized operator action on Brent's controlled path (`main` auto-deploy). Everything bounded to Production is metadata/aggregate-only: no row content, no PII.

## 1. Migration order and dependencies

| # | Migration | Depends on (already shipped) | Creates / changes | Reversibility |
|---|---|---|---|---|
| 1 | `20260907120000_learning_path_governance.sql` | `learning_paths`, `learning_path_courses`, `learning_path_assignments`, `learning_path_progress_sessions`, `community_workspaces` (`community_id` UNIQUE), `user_roles`, `auth_is_admin()`, `apply_forced_password_change_guard()` | helpers `auth_is_assigned_group_member`, `auth_is_learning_path_assignee`, `learning_path_has_course`; RLS ON + policies on the two template tables; `ALTER POLICY` on the four assignment policies; **column-level** INSERT/UPDATE grants on assignments and sessions; **additive column** `learning_path_progress_sessions.settled_at` + one backfill `UPDATE` (closed sessions marked settled, see §4); the eight functions recreated (same signatures); new `settle_learning_path_sessions` (no grants) and `close_stale_learning_path_sessions` (service_role) | forward-only. Policies/grants can be re-tightened or loosened by a further additive migration; the column is nullable and harmless if unused |
| 2 | `20260907120100_b10a_referenced_tables_rls.sql` | #1 (uses `auth_is_learning_path_member`), `group_assignment_groups`, `group_assignment_members`, `message_threads`, `user_is_in_group`, `is_admin_or_consultor`, `lessons` (RLS already ON) | RLS ON + policies on the six B10a tables; helper `auth_is_community_member`; **new SELECT policy on `lessons`** (`lessons_learning_path_member_view`); sequence lockdown for `propuesta_rate_limits` | forward-only; each policy is independently droppable by a later migration |
| 3 | `20260907120200_drls_function_exposure.sql` | #2 is not required; needs `quiz_submissions`, `user_roles`, `auth_is_admin()` | search_path pin + grant tightening on the five D-RLS-01 functions; helper `auth_is_backend_caller`; `submit_quiz` and `has_global_workspace_access` bodies recreated (same signatures) | forward-only; bodies can be re-replaced |

All three are applied by `supabase db reset` / `supabase migration up` in file order; each is a single transaction. The repository guards (`npm run guard:migrations`, CI migration guard) pass: no `DROP`, `TRUNCATE`, destructive `ALTER` or RLS disable.

## 2. Application / schema compatibility and deployment sequence

The migrations and the application must ship **together in one deploy** (a push of `main`). Cross-version behaviour if they are ever apart:

| Combination | Effect |
|---|---|
| new DB, old app | `session/end.ts` (old) still calls `increment_path_assignment_time` → **permission denied** (logged as a warning, request still 200 — the credit is instead done by `end_learning_path_session`); old `cleanup` route reads/writes sessions directly through service_role → still works but credits via its own read-modify-write (the pre-remediation weakness) and its `update({updated_at})` on sessions is fine for service_role; `activity.ts` (old) writes `updated_at` → **column privilege error** for authenticated (activity update fails until the app deploys). Old `assign.ts` group branch keeps failing as before. |
| old DB, new app | `cleanup` route calls `close_stale_learning_path_sessions` → **function does not exist** → 500 on every run (no data change); `session/start.ts` calls `auth_is_learning_path_assignee` → does not exist → 500; `users.ts`/service map communities to workspaces → works (tables exist). |

Therefore: **deploy order is "migrations then app" within the same release; do not split.** API response contracts: `session/end` returns server-computed `timeSpentMinutes`/`endedAt`; the cleanup route's JSON gains `settled` and no longer emits `errorDetails`; the matrix routes keep their shapes (learning-path fields are empty/zero for non-admins); `verify.ts`/`download-access.ts` gain a 503 answer when the limiter is unreadable.

## 3. Bounded Production preflight (metadata/aggregate only — operator action, separately authorized)

Run **before** merging, read-only, and stop on any unexpected answer. No row content is selected.

```sql
-- P1 sanity: tables exist and their RLS state is the expected pre-state (all FALSE except lessons TRUE)
SELECT c.relname, c.relrowsecurity
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relname IN ('learning_paths','learning_path_courses','group_assignment_discussions',
                     'growth_community_transformation_access','instructors','modules',
                     'propuesta_rate_limits','qa_tester_time_logs','lessons')
 ORDER BY 1;

-- P2 the policy names the migrations ALTER / CREATE must (assignments: exist) / (others: not exist)
SELECT tablename, policyname FROM pg_policies
 WHERE schemaname = 'public'
   AND (tablename = 'learning_path_assignments'
        OR policyname IN ('lessons_learning_path_member_view','learning_paths_admin_manage',
                          'group_assignment_discussions_member_insert'))
 ORDER BY 1, 2;

-- P3 shape of the relations the join relies on
SELECT conname FROM pg_constraint
 WHERE conrelid = 'public.community_workspaces'::regclass AND contype = 'u';   -- expect community_workspaces_community_id_key

-- P4 aggregate-only data preview (counts, no content)
SELECT (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL) AS closed_sessions_to_mark_settled,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL)     AS open_sessions,
       (SELECT count(*) FROM public.learning_path_assignments WHERE group_id IS NOT NULL)          AS group_assignments,
       (SELECT count(*) FROM public.learning_path_assignments WHERE user_id IS NOT NULL)           AS user_assignments,
       (SELECT count(*) FROM public.group_assignment_discussions)                                 AS discussion_mappings,
       (SELECT count(*) FROM public.group_assignment_discussions d
          LEFT JOIN public.group_assignment_groups g ON g.id = d.group_id
         WHERE g.assignment_id IS DISTINCT FROM d.assignment_id)                                  AS discussion_mappings_inconsistent;
```

**Stop conditions (do not merge):** P1 shows RLS already ON for a table the migration enables (a partial earlier apply); P2 shows any of the "must not exist" policies present or an assignment policy missing; P3 returns no row (the workspace→community 1:1 assumption does not hold); P4 `discussion_mappings_inconsistent > 0` (existing rows that the new INSERT policy would refuse — they stay readable, but investigate before shipping); `group_assignments > 0` — **do not** rely on the historical W-PC-06 "zero group assignments" note; this count is the only evidence of current contents, and if non-zero the membership change in §1 changes who consumes those paths (workspace members instead of uuid-coincident community members) — review with the owner before merging.

## 4. Data-preservation checks (postflight, aggregate only)

The only data change is the backfill `UPDATE … SET settled_at = session_end WHERE session_end IS NOT NULL AND settled_at IS NULL`. It never touches minutes, timestamps or assignment totals; it prevents the new server-side settlement from crediting historical sessions a second time.

```sql
-- Q1 backfill completeness: no closed session left unsettled at apply time
SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL AND settled_at IS NULL;  -- expect 0 right after apply
-- Q2 open sessions untouched
SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL AND settled_at IS NOT NULL;  -- expect 0
-- Q3 totals preserved: compare with the preflight snapshot
SELECT sum(coalesce(total_time_spent_minutes,0)) FROM public.learning_path_assignments;                           -- unchanged vs preflight
-- Q4 RLS now ON for all eight + lessons; grants as intended
SELECT c.relname, c.relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname='public' AND c.relname IN ('learning_paths','learning_path_courses','group_assignment_discussions',
   'growth_community_transformation_access','instructors','modules','propuesta_rate_limits','qa_tester_time_logs');  -- all TRUE
SELECT has_table_privilege('authenticated','public.learning_path_progress_sessions','DELETE');                     -- FALSE
SELECT has_function_privilege('authenticated','public.increment_path_assignment_time(uuid,uuid,integer)','EXECUTE'); -- FALSE
SELECT has_function_privilege('anon','public.submit_quiz(uuid,text,uuid,uuid,jsonb,jsonb,integer)','EXECUTE');       -- FALSE
```

Postflight functional smoke (operator, real accounts, no data written beyond the operator's own session): an admin opens `/admin/learning-paths`; an assigned docente opens an assigned path and a lesson inside it; a consultor opens the assignment matrix (course half only); the hourly cleanup cron's next run returns 200 with `settled` in its JSON.

## 5. Forward-only compensation / containment (does not reopen unsafe access)

| Symptom | Containment (additive migration or config; never a rollback that re-opens the old surface) |
|---|---|
| Assigned users cannot open lessons | verify `lessons_learning_path_member_view` exists and `auth_is_learning_path_member` answers; if a course is legitimately outside any template, the enrolment path (`lessons_student_view`) still applies — do not widen the LP policy |
| Group members do not see a group-assigned path | confirm `community_workspaces.community_id` for the assigned `group_id`; a workspace with a different community than intended is a data question for the owner (P4), not a policy change |
| Activity route fails with column privilege error | the app and DB are out of step (§2): finish the deploy; do not re-grant whole-table UPDATE |
| Session credit missing after an app crash | run the maintenance route once (idempotent): stale sessions are closed and settled at most once; `settled_at IS NULL AND session_end IS NOT NULL` rows can be settled by an operator with a one-off `SELECT public.settle_learning_path_sessions(array_agg(id))` **as a separately authorized action** |
| Quiz submissions fail for a legitimate flow | the caller passed a `p_student_id` that is not the signed-in user: fix the caller; do not relax the guard. Seed/QA scripts must use the service-role key (they already do) |
| Proposal access-code checks answer 503 | the limiter table or its sequence is unreadable by the service role: restore the service-role grant with an additive migration; do not restore fail-open |
| A consultor needs learning-path reporting | owner decision (literal-admin-only cross-user LP reporting); no grant change without a recorded decision |
| Anything else unexpected | stop; the release can be held at the `main` merge — no partial revert of a single migration (they are one release) |

## 6. Stop conditions and separately authorized operator actions

- **Stop**: any preflight stop condition (§3); any gate red in CI on the PR; a changed approved SHA; a Production error rate change on `/api/learning-paths/*`, `/api/propuestas/web/*` or the cleanup cron after deploy.
- **Separately authorized (never part of this task)**: merging/pushing `main`; running any SQL against Production (including §3/§4); re-running the cleanup route by hand; the one-off settlement in §5; any decision in the review request's DECISIONS_REQUIRED list.

---

## [HISTORICAL R2 addendum] Codex re-review corrections (2026-09-07) — superseded by the CURRENT procedure

A fourth migration, `20260907120200`'s successor `20260907120300_r2_remediation.sql`, ships with this release. It is additive/forward-only like the other three (guards pass; no DROP/TRUNCATE/destructive ALTER/RLS-disable). It adds: the proposal attempt-reservation pair, the single-open-session trigger + `credited_minutes` column + union-crediting `settle_learning_path_sessions`, `learning_path_user_progress` (+ `lp_record_progress`, `record_learning_path_activity`), and the R2-01 function corrections. Application files that ship with it: `pages/api/propuestas/web/[slug]/verify.ts`, `lib/propuestas-web/{access-rate-limit,download-access}.ts`, `pages/api/learning-paths/session/activity.ts`, `pages/api/learning-paths/[id]/enhanced-progress.ts`.

## R2-05.1 — the transition is compatible in ONE direction, so order is fixed, not simultaneous

"Migrations then app in one release" is not atomic, and Codex is right that a window exists. The migration set is deliberately **backward-compatible with the currently-deployed application**, so the safe sequence is **database first, application second**, with the app able to run against the new schema before it is itself deployed:

| Old app against NEW db (the transition window) | Effect | Contained? |
|---|---|---|
| `session/activity.ts` (old) writes `activity_type, course_id, last_heartbeat, updated_at` on its own open session | `updated_at` is now in the authenticated UPDATE grant (added for exactly this reason); the row trigger overwrites it with `now()` | yes — writes succeed; progress for group-only members is simply not yet recorded until the app deploys (no error, no loss of session timing) |
| old `session/end.ts` / `start.ts` | already call the same RPCs; `settle_*` now credits the union and writes `learning_path_user_progress` | yes — behaviour strictly improves |
| old `verify.ts` / `download-access.ts` call `getProposalRateLimitCount` / `recordProposalFailedAttempt` | **those functions still exist** in the old app bundle and the tables they use still exist; they keep working (the pre-R2-02 behaviour) until the app deploys | yes — no 500s; the fail-open window is only as wide as the deploy gap, which is why the app must follow promptly |
| old `enhanced-progress.ts` | reads `learning_path_assignments` only | yes — a group-only member gets the pre-existing 404 (unchanged from today) until the app deploys |

NEW app against OLD db is NOT supported (the new app calls `reserve_propuesta_access_attempt`, `record_learning_path_activity`, `learning_path_user_progress`, which do not exist) — so the app must never lead the database. On Vercel's `main` auto-deploy the migration is applied by the operator against Production **before** the `main` merge that ships the app (a bounded manual step on Brent's controlled path), then the merge deploys the app; the gap is the migration-apply-to-deploy interval, during which the OLD app runs safely against the NEW db per the table above. If a strict cutover is preferred, put the app behind maintenance for the migration-apply interval instead; either way there is no combination in which a request errors on a missing column, function or table.

CI applies these migrations only to disposable test stacks. **CI does not apply Production migrations** — that is the operator's separately authorized step, unchanged.

## R2-05.2 — the settled_at backfill and updated_at (correcting the earlier claim)

The earlier "never touches ... timestamps" line was wrong and is corrected here: the `20260907120000` backfill `UPDATE ... SET settled_at = session_end` fires `learning_path_progress_sessions_updated_at`, so **`updated_at` is set to the transaction time on every backfilled (closed) row**. This is cosmetic — `updated_at` is a write-audit column, not a source of credited minutes or activity time — and no minutes, `session_start`, `session_end`, `time_spent_minutes` or assignment total changes. The `20260907120300` migration adds no backfill of its own (`credited_minutes` and `learning_path_user_progress` start empty and are filled forward by settlement). The `settled_at` backfill on the pre-existing closed rows is what keeps the union credit correct after release: `settle_learning_path_sessions` seeds its covered-interval set from every `settled_at IS NOT NULL` session of the pair (not from `credited_minutes`, which is NULL on those backfilled rows), so a new session overlapping a historical one is credited only for its novel minutes and a historical session is never re-credited (verified on the disposable DB: a new [T-80,T-60] session overlapping a backfilled [T-100,T-70] one credits 10, not 20). Preservation expectation: after apply, `session_end`, `time_spent_minutes` and `total_time_spent_minutes` are byte-for-byte unchanged; `updated_at` on closed rows equals the apply time; `settled_at` on closed rows equals their `session_end`.

## R2-05.3 — preflight/postflight aggregates now match

The postflight Q3 total is compared against a preflight snapshot that P1–P4 now collect. Add to the §3 preflight, before merge:

```sql
-- P5 preflight aggregates (operator records these numbers to compare in Q3)
SELECT sum(coalesce(total_time_spent_minutes,0)) AS assignment_minutes_total,
       count(*)                                  AS assignment_rows,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NOT NULL) AS closed_sessions,
       (SELECT count(*) FROM public.learning_path_progress_sessions WHERE session_end IS NULL)     AS open_sessions
  FROM public.learning_path_assignments;
```

Postflight Q3 (unchanged shape) compares `assignment_minutes_total` and `assignment_rows` against the P5 snapshot — both must be identical (the migrations never change assignment totals or delete assignment rows). A new postflight Q5 confirms the additive column/table start empty as expected:

```sql
-- Q5 the R2 additions start empty (filled forward by settlement, never backfilled)
SELECT count(*) FROM public.learning_path_progress_sessions WHERE credited_minutes IS NOT NULL;  -- expect 0 right after apply
SELECT count(*) FROM public.learning_path_user_progress;                                          -- expect 0 right after apply
```

## R2-05.4 — the cleanup cron is not scheduled; do not rely on an "hourly next run"

`pages/api/cron/cleanup-learning-path-sessions.ts` is **absent from `vercel.json` `crons`** (which schedules only the zoom/recovery/auth-retention jobs). The earlier postflight sentence relying on "the hourly cleanup cron's next run" is withdrawn. The route's correctness is established off-Production by pgTAP 070 §6b, pgTAP 073 §3, `scripts/ci/lp-session-settlement-proof.mjs` and the e2e maintenance test — none of which touch Production. To verify settlement in Production, an operator may invoke the route once as a **separately authorized** action:

```
curl -X POST "$PROD_ORIGIN/api/cron/cleanup-learning-path-sessions" -H "Authorization: Bearer $CRON_SECRET"
```

This is operator-only, idempotent (SKIP LOCKED + `settled_at`), and is NOT scheduled or invoked by this task. Whether to add the route to `vercel.json` `crons` is a separate operator/product decision (a schedule change), recorded here but not made. Until then, stale open sessions are settled on the learner's next `start` (which closes and settles their previous open session) — so credit is not dependent on the cron.

## R2-05.5 — forward-only containment (unchanged, extended)

| Symptom | Containment (additive only; never reopen a grant or disable RLS) |
|---|---|
| Proposal access-code checks answer 503 | the limiter's reservation RPC or the table is unreadable by service_role: restore the service-role grant with an additive migration; do not restore fail-open (a 503 is the fail-closed answer, correct under load) |
| A learner reports "two timers running" | not possible post-migration (single-open trigger); a historical duplicate-open row (pre-trigger) is closed and union-credited on their next `start` or the maintenance route |
| A group member's progress looks missing on an old app | finish the app deploy (§R2-05.1); `learning_path_user_progress` fills forward from the first session after the app ships; historical group-only sessions before the app deploy were never credited under the old code either, so nothing is lost that existed |
| Overlapping historical sessions over-credited before the fix | not corrected retroactively (no historical-credit rewrite, per the task): the union logic prevents future double-counting; a specific over-credited assignment is an operator data question, not an automatic rewrite |
