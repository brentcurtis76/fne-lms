# RLS · public allowlist · r1 — diagnosis

**Branch** `fix/rls-public` from `main` @ `43999499` · **Date** 2026-08-11 · **Round** r1 (DIAGNOSIS — no migration, no code change)
**Target** production project `sxlogxqzmarhqsblxmtj` (PG 15.8, 251 tables in `public`, 22 without RLS)
**Method** read-only SQL over the MCP (catalog only) + count-only REST probes (`limit=0`, `Prefer: count=exact`) + static call-site analysis. No writes, no DDL, no row reads.

---

## 1. Reachability — PROVEN reachable

`public` is exposed over PostgREST, and all 22 tables answer to the publishable key that ships in every browser.

Probe: `GET /rest/v1/<table>?select=count&limit=0` with `apikey: sb_publishable_KtPTno9UnIssvCB7x54d8g_rw67xYCM`, no `Authorization` header — i.e. an unauthenticated visitor.

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

---

## 2. The 2026-07-08 exception

Recorded in two places, both found and read:

- `supabase/tests/001-rls-enabled.sql:46-70` — the allowlist itself, inline in the pgTAP global check, commented *"ALLOWLIST legacy: 22 tablas pre-Fase-0 sin RLS, detectadas por el baseline 2026-07-08 y aprobadas por Brent como excepción documentada … el objetivo es VACIAR esta lista, no crecerla."*
- `PROJECT_STATE.md:258` (Open decisions) — owner `[Brent+DB agent · post-Fase 0]`, with the stated remedy: *"policies tabla-por-tabla en PR dedicado (**no habilitar RLS sin policies — rompería producción**); al habilitar cada una, quitarla de la allowlist."*
- `PROJECT_STATE.md:71` restates it; `docs/plan/zoom/LEDGER.md:542` re-derives the same list during Z2 and correctly notes it predates that phase.

Two claims in the exception need correcting:

1. **"Sin datos de menores"** — true today and still true. The six tables that will hold student work (`student_answers`, `submissions`, `answers`, `assignments`, `quizzes`, `questions`) are all empty. That is the whole opportunity: they are wired for exposure before the data arrives.
2. **"no habilitar RLS sin policies — rompería producción"** — **this is false for 15 of the 22.** It was a reasonable blanket assumption in the absence of a call-site audit; the audit says otherwise. Fifteen of these tables have no `anon`/`authenticated` reader at all, and for those, `REVOKE` + `ENABLE ROW LEVEL SECURITY` with zero policies breaks nothing. The premise that made this a large, risky, deferred piece of work does not hold for two-thirds of it.

No per-table reasoning was recorded in the exception — it was a blanket allowlist of whatever the 2026-07-08 baseline scan found. So there is no table-specific rationale to re-evaluate; the audit below is the first one.

---

## 3. Per-table classification

Client identification, established by reading the factories:

- `lib/api-auth.ts:16-28` — `createApiSupabaseClient()` → `createServerSupabaseClient({req,res})` = **user context, runs as `authenticated`**. Not service role, despite the name appearing in API routes.
- `lib/api-auth.ts:32-46` — `createServiceRoleClient()` → `SUPABASE_SERVICE_ROLE_KEY`. Bypasses RLS.
- `lib/supabase.ts` → `lib/supabase-wrapper.ts:11` → `createPagesBrowserClient()` = **browser, publishable key**.
- `useSupabaseClient()` (auth-helpers-react) = **browser, publishable key**.

### Group A — pure `REVOKE` + `ENABLE ROW LEVEL SECURITY`, no policy needed (15)

Nothing reaches these with the `anon` or `authenticated` key.

| table | rows | evidence |
|---|---|---|
| `answers` | 0 | Only `public.submit_quiz` **[SECURITY DEFINER]**, called via `lib/services/quizSubmissions.js:75`. SECDEF runs as `postgres` — immune to grants and RLS. The `grade_quiz_feedback` catalog hit is a **comment** (`-- Update the submission answers with feedback`); its body touches only `quiz_submissions`. |
| `assignments` | 0 | 7 SECDEF functions. **All six apparent app call sites are the storage bucket, not the table** — `supabase.storage.from('assignments')` in `components/assignments/GroupSubmissionModalV2.tsx:218,225`, `SimpleGroupSubmissionModal.tsx:59,66`, `CollaborativeSubmissionModal.tsx:158,165`. The table has zero application readers. |
| `course_prerequisites` | 0 | Zero references outside the baseline, `types/supabase.ts`, and the allowlist test. No function references it. |
| `deleted_blocks` | 0 | Same — baseline + generated types only. |
| `deleted_courses` | **12** | Same. |
| `deleted_lessons` | 0 | Same. |
| `deleted_modules` | 0 | Same. |
| `menu_permissions` | **104** | Zero references anywhere in the repo outside the baseline and the allowlist test. No function, no view. Orphaned — menu gating lives in code now. |
| `metadata_sync_log` | 0 | Sole writer is `public.log_metadata_sync_needed`, which is **attached to no trigger** (`pg_trigger` empty for it). Dead writer, dead table. |
| `profiles_role_backup` | **25** | See §4. |
| `propuesta_rate_limits` | **9** | Written through `lib/propuestas-web/access-rate-limit.ts`, which takes an injected `SupabaseClient`; every caller injects a service-role client — `pages/api/propuestas/web/[slug]/verify.ts:9` (`createServiceRoleClient`) and `lib/propuestas-web/download-access.ts:23` (parameter named `serviceClient`). `cleanup_propuesta_rate_limits` has no caller in the repo. |
| `questions` | 0 | Only `public.submit_quiz` **[SECDEF]**. |
| `quizzes` | 0 | Zero references. |
| `student_answers` | 0 | Zero references. |
| `submissions` | 0 | The `cascade_lesson_submission_updates` catalog hit is a **comment**; the body operates entirely on `lesson_assignment_submissions`, a different table. No app call site. |

### Group B — needs RLS policies designed (7)

Each is genuinely read (or written) with a browser or user-context key. Revoking would break production.

| table | rows | call sites (client) |
|---|---|---|
| `modules` | **71** | 27 call sites, mostly browser. `pages/student/course/[courseId].tsx:168`, `pages/student/lesson/[lessonId].tsx:203,259,337`, `pages/admin/course-builder/**` (12 sites), `components/MoveLessonModal.tsx:47`, `components/LessonBreadcrumb.tsx:55` — all `useSupabaseClient()` / `lib/supabase`. Service-role: `pages/api/reports/user-details.ts:293,370`, `pages/api/assignments/eligible-classmates.ts:182`, `shareable-members.ts:131`. |
| `instructors` | **17** | Browser: `pages/admin/course-builder/new.tsx:101`, `[courseId]/edit.tsx:171`. Service-role: `pages/api/admin/get-instructors.ts:22`. (`src/tests/fetch-instructor*.ts` are ad-hoc scripts, not runtime.) |
| `learning_paths` | **7** | 17 sites. `authenticated` via `createApiSupabaseClient`: `pages/api/learning-paths/{assign,unassign,batch-assign,search-assignees,analytics,[id]}.ts`, `[id]/enhanced-progress.ts`. Browser: `components/admin/assignment-matrix/hooks/useAssignmentMatrix.ts:391`, `lib/services/learningPathsService.ts` (injected client). Service-role: `pages/api/cron/update-learning-path-summaries.ts:22`, `assignment-matrix/{content-stats,audit-log}.ts`. |
| `learning_path_courses` | **22** | 14 sites, same split: `pages/api/learning-paths/session/{start,activity}.ts`, `user/[userId].ts`, `[id]/enhanced-progress.ts`, `analytics.ts` — all `createApiSupabaseClient` (= `authenticated`). |
| `growth_community_transformation_access` | **7** | `lib/transformation/accessControl.ts:34,83,160,269` (injected client); callers pass `createPagesServerClient` — `pages/api/transformation/assessments.ts`, `pages/api/admin/transformation/{assign,revoke}-access.ts`. Browser: `pages/admin/transformation.tsx:86`. Also read by `has_transformation_access` [SECDEF], which is unaffected either way. |
| `group_assignment_discussions` | 0 | **Live code path despite zero rows.** `lib/services/groupAssignments.js:210,267` and `groupAssignmentsV2.js:1048`, both importing the browser client from `lib/supabase-wrapper`, reached from `pages/community/workspace/assignments/[id]/{groups,discussion}.tsx` and `components/assignments/GroupSubmissionModalV2.tsx`. (`groupAssignmentsCorrected.js:306,339` has no importer — dead file, but the other two are live.) |
| `qa_tester_time_logs` | 0 | `pages/api/qa/time-tracking.ts:79,88` via `createApiSupabaseClient` — i.e. `authenticated`, not service role, despite being an admin-gated route. Looks internal, **is not**: it is read with the user's key. Cheapest fix is to switch the route to `createServiceRoleClient()` and then treat it as Group A. |

Cross-checks that came back clean: no view in any schema depends on any of the 22 (`pg_depend`/`pg_rewrite` — so no read path hides behind a `security_definer` view); no raw `fetch()` to `/rest/v1/<table>` anywhere in the codebase.

---

## 4. `profiles_role_backup`

- **What created it.** `supabase/migrations/00000000000000_baseline.sql:9916`, with `COMMENT ON TABLE ... IS 'Backup of legacy role data from profiles table before dropping the column. Created on migration date.'` A one-time migration artefact from when `profiles.role` was dropped in favour of `user_roles`.
- **Shape.** `id uuid, role text, created_at timestamptz` — 25 rows. A user-id → role map.
- **Does anything read it.** No. Zero references in the entire repository outside the baseline that creates it and the allowlist that exempts it. No function, no trigger, no view.
- **Should it exist.** No. It is a completed migration's scratch space that was never dropped, and it is the sharpest item in the set: unauthenticated `SELECT` yields the platform's privileged-role roster (who is `admin`, who is `consultor`), which is a targeting list; unauthenticated `INSERT`/`UPDATE`/`DELETE` are also granted, so it is writable by anyone with the browser key.

The exposure is what matters, and `REVOKE` + `ENABLE RLS` closes it completely with no policy and no application risk. **Dropping the table is a separate decision and not this round's** — `CLAUDE.md` Database Safety forbids `DROP`, and 25 rows of historical role state may have audit value. Recommend: secure it now, propose retirement separately with Brent's sign-off.

---

## 5. Proposed remedy order (r2 — one additive migration, pgTAP-covered)

**Step 1 — the sharp one, alone.** `profiles_role_backup`. `REVOKE ALL ... FROM anon, authenticated` + `ENABLE ROW LEVEL SECURITY`, no policy. Zero readers, so zero blast radius, and it removes the role map from the internet. Shipping it by itself makes the rollback trivial if anything unexpected surfaces.

**Step 2 — the empty student tables, before the data arrives.** `student_answers`, `submissions`, `answers`, `assignments`, `quizzes`, `questions`. Same treatment: revoke + enable, no policy. `submit_quiz` is SECDEF and keeps working. This is the Ley 21.719 item, and it costs nothing today precisely because the tables are empty; every week of delay raises the price. Do it before Fase 2 writes the first row.

**Step 3 — the rest of Group A.** `menu_permissions`, `metadata_sync_log`, `propuesta_rate_limits`, `course_prerequisites`, `deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`. Same mechanical treatment. Steps 1–3 are 15 tables and one pattern.

**Step 4 — `qa_tester_time_logs`, after a one-line route change.** Switch `pages/api/qa/time-tracking.ts` to `createServiceRoleClient()` (the route already gates on `checkIsAdmin`), then it joins Group A. Small code change, so it belongs in its own commit with the route's test.

**Step 5 — Group B, one table per PR, policies designed.** Real work, real risk, and no reason to hold steps 1–4 behind it.

Suggested order by difficulty:
1. `instructors` — smallest surface; likely one `SELECT TO authenticated` policy, admin-only write.
2. `growth_community_transformation_access` — access-control table; `has_transformation_access` [SECDEF] already encodes the predicate and can be reused in the policy.
3. `learning_paths` + `learning_path_courses` — must land together; they are read as a pair across ~31 sites.
4. `group_assignment_discussions` — zero rows, so it can be designed carefully without pressure, but the code path is live.
5. `modules` — **last, and it needs the most care.** It already carries three policies (`modules_admin_all`, `modules_student_view`, `modules_teacher_manage`), all `TO authenticated`, all inert because RLS is off. Enabling RLS activates them as-is. That is tempting and it is a trap: the predicates cover only `auth_is_admin()`, `auth_is_course_teacher(course_id)`, `auth_is_course_student(course_id)`. Any other role reading course structure in the browser — `consultor`, `equipo_directivo`, `lider_generacion`, `lider_comunidad` — would silently start seeing empty module lists. The 9-role matrix has to be tested against the existing predicates before the flip.

**One trap worth recording for step 5.** `validate_assignment_instance_course` is an **invoker-rights** trigger on `assignment_instances` that `SELECT`s from `modules`; if it reads nothing it raises `'Template not found'`. Under RLS that read is filtered by the caller's policies. It is safe **today** because the only writer to `assignment_instances` is `pages/api/admin/growth-communities/[id]/index.ts:113` using `createServiceRoleClient()`, which bypasses RLS. It stops being safe the moment any non-service-role path writes that table. Either make the function `SECURITY DEFINER` in the same migration or pin the invariant with a pgTAP test.

**Ordering note.** Each step removes its tables from the `001-rls-enabled.sql` allowlist in the same migration, so the pgTAP suite tracks the shrinking list and the allowlist can never silently regrow. It reaches `{}` when step 5 finishes.

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
- `modules` carries exactly three policies, all `TO authenticated`, with the predicates quoted above.
- The 2026-07-08 exception's text, in the two files cited.

**Inferred** (sound, but not directly measured):
- That anon can *write* these tables. Follows from the grants and RLS-off; verifying it would require writing to production.
- That the Group A tables have no reader. This is exhaustive static analysis — `.from()`/`.rpc()` across `.ts`/`.tsx`/`.js`, `pg_proc.prosrc`, `pg_trigger`, `pg_depend`, and raw REST — but static analysis cannot see a caller outside this repository (an external script, a Retool/Metabase dashboard, a Supabase Dashboard-authored function, a manual query). **Before step 3, confirm with Brent that nothing outside this repo reads `menu_permissions` (104 rows) or `deleted_courses` (12 rows)** — those two are the plausible candidates for an out-of-band consumer. The empty tables carry no such risk.
- That the existing `modules` policies would break non-teaching roles. The predicates plainly do not cover them, but which roles actually load course structure in the browser was not enumerated per-role. Step 5 must test it rather than reason about it.
