# Fase SM-09 — review request

Ledger item W-BL-A14-4 / A14-4-F06 (school-switch and download consistency).

## Branch and base

- Branch `codex/sm-records`, base `9f982e1b030db31c4615ce37987519608fa3dfa8`
  ("SM-08: identify partial session detail across reports").
- Commits in this phase: **0**. The work is delivered uncommitted for independent review;
  the local commit is taken through `pm-unit` on approval, as in SM-03…SM-08.

## Objective and scope

**Objective.** Establish an evidence-backed disposition of F06: after a school switch, only
the newest request may determine the displayed school and report, the loading/error state,
and the contract data that the CSV and the PDF export.

**In scope.** Verification only — regression coverage for the request orderings that were
not previously exercised, and a written reconciliation of the historical F06 note with the
implementation as it stands.

**Out of scope, and deliberately untouched.** Application code (`components/hours/…`,
`pages/api/school-hours-report/…`, `lib/services/…`) is read-only in this phase; so are
auth/role/filter/tenant/billing/hour semantics, DB/schema/RLS/migrations, dependencies,
configuration and shared fixtures. No product repair was authorized and none was made.

## Outcome

**F06 is not reproducible against the current implementation.** `SchoolHoursReport.tsx`
already sequences requests with `requestSeqRef` and drops every stale completion. The
historical "no request guard" note is stale; the repository wins. Full reasoning, provenance
and limitations: `RUN/verification-findings.md` (PM run directory).

## Files by risk

| Risk | File | Change |
|---|---|---|
| Low | `__tests__/components/hours/SchoolHoursReport.export-scope.test.tsx` | +440 lines: 10 new regressions in five `SM-09 …` describes, plus a marked-fixture factory and a hand-released two-stage fetch stub. Nothing pre-existing was edited except the `@testing-library/react` import, which now also pulls in `cleanup`. |
| Low | `docs/planning/reviews/fase-sm-09-review-request.md` | this file (new) |

No other repository file is modified by this phase. The only other working-tree change on the
branch is the PM's own `docs/ledger/santa-marta.md` delta, which predates this phase.

## Test evidence

Baseline captured on the untouched tree before the first edit (`RUN/evidence/baseline.md`):
269 focused / 435 files / 10172 passed / 12 pre-existing skips; type-check, lint and build
green; **no failing test at baseline**, so nothing is waived.

| Suite | Command | Result |
|---|---|---|
| Focused (7 specs) | `vitest run <7 specs> --reporter=json` | 279 passed / 0 failed (269 baseline + 10 new) |
| Full unit/integration | `npm run type-check && npm run lint && npm test` | 435 files, 10182 passed, 12 skipped; lint and type-check clean |
| Production build | `npm run build` | succeeded |
| Browser (executor) | `pm-unit ui-run SM-09 -- node RUN/ui/executor-journey.cjs` | UI1 7 assertions, UI2 5 assertions, 12/12 pass, 0 non-loopback requests |

The browser journey drives the real component, the real API handlers, the real report service
and the real CSV/PDF exporters; only the Supabase boundary is synthetic. It downloads real
files and parses them (CSV cells, every PDF page), rather than asserting on a URL.

## Where an independent reviewer should push hardest

1. **Is the deferred-fetch stub honest?** `queueDeferredResponse` resolves the HTTP response
   and the JSON body separately, by hand. If it released both together, the "A1's body lands
   after A2 finished" case would not be the case it claims to be. Check that the component
   really awaits `res.json()` after the guard's first read of `requestSeqRef`.
2. **Do the new tests bite, or pass vacuously?** I ran them against a guard-less copy of the
   component, entirely outside the repository (`RUN/evidence/mutant/`): 3 of the 10 fail
   without the guard. The other 7 exercise single-generation paths the guard is not on — and
   one D2 case is genuinely insensitive to that mutant because `if (error)` renders before
   `data`. That is written up rather than papered over; judge whether the insensitive case
   earns its place.
3. **The `revised` harness scenario.** To make two generations of the *same* school
   distinguishable I added a scenario to the RUN-owned fixture adapter that re-marks school
   42's name and contract numbers (`SIN-…` → `REV-…`). Markers share no substring with the
   first generation's, deliberately, so "is the stale one present" is a plain containment
   check. Check that this is synthetic data shaping and not a behaviour change.
4. **Line count.** The test addition is 440 lines against a ~400-line working guideline. I
   trimmed twice (dropped a low-value error-message test, merged two D2 tests) and judged the
   remainder to be the smallest set that covers every Done-when row. Push back if a row could
   be covered with less.
5. **PDF coverage is one page.** These contracts produce single-page PDFs, so "every page"
   is one page. The many-page case was SM-08's; if that is not good enough here, the journey
   would need a bulk contract.

## Known limitations and deferred items

- The browser journey's auth boundary is synthetic (a `qa_user` cookie in place of a Supabase
  session). Real-session behaviour remains the seeded Playwright E2E gate's responsibility.
- pgTAP/RLS and the seeded E2E suite were not run: this phase touches no database, no
  migration and no application code.
- A stale success landing behind a latest *error* would still corrupt in-memory state without
  the guard, invisibly. With the guard it cannot; no change is proposed, it is recorded.
