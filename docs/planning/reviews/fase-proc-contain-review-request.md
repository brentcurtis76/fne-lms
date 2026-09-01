# Review request — PROC-CONTAIN-01: contain invalid automatic assessment assignment (A-01, A-02)

**Work IDs:** A-01 (template eligibility + unsafe-upgrade containment) · A-02 (truthful, preflighted assignment + same-docente repair)
**Branch:** `fix/proc-contain` · **Base SHA:** `bf5f4c70a9d56b8b3da4e5fe96a9eae574fc2ef9` (`origin/main`, verified equal to the required base by `git ls-remote` before branching and again read-only during the work) · **Code head SHA:** `cfb6cf044e3fa019e1dadc9d4ecccd559083824e` (this file is committed on top of it as the third commit; the final head is in the completion report) · **Commits:** 3 (see below)
**Not pushed, no PR, not merged, not deployed.** No production database, provider, or Management-API access of any kind occurred.

## Commits

1. `fc6d280a73a1` — fix(assessments): gate automatic assignment on published, active, snapshot-backed templates (PROC-CONTAIN-01 A-01) — eligibility helper, service rewrite, publish 409, admin UI step removal, and their tests.
2. `cfb6cf044e3f` — fix(assessments): preflight docente assignment and report truthful counts (PROC-CONTAIN-01 A-02) — assign-docente API, school UI, and their tests.
3. docs(reviews): this review request (the only planning/review document touched).

## Objective (from the dispatch)

Stop the application from creating additional invalid assessment state before the broader ownership, schema, coverage, and production work begins: archived templates must never create or attach an assessment instance; a published template without its snapshot must fail loudly and identifiably; a docente assignment must never report success when no evaluation was confirmed; a retry for an already-active docente must repair, not return early; and the grade-blind "upgrade existing assignments" path must be unreachable.

## Files changed

**Higher risk (authorization ordering, writes, success semantics):**
- `pages/api/school/transversal-context/assign-docente.ts` — `handlePost` rewritten (auth/authorization block and `handleDelete` byte-identical to base, verified with `diff`).
- `lib/services/assessment-builder/autoAssignmentService.ts` — `triggerAutoAssignment` and `createSchoolLevelInstances` rewritten on the shared eligibility policy; new `preflightAutoAssignment`; `upgradeExistingAssignments` removed; `updatePublishedTemplateSnapshot` byte-identical to base.
- `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` — HTTP 409 for `upgradeExisting`; upgrade call and response field removed.

**Medium risk (new pure policy module):**
- `lib/services/assessment-builder/templateEligibility.ts` (new) — `isEligibleTemplate`, `applyEligibleTemplateFilter`, `selectCurrentSnapshot`, `classifyTemplate`.

**Lower risk (UI):**
- `pages/admin/assessment-builder/[templateId]/index.tsx` — the "¿Crear evaluaciones para docentes existentes?" step is gone; the confirmation posts `{}`.
- `pages/school/transversal-context/index.tsx` — assignment modal keeps its error state, warnings banner, `data-testid`s.

**Tests (all import production code; no local stand-ins):**
- `__tests__/services/templateEligibility.test.ts` (new, 13 tests)
- `__tests__/services/autoAssignmentService.test.ts` (rewritten, 28 tests)
- `__tests__/api/school/assign-docente.test.ts` (rewritten, 21 tests)
- `__tests__/api/assessment-builder/publish.test.ts` (extended, 10 tests)
- `__tests__/pages/admin/assessment-builder-publish.test.tsx` (new, 2 tests — renders the real page)
- `__tests__/pages/school/transversal-context-assign.test.tsx` (new, 5 tests — renders the real page)

**Docs:** this file.

## Behavior changed

### A-01 — eligibility and unsafe-upgrade containment
- One policy, one module: a template is eligible only when `status = 'published'` **and** `is_archived === false` (an unselected/null `is_archived` fails closed). It is usable only when backed by its current snapshot (latest `created_at`, deterministic on ties). `applyEligibleTemplateFilter` puts the same predicate on the DB query; `classifyTemplate` re-checks every returned row, so an archived row can never proceed even if a query drifts.
- Both automatic paths (`triggerAutoAssignment`, course-level by `grade_id`; `createSchoolLevelInstances`, school-level) use it. An archived template is reported as `skipped`/`archived` and creates nothing.
- A published, active template with no snapshot is a **blocking** `snapshot_missing` configuration error carrying `gradeId`/`gradeName`/`gradeLevel` and the offending template ids/names, with an es-CL actionable message. Nothing is written for the other templates of that grade either — configuration must be fixed first (judgment call, see hotspots).
- Zero eligible templates is a **blocking** `no_eligible_templates` error naming the grade (was a warning-only `success: true`).
- Publish API: any truthy `upgradeExisting` → **HTTP 409** `upgrade_existing_disabled`, checked after auth → permission → `templateId` validation and **before any read or write** (the test asserts the mocked client is never called). `upgradeExisting: false` from older clients still publishes; the response no longer has an `upgrade` field. `upgradeExistingAssignments` (area-only, grade-blind) is deleted from the service, not merely unreferenced.
- Admin UI: the second confirmation step that offered the upgrade is removed; the single "Sí, publicar" posts `{}` (`publish-confirm-btn` / `publish-cancel-btn` test ids added).

### A-02 — preflighted, truthful assignment and same-docente repair
- Order in `POST /api/school/transversal-context/assign-docente` is unchanged up to and including the course/school authorization, then: **(1) preflight** (`preflightAutoAssignment`, read-only, never throws) → **(2) assignment row** (create / reactivate / keep-active) → **(3) `triggerAutoAssignment`**, which re-resolves eligibility at write time.
- Preflight not ok → **HTTP 422**, nothing written (the assignments table is never touched), structured body: `code`, `error`/`message`, `grade {id,name,level}`, `templates`, `assignment {created:false, reactivated:false, alreadyActive:false, mutated:false}`, `assessments {created, attached, alreadyExisting, skipped, warnings, errors}`, plus the legacy `autoAssignment`/`warning` fields with `success:false`.
- Same docente already active → no early return (the old 400 "ya está asignado" is gone); the request proceeds to the idempotent reconciliation. A missing instance is created; a missing assignee link is attached (`assignee_attached`); a concurrent duplicate assignee insert (`23505`) counts as already existing. A fully reconciled retry is a `200` no-op reporting `alreadyExisting`.
- `success` is `true` **only** when `created + attached + alreadyExisting ≥ 1` and no error (service and handler both enforce it). Otherwise `207` with `success:false`, a `code` (`assessments_not_confirmed` or the service's blocking code), an `error` message, and the counts — including the case where the assignment row was just written.
- Warnings (e.g. missing migration plan → GT default) stay non-blocking and are returned in `warnings` (and inside `assessments.warnings`, and joined into the legacy `warning` string) even on success.
- School UI: `!response.ok || data.success !== true` keeps the modal open, shows the message in a `role="alert"` box (`assign-docente-error`) and refreshes the course list only when `assignment.mutated`; success with warnings closes the modal, shows a dismissible amber banner (`assign-docente-warnings`) and a ⚠️ toast — never a plain "correctamente" success toast.

## Exclusions preserved (verified against the diff)
No one-active-docente rule, replacement, deactivation, or second-docente change (`handleDelete` unchanged; a different docente is still accepted). No consultor/RBAC/RLS/service-role/tenant change. No migration, constraint, trigger, or RPC. No coverage/scoring/progress/autosave/frequency/results/navigation work. No seeder, data cleanup, provisioning, or pilot activity. No production database access. No planning/review document touched except this file (the six pre-existing untracked docs and `outputs/` are byte-untouched and still untracked). No secrets handled or printed.

## Validation

**Environment disclosure (read this first).** The checkout `~/Documents/fne-lms-working` is iCloud-synced; during this task iCloud was wedged (a 45-byte evicted file could not be fetched in 20 s), `.claude/` and `.next/` held ~73,000 evicted files, and every Node tool that loads many modules (`tsc`, `eslint`, `vitest`, `next`) blocked in `read()` with <0.4 s CPU for 30+ minutes — even with `node_modules` symlinked from a non-iCloud path. Remedy (documented in the project memory): `rsync` the source tree (excluding `.git`, `node_modules`, `.next`, `.claude`, `outputs`, `.env*.local`) to `~/dev/fne-proc-contain-20260901`, `npm ci` there (8 s from cache), `cmp`-verify every changed file identical to the checkout, and run the **unmodified** npm scripts from that copy. `guard:secrets` needs `.git`, so it ran in the original checkout (2 s). For the three security suites that shell out to `git grep`/`git ls-files`, the copy was given git metadata by `git init` + `git fetch` of `fix/proc-contain` from the checkout + `git reset` (mixed; working tree untouched), which reproduces the checkout's tracked/untracked state. The copy's `.env.local` was generated from `supabase status -o json` exactly as CI does (local keys only; the checkout's production `.env.local` was never read or copied). Background jobs killed while blocked were reported by the harness as "completed (exit 0)" with empty output; none of those is counted below.

**Local evidence (copy unless stated):**

| Gate | Result |
|---|---|
| `npm run guard:actions` | exit 0 — 17 uses across 1 workflow file OK |
| `npm run guard:migrations` | exit 0 — 40 migration files; no RLS disable, DROP, TRUNCATE, destructive ALTER |
| `npm run guard:browser` | exit 0 — 1142 files scanned, 686 modules from 509 page entrypoints, no boundary violation |
| `npm run guard:secrets` (original checkout) | exit 0 — 2457 tracked paths, 0 findings |
| `npm run type-check` | exit 0 (the first two runs failed with TS2589 at the shared filter helper call; fixed by passing the untyped builder as `any` at the two query sites — see hotspots) |
| `npm run lint` | exit 0 (`--max-warnings=0`), on the final tree |
| `npm run lint:testid` (advisory) | exit 1 — 2624 problems (44 errors, 2580 warnings) on the branch. The two touched pages, measured per file with `-f json` at base vs branch: admin template page 87 → 82 warnings, school page 8 → 3 warnings, 0 errors in both at both points. Only these two files under `components/`/`pages/` changed, so the inferred baseline is 2634 problems; every new interactive element carries a `data-testid`. |
| focused Vitest (6 files) | 79 passed (13 + 28 + 21 + 10 + 2 + 5) |
| `npm test` (full) | exit 0 — **374 files passed (374); 8566 tests passed, 11 skipped (8577)**, 4 min 11 s, on the final tree with the copy's git metadata in place. A first full run in the git-less copy gave 371/374 files and 8553 passed / 13 failed, all 13 in the three security suites that shell out to `git grep` / `git ls-files` (`committed-secrets-guard`, `no-phantom-audit-table`, `recovery-crypto-secret`); they pass once `.git` exists, so that run is superseded, not counted |
| `npm run build` | exit 0 — ✓ Compiled successfully, ✓ Generating static pages (149/149), 1 min 37 s; local-stack env inlined, production env untouched |
| `npm run test:db` | `supabase db reset` on the **local** Docker stack `sxlogxqzmarhqsblxmtj` (150 s, all migrations reapplied) then `supabase test db`: **Files=24, Tests=1931, Result: PASS** |
| `npm run e2e` (CI-equivalent) | `supabase db reset` (above) → `.env.local` from `supabase status` (CI recipe) → `npm run build` (above) → `node scripts/ci/seed-e2e.mjs` (synthetic fixtures, local stack only; exit 0) → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium`: **192 passed (2.0 min), 0 failed, 0 flaky, 0 skipped** (`test-results/e2e-results.json`: expected=192 unexpected=0 flaky=0 skipped=0) → `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json`: **OK — 13 mandatory spec(s) ran with no skips**. A first attempt reported "No tests found" because my ad-hoc runner script used zsh, which does not word-split the spec-list variable; it was rerun under bash. No application code was involved in that retry |

**Evidence boundaries.** Everything above is local evidence. There is **no GitHub CI evidence** (branch not pushed), **no deployment evidence**, and **no production evidence** — no production query, mutation, provider command, or Vercel action was performed. The local Supabase stack that was reset/seeded is the ephemeral dev stack on this machine only.

## Regression tests → requirement map

| # | Requirement | Test |
|---|---|---|
| 1 | Archived published templates excluded from every automatic path | `autoAssignmentService.test.ts`: "never creates or attaches an instance for an archived published template", "processes only the active template…", `createSchoolLevelInstances` "never creates a school-level instance for an archived template"; `preflightAutoAssignment` "blocks with no_eligible_templates when only archived…"; `templateEligibility.test.ts` archived cases |
| 2 | Zero active eligible templates → blocking failure | service "returns a blocking failure — not a warning-only success…", school-level "returns a blocking failure when zero eligible templates exist"; API "returns 422 … when zero eligible templates exist" |
| 3 | Missing current snapshot → blocking, grade-identifiable error | service "returns a blocking, grade-identifiable snapshot_missing error…", preflight "blocks with snapshot_missing naming the template and grade", school-level snapshot test; API "returns 422 naming the misconfigured template…" |
| 4 | No assignment insert/reactivation after failed preflight | API 422 tests assert the assignments table is never touched (recording client) and `triggerAutoAssignment` is not called; the inactive-row variant asserts no reactivation |
| 5 | Same-active-docente retry invokes reconciliation | API "does not return early for a same active docente…" (no insert/update; service called; `attached` reported) |
| 6 | Fully reconciled retry idempotent, reports already-existing | API "a fully reconciled retry is an idempotent success…"; service "is a truthful no-op when the instance and the assignee link already exist" |
| 7 | Zero created/already-existing cannot be success | API "cannot report success when zero assessments were created or already existing" (207), "returns 207 success:false when the service resolves with zero counts and no errors"; service "cannot report success when the instance insert fails" |
| 8 | `upgradeExisting:true` rejected before any publication mutation | `publish.test.ts` "rejects upgradeExisting:true with 409 before any read or publication write" (`mockClient.from` never called), string-truthy variant, auth-ordering variant |
| 9 | Removed upgrade UI cannot send `upgradeExisting:true` | `assessment-builder-publish.test.tsx` asserts the posted body is exactly `{}` and the upgrade prompt never renders |
| 10 | Assignment UI keeps modal + error on blocking failure | `transversal-context-assign.test.tsx` 422 and 207 cases; warnings-visible case; network-failure case |
| 11 | Tests import production code/components | every suite imports the production module/page; the two page suites render the real pages with router/supabase/toast/layout mocked |
| 12 | Warning-only-success test replaced | the old "handles no published templates gracefully" test is gone; replaced by the blocking-failure test |

Authorization ordering is additionally pinned: 401, 403 (role), 404, and 403 (other school) all assert the preflight never ran, and the create-path test asserts `course lookup → preflight → assignments table → triggerAutoAssignment` via `invocationCallOrder`.

## Reviewer hotspots (my own judgment calls — descending importance)

1. **Authorization ordering.** Preflight sits after the course/school authorization and before any write; the only new read before the write is the preflight itself (service-role via `supabaseAdmin`, as the service always was). Check that nothing in `handlePost` can leak grade/template information to a caller who fails the earlier checks.
2. **Preflight/write race.** Between the preflight and the write, a template can be archived (or its snapshot changed). The executor re-resolves eligibility at write time, so a stale plan is never used; but the assignment row has already been created/reactivated when that happens. The response is then a truthful `207 success:false` with the blocking code, and the retry path repairs once configuration is fixed. **No compensating rollback** of the just-written assignment is attempted — that needs the transactional architecture the dispatch put out of scope. Decide whether the truthful-207 contract is acceptable for the pilot window.
3. **Idempotent retry.** Existence checks moved from `.single()` (which errors on duplicates and would have led to a second duplicate) to `.order('created_at').limit(1).maybeSingle()` — the oldest row wins deterministically. `23505` on the assignee insert is treated as already linked. There is no unique constraint on `assessment_instances (course_structure_id, template_snapshot_id)`, so two truly concurrent first-time requests can still create two instances; the retry path then reconciles onto the oldest. Look for any place where the two counts (`attached` vs `alreadyExisting`) could be reported misleadingly.
4. **False-success semantics.** The rule is enforced twice (service `finalizeResult`, handler `isBlocking`), including the case where the service returns a malformed `success:true` with zero counts. The legacy `autoAssignment` object and `warning` string are kept for compatibility but now carry truthful `success`. The UI treats anything other than `ok && success === true` as blocking. Check the message texts (es-CL) and that `207` vs `422` is the right split: 422 = nothing written, 207 = assignment row exists but no evaluation confirmed.
5. **Unexpected partial failures.** Instance created but assignee insert fails (non-23505) → `error` detail, instance left without a link; the next retry attaches it (`assignee_attached`). Per-template errors make the whole response `207 success:false` even if another template succeeded (counts show what happened). `snapshot_missing` for one template blocks the whole grade on purpose (a half-provisioned docente was judged worse than a blocked assignment with an actionable message) — confirm you agree.
6. **The `any` casts at the two template queries** (`courseTemplatesQuery`, `schoolTemplatesQuery`). Supabase's type-level select-string parser trips TS2589 when the builder is passed through the generic helper; the rows were already consumed as `any` in the base code and are re-validated by `classifyTemplate`. The helper's own generic is intentionally loose for the same reason.
7. **Dead-code deletion.** `upgradeExistingAssignments` (~170 lines) is removed rather than left unreferenced, per "do not retain". `createSchoolLevelInstances` has no callers today (readiness review H-notes) but is gated and tested as required.
8. **UI details.** The school-page dropdown still filters out already-assigned docentes (unchanged), so after a page reload the same-docente repair is reachable via the API/retry from the still-open modal or via unassign → assign; the modal's error state and the warnings banner are new surface area — check the es-CL copy and the `toast()` (⚠️) vs `toast.success` distinction. The page tests mock `useRouter` with one stable object because both pages memoize effects on `router`.
9. **`upgradeExisting: "false"`** (string) is rejected as truthy — fail-closed by design; real clients send a boolean (old UI) or nothing (new UI).

## Known limitations / stop-condition findings

- No stop condition triggered: `origin/main` stayed at the required SHA; no active PR or newer branch changes the in-scope files (the only overlaps are stale July `bridge/rescue-*` branches and a July 30 `chore/ts-tests` one-line type annotation in the old `autoAssignmentService.test.ts`, which this rewrite supersedes); no migration/RPC/RLS/production access was needed; no one-docente or replacement semantics were decided; partial-write handling stays within the truthful-report contract above.
- The build, type-check, lint, unit, DB and e2e evidence comes from the non-iCloud copy described above, with unmodified commands on a `cmp`-verified identical tree; a reviewer on a healthy checkout should see the same results. The `.next` directory of the original checkout was left as found (evicted) and was not used.
- `lint:testid` remains advisory and red repo-wide (2624); this unit reduces it by 10 and adds no findings.
- The docente-facing side effects of a 207 (assignment row active, no evaluation) are visible to the directivo but not yet to any admin dashboard; the retry path is the only repair tool in this unit.
