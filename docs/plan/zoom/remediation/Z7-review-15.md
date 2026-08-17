# Z7 independent review — remediation round 15

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `4d6119e765a818064ea3152f57c10008647f520a`
- Rejected tree: `dba9ce468a32693764cf877b3832ce576ec26028`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/79 commits/clean relevant worktrees passed
- Cumulative inventory: 121 actual / 121 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The fourteenth cold review independently passed the adapter-state/cycle repair, every supplied
Round 14 fixture, cumulative R1–R13 application/database boundaries, full gates, and exact
inventories. It found one remaining positional false-negative family and one shallow module-
provenance family. Resolve both cumulatively without weakening R1–R14 controls.

## Z7-R15.1 — finite array constructors and numeric assignments lose positional facts (`MAJOR`)

The abstract evaluator preserves positional facts for array literals but not ordinary finite array
construction. Each of these runtime-valid forms executes exactly one ledger read while the
inventory returns zero discoveries and zero unsupported results:

```typescript
const [fn, receiver, table] =
  Array.of(client.from, client, 'contract_hours_ledger');
fn.call(receiver, table);
```

Equivalent silent misses occur with:

```typescript
new Array(client.from, client, 'contract_hours_ledger');
Array.from([client.from, client, 'contract_hours_ledger']);
```

Numeric member assignment also loses a recoverable callable because assignment pattern handling
accepts only string keys:

```typescript
const slots = [];
[slots[0], slots[1], slots[2]] =
  [client.from, client, 'contract_hours_ledger'];
slots[0].call(slots[1], slots[2]);
```

That form and nested object/array equivalents reject as unsupported instead of discovering the
exact call. There is no matching production caller at the rejected SHA.

**Required:** represent statically finite sequences through their actual construction and mutation
semantics, not array-literal syntax alone. Preserve positional elements for direct, aliased,
computed, and destructured `Array.of`, `new Array(...items)`, and `Array.from` over statically known
finite inputs. Respect `new Array(length)` hole semantics. Keep positional and property facts
coherent through finite literal spread/concatenation and statically known sequence operations;
when an unsupported constructor/transform receives or may return a database-capable callable,
propagate explicit uncertainty so later execution fails deterministically instead of disappearing.

Support statically known numeric member reads/writes and assignment targets, including computed
numeric keys, nested object/array targets, declaration/assignment/parameter/return flows,
conditionals, closures, defaults, holes, rest/spread, and property aliases. A numeric write must
update both the sequence position and corresponding property state. Preserve database callable,
receiver, argument tuple, import, and ambiguity provenance throughout. Do not special-case only
the four supplied programs.

**Acceptance:** every supplied probe discovers exactly one ledger call with no unsupported result.
Add a matrix for direct/aliased/computed/destructured constructors; `new Array` item versus length
overloads; known and unknown `Array.from` inputs; finite spread/concat equivalents; numeric literal
and computed reads/writes; destructuring assignment into numeric members; nested targets;
parameters/returns/closures/conditionals; holes/default/rest; and ambiguous or cyclic inputs.
Recoverable calls count exactly once; unknown executable sequence domains reject explicitly and
stably; inert sequences remain silent; genuine cycles stay bounded; production census is unchanged.

## Z7-R15.2 — module provenance omits CommonJS and re-export graphs (`MINOR`)

The current provenance model handles direct ESM imports and some direct local return definitions,
but not CommonJS or re-export/barrel graphs. A proven inert built-in becomes a false database read:

```typescript
const { Readable } = require('node:stream');
Readable.from('contract_hours_ledger');
```

Conversely, a real local re-export is unnecessarily unsupported:

```typescript
import { useSupabaseClient } from '../lib/frontend-auth-utils';
const database = useSupabaseClient();
database.from('contract_hours_ledger');
```

From a synthetic `pages/synthetic.ts` location, the second form returns zero reads plus unsupported
even though `lib/frontend-auth-utils.ts` explicitly re-exports the Supabase hook. This database
case fails closed, so the defect is MINOR, but the claimed systemic provenance proof is incomplete.

**Required:** build a cycle-safe module provenance graph rather than adding receiver-name or
single-file exceptions. Resolve named/default/namespace/aliased imports and exports, local export
specifiers, `export ... from`, `export *`, multi-hop barrels, default exports, relative file/index
resolution, and statically analyzable wrapper/hook returns. Model CommonJS `require` namespace,
destructured, member, aliased, computed, and interop/default forms. Proven Node built-ins and other
proven non-database modules remain inert; proven Supabase factories/hooks/clients/query builders
remain database-capable through re-exports and chaining. Genuinely ambiguous external receivers
targeting the ledger must remain explicit unsupported. Graph traversal must terminate on circular
barrels with deterministic results.

**Acceptance:** the two supplied probes classify correctly: CommonJS `Readable.from` is silent and
the existing hook re-export discovers exactly one ledger read. Cover ESM/CommonJS named/default/
namespace/alias/computed/destructured forms; one- and multi-hop barrels; `export *` and explicit
re-export; relative wrappers returning versus merely mentioning a client; circular barrels;
CommonJS Supabase factories; proven inert built-ins; and ambiguous external imports. No textual
receiver-name allow/deny list, no duplicate counts, no nontermination, and no production census
drift.

## Retained controls and residual classifications

Retain every accepted R1–R14 control, especially full-semantic-state adapter recurrence and bounded
cycles; positional literal/destructuring propagation; import ambiguity fail-closed behavior; the
retired arbitrary-SQL RPC/endpoint; SQL analysis; ledger grants/shapes; audited authority; canonical
financial consumers; lifecycle/occurrence/batch transitions; availability/reconciliation; exact
decimals/pairs; and all earlier mutation and false-positive fixtures.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 15, pending independent
review without claiming acceptance. Add Round 15 positive/negative/fail-on-old evidence, reconcile
the cumulative changed-path inventory exactly, and record current artifact counts honestly.

Run focused Round 15 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/price guard; fresh pinned local migration replay/full pgTAP;
legitimate ledger writers; both concurrency proofs; exact mandatory Chromium suite/manifest;
sequence/module-graph mutation, uncertainty, false-positive, cycle, and nontermination proofs; and
exact path/reader/writer/SQL/RPC inventories. Discard incomplete collections, record inherited
deviations, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
