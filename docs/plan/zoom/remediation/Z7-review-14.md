# Z7 independent review — remediation round 14

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `b07eec11810167db1991423611ea67a829678578`
- Rejected tree: `145df9198204b765fb83eba67795d24c4c23d2e4`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/76 commits/clean relevant worktrees passed
- Cumulative inventory: 120 actual / 120 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The thirteenth cold review reproduced every supplied Round 13 probe and independently passed the
R1–R12 authority, financial, ingestion, reconciliation, lifecycle, RLS, concurrency, SQL,
database, browser, build, and inventory boundaries. Adjacent mutation probes found two executable
false negatives and one imported-receiver false positive in the TypeScript reader inventory.
Resolve all three findings cumulatively without weakening R1–R13 controls.

## Z7-R14.1 — positional binding patterns discard executable tuple values (`MAJOR`)

The analyzer computes positional `tupleElements` but treats binding patterns as property-based.
These runtime-valid programs each execute exactly one ledger read while the inventory returns zero
discoveries and zero unsupported results:

```typescript
const [read, receiver, table] =
  [client.from, client, 'contract_hours_ledger'];
read.call(receiver, table);
```

```typescript
function invoke([fn, receiver, args]) {
  Reflect.apply(fn, receiver, args);
}
invoke([client.from, client, ['contract_hours_ledger']]);
```

Tuple-returning wrappers and equivalent assignment/parameter forms inherit the gap. A future
production reader could therefore evade both the census and the fail-closed unsupported result.
There is no matching production caller at the rejected SHA.

**Required:** distinguish object and array patterns throughout abstract binding and assignment.
Propagate positional tuple values recursively through variable declarations, assignment patterns,
function parameters, returned tuples/closures, nested object/array combinations, computed tuple
construction, holes, defaults, rest elements, and spread values. Preserve callable, receiver,
argument tuple, and database-capability provenance. If a position carrying a database-capable
callable cannot be resolved safely, emit deterministic explicit unsupported instead of dropping it.
Do not special-case the two examples.

**Acceptance:** the two probes above and tuple-returning wrapper equivalents each discover exactly
one ledger call. Add a matrix for declaration/assignment/parameter/destructuring, nested patterns,
holes/default/rest/spread, returned tuples, aliased/computed call/apply/bind, unresolved tuple
members, and inert tuples. Recoverable calls count exactly once; unresolved executable forms reject
explicitly; inert patterns add no discovery or noise; cycles terminate deterministically.

## Z7-R14.2 — raw callable identity mistakes finite adapter reuse for a cycle (`MAJOR`)

The non-convergence guard keys recurrence on raw `AbstractValue` identity. Legitimate finite reuse
of `Function.prototype.call` is therefore rejected:

```typescript
const c = Function.prototype.call;
c.call(
  c,
  Function.prototype.apply,
  client.from,
  client,
  ['contract_hours_ledger'],
);
```

Runtime executes exactly one ledger call. The analyzer reports zero calls and
`non-convergent Function adapter`.

**Required:** distinguish a true recursive evaluation state from finite callable reuse. Key active
evaluation/memoization by the complete semantic state needed for progress: adapter kind and
position, target callable, receiver, bound/current arguments and positional tuple information,
plus a deterministic phase/depth or equivalent structural fingerprint. Retain a bounded global
work/evaluation budget so genuinely recursive graphs terminate. Equivalent finite
`call`/`apply`/`bind` compositions must converge regardless of repeated intrinsic identity; genuine
cycles must reject explicitly and stably.

**Acceptance:** the supplied probe discovers exactly one ledger call. Cover increasing finite
depths and mixed nesting orders, aliased/computed/destructured/bound forms, repeated intrinsic
identity with changing receiver/arguments, duplicate suppression, and genuine self/mutual cycles.
Every finite recoverable form counts exactly once; real cycles terminate with byte-identical
explicit unsupported results across repeated runs.

## Z7-R14.3 — imported non-database `.from` receivers are false positives (`MINOR`)

The inventory assumes nearly every non-excluded `.from` receiver is Supabase. This valid standard
library call is incorrectly counted as a ledger read:

```typescript
import { Readable } from 'node:stream';
Readable.from('contract_hours_ledger');
```

Locally declared ordinary receivers are already ignored, but imported receiver provenance is lost.

**Required:** retain import and receiver provenance instead of inferring database capability solely
from the property name. Proven non-database standard-library/module receivers must remain inert
through aliases, namespace/named/default imports, destructuring, and computed access. Known
Supabase clients and database-capable wrappers must remain discoverable. An unresolved imported
receiver whose runtime database capability cannot be classified and whose arguments target the
ledger must fail explicitly unsupported rather than being silently treated as definitely safe or
definitely Supabase. Avoid a growing textual receiver-name exclusion list.

**Acceptance:** direct, aliased, computed, destructured, named/namespace/default non-database
import forms (including `node:stream` `Readable.from`) produce no ledger discovery or unsupported
noise when provenance proves them inert. Supabase/imported database wrappers continue to count;
ambiguous external receivers targeting the ledger reject explicitly; local ordinary `.from`
controls and the exact production census remain unchanged.

## Retained controls and residual classifications

Retain every accepted R1–R13 control: the composable `call`/`apply`/`bind` model; deterministic
unsupported/cycle behavior; the retired arbitrary-SQL RPC and endpoint; SQL lexical/dynamic
analysis; seven-column ledger UPDATE and column-scoped INSERT; owner-only sequences; audited
mutations; canonical financial consumers; occurrence/batch transitions; availability and
reconciliation; exact decimals/pairs; and all previous mutation/false-positive fixtures.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 14, pending independent
review without claiming acceptance. Add Round 14 positive/negative/mutation evidence, reconcile
the cumulative changed-path inventory exactly, and record current artifact counts honestly.

Run focused Round 14 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build; fresh migration replay and full pgTAP; legitimate ledger writers;
both concurrency proofs; exact mandatory Chromium suite/manifest; price guard; analyzer mutation,
unsupported, false-positive, cycle, and nontermination proofs; and exact inventories. Record
inherited deviations, discard incomplete collections, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
