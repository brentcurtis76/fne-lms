# Fase SM-09 — review request

Ledger item W-BL-A14-4 / A14-4-F06 (school-switch and download consistency).

## Branch and base

- Release branch `fix/sm09-ci`, base `100b8339dc13b8b0f4eede7073bd6dfc253b0c7c`
  ("ledger: PROC-09 done"); the phase's own work was authored on `codex/sm-records` over
  `9f982e1b030db31c4615ce37987519608fa3dfa8` ("SM-08: identify partial session detail
  across reports") and reached this branch unchanged.
- Commits on the release branch above `origin/main`: **3** — `52077508f` (this phase's
  verification), `a7baaaa74` and `100b8339d` (PROC-09 carry-over, see "Release composition
  correction" below).
- Round 1 adds the release-composition correction; round 2 proves the database and browser
  gates on a disposable, fully migrated local stack and changes no repository file except
  this one. The local commit is taken through `pm-unit` on approval, as in SM-03…SM-08.

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
| Low | `docs/planning/reviews/fase-sm-09-review-request.md` | this file (new; updated in round 1) |
| Low | `supabase/tests/09{1,2,3,4,5}-b5-*.sql` | **deleted** in round 1 — five orphaned pgTAP files, see below |

No other repository file is modified by this phase. The only other working-tree change on the
branch is the PM's own `docs/ledger/santa-marta.md` delta, which predates this phase.

## Release composition correction (round 1)

**Remote failure provenance.** The SM-09 release pull request (PR 102) failed CI Gate 3
(`supabase test db`): run 35535009211, job 106142344039. Five pgTAP files abort before they
emit TAP because `public.assessment_template_source_revisions` does not exist in the release
schema — pg_prove reports `Bad plan`/`No plan found in TAP output` with a non-zero exit.

**Diagnosis.** The five files entered this branch only through the cherry-picked PROC-09
commit `a7baaaa74` ("PROC-09: renumber B5 pgTAP tests"), which adds those five files and
nothing else. No migration defining that table exists anywhere on `origin/main` or on this
release head, and the table is referenced by no application code — only by those five tests.
The migrations that do define it, `20260910123000_b5_snapshot_publication_foundation.sql` and
`20260910131000_b5_template_source_guard.sql`, exist only in the PROC-09 worktree on the
unfinished branch `codex/proc-e2e-auth`. The tests were published without their schema.

**Correction.** Round 1 deletes exactly those five files from this release candidate:
`091-b5-snapshot-publication.sql`, `092-b5-template-source-guard.sql`,
`093-b5-objective-module-source-guards.sql`, `094-b5-year-weight-source-guard.sql`,
`095-b5-year-expectation-source-guard.sql`. No migration or application code was added to
satisfy them, no test was rewritten, no gate was weakened, and the accepted SM-09
school-switch work is byte-identical (`SchoolHoursReport.export-scope.test.tsx`
sha256 `8f31af77…`, `components/hours/SchoolHoursReport.tsx` sha256 `42b55bb8…`, both
unchanged across the round).

**Effect on Gate 3 (round 2, on a fully migrated schema).** Round 1 could only measure against
a stale local database, where `npm run test:db` went from 48 files / 26 failing to 43 files /
21 failing — the baseline failing set minus exactly those five, with no new failure. Round 2
settles it on a fresh, fully migrated schema: a disposable local stack was created with its own
project identity and loopback ports, all 56 repository migrations applied from scratch
(`supabase_migrations.schema_migrations` → 56, latest `20260910120000`), and the unchanged suite
run against it. **`Files=43, Tests=4265, Result: PASS`, exit 0 — zero failing files.** The 21
residual round-1 failures were entirely an artefact of the stale target and do not exist on a
release-migrated schema.

The diagnosis re-confirms itself there: on the fully migrated schema,
`select to_regclass('public.assessment_template_source_revisions') is not null` still returns
`f`. The release migrations genuinely do not define that table, so the five deleted tests could
not have passed on any correctly migrated release schema — which is what CI reported.

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
| RLS / pgTAP (Gate 3) | `npm run test:db -- --db-url <disposable local stack>` | **exit 0** — `Files=43, Tests=4265, Result: PASS` |
| Seeded E2E (Gate 4) | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium`, `CI=1`, on the same stack after `scripts/ci/seed-e2e.mjs` | **exit 0** — 223 passed in 2.4 min |
| E2E skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | exit 0 — all 16 mandatory specs ran, none skipped |

Round 2's database and browser evidence was produced against a disposable Supabase stack with
its own project identity (`sm09isor2`) and unused loopback ports (API 54721, DB 54722), created
from the repository's own migrations, seeded with synthetic fixtures only, served on port 3097,
and destroyed afterwards. It never touched a shared, hosted or production database. The stack,
its fixtures and its teardown are recorded in the PM run directory
(`stack-manifest-r2.json`, `fixtures-manifest-r2.json`, `evidence/r2/`).

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
- **PROC-09 still owes a history-aware publication.** Removing these five files does not
  deliver the B5 capability; it only stops this release candidate from carrying tests whose
  schema is absent. PROC-09 must publish its B5 migrations and its tests together, as one
  history, and re-add these five files there. Nothing in this correction should be read as a
  disposition of the B5 work itself.
- **`npm run e2e` as a whole is red, and was already red before this work.** That script runs
  every spec under `tests/` — 356 tests across 35 specs — whereas CI's Gate 4 runs only the 16
  mandatory specs (223 tests), which pass. The extra 19 specs were enumerated separately:
  60 failed, 27 skipped, 46 passed. Every `@flow @proposal` failure is the same
  `TimeoutError: page.waitForURL` inside the spec's own login helper, because those specs want
  a different fixture set —
  `tests/e2e/flows/proposal-admin-visibility.spec.ts:7` states the precondition itself
  ("Requires: running dev server + Supabase with seeded licitaciones"), and
  `scripts/ci/seed-e2e.mjs` seeds no licitaciones and none of those accounts. That is why
  `scripts/ci/e2e-mandatory.mjs` excludes them from the gate. None of it can be an effect of
  this phase: a grep over the whole tree finds no file under `tests/` that reads any of the
  five deleted `supabase/tests/*.sql` files or this document, so deleting pgTAP files and
  editing Markdown cannot change a browser test. Bringing those 19 specs green is its own
  piece of work and is not claimed here.
- Round 1's local Gate 3 measurement ran against a stale database (40 of 56 migrations) and is
  superseded by round 2's fully migrated result above. The shared local stack was never reset
  or mutated in either round.
- A stale success landing behind a latest *error* would still corrupt in-memory state without
  the guard, invisibly. With the guard it cannot; no change is proposed, it is recorded.
