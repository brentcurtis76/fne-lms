# Z7 independent review — remediation round 21

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `85b38f61df0a54c0feaf043a6bbc94ffa0c68b1b`
- Rejected tree: `1989d9a1d219b650ea8887814cced32ad977724a`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact SHA/tree/base/98 commits/clean start and end passed
- Cumulative inventory: 127 actual / 127 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The twentieth cold Sol review independently passed every supplied Round 20 fixture, all cumulative
application/database/RLS/concurrency/browser gates, and the exact inventory. Twelve adjacent
runtime-oracle cases exposed ten mismatches across five MAJOR categories. Resolve all five
cumulatively without weakening R1–R20 controls.

## Z7-R21.1 — function and CommonJS reachability are not call-driven (`MAJOR`)

A dormant declaration is analyzed as executed:

```javascript
function dormant() {
  client.from('contract_hours_ledger');
}
```

Runtime performs zero calls; the rejected analyzer reports one exact call.

Conversely, a syntactic throw in an unselected branch inside a called CommonJS helper marks module
evaluation unconditionally abrupt:

```javascript
const { createClient } = require('@supabase/supabase-js');
const makeDatabase = () =>
  createClient('http://127.0.0.1:54321', 'synthetic-key');
function maybeStop(stop) {
  if (stop) throw new Error('synthetic');
}
maybeStop(false);
module.exports = { makeDatabase };
```

A consumer executes one ledger read at runtime; the analyzer returns zero exact and zero
unsupported results.

**Required:** register function/class declarations and expressions lazily. Analyze bodies only at
reachable call/construct sites, with argument/default/rest/destructuring, receiver, closure, and
completion state. Function summaries must be input/control-flow-sensitive enough to distinguish a
fixed false branch from a throwing true branch, while finite unknown inputs preserve both
completions or explicit uncertainty. Module evaluation must retain exports before actual abrupt
completion and use correct CommonJS caching/partial-cycle state.

**Acceptance:** supplied dormant case is exact zero and conditional module case exact one, both
failing on the rejected SHA. Add called versus uncalled/nested/returned/callback functions;
recursive and mutually recursive calls; argument/default/rest branches; closures/`this`;
normal/throw/return unions; constructors; module calls before/after export mutation; cache and
circular partial exports; dynamic-callable uncertainty; exact multiplicity; and termination.

## Z7-R21.2 — switch clauses do not share one CaseBlock lexical environment (`MAJOR`)

```javascript
switch (0) {
  case 0:
    const read = client.from;
  case 1:
    read('contract_hours_ledger');
    break;
}
```

Runtime executes once through fallthrough. The analyzer loses `read` between per-clause scopes and
returns zero exact plus one unsupported.

**Required:** create one CaseBlock lexical environment and TDZ state for the entire switch. Evaluate
the discriminant and case expressions in JavaScript order, select the first matching/default path,
then execute clauses sequentially with shared bindings, fallthrough, normal/throw/return, and
labeled/unlabeled break/continue completion. Branch joins for unknown discriminants must retain
finite reachable bindings/completions without treating unselected clauses as executed.

**Acceptance:** supplied fallthrough binding resolves exactly once and fails on the rejected SHA.
Add match/default/no-match; default before/after matching case; fallthrough chains; `let`/`const`/
function TDZ/hoisting; case-expression effects/throws; duplicate values; dynamic discriminants;
nested switches/loops; labels; finally overrides; dead clauses; ambiguity; and cycles.

## Z7-R21.3 — remaining Reflect operations and setter completion bypass shared internals (`MAJOR`)

Independently reproduced:

```javascript
const object = { fn: client.from };
if (!Reflect.has(object, 'fn')) {
  client.from('contract_hours_ledger');
}
```

Runtime zero; analyzer one stale exact call.

```javascript
function Factory() {
  return { read: client.from };
}
Reflect.construct(Factory, []).read('contract_hours_ledger');
```

Runtime one; analyzer zero exact plus one unsupported.

```javascript
const proto = {};
Object.defineProperty(proto, 'slot', {
  set() { throw new Error('setter'); },
});
const receiver = Object.create(proto);
try {
  Reflect.set(proto, 'slot', client.from, receiver);
} catch {
  client.from('contract_hours_ledger');
}
```

Runtime one; analyzer zero/zero because the throwing setter becomes boolean failure.

**Required:** route `Reflect.get`, `set`, `has`, `defineProperty`, `deleteProperty`, `ownKeys`,
`apply`, `construct`, `getPrototypeOf`, and `setPrototypeOf` through the same descriptor/prototype/
completion internal operations. Preserve target/receiver/newTarget identity, inherited accessors,
boolean false versus abrupt throw, constructor return semantics, prototype creation, arguments,
callback completion, symbol keys, proxies/dynamic ambiguity, and cycles.

**Acceptance:** supplied cases fail on old and become respectively exact zero, exact one, exact one.
Add every named Reflect operation with own/inherited/string/symbol keys, same/distinct receiver,
getter/setter throw, callable/noncallable apply/construct, custom newTarget/prototype, false versus
throw, partial effects, dynamic proxies, duplicate suppression, and termination.

## Z7-R21.4 — array mutators omit inherited indices and executable sort comparators (`MAJOR`)

Prototype-inherited index:

```javascript
const values = [];
const pop = values.pop;
values.length = 1;
const inherited = Object.create(Array.prototype, {
  0: { value: client.from, configurable: true },
});
Object.setPrototypeOf(values, inherited);
const read = pop.call(values);
read('contract_hours_ledger');
```

Runtime one; analyzer zero/zero.

Resolvable comparator:

```javascript
const values = [client.from, () => null];
values.sort(() => 0);
values[0]('contract_hours_ledger');
```

Runtime one; analyzer reports the exact call plus two spurious unsupported results.

**Required:** implement all nine mutators with shared prototype-aware `HasProperty`, `Get`, `Set`,
`Delete`, and length operations, including inherited indexed data/accessor descriptors. Execute
statically resolvable sort comparators through call-driven function evaluation and propagate
comparator/getter/setter completion, ordered partial effects, stability/returns, integrity and
indexed/length descriptor failures. Genuine comparator/order ambiguity yields one deterministic
unsupported result, not duplicates or stale properties.

**Acceptance:** both supplied probes fail on rejected and become exact one with zero unsupported.
Add own/inherited/accessor/symbol-adjacent indices, holes/sparse arrays, prototype shadow/delete,
all nine mutators, static comparators returning negative/zero/positive or throwing/mutating,
unknown comparators, descriptor/integrity partial failures, aliases, returns, duplicate values,
cycles, exact multiplicity, and termination.

## Z7-R21.5 — property-key domain discards symbol identity (`MAJOR`)

```javascript
const key = Symbol('fn');
const object = Object.create(null, {
  [key]: { value: client.from, enumerable: true },
});
object[key]('contract_hours_ledger');
```

Runtime one; analyzer returns zero exact plus two unsupported results.

**Required:** represent property keys as abstract string-or-symbol identities after `ToPropertyKey`.
Preserve symbol identity through variables, global/well-known symbols when static, computed access,
descriptors, prototypes, Reflect, `Object.create`, `defineProperties`, inspection, own-key ordering,
enumerability, spread/assign, destructuring, and module exports. Distinct same-description symbols
must remain distinct. Dynamic symbols that may carry executable authority fail closed exactly once.

**Acceptance:** supplied symbol descriptor resolves exactly once and fails on rejected. Add unique
symbols with equal descriptions, symbol aliases, `Symbol.for`/`keyFor`, well-known symbols where
relevant, computed read/write/delete, getters/setters, ownKeys/getOwnPropertySymbols,
assign/spread/enumerability/order, destructuring, CJS/ESM consumers, dynamic ambiguity, cycles,
duplicate suppression, and termination.

## Retained controls and residual classifications

Retain every accepted R1–R20 control: receiver-aware Reflect get/set; descriptor prevalidation and
partial application; descriptor/prototype inspection; indexed/length descriptor mutators; switch
and call-driven abrupt completion; shared descriptor/prototype/completion heaps; recursive modules;
intrinsic adapters; aliases; explicit ambiguity; the retired arbitrary-SQL RPC/endpoint; SQL
analysis; ledger grants/shapes; audited authority; canonical financial consumers;
lifecycle/occurrence/batch transitions; availability/reconciliation; exact decimals/pairs; and all
prior runtime-oracle, mutation, inert, false-positive, cycle, and nontermination fixtures.

Do not expand into inherited Madrid timezone, test-id/dependency/build advisories, accepted bulk
partial-write/balance-race, unmatched-suggestion, real-Zoom report/webhook divergence, provider
pagination, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update phase review request and `PROJECT_STATE.md` through Round 21 pending independent review.
Record literal call-reachability/switch/Reflect/inherited-index/comparator/symbol evidence and exact
counts.

Run focused R21 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/compiled price guard; fresh pinned replay/full pgTAP/writers; both
races; exact Chromium/manifest; every new runtime-oracle, fail-on-old, rollback, call-driven,
switch-scope, Reflect, prototype-index, comparator, symbol, ambiguity, cycle, duplicate, and
nontermination proof; and exact path/reader/writer/SQL/RPC inventories. Fresh independent reviewer
must rerun full matrix; discard invalid collections and clean all temporary state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the rejected head.
