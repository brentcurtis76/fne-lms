# Z7 independent review — remediation round 1

## Control record

- Phase branch: `feat/zoom-hours`
- Immutable cumulative review base: `43999499`
- Audited implementation head: `73bce65ffcee75d7ab38a23e1cc526f352f35f37`
- Governing contracts: `CLAUDE.md`, `PROJECT_STATE.md`, `docs/plan/zoom/PLAN.md`
  §11 and §15.3, and `docs/plan/zoom/reviews/fase-7-review-request.md`
- Required next state: `REVIEW READY`, never `COMPLETE`

This round repairs the existing Z7 implementation. It does not reopen the phase plan,
authorize a new pairing heuristic, or permit changes to Zoom-derived billing. The
review boundary remains cumulative: `43999499..HEAD`.

## Blocking and required findings

### Z7-R1 — Payment still reads reserved hours (`BLOCKER`)

Z7 applies `effective_minutes` to school consumption, reports, and analytics, but the
consultant-payment path still sums `contract_hours_ledger.hours`:

- `supabase/migrations/00000000000000_baseline.sql` — `get_consultant_earnings`
- `pages/api/consultant-earnings/[consultant_id].ts` — direct breakdown queries/totals
- every PDF/export caller of that RPC or endpoint

An admin override 60→45 therefore consumes 45 minutes from the school while still
paying/reporting 60. That violates PLAN §11: one adjusted value drives both consumption
and consultant payment.

**Required:** inventory every session-hours consumer in SQL, `lib/`, and `pages/`.
Route every billable/payment/aggregate consumer through the same canonical derivation
`coalesce(effective_minutes / 60, hours)` and one rounding rule. Preserve `hours` only
where it is deliberately displayed as historical planned evidence. Do not edit the
baseline; replace affected RPCs at identical signatures in the existing unapplied Z7
migration or another additive Z7 migration, preserving grants and return shapes.

**Fail-on-old:** an admin override 60→45 must change school consumption, consultant
earnings totals, earnings breakdown, and RPC/PDF data to 45 exactly once. Reversal must
restore 60. Include a checked inventory of direct `contract_hours_ledger.hours` readers
and document every intentional exception.

### Z7-R2 — Ended-before-started occurrence loses its Zoom UUID (`BLOCKER`)

`lib/zoom/webhook-lifecycle.ts` passes the occurrence UUID for `meeting.started` but
passes `null` for `meeting.ended`. In the supported ended-before-started history the
late start is refused, so the occurrence remains UUID-less. Report-candidate selection
then excludes it and authoritative reconciliation never runs; the current instant test
incorrectly pins the null UUID as expected.

**Required:** let an ended event fill the occurrence UUID only when it is absent, without
allowing a later event to overwrite an established occurrence identity. Preserve the
no-retroactive-pairing and lifecycle-order rules.

**Fail-on-old:** ended-before-started persists the occurrence UUID, the later start does
not rewrite lifecycle instants, and the occurrence becomes eligible for report
reconciliation.

### Z7-R3 — Complete batches can starve unresolved candidates (`BLOCKER`)

`lib/zoom/attendance-report-store.ts` limits candidate rows before filtering occurrences
that already have a complete batch. If the first page is entirely complete, an older or
later unresolved occurrence beyond that page can be skipped forever until the age window
expires.

**Required:** select unresolved candidates in the database with deterministic ordering,
or paginate safely until the requested unresolved limit is filled. Do not load an
unbounded history into memory.

**Fail-on-old:** with more than one query-page of complete occurrences ahead of an
eligible unresolved occurrence, the unresolved occurrence is returned; ordering and
limit behavior are deterministic.

### Z7-R4 — Applying suggestions erases manual attendance metadata (`BLOCKER`)

`components/sessions/AttendanceSuggestionsPanel.tsx` submits only `user_id` and
`attended`, while `pages/api/sessions/[id]/attendees.ts` converts omitted
`arrival_status` and `notes` to null. Applying a Zoom suggestion can silently erase a
facilitator's manual arrival status and notes.

**Required:** make the mutation preserve omitted fields while retaining explicit-clear
semantics for clients that intentionally clear them. Keep one authorization decision and
avoid a client-side read/merge/write race. Update all affected clients/types.

**Fail-on-old:** applying present/absent suggestions preserves existing notes and arrival
status; explicit edits/clears through the normal attendance UI still work; authorization
and validation behavior remain unchanged.

### Z7-R5 — Hours comparison fabricates absence on database errors (`BLOCKER`)

`pages/api/admin/sessions/[id]/hours-comparison.ts` ignores errors from ledger,
facilitator, meeting, and override queries. It can return 200 with invented “no data” or
empty history when Supabase failed.

**Required:** check every query result and fail closed with the route's internal-error
response. Do not disclose raw database errors.

**Fail-on-old:** representative failures for each independently queried data source return
500 and never return a successful comparison payload.

### Z7-R6 — Retryable report-page failures leave batches pending (`REQUIRED`)

`lib/zoom/jobs/attendance-reconcile.ts` rejects a batch only when the page error is not a
`ZoomRetryableError`. After the Zoom client's own retry budget is exhausted, a retryable
transport/5xx failure still means this candidate fetch failed. PLAN §15.3.9 requires any
page failure to reject the entire batch.

**Required:** reject the batch for every terminal page-fetch failure, including exhausted
`ZoomRetryableError`, while preserving deliberate lease-loss behavior and idempotent
reprocessing.

**Fail-on-old:** an exhausted retryable error on any page marks the batch rejected and
promotes no rows; the job retry remains safe.

### Z7-R7 — Concurrent override request IDs are not idempotent (`REQUIRED`)

`apply_session_hour_override` checks `request_id` before taking its row locks and never
rechecks it. Two concurrent identical requests can both see no row and the loser can hit
the unique constraint as a 500. Concurrent differing payloads can also return 500 instead
of the contract's 409 conflict.

**Required:** serialize ownership of a request ID inside the transaction (for example,
with a transaction-scoped advisory lock), then perform/repeat the payload check under
that serialization before mutation. Preserve session/ledger locking, append-only audit,
actor binding, and the existing replay response.

**Fail-on-old:** two real concurrent connections using the same request ID and payload
produce one override row and two consistent successful responses; the same request ID
with different payloads produces one success and one 409-class conflict, never a raw
unique violation/500. Sequential replay must remain green.

## Scope and prohibitions

In scope: the minimum production code, SQL, synthetic tests, and Z7 review evidence needed
to close Z7-R1…Z7-R7, plus directly discovered defects in the same invariant paths. Report
a newly discovered contract conflict as `FINDINGS` rather than silently widening scope.

Out of scope: Z3b, recording/transcription/minutes work, unrelated RLS remediation,
feature-flag rollout, production schema application, real student data, and general
refactors. Never merge, push, deploy, call Vercel, access production, disable RLS, add a
destructive migration, or weaken a test to obtain green.

## Required gates and evidence

Run from a clean repair head and record exact commands/results in
`docs/plan/zoom/reviews/fase-7-review-request.md`:

1. focused fail-on-old regression suites for Z7-R1…Z7-R7;
2. `npm run type-check`;
3. `npm run lint` and advisory `npm run lint:testid`;
4. `npm test`;
5. `npm run build`;
6. `npm run test:db`;
7. `npm run e2e` because DB and UI behavior changed;
8. the PLAN §11 three-timezone test matrix. Any pre-existing Madrid failure must be
   reproduced unchanged on the immutable base and reported honestly, not called green.

Before stopping, update the phase review request with the new HEAD, commit count, files by
risk, exact suite counts, concurrency evidence, consumer inventory, limitations, and the
hardest areas for the independent reviewer. Commit everything. Return `REVIEW READY` with
HEAD, repair commits, gate evidence, deviations, and residual risks.
