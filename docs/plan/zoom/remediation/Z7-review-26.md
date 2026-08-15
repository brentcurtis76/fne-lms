# Z7 remediation round 26 — opaque siblings widen, never erase

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 25 head, provisional and unaccepted):
  `1c5d54f34253833e2705b35e835a76357fa35612`, tree
  `aa6485031bce0ff3b72992ed70a732ca93ac24ff`, 110 commits from the base — verified clean, on
  `feat/zoom-hours`, before any change
- Scope: exactly the remaining Round 25 analyzer finding; implementation changes confined to
  `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- The binding Round 21 owner amendment is preserved: this is a bounded static
  lattice/provenance repair, not general interpretation
- The R21–R25 remediation records are immutable and untouched
- R19–R26 all remain provisional and pending fresh independent review. Nothing here accepts,
  merges, deploys, or production-verifies any part of Z7.

## Z7-R26 — `unresolvable` erases ledger-bearing assignment-cycle branches (`MAJOR`)

**Reproduced on the starting candidate:** three forms, each performing one runtime ledger
call while the analyzer returned **[]** —

1. opaque write **after** the call
   (`table = true ? ('contract_' + 'hours_ledger') : table; client.from(table);
   table = globalThis.unknownTable;` in a pruned catch);
2. opaque write **before** the ledger-bearing assignment;
3. opaque value in the **same union**
   (`table = true ? ('contract_' + 'hours_ledger') : globalThis.unknownTable`).

**Root cause.** `combineUnion` returned `STATIC_UNRESOLVABLE` the moment either side was
unresolvable, and identifier resolution returned immediately — a single mutually exclusive
absorbing tag discarded the finite/present/possible ledger alternatives and the
assignment-cycle provenance already accumulated. `argumentLedgerAuthority` then saw no
cycle and fell back to the evaluator's stale binding, which proved the site inert
(`'other_table'` → `none`). The opaque value never justified erasing the mechanically
visible ledger alternative.

**Correction — a non-lossy product lattice.**

- `finite` and `overflow` resolutions carry an `opaque` flag: unknown alternatives exist
  beside the mechanically known ones. An unresolvable sibling in a union **widens** the
  other side to opaque — it never erases finite values, a working-set or length-bounded
  overflow, a `possible` outcome, or assignment-cycle uncertainty.
- `unresolvable` carries `assignmentCycle` provenance, so a union of an opaque value with
  an assignment-cycle reference keeps the cycle's uncertainty (and a concatenation with an
  unknown operand propagates it).
- Membership gains **`guarded`**: every mechanically represented alternative is proven
  absent, but opaque alternatives or assignment-cycle provenance remain — the site is
  uncertain by the resolution itself and is **never discharged by a stale evaluator
  binding**, while staying behind the `sourceNamesLedger` gate (the owner-amended gated
  behavior for values that cannot be proven absent but carry no visible ledger authority).
- **`absent` now requires a non-opaque, exhaustively represented resolution** — proven by
  enumeration, working-set enumeration, or the bounded length proof over all alternatives.
- If any retained alternative equals (`present`) or can possibly equal (`possible`) the
  ledger name, the site fails closed without consulting any binding, exactly once, with no
  fabricated exact call.
- The classifier, the reached-call net, the unreached-site net, and the externally
  opaque-callee guard all consume the same five-state membership of the same resolution.
- Unchanged: declaration-only TDZ cycles (distinct, accepted runtime-zero behavior), the
  evaluator's value domain (direct `client.from(dynamicTarget)` keeps its established
  `dynamic target` classification), finite-set/working-set/length/depth caps, cycle guards,
  memoization, deterministic ordering, and per-site duplicate suppression. No string
  matching, filename allowances, special names, or test-only exceptions.

## Acceptance evidence

`R26.1` (all probes with runtime oracles and byte-equivalent repeated runs):

- A/B/C — the reviewer's three forms: runtime 1, exact ledger calls 0, exactly one
  `unresolved ledger authority` each.
- D — both a direct ledger literal and the split constructions
  (`'contract_' + 'hours_ledger'`, `'contract_' + 'hours_' + 'ledger'`) survive an opaque
  sibling: one marker each.
- E — a beyond-working-limit `possible` overflow joined by an opaque alternative retains
  `possible` and fails closed exactly once.
- F — a finite non-ledger union without uncertainty stays silent; an opaque non-ledger
  union in a source that can neither spell nor construct the name retains the
  owner-amended gated silence with no fabricated exact result.
- G — declaration-only TDZ cycle: runtime 0, silent, deterministic; direct call over an
  opaque-widened value keeps exactly one `dynamic target` result. (The full R23/R24/R25
  control set — constructed assignment cycles included — is retained unmodified and green.)

`R26 mutation` (H): the webhook hazard file mutated with a constructed assignment-cycle
ledger call **plus** the opaque write that erased the result on the rejected head —
hazard-site census structurally unchanged (`['Symbol']`), executable ledger authority true,
production no-unsupported guard red, the mutated `z7R26Read` site itself represented
**exactly once**, zero fabricated exact ledger calls, byte-equivalent repeated runs.

**Fail-on-old.** The starting analyzer was extracted read-only via
`git show 1c5d54f3:…` into an untracked temporary test file (no checkout, reset, stash, or
branch disturbance; deleted after measurement). Probes A, B, C, and H all failed there —
zero results / zero markers at the mutated site where exactly one is required — and pass
under the repair.

## Round 25 claim superseded

`Z7-review-25.md` remains immutable, but its residual-bounds claim that a name mixing an
unresolvable write with a ledger-bearing write "resolves unresolvable and relies on the
gated fallback" is **superseded**: that reliance was unsafe — the gated fallback could be
bypassed by a stale evaluator binding proving the site inert, which is precisely this
round's finding. Under the R26 lattice such a name resolves to its known alternatives
widened by `opaque`, ledger membership is decided from the retained alternatives, and no
binding fallback participates. The phase review request no longer claims unresolvable
siblings were preserved in Round 25; historical records stay historical.

## Bounds stated honestly

Opacity is a one-way widening: once a union contains an unknown alternative, absence can no
longer be proven for the whole value, so opaque non-ledger unions in ledger-naming sources
fail closed conservatively (gated) even when the opaque branch is runtime-inert.
Concatenations with an unknown operand remain wholly unresolvable (with provenance) — the
known operand is not preserved as an alternative because composition changes it. Taint,
scope-blindness, working-limit, and length-proof bounds from R23–R25 are unchanged. The
evaluator's own value domain still decides reached direct calls; sites it models exactly
keep their established classifications.

## Scope and boundaries

Implementation changes only in `ledger-hours-reader-inventory.test.ts`; this artifact,
`PROJECT_STATE.md`, and the phase review request are the only other files touched. No
production code, migration, database/RLS/privilege behavior, financial logic, dependency,
or configuration changed. All 54 retained tests pass unmodified — none deleted, skipped,
renamed, relabeled, weakened, or loosened. All fixtures are synthetic; temporary
fail-on-old files were untracked and removed. A fresh independent reviewer must rerun the
full matrix; this round does not self-accept.
