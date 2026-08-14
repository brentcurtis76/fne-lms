# Z7 independent review — remediation round 19

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `e2fc5864f986372ed12d0e965bd01f61bfbe3751`
- Rejected tree: `7607d00c2c6158489b20ca5c5a975e960abd8e1a`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact detached SHA/tree/base/92 commits/clean start and end passed
- Cumulative inventory: 125 actual / 125 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The eighteenth independent Sol review passed every supplied Round 18 fixture, cumulative R1–R17
product/database boundary, full application/database/RLS/concurrency/browser gate, and exact
inventory. It found three adjacent MAJOR failures that share two missing abstractions: per-property
descriptor/prototype semantics and normal-versus-abrupt control-flow completion. Implement those
systemically across ordinary and exported objects without weakening R1–R18 controls.

## Z7-R19.1 — property descriptors, accessors, Reflect, and prototypes are not represented (`MAJOR`)

The heap retains property values and object-wide integrity but discards per-property descriptors,
accessor cells, prototype links, and receiver-aware getter/setter behavior. Deterministic ordinary
object/sequence operations therefore produce both silent false negatives and stale false positives.

Independent runtime/analyzer results on the rejected SHA:

```text
defineProperty default writable:
  runtime_calls=1 throw=none
  analyzer exact=0 unsupported=0

defineProperty default configurable:
  runtime_calls=1 throw=none
  analyzer exact=0 unsupported=0

Reflect.deleteProperty:
  runtime_calls=0 throw=none
  analyzer exact=1 unsupported=0

Reflect.defineProperty:
  runtime_calls=0 throw=none
  analyzer exact=1 unsupported=0

Object.defineProperties:
  runtime_calls=1 throw=none
  analyzer exact=0 unsupported=0

setter mutates through this:
  runtime_calls=1 throw=none
  analyzer exact=0 unsupported=0

Object.setPrototypeOf:
  runtime_calls=1 throw=none
  analyzer exact=0 unsupported=1
```

These are fixed static sources, not unresolved dynamic execution.

**Required:** represent each own property as a data or accessor descriptor with value/get/set plus
`writable`, `configurable`, and `enumerable`, including JavaScript defaults for object literals,
assignment-created properties, `defineProperty`, and `defineProperties`. Retain an explicit
prototype link and implement ordinary own/inherited lookup, shadowing, assignment, deletion, and
receiver-aware getter/setter calls. Invoke accessors with the actual receiver (`this`), including
inherited accessors and setters that mutate another property through `this`.

Implement the same descriptor transfer for `Object.defineProperty`, `Object.defineProperties`,
`Reflect.defineProperty`, `Reflect.set`, `Reflect.deleteProperty`, `Object.setPrototypeOf`, and
statically exact equivalents. Respect each API's boolean-versus-throw result and descriptor
validation. `Object.assign` and object spread must copy only enumerable own source properties and
must perform target writes through ordinary setter semantics. Known inherited/static calls resolve
exactly; dynamic receivers, keys, descriptors, prototypes, proxies, or accessors capable of ledger
authority remain deterministic explicit unsupported rather than silence.

Compose with aliases, may-alias joins, computed keys, arrays/holes/length, integrity state,
closures, parameters/returns, destructuring, branches, nested/cyclic objects, and repeated runs.
Use a shared descriptor/prototype heap, not parallel special-case property maps.

**Acceptance:** add runtime-oracle fail-on-old fixtures for every supplied result and matrices for
descriptor defaults/explicit flags, data-to-accessor/accessor-to-data redefinition, getter/setter
`this`, inherited getter/setter and own shadow/delete, Reflect boolean results, defineProperties
partial validation behavior, setPrototypeOf, Object.assign/spread enumerability, static versus
dynamic descriptors/prototypes, aliases/branches, and cycles. Runtime-exact live calls resolve with
the exact multiplicity; inert cases return zero without unsupported; unresolved executable cases
emit one deterministic unsupported result; never zero/zero, stale, duplicate, or nontermination.
Production census remains unchanged.

## Z7-R19.2 — integrity failures ignore abrupt completion and omit `sort` (`MAJOR`)

The analyzer catches native mutation exceptions internally and continues through code that is
unreachable at runtime. Strict uncaught failures therefore leave stale calls after the throwing
statement:

```text
frozen assignment:
  runtime_calls=0 throw=TypeError
  analyzer exact=1 unsupported=0

sealed delete:
  runtime_calls=0 throw=TypeError
  analyzer exact=1 unsupported=0

frozen reverse:
  runtime_calls=0 throw=TypeError
  analyzer exact=1 unsupported=0
```

The committed integrity/mutator matrix also excludes `sort`. A caught frozen sort preserves the
original sequence and then executes one ledger call at runtime, while the rejected analyzer loses
the call and emits two unsupported results:

```text
frozen sort:
  runtime_calls=1 caught=TypeError
  analyzer exact=0 unsupported=2
```

**Required:** add an explicit completion domain to statement/expression evaluation: at minimum
normal, throw, return, break, and continue, with finite unions where branches differ. Propagate
abrupt completion through blocks, functions, conditionals, loops, calls, and module evaluation.
Implement `try`/`catch`/`finally` according to JavaScript ordering: catch receives thrown paths;
finally runs for every completion and may replace the prior completion. Code following an uncaught
throw is unreachable and may not contribute calls or stale state.

Integrity-aware writes/mutations must return their real normal/throw behavior under strict and
non-strict execution, respecting the source/module strictness in use. Complete the integrity matrix
for all nine mutators: `push`, `pop`, `shift`, `unshift`, `splice`, `reverse`, `fill`, `copyWithin`,
and `sort`, plus direct/computed writes, delete, length changes, descriptor APIs, and Reflect APIs.
Model deterministic partial effects before a throw where JavaScript produces them; caught failures
continue from the correct post-failure heap. Unknown comparator/accessor effects that may carry
ledger authority fail closed explicitly and without duplicate unsupported evidence.

**Acceptance:** checked-in runtime-oracle fixtures fail on the rejected evaluator for each supplied
uncaught/caught case. Add strict and non-strict matrices for every named mutation/write and every
integrity level (`freeze`, `seal`, `preventExtensions`); normal/caught/uncaught paths;
try/catch/finally overrides; nested calls/returns/loops; sort with inert/static/unknown comparators;
partial effects; aliases/branches; duplicate suppression; and cycles. Exact runtime calls occur once,
inert/unreachable calls occur zero, and genuine uncertainty is one deterministic unsupported result.

## Z7-R19.3 — CommonJS exports use a recursive value heap but discard descriptors/prototypes (`MAJOR`)

The recursive export graph still flattens property provenance and therefore repeats the ordinary
heap failures at module boundaries:

```text
descriptor default nonwritable:
  runtime_factory_calls=1
  analyzer exact=0 unsupported=0

descriptor default nonconfigurable:
  runtime_factory_calls=1
  analyzer exact=0 unsupported=0

nonenumerable property copied with Object.assign:
  runtime_factory_calls=0 throw=TypeError
  analyzer exact=1 unsupported=0

getter using this:
  runtime_factory_calls=1
  analyzer exact=0 unsupported=0

Object.setPrototypeOf inherited factory:
  runtime_factory_calls=1
  analyzer exact=0 unsupported=0
```

**Required:** use the exact same shared descriptor/prototype heap and completion domain for ordinary
objects, local module bindings, `exports`, `module.exports`, require/import consumers, and re-export
nodes. Preserve per-property flags, accessor receiver semantics, own enumerability, prototype lookup,
shadow/delete/redefine, aliases, module replacement, and abrupt module evaluation. Do not translate
exports into a lossy member/provenance snapshot.

Integrate this state through CommonJS/ESM default, named, namespace, destructured, computed,
whole-module, one-/multi-hop, and circular interop with a bounded fixed point. A module that throws
during evaluation may not expose post-throw mutations as if evaluation completed. Proven static
factories resolve exactly; deleted, noncopied, replaced, or unreachable exports remain silent;
dynamic descriptor/prototype/accessor/external-module authority emits deterministic explicit
unsupported. Avoid textual export-name/receiver allowlists.

**Acceptance:** add fail-on-old runtime-oracle fixtures for all supplied cases and downstream
direct/default/named/namespace/destructured/computed consumers; descriptor mutation/defaults;
enumerable versus nonenumerable assign/spread; receiver-aware getters/setters; prototype
inherit/shadow/delete; retained aliases before/after module replacement; abrupt evaluation with
catching consumers; multi-hop/mixed cycles; inert siblings; ambiguity; exact multiplicity;
duplicate suppression; and termination. Production census remains unchanged.

## Retained controls and residual classifications

Retain every accepted R1–R18 control: ordinary mutable transfers; integrity identity; recursive
CommonJS heaps; intrinsic mutator adapters; mutable aliases and strong updates; static module
provenance; finite constructors; full-semantic-state recurrence; explicit ambiguity; the retired
arbitrary-SQL RPC/endpoint; SQL analysis; ledger grants/shapes; audited authority; canonical
financial consumers; lifecycle/occurrence/batch transitions; availability/reconciliation; exact
decimals/pairs; and every prior mutation, inert, false-positive, security, cycle, and nontermination
fixture.

Do not expand into the inherited Madrid timezone defect, test-id/dependency/build advisories,
accepted bulk partial-write/balance-race, unmatched-suggestion, real-Zoom report/webhook divergence,
provider pagination, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative phase review request and `PROJECT_STATE.md` through Round 19, pending
independent review without claiming acceptance. Add exact descriptor/prototype, completion,
integrity/sort, and exported-object evidence; reconcile the path inventory; and record counts
honestly.

Run focused Round 19 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/compiled price guard; fresh pinned local migration replay/full pgTAP;
legitimate ledger writers; both real concurrency proofs; exact mandatory Chromium suite/manifest;
every new runtime-oracle, fail-on-old, rollback, descriptor, accessor, prototype, completion,
integrity, sort, false-positive, ambiguity, cycle, and nontermination proof; and exact
path/reader/writer/SQL/RPC inventories. Discard invalid environment collections, record inherited
deviations, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
