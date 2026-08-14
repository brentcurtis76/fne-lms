# Z7 independent review — remediation round 18

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `f909e16f6a1be6a8a0e3bfe72e02783a90ed4da2`
- Rejected tree: `1d1fa2adcc26d371e9312f689c0192abf3d23023`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact detached SHA/tree/base/89 commits/clean start and end passed
- Cumulative inventory: 124 actual / 124 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The seventeenth cold review independently passed all supplied Round 17 fixtures, every cumulative
R1–R16 product/database boundary, full application/database/RLS/concurrency/browser gates, and
exact inventories. It found two adjacent systemic defects in the executable TypeScript reader
inventory. Resolve both cumulatively without weakening R1–R17 controls.

## Z7-R18.1 — ordinary mutable-property transfers retain stale calls or lose live sequences (`MAJOR`)

The evaluator applies strong updates for a narrow plain-`=` path, but other deterministic
JavaScript writes either union the old and new slot values or do not update the shared heap at all.
This creates both stale exact false positives and silent false negatives.

Representative independently reproduced stale-call probe:

```typescript
const client = getClient();
const slots = [client.from, client, 'contract_hours_ledger'];
Object.defineProperty(slots, '0', { value: () => null });
slots[0].call(slots[1], slots[2]);
```

Runtime performs zero ledger calls. The rejected analyzer reports exactly one stale
`from('contract_hours_ledger')` call. Deterministic `Reflect.set`, guarded `delete slots[0]`,
`slots.length = 0`, logical assignment such as `slots[0] &&= replacement`, and update expressions
such as `slots[0]++` produced the same runtime-inert/analyzer-exact class of failure.

Sequence identity is also lost through ordinary static integrity wrappers. For example, a frozen
sequence whose attempted generic mutation throws remains unchanged and then executes the original
ledger call at runtime, while the analyzer returns zero calls and zero unsupported authority:

```typescript
const slots = Object.freeze([
  client.from,
  client,
  'contract_hours_ledger',
]);
try {
  Array.prototype.reverse.call(slots);
} catch {}
slots[0].call(slots[1], slots[2]);
```

Static `Object.seal` and `Object.preventExtensions` wrappers also lose identity under operations
whose success/throw behavior is fixed by the wrapper and mutation shape. Their semantics are not
interchangeable: tests and transfer rules must use runtime controls and preserve the actual
success, partial-effect, or throw behavior for each named integrity level and mutator.

**Required:** make every deterministic property mutation a transfer over the existing shared heap
identity. Cover direct/computed `delete`; `length` truncation/extension; logical assignments
`&&=`, `||=`, and `??=` with branch-correct effects; compound arithmetic/bitwise assignments and
prefix/postfix update expressions; `Reflect.set`; `Object.defineProperty`; and static descriptor
aliases. A definite receiver/key with a definite write must strongly replace or delete the old
fact. Only genuine may-alias/may-key paths may weakly update or invalidate, and any remaining
executable uncertainty must be explicit rather than stale exact output or silence.

Preserve sequence/object identity and integrity state through `Object.freeze`, `Object.seal`, and
`Object.preventExtensions`. Model whether each named mutator/property operation succeeds, throws,
or has deterministic partial effects under ordinary strict/non-strict execution used by the
analyzed source. A caught throw must continue with the correctly preserved/post-failure heap.
Compose these transfers with aliases, branches, closures, parameters, returns, destructuring,
generic mutation adapters, holes, sparse arrays, bounds, chained return values, and cycles.

**Acceptance:** checked-in fail-on-old fixtures make the rejected evaluator fail for the supplied
`defineProperty` probe and for deterministic `Reflect.set`, guarded deletion, length truncation,
all three logical assignments, representative compound assignments, and prefix/postfix updates.
Add strong versus weak receiver/key matrices, alias and branch controls, inert replacements,
unknown executable controls, repeated/cyclic objects, and exact integrity-wrapper matrices across
all eight named sequence mutators and direct property writes. Runtime-exact live calls resolve once;
runtime-inert cases resolve zero without unsupported; genuinely uncertain executable cases emit
deterministic unsupported. Production census remains unchanged.

## Z7-R18.2 — CommonJS export state remains a flat snapshot instead of a recursive heap (`MAJOR`)

The module graph recognizes a limited flat set of export-member updates. Exact static mutations of
nested or descriptor-defined exported objects can therefore disappear, while deleted members can
remain as stale exact calls.

Independently reproduced exact miss:

```javascript
const { createClient } = require('@supabase/supabase-js');
const makeDatabase = () =>
  createClient('http://127.0.0.1:54321', 'synthetic-key');
const api = {};
module.exports = api;
Object.defineProperties(api, {
  makeDatabase: { value: makeDatabase },
});
```

Consumer:

```javascript
const api = require('./define-properties');
api.makeDatabase().from('contract_hours_ledger');
```

Runtime executes exactly once; the rejected analyzer returns `[]`. A retained nested object also
disappears:

```javascript
const api = { nested: {} };
module.exports = api;
api.nested.makeDatabase = makeDatabase;
```

Conversely, deleting an exported database factory is runtime-inert but the analyzer retains an
exact stale call. Static descriptor aliases and object-literal getters execute exactly but degrade
to generic unsupported. Statically fixed `Object.create` inheritance is likewise treated as
dynamic.

**Required:** replace flat copied member/provenance snapshots with one recursive shared heap/object
graph used by local bindings, nested properties, `exports`, `module.exports`, require/import
consumers, and re-export nodes. Preserve identity through nested paths, aliasing, replacement,
rebinding, `Object.assign`, `Object.defineProperty`, `Object.defineProperties`, descriptor aliases,
static data/accessor descriptors, object-literal static getters, direct/computed writes, and
deletion. Resolve statically known `Object.create` prototype inheritance and ordinary member lookup
without conflating own/inherited state.

Integrate this heap with CommonJS/ESM default, named, namespace, destructured, computed, whole-module,
one-/multi-hop, and circular interop through a bounded fixed point. Module replacement and retained
old aliases must follow JavaScript identity precisely. A static getter whose returned value is
analyzable must resolve exactly; dynamic getters, descriptors, keys, prototypes, or external modules
that may expose database authority must produce deterministic explicit unsupported. Deleted or
replaced inert members must stay silent. Avoid textual export-name or receiver allowlists.

**Acceptance:** checked-in fail-on-old fixtures require exact once for the supplied
`defineProperties` and nested retained-object examples, descriptor aliases, object-literal/static
getters, and fixed prototype inheritance; exact zero for deleted/replaced exports. Add multiple
descriptor entries/sources, nested aliases before/after module replacement, inherited versus own
shadow/delete behavior, downstream default/named/namespace/destructured/computed consumers,
one-/multi-hop and mixed CommonJS/ESM cycles, inert siblings, dynamic ambiguity, duplicate
suppression, and repeated-run termination. Production census remains unchanged.

## Retained controls and residual classifications

Retain every accepted R1–R17 control: intrinsic mutator adapters; mutable sequence aliases and
strong updates; retained CommonJS export aliases; coherent sequence mutation; static CommonJS and
namespace exports; finite constructors/assignments; cycle-safe provenance; full-semantic-state
recurrence; explicit ambiguity; the retired arbitrary-SQL RPC/endpoint; SQL analysis; ledger
grants/shapes; audited authority; canonical financial consumers; lifecycle/occurrence/batch
transitions; availability/reconciliation; exact decimals/pairs; and every prior mutation, inert,
false-positive, security, and nontermination fixture.

Do not expand this round into the inherited Madrid timezone defect, test-id/dependency advisories,
accepted bulk partial-write/balance-race, unmatched-suggestion, real-Zoom report/webhook divergence,
provider pagination, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative phase review request and `PROJECT_STATE.md` through Round 18, pending
independent review without claiming acceptance. Add exact mutable-transfer, integrity-wrapper, and
recursive-export-heap evidence; reconcile the cumulative path inventory; and record current counts
honestly.

Run focused Round 18 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/compiled price guard; fresh pinned local migration replay/full pgTAP;
legitimate ledger writers; both concurrency proofs; exact mandatory Chromium suite/manifest; every
new fail-on-old, strong/weak-update, integrity, recursive-property, false-positive, ambiguity, cycle,
and nontermination proof; and exact path/reader/writer/SQL/RPC inventories. Discard invalid
environment collections, record inherited deviations, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
