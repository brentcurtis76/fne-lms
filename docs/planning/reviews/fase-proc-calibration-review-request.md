# Review request — PROC calibration current contract (B014)

## Branch, base and source
- Documentation branch `fix/b5-found`, base/HEAD `5053faae426d368cd74dca1518f13e913ec92a14`, **0 commits** on top
  (`git rev-list --count 5053faae..HEAD` = 0). The order forbids the executor to commit; the declared-path local
  commit of the two files below is left to the PM.
- **Calibration source SHA** (kept separate from the branch): `origin/main` `42997ec6508396723a15aa1d2492d34e636c1bfe`
  after `git fetch origin main` (exit 0, 2026-10-09T18:38:28-03:00). PROC-F1 `906bfd8f…`, result copy `f144e224…`
  and the r0 pin `f5d0c8f8…` are ancestors. Merge-base with `fix/b5-found` `7d3dffd0…`; branch 23 ahead / 255 behind.
- Round r1 is a source refresh (PM finding B014-SOURCE-02): 6 of the 27 r0 paths changed plus `duplicate.ts`; 21 are
  blob-identical and their claims are reused. Contract §1.1 lists each change and its effect.
- Reviewer must re-run `git merge-base --is-ancestor 42997ec6508396723a15aa1d2492d34e636c1bfe origin/main` after a
  fresh fetch, record that `origin/main` SHA and time, and repin if later commits touch an inventoried path.

## Objective and scope (from order PROC-PR104-RECOVERY-4 r0/r1, ledger PROC-B014, criteria PROC-C026/C027/C030)
- In: a source-linked current calibration contract and a PII-free synthetic matrix at one pinned main SHA; the three
  existing focused suites run from a clean detached snapshot of that SHA; this review request.
- Out: the B015 decision pack; any scoring, calibration, result-copy, API, schema or migration change; real data or
  population estimates; certification of earlier builds or the pilot; closing PROC-CALIBRATION (stays held).

## Files (both new; nothing else in the repository was written)
| Risk | File | Why |
|---|---|---|
| Higher | `docs/planning/proc-calibration-current-contract.md` | Accuracy of every producer→consumer claim, the 18 inconsistency notes (U1–U18) and the 25-row matrix (M1–M25) drives B015 decisions |
| Lower | `docs/planning/reviews/fase-proc-calibration-review-request.md` | Process record |
Protected dirty paths (7) unchanged: sha256 before/after recorded in the run evidence.

## Test and gate evidence (all at source `42997ec6`, clean detached scratch `RUN/source-snapshot-r1`, installed node
v26.8.1 / npm 11.19.0, via `pm-resources run PROC-PR104-RECOVERY-4`; baseline before the first r1 edit, final after)
| Gate | Baseline | Final |
|---|---|---|
| Focused `npm test -- …/scoringService.test.ts …/clientScoringService.test.ts …/coberturaGatePolicy.test.ts` (via `focused-r1.sh`) | exit 0, 3 files, 193 passed | exit 0, 3 files, 193 passed (92 + 85 + 16) |
| `npm run type-check` | exit 0 | exit 0 (incremental cache); uncached `tsc --noEmit --incremental false` exit 0 |
| `npm run lint` | exit 0, 0 warnings | exit 0, 0 warnings |
| `npm test` | exit 0, 518 files, 12,940 passed, 12 skipped | identical |
| `npm run build` (no env) | **exit 1**: missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **exit 1**, same cause — RED, dispositioned (below), not a pass |
| Build with synthetic loopback env (`http://127.0.0.1:55821`, non-secret placeholder anon key) | exit 0, 149/149 pages | exit 0, 149/149 pages |
Plain-build disposition: Brent's decision `c28fe23c2f0d9d66` (2026-10-08) accepts the passing synthetic-loopback build
as B014/B015 documentation build evidence; the plain build stays **RED** (not a pass), destination
PROC-GATE-BASELINE-FOLLOWUP. DB (pgTAP) and E2E gates: not applicable — no schema, API or UI change.
Offline calculations: `evidence-r1/offline-calculations-r1.mjs`, 39 results (r0 K1–K11 reproduced identically, K12
directivo unavailable exclusion, K13 PM custom-depth counterexample), labelled calculations; no product module imported.

## Scrutinize hardest
1. **§1.1 / §3.4 / §3.9 r1 reassessment.** School-level instance creation moved into SQL (`school_via_attach`) and
   directivo results stopped recalculating for non-admins; check I traced the new producers and the dashboard
   denominators (U18, M23) correctly, and that no other changed path touches scoring.
2. **U1/U3/U5 (server gap and "sobre la expectativa").** These rest on the absence of any caller passing
   `yearExpectations` or a frequency response; confirm with `git grep` at the source SHA rather than trusting me.
3. **§3.5 active-set table and U8/U9 (live vs snapshot).** I traced four consumers; a missed consumer or a cache
   would change the snapshot-stability conclusions.
4. **K-calculations vs the real functions.** They are transcriptions, not imports (to keep the DB-backed scorer
   unloaded). Spot-check K1 (23/160 rounding), K3, K10, K12 and K13 against the source formulas.
5. **Inferences and provenance.** U14 and the tolerance/integer notes are schema inferences, not executed; the r0
   "no year-weight copy in `duplicate.ts`" note was wrong and is corrected (§3.2); the 0–4 profundidad rule has no
   separate decision receipt (§6).

## Known limitations and deferred items
- Source inspection only; nothing about deployed behavior, real schools or data is claimed.
- No commit was made (order); the review-time ancestry check and any repin are reviewer/PM steps.
- Scratch worktrees `RUN/source-snapshot` (r0, detached `f5d0c8f8`) and `RUN/source-snapshot-r1` (r1, detached
  `42997ec6`; `node_modules` = per-entry symlinks to the plan root's) are retained until PM acceptance; cleanup is
  `git worktree remove` of each path by the assigned operator after ownership/content preflight.
- Policy questions are listed, not answered; they belong to B015. B014 acceptance does not certify the parent or the
  pilot, and PROC-CALIBRATION remains held.
