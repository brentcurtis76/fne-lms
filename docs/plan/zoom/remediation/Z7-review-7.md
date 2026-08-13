# Z7 independent review — remediation round 7

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `9331cedb087ca7d97cc85ba5d32693234e99c65e`
- Rejected tree: `56c8997e71e35df6c9afaa785be7a4a993d19501`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/45 commits/clean relevant worktrees passed
- Cumulative inventory: 99 actual / 99 documented / zero differences or duplicates
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The sixth cold review independently confirmed the exact cumulative identity and inventory,
attendance-batch deletion and terminal authority, the broader rollback-only database suite, and
the focused and full Vitest gates. It found four remaining required gaps below. Resolve every
finding cumulatively without regressing any accepted R1–R6 invariant.

## Z7-R7.1 — Service role can forge override audit/idempotency records (`BLOCKER`)

`supabase/migrations/20260813120200_session_hour_overrides.sql` correctly restricts RPC execution
and direct `effective_minutes` updates, but `session_hour_overrides` retains direct `INSERT` for
`service_role`, which bypasses RLS. In a rollback-only probe the reviewer inserted a valid forged
event directly. A stronger probe pre-seeded the canonical request payload; the later authenticated
admin RPC returned `replay: true`, `applied: false`, and `new_minutes: 45` while the ledger still
had `effective_minutes = NULL`.

This permits service code to forge actor/history, poison an idempotency key, suppress a legitimate
adjustment, or disrupt reversal ordering.

**Required:** add a new additive migration revoking `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and
`TRIGGER` on `session_hour_overrides` from `PUBLIC`, `anon`, `authenticated`, and `service_role`.
Preserve required `SELECT` access. The owner-executed `SECURITY DEFINER` RPC must remain the sole
writer. Do not rewrite a migration already represented in the local cumulative history.

**Acceptance:** constrained direct inserts fail for every exposed role. A service-role poisoning
attempt cannot reserve a request ID; the subsequent authenticated-admin RPC applies, updates the
ledger, and creates exactly one actor-bound event. Retain all current apply/reverse, idempotency,
effective-minutes denial, concurrency, and legitimate lifecycle-column tests. Prove privileges and
behavior with real rollback-only SQL.

## Z7-R7.2 — Tracked no-ledger sessions are treated as legacy (`MAJOR`)

`supabase/migrations/20260813120300_reschedule_availability_guard.sql` returns
`no_ledger_entry` unconditionally when the ledger lookup finds no row; it never checks the
session's contract/hour-type pair. The reviewer created a fully tracked `programada` session with
no ledger, rescheduled it from 90 to 120 minutes, and observed `no_ledger_entry`, a changed session,
and zero ledger/revision rows. Without rollback, the inconsistent change would commit.

**Required:** add a new additive, identical-signature replacement of the reschedule function.
Permit `no_ledger_entry` only when both tracking columns are null. Both-present and either XOR
no-ledger state must raise before the wrapper can commit. Preserve the migration's signature,
security, grants, and safe `search_path` behavior.

**Acceptance:** the direct function and both production wrapper/API call paths reject fully tracked
and both XOR no-ledger duration changes, with the complete session fingerprint, ledger fingerprint,
and revision count byte-identical. Both-null legacy, date-only, valid under-budget, and valid
over-budget cases remain green. Exercise the real function/RPC in rollback-only pgTAP as well as API
tests, and include an honest fail-on-old proof.

## Z7-R7.3 — TypeScript consumer discovery has silent false negatives (`MINOR`, required)

The checked-in discovery function in
`__tests__/lib/services/ledger-hours-reader-inventory.test.ts` silently misses or incompletely
classifies supported production call shapes. Independent execution showed:

- `s.from(target)` records a call without a target and without `unsupported`;
- `s[method](target)` produces no discovered call;
- `const {'from': readTable} = s; readTable(...)` produces no discovered call.

The receiver-name regex is not symbol-aware. The dynamic allowlist also stores only
`file:method:error`; changing a supposedly closed dynamic source value to
`contract_hours_ledger` leaves that key unchanged and remains green. The current literal census
appears accurate, but the advertised fail-on-new guarantee is not.

**Required:** use symbol-aware receiver/callable resolution or conservatively reject every
unresolved form. Validate the finite values behind each allowed dynamic call, support quoted
destructuring, and include production JavaScript/JSX or explicitly fail if it exists. Keep production
root discovery mechanical and classification fail-closed.

**Acceptance:** independent mutation probes fail for short and renamed receivers, computed callable
names, quoted/destructured callables, scope-shadowed constants, each allowed dynamic source changed
to the ledger, and production JS/JSX/new roots. No unresolved target or callable may silently pass.
Retain all existing constant, dynamic, bracket, destructured, generic, root, RPC, and classification
probes.

## Z7-R7.4 — SQL guard misses genuinely unqualified `hours` (`MINOR`, required)

The SQL discovery code in `ledger-hours-reader-inventory.test.ts` returns zero uses for
`SELECT hours FROM public.contract_hours_ledger`. The existing probe described as unaliased is
actually table-qualified (`contract_hours_ledger.hours`). An unqualified raw-hours read inside an
already classified SQL object can therefore evade the exact count.

**Required:** recognize unqualified `hours` within ledger-backed query scopes and replace the
misleading probe. Keep alias-independent, quoted, CTE, function/view, and transitive discovery.

**Acceptance:** mutations for unqualified, table-qualified, quoted, arbitrary-alias, CTE, direct
function/view, and transitive function uses all fail. Correct the overstated SQL-guard claim in
`docs/plan/zoom/reviews/fase-7-review-request.md` and any related state/evidence.

## Accepted residual classifications

Do not expand round seven merely to redesign these already accepted residuals:

- External balance can change between bulk preflight and insertion, and a later non-availability
  insert failure can leave earlier sequential inserts. A future transactional bulk-approval RPC is
  recommended, but that redesign is outside Z7 acceptance.
- An unmatched report row may coexist with an absent-attendee suggestion. Under the current
  facilitator-confirmation contract, evidence remains visible and no write occurs until confirmation.

## Evidence and boundaries

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from the immutable base through
the eventual tree, adding every round-seven path and all privilege, no-ledger, and discovery
challenge evidence. Update every mechanical inventory/count and eliminate stale or overstated
claims. External dispatch remains authoritative for the self-referential final canonical SHA.

Update `PROJECT_STATE.md` to round-seven review-ready/pending independent review without claiming
acceptance, merge, deployment, or production verification.

Run focused R7 and all prior high-risk suites; type-check; zero-warning lint; full Vitest; production
build; fresh local migration replay and full pgTAP; constrained privilege/poisoning/no-ledger
rollback probes; real override concurrency; mandatory 117-test Chromium; and the
UTC/America-Santiago/Europe/Madrid matrix. Retain inherited advisory, broad-suite, and timezone
deviations honestly. Any skipped persistent-state workflow must be explicit and must not be used to
override required findings.

No merge, push, deployment, Vercel call, production/remote database access, real data, destructive
migration, RLS disablement, test weakening, or unrelated refactor. Commit ordered
code/tests/migrations/state/evidence and return exact detached SHAs after the current builder head.
