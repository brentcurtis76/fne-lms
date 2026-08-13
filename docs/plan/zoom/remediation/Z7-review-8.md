# Z7 independent review — remediation round 8

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `ecaa54feee5e627868294cdda1e0e01764bac99b`
- Rejected tree: `56ea07e7a44e8f0e23d128d427d076f639380e7f`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/49 commits/clean relevant worktrees passed
- Cumulative inventory: 102 actual / 102 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The seventh cold review independently reproduced the committed focused/full Vitest and pgTAP
claims, static gates, override privilege controls, reschedule authority, and exact cumulative
inventory. It found one participant identity-authority defect and three additional executable
consumer-guard false negatives. Resolve all four findings cumulatively without regressing any
accepted R1–R7 invariant.

## Z7-R8.1 — Conflicting occurrence UUID attaches to an established surface (`MAJOR`)

In `lib/zoom/participant-lifecycle.ts`, when occurrence lookup fails, the meeting-number fallback
accepts a meeting surface even if that row already holds a different occurrence UUID. The incoming
event UUID is then written with the established surface's session/school identity. The reviewer
reproduced `interval_opened` for `foreign-occurrence` against a surface established as
`established-occurrence`.

**Required:** meeting-number fallback is valid only while the matching meeting row's occurrence UUID
is null or equals the incoming occurrence UUID. Reject a mismatch. Enforce the same invariant at the
database write boundary so a lookup/write race cannot attach a conflicting occurrence after the
application check. Preserve fill-only occurrence UUID behavior and all tenant/session ownership
boundaries.

**Acceptance:** mismatched joined and left events create no interval and no observation, and do not
change the meeting row. Matching-UUID events and the legitimate pre-start/null-UUID number fallback
remain valid. Add real database/integration evidence for the race-sensitive boundary, not only an
in-memory mock. Exercise concurrency or an equivalent forced stale-lookup challenge proving the
write cannot cross occurrence identity. Retain lifecycle, webhook, retry, tenant-isolation, and RLS
coverage.

## Z7-R8.2 — TypeScript guard misses callable aliases (`MAJOR`)

The discovery function in `__tests__/lib/services/ledger-hours-reader-inventory.test.ts` returns an
empty result for both computed destructuring (`const {[METHOD]: read} = client`) and property
extraction (`const read = client.from`) followed by a ledger call. Such consumers leave the
direct/indirect census unchanged and raise no unsupported-dynamic error.

**Required:** resolve property- and element-derived callable aliases, including computed constants,
across lexical scopes. Unresolved computed callable names must fail closed. Handle both `from` and
`rpc`, including generic invocations and shadowing, without returning an unclassified empty result.

**Acceptance:** executable mutations cover `from` and `rpc` for constant and dynamic computed
destructuring, direct property/element extraction, generics, nested scopes, shadowing, and every
production TS/TSX/JS/JSX root. Any unresolved callable or target must be explicitly rejected.

## Z7-R8.3 — Dynamic allowlists are disconnected from runtime bindings (`MAJOR`)

The source guard separately matches an unsupported-call key and a same-named finite declaration,
rather than proving the live call argument resolves to that declaration. The reviewer changed the
proposal loop from the literal `tables` array to `process.argv.slice(2)` while retaining the now
unused `tables` declaration; both the exact unsupported key and finite allowlist stayed green, so an
externally controlled table source was accepted.

**Required:** trace each allowed dynamic call argument through its actual lexical binding and
resolved branches to the exact finite declaration/value set. Do not satisfy an allowance with an
unused, shadowed, or same-named declaration. External/unresolved sources fail closed. Any resolved
branch containing the ledger table or a ledger-backed RPC must fail.

**Acceptance:** every current live allowance becomes red when redirected or shadowed to an external
source while its prior literal declaration remains. Mutations cover aliasing/reassignment,
parameter/loop bindings, nested shadowing, and conditional/array branches. Every finite branch is
checked, and insertion of `contract_hours_ledger` or a ledger-backed callable in any branch fails.

## Z7-R8.4 — SQL guard misses derived-table reads and quoted writes (`MAJOR`)

The SQL guard reports zero raw-hours uses for both:

- `SELECT q.hours FROM (SELECT * FROM public.contract_hours_ledger) q`
- `UPDATE public.contract_hours_ledger SET "hours" = 1`

Direct, qualified, quoted-alias, CTE, and plain-update controls still return one. A new raw-hours
consumer can therefore evade the documented seven-file/25-expression census.

**Required:** replace the remaining regex-only limitation with a proper SQL parser or a conservative
token/scope walker that understands derived-table aliases, nested statements, quoted identifiers,
write targets, and multiple statements, and fails closed when a ledger-relevant statement cannot be
classified. Avoid false positives from comments and string literals without silently accepting
unsupported syntax.

**Acceptance:** executable mutations cover derived/subquery aliases, nested subqueries, quoted and
tuple updates, direct and arbitrary aliases, unqualified and qualified reads, CTEs, views/functions,
multiple statements, comments/literals, and direct/transitive dependencies. Each genuine raw-hours
use changes or invalidates the exact map; unsupported ledger-relevant syntax fails closed. Recompute
the executable SQL census and reconcile every evidence claim.

## Retained accepted controls and residual classifications

Do not weaken or redesign already accepted controls merely to complete round eight. In particular,
retain override RPC-only audit authority, tracked/XOR reschedule rejection, attendance-batch
terminality, availability coherence, exact decimal handling, financial effective-minute consumers,
pagination/report authority, and all R1–R7 regressions.

Do not expand round eight merely to redesign these accepted residuals:

- External balance can change between bulk preflight and insertion, and sequential bulk insertion
  can partially succeed after a later non-availability error. A future transactional bulk RPC is
  recommended but outside Z7 acceptance.
- An unmatched report row may coexist with an absent-attendee suggestion under the current
  facilitator-confirmation contract; evidence remains visible and no write occurs until confirmation.

## Evidence and boundaries

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from the immutable base through
the eventual tree, adding every round-eight path and honest fail-on-old/mutation/database evidence.
Mechanically update all path, direct/indirect consumer, SQL-expression, dependency, migration, test,
and commit counts; remove stale or overstated claims. External dispatch remains authoritative for
the self-referential final canonical SHA.

Update `PROJECT_STATE.md` to round-eight review-ready/pending independent review without claiming
acceptance, merge, deployment, or production verification.

Run focused R8 plus all prior high-risk suites; type-check; zero-warning lint; full Vitest in the
required time-zone matrix; production build; fresh local migration replay and full pgTAP; a real
occurrence-conflict/race boundary probe; real override concurrency; mandatory 117-test Chromium;
guard mutation probes; and exact inventory reconciliation. Record inherited advisory, broad-suite,
and Madrid deviations honestly. Leave no persistent local test state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
