# Z7 independent review — remediation round 16

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `306dc1b946784dbbf0a5f77d16e423a4c790e272`
- Rejected tree: `b87082d78dae151d18090fd38089cdef6d5b08f0`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/82 commits/clean relevant worktrees passed
- Cumulative inventory: 122 actual / 122 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The fifteenth cold review independently passed all supplied Round 15 fixtures, cumulative R1–R14
boundaries, full gates, inventories, and bounded sequence/module cycles. It found two remaining
adjacent transfer/recovery defects in the executable TypeScript reader inventory. Resolve both
cumulatively without weakening R1–R15 controls.

## Z7-R16.1 — sequence mutations retain stale positions that defeat fail-closed state (`MAJOR`)

The current mutation handlers mark a sequence external but retain its positional `properties` and
`tupleElements`. Numeric property selection then returns those stale values before considering the
uncertainty. Runtime-valid mutations can therefore move `client.from` into an executed position
while the inventory returns zero ledger calls and zero unsupported results.

Independently reproduced silent forms include:

- `unshift(client.from, client, 'contract_hours_ledger')`, then invoking indices `0/1/2`;
- reversing `['contract_hours_ledger', client, client.from]`, then invoking `0/1/2`;
- filling index `0` with `client.from` in an otherwise callable tuple;
- `copyWithin` moving `client.from` into the invoked position; and
- `splice(-3, 3, client.from, client, table)` using JavaScript negative-index normalization.

Controls for `push` and nested numeric assignment recover exactly one call. Unknown
`Array.from(new Set(...))` fails closed. There is no matching production caller at the rejected
SHA, but the trust-boundary census can be bypassed silently.

**Required:** give every statically finite sequence mutation coherent transfer semantics across
both positional elements and numeric properties. At minimum cover `push`, `pop`, `shift`,
`unshift`, `splice` (positive/negative/omitted/extreme indices and insertion/deletion), `reverse`,
`fill`, and `copyWithin`, including their actual return values and chained use. For mutations whose
result cannot be resolved exactly (for example an unknown comparator/order, unknown bounds, or an
unmodeled method receiving a database-capable value), invalidate every potentially stale numeric
fact and carry executable uncertainty so later reads/calls reject explicitly. An uncertainty flag
may never coexist with stale numeric facts that are returned as authoritative.

Preserve semantics through aliases, computed/destructured/bound methods, repeated and mixed
mutations, direct/nested numeric assignments, parameters, returns, closures, conditionals,
defaults, holes, rest/spread, and cyclic values. Model aliasing of the same mutable sequence so a
mutation through one reference updates or invalidates every reference. Retain exact-once discovery,
duplicate suppression, deterministic results, and bounded cycles. Do not special-case only the
five probes.

**Acceptance:** each supplied runtime-valid probe must either recover exactly one ledger call when
the final positions are statically known or emit deterministic explicit unsupported when genuinely
unknown—never zero/zero. Add exact transfer matrices for every named mutation, negative index and
boundary normalization, mutation return/chaining, aliases/computed/bound methods, multi-step
compositions, sequence aliases, and stale-property invalidation. Add inert and ambiguous controls,
fail-on-old proofs at the rejected SHA, and repeated-run/cycle checks. Production census remains
unchanged.

## Z7-R16.2 — static CommonJS and namespace exports degrade to ambiguity (`MAJOR`)

The module graph recovers named ESM and dotted CommonJS assignments, including the control
`module.exports.makeDatabase = ...`, but ordinary statically resolvable export forms return zero
exact calls plus dynamic-callable unsupported:

```typescript
exports['makeDatabase'] = makeDatabase;
module.exports = { makeDatabase, Readable: inert };
exports = module.exports = { makeDatabase };
Object.assign(exports, { makeDatabase });
module.exports = require('@supabase/supabase-js');
```

The equivalent ESM namespace re-export also degrades:

```typescript
export * as factories from './factory';
```

These forms fail closed, but R15 explicitly requires statically recoverable ESM/CommonJS provenance
to resolve exactly once; the incomplete graph remains a MAJOR contract failure.

**Required:** model module export state and aliasing according to JavaScript semantics rather than
recognizing isolated assignment shapes. Resolve constant computed export keys; static
`module.exports` object literals (including shorthand, aliases, computed constant keys, spreads
with known domains, and inert siblings); chained `exports = module.exports = ...`; static
`Object.assign`/equivalent export aggregation; whole-module `require` forwarding and member/default
interop; and ESM `NamespaceExport` / `export * as`. Preserve the distinction that a bare
`exports = value` rebind alone does not mutate `module.exports`. Support downstream namespace,
named/default, computed, destructured, and multi-hop consumers.

Build the result into the existing cycle-safe module provenance graph, including circular barrels
and CommonJS/ESM interop. Proven inert siblings/modules stay silent; proven Supabase factories,
hooks, clients, and query builders remain capable through chaining; genuinely dynamic keys,
spreads, getters, assignments, or external modules targeting the ledger remain explicit
unsupported. Avoid textual export/receiver-name allowlists.

**Acceptance:** every supplied static export form produces exactly one recovered ledger call
through representative consumers. Add named/default/namespace/computed/destructured downstream
uses; chained versus bare `exports` rebinding; static object/assign/spread aggregation; whole-module
and member `require`; ESM namespace re-export; one-/multi-hop/circular interop; inert mixed exports;
ambiguous dynamic keys/spreads/getters; duplicate suppression; and deterministic termination.
Checked-in fixtures must fail on the rejected SHA and the production census must remain unchanged.

## Retained controls and residual classifications

Retain every accepted R1–R15 control: finite constructors and numeric assignments; cycle-safe
ESM/CommonJS provenance; full-semantic-state adapter recurrence; explicit ambiguity; the retired
arbitrary-SQL RPC/endpoint; SQL analysis; ledger grants/shapes; audited authority; canonical
financial consumers; lifecycle/occurrence/batch transitions; availability/reconciliation; exact
decimals/pairs; and every prior mutation, inert, false-positive, and nontermination fixture.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 16, pending independent
review without claiming acceptance. Add exact sequence-transfer and module-export evidence,
reconcile the cumulative path inventory, and record current counts honestly.

Run focused Round 16 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build/price guard; fresh pinned local replay/full pgTAP; legitimate ledger
writers; both concurrency proofs; exact mandatory Chromium suite/manifest; mutation/export
fail-on-old, uncertainty, aliasing, false-positive, cycle, and nontermination proofs; and exact
path/reader/writer/SQL/RPC inventories. Discard invalid environment collections, record inherited
deviations, and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
