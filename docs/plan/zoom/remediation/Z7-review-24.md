# Z7 remediation round 24 — destructuring taint and tagged cap resolution

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 23 head, provisional and unaccepted):
  `4dbcc33d019822db8b91a80f794b45c839e5c604`, tree
  `568c864e164a82fa910292f05b78bb375edb7f84`, 106 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: exactly two Round 24 reviewer findings; implementation changes confined to
  `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved; the R21, R22, and R23 remediation
  records are immutable and untouched
- R19–R24 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7.

## Z7-R24.1 — destructuring assignment bypasses name taint (`MAJOR`)

**Reproduced on the starting candidate:** with `let table = 'other_table'` recorded as the
name's only initializer, a pruned catch performing
`({ table } = { table: 'contract_hours_ledger' }); client.from(table)` returned **[]**
against a runtime that performs one ledger call. The Round 23 declaration scan handled
assignment only when the left side was an identifier; destructuring assignment targets were
ignored — despite the R23 record claiming destructuring writes were tainted (that claim was
true only of declaration *binding patterns*, not assignment targets).

**Correction.** A bounded recursive assignment-target walker taints every identifier written
through an object or array destructuring assignment: shorthand, aliased
(`{ renamed: table }`), nested, pattern defaults (`{ table = fallback }`), omitted array
positions, and object/array rest targets, with parenthesis and TS assertion/non-null
wrappers unwrapped; property-access targets bind no lexical name and stay ignored. Simple
`name = expression` writes remain recorded initializers; compound and every other
non-simple write remain tainted. A tainted name now classifies **uncertain by
construction** — neither its stale recorded initializers nor the evaluator binding may
prove it inert — and fails closed exactly once at pruned sites (gated by the source naming
or constructing the ledger) and at reached externally-opaque-callee sites in such sources.
Function/class declaration names move to a separate set: they are not string-resolvable,
but their values are statically known callables, so the binding classifier may still prove
such arguments inert (this distinction surfaced when the gated taint check briefly
misclassified a retained `Reflect.construct(Factory, [])` probe during development).

## Z7-R24.2 — value/depth caps fail open (`MAJOR`)

**Reproduced on the starting candidate:** five two-way conditional fragments concatenated
into 32 finite combinations — runtime value `contract_hours_ledger` — returned **[]**: the
resolver collapsed set-size overflow, depth exhaustion, cycles, taint, and genuine
unresolvability into one `undefined`, and `sourceNamesLedger` uses the same capped
resolver, so both gates stayed false exactly when the ledger value existed only in the
overflowed product.

**Correction.** `staticStringValues` returns a tagged resolution:

- **finite** — the exact value set (≤ 16 values): membership decided exactly.
- **overflow** — provably string-building beyond a cap, carrying exact min/max composed
  lengths and, when enumeration stayed within the explicit working limit of 4096 values,
  the exact working set. Membership is then still decided exactly; without a working set,
  membership is excluded only by the bounded length proof (the 21-character name cannot fit
  min..max). Otherwise the value is **'possible'** and fails closed exactly once inside
  hazard territory, independently of the `sourceNamesLedger` gate — the gate's capped
  resolver cannot see the same overflowed value, so nothing depends on it.
- **cycle** — self-referential initializers; runtime throws (TDZ) before any call, and the
  site falls back to the gated conservative path.
- **unresolvable** — tainted names and forms that are not statically string-building; falls
  back to the R22 value/provenance classification.

Depth exhaustion — reachable only through ≥ 32 nested string-building constructs — reports
an unbounded overflow (`possible`) and fails closed. A beyond-cap value stays silent only
when a bounded proof (enumeration or length exclusion) actually proves the ledger name
absent. All explicit caps (finite 16, working 4096, depth 32), cycle guards, top-level
memoization, deterministic termination, and per-site duplicate suppression are preserved.
The evaluator's value domain is untouched: direct `client.from(dynamicTarget)` keeps
exactly one `dynamic target` result.

## Acceptance evidence

`R24.1`: pruned destructuring reassignment (runtime one, exactly one
`unresolved ledger authority`, zero fabricated exact calls, repeated-run determinism);
reached destructuring reassignment (runtime one, exactly one unsupported); all eight
destructuring target shapes tainted and failing closed exactly once each; proven-inert
destructuring (non-ledger source that can neither spell nor construct the name) silent with
a runtime oracle of zero.

`R24.2`: the reviewer's 32-combination ledger construction fails closed exactly once with
runtime oracle one and repeated-run determinism; the same construction at a direct
`client.from(table)` site keeps exactly one `dynamic target` result; depth exhaustion
carrying the real name (41 chained operands) fails closed exactly once; a 8192-combination
product whose lengths admit the name is pinned at exactly one conservative result even
though its runtime value is not the ledger; a 8192-combination product of one-character
fragments (composed length 13) is proven absent by the length proof and stays silent.

`R24 mutation`: the webhook hazard file mutated with both a beyond-cap construction and a
destructured reassignment gains executable ledger authority, keeps a structurally unchanged
hazard-site census (`['Symbol']`), and turns the production no-unsupported guard red — with
at least one failure at the mutated call sites themselves, every result an
`unresolved ledger authority` marker, and zero fabricated exact calls.

**Fail-on-old.** Measured at pristine `4dbcc33d` with only the new expectations applied,
all six probes fail: pruned destructuring (0 results, expected 1); each of the eight shape
probes (0, expected 1); the capped ledger construction (0, expected 1); depth exhaustion
(0, expected 1); the unprovable beyond-working-limit case (0, expected 1); and the webhook
mutation's own call sites (0 `z7R24Read` failures, expected ≥ 1 — the file-wide guard alone
was not discriminating on the rejected head, because the constructed spelling arms the R23
gate and floods pruned sites; the mutated-site assertion is what the rejected head cannot
satisfy). All pass under the repair.

## Bounds stated honestly

Taint remains name-keyed and scope-blind: a destructuring write to `table` anywhere taints
every `table` in the file (conservative). The working limit makes membership exact up to
4096 enumerated combinations per composition step; beyond it only the length proof can
prove absence, so length-compatible non-ledger compositions fail closed conservatively.
Values crossing module boundaries, arriving through calls, or built by mutating operations
remain out of static reach on the gated conservative path. Ledger authority entering a
hazard-territory file still arms the uncertain net file-wide — the R22/R23 documented
direction, visible in the mutation probe.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RLS/privilege behavior, financial logic, or dependency
changed. All 49 retained tests pass unchanged — none weakened, deleted, skipped, relabeled,
or diluted. All fixtures are synthetic. A fresh independent reviewer must rerun the full
matrix; this round does not self-accept.
