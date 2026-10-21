# Review request — PASANT-B001 parent (C001–C003), fresh-main rebuild r1

## Branch

`fix/p02-r1`. Base SHA `2922e1b7401aaa7c50f8a1110db41883dc2f05ca` = origin/main (merge of PR #168), and HEAD is that
base: 0 commits over it. This executor made 0 commits: the PM owns the commit, and the three files below are uncommitted
at delivery. This round rebuilds r0 (local commit `dd1feaa2b` on `fix/pasant02-ci` at `c840e4714`, PM verdict
APPROVED_WITH_NOTES), which pm-ship set aside because `PROJECT_STATE.md` changed on main. The r0 review request is kept
as history: `git show dd1feaa2b:docs/planning/reviews/fase-pasant-parent-review-request.md`, with the review in
`runs/PASANT-02/pm-review-r0.md` and the report in `runs/PASANT-02/executor-report-r0.md`.

## Objective and scope

The approved-plan objective (PASANT rev 1, build B001) is "Reconcile A9 and the refreshed baseline; ratify the January
contract and publication decisions". This order is PASANT-02 r1: redo the parent C001–C003 reconciliation on current
main, verifying (not replaying) the children already on main, and re-measure every count on this base.
**Scope in:** this review request, the parent reconciliation record and a concise PROJECT_STATE entry.
**Scope out:** B002–B006 implementation; any change to the January runtime, schema, form, API or PDF; R-08/R-17
release operations; closing historical A9; merge or publication. No product, test, spec, registry, contract, PLAN or
`cohort-public.ts` bytes changed.

## Files by risk

- Low — `docs/plan/evidence/pasant-january/b001-parent-reconciliation.md` (new on this base; its r0 version exists only in
  `dd1feaa2b`): refs, graph, the C001–C003 matrix, the protected inventory, runtime evidence and rebuild provenance.
- Low — this file (new on this base; r0 version only in `dd1feaa2b`).
- Low — `PROJECT_STATE.md`: one PASANT-B001 entry at the top. Every entry main added since r0 is kept; r0's entry is not
  ported.

## Test evidence

RUN is `pm-workflow/runs/PASANT-02/evidence/r1/`. Every command ran through `pm-resources run PASANT-02 -- mise exec
node@22.16.0 --`.
- Baseline on the untouched lock: focused 5 files/341 passed; type-check 0; lint 0; `npm test` 525 files, 13519 passed,
  12 skipped, 0 failed; synthetic loopback build 0.
- D1: refs and graph are fresh (`d1-refs.txt`): HEAD = origin/main, main...A9 = 654/19, and no PASANT path changed since
  r0's main `1cbe55cc8`. `e2e-mandatory.mjs --list` gives 24 entries with the flow spec once. The 10 protected paths
  are blob-identical at HEAD, `1cbe55cc8` and `dd1feaa2b` (`d1-protected-inventory.txt`).
- D2/D3: `january-contract`, `january-source`, `pasantias-cohort` and `pasantias-hardcoded-cohort` all pass. Brochure
  sha256 re-measured as `84d83e15…` (17 pages). Candidate hash at `fb2d1de82` re-measured as `2869bec7…`. The decision
  record is answered, "Approve this contract". `cohort-public.ts` emits JS identical to `42997ec65` once comments are
  removed, and a negative control differs. The PLAN.md diff only adds lines (`d3-runtime-and-plan-diff.txt`).
- D4: 13 scratch counterexamples (11 from r0, 2 new) each go red, and the clean copy passes 255/255 (`d4-probes.tsv`).
  On the mandatory guard the valid report exits 0 and 7 negatives exit 1 (`d4-mandatory-check.txt`).
- D5: the A9 flow spec, unmocked, on a production build against the owned stack `pasant02r1` gives 4 expected,
  0 skipped/unexpected/flaky (`d5-e2e-results.json`). The persisted rows are as expected (`d5-db-rows.txt`). pgTAP gives
  74 files/7626 tests PASS (`d5-pgtap.log`).
- Final gates: see `runs/PASANT-02/executor-report-r1.md` (same commands as the baseline, after the last edit).

## Scrutinize

1. **Rebuild versus port.** The three files were rewritten on `2922e1b74`, not cherry-picked. Check that PROJECT_STATE
   keeps every main entry (NOTIF-24/25 and the others) and that no stale r0 number (521 files, 13238 tests, 635 main-side
   commits, 73/7544 pgTAP) survives where a current count belongs.
2. **The baseline statement.** R-14 still says implementation starts from `ws/pasant-as` at `76349909`. The
   reconciliation calls that overtaken by the main rebuilds and PR #162, but does not edit the register. Check that this
   is a truthful continuation and not a silent baseline swap.
3. **P02-A1 attribution.** §4 now assigns C008 to B002 and C004–C007 to B003 (C009 to B004, C010 to B005, C011 to B006).
   Check it against the approved plan's layout.
4. **D5 harness path and isolation (P02-A2).** I did not run `pm-unit ui-setup`, so no `.env.development.local` exists in
   this worktree. The flow ran through Playwright's CI `next start` against a newly declared private stack `pasant02r1`,
   not through `pm-unit ui-run`. Check the isolation evidence.
5. **Reused versus fresh evidence.** The child acceptances (05/06/07) and the r0 decisions are reused. The baseline, final
   gates, refs, probes, flow and pgTAP are fresh on this base. The full mandatory e2e suite and the four PR CI gates are
   not claimed; they stay with B006/C011.

## Known limitations

- The product still renders October 2026. C008 is B002; January content C004–C007 is B003; cumulative C011 is B006;
  R-08/R-17 are Brent-owned releases. B001 stays open until the PM's independent acceptance.
- PR #46 is still open; closing it as superseded is Brent's call.
- `node_modules/`, `.next/`, `.e2e-outbox/` and `tests/e2e/.auth/` are ignored local artifacts. The private stack and its
  network are kept for review.
