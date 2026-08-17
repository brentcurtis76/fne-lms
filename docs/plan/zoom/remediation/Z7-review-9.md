# Z7 independent review — remediation round 9

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `1c0ce93fed6114650a32f2e70e3c2f24c5c690de`
- Rejected tree: `95ad611ad2a44668ddee148cc5d5812150af97b4`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/54 commits/clean relevant worktrees passed
- Cumulative inventory: 104 actual / 104 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The eighth completed cold review independently reproduced all declared focused/full Vitest,
pgTAP, build, static, concurrency, identity, and inventory evidence. It confirmed the Round 8
occurrence compare-and-set itself is correct, then found two older direct database interfaces that
bypass authority and two additional executable consumer-inventory false-negative classes. Resolve
all four findings cumulatively.

## Z7-R9.1 — Direct attendance writes bypass occurrence authority (`MAJOR`)

Despite the new occurrence claim/join/leave RPCs, `service_role` retains direct `INSERT` and
`UPDATE` on `public.zoom_attendance` and direct mutations on
`zoom_internal.zoom_attendance_observations`. A rollback probe inserted a foreign-occurrence
interval without a matching meeting row. Direct update can close an interval without an
observation, and direct observation insertion bypasses the occurrence condition.

**Required:** add an additive migration revoking direct `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`,
and `TRIGGER` attendance/observation mutations from every exposed role, including `service_role`.
Route every legitimate writer through owner-executed RPCs with fixed empty `search_path`. Preserve
required read access. Coordinate with R9.2: report promotion must be owner-executed before direct
attendance insertion is revoked.

**Acceptance:** as `service_role`, direct attendance INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER and direct
observation INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER fail for insufficient privilege. Legitimate
pre-start null claims and matching occurrences work only through the intended RPCs. Two concurrent
different UUID claims have one winner; the loser creates/closes no interval and creates no
observation. A stale lookup after a meeting UUID change returns `occurrence_mismatch`. The obsolete
leave signature stays non-executable, and tests assert owners, grants, signatures, fixed
`search_path`, surface/session/school matching, fill-only identity, tenant isolation, and RLS.

## Z7-R9.2 — Batch authority can bypass atomic promotion (`MAJOR`)

`GRANT ALL` on `zoom_attendance_report_batches` lets `service_role` bypass
`promote_attendance_report_batch`. The transition trigger permits direct `pending -> complete`, and
INSERT is unguarded. The reviewer directly inserted a syntactically valid `complete` zero-row batch
inside a rollback probe. That forged authoritative empty report contained no promoted attendance
rows and can suppress webhook attendance, violating whole-report validation and atomic
rows-plus-status authority.

**Required:** introduce an owner-executed pending-batch creation RPC that validates
meeting/surface/school/occurrence identity and always creates `pending`. Make creation, rejection,
and promotion RPCs `SECURITY DEFINER` with fixed empty `search_path`. Revoke direct
INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER on the batch table from every exposed role, including
`service_role`, while preserving required reads and the terminality trigger. Update the production
store to use the creation RPC. The promotion RPC must remain the sole path that atomically inserts
the exact validated rows and changes status to `complete`.

**Acceptance:** service-role direct INSERT of a complete or pending batch and direct
`pending -> complete` UPDATE fail. Only the creation RPC creates candidates, always pending. Only
promotion creates an authoritative complete batch atomically with exact validated row/count
agreement. Legitimate authoritative empty reports still complete through promotion. Rejection,
retry, replay, terminal immutability, zero-participant behavior, and concurrent promotion remain
deterministic. Add rollback-only privilege/catalog and behavioral tests.

## Z7-R9.3 — TypeScript inventory misses live callable and target flows (`MAJOR`)

The analyzer still handles only identifier assignment and limited direct call forms. Independent
in-memory probes produced zero calls or stale safe classification for:

- object properties containing `client.from`, then invoked through the property;
- callable parameters invoked with `client.from`/`client.rpc`;
- conditional callable expressions;
- destructuring assignment such as `({ from: read } = client)`;
- object-property reassignment from a safe literal to the ledger;
- array mutation via `push`, followed by a loop.

Property/array mutations can leave the old safe literal classified while the live value targets the
ledger.

**Required:** track callable values and database targets through property/element aliases,
parameters, conditional calls, destructuring assignments, mutations, alias chains, and loop
bindings. External or unresolved callable/target flows must be explicit unsupported results, never
an empty discovery. Dynamic allowances must follow the live runtime binding, not a stale literal.

**Acceptance:** fail-on-old executable probes cover all `from`/`rpc`, generic, nested/shadowed
scope, property/element, parameter, conditional, loop, alias/reassignment, destructuring-assignment,
object/array mutation, and external-source forms. Keep the unused old safe literal present while
mutating the live binding and require every allowance to follow that binding across production
TS/TSX/JS/JSX roots. A ledger table or ledger-backed callable in any reachable live branch fails.

## Z7-R9.4 — SQL inventory misses whole-row, correlated, and MERGE access (`MAJOR`)

The SQL walker counts literal `hours` tokens only in a locally ledger-backed scope. It reports zero
for `SELECT * FROM public.contract_hours_ledger`, `SELECT l.* ...`, `UPDATE ... RETURNING *`, and a
correlated subquery reading an outer ledger alias. `MERGE`/`USING` is absent from relation discovery.
These whole-row/raw-hours uses can evade the exact expression and object inventories.

**Required:** propagate outer ledger-backed aliases through correlated subqueries; classify `*`,
`alias.*`, and DML `RETURNING *`; recognize `MERGE`/`USING` and every requested DML relation form.
Any ambiguous ledger-backed whole-row flow or unsupported ledger syntax must fail closed. Comments,
strings, and dollar-quoted non-body literals must remain inert.

**Acceptance:** executable probes cover derived/nested/correlated queries, alias shadowing, CTEs,
quoted and tuple updates, SELECT/RETURNING stars, direct/arbitrary/unqualified aliases,
INSERT/UPDATE/DELETE/MERGE with USING, multiple statements, function/view bodies, comments,
strings/dollar literals, and direct/transitive dependencies. Every genuine ledger access changes
the exact map or fails explicitly. Recompute and reconcile every source/SQL census and evidence
claim.

## Retained controls and residual classifications

Retain every accepted R1–R8 invariant, especially occurrence compare-and-set semantics, override
RPC-only authority, tracked/XOR reschedule rejection, availability coherence, exact decimal
handling, effective-minute financial consumers, report terminality, pagination/report authority,
and all prior regression suites.

Do not expand this round merely to redesign the accepted non-transactional bulk insertion residual
or unmatched attendance-suggestion semantics. Preserve other explicitly documented attendance
residual classifications unless concrete new evidence violates a governing invariant.

## Evidence and boundaries

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from the immutable base through
the eventual tree, adding every Round 9 path and all privilege, direct-interface, concurrency,
fail-on-old, dataflow, and SQL evidence. Mechanically update path, migration, commit, test,
assertion, source/SQL expression, and dependency counts; remove stale or overstated claims. External
dispatch remains authoritative for the self-referential final canonical SHA.

Update `PROJECT_STATE.md` to Round 9 review-ready/pending independent review without claiming
acceptance, merge, deployment, or production verification.

Run focused R9 and all prior high-risk suites; type-check; zero-warning lint; full Vitest in the
three-zone matrix; production build; fresh local migration replay and full pgTAP; rollback-only
direct-privilege/forgery probes; occurrence and batch concurrency; real override concurrency; exact
117-test Chromium; guard mutation probes; and exact inventory reconciliation. Record inherited
advisory, broad-suite, and Madrid deviations honestly. Leave no persistent local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
