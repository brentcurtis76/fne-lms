# Review request — round `a1-repricing` (INSPIRA Comms)

**Branch** `phase/a1-repricing` · **base** `f4fa33a` (origin/main, after PRs #37
and #36 merged) · **3 commits**

| SHA | What |
|---|---|
| `ada5aae` | the previous round's FINDINGS ledger entry, carried forward |
| `41dbf78` | cohort modules + leak guard + their tests |
| `246d36a` | A3 brochure pins + re-rendered evidence |

## Objective and scope

Propagate the owner's 2026-08-02 repricing (Decision Log; Appendix A-7/A-8) into
code: **programa €1.000 → €2.500 por persona**, and the includes/excludes
replaced by the canonical designed brochure's version.

**In scope** (the five items of `docs/plan/prompts/a1-repricing-1.md`):

1. `cohort-commercial.ts` — programme price.
2. `cohort-public.ts` — includes/excludes arrays.
3. `check-price-leak.mjs` — the 2.500 shapes, plus 1.000 kept as retired.
4. Tests — cohort pins, leak-guard regressions, and A3's brochure pins.
5. Re-rendered A3 evidence PNGs, inspected.

**Out of scope**: everything else. The lodging band (70–120), the payment terms,
the minimum, the validity line, the cohort calendar and the headline are all
untouched.

## History this round needs to be read against

The **first attempt at this round returned FINDINGS and wrote no code** — the
prompt's premise "A1 and A3 are already merged" was false for A3 (PR #37 open),
so items 4c and 5 could not be executed from `origin/main`. That entry is
commit `ada5aae` here. The PM fixed the two plan defects it raised (PLAN.md:124
and :140 still pinned €1.000; Appendix A-7 contradicted itself on excludes), and
**PR #37 and #36 merged while this round was in flight** — so the round is
delivered complete rather than partially. The branch was rebased twice as main
moved; the final base is `f4fa33a`.

## Files changed, grouped by risk

### Highest risk — the price itself

- `lib/pasantias/cohort-commercial.ts` (+13/−4). `amount: 1000` → `2500`.
  **`BROCHURE_VERSION` bumped `2026-10-v2` → `2026-10-v3`** — see Deviations.

### High risk — the guard that has to keep working

- `scripts/check-price-leak.mjs` (+22/−8). `PRICE_AMOUNT_PATTERNS` now carries
  the live 2.500 shapes **and keeps 1.000/1e3 as retired amounts**. The rule is
  written into the comment above the list so the next repricing does not have to
  rediscover it.

### Medium risk — public copy the site renders

- `lib/pasantias/cohort-public.ts` (+11/−6). Includes drops the El Puig/Les
  Vinyes transport and the old meals line, gains the week-1 lunches (6 items);
  excludes gains week-2 meals, `Cenas` (no closing-dinner carve-out) and the
  transport (6 items).

### Lower risk — tests and evidence

- `__tests__/lib/pasantias-cohort.test.ts` (+52/−11)
- `__tests__/scripts/check-price-leak.test.ts` (+37/−3)
- `lib/pasantias/__tests__/pdf.test.ts` (+58/−12)
- `lib/pasantias/pdf/format.ts` (+4/−4) — doc-comment example only
- `docs/plan/evidence/a1/leak-guard.md` (+131), `docs/plan/evidence/a3/README.md`
  (+8), `brochure-08/09/10.png` (re-rendered)

## Test evidence

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, 0 warnings |
| `npm test` | **238 files / 3587 tests passed** |
| `npm run build` | succeeded |
| `node scripts/check-price-leak.mjs` | OK — 266 files scanned, exit 0 |

Targeted: `pasantias-cohort` 41 (was 36) · `check-price-leak` 25 (was 16) ·
`pdf.test.ts` 31 (was 30).

Build-level red-then-green proof appended as **§7 of
`docs/plan/evidence/a1/leak-guard.md`**, including §7.4 — the mutation check.

## The five things to scrutinise hardest

1. **`BROCHURE_VERSION` is a deviation from the prompt** (which said "everything
   else unchanged"). I bumped it because the constant's own comment says to bump
   it whenever a value or brochure copy changes, and D-05 keys the `propuestas`
   bucket on it — at v2, A4 would serve a cached €1.000 PDF forever. It is
   visible in `brochure-10.png` as `Versión 2026-10-v3`. If the PM would rather
   the cache key move with A4 instead, this is the line to revert.

2. **The unbounded `2[.,\s]?500` pattern inside a 120-character currency
   window.** Unlike the band figures, the programme amounts are *not* bounded by
   digit lookarounds, so `€12.500` or `€2.5000` in unrelated code would fire a
   false positive. I kept the existing machinery rather than tightening it
   (out of scope, and the pre-existing `1[.,\s]?000` had the same property), and
   measured the result: clean on all 266 client files (§7.1). It is a latent
   risk, not a current one, and the fix is a two-line change if a reviewer wants
   it now.

3. **Whether "must NOT contain 1.000" is asserted at the right strength.**
   `pdf.test.ts` asserts both the bare `not.toContain('1.000')` that PLAN A3
   names *and* currency-context patterns (`€1000`, `1.000 EUR`) in
   `RETIRED_AMOUNT_PATTERNS`. The bare form could in principle go red on an
   innocent `1.000` substring in a future address or figure; I judged the
   duplication worth it because the criterion is written that way. The
   two-directional control test covers both directions.

4. **The includes wording I did NOT change.** Items 1–5 of `COHORT_INCLUDES`
   differ from Appendix A-7 in small ways that predate this amendment (A-7 says
   "bibliografía básica recomendada, una bitácora…"; the module says
   "…recomendada para preparar el viaje, una bitácora…"). The prompt said
   "replace the arrays with A-7's updated lists", which could be read as a
   full re-transcription. I applied only the actual deltas, because those five
   items passed Sol's A1 review as written and re-transcribing them is an
   unreviewed copy change on a public surface. Flagging it because the stricter
   reading is defensible.

5. **`format.ts`'s doc comment.** Not in the prompt's five items. Its es-CL
   grouping example was literally `€1.000`, i.e. the retired price, in a file
   that renders the brochure's money. A comment is not a value, so no test could
   catch it; I repriced the example. Reviewer should confirm this is welcome
   scope rather than drift.

## Known limitations / deferred

- **No e2e run.** No UI surface renders the includes/excludes or the price yet
  (`/pasantias` is A6a, still TODO), so there is nothing for a spec to assert
  beyond what the PDF text tests already cover. `test:db` likewise untouched —
  no schema in this round.
- **The isolated-`2500`-with-no-prose case is proved by unit test, not by a
  build.** Importing one price constant still drags the lodging note into the
  chunk, so the build demo cannot show that shape. Same honest limit §6.1
  recorded for the band; documented in §7.2.
- **`mínimo 5 participantes` remains open** as a PM/owner question — the
  canonical brochure omits it while A-8 still carries it. `COHORT_MIN_PARTICIPANTS
  = 5` is untouched here, and `brochure-08.png` still prints "5 personas".

---

# Round r2 — Sol remediation (B1, B2, S1)

**Branch** `phase/a1-repricing` · **base** `f4fa33a` (origin/main) ·
**10 commits**, of which the last two are this round: `698b5b1` (the fix) and
`205331f` (ledger + this section).

Correcting round r1's own audit (Sol N1): the branch carries ten commits from
`f4fa33a`, not three. The eight before this round are `ba14275` and `ada5aae`
(the previous round's FINDINGS entry, the second being its rebase-preserved
copy), `41dbf78` + `246d36a` (the r1 code and A3 pins), `34f99df` (r1 ledger +
review request), `91e9c93` (tree-neutral pre-rebase reconciliation), `54ffbb6`
(PM verification entry) and `afdc3cf` (PM triage, which is also the commit Sol's
review file arrived on).

## Scope

Closes both BLOCKING findings of `docs/plan/reviews/REVIEW-A1-REPRICING.md` and
takes its SHOULD-FIX in the same pass, per `docs/plan/prompts/a1-repricing-2.md`.
Everything else from r1 stands, including the `BROCHURE_VERSION` v3 bump Sol
accepted. **Nothing outside `cohort-public.ts`, `check-price-leak.mjs` and their
two test files changed** (plus the evidence file and this one).

## Files changed, grouped by risk

### Highest risk — the guard that has to keep working

- `scripts/check-price-leak.mjs` (+60/−20). `1[.,\s]?560` restored to
  `PRICE_AMOUNT_PATTERNS`; a new `retired-short-amount` check carries `560` in
  the band's tight window; all three amount groups now share one
  `wholeAmountPattern()` boundary helper. The retired-amount rule and its
  reasoning are written above the list.

### Medium risk — public copy the site renders

- `lib/pasantias/cohort-public.ts` (+16/−4). Two strings transcribed to match
  Appendix A-7 exactly: the bibliography item loses `para preparar el viaje` and
  regains the comma before `presentado`; the flights exclusion becomes `Pasajes
  aéreos y transporte terrestre de llegada y salida`. Doc comments now state the
  transcription rule (initial capitals only) and name the drift test.

### Lower risk — tests and evidence

- `__tests__/lib/pasantias-cohort.test.ts` (+73/−0) — the A-7 drift pins.
- `__tests__/scripts/check-price-leak.test.ts` (+71/−0) — retired-amount and
  boundary regressions.
- `docs/plan/evidence/a1/leak-guard.md` (+193) — §8, the per-amount proofs.

## Test evidence

| Gate | Result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, 0 warnings |
| `npm test` | **238 files / 3605 tests passed** (was 3587) |
| `npm run build` | succeeded, 156/156 static pages |
| `node scripts/check-price-leak.mjs` | OK — 266 files scanned, exit 0 |

Targeted: `pasantias-cohort` 43 (was 41) · `check-price-leak` 41 (was 25).

Build-level red→mutant-green→restored-red proofs for **each** retired amount are
§8.1 (€1.560), §8.2 (€560) and §8.3 (€1.000) of
`docs/plan/evidence/a1/leak-guard.md`.

## The four things to scrutinise hardest

1. **The drift test reads `docs/plan/PLAN.md` at test time.** That is what makes
   it a drift test rather than a second copy of the copy — but it couples a unit
   test to a document's markdown shape (a bold lead-in, `;` separators, an
   italic trailing note). If the PM reformats A-7, the suite goes red and the
   correct fix will be the parser, not the module. I judged that the right
   trade: the failure is loud and points at the Appendix, which is exactly where
   a copy question belongs. Both parse helpers throw rather than skip when the
   Appendix cannot be found, so it cannot silently pass on a missing section.

2. **Initial capitals are the one edit I kept.** A-7 writes both lists as
   semicolon-separated sentences, so `el pago de las visitas…` is lowercase in
   the Appendix and `El pago de las visitas…` in the array. Sol's own quotations
   in B1 render the module's entries capitalised while flagging only wording and
   punctuation, so I read "verbatim" as covering everything except the sentence
   position each item is lifted out of. The second test asserts the entry with
   its initial lowercased is a literal substring of A-7, which is the strictest
   form that reading allows.

3. **`(?:,\d{2})?` in the shared boundary helper.** The prompt asked for the
   band's boundaries; this adds a two-decimal tail to them. Without it,
   `(?![.,]\d)` would make `€2.500,00` — a genuine rendering of the protected
   figure — stop being a finding, i.e. the SHOULD-FIX would have bought a
   false-negative with a false-positive. It can only widen what matches, never
   narrow it, and the band's own negative controls (`€1.200,70`, `€120.000`) are
   re-asserted green. Flagging it because it is more than was asked for.

4. **`560` gets its own check instead of joining `BAND_AMOUNT_PATTERNS`.** It is
   a retired amount, not a lodging-band figure, and the band check's id and
   description are asserted by name in existing tests. A separate
   `retired-short-amount` check keeps both semantics honest at the cost of a
   third near-identical CHECKS entry. The alternative — widening the band list —
   would have made `priced-band-amount` fire on a non-band amount.

## Known limitations / deferred

- **N1 is answered in prose here, not by editing round r1's section.** That
  section is the record of what was claimed at the time; the corrected history
  is at the top of this one.
- **No e2e / `test:db`.** Unchanged from r1: no UI surface renders these strings
  yet (`/pasantias` is A6a, TODO) and no schema is touched.
- **`mínimo 5 participantes` remains open** for the owner, exactly as r1 left it.
- **`brochure-09.png` re-rendered and inspected**, per B1's closure list — the
  only one of the twelve pages that changed. Both corrected strings render in
  full, six bullets per column, no clipping and no reflow onto a second page.
  The other eleven pages came back byte-identical.
