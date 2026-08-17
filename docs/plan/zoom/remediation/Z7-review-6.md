# Z7 independent review — remediation round 6

## Control record

- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical head: `9aebca6c463be0d8a3bdc28705d56869887c7482`
- Rejected tree: `fe0693c783b6a68f8d11c5bd0868bc6aaee8bb6a`
- Independent decision: `REVISE`; this SHA is not accepted
- Control checks: exact ref/SHA/tree/base/40 commits/clean relevant worktrees passed
- Builder terminal state: `REVIEW READY`, never `COMPLETE`

The fifth cold review independently confirmed the round-five availability-outage fix, the
92-path cumulative inventory, the existing high-risk suites, build, pgTAP, static gates, and
the accepted classifications of the pre-existing non-transactional bulk residual and unmatched
attendance evidence. It found eight required gaps below. Resolve all of them cumulatively.

## Z7-R6.1 — Billable-minute overrides bypass the audited RPC (`BLOCKER`)

The Z7 migration says `effective_minutes` is written only through the audited override RPC,
but inherited admin UPDATE policy plus authenticated/service-role table grants permit direct
updates. Rollback-only SQL proved an authenticated admin could write `effective_minutes = 17`
without creating any `session_hour_overrides` event; both authenticated and service roles report
column UPDATE privilege.

**Required:** enforce at the database boundary that `effective_minutes` can change only through
the trusted audited apply/reverse path. Narrow column grants or use equivalent unforgeable
enforcement while preserving legitimate ledger lifecycle writes. Because the Z7 override migration
is still local-only/unapplied, it may be corrected consistently with project migration rules; do
not destructively alter a production database.

**Acceptance:** direct authenticated-admin and service-role updates fail and leave the value and
audit history unchanged. Apply and reverse RPCs still update atomically and append exactly one
event. Approval, cancellation, and reschedule ledger lifecycle operations remain green. Use real
rollback-only SQL and per-role assertions.

## Z7-R6.2 — Terminal attendance report batches are deletable (`BLOCKER`)

The terminality trigger protects UPDATE only, while service role receives DELETE privilege. A
rollback-only probe inserted a zero-participant complete batch, switched to service role, deleted
it successfully, and left zero rows. Rejected health/audit evidence is likewise deletable.

**Required:** add database-level DELETE protection, preferably making every batch row append-only,
while retaining the only valid state branches `pending -> complete | rejected`.

**Acceptance:** service-role DELETE of complete, rejected, and pending batches throws and preserves
the rows. A zero-row complete report remains authoritative and empty after the attempted delete.
Normal promotion/rejection and terminal UPDATE refusal remain green.

## Z7-R6.3 — Contradictory availability summaries authorize writes (`MAJOR`)

`getAvailableHours()` validates array shape and finite numeric fields but not uniqueness, ranges,
or arithmetic. The reviewer supplied allocated 10, reserved 5, consumed 3, available 100; the code
returned available and inserted an under-budget reservation.

**Required:** require exactly one matching non-null bucket; validate allowed numeric ranges and
canonical two-decimal coherence:

`available = allocated - reserved - consumed`

Negative coherent availability remains valid and must classify the new reservation over budget.

**Acceptance:** contradictory arithmetic, duplicate matching buckets, null/invalid rows, invalid
ranges, and excess precision return generic 500 at single and bulk boundaries with zero ledger or
status mutations. Valid positive, zero, and negative coherent summaries retain correct behavior.

## Z7-R6.4 — Reschedule availability fails open on a missing bucket (`MAJOR`)

The active `reschedule_session_with_hours` definition allows `v_available` to remain null, preserves
the previous over-budget flag, and still updates hours/snapshot/session time. A rollback-only probe
changed ledger hours 1.50 -> 2.00, snapshot 90 -> 120, and end time 10:30 -> 11:00 despite no matching
summary bucket.

**Required:** add a new additive identical-signature replacement migration that raises before any
write when a tracked contract/type bucket is missing, duplicated, malformed, or arithmetically
incoherent. Do not rewrite the historical, already-applied reschedule migration. Keep a genuine
no-ledger legacy session behavior explicit.

**Acceptance:** both production reschedule API paths return generic 500 with unchanged session
fingerprint, ledger fingerprint, and revision count for each invalid availability shape. Valid
under/over-budget, date-only, and genuine no-ledger legacy cases remain green. Use real pgTAP/RPC
assertions as well as API tests.

## Z7-R6.5 — Shared bulk balance uses binary floating-point subtraction (`MAJOR`)

Bulk approval subtracts decimal hours as JavaScript floats. With 0.60 available and three 12-minute
reservations (0.20 each), the third comparison observes 0.19999999999999996 and incorrectly marks
the row over budget.

**Required:** compare and accumulate canonical integer hundredths or an exact decimal representation.

**Acceptance:** 0.60 with three 12-minute reservations yields `[false, false, false]`; a fourth is
true. Cover zero, negative, boundary, and ordinary-duration cases without weakening shared-balance
ordering or availability preflight.

## Z7-R6.6 — Legacy-untracked exception accepts partially tracked sessions (`MAJOR`)

`prepareReservation()` skips billing when either `contrato_id` or `hour_type_key` is absent, and
session creation persists these independently. A partially populated contract session can therefore
be approved without a ledger reservation.

**Required:** both null is the only legitimate untracked/legacy form. Exactly one null is invalid.
Reject mismatched pairs during creation and approval, including bulk approval.

**Acceptance:** both-null approves without a ledger. Each XOR form returns validation failure in
creation, single approval, and bulk approval with zero ledger/status mutation. Fully tracked sessions
retain normal behavior.

## Z7-R6.7 — Consumer guard misses supported call shapes (`MINOR`, required)

The current scanner uses fixed roots and literal regexes. Independent mutations were invisible for
constant/dynamic table and RPC names, bracket calls, destructured callable methods, generic
`.from<T>()`/`.rpc<T>()`, new production roots, and unaliased/quoted SQL references. Its claimed
destructured-RPC case only destructures the result, not the callable.

The present literal census still appears correct (14 files/22 direct touches; 8 files/10 indirect
calls), but the fail-on-new guarantee and state/evidence claims are overstated.

**Required:** use TypeScript AST/symbol-aware discovery or conservatively fail all unclassified
nonliteral/alternate calls; derive the production boundary mechanically; strengthen SQL parsing for
unaliased and quoted references and transitive objects. Classify all current direct/indirect consumers.

**Acceptance:** mutation probes fail for constant and dynamic names, bracket calls, destructured
callables, generic calls, a newly created production root, unaliased SQL, quoted aliases, a synthetic
view, and transitive function use. No unsupported dynamic form may silently pass.

## Z7-R6.8 — Cumulative evidence contains stale counts (`MINOR`, required)

The review request retains a round-four sentence claiming 83 cumulative paths and a gate line saying
62/62, although the rejected head has an exact 92/92 inventory and 63/63 focused result.

**Required:** reconcile all cumulative statements rather than only the current headline. Update the
eventual round-six path inventory and gate counts mechanically, with zero stale contradictory claims.

**Acceptance:** exact cumulative Git/documented counts match with zero duplicates/differences; all
focused/full/gate counts agree with final-tree output; searches find no stale 83-path or 62/62 claims
presented as current evidence.

## Accepted residual classifications

Do not expand round six merely to redesign these accepted residuals:

- External balance can change between bulk preflight and insertion, and a later non-availability
  insert failure can leave earlier sequential inserts. This predates R5 and is non-blocking for Z7;
  a future transactional bulk-approval RPC is recommended.
- An unmatched report row may coexist with an absent-attendee suggestion. Under the current
  facilitator-confirmation contract, evidence remains visible and no write occurs until confirmation.

## Evidence and boundaries

Update `docs/plan/zoom/reviews/fase-7-review-request.md` cumulatively from the immutable base through
the eventual tree, adding all round-six paths, database-authority proofs, fail-on-old/mutation proofs,
consumer-guard mutations, and honest gate results. External dispatch remains authoritative for the
self-referential final canonical SHA. Update `PROJECT_STATE.md` to round-six review-ready/pending
independent review without claiming acceptance, merge, deployment, or production verification.

Run focused R6 and all prior high-risk suites; type-check; zero-warning lint; full Vitest; production
build; fresh local migration replay and full pgTAP; direct privilege/delete/reschedule rollback probes;
real override concurrency; mandatory 117-test Chromium; and UTC/America-Santiago/Europe-Madrid matrix.
Keep inherited advisory/broad-suite/timezone deviations explicit.

No merge, push, deployment, Vercel call, production/remote DB access, real data, destructive migration,
RLS disablement, test weakening, or unrelated refactor. Commit ordered code/tests/migrations/state/evidence
and return exact detached SHAs after the current builder head.
