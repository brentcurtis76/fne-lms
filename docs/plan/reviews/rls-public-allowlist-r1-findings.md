# RLS · public allowlist · r1 — diagnosis

**Branch** `fix/rls-public` from `main` @ `43999499` · **Date** 2026-08-11 · **Round** r1 corrected after independent review (DIAGNOSIS — no migration, no code change)
**Target** production project `sxlogxqzmarhqsblxmtj` (PG 15.8, 251 tables in `public`, 22 without RLS)
**Method** read-only SQL over the MCP (catalog only) + count-only REST probes (`limit=0`, `Prefer: count=exact`) + read-only GET probes of candidate RPCs + static call-site analysis. No writes, no DDL, no row reads. All probe identifiers were synthetic.

---

## 1. Reachability — PROVEN reachable

`public` is exposed over PostgREST, and all 22 tables answer to the publishable key that ships in every browser.

Probe: `GET /rest/v1/<table>?select=count&limit=0` with the production publishable key and no `Authorization` header — i.e. an unauthenticated visitor.

| result | tables |
|---|---|
| `206` + `content-range: */N` (rows present) | `profiles_role_backup` 25 · `modules` 71 · `instructors` 17 · `menu_permissions` 104 · `learning_path_courses` 22 · `deleted_courses` 12 · `propuesta_rate_limits` 9 · `learning_paths` 7 · `growth_community_transformation_access` 7 |
| `200` + `content-range: */0` (reachable, empty) | `answers` · `assignments` · `course_prerequisites` · `deleted_blocks` · `deleted_lessons` · `deleted_modules` · `group_assignment_discussions` · `metadata_sync_log` · `qa_tester_time_logs` · `questions` · `quizzes` · `student_answers` · `submissions` |

Two controls confirm the probe discriminates:

- `profiles` (RLS on, policies present) → `200`, `*/0`. RLS filters anon to nothing.
- `pasantias_leads` (RLS on **and** grants revoked) → `401 permission denied for table pasantias_leads`.

So the 22 differ from correctly-protected tables in a way the API can see. The exposure is real, not theoretical.

**Grants are worse than the brief recorded.** `pg_class.relacl` shows direct grants of `arwdDxt` — i.e. **INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER** — to *both* `anon` and `authenticated` on all 22, from `supabase/migrations/00000000000000_baseline.sql` (`GRANT ALL ON TABLE ... TO "anon"`). Not SELECT+INSERT / SELECT+UPDATE as previously measured, and not inherited from `PUBLIC` — so a plain `REVOKE ... FROM anon, authenticated` is sufficient and no `PUBLIC` grant hides behind it.

Supabase's own security advisor independently reports 22 × `rls_disabled_in_public` at ERROR, plus 1 × `policy_exists_rls_disabled` on `modules`.

**Not proven, inferred:** write reachability. Confirming an anon INSERT lands would require a write to production, which is out of scope. It follows from the grants + RLS-off + proven REST reachability, and PostgREST honours table grants exactly as measured, but it is inference.

### Adjacent RPC exposure discovered during review — PROVEN

The table audit exposed a separate, more urgent write surface. `public` functions are PostgREST RPC endpoints, so a function with effective anonymous `EXECUTE` is a caller even when no repository code calls it.

- `GET /rest/v1/rpc/submit_quiz` with synthetic zero UUIDs and empty JSON reached the function and returned PostgreSQL `25006 cannot execute INSERT in a read-only transaction` (HTTP 405). The function is therefore present in the REST schema and anonymously executable in production. The read-only GET transaction prevented the insert.
- `GET /rest/v1/rpc/cleanup_propuesta_rate_limits` similarly returned `25006 cannot execute DELETE in a read-only transaction` (HTTP 405). It is also anonymously executable in production; the delete did not run.
- Synthetic read-only GETs also reached all five learning-path mutation RPCs in production: `create_full_learning_path`, `update_full_learning_path`, and `batch_assign_learning_path` returned their own validation exceptions; `start_learning_path_session` reached its first `UPDATE`; `end_learning_path_session` reached `SELECT ... FOR UPDATE`. The latter two writes/locks were rejected with `25006` in the read-only transaction. No mutation occurred.
- `GET /rest/v1/rpc/has_transformation_access` with a synthetic community UUID returned `false` (HTTP 200), proving anonymous execution. No repository caller uses this RPC; it bypasses future table RLS to disclose the access bit for any supplied community id.
- `GET /rest/v1/rpc/get_available_assignment_templates` reached its module join and returned `42703 column m.order_index does not exist` (HTTP 400). It is another anonymously executable, unused, already-broken SECURITY DEFINER RPC; if repaired without authorization it would bypass future `modules` RLS.
- A synthetic nonexistent RPC returned `PGRST202` / HTTP 404, proving that the probes discriminate schema-cache presence and permission from a missing function.

`submit_quiz` is `SECURITY DEFINER`, accepts caller-controlled `p_student_id`, `p_answers`, and `p_quiz_data`, performs no `auth.uid()` or enrollment check, and inserts into the RLS-protected `quiz_submissions` table as its owner. The baseline grants it to `anon` and `authenticated`; the local catalog also shows the default `PUBLIC` execute grant. This is not a dependency of the legacy `answers` or `questions` tables: those words occur only in JSON parameters/fields. It is an independent anonymous write vulnerability and an authenticated integrity vulnerability because scoring inputs are caller-controlled.

The fix round must revoke function execution from `PUBLIC` and `anon` explicitly. Merely revoking table grants or enabling RLS on the 22 tables does not constrain a `SECURITY DEFINER` function. Preserving legitimate quiz submission also requires redesign: bind the student to `auth.uid()`, authorize course/lesson access, and derive or validate scoring data against trusted server-side content. That work needs its own migration/application design and pgTAP coverage; it must not be smuggled into the mechanical 22-table lockdown.

The learning-path functions have the same trust-boundary defect. `create_full_learning_path`, `update_full_learning_path`, and `batch_assign_learning_path` authorize caller-supplied `p_created_by`, `p_updated_by`, or `p_assigned_by` rather than `auth.uid()`. `start_learning_path_session` writes progress for caller-supplied `p_user_id`; `end_learning_path_session` locks and closes any caller-supplied session id. All are `SECURITY DEFINER` and effectively anonymously executable in production. The exposed `profiles_role_backup` table supplies exactly the privileged UUID→role mapping needed to turn the first three from a theoretical flaw into a practical impersonation chain. Their authorization must be derived from the JWT actor, not parameters, and anon/PUBLIC execution must be revoked before table policies can be considered complete.

---

## 2. The 2026-07-08 exception

Recorded in two places, both found and read:

- `supabase/tests/001-rls-enabled.sql:46-70` — the allowlist itself, inline in the pgTAP global check, commented *"ALLOWLIST legacy: 22 tablas pre-Fase-0 sin RLS, detectadas por el baseline 2026-07-08 y aprobadas por Brent como excepción documentada … el objetivo es VACIAR esta lista, no crecerla."*
- `PROJECT_STATE.md:258` (Open decisions) — owner `[Brent+DB agent · post-Fase 0]`, with the stated remedy: *"policies tabla-por-tabla en PR dedicado (**no habilitar RLS sin policies — rompería producción**); al habilitar cada una, quitarla de la allowlist."*
- `PROJECT_STATE.md:71` restates it; `docs/plan/zoom/LEDGER.md:542` re-derives the same list during Z2 and correctly notes it predates that phase.

Two claims in the exception need correcting:

1. **"Sin datos de menores"** — true today and still true. The six tables that will hold student work (`student_answers`, `submissions`, `answers`, `assignments`, `quizzes`, `questions`) are all empty. That is the whole opportunity: they are wired for exposure before the data arrives.
2. **"no habilitar RLS sin policies — rompería producción"** — **this is false for 15 of the 22 and repairably false for one more.** Fourteen tables are dead; one is service-role-only. Those 15 need `REVOKE` + `ENABLE ROW LEVEL SECURITY` with zero policies. `qa_tester_time_logs` has a live but already-broken attempted reader that should be removed before it receives the same treatment. Only six tables need user-facing policies. The premise that made all 22 one large, risky, deferred piece of work does not hold.

No per-table reasoning was recorded in the exception — it was a blanket allowlist of whatever the 2026-07-08 baseline scan found. So there is no table-specific rationale to re-evaluate; the audit below is the first one.

---

## 3. Per-table classification

Client identification, established by reading the factories:

- `lib/api-auth.ts:16-28` — `createApiSupabaseClient()` → `createServerSupabaseClient({req,res})` = publishable-key client whose session is restored from cookies. It runs as **`authenticated` only when the Supabase cookie is present; otherwise it runs as `anon`**. `getApiUser()` separately accepts an `Authorization: Bearer` token, but this factory does not forward that header. Current in-repo callers of the affected routes use same-origin fetches and therefore cookies; bearer-only external callers remain an inferred compatibility risk that policy tests must settle.
- `lib/api-auth.ts:32-46` — `createServiceRoleClient()` → `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS.
- `lib/supabase.ts` → `lib/supabase-wrapper.ts:11` → `createPagesBrowserClient()` = **browser, publishable key**.
- `useSupabaseClient()` (auth-helpers-react) = **browser, publishable key**.

### Group A1 — dead tables: pure `REVOKE` + `ENABLE ROW LEVEL SECURITY`, no policy (14)

No working application, function, trigger, or view reads or writes these tables. Function-source matches for `answers`, `assignments`, `questions`, and `submissions` are comments, CTE names, or JSON/column identifiers referring to different tables; they are not dependencies on these legacy relations.

| table | rows | evidence |
|---|---|---|
| `answers` | 0 | Zero table references. `submit_quiz` uses a JSON parameter/column named `answers` and writes `quiz_submissions`; `grade_quiz_feedback` has only a comment match. The exposed RPC finding is separate (§1). |
| `assignments` | 0 | Function-source matches use “assignments” in comments/CTE names and operate on other relations. **All six apparent app call sites are the storage bucket, not the table** — `supabase.storage.from('assignments')` in `components/assignments/GroupSubmissionModalV2.tsx:218,225`, `SimpleGroupSubmissionModal.tsx:59,66`, `CollaborativeSubmissionModal.tsx:158,165`. |
| `course_prerequisites` | 0 | Zero references outside the baseline, `types/supabase.ts`, and the allowlist test. No function references it. |
| `deleted_blocks` | 0 | Same — baseline + generated types only. |
| `deleted_courses` | **12** | Same. |
| `deleted_lessons` | 0 | Same. |
| `deleted_modules` | 0 | Same. |
| `menu_permissions` | **104** | Zero references anywhere in the repo outside the baseline and the allowlist test. No function, no view. Orphaned — menu gating lives in code now. |
| `metadata_sync_log` | 0 | The only SQL body that writes it is trigger function `public.log_metadata_sync_needed`, which is **attached to no trigger** (`pg_trigger` empty for it). PostgreSQL trigger functions are not a legitimate application RPC path. Dead writer, dead table. |
| `profiles_role_backup` | **25** | See §4. |
| `questions` | 0 | Zero table references. `submit_quiz` iterates a caller-provided JSON property named `questions`; it does not query this relation. The exposed RPC finding is separate (§1). |
| `quizzes` | 0 | Zero references. |
| `student_answers` | 0 | Zero references. |
| `submissions` | 0 | The `cascade_lesson_submission_updates` catalog hit is a **comment**; the body operates entirely on `lesson_assignment_submissions`, a different table. No app call site. |

### Group A2 — service-role only: pure `REVOKE` + `ENABLE ROW LEVEL SECURITY`, no policy (1)

| table | rows | evidence |
|---|---|---|
| `propuesta_rate_limits` | **9** | `lib/propuestas-web/access-rate-limit.ts` takes an injected client; every runtime caller injects a service-role client (`pages/api/propuestas/web/[slug]/verify.ts`, and the `serviceClient` passed into `lib/propuestas-web/download-access.ts`). The dead `cleanup_propuesta_rate_limits` function is nevertheless anonymously executable over RPC today (§1); revoke its `EXECUTE` from `PUBLIC`, `anon`, and `authenticated` while preserving service-role table access. |

### Group A3 — broken attempted reader; retire the dependency before lockdown (1)

| table | rows | evidence |
|---|---|---|
| `qa_tester_time_logs` | 0 | `pages/api/qa/time-tracking.ts:78-128` attempts to use it through a cookie-backed user client, but the query cannot succeed. Production and the baseline expose `id,date,total_seconds,test_runs_count,scenarios_completed,created_at,updated_at`; the route queries nonexistent `log_date,total_active_seconds,tests_started,tests_completed,tests_passed,tests_failed`. A count-free production schema probe returned HTTP 400 / `42703 column ... log_date does not exist`. The same route already contains a `qa_test_runs` fallback. Do not switch this broken branch to service role; remove/retire it (or deliberately map the real schema) and then lock the empty table down without policies. |

### Group B — legitimately user-facing; needs RLS policies designed (6)

Each is genuinely read (or written) with a browser or user-context key. Revoking would break production.

| table | rows | call sites (client) |
|---|---|---|
| `modules` | **71** | 27 call sites, mostly browser. `pages/student/course/[courseId].tsx:168`, `pages/student/lesson/[lessonId].tsx:203,259,337`, `pages/admin/course-builder/**` (12 sites), `components/MoveLessonModal.tsx:47`, `components/LessonBreadcrumb.tsx:55` — all `useSupabaseClient()` / `lib/supabase`. Service-role: `pages/api/reports/user-details.ts:293,370`, `pages/api/assignments/eligible-classmates.ts:182`, `shareable-members.ts:131`. |
| `instructors` | **17** | Direct browser reads: `pages/admin/course-builder/new.tsx:101`, `[courseId]/edit.tsx:171`. It is also embedded through course relationships in browser/SSR queries (`lib/services/coursesService.ts`, `pages/dashboard.tsx`, `pages/mi-aprendizaje.tsx`, `pages/user/[userId].tsx`) and authenticated APIs such as `pages/api/my-courses.ts`. `pages/courses/[id].tsx` is an unauthenticated SSR surface, so published-course instructor identity is legitimately public. Service-role callers also exist. (`src/tests/fetch-instructor*.ts` are ad-hoc scripts, not runtime.) |
| `learning_paths` | **7** | 17 sites. `authenticated` via `createApiSupabaseClient`: `pages/api/learning-paths/{assign,unassign,batch-assign,search-assignees,analytics,[id]}.ts`, `[id]/enhanced-progress.ts`. Browser: `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:391`, `lib/services/learningPathsService.ts` (injected client). Service-role: `pages/api/cron/update-learning-path-summaries.ts:22`, `assignment-matrix/{content-stats,audit-log}.ts`. |
| `learning_path_courses` | **22** | 14 sites, same split: `pages/api/learning-paths/session/{start,activity}.ts`, `user/[userId].ts`, `[id]/enhanced-progress.ts`, `analytics.ts` — all `createApiSupabaseClient` (= `authenticated`). |
| `growth_community_transformation_access` | **7** | `lib/transformation/accessControl.ts:34,83,160,269` (injected client); callers pass `createPagesServerClient` — `pages/api/transformation/assessments.ts`, `pages/api/admin/transformation/{assign,revoke}-access.ts`. Browser: `pages/admin/transformation.tsx:86`. Also read by `has_transformation_access` [SECDEF], which is unaffected either way. |
| `group_assignment_discussions` | 0 | **Live code path despite zero rows.** `lib/services/groupAssignments.js:210,267` and `groupAssignmentsV2.js:1048`, both importing the browser client from `lib/supabase-wrapper`, reached from `pages/community/workspace/assignments/[id]/{groups,discussion}.tsx` and `components/assignments/GroupSubmissionModalV2.tsx`. (`groupAssignmentsCorrected.js:306,339` has no importer — dead file, but the other two are live.) |

Cross-checks that came back clean: no view in any schema depends on any of the 22 (`pg_depend`/`pg_rewrite` — so no read path hides behind a view); no raw `fetch()` to `/rest/v1/<table>` anywhere in the codebase. The function audit now distinguishes relation access from comments and JSON/column-name matches and separately records effective RPC exposure.

---

## 4. `profiles_role_backup`

- **What created it.** `supabase/migrations/00000000000000_baseline.sql:9916`, with `COMMENT ON TABLE ... IS 'Backup of legacy role data from profiles table before dropping the column. Created on migration date.'` A one-time migration artefact from when `profiles.role` was dropped in favour of `user_roles`.
- **Shape.** `id uuid, role text, created_at timestamptz` — 25 rows. A user-id → role map.
- **Does anything read it.** No. Zero references in the entire repository outside the baseline that creates it and the allowlist that exempts it. No function, no trigger, no view.
- **Should it exist.** No. It is a completed migration's scratch space that was never dropped, and it is the sharpest item in the set: unauthenticated `SELECT` yields the platform's privileged-role roster (who is `admin`, who is `consultor`), which is a targeting list; unauthenticated `INSERT`/`UPDATE`/`DELETE` are also granted, so it is writable by anyone with the browser key.

The exposure is what matters, and `REVOKE` + `ENABLE RLS` closes it completely with no policy and no application risk. **Dropping the table is a separate decision and not this round's** — `CLAUDE.md` Database Safety forbids `DROP`, and 25 rows of historical role state may have audit value. Recommend: secure it now, propose retirement separately with Brent's sign-off.

---

## 5. Proposed remedy order

These are separate change sets. Ordering statements inside one transaction does not create independent containment or rollback points.

**Step 0 — urgent RPC workstream.** Close `submit_quiz` and the five learning-path mutation RPCs before relying on table RLS. Revoke `EXECUTE` from `PUBLIC` and `anon`; derive every acting user from `auth.uid()`; validate enrollment, ownership, and management scope inside each function; set safe `search_path` values; and cover anonymous/authenticated/service behavior in pgTAP plus application tests. `start_learning_path_session` must bind `p_user_id` to the actor, and `end_learning_path_session` must prove the session belongs to the actor. The production read-only probes already prove effective anonymous execution; no write probe is needed. Revoke dead `cleanup_propuesta_rate_limits`, `has_transformation_access`, and `get_available_assignment_templates` execution from `PUBLIC`, `anon`, and `authenticated` in their respective change sets; current application code calls none of them.

The trusted quiz source already exists: `blocks.id` is the UUID passed as `p_block_id`, and `blocks.payload` contains the `QuizBlockPayload` that the browser currently sends back as `p_quiz_data`. A backward-compatible `CREATE OR REPLACE FUNCTION` can retain the current signature while ignoring caller-supplied identity/scoring truth: derive the actor from `auth.uid()`, load and validate the visible quiz block plus its lesson/course relationship, require an authorized course enrollment under an explicit status rule, score against the stored payload, and insert with the derived actor. This avoids destructive function replacement and lets the existing client keep working while its redundant parameters are deprecated.

**Step 1 — `profiles_role_backup`, independently.** `REVOKE ALL ... FROM anon, authenticated` + `ENABLE ROW LEVEL SECURITY`, no policy. Zero readers, so minimal application blast radius, and it removes the live role map from the internet. Do not describe rollback as disabling RLS or restoring public grants; both would restore the vulnerability and conflict with project rules.

**Step 2 — the six empty legacy student tables, before data arrives.** `student_answers`, `submissions`, `answers`, `assignments`, `quizzes`, `questions`. Same table treatment: revoke + enable, no policy. They are dead relations; `submit_quiz` uses `quiz_submissions`, not these tables. This is the Ley 21.719 item, and it costs nothing today precisely because the tables are empty. Do it before Fase 2 writes the first row.

**Step 3 — the remaining dead/service-only tables.** `menu_permissions`, `metadata_sync_log`, `propuesta_rate_limits`, `course_prerequisites`, `deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`. Same table treatment. Include a positive service-role test for `propuesta_rate_limits` and negative function-EXECUTE tests for its cleanup RPC. Before shipping, Brent must confirm no out-of-repo consumer for the live `menu_permissions` or `deleted_courses` rows.

**Step 4 — retire the broken `qa_tester_time_logs` branch, then lock the table down.** Prefer making the route use its existing `qa_test_runs` path explicitly; switching the broken relation to service role only guarantees that its invalid-column query continues to fail. Add an admin-route regression test, then revoke + enable RLS on the empty table with no policy.

**Step 5 — Group B, one table or coupled pair per PR, policies designed.** Six tables remain. Real work, real risk, and no reason to hold steps 1–4 behind it.

Suggested order by difficulty:
1. `instructors` — broad read surface but simple data; public published-course SSR means an authenticated-only policy is insufficient. Use the publication ruling in the matrix below; browser writes remain denied.
2. `growth_community_transformation_access` — access-control table; use a non-recursive community-membership predicate, not `has_transformation_access`, because that function reads this same table.
3. `learning_paths` + `learning_path_courses` — must land together; they are read as a pair across ~31 sites.
4. `group_assignment_discussions` — zero rows, so it can be designed carefully without pressure, but the code path is live.
5. `modules` — **last, and it needs the most care.** It already carries three policies (`modules_admin_all`, `modules_student_view`, `modules_teacher_manage`), all `TO authenticated`, all inert because RLS is off. Enabling RLS activates them as-is. The predicates authorize by admin status, course-teacher relationship, or course enrollment—not by the nine application-role names. That may cover non-teaching roles when enrolled, but it is not proven. The relationship × role × enrollment-status matrix has to be tested before the flip.

Policy requirements established by this round (design constraints, not migration SQL):

| table | minimum policy/grant contract | unresolved ruling before implementation |
|---|---|---|
| `instructors` | Public published-course SSR and authenticated course surfaces embed instructor data. Allow `SELECT` for the intended public profile columns/rows; deny browser writes. Prefer column grants for `id`, `full_name`, `photo_url`, `bio`, `specialty` rather than restoring `ALL`. Service role retains management access. | Confirm that all 17 instructors are publishable profiles. If some are internal-only, add an explicit publication flag before enabling RLS; a policy cannot infer publication from a particular parent course when the table is queried directly. |
| `growth_community_transformation_access` | Admins need all-row `SELECT` and management; ordinary users need only active access rows for communities in which they have an active scoped role. Revocation is `UPDATE`, not `DELETE`. Do **not** call `has_transformation_access` from this table's policy: that function reads the same table and would recurse. Use a direct `user_roles`/community predicate or a non-recursive helper. | `isUserAdmin()` currently treats `consultor` as admin although both route copy and comments say “solo admins.” Decide whether consultores may assign/revoke before encoding the write policy. |
| `learning_paths` | Managers need the explicitly approved organizational scope; assigned users/group members need `SELECT` only for their assigned paths. Inserts must stamp `created_by = auth.uid()`; updates/deletes must use the same manager/ownership rule. | Existing code grants `admin`, `equipo_directivo`, and `consultor` effectively global management, while rows can have null `school_id`/`generation_id`. Decide global-vs-scoped behavior and backfill usable scope before writing a narrower policy. |
| `learning_path_courses` | `SELECT` and management must inherit authorization from the parent `learning_paths` row; do not expose every path merely because a course itself is visible. All five learning-path mutation RPCs must be hardened because SECURITY DEFINER bypasses these policies. | Land with `learning_paths`; neither table can be secured correctly in isolation. |
| `group_assignment_discussions` | `SELECT` only for group members and authorized managers; `INSERT` only for such a caller, with the mapped thread owned/visible to that caller and workspace/group/assignment relationships consistent. No browser `UPDATE`/`DELETE` is currently required. | The current unique index includes `thread_id`, so concurrent callers can create multiple mappings for one assignment/group. Decide whether to make creation atomic and unique on `(assignment_id, group_id)` before enabling the path. |
| `modules` | Preserve admin management, course-teacher management, and enrolled-course learner `SELECT`; test every repository role and session revocation. Keep the invoker-rights trigger caveat below pinned by pgTAP. | `auth_is_course_student()` checks existence of any enrollment but ignores enrollment `status`/expiry. Decide whether paused, dropped, expired, or completed enrollments retain module access before activating the existing policy. |

**One trap worth recording for step 5.** `validate_assignment_instance_course` is an **invoker-rights** trigger on `assignment_instances` that `SELECT`s from `modules`; if it reads nothing it raises `'Template not found'`. Under RLS that read is filtered by the caller's policies. It is safe **today** because the only writer to `assignment_instances` is `pages/api/admin/growth-communities/[id]/index.ts:113` using `createServiceRoleClient()`, which bypasses RLS. It stops being safe the moment any non-service-role path writes that table. Either make the function `SECURITY DEFINER` in the same migration or pin the invariant with a pgTAP test.

**Ordering note.** Each change set removes its tables from the `001-rls-enabled.sql` source allowlist in the same commit as its migration and pgTAP role × table × operation coverage. The allowlist reaches `{}` when step 5 finishes. Source-test edits do not occur “inside” a migration.

---

## 6. Proven vs inferred

**Proven** (measured against production, read-only):
- 22 tables in `public` with `relrowsecurity = false`; 251 tables total.
- Direct `arwdDxt` grants to `anon` and `authenticated` on all 22, not via `PUBLIC` (`pg_class.relacl`).
- All 22 return HTTP 200/206 to an unauthenticated request bearing the browser publishable key; exact row counts as tabulated.
- The controls (`profiles`, `pasantias_leads`) behave differently, so the probe measures what it claims to.
- No view depends on any of the 22.
- `log_metadata_sync_needed` is attached to no trigger.
- `cascade_lesson_submission_updates` and `grade_quiz_feedback` do not touch `submissions` / `answers` — read from `pg_proc.prosrc`.
- Anonymous read-only GET reaches `submit_quiz`, `cleanup_propuesta_rate_limits`, `has_transformation_access`, `get_available_assignment_templates`, and all five learning-path mutation RPCs in production. Each returns its own result/validation or reaches a query/write/lock; writes and locks are rejected by the read-only transaction. A nonexistent RPC control returns `PGRST202`, HTTP 404. No write occurred.
- Production `qa_tester_time_logs` exposes the baseline column set and rejects the route's `log_date` projection with `42703`; the existing route branch cannot succeed against production's schema.
- `modules` carries exactly three policies, all `TO authenticated`, with the predicates quoted above.
- The 2026-07-08 exception's text, in the two files cited.

**Inferred** (sound, but not directly measured):
- That anon can *write* these tables. Follows from the grants and RLS-off; verifying it would require writing to production.
- That the 14 dead tables have no out-of-repo reader. The repository/database-object audit is exhaustive for visible code — `.from()`/`.rpc()` across `.ts`/`.tsx`/`.js`, function bodies, triggers, dependencies, and raw REST — but it cannot see an external script, Retool/Metabase dashboard, or manual query. **Before step 3, confirm with Brent that nothing outside this repo reads `menu_permissions` (104 rows) or `deleted_courses` (12 rows)** — those two are the plausible candidates. The empty tables carry no such risk.
- That bearer-only external clients rely on the affected API routes. The code path is real (`getApiUser()` accepts the header while `createApiSupabaseClient()` restores only cookies), but every in-repo caller found uses a same-origin cookie-bearing request. Policy integration tests must make the supported transport explicit.
- Whether the existing `modules` policies preserve every legitimate reader. They authorize relationships rather than role names, and `auth_is_course_student()` ignores enrollment status/expiry. Step 5 must test the relationship × role × enrollment-status matrix rather than assume either success or breakage.
