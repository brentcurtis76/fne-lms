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
