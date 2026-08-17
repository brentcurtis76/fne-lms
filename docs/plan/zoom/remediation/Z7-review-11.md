# Z7 independent review — remediation round 11

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `d615730f5418728bbf01e0c4f439aaf63e86bc9f`
- Rejected tree: `dbd6829391e42fd2339f9c4e8df942d9022be836`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/65 commits/clean relevant worktrees passed
- Cumulative inventory: 111 actual / 111 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The Round 10 cold review independently reproduced the static and three-zone Vitest evidence and
confirmed the checked-in inventory suite passes. It then found one remaining direct financial
authority path and two silent executable-inventory bypass classes. The reviewer task was terminated
by a platform safety false positive before it could print its formal final message; the three
counterexamples had already been reproduced on the exact rejected tree. Treat the review as
`REVISE`, not as acceptance or as a completed formal verdict.

## Z7-R11.1 — exposed roles can change fallback billable `hours` without an override event (`BLOCKER`)

`20260813120200_session_hour_overrides.sql` revokes table-level UPDATE and then grants column UPDATE
on every ledger column except `effective_minutes`. This includes `hours`, the canonical billable
fallback whenever `effective_minutes IS NULL`, as well as immutable identity/snapshot columns. The
baseline `chl_admin_update` policy lets an authenticated active admin use that grant, and
`service_role` bypasses RLS. A caller can therefore change billed hours while leaving
`effective_minutes` NULL and creating no `session_hour_overrides` event. The existing G2 tests only
attempt direct UPDATE of `effective_minutes` and a legitimate `status` no-op, so they do not detect
the alternate assignment path.

**Required:** add an additive privilege-hardening migration. Revoke both table-level and every
existing column-level UPDATE grant on `contract_hours_ledger` from `PUBLIC`, `anon`,
`authenticated`, and `service_role`; a table-level revoke alone does not remove the column ACLs
created in Round 6. Mechanically audit every production ledger UPDATE writer and regrant only the
smallest legitimate lifecycle-column union. Exclude `hours`, `effective_minutes`, immutable
allocation/session identity, planned snapshots, and every other unobserved column unless a real
production writer and governing lifecycle contract require it. Preserve the owner-executed override
RPC and the actual completion/cancellation/manual-status flows.

**Acceptance:** catalog assertions enumerate all table and column UPDATE privileges per exposed
role. Authenticated admin and service-role attempts to change `hours`, `effective_minutes`, and each
other financially authoritative/immutable excluded column fail and leave the ledger and override
audit unchanged. A rollback-only fail-on-old probe proves an old direct `hours` UPDATE changed a
canonical billing consumer without an audit event. Every real production UPDATE shape succeeds on
the new grants, including completion, cancellation, compensation, and the permitted manual status
override; apply/reverse/replay/concurrency stay atomic and monotonic. Add a mechanically derived
source-to-grant guard so a future writer cannot add a column silently.

## Z7-R11.2 — TypeScript inventory silently misses callable invocation adapters (`MAJOR`)

Independent executable probes showed that captured Supabase methods invoked through Function
adapters or a higher-order helper produce neither a ledger touch nor an explicit unsupported result.
Representative failing shapes include `client.from.call(client, 'contract_hours_ledger')`,
`client.from.apply(client, ['contract_hours_ledger'])`, and passing `client.from` to a helper that
invokes the callable. The analyzer models direct calls and several aliases/mutations but does not
propagate the underlying callable through these invocation forms.

**Required:** model `.call`, `.apply`, `Reflect.apply`, bound functions, and higher-order callable
parameters/returns with the existing convergent interprocedural value lattice, or conservatively
emit an explicit unsupported result whenever the target or argument flow cannot be resolved.
Invocation adapters must preserve receiver/argument, spread/rest/default, recursion, and mutation
information. Never turn a live callable candidate into an empty result.

**Acceptance:** fail-on-old probes cover direct and aliased `.call`/`.apply`, `Reflect.apply`,
`.bind` followed by invocation, higher-order parameters and returned closures, spread arrays,
recursive adapters, and external/dynamic variants. Each genuine ledger call changes the exact map;
each unresolved executable form fails explicitly; inert property names and unrelated ordinary
functions remain inert. Preserve all R1–R10 probes, deterministic termination, and the exact
production-root census.

## Z7-R11.3 — SQL inventory silently ignores executable dynamic SQL and schema-level composite flows (`MAJOR`)

The SQL tokenizer correctly ignores ordinary strings, but it also ignores strings executed by
PL/pgSQL `EXECUTE`. Static executable SQL that reads or mutates `contract_hours_ledger` can therefore
return zero with no unsupported signal. Independent probes also returned zero for ledger composite
types in function parameters/returns/row types and for trigger/signature flows attached to the
ledger. These are executable schema dependencies or mutation authorities even when no `hours`
token appears.

**Required:** distinguish inert literals from executable dynamic-SQL contexts. Recursively analyze
statically recoverable `EXECUTE` strings, including constant concatenation and `format` with static
identifiers; fail closed on dynamic executable SQL that could name a ledger relation or whose target
cannot be proven safe. Account or explicitly reject ledger composites in function arguments,
returns, `%ROWTYPE`, casts/records, trigger targets and transition tables, and equivalent
view/materialized-view/rule/schema-object flows. Audit CTE shadowing, LATERAL/correlated scopes,
quoted identifiers, dollar quoting, and DDL around the same boundary.

**Acceptance:** fail-on-old probes cover literal `EXECUTE`, concatenated/`format` SQL, dynamic
identifiers, `USING`, ledger composite parameters/returns/variables/casts, `CREATE TRIGGER ... ON
contract_hours_ledger`, transition tables, views/materialized views/rules, CTE shadowing, LATERAL and
correlated aliases, and all prior DML/whole-row/nested/comment/string cases. Every executable ledger
dependency changes the exact expression/object/write map or produces a deterministic explicit
unsupported failure; genuinely inert text stays inert. Recompute and reconcile every SQL census.

## Retained controls and residual classifications

Retain all accepted R1–R10 controls, especially Round 10's column-scoped INSERT grants, owner-only
Z7 sequences, override/attendance authority, occurrence and batch transitions, canonical financial
consumers, report pagination/terminality, reschedule availability coherence, and all prior analyzer
fixtures. Do not weaken the database authority model to make legitimate writers pass.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request from the immutable base through the eventual tree. Add every
Round 11 path and honest fail-on-old, catalog, real-writer, billing, callable-adapter, dynamic-SQL,
composite/schema-object, and inventory proof. Mechanically reconcile path, migration, commit, test,
assertion, TypeScript/SQL census, and dependency counts; remove stale review-state claims. Update
`PROJECT_STATE.md` to Round 11 review-ready/pending independent review without claiming acceptance,
merge, deployment, or production verification.

Run focused Round 11 and all cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; production build; fresh local migration replay and full pgTAP; rollback-only
alternate-assignment proof; every real ledger writer; override and attendance concurrency; exact
117-test mandatory Chromium; analyzer mutation proofs; and exact inventory reconciliation. Record
inherited deviations honestly and remove all temporary local browser/database state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
