# SM-02 review request — school-wide hours totals count shared allocations once

## Branch and base
- Branch: `codex/sm-records`
- Base SHA: `88ddf334f6f806518607800af9e32fb658adf61f` (r0 was based on `eea014eda`; the only commit between them is a docs ledger conversion)
- Commit count: 0. All changes are uncommitted in the working tree. The PM makes the local commit after review.
- Orders: `pm-workflow/runs/SM-02/order-r0.md` (SHA-256 `386a0bc3…def4a4`); remediation `order-r1.md` (SHA-256 `65685eb7…062cf`), which fixes the two defects from the independent r0 review (SM02-R0-01, SM02-R0-02) and adds the inventory test to the allowlist.

## Objective (from the order)
Resolve A14-4-F01 under W-BL-A14-4. The school-wide PDF's reserved, consumed and available hours must count each contributing allocation and ledger row once, even when a parent contract and its linked annex are both active. Keep the per-contract RPC/view semantics, the meaning of contracted hours, and the existing session/CSV display. Deliver a regression test that fails before the fix and passes after, running the real service through to the real PDF, plus synthetic browser evidence.

### Scope in
- An additive `school_summary` field on `SchoolReportData`, computed by the real service with the same membership as `get_bucket_summary`: direct allocations plus one-hop `adds_to_allocation_id` annexes, deduplicated by allocation ID. Ledger accounting also matches it (reservada/consumida/penalizada, via `billableHours`).
- The PDF summary reads `school_summary`, with no fallback to per-contract sums.
- Contracted hours stay the sum of active contracts' `horas_contratadas`. Negative availability is preserved.

### Scope out
F02–F12, export redesign, attendance, auth/role/tenant changes, RPC/schema/billing writes, general refactoring, DB work.

## Files by risk
**High (hours-sensitive product logic)**
- `lib/services/school-hours-report.ts`: `readAllIn` (paged and chunked reads that throw on failure; each caller passes a query with a literal table target, and the offset advances by the rows actually returned until an empty page), `finiteOrThrow`, `computeSchoolSummary`, and `school_summary` on all three return paths.
- `pages/api/school-hours-report/[school_id]/pdf.ts`: grand totals now come from `school_summary`.

**Medium**
- `lib/types/hour-tracking.types.ts`: new `SchoolHoursSummary` and required `SchoolReportData.school_summary`.

**Tests**
- New `__tests__/fixtures/school-report-totals.ts`: in-memory tables, a PostgREST-like builder with a 1000-row cap (plus an optional smaller `rangedMaxRows` cap on ranged reads), fault injection, shuffling, a query log, and an oracle derived from the SQL of `get_bucket_summary`.
- New `__tests__/api/hour-tracking/school-report-totals.test.ts`: D1–D7, running the real service, the real JSON/PDF handlers and real jsPDF/autoTable, with the PDF parsed by pdf-lib.
- `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`: one line. `DIRECT_TS_TOUCHES['lib/services/school-hours-report.ts']` is now `['aggregate', 'billable']`, in source order: the new school-wide ledger read, then the existing drill-down read. The scanner, fail-closed checks and mutation tests are unchanged.
- Updated `__tests__/lib/services/school-hours-report.test.ts`, `__tests__/api/hour-tracking/school-report.test.ts` and `__tests__/api/hour-tracking/school-report-pdf.test.ts`. The mocks now serve the new allocation/ledger reads and zero summary. No assertions were weakened.

## Test evidence
All commands run with `mise exec node@22.16.0 --` on the final source (round 1).
- Focused suites plus the inventory suite, 236 tests pass: service 23, billable-hours 17, JSON 11, PDF 6, totals 112, ledger inventory 67.
- Red before the fix: with the product modules aliased to their HEAD versions, 63 of 100 of the original totals tests fail. The HEAD PDF prints `82.0 / 4.0 / 2.0 / 84.0`; the expected values are `82.0 / 3.0 / 2.0 / 75.0`.
- Red before the short-page fix: restoring the r0 loop (stop on a page shorter than 1000) makes 11 of the 12 new round-1 tests fail. For example, a one-row cap gives a wrong JSON summary, and a failure on a page after a short page is never reached.
- `npm run type-check` exit 0. `npm run lint` exit 0, no warnings. `npm test` exit 0: 358 files, 9305 passed, 1 skipped, 0 failed.
- `npm run build` exit 0 with the documented non-secret synthetic values `NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:9 NEXT_PUBLIC_SUPABASE_ANON_KEY=sm02-synthetic-placeholder-not-a-key`. Without them the build fails at "Collecting page data", both on HEAD and on this change. That is an environment limit, not a code defect.
- Browser (loopback harness, actual `SchoolHoursReport` component, real handlers): 22 assertions pass (D8 12, D9 10).
- Round 0 findings: the inventory census/dynamic-target failures (R0-01) and the short-page truncation (R0-02, PM probe 60/0/2/58 against the expected 80/2/3/75) are fixed and covered by the tests above.

## Where to scrutinize hardest
1. **`readAllIn` paging.** The offset advances by the rows actually returned, and a chunk ends only on an empty page. That costs one extra request per ID chunk. Offset paging relies on a stable `order('id')`, so rows inserted or deleted mid-read could still shift pages. The per-contract RPC has the same point-in-time limit.
2. **One-hop membership and dedupe.** Linked annexes are read by `adds_to_allocation_id IN direct IDs` and are not expanded recursively, matching the RPC. Check that a chain A→B→C matches what `get_bucket_summary` yields per contract and what the order intends.
3. **Fixture/oracle independence.** The oracle is meant to be derived from the checked-in SQL, not from the production aggregation. Confirm it doesn't share logic or data shapes that would hide the same bug.
4. **PDF parse strictness.** D1/D7 assert on numbers extracted from the PDF text layer. Check that the extraction targets the "Resumen General" block, not incidental matches.
5. **Browser harness fidelity.** Supabase clients are mocked by an adapter over the same fixture, and there is no MainLayout or Next runtime. The Recharts donut isn't drawn and the Google Fonts import was stripped. The harness shows component, service and PDF integration, not real session, RLS or deployed-app behaviour.

## Known limitations and deferred items
- The PDF prints totals with `toFixed(1)` and a `.` decimal separator. This formatting was already there before this change and was left out of scope. JSON uses 2 decimal places.
- Nonfinite values in the per-contract RPC are still not validated (pre-existing). Only the new summary inputs are checked.
- D5's PDF generation exception is forced by making `jsPDF.API.splitTextToSize` throw.
- The short-page cap in the fixture applies only to ranged reads. The existing unranged per-contract reads (contracts, sessions, session ledger) were not changed and are not paged.
- The full seeded E2E suite and `test:db` were not run locally (no DB changes); E2E remains a shipping gate.
- The phase is not complete until the PM approves it.
