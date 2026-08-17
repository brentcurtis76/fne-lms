# Z7 remediation round 28 — the central binding-summary contract

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 27 head, provisional and unaccepted):
  `7890f3e3bf019fa0ffaa9bc2f907d43884c4c123`, tree
  `5b7b7dc308edf8908deef25f74eb4df42015884e`, 114 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: architectural remediation of the analyzer's recurring stale-binding defect;
  implementation changes confined to
  `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved verbatim: general JavaScript
  interpretation is **not** required. The release gate remains mechanically complete
  production-consumer coverage plus deterministic fail-closed handling of unsupported
  production-relevant syntax
- The R21–R27 remediation records are immutable and untouched. Where Round 27 stated a
  completeness claim that this round disproves, it is **superseded here**, not edited there
- R19–R28 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7

## The architectural root cause (not the two counterexamples)

Rounds 23–27 each repaired one counterexample of one defect. Round 27 named the defect
correctly but did not remove its cause: **the analyzer had no single authoritative
representation of whether its syntactic binding summary was exhaustive.** Completeness was
*inferred*, after the fact, from value-resolution tags spread across `simpleNameInitializers`,
`rewrittenNames`, `declaredCallableNames`, `widenedOpaque`, `staticLedgerMembership`, and the
evaluator fallback in `argumentLedgerAuthority`.

Because "cannot resolve this value" and "the summary has no relevant information" were the
same tag (`{ kind: 'unresolvable' }` → membership `unknown`), a **recorded write whose value
resolved opaque was indistinguishable from a name with no writes at all**. The classifier then
consulted the evaluator binding — which, at a pruned or unreached site, is stale by
construction — and that binding proved the site inert.

**Blocking reproduction** (both forms, measured on the exact starting candidate `7890f3e3`),
with `globalThis.z7R28Unknown` bound to `contract_hours_ledger`:

```js
const armedLedgerName = 'contract_hours_ledger';
function table() {}            // — or — class table {}
table = globalThis.z7R28Unknown;
client.from(table);
```

In a pruned catch (R21 hazard territory), each form performed **one runtime ledger call while
the analyzer returned `[]`**. The trace: `staticStringValues` recorded the write, resolved
`globalThis.z7R28Unknown` to plain `unresolvable`, `widenedOpaque` converted plain
unresolvable back into plain unresolvable (dropping the fact that an opaque *write* existed),
`staticLedgerMembership` mapped that to `unknown`, and `argumentLedgerAuthority` fell through
to `binding('table')` — the stale function/class declaration — which classified `none`.

The Round 27 matrix did not cover this state: its opaque-callable case also carried a
separately known ledger-bearing write, so the known alternative masked the escape.

**The defect is not callable-specific.** The same silence was measured for every recorded
write whose declaration sibling is a mechanically known non-string — `let table = {}`,
`= []`, `= 0`, `= null`, `= false`, `= /x/`, `= (() => 1)` — each followed by the same
opaque-only reassignment, and for a scope/name conflict whose second declaration is opaque.
All are rows in `R28.1 D`, `R28.4` and `R28.5`.

## The correction — one central `BindingSummary`

`StaticStringResolution` (a tagged union whose tags conflated value knowledge with account
completeness) is replaced by **one** contract, `BindingSummary`, consumed by every resolver,
the membership classifier, the ledger-authority classifier, and all four consumers. It
represents, explicitly and independently:

| Field | Represents |
|---|---|
| `values` / `valuesExhaustive` | resolved finite alternatives, and whether the enumeration is complete |
| `lengths` / `capped` | capped/overflow results and their exact composed length bounds |
| `opaque` | unknown alternatives beside the known ones |
| `inert` | alternatives mechanically proven not to be the ledger string |
| `cycle` / `neutral` | cycles and their provenance (declaration/TDZ vs. assignment) |
| `seeds` | declaration/seed alternatives (function/class declarations) |
| `writesRecorded` | whether syntactically relevant writes were recorded **at all** |
| `unmodeledWrites` | tainted writes: forms the collector cannot model |
| `scopeConflict` | one lexical name with more than one declaration site — ownership unprovable |
| `evaluatorFallbackSafe` | whether evaluator fallback is **affirmatively** safe |

### The invariant, enforced centrally

> The analyzer may return `none` only if it has an exhaustive account of every syntactically
> relevant declaration and write that may affect the binding, every represented alternative is
> mechanically proven unable to equal `contract_hours_ledger`, and no incomplete / opaque /
> tainted / cyclic / capped / scope-conflicted state remains capable of ledger authority.

It is enforced at exactly two lines of code, both singular in the file:

- `ledgerMembership` contains **one** `return 'absent'`, reachable only after `present`,
  `neutral`, capped-without-length-exclusion, `opaque`, `unmodeledWrites`, and
  assignment-cycle provenance have all been excluded.
- `argumentLedgerAuthority` contains **one** `return 'none'`, reachable only from
  `membership === 'absent'`, and **one** `binding(...)` consult, guarded immediately above by
  `if (!summary.evaluatorFallbackSafe) return 'uncertain';`.

### The consequences, as implemented

1. **A recorded write is summary information even when its value resolves opaque.**
   `writesRecorded` is set from the collector, never derived from the resolved value.
2. **Any recorded opaque/unresolved write makes the result guarded and denies fallback.**
   `opaque` ⇒ membership `guarded`; `writesRecorded` ⇒ `evaluatorFallbackSafe: false`.
3. **A callable declaration with zero other writes is an inert seed.** It is a mechanically
   proven non-string alternative and the exhaustive account, so membership is `absent` — a
   *proof*, no longer a borrowed evaluator classification.
4. **A callable seed with one or more writes is the union of the seed and those writes.** The
   seed is the fold's initial element in the same `combineUnion`; an opaque write widens that
   union (`inert: true, opaque: true`) and cannot disappear.
5. **`evaluatorFallbackSafe` is an affirmative positive property.** `makeSummary` defaults it
   to `false`; it is granted at exactly one place — the identifier fold — under
   `writes.length === 0 && !tainted && !conflicted`, and composed through `mergeAccount` as a
   logical AND. It is never inferred from `kind === 'unresolvable'`, from missing concrete
   values, or from `membership === 'unknown'`.
6. **Every consumer uses the same summary and the same fallback rule.** The externally
   opaque-callee guard lost its private membership predicate (including its direct
   `rewrittenNames` escape hatch) and now calls `carriesLedgerAuthorityArgument`, the identical
   question asked by the reached-call net and the unreached-site net. `sourceNamesLedger` uses
   the same `ledgerMembership(valueSummary(...))`. There is no parallel path to evaluator state:
   the only other `binding(...)` call in the file is inside `resolveValue`, the evaluator's own
   value domain, which is deliberately untouched.
7. **Reached production-relevant unresolved authority fails closed exactly once**, at the
   relevant consumer, with position-keyed duplicate suppression (`unique` map) and the
   unreached net skipping already-reported positions. Termination is by the explicit depth cap,
   the name-stack cycle guard, and structural recursion over a finite AST.
8. **The owner amendment is preserved.** No control-flow interpretation, no general JavaScript
   evaluation, no interpreter-completeness claim.

## Proof table — every summary state and its fallback verdict

`present`/`possible` fail closed without the `sourceNamesLedger` gate; `guarded` and `unknown`
that resolve to `uncertain` fail closed behind it. Enforced in code by `ledgerMembership` +
`argumentLedgerAuthority`, and mechanically in `R28.4` (each row run armed and unarmed, with a
runtime oracle and a repeated-run determinism check) and `R28.5`.

| # | Summary state | Membership | Evaluator fallback | Why |
|---|---|---|---|---|
| 1 | no declaration, no write, no taint, no conflict (free/host global) | `guarded` (opaque value) | **permitted** | the summary is exhaustive *and* informationless; the evaluator binding IS the account |
| 2 | callable seed only, no writes | `absent` | denied (not needed) | inert seed over an exhaustive declaration account |
| 3 | finite alternatives, ledger not enumerated, nothing opaque | `absent` | denied (not needed) | exhaustive enumeration mechanically excludes the name |
| 4 | finite alternatives containing the ledger name | `present` | denied | proven authority; no binding consulted |
| 5 | any recorded write resolving opaque (with or without a seed) | `guarded` | **denied** | `writesRecorded` + `opaque`: the account is incomplete |
| 6 | tainted / unmodeled write (destructuring, compound, `++`, loop target, parameter, catch, import, no-initializer declaration) | `guarded` | **denied** | `unmodeledWrites`: a write form the collector cannot model exists |
| 7 | assignment cycle surviving the fold | `guarded` | **denied** | the self-reference denotes an unknown prior value |
| 8 | declaration-only TDZ cycle with recorded writes | `unknown` | **denied** | `writesRecorded` denies fallback; the state resolves `uncertain`, never binding-proven `none` |
| 9 | capped beyond the finite limit, working set enumerated, ledger absent | `absent` | denied (not needed) | the working-set enumeration is still exact |
| 10 | capped beyond the working limit, ledger length inside min..max | `possible` | denied | fails closed without the gate |
| 11 | capped beyond the working limit, length proof excludes the ledger | `absent` | denied (not needed) | bounded length-exclusion proof |
| 12 | traversal depth exhausted | `possible` | denied | unbounded string-building; never absent |
| 13 | scope/name conflict (>1 declaration site) | union of all declarations | **denied** | no single binding can prove ownership |
| 14 | composition (union/concat) of the above | lattice join | AND of operands | one unsafe operand makes the composition unsafe |

Rows 1 and 14 are the only routes by which the evaluator binding can still speak, and row 1 is
the only *grant*. `R28.4` asserts this mechanically: exactly one row in its table carries
`fallback: true`, and every non-fallback row that is not a proven-absence state produces a
marker under the armed gate.

Note on row 13: with the current collector, every declaration form other than a function/class
declaration also taints or records a write, so `scopeConflict` is presently subsumed by rows 5
and 6. It is represented and wired into the fallback rule as defense in depth — if a future
declaration form stops tainting, the conflict count still denies fallback rather than silently
re-opening the escape. `R28.2 E/F` pins both directions (two callable declarations stay proven
inert; a callable plus an opaque sibling declaration fails closed).

## Audited boundary

- **Call sites of the central helpers.** `valueSummary` — 8 internal recursions plus
  `argumentLedgerAuthority` and `sourceNamesLedger`. `ledgerMembership` — `argumentLedgerAuthority`
  and `sourceNamesLedger`. `argumentLedgerAuthority` — 4 internal recursions plus
  `carriesLedgerAuthorityArgument`. `carriesLedgerAuthorityArgument` — the reached-call net
  (one site), the unreached-site net (one site), and the externally opaque-callee guard (one
  site, newly unified). `valueLedgerAuthority` — one site, behind the fallback guard.
- **Every `none`.** One, in `argumentLedgerAuthority`, from `membership === 'absent'` only.
- **Every `absent`.** One, in `ledgerMembership`, after all incompleteness states are excluded.
- **Every evaluator-fallback path.** One, guarded by `evaluatorFallbackSafe`. The only other
  `binding(...)` in the file is `resolveValue`'s, inside the evaluator's own value domain.
- **Recorded write categories.** Variable declarations with an identifier name and an
  initializer (declaration edge) and simple `name = expression` assignments (assignment edge)
  are *recorded*; function/class declaration names are *seeds*; binding patterns, parameters,
  catch bindings, imports, compound assignments, prefix/postfix updates, `for-in`/`for-of`
  targets including assignment patterns, destructuring assignment targets (shorthand, aliased,
  nested, default, omitted, rest, with wrappers unwrapped), and declarations without an
  initializer are *tainted*. Property-access targets bind no lexical name and stay excluded.
- **Production roots included by the guard.** 1,114 files (621 `.ts`, 471 `.tsx`, 22 `.js`,
  0 `.jsx` today) under the non-production exclusion set; `.jsx` is covered by pattern and
  proven live by the `R28 mutation` probe, which creates one disposable root per extension.
- **SQL/RPC/view/function consumers and the cumulative inventory.** Re-derived mechanically at
  this round's HEAD and unchanged from Round 27: 14 files / 22 direct table touches; 8 files /
  10 indirect RPC/view consumers; 32 migrations, 189 SQL object definitions, 13 ledger-reaching
  SQL objects across 8 files, 3 with unresolved sites; 9 files / 33 raw-hours SQL expressions;
  4 files with explicit unresolved executable SQL; 2 insert-shape files and 2 update-shape
  files; 11 hazard sites across 5 files; **0** production `exec_sql` callers; **0** unsupported
  production results; **0** unexplained consumers; 4 classified dynamic non-ledger production
  calls.

## Coverage — seven root-invariant suites (60 → 67)

- **`R28.1`** — a recorded opaque write is summary information. A/B the two blocking probes
  (`function` and `class`) at a pruned site: runtime 1, exact 0, exactly one
  `unresolved ledger authority` at `client.from`, byte-equivalent repeats. C the same two
  bindings at a reached externally opaque callee (marker at `read`). D seven non-callable
  inert declarations (`{}`, `[]`, `0`, `null`, `false`, `/x/`, `(() => 1)`) each plus the
  opaque-only write — proving the defect was never callable-specific. E the retained R26
  finite-sibling control. F the accepted gated-silence behaviour, preserved exactly, in both
  the pruned and detached forms. G the direct non-hazard `client.from(table)` control, pinned
  so the repair cannot silently relabel the evaluator's own `dynamic target` classification.
- **`R28.2`** — callable seeds are inert only while the declaration account is exhaustive:
  inert seed (runtime 0, zero markers), seed plus a proven finite non-ledger write silent
  **under an armed gate** because the complete summary proves absence, one opaque write
  removing that absence, the seed never erasing a ledger-bearing write in either declaration
  order, two callable declarations of one name staying proven inert, and a scope conflict whose
  sibling declaration is opaque failing closed.
- **`R28.3`** — order independence: six permutations of {opaque, ledger, non-ledger} writes,
  each exactly one marker; two opaque/non-ledger orders each guarded; two proven-only orders
  each silent.
- **`R28.4`** — the proof table above, 14 rows × armed/unarmed, each with a runtime oracle,
  zero fabricated exact calls, all-markers-are-`unresolved ledger authority`, and repeated-run
  determinism; plus two mechanical assertions over the table itself (exactly one row grants
  fallback; every non-fallback non-proven-absence row is red while armed).
- **`R28.5`** — five incomplete states each paired with an evaluator binding that *would* prove
  the site inert (a callable, an object, a proven non-ledger string), asserted at both the
  pruned site and the reached externally opaque callee.
- **`R28.6`** — one incomplete binding at two distinct call sites yields exactly two markers at
  stable, distinct expressions; the same alias called twice yields two; a site reachable by both
  nets yields exactly one; three repeated analyses are `toEqual` and `JSON.stringify`-identical.
- **`R28 mutation`** — four disposable production roots (`.js`, `.jsx`, `.ts`, `.tsx`), each
  carrying an already-censused `Symbol` hazard, a callable declaration, an opaque-only
  reassignment and a detached externally opaque database call. Each is discovered by production
  root discovery, has executable authority `true`, census `['Symbol']`, exactly one marker at
  `read`, zero fabricated exact calls, deterministic repeats. The production no-unsupported
  guard turns red **for exactly these four paths and no tracked file**. No tracked production
  file is modified.

All 60 retained R21–R27 tests pass **byte-identically**: the diff removes 332 lines, every one
of them at or before old line 3511 — entirely inside `discoverSupabaseCalls` — and the only
change at or after that point is a single pure insertion of 488 test lines (0 deletions).

## Fail-on-old

The `7890f3e3` analyzer was extracted read-only via `git show` into an untracked temporary test
file (no checkout, reset, stash, or branch disturbance; deleted after measurement). **All seven
R28 suites fail there and pass under the repair.**

Measured old-vs-new deltas over the R28 probe families (runtime oracle → markers):

| Probe | R27 (`7890f3e3`) | R28 | Direction |
|---|---|---|---|
| `function` seed + opaque write, pruned, armed | runtime 1 → **0 markers** | runtime 1 → 1 at `client.from` | fail-closed |
| `class` seed + opaque write, pruned, armed | runtime 1 → **0 markers** | runtime 1 → 1 at `client.from` | fail-closed |
| `function` seed + opaque write, reached opaque callee | runtime 1 → **0 markers** | runtime 1 → 1 at `read` | fail-closed |
| `let table = {}` + opaque write, pruned, armed | runtime 1 → **0 markers** | runtime 1 → 1 at `client.from` | fail-closed |
| `let table = 0` + opaque write, pruned, armed | runtime 1 → **0 markers** | runtime 1 → 1 at `client.from` | fail-closed |
| scope conflict: callable + opaque sibling declaration | runtime 0 → **0 markers** | runtime 0 → 1 at `read` | fail-closed |
| one incomplete binding at two sites | runtime 2 → **0 markers** | runtime 2 → 2 | fail-closed |
| seed + proven finite non-ledger write, armed | runtime 0 → 1 marker | runtime 0 → **0 markers** | discharge (see below) |
| seed + two proven non-ledger writes, armed | runtime 0 → 1 marker | runtime 0 → **0 markers** | discharge (see below) |
| `let table = 'other'` + opaque write, pruned, armed | runtime 1 → 1 marker | unchanged | — |
| unarmed seed + opaque write (gated silence) | runtime 1 → 0 markers | unchanged | — |
| direct non-hazard `client.from(table)` | runtime 1 → 1 `dynamic target` | unchanged | — |
| seed only / two seeds / free name / TDZ cycle / compound taint / seed+finite+opaque | as measured | unchanged | — |

## Changed expectations, stated mechanically

- **No prior test was weakened, deleted, skipped, or relabeled.** All 60 retained tests are
  byte-identical and pass unmodified; no prior assertion was edited.
- **Two behavioural changes are in the discharge direction**, both the same one: a callable
  seed is now an *inert proven-non-string alternative* instead of Round 27's conservative
  opaque widening. A callable binding reassigned only to proven finite non-ledger strings
  therefore classifies `absent` rather than `guarded` in a ledger-naming source. This is a
  mechanical proof (a function/class object cannot equal the ledger string) confirmed by a
  runtime oracle of 0 in both rows, it is required by consequence 3 of the invariant, and
  **no existing test asserted the old outcome**. It **supersedes** the Round 27 artifact's
  "Bounds stated honestly" claim that the callable-seed alternative is represented by
  conservative opaque widening; `Z7-review-27.md` stays immutable.
- **Round 27's completeness claim is superseded.** Its consequence 3 ("the evaluator binding is
  consulted only when the summary carries no information at all") was correct as an intention
  and false as an implementation: a name with recorded writes that resolved opaque *did* look
  informationless. Round 28 makes the property explicit (`evaluatorFallbackSafe`) rather than
  derived, which is what makes the claim true.
- **One widening at the externally opaque-callee guard.** It now asks
  `carriesLedgerAuthorityArgument` instead of its own membership predicate, so a reached opaque
  callee whose argument is an *uncertain non-identifier form* (a property read, a call) in a
  ledger-naming hazard source now also fails closed. Strictly more conservative; no retained
  test changed.

## Bounds stated honestly

The scope-blind, name-keyed union still merges same-named bindings across scopes and may
over-report collisions. Concatenations with an operand that is not known to be a string remain
wholly unknown (with assignment-cycle provenance preserved). `scopeConflict` is currently
subsumed by taint/write recording and is defense in depth, not a live discriminator. The
evaluator's value domain is untouched: sites it models exactly keep their established
classifications, and direct `client.from(dynamicTarget)` keeps exactly one dynamic-target
result — so the direct, non-hazard form of the blocking probe still reports the evaluator's own
`dynamic target` (one unsupported result, fail-closed) rather than an `unresolved ledger
authority` marker; relabeling it would have changed retained R25.1/R26 expectations, which this
round is forbidden to do. This remains a bounded syntactic proof system — no control-flow
interpretation, no general JavaScript evaluation, no interpreter-completeness claim.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RPC/privilege/RLS/security/financial/dependency/
configuration/UI change. No database, browser, or deployment operation was run; no production
or remote database was accessed; no Vercel command was issued. The production consumer,
SQL/RPC, and hazard inventories were mechanically re-run and are unchanged. All fixtures are
synthetic; the fail-on-old artifact and all temporary probe roots were untracked and removed. A
fresh independent reviewer must rerun the full matrix; this round does not self-accept.
