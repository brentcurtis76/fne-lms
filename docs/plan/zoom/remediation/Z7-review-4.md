# Z7 independent review — remediation round 4

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `26ab5d10f80cab526ea2cb38f0469b10b503e462`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: canonical ref/clean state/merge base/30-commit count passed
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The cold reviewer independently ran 277 focused Vitest checks, type-check, zero-warning
lint, the RLS-disable guard, and 342 rollback-only database assertions. Those checks were
green, but the final runtime and consumer sweeps found the four gaps below. Resolve every
finding, retain all earlier remediation, and prepare another cumulative cold review.

## Z7-R4.1 — Contradictory pagination metadata can become authoritative (`MAJOR`)

`lib/zoom/attendance-report.ts` and `lib/zoom/api.ts` type-check numeric metadata but do
not validate its integer/range constraints or reconcile it with the pages and participants
actually fetched. An exact runtime probe accepted a one-page response declaring
`page_count: 2`, one participant, `total_records: 1`, and an empty continuation token.
That candidate was eligible for promotion even though an expected page was suppressed.

**Required:** validate finite integer and range constraints and reconcile fetched-page
count, `page_count`, `page_size`, participant counts, `total_records`, and the terminal
token using Zoom's documented zero/nonzero semantics. Reject contradictions with a stable
taxonomy before promotion. Preserve valid multi-page reports and valid zero-participant
reports.

**Acceptance:** drive contradictory page counts and negative/fractional numeric metadata
through the live adapter and reconciliation job. Require exactly one rejection, zero
promotion, and preservation of the prior complete batch. Prove the tests fail with the
new guards temporarily removed, then restore green.

## Z7-R4.2 — JSON ledger endpoint fails open on consultant scoping (`MAJOR`)

`pages/api/contracts/[id]/hours/ledger/index.ts` discards the `session_facilitators`
query error and converts null data to an empty list. A database failure can therefore
produce a successful empty financial ledger instead of an error.

**Required:** capture the facilitator-query error and return a generic 500 before
constructing the ledger query or an empty response.

**Acceptance:** a failed facilitator lookup returns 500 with no ledger payload; a
successful zero-row lookup remains a legitimate empty response; successful consultant
scoping is unchanged.

## Z7-R4.3 — Required direct-ledger-reader audit is absent (`MINOR`)

The phase review request contains the cumulative changed-file inventory but not the R1
inventory of every production reader of `contract_hours_ledger.hours` and each intentional
historical-evidence exception. Its closure claim is therefore stronger than the evidence,
and `lib/services/billable-hours.ts` still describes only two consumers. R4.2 demonstrates
that this sweep was incomplete.

**Required:** add a mechanically checked production-reader inventory. Classify every use
as billable, aggregate, status-only, write, or historical evidence; document and justify
every exception; correct stale consumer comments and any overclaimed disposition.

**Acceptance:** compare the documented inventory with searches across production SQL,
`lib/`, and `pages/`; require zero unexplained direct readers. Record the exact search and
classification evidence in the cumulative review request.

## Z7-R4.4 — Migration comment contradicts terminal batch authority (`MINOR`)

The lifecycle comment in
`supabase/migrations/20260813120100_zoom_attendance_report_batches.sql` depicts
`pending -> complete -> rejected`, while the implemented authority correctly permits only
`pending -> complete | rejected`.

**Required:** correct the branch notation and ensure comments, trigger/function contract,
and tests describe the same terminal state machine.

**Acceptance:** the migration documentation and terminal-state pgTAP assertions agree;
complete and rejected batches remain terminal.

## Evidence and review boundary

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from
`4399949942bfcf49dfa8de40cbf7edbf40f0490e` through the eventual canonical head. Add all
round-four files to the exact changed-file inventory without duplication and record honest
fail-on-old, focused, full-gate, database, concurrency, selector, and timezone results. The
external dispatch remains the source of truth for the self-referential final SHA.

No merge, push, deployment, Vercel call, production/remote DB access, real data, RLS
disablement, destructive migration, test weakening, or unrelated refactor. Run focused
round-four tests, type-check, zero-warning lint, full Vitest, build, full pgTAP, override
concurrency, the mandatory 117-test Chromium selector, and the three-zone matrix. Record
inherited advisory/broad-suite deviations explicitly. Commit code, tests, docs, and evidence;
return ordered detached SHAs after the current builder head.
