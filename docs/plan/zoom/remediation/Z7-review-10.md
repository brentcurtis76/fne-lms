# Z7 independent review — remediation round 10

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `47febb25cd65dff583ec516bce9022336f4a306e`
- Rejected tree: `79643b415d5311db28069fff382b164e1424c25f`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/59 commits/clean relevant worktrees passed
- Cumulative inventory: 108 actual / 108 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The ninth cold review independently confirmed the Round 9 attendance/report write boundaries,
focused/full database evidence, static gates, and exact inventory. It found two remaining override
authority paths and two additional inventory-analysis false-negative classes. Resolve all findings
cumulatively without weakening R1–R9 controls.

## Z7-R10.1 — `effective_minutes` is injectable during ledger INSERT (`BLOCKER`)

The override migration revokes direct `UPDATE` of `effective_minutes`, but exposed roles retain
table-level `INSERT`, which includes that column. `service_role` bypasses RLS, and authenticated
active admins satisfy the ledger insert policy. A rollback-only reviewer probe inserted a ledger
row with `effective_minutes = 7` and no `session_hour_overrides` event.

**Required:** in a new additive hardening migration, revoke table-level `INSERT` on
`contract_hours_ledger` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Regrant
column-level `INSERT` only for the legitimate lifecycle columns required by current production
writers, explicitly excluding `effective_minutes`. Audit every production INSERT shape before
choosing the column list. Preserve RLS and the audited owner RPC's ability to apply/reverse.

**Acceptance:** authenticated admin and service-role inserts that specify `effective_minutes` fail
and leave zero rows/audit events. Every legitimate reservation/manual/lifecycle ledger creation
that omits the column remains green, including defaults and returned rows. Apply/reverse RPCs still
write atomically and create their linked events. Catalog tests assert table/column privileges for
all exposed roles and no alternate default/function/sequence path can populate the column.

## Z7-R10.2 — Exposed roles control the override ordering sequence (`MAJOR`)

`session_hour_overrides_seq_seq` grants `USAGE`, `SELECT`, and `UPDATE` to `anon`,
`authenticated`, and `service_role`. Those roles can advance, reset, or exhaust the sequence,
which can reorder events, create duplicate sequence values, make latest-unreversed selection
nondeterministic, or deny future audit inserts.

**Required:** add an additive revocation of every privilege on the override sequence from `PUBLIC`
and all exposed roles. The owner-executed override RPC needs no exposed-role sequence grant. Audit
all new Z7 identity/default sequences for the same class of authority leak.

**Acceptance:** `has_sequence_privilege` is false for `anon`, `authenticated`, and `service_role`
for `USAGE`, `SELECT`, and `UPDATE`; direct `nextval`, `currval`/read where applicable, and `setval`
fail before mutation. Apply/reverse/replay/concurrency continue to generate owner-controlled,
monotonic sequence values and retain deterministic reversal ordering.

## Z7-R10.3 — TypeScript inventory has recursive/spread/mutation false negatives (`MAJOR`)

Independent probes against the checked-in analyzer returned only a stale safe target or an empty
result for:

- a recursive function whose later branch reaches `contract_hours_ledger`;
- invocation through spread arguments;
- callable mutation through `Object.assign`;
- array target mutation through `splice`, followed by a loop.

These forms can bypass the exact maps while the guard remains green.

**Required:** use convergent interprocedural analysis/fixed-point handling for recursive call
graphs; propagate spread/rest arguments and reachable values; model relevant object/array mutation
methods or conservatively emit an explicit unsupported result. Never preserve a stale safe-only
classification after a live mutation. Maintain cycle termination and deterministic results.

**Acceptance:** executable fail-on-old probes cover direct/mutual recursion, calls before
definition, spread/rest/default parameters, `Object.assign`, `splice`, and representative unmodeled
object/array mutations, plus all prior property/parameter/conditional/loop/alias forms across
TS/TSX/JS/JSX. Each probe discovers the ledger/callable or emits explicit unsupported—never empty
or stale-safe-only. Safe finite allowances remain green and analysis terminates predictably.

## Z7-R10.4 — SQL inventory misses composite rows and ledger DML (`MAJOR`)

The SQL walker reports `backed: true`, `count: 0`, and no unsupported result for:

- `SELECT l FROM public.contract_hours_ledger AS l`;
- `SELECT row_to_json(l) ...`;
- INSERT, UPDATE, and DELETE naming the ledger without spelling `hours`;
- `RETURNING l`.

Whole-row exposure or a ledger mutation can therefore leave both the expression and SQL-object
maps unchanged.

**Required:** classify bare composite aliases and composite values passed to functions, and account
for every ledger-backed DML relation even when no `hours` token appears. Alternatively, explicitly
reject any ledger-backed statement that is not represented by the exact map. Preserve the inertness
of comments, strings, and unrelated dollar-quoted literals.

**Acceptance:** executable probes cover bare/qualified composite rows, row conversion/functions,
`RETURNING` composite rows, INSERT/UPDATE/DELETE/MERGE with and without explicit hours, nested and
correlated scopes, functions/views/transitive objects, and all prior star/alias/CTE forms. Every
genuine ledger access changes an exact map or fails explicitly; inert text remains inert. Recompute
and reconcile all production census claims.

## Retained controls and residual classifications

Retain all accepted R1–R9 controls: attendance/report evidence is RPC-only; batch promotion is the
sole authority transition; occurrence compare-and-set behavior; audited overrides; reschedule and
availability invariants; financial effective-minute use; pagination/report terminality; and every
prior regression.

Do not expand this round merely to redesign accepted bulk partial-write, unmatched-suggestion, or
other explicitly documented attendance residual classifications absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request from the immutable base through the eventual tree. Add every
Round 10 path and honest fail-on-old, catalog, privilege, ledger-creation, override-chain,
interprocedural, mutation, and SQL evidence. Mechanically reconcile path, migration, commit, test,
assertion, TypeScript/SQL census, and dependency counts and remove stale claims. Update
`PROJECT_STATE.md` to Round 10 review-ready/pending independent review without claiming acceptance,
merge, deployment, or production verification.

Run focused Round 10 and all prior high-risk suites; type-check; zero-warning lint; three-zone full
Vitest; production build; fresh local migration replay and full pgTAP; rollback-only direct INSERT
and sequence probes; legitimate ledger-writer coverage; override and attendance concurrency; exact
117-test Chromium; analyzer mutation proofs; and exact inventory reconciliation. Record inherited
deviations honestly and leave no persistent local test state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
