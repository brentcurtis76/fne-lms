# A1 evidence — D-01 leak guard (`scripts/check-price-leak.mjs`)

A guard that has only ever printed OK is not evidence of anything. This records
the demonstration that it fails when it should, and what the minifier taught us
in the process.

## 1. Clean build — guard green

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

## 2. Deliberate leak — guard red

Scratch change (reverted immediately afterwards; not committed): import
`COHORT_COMMERCIAL` into `pages/index.tsx` and render its total, sentinel and
Madrid label inside the homepage cohort card.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (5 match(es)).

  [sentinel] .next/static/chunks/pages/index-c30db2338eb7c7e5.js @ 19639
      COMMERCIAL_SENTINEL from cohort-commercial.ts
      …cohort-headline",children:[v," ",y," ","__INSPIRA_COMMERCIAL__"," ",N]})]})]}),(0,a.jsxs)("div",{class…

  [commercial-copy] .next/static/chunks/pages/index-c30db2338eb7c7e5.js @ 8921
      a string that only exists in cohort-commercial.ts
      …a",amount:1e3},{id:"alojamiento",label:"Alojamiento (habitación doble)",amount:560}].reduce((e,t)=>e+t.amount,…

  [commercial-copy] .next/static/chunks/pages/index-c30db2338eb7c7e5.js @ 9013
      a string that only exists in cohort-commercial.ts
      …(e,t)=>e+t.amount,0),N=("".concat(50,"% al momento del acuerdo y el saldo ").concat(30," días antes de…

  [commercial-copy] .next/static/chunks/pages/index-c30db2338eb7c7e5.js @ 9088
      a string that only exists in cohort-commercial.ts
      …).concat(30," días antes del inicio."),"Pasantias-INSPIRA-Barcelona-".concat("octubre-2026","-").concat("20…

  [commercial-copy] .next/static/chunks/pages/index-c30db2338eb7c7e5.js @ 9174
      a string that only exists in cohort-commercial.ts
      …2026","-").concat("2026-10-v1",".pdf"),"Extensión opcional a Madrid"),w=x()(()=>s.e(1053).then(s.bind(s,310…

EXIT=1
```

## 3. What the demo changed about the guard

The first version of the script passed the clean build and caught the leak with
the sentinel alone. Reading the actual bundle showed three assumptions were
wrong, and the script was rewritten before this evidence was recorded:

| Assumption | Reality in the built chunk |
|---|---|
| Spanish strings are searchable as written | emitted escaped: `Extensi\xf3n opcional a Madrid` — every file is now unescaped before scanning |
| `1000` appears as `1000` | emitted as `1e3` — matched in that form too |
| object keys survive minification | they do not; `madridExtension` is absent while the label string it pointed at is present, so the copy strings are the signal, not the keys |

Two further notes, both deliberate:

- `COHORT_PRICE_TOTAL` is a runtime `reduce`, so the literal `1560` never
  reaches a bundle at all. The guard looks for the parts (`1e3`, `560`), not the
  total.
- `COMMERCIAL_SENTINEL` can be tree-shaken away by a leak that imports a single
  price constant rather than the `COHORT_COMMERCIAL` object. That is exactly why
  the copy and amount checks exist alongside it; the sentinel is the cheap case,
  not the only one.

The `priced-amount` check did **not** fire in this demo: the scratch leak never
read `COHORT_COMMERCIAL.currency`, so no `€`/`EUR` marker survived near the
amounts. It covers the case that matters most in practice — a rendered price in
user-facing copy, which always carries its currency — and the currency window
was widened to 120 characters (measured against the real chunk layout) and
re-verified not to fire on the clean build, which does ship unrelated
euro-denominated code (consultant rates, expense reports).

## 4. CI wiring

`.github/workflows/ci.yml`, gate 4, immediately after `npm run build`:

```yaml
      - name: Guard — no commercial cohort data in the client bundle
        run: node scripts/check-price-leak.mjs
```

## 5. Round r3 — re-verified after the A-8 lodging amendment

The amendment retired the €560 lodging package and the €1.560 total and replaced
them with a €70–120 per-person-per-night band, so `PRICE_AMOUNT_PATTERNS` lost
`560` and `1[.,\s]?560`. The band's own numbers were **deliberately not added**:
two- and three-digit figures sit near a euro sign all over unrelated minified
code, so listing them would buy noise rather than coverage. Coverage for the band
moved to the `commercial-copy` check, where the retired
`Alojamiento \(habitación doble\)` alternative was replaced by
`por persona por noche`.

That is a claim about a guard, so it was demonstrated rather than asserted.
Scratch change (reverted; not committed): import **only**
`COHORT_LODGING_NOTE` into `pages/index.tsx` and assign it to `window` so it
cannot be tree-shaken.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (3 match(es)).

  [commercial-copy] .next/static/chunks/pages/index-bab84200ef9e9998.js @ 8830
      a string that only exists in cohort-commercial.ts
      …entre €".concat(70," y €").concat(120," por persona por noche, según el tipo de alojamiento.");"".con…

  [commercial-copy] .next/static/chunks/pages/index-bab84200ef9e9998.js @ 8901
      a string that only exists in cohort-commercial.ts
      … tipo de alojamiento.");"".concat(50,"% al momento del acuerdo y el saldo ").concat(30," días antes de…

  [commercial-copy] .next/static/chunks/pages/index-bab84200ef9e9998.js @ 8976
      a string that only exists in cohort-commercial.ts
      …).concat(30," días antes del inicio."),"Pasantias-INSPIRA-Barcelona-".concat("octubre-2026","-").concat("20…

EXIT=1
```

Two things this demo settles:

- **The sentinel did not fire.** Importing one constant tree-shook
  `COMMERCIAL_SENTINEL` away entirely — the §3 caveat, now observed rather than
  predicted. The copy check is what caught this leak, which is the reason the
  band's coverage was put there.
- **The band survives minification split across `.concat()` calls** —
  `"entre €".concat(70," y €").concat(120," por persona por noche…`. The prose is
  contiguous and searchable; the digits are not attached to their currency marker
  in the way a naive numeric rule would assume. Another argument against listing
  `70`/`120` as amount patterns.

Clean build after reverting the scratch change:

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

## 6. Round r4 — the band's own figures, after Codex B1

Codex's round-1 review rejected §5's reasoning: the band moved to `commercial-copy`
because `70`/`120` looked too noisy to match, but that left `€70` and `€120`
undetectable on their own — Codex ran the committed regexes and got no finding
for either, while `€1.000` was caught. Coverage that depends on the prose is not
coverage of the numbers.

The band now has its own check, `priced-band-amount`, separate from
`priced-amount` because the noise argument was right about the window, not about
the numbers: `PRICE_AMOUNT_PATTERNS` allows 120 characters between an amount and
its currency marker, which is far too generous for a two-digit figure.
`priced-band-amount` allows **12**, sized against the widest real shape measured
in §5 (`"entre €".concat(70,` — nine characters), and the figures are bounded so
they cannot match inside a longer number (`€1.200,70`, `€120.000`).

### 6.1 Leak — one price constant, rendered

Scratch change (reverted; not committed): import **only**
`COHORT_LODGING_PER_NIGHT_EUR` into `pages/index.tsx` and render `.min` and
`.max` beside a euro sign — the exact consumer Codex described.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (9 match(es)).

  [priced-band-amount] .next/static/chunks/pages/index-c456d94644578977.js @ 19603
      an Appendix A-8 lodging-band amount beside a currency marker
      …children:[v,(0,a.jsx)("span",{children:"€".concat(70)}),(0,a.jsx)("span",{children:"€".conca…

  [priced-band-amount] .next/static/chunks/pages/index-c456d94644578977.js @ 19647
      an Appendix A-8 lodging-band amount beside a currency marker
      …oncat(70)}),(0,a.jsx)("span",{children:"€".concat(120)})]})]})]}),(0,a.jsxs)("div",{className…

  [priced-band-amount] …@ 8882 / @ 8899   (the band inside the note, see 6.2)
  [commercial-copy]    …@ 8850 / @ 8916 / @ 8939 / @ 8987 / @ 9062
EXIT=1
```

The two matches at 19603 and 19647 are the rendered figures themselves: no
sentinel, no prose, nothing but `"€".concat(70)`. That is the case that returned
no finding before this round.

**Honest limit of this build demo.** The tree was *not* fully shaken: importing
one constant still dragged `COHORT_LODGING_NOTE` and the payment-terms string
into the chunk (they are module-scope template literals derived from the same
values), so `commercial-copy` fired as well. A bundle in which the figures appear
with the prose genuinely absent is therefore not reachable from this module
today, and asserting it here would be asserting something the build cannot show.
It is asserted where it can be: `__tests__/scripts/check-price-leak.test.ts`
feeds isolated shapes (`window.price="€70"`, `["€",70]`, `"€".concat(120)`,
`currency:"EUR",amount:120`, and the `€`-escaped form) through the script's
own exported `scanText`, and asserts that `priced-band-amount` is the **only**
check that fires on each. Same regexes the build runs — the script now guards its
`main()` behind an entry-point check so it can be imported without scanning.

### 6.2 Leak — the note string only (§5's demo, re-run)

Scratch change (reverted; not committed): import only `COHORT_LODGING_NOTE`.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (7 match(es)).

  [priced-band-amount] .next/static/chunks/pages/index-27c7b36ec10823b3.js @ 8884
      …t(j),y="Alojamiento en Barcelona: entre €".concat(70," y €").concat(120," por persona por no…

  [priced-band-amount] .next/static/chunks/pages/index-27c7b36ec10823b3.js @ 8901
      …to en Barcelona: entre €".concat(70," y €").concat(120," por persona por noche, según el tipo …

  [commercial-copy] … @ 8852 / @ 8918 / @ 8941 / @ 9013 / @ 9088
EXIT=1
```

§5 caught this leak on 3 `commercial-copy` matches alone. It is now caught by two
independent checks, and `commercial-copy` gained two more fragments of the same
sentence (`Alojamiento en Barcelona: entre`, `según el tipo de alojamiento`) so
that reworded copy has to lose all three to go unnoticed.

### 6.3 No false positives on the real tree

The r3 objection to listing `70`/`120` was that they would fire all over
unrelated minified code. Measured rather than assumed, before and after the
scratch leaks:

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

266 client files, including this repo's unrelated euro-denominated code, and
`priced-band-amount` finds nothing. The negative controls in
`__tests__/scripts/check-price-leak.test.ts` pin why: `€1.200,70`, `€120.000`,
`€1970`, a bare `70`/`120` with no currency, a chunk hash containing `a70f9c120b`,
and a euro sign 40 characters away all stay silent.

## 7. Round a1-repricing — the €2.500 repricing and the retired €1.000

The owner repriced the programme on 2026-08-02 (Decision Log; Appendix A-8):
**€1.000 → €2.500 por persona**. The instruction for the guard was to swap the
`1[.,\s]?000` patterns for the 2.500 shapes **and keep 1.000 as a retired
amount** — the two halves matter for different reasons, so both are demonstrated
separately below.

`PRICE_AMOUNT_PATTERNS` now reads:

```js
const PRICE_AMOUNT_PATTERNS = [
  '2[.,\\s]?500', //  2500, 2.500, 2,500, 2 500 — the live programme fee
  '2\\.5e3', //       the exponential spelling of 2500
  '1[.,\\s]?000', //  RETIRED 2026-08-02: 1000, 1.000, 1,000, 1 000
  '1e3', //           RETIRED 2026-08-02: how the minifier writes 1000
];
```

### 7.1 Clean build — guard green, no new false positives

The new `2[.,\s]?500` pattern sits in the same wide (120-character) currency
window as the amount it replaced, so the question that had to be answered by
measurement rather than assumption is whether `2500`/`2.500` collides with this
repo's unrelated euro-denominated code (consultant rates, expense reports).

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

Same 266 client files as §6.3, still silent.

### 7.2 Leak — the live €2.500, imported and rendered

Scratch change (reverted; not committed): import `COHORT_PRICE_ITEMS` into
`pages/index.tsx` and render `` `Programa: €${COHORT_PRICE_ITEMS[0].amount}` ``.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (9 match(es)).

  [priced-amount] .next/static/chunks/pages/index-3722a4b942e55224.js @ 8934
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …[{id:"programa",label:"Programa",amount:2500}];"Alojamiento en Barcelona: entre €".concat(70," y €").concat(120," por per…

  [priced-band-amount] … @ 8974 / @ 8991
  [commercial-copy]    … @ 8942 / @ 9008 / @ 9031 / @ 9105
EXIT=1
```

Note the minified shape: the bundler kept `2500` as a bare integer rather than
an exponential (`2.5e3` is one character longer than `2500`, so it does not pay
the way `1e3` did for 1000). The `2\.5e3` pattern is therefore belt-and-braces
for a different minifier setting, not the form observed here.

**Honest limit, same as §6.1.** The `€` that satisfied the currency window came
from the adjacent lodging note, which the same import dragged into the chunk —
this demo does not show an isolated `2500` with no prose nearby. That case is
asserted where a build cannot reach it: `__tests__/scripts/check-price-leak.test.ts`
feeds six isolated shapes (`"€2.500"`, `"€2,500"`, `currency:"EUR",amount:2500`,
`["€",2.5e3]`, `"Programa: €".concat(2500)`, and the `€`-escaped form)
through the script's own exported `scanText`.

### 7.3 Leak — the retired €1.000, as stale copy on a public page

The module no longer holds 1000, so the realistic way the retired price reaches
a browser is hardcoded copy someone forgot to update. Scratch change (reverted;
not committed): a literal `<p>Programa: €1.000 por persona</p>` in
`pages/index.tsx`.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/index-3c3d020e4379c6dd.js @ 19351
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …:y}),(0,a.jsx)("p",{children:"Programa: €1.000 por persona"})]})]}),(0,a.jsxs)("div",{…
EXIT=1
```

One match, and a clean one: no sentinel, no commercial prose, nothing but the
retired figure beside a euro sign.

### 7.4 Why 7.3 is not a tautology — the mutant that a naive swap would ship

§7.3 on its own proves little: `1[.,\s]?000` was already on the list before this
round, so that leak was already caught. What this round had to prove is that it
is **still** caught — i.e. that the "swap 1.000 out for 2.500" reading of the
instruction would have been a silent regression. Measured by deleting the two
retired patterns and re-scanning the §7.3 build output (no rebuild — same
`.next`, same leak on disk):

```js
const PRICE_AMOUNT_PATTERNS = [
  '2[.,\\s]?500',
  '2\\.5e3',
];
```

```
$ node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

**The guard reports a clean bundle on a build that is publishing €1.000.** That
is the regression the retired-amount rule exists to prevent, and it is why the
rule is now written into the comment above `PRICE_AMOUNT_PATTERNS` rather than
left as this round's tribal knowledge. Patterns restored immediately after;
§7.1's green re-run above is the post-restore state.

### 7.5 Unit-level coverage added with this round

`__tests__/scripts/check-price-leak.test.ts` went from 16 to 25 tests:

- `leak guard — the live programme fee, in every shape a bundler emits` (6): the
  shapes listed in §7.2, each asserted to fire `priced-amount`.
- `leak guard — retired amounts stay guarded (2026-08-02 repricing)` (3): the
  grouped literal, the bare integer and the `1e3` exponential.
- the existing `still fails on … the programme fee` case was repriced from
  `x="€1.000"` to `x="€2.500"`, keeping its strict `toEqual(['priced-amount'])`
  form so a change that made the live fee also trip `commercial-copy` would show.

Module-side, `__tests__/lib/pasantias-cohort.test.ts` adds `2500`/`2.500` to
`PROTECTED_AMOUNTS` (which already carried `1000`/`1.000`, so the retired price
is barred from the public module by the same list) and pins that the commercial
module holds no `1000` anywhere — the repricing is only done when the old number
is gone, not merely outvoted by a new one sitting beside it.

## 8. Round a1-repricing r2 — every retired amount, proved one at a time (Sol B2)

§7 proved the €1.000 half of the retired-amount rule and stopped there. Sol's
round-1 review found the other half missing: `PRICE_AMOUNT_PATTERNS` carried no
€1.560 and no €560, both retired by the 2026-07-31 lodging amendment and both
removed from this list at the time — before the retired-amount concept existed.
Sol reproduced a build publishing `€1.560` that the guard passed.

The patterns are restored, and the rule now has its reasoning written above the
list rather than in a round's evidence file: a **retired** amount cannot reach a
bundle through the commercial module (the module no longer holds it), so the only
route left is hand-written copy someone forgot to update — which is exactly the
leak worth catching.

```js
const PRICE_AMOUNT_PATTERNS = [
  '2[.,\\s]?500', //  2500, 2.500, 2,500, 2 500 — the live programme fee
  '2\\.5e3', //       the exponential spelling of 2500
  '1[.,\\s]?000', //  RETIRED 2026-08-02: 1000, 1.000, 1,000, 1 000
  '1e3', //           RETIRED 2026-08-02: how the minifier writes 1000
  '1[.,\\s]?560', //  RETIRED 2026-07-31: the lodging-inclusive total
];

const RETIRED_SHORT_AMOUNT_PATTERNS = ['560']; // RETIRED 2026-07-31
```

**Why €560 is a separate check.** Three digits are far too common to hunt for
inside the 120-character window the four-digit amounts use — that window exists
so a `2500` can be tied to a `€` sitting on the far side of a minified object.
`560` gets the same treatment `70` and `120` have had since §6: whole-amount
boundaries and a 12-character currency window. Its check id is
`retired-short-amount`.

Below, each retired amount is proved individually: build a bundle publishing only
that amount → guard fails; delete that amount's pattern and rescan **the same
build** (no rebuild — same `.next`, same leak on disk) → guard passes; restore →
guard fails again. The middle step is the one that matters: it is what "the
pattern is load-bearing" means, and it is the exact regression Sol found.

### 8.1 €1.560 — the amount Sol proved was unguarded

Scratch change (reverted; not committed): `<p>Total retirado: €1.560 por
persona</p>` in `pages/index.tsx`.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/index-7ce69996b23ec759.js @ 19357
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …0,a.jsx)("p",{children:"Total retirado: €1.560 por persona"})]})]}),(0,a.jsxs)("div",{…
EXIT=1
```

Mutant — `'1[.,\\s]?560'` deleted, no rebuild:

```
$ node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

That `OK` is Sol's finding reproduced on this branch: **a build publishing
€1.560, reported clean.** Pattern restored, same `.next` rescanned:

```
$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — … [priced-amount] … index-7ce69996b23ec759.js @ 19357
EXIT=1
```

### 8.2 €560 — the retired lodging package

Scratch change (reverted; not committed): `<p>Alojamiento retirado: €560 por
persona</p>` in `pages/index.tsx`.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [retired-short-amount] .next/static/chunks/pages/index-8add7568147f28ba.js @ 19363
      the retired Appendix A-8 lodging package (€560) beside a currency marker
      …x)("p",{children:"Alojamiento retirado: €560 por persona"})]})]}),(0,a.jsxs)("div",{…
EXIT=1
```

Mutant — the whole `retired-short-amount` check removed, no rebuild:

```
$ node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

Check restored, same `.next` rescanned:

```
$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — … [retired-short-amount] … index-8add7568147f28ba.js @ 19363
EXIT=1
```

### 8.3 €1.000 — re-proved under the new bounded patterns

§7.3/§7.4 proved this amount against the *unbounded* expression. This round added
whole-amount boundaries (§8.4), so the proof had to be re-run rather than cited:
a boundary that was slightly too strict would silently un-guard the amount §7
was written about. Scratch change (reverted; not committed): `<p>Programa:
€1.000 por persona</p>` in `pages/index.tsx`.

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/index-3c3d020e4379c6dd.js @ 19351
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …:y}),(0,a.jsx)("p",{children:"Programa: €1.000 por persona"})]})]}),(0,a.jsxs)("div",{…
EXIT=1
```

Mutant — `'1[.,\\s]?000'` and `'1e3'` deleted, no rebuild:

```
$ node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

Patterns restored, same `.next` rescanned:

```
$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — … [priced-amount] … index-3c3d020e4379c6dd.js @ 19351
EXIT=1
```

The chunk hash is byte-identical to §7.3's (`index-3c3d020e4379c6dd.js`), which
is the cleanest possible statement that nothing about *this* leak changed — only
the guard around it did.

### 8.4 Whole-amount boundaries (Sol S1)

Sol measured that the unbounded `2[.,\s]?500` fires on `€12.500` and `€2.5000`.
Nothing in the current tree collides, so this was a SHOULD-FIX, but it is taken
now because B2 required editing the same expression. The band's figures have been
bounded since §6; the same boundary is now shared by all three amount groups:

```js
function wholeAmountPattern(patterns) {
  return `(?<!\\d)(?<![\\d][.,])(?:${patterns.join('|')})(?:,\\d{2})?(?!\\d)(?![.,]\\d)`;
}
```

The `(?:,\d{2})?` tail is the one addition to the band's existing shape: a
two-decimal ending belongs to the amount rather than being a boundary violation,
so `€2.500,00` stays a finding while `€2.5000` stops being one. It can only make
the guard fire on *more* strings than the bare boundary would, never fewer — the
band's own controls (`€1.200,70`, `€120.000`) are unaffected and still silent
(§8.5).

Asserted in `__tests__/scripts/check-price-leak.test.ts` rather than through a
build, because these are single-string questions a build cannot ask precisely:
negative controls `€12.500`, `€2.5000`, `€22.500`, `€12.500,00`, `€21.000`;
positive controls `€2.500`, `€2.500,00`, `€1.000,00`.

### 8.5 Clean build — guard green, no new false positives

The final state of the branch, with the page reverted and all patterns restored:

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```

Same 266 client files as §7.1. The three added expressions (`1[.,\s]?560`, the
`560` check, the shared boundary) introduce no finding on the real tree.

### 8.6 Unit-level coverage added with this round

`__tests__/scripts/check-price-leak.test.ts` went from 25 to 41 tests:

- `the 2026-07-31 retired amounts (Sol r1 B2)` (8): four €1.560 shapes asserted
  to fire `priced-amount` exactly, three €560 shapes asserted to fire
  `retired-short-amount` exactly, and one case pinning that `€1.560` reports
  **once** — the bounded `560` must not count the `560` inside `1.560` as a
  second finding, or every real leak of that amount would report twice.
- `programme amounts match as whole amounts only (Sol r1 S1)` (8): the five
  negative and three positive controls listed in §8.4.

Module-side, `__tests__/lib/pasantias-cohort.test.ts` went from 41 to 43 tests
with the Appendix A-7 drift pins described in the round's review request.
