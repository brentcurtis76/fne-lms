# SM-03 review request — ledger W-BL-A14-4 / child A14-4-F02

**Branch** `codex/sm-records` · **base SHA** `7c9629c4763a4bde7c22ba9dcbb785663be01f27` · **commits by the executor** 0
(the executor does not commit; the PM commits this working tree after review, per the unit's rules).

## Objective and scope

Both download buttons on the school hours report must export the contract actually shown on
screen, within its school and program. The PDF summary and detail use the existing
`ContractSummary`; the CSV exports that contract's session rows only. Hours calculation and
parent/annex accounting are preserved exactly.

**In scope.** The selected-contract export path: one effective selection shared by the display,
the selector and both downloads; request sequencing so a superseded report can never become
that selection; an optional `contrato_id` on the PDF route, resolved only inside the school's
already-authorized report.

**Out of scope (unchanged).** New hours measures or calculations, the school summary and the
report service, F01, the remaining F02/F03–F12 findings, attendance, and any auth, role, RLS
or tenant policy. No database, migration or dependency change.

## Files

**Behaviour (higher risk)**
- `components/hours/SchoolHoursReport.tsx` — selection lifted out of `ProgramView` into the
  parent; `requestSeqRef` drops superseded responses; CSV and PDF scoped to the selection.
- `pages/api/school-hours-report/[school_id]/pdf.ts` — optional `contrato_id`; contract-scoped
  summary heading and program/contract rendering. The `Content-Disposition` file name is the
  pre-existing `reporte-horas-<school>-<date>.pdf`, unchanged by this unit.

**Tests (lower risk)**
- `__tests__/api/hour-tracking/school-report-contract-export.test.ts` (new, 21 tests) — the real
  `fetchSchoolReportData` over the in-memory fixture feeding the real route and real jsPDF; the
  emitted bytes are parsed back with pdf-lib.
- `__tests__/api/hour-tracking/school-report-pdf.test.ts` — five added cases: the legacy
  whole-school render and filename, the selected-contract summary, and the 401/403/405 refusals
  with a contract named.
- `__tests__/components/hours/SchoolHoursReport.export-scope.test.tsx` (new, 16 tests) — the real
  component through `@testing-library/react`, driving the real `ReportExporter.exportToCSV` and
  reading back the Blob it hands to the browser. All 16 execute and pass; see Limitations for how
  the jsdom environment was repaired.

**Documentation**
- `docs/planning/reviews/fase-sm-03-review-request.md` (this file).

## Test evidence

Every command below ran under Node 22.16.0 with
`NODE_OPTIONS=--require=RUN/runtime/register-canvas.cjs` (the repaired runtime, see Limitations).

| Gate | Command | Exit | Result |
|---|---|---|---|
| Focused | `npx vitest run` over the seven ordered suites | 0 | **7 files, 35 suites, 211 tests, 211 passed, 0 failed** (was 6 files / 195 before the runtime repair — the seventh file contributed 0) |
| Type-check | `npm run type-check` | 0 | clean |
| Lint | `npm run lint` (`--max-warnings=0`) | 0 | clean |
| Unit | `npm test` | 0 | **435 files, 10114 passed, 12 skipped, 0 failed** (383s) |
| Build | `npm run build` with synthetic Supabase env | 0 | compiled successfully (79s) |
| Browser | `pm-unit ui-run SM-03` — UI1 1366×768 directivo, UI2 390×844 admin | 0 | 17 assertions (UI1 8, UI2 9), 0 failures, 0 non-loopback requests, harness stopped |
| Whitespace | `git diff --check` | 0 | clean |

**Baseline versus final, by the same commands and runtime.** The baseline for the five gates was
taken on the untouched tree (`RUN/evidence/baseline.md`); the baseline for the suites the runtime
repair activates was taken on an isolated `git archive HEAD` snapshot (`RUN/evidence/r1-baseline.md`).

| | Files | Passed | Skipped | Failed |
|---|---|---|---|---|
| Baseline (358 non-jsdom + 75 jsdom) | 433 | 10072 | 12 | 0 |
| Final | 435 | 10114 | 12 | 0 |
| Delta | +2 (the two new suites) | +42 | 0 | 0 |

+42 = 21 (contract-export) + 16 (component) + 5 (added to `school-report-pdf.test.ts`). The
arithmetic closes exactly, so no pre-existing test changed state. **No failing test at baseline or
at final**, and the 12 skips are the same 12 in both: 1 in
`__tests__/scripts/production-qa-simulation.postgres.test.ts` (needs a local Postgres) and 11
`it.skip` cases in two `JoinMeetingButton` files — unrelated to this unit, carried, not claimed as
passes.

Failing-before is recorded: against the HEAD sources the new contract-export suite fails 12 of
21 tests (`RUN/evidence/before-contract-export-failures.txt`); after the change all 21 pass.

## What an independent reviewer should scrutinise hardest

1. **The fallback in the effective selection.** `selectedContract` falls back to the active
   program's first contract when the stored id no longer matches. That is what keeps the
   selector, the display, the CSV and the PDF in agreement after a program switch or a refresh
   that drops a contract — but it also means a stale id silently resolves to a *different*
   contract rather than to nothing. Check that no path can show contract A while exporting B.
2. **Where the `contrato_id` 400 sits.** Format validation runs after the RBAC block and before
   `fetchSchoolReportData`, so an anonymous or foreign-school caller still gets 401/403, and a
   malformed id is refused without a report read. The consequence is that a malformed id plus a
   non-existent school answers 400, not 404. The order fixes neither precedence explicitly.
3. **The repaired test runtime, and what the gates therefore prove.** The jsdom suites in this
   worktree only run with a RUN-local preload that redirects `require('canvas')` to a real
   canvas@2.11.2 compiled under `RUN/runtime` (`RUN/runtime/manifest.json`). Nothing in the
   repository, the shared `node_modules` or any config changed, so **without that
   `NODE_OPTIONS` these 76 jsdom files are still silently dropped here** — check the runtime
   identity and re-run with the same prefix rather than trusting a bare `npm test` in this
   worktree. A normal Linux install of the dependencies builds canvas itself, so CI is unaffected.
4. **The component suite's browser boundary.** jsdom 20 implements neither
   `URL.createObjectURL` nor `Blob.prototype.text`, so the suite defines the former before
   spying on it and reads the emitted Blob back through `FileReader`. That is the only reason
   all 16 cases went from failing to passing — no assertion was relaxed. Worth confirming the
   captured CSV really is the component's own Blob and not a fixture.
5. **`setData(null)` at the start of every load.** It guarantees no stale report survives a
   school change or a failure, and it means a re-fetch briefly clears the screen. Confirm no
   caller depends on the previous behaviour of keeping the old report visible while reloading.
6. **The UUID pattern versus the checked-in fixture ids.** `__tests__/fixtures/school-report-totals.ts`
   uses placeholder contract ids (`k1000000-…`) that are not UUIDs. The harness adapter rewrites
   them to real UUIDs rather than loosening the route's validation. Confirm that no production
   path can hold a non-UUID `contratos.id`.

## Known limitations and deferred items

- **Why the jsdom suites were omitted, and what now executes.** This worktree's `node_modules`
  is a symlink to a tree installed on macOS in which `canvas@2.11.2` has no built native binary.
  jsdom 20 resolves `canvas` and then requires it, the throw is uncaught, vitest cannot create
  the environment and **drops the file with no message and exit 0**. Exact census at HEAD: **75
  tracked files — 65 of 65 `.test.tsx` plus 10 `.test.ts`** carrying
  `@vitest-environment jsdom` (`RUN/evidence/r1-jsdom-census-head.txt`), i.e. 778 tests never ran,
  including this unit's 16. With this unit's new file the activated set is 76 files.
  The repair copies the same canvas 2.11.2 package into `RUN/runtime`, compiles its real binding
  with the toolchain on this machine (cairo 1.18.4, pango 1.58.2, node-gyp 11.0.0 bundled with
  npm), and redirects only `require('canvas')` to it. No version changed, nothing was downloaded,
  the shared tree is byte-for-byte as before, and no DOM or canvas is faked.
  Omitted-versus-executed: **omitted before 75 files / 778 tests; executed now 76 files /
  767 passed + 11 pre-existing `it.skip` + this unit's 16 passed.** Nothing is left omitted, so
  no Done-when row rests on browser evidence in place of its ordered test.
- **The 67 governance ownership errors are a different thing.** The r0 report guessed that the
  "67 historical ownership failures" were these missing `.tsx` files. They are not: those come
  from a separate governance/ownership validator on its own backlog and never appeared in vitest.
  The count also differs (65 tracked `.test.tsx`, not 67). That conflation is withdrawn.
- **`npm run type-check` sets its own `NODE_OPTIONS`** (`--max-old-space-size=8192`), which
  replaces the preload for that gate only. `tsc` never loads canvas, so it is unaffected; no
  script, lockfile or config was edited to work around it.
- The browser harness replaces only the Supabase boundary; the component, the styles, the
  service, the route and jsPDF are the real ones. Synthetic data only.
- Deferred, as ordered: broader CSV aggregate fields, charged-versus-session semantics,
  attendance, and the remaining parent findings. Parent W-BL-A14-4 stays open.
