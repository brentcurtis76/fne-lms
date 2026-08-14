# Z7 independent review — remediation round 17

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `766c2bcf3408a4cce4de27f6fab0d441064fc5c7`
- Rejected tree: `be9459b2f918149b3d244b774fe830d074719e3d`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact detached SHA/tree/base/85 commits/clean start and end passed
- Cumulative inventory: 123 actual / 123 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The sixteenth cold review independently passed all supplied Round 16 fixtures, cumulative R1–R15
boundaries, complete application/database/RLS/concurrency/browser gates, and exact inventories. It
found three remaining adjacent soundness defects in the executable TypeScript reader inventory.
Resolve all three cumulatively without weakening R1–R16 controls.

## Z7-R17.1 — generic array-mutation adapters silently lose ledger provenance (`MAJOR`)

The sequence transfer logic recognizes mutations selected from a concrete sequence, but the
modeled `Array` intrinsic exposes only `of` and `from`. Standard generic invocation paths therefore
execute a mutation at runtime while discovery returns zero calls and zero unsupported authority.

Both independently reproduced forms below insert a database callable into the live sequence and
then execute exactly one ledger read, but the rejected inventory returns `[]`:

```typescript
Array.prototype.unshift.call(slots, client.from, client, 'contract_hours_ledger');
slots[0].call(slots[1], slots[2]);
```

```typescript
Reflect.apply(Array.prototype.unshift, slots, [
  client.from,
  client,
  'contract_hours_ledger',
]);
slots[0].call(slots[1], slots[2]);
```

**Required:** model intrinsic mutable-sequence method identity and propagate the supplied receiver
through `call`, `apply`, `bind`, and `Reflect.apply`. Compose this with the existing coherent
transfers for `push`, `pop`, `shift`, `unshift`, `splice`, `reverse`, `fill`, and `copyWithin`,
including computed/destructured/aliased intrinsic methods and their JavaScript return values.
Unknown intrinsic selection, receiver identity, or arguments that may carry or position a
database-capable value must emit deterministic explicit unsupported evidence, never silence.

Do not special-case `unshift` or the two probes. Preserve exact bounds/negative-index semantics,
holes, duplicate suppression, deterministic termination, and bounded cycles across both direct
sequence methods and generic adapters.

**Acceptance:** add fail-on-old tests for both supplied probes, then a matrix covering every named
mutator through `Array.prototype.<method>.call`, `.apply`, bound methods, `Reflect.apply`, constant
computed/destructured aliases, mixed adapter chains, inert receivers/arguments, and unresolved
targets. Statically known live cases recover exactly once; inert cases stay silent; genuinely
unknown executable cases reject explicitly. Production census remains unchanged.

## Z7-R17.2 — sequence aliases and definite writes are unsound in both directions (`MAJOR`)

The current abstract assignment and numeric/property writes union old and new facts. This loses
shared mutable identity through branch aliases and retains stale callable provenance after a
definite overwrite.

Independently reproduced failures:

- A conditional choice between aliases of the same array followed by `alias.reverse()` performs
  one ledger read from the live runtime positions, while discovery returns zero calls and zero
  unsupported authority.
- A definite overwrite is a false positive:

```typescript
const slots = [client.from, client, 'contract_hours_ledger'];
slots[0] = () => null;
slots[0].call(slots[1], slots[2]);
```

The runtime is inert, but the rejected inventory reports an exact ledger call from the stale prior
value.

**Required:** represent mutable sequence/heap identity independently from variable bindings. Track
must-alias and may-alias references through assignments, conditionals, parameters, returns,
closures, destructuring, defaults, computed access, and adapter calls. Apply strong updates for
definite numeric/property writes on a known target; use conservative weak updates only when target
or position is genuinely ambiguous. Mutations through any must-alias must update every view of the
same sequence. May-alias mutation must retain all executable possibilities or emit explicit
uncertainty, but may not invent a proven call from a definitely overwritten value.

Compose identity and update semantics with all prior sequence constructors, assignments,
mutators, returns, chaining, bounds, holes, and stale-fact invalidation. Keep unknown state
authoritative over stale positional facts and retain bounded fixed-point/cycle behavior.

**Acceptance:** checked-in fail-on-old controls assert exact-one for the conditional same-array
alias probe and exact-zero for the definitely overwritten inert probe. Add strong/weak update
matrices for direct/computed/destructured writes, multiple aliases, branch aliases to same versus
different arrays, closures/parameters/returns, repeated/mixed mutations, self/cyclic values,
unknown indices/targets, and inert false-positive controls. Recoverable calls are exact once;
uncertain executable paths are explicit; definite inert overwrites remain silent. Production
census remains unchanged.

## Z7-R17.3 — retained CommonJS export-object aliases are snapshot instead of identity (`MAJOR`)

The module graph copies local/export member maps and recognizes direct `exports` or
`module.exports` targets. A statically known object assigned as the exported object and then
mutated through its retained alias is not reflected in the exported namespace.

Each independently reproduced CommonJS module below performs exactly one ledger read through a
consumer, but discovery returns `[]`:

```javascript
const api = {};
module.exports = api;
api.makeDatabase = makeDatabase;
```

```javascript
const api = {};
module.exports = api;
Object.assign(api, { makeDatabase });
```

```javascript
const api = {};
exports = module.exports = api;
api.makeDatabase = makeDatabase;
```

Static `Object.defineProperty` value/getter exports, `module.exports = Object.assign(...)`, and
`__esModule` default interop also degrade to unsupported even when exactly recoverable.

**Required:** model CommonJS exported objects by shared heap identity across local aliases,
`exports`, `module.exports`, assignment chains, and later rebinding. Static direct/computed member
writes, `Object.assign`, and `Object.defineProperty` value or statically analyzable getter
definitions must update that shared object. Preserve JavaScript semantics when bare `exports`
rebinds or `module.exports` is replaced: retained aliases mutate only the object they still
reference, and consumers observe the current `module.exports` object. Resolve static `__esModule`
default/named/namespace interop, whole-module forwarding, and downstream computed/destructured
consumers through the existing cycle-safe ESM/CommonJS graph.

Truly dynamic keys, getters, descriptors, assignments, or external modules that may expose a
ledger-capable factory must remain deterministic explicit unsupported. Proven inert old-export
aliases after replacement must not taint the new namespace. Do not add textual export-name or
receiver allowlists.

**Acceptance:** all three supplied alias-mutation forms recover exactly one call. Add static
direct/computed writes, `Object.assign` through aliases and as the assigned export value,
`defineProperty` data/getter descriptors, `__esModule` default/named/namespace consumers,
retained-old-alias versus current-export replacement, chained versus bare `exports` rebinding,
one-/multi-hop/circular mixed ESM/CommonJS graphs, inert siblings, dynamic ambiguity, duplicate
suppression, and repeated-run termination. Checked-in fixtures fail on the rejected SHA and the
production census remains unchanged.

## Retained controls and residual classifications

Retain every accepted R1–R16 control: coherent sequence mutations; static CommonJS and namespace
exports; finite constructors and numeric assignments; cycle-safe module provenance;
full-semantic-state adapter recurrence; explicit ambiguity; the retired arbitrary-SQL
RPC/endpoint; SQL analysis; ledger grants/shapes; audited authority; canonical financial
consumers; lifecycle/occurrence/batch transitions; availability/reconciliation; exact
decimals/pairs; and every prior mutation, inert, false-positive, security, and nontermination
fixture.

Do not expand this round into accepted Madrid timezone, bulk partial-write/balance-race,
unmatched-suggestion, real-Zoom report/webhook divergence/provider pagination, or
production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 17, pending independent
review without claiming acceptance. Add exact intrinsic-mutation, sequence-identity/strong-update,
and CommonJS-export-identity evidence; reconcile the cumulative path inventory; and record current
counts honestly.

Run focused Round 17 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/price guard; fresh pinned local replay/full pgTAP; legitimate ledger
writers; both concurrency proofs; exact mandatory Chromium suite/manifest; every new fail-on-old,
uncertainty, aliasing, strong/weak-update, false-positive, cycle, and nontermination proof; and exact
path/reader/writer/SQL/RPC inventories. Discard invalid environment collections, record inherited
deviations, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
