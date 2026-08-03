# CODEX REVIEW — A3 final (two rounds)

VERDICT: PASS

Phase A3 satisfies the frozen generator, content, D-02, extraction, page-count,
visual-QA, and filename-constant criteria at code commit `eae6e12` and final
reviewed branch head `2993731`. The generated brochure remains a valid
data-faithful fallback/regression canary under the owner's D-05 override
decision, and the generated ficha is fit to ship. No BLOCKING finding remains.
Two guard helpers should be tightened before A4 consumes or extends them, but
neither gap changes the current PDF bytes or makes either committed filename
unsafe.

BLOCKING:

- None.

SHOULD-FIX:

- [S1] `lib/pasantias/pdf/filenames.ts:34-44` calls its predicate
  `isRfc5987SafeFilename` and documents that a passing value can be inserted
  verbatim in both `filename=` and `filename*=UTF-8''...`, but it accepts every
  printable ASCII character except a short denylist. RFC 5987's extended-value
  grammar is narrower: spaces and characters such as `'`, `*`, `%`, `(` and `)`
  are not `attr-char` and must be percent-encoded. Independent probes returned
  `true` for `a b.pdf`, `a'b.pdf`, `a*b.pdf`, `a%b.pdf`, and `a(b).pdf`. The two
  committed constants contain only valid `attr-char` characters, so A3 [A5]
  itself passes and this is not blocking. Before A4 treats this helper as a
  general header-safety gate, either implement the exact `attr-char` grammar
  (and add those negative cases) or rename/scope the helper and apply a real
  RFC 5987 encoder to `filename*`. Normative grammar:
  https://www.rfc-editor.org/rfc/rfc5987.html#section-3.2.1.

- [S2] `lib/pasantias/__tests__/pdf.test.ts:194-197,238-258` gives the retired
  €560/€1.560 guard a genuine positive/negative control, but the currency
  context is asymmetric. It catches `€560`, `560 €`, and `560 EUR`, while
  independent probes show that `EUR 560`, `EUR 1.560`, and `euros 560` pass.
  The current brochure contains none of those forms and the commercial module
  contains no retired amount, so the frozen output criterion passes. Tighten
  the prefix side to accept the same `€|EUR|euros?` marker set as the suffix
  side, add those prefix cases to the positive controls, and retain the four
  innocent negative controls.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- **Normative source and review scope** — Phase A3 and Appendix A were read
  from `origin/main`, including amended A-1/A-8 and the owner decision that the
  customer-facing brochure will use D-05's approved manual-override path while
  this generator remains the fallback/canary and the ficha remains generated.
  Round 1 reviewed the complete A3 surfaces plus the implementation delta
  `0022fe9..eae6e12`; round 2 rechecked the controls, all 12 committed renders,
  and the final PM ledger entry at head `2993731`. The post-code commits change
  only the ledger/review evidence.

- **PDF suite passes independently** —
  `npx vitest run lib/pasantias/__tests__/pdf.test.ts` passed **1 file / 29
  tests**. Both generators returned `%PDF-` bytes; the brochure is 10 pages
  (criterion: at least 5) and the ficha is 2 pages (criterion: 1–2). Real
  `pdf-parse` extraction confirmed Appendix A content, the single-span
  headline, the investment band and terms, the absence of Madrid and retired
  totals, and the ficha's monetary-token-free output.

- **D-01/D-02 boundary holds in the final tree** — the source-level importer
  sweep at `lib/pasantias/__tests__/pdf.test.ts:365-428` enumerates the relevant
  source directories and pins exactly three direct importers of
  `cohort-commercial`: `lib/pasantias/brochure.tsx` plus the two test files.
  Independent `rg` inspection agrees: `lib/pasantias/brochure.tsx:40-48` is the
  only production importer. `lib/pasantias/ficha.tsx:20-43` reaches only the
  public module and shared price-free components/format/contact/filename code.
  The generated ficha text matched none of the currency symbols, amounts,
  commercial phrases, or sentinel in the test's monetary-token set.

- **Only the brochure contains commercial output** — the generated brochure
  renders €1.000, the €70–€120 per-person/per-night band, base-double precision,
  coordination framing, 50%/30-day terms, minimum 5, and cohort validity. It
  renders no €560/€1.560 form, total, night count, or Madrid option. After the
  fresh production build, `node scripts/check-price-leak.mjs` reported **266
  client files scanned, no commercial data found**.

- **All 12 committed 144-DPI renders pass visual inspection** —
  `scripts/pasantias-visual-qa.ts:28,48-55` calls Poppler with `-r 144`; every
  committed PNG is 1191×1684 pixels, the expected A4 raster at that density.
  I inspected brochure pages 1–10 and ficha pages 1–2 individually at original
  resolution. There is no clipped or overlapping text, no overflow, no broken
  glyph, and no hierarchy failure. The dense Objectives and Itinerario pages
  retain visible bottom margins; long expert, payment, legal-identity, and
  two-column lines remain readable. Accents render correctly in representative
  strings including `Pasantías`, `inmersión`, `Cataluña`, `brújulas`, and
  `Vildósola`. Prices are visually confined to brochure page 8.

- **The r2 headline fix is correct** — the brochure cover, brochure `Fechas`
  row, and ficha masthead all consume `COHORT_HEADLINE` and render
  `Octubre, 5 al 16 · 2026`; the retired two-range title is absent. Detailed
  week 1 / long-weekend / week 2 dates remain only in itinerary-detail
  contexts, as Appendix A-1 requires.

- **The brochure `Fechas`-row assumption is accepted** — repeating the exact
  cover headline in the `Fechas` value is mildly redundant beside the preceding
  `Cohorte: Octubre 2026` row, but the rendered page is clear, balanced, and
  unambiguous. It strengthens single-source consistency and does not imply two
  separate pasantías. A `COHORT_DATE_LABEL`-only value would also avoid local
  date composition, so that part of the executor's rationale is overstated;
  this is an aesthetic alternative, not a correctness defect or residue.

- **The current filename constants are RFC 5987-safe** —
  `Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v2.pdf` and
  `Ficha-Pasantias-INSPIRA-Barcelona-octubre-2026-2026-10-v1.pdf` use only
  letters, digits, hyphens, and a period. They are safe as an ASCII quoted
  fallback and as an unencoded RFC 5987 extended value. [S1] concerns the
  exported predicate's wider claimed contract, not these two values.

- **Independent gates are green at `2993731`** — `npm run type-check` passed;
  `npm run lint` passed with zero warnings; `npm test` passed **236/236 files
  and 3531/3531 tests**; `npm run build` compiled and generated **156/156
  static pages**; and the post-build D-01 scanner passed. DB and browser E2E
  suites were not run because A3 adds no migration, policy, page, route, or
  browser interaction. `git diff --check 0022fe9..HEAD` passed and the worktree
  was clean before this requested review artifact was written.

There is no numbered BLOCKING residue for Brent.
