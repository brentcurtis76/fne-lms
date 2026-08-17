# Z7 independent review — remediation round 12

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `7f15a0ad731a8821d0012cd517af7de741da51fb`
- Rejected tree: `f974d5ea0d2aa3701f12a240e8aa3bd1d05029a1`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/69 commits/clean relevant worktrees passed
- Cumulative inventory: 114 actual / 114 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The eleventh cold review independently reproduced the final seven-column ledger UPDATE grant,
996-assertion database suite, concurrency proofs, static gates, build, and three-zone Vitest
evidence. It found a pre-existing privileged RPC that defeats every table boundary and new
neighboring false-negative/nontermination cases in both executable inventories. Resolve the exact
findings cumulatively without weakening R1–R11 controls.

## Z7-R12.1 — `public.exec_sql(text)` defeats all ledger authority boundaries (`BLOCKER`)

The baseline defines PostgreSQL-owned `public.exec_sql(text)` as `SECURITY DEFINER` and executes
arbitrary caller text. Functions have implicit `PUBLIC EXECUTE` unless revoked; the baseline also
grants it explicitly to `service_role`. Its authorization query returns SQL `NULL` for an anon
JWT without `sub`; `IF NOT NULL` does not raise. A rollback-only reviewer probe as `anon`
updated ledger `hours` from 1.00 to 9.00 with zero `session_hour_overrides` rows. Authenticated
admin and service-role calls did the same. The runtime endpoint
`pages/api/admin/apply-supervisor-migration.ts` invokes this RPC six times through a service
client, violating the repository rule that schema changes belong in migrations rather than
runtime requests.

**Required:** add an additive migration revoking `EXECUTE` on
`public.exec_sql(text)` from `PUBLIC`, `anon`, `authenticated`, and `service_role`. Do not
drop or rewrite historical migrations. Retire the runtime supervisor-migration endpoint and all
production callers; it must not retain a service-role escape or accept arbitrary SQL. Existing
schema belongs in checked migrations, and any future fixed operation must use a separately reviewed,
narrow RPC rather than this function. Audit the repository for every other callable arbitrary-SQL
surface and for mutation access to any related audit table; report or close equivalent exposed
authority instead of assuming this name is exhaustive.

**Acceptance:** catalog tests prove no exposed role or `PUBLIC` has `EXECUTE`; direct anon,
authenticated-admin, and service-role calls fail with `42501` before query execution and leave
all ledger/audit rows unchanged. The retired endpoint has a deterministic non-mutating response and
no service client/RPC call, with unit coverage for method/auth behavior as appropriate. A production
source census contains zero `exec_sql` calls. Audited override, reschedule, completion,
cancellation, compensation, and manual status flows remain green. Rollback-only fail-on-old
evidence demonstrates the prior arbitrary ledger update and zero linked audit events.

## Z7-R12.2 — TypeScript inventory misses neighboring adapters and can recurse forever (`MAJOR`)

Runtime-valid probes invoke `from('contract_hours_ledger')` while
`discoverSupabaseCalls` returns an empty result for:

- aliased/computed/destructured `Reflect.apply`, for example
  `const R = Reflect; R.apply(client.from, client, ['contract_hours_ledger'])`;
- nested intrinsic invocation such as
  `Function.prototype.call.call(client.from, client, 'contract_hours_ledger')`;
- concise-arrow/higher-order identity and returned closures, for example
  `const higher = fn => fn; higher(client.from)('contract_hours_ledger')`;
- callback/bound invocation such as
  `['contract_hours_ledger'].forEach(client.from.bind(client))`;
- bind aliases, object/class helpers, and unresolved external higher-order calls.

A cyclic object adapter reaches `RangeError: Maximum call stack size exceeded`.

**Required:** propagate intrinsic adapter values through aliases, properties, computed access,
destructuring and binding; capture concise-arrow outputs and returned callable closures; model
callback/higher-order invocation conservatively; explicitly reject unresolved calls that receive a
database-capable callable. Make `unionValues` and every fingerprint/traversal cycle-safe and
deterministically convergent. Do not special-case only the listed syntax.

**Acceptance:** every recoverable direct/aliased/computed/nested/bound/callback/HOF probe discovers
the ledger; unresolved executable forms emit explicit `unsupported`; cyclic object/function/array
graphs terminate with stable results; inert adapters remain inert. Cover object and class methods,
destructured built-ins, concise and block arrows, returned closures, callback collections, spread,
recursion, external forms, and all R1–R11 fixtures. Preserve the exact production census.

## Z7-R12.3 — SQL inventory has lexical scope gaps and filename-based allowances (`MAJOR`)

The analyzer discards schema qualification before CTE resolution. This valid statement therefore
returns zero touches/no unsupported result because the unqualified CTE name wrongly shadows the
physical qualified relation:

```sql
WITH contract_hours_ledger AS (SELECT 'x'::text AS status)
UPDATE public.contract_hours_ledger AS l SET status = 'consumida';
```

Neighboring probes also miss `CREATE OR REPLACE TRIGGER`, `RETURNS TABLE` columns using ledger
composites, plain composite variables, procedures, valid numbered dollar tags, and some view
bodies; an inert comment containing trigger text can be rejected. The current unresolved
`EXECUTE` allowances depend on filenames and literal substrings, so a runtime identifier can be
redirected to the ledger while the analyzer returns zero.

**Required:** preserve relation qualification through lexical/scope resolution: unqualified CTE
shadowing may be inert but can never shadow `public.contract_hours_ledger`. Replace raw
header/composite regexes with token/statement-aware classification for functions, procedures,
triggers, views/materialized views, rules, composites, variables, casts, transition tables and
PostgreSQL dollar tags. Remove filename/substr-based executable-SQL allowances. An unresolved
`EXECUTE` target must fail explicitly unless its complete runtime value domain is statically
proven safe.

**Acceptance:** qualified ledger references always change the map; genuinely unqualified CTE
shadowing remains inert. Mutation probes cover function/procedure headers, `RETURNS TABLE`,
composite variables/rowtypes/casts, `CREATE [OR REPLACE] TRIGGER`, transition tables,
views/materialized views/rules, numbered/custom dollar tags, comments/literals, nested/LATERAL/
correlated scopes, and quoted qualification. Every unresolved dynamic identifier/format/domain
emits explicit unsupported regardless of filename. Regenerate and reconcile expression/object/write
censuses with no stale allowances.

## Retained controls and residual classifications

Retain all accepted R1–R11 controls: the seven-column ledger UPDATE union and 12 excluded columns;
column-scoped INSERT; owner-only sequences; audited override/attendance authority; occurrence and
batch transitions; canonical financial consumers; ingestion/pagination/terminality; availability
and reschedule coherence; exact decimals/pairs; and every prior analyzer fixture.

Do not expand this round into accepted bulk partial-write, unmatched-suggestion, real-Zoom
report/webhook divergence, or production-migration work absent a governing contradiction.

## Evidence and boundaries

Update the cumulative review request and `PROJECT_STATE.md` through Round 12, pending independent
review without claiming acceptance. Add all Round 12 paths and honest catalog, endpoint/caller,
fail-on-old, callable-cycle, SQL-scope, dynamic-domain, and census evidence. Mechanically reconcile
path, migration, commit, test, assertion, TypeScript/SQL, RPC-caller, and dependency counts.

Run focused Round 12 and cumulative high-risk suites; type-check; zero-warning lint; RLS scan;
three-zone full Vitest; build; fresh migration replay and full pgTAP; real anon/authenticated/service
function denials; rollback-only old RPC proof; all legitimate ledger writers; both concurrency
proofs; exact 117-test mandatory Chromium; price guard; analyzer mutation/nontermination proofs; and
exact inventory reconciliation. Record inherited deviations and remove temporary local state.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
