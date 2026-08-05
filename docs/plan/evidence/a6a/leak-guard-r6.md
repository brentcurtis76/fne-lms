# A6a r6 — the segmentation fix, proved by a generated differential

Evidence for `scripts/check-price-leak.mjs` at `phase/a6a-page`, base `2158c44`.

Sol's round 4 found that r5 lost four shapes while reporting zero coverage lost.
This file records the cause, the fix, and — this time — a differential that was
**generated** rather than written down, run against `ca8e024`'s scanner in both
directions.

Companions: `leak-guard-r4.md`, `leak-guard-r5.md` (the rounds this one repairs).

---

## 1. The defect

`whitespaceRuns` was all-or-nothing. For `€2 500\n7` the scanner tokenised
maximally to `2 500\n7`, found the fused reading (25007) harmless, then split on
*every* whitespace run into `2`, `500`, `7` — and never considered `2 500`, the
grouped reading a reader actually sees. A protected amount sitting in a
whitespace-grouped **subsequence** was invisible unless it happened to be the
whole token or a whole piece.

## 2. The fix

`candidateReadings` replaces `whitespaceRuns`. Every contiguous run of
whitespace-separated pieces is a candidate reading, sliced out of the original
text so the separators it carries are the ones that were written. Only **maximal**
protected readings are kept — a protected reading contained in a longer protected
reading is dropped, which is r5's "the fused reading *is* the finding" rule
generalised, and is what keeps `€1 560` at one finding instead of two.

Dropping the inner reading can never lose a finding: a contained reading is never
closer to a currency marker than its container, and never carries a wider window,
so whenever the inner one would fire the outer one already has.

Readings are capped at four pieces (`MAX_GROUPED_PIECES`). Every protected figure
is at most four digits, so its whitespace-grouped spelling is at most two pieces;
a reading spanning more than four pieces denotes at least five digits and can
neither be a finding nor suppress one. The cap is what keeps the scan linear in
bundle size rather than quadratic. Measured on the clean build below: **0.07 s**
for HEAD against **0.14 s** for `2158c44`, over the same 267 files.

Second change (Sol round 4, S1): `shiftDecimalPoint` now strips leading zeroes
from the shifted integer. `€0.25e4` is 2500 written with a mantissa below one; it
shifted to `02500` and failed to match, contradicting `canonicalAmounts`'
documented contract. Stripping happens only in the exponent path, so a bare
`€070` / `€02500` stays silent exactly as before.

## 3. The differential — generated, not listed

`__tests__/scripts/price-leak-corpus.mjs` crosses

```
AMOUNT (6)  x  SPELLING (7-31, by digit count)  x  CONTEXT (8)
```

→ **928 generated cases**, plus 7 pinned limits, 22 silent controls and the 7
named Sol-round-4 rows = **964 cases**. Each case's expected verdict is derived
from the amount that was *planted*, not from what any scanner returns.

Spellings cross the protected values with every grouping style (plain, dot,
comma, and each of the eighteen characters JavaScript's `\s` matches, including
NBSP / narrow NBSP / thin space), both decimal tails, both grouped-plus-tail
combinations, and every exponential shift `e1…e<len>` plus the `e+1` and `E1`
forms. Contexts cross those with: nothing following, the ISO code after, the word
after, a stray digit after one space, a stray digit after a newline, the same
inside JSX copy, a second amount with its own marker, and a second amount sharing
one marker.

All 964 run through the exported `scanText`, so what is compared is what
`npm run build && node scripts/check-price-leak.mjs` executes.

### 3.1 HEAD vs `ca8e024`, both directions

| | count |
|---|---|
| **losses** (`ca8e024` fired, HEAD silent) | **0** |
| **gains** (`ca8e024` silent, HEAD fires) | 234 |
| same verdict, different check id | 182 |
| HEAD disagrees with the generated expectation | **0** |

**Zero losses.** Every one of the 234 gains and 182 id changes falls into one of
five named classes, below.

### 3.2 The 234 gains, all deliberate

**198 were already r5's gains** — `ca8e024` matched literal digit spellings, and
r4/r5's normalisation reads the value instead:

| spelling | count | example |
|---|---|---|
| a decimal-dot tail | 36 | `2500.00 EUR` (Sol r2 B1 residue: `ca8e024` admitted a comma tail only) |
| grouped with a dot tail | 18 | `2,500.00 EUR` |
| exponential `e1` | 36 | `250e1 EUR` |
| exponential `e2` | 30 | `25e2 EUR` |
| exponential `e3` | 6 | `1.56e3 EUR` |
| an explicit positive exponent | 36 | `250e+1 EUR` |
| an uppercase exponent | 36 | `250E1 EUR` |

**36 are new in r6**, and they are exactly the S1 leading-zero fix — every
exponential whose mantissa is below one, which was silent at `ca8e024` **and** at
`2158c44`: `€0.7e2` (e2, 6 cases), `€0.12e3` / `€0.56e3` (e3, 12 cases),
`€0.25e4` / `€0.1e4` / `€0.156e4` (e4, 18 cases).

### 3.3 The 182 id changes, all deliberate

| class | count | example | `ca8e024` → HEAD |
|---|---|---|---|
| the nested `560` is no longer a second finding | 109 | `€1 560` | `priced-amount+retired-short-amount` → `priced-amount` |
| the same, with a band figure also present | 18 | `€1 560 €70` | drops the nested `560` only |
| HEAD additionally finds an amount `ca8e024` missed | 46 | `€2500.00 €70` | adds `priced-amount` |
| HEAD reads `7e1`/`12e1` as the band figure rather than misreading `1 560` | 6 | `€7e1 560` | `priced-amount+retired-short-amount` → `priced-band-amount+retired-short-amount` |
| the same for `56e1` | 3 | `€56e1 560` | `priced-amount+retired-short-amount` → `retired-short-amount` |

Counted mechanically rather than by eye: HEAD **adds** an id in 46 rows, **drops**
one in 130, and does both in 6 — 182 in total.

The first two classes are the acceptance criterion "`€1 560` still yields exactly
one finding". The last two remove a `ca8e024` **misattribution**: its regex saw
the literal `1 560` inside `7e1 560` and reported the retired total. Both planted
amounts still fire in every one of those rows — no case anywhere in the corpus
went from firing to silent.

### 3.4 What `2158c44` actually lost

Measured on the same corpus, `2158c44` (the revision under review) is silent on
**112** cases where `ca8e024` fires. All 112 are one shape — a whitespace-grouped
amount followed by a stray digit:

- **108** = 2 amounts (`2500`, `1000`) × 18 separators × 3 trailing-digit contexts
  (a digit after one space, a digit after a newline, the same inside JSX copy);
- **4** = the named Sol-round-4 rows, which restate four of those.

`1560` is absent from the losses for a reason worth naming: on `€1 560 7`,
`2158c44` still fired — on the nested `560`, not on the fee. The finding survived
by accident, on the wrong figure.

The r5 corpus tested whitespace grouping *alone* and a trailing digit *alone*,
never the composition, which is why it reported zero.

### 3.5 Sol's seven rows, verbatim

| shape | `ca8e024` | `2158c44` | HEAD |
|---|---|---|---|
| `€2 500\n7` | FIRES | miss | **FIRES** |
| `€2 500 7` | FIRES | miss | **FIRES** |
| `€1 000\n45` | FIRES | miss | **FIRES** |
| `€2 500 7` (narrow NBSP) | FIRES | miss | **FIRES** |
| `€1 560 45` | FIRES | FIRES | FIRES |
| `€2 500` | FIRES | FIRES | FIRES |
| `€2500\n7` | FIRES | FIRES | FIRES |

`€1 560 45` changes check id — `2158c44` reported the nested `retired-short-amount`
because it had lost the `1 560` reading; HEAD reports `priced-amount`, the maximal
reading. It fires in all three revisions.

## 4. Production-build proof

The mutant is the shape r5 lost. Injected verbatim into `pages/pasantias.tsx`:

```
Programa: €2 500 7 cupos.
```

`npm run build`, then all three revisions of the scanner run against the **same**
`.next/static`:

```
=== HEAD ===
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/pasantias-21b08ba68c992c9d.js @ 20779
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …a antes de la segunda semana. Programa: €2 500 7 cupos."}),(0,n.jsx)("ul",{className:"…
exit: 1

=== 2158c44 (the revision under review) ===
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
exit: 0

=== ca8e024 (pre-r4 baseline) ===
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).
  [priced-amount] .next/static/chunks/pages/pasantias-21b08ba68c992c9d.js @ 20779
exit: 1
```

The regression is real at build level, not only in a unit test: the same bundle
that `ca8e024` rejected shipped past `2158c44`.

The mutant was then reverted (`git checkout -- pages/pasantias.tsx`;
`git diff ca8e024 -- pages/pasantias.tsx lib/pasantias/cohort-public.ts` is empty)
and the tree rebuilt clean:

```
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
CLEAN SCANNER EXIT: 0
```

## 5. Gates

| gate | result |
|---|---|
| `npm run type-check` | clean |
| `npm run lint` | clean, `--max-warnings=0` |
| `npm test` | 257 files, **5225 passed** (1045 of them in `check-price-leak.test.ts`) |
| `npm run build` | exit 0 |
| `node scripts/check-price-leak.mjs` | OK, 267 files |
| `CI=1 npx playwright test tests/e2e/pasantias-page.spec.ts tests/e2e/footer-heading-order.spec.ts tests/e2e/smoke.spec.ts` | 14 passed |

## 6. Out of scope, unchanged

`pages/pasantias.tsx` and `lib/pasantias/cohort-public.ts` are byte-identical to
`ca8e024`. The accepted limits are unchanged and stay pinned in
`PINNED_LIMITS`: fullwidth and other-script digits, doubled space, `€25000e-1`,
the two conservative over-firings (`€2500e-1`, `€2.500e0`), and bare leading
zeroes with no exponent. Heading debt on `/nosotros`, `/programas`,
`/brand-preview` and `ci-fixture.spec.ts` was not touched.
