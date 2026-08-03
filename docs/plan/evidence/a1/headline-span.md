# A1 r6 — headline date-span, rendered proof

Owner decision 2026-08-02 (PLAN.md Decision Log + Appendix A-1): the headline
date-span becomes one continuous span, `Octubre, 5 al 16`. This file is the
verbatim evidence that the *rendered* homepage carries it — the module test
pins the constant, which is not the same thing (Codex S2).

Branch `phase/a1-r6-label`, worktree `../wt-a1r6`, after `npm run build`.

## 1. What the prerendered homepage actually contains

```
$ grep -o '.\{60\}cohort-headline.\{80\}' .next/server/pages/index.html
róxima cohorte</p><p class="text-xl font-bold" data-testid="cohort-headline">Octubre, 5 al 16 · 2026</p></div></div><div class="space-y-4 mb-8"><h3 class="
```

The card renders `Octubre, 5 al 16 · 2026`: the single span, plus the year it
showed before (previously inside `COHORT_LABEL`, now standing on its own so
"Octubre" is not printed twice).

## 2. The retired two-range shape is gone from the build

```
$ grep -c '5–9 y 13–16' .next/server/pages/index.html
0
$ grep -rl '5–9 y 13–16' .next/static | wc -l
       0
```

## 3. Timezone invariance

The span is derived from ISO dates parsed at UTC midnight, so no runtime
timezone can move a day across the boundary (repo convention for date-only
logic; vitest pins no TZ).

```
$ for tz in UTC Europe/Madrid America/Santiago; do TZ=$tz npx vitest run __tests__/lib/pasantias-cohort.test.ts; done
--- TZ=UTC ---
 Test Files  1 passed (1)
      Tests  38 passed (38)
--- TZ=Europe/Madrid ---
 Test Files  1 passed (1)
      Tests  38 passed (38)
--- TZ=America/Santiago ---
 Test Files  1 passed (1)
      Tests  38 passed (38)
```

## 4. Leak guard still green on the rebuilt bundles

```
$ node scripts/check-price-leak.mjs
check-price-leak: OK — scanned 266 file(s) under .next/static, no commercial data found.
EXIT=0
```
