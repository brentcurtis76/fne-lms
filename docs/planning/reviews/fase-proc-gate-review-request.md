# Review request — B-01: cobertura-gate consistency (Procesos de Cambio PR 1 item 2 closure recovery)

**STATUS: NOT REVIEW READY — STOPPED FOR A NEW BRENT DECISION ON THE LITERAL E2E GATE.** This is B-01 **attempt 2**: the cumulative implementation produced in attempt 1 was adopted unchanged, reconciled with current `origin/main`, revalidated end to end, and committed locally. Nothing was pushed, and no PR, merge, or deployment exists. Two things changed materially since attempt 1's version of this document:

1. **Brent made a decision, but the completed gate run exceeded its scope.** His exact accepted instruction was: *"I approve a B-01-specific exception for the unrelated `proposal-*` E2E failures, based on their reproduction on the exact base. Reconcile B-01 with current `origin/main`, rerun the relevant gates, and create local commits only. Do not push, open a PR, merge, or deploy."* Attempt 2 ran `CI=1 npm run e2e` to **completion** (attempt 1 was stopped early at 89 attempts) and found **60 distinct failing titles, only 29 of which are `proposal-*`**. The other 31 — 16 in `tests/qa/qa-system.spec.ts`, 13 in `tests/qa/auth-redirects.spec.ts`, 2 in `tests/e2e/reservation.spec.ts` — fall outside the approved wording. **This unit therefore did not commit a closure claim and did not extend the exception.** The literal `CI=1 npm run e2e` gate is RED and is never claimed green. See § Literal E2E gate.
2. **The full Vitest suite is now green.** Attempt 1 recorded 5 failures in `__tests__/pages/community/workspace.mention-scope.test.tsx` (an unrelated file), reproduced on the exact base. On the reconciled tree the full suite passes: **382 files, 8750 passed / 11 skipped / 0 failed**, and that file's 5 tests pass. **No waiver was needed, requested, or granted for those failures** — see the `npm test` row and its honest caveat in § Validation.

Everything else is green: type-check, lint, all four guards, `git diff --check`, the focused B-01 suites, the production build, pgTAP, and the mandatory 13-spec CI-equivalent Playwright manifest with its no-skip check.

**Work ID:** B-01 attempt 2 (dispatched as PR 1 item 2 closure recovery, following C-01)
**Branch:** `fix/proc-gate` · **Worktree:** `/Users/brentcurtis/dev/wt/proc-gate`
**Repository:** `/Users/brentcurtis/Documents/fne-lms-working` (Git common dir `/Users/brentcurtis/Documents/fne-lms-working/.git`)
**Original base SHA:** `982f456deeecdeefd14a08339a4b40676454128c` — `origin/main` when attempt 1 locked.
**Integrated main SHA:** `d103198980b1671a2a207f4d2efcc1fd8db7a980` — live `origin/main` at attempt 2's re-lock, verified by `git fetch` to be 12 commits ahead of and 0 behind the original base, with the original base an ancestor of it.
**Commits (local only, never pushed):**
- `1937932873f6f16f5e7505de9578ecf74e0f4bd0` — the cumulative attempt-1 implementation, committed verbatim so the branch could be reconciled without any destructive Git operation.
- `0207d83cb8ee8392de3520806e08b353971867ce` — the two-parent merge reconciling with `origin/main` `d1031989`.
- one final records commit carrying this document and the `PROJECT_STATE.md` update (its SHA is in the completion report; this file is committed with the phase, not before).

**Reviewable range:** `git diff origin/main..HEAD` — exactly the 16 B-01 paths listed in § Files changed, no more and no less.

**Not pushed, no PR, not merged, not deployed.** No production database, Supabase Management API, Vercel, provider, GitHub-mutating, or secret-state access occurred. `.env.local` was never inspected, printed, copied, or tracked. The pre-existing unrelated `stash@{0}` was not applied, deleted, or relied on; no other worktree or the primary checkout was touched. The only environment used is the local Docker Supabase stack already running on this machine (project ref `sxlogxqzmarhqsblxmtj`, ports 54321–54323), which attempt 2 did **not** reset and did **not** reseed — it ran against the schema and synthetic fixtures already present. Before using it, coordination checks confirmed no external client sessions (only the stack's own PostgREST/realtime/storage connections), no `vitest`/`playwright`/`next` processes, and nothing bound to port 3000.

## Objective (from the dispatch)

Make cobertura-gate behavior identical across form visibility, browser and GET progress, submit validation, server scoring, client/demo scoring, and result/gap consumers, via one shared pure policy. A docente answering Cobertura No must be able to submit. Hidden or stale downstream responses remain stored but cannot affect validation, scoring, denominators, counts, or gaps.

## Scope in / out

**In:** the shared policy module and its wiring into the seven named consumers (ModuleCard, docente/demo progress, GET progress, submit validation, server scoring including gap analysis, client/demo scoring), plus focused/consumer tests.

**Out (untouched):** course assignment/replacement/DELETE semantics (C-01/C-02), consultor/RLS, migrations/schema/types generation, template publication/provisioning/production data, autosave behavior beyond progress calculation, frequency/range scoring defects, CI/package/Playwright config, unrelated tests/docs. Historical commits `59bc7803` and `63616d61` were read as intent references only — not merged, cherry-picked, rebased, or revived.

## The shared policy

New file `lib/services/assessment-builder/coberturaGatePolicy.ts`, exporting `resolveCoberturaGate<T>()`. No React, Supabase, DB, environment, or browser-only imports — verified by inspection (only a type-only import surface).

Contract:
- Input: an already active-filtered indicator list (year-aware modern set or the legacy traspaso/detalle exclusion — established by the caller, since that logic differs per consumer and per data shape) plus small accessor functions (`getId`, `getCategory`, `getDisplayOrder`, `getCoverageValue`), so camelCase (`displayOrder`, `coverageValue`) and snake_case (`display_order`, `coverage_value`) consumers share exactly one implementation.
- Stable-sorts the input by display order, falling back to original array index on ties or missing/non-finite order values (numbered items sort before unordered ones; unordered ones keep their relative input order).
- A gate exists only if the first ordered item's category is `cobertura`.
- No gate → every item is `applicable`, `state: 'none'`.
- Gate + missing/null/non-boolean cobertura value → `state: 'unanswered'`, only the gate indicator applicable (fail-closed).
- Gate + `true` → `state: 'yes'`, all ordered items applicable.
- Gate + `false` → `state: 'no'`, only the gate indicator applicable; the rest are `gatedOut` (never deleted, just excluded from `applicable`).

## Consumers wired

| File | Before | After |
|---|---|---|
| `components/assessment/ModuleCard.tsx` | Inline sort + gate-open/closed branching for visibility | `resolveCoberturaGate` drives `visibleIndicators`/`showGateMessage` |
| `pages/docente/assessments/[instanceId]/index.tsx` | Two near-duplicate inline gate/progress loops (`useEffect` + `updateProgress`) | Both call a new local `computeModuleProgress` helper built on the shared policy |
| `pages/demo/assessments/[templateId]/index.tsx` | Same inline duplication as the docente page | Uses the shared policy directly in its single progress effect |
| `pages/api/docente/assessments/[instanceId]/index.ts` (GET) | Inline sort + gate over `module.indicators` for the progress counter | Year-active filter (existing `activeExpectationsMap` logic) computed first, then passed into the shared policy — filter-before-gate is now explicit |
| `pages/api/docente/assessments/[instanceId]/submit.ts` | **No gate at all** — validated every "active" (year-aware or legacy) indicator regardless of the cobertura answer, so a docente answering No could never submit (the readiness-review B2 blocker) | Active indicators (same modern/legacy rule as before) now pass through the shared policy; only `gate.applicable` indicators are checked/required |
| `lib/services/assessment-builder/scoringService.ts` — `calculateModuleScore` | Scored every "active" indicator into the weighted average unconditionally (server scoring never respected the gate) | Applies the shared policy over the already-active-filtered indicators; only `gate.applicable` indicators enter the weighted average — gated-out indicators are omitted, not scored 0. `activeIndicatorCount` now reflects the applicable count. `display_order` was threaded through `ModuleInput`/`InstanceDataForScoring`/`mapIndicator` to support ordering (previously absent from this module) |
| `lib/services/assessment-builder/scoringService.ts` — `fetchInstanceGapAnalysis` | Only handled the flat-modules snapshot path; iterated every snapshot indicator, defaulting a gated-out indicator's absent score to `0` via `?? 0`, which fed `classifyGap` as a false "critical"/"behind" result | Now supports the objectives-hierarchy path (`snapshotData.objectives`, flattened) alongside the legacy flat path, and restricts each module's indicator list to ids present in the saved `module_scores` (which, after the `calculateModuleScore` fix, only ever contains applicable indicators) — a gated-out indicator is never reconstructed into the gap analysis at all |
| `lib/services/assessment-builder/clientScoringService.ts` — `scoreModule` | Kept every indicator in the result with a forced `normalizedScore: 0` when the gate was closed | Uses the shared policy (`getDisplayOrder: () => undefined`, preserving the original no-sort behavior this module always had) and iterates only `gate.applicable`; gated-out indicators are omitted from `indicatorResults` entirely, not zero-scored |

No changes to module/objective weights; a closed-gate module keeps its normal weight with cobertura as its sole applicable indicator (verified by existing and new `scoringService.test.ts` cases). No response row is ever deleted — every consumer only changes what is *read/required/scored*, never storage.

## Test-first evidence

`__tests__/lib/services/assessment-builder/coberturaGatePolicy.test.ts` (16 tests) was written and run **before** `coberturaGatePolicy.ts` existed:

```
FAIL __tests__/lib/services/assessment-builder/coberturaGatePolicy.test.ts
Error: Failed to load url /lib/services/assessment-builder/coberturaGatePolicy … Does the file exist?
Test Files  1 failed (1)
     Tests  no tests
```

After implementing the module, the same 16 tests passed unchanged. No existing test was weakened; one existing `clientScoringService.test.ts` case was **updated**, not weakened, to assert the new (explicitly required) omission behavior instead of the old zero-scoring behavior — the assertion is strictly more specific (checks `indicators` array length and content, not just aggregate score).

## Files changed

**Production code:**
- `lib/services/assessment-builder/coberturaGatePolicy.ts` (new) — the shared policy.
- `components/assessment/ModuleCard.tsx`
- `pages/docente/assessments/[instanceId]/index.tsx`
- `pages/demo/assessments/[templateId]/index.tsx`
- `pages/api/docente/assessments/[instanceId]/index.ts`
- `pages/api/docente/assessments/[instanceId]/submit.ts`
- `lib/services/assessment-builder/scoringService.ts`
- `lib/services/assessment-builder/clientScoringService.ts`

**Tests (new or extended):**
- `__tests__/lib/services/assessment-builder/coberturaGatePolicy.test.ts` (new, 16 tests)
- `__tests__/lib/services/assessment-builder/fetchInstanceGapAnalysis.test.ts` (new, 3 tests)
- `__tests__/api/docente/assessments/get-progress.test.ts` (new, 4 tests)
- `__tests__/components/assessment/ModuleCard.gate.test.tsx` (new, 6 tests)
- `__tests__/api/docente/assessments/submit.test.ts` (extended, +4 tests: 10 → 14)
- `__tests__/lib/services/assessment-builder/clientScoringService.test.ts` (1 test rewritten to assert omission)
- `__tests__/lib/services/assessment-builder/scoringService.test.ts` — **unchanged**, all 85 pre-existing tests (including the `activeIndicatorCount` and `T6`/gate-adjacent cases) pass unmodified against the new gate-aware `calculateModuleScore`, which is itself evidence the gate change is backward-compatible with every scenario that suite already covered.

**Docs:** this file; `PROJECT_STATE.md` Meta section (new top-of-list entry; every pre-existing entry preserved byte-for-byte below it).

## Reconciliation with current main

Attempt 1 left the work as an uncommitted 16-path diff on a branch based on `982f456d`, while live `origin/main` had moved 12 commits ahead to `d1031989`. Attempt 2 integrated that without any destructive Git operation — no `reset`, `clean`, `checkout --`, stash create/apply/drop, file overwrite, or worktree move, and no other worktree or the primary checkout was touched.

Because the only overlapping path (`PROJECT_STATE.md`) was itself locally modified, `git merge` could not run against the dirty tree, and every alternative (stash, checkout-discard, reset) was prohibited *and* riskier. The safest available route was therefore to **commit the cumulative diff first** — putting all 16 paths permanently into the object database — and merge onto that clean tree. The 16 files were verified byte-identical to a pre-commit SHA-256 snapshot immediately after committing, so no cumulative edit was lost.

- **Conflicts:** exactly one, `PROJECT_STATE.md`. Both sides only prepend `## Meta` entries.
- **Resolution:** main's version kept in full — the FNE-ZOOM Unit B1 closure entry and both SM-SIM-PROD-D1 entries, byte-for-byte, in their original order — with the single Procesos de Cambio C-01/B-01 entry restored above them. Verified mechanically: the resolved file differs from `origin/main:PROJECT_STATE.md` by **exactly one added line and zero removed lines**. No current-main record was replaced, reworded, or dropped.
- **Main's other 17 changed paths** (Zoom operator-tenant session creation, `lib/types/tenant-kind.ts`, `pages/api/sessions/*`, Santa Marta governance docs, `scripts/check-ledger.mjs`) merged cleanly. They share no file with B-01, and a content probe of the whole `982f456d..d1031989` diff found no reference to `cobertura`, `assessment-builder`, `scoringService`, `ModuleCard`, or `docente/assessments` outside two prose mentions inside a `PROJECT_STATE.md` Santa Marta entry — so there is no semantic overlap either, not merely no path overlap.
- **Open PRs** (#50, #46, #4, #1 — all last updated 2026-08-22 or earlier) were checked file-by-file and none touches any assessment, docente, ModuleCard, scoring, or cobertura surface.
- After the merge, `origin/main` is an ancestor of `HEAD`; the branch is 2 ahead / 0 behind, and `git diff origin/main..HEAD` is exactly the 16 B-01 paths.

## Validation

Every command below was run in `/Users/brentcurtis/dev/wt/proc-gate` **after the final executable change and after the merge with `origin/main` `d1031989`**, on HEAD `0207d83c` (the records commit that follows changes only Markdown). Only the two Markdown records were edited afterwards; no gate result depends on them.

| Gate | Command | Exit | Result | After final change |
|---|---|---|---|---|
| Focused B-01 suites | `npx vitest run` × 7 B-01 files | 0 | **7 files, 198 tests, all passed** (coberturaGatePolicy 16, scoringService 85, clientScoringService 70, submit 14, ModuleCard.gate 6, get-progress 4, fetchInstanceGapAnalysis 3) | yes |
| Whitespace/conflict | `git diff --check` | 0 | clean | yes |
| Actions guard | `npm run guard:actions` | 0 | OK — 17 uses, 1 workflow file | yes |
| Migration guard | `npm run guard:migrations` | 0 | OK — 41 migrations, no RLS disable / DROP / TRUNCATE / destructive ALTER | yes |
| Browser boundary guard | `npm run guard:browser` | 0 | OK — 1146 files, 688 modules from 509 entrypoints, no violation | yes |
| Secret guard | `npm run guard:secrets` | 0 | OK — 2487 tracked paths scanned from the Git index, 0 findings. Also run against the staged tree before the first commit (2481 paths, 0 findings). | yes |
| Typecheck | `npm run type-check` | 0 | clean | yes |
| Lint | `npm run lint` (`--max-warnings=0`) | 0 | clean | yes |
| Testid lint (advisory) | `npm run lint:testid` | 1 | **Advisory and repo-wide red by baseline: 2621 problems (44 errors, 2577 warnings).** Re-measured per touched file against *current main* via `git show origin/main:<file> \| eslint --stdin` on the same config: identical counts — `ModuleCard.tsx` 1/1, docente `index.tsx` 3/3, demo `index.tsx` 6/6, both API routes 0/0. **No new finding.** | yes |
| Unit (Vitest, full) | `npm test` | 0 | **382 files passed / 0 failed; 8750 passed, 11 skipped, 0 failed** (274 s). Attempt 1's 5 failures in `__tests__/pages/community/workspace.mention-scope.test.tsx` are gone — that file now passes all 5. **Honest caveat:** B-01 changed nothing in that file or in `pages/community/workspace.tsx`, so this unit did not fix it. The attempt-1 failure signature (`localStorage.getItem` undefined) is a cross-file jsdom-environment leak, and merging main added new test files that changed how files distribute across workers. The gate is green on this exact tree, which is what the gate asks; it should not be read as proof that the underlying leak is fixed. | yes |
| Build | `npm run build` | 0 | Compiled successfully; 149/149 static pages generated. Ran against the pre-existing ignored `.env.local` (local-stack synthetic values), which was never opened. | yes |
| RLS pgTAP | `npm run test:db` | 0 | **Files=25, Tests=2143, Result: PASS** — including `063-fne-zoom-operator-tenant.sql`, which arrived with the merge. No `supabase db reset` was performed. | yes |
| Mandatory CI Playwright manifest | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | 0 | **192 passed (2.3 min), 0 failed, 0 flaky, 0 skipped** across the 13 mandatory specs | yes |
| Mandatory no-skip check | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 0 | OK — 13 mandatory spec(s) ran with no skips | yes |
| Literal full E2E | `CI=1 npm run e2e` | — | **RED, under Brent's approved narrow exception.** See the next section for exact results. Never claimed green. | yes |

## Literal E2E gate — exact results and classification

**This gate is RED and is NOT fully covered by the approved exception. B-01 attempt 2 stops here for a Brent decision.**

**The run.** `CI=1 npm run e2e` was run to **completion** on the reconciled tree (HEAD `0207d83cb8ee8392de3520806e08b353971867ce`), unlike attempt 1's Brent-terminated partial run. Started 2026-09-03T20:49:05Z, ended 21:43:26Z, exit status **1**.

```
  60 failed
  27 skipped
  238 passed (54.3m)
```

`playwright.config.ts` sets `workers: 1` and `retries: 2` under `CI`, so the 325-test matrix ran serially and every failing title burned three ~15 s timeouts — 445 recorded attempts, ~38 min of which was failed-attempt time.

**The 60 distinct failing titles, by spec file:**

| Spec file | Distinct failing titles | Inside the approved `proposal-*` exception? |
|---|---|---|
| `tests/qa/qa-system.spec.ts` | 16 | **No** |
| `tests/qa/auth-redirects.spec.ts` | 13 | **No** |
| `tests/e2e/flows/proposal-web-view.spec.ts` | 6 | yes |
| `tests/e2e/flows/proposal-config.spec.ts` | 6 | yes |
| `tests/e2e/flows/proposal-document-library.spec.ts` | 4 | yes |
| `tests/e2e/flows/proposal-consultant-crud.spec.ts` | 4 | yes |
| `tests/e2e/flows/proposal-buckets.spec.ts` | 4 | yes |
| `tests/e2e/flows/proposal-admin-visibility.spec.ts` | 3 | yes |
| `tests/e2e/reservation.spec.ts` | 2 | **No** |
| `tests/e2e/flows/proposal-versioning.spec.ts` | 2 | yes |

**29 of 60 are `proposal-*`. The other 31 are not**, and all are retry-exhausted rather than flaky: 16 in `qa-system.spec.ts` (QA Admin Dashboard, QA Scenarios Management, QA Import Functionality, Accessibility), 13 in `auth-redirects.spec.ts` (protected-route redirects with no session), and 2 in `reservation.spec.ts` (`:27:7` QA-1 "Creating and scheduling a session reserves hours in the ledger", `:50:7` QA-9 legacy session without `hour_type_key`).

**Why this is a stop, not an exception.** Brent's approval was: *"I approve a B-01-specific exception for the unrelated `proposal-*` E2E failures, based on their reproduction on the exact base."* Attempt 1 observed only `proposal-*` failures because Brent directed it stopped after 89 attempts; the complete matrix shows that sample was not representative of the gate's scope. Extending a `proposal-*`-worded exception to `tests/qa/*` and `reservation.spec.ts` would be **inventing an exception nobody granted**, so this document does not do so and does not call the gate green.

**Classification evidence — and its exact limits.**

*Supporting "pre-existing baseline, not a B-01 regression":*
- The aggregate is **identical to C-01's documented run**: PROJECT_STATE.md's C-01 record states its base-`804794df` run and its C-01-tree run "produced 238 passed, 60 failed, and 27 skipped, with identical failing-title sets and categories." This run produced **the same three numbers** on a different, later tree.
- **B-01's 14 code and test paths contain zero occurrences** of `proposal`, `licitac`, `bucket`, `mineduc`, `consultant`, or any session/reservation/ledger/auth-redirect surface — verified by running the term search over `git diff origin/main..HEAD -- . ':(exclude)*.md'`, which returns 0. Every such string in the diff lives in the two Markdown records that discuss these failures.
- B-01 changes only assessment cobertura gating. There is no mechanism by which it could affect QA-dashboard, auth-redirect, or hour-ledger journeys.

*What this evidence does NOT establish:*
- **No base comparison was run in attempt 2.** The 238/60/27 match is an aggregate match against a record written for a *different base* (`804794df`), not a title-by-title comparison against a fresh run of current `origin/main` `d1031989`. Identical totals do not prove identical failing-title sets.
- C-01's actual failing-title list is not reproduced in the records available here, so the sets could not be diffed.
- Therefore "these 31 non-`proposal-*` failures are pre-existing" is **strongly indicated but not proven**. Establishing it requires a fresh `CI=1 npm run e2e` in a disposable worktree at `d1031989` with no B-01 code — roughly another hour of wall clock plus `npm ci`, build, and seed.

**No exception is claimed, granted, or inherited anywhere in this document, and the gate is recorded as RED.** Its disposition — authorize the base reproduction, widen the exception on this evidence, or treat the gate as blocking — is Brent's decision alone.

## Reviewer hotspots (my own judgment calls — descending importance)

1. **Where "effective active indicators" (step 1) is resolved.** The shared policy deliberately does *not* compute year-active/legacy-active filtering itself — each caller does that first (it already existed, correctly, in six different shapes across the six consumers) and hands the policy an already-filtered list. The policy's own "original index" tie-break is therefore relative to the *filtered* list's order, not the full unfiltered snapshot array. In every existing test and in the six production call sites this makes no observable difference (filtering preserves relative order, and ties only matter among items that survive filtering), but a reviewer should confirm this scoping choice — centralizing gate/sort/applicability while leaving active-filtering per-consumer — is the right cut given the six different active-filtering shapes in this codebase (two use an `activeExpectationsMap`/`activeIndicatorIds` built from `assessment_year_expectations`, two use the legacy traspaso/detalle exclusion as a fallback, one is client-only with no active-filtering step at all).
2. **`calculateModuleScore`'s omission (not zero) change is the crux of the server-scoring fix.** This function previously scored every "active" indicator unconditionally — cobertura gating was never applied at the server-scoring layer at all before this unit (only in the browser-only client demo path, and even there imperfectly). The fix is minimal (wrap the existing indicator list in `resolveCoberturaGate`, iterate `gate.applicable` instead of `indicators`), and all 85 pre-existing `scoringService.test.ts` tests pass unmodified — but this is the highest-blast-radius change in the diff since it touches the one function that computes every persisted `assessment_instance_results` row going forward. Look hard at whether any existing snapshot/scoring-config combination in production could have a non-cobertura-shaped first indicator that this change would now treat differently than before (it shouldn't — a non-cobertura first indicator means `hasGate: false`, `applicable: orderedActive` = every active indicator, i.e. byte-identical to the old unconditional behavior).
3. **`fetchInstanceGapAnalysis`'s applicability signal is indirect.** Rather than re-deriving the gate independently (which would need response data this function doesn't fetch — it only reads the already-computed `assessment_instance_results.module_scores`), it infers "was this indicator applicable at scoring time" from whether the indicator id is present in the saved `indicatorScores` map. This is correct *because* `calculateModuleScore` now omits gated-out indicators from what it saves — the two functions are coupled by this contract. If a future change to `calculateModuleScore` reverts to including gated-out indicators (even at score 0), this gap-analysis filter would silently stop working as intended. This coupling is implicit, not type-enforced; a reviewer should judge whether that's acceptable or whether it needs an explicit marker.
4. **Objectives-hierarchy support was added to `fetchInstanceGapAnalysis` as a necessary side effect**, not a separately-scoped fix — the function previously only read `snapshotData.modules`, silently returning empty/wrong gap analysis for any objectives-hierarchy (3-level) instance. This was a pre-existing gap (the dispatch's "objective-contained and legacy flat modules" requirement made it unavoidable to touch). Confirm this is within the intended scope of B-01 rather than scope creep — the six named consumers list didn't explicitly include this function, but it's the direct implementation of "Gap analysis cannot reconstruct not-applicable absence as score zero" and "Gap analysis handles objective-contained and legacy flat modules," which are dispatch requirements.
5. **`ModuleCard`'s de-duplicated progress helper in the docente page** (`computeModuleProgress`) collapses two previously near-identical inline loops (`useEffect` and `updateProgress`) into one shared local function. This is a minimal, same-file simplification that falls naturally out of removing the duplicated gate logic; it is not a new abstraction introduced for its own sake, and it does not change either call site's behavior — confirm the diff reads that way.
6. **`clientScoringService.scoreModule` passes `getDisplayOrder: () => undefined`** — this module's `IndicatorInput` type has never carried a `displayOrder`/`display_order` field, and the original code always treated `indicators[0]` (raw array order) as the gate candidate with no sort step. Rather than adding a new field to `DemoScoringInput`'s indicator shape (which would ripple into `StoredIndicator`/`transformModuleForScoring` on the results page), the shared policy is given a constant `undefined` order accessor, which makes it fall back entirely to original array index — reproducing the exact prior behavior. Confirm this is preferable to threading `displayOrder` through the demo/results data path, which was judged out of proportion for this unit.

## Known limitations / deferred

- Objectives-hierarchy support in `fetchInstanceGapAnalysis` is untested against a real multi-objective production snapshot beyond the new unit test's synthetic fixture — no existing E2E/pgTAP journey exercises `/docente/assessments/[id]/results` end to end with objectives data.
- `display_order` was threaded through `scoringService.ts`'s server-side types for gate ordering, but the pre-existing `mapIndicator` in `clientScoringService`'s *results-page* transform (`transformModuleForScoring` in `pages/demo/assessments/[templateId]/results.tsx`) was not touched — the demo path's gate ordering still relies on array order only (see hotspot 6).
- No new pgTAP coverage was added (none of the changed files are DB-schema or RLS-adjacent).
- `__tests__/pages/community/workspace.mention-scope.test.tsx` — attempt 1 recorded 5 failures there, reproduced on the exact base. On the reconciled tree the whole suite is green and that file passes. B-01 did not touch it or `pages/community/workspace.tsx`, so this unit fixed nothing there; the underlying cross-file jsdom `localStorage` leak may simply no longer manifest under the current worker distribution. Treat it as latent, not resolved.
- **The gap-analysis fix is not retroactive.** `fetchInstanceGapAnalysis` infers "was this indicator applicable at scoring time" from whether its id appears in the persisted `assessment_instance_results.module_scores`. That is correct only for results written by the *new* `calculateModuleScore`, which omits gated-out indicators. Rows persisted **before** this change stored every active indicator, gated-out ones included at `normalizedScore: 0`, so for those existing rows a gated-out indicator is still present in `indicatorScores` and will still be reconstructed as a critical/behind gap. Existing results are therefore unchanged (no regression), but they are also not repaired — repair would require rescoring, which is out of scope and would need production access this unit does not have. Verified by reading how `indicatorScores` is built (`scoringService.ts`, from `result.module_scores`), not merely inferred.
- The literal `CI=1 npm run e2e` gate remains red. The approved exception is narrow and evidence-bound; it is not a fix, and the `proposal-*` failures themselves are unowned by this unit and undiagnosed.
