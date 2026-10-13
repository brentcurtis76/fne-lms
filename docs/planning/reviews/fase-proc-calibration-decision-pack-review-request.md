# Review request — PROC calibration decision pack (B015)

## Branch, base and source
- Documentation branch `fix/b5-found`, base/HEAD `9fd83d5a38024615e81e0dcb6091af11df6f89d3`, **0 commits** on top
  (`git rev-list --count 9fd83d5a..HEAD` = 0). The executor may not commit; the declared-path local commit of the two
  files below is left to the PM.
- **Calibration source SHA** (kept separate from the branch): `42997ec6508396723a15aa1d2492d34e636c1bfe`, B014's pin.
  Fresh `git fetch origin main` exit 0 at 2026-10-09T19:28:22-03:00 (r0) and again at 2026-10-09T19:52:56-03:00 (r1,
  `evidence-r1/fetch-ancestry.txt`): both times `origin/main` = `FETCH_HEAD` = `42997ec6`,
  0 commits after the source, `git merge-base --is-ancestor 42997ec6 origin/main` exit 0. Merge-base with
  `fix/b5-found` `7d3dffd0…`; branch 25 ahead (B014 docs and ledger commits added) / 255 behind.
- Reviewer: repeat the fetch and ancestry check at review time and record that `origin/main` SHA and time; a later
  `main` change to an inventoried path returns to the PM for reassessment (B014 docs are not modified by B015).

## B014 receipt and digests (linked, re-verified unchanged)
- PM review `APPROVED_WITH_NOTES`: run `PROC-PR104-RECOVERY-4/pm-review-r1.md` (sha256 `7160391a…4708`),
  `pm-review-evidence-r1.json` (`b486e729…70ec`), `pm-closure-r1.md` (`bf73ad2e…3da5`),
  `closure-r1-9506fe6a6fed.json` (`5fc67b18…d237`). B014 docs commit `4d672ea4024d0708d67cb01db0c9fe70608f9315`,
  ledger commit `9fd83d5a38024615e81e0dcb6091af11df6f89d3`.
- `sha256sum docs/planning/proc-calibration-current-contract.md` = `e90c554ed5c4e840a6124431d2c46abcd4b08b7e8b13108ad714645b3c2cf8c0`;
  `sha256sum docs/planning/reviews/fase-proc-calibration-review-request.md` = `6118d8ced13123d722d7fefd082a70dbe9b96c176e28f8715461978a66f07a34`.
  Both equal the accepted digests before and after this build.

## Correction round r1 (remediation 1)
PM review r0 (`PROC-PR104-RECOVERY-5/pm-review-r0.md`, CHANGES_REQUIRED) raised two blockers; r1 corrects both in the
two allowed documents only. r0 copies and hashes are kept in `evidence-r1/r0-docs/` (pack `f9fcca97…37ac`, this file
`bfc57ee4…4d7d`). No policy question was answered or narrowed; all twelve stay OPEN.
- **B015-CHOICE-01** (pack CAL-Q6, D2): option 3 now reads "no gap labels for any category (depth, yes/no and
  frequency alike)" and its consequence says no label or gap count for any indicator, depth included; the depth-only
  wording is gone.
- **B015-FOLLOWUP-02** (pack §6, D4): the first slice now defines "descriptive" as no normative element anywhere and
  lists, with source line references at `42997ec6`, every consumer the PM named: `ModuleResultCard` header counts and
  expanded "Estado" badges, `DetailedResults` (both call sites), docente and demo results pages, `results/types.ts`,
  `types/assessment-builder.ts`, the demo producer `pages/api/demo/assessments/[templateId].ts`, the submit response,
  directivo APIs and dashboard. Old/new/mixed-version negative tests are listed, including the PM's extra scenario
  (expand a module on a new-version docente result; old version unchanged). The no-schema JSON key is now stated as an
  unverified design assumption; any database need returns as a later DB-reviewed plan.

## Objective and scope (order PROC-PR104-RECOVERY-5 r0/r1, ledger PROC-B015, criteria PROC-C028/C029/C030)
- Objective: deliver the English technical calibration decision pack (PROC-C028/C029/C030) using accepted B014
  evidence, with plain-language policy choices and a smallest conditional implementation follow-up. Recommendations
  are not answers. PROC-CALIBRATION stays held; documentation completion certifies no product, pilot,
  historical-data or parent completion.
- In: `docs/planning/proc-calibration-decision-pack.md` and this review request.
- Out: product fixes, new scoring/values/copy, schema/migrations, historical recalculation, remote operations,
  reopening accepted prior builds, refactoring, shared phase-state edits (ledger, `PROJECT_STATE.md`).

## Files (both new; nothing else in the repository was written)
| Risk | File | Why |
|---|---|---|
| Higher | `docs/planning/proc-calibration-decision-pack.md` | 12 OPEN questions (CAL-Q1–Q12), recommendations, U1–U18 mapping and the conditional follow-up shape what Brent is asked and what a later plan builds; r1 changed CAL-Q6 and §6 only |
| Lower | `docs/planning/reviews/fase-proc-calibration-decision-pack-review-request.md` | Process record |
Protected entries (the seven dirty paths, `PROJECT_STATE.md`, both B014 docs): sha256 before/after recorded in the run
evidence (`evidence-r0/protected-before.txt`, `protected-after.check`; r1: `evidence-r1/protected-before.txt`,
`protected-after.check`).

## Test and gate evidence
All at source `42997ec6` in the retained clean detached scratch `PROC-PR104-RECOVERY-4/source-snapshot-r1` (0 status
entries before and after), node v26.8.1 / npm 11.19.0, each via `pm-resources run PROC-PR104-RECOVERY-5 --`,
foreground and sequential. Baseline before the first edit; final after both documents were written. These r0 runs
were made by the r0 Claude executor (19:14–19:45); r1 **reuses** them as permitted by order r1 (not rerun, not new
passes): the scratch is still at `42997ec6` with 0 status entries and `git ls-files -s` digest `76fd7217…54f4`, r0
log hashes are in `evidence-r1/r0-log-hashes.txt`, and r1 changed only these two Markdown files, which the scratch
never contains. r1 ran the focused suite itself: baseline 19:50 and final on the delivered state (`evidence-r1/`).
| Gate | Baseline | Final |
|---|---|---|
| Focused `bash …/PROC-PR104-RECOVERY-4/focused-r1.sh` (scoringService, clientScoringService, coberturaGatePolicy) | exit 0, 3 files, 193 passed (r0); r1 rerun exit 0, 193 passed | exit 0, 3 files, 193 passed (r0); r1 rerun exit 0, 193 passed |
| `npm run type-check` | exit 0 (incremental); uncached `tsc --noEmit --incremental false` exit 0 | exit 0 (incremental); uncached exit 0 |
| `npm run lint` | exit 0, 0 warnings | exit 0, 0 warnings |
| `npm test` | exit 0, 518 files, 12,940 passed, 12 skipped | exit 0, identical (518 / 12,940 / 12) |
| `npm run build` (no env) | **exit 1**: missing `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **exit 1**, same cause — RED, dispositioned (below), not a pass |
| Build with synthetic loopback env (`http://127.0.0.1:55821`, non-secret placeholder key) | exit 0, 149/149 pages | exit 0, 149/149 pages |
| `git diff --check` (plan root) | exit 0 | exit 0 |
Plain-build disposition: Brent's decision `c28fe23c2f0d9d66` (2026-10-08) accepts the synthetic-loopback build as
B014/B015 documentation build evidence; the plain build stays **RED** (not a pass), destination
PROC-GATE-BASELINE-FOLLOWUP. DB (pgTAP), E2E and UI checks: not applicable — two Markdown documents, no
application-visible, runtime, API or schema change. The gates measure source code the documents do not touch; they
show the repository is unchanged, not that the pack is correct — that needs the substantive reading below.

## Scrutinize hardest
1. **Recommendations vs evidence (PROC-C028).** Each recommendation cites U/M/K items; check that none goes beyond
   B014's evidence, invents a value, or reads as an answer. CAL-Q7 (one period per indicator) leans on F1's
   min/max/step logic without extending F1 itself — confirm that reasoning is fair.
2. **Recorded decisions vs OPEN questions (§3).** Whole-number, depth 0–4, 8-ULP and F1 are reused, not asked. The
   depth rule has no separate receipt; I flagged it to the PM instead of asking Brent. Check no question re-asks a
   recorded rule and that no Brent receipt exists for CAL-Q1–Q12.
3. **Mutually exclusive choices and plain language.** Some questions touch each other (Q1 with Q5, Q6 with Q7, Q8
   with Q12). Check each question's choices stay exclusive and that an answer to one does not silently decide another.
4. **Conditional follow-up (PROC-C029, §6, rewritten in r1).** Check the first-slice inventory against the source:
   that every normative element (summary, gap section, module header counts, expanded "Estado" badges, directivo
   counts) has a path, that docente and demo callers both receive the policy, and that old/new/mixed tests would
   catch a regression. Line numbers are at `42997ec6`. The no-schema JSON key and the mixed-directivo display
   (count hidden when any new-version registro is included) are design assumptions, not verified or answered;
   the CAL-Q8 "row present, value empty" shape is also unverified. Nothing should read as dispatched or approved.
5. **Synthetic examples.** CAL-Q2 and CAL-Q12 use new synthetic narratives traced to U16 and the recalculating
   GETs rather than to an existing M/K case; spot-check them against inventory §3.6 and §3.9.

## Known limitations and deferred items
- Documentation only; no product, API, DB or browser behaviour was executed. Effects come from B014's source reading
  and offline calculations.
- Questions are not routed to Brent by the executor; the PM reviews and routes them (`pm-unit ask`).
- No commit was made (order). PROC-CALIBRATION remains held; B015 acceptance does not certify B014's subject, prior
  builds, the pilot, historical data or the Procesos de Cambio parent.
- Retained for review, no cleanup authorized: B014 scratch `PROC-PR104-RECOVERY-4/source-snapshot-r1` and this run's
  `evidence-r0/` and `evidence-r1/` logs, and `evidence-r1/r0-docs/` (r0 document copies).
