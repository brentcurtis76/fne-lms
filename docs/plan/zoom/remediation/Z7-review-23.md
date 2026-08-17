# Z7 remediation round 23 — constructed ledger authority fails closed

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 22 head, provisional and unaccepted):
  `14eb69de9aa3c61fb4048117305b5e566010a250`, tree
  `cacf82183e0884eb094376cdd1e328680ec9b507`, 104 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: exactly one Round 23 reviewer finding; implementation changes confined to
  `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved: this round adds bounded static string
  resolution for authority classification only — not general interpretation, and not an
  extension of the evaluator's value domain
- The R21 and R22 remediation records are immutable and untouched
- R19–R23 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7.

## Z7-R23 — constructed ledger authority fails open inside existing hazard territory (`MAJOR`)

**Location.** `__tests__/lib/services/ledger-hours-reader-inventory.test.ts` —
`sourceNamesLedger` / `carriesLedgerAuthorityArgument` and the external-callee guard in
`evaluateCallable`.

**Reproduced on the starting candidate** (exact, before any change):

```javascript
const sentinel = Symbol('existing');
const table = 'contract_' + 'hours_ledger';
const read = (0, client.from);
read(table);
```

Runtime performs one `contract_hours_ledger` call; `discoverSupabaseCalls` returned **[]**.
The same construction inside a pruned catch also returned **[]**. Direct
`client.from(table)` correctly produced one `dynamic target` result (and still does). Three
mechanisms combined into the hole:

1. `sourceNamesLedger` required the complete table name in one string literal, so the
   `uncertain` fail-closed path stayed disabled for constructed spellings;
2. argument classification consulted only the evaluator's value domain, which deliberately
   does not model string concatenation, so the constructed binding resolved as external;
3. the external-callee guard keyed on `args[0]?.strings`, which constructed values never
   populate.

Because the `Symbol` sentinel already activates hazard territory and `+`/comma add no hazard
kind, both the analyzer and the site-exact census stayed green — a silent fail-open mutation
channel into a hazard file.

**Correction.** A bounded, memoized, side-effect-free static string resolver, used **only**
for ledger-authority classification:

- Supports string and no-substitution/substitution template literals, parenthesis and TS
  assertion/non-null wrappers, ordinary lexical aliases (via a purely syntactic declaration
  map — never live evaluator state, so a site classifies identically during evaluation and
  during the post-evaluation unreached-site scan), the finite conditional/logical/comma
  branches already supported, and binary `+` over finite string sets.
- Termination is guaranteed by explicit caps: value sets larger than 16 or nesting deeper
  than 32 resolve to `undefined` (not statically constructible) and fall back to the R22
  conservative classification; identifier resolution is cycle-guarded; names written by any
  form other than a simple `name = <expression>` (destructuring, parameters, catch bindings,
  compound assignment, `++`/`--`, imports, function/class declarations, `for-in/of` targets)
  are tainted and never resolve.
- Results are memoized per expression node, so reached-call, unreached/pruned-site, and
  external-callee handling share one resolution per site; nothing is evaluated twice.
- A statically resolved value equal to `contract_hours_ledger` is `authority` regardless of
  whether the complete spelling appears as one source literal; a finite static non-ledger
  value is provably `none`; everything unresolvable keeps the R22 value/provenance
  classification and its gated `uncertain` handling.
- `sourceNamesLedger` now also detects statically constructible spellings, so the `uncertain`
  net arms in sources that build the name from fragments.
- An externally opaque callee (no methods, functions, adapter, or callable candidacy) whose
  argument statically constructs the ledger name fails closed exactly once as
  `unresolved ledger authority` — the evaluator's own `dynamic callable name` triggers keep
  byte-identical precedence, and the evaluator's value domain is untouched, so direct
  `client.from(constructed)` retains exactly one `dynamic target` result.

**Acceptance evidence** (`R23.1` and the `R23 mutation` test, all with in-test runtime
oracles where a runtime completes):

- Reached constructed alias, externally opaque callee: runtime one; exactly one deterministic
  `unresolved ledger authority`; repeated-run determinism asserted.
- Pruned/unreached constructed alias: runtime one; zero fabricated exact calls; exactly one
  unsupported result.
- Template construction (`` `contract_${half}` ``) and finite-branch construction
  (`(flag ? 'contract_' : 'other_') + 'hours_ledger'`): exactly one result each.
- Direct `client.from(constructedTarget)`: exactly one `dynamic target` result, byte-equal to
  the pre-repair shape.
- Constructed non-ledger string: runtime zero; provably inert, zero results.
- Cyclic mutual construction: runtime throws before any call (TDZ); resolution terminates,
  returns deterministically, and stays silent — the source can neither spell nor construct
  the name.
- Beyond-cap construction (32 combinations > 16): terminates, resolves to nothing statically,
  and stays silent for a provably non-ledger composition.
- Retained conservative uncertainty: an unresolvable value in a ledger-naming source still
  fails closed exactly once beneath the static layer.
- Mutation: constructed authority appended to the webhook hazard file flips executable
  authority to true, leaves the hazard-site census structurally unchanged (`['Symbol']`), and
  turns the production no-unsupported guard red — the constructed site fails closed exactly
  once, and (documented conservative consequence) the file's previously discharged
  pruned/unreached sites fail closed as well; every result is an `unresolved ledger
  authority` marker, none a fabricated exact call.

**Fail-on-old.** Measured at pristine `14eb69de` with only the new expectations applied:
the reached probe and pruned probe each returned zero results (expected one), and the mutated
webhook source produced zero unsupported results (expected non-empty) — all three probes fail
on the starting head and pass under the repair.

## Bounds stated honestly

The resolver is lexical and scope-blind by design: a name's recorded simple initializers are
unioned across scopes, over-approximating toward `authority` (conservative); any unmodeled
write form taints the name entirely, falling back to `uncertain` handling gated by the
extended `sourceNamesLedger`. Values that cross module boundaries, arrive through calls, or
are built by mutation (`+=`, array joins) remain out of static reach — such sites stay on the
conservative uncertain path, and dynamic table names at direct call sites keep their separate
`dynamic target` fail-closed machinery. Ledger authority entering a hazard-territory file
arms the uncertain net for that whole file; that is the documented direction — silence is
reserved for sources that provably cannot name the ledger.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RLS/privilege behavior, financial logic, or dependency
changed. No test was weakened, deleted, skipped, relabeled, or diluted; the one adjusted
assertion this round is the new R23 mutation probe itself, tightened during development to
pin the conservative multi-site consequence described above. All fixtures are synthetic. A
fresh independent reviewer must rerun the full matrix; this round does not self-accept.
