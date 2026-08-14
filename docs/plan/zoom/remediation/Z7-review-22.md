# Z7 remediation round 22 — human-authorized two-finding repair

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Starting candidate (Round 21 head, provisional and unaccepted):
  `cc6c41fa234678e5691891e17a14164ff01d31f0`, tree `f7f0ea7c82d43a553b346b1e8cc8a253ff1e24dc`
- Authorization: Brent, 2026-08-14 — a single bounded repair round for exactly two reviewer
  findings against the Round 21 candidate; executed by an isolated Fable builder
- The Round 21 owner amendment (`Z7-review-21-owner-amendment.md`) remains binding:
  interpreter-level JavaScript completeness is not a release gate. This round corrects two
  defects *inside* the amended assurance boundary; it does not reopen interpretation.
- Rounds 19, 20, 21, and this round remain provisional and pending fresh independent review.
  Nothing here accepts, merges, deploys, or production-verifies any part of Z7.
- This artifact is immutable once committed and rewrites no prior review record. Where a prior
  record's factual claim is superseded, the reconciliation is recorded here, not edited there.

## Z7-R22.1 — alias-carried ledger authority fails open (`MAJOR`)

**Location.** `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`, the R21 hazard
net's reached-call and unreached-call gates.

**Reproduced on the starting candidate** (exact, before any change):

- A reached hazard-territory site with an unresolvable callee and the literal argument
  `read('contract_hours_ledger')` produced one `unresolved ledger authority` result — correct.
- The identical site with an ordinary alias — `const table = 'contract_hours_ledger';
  read(table)` — produced **zero results**: fail open.
- A pruned catch region containing `client.from(table)` under the same top-level alias produced
  **zero results**: fail open.
- The production-root mutation probe exercised only the literal form, so the alias hole was
  invisible to the guard.

**Root cause.** `carriesLedgerAuthorityArgument` tested direct string-literal syntax only.

**Correction.** Ledger authority at a net site is now a three-state lexical resolution
(`authority` / `uncertain` / `none`) over resolved argument values and provenance:

- string literals; ordinary resolvable bindings (via the live scope chain); finite branches
  (conditional and logical unions whose constituents are classifiable); parenthesized and
  assertion wrappers — all classified exactly, side-effect free, without re-evaluating argument
  expressions, so the reached-call net (during evaluation) and the unreached-site net (after
  it) classify a site identically and deterministically;
- values provably carrying `'contract_hours_ledger'` are `authority` and always fail closed;
- values with a known non-ledger interpretation are `none` and stay silent (inert controls);
- everything the resolver cannot rule out is `uncertain` and fails closed exactly once per
  site — in any source that statically names the ledger. Static ledger authority can only
  enter a source through a literal spelling of the table name (dynamically constructed table
  names remain covered by the separate dynamic-target fail-closed machinery), so a
  hazard-territory file with no such literal has no ledger authority an uncertain value could
  discharge; this keeps the webhook route's non-authority hazard honestly out of the
  unresolved census instead of flooding it with false `unresolved ledger authority` claims.

**Acceptance evidence** (`R22.1` and the extended `R21 mutation` test):

- Reached aliased target: exactly one deterministic `unresolved ledger authority` result, with
  an in-test runtime oracle of one call and a repeated-run determinism assertion.
- Finite-branch target (`flag ? 'contract_hours_ledger' : 'other_table'`): exactly one result.
- Pruned/unreached aliased target: exactly one result, zero fabricated exact calls.
- Uncertain production-relevant value (catch-local alias unresolvable at scan time in a
  ledger-naming source): exactly one result.
- Inert controls (resolvable non-ledger binding; non-ledger literal): zero results.
- A production-root mutation carrying its ledger target through an alias turns the guard red
  exactly once; the literal form still turns it red.
- Duplicate suppression and deterministic termination are preserved (per-site position-keyed
  dedupe unchanged; the resolver is purely lexical and recursion-bounded by the AST).

**Fail-on-old.** Measured at `cc6c41fa` with the fix stashed and only the new expectations
applied: the reached-alias, pruned-alias, and uncertain-alias probes each returned zero
results (expected one — three fail-open misses), and the aliased production-root mutation left
the guard green (expected red). All four probes failed on the starting candidate and pass
under the repair.

## Z7-R22.2 — production hazard census is not site-exact (`MAJOR`)

**Location.** Same file, the `R21 census` production hazard inventory.

**Reproduced on the starting candidate:**

- `hazardForms` classified ledger authority with `source.includes('contract_hours_ledger')` —
  a raw source substring.
- Hazards were collected into a `Set<string>` — at most one entry per kind per file.
- The recorded artifacts claimed **four** comparator hazards; independent AST counting finds
  **ten** current `sort` calls with comparators across the four listed files:
  `components/workspace/WorkspaceSessionsTab.tsx` 2, `pages/admin/sessions/index.tsx` 1,
  `pages/api/sessions/reports/analytics.ts` 5, `pages/consultor/sessions/index.tsx` 2
  (`pages/consultor/sessions/index.tsx` has four `.sort(` call sites of which two are
  argument-less and correctly excluded).
- Adding another comparator to an already-listed file did not change the census — the guard
  was mutation-blind inside listed files.

**Correction.**

- The census is now **site-exact**: every hazard occurrence is identified by stable path + AST
  site position + hazard kind, deduplicated per site, and asserted as the per-file kind
  sequence in source order — so the identity is stable under unrelated-line reordering while a
  genuinely new site always changes the inventory.
- Ledger/database authority is derived from the **direct and transitive executable
  inventory** — the analyzer's discovered table touches, RPC/view calls resolving into the SQL
  ledger dependency graph, and (fail closed) any unsupported result — never from raw source
  substrings. The prior `not.toContain('contract_hours_ledger')` substring claim about the
  webhook route is replaced by its executable classification: zero direct touches, zero
  transitive consumers, zero unsupported results.
- Non-authority production hazards remain honestly classified: the webhook route's single
  `Symbol` sentinel is censused as a hazard site with `authority: false`.
- A mutation test proves the inventory is sensitive inside already-listed files: one more
  comparator in `WorkspaceSessionsTab.tsx` moves its count 2 → 3 and turns the census red,
  while a pure position shift neither adds, drops, nor duplicates any site.

**The corrected exact site inventory:**

| File | Hazard sites | Executable ledger authority |
|---|---|---|
| `components/workspace/WorkspaceSessionsTab.tsx` | 2 × `sort-comparator` | yes |
| `pages/admin/sessions/index.tsx` | 1 × `sort-comparator` | yes |
| `pages/api/sessions/reports/analytics.ts` | 5 × `sort-comparator` | yes |
| `pages/api/zoom/webhook.ts` | 1 × `Symbol` | **no** (mechanically proven) |
| `pages/consultor/sessions/index.tsx` | 2 × `sort-comparator` | yes |

Zero `Reflect.*`, zero `Object.setPrototypeOf`, zero switch statements with lexical clause
bindings in any production root. Every authority-carrying census file is present in the
classified direct-touch inventory, and the production fail-closed gate still returns zero
unsupported and zero unexplained consumers.

**Claim reconciliation.** The Round 21 owner amendment and the Round 21 sections of
`PROJECT_STATE.md` and the phase review request stated "four UI/report `sort` comparators".
That count was an artifact of the per-file `Set` collapse: four *files* carry comparators; the
site-exact truth is **ten comparator sites across those four files**. The amendment file is an
immutable record and is not edited; `PROJECT_STATE.md` and the review request are corrected to
the site-exact counts by this round, and every current state/inventory claim now reconciles
with the mechanical census.

**Fail-on-old.** Measured at `cc6c41fa`: the site-exact expectation failed (one comparator
counted per file where two/one/five/two exist), and the listed-file mutation probe failed
(census unchanged by an added comparator). Both fail on the starting candidate and pass under
the repair.

## Scope and boundaries

Only `__tests__/lib/services/ledger-hours-reader-inventory.test.ts` changed in the
implementation commit; the two evidence documents and this artifact changed in the evidence
commit. No production code, database object, migration, RLS surface, or accepted R1–R20
control was touched. No test was weakened, deleted, skipped, relabeled, or diluted; every
prior assertion in the focused and cumulative suites is retained and green. All fixtures are
synthetic; temporary probe roots are created under the repository and removed in `finally`
blocks. Gate evidence for this round is recorded in
`docs/plan/zoom/reviews/fase-7-review-request.md` (Round 22 collection). A fresh independent
reviewer must rerun the full matrix; this round does not self-accept.
