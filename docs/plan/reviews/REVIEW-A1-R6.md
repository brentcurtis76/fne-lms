# CODEX REVIEW — A1 round r6 (scoped confirmation)

VERDICT: PASS

The owner-directed headline-span delta at `948e616` is correct at the final
reviewed branch head `21a7a34`. The label is a single visit-day-derived span,
prints the month once and the year once, contains neither an en dash nor a
two-range join, and renders on the homepage exactly as the amended A-1 requires.
The executor's year-after-span placement is accepted: the prompt's factual
premise that the year already rendered separately was false, and following its
literal placement instruction would have duplicated `Octubre`. No r6-introduced
finding exists.

BLOCKING:

- None.

SHOULD-FIX:

- None introduced by r6. The pre-existing A1 S1 importer-allowlist and S2
  durable rendered-card assertion remain in the phase backlog and were not
  reopened by this scoped confirmation.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **Single-span derivation confirmed** —
  `lib/pasantias/cohort-public.ts:303-322` flattens the supplied weeks'
  `visitDays`, takes the first and last entries, derives the month from the
  first ISO date, and produces `Octubre, 5 al 16`. `COHORT_YEAR` is separately
  derived from the first week's ISO date, and `COHORT_HEADLINE` composes the
  span plus that year. There is no literal October span in the implementation.
- **The prohibition is pinned, not merely implied by the happy-path string** —
  `__tests__/lib/pasantias-cohort.test.ts:130-150` pins the exact span and
  headline, rejects an en dash and the `" y "` range join, rejects a year in
  the span, and requires exactly one `2026` and one `Octubre` in the headline.
  The targeted cohort/leak-guard run independently passed **2 files / 54 tests**.
- **Synthetic-calendar derivation proof confirmed** —
  `__tests__/lib/pasantias-cohort.test.ts:153-172` supplies November week blocks
  whose block boundaries differ from their visit-day boundaries and expects
  `Noviembre, 3 al 11`. This is non-vacuous proof that the formatter uses the
  supplied visit-day data rather than the October constant or the week blocks.
  The cohort suite independently passed **38/38** under `UTC`,
  `Europe/Madrid`, and `America/Santiago`.
- **Rendered evidence confirmed** —
  `docs/plan/evidence/a1/headline-span.md:9-31` records the prerendered homepage
  and retired-shape absence. I independently rebuilt and inspected
  `.next/server/pages/index.html`: the `data-testid="cohort-headline"` element
  contains exactly `Octubre, 5 al 16 · 2026`; neither `5–9 y 13–16` nor the
  doubled-month `Octubre 2026 · Octubre, 5 al 16` appears in the server/static
  output. `pages/index.tsx` remains untouched and still renders
  `COHORT_HEADLINE`.
- **Year-placement deviation accepted** — before r6, `COHORT_LABEL` was
  `Octubre 2026` and the year existed only through that value in the same
  homepage `<p>` as the date label; there was no separate card-title year.
  Retaining `${COHORT_LABEL} · ${COHORT_DATE_LABEL}` after the amendment would
  therefore have rendered `Octubre 2026 · Octubre, 5 al 16`. The executor's
  `${COHORT_DATE_LABEL} · ${COHORT_YEAR}` is the minimal data-derived resolution
  that satisfies amended Appendix A-1 and the realigned A1 [A4]: single span,
  month once, year once alongside.
- **PM verification and criteria correction reconciled** — the final two
  ledger entries on `main` are correctly read together. The first records the
  PM's rendered verification and acceptance of the year placement at
  `docs/plan/LEDGER.md:708-716`; the next explicitly corrects its false claim
  that the criteria rewrite had landed at `docs/plan/LEDGER.md:718-726`.
  Final `main` now contains the actual single-span [A4] criterion at
  `docs/plan/PLAN.md:125`, the owner Decision Log row at line 360, the binding
  retired-literal checklist rule at line 361, and amended Appendix A-1 at line
  369.
- **Head gates green** — independently run at `21a7a34`: `npm run type-check`
  passed; `npm run lint` passed with zero warnings; `npm test` passed
  **235/235 files and 3502/3502 tests**; `npm run build` compiled and generated
  **156/156 static pages**; and `node scripts/check-price-leak.mjs` reported
  **266 client files scanned, no commercial data found**. The branch worktree
  remained clean.
- Review scope was limited to commits `948e616`–`21a7a34`, the final PM
  verification/criteria-realignment entries on `main`, and the four surfaces
  named in the request. The delta contains only the derivation, its tests, the
  rendered evidence/review request, and the executor ledger entry; no unrelated
  source or layout change was considered.

There is no numbered residue for Brent under SOP §1.5.
