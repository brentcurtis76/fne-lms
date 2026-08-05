# A6a r4 evidence — the leak guard's decimal-separator hole (Sol r2 B1 residue)

What Sol proved: `scripts/check-price-leak.mjs` matched a two-digit tail only
after a **comma**, so an amount written with a decimal dot walked past it.
`Programa: 2500.00 euros por persona` reached
`.next/static/chunks/pages/pasantias-*.js` on a real production build while the
script exited 0.

Everything below was run, in this order, in `/Users/brentcurtis/Documents/wt-a6ar4`
on `phase/a6a-page`, Node v22.22.0, `npm ci` clean. Each mutant is scanned twice:
once with the **r3** scanner (`git show ca8e024:scripts/check-price-leak.mjs`,
copied out of the tree so it scans the same `.next/static`) and once with the
**r4** scanner in the working tree. Same build, same bytes, two scanners.

---

## 1. What changed, and why it is not a fourth alternation

The guard had been wrong three times in three ways — unbounded amounts (Sol r1
S1), missing currency word forms (Sol r2 B1), decimal separators (this round) —
and each fix had been one more alternation in `PRICE_AMOUNT_PATTERNS`. This
round replaced the matching strategy instead.

A digit run near a currency marker is now tokenised **maximally** and normalised
to a canonical integer, and the amount lists hold **values** rather than
spellings:

| written | token | canonical | verdict |
|---|---|---|---|
| `2500` | `2500` | `2500` | protected |
| `2.500` | `2.500` | `2500` | protected |
| `2,500` | `2,500` | `2500` | protected |
| `2 500` | `2 500` | `2500` | protected |
| `2500,00` | `2500,00` | `2500` | protected |
| `2500.00` | `2500.00` | `2500` | protected |
| `2,500.00` | `2,500.00` | `2500` | protected |
| `2.500,00` | `2.500,00` | `2500` | protected |
| `2.5e3` | `2.5e3` | `2500` | protected |
| `12.500` | `12.500` | `12500` | silent |
| `2.5000` | `2.5000` | *not a well-formed amount* | silent |
| `120.000` | `120.000` | `120000` | silent |
| `1.200,70` | `1.200,70` | `1200` | silent |

The four lookarounds the old `wholeAmountPattern` carried
(`(?<!\d)(?<![\d][.,])…(?!\d)(?![.,]\d)`) are gone, and nothing was loosened to
make room: **maximal tokenisation is now the false-positive control.** `€12.500`
tokenises as the single number `12.500`, so there is no `500` left over to
compare; `€1.200,70` yields `1.200,70`, so there is no `70`. `2.5000` is
rejected because it is neither a grouping (four digits after the dot) nor a
decimal (more than two) — the same case the old `(?![.,]\d)` clause existed to
kill, now falling out of the grammar instead of being fenced off by hand.

---

## 2. Baseline — clean tree, clean build, guard green

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
EXIT=0
```

## 3. Mutant 1 — Sol's exact shape: `2500.00 euros`

Injected as visible page copy in `pages/pasantias.tsx`, immediately after the
hero chips:

```diff
               </div>
 
+              <p>Programa: 2500.00 euros por persona</p>
+
               <p className="mt-7 max-w-[520px] text-[17px] leading-[1.6] text-white/[0.72]">
```

### 3.1 r3 scanner — the hole, reproduced

```
$ npm run build && node /private/tmp/check-price-leak-r3.mjs
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
EXIT=0
```

### 3.2 r4 scanner — same build, same bytes, now red

```
$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/pasantias-7635c373ef6b92ff.js @ 14375
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …)]}),(0,n.jsx)("p",{children:"Programa: 2500.00 euros por persona"}),(0,n.jsx)("p",{className…

Only the server-side brochure generator may import lib/pasantias/cohort-commercial.ts.
Public surfaces import lib/pasantias/cohort-public.ts, which has no monetary fields.
EXIT=1
```

## 4. Mutant 2 — the other half of the residue: `EUR 2,500.00`

Comma grouping with a dot decimal, currency marker *before* the amount. Same
injection point, rebuilt.

```
$ npm run build && node /private/tmp/check-price-leak-r3.mjs
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
EXIT=0

$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/pasantias-f48053df8c031bf8.js @ 14375
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …)]}),(0,n.jsx)("p",{children:"Programa: EUR 2,500.00 por persona"}),(0,n.jsx)("p",{className…

Only the server-side brochure generator may import lib/pasantias/cohort-commercial.ts.
Public surfaces import lib/pasantias/cohort-public.ts, which has no monetary fields.
EXIT=1
```

## 5. Restored — clean build, guard green, no new false positives

`pages/pasantias.tsx` restored byte-for-byte (`git diff` empty), rebuilt:

```
$ npm run build && node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
EXIT=0
```

Same 267 client files as §2. The rewritten matcher introduces no finding on the
real tree — which is the load-bearing half of the claim, because the tree does
ship unrelated euro-denominated code (`lib/currency-service.ts`'s
`EUR: 1050`, `lib/expenseReportExport.ts`'s `"1.234,50" for EUR`), and one of
those is an amount written in exactly the dot-grouped/comma-decimal shape this
round taught the guard to read.

---

## 6. Unit-level coverage added with this round

`__tests__/scripts/check-price-leak.test.ts` went from 60 to 81 tests. The new
block is `decimal separators do not hide an amount (Sol r2 B1 residue)`:

- **8 positives on the programme fee**, each asserted to fire `priced-amount`
  *exactly*: `2500.00 euros`, `2,500.00 euros`, `EUR 2,500.00`, `euros 2500.00`,
  `2.500,00 euros`, `2500,00 euros`, `€2,500.00`, `€2 500`. They are the same
  amount in eight conventions and the guard must not be able to tell them apart.
- **4 positives on the short amounts**, where a decimal tail previously turned a
  two- or three-digit figure invisible: `€70.00`, `€120,00`, `1560.00 euros`,
  `560.00 euros`.
- **9 negative controls**, because the comma-only tail was itself the
  crying-wolf control and widening it by hand would have brought those back:
  `€12.500`, `€2.5000`, `€120.000`, `€12.500,00`, `€12,500.00`, `€1.200,70`,
  `€1,200.70`, plus the two live repo strings quoted verbatim in §5.

Every pre-existing case in the file still passes unchanged — including the ones
that pin `€1.560` reporting *once* and the r1 S1 boundary controls, both of
which the old lookarounds enforced and maximal tokenisation now does.

```
$ npx vitest run __tests__/scripts/check-price-leak.test.ts
 ✓ __tests__/scripts/check-price-leak.test.ts  (81 tests) 6ms

 Test Files  1 passed (1)
      Tests  81 passed (81)
```
