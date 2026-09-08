# Review request — B-01: cobertura-gate consistency (Procesos de Cambio PR 1 item 2 closure recovery)

**STATUS (A9, 2026-09-05): BRENT APPROVED A NARROW B-01-SPECIFIC EXCEPTION FOR THE EXACT 60 LITERAL FULL-E2E FAILURES OBSERVED ON EXECUTABLE CANDIDATE `633a9e24` AGAINST EXACT CURRENT-MAIN BASELINE `8f5bbe6d` (RECORDS-ONLY HEAD `f5bc5e88`); INDEPENDENT CODEX A8 REVIEW RETURNED `APPROVE` WITH ZERO BLOCKING FINDINGS; MERGE `633a9e24` AND RECORDS COMMIT `f5bc5e88` PUSHED TO `origin/fix/proc-gate`; PR [#84](https://github.com/brentcurtis76/fne-lms/pull/84) RECALCULATED AGAINST CURRENT `main` `8f5bbe6d` — HEAD `f5bc5e88`, 18 FILES, `MERGEABLE`/`CLEAN`; CI RUN [33968607547](https://github.com/brentcurtis76/fne-lms/actions/runs/33968607547) GREEN ON `f5bc5e88` (ALL SEVEN REQUIRED JOBS); THE LITERAL `CI=1 npm run e2e` GATE REMAINS RED UNDER THE NARROW EXCEPTION (NOT WAIVED, NOT GREEN); PR KEPT DRAFT THROUGHOUT VALIDATION AND RETURNED TO READY ONLY AFTER THE FINAL-HEAD CHECKS (see § Attempt 9); NOT MERGED, NOT DEPLOYED. B-01 AND PR 1 REMAIN `PHASE_NOT_CLOSED`.** *(See § Attempt 9 below. The A8 status that follows is preserved verbatim.)* **A8 status (2026-09-05): CURRENT `main` `8f5bbe6d` (PR #83) REINTEGRATED BY LOCAL TWO-PARENT MERGE `633a9e24a5f68c81562803df452b276bc750bfe8` (SOLE CONFLICT `PROJECT_STATE.md`, RESOLVED +1/−0 VERSUS MAIN; ALL 17 NON-`PROJECT_STATE.md` B-01 PATHS BYTE-IDENTICAL TO `9804e94b`); EVERY REQUIRED GATE GREEN ON THE INTEGRATED TREE (guards, type-check, lint, 8/224 focused, PR #83 2/81, full Vitest 394/8941, pgTAP 25/2143, both concurrency proofs, build, mandatory Playwright manifest 192/192 with no skips); THE LITERAL `CI=1 npm run e2e` GATE IS RED WITH EXACTLY THE SAME 60 TITLES, REPRODUCED IDENTICALLY ON A FRESH DETACHED `8f5bbe6d` BASELINE (intersection 60, 0 candidate-only, 0 baseline-only, retry outcomes 60/60, normalized payloads 59/60 byte-identical and 60/60 after collapsing one timing-only `Test timeout` entry on the baseline side); THE A7 EXCEPTION DOES NOT COVER THIS TREE AND NO NEW EXCEPTION WAS INFERRED — BRENT'S DECISION IS PENDING; NOTHING FROM A8 PUSHED (REMOTE HEAD STILL `9804e94b`); PR [#84](https://github.com/brentcurtis76/fne-lms/pull/84) CONVERTED TO DRAFT AND LEFT DRAFT; NOT MERGED, NOT DEPLOYED. B-01 AND PR 1 REMAIN `PHASE_NOT_CLOSED`.** *(See § Attempt 8 below. The A7 status that follows is preserved verbatim.)* **A7 status (2026-09-04): BRENT APPROVED A NARROW B-01-SPECIFIC EXCEPTION FOR THE EXACT 60 LITERAL FULL-E2E FAILURES OBSERVED ON CANDIDATE `305c7f1a` AGAINST BASELINE `8b581217` (RECORDS-ONLY HEAD `25b91f6e`); INDEPENDENT CODEX A6 REVIEW RETURNED `APPROVE` WITH ZERO BLOCKING FINDINGS; `fix/proc-gate` PUSHED TO `origin`; PR [#84](https://github.com/brentcurtis76/fne-lms/pull/84) OPENED AS A DRAFT INTO `main`; THE LITERAL `CI=1 npm run e2e` GATE REMAINS RED (NOT WAIVED, NOT GREEN); NOT MERGED, NOT DEPLOYED. B-01 AND PR 1 REMAIN `PHASE_NOT_CLOSED`.** *(See § Attempt 7 below. The A6 status that follows is preserved verbatim.)* **A6 status:** CODEX RE-REVIEW OF `8f79ff3d` RETURNED `APPROVE` (ZERO FINDINGS — intake fact); CURRENT MAIN `8b581217` INTEGRATED BY LOCAL MERGE COMMIT `305c7f1a`; EVERY REQUIRED GATE INCLUDING pgTAP, BOTH CONCURRENCY PROOFS, AND THE MANDATORY PLAYWRIGHT MANIFEST GREEN ON THE INTEGRATED TREE; THE LITERAL `CI=1 npm run e2e` GATE IS RED WITH THE SAME 60 TITLES (reproduced identically on a fresh current-main baseline: intersection 60, 0 either-only) AND THE EXCEPTION DECISION FOR THIS TREE IS BRENT'S AND PENDING. NOT PUSHED, NO PR, NOT MERGED, NOT DEPLOYED. B-01 AND PR 1 REMAIN `PHASE_NOT_CLOSED`.** *(See § Attempt 6 below. The A5 status that follows is preserved verbatim.)* **A5 status:** INDEPENDENT REVIEW RETURNED `REQUEST CHANGES` (Codex) — FINDINGS R1 AND R2 REMEDIATED LOCALLY IN ATTEMPT 5 (A5); INDEPENDENT RE-REVIEW, CURRENT-MAIN INTEGRATION, AND DATABASE-BACKED VALIDATION PENDING. *(A5, 2026-09-04 — see § Attempt 5 below. The paragraph that follows is the attempt-3 status, preserved verbatim.)* **Attempt-3 status:** The cumulative implementation produced in attempt 1 was adopted unchanged, reconciled with integrated main `d1031989` by a **local** merge on this feature branch, and revalidated end to end. Nothing was pushed, and no PR, merge into `main`, or deployment exists. The literal `CI=1 npm run e2e` gate is **RED and is never claimed green**; it now carries Brent's approved, evidence-specific exception for the exact 60 failures that attempt 3 reproduced title-for-title on the clean baseline. B-01 and the broader PR 1 remain `PHASE_NOT_CLOSED`. Three things changed materially since attempt 1's version of this document:

1. **The E2E exception is now approved, on baseline evidence, for these exact 60 failures.** The audit trail runs in three steps. **Attempt 2** ran `CI=1 npm run e2e` to **completion** (attempt 1 was stopped early at 89 attempts) and found **60 distinct failing titles, only 29 of which are `proposal-*`**; the other 31 fell outside Brent's then-current `proposal-*` wording, so attempt 2 **correctly stopped rather than inventing an exception nobody had granted**. **Attempt 3** ran the same literal gate on a disposable worktree detached at exactly `d1031989` with no B-01 code, and found the **same 60 failing titles — intersection 60, branch-only 0, baseline-only 0**. **Brent then approved** extending the B-01-specific exception to these exact 60 observed failures. That approval supersedes the `proposal-*`-only restriction **only for these 60 titles on this tree against this baseline** — not for arbitrary failures, future trees, or other phases — and it does **not** make the gate green. See § Literal E2E gate and § Baseline comparison evidence (attempt 3).
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
- `7e0ec858196591d55bbd6fa5fa6f338ac802b74e` — the attempt-2 E2E findings record (this document and `PROJECT_STATE.md`).
- `a5c07fcb0c022b864b0820263a8dcbc86279f37a` — the attempt-3 records commit recording Brent's approved baseline E2E exception (this document and `PROJECT_STATE.md` again; named here by A5, it was "its SHA is in the completion report" when attempt 3 wrote this list).
- `8f79ff3d69dca3289da55fe4e88092fd3b9ef8ee` — the A5 checkpoint commit: the R1/R2 remediation, its regression tests, and both records (named here by A6; A5 wrote "its SHA is in the A5 completion report"). This is the commit Codex re-reviewed and approved.
- `305c7f1ac082b40d2bdcb1e5774a2d91982dfcf8` — the A6 two-parent local merge of current `origin/main` `8b58121779eb744c790538b517db7cf023ad1da1` (A6, 2026-09-04).
- `25b91f6ecb4461d7dc6369efa75ebc43d7c56eb2` — the A6 records commit: this document and `PROJECT_STATE.md` only (named here by A7; A6 wrote "its SHA is in the A6 completion report"). This is the records-only head named in Brent's A7 exception and the head first pushed to `origin`.
- `9804e94bf2e975aaabac614b4f0d8ff381dc5a30` — the A7 records commit: this document and `PROJECT_STATE.md` only (named here by A8; A7 wrote "its SHA is in the A7 completion report"). This is the head CI run 33920582239 passed on and the head PR #84 still points at.
- `633a9e24a5f68c81562803df452b276bc750bfe8` — the A8 two-parent local merge of current `origin/main` `8f5bbe6d7be833a31d033032dc9ddf75988be775` (A8, 2026-09-05; not pushed).
- one A8 records commit — this document and `PROJECT_STATE.md` only (A8, 2026-09-05); its SHA is in the A8 completion report; not pushed.
- `f5bc5e888bb2cce4ac4d817865cde07fbed4ec68` — the A8 records commit named above (named here by A9; A8 wrote "its SHA is in the A8 completion report"). This is the records-only head named in Brent's A8 exception, pushed by A9 together with `633a9e24`, and the head CI run 33968607547 passed on.
- one A9 records commit — this document and `PROJECT_STATE.md` only (A9, 2026-09-05); its SHA is in the A9 completion report.

**Publication (A7, 2026-09-04):** `fix/proc-gate` pushed to `origin`; PR [#84](https://github.com/brentcurtis76/fne-lms/pull/84) `fix(assessment): unify cobertura gate behavior` into `main`. See § Attempt 7.

**Reviewable range:** `git diff d1031989..HEAD` — the **18** B-01 paths listed in § Files changed (16 code/test files plus this document and `PROJECT_STATE.md`). At `a5c07fcb` this was 16 paths; A5 added `pages/demo/assessments/[templateId]/results.tsx` and `__tests__/pages/demo/results-adapter.test.ts`, both explicitly authorized by the A5 dispatch. The count is derived from `git diff --name-only d1031989..HEAD`, not asserted. The range is pinned to the tested baseline `d1031989`, **not** to `origin/main`, which has since advanced to `8b58121779eb744c790538b517db7cf023ad1da1` (observed read-only 2026-09-03; no fetch, merge, rebase, or rerun followed). Compatibility and integration against current main are **PENDING** and are not claimed by this document. **A6:** integrated — after merge commit `305c7f1a`, `git diff --name-only origin/main..HEAD` (with `origin/main` = `8b581217`) is exactly the same 18 paths, and the 17 non-`PROJECT_STATE.md` paths are byte-identical to `8f79ff3d`; see § Attempt 6.

*A7 (2026-09-04): the branch has since been pushed and PR #84 opened — see § Attempt 7. The paragraph below is attempt 2's statement, preserved verbatim.*

**Not pushed, no PR, not merged, not deployed.** No production database, Supabase Management API, Vercel, provider, GitHub-mutating, or secret-state access occurred. `.env.local` was never inspected, printed, copied, or tracked. The pre-existing unrelated `stash@{0}` was not applied, deleted, or relied on; no other worktree or the primary checkout was touched. The only environment used is the local Docker Supabase stack already running on this machine (project ref `sxlogxqzmarhqsblxmtj`, ports 54321–54323), which attempt 2 did **not** reset and did **not** reseed — it ran against the schema and synthetic fixtures already present. Before using it, coordination checks confirmed no external client sessions (only the stack's own PostgREST/realtime/storage connections), no `vitest`/`playwright`/`next` processes, and nothing bound to port 3000.

## Attempt 5 (A5) — independent review findings and remediation

**Work ID:** B-01 remediation attempt 5 · **Date:** 2026-09-04 · **Base of the unit:** `a5c07fcb` (clean) → dirty working tree → one local checkpoint commit. **Reviewer:** Codex (independent), verdict `REQUEST CHANGES`, two findings. Brent authorized local remediation, regression tests, records, and an ordinary local checkpoint commit — nothing else.

### R1 — demo applicability disagreed with the form

`clientScoringService.scoreModule` scored **every** module indicator and passed `getDisplayOrder: () => undefined` to the shared policy (attempt-1 hotspot 6), and the demo results page's `transformModuleForScoring` dropped `displayOrder` and `isActiveThisYear`. Codex reproduced two divergences through the real adapter + scorer: **(A)** an *inactive* first cobertura carrying a stale `false` gated an active frecuencia answered 100 — form applicable `[frecuencia]`, client scored `[cobertura]`, score 0 instead of 100; **(B)** raw input order `[frecuencia, cobertura]` with display orders 2 and 1 — form applicable `[cobertura]`, client scored `[frecuencia, cobertura]`, score 50 instead of 0.

**Fix.** `pages/demo/assessments/[templateId]/results.tsx` carries `display_order` and `is_active_this_year` through the adapter and exports the three page-local transforms so the real adapter path is testable. `clientScoringService.ts` adds both optional fields to its input types; `scoreModule` now (1) filters to `is_active_this_year !== false` **before** resolving the gate — exactly the order the form and the server scorer use — (2) returns `null` for a module with no active indicator so it never enters a module/objective weighted denominator (an objective whose modules are all inactive was already skipped by `calculateDemoScores`), and (3) passes the real `display_order`. Missing metadata means active and unordered, so legacy payloads score exactly as before. No expectation policy or unrelated scoring rule changed.

### R2 — historical gap compatibility

`fetchInstanceGapAnalysis` treated presence in persisted `module_scores` as proof of applicability. True for rows written by the gate-aware `calculateModuleScore` (which omits gated-out indicators), false for rows written before it (which stored them at `normalizedScore: 0`). Codex generated such a row with the `d1031989` scorer — cobertura `rawValue: false` / 0, frecuencia `rawValue: 20` / 20 — and the reader reported frecuencia as "behind" although the current scorer would not score it at all. This is the attempt-2 "not retroactive" limitation, now addressed **at read time**.

**Fix.** The persisted set is still the active set established at scoring time — never re-derived from today's mutable expectations. Over that set, in snapshot display order, the reader re-resolves the shared gate using only evidence the row itself carries: the leading cobertura indicator's persisted `rawValue` when it is a boolean, otherwise its `normalizedScore === 100` (an exact inverse of a stored "Sí" for this category), otherwise `undefined`. A category guard makes it structural that no other indicator's score is ever consulted, so an unrelated zero can never be mistaken for a closed gate. Newly written rows whose gated-out indicators are already absent behave exactly as before. **Stored rows, aggregate `moduleScore`/`totalScore`, and responses are never rewritten or recalculated** — this corrects the gap *read*, not historical scores.

### Legacy / ambiguous evidence — documented safe behaviour

| Persisted leading cobertura row | Read as | Downstream indicators |
|---|---|---|
| `rawValue: true` | open | applicable |
| `rawValue: false` | closed (`no`) | excluded |
| no boolean `rawValue`, `normalizedScore: 100` | open | applicable — 100 is only ever produced by a stored "Sí" |
| no boolean `rawValue`, `normalizedScore: 0` | **`unanswered` (fail-closed)** | excluded — the reader cannot tell "No" from unanswered and does not pretend to; both close the gate under the shared policy, so the applicability outcome is identical |
| leading cobertura absent from the persisted set (inactive that year) | no gate | the next persisted indicator leads; a non-cobertura leader means every persisted indicator applies |
| module with no cobertura leader | no gate | unchanged; a zero elsewhere never infers a gate |

Only `100` ever *opens* a gate, so ambiguous evidence can hide nothing that was really assessed. No product decision was required; nothing here needs data access this unit lacks.

### Regression proof — how it was obtained, and its limits

The A5 tests were **not** written before the implementation in this session: the remediation and its tests already existed as an uncommitted working tree when this continuation started, and any validation the earlier A5 session ran left no log, so it is treated as **UNVERIFIED**. Fail-on-old proof was therefore obtained **non-destructively after the fact**: the `a5c07fcb` versions of `clientScoringService.ts`, `scoringService.ts`, and `results.tsx` were extracted with `git show HEAD:<path>` into the session scratchpad (outside the worktree), and two throw-away Vitest configs redirected only those three import specifiers to the old copies. The old page copy received one appended `export { … }` statement so its page-local transforms could be imported — exposure only, no behavioural edit. Nothing in the worktree was modified, stashed, reset, or checked out; `git status` before and after the proof runs is identical.

| Run | Old modules | Result on the final A5 test set | Failures |
|---|---|---|---|
| A | all three | **15 failed / 84 passed** of 99 | 6 R1 (`clientScoringService.test.ts`), 5 R2 (`fetchInstanceGapAnalysis.test.ts`), 4 adapter (`results-adapter.test.ts`) — every failure is an `AssertionError` on applicability or score, none an import/export error |
| B | `results.tsx` only (fixed scorers) | **4 failed / 2 passed** of 6 | the four behavioural adapter cases; the assertion values (`['cob']` vs `['frec']`, `['frec','cob']` vs `['cob']`) match Codex's reproductions A and B exactly |

The 84 / 2 passes on old code are the preservation cases (unanswered gate, legacy metadata, unchanged weighting, immutability, open historical gate, no-gate inference), which are meant to pass on both trees. The same 99 tests pass on the fixed tree. One test was added in this continuation — the fail-closed row in the table above — because the existing set pinned the "100 → open" reading but not the "0 → closed" one.

### A5 scope note on the E2E exception

Brent's approved exception covers the exact prior tested tree and its 60 reproduced failures. It is historical evidence for that tree; **it is not claimed to cover this changed executable tree**, and no broader exception was requested or granted. The literal gate, pgTAP, and the mandatory Playwright manifest were **not run on A5** (see § Attempt 5 validation).

## Attempt 6 (A6) — current-main integration and CI-parity validation

**Work ID:** B-01 attempt 6 · **Date:** 2026-09-04 · **Unit type:** integration-and-validation only — no B-01 executable code or test was changed. **Intake (supplied by Brent, revalidated locally before acting):** branch HEAD `8f79ff3d69dca3289da55fe4e88092fd3b9ef8ee` on `fix/proc-gate`, clean worktree and index, common dir `/Users/brentcurtis/Documents/fne-lms-working/.git`, no Git lock or in-progress operation, live `refs/heads/main` exactly `8b58121779eb744c790538b517db7cf023ad1da1`, branch never pushed. Codex's independent re-review of `8f79ff3d` returned `APPROVE` with zero findings (8 focused files / 224 tests, type-check, lint) — that verdict is an intake fact recorded here, not something this unit re-verified.

**Preflight.** Port 3000 free; no Vitest/Playwright/Next process and no other session holding the proc-gate worktree; every local Supabase service URL resolved to `127.0.0.1` (API 54321, DB 54322) and the only database clients were the stack's own containers. The pre-existing ignored `.env.local` (SHA-256 `600fdef6b24a31af65caeb4ec58837592bd6660c9883676ade81fc1a4d22fa7f`) was backed up byte-for-byte to a mode-700 scratchpad directory outside the repository, never opened or printed, and restored at the end with its hash re-verified. No production, remote Supabase, Vercel, or GitHub-mutating access occurred; nothing was pushed.

### Current-main delta inspected (`d1031989..8b581217`)

Five commits, all from PR [#82](https://github.com/brentcurtis76/fne-lms/pull/82) `feat/sm-sim` (`bdff3107`, `b8aefb17`, `d3521914`, `9b6f7f2c`, merge `8b581217`): 102 paths, +3703/−379.

| Check | Result |
|---|---|
| Path overlap with the 18-path B-01 range | **`PROJECT_STATE.md` only** |
| Semantic overlap (term search over the non-Markdown delta for `cobertura`, `assessment-builder`, `scoringService`, `clientScoring`, `ModuleCard`, `docente/assessments`, `demo/assessments`, `resolveCoberturaGate`, `fetchInstanceGapAnalysis`, `module_scores`) | **0 changed lines** (one unchanged `package.json` context line) |
| Dependencies | `package.json` adds five npm scripts (`simulation:*`, `test:simulation-db`); **no dependency change; `package-lock.json` unchanged** |
| CI workflow, `supabase/`, `playwright.config.ts`, Vitest configs, `scripts/ci/` | **unchanged** |
| Records | `PROJECT_STATE.md` (three W-SIM-01 Meta entries + three evidence paragraphs) and two new `fase-sm-sim-i1-*` review docs |
| Closest-looking files, read | `types/roles.ts` adds two optional `School` fields (`tenant_kind`, `internal_zoom_testing_enabled`); `pages/api/admin/transformation-assessments.ts` gains a QA-tenant filter — the admin *transformation* assessment surface, not the assessment-builder/cobertura domain |

### Merge

`git merge --no-ff origin/main` → merge commit **`305c7f1ac082b40d2bdcb1e5774a2d91982dfcf8`** (parents `8f79ff3d` + `8b581217`). Sole conflict `PROJECT_STATE.md`, both sides prepending Meta entries at line 8. Resolution: main's file kept in full with the B-01 entry restored verbatim above main's three W-SIM-01 entries — verified as **1 added / 0 removed lines versus `origin/main:PROJECT_STATE.md`**, 9 added / 0 removed versus `8f79ff3d`, all nine of main's added lines present, no conflict markers. Post-merge: `origin/main` is an ancestor of HEAD; all 17 non-`PROJECT_STATE.md` B-01 paths are **byte-identical to `8f79ff3d`**; `git diff --name-only origin/main..HEAD` is **exactly the 18 B-01 paths**; worktree clean; `stash@{0}`, every other worktree, and the detached `d1031989` baseline worktree untouched. The A6 records commit that follows changes only the two Markdown records.

### Validation on the integrated candidate (HEAD `305c7f1a`, Node v22.22.0 / npm 10.9.4, `npm ci` from the lockfile first)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Install | `npm ci` | 0 | clean install from `package-lock.json` |
| Actions guard | `npm run guard:actions` | 0 | OK — 17 uses, 1 workflow file |
| Migration guard | `npm run guard:migrations` | 0 | OK — 41 migrations, no RLS disable / DROP / TRUNCATE / destructive ALTER |
| Browser boundary guard | `npm run guard:browser` | 0 | OK — 1154 files, 691 modules from 510 entrypoints (main's delta added files; no violation) |
| Typecheck | `npm run type-check` | 0 | clean |
| Lint | `npm run lint` (`--max-warnings=0`) | 0 | clean |
| Focused B-01 suites + adapter | `npx vitest run` × 8 files | 0 | **8 files, 224 tests, all passed** (scoringService 85, clientScoringService 80, fetchInstanceGapAnalysis 13, submit 14, coberturaGatePolicy 16, get-progress 4, results-adapter 6, ModuleCard.gate 6) |
| Unit (Vitest, full) | `npm test` | 0 | **392 files passed; 8860 passed / 12 skipped / 0 failed** (218.9 s). +9 files / +84 tests / +1 skipped versus A5's 383 / 8776 / 11 — the nine new test files all arrive with main's sm-sim delta; the extra skip is consistent with its database-gated `production-qa-simulation.postgres` suite, which skips without `SM_SIM_LOCAL_DATABASE_TEST` |
| Whitespace/conflict | `git diff --check` | 0 | clean |
| Testid lint (advisory) | per touched file, HEAD vs `origin/main`, same `.eslintrc.testid.json` | — | errors/warnings identical: `ModuleCard.tsx` 0/1 vs 0/1, docente `index.tsx` 1/2 vs 1/2, demo `index.tsx` 1/5 vs 1/5, `results.tsx` 0/3 vs 0/3 — **no increase** |
| Local DB from scratch | `supabase db reset` (local target only, `-x` nothing, no `--linked`) | 0 | 18:52:43–18:53:14Z; 41 migrations applied; `supabase/seed.sql` absent (WARN only) |
| RLS pgTAP | `npm run test:db` | 0 | **Files=25, Tests=2143, Result: PASS** |
| Queue concurrency proof | `SUPABASE_DB_URL=… npm run test:queue` (URL from `supabase status -o env`, never printed) | 0 | 40 jobs, 2 concurrent tick loops, real `FOR UPDATE SKIP LOCKED`; every job executed exactly once (A=21, B=19); every row `done` |
| Recovery concurrency proof | `npm run test:recovery-concurrency` | 0 | all 7 assertions ✓ (candidate cooldown 1 durable job; known/unknown enqueue identically; candidate lock scoped; outbox lease 1 claim; canonical resolution; grant lease 1; bystander job untouched) |
| Gate 4 env | nine-key `.env.local` generated from `supabase status -o json` exactly as the workflow does | — | keys: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ZOOM_MODE=mock`, synthetic `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL=http://localhost:3000`, `FEATURE_ZOOM_MEETINGS=true`, `NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS=true`. **The generated file hashed identically to the pre-existing `.env.local`** (`600fdef6…`), so the "environment-key parity not checked" limitation from attempt 3 is now closed for this machine: the branch has always been running the CI recipe |
| Build | `npm run build` | 0 | Compiled; 149/149 static pages (after the env existed, as the workflow orders it) |
| Price-leak guard | `node scripts/check-price-leak.mjs` | 0 | OK — 262 files under `.next/static`, no commercial data |
| Seed | `node scripts/ci/seed-e2e.mjs` (env loaded with `set -a`, never printed) | 0 | synthetic fixtures seeded 18:55:44Z |
| Mandatory CI Playwright manifest | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | 0 | **192 passed, 0 failed, 0 flaky, 0 skipped (1.7 min)** across the 13 mandatory specs; JSON SHA-256 `492a99863c98fffc4f160724e8a36772b559ef67234b8b1b18f6fd3c3cf2ce4c` |
| Mandatory no-skip check | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 0 | OK — 13 mandatory spec(s) ran with no skips |
| Literal full E2E | `CI=1 npm run e2e` | **1** | **RED — 238 passed / 60 failed / 27 skipped / 0 flaky.** See below |

Logs and both Playwright JSON reports are preserved under the session scratchpad (ignored, outside the repository); the mandatory-run JSON was copied before the full run overwrote `test-results/`.

### Literal full E2E gate on the integrated candidate — RED, exception decision pending

The attempt-3 exception covered the `0207d83c` tree against baseline `d1031989`. It does **not** cover this tree, and this unit granted or inferred no new exception. The gate was run exactly as CI would, from a recorded fresh state:

| Step | Candidate `305c7f1a` (`/Users/brentcurtis/dev/wt/proc-gate`) | Baseline `8b581217` (`/Users/brentcurtis/dev/wt/proc-gate-base-8b581217`, detached, created by A6 only because the candidate gate failed) |
|---|---|---|
| `supabase db reset` | 18:58:03–18:58:32Z, exit 0, 41 migrations | 19:54:15–19:54:45Z, exit 0, 41 migrations |
| `scripts/ci/seed-e2e.mjs` | 18:58:34Z, exit 0 | 19:54:46Z, exit 0 |
| `CI=1 npm run e2e` | 18:58:34–19:51:23Z, **52.8 min, exit 1** | 19:54:46–20:48:14Z, **53.4 min, exit 1** |
| Tests collected / workers / retries | 325 / 1 / 2 | 325 / 1 / 2 |
| **Passed / failed / skipped / flaky** | **238 / 60 / 27 / 0** | **238 / 60 / 27 / 0** |
| Retry-exhausted | 60 / 60 | 60 / 60 |
| JSON report SHA-256 | `d849a05ec463b0c99d26ad935f2e37530e0cac6afe0b1687368f3a90aa2404f1` | `bc20005aa2647d2461d9a5528e35c9b12a6cb81d26aeb6cf20a79179146a3052` |

**Comparability controls.** `package-lock.json`, `package.json`, and `playwright.config.ts` are byte-identical between the two worktrees; `git diff 8b581217..305c7f1a -- tests/ playwright.config.ts scripts/ci/` is empty; both used the same machine, Node v22.22.0, Playwright install, the same nine-key environment, and the same local stack reset and reseeded immediately before each run.

**Candidate versus the recorded 60.** The candidate's 60 failing titles (by `file:line:column`) are **exactly the 60 recorded in § Literal E2E gate** — intersection 60, candidate-only 0, recorded-only 0 — with the same per-file distribution (16 `qa-system`, 13 `auth-redirects`, 29 `proposal-*`, 2 `reservation`). A term search over the B-01 executable diff against `origin/main` for `proposal`, `licitac`, `bucket`, `mineduc`, `consultant`, `reservation`, `ledger`, `auth-redirect`, `qa-system` returns 0.

**Candidate versus current-main baseline.** Identical aggregate (238 / 60 / 27 / 0) and identical failing-title set: **intersection 60, candidate-only 0, baseline-only 0**; all 60 retry-exhausted on both sides; the first line of the normalized error message is identical for **60 of 60** shared titles. Zero candidate regressions were measured against the very main this branch would merge into. The per-file distribution is unchanged: 16 `tests/qa/qa-system.spec.ts`, 13 `tests/qa/auth-redirects.spec.ts`, 6 `proposal-web-view`, 6 `proposal-config`, 4 `proposal-document-library`, 4 `proposal-consultant-crud`, 4 `proposal-buckets`, 3 `proposal-admin-visibility`, 2 `proposal-versioning`, 2 `tests/e2e/reservation.spec.ts`. Artifacts (not committed): candidate and baseline JSON reports, full logs, seed logs, and timelines under the session scratchpad; the baseline worktree is left in place, detached at `8b581217` and clean.

**What this does and does not establish.** The literal gate is RED on the integrated candidate and is not claimed green. Whether Brent's exception extends to this tree — the same 60 titles, now reproduced against the *current* main rather than `d1031989` — is **Brent's decision and is PENDING**; nothing here grants it. Everything else required of B-01 is now green on the integrated tree.

### A6 boundaries

No push, PR, merge into `main`, deployment, production or remote database access, secret display, rebase, amend, reset, stash operation, or worktree deletion. The only Git writes are the merge commit `305c7f1a`, the A6 records commit, and the new detached baseline worktree (left in place, clean, for independent inspection). The only database writes were two `supabase db reset` cycles and synthetic seeding against the loopback local stack. The temporary `.env.local` backup was removed after the restore was hash-verified.

## Attempt 7 (A7) — approval record and publication

**Work ID:** B-01 attempt 7 · **Date:** 2026-09-04 · **Unit type:** records and publication only — no executable code or test changed; no rebase, amend, reset, stash operation, worktree removal, database reset/seed, build, Vitest, pgTAP, or Playwright rerun. `.env.local` was not opened.

### Preflight (revalidated before any write)

| Fact | Observed |
|---|---|
| Worktree / branch | `/Users/brentcurtis/dev/wt/proc-gate` on `fix/proc-gate`, common dir `/Users/brentcurtis/Documents/fne-lms-working/.git` |
| HEAD | `25b91f6ecb4461d7dc6369efa75ebc43d7c56eb2` (records-only head) |
| Executable candidate | `305c7f1ac082b40d2bdcb1e5774a2d91982dfcf8`; `git diff --name-only 305c7f1a HEAD` = `PROJECT_STATE.md`, this document — nothing else |
| Tree / index | clean; no `index.lock`; no merge/rebase/cherry-pick/bisect/revert in progress |
| Live `refs/heads/main` (`git ls-remote`) | `8b58121779eb744c790538b517db7cf023ad1da1` — unchanged; 7 ahead / 0 behind; merge-base = main |
| Remote branch / PR | no `refs/heads/fix/proc-gate` on `origin`; no open or closed PR for the branch or for B-01 |
| Cumulative diff `origin/main...HEAD` | exactly the **18** B-01 paths of § Files changed |
| Preserved | `stash@{0}` (pre-existing, on `main`), every other worktree, both detached baseline worktrees `proc-gate-base-d1031989` and `proc-gate-base-8b581217` |

### Brent's decision (2026-09-04), quoted exactly

> I approve a B-01-specific exception for the exact 60 literal full-E2E failures observed on executable candidate `305c7f1ac082b40d2bdcb1e5774a2d91982dfcf8` against exact current-main baseline `8b58121779eb744c790538b517db7cf023ad1da1`, with records-only head `25b91f6ecb4461d7dc6369efa75ebc43d7c56eb2`.
>
> This approval is based on all 60 failures reproducing on both trees with zero candidate-only failures, identical retry behavior, and identical normalized full error payloads. It does not make the gate green and is not a waiver for future trees, arbitrary failures, other phases, or the gate itself.

**Scope, restated:** the exception is bound to these three SHAs and these 60 titles (§ Literal E2E gate). It supersedes nothing about the gate itself: `CI=1 npm run e2e` is still recorded RED on `305c7f1a`, and any future executable change to this branch would need its own evidence and its own decision.

### Independent Codex A6 review — `APPROVE`, zero blocking findings (intake fact)

Recorded from Brent's dispatch, not re-derived here. Codex independently confirmed that all 60 complete normalized per-attempt error payloads match between the candidate (`305c7f1a`) and baseline (`8b581217`) runs after removing only expected run-specific noise — not merely their first lines, which is what § Attempt 6 had compared. Codex also reran the eight focused suites: 8 files / 224 tests passed, with type-check and lint clean.

### Publication

| Step | Result |
|---|---|
| Push | `git push -u origin fix/proc-gate` → new remote branch at `25b91f6e`; live main re-read as `8b581217` immediately before the push |
| Draft PR | [#84](https://github.com/brentcurtis76/fne-lms/pull/84) `fix(assessment): unify cobertura gate behavior`, base `main`, head `fix/proc-gate` @ `25b91f6e`, opened as a draft |
| PR body discloses | the shared cobertura-gate behaviour; the A5 remediation, Codex re-review `APPROVE` and Codex A6 `APPROVE`; current-main integration via `305c7f1a`; every green required validation; the literal gate's 60 failures and their exact reproduction on baseline `8b581217`; Brent's exception verbatim; that the gate is not green; this record's path |
| Records commit | one ordinary commit (no amend) changing only `PROJECT_STATE.md` and this document; `git diff --check` and the staged-index secret guard run before it; SHA in the A7 completion report |
| Ready-for-review | after the records push, live `refs/heads/main` is re-read: the PR is marked ready **only if** main is still `8b581217`; otherwise it stays a draft and A7 stops with findings |
| Checks | the final head's GitHub checks are monitored to a terminal result and reported; **nothing is merged** |

### `PROJECT_STATE.md` wording correction

The A6 sentence “all 17 non-record B-01 paths are byte-identical to `8f79ff3d`” now reads “all 17 non-`PROJECT_STATE.md` B-01 paths are byte-identical to `8f79ff3d`”. This document is one of the 17 and did change after `8f79ff3d`, so “non-record” was inaccurate; the evidence (17 paths byte-identical, `PROJECT_STATE.md` merged) is unchanged. This file already used the correct wording in § Reviewable range and § Merge.

### A7 boundaries and what remains

No merge into `main`, no deployment, no production, provider, remote-database, or secret access, no CI repair, no scope change. The literal `CI=1 npm run e2e` gate remains **RED** under the approved exception and is not claimed green; GitHub's `Gate 4 — E2E` job runs the mandatory manifest (green locally, 192/192), not the literal full suite, and its result on the PR head is reported from the checks, not asserted. **B-01 and PR 1 remain `PHASE_NOT_CLOSED`**: closure still requires independent PR review, final CI acceptance on the PR head, Brent's merge decision, and the required post-merge verification.

## Attempt 8 (A8) — current-main reintegration and revalidation (PR #83 delta)

**Work ID:** B-01 attempt 8 · **Date:** 2026-09-04/05 (preflight 23:49Z; both literal gates complete 03:00Z; records committed afterwards, see the A8 completion report) · **Unit type:** integration-and-validation only — no B-01 executable code or test changed, no PR #83 code touched. **Intake (supplied by Brent from an independent Codex inspection, revalidated locally before acting):** PR [#84](https://github.com/brentcurtis76/fne-lms/pull/84) open, ready, `CONFLICTING` at head `9804e94bf2e975aaabac614b4f0d8ff381dc5a30` (local = remote); CI run [33920582239](https://github.com/brentcurtis76/fne-lms/actions/runs/33920582239) green on that exact head (all seven required jobs); live `main` advanced from `8b581217` to `8f5bbe6d7be833a31d033032dc9ddf75988be775` through PR [#83](https://github.com/brentcurtis76/fne-lms/pull/83) (post-merge `main` run [33921234076](https://github.com/brentcurtis76/fne-lms/actions/runs/33921234076) green, seven jobs). Every intake fact was re-observed, not trusted.

### Preflight (all expected facts held; nothing was modified before they did)

| Fact | Observed |
|---|---|
| Common dir / worktree / branch | `/Users/brentcurtis/Documents/fne-lms-working/.git` · `/Users/brentcurtis/dev/wt/proc-gate` · `fix/proc-gate` |
| HEAD (local = `origin/fix/proc-gate` = PR head) | `9804e94b` |
| Tree / index / Git state | clean; no `index.lock`; no `MERGE_HEAD`/`REBASE_HEAD`/`CHERRY_PICK_HEAD`/`BISECT_LOG`/`REVERT_HEAD` in the common dir or any worktree gitdir (a leftover `AUTO_MERGE` ref of the primary checkout is a merge-ort artifact, not an in-progress operation) |
| Ancestry | `8b581217` and `305c7f1a` both ancestors of HEAD; divergence from `origin/main` **8 ahead / 2 behind** |
| Live `refs/heads/main` | `8f5bbe6d` at every checkpoint (preflight, before fetch, before the database stage, before the literal gate, before the baseline, at the end) |
| Competing runners | no Vitest/Playwright/Next/`supabase db` process; port 3000 free; no pending CI run on the branch |
| Local Supabase | `API_URL` `http://127.0.0.1:54321`, `DB_URL` `127.0.0.1:54322` — loopback only |
| New baseline path `/Users/brentcurtis/dev/wt/proc-gate-base-8f5bbe6d` | absent and unregistered |
| Synthetic merge (`git merge-tree --write-tree origin/main HEAD`) | exactly one conflict: `PROJECT_STATE.md` |
| PR #84 | converted to **draft** (`gh pr ready --undo`) before any branch write |
| `.env.local` (ignored, pre-existing) | SHA-256 `600fdef6b24a31af65caeb4ec58837592bd6660c9883676ade81fc1a4d22fa7f`, backed up byte-for-byte to a mode-700 scratchpad directory outside the repository, never opened or printed |

### PR #83 / main delta inspected (`8b581217..8f5bbe6d`)

Two commits (`8e7e7678`, merge `8f5bbe6d`), six paths, +767/−7: `PROJECT_STATE.md` (+1 Meta line, B2c-M1), `pages/api/cron/cleanup-learning-path-sessions.ts`, `pages/api/cron/update-learning-path-summaries.ts` (a file-local `authorizeMaintenanceRequest` — fail-closed `CRON_SECRET` bearer check with `timingSafeEqual`, 503 when unconfigured, 401 otherwise), their two `__tests__/api/cron/*.test.ts` files, and `docs/planning/reviews/fase-b2c-m1-review-request.md`. Path overlap with the 18 B-01 paths: **`PROJECT_STATE.md` only**. Semantic overlap: a term search over the non-Markdown delta for `cobertura`, `assessment-builder`, `scoringService`, `clientScoring`, `ModuleCard`, `docente/assessments`, `demo/assessments`, `resolveCoberturaGate`, `fetchInstanceGapAnalysis`, `module_scores` returns **0**. No change to `package.json`, `package-lock.json`, `playwright.config.ts`, Vitest configs, `.github/`, `supabase/`, `scripts/ci/`, or `tests/`.

### Merge

`git fetch origin refs/heads/main:refs/remotes/origin/main` (main only; verified `8f5bbe6d`), then `git merge --no-ff origin/main` → merge commit **`633a9e24a5f68c81562803df452b276bc750bfe8`**, parents **`9804e94b`** (branch) + **`8f5bbe6d`** (main), title `Merge origin/main 8f5bbe6d into fix/proc-gate (B-01 A8 integration)`. No rebase, amend, reset, stash operation, or checkout-discard. Sole conflict `PROJECT_STATE.md`: both sides insert a Meta entry at line 8. Resolution: `origin/main:PROJECT_STATE.md` kept in full, with the B-01 line from `9804e94b` (byte-identical, verified) restored immediately above main's new B2c-M1 entry, main's records untouched in wording and order. Verified: the resolved file differs from `origin/main:PROJECT_STATE.md` by **1 added / 0 removed lines** and from `9804e94b:PROJECT_STATE.md` by 1 added / 0 removed; no conflict marker. Post-merge: `origin/main` is an ancestor of HEAD; **0 behind / 9 ahead**; `git diff --name-only origin/main..HEAD` is **exactly the 18 B-01 paths** (set-identical to the pre-merge list); all **17 non-`PROJECT_STATE.md` B-01 paths are byte-identical to `9804e94b`** (blob-by-blob); `git diff --name-only 9804e94b HEAD` is exactly main's six paths; `stash@{0}` and every other worktree untouched (31 worktrees registered after the baseline was added, 30 before).

### Validation on the integrated candidate (HEAD `633a9e24`, Node v22.22.0 / npm 10.9.4, Supabase CLI **2.110.0** — the version CI pins)

| Gate | Command | Exit | Result |
|---|---|---|---|
| Install | `npm ci` | 0 | clean (23:53:01–23:53:24Z) |
| Actions guard | `npm run guard:actions` | 0 | OK — 17 uses, 1 workflow file |
| Migration guard | `npm run guard:migrations` | 0 | OK — 41 migrations, no RLS disable / DROP / TRUNCATE / destructive ALTER |
| Browser boundary guard | `npm run guard:browser` | 0 | OK — 1154 files, 691 modules from 510 entrypoints |
| Secret guard | `npm run guard:secrets` | 0 | OK — 2518 tracked paths from the Git index, 0 findings (rerun on the staged index before the A8 records commit) |
| Typecheck | `npm run type-check` | 0 | clean |
| Lint | `npm run lint` (`--max-warnings=0`) | 0 | clean |
| Whitespace/conflict | `git diff --check` | 0 | clean (and `--cached` before the records commit) |
| Focused B-01 suites + adapter | `npx vitest run` × 8 files | 0 | **8 files, 224 tests, all passed** |
| PR #83 suites | `npx vitest run` × 2 `__tests__/api/cron/*` files | 0 | **2 files, 81 tests, all passed** |
| Unit (Vitest, full) | `npm test` | 0 | **394 files passed; 8941 passed / 12 skipped / 0 failed** (236.1 s) — +2 files / +81 tests versus A6's 392 / 8860, exactly PR #83's two suites |
| Testid lint (advisory) | per touched UI file, HEAD vs `origin/main`, same `.eslintrc.testid.json` | — | identical: `ModuleCard.tsx` 0/1 vs 0/1, docente `index.tsx` 1/2 vs 1/2, demo `index.tsx` 1/5 vs 1/5, `results.tsx` 0/3 vs 0/3 — **no increase** |
| Local DB from scratch | `supabase db reset` (local target, loopback) | 0 | 00:10:54–00:11:26Z; 41 migrations applied |
| RLS pgTAP | `npm run test:db` | 0 | **Files=25, Tests=2143, Result: PASS** |
| Queue concurrency proof | `SUPABASE_DB_URL=… npm run test:queue` (URL from `supabase status`, never printed) | 0 | 40 jobs, 2 concurrent tick loops, every job executed exactly once (A=21, B=19) |
| Recovery concurrency proof | `npm run test:recovery-concurrency` | 0 | all 7 assertions ✓ |
| Gate 4 env | nine-key `.env.local` generated from `supabase status -o json` exactly as the workflow does | — | keys `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL`, `ZOOM_MODE=mock`, synthetic `CRON_SECRET`, `NEXT_PUBLIC_BASE_URL=http://localhost:3000`, `FEATURE_ZOOM_MEETINGS=true`, `NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS=true`; **hashed identically to the pre-existing `.env.local`** (`600fdef6…`) |
| Build | `npm run build` | 0 | Compiled; 149/149 static pages (00:11:39–00:12:49Z, after the env existed) |
| Price-leak guard | `node scripts/check-price-leak.mjs` | 0 | OK — 262 files under `.next/static`, no commercial data |
| Seed | `node scripts/ci/seed-e2e.mjs` (env loaded with `set -a`, never printed) | 0 | synthetic fixtures seeded 00:12:50Z |
| Mandatory CI Playwright manifest | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | 0 | **192 passed, 0 failed, 0 flaky, 0 skipped (2.0 min)**; JSON SHA-256 `430fe5a6275beabd0eb92e8f7d2d71cef3b750f36e9618cee218241d28876a55` |
| Mandatory no-skip check | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 0 | OK — 13 mandatory spec(s) ran with no skips |
| Literal full E2E | `CI=1 npm run e2e` (fresh reset + CI reseed immediately before) | **1** | **RED — 238 passed / 60 failed / 27 skipped / 0 flaky.** See below |

Two procedural incidents, both on this unit's side and both corrected before any result was taken: **(1)** the first database stage invoked `npx --no-install supabase`, which resolved to a stale npx-cached CLI **2.116.0** (not the pinned 2.110.0); its `db reset` removed the database container and stalled for ~10 min pulling a different Postgres image. That process was stopped, the stack was restarted with the Homebrew CLI 2.110.0 (`supabase stop` → `supabase start`, loopback Docker only; Postgres image `17.6.1.143`), and every database-backed result above comes from 2.110.0. **(2)** the first literal-gate attempt ran `seed-e2e.mjs` one second after `db reset`, before GoTrue was ready (`listUsers failed`); that attempt was stopped before any result was taken, and the procedure gained a readiness probe on the local auth/REST health endpoints (2 s wait observed) plus an abort-on-seed-failure. Neither incident touched the repository, the branch, or the candidate tree; the aborted logs are preserved alongside the valid ones.

### Literal full E2E gate — RED on the integrated candidate; reproduced exactly on a fresh `8f5bbe6d` baseline

The A7 exception is bound to candidate `305c7f1a` against baseline `8b581217`. It does **not** cover this tree, and this unit granted or inferred no new exception. Because the candidate gate was red, the comparison baseline was built only then: a new detached worktree at exact `8f5bbe6d` (path rechecked free immediately before `git worktree add`), bootstrapped through the CI recipe.

| Step | Candidate `633a9e24` (`/Users/brentcurtis/dev/wt/proc-gate`) | Baseline `8f5bbe6d` (`/Users/brentcurtis/dev/wt/proc-gate-base-8f5bbe6d`, detached, created by A8) |
|---|---|---|
| Parity | — | `package.json`, `package-lock.json`, `playwright.config.ts` byte-identical to the candidate; `git diff 8f5bbe6d..633a9e24 -- tests/ playwright.config.ts scripts/ci/` empty; `npm ci` clean; nine-key `.env.local` byte-identical to the candidate's; `npm run build` 0; price-leak guard 0 |
| `supabase db reset` (CLI 2.110.0) | 00:26:42–00:27:15Z, exit 0 | 01:45:28–01:46:03Z, exit 0 |
| `scripts/ci/seed-e2e.mjs` | 00:27:17–00:27:19Z, exit 0 | 01:46:06–01:46:08Z, exit 0 |
| `CI=1 npm run e2e` | 00:27:19–01:43:09Z, **75.8 min, exit 1** | 01:46:08–03:00:25Z, **74.3 min, exit 1** |
| Tests collected / workers / retries | 325 / 1 / 2 | 325 / 1 / 2 |
| **Passed / failed / skipped / flaky** | **238 / 60 / 27 / 0** | **238 / 60 / 27 / 0** |
| Retry-exhausted / recorded attempts | 60 / 60 · 445 | 60 / 60 · 445 |
| JSON report SHA-256 | `217625f5d4a3810bacbbdb506896cb97b89db5f0d6ab4cc40aac0e38ca945d9c` | `55e3ba92f4f741587b48383b61a4b7a8faf78fc95cd3201f691ca6431f546d9d` |
| Full log SHA-256 | `9db563448ddbaa80200d095891357bb7bf8e32f29d5a6916e5cbd2f8555fd881` | `32812d1c3cec65fdd79e92ea84b93c0838ebe935a795ace5a1649c2455fd5559` |

**Comparison (from both JSON reports, by `file:line:column` identifier).** Shared failing identifiers **60**; **candidate-only 0; baseline-only 0**; the 60-identifier-plus-title set is also **identical to the 60 recorded in § Literal E2E gate** (A2/A3/A6/A7). Retry outcomes identical **60/60** (every failure `failed,failed,failed`). Per-file distribution identical on both sides and unchanged from A6: 16 `qa-system`, 13 `auth-redirects`, 6 `proposal-web-view`, 6 `proposal-config`, 4 `proposal-document-library`, 4 `proposal-consultant-crud`, 4 `proposal-buckets`, 3 `proposal-admin-visibility`, 2 `proposal-versioning`, 2 `reservation`. Complete normalized per-attempt error payloads (all `error`/`errors` messages of all three attempts, after removing only ANSI codes, absolute paths, durations, timestamps, local ports, and UUIDs) identical for **59 of 60**. The single difference is `tests/e2e/reservation.spec.ts:27:7`, where one **baseline** attempt (not the candidate) additionally records Playwright's `Test timeout of … exceeded.` entry next to the same `page.waitForURL` timeout inside `loginAsAdmin`; that entry is a wall-clock artifact of the same failure (whether the attempt also overran the test-level timeout), appears in 72 of 445 candidate attempts and 73 of 445 baseline attempts under this run's machine load, and after collapsing only that entry the payloads are identical **60 of 60**. No candidate-only failure and no material signature difference was measured against the very main this branch would merge into.

**What this does and does not establish.** The literal gate is RED on the integrated candidate and is not claimed green. The 60 failures reproduce exactly on `8f5bbe6d` without any B-01 code. The A7 exception covers `305c7f1a`/`8b581217` only; **whether a new exception is granted for candidate `633a9e24` against baseline `8f5bbe6d` is Brent's decision and is PENDING** — this record is evidence for that decision, not authorization.

### A8 boundaries and what remains

Nothing from A8 has been pushed: `origin/fix/proc-gate` and PR #84's head remain **`9804e94b`**; PR #84 remains a **draft**. No merge into `main`, no deployment, no production, provider, remote-database, GitHub-mutating (other than the draft conversion), or secret access; no rebase, amend, reset, stash operation, checkout-discard, worktree deletion, or history rewrite. Git writes: merge commit `633a9e24`, the A8 records commit (this document and `PROJECT_STATE.md` only), and the new detached baseline worktree `proc-gate-base-8f5bbe6d` (left in place, clean, for independent inspection, alongside `proc-gate-base-d1031989` and `proc-gate-base-8b581217`). Database writes: three `supabase db reset` cycles plus synthetic seeding against the loopback stack, and one stack restart. `.env.local` restored byte-for-byte with its hash re-verified (`600fdef6…`). Artifacts (not committed): both Playwright JSON reports and full logs, per-gate logs, timelines, seed logs, the comparison outputs, and the aborted-attempt logs under the session scratchpad. **B-01 and PR 1 remain `PHASE_NOT_CLOSED`**: closure still requires Brent's exception decision for this tree, a push of `633a9e24` + the A8 records commit, CI acceptance on that head, PR #84 returned to ready, independent PR review, Brent's merge decision, and post-merge verification.

## Attempt 9 (A9) — A8 exception record, publication, and return to review

**Work ID:** B-01 attempt 9 · **Date:** 2026-09-05 (preflight 13:17Z) · **Unit type:** records and publication only — no executable code or test changed; no rebase, amend, reset, stash operation, checkout-discard, worktree removal, force-push, database reset/seed, build, Vitest, pgTAP, or Playwright rerun. `.env.local` was not opened.

### Preflight (revalidated before any write; every expected fact held)

| Fact | Observed |
|---|---|
| Worktree / branch | `/Users/brentcurtis/dev/wt/proc-gate` on `fix/proc-gate`, common dir `/Users/brentcurtis/Documents/fne-lms-working/.git` |
| HEAD | `f5bc5e888bb2cce4ac4d817865cde07fbed4ec68` (A8 records-only head); `git diff --name-only 633a9e24 f5bc5e88` = `PROJECT_STATE.md`, this document — nothing else |
| Tree / index / Git state | clean; no merge/rebase/cherry-pick/bisect/revert in progress |
| Live `refs/heads/main` (`git ls-remote`) | `8f5bbe6d7be833a31d033032dc9ddf75988be775` at every checkpoint (preflight, immediately before the first push, after CI on `f5bc5e88`, before the records push, after CI on the A9 head, before the ready transition) |
| Remote branch / PR #84 | `origin/fix/proc-gate` = PR head = `9804e94b`; PR open, **draft**, reported `CONFLICTING` against main (expected: the pushed head predated the `8f5bbe6d` merge) |
| Ancestry / divergence | merge-base with `origin/main` = `8f5bbe6d`; **10 ahead / 0 behind**; `633a9e24` parents `9804e94b` + `8f5bbe6d` |
| Cumulative diff `origin/main...HEAD` | exactly the **18** B-01 paths of § Files changed |
| Executable paths vs `9804e94b` | `git diff --name-only 9804e94b HEAD` over the 17 non-`PROJECT_STATE.md` paths lists only this document (changed by the A8 records commit); all 16 executable paths unchanged |
| Preserved | `stash@{0}` (pre-existing, on `main`); detached baseline worktrees `proc-gate-base-d1031989`, `proc-gate-base-8b581217`, `proc-gate-base-8f5bbe6d` each clean at their exact SHA; every other worktree untouched |
| Competing writers | none; no CI run pending on the branch |

### Independent recalculation of the A8 comparison (not trusted from the record)

The preserved A8 Playwright JSON reports were located by hash: candidate `cand-full-results.json` SHA-256 `217625f5d4a3810bacbbdb506896cb97b89db5f0d6ab4cc40aac0e38ca945d9c`, baseline `base-full-results.json` SHA-256 `55e3ba92f4f741587b48383b61a4b7a8faf78fc95cd3201f691ca6431f546d9d` — both exactly the values recorded in § Attempt 8. A fresh script (session scratchpad, not committed) walked both reports by `file:line:column` identifier and reproduced every A8 figure: stats 238 expected / 60 unexpected / 27 skipped / 0 flaky and 445 recorded attempts on both sides; failing identifiers **60 shared, 0 candidate-only, 0 baseline-only**, titles identical 60/60; per-attempt status sequences identical **60/60**; first-line normalized signature identical **60/60**; complete normalized per-attempt payloads (ANSI, absolute paths, durations, timestamps, local ports, UUIDs removed) byte-identical **59/60**; the sole difference `tests/e2e/reservation.spec.ts:27:7`, where one **baseline** attempt additionally carries Playwright's `Test timeout of … exceeded.` entry beside the same `page.waitForURL` timeout in `loginAsAdmin`; **60/60** identical after collapsing only that entry. Per-file distribution identical on both sides: 16 `qa-system`, 13 `auth-redirects`, 6 `proposal-web-view`, 6 `proposal-config`, 4 `proposal-document-library`, 4 `proposal-consultant-crud`, 4 `proposal-buckets`, 3 `proposal-admin-visibility`, 2 `proposal-versioning`, 2 `reservation`.

### Brent's decision (2026-09-05), quoted exactly

> I approve a B-01-specific exception for the exact 60 literal full-E2E failures observed on executable candidate `633a9e24a5f68c81562803df452b276bc750bfe8` against exact current-main baseline `8f5bbe6d7be833a31d033032dc9ddf75988be775`, with records-only head `f5bc5e888bb2cce4ac4d817865cde07fbed4ec68`.
>
> This approval is based on the same 60 failing identifiers reproducing on both trees with zero candidate-only failures, identical retry outcomes, and identical primary failure signatures. Fifty-nine complete normalized payloads match byte-for-byte; the remaining baseline payload contains only an additional Playwright outer wall-clock timeout beside the same underlying `waitForURL` timeout.
>
> The literal gate remains red. This is not a waiver for future trees, arbitrary failures, other phases, or the gate itself.

**Scope, restated:** bound to these three SHAs and these 60 titles (§ Literal E2E gate). `CI=1 npm run e2e` is still recorded RED on `633a9e24`; any future executable change to this branch needs its own evidence and its own decision. The A7 exception (`305c7f1a` / `8b581217` / `25b91f6e`) stays recorded verbatim in § Attempt 7 as evidence for that earlier tree.

### Independent Codex A8 review — `APPROVE`, zero blocking findings (intake fact)

Recorded from Brent's dispatch, not re-derived here. Codex independently verified the Git integration, the raw evidence hashes, the 325-test totals, the identical 60-title sets, the retry outcomes, and the sole timing-only payload difference, and reran the eight focused suites — 8 files / 224 tests — with type-check and lint clean.

### Publication

| Step | Result |
|---|---|
| First push | live main re-read as `8f5bbe6d` immediately before; `git push origin fix/proc-gate` → fast-forward `9804e94b..f5bc5e88` (publishes merge `633a9e24` and records commit `f5bc5e88`); 13:20:14Z |
| PR #84 recalculation | head `f5bc5e88`, base `main` at `8f5bbe6d`, **18 files**, `MERGEABLE`, merge state `UNSTABLE` while checks ran then **`CLEAN`**; kept **draft** |
| PR body | rewritten to replace the obsolete `8b581217` / `305c7f1a` integration and A7-exception details with the A8 facts: current main `8f5bbe6d`, integration merge `633a9e24`, every A8 gate, the exact candidate/baseline literal-E2E results and comparison, Brent's 2026-09-05 exception verbatim, gate still RED, Codex A8 `APPROVE`, no merge or deployment |
| CI on `f5bc5e88` | run [33968607547](https://github.com/brentcurtis76/fne-lms/actions/runs/33968607547) (`pull_request`, created 13:20:22Z) — **success**; all seven required jobs passed: `Migration safety guard`, `Browser/server boundary guard`, `Gate 1 — Typecheck`, `Gate 1b — Lint`, `Gate 2 — Unit (Vitest)`, `Gate 3 — RLS pgTAP (supabase test db)`, `Gate 4 — E2E (Playwright on seeded local Supabase)` |
| Incidental integration | GitHub's Vercel integration produced an automatic preview deployment for the pushed head; no Vercel command was run and nothing was deployed manually |
| Records commit | this A9 section and the `PROJECT_STATE.md` A9 block — one ordinary commit (no amend), preceded by unstaged and staged `git diff --check`, the staged-index secret guard, and an exact-file check that only the two records changed; SHA in the A9 completion report |
| Final-head acceptance | the A9 head's seven checks monitored to a terminal result; live main re-read; PR head, 18-file count, mergeability, and `git diff --name-only 633a9e24..HEAD` = the two records re-verified; PR #84 marked **ready for review** only after all of that held — results in the A9 completion report and the `PROJECT_STATE.md` A9 block |

### A9 boundaries and what remains

No merge into `main`, no deployment, no production, provider, remote-database, or secret access, no CI repair, no executable change, no scope change. `Gate 4 — E2E` in CI runs the mandatory manifest, not the literal full suite; the literal `CI=1 npm run e2e` gate remains **RED** under Brent's exact exception and is not claimed green. **B-01 and PR 1 remain `PHASE_NOT_CLOSED`**: closure still requires independent final-head PR review, Brent's merge decision, and post-merge verification.

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
- `lib/services/assessment-builder/clientScoringService.ts` (A5: active-year filter before the gate, real display order, inactive-module exclusion)
- `pages/demo/assessments/[templateId]/results.tsx` (**A5, authorized addition**) — adapter carries `display_order`/`is_active_this_year`; page-local transforms exported for the adapter test

**Tests (new or extended):**
- `__tests__/lib/services/assessment-builder/coberturaGatePolicy.test.ts` (new, 16 tests)
- `__tests__/lib/services/assessment-builder/fetchInstanceGapAnalysis.test.ts` (new in attempt 1 with 3 tests; **A5 +10 → 13**, R2 historical compatibility incl. the fail-closed row)
- `__tests__/api/docente/assessments/get-progress.test.ts` (new, 4 tests)
- `__tests__/components/assessment/ModuleCard.gate.test.tsx` (new, 6 tests)
- `__tests__/api/docente/assessments/submit.test.ts` (extended, +4 tests: 10 → 14)
- `__tests__/lib/services/assessment-builder/clientScoringService.test.ts` (attempt 1: 1 test rewritten to assert omission; **A5 +10 → 80**, R1 active-year/display-order cases, flat and objective)
- `__tests__/pages/demo/results-adapter.test.ts` (**A5, authorized addition**, new, 6 tests through the page's real transforms)
- `__tests__/lib/services/assessment-builder/scoringService.test.ts` — **unchanged**, all 85 pre-existing tests (including the `activeIndicatorCount` and `T6`/gate-adjacent cases) pass unmodified against the new gate-aware `calculateModuleScore`, which is itself evidence the gate change is backward-compatible with every scenario that suite already covered.

**Docs:** this file; `PROJECT_STATE.md` Meta section (new top-of-list entry; every pre-existing entry preserved byte-for-byte below it).

## Reconciliation with current main

Attempt 1 left the work as an uncommitted 16-path diff on a branch based on `982f456d`, while live `origin/main` had moved 12 commits ahead to `d1031989`. Attempt 2 integrated that without any destructive Git operation — no `reset`, `clean`, `checkout --`, stash create/apply/drop, file overwrite, or worktree move, and no other worktree or the primary checkout was touched.

Because the only overlapping path (`PROJECT_STATE.md`) was itself locally modified, `git merge` could not run against the dirty tree, and every alternative (stash, checkout-discard, reset) was prohibited *and* riskier. The safest available route was therefore to **commit the cumulative diff first** — putting all 16 paths permanently into the object database — and merge onto that clean tree. The 16 files were verified byte-identical to a pre-commit SHA-256 snapshot immediately after committing, so no cumulative edit was lost.

- **Conflicts:** exactly one, `PROJECT_STATE.md`. Both sides only prepend `## Meta` entries.
- **Resolution:** main's version kept in full — the FNE-ZOOM Unit B1 closure entry and both SM-SIM-PROD-D1 entries, byte-for-byte, in their original order — with the single Procesos de Cambio C-01/B-01 entry restored above them. Verified mechanically: the resolved file differs from `origin/main:PROJECT_STATE.md` by **exactly one added line and zero removed lines**. No current-main record was replaced, reworded, or dropped.
- **Main's other 17 changed paths** (Zoom operator-tenant session creation, `lib/types/tenant-kind.ts`, `pages/api/sessions/*`, Santa Marta governance docs, `scripts/check-ledger.mjs`) merged cleanly. They share no file with B-01, and a content probe of the whole `982f456d..d1031989` diff found no reference to `cobertura`, `assessment-builder`, `scoringService`, `ModuleCard`, or `docente/assessments` outside two prose mentions inside a `PROJECT_STATE.md` Santa Marta entry — so there is no semantic overlap either, not merely no path overlap.
- **Open PRs** (#50, #46, #4, #1 — all last updated 2026-08-22 or earlier) were checked file-by-file and none touches any assessment, docente, ModuleCard, scoring, or cobertura surface.
- After the merge, `origin/main` is an ancestor of `HEAD`; the branch is 2 ahead / 0 behind, and `git diff origin/main..HEAD` is exactly the 16 B-01 paths *(at that time; 18 paths after the A5 checkpoint — see § Files changed)*.

## Validation

*A5 note: the table in this section is the attempt-2 record for HEAD `0207d83c` and is preserved as historical evidence for **that** tree. It does not validate the A5 executable changes; § Attempt 5 validation below does.*

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

### Attempt 5 validation (dirty tree, after the final executable change, before the A5 checkpoint commit)

All commands ran in `/Users/brentcurtis/dev/wt/proc-gate` on 2026-09-04 between 15:05Z and 15:10Z, after the last executable edit (the added fail-closed R2 test). Only the two Markdown records were edited afterwards. Logs are in the session scratchpad, not the repository.

| Gate | Command | Exit | Result | After final change |
|---|---|---|---|---|
| Focused B-01 suites + adapter | `npx vitest run` × 8 files | 0 | **8 files, 224 tests, all passed** (coberturaGatePolicy 16, scoringService 85 unmodified, clientScoringService 80, submit 14, ModuleCard.gate 6, get-progress 4, fetchInstanceGapAnalysis 13, results-adapter 6) | yes |
| Fail-on-old proof | two scratchpad Vitest configs, see § Regression proof | 1 (expected) | run A 15 failed / 84 passed; run B 4 failed / 2 passed — all assertion failures | yes |
| Whitespace/conflict | `git diff --check` | 0 | clean (also `--cached` before the commit) | yes |
| Actions guard | `npm run guard:actions` | 0 | OK — 17 uses, 1 workflow file | yes |
| Migration guard | `npm run guard:migrations` | 0 | OK — 41 migrations, no destructive statement | yes |
| Browser boundary guard | `npm run guard:browser` | 0 | OK — 1146 files, 688 modules from 509 entrypoints | yes |
| Secret guard | `npm run guard:secrets` | 0 | OK — 2487 tracked paths from the Git index, 0 findings; rerun against the staged index before the commit (see the A5 report) | yes |
| Typecheck | `npm run type-check` | 0 | clean | yes |
| Lint | `npm run lint` (`--max-warnings=0`) | 0 | clean | yes |
| Testid lint (advisory) | `npm run lint:testid` | 1 | repo-wide 2621 problems, unchanged from the attempt-2 baseline; the only touched file in its scope, `results.tsx`, has 3 problems on both the A5 tree and the `a5c07fcb` copy (same config) — **no new finding** | yes |
| Unit (Vitest, full) | `npm test` | 0 | **383 files passed; 8776 passed, 11 skipped, 0 failed** (228.8 s) — +1 file / +26 tests versus attempt 2, exactly the A5 additions | yes |
| Build | `npm run build` | 0 | Compiled; 149/149 static pages. Against the pre-existing ignored `.env.local`, never opened | yes |
| RLS pgTAP | `npm run test:db` | — | **NOT RUN ON A5 — DATABASE-WRITE AUTHORITY NOT GRANTED** (none of the A5 files is schema- or RLS-adjacent; the attempt-2 result stands for its own tree only) | — |
| Mandatory CI Playwright manifest + no-skip check | `CI=1 npx playwright test …` | — | **NOT RUN ON A5 — DATABASE-WRITE AUTHORITY NOT GRANTED** | — |
| Literal full E2E | `CI=1 npm run e2e` | — | **NOT RUN ON A5 — DATABASE-WRITE AUTHORITY NOT GRANTED.** The approved exception is historical evidence for the prior tree and is not extended to this one | — |

These boundaries prevent declaring the phase complete; they do not prevent this local checkpoint. No live results endpoint was called (the existing endpoint can calculate and save results when none exist); every R2 test mocks `supabaseAdmin` and asserts that the only table read is `assessment_instance_results` and that no write path is reached.

## Literal E2E gate — exact results and classification

**This gate is RED. It is never claimed green.** It now carries Brent's **approved, evidence-specific exception** covering the exact 60 failing titles recorded below, granted after attempt 3 reproduced every one of them on a clean baseline with no B-01 code.

**The run.** `CI=1 npm run e2e` was run to **completion** on the reconciled tree (HEAD `0207d83cb8ee8392de3520806e08b353971867ce`), unlike attempt 1's Brent-terminated partial run. Started 2026-09-03T20:49:05Z, ended 21:43:26Z, exit status **1**.

```
  60 failed
  27 skipped
  238 passed (54.3m)
```

`playwright.config.ts` sets `workers: 1` and `retries: 2` under `CI`, so the 325-test matrix ran serially and every failing title burned three ~15 s timeouts — 445 recorded attempts, ~38 min of which was failed-attempt time.

**The 60 distinct failing titles, by spec file:**

| Spec file | Distinct failing titles | Reproduced on clean baseline `d1031989`? |
|---|---|---|
| `tests/qa/qa-system.spec.ts` | 16 | **Yes** |
| `tests/qa/auth-redirects.spec.ts` | 13 | **Yes** |
| `tests/e2e/flows/proposal-web-view.spec.ts` | 6 | **Yes** |
| `tests/e2e/flows/proposal-config.spec.ts` | 6 | **Yes** |
| `tests/e2e/flows/proposal-document-library.spec.ts` | 4 | **Yes** |
| `tests/e2e/flows/proposal-consultant-crud.spec.ts` | 4 | **Yes** |
| `tests/e2e/flows/proposal-buckets.spec.ts` | 4 | **Yes** |
| `tests/e2e/flows/proposal-admin-visibility.spec.ts` | 3 | **Yes** |
| `tests/e2e/reservation.spec.ts` | 2 | **Yes** |
| `tests/e2e/flows/proposal-versioning.spec.ts` | 2 | **Yes** |

29 of 60 are `proposal-*`; the other 31 are not — 16 in `qa-system.spec.ts`, 13 in `auth-redirects.spec.ts`, 2 in `reservation.spec.ts`. All 60 are retry-exhausted rather than flaky, on both the branch and the baseline.

**How the exception was reached — chronology, preserved.**

1. **Attempt 2 stopped, correctly.** Brent's approval at that time read: *"I approve a B-01-specific exception for the unrelated `proposal-*` E2E failures, based on their reproduction on the exact base."* The completed matrix showed 31 failures outside that wording. Extending a `proposal-*`-worded exception to `tests/qa/*` and `reservation.spec.ts` would have been **inventing an exception nobody granted**, so attempt 2 did not do so, did not call the gate green, and stopped for a decision.
2. **Attempt 3 established the comparison.** A disposable worktree detached at exactly `d1031989` — the integrated main, with no B-01 code — was bootstrapped and the same literal gate run to completion. Results are in § Baseline comparison evidence (attempt 3): **the same 60 failing titles, zero branch-only, zero baseline-only**.
3. **Brent then approved the extension.** The approval covers **these exact 60 observed failures** and supersedes the earlier `proposal-*`-only restriction for them alone. It is **not** a waiver for arbitrary failures, for future trees, for other phases, or for the gate itself, and the gate stays recorded as RED.

**Why B-01 cannot be the cause.** B-01's 14 code and test paths contain **zero occurrences** of `proposal`, `licitac`, `bucket`, `mineduc`, `consultant`, or any session/reservation/ledger/auth-redirect surface — verified by running the term search over `git diff d1031989..HEAD -- . ':(exclude)*.md'`, which returns 0. Every such string in the diff lives in the two Markdown records that discuss these failures. B-01 changes only assessment cobertura gating; there is no mechanism by which it could affect QA-dashboard, auth-redirect, or hour-ledger journeys. The baseline run turns this argument from an inference into a measurement.

## Baseline comparison evidence (attempt 3)

The comparison that the approved exception rests on. Both runs are **local** results on the same machine — not CI, not production.

**Trees compared**

| | Branch | Baseline |
|---|---|---|
| Tree | `fix/proc-gate` @ `0207d83cb8ee8392de3520806e08b353971867ce` | detached @ `d103198980b1671a2a207f4d2efcc1fd8db7a980` |
| Worktree | `/Users/brentcurtis/dev/wt/proc-gate` | `/Users/brentcurtis/dev/wt/proc-gate-base-d1031989` |
| Command | `CI=1 npm run e2e` | `CI=1 npm run e2e` |
| Started (UTC) | 2026-09-03T20:49:06Z | 2026-09-03T22:02:31Z |
| Duration / exit | 54.3 min / 1 | 54.8 min / 1 |
| **Passed / failed / skipped / flaky** | **238 / 60 / 27 / 0** | **238 / 60 / 27 / 0** |
| Tests collected | 325 | 325 |
| Workers / retries | 1 / 2 | 1 / 2 |

**Comparison result**

| Measure | Count |
|---|---|
| Shared failing titles (intersection) | **60** |
| Branch-only failures (candidate regressions) | **0** |
| Baseline-only failures | **0** |
| Non-`proposal-*` branch failures reproduced on baseline | **31 of 31** |
| Shared titles with identical full normalized error message | **60 of 60** |
| Retry-exhausted | 60/60 both sides |

Codex independently verified these comparisons from both JSON reports.

**Comparability controls.** `package-lock.json`, `package.json`, and `playwright.config.ts` are byte-identical across the two worktrees; the B-01 diff against `d1031989` is exactly 16 paths, none of them a spec, config, or dependency file; both runs used the same machine, Node v22.22.0, Playwright install, and local Supabase stack; the identical collected-test count (325) shows both runs executed the same matrix.

**Artifacts (not committed — logs, traces, and environment files are deliberately excluded from this repo).**

| Artifact | Path | SHA-256 |
|---|---|---|
| Branch Playwright JSON | `/Users/brentcurtis/dev/wt/proc-gate/test-results/e2e-results.json` | `efdd30a985ddd46072897f4315df7638305006232b0ed3fb6f10fc276e78cee9` |
| Baseline Playwright JSON | `/Users/brentcurtis/dev/wt/proc-gate-base-d1031989/test-results/e2e-results.json` | `5d74a0ba04fac49bc93914a5c41ffee090d832c2b6b16d9ddfb41e7862ce3533` |
| Comparison output | `/Users/brentcurtis/dev/wt/proc-gate-base-d1031989/scratchpad/gates/branch-vs-baseline-comparison.log` | — |
| Baseline full run log | `/Users/brentcurtis/dev/wt/proc-gate-base-d1031989/scratchpad/gates/e2e-full.log` | — |

The disposable baseline worktree is left in place, detached at `d1031989` and clean, for independent inspection.

**Evidence limitations — all of these stand.**

- **Environment-key parity was not checked.** The branch run used the pre-existing `.env.local` in the proc-gate worktree, which was never opened; the baseline used a freshly generated file from `supabase status` following the CI Gate 4 recipe. Key-for-key equality is therefore unverified.
- **Neither run reset the database.** CI Gate 4 normally runs `supabase db reset`; that was explicitly out of authority here, so neither side exercised a from-scratch schema.
- **Synthetic seeding occurred between the two runs** (`scripts/ci/seed-e2e.mjs`, 2026-09-03T22:01:30Z). Database state therefore differed between branch and baseline runs — the results were nonetheless identical, which widens rather than narrows the conditions under which these failures reproduce.
- **The originally referenced branch text log was unavailable** (no `scratchpad/` directory existed in the proc-gate worktree). The comparison used the completed attempt-2 Playwright JSON report instead, verified to be that run: 238/60/27, 54.3 min, 32 spec files.
- **These are local results, not CI or production evidence.** No CI run has been performed on this tree.

**The 60 distinct failing-title identifiers** (extracted from the branch JSON report; identical set on the baseline).
**`tests/e2e/flows/proposal-admin-visibility.spec.ts`** (3)

- `:31:5` — Admin can see ProposalConfigPanel on licitación detail @flow @proposal
- `:44:5` — Non-admin (docente) cannot see ProposalConfigPanel @flow @proposal
- `:64:5` — Admin can toggle ProposalConfigPanel open and closed @flow @proposal

**`tests/e2e/flows/proposal-buckets.spec.ts`** (4)

- `:113:7` — Enabling multiple buckets shows correct summary totals
- `:45:7` — Distribución de Actividades section is visible and collapsible
- `:63:7` — Toggling a bucket on shows hours input, toggling off hides it
- `:92:7` — Adding a custom bucket shows it in the list

**`tests/e2e/flows/proposal-config.spec.ts`** (6)

- `:118:7` — Selecting an expired certificate shows blocking warning
- `:133:7` — Vista Previa button is visible when plantilla and ficha are selected
- `:152:7` — Valid config: generate succeeds and download link appears in history
- `:44:7` — Selecting a plantilla loads its default hours
- `:64:7` — Changing hours updates MINEDUC validation status live
- `:94:7` — Non-compliant hours disable the generate button

**`tests/e2e/flows/proposal-consultant-crud.spec.ts`** (4)

- `:32:7` — Admin can navigate to consultant library page
- `:39:7` — Admin can create a new consultant
- `:65:7` — Admin can edit a consultant titulo
- `:87:7` — Admin can soft-delete a consultant and it disappears from active list

**`tests/e2e/flows/proposal-document-library.spec.ts`** (4)

- `:106:7` — Admin can soft-delete an uploaded document
- `:42:7` — Admin can navigate to document library page
- `:49:7` — Admin can upload a supporting document
- `:85:7` — Expiry warning is shown for expired or near-expiry documents

**`tests/e2e/flows/proposal-versioning.spec.ts`** (2)

- `:71:7` — Generating twice creates v1 and v2 in history
- `:96:7` — Both v1 and v2 have individual download links

**`tests/e2e/flows/proposal-web-view.spec.ts`** (6)

- `:108:7` — Aggregate hours (presencial/sincrónica/asincrónica) render in donut chart
- `:129:7` — Contact email is consistent (info@nuevaeducacion.org)
- `:150:7` — Footer shows ficha metadata (nombre_servicio, dimension, folio)
- `:23:7` — Shows unlock screen and accepts valid access code
- `:42:7` — Full proposal renders all major sections
- `:90:7` — Old proposal without buckets does NOT show bucket section

**`tests/e2e/reservation.spec.ts`** (2)

- `:27:7` — QA-1: Creating and scheduling a session reserves hours in the ledger
- `:50:7` — QA-9: Legacy session (no hour_type_key) continues to work normally

**`tests/qa/auth-redirects.spec.ts`** (13)

- `:147:9` — supervisor de red dashboard redirects to login when not authenticated
- `:200:7` — API users endpoint returns 401 without auth
- `:205:7` — API schools endpoint returns 401 without auth
- `:210:7` — API courses endpoint returns 401 without auth
- `:215:7` — API networks endpoint returns 401 without auth
- `:28:9` — workspace redirects to login when not authenticated
- `:33:9` — messages page redirects to login when not authenticated
- `:40:9` — courses list redirects to login when not authenticated
- `:45:9` — course detail page redirects to login when not authenticated
- `:50:9` — course enrollment page redirects to login when not authenticated
- `:57:9` — evaluaciones redirects to login when not authenticated
- `:62:9` — quiz page redirects to login when not authenticated
- `:74:9` — analytics page redirects to login when not authenticated

**`tests/qa/qa-system.spec.ts`** (16)

- `:115:7` — should display scenarios list
- `:125:7` — should filter scenarios by feature area
- `:138:7` — should show scenario creation form
- `:156:7` — should display import page
- `:169:7` — should load sample JSON
- `:181:7` — should validate JSON input
- `:197:7` — should show error for invalid JSON
- `:210:7` — should show error for empty scenarios array
- `:230:7` — should display test run details page
- `:268:7` — QA dashboard should have no accessibility violations
- `:285:7` — Import page form should be accessible
- `:36:7` — should show QA scenarios list page
- `:64:7` — should show admin QA dashboard
- `:75:7` — should navigate to scenarios management
- `:85:7` — should navigate to import page
- `:95:7` — should deny access to non-admin users

## Reviewer hotspots (my own judgment calls — descending importance)

1. **Where "effective active indicators" (step 1) is resolved.** The shared policy deliberately does *not* compute year-active/legacy-active filtering itself — each caller does that first (it already existed, correctly, in six different shapes across the six consumers) and hands the policy an already-filtered list. The policy's own "original index" tie-break is therefore relative to the *filtered* list's order, not the full unfiltered snapshot array. In every existing test and in the six production call sites this makes no observable difference (filtering preserves relative order, and ties only matter among items that survive filtering), but a reviewer should confirm this scoping choice — centralizing gate/sort/applicability while leaving active-filtering per-consumer — is the right cut given the six different active-filtering shapes in this codebase (two use an `activeExpectationsMap`/`activeIndicatorIds` built from `assessment_year_expectations`, two use the legacy traspaso/detalle exclusion as a fallback, one is client-only with no active-filtering step at all).
2. **`calculateModuleScore`'s omission (not zero) change is the crux of the server-scoring fix.** This function previously scored every "active" indicator unconditionally — cobertura gating was never applied at the server-scoring layer at all before this unit (only in the browser-only client demo path, and even there imperfectly). The fix is minimal (wrap the existing indicator list in `resolveCoberturaGate`, iterate `gate.applicable` instead of `indicators`), and all 85 pre-existing `scoringService.test.ts` tests pass unmodified — but this is the highest-blast-radius change in the diff since it touches the one function that computes every persisted `assessment_instance_results` row going forward. Look hard at whether any existing snapshot/scoring-config combination in production could have a non-cobertura-shaped first indicator that this change would now treat differently than before (it shouldn't — a non-cobertura first indicator means `hasGate: false`, `applicable: orderedActive` = every active indicator, i.e. byte-identical to the old unconditional behavior).
3. **`fetchInstanceGapAnalysis`'s applicability signal is indirect.** Rather than re-deriving the gate independently (which would need response data this function doesn't fetch — it only reads the already-computed `assessment_instance_results.module_scores`), it infers "was this indicator applicable at scoring time" from whether the indicator id is present in the saved `indicatorScores` map. This is correct *because* `calculateModuleScore` now omits gated-out indicators from what it saves — the two functions are coupled by this contract. If a future change to `calculateModuleScore` reverts to including gated-out indicators (even at score 0), this gap-analysis filter would silently stop working as intended. This coupling is implicit, not type-enforced; a reviewer should judge whether that's acceptable or whether it needs an explicit marker. **A5:** this coupling is now explicitly *not* relied on for applicability — the reader re-resolves the gate over the persisted set from row-level evidence (§ Attempt 5, R2), so a future scorer that stored gated-out rows at 0 would still be read correctly.
4. **Objectives-hierarchy support was added to `fetchInstanceGapAnalysis` as a necessary side effect**, not a separately-scoped fix — the function previously only read `snapshotData.modules`, silently returning empty/wrong gap analysis for any objectives-hierarchy (3-level) instance. This was a pre-existing gap (the dispatch's "objective-contained and legacy flat modules" requirement made it unavoidable to touch). Confirm this is within the intended scope of B-01 rather than scope creep — the six named consumers list didn't explicitly include this function, but it's the direct implementation of "Gap analysis cannot reconstruct not-applicable absence as score zero" and "Gap analysis handles objective-contained and legacy flat modules," which are dispatch requirements.
5. **`ModuleCard`'s de-duplicated progress helper in the docente page** (`computeModuleProgress`) collapses two previously near-identical inline loops (`useEffect` and `updateProgress`) into one shared local function. This is a minimal, same-file simplification that falls naturally out of removing the duplicated gate logic; it is not a new abstraction introduced for its own sake, and it does not change either call site's behavior — confirm the diff reads that way.
6. **`clientScoringService.scoreModule` passes `getDisplayOrder: () => undefined`** — this module's `IndicatorInput` type has never carried a `displayOrder`/`display_order` field, and the original code always treated `indicators[0]` (raw array order) as the gate candidate with no sort step. Rather than adding a new field to `DemoScoringInput`'s indicator shape (which would ripple into `StoredIndicator`/`transformModuleForScoring` on the results page), the shared policy is given a constant `undefined` order accessor, which makes it fall back entirely to original array index — reproducing the exact prior behavior. Confirm this is preferable to threading `displayOrder` through the demo/results data path, which was judged out of proportion for this unit. **A5: superseded — Codex's R1 showed this judgment was wrong** (a stale answer on an inactive or mis-ordered leading cobertura changed demo scores); `display_order` and `is_active_this_year` are now threaded through the adapter and scorer.

7. **(A5) The historical gate evidence is inferred from a score.** When a legacy row lacks a boolean `rawValue`, the reader treats the leading cobertura's `normalizedScore === 100` as "Sí" and anything else as unanswered. This rests on `scoreCoberturaIndicator` mapping only `true` to 100 — verify that invariant has always held for persisted rows; if any historical scorer ever produced 100 for a non-Sí cobertura, that row would read as open (never as closed).
8. **(A5) `is_active_this_year !== false` is the client's active test.** `undefined` is deliberately "active" so stored demo payloads written before the field existed keep their previous scoring. Confirm the demo API always emits the field for current templates so the filter is actually exercised there, not only in tests.
9. **(A5) Three page-local functions in `results.tsx` are now exported** so the adapter test drives the real path. Next.js Pages Router ignores non-default exports for routing; confirm no lint/boundary rule objects and that nothing else now imports them.

## Known limitations / deferred

- Objectives-hierarchy support in `fetchInstanceGapAnalysis` is untested against a real multi-objective production snapshot beyond the new unit test's synthetic fixture — no existing E2E/pgTAP journey exercises `/docente/assessments/[id]/results` end to end with objectives data.
- `display_order` was threaded through `scoringService.ts`'s server-side types for gate ordering, but the pre-existing `mapIndicator` in `clientScoringService`'s *results-page* transform (`transformModuleForScoring` in `pages/demo/assessments/[templateId]/results.tsx`) was not touched — the demo path's gate ordering still relies on array order only (see hotspot 6). **A5: addressed** — see § Attempt 5, R1.
- No new pgTAP coverage was added (none of the changed files are DB-schema or RLS-adjacent).
- `__tests__/pages/community/workspace.mention-scope.test.tsx` — attempt 1 recorded 5 failures there, reproduced on the exact base. On the reconciled tree the whole suite is green and that file passes. B-01 did not touch it or `pages/community/workspace.tsx`, so this unit fixed nothing there; the underlying cross-file jsdom `localStorage` leak may simply no longer manifest under the current worker distribution. Treat it as latent, not resolved.
- **The gap-analysis fix is not retroactive.** `fetchInstanceGapAnalysis` infers "was this indicator applicable at scoring time" from whether its id appears in the persisted `assessment_instance_results.module_scores`. That is correct only for results written by the *new* `calculateModuleScore`, which omits gated-out indicators. Rows persisted **before** this change stored every active indicator, gated-out ones included at `normalizedScore: 0`, so for those existing rows a gated-out indicator is still present in `indicatorScores` and will still be reconstructed as a critical/behind gap. Existing results are therefore unchanged (no regression), but they are also not repaired — repair would require rescoring, which is out of scope and would need production access this unit does not have. Verified by reading how `indicatorScores` is built (`scoringService.ts`, from `result.module_scores`), not merely inferred. **A5: addressed at read time** — historical gated-out rows are excluded from gap analysis using row-level gate evidence; **historical aggregate scores remain unchanged** and no row is rewritten (§ Attempt 5, R2). Repair of stored aggregates remains out of scope and unauthorized.
- The literal `CI=1 npm run e2e` gate remains **RED**. Brent's approved exception is narrow and evidence-bound — it covers the exact 60 failing titles reproduced on `d1031989` and nothing else. It is **not a fix**: all 60 failures, `proposal-*` and non-`proposal-*` alike, remain unowned by this unit and undiagnosed, and they will still be red for whoever inherits them.
- **Current-main compatibility is unverified.** The gate evidence was produced against baseline `d1031989`; live `origin/main` has since advanced to `8b58121779eb744c790538b517db7cf023ad1da1`. Nothing was fetched, merged, or rerun on that account. A compatibility/integration check against current main is **PENDING** and is a precondition this document does not satisfy. **A6: resolved** — `8b581217` merged locally as `305c7f1a` and every gate rerun on the integrated tree (§ Attempt 6).
- **(A5) Database-backed validation was not run on the A5 tree** — pgTAP, the mandatory Playwright manifest, and the literal E2E gate are recorded as NOT RUN ON A5 — DATABASE-WRITE AUTHORITY NOT GRANTED. The attempt-2/3 results are evidence for their own trees only. **A6: resolved on the integrated tree** — from-scratch `supabase db reset`, pgTAP 25/2143 PASS, both concurrency proofs, mandatory manifest 192/192 with no skips, and the literal gate run to completion (RED, same 60 titles; § Attempt 6).
- **(A5) Independent re-review is pending.** Codex's `REQUEST CHANGES` has been remediated locally but not re-reviewed; no approval is claimed. **A6:** Codex re-reviewed `8f79ff3d` and returned `APPROVE` with zero findings (intake fact supplied by Brent; the merge commit `305c7f1a` changes no B-01 executable path, so the approved code is what was validated).
- **(A5) Current-main integration is still pending.** Live `origin/main` was last observed read-only at `8b58121779eb744c790538b517db7cf023ad1da1`; nothing was fetched, merged, or rebased in A5. **A6: done** — see § Attempt 6.
- **(A6) The literal `CI=1 npm run e2e` gate is RED on the integrated tree** with exactly the 60 previously recorded titles, reproduced title-for-title on a fresh detached `8b581217` baseline (intersection 60, zero either-only, identical normalized errors 60/60). The attempt-3 exception does not cover this tree and A6 inferred no new one; **whether the exception extends to this tree is Brent's pending decision.** All 60 failures remain unowned by B-01 and undiagnosed.
- **(A6) The Codex `APPROVE` is recorded from intake**, not re-derived; no verdict artifact is committed in this repository.
- **(A5) Prior A5-session validation is unverified.** The remediation existed as an uncommitted tree when this continuation began, with no preserved gate logs; the § Attempt 5 validation runs are the record.
- **(A7) The literal `CI=1 npm run e2e` gate remains RED on the published head.** Brent's exception (2026-09-04, quoted in § Attempt 7) covers exactly the 60 failures on candidate `305c7f1a` against baseline `8b581217`; it is not a waiver for future trees, arbitrary failures, other phases, or the gate itself. The 60 failures remain unowned and undiagnosed.
- **(A7) The Codex A6 `APPROVE` is recorded from intake**, not re-derived; no verdict artifact is committed in this repository.
- **(A7) Merge and deployment have not occurred.** PR #84 is the publication; closure of B-01 and PR 1 awaits independent PR review, CI acceptance on the final head, Brent's merge decision, and post-merge verification.
- **(A8) The literal `CI=1 npm run e2e` gate is RED on the reintegrated tree** (`633a9e24`, current main `8f5bbe6d` merged) with exactly the 60 previously recorded titles, reproduced identically on a fresh detached `8f5bbe6d` baseline (intersection 60, zero either-only, retry outcomes 60/60, normalized payloads 59/60 byte-identical and 60/60 after collapsing a timing-only `Test timeout` entry present on the baseline side). The A7 exception covers `305c7f1a`/`8b581217` only and A8 inferred no new one; **whether an exception is granted for this tree is Brent's pending decision.** All 60 failures remain unowned by B-01 and undiagnosed.
- **(A8) Nothing from A8 is published.** `origin/fix/proc-gate` and PR #84 (now a draft) remain at `9804e94b`; the merge `633a9e24` and the A8 records commit are local only. Publication, CI on the new head, returning the PR to ready, review, merge, and post-merge verification all remain.
- **(A8) Two procedural incidents on the executor's side** (a stale npx-cached Supabase CLI 2.116.0 stalling the first reset, and a seed issued before GoTrue was ready) were corrected before any recorded result; see § Attempt 8. They are not findings against the candidate or PR #83.
- **(A9) The literal `CI=1 npm run e2e` gate remains RED on the published head.** Brent's exception (2026-09-05, quoted in § Attempt 9) covers exactly the 60 failures on candidate `633a9e24` against baseline `8f5bbe6d`; it is not a waiver for future trees, arbitrary failures, other phases, or the gate itself. The 60 failures remain unowned and undiagnosed.
- **(A9) The Codex A8 `APPROVE` is recorded from intake**, not re-derived; no verdict artifact is committed in this repository. The A8 candidate/baseline comparison, by contrast, was recomputed by A9 from the preserved JSON reports.
- **(A9) Merge and deployment have not occurred.** `633a9e24` and `f5bc5e88` are published and PR #84 recalculates cleanly against `8f5bbe6d`; closure of B-01 and PR 1 awaits independent final-head PR review, Brent's merge decision, and post-merge verification.
