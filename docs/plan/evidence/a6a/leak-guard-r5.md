# A6a r5 — leak-guard coverage restored, and pinned

Evidence for `scripts/check-price-leak.mjs` at `phase/a6a-page`, base `3ccdd96`.
Round r4 rebuilt the guard on normalisation and, in doing so, replaced the
separator class `\s` with a hand-written `[  ]`. This file records what that
cost, what r5 restored, and the proofs.

Companion: `leak-guard-r4.md` (the round this one repairs).

---

## 1. The differential, measured rather than assumed

Both scanners were run side by side over one corpus — `ca8e024`'s (the last
version before the normalisation rewrite) and this round's — through the exported
`scanText`, so what is compared is what `npm run build && node
scripts/check-price-leak.mjs` executes.

**r4 against r3: 17 shapes lost, 2 gained.**

| shape | r3 `ca8e024` | r4 `3ccdd96` | r5 |
|---|---|---|---|
| `€2\t500` tab | FIRES | **miss** | FIRES |
| `€2\n500` newline | FIRES | **miss** | FIRES |
| `€2\r500` carriage return | FIRES | **miss** | FIRES |
| `€2\v500` vertical tab | FIRES | **miss** | FIRES |
| `€2\f500` form feed | FIRES | **miss** | FIRES |
| `€2 500` ogham space | FIRES | **miss** | FIRES |
| `€2 500` en quad | FIRES | **miss** | FIRES |
| `€2 500` thin space | FIRES | **miss** | FIRES |
| `€2 500` hair space | FIRES | **miss** | FIRES |
| `€2 500` line separator | FIRES | **miss** | FIRES |
| `€2 500` paragraph separator | FIRES | **miss** | FIRES |
| `€2 500` narrow NBSP | FIRES | **miss** | FIRES |
| `€2 500` medium mathematical space | FIRES | **miss** | FIRES |
| `€2　500` ideographic space | FIRES | **miss** | FIRES |
| `€2﻿500` zero-width NBSP | FIRES | **miss** | FIRES |
| `€2.500e3` grouped scientific mantissa | FIRES | **miss** | FIRES |
| `€2.500 000` price with an unrelated run after it | FIRES | **miss** | FIRES |
| `€2 500` NBSP | FIRES | FIRES | FIRES |
| `€2 500` plain space | FIRES | FIRES | FIRES |
| `€70\n120` both band figures, one per line | FIRES | FIRES | FIRES |
| `€2500\n7` fee with an adjacent digit next line | FIRES | FIRES | FIRES |
| `Programa: 2500.00 euros por persona` | miss | **FIRES** | FIRES |
| `x="€2,500.00"` | miss | **FIRES** | FIRES |
| `€２５００` fullwidth digits | miss | miss | miss (pinned) |
| `€2  500` doubled space | miss | miss | miss (pinned) |
| `€25000e-1` | miss | miss | miss (pinned) |
| `€2500e-1` (=250) | FIRES | FIRES | FIRES (pinned over-firing) |
| `€2.500e0` (=2.5) | FIRES | FIRES | FIRES (pinned over-firing) |

The PM's round-3 table found four of the seventeen. The other thirteen are the
rest of the `\s` character class plus `€2.500 000`; none was disclosed, because
only the new cases were tested.

**r5 against r3: two differences, both in the `>>` direction** — the dot-decimal
tails that were r4's whole purpose (Sol r2 B1 residue). Nothing r3 caught is
missed. The final harness output:

```
>> dot-decimal tail               r3=—                      now=priced-amount
>> comma group + dot decimal      r3=—                      now=priced-amount

2 difference(s). '>>' = now fires where r3 did not; '<<' = now misses what r3 caught.
```

`€70\n120` and `€2500\n7` are the reason `whitespaceRuns` exists. They were hits
in both r3 and r4 — r4 only because its class excluded `\n`, so the two figures
tokenised apart. Putting `\n` back would have fused them into the innocuous
`70120` and `25007`. That is the masking r4's comment warned about, and it is
real; excluding newline simply was not the fix, since the same fusion already
happened across the ordinary space r4 kept (`€2.500 000`).

## 2. The corpus catches this class of regression

`__tests__/scripts/check-price-leak.test.ts` gained a 49-row differential corpus,
each row pinned to its verdict, expected misses and expected over-firings
included. Two proofs that it bites:

**a. Flip one expected verdict** — narrow NBSP from `['priced-amount']` to `[]`:

```
FAIL  __tests__/scripts/check-price-leak.test.ts > leak guard — differential corpus (A6a r5) > stays silent on narrow NBSP (U+202F)
AssertionError: "€2 500": expected [ 'priced-amount' ] to deeply equal []
```

**b. Re-apply r4's narrowing** to the live scanner (`\s` → `[  ]` in
`NUMBER_TOKEN`, `GROUPED`, `GROUPED_WITH_DECIMALS`) — 15 named failures, one per
lost separator:

```
❯ __tests__/scripts/check-price-leak.test.ts  (131 tests | 15 failed) 12ms
   ❯ … differential corpus (A6a r5) > fires on tab
   ❯ … differential corpus (A6a r5) > fires on newline
   ❯ … differential corpus (A6a r5) > fires on carriage return
   ❯ … differential corpus (A6a r5) > fires on vertical tab
   ❯ … differential corpus (A6a r5) > fires on form feed
   ❯ … differential corpus (A6a r5) > fires on ogham space mark (U+1680)
   ❯ … differential corpus (A6a r5) > fires on en quad (U+2000)
   ❯ … differential corpus (A6a r5) > fires on thin space (U+2009)
   ❯ … differential corpus (A6a r5) > fires on hair space (U+200A)
   ❯ … differential corpus (A6a r5) > fires on line separator (U+2028)
   ❯ … differential corpus (A6a r5) > fires on paragraph separator (U+2029)
   ❯ … differential corpus (A6a r5) > fires on narrow NBSP (U+202F)
   ❯ … differential corpus (A6a r5) > fires on medium mathematical space (U+205F)
   ❯ … differential corpus (A6a r5) > fires on ideographic space (U+3000)
   ❯ … differential corpus (A6a r5) > fires on zero-width NBSP (U+FEFF)
```

Scanner restored from backup after each; the committed tree is the green one.

## 3. Production-build mutant proof — narrow NBSP

The shape r4 lost, injected as visible page copy in `pages/pasantias.tsx`
(`Solicita el programa completo por €2 500`) and built for production.

```
MUTANT INJECTED: 'Solicita el programa completo por €2 500'
mutant build exit=0

$ node scripts/check-price-leak.mjs
check-price-leak: FAIL — commercial cohort data reached the client bundle (1 match(es)).

  [priced-amount] .next/static/chunks/pages/pasantias-d59e9b8a73806dd1.js @ 14997
      an Appendix A-8 programme amount, live or retired, near a currency marker
      …dren:"Solicita el programa completo por €2 500"}),(0,n.jsx)("a",{href:x,className:"inl…

MUTANT SCAN EXIT=1
```

The same `.next/static`, scanned by r4's own scanner:

```
$ git show 3ccdd96:scripts/check-price-leak.mjs > /tmp/r4-scanner.mjs && node /tmp/r4-scanner.mjs
R4 SCANNER ON THE SAME BUILD, EXIT=0
```

A real production bundle carrying a real price, and r4's guard reports it clean.

Restored and rebuilt:

```
RESTORED: byte-identical to ca8e024
rebuild exit=0
check-price-leak: OK — scanned 267 file(s) under .next/static, no commercial data found.
CLEAN SCAN EXIT=0
```

## 4. Cost of widening the class

`\s` in the token class means the tokeniser can now span whitespace runs, so the
clean scan was timed: **0.12 s over 267 files**, unchanged from r4. No file in a
clean production build produces a whitespace-fused token near a currency marker.

## 5. What stays uncovered, on purpose

Written into the script as a threat model and pinned in the corpus:

- **Fullwidth and other-script digits** — neither vector produces them. The
  minifier emits the shortest ASCII form; a human typing a Spanish price does not
  reach for `２５００`. Normalising arbitrary Unicode digits over every byte of
  every bundle costs more than the risk it removes.
- **`€2  500` (doubled space)** — the separator is one character by construction,
  as it was before r4.
- **`€25000e-1`** — longer than the plain `2500`, so no minifier emits it.
- **`€2500e-1` (=250) and `€2.500e0` (=2.5) over-fire** — a guard erring towards a
  false alarm errs in the safe direction, and neither shape reaches a bundle by
  any route in the threat model.
