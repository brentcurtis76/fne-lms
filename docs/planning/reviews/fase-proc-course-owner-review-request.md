# Review request — PROC-COURSE-OWNER-01 / C-01: application-layer containment of multiple active docentes per course

**Work ID:** C-01 (Procesos de Cambio remediation — course ownership containment)
**Branch:** `fix/course-owner` (isolated worktree `/Users/brentcurtis/dev/wt/course-owner`, non-iCloud)
**Base SHA:** `804794df02b4165f58d89fe77649e1d71423d7dc` (`origin/main`, verified equal to the PM-approved SHA by a fresh `git ls-remote` before the worktree was created)
**Code head SHA:** `5f0e9b1b4e39e88565a28f873bca5f1c6bf01a76` (production code unchanged since) · **Current branch head:** recorded in the completion report, because this document cannot embed the SHA of its own latest modifying commit · **Commits:** 4 — implementation + tests `5f0e9b1b`; this review request `0557a7c1`; the evidence/documentation correction `a747de74`; then the final assurance pass (adversarial tests and this document only; no production code)
**Not pushed, no PR, not merged, not deployed.** No production database, Supabase Management API, Vercel, provider, or secret-state access occurred, and **no GitHub mutation** occurred (no push, no remote branch, no PR, no comment, no merge, no settings change). **Read-only GitHub access did occur** — remote ref and open-PR reads — and is itemised under *Access confirmation*. The only Supabase stack touched is the ephemeral local Docker stack (`supabase/config.toml` project id, `127.0.0.1`), reset from migrations and seeded with synthetic fixtures.

## Objective and plain-English outcome

Stop a course from acquiring a second active docente through the application, and stop arbitrary users from being assigned as docentes, without deciding ownership, cleaning data, or changing the database.

After this unit:

- A POST cannot add a different active docente while the course already has one (HTTP 409 `course_already_assigned`).
- A course that already has more than one active docente fails closed (HTTP 409 `assignment_invariant_violation`); nothing is chosen, deactivated, or cleaned up.
- Malformed, unknown, inactive, excluded-role, and other-school-only targets cannot be assigned (HTTP 422 `docente_not_eligible_for_school`); both new reads fail closed with generic HTTP 500s.
- A retry for the course's one active docente, when still eligible, preserves the merged A-02 preflight and idempotent assessment repair.
- The page offers "Asignar" only while a course has zero active docentes, renders a locked note for exactly one, an integrity warning for more than one, and no longer exposes the unassign control that formed an ordinary unassign-then-reassign replacement path.
- This unit does **not** claim database-level concurrency enforcement or replacement safety (see limitations).

## Scope

**In:** the two production files and two test files listed below, plus this document.

**Out (untouched, verified against the diff):** `autoAssignmentService.ts`; the DELETE endpoint's semantics; `docentes.ts` permission behaviour; `hasDirectivoPermission` and consultor semantics; `TEACHING_ELIGIBLE_ROLES`; migrations, constraints, indexes, triggers, RPCs, RLS, grants, pgTAP; production data or duplicate cleanup; assessment responses, scoring, progress, autosave, results, navigation, template publication; `PROJECT_STATE.md`, CI, package scripts, other planning documents, other tests. No replacement flow, no "Cambiar docente", no assessment/history transfer, no concurrency enforcement, no supporting production module.

## Files changed (grouped by risk)

**Higher risk (authorization ordering, refusal semantics, writes):**
- `pages/api/school/transversal-context/assign-docente.ts` — `handlePost` gains the course-wide active guard and the target-eligibility read between the existing authorization block and the A-02 preflight; `handlePost` now receives the service client. The authorization block (method → auth → actor permission → body validation → user-scoped course lookup → non-admin exact-school check) and `handleDelete` are **byte-identical** to the base (verified with `cmp`/`diff` during the work).

**Medium risk (UI contract):**
- `pages/school/transversal-context/index.tsx` — per-course classification by active-assignment count; "Asignar" only at zero; locked note (`course-assignment-locked-<courseId>`); integrity warning (`course-assignment-integrity-warning-<courseId>`); the page-level "Desasignar" control and its now-unreachable handler removed; a 409 refreshes the course list even when `assignment.mutated` is false. New non-interactive test ids: `course-card-<courseId>`, `course-active-assignment-<assignmentId>`.

**Tests (both import/render the real production code):**
- `__tests__/api/school/assign-docente.test.ts` — rewritten around a recording, predicate-evaluating Supabase table mock (46 tests in the implementation pass; **60** after the final assurance pass added 14 adversarial edge tests and gave the mock PostgreSQL-faithful uuid equality, read overrides, a between-reads state hook, and recorded outcomes).
- `__tests__/pages/school/transversal-context-assign.test.tsx` — extended (12 tests in the implementation pass; **21** after the final assurance pass added 9 explicit viewer-role tests).

**Docs:** this file.

## Exact API contract — `POST /api/school/transversal-context/assign-docente`

Locked order, unchanged from the base up to step 6:

1. method check → 2. authentication → 3. actor permission (`hasDirectivoPermission`) → 4. required-body validation → 5. user-scoped course lookup → 6. non-admin exact-school authorization

Then, in `handlePost`:

7. **Course-wide active guard** — user-scoped client, `school_course_docente_assignments`, `select('id, docente_id')`, `eq('course_structure_id', <course>)`, `eq('is_active', true)`, `limit(2)`, array semantics (never single/maybeSingle):
   - read error or non-array → **500 `assignment_state_unavailable`**
   - more than one row → **409 `assignment_invariant_violation`**
   - exactly one row for another docente → **409 `course_already_assigned`**
   - exactly one row for the requested docente → case C (retain)
   - zero rows → case D (reactivate same-pair inactive row or insert)
   Every refusal here happens **before** any target inspection, preflight, mutation, deactivation, cleanup, or automatic-assignment call, and discloses no docente identity.
8. **Target eligibility** (cases C and D only) — a non-string or non-UUID-shaped `docente_id` is ineligible without any database predicate (reuses `Validators.isUUID` from `lib/types/api-auth.types.ts`). Otherwise the service-role client reads `user_roles` with exactly `select('user_id')`, `eq('user_id', <target>)`, `eq('school_id', <course school>)`, `eq('is_active', true)`, `in('role_type', TEACHING_ELIGIBLE_ROLES)` (imported from `utils/roleUtils.ts`, not duplicated), `limit(1)`, array semantics:
   - read error or non-array → **500 `docente_eligibility_unavailable`**
   - no row → **422 `docente_not_eligible_for_school`**
9. A-02 preflight (`preflightAutoAssignment`) → 422 with the unchanged A-02 body when not ok.
10. Assignment: case C retains the active row with no read or write of it; case D reads the same-pair row (`maybeSingle`) and reactivates it if inactive, inserts if absent, or retains without writing if it became active meanwhile (same docente only). Inactive rows of other docentes never block.
11. A-02 reconciliation (`triggerAutoAssignment`) with the unchanged 200/207 semantics.

Refusal body for every new decision (409/422/500), and nothing else:

```json
{
  "success": false,
  "code": "<stable code>",
  "error": "<safe es-CL message>",
  "message": "<same safe es-CL message>",
  "assignment": { "created": false, "reactivated": false, "alreadyActive": false, "mutated": false }
}
```

Messages (es-CL): `assignment_invariant_violation` — "Este curso registra más de una asignación activa de docente, lo que no es válido. Se requiere una resolución administrativa controlada antes de poder asignar o cambiar el docente de este curso."; `course_already_assigned` — "Este curso ya tiene un docente activo asignado. El reemplazo de docente requiere un proceso controlado; no es posible asignar otro docente desde aquí."; `docente_not_eligible_for_school` — "La persona seleccionada no está habilitada como docente activo en esta escuela."; the two 500s — generic "No se pudo verificar …" texts. No current/requested docente id, name, email, role, database message, or directory data is returned. New log lines carry the refusal code only, or a Postgres error **code** (never a message) for the two unavailable states.

`DELETE` is unchanged in code and behaviour.

## Exact UI contract — `pages/school/transversal-context/index.tsx`

Per course, from the active assignments the context API already returns:

| Active | "Asignar" | "Desasignar" | Displayed | Note |
|---|---|---|---|---|
| 0 | rendered for directivos (`open-assign-docente-<courseId>`) | none | — | none |
| 1 | not rendered | none | the assignment | `course-assignment-locked-<courseId>`: changing the docente requires a controlled administrative resolution |
| >1 | not rendered | none | **every** active assignment, identically, in API order | `course-assignment-integrity-warning-<courseId>` (`role="alert"`): invalid state, seek controlled administrative resolution |

The locked note and the integrity warning render for every viewer (directivo and read-only admin/consultor); the "Asignar" control keeps its existing directivo-only gate. On any POST answering HTTP 409 the modal stays open with the message in `assign-docente-error`, the course list is refreshed even though `assignment.mutated` is false, and no replacement flow is opened, simulated, or labelled. There is no "Cambiar docente". The `openAssignModal` docente filter (excluding already-active docentes) is left as it was.

## Validation

All commands ran unmodified in the isolated worktree (`~/dev/wt/course-owner`, `npm ci` from the lockfile, 1375 packages). No `.env.local`, credential, build output, `node_modules`, or test result was copied from the primary checkout; the worktree's `.env.local` was generated from `supabase status -o json` of the local stack exactly as the CI recipe does (local keys only, never printed).

**Focused (first):** `npx vitest run __tests__/api/school/assign-docente.test.ts __tests__/pages/school/transversal-context-assign.test.tsx` → implementation pass **2 files, 58 tests passed** (46 API + 12 page); final assurance pass **2 files, 81 tests passed** (60 API + 21 page).

| Gate | Result |
|---|---|
| `git diff --check` | exit 0, clean |
| `npm run guard:actions` | exit 0 — 17 uses across 1 workflow file OK |
| `npm run guard:migrations` | exit 0 — no RLS disable; 40 migration files, no DROP/TRUNCATE/destructive ALTER |
| `npm run guard:browser` | exit 0 — 1142 files, 686 modules from 509 page entrypoints, no boundary violation |
| `npm run guard:secrets` | exit 0 with the four files staged — 2463 tracked paths, 0 findings; re-run after the final commit: with this review request also staged (final tree): exit 0 — OK — 2464 tracked path(s), authoritative content scanned from the Git index only, 0 findings; the post-commit re-run is reported in the completion report |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings=0`) |
| `npm run lint:testid` (advisory) | **exit 1 — 2623 problems (44 errors, 2579 warnings) repo-wide; red on the baseline, not green.** Touched UI file measured with the same config (`-f json`): base `804794df` (via `git show … \| eslint --stdin`) **0 errors / 3 warnings** (lines 502 select, 568 button, 983 button); branch **0 errors / 2 warnings** (lines 481 select, 547 button — the pre-existing admin school selector and "Volver" button, untouched by this unit). The removed line-983 finding was the "Desasignar" button. No new findings; the only other UI-adjacent files changed are tests, which this config does not scan. The PROC-CONTAIN-01 review recorded 2624 on its branch, consistent with 2623 = 2624 − 1. |
| `npm test` (full Vitest) | exit 0 — **374 files passed (374); 8598 tests passed, 11 skipped (8609)**, 233.7 s, on the final tree in the isolated worktree (the merged A-02 baseline was 8566 passed / 8577; the +32 are exactly the 25 API and 7 page tests added here) |
| `npm run build` | exit 0 — ✓ Compiled successfully, ✓ Generating static pages (149/149), local-stack env inlined; CI's post-build `node scripts/check-price-leak.mjs` also OK (262 files under `.next/static`, no commercial data) |
| `npm run test:db` | `supabase db reset` on the **local** Docker stack (30 s, all 40 migrations reapplied from scratch, exit 0) then `supabase test db`: **Files=24, Tests=1931, Result: PASS**, exit 0. No pgTAP file covers the five C-01 tables (none existed at the base; adding any was out of scope) |
| E2E gate | CI-equivalent gate on the local stack: `supabase db reset` (above) → `.env.local` from `supabase status -o json` (CI recipe) → `npm run build` (above) → `node scripts/ci/seed-e2e.mjs` (synthetic fixtures, local stack only; exit 0) → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` (run under bash so the spec list word-splits): **192 passed (2.1 min), 0 failed, 0 flaky, 0 skipped** (`test-results/e2e-results.json`: expected=192 unexpected=0 flaky=0 skipped=0) → `node scripts/ci/e2e-mandatory.mjs --check`: **OK — 13 mandatory spec(s) ran with no skips**, exit 0. The server log shows the pre-existing `[tractor-signups grant] refresh_user_roles_cache failed` lines from an unrelated spec; every test passed. **Regression evidence only** — see below. Literal `CI=1 npm run e2e` (all 32 spec files under `tests/`): **exit 1 — 238 passed, 60 failed, 27 skipped, 0 flaky (53.7 min). A red gate on this branch; not green.** The 13 mandatory specs passed inside that run (192 expected, 0 unexpected). In the correction pass the same command was run on the **exact base** `804794df` in a detached worktree with the same stack recipe: **exit 1 — 238 passed, 60 failed, 27 skipped, 0 flaky (54.1 min)** — the **same 60 test titles**, the **same 10 files with the same per-file counts**, and the **same failure-category counts** (see *Base-versus-branch full E2E comparison*). Corrected classification: **pre-existing on the base and unchanged by C-01 — proven by reproduction, not assumed** — while remaining a failing gate whose exception **only Brent may authorize**. None of the failing spec files references `transversal-context` or `assign-docente`; the only tests in the run that touch `/api/school/transversal-context/*` are three passing auth-guard checks on the sibling `questions` and `custom-responses` endpoints. |

**Evidence layers, kept separate.** Focused tests, full local gates, GitHub CI, deployment, production-data state, and real-user behaviour are distinct. Everything above is local evidence. **No GitHub CI evidence exists** (the branch was not pushed — pushing was not authorized). **No deployment, production, or real-user evidence exists.** The E2E run is **regression evidence only**: no existing spec drives Contexto Transversal or the assign-docente endpoint, so it does not prove C-01's second-assignment refusal; that journey belongs to a later provisioning/journey unit (see Deferred).

**Gate status of `npm run e2e`.** The dispatch lists `npm run e2e` among the required gates. On this branch the literal command `CI=1 npm run e2e` **exited 1** (60 failed) and is therefore a **red gate**, whatever the cause of the failures; the mandatory-spec run that CI executes is green, but it is a different command. The base-versus-branch comparison below is context for the reviewer, not a pass. **Only Brent may authorize an exception to that gate.** This document does not grant one, and the executor cannot.

## Test → requirement map (API, `__tests__/api/school/assign-docente.test.ts`)

| Requirement | Test(s) |
|---|---|
| **(final pass)** upper-case spelling of the active docente is the SAME docente: no 409, eligibility runs with the value as given and matches the canonical lower-case row under PostgreSQL uuid equality (`pgEquals` in the mock), A-02 preflight + reconciliation run, no same-pair lookup / insert / update / delete, no identity in either spelling | "classifies an upper-case spelling of the active docente as the SAME docente …" + control "an upper-case spelling of a DIFFERENT docente is still refused by the guard" |
| **(final pass)** three active docentes → 409 `assignment_invariant_violation`; the guard still reads `limit(2)` and the handler received exactly two rows; no row chosen, cleaned up or disclosed; nothing follows | "fails closed on THREE active docentes …" |
| **(final pass)** active-guard read resolves to null / a single object / a string → 500 `assignment_state_unavailable`, generic body, nothing follows (the override is proven to have reached the handler via the recorded outcome) | `it.each` "fails closed with 500 assignment_state_unavailable when the active-guard read resolves to %s" (3 shapes) |
| **(final pass)** role read resolves to null / a single object → 500 `docente_eligibility_unavailable`, generic body, no preflight / write / trigger | `it.each` "fails closed with 500 docente_eligibility_unavailable when the role read resolves to %s" (2 shapes) |
| **(final pass)** same-pair row becomes active between the guard and the pair lookup → retained with no insert / update / delete, reconciliation continues, `alreadyActive=true`, `mutated=false`; the mock's `afterRead` hook flips the live fixture after the guard, and the recorded outcomes prove the guard saw `[]` while the lookup saw the active row | "retains a same-pair row that becomes active between the guard and the pair lookup …" + control "the same fixture WITHOUT the between-reads activation reactivates the row" |
| **(final pass)** non-string malformed target (object / number / array / boolean) behind an active different docente → 409 `course_already_assigned` first; no UUID validation reached, no `user_roles` read, neither identity nor the malformed value echoed | `it.each` "a non-string malformed target (%s) behind an active different docente …" (4 shapes) |
| different active docente → 409 `course_already_assigned`, nothing after | "refuses a different active docente with 409 course_already_assigned …" |
| multiple active → 409 `assignment_invariant_violation`, no choice/cleanup | "fails closed on more than one active docente …", "fails closed even when the REQUESTED docente is one of several active rows" |
| no target read / preflight / write / trigger after either conflict | `expectNothingAfterGuard` in every guard test |
| no sentinel current-docente id / name / email / role in any refusal | `expectNoIdentityLeak` (sentinel profile row is mounted on the service client and never read) |
| same active eligible → A-02 repair | "does not return early for a same active eligible docente …" |
| same active eligible fully reconciled → idempotent 200 | "a fully reconciled retry is an idempotent success …" |
| same active but no longer eligible → 422, no preflight/repair | "a same active docente that is no longer eligible is refused with 422 …" |
| eligible active target at the exact school → proceeds, exact predicates, `user_id` only, `limit(1)`, no single | "proceeds for an eligible active target at the exact course school …" |
| role only at another school / no school / inactive row / excluded roles only / unknown → 422 | `it.each` "refuses %s with 422 docente_not_eligible_for_school …" (5 cases; the mock evaluates the predicates against fixture rows, so each refusal is a real predicate mismatch) |
| malformed target → 422 without reaching the role query | `it.each` "refuses the malformed target %j …" (5 shapes: non-UUID string, truncated, number, object, un-hyphenated hex) |
| multiple eligible rows at the correct school → proceeds | "proceeds when the target holds several eligible roles …" |
| eligibility read failure → generic 500 | "fails closed with a generic 500 docente_eligibility_unavailable …" |
| active-assignment read failure → generic 500 | "fails closed with a generic 500 assignment_state_unavailable …" |
| inactive same-pair row reactivates only with zero active | "reactivates an inactive same-pair assignment when the course has no active docente", "does not reactivate an inactive same-pair row while another docente is active" |
| inactive other-docente rows do not block | "inactive rows of other docentes do not block a valid new assignment" |
| 401 / 403 / 404 / cross-school 403 before course-wide or target inspection | the five authorization tests assert no assignments-table access and no `user_roles` read |
| order pinned | "pins the order: course authorization → active guard → target eligibility → preflight → same-pair lookup → insert → trigger" (`invocationCallOrder`) |
| guard predicates exact | "reads the active assignments with the exact predicates, id + docente_id only, limit(2) …" |
| A-02 422/200/207 | the ported A-02 tests (preflight 422 ×3, reactivate, repair, idempotent, 207 ×4, warnings, insert failure 500) plus "a same active docente is retained without any write even if the preflight now blocks" |
| DELETE unchanged | the three DELETE tests, now also asserting no guard and no `user_roles` read and the exact soft-delete update predicates |

## Test → requirement map (page, `__tests__/pages/school/transversal-context-assign.test.tsx`)

| Requirement | Test |
|---|---|
| **(final pass)** explicit viewer-role coverage — directivo: zero active offers "Asignar" (the only button in the card); one active: locked note, assignment displayed, no assignment / unassignment / replacement control; multiple active: integrity alert, every row displayed identically and in order, no resolution control | `describe.each` "viewer role: directivo (C-01)" (3 tests) |
| **(final pass)** read-only admin and read-only consultor (reached through the admin/consultor branch with `school_id` in the query): zero active offers no assign control; one active: locked note visible, no controls; multiple active: integrity warning visible, all rows displayed, no controls; neither role is given an assignment or replacement action | `describe.each` "viewer role: read-only admin (C-01)" and "viewer role: read-only consultor (C-01)" (3 tests each) |
| zero active → "Asignar" present | "offers "Asignar" only for a course with zero active assignments" |
| one active → "Asignar" absent, "Desasignar" absent, locked note | "exactly one active assignment: …" |
| multiple → integrity warning, all controls absent | "more than one active assignment: …" (also asserts zero buttons inside the course card) |
| multiple display does not select or imply a correct docente | "the multiple-active display does not select or imply a correct docente" (warning names neither docente; rows identical; no preference word in the card) |
| stale 409 keeps the modal message visible | both "stale 409" tests |
| stale 409 refreshes despite `assignment.mutated === false` | both "stale 409" tests (the mocked server flips the course to locked / conflicted when the POST is answered, and the refreshed page shows it) |
| no replacement workflow | `expectNoReplacementFlow` in every C-01 test |
| existing A-02 422, 207, warning, success, network-failure | retained; the 422 test additionally pins that a 422 does **not** refresh |

Fixtures are synthetic: UUID-shaped ids, `.test` e-mails, invented names.

## Reviewer hotspots (my own judgment calls — descending importance)

1. **Application-check race (known, by design).** Two concurrent POSTs for different docentes can both read zero active rows and both insert; the schema only has the same-pair unique constraint `(course_structure_id, docente_id)`. No lock, transaction, RPC, trigger, or compensating cleanup was added. This closes only with D-01 (partial unique constraint on active rows) after the production duplicate audit and cleanup, with constraint-aware 23505 handling then — none added or mapped here.
2. **Guard-then-lookup window in case D.** After a zero-active guard, the same-pair read may find the row already active (same docente, concurrent retry): the handler retains without writing and continues to reconciliation. A *different* docente activated in that window is the race in (1).
3. **Case-insensitive `docente_id` comparison in the guard.** The active row's `docente_id` and the request value are compared lower-cased so an upper-case UUID for the same person is classified "same" rather than "other". A non-string body value classifies as "other" when one row is active (409) or reaches the UUID check when none is (422). Confirm this is the intended fail-closed behaviour.
4. **`Validators.isUUID` reuse.** The UUID-shape check reuses the existing helper in `lib/types/api-auth.types.ts` (RFC-4122 shape, no version restriction) rather than a new module. Non-string bodies are rejected before it is called.
5. **Eligibility uses the service-role client.** `user_roles` RLS only lets a user read their own rows, so the target read must be service-role (as `docentes.ts` already does). It runs strictly after course/school authorization and after the guard; the ordering test pins this. Check nothing before step 8 can reach it.
6. **Notes render for every viewer.** The locked note and integrity warning are shown to read-only admin/consultor viewers too (they had no controls before either). "Asignar" keeps its directivo-only gate. The integrity warning intentionally names no docente and marks no row.
7. **Refusal response shape is minimal on purpose.** The five 409/422/500 decisions omit `assessments`, `warnings`, `grade`, and the legacy `autoAssignment` block; the page reads `error`/`message` and `assignment.mutated` only, so nothing breaks, but any other consumer expecting the A-02 shape on every non-2xx would need to accept this one.
8. **Logging.** New refusal logs carry the code only; the two unavailable states log `{ pgCode }`. The pre-existing 500 paths (same-pair read/write failures) keep their original `console.error` of the error object — unchanged base behaviour, not new logging.
9. **DELETE test tightening.** The three DELETE tests now also assert the absence of the guard and eligibility reads and the exact update predicates; production DELETE code is byte-identical.
10. **Mock realism.** The API mocks evaluate `eq`/`in`/`limit`/`maybeSingle` in memory. They do not model `order`, `is`, or projection, none of which this handler uses on the two new reads; the A-02 service is still mocked at the module boundary as before.

## Known limitations and stop-condition findings

- **Application-check race** — see hotspot 1. Stated plainly: until D-01 lands, two concurrent different-docente requests can race past this check.
- **Manual DELETE → POST escape path.** An authorized caller can still invoke `DELETE` (soft-deletes the pair and revokes assignee rows) and then `POST` a different docente. **C-01 does not make that two-request sequence replacement-safe**: the assessment instance is preserved and the new docente is attached to it by the A-02 reconciliation, with any existing responses. The ordinary UI no longer offers this path; the API still permits it. **C-02 must govern replacement, response/history checks, and atomicity. No claim of complete replacement safety is made.**
- **Consultor semantics untouched.** `hasDirectivoPermission` still admits consultores; nothing here resolves H-02.
- **No pgTAP** for the five tables (none existed at the base; adding any was out of scope).
- **E2E is regression evidence only** — no spec exercises this page or endpoint.
- No stop condition triggered: live main was still at the approved SHA at lock time and throughout the implementation (it moved afterwards — see the post-completion finding); branch and worktree path were free; the primary checkout (`fix/proc-contain` at `d23791b2`, its seven untracked planning/review docs and `outputs/`) was never modified; no open PR overlaps (read-only `gh pr list`: the four open PRs are unrelated — hours-report, A9 release verification, QA audit quick wins, RBAC phase 2); no migration/RPC/RLS/DB-agent change, production data, real identity, DELETE-semantics change, consultor ruling, service change, or supporting module became necessary.

## Deferred (explicitly not in this unit)

- **C-02** — safe, atomic docente replacement with response/history checks; "Cambiar docente".
- **D-01** — one-active-per-course partial unique constraint (after production duplicate audit and cleanup) with constraint-aware 23505 handling.
- **D-02** — the remaining data-integrity constraints (one context row per school; one instance per course + snapshot).
- **H-02** — consultor semantics.
- **Full Playwright journey** — directivo assigns one docente → second assignment refused → docente completes the evaluation; needs the context/course/template fixture chain the seeded E2E environment does not have yet.
- Production duplicate audit/cleanup and any provisioning.

## Base-versus-branch full E2E comparison (evidence correction pass, 2026-09-02)

**Why this section exists.** The first version of this document classified the 60 `npm run e2e` failures as "the known pre-existing state" of the legacy suites on the strength of memory and failure signatures, and said so was *not proven by a base run*. Brent directed an evidence-only correction: reproduce the run on the exact base and compare. This section records that comparison; no production code, test, migration, CI, or package file changed, and `fix/course-owner` was not rebased.

**Method.** Detached, non-iCloud worktree `/Users/brentcurtis/dev/wt/course-owner-base` at exactly `804794df02b4165f58d89fe77649e1d71423d7dc`; `npm ci` (1375 packages from the lockfile); `.env.local` generated from `supabase status -o json` with the CI recipe (local keys only, never printed); `supabase db reset` on the same local Docker stack from the base migrations (exit 0); `npm run build` of the base code (exit 0, 149/149 pages); `node scripts/ci/seed-e2e.mjs` (exit 0); then `CI=1 npm run e2e` — the identical command, settings (production server, 1 worker, 2 retries, JSON reporter) and Playwright 1.58.0 / cached Chromium used for the branch run. Inputs verified byte-identical between base and branch before the run: `supabase/migrations/` (C-01 adds none), `scripts/ci/seed-e2e.mjs`, `scripts/ci/seed-e2e-zoom.mjs`, `playwright.config.ts`, `package-lock.json`, and `tests/` (excluding the git-ignored, generated `tests/e2e/.auth` storage state). The runs were sequential on the same machine: branch 13:52–14:46 UTC, base 15:16–16:10 UTC. Both JSON reports were compared by a script over the report trees (counts, per-file outcomes, failed-test title sets, and first-error-line categories with timeouts and quoted strings normalised).

**Counts.**

| Run | Command | Exit | Passed | Failed | Skipped | Flaky | Duration |
|---|---|---|---|---|---|---|---|
| Base `804794df` | `CI=1 npm run e2e` | **1** | 238 | 60 | 27 | 0 | 54.1 min |
| Branch `5f0e9b1b` (code head) | `CI=1 npm run e2e` | **1** | 238 | 60 | 27 | 0 | 53.7 min |

**Failing files** (expected / unexpected / flaky / skipped; every other spec file has identical outcomes on both runs — 0 of 32 files differ):

| Spec file | Base | Branch |
|---|---|---|
| `tests/e2e/flows/proposal-admin-visibility.spec.ts` | 0 / 3 / 0 / 0 | 0 / 3 / 0 / 0 |
| `tests/e2e/flows/proposal-buckets.spec.ts` | 0 / 4 / 0 / 3 | 0 / 4 / 0 / 3 |
| `tests/e2e/flows/proposal-config.spec.ts` | 0 / 6 / 0 / 0 | 0 / 6 / 0 / 0 |
| `tests/e2e/flows/proposal-consultant-crud.spec.ts` | 0 / 4 / 0 / 0 | 0 / 4 / 0 / 0 |
| `tests/e2e/flows/proposal-document-library.spec.ts` | 0 / 4 / 0 / 0 | 0 / 4 / 0 / 0 |
| `tests/e2e/flows/proposal-versioning.spec.ts` | 0 / 2 / 0 / 0 | 0 / 2 / 0 / 0 |
| `tests/e2e/flows/proposal-web-view.spec.ts` | 1 / 6 / 0 / 0 | 1 / 6 / 0 / 0 |
| `tests/e2e/reservation.spec.ts` | 0 / 2 / 0 / 0 | 0 / 2 / 0 / 0 |
| `tests/qa/auth-redirects.spec.ts` | 24 / 13 / 0 / 0 | 24 / 13 / 0 / 0 |
| `tests/qa/qa-system.spec.ts` | 3 / 16 / 0 / 0 | 3 / 16 / 0 / 0 |

**Failed-test sets.** 60 titles on the base, 60 on the branch, **60 in common, 0 only on the base, 0 only on the branch.**

**Failure categories** (first error line of the final attempt, normalised):

| Category | Base | Branch |
|---|---|---|
| `TimeoutError: page.waitForURL: Timeout Nms exceeded.` | 25 | 25 |
| `Test timeout of Nms exceeded while running "…" hook.` | 15 | 15 |
| `Error: expect(page).toHaveURL(expected) failed` | 9 | 9 |
| `Error: expect(locator).toBeVisible() failed` | 6 | 6 |
| `Error: expect(received).toBe(expected) // Object.is equality` | 4 | 4 |
| `Test timeout of Nms exceeded.` | 1 | 1 |

**Corrected classification.** The 60 failures are **pre-existing on the exact base and unchanged by C-01** — established by reproduction, not by memory or signature matching. They are login-redirect and fixture timeouts in the non-mandatory `flows/proposal-*`, `reservation`, and `tests/qa/*` suites, which the CI seed does not provision; none of those files references the surfaces C-01 changed.

**What this does and does not establish.** It establishes that C-01 introduced no E2E regression and no E2E fix. It does **not** make `npm run e2e` green: the command exits 1 on the base and on the branch alike, so the gate as literally listed in the dispatch is **red on both**, and the green CI-equivalent evidence is the 13-spec mandatory run (192/192 on both units). Fixing those legacy suites is outside C-01 and was not attempted. **Only Brent may authorize an exception to the `npm run e2e` gate**; the executor does not claim one and this document does not grant one.

## Final assurance pass (2026-09-02) — adversarial tests, gates, human gate decision

**Scope of this pass.** Test and documentation work only, authorized by Brent's pasted dispatch after the independent reviewer approved C-01 at `a747de74` with notes. Files changed: the two focused test files and this document. **Production code is byte-identical to `5f0e9b1b`** (verified with `git diff --stat 5f0e9b1b HEAD -- pages lib utils components types supabase scripts package.json package-lock.json .github playwright.config.ts tests`: empty). No adversarial test exposed a production-code defect, so no production fix was proposed or made. `0557a7c1` and `a747de74` were not amended.

**Adversarial API cases added (14 tests)** — what each proves is in the API map above: case-insensitive same-docente classification (with a different-docente control); more than two active rows under `limit(2)`; null / non-array active-guard results; null / non-array eligibility results; same-pair activation between the guard and the pair lookup (with a static-fixture control); and non-string malformed targets behind an active different docente. **Adversarial page cases added (9 tests):** directivo, read-only admin and read-only consultor across zero / one / multiple active assignments. Fixtures stay synthetic (UUID-shaped ids, `.test` e-mails, invented names).

**Gates re-run on the final tree (`~/dev/wt/course-owner`):**

| Gate | Result |
|---|---|
| focused Vitest (2 files) | **81 passed** (60 API + 21 page), exit 0 |
| `git diff --check` | exit 0, clean |
| `npm run guard:actions` | exit 0 — 17 uses across 1 workflow file OK |
| `npm run guard:migrations` | exit 0 — no RLS disable; 40 migration files, no DROP/TRUNCATE/destructive ALTER |
| `npm run guard:browser` | exit 0 — 1142 files, 686 modules from 509 page entrypoints, no boundary violation |
| `npm run guard:secrets` | exit 0 with the three files staged — OK — 2464 tracked path(s), authoritative content scanned from the Git index only, 0 findings; re-run after the commit: reported in the completion report |
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0 (`--max-warnings=0`) |
| `npm run lint:testid` (advisory) | **exit 1 — 2623 problems (44 errors, 2579 warnings)**, identical to the implementation pass; no file under `pages/` or `components/` changed in this pass (only `__tests__/` and this document), so the touched-page base-versus-branch counts above stand unchanged |
| `npm test` (full Vitest) | exit 0 — **374 files passed (374); 8621 tests passed, 11 skipped (8632)**, 233.1 s (previous pass 8598; +23 = exactly the 14 API and 9 page tests added here) |
| `npm run build` | exit 0 — ✓ Compiled successfully, ✓ Generating static pages (149/149); CI's post-build `node scripts/check-price-leak.mjs` OK (262 files, no commercial data) |
| `npm run test:db` | `supabase db reset` on the local Docker stack (32 s, all 40 migrations reapplied from scratch, exit 0) then `supabase test db`: **Files=24, Tests=1931, Result: PASS**, exit 0 |
| Mandatory CI-equivalent E2E | `supabase db reset` (above) → the CI-recipe `.env.local` → `npm run build` (above) → `node scripts/ci/seed-e2e.mjs` (synthetic fixtures, local stack only; exit 0) → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` (13 specs, run under bash): **192 passed (2.1 min), 0 failed, 0 flaky, 0 skipped** (`test-results/e2e-results.json`: expected=192 unexpected=0 flaky=0 skipped=0) → `node scripts/ci/e2e-mandatory.mjs --check`: **OK — 13 mandatory spec(s) ran with no skips**, exit 0. **Green; required; regression evidence only** (no spec exercises the C-01 page or endpoint) |
| Literal `CI=1 npm run e2e` | **not re-run** — reliance on Brent's exception below, not a green result. Conditions for not re-running, all verified: no production file changed; `supabase/migrations/`, `tests/`, `playwright.config.ts`, `scripts/ci/seed-e2e*.mjs`, `package.json` and `package-lock.json` are byte-identical to the approved C-01 state; this document carries the exact exception. |

**Known limitations — unchanged and still explicit:** (1) the concurrent different-docente POST race remains until D-01; (2) manual DELETE then POST remains unsafe until C-02; (3) no C-01 Playwright journey exists yet — the mandatory E2E is regression evidence only; (4) consultor semantics (H-02) remain deferred.

## Human gate decision

Brent authorized exactly this exception (quoted verbatim from the dispatch):

> I authorize a C-01-specific exception for the pre-existing literal CI=1 npm run e2e failures documented at commit a747de74. This exception recognizes only that C-01 introduced no E2E regression; it does not make the full suite green, waive the mandatory CI Playwright gate, or authorize rebase, push, PR, merge, deployment, production access, or worktree cleanup.

Recorded scope, not broadened: the exception applies **only** to the 60 literal `CI=1 npm run e2e` failures reproduced identically on the exact base and on the branch (see *Base-versus-branch full E2E comparison*). The full command **remains red** (exit 1) on both; nothing in this pass changes that. The **mandatory CI Playwright gate remains required** and was re-run green in this pass. **No integration or external action was authorized**: no rebase or merge from main, no push or remote branch, no PR, no merge, no deployment, no production, database, provider, secret or PII access, no production cleanup, no worktree removal, no C-02 replacement behaviour, no D-01 constraint, no consultor or RLS change.

## Post-completion finding — live main moved after the lock

The final read-only `git ls-remote` (after both commits) shows `refs/heads/main` at `8218e597e148d8044fe7d330c118243aa3772485`, no longer the approved base `804794df…`. The GitHub compare API (a read-only `gh api` call — see *Access confirmation*; nothing fetched into either checkout) reports main **3 commits ahead** of the base and 0 behind: `d00f4651` and `dc43fa48` from PR [#71](https://github.com/brentcurtis76/fne-lms/pull/71) (`docs/cred-m1-close`, merged 2026-09-02 14:44 UTC) plus the merge commit, touching only `PROJECT_STATE.md`, `docs/planning/reviews/fase-cred-m1-close-review-request.md`, and `docs/runbooks/auth-security.md`. **No C-01 file overlaps.** This branch stays based on the exact approved SHA (as the dispatch required) and was **not rebased or merged** (not authorized); it therefore no longer fast-forwards onto main, which is a decision for Brent/the PM at merge time, not part of this unit.

## Access confirmation

**Read-only GitHub access occurred** — reads of remote state, never writes: `git ls-remote --heads origin` (preflight, after each commit, again in the correction pass, and at the start and end of the final assurance pass), one `git fetch --dry-run origin main` (preflight; a dry run updates nothing), `gh pr list --state open` (the overlap check at preflight and again in the final assurance pass), `gh pr view <n> --json files` for the four open PRs (final assurance pass overlap check), and `gh api repos/brentcurtis76/fne-lms/compare/804794df…8218e597` (twice, after main moved). **No GitHub mutation occurred**: no push, no remote branch, no PR, no comment, no merge, no label or settings change; `fix/course-owner` exists only locally. No production database, Supabase Management API, Vercel, provider, or secret-state access occurred. The primary checkout's `.env.local` was never read or copied. The only environments touched were the local Docker Supabase stack and the isolated worktrees under `~/dev/wt/` (the branch worktree and, for the correction pass, a detached base worktree).
