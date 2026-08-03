# Fase A3 — review request

**Branch:** `phase/a3-pdfgen`
**Base:** `origin/main` @ `26ff2f0`
**Commits:** 1 — generators + shared PDF kit + tests + visual-QA evidence + docs
**Executor round:** r1

---

## Objective and scope (copied from PLAN.md v4 §Phase A3 + prompt `a3-1.md`)

> **Scope:** `lib/pasantias/brochure.tsx`, `lib/pasantias/ficha.tsx` (shared
> sections under `lib/pasantias/pdf/` as needed); `lib/pasantias/__tests__/pdf.test.ts`;
> visual QA renders committed to `docs/plan/evidence/a3/`.
> **NOT in scope:** serving endpoints/caching (A4), any page, any endpoint.
>
> **Acceptance criteria:** [A1] `generateBrochure()` → Buffer with the full
> Appendix A content and the amended A-8 investment; [A2] `generateFicha()` →
> 1–2 page Buffer, no monetary tokens; [A3] PDF text-extraction tests (brochure
> has "1.000"/"70"/"120"/"base doble" and no "1.560"/"560"/"Madrid"; ficha has no
> monetary tokens and no "Madrid"; both start `%PDF`; brochure ≥5 pages, ficha
> ≤2); [A4] every page rendered to PNG at 144 DPI under `docs/plan/evidence/a3/`;
> [A5] es-CL filename constants RFC 5987-safe; [A6] gates green + D-01 leak
> script still green.

Untouched, as required: `lib/propuestas/**` (the house kit is imported, never
edited), both cohort modules, `scripts/check-price-leak.mjs`, every page and API
route, `middleware.ts`.

## Design, in one paragraph

Two server-side generators sit on top of the merged A1 cohort modules and the
house React-PDF kit. `brochure.tsx` is the **single production importer** of
`cohort-commercial.ts` (D-01) and lays out ten A4 pages; `ficha.tsx` imports only
`cohort-public.ts`, so its "no monetary token" property is structural rather than
a matter of discipline — there is no price in its import reach to render. Three
small modules under `lib/pasantias/pdf/` hold what both documents share and the
house kit has no equivalent for: `components.tsx` (cover, masthead, the two list
shapes, the label/value row, the controller-identity contact block),
`format.ts` (es-CL weekday/euro formatting, UTC-canonical date parsing),
`contact.ts` (WhatsApp per A-11, the `/pasantias` URL resolved through
`lib/utils/app-url.ts` per D-09) and `filenames.ts` (the ficha's version +
download name, plus the `Content-Disposition` safety predicate A4 consumes).
Every cohort fact is read from a module; nothing is typed twice.

## Files changed, grouped by risk

### Higher risk — the D-01/D-02 boundary

| File | Δ | Note |
|---|---|---|
| `lib/pasantias/brochure.tsx` | +309 | The only production importer of `cohort-commercial.ts`. Renders `€1.000`, the `€70 – €120` band, the verbatim `COHORT_LODGING_NOTE`, payment terms, minimum and validity. Header comment states the server-only constraint. |
| `lib/pasantias/ficha.tsx` | +205 | Imports `cohort-public.ts` only. No `€`, no amount, no commercial copy fragment — asserted, and structurally impossible. |

### Shared PDF surface

| File | Δ | Note |
|---|---|---|
| `lib/pasantias/pdf/components.tsx` | +341 | Cover, masthead, `Numbered`/`Bullets`, `Row`, `ContactBlock`. Holds no cohort facts and no prices — everything arrives as a prop, which is what makes it safe for the ficha to import. |
| `lib/pasantias/pdf/format.ts` | +80 | es-CL weekday/month names and `formatEuro`. Dates parse to UTC midnight and are read with UTC getters, so the weekday does not shift by timezone. `formatEuro` groups by hand rather than through `Intl`, because a runtime without full ICU renders `1,000`. |
| `lib/pasantias/pdf/contact.ts` | +31 | A-11 WhatsApp number, `/pasantias` path, and the D-09 URL resolution (scheme stripped for print). |
| `lib/pasantias/pdf/filenames.ts` | +45 | `FICHA_VERSION`, `FICHA_FILENAME`, `isRfc5987SafeFilename`. Deliberately does **not** re-export `BROCHURE_FILENAME`: that constant is derived from `BROCHURE_VERSION` in the commercial module, and routing it through here would drag the commercial module into the ficha route. |

### Test surface

| File | Δ | Note |
|---|---|---|
| `lib/pasantias/__tests__/pdf.test.ts` | +336 | 26 tests. Both PDFs rendered for real, text read back with `pdf-parse`, page counts with `pdf-lib`. Includes the D-01 importer allowlist (backlog S1). |

### Tooling + evidence

| File | Δ | Note |
|---|---|---|
| `scripts/pasantias-visual-qa.ts` | +97 | Renders both PDFs and rasterises every page at 144 DPI into the evidence directory via poppler's `pdftoppm`. Local tool, not a CI gate. |
| `docs/plan/evidence/a3/*.png` | 12 files | The [A4] artifact: 10 brochure pages + 2 ficha pages. |
| `docs/plan/evidence/a3/README.md` | +45 | Page index, regeneration command, what a reviewer should look at. |

## Test evidence

```
npx vitest run lib/pasantias/__tests__/pdf.test.ts __tests__/lib/pasantias-cohort.test.ts __tests__/scripts/check-price-leak.test.ts
  ✓ __tests__/lib/pasantias-cohort.test.ts        (36 tests)
  ✓ lib/pasantias/__tests__/pdf.test.ts           (26 tests)
  ✓ __tests__/scripts/check-price-leak.test.ts    (16 tests)
  Test Files  3 passed (3) · Tests  78 passed (78)

npm run type-check   → clean
npm run lint         → clean (--max-warnings=0)
npm test             → 236 files, 3526 tests passed
npm run build        → success
node scripts/check-price-leak.mjs
  → OK — scanned 262 file(s) under .next/static, no commercial data found
```

`npm run test:db` and `npm run e2e` were not run: this phase adds no migration,
no policy, no page and no route.

## The five things to scrutinise hardest

1. **`"base doble"` as a literal string.** Criterion [A3] demands the brochure
   text contain `base doble`, but Appendix A-8's approved wording is *"en base a
   habitación doble"* — the bare phrase exists nowhere in the modules. Rather
   than stop on a wording gap or invent a new claim, the investment table renders
   a compressed cell (`€70 – €120 por persona por noche · base doble`) with the
   **verbatim `COHORT_LODGING_NOTE` immediately beneath it**, so the owner's
   precision is never only in the compressed form. The test asserts both. If the
   PM reads [A3] as requiring the module's exact words instead, the table cell is
   the thing to change.

2. **The `560` absence check is a substring test, and substrings are brittle.**
   `expect(text).not.toContain('560')` passes today only because nothing in
   either document happens to contain those three digits in that order — the RUT
   is `65.166.503-5`, the WhatsApp number is `+56 9 4162 3577`. Both are one
   content edit away from a false failure. It is written that way because the
   criterion names the literal token; the whitespace-stripped second pass makes
   it stricter still. Worth a decision on whether a currency-context check (the
   leak script's model) is the better guard here.

3. **Prose I authored rather than transcribed.** Appendix A-7 has no "qué es"
   paragraph, so the overview page assembles one from module data (dates, visit
   count, school count) plus one framing sentence; the same applies to the
   estructura-del-día lead, the ficha's CTA line and the section labels. The
   lodging coordination sentence is Appendix A-8's delegated framing. Nothing
   asserts a fact the modules do not hold, but this is the surface where an
   invented claim would hide, and it is the owner's copy to veto.

4. **Ficha length has no slack.** The ficha renders as exactly 2 pages and the
   test caps it at 2. Page 2 currently ends around two-thirds down, so there is
   room — but any content addition risks a silent third page, which the test will
   catch as a failure rather than a warning. Deliberate: the criterion is a hard
   bound.

5. **The D-01 importer allowlist is new and unasked-for.** Backlog item S1 said
   to pin the importer list "when A3 adds the first production importer", which
   is this round, so the test file now asserts the exact set of files that import
   `cohort-commercial.ts`. It scans seven top-level directories with a regex over
   import/require forms. A legitimate future importer (A4's brochure route) will
   fail this test until it is added to the list — which is the point, but it is a
   maintenance cost the PM did not ask for and may want to reject.

## Known limitations / deferred

- **The printed CTA URL depends on deployment configuration.** It resolves
  through `lib/utils/app-url.ts` (D-09), so a brochure generated in an
  environment without `NEXT_PUBLIC_BASE_URL` (or Vercel's production URL) prints
  the local origin. The committed evidence was rendered with the production
  origin set explicitly; the regeneration command in the evidence README says so.
  A4 owns whether the serving route should pin a canonical origin instead.
- **No page-number footer.** Not required by any criterion; the house
  `PageNumber` component is proposal-specific (`PROGRAMA {year} — …`) and would
  have needed a brochure-local variant.
- **Testimonios section absent**, per A-12 (launch without; the section returns
  when quotes exist).
- **`scripts/pasantias-visual-qa.ts` is not wired into CI** and needs poppler.
  CI has neither and needs neither: the PNGs are committed artifacts.
- **A4 will need `BROCHURE_FILENAME` from the commercial module** (it lives there
  by D-01 necessity) and `FICHA_FILENAME` from `lib/pasantias/pdf/filenames.ts`.
  Both pass `isRfc5987SafeFilename`, which is exported for the header builder.
