# CODEX REVIEW — A1 round 2 of 2

VERDICT: PASS

Both round-1 BLOCKING findings are closed at the final reviewed head
`9a9c282`. The remediation catches the isolated €70/€120 leaks that previously
passed, and the D-01 serialization guard now covers the complete runtime module
namespace rather than a hand-maintained aggregate. No closure residue remains
for Brent under SOP §1.5.

BLOCKING:

- None.

SHOULD-FIX:

- [S1 — backlogged, unchanged] Add the source-level importer allowlist for
  `cohort-commercial.ts` when A3 introduces its first production importer.
- [S2 — backlogged, unchanged] Add a rendered homepage-card regression
  assertion. The PM explicitly triaged both items to the backlog at
  `docs/plan/LEDGER.md:337-345`; neither was part of this blocking-closure round.

NITS:

- None.

NOTES ON THE PLAN ITSELF:

- `[B1]` **CLOSED** — `scripts/check-price-leak.mjs:75-130` defines a dedicated
  `priced-band-amount` check for `70` and `120`, using a 12-character currency
  window and double-sided digit/grouping/decimal boundaries. The production
  file loop calls the exported `scanText` at `scripts/check-price-leak.mjs:172-187,219-229`,
  and `__tests__/scripts/check-price-leak.test.ts:16-79` imports that same
  function. The regression suite therefore exercises the build scanner's own
  regexes, not test-local copies. Independent run:
  `npx vitest run __tests__/scripts/check-price-leak.test.ts` → **1 file, 16/16
  tests passed**.
- The 12-character window is a defensible context bound, not an absolute proof,
  and the executor describes it honestly. Independent probes showed
  `"€".concat(70)`, `"€".concat(120)`, reverse `70 EUR`, and a currency marker
  exactly 12 characters from `70` all fire only `priced-band-amount`; a
  13-character separation does not fire. The latter is the disclosed limit, not
  a hidden contradiction. It closes the round-1 isolated-leak scenario and the
  minifier shapes actually observed without turning ordinary `70`/`120` values
  elsewhere in a client chunk into findings.
- The double-sided boundaries behave as claimed. Independent negative probes for
  `€170`, `€701`, `€1,70`, `€70,00`, `€1.120`, `€120.000`, `€1.200,70`,
  reverse `170€`, and reverse `70.00€` were all silent; the valid whole-amount
  form `€120,-` still fired. This is the right balance for the repository's
  grouped and decimal amount shapes.
- The build-level isolation limit in
  `docs/plan/evidence/a1/leak-guard.md:156-191` is accepted. Because the band
  figures and the derived note co-import from the current module, the production
  bundler cannot emit the figures while fully omitting the note; the scratch
  build nevertheless records distinct `priced-band-amount` matches on the two
  rendered `"€".concat(...)` values. Truly standalone shapes are proven at the
  only reachable isolation level: the 16-test suite feeds them through the exact
  `scanText` implementation and verifies that neither the sentinel nor
  `commercial-copy` contributes.
- `[B2]` **CLOSED** — `__tests__/lib/pasantias-cohort.test.ts:290-355` imports
  `* as cohortPublicModule`, enumerates every runtime export with `Object.keys`,
  serializes exported function bodies as well as data, pins that the result is
  non-vacuous, and applies both monetary-token and protected-number assertions
  to that namespace. A standalone export omitted from `COHORT_PUBLIC` is no
  longer outside the guard. The recorded scratch mutation
  `export const SCRATCH_LODGING_MIN_EUR = 70` turned this test red
  (`docs/plan/LEDGER.md:327-334`), exactly reproducing round-1 B2. Independent
  run: `npx vitest run __tests__/lib/pasantias-cohort.test.ts` → **1 file, 35/35
  tests passed**.
- Re-review scope was respected. `cb2108e` contains the B1/B2 remediation;
  `43dcfae` only records that remediation SHA; and final `9a9c282` is the PM
  verification ledger entry and the last branch commit. `git diff --check
  7ec3ce9..9a9c282` is clean. No unrelated blocker was introduced by these
  commits, and no full-phase review was reopened.

There is no numbered residue for Brent: both BLOCKING findings are closed, and
the two prior SHOULD-FIX items already have explicit backlog dispositions.
