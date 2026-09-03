# Review request — B-01: cobertura-gate consistency (Procesos de Cambio PR 1 item 2 closure recovery)

**STATUS: NOT REVIEW READY — STOPPED FOR A NEW BRENT DECISION.** Implementation, unit/integration tests, type-check, lint, and guards are all green. The full local Vitest suite was run and is **not** all-green: 8673 passed / 11 skipped / 5 failed, with the 5 failures reproduced identically on the exact base (see the `npm test` row below and `PROJECT_STATE.md`) — pre-existing, not a B-01 regression, but not "green." The production build, pgTAP, and the mandatory 13-spec CI-equivalent Playwright manifest are green. The literal `CI=1 npm run e2e` gate (all 32 spec files, as listed in the dispatch's required commands) is **RED** on this branch — confirmed by a partial run (89 test attempts, 27 distinct failing titles, all in `tests/e2e/flows/proposal-*`) that Brent directed be stopped early once red was unambiguous, rather than waiting out the full multi-hour matrix. Per the dispatch: *"C-01's literal E2E exception does not apply. If CI=1 npm run e2e is red, record it, independently reproduce/classify against exact base 982f456deeecdeefd14a08339a4b40676454128c in a safe disposable local copy, do not waive it, and stop for a new Brent decision."* That reproduction — also a representative, non-exhaustive, Brent-directed-early-terminated sample — is recorded in **§ Literal E2E gate — exact results and base-comparison classification** below. **No waiver is claimed, granted, or inherited from C-01 or any other unit anywhere in this document.** Nothing in this unit was staged or committed while this gate remained unresolved.

**Work ID:** B-01 (dispatched as PR 1 item 2 closure recovery, following C-01)
**Branch:** `fix/proc-gate` · **Worktree:** `/Users/brentcurtis/dev/wt/proc-gate`
**Base SHA:** `982f456deeecdeefd14a08339a4b40676454128c` — this worktree's `origin/main` at lock, verified equal by `git ls-remote` before and during the work. **Post-lock finding:** a later, read-only `git ls-remote origin refs/heads/main` (during the base-comparison work) showed live `origin/main` had advanced to `b4929b3627a3a640312ea678c5c57c9857d50920`. No fetch, rebase, merge, staging, or commit was performed in response — this worktree's branch remains based on `982f456d` exactly as required, and the base-comparison worktree was built from `982f456d`, not from the new tip. This is disclosed as a fact discovered, not acted on.
**Final HEAD / commit count:** recorded in the completion report (this document is committed with the phase, not before).
**Not pushed, no PR, not merged, not deployed.** No production database, Supabase Management API, Vercel, provider, or secret-state access occurred. The only environment touched is the local Docker Supabase stack already running on this machine (`sxlogxqzmarhqsblxmtj`, loopback `127.0.0.1`), reset from migrations and reseeded with synthetic E2E fixtures — the same shared stack used by other concurrent local sessions; coordination checks (no active non-idle DB connections, no active `vitest`/`playwright`/`next` processes, nothing bound to port 3000) were run immediately before the reset.

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

## Validation

| Gate | Result |
|---|---|
| Focused policy tests (16) | fail-on-base (module missing) → pass after implementation |
| `git diff --check` | clean |
| `npm run guard:actions` | OK — 17 uses, 1 workflow file |
| `npm run guard:migrations` | OK — 41 migration files, no RLS disable/DROP/TRUNCATE/destructive ALTER |
| `npm run guard:browser` | OK — 1144 files, 688 modules from 509 entrypoints, no boundary violation |
| `npm run guard:secrets` | OK — re-run after final staging in the completion report |
| `npm run type-check` | exit 0 |
| `npm run lint` (`--max-warnings=0`) | exit 0 |
| `npm run lint:testid` (advisory) | exit 1, 2621 problems repo-wide (baseline is red, unchanged in kind). Per-touched-file finding counts measured base-vs-branch via `git show <base>:<file> | eslint --stdin` against the same testid config: **identical in every touched file** — `ModuleCard.tsx` 1/1, docente `index.tsx` 3/3, demo `index.tsx` 6/6, both API routes 0/0. No new finding. |
| Focused B-01 suite (9 files) | 204/204 passed |
| `npm test` (full) | 379 files passed / 1 failed; **8673 passed, 11 skipped, 5 failed** — all 5 failures in `__tests__/pages/community/workspace.mention-scope.test.tsx` (`localStorage.getItem` undefined in `pages/community/workspace.tsx:226`), a file this unit never touched. Reproduced identically (same 5 titles, same error) by stashing all B-01 changes and re-running the same file against exact base `982f456d` — confirmed pre-existing, not a B-01 regression. |
| `npm run build` | exit 0, against a local-stack `.env.local` (synthetic keys only) |
| `npm run test:db` (pgTAP) | `supabase db reset` (all 41 migrations, including `20260902162557_fne_zoom_operator_tenant.sql` already on `main`) → `supabase test db`: **Files=25, Tests=2143, Result: PASS** |
| Mandatory CI-equivalent E2E | Full CI recipe: `.env.local` from `supabase status -o json` plus `ZOOM_MODE=mock`, `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL`, `FEATURE_ZOOM_MEETINGS` flags (matching `.github/workflows/ci.yml`) → `npm run build` → `node scripts/ci/seed-e2e.mjs` (idempotent; second run reused/updated existing synthetic rows) → `CI=1 npx playwright test <13 mandatory specs> --project=chromium`: **192 passed (2.1 min), 0 failed, 0 flaky, 0 skipped** → `node scripts/ci/e2e-mandatory.mjs --check`: **OK — 13 mandatory spec(s) ran with no skips** |
| Literal `CI=1 npm run e2e` (32 spec files) | **RED — Brent-directed early termination after confirmation, not a completed run.** See the dedicated section below for the exact evidence and classification. |

## Literal E2E gate — exact results and base-comparison classification

**Branch run.** `CI=1 npm run e2e` was started on `fix/proc-gate` and let run to `/tmp/full-e2e-branch.log`. After ~12 minutes and 89 recorded test attempts (38 passed, 27 distinct titles failed with retries exhausted, all failures inside `tests/e2e/flows/proposal-admin-visibility.spec.ts`, `tests/e2e/flows/proposal-buckets.spec.ts`, and `tests/e2e/flows/proposal-config.spec.ts`), Brent directed the process stopped early rather than waiting out the full ~32-file, multi-hour matrix, since the gate was already unambiguously red. The background process (task `benig0vby`) was stopped cleanly via `TaskStop`; no orphaned `playwright`/`next` process or port-3000 listener remained afterward. `/tmp/full-e2e-branch.log` is preserved (349 lines) and was not modified. **This is a partial, not a complete, branch run** — no final "N passed / M failed" summary line exists because the process was terminated before reaching one. The distinct failing (spec, title) pairs recorded before termination:

- `proposal-admin-visibility.spec.ts:31:5` — "Admin can see ProposalConfigPanel on licitación detail"
- `proposal-admin-visibility.spec.ts:44:5` — "Non-admin (docente) cannot see ProposalConfigPanel"
- `proposal-admin-visibility.spec.ts:64:5` — "Admin can toggle ProposalConfigPanel open and closed"
- `proposal-buckets.spec.ts:45:7` — "Distribución de Actividades section is visible and collapsible"
- `proposal-buckets.spec.ts:63:7` — "Toggling a bucket on shows hours input, toggling off hides it"
- `proposal-buckets.spec.ts:92:7` — "Adding a custom bucket shows it in the list"
- `proposal-buckets.spec.ts:113:7` — "Enabling multiple buckets shows correct summary totals"
- `proposal-config.spec.ts:44:7` — "Selecting a plantilla loads its default hours"
- `proposal-config.spec.ts:64:7` — "Changing hours updates MINEDUC validation status live" (last one to reach a conclusive retry-exhausted failure before the run was stopped)

**Base-comparison run.** A detached, disposable worktree `proc-gate-base` was created at exact base `982f456deeecdeefd14a08339a4b40676454128c` (`git worktree add --detach`, outside and independent of the `fix/proc-gate` worktree — no existing worktree was touched). `npm ci`, a CI-recipe `.env.local` (own `NEXT_PUBLIC_BASE_URL=http://localhost:3000`, matching `playwright.config.ts`'s hardcoded `baseURL`), `npm run build`, and `node scripts/ci/seed-e2e.mjs` (idempotent against the already-seeded shared local stack) all completed successfully on the exact base. A representative, **not exhaustive**, subset — the three spec files that had already failed on the branch — was then run: `CI=1 npx playwright test tests/e2e/flows/proposal-admin-visibility.spec.ts tests/e2e/flows/proposal-buckets.spec.ts tests/e2e/flows/proposal-config.spec.ts --project=chromium`. This run was also stopped early per the same directive once the pattern was confirmed; a `kill -TERM` was sent to the playwright process (PID 24955) and its `npm exec` wrapper (PID 24936), the pipe closed, and the harness reported the background task complete. A leftover orphaned `next-server` webServer child (PID 24986, bound to port 3000, cwd `proc-gate-base`) that did not die with its parent was found and stopped separately (`kill -TERM`); port 3000 was confirmed free afterward. The captured output (`bzhon31rz.output`, 150 lines — truncated to its own tail by an embedded `| tail -150` in the run command, so it does not include the run's first ~13 test attempts) recorded these conclusively failed (all 3 attempts exhausted) titles on the exact base:

- `proposal-buckets.spec.ts:63:7` — "Toggling a bucket on shows hours input, toggling off hides it"
- `proposal-buckets.spec.ts:92:7` — "Adding a custom bucket shows it in the list"
- `proposal-buckets.spec.ts:113:7` — "Enabling multiple buckets shows correct summary totals"
- `proposal-config.spec.ts:44:7` — "Selecting a plantilla loads its default hours"
- `proposal-config.spec.ts:64:7` — "Changing hours updates MINEDUC validation status live"
- `proposal-config.spec.ts:94:7` — "Non-compliant hours disable the generate button"
- `proposal-config.spec.ts:118:7` — "Selecting an expired certificate shows blocking warning"
- `proposal-config.spec.ts:133:7` — "Vista Previa button is visible when plantilla and ficha are selected"
- `proposal-config.spec.ts:152:7` — "Valid config: generate succeeds and download link appears in history" (single attempt shown, ✘, before the run was stopped — retries not exhausted, so this one title is *observed failing once*, not conclusively retry-exhausted, on the base)

**Classification.** Every title from the base run's captured window (`proposal-buckets.spec.ts:63:7`, `:92:7`, `:113:7`, `proposal-config.spec.ts:44:7`, `:64:7`) also appears, failing identically, in the branch run's captured window — an exact overlap of 5 conclusively-failed titles reproducing on both the branch and the exact base, with the same spec files, same test names, and the same ~15s timeout-shaped failure signature. `proposal-config.spec.ts:94:7`, `:118:7`, `:133:7`, and `:152:7` failed on the base but were not yet reached by the branch run before it was stopped (so branch-side status for those four is unknown, not "passing"). Conversely, `proposal-admin-visibility.spec.ts`'s three titles and `proposal-buckets.spec.ts:45:7` failed on the branch but fall outside the base run's captured window (truncated away by the embedded `tail -150`, not because they passed on the base — their base-side status is likewise unknown from this evidence). **What this evidence supports:** a representative, non-exhaustive sample of the same `proposal-*` flow specs fails with matching spec files, titles, and failure signatures on both the branch and the exact base `982f456d`, consistent with — but not a complete re-verification of — the pre-existing-failure category the C-01 unit separately documented on a different, older base (`804794df`). **What this evidence does not support:** a claim that all 27 branch failures are pre-existing (9 of the 27 distinct branch-failing titles have no corresponding base-run observation at all in the captured logs), or that the full `CI=1 npm run e2e` gate is anything other than red on this branch. **No exception is claimed, granted, or inherited from C-01 or from any other unit.** The gate's disposition — whether to authorize a full from-scratch reproduction, accept this partial evidence, or treat the gate as blocking — is Brent's decision alone.

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
- The pre-existing `__tests__/pages/community/workspace.mention-scope.test.tsx` failure (5 tests, unrelated file) is disclosed above as pre-existing on the exact base, not fixed by this unit (out of scope).
