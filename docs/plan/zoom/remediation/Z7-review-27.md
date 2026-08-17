# Z7 remediation round 27 — the binding invariant (central proof of absence)

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 26 head, provisional and unaccepted):
  `c19687bec0d05c925ce06f7c19df12464b9f12b9`, tree
  `4e6344cef03f1b89ad521b5ccc9b44eb5532acc0`, 112 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: root-cause remediation of the analyzer's proof-of-absence design; implementation
  changes confined to `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved: this is a conservative syntactic proof
  system, not control-flow interpretation and not a general JavaScript interpreter
- The R21–R26 remediation records are immutable and untouched
- R19–R27 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7.

## The repeated architectural root cause

Rounds 23–26 each repaired one counterexample of a single defect: **the analyzer sometimes
used one stale evaluator value to prove a binding inert even though its syntactic
declaration/write summary was incomplete, mutable, opaque, cyclic, capped, or
scope-conflicted.** The manifestations were constructed strings omitted (R23), destructuring
writes omitted and caps conflated with absence (R24), assignment cycles erased alternatives
(R25), opaque writes absorbed known alternatives (R26) — and, blocking this round,
function/class declaration names that remained permanently "callable" after a valid
reassignment.

**Blocking reproduction** (both forms, on the exact starting candidate): `function table()
{}` — or `class table {}` — followed in a pruned catch by
`table = true ? ('contract_' + 'hours_ledger') : table; client.from(table)` performed one
runtime ledger call while the analyzer returned **[]**. The pre-scan recorded the assignment,
but `declaredCallableNames` unconditionally short-circuited the static resolver before it
consulted the recorded writes; membership came back unknown; and the pruned-site classifier
fell back to the stale function/class binding, which proved the site inert. The same
mechanism silenced a scope collision (top-level `function table() {}` with a catch-scoped
`const table = 'contract_' + 'hours_ledger'`).

## The binding invariant (now central and load-bearing)

> The analyzer may classify a binding as `none` only when it has an exhaustive account of
> every syntactically relevant declaration and write that may affect that binding, and every
> represented alternative is mechanically proven unable to equal `contract_hours_ledger`.

Consequences, as implemented:

1. Incomplete, opaque, tainted, capped-without-exclusion, cyclic-without-proof, or
   scope-conflicted summaries prevent stale evaluator state from proving `none`: taint,
   `guarded` membership, and assignment-cycle provenance all classify from the summary
   itself, never from a binding.
2. Unknown information widens (R26 `opaque`), never erases known finite, overflow,
   `possible`, ledger-present, or cycle-provenance alternatives.
3. The evaluator binding is consulted only when the summary carries no information at all —
   a name with no recorded writes, no taint, and at most a callable seed, where the binding
   IS the exhaustive account (an unreassigned function/class, a known global) — or for
   genuinely unbound external names, whose bindings resolve external and classify gated
   `uncertain`, never `none`.
4. **Function/class declarations are callable seeds, not permanently callable bindings.** A
   later assignment participates in the same write summary as every other assignment; the
   seed then becomes one more known non-string alternative, represented conservatively by
   widening the resolved writes to `opaque` (the string lattice cannot carry a callable).
5. Name-keyed scope-blind analysis remains; every collision unions conservatively and may
   over-report, but can never create a proof of absence.
6. The declaration/write collector accounts for variable initializers, function/class
   declarations (seeds), simple assignments, object/array destructuring declarations and
   assignments, compound assignments, prefix/postfix updates, parameters, catch bindings,
   imports, and `for-in`/`for-of` targets **including assignment patterns** (destructuring
   loop targets previously escaped taint — closed this round). Property-access targets bind
   no lexical name and stay excluded. The assignment-target walker's silent depth cap is
   removed: structural recursion over a finite AST terminates, and a cap that silently left
   deeper names untainted violated the invariant. The value-resolution depth/size caps
   remain and mark results guarded string-building (`possible`), never absent.
7. All four consumers — the reached-call hazard net, the unreached/pruned-site net, the
   externally opaque-callee guard, and `sourceNamesLedger` — share the one resolution and
   the one five-state membership decision (`present`/`possible`/`absent`/`guarded`/
   `unknown`); every decision terminates deterministically with at most one unsupported
   marker per call site.

## Coverage

- **`R27 matrix`** — 27 table-driven rows over four axes: binding category (`const`/`let`/
  `var`, function, class, parameter, catch, object/array destructuring declarations, loop
  identifier and destructuring targets, import-binding analyzer-only controls), write
  category (none, simple `=`, object/array destructuring assignment, compound, prefix
  update, `for-of` targets, opaque write, assignment cycle, cap exhaustion), authority form
  (direct literal, constructed spelling with no complete literal, finite branch, enumerated
  beyond-finite working set, beyond-working-limit `possible`, opaque sibling beside known
  authority, proven finite non-ledger), and call-site state (reached externally opaque
  callee, pruned hazard-territory site, direct dynamic-target control). Every binding and
  write category has an authority-bearing positive and an honest inert/runtime-zero
  negative; every row carries a runtime oracle (except the two import controls, where
  `import` syntax cannot run under `new Function`) and repeated-run determinism.
- **`R27.1`** — the mandatory exact probes: A (function reassignment) and B (class
  reassignment) at runtime 1 / exact 0 / exactly one `unresolved ledger authority` /
  byte-equivalent runs; C (unreassigned function and class stay statically known non-string
  callables, zero markers, preserving the retained `Reflect.construct(Factory, [])` inert
  control); D (reassigned to a proven finite non-ledger string: runtime 0, zero markers in
  a non-constructing source); E (opaque write plus known ledger-bearing write on a function
  binding: opacity widens, authority survives, one marker); F (scope collision: top-level
  callable occurrence plus catch-scoped ledger-bearing declaration — conservative marker,
  never silent zero); G (resolution traversal bound: guarded `possible`, never absent).
- **`R27.2`** — the six-step proof-of-absence mutation sequence: exhaustively proven
  non-ledger is `absent` even under an armed gate → one opaque write removes absence
  (guarded, one marker) → one constructed-ledger assignment makes membership present → a
  callable seed does not erase the write → a traversal-limited write is guarded/incomplete
  → removing the uncertain writes restores mechanically proven absence.
- **`R27 mutation`** — a disposable production `.js` root (Symbol hazard + function
  declaration + constructed reassignment + detached externally opaque call): discovered
  mechanically by production-root discovery, hazard census `['Symbol']`, executable
  authority true, the no-unsupported guard red with the mutated call site itself
  represented exactly once, zero fabricated exact calls, deterministic repeats.

All 56 retained R21–R26 tests pass unmodified. Focused total: **60**.

## Fail-on-old

The starting analyzer was extracted read-only via `git show c19687be:…` into an untracked
temporary test file (no checkout, reset, stash, or branch disturbance; deleted after
measurement). All four probes failed there — function-declaration reassignment,
class-declaration reassignment, the scope/name collision, and the callable-reassignment
production `.js` root (zero markers at the mutated `read` site) — and pass under the repair.

## Bounds stated honestly

The callable-seed alternative is represented by conservative opaque widening rather than a
proven-non-string exclusion, so a callable binding reassigned to a proven non-ledger string
classifies `guarded` (gated) rather than `absent` in a ledger-naming source — over-reporting,
never under-reporting. Scope-blind unions still merge same-named bindings across scopes and
may over-report collisions. Concatenations with unknown operands remain wholly unresolvable
(with provenance). The evaluator's value domain is untouched: reached sites it models
exactly keep their established classifications, and direct `client.from(dynamicTarget)`
keeps exactly one dynamic-target result. This remains a bounded syntactic proof system — no
control-flow interpretation, no interpreter completeness claim.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RPC/privilege/RLS/security/financial/dependency/
configuration/UI change. The production consumer, SQL/RPC, and hazard inventories were
mechanically re-run and are unchanged (14/22 direct, 8/10 indirect, 9/33 SQL expressions,
8/13 SQL objects, 4/5 unresolved SQL sites, 11 hazard sites across 5 files, zero
`exec_sql` callers, zero unsupported production results, zero unexplained consumers). All
fixtures are synthetic; temporary fail-on-old artifacts were untracked and removed. A fresh
independent reviewer must rerun the full matrix; this round does not self-accept.
