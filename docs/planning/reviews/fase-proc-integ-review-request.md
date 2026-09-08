# Review request — PROC-INTEG / PR 2: data integrity, tenancy and RLS

**Work ID:** PR 2 of the Procesos de Cambio remediation plan (2026-09-01; the plan itself is not in this repository)
**Branch:** `fix/proc-integ` (isolated worktree `/Users/brentcurtis/dev/wt/proc-pr2`)
**Base SHA:** `be2ce676a54ac0dce15fcb49bb6bb8191b70e209` (= `main` at branch time)
**Commits:** 8 over the base (oldest first; this document is committed separately on top of them)

| SHA | Subject |
|---|---|
| `384e77b6` | feat(db): proc integrity — unique context/instance indexes and assignee progress trigger |
| `54f0eb2f` | test(db): pgTAP matrix for proc integrity indexes, progress trigger and tenancy |
| `53931396` | fix(school): protect courses and harden transversal-context save |
| `f6239fc1` | fix(docente): let the progress-flags trigger own has_started/has_submitted |
| `1681cc68` | fix(school): consultor tenancy on docentes, schools and assign-docente |
| `88588b5c` | feat(db): replace_course_docente RPC — atomic docente swap while the evaluation is untouched |
| `04ad679a` | feat(api): replace-docente endpoint over the replace_course_docente RPC |
| `2c2224c7` | feat(ui): deliberate "Cambiar docente" flow on locked course cards |

`git diff --stat be2ce676..HEAD`: 24 files, +4165 / −248. Not pushed, no PR, not merged, not deployed. No production database, Vercel or secret-state access occurred; the only database touched is the local Docker stack.

## Objective and scope

PR 2 closes the data-integrity, tenancy and RLS items of the remediation plan. In plain terms: the database — not only the API — now refuses a second transversal context for a school and a second live assessment instance for the same course + template snapshot; a docente can be replaced on a course through one atomic, refusable operation that never transfers answers; consultores are read-only everywhere on these surfaces and see only their assigned schools; the assignee progress flags are derived by a trigger instead of user-client writes that silently did nothing; and a context save can no longer wipe out courses that still carry docentes or evaluations.

### Plan items and their status on this branch

| # | Plan item | Status |
|---|---|---|
| 1 | **DB enforcement.** Unique context per school; unique non-archived instance per (course, template snapshot). | Done — `20260907120000_proc_integrity.sql`, pgTAP 070 [I-1]. |
| 1 | One-active-docente-per-course unique index. | **DEFERRED** pending the production duplicate cleanup (Operation A). The migration carries the exact statement to ship afterwards, quoted verbatim from its header comment: `CREATE UNIQUE INDEX school_course_docente_assignments_one_active_key ON public.school_course_docente_assignments(course_structure_id) WHERE is_active;` Until then the invariant is enforced only by the API (409 `course_already_assigned` / `assignment_invariant_violation` from C-01) and by the RPC's own count check. |
| 2 | **Safe docente replacement.** Atomic RPC; blocked when the evaluation has started or holds responses; answers never transferred. | Done — `replace_course_docente` (`20260907130000`), `POST /replace-docente`, "Cambiar docente" modal, pgTAP 071. |
| 3 | **Consultor semantics — implemented.** One shared helper (`hasDirectivoPermission` + new `hasContextWriteRole`) on every surface; consultores denied the docente directory and every write (context POST, assign, revoke, replace); school listing limited to the consultor's active `consultant_assignments`. | Done — `1681cc68`, `53931396`, `04ad679a`. |
| 3 | **Consultor semantics — NOT implemented, awaiting Brent's product decision.** RLS SELECT policies granting assigned consultores read access to `school_transversal_context` / `school_course_structure` / assignment tables. | Not done on purpose. Today RLS has no consultor branch on those tables (pgTAP 070 [T-*] asserts it), so a consultor `GET /api/school/transversal-context` passes the permission gate and receives `context: null`. Note the nuance: `handleGet` fetches the course structure with the **service** client, so the same consultor response carries `courseStructure` (courses, active assignments and docente names) while `context` is empty. |
| 4 | **Progress flags via trigger.** | Done — `assessment_instance_progress_flags_trg`; user-client flag writes removed from `responses.ts` / `submit.ts`. |
| 5 | **Protect course structures with 409.** | Done — `courses_have_dependencies` refuses the whole save before any write. |
| 6 | **Reliable context saving.** | Done — newest-first previous read with error check, body validation, `23505` → 409 `context_already_exists`, every reconciliation error surfaced. |

**Out of scope (untouched, verified against the diff):** the production duplicate cleanup (Operation A) and any production data change; template publication; PR 3 / PR 4 items; the `DELETE` semantics of `assign-docente.ts` (unchanged); `autoAssignmentService.ts`; `TEACHING_ELIGIBLE_ROLES`; RLS policy changes of any kind (no policy is created, altered or dropped — pgTAP 070 documents the current policies as they are); `PROJECT_STATE.md`, CI and package scripts.

## Files created / modified, grouped by risk

**Highest — database objects, SECURITY DEFINER:**
- `supabase/migrations/20260907120000_proc_integrity.sql` (new, 123 lines) — two unique indexes (`IF NOT EXISTS`), the SECURITY DEFINER trigger function `assessment_instance_progress_flags()` and `CREATE OR REPLACE TRIGGER assessment_instance_progress_flags_trg AFTER UPDATE OF status ON assessment_instances`. Header carries the preflight queries, the recovery statement and the deferred index.
- `supabase/migrations/20260907130000_replace_course_docente.sql` (new, 228 lines) — SECURITY DEFINER `replace_course_docente(uuid, uuid) RETURNS jsonb`; `REVOKE ALL … FROM public, anon`; `GRANT EXECUTE … TO authenticated, service_role`. The only path on the branch that deletes rows (`DELETE FROM assessment_instance_assignees` for the previous docente on live instances, inside the function).

**High — RLS / behaviour proofs:**
- `supabase/tests/070-proc-integrity.sql` (new, 563 lines, `plan(131)`) — [I-1] indexes, [I-2] trigger driven through the user client, [I-3] docente cannot write assignees, [T-*] eight personas × seven tables × SELECT/INSERT/UPDATE/DELETE as the policies behave today.
- `supabase/tests/071-replace-course-docente.sql` (new, 364 lines, `plan(43)`) — [R-0] object and privileges, [R-1] 42501 personas, [R-2] every P0001 refusal, state fingerprint equality after every refusal, [R-3] directivo success path, [R-4] admin success path with reactivation of an inactive prior row.

**High — API authorization and writes:**
- `lib/permissions/directivo.ts` — adds `CONTEXT_WRITE_ROLES = ['admin', 'equipo_directivo']` and `hasContextWriteRole(client, userId)` (fails closed on read error). `hasDirectivoPermission` itself is unchanged and still admits assigned consultores.
- `pages/api/school/transversal-context/index.ts` (+433 / −rewrite of `handlePost`) — POST write gate; `validateContextBody` (exported); newest-first previous read with error check; course diff and `findBlockedCourses` **before** any write; `23505` → 409; every reconciliation error surfaced; `coursesDeleted` reported.
- `pages/api/school/transversal-context/replace-docente.ts` (new, 226 lines) — thin mapper over the RPC, called with the **user** client.
- `pages/api/school/transversal-context/assign-docente.ts` — one new block (consultor 403) between the directivo gate and body validation; everything else byte-identical to C-01.
- `pages/api/school/transversal-context/docentes.ts` — local helper that treated every consultor as an admin removed; shared helper + write-role gate.
- `pages/api/school/transversal-context/schools.ts` — rewritten on `getApiUser` / `createServiceRoleClient` (the module-level service client created at import time is gone); consultor scoping.

**Medium — docente flow (removed writes):**
- `pages/api/docente/assessments/[instanceId]/responses.ts` — the `has_started` user-client write is removed; the `in_progress` transition is now error-checked and logged (responses are already saved; the request still answers 200).
- `pages/api/docente/assessments/[instanceId]/submit.ts` — the `has_submitted` user-client write is removed.

**Medium — UI:**
- `pages/school/transversal-context/index.tsx` — `canReplaceDocente` (admin or equipo_directivo from the page's own role read); "Cambiar docente" on locked cards; replacement modal; refusal handling; dismissible success notice; locked-note copy updated.
- `pages/school/transversal-context/edit.tsx` — inline `role="alert"` for `courses_have_dependencies` (lists blocked courses with counts) and for `context_already_exists`; `coursesDeleted` in the success toast; `data-testid="context-submit"`.

**Tests (Vitest, all against the real handlers / pages):**
- New: `__tests__/api/school/replace-docente.test.ts`, `transversal-context-index.test.ts`, `transversal-context-docentes.test.ts`, `transversal-context-schools.test.ts`, `__tests__/api/docente/assessments/responses.test.ts`, `__tests__/pages/school/transversal-context-replace.test.tsx`.
- Extended: `__tests__/api/school/assign-docente.test.ts` (+3: consultor POST 403 before any read, consultor DELETE 403 revokes nothing, admin skips the write-role lookup), `__tests__/api/docente/assessments/submit.test.ts` (+1: never writes assignees; the mock now treats a second `assessment_instance_assignees` call as a regression), `__tests__/pages/school/transversal-context-assign.test.tsx` (locked-card expectations now include the "Cambiar docente" control for admin/directivo only), `__tests__/api/school/audit-logging.test.ts` (mocks `hasContextWriteRole` → true for its directivo persona).

**Docs:** this file.

## Behaviour changes and exact contracts

### `POST /api/school/transversal-context`

Order: auth → `hasDirectivoPermission(userClient, user, requestedSchoolId)` (403 without permission; 400 non-admin without school / admin without `school_id`) → **new** write gate `isAdmin || hasContextWriteRole(userClient)` → `handlePost`.

- 403 `{ success: false, code: 'context_write_forbidden', error }` — assigned consultor (or any non-admin without an active `equipo_directivo` role). GET is unaffected.
- 400 `{ error }` — `validateContextBody`: `total_students` integer ≥ 1; `grade_levels` non-empty array of non-empty unique strings; `implementation_year_2026` 1..5; `period_system` ∈ {`semestral`, `trimestral`}; `courses_per_level` a plain object whose values, for each **submitted** grade level, are integers 1..10 (missing → 1). The normalised `courses_per_level` written to the row contains **only the submitted grade levels** — keys for levels no longer selected are dropped (the base stored `body.courses_per_level || {}` verbatim).
- 500 `{ error }` — previous-context read error (the base ignored it), existing-course read error, or dependency read error (`{ success: false, error }`).
- **409 `{ success: false, code: 'courses_have_dependencies', error, blockedCourses: [{ id, course_name, grade_level, activeAssignments, instances }] }`** — the requested structure would remove a course that still has an active `school_course_docente_assignments` row or a non-archived `assessment_instances` row. Evaluated with the service client **before the context write**; nothing is written. Inactive assignments and archived instances do not block.
- **409 `{ success: false, code: 'context_already_exists', error }`** — the insert hit SQLSTATE `23505` on the new unique index (a second row raced in). No other insert error is reinterpreted.
- 200 `{ success: true, context, message, coursesGenerated, coursesDeleted, warning: string | null, errors?: string[] }` — the context is saved (update or insert via the user client, RLS applies), change history and completion status are written with the service client as before, then courses are deleted / inserted / grade-relinked with the service client. Every reconciliation error becomes an entry in `errors` and a `warning`; a `23505` on course insert is a warning, never a 500. Course rows are still hard-deleted for unblocked removals (unchanged base behaviour, now counted).

### `GET /api/school/transversal-context/docentes`

Order: auth → `hasDirectivoPermission(userClient)` (403) → **new** `isAdmin || hasContextWriteRole(userClient)` else **403 `{ code: 'directory_forbidden', error }`** → school resolution (400s unchanged) → service-client directory read (unchanged shape `{ docentes: [{ id, name, email, roles }] }`). Base behaviour removed: the file's private helper classified every `consultor` as admin, giving any consultor the directory of any school by passing `school_id`.

### `GET /api/school/transversal-context/schools`

Auth via `getApiUser` (401 through `sendAuthError`, 405 through `handleMethodNotAllowed`). Roles read with the service client:
- admin → every school (`consultant_assignments` never consulted; a user who is both admin and consultor gets the admin view);
- consultor → only schools in their `consultant_assignments` with `is_active = true`; none → `200 { schools: [] }` without querying `schools`;
- anyone else (equipo_directivo, docente, supervisor_de_red, no roles) → 403;
- role / assignment / school read error → 500. Response shape `{ schools: [{ id, name }] }` is unchanged for the two consuming pages.

### `POST /api/school/transversal-context/assign-docente`

New step between the C-01 directivo gate (step 3) and body validation (step 4): `if (!isAdmin && !(await hasContextWriteRole(userClient)))` → **403 `{ code: 'assignment_write_forbidden', error }`**. It runs before the course lookup, the active guard, the eligibility read and any write, for both POST and DELETE. Admin skips the lookup. Every other step of the C-01 contract (409 `course_already_assigned`, 409 `assignment_invariant_violation`, 422 `docente_not_eligible_for_school`, the two 500s, the A-02 preflight and reconciliation) is unchanged.

### `POST /api/school/transversal-context/replace-docente` (new)

Order: 405 → 401 → `hasDirectivoPermission(serviceClient, user.id)` with **no school argument** (403 `{ error }`) → `isAdmin || hasContextWriteRole(userClient)` (403 `{ code: 'replacement_write_forbidden', error }`) → both body fields must be strings passing `Validators.isUUID` (400 `{ code: 'invalid_request', error }`) → `userClient.rpc('replace_course_docente', { p_course_structure_id, p_new_docente_id })`.

Refusal body, always: `{ success: false, code, error, message, replacement: { previousDocenteId: null, newDocenteId: null, instancesReattached: 0 } }` plus `counts: { instancesStarted, instancesWithResponses }` on `evaluation_started` (read from the JSON `DETAIL`, falling back to the `key=value` pairs in the message).

| RPC outcome | HTTP | `code` |
|---|---|---|
| SQLSTATE `42501` (`permission_denied`) | 403 | `replacement_forbidden` |
| P0001 `course_not_found` (admin only) | 404 | `course_not_found` |
| P0001 `docente_not_eligible_for_school` | 422 | `docente_not_eligible_for_school` |
| P0001 `no_active_assignment` | 409 | `no_active_assignment` |
| P0001 `assignment_invariant_violation` | 409 | `assignment_invariant_violation` |
| P0001 `same_docente` | 409 | `same_docente` |
| P0001 `evaluation_started: instances_started=n instances_with_responses=m` | 409 | `evaluation_started` (+ `counts`) |
| any other error, unknown P0001 message, or a thrown call | 500 | `replacement_failed` |

Success: `200 { success: true, code: 'docente_replaced', message, replacement: { previousDocenteId, newDocenteId, instancesReattached } }`. Logs carry the refusal code, or `{ pgCode }` on the generic 500; no identity and no database message.

### `replace_course_docente(p_course_structure_id, p_new_docente_id)` — what the RPC does

1. Null argument → P0001 `invalid_arguments` (unreachable through the API, which validates first; the migration header omits this code from its list).
2. `SELECT school_id … FROM school_course_structure WHERE id = … FOR UPDATE` — the course row lock is taken **before** authorization. Not found → `course_not_found` for `auth_is_assessment_admin()`, otherwise `42501` (no existence leak to non-admins).
3. Authorization: `auth_is_assessment_admin() OR auth_is_school_directivo(v_school_id)` (baseline SECURITY DEFINER helpers; the directivo check is `equipo_directivo` at exactly that school). Consultores are never admitted here regardless of the API.
4. Eligibility: the new docente must hold an active role at the course's school in the hardcoded list `docente, admin, consultor, equipo_directivo, lider_generacion, lider_comunidad` (verified identical to `TEACHING_ELIGIBLE_ROLES` in `utils/roleUtils.ts` at this SHA).
5. `FOR UPDATE` on the course's active assignment rows, then count: 0 → `no_active_assignment`; >1 → `assignment_invariant_violation`; same docente → `same_docente`.
6. `FOR UPDATE` on the course's non-archived instances, then `evaluation_started` if any is not `pending` or has any `assessment_responses` row.
7. Writes, in one transaction: previous assignment `is_active = false`; `DELETE` the previous docente's assignee rows on live instances only; reactivate (`is_active = true, assigned_by = auth.uid(), assigned_at = now()`) or insert the new docente's assignment; `INSERT … ON CONFLICT (instance_id, user_id) DO UPDATE` the new docente as assignee with `can_edit = can_submit = true`, `has_started = has_submitted = false`. Returns `{ previous_docente_id, new_docente_id, instances_reattached, assignment_id }`.

It never reads, moves or deletes `assessment_responses`, never updates `assessment_instances` (so the progress trigger does not fire), and leaves archived instances and other assignees alone.

### Trigger `assessment_instance_progress_flags_trg` (AFTER UPDATE OF status)

Function runs as its owner (SECURITY DEFINER, `search_path = public`), writes only `has_started` / `has_submitted`:
- `NEW.status = 'in_progress'` and `OLD.status IS DISTINCT FROM 'in_progress'` → `has_started = true` on **every** assignee of the instance that has not started (the base API only marked the caller's row).
- `NEW.status = 'completed'` and `OLD.status <> 'completed'` → if `auth.uid()` is non-null **and** owns an assignee row on the instance, only that row gets `has_submitted = true`; **otherwise (service role, admin, or any caller without an assignee row) every assignee with `can_submit = true` is marked submitted.** `pending → completed` does not imply `has_started`. Any other transition (e.g. `completed → archived`) changes nothing.

Consequence for the docente API: `responses.ts` now only moves the instance `pending → in_progress` (RLS lets an assignee with `can_edit` do that; pgTAP 070 proves an assignee without `can_edit` updates 0 rows), and `submit.ts` only marks it `completed`. The flags follow. Before this branch both user-client flag writes silently affected 0 rows (the only write policy on `assessment_instance_assignees` is admin-only), so in production these flags were never set by docentes.

### UI

- `index.tsx`: a locked card (exactly one active assignment) shows "Cambiar docente" (`open-replace-docente-<courseId>`) only when `canReplaceDocente` (admin or equipo_directivo from the page's role read). The modal (`replace-docente-select/submit/cancel/close/current/error`) excludes the current docente from candidates, posts `{ course_structure_id, docente_id }`, and on any non-2xx stays open with `code` + message; a 409 other than `evaluation_started` also calls `fetchContext()` (stale list); success closes, refreshes and leaves `replace-docente-success` until dismissed. "Asignar" keeps its C-01 gate `!isAdminOrConsultor && activeCount === 0`.
- `edit.tsx`: `context-blocked-courses` alert (course name, docente count, instance count, remediation sentence) on `courses_have_dependencies`; `context-save-error` on `context_already_exists`; other failures still surface through the toast path.

## Test evidence

All local, in the isolated worktree. Layers kept separate: unit/integration, pgTAP, and the still-pending build / E2E / base comparison.

| Gate | Result |
|---|---|
| `npm run test:db` (`supabase db reset` + `supabase test db`, local stack) | **All tests successful. Files=27, Tests=2317** — includes `070-proc-integrity.sql` (`plan(131)`) and `071-replace-course-docente.sql` (`plan(43)`). |
| `npm test` (full Vitest) | **Test Files 400 passed; Tests 9040 passed \| 12 skipped.** |
| `npm run type-check` | clean. |
| `npm run lint` (`--max-warnings=0`) | clean. |
| `npm run lint:testid` (advisory) | baseline unchanged; every new interactive element on both pages carries a `data-testid`. |
| `npm run build` | **PENDING** — will be appended by the orchestrator in a later commit. |
| Mandatory Playwright set (`scripts/ci/e2e-mandatory.mjs`) | **PENDING** — same. |
| Literal full `CI=1 npm run e2e` | **PENDING** — same. |
| Base-versus-branch comparison of the full E2E run | **PENDING** — same. |

Per-file Vitest structure (grep-derived `it`/`it.each` blocks; `it.each` tables expand at run time, so the run totals above are the authoritative counts):

| Suite | Blocks | What it pins |
|---|---|---|
| `api/school/replace-docente.test.ts` | 15 + 2 tables | 405/401/403 ordering, consultor 403 before the RPC, admin skips the write-role read, both UUIDs validated, RPC on the **user** client, every code mapping, counts from DETAIL and from the message, unknown P0001 → 500, thrown call → 500, `mapRpcError`/`parseEvaluationStartedCounts` edge cases |
| `api/school/transversal-context-index.test.ts` | 24 + 1 table | `validateContextBody` normalisation and each rejection, newest-first read predicates, 500 on previous-read error without writing, `23505` → 409 and other insert errors → 500, dependency 409 for active assignment / live instance (nothing written), inactive/archived ignored, dependency check **before** the write, dependency-read error → 500, delete counts and surfaced delete error, course-insert `23505` → warning, generated-course count, tenancy (assigned consultor 403 on POST but GET allowed, other-school directivo 403, docente 403, admin needs `school_id`, 401) |
| `api/school/transversal-context-docentes.test.ts` | 9 | 401/405, own-school directory, other-school 403 without a read, admin `school_id`, assigned and unassigned consultor 403, docente 403, 500 on read error, empty list |
| `api/school/transversal-context-schools.test.ts` | 7 + 1 table | 401/405, admin view without `consultant_assignments`, consultor scoping, empty assignments short-circuit, admin+consultor → admin view, three other roles 403, no roles 403, 500s |
| `api/docente/assessments/responses.test.ts` | 4 | `pending → in_progress` with no assignee write, no status write when already `in_progress`, 200 + log when the transition fails, completed → 400 |
| `api/docente/assessments/submit.test.ts` | 15 (+1) | completed transition and no assignee write |
| `api/school/assign-docente.test.ts` | 44 + 5 tables (+3) | consultor 403 on POST before any read and on DELETE revoking nothing; admin skips the lookup; the C-01 matrix intact |
| `pages/school/transversal-context-replace.test.tsx` | 9 | open from locked card, current docente named and excluded, cancel, payload, `evaluation_started` inline without refresh, stale 409 refreshes, 422 no refresh, success notice + refresh, request failure keeps modal, admin sees the control and consultor never does |
| `pages/school/transversal-context-assign.test.tsx` | 15 | C-01 page matrix updated for the "Cambiar docente" control |

pgTAP coverage map: 070 [I-1] 4 assertions (both 23505s, archived duplicate allowed, null course not covered); [I-2] 14 assertions across docente-driven `in_progress`, docente-driven `completed` (only the caller's row), admin-driven `completed` (every `can_submit` row, `has_started` not implied), `completed → archived` no-op, and `can_edit`/`can_submit`/`user_id` untouched; [I-3] docente update of own assignee row affects 0 rows and flags stay pristine; [T-*] the persona × table matrix. 071: 4 object/privilege assertions, 7 authorization refusals + fingerprint equality, 11 business refusals (including `throws_like` on both `evaluation_started` messages and `invalid_arguments`) + fingerprint equality, 14 directivo-success assertions (old assignment inactive, old assignee rows gone from live instances only, the archived instance's assignee and its answer survive, the other assignee survives, fresh flags, `instances_reattached = 2`, statuses and both response rows untouched, repeat → `same_docente`, exactly one active row), and the admin path reactivating the inactive prior row (`assignment_id` equals the pre-existing row, no duplicate).

## Migrations and recovery

Both files are additive and idempotent (`CREATE UNIQUE INDEX IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE OR REPLACE TRIGGER`). **There is no `DROP`, `TRUNCATE` or destructive `ALTER` in any path**, migration or recovery.

**Preflight (must run before applying in any environment).** Both unique indexes fail closed at apply time — `CREATE UNIQUE INDEX` aborts the migration if duplicates already exist, so nothing is partially applied — which means the production duplicate inventory must be refreshed immediately before the apply, not taken from the 2026-09-01 audit. The queries, quoted from the migration header:

```sql
SELECT school_id, count(*) FROM public.school_transversal_context
 GROUP BY 1 HAVING count(*) > 1;

SELECT course_structure_id, template_snapshot_id, count(*)
  FROM public.assessment_instances
 WHERE course_structure_id IS NOT NULL AND status <> 'archived'
 GROUP BY 1, 2 HAVING count(*) > 1;
```

**Non-destructive recovery (operator actions, intentionally not in any migration):**
- Trigger: `ALTER TABLE public.assessment_instances DISABLE TRIGGER assessment_instance_progress_flags_trg;` (re-arm with `ENABLE TRIGGER`). The function and trigger definitions stay in place; the docente flow keeps working, the flags simply stop being derived.
- Trigger function or RPC body: `CREATE OR REPLACE FUNCTION` in place.
- RPC: `REVOKE EXECUTE ON FUNCTION public.replace_course_docente(uuid, uuid) FROM authenticated;` neutralises the endpoint (the API answers 403 `replacement_forbidden` via 42501). A completed replacement is reversible by calling the function again with the previous docente while the evaluation is still pending and answer-free.
- Indexes: leaving them in place is safe; they only ever refuse inserts that the API already refused.

## Reviewer hotspots (my own judgment calls — descending importance)

1. **SECURITY DEFINER RPC: authorization after the lock, and lock order.** The course row is locked `FOR UPDATE` before `auth_is_assessment_admin() OR auth_is_school_directivo()` runs, so an unauthorised caller briefly holds the course lock inside its own (rolled-back) transaction. Lock order is course row → active assignment rows → live instances; `assign-docente.ts` takes none of these locks, so a concurrent assign POST and a replacement can still interleave until the deferred one-active index lands. Check also that the eligibility read (step 4) happens before the assignment lock, and that the hardcoded role list cannot drift from `TEACHING_ELIGIBLE_ROLES` unnoticed (they are identical today; nothing enforces it).
2. **Trigger `auth.uid()` fallback.** When the caller has no assignee row — service role, admin, or a directivo path — **every** `can_submit` assignee is marked `has_submitted`. This is a deliberate choice so admin/service completions leave consistent flags, but it means a multi-assignee instance completed by an admin marks docentes who never submitted. Also: the `in_progress` branch uses `IS DISTINCT FROM` while the `completed` branch uses `<>`; with a NULL `OLD.status` the second would not fire (`status` is non-null in practice, but the asymmetry is unexplained).
3. **Context POST: dependency check before the write, and the `courses_per_level` key-dropping.** The 409 is computed from the service-client course diff and refuses the whole save before the context row is touched — but the context write, the history write and the course reconciliation are still separate statements (no transaction), so a failure after the context write still leaves a saved context with `warning`/`errors`. The normalised `courses_per_level` keeps only the submitted grade levels: deselecting a level now removes its key from the stored JSON, which is also what makes its courses candidates for deletion. Confirm no consumer relies on the old verbatim object.
4. **Role lookups with the user client — and one with the service client.** `hasContextWriteRole` always runs on the user client (RLS lets a user read only their own `user_roles`, which is exactly what it needs). `replace-docente.ts`, unlike `index.ts` / `docentes.ts` / `assign-docente.ts`, passes the **service** client to `hasDirectivoPermission` and no school id, so that gate only asks "is this user any directivo/admin/assigned consultor"; the school-specific decision is delegated entirely to the RPC's own `auth_is_school_directivo(v_school_id)`. Confirm that delegation is acceptable rather than checking the course's school in the route as `assign-docente.ts` does.
5. **Admin may replace but not assign — in the UI only.** `canReplaceDocente` is true for admin, so an admin viewing a school sees "Cambiar docente" on locked cards, while "Asignar" keeps the C-01 gate `!isAdminOrConsultor` and never renders for an admin. The APIs are symmetric (admin passes both write gates). Decide whether the page should be consistent either way.
6. **Consultor GET carries the course structure.** Because `handleGet` reads courses and docente names with the service client, an assigned consultor already sees `courseStructure` (with docente names) while `context` is `null` under RLS. The pending RLS-read decision should be taken knowing that half of the surface is already visible to them via the API.
7. **`courses_have_dependencies` only guards removals.** Courses that survive the save are never checked; reducing `courses_per_level` from 3 to 2 removes course "C" by key (`grade_level::course_name`), which is correct, but renaming conventions (`COURSE_LETTERS`) would silently turn every course into a removal candidate. Nothing on this branch changes the naming; flagging the coupling.

## Known limitations and deferred items

- **No Playwright journey** yet for the replacement flow or the dependency block; the seeded E2E tenant lacks the context → course → template → instance fixture chain. Vitest page tests plus pgTAP are the evidence. Build, the mandatory Playwright set, the literal full E2E and the base comparison are pending (see Test evidence) and will be appended by the orchestrator.
- **Consultor RLS read decision** (plan item 3, second half) is open for Brent: today consultores get `context: null` from GET; adding SELECT policies for assigned consultores on `school_transversal_context`, `school_course_structure` and `school_course_docente_assignments` is a policy change deliberately not made here.
- **Deferred one-active-docente index** (`school_course_docente_assignments_one_active_key`, statement in the migration header). Until it ships, the C-01 application-check race stands: two concurrent `assign-docente` POSTs for different docentes can both read zero active rows and both insert; the RPC's `FOR UPDATE` only serialises replacements against each other, not against `assign-docente`.
- **Operation A (production duplicate cleanup) not performed.** No production data was read or changed. The preflight queries must be run against production before this branch's migrations are applied; if either returns rows, the apply aborts cleanly.
- **Manual DELETE → POST escape path (from C-01) is still open.** `DELETE /assign-docente` is unchanged: an admin or directivo can still unassign and then assign a different docente through two requests, attaching the new docente to a preserved instance with its responses. The UI no longer offers it; the controlled path is the RPC. Closing the API path is a PR 3/4 decision.
- The migration header of `20260907130000` lists the refusal codes but omits `invalid_arguments` (raised and tested); the API maps it to a generic 500, which the UUID validation makes unreachable.
- Unrelated to this branch, observed while reading: the progress flags of instances completed before this migration were never set by docentes (the user-client writes no-op'd); no backfill is included.

## Orchestrator gate matrix on the PR 2 head `4616d04e` (2026-09-07, local CI-parity, loopback 127.0.0.1:54321/54322)

Guards (`guard:actions`, `guard:migrations`, `guard:browser`, `guard:secrets` on the Git index) OK; `git diff --check` clean; `type-check` clean; `lint` zero warnings; `lint:testid` advisory 2620 problems repo-wide (44 errors, 2576 warnings — pre-existing baseline 2621 on `be2ce676`); `npm test` **400 files, 9040 passed / 12 skipped / 0 failed**; from-scratch `supabase db reset` (43 migrations) then `supabase test db` **Files=27, Tests=2317, PASS**; `npm run build` OK (149 routes) + price-leak guard OK; synthetic seed; mandatory Playwright manifest **192 passed / 0 failed / 0 flaky / 0 skipped** with `e2e-mandatory.mjs --check` OK.

Literal `CI=1 npm run e2e`: **237 passed / 60 failed / 1 flaky / 27 skipped, exit 1** (JSON SHA-256 `eff2bbead2313397fcd39b8fef0cd1cad647a63e1ad963f73846131e3eba52cd`). Exact base `be2ce676` (post-PR #84 `main`) from its own fresh reset + reseed: **238 / 60 / 0 / 27, exit 1** (SHA-256 `1b861e62afb3ef1050e3e1612a3a445fbdca3aac31f11234179556d68b8633fa`). Failing `file:line:column` identifiers: shared **60**, candidate-only **0**, base-only **0** — the same pre-existing set (16 `qa/qa-system`, 13 `qa/auth-redirects`, 29 `proposal-*`, 2 `reservation`). The single flaky test (`e2e/pasantias-form.spec.ts:127`, keyboard completion) passed on retry and is outside every PR 2 surface. **The literal gate remains RED; no exception is claimed or extended.**
