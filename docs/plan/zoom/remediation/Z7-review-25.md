# Z7 remediation round 25 — assignment cycles and inventory-count reconciliation

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 24 head, provisional and unaccepted):
  `df15f1ac0597770ad7f94ad8f59c8c8924a7b05f`, tree
  `d5a9d39a5299c99b7ec268be67b3dae265a8add9`, 108 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: exactly two Round 24 review findings (one MAJOR analyzer defect, one MINOR stale
  documentation count); implementation changes confined to
  `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved; the R21–R24 remediation records are
  immutable and untouched
- R19–R25 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7.

## Z7-R25.1 — assignment cycles silently discharge ledger authority (`MAJOR`)

**Reproduced on the starting candidate:** the reviewer's pruned self-assignment probe —
`table = true ? 'contract_hours_ledger' : table; client.from(table)` inside a pruned catch —
performed one runtime ledger call while the analyzer returned **[]**. The same silent miss
reproduced for the constructed-fragment variant
(`true ? ('contract_' + 'hours_ledger') : table`) and for a two-name assignment SCC
(`table = true ? 'contract_hours_ledger' : alias; alias = table`).

**Root cause.** The resolver recorded declarations and simple assignments identically and
returned one undifferentiated `cycle` for any repeated name; `combineUnion` let a cycle
absorb and discard the provably ledger-bearing sibling branch; cycle membership was
`unknown`; and `argumentLedgerAuthority` then fell back to the evaluator's stale binding
(`'other_table'` → `none`). The Round 24 record's claim that every resolver cycle implies a
TDZ failure is **false** for post-initialization assignments — that claim is corrected here
and must not be repeated.

**Correction.**

- Every recorded write carries its kind: declaration initializer or post-initialization
  assignment. The resolution stack tracks the edges a cycle actually traverses, so direct
  self-references and multi-name strongly connected assignment cycles are classified
  deterministically by whether any participating edge is an assignment.
- A **declaration-only cycle** remains a genuine TDZ self-reference: it poisons
  concatenations (the runtime throws before any composition — the accepted R23 behavior,
  retained) and keeps its existing conservative fallback.
- An **assignment cycle** is an ordinary re-assignment whose self-reference denotes the
  name's prior value. In unions it is the **neutral element** — the fixpoint adds nothing
  beyond the other branches, so a reachable finite/overflow/possible/unresolvable sibling is
  preserved and a provably ledger-bearing branch is never absorbed (identifier resolution no
  longer early-returns on cycles). In concatenations it composes the unknown prior value —
  an unbounded string-building overflow that fails closed, never discharges. If a pure
  assignment-cycle survives to classification it is **uncertain by construction** and never
  falls through to a stale evaluator binding; the externally-opaque-callee guard gains the
  same gated assignment-cycle case.
- The evaluator's value domain is unchanged (direct `client.from(dynamicTarget)` keeps
  exactly one `dynamic target` result), no general interpretation was added, and all
  R21–R24 finite/overflow/depth/destructuring-taint/cap/cycle-termination/memoization/
  duplicate-suppression behavior is preserved — all 52 retained tests pass unmodified.

**Acceptance evidence** (`R25.1`, `R25 mutation`; every completing probe carries a runtime
oracle and a repeated-run determinism assertion):

- A: pruned self-assignment cycle — runtime 1; exact ledger calls 0; exactly one
  `unresolved ledger authority`; byte-equivalent repeated runs.
- B: constructed-name cycle with no complete ledger literal anywhere — same shape.
- C: two-name assignment SCC — same shape.
- D: reached externally-opaque-callee cycle — exactly one unsupported result; the direct
  call retains exactly one dynamic-target result with the evaluator's own value union.
- E: declaration-only TDZ cycle — runtime 0, deterministic termination, zero fabricated
  calls, zero unsupported (the accepted result, retained without a new marker).
- F: proven non-ledger assignment cycle in a source that can neither spell nor construct
  the name — runtime 0, silent (the fixpoint union is finite and provably absent).
- G: the webhook hazard file mutated with a constructed assignment-cycle ledger call —
  hazard-site census structurally unchanged (`['Symbol']`), executable authority flips
  true, the production no-unsupported guard turns red, exactly one unresolved marker at the
  mutated `z7R25Read` site, zero fabricated exact calls. (The mutation uses the constructed
  spelling deliberately: a literal assignment is modeled by the evaluator and already fails
  closed once through its established `dynamic callable name` guard; the constructed form
  is invisible to the value domain and isolates the repaired static layer.)

**Fail-on-old.** The starting analyzer was extracted read-only via
`git show df15f1ac:__tests__/lib/services/ledger-hours-reader-inventory.test.ts` into an
untracked temporary test file (no reset, checkout, or branch disturbance; deleted after
measurement). All four probes failed on it: A, B, and C each returned zero results
(expected one), and the webhook mutation produced zero markers at the mutated site
(expected one). All pass under the repair.

## Z7-R25.2 — stale cumulative inventory count (`MINOR`)

Reviewer-focus item 4 of the phase review request still instructed re-running the
cumulative path inventory at **130/130** — stale since Round 22, while the Round 24
candidate mechanically reconciles at 132/132. Recomputed at this round's final HEAD: the
only new cumulative path is this artifact, so the mechanically derived count is **133** and
every current (non-historical) count statement now says **133/133**. The historical
Round 21/22 collection records retain their labeled historical counts. The `comm -3`
reconciliation at the final HEAD produces no output with zero duplicates; the inventory
list contains every changed path exactly once.

## Bounds stated honestly

The union-fixpoint treats the self-reference as contributing nothing beyond a name's other
recorded writes — sound for union-shaped cycles, which is the supported ordinary-assignment
category. Concatenation-shaped assignment cycles (`t = t + fragment`) are not enumerated;
they become an unbounded overflow and fail closed conservatively even when the fragments
provably could not spell the name — the conservative direction, at the cost of possible
over-reporting. Taint, scope-blindness, working-limit, and length-proof bounds from R23/R24
are unchanged. A name mixing an unresolvable write with a ledger-bearing write still
resolves unresolvable and relies on the gated fallback — unchanged pre-existing semantics,
recorded here as a residual, not repaired in this round.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RLS/privilege behavior, financial logic, dependency,
or configuration changed. All 52 retained tests pass unchanged — none deleted, skipped,
renamed, relabeled, weakened, or loosened. All fixtures are synthetic; the temporary
fail-on-old file was untracked and removed. A fresh independent reviewer must rerun the
full matrix; this round does not self-accept.
