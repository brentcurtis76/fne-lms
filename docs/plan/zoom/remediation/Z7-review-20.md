# Z7 independent review — remediation round 20

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `7eaa2feb6e5e756b3d43657611768ddb8dfd9d5c`
- Rejected tree: `e83ae73648dcf433aed323130dffd17fade2fa91`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact detached SHA/tree/base/95 commits/clean start and end passed
- Cumulative inventory: 126 actual / 126 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The nineteenth cold Sol review reproduced the supplied Round 19 fixtures and found five adjacent
MAJOR defects across the claimed descriptor/prototype and completion abstractions. Its conclusive
report did not independently rerun the full product/database/browser matrix after the literal
runtime mismatches were established; builder evidence remains recorded but is not substituted for
independent evidence. Resolve all findings cumulatively, then require a fresh full cold review.

## Z7-R20.1 — `Reflect.get` and `Reflect.set` ignore the explicit receiver (`MAJOR`)

Receiver-aware accessors are modeled for some ordinary property paths, but Reflect's receiver
argument is absent or ignored.

Independently reproduced setter probe:

```javascript
const proto = {};
Object.defineProperty(proto, 'x', {
  set(value) {
    this.fn = value;
  },
});
const receiver = {};
Reflect.set(proto, 'x', client.from, receiver);
receiver.fn('contract_hours_ledger');
```

Runtime executes exactly once with no throw; the rejected analyzer returns zero exact calls and
zero unsupported results.

Getter probe:

```javascript
const proto = {
  get x() {
    return this.fn;
  },
};
const receiver = { fn: client.from };
Reflect.get(proto, 'x', receiver)('contract_hours_ledger');
```

Runtime executes exactly once; the analyzer again returns zero/zero.

**Required:** implement ordinary descriptor-aware `[[Get]]` and `[[Set]]` as shared heap operations
that take both target and receiver. Reflect and ordinary property access/assignment must call those
same operations. Preserve inherited getter/setter lookup, accessor `this`, receiver-owned
descriptor checks/creation, target-versus-receiver identity, boolean Reflect results, strict
ordinary-assignment throws, prototypes, aliases, and cycles. Dynamic proxy/receiver/key/accessor
authority remains one deterministic explicit unsupported result.

**Acceptance:** both literal probes fail on the rejected SHA and resolve exactly once afterward.
Add own/inherited data and accessor descriptors; same versus distinct receiver; receiver
nonwritable/accessor/integrity constraints; setter mutations and getter returns through aliases;
Reflect boolean failures; ordinary versus Reflect semantics; multi-hop prototypes; branch joins;
dynamic proxies; exact multiplicity; duplicate suppression; and termination.

## Z7-R20.2 — `Object.defineProperties` mutates before descriptor conversion completes (`MAJOR`)

JavaScript first obtains and converts every descriptor. A conversion error prevents all target
definitions. The analyzer instead applies earlier entries before rejecting a later invalid
descriptor:

```javascript
const noop = () => {};
const target = { a: noop };
try {
  Object.defineProperties(target, {
    a: { value: client.from },
    bad: { get() {}, value: 0 },
  });
} catch {}
target.a('contract_hours_ledger');
```

Runtime performs zero ledger calls because the invalid `bad` descriptor prevents every definition.
The rejected analyzer reports one stale exact call. Conversely, after all descriptors convert,
an application-time invariant failure can leave earlier ordered definitions applied.

**Required:** split `Object.defineProperties` into two phases. First enumerate own enumerable keys
and obtain/convert/validate all property descriptors in JavaScript order without mutating the
target, including getter effects and abrupt completion. Only after successful conversion apply the
converted descriptors in order through the shared `DefineOwnProperty`; an application-time failure
must retain deterministic earlier effects and produce the correct completion.

**Acceptance:** add runtime-oracle fail-on-old controls for the supplied conversion-atomicity case
and a valid-conversion/later-nonconfigurable application-failure case. Cover computed/order keys,
enumerability, descriptor getters and throws, aliases, multiple entries, target integrity,
data/accessor redefinition, caught/uncaught completion, partial effects, dynamic ambiguity,
duplicates, and cycles.

## Z7-R20.3 — static descriptor and prototype inspection bypasses the shared heap (`MAJOR`)

Fully static descriptor/prototype operations degrade to unsupported or silence:

```javascript
const object = Object.create(null, {
  fn: { value: client.from },
});
object.fn('contract_hours_ledger');
```

Runtime executes once; analyzer returns zero exact calls plus one unsupported result.

```javascript
const object = { fn: client.from };
Object.getOwnPropertyDescriptor(object, 'fn')
  .value('contract_hours_ledger');
```

Runtime executes once; analyzer returns zero exact plus one unsupported. Statically fixed
`Object.getPrototypeOf` lookup has the same class of failure.

**Required:** route the descriptor argument of `Object.create`,
`Object.getOwnPropertyDescriptor`, `Object.getOwnPropertyDescriptors`,
`Object.getPrototypeOf`, and Reflect equivalents through the same descriptor/prototype heap.
Returned descriptor objects must expose exact data/accessor fields and flags without aliasing the
original internal descriptor record. Preserve null/fixed prototypes, own versus inherited lookup,
enumerability/order, accessor functions, aliases, mutation of the returned descriptor object,
and cycles. Static results resolve exactly; dynamic/proxy cases fail closed once.

**Acceptance:** both supplied examples fail on the rejected SHA and resolve exactly once after the
fix. Add create with multiple descriptors/defaults/accessors; getOwnPropertyDescriptor(s) flags,
missing keys, computed keys, descriptor-object mutation, getPrototypeOf/Reflect.getPrototypeOf,
null and multi-hop prototypes, inherited versus own values, dynamic/proxy controls, multiplicity,
and termination.

## Z7-R20.4 — array mutators discard indexed and `length` descriptors (`MAJOR`)

The sequence simulator transfers values through a native temporary array but does not preserve
individual indexed or `length` descriptors. It therefore invents calls after deterministic partial
mutation failures:

```javascript
const noop = () => {};
const values = [noop, client.from];
Object.defineProperty(values, '0', { writable: false });
try {
  values.reverse();
} catch {}
values[0]('contract_hours_ledger');
```

Runtime performs zero calls; the rejected analyzer reports one exact call. A nonwritable `length`
followed by caught `push(client.from)` produces the same zero-versus-one divergence.

**Required:** implement all nine array mutators directly over descriptor-aware indexed properties
and the `length` descriptor using JavaScript ordered `[[Get]]`, `[[Set]]`, `[[Delete]]`, and
`SetLength` operations. Do not flatten into a value-only native array. Retain deterministic writes
or deletes completed before the first failure, then propagate the correct normal/throw completion.
Honor writable/configurable/accessor/inherited indexed descriptors, holes, length truncation and
extension, integrity state, strict behavior, caught/uncaught flow, aliases, and comparator/accessor
effects.

**Acceptance:** supplied nonwritable-index reverse and nonwritable-length push fail on the rejected
SHA and become exact-zero. Add every mutator (`push`, `pop`, `shift`, `unshift`, `splice`, `reverse`,
`fill`, `copyWithin`, `sort`) across nonwritable/nonconfigurable/accessor indices, nonwritable
length, holes/sparse arrays, freeze/seal/preventExtensions, deterministic partial failure,
caught/uncaught paths, static and unknown comparators/accessors, return values, aliases, and cycles.
Live runtime calls resolve at exact multiplicity; inert/unreachable zero; uncertainty once.

## Z7-R20.5 — completion propagation misses `switch` and call-driven module throws (`MAJOR`)

The completion model does not select switch cases accurately:

```javascript
switch (1) {
  case 0:
    client.from('contract_hours_ledger');
    break;
  case 1:
    break;
}
```

Runtime performs zero calls; the analyzer reports one stale exact call.

A CommonJS module whose exported callable is replaced only after an ordinary top-level function
call throws likewise produces runtime zero versus analyzer one. Module abrupt handling recognizes
a direct syntactic throw but continues after a statically proven throwing call.

**Required:** use the existing completion domain uniformly for switch discriminant/case selection,
fallthrough and labeled/unlabeled breaks; ordinary call results; callbacks; loops; functions; and
module evaluation. A statically proven abrupt call must stop the current normal path exactly like a
direct throw. Propagate finite normal/throw/return/break/continue unions through call boundaries,
try/catch/finally, switch, loops, and circular module evaluation without converting uncertainty
into silence or stale reachable state.

**Acceptance:** supplied switch and call-driven module-throw fixtures fail on the rejected SHA and
become exact-zero. Add static/dynamic switch discriminants, matching/default/no-match,
fallthrough, lexical declarations, labeled breaks/continues, nested loops/switches, throwing and
mixed-completion calls, finally overrides, callback throws, module partial exports/require cache,
catching consumers, multi-hop/circular mixed CJS/ESM graphs, duplicate suppression, and bounded
termination.

## Retained controls and residual classifications

Retain every accepted R1–R19 control: shared descriptors/prototypes; Reflect/define APIs;
normal/abrupt completion; all nine mutators and integrity semantics; recursive module heaps;
intrinsic adapters; aliases and strong/weak updates; cycle-safe provenance; explicit ambiguity;
the retired arbitrary-SQL RPC/endpoint; SQL analysis; ledger grants/shapes; audited authority;
canonical financial consumers; lifecycle/occurrence/batch transitions;
availability/reconciliation; exact decimals/pairs; and every prior mutation, inert, false-positive,
runtime-oracle, cycle, and nontermination fixture.

Do not expand into inherited Madrid timezone, test-id/dependency/build advisories, accepted bulk
partial-write/balance-race, unmatched-suggestion, real-Zoom report/webhook divergence, provider
pagination, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the phase review request and `PROJECT_STATE.md` through Round 20, pending independent review
without claiming acceptance. Record literal Reflect/defineProperties/inspection/index-descriptor/
completion evidence, exact inventory, and honest counts.

Run focused Round 20 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/compiled price guard; fresh pinned local migration replay/full pgTAP;
legitimate ledger writers; both real races; exact mandatory Chromium suite/manifest; every new
runtime-oracle, fail-on-old, rollback, receiver, descriptor-conversion, inspection, partial-effect,
mutator, completion, false-positive, ambiguity, cycle, and nontermination proof; and exact
path/reader/writer/SQL/RPC inventories. A fresh independent reviewer must rerun the full matrix;
discard invalid collections and remove all temporary state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the rejected head.
