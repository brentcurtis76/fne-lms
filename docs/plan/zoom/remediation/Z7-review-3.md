# Z7 independent review — remediation round 3

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `c9cbdafd63927c6ae38e7fe649bc816676220d46`
- Independent decision: `REVISE`; this SHA is not accepted
- Scope: three remaining findings only, with cumulative final review retained
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

Round two's core production fixes were independently found structurally sound and its
rollback-only PostgreSQL checks were green. Resolve all three remaining findings below.

## Z7-R3.1 — Malformed participant rows leave batches pending (`MAJOR`)

`lib/zoom/api.ts` validates only that `participants` is an array, then casts elements.
A valid JSON response containing `participants: [null]` reaches participant normalization,
throws `TypeError`, and bypasses the page-fetch rejection handler. A retry creates another
pending batch, violating the terminal rejection requirement.

**Required:** validate every participant as a non-null object at the API boundary and make
`validateReportBatch` total over malformed runtime values, returning a stable rejection
reason rather than throwing. Preserve strict `next_page_token` validation and page-cap
taxonomy.

**Acceptance:** drive `participants: [null]` through the live adapter and reconciliation
handler; assert exactly one batch rejection, zero promotion, no uncaught `TypeError`, and a
stable malformed-row reason. Cover representative primitives/arrays if the runtime boundary
admits them. Restore the rejected behavior temporarily and prove the test fails, then restore
green.

## Z7-R3.2 — Canonical review artifact is incomplete (`MINOR`)

`docs/plan/zoom/reviews/fase-7-review-request.md` stops at 25 commits while the rejected
boundary contains 26, still refers to removed placeholders, and inventories only the
round-two subset. It omits 56 of 77 cumulative changed files.

**Required:** make the artifact cumulative from `43999499..HEAD`: remove stale placeholder
claims, record all stable full canonical SHAs/counts that can truthfully be embedded, and
inventory every cumulative changed file grouped by risk. The external review dispatch remains
the source for the inherently self-referential live review HEAD.

**Acceptance:** mechanically compare artifact inventory against
`git diff --name-only 43999499..HEAD` and require zero omissions. Verify recorded commit counts
and stable SHAs. Include the eventual round-three files and avoid duplicating an entry as a
substitute for a missing path.

## Z7-R3.3 — Project state says Z7 has not started (`MINOR`)

`PROJECT_STATE.md` reports no open Zoom phase and lists Z7 as merely available.

**Required:** update evolving state to say Z7 is implemented but remains in remediation/
independent re-review. Summarize delivered invariants, local-only migrations, verified gates,
and open status without calling the phase accepted, merged, deployed, or production-verified.

**Acceptance:** cross-check each state claim against the cumulative diff and final gate output.
State must remain `REVIEW READY`/awaiting independent pass.

## Boundaries and gates

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, test weakening, or unrelated refactor. Run the focused malformed-row
tests, type-check, zero-warning lint, full Vitest, build, full pgTAP, override concurrency,
mandatory 117-test Chromium selector, and the three-zone matrix. Existing advisory/broad-suite
deviations remain explicit. Commit code, tests, project state, and cumulative review evidence;
return ordered detached SHAs after the current builder head.
