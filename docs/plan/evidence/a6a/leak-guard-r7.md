# A6a r7 — the evidence made durable; the guard was already correct

Evidence for `scripts/check-price-leak.mjs` and its corpus at `phase/a6a-page`,
base `8382df8`.

Sol's round-5 review found **no functional defect in the guard**: HEAD catches
every separator, an independent span audit found zero attribution losses across
all 928 r6 cases, and the production scan is clean. This round changes no verdict
the scanner produces on any shape either revision agrees about. What it repairs
is the **evidence** — two ways a future regression could pass through a green
suite — plus one pinned limit and one negative control.

Companions: `leak-guard-r4.md`, `leak-guard-r5.md`, `leak-guard-r6.md`.

---

## 1. The separator set is derived, not enumerated

`price-leak-corpus.mjs` listed **18** of the 25 code points JavaScript's `\s`
matches, omitting U+2001, U+2002 and U+2004–U+2008. An independent generator
written to check that list produced **21**, omitting four. r4 had already
narrowed the *guard's* class to two and lost fifteen spellings.

Three attempts, three different wrong answers, three authors. Adding the seven
missing characters would repeat the method, so the set is now asked of the engine
at test time:

```js
export const WHITESPACE_CODE_POINTS = (() => {
  const found = [];
  for (let code = 0; code <= 0xffff; code += 1) {
    if (/\s/.test(String.fromCharCode(code))) found.push(code);
  }
  return found;
})();
```

`WHITESPACE_COUNT = 25` is asserted alongside it — ECMAScript WhiteSpace (11.2)
plus LineTerminator (11.3), all in the BMP — so an engine that gains or loses a
whitespace character surfaces as a named failure rather than as silently thinner
coverage. Two further assertions pin that the derived set contains the seven
r6 omitted, and that everything in it is in fact whitespace.

Readable names (`narrow NBSP (U+202F)`) come from a lookup that is **cosmetic
only**: it never decides membership, so a code point missing from it costs a case
its label and nothing else.

### 1.1 The corrected differential

Harness: three revisions of `scripts/check-price-leak.mjs` — HEAD, `2158c44`
(the revision Sol reviewed in round 4) and `ca8e024` (the pre-r4 baseline) —
imported side by side and run over exactly the cases vitest runs. Source in §7.

Run twice: once over the **r6 context set** (its eight contexts, with the
separator axis corrected from 18 to 25 — this is the corpus Sol measured), and
once over the full r7 corpus.

**r6 context set, separators derived — 1133 cases**

| | losses | gains | id changes |
|---|---|---|---|
| HEAD vs `ca8e024` | **0** | 234 | **231** |
| `2158c44` vs `ca8e024` | **154** | 198 | 297 |
| HEAD vs `2158c44` | **0** | 190 | 160 |

HEAD disagrees with the generated expectation on **0** cases.

**Both of Sol's corrected figures reproduce exactly: 154, not r6's 112; 231, not
r6's 182.** r6 undercounted for one reason — its separator axis was seven
characters short.

**Full r7 corpus — 1818 cases** (13 contexts)

| | losses | gains | id changes |
|---|---|---|---|
| HEAD vs `ca8e024` | **0** | 312 | 284 |
| `2158c44` vs `ca8e024` | **154** | 264 | 346 |
| HEAD vs `2158c44` | **0** | 202 | 164 |

Disagreements with the generated expectation: **0**.

### 1.2 What `2158c44` lost — 154, by spelling

| spelling | count |
|---|---|
| grouped by a whitespace separator (25 characters × 6) | 150 |
| Sol's four named rows (`€2 500 7`, `€2 500\n7`, `€1 000\n45`, narrow-NBSP form) | 4 |

The 150 is `2 amounts (2500, 1000) × 25 separators × 3 trailing-digit contexts`.
r6 wrote the same formula with 18 separators and got 108 + 4 = 112. The formula
was right; the axis was short.

### 1.3 The 231 id changes, all accounted for

| transition | count | why |
|---|---|---|
| `priced-amount+retired-short-amount` → `priced-amount` | 151 | HEAD suppresses the `560` nested inside `1 560`; `ca8e024` reported it as a second finding |
| `priced-amount+priced-band-amount+retired-short-amount` → `…` minus the short | 25 | same, with a band figure also planted |
| `priced-band-amount` → `priced-amount+priced-band-amount` | 22 | normalisation reads a value `ca8e024`'s literal patterns could not |
| `retired-short-amount` → `priced-amount+retired-short-amount` | 13 | same |
| `priced-band-amount` → `priced-band-amount+retired-short-amount` | 6 | same |
| `priced-amount+retired-short-amount` → `priced-band-amount+retired-short-amount` | 6 | same |
| `retired-short-amount` → `priced-band-amount+retired-short-amount` | 5 | same |
| `priced-amount+retired-short-amount` → `retired-short-amount` | 3 | maximal reading replaces a nested one |

176 of the 231 are the maximality rule; the other 55 are HEAD finding a figure
`ca8e024` missed. **No transition drops a check id without a wider reading taking
its place**, which is what "0 losses" means row by row.

### 1.4 The 234 gains

| spelling | count |
|---|---|
| a decimal-dot tail | 36 |
| exponential `e1` | 36 |
| exponential `e2` | 36 |
| an explicit positive exponent | 36 |
| an uppercase exponent | 36 |
| comma-grouped with a dot tail | 18 |
| exponential `e3` | 18 |
| exponential `e4` | 18 |

All are r4/r5 normalisation reading a value where `ca8e024` matched a spelling.

---

## 2. The oracle keeps attribution

`checksFiring()` reduced a scan to the **set of check ids** that fired. Under
that oracle `€120 €70` and `€560 560` stay green when the first planted figure
stops firing, because the second still produces the same id. That is not
hypothetical: it is how r5's damage hid. On `€1 560 7` r5 *did* fire — on the
nested `560` rather than on the fee — so every spot check passed while the
finding pointed at the wrong figure.

Two changes:

1. **Findings carry attribution.** `scanText` now returns
   `{ check, index, match, amount, start, end }` for every finding: the canonical
   amount it fired on and the `[start, end)` span of the reading that denoted it.
   Text checks report `amount: null` and their own match span, so the shape is
   uniform. `index`/`match` are unchanged — they stay the reporting anchor and
   still widen to include the marker, so console output shows the pair.
2. **The corpus asserts per occurrence.** Each generated case now carries the
   multiset of `(check, amount)` pairs it plants; a case planting two figures must
   produce two findings. Six `ATTRIBUTION_ROWS` additionally assert what each
   finding's span slices back to, in report order.

Three new contexts feed it: a second figure with the band **maximum**
(`€120 €70` and `€70 €120` are same-id two-figure cases), and marker positions
at both window edges (§4).

### 2.1 Proof that the new oracle bites where the old one did not

Mutation — `candidateReadings` truncated to its first reading per token, so the
second figure in a shared token stops firing while the first survives:

```js
return maximalReadings(readings).slice(0, 1).map((reading) => ({
```

Over the 1787 corpus + attribution cases:

```
cases:                           1787
flagged by the id-set oracle:     104
flagged by the occurrence oracle: 108
caught ONLY by occurrences:         4
```

The four are the `€560 560` family — the prompt's own example:

```
  "€560 560"
    the retired lodging package (560), plain, followed by the retired package, sharing one marker
    id set      expected retired-short-amount   got retired-short-amount   -> GREEN
    occurrences expected retired-short-amount:560+retired-short-amount:560   got retired-short-amount:560   -> RED
```

(the other three are the same string reached through `€560.00 560`, `€560,50 560`
and the named `ATTRIBUTION_ROWS` row.)

The named vitest failure, verbatim, under the same mutation:

```
 FAIL  __tests__/scripts/check-price-leak.test.ts > leak guard — findings name the figure they fired on > reports every planted figure in the retired package twice, sharing one marker
AssertionError: "€560 560": expected [ 'retired-short-amount:560' ] to deeply equal [ 'retired-short-amount:560', …(1) ]

- Expected
+ Received

  Array [
    "retired-short-amount:560",
-   "retired-short-amount:560",
  ]

 FAIL  __tests__/scripts/check-price-leak.test.ts > leak guard — findings name the figure they fired on > points each finding at the figure it read in the retired package twice, sharing one marker
AssertionError: "€560 560": expected [ '560' ] to deeply equal [ '560', '560' ]
```

The mutation was then reverted and the file restored byte-for-byte before any
gate was run.

---

## 3. The suppression invariant is evaluated, not assumed

`candidateReadings` drops a protected reading contained in a longer protected
reading, which is what keeps `€1 560` at one finding. r6's comment claimed that
is lossless because a contained reading "is never closer to a currency marker
than its container, and never carries a wider window."

The first half is a theorem: a contained span is inside its container's, so
whichever side the marker is on, `innerDistance >= containerDistance`. **The
second half is not.** Containment says nothing about window width — it was true
only because the one nesting today's amount table admits is `1560 ⊃ 560`, where
the container's window is 120 and the inner's is 12.

So the condition is now checked rather than argued. `maximalReadings` is
exported, takes readings carrying a `window`, and suppresses a contained reading
only when the container's window is at least as wide:

```js
other.first <= reading.first &&
other.last >= reading.last &&
(other.first < reading.first || other.last > reading.last) &&
other.window >= reading.window
```

`widestWindow(amounts)` supplies it. **No verdict changes**: today's table
satisfies the condition everywhere, which the 1818-case differential confirms
(HEAD vs `2158c44`: 0 losses). Four unit tests drive the predicate directly —
wider container, equal windows, a *narrower* container with a wide inner (which
must now be kept), and two readings containing each other in neither direction —
because the amount table cannot produce the third case, so behaviour alone could
not cover it.

---

## 4. The real over-firing, pinned

`lib/services/hour-tracking.ts` puts an hour cache TTL beside the FX API URL:

```
const FX_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const FX_API_URL = 'https://api.exchangerate-api.com/v4/latest/EUR';
```

`1000` is a retired programme fee and `EUR` sits 75 characters away, inside
`priced-amount`'s 120-character window, so the guard fires `priced-amount` on it.
Nothing is broken today: the constant does not survive minification, so it never
reaches `.next/static` and the production scan stays clean.

**Kept as an over-firing, not tightened.** The 120-character window exists to
span `currency:"EUR",items:[{id:…,label:…,amount:…}` — the shape the
commercial-module mutant proof relies on. Every tightening available here (a
no-newline rule between amount and marker, a URL exclusion, a comment exclusion)
buys silence on this fragment by narrowing exactly the association that proof
needs, so the prompt's condition — tighten *only* without weakening the mutant
proof — is not met. The fragment is added to `PINNED_LIMITS` verbatim with that
reason attached, which also gives the corpus its first case on the
**marker-distance** dimension.

That dimension is now varied properly too: four generated contexts place the
marker at each check's exact window edge (fires) and one character past it (does
not), on both sides, crossed with every spelling.

---

## 5. Production build

No verdict changed this round, so there is no regression to demonstrate at build
level. What a production build *does* prove that a unit test cannot is that the
CLI path — `main()`, which consumes the finding fields §2 reshaped — still
reports one finding per figure. So the mutant is a two-figure, one-check-id
string, injected as visible page copy after the free-weekend line:

```
Alojamiento: €120 €70 por noche.
```

`npm run build`, then `node scripts/check-price-leak.mjs`:

```
check-price-leak: FAIL — commercial cohort data reached the client bundle (2 match(es)).

  [priced-band-amount] .next/static/chunks/pages/pasantias-577073fb64ca79a3.js @ 20782
      an Appendix A-8 lodging-band amount beside a currency marker
      …ntes de la segunda semana. Alojamiento: €120 €70 por noche."}),(0,n.jsx)("ul",{class…

  [priced-band-amount] .next/static/chunks/pages/pasantias-577073fb64ca79a3.js @ 20787
      an Appendix A-8 lodging-band amount beside a currency marker
      …de la segunda semana. Alojamiento: €120 €70 por noche."}),(0,n.jsx)("ul",{className…

MUTANT SCAN EXIT: 1
```

**Two findings, two offsets (20782 and 20787), one check id.** That is the
attribution property at build level: the reduction this round removed from the
oracle was never in the scanner's output, and the console has always shown both.

Reverted (`git checkout -- pages/pasantias.tsx`;
`git diff ca8e024 -- pages/pasantias.tsx lib/pasantias/cohort-public.ts` empty),
rebuilt, scanned clean:

```
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
CLEAN SCAN EXIT: 0
```

267 files — the same count as r4, r5 and r6.

---

## 6. Gates

| gate | result |
|---|---|
| `npm run type-check` | exit 0 |
| `npm run lint` | exit 0, `--max-warnings=0` |
| `npm test` | 257 files, **6098 passed** (1918 of them in `check-price-leak.test.ts`) |
| `npm run build` | exit 0 |
| `node scripts/check-price-leak.mjs` | OK, 267 files |
| `CI=1 npx playwright test tests/e2e/pasantias-page.spec.ts tests/e2e/footer-heading-order.spec.ts tests/e2e/smoke.spec.ts` | **14 passed** |

`npm test` was 5225 at r6; +873, all in the leak-guard file, which went
1045 → 1918 tests. The generated product is 1781 cases (137 spellings × 13
contexts), up from 928 (116 × 8): seven more separators on the spelling axis and
five more contexts.

**One environment note for whoever re-runs this.** The three e2e specs first came
back 6 failed / 8 passed, with `locator('main')` resolving to 0 elements on
`/pasantias`. That is not a code failure: `.env.local` copied from a working
checkout has no `NEXT_PUBLIC_BASE_URL`, and since r3's B5 change
`getAppBaseUrl(context.req)` **throws** rather than falling back, so
`getServerSideProps` 500s and the page renders nothing. `ci.yml:149` writes that
key into the `.env.local` it generates. Adding
`NEXT_PUBLIC_BASE_URL=http://localhost:3000` and rebuilding (the value is inlined
at build time) turns all 14 green. Worth knowing before reading a red e2e run on
this phase as a regression.

---

## 7. The differential harness

Not committed (it imports revisions by path); reproduced here so the numbers in
§1 can be re-derived.

```
git show 2158c44:scripts/check-price-leak.mjs > scanner-2158c44.mjs
git show ca8e024:scripts/check-price-leak.mjs > scanner-ca8e024.mjs
node differential.mjs ./wk/scripts/check-price-leak.mjs \
  ./scanner-2158c44.mjs ./scanner-ca8e024.mjs \
  ./wk/__tests__/scripts/price-leak-corpus.mjs
```

```js
const ids = (mod, text) =>
  [...new Set(mod.scanText(text).map((f) => f.check.id))].sort().join('+');

// classify(older, newer): equal -> same; older non-empty & newer empty -> loss;
// older empty & newer non-empty -> gain; otherwise -> id change.
```

Cases are built from the corpus module's own `PROTECTED` × `spellings()` ×
`CONTEXTS`, plus `PINNED_LIMITS`, `SILENT_CONTROLS` and `SOL_ROUND_4_ROWS`;
`CONTEXTS.slice(0, 8)` reproduces the r6 context set, which is why the r7
additions are appended to that array rather than interleaved.

Comparison is on check-id sets, because `ca8e024` and `2158c44` predate the
`amount` field and cannot report occurrences. The per-occurrence assertions are
therefore a HEAD-only property, proved by mutation in §2.1 rather than by
differential.

---

## 8. Out of scope, unchanged

`pages/pasantias.tsx` and `lib/pasantias/cohort-public.ts` are byte-identical to
`ca8e024` (`git diff ca8e024 --` empty). Accepted limits are unchanged and stay
pinned: fullwidth and Arabic-Indic digits, doubled space, `€25000e-1`, the two
conservative over-firings (`€2500e-1`, `€2.500e0`), bare leading zeroes with no
exponent — joined this round by the `hour-tracking` fragment. Heading debt on
`/nosotros`, `/programas`, `/brand-preview` and `ci-fixture.spec.ts` untouched.
