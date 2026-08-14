# Z7 independent review — remediation round 13

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `7d64642de042caa45077b8140fb7a8ab89635d0f`
- Rejected tree: `57374d0e533ae53f4754748a51a2b77c8f489e37`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/73 commits/clean relevant worktrees passed
- Cumulative inventory: 119 actual / 119 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The twelfth cold review accepted the Round 12 database-authority repair, SQL analyzer expansion,
retired endpoint, cumulative gates, and exact inventory. It found one remaining neighboring
false-negative family in the TypeScript reader inventory. Resolve this one finding cumulatively
without weakening any R1–R12 control.

## Z7-R13.1 — nested `Function.prototype` adapters evade the reader inventory (`MAJOR`)

These runtime-valid forms execute `client.from('contract_hours_ledger')` while
`discoverSupabaseCalls` returns `count = 0` and no explicit unsupported result:

```typescript
Function.prototype.apply.call(
  client.from, client, ['contract_hours_ledger'],
);

Function.prototype.call.apply(
  client.from, [client, 'contract_hours_ledger'],
);

const apply = Function.prototype.apply;
apply.call(client.from, client, ['contract_hours_ledger']);

const call = Function.prototype.call;
call.apply(client.from, [client, 'contract_hours_ledger']);
```

The same gap exists through equivalent aliases and compositions. Recoverable aliased `bind`
forms are rejected instead of being evaluated and counted. The analyzer currently recognizes
some `Function.prototype.call` cases but does not model `call`, `apply`, and `bind` as a closed,
composable intrinsic family. The Round 12 fixtures prove direct adapters and `call.call`, but do
not cover the neighboring nested compositions above. There is no matching production reader at
the rejected SHA; the defect is in the executable completeness proof itself.

**Required:** represent `Function.prototype.call`, `.apply`, and `.bind` as first-class callable
abstract values whose identity and argument layout survive aliases, computed property access,
destructuring, binding, and recursive composition. Evaluate recoverable nested forms generically,
including `apply.call`, `call.apply`, `bind.call`, and equivalent bound/aliased arrangements; do
not add syntax-specific exceptions for only the examples. Preserve exact receiver and argument
semantics, count each recovered ledger call exactly once, and propagate database-capable callable
identity through multiple nesting depths. Any composition whose target or arguments cannot be
resolved safely must emit an explicit deterministic `unsupported` result rather than disappearing.
Keep evaluation cycle-safe and bounded, and retain ordinary `.from` property false-positive
controls.

**Acceptance:** mutation fixtures for every example above return exactly one ledger call. Add a
matrix covering direct, aliased, computed (`Function['prototype']['apply']`), destructured,
bound, and at least two nested depths across `call`/`apply`/`bind`, including valid `bind.call`
variants. Recoverable forms are counted, unresolved external adapters reject explicitly, cyclic
or recursive adapter graphs terminate deterministically, inert adapters remain inert, and
ordinary non-Supabase `.from` properties do not count. All R1–R12 reader fixtures remain green and
the exact production reader census remains unchanged.

## Retained controls and residual classifications

Retain all accepted R1–R12 controls, including the retired `exec_sql(text)` authority, endpoint
closure, SQL lexical/dynamic analysis, seven-column ledger UPDATE union, column-scoped INSERT,
owner-only sequences, audited mutations, canonical financial consumers, occurrence and batch
transitions, availability/reconciliation behavior, exact decimals/pairs, and every prior analyzer
fixture. Do not weaken an existing rejection merely to make a new recoverable form pass.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 13, pending independent
review without claiming acceptance. Add Round 13 mutation and negative fixtures, reconcile the
119-path inventory plus new paths exactly, and record current artifact counts honestly rather than
copying historical totals.

Run focused Round 13 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build; fresh migration replay and full pgTAP; all legitimate ledger writers;
both concurrency proofs; exact mandatory Chromium suite; price guard; analyzer mutation,
unsupported, false-positive, cycle, and nontermination proofs; and exact inventory reconciliation.
Record inherited deviations and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/state/evidence and return exact detached SHAs after the current builder head.
