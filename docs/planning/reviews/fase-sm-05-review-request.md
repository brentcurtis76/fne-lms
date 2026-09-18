# SM-05 review request — contract type column in the hours-report CSV

**Ledger item:** W-BL-A14-4 / A14-4-F02 (`docs/reviews/santa-marta-hours-report-findings.md`).
**Branch:** `codex/sm-records`. **Base:** `263d4388c112393dd2aa53d85d131f43ccf7d61d`.
**Executor commits: 0** — the executor does not commit; the changes below sit in the working
tree for the PM's local commit after review.

## Objective and scope

**In scope.** The CSV export must say whether the contract it exports is an ordinary
contract or an annex, using the same `is_annexo` flag the contract selector already labels
its options with. One column is appended to the existing rectangular file; the summary row
carries the label and every other row leaves the cell blank.

**Out of scope.** PDF, API, service and shared-exporter behaviour; hours and charge
semantics; the CSV file name (still the pre-existing school/date one, per SM-03); renaming
the API's `is_annexo` field to the database's `is_anexo`; findings F03–F12.

## Changes by risk

**Behaviour change (highest risk) — `components/hours/SchoolHoursReport.tsx` (+7/−3).**
`handleExportCSV` appends a seventeenth header, `Tipo de contrato`. The summary row's value
is `selectedContract.is_annexo ? 'Anexo' : 'Contrato'`. The three non-summary row kinds
(`Sesión`, `Categoría sin sesiones`, `Contrato sin categorías`) emit an explicit empty
cell. The first sixteen columns, their order, their values, the row kinds, the row count,
the file name and the PDF target are untouched.

**Test change — `__tests__/components/hours/SchoolHoursReport.export-scope.test.tsx`
(+179/−5).** `CSV_COLUMNS` gains the new column, so the pre-existing helpers
(`csvRows`, `expectedRow`) now assert seventeen cells per row and require every unnamed
cell — including the type cell on detail rows — to come back exactly empty. Six new tests
cover the label itself. All assertions read the Blob the component hands the browser,
through the existing RFC 4180 reader.

**Documentation — this file.** No runtime effect.

## Test evidence

| Suite | Command | Result |
|---|---|---|
| Focused (7 specs, 35 files) | `vitest run <focused set>` | 212 → 218 passed, 0 failed |
| `SchoolHoursReport.export-scope` | same | 17 → 23 passed |
| Full unit suite | `npm test` | 435 files, 10115 → 10121 passed, 12 skipped |
| `type-check` / `lint` / `build` / `git diff --check` | as in the order | exit 0 each |
| Browser journey UI1+UI2 | `pm-unit ui-run SM-05 … executor-journey.cjs` | pass, 18 assertions, 0 non-loopback requests |

The six new tests were run against the unmodified component first: 14 of 23 failed
(the 6 new ones plus 8 existing ones whose expected rows widened). Evidence:
`RUN/evidence/regression-red.json`, `RUN/evidence/baseline.md`.

The browser journey drives the real component and the real API handlers over loopback with
synthetic fixtures, downloads the actual CSV and PDF files and parses them: the parent
contract (which receives +10 h from its annex) downloads as `Contrato`, the annex as
`Anexo`, and the PDFs and file names are unchanged.

## Where to scrutinise hardest

1. **`blankTotals` was not extended.** The three non-summary rows each spread
   `...blankTotals` and then add `'Tipo de contrato': ''` separately, because the constant
   is documented as the four contract totals and the type cell is not one of them. The
   repetition is deliberate; the alternative was renaming an existing constant.
2. **The flag, not the number.** `is_annexo` comes from the API, which derives it from the
   database's `is_anexo`; nothing here reads the contract number or a bucket's
   `annex_hours`. A test feeds an ordinary contract an annex-shaped number
   (`SIN-2026-009-A4`) and +10 h of annex contributions, and a real annex a plain number,
   to prove neither decides the label.
3. **Existing readers that parse by position.** The column is appended, never inserted, and
   a test pins the first sixteen header cells and the first sixteen cells of the summary and
   of a session row to their pre-SM-05 values. A reader keyed on column *count* will still
   see a change — that is inherent to the order.
4. **`String(value || '')` in the shared exporter.** A missing key would already render an
   empty cell, so the explicit `''` is belt-and-braces. If a reviewer prefers omission, the
   behaviour is identical; the explicit form was chosen to keep each row literal readable.
5. **Label wording.** `Anexo` / `Contrato` mirror the selector's own `(Anexo)` suffix. They
   are plain es-CL text needing no CSV quoting, which a test asserts on the emitted line.

## Known limitations and deferred items

- The PDF still carries no equivalent type field; the order scoped this to the CSV.
- The file name still does not name the contract (SM-03 decision, unchanged).
- The synthetic browser evidence proves component, API-handler and download behaviour over
  loopback only. It certifies neither real authentication nor production data.
- Session detail rows still do not reconcile with the charged contract totals; that is the
  documented A14-4 behaviour and is not addressed here.
- F03–F12 of A14-4 remain open; the parent ledger item is not closed by this child.
