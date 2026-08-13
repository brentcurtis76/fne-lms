# Zoom phase Z7 — cumulative independent review request

## Control record

- Builder state: `REVIEW READY`; this document is evidence, not an acceptance verdict.
- Canonical branch: `feat/zoom-hours`.
- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`.
- Rejected round-seven canonical head: `9331cedb087ca7d97cc85ba5d32693234e99c65e`
  (45 commits from the base; tree `56c8997e71e35df6c9afaa785be7a4a993d19501`).
  It is a rejected review point, not acceptance evidence.
- Detached round-seven starting point: `65a4cf56d751a40a9b82d8f1a438f7a110b75114`
  (45 commits; tree-equivalent to the rejected canonical head before the new contract).
- Detached round-seven contract cherry-pick: `12605b2799d06463bb27ca18ee77b04bc7544bb0`
  (46 commits).
- Detached round-seven implementation: `71cfe1c9d90d0278bdf5eb2e57b10b321fe9b42e`
  (47 commits).
- Detached round-seven state reconciliation: `71ab2a97f3f419bd2243ac477b91d482b7b9afa4`
  (48 commits).
- This evidence document is the 49th cumulative detached commit. A commit cannot truthfully embed
  its own identity; its exact detached SHA is supplied in the builder handoff. The external review
  dispatch must pin the post-cherry-pick canonical HEAD (`CANONICAL_HEAD_PENDING_INTEGRATION`).
- Review boundary: `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`.

There is no recursive HEAD placeholder in this artifact. A commit cannot contain its own SHA,
and cherry-picking changes detached commit identities. All embedded SHAs above are already stable
objects with counts verified by `git rev-list --count 43999499..<sha>`.

Ordered detached commits after `65a4cf56d751a40a9b82d8f1a438f7a110b75114`:

1. `12605b2799d06463bb27ca18ee77b04bc7544bb0` — round-seven contract cherry-pick.
2. `71cfe1c9d90d0278bdf5eb2e57b10b321fe9b42e` — audit-writer privileges, tracked/XOR reschedule replacement, conservative TS/JS and SQL guards, and regressions.
3. `71ab2a97f3f419bd2243ac477b91d482b7b9afa4` — round-seven project-state reconciliation.
4. This evidence commit — exact detached SHA in the builder handoff.

## Objective, delivered scope, and current status

PLAN §11 remains the governing objective: planned time is billed and paid unless an authenticated
admin explicitly writes an audited override; Zoom elapsed/presence is comparison evidence only;
the same effective minutes feed school consumption and consultant payment. PLAN §15.3 delivered
the attendance schema and lifecycle instants, participant ingestion, authoritative report
reconciliation, append-only override machinery, comparison/override UI, and facilitator
attendance suggestions.

Z7 is implemented on the feature branch but remains in independent remediation/re-review. It is
not accepted, merged, deployed, or production-verified. All nine Z7 migrations have been replayed
only against the local Supabase stack; production application and read-only verification remain a
human-controlled post-merge step.

Out of scope remains recording/transcription/minutas/consent, Z3b Client View, unrelated RLS
remediation, the Vitest upgrade, leadership aggregates, deployments, production data/schema, and
unrelated refactors.

## Finding disposition

### Round seven

| Finding | Disposition and evidence |
|---|---|
| Z7-R7.1 | Additive migration `20260813120400_override_audit_write_privileges.sql` revokes `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` on `session_hour_overrides` from `PUBLIC`, `anon`, `authenticated`, and `service_role`, while preserving the required reads. The owner-executed `SECURITY DEFINER` apply/reverse RPCs remain the only writers. pgTAP uses real exposed roles to prove direct poisoning and every other mutation fail; the same request ID is then applied by an authenticated admin, mutates the ledger once, and creates exactly one actor-bound event. Apply/reverse, lifecycle writes, replay, conflict, and real concurrency remain green. |
| Z7-R7.2 | Additive identical-signature migration `20260813120500_reschedule_tracking_pair_guard.sql` replaces the R6 reschedule definition without rewriting history. `no_ledger_entry` is reachable only when both tracking columns are null; fully tracked sessions and either XOR shape raise before direct or wrapper commit when no ledger row exists. pgTAP and both API paths compare byte-identical session, ledger, and revision state. Both-null legacy, date-only, valid under-budget, and coherent over-budget paths remain green. |
| Z7-R7.3 | The executable source guard now resolves Supabase-style calls independent of receiver spelling, including computed/quoted/destructured callables, constants, generics, multiline calls, and lexical shadowing; unresolved methods or targets fail closed. It scans every production `.ts`, `.tsx`, `.js`, and `.jsx` root while excluding test roots. Four dynamic production forms are exact finite allowlists whose live literals are mutation-probed, and synthetic JS/JSX roots prove new-root discovery. |
| Z7-R7.4 | SQL discovery counts qualified, quoted, arbitrary-alias, truly unqualified, CTE-backed, function, view, and transitive ledger-hours uses. Executable mutations prove each form reaches the guard, while exact maps reject unexplained migration expressions or dependency objects. The corrected census below replaces all stale earlier counts and claims. |

### Round six

| Finding | Disposition and evidence |
|---|---|
| Z7-R6.1 | `effective_minutes` is no longer directly updateable by either `authenticated` or `service_role`. The additive migration revokes table-wide update and dynamically grants only the other live columns; audited apply/reverse remain `SECURITY DEFINER`, atomic, and green. pgTAP and real-role probes prove direct updates fail while ordinary lifecycle writes and one-row audit insertion still work. |
| Z7-R6.2 | Attendance report batches reject every `DELETE`, including pending, complete, and rejected rows, with stable SQLSTATE `P0409`. The same trigger retains only `pending -> complete | rejected`, and an authoritative zero-participant complete report remains valid. pgTAP verifies all terminal branches and referential rows remain intact. |
| Z7-R6.3 | Availability requires exactly one coherent bucket: unique nonempty identity, finite values, range and two-decimal constraints, and exact `allocated - reserved - consumed = available` arithmetic in integer hundredths. Empty is a typed legitimate direct-lookup result; approval after a proven allocation treats missing as inconsistent. Every invalid shape returns generic 500 before ledger/session mutation in single and bulk paths. A coherent negative balance remains valid and over budget. |
| Z7-R6.4 | New additive migration `20260813120300_reschedule_availability_guard.sql` replaces `reschedule_session_hours(uuid, uuid)` with the identical signature. Duration-changing tracked reschedules raise before any session, ledger, or revision write on missing, duplicate, malformed, or incoherent buckets. Date-only changes and genuinely untracked legacy sessions retain their prior behavior. API regressions and pgTAP check both wrapper paths and the real active SQL fingerprint; the historical applied migration was not edited. |
| Z7-R6.5 | Bulk shared balances are integer hundredths end-to-end. A 0.60 balance accepts exactly three ordered 0.20 reservations and marks only the fourth over budget; a fail-on-old binary-float mutation marks the third incorrectly and makes the regression red. |
| Z7-R6.6 | The contract/type pair is now a single invariant: both null is the only legacy form, or both values must be valid. XOR and malformed values fail creation with 400 and fail single/bulk approval before any ledger, facilitator, Zoom, or session mutation. |
| Z7-R6.7 | Round six introduced AST/exact-map discovery, but its receiver dependence, scope resolution, JavaScript-root, and unqualified SQL gaps were later found by independent review. Round seven supersedes that implementation and its evidence claim with the conservative source and SQL guard, finite allowlists, mutation probes, and exact current census below. |
| Z7-R6.8 | This artifact derives its cumulative inventory mechanically from immutable base `4399949942bfcf49dfa8de40cbf7edbf40f0490e`, records only stable predecessor SHAs, and delegates the evidence commit and post-cherry-pick canonical identities to the handoff/dispatch. Current gate, path, migration, assertion, and consumer counts below supersede the older round-specific counts. `PROJECT_STATE.md` now identifies Round 6 as implemented and pending independent review, never accepted/deployed. |

### Round five

| Finding | Disposition and evidence |
|---|---|
| Z7-R5.1 | Availability now has a discriminated `available | missing` result and throws on RPC/shape/numeric dependency failures. A successful empty summary is legitimate for a direct lookup; approval first proves a matching allocation exists, so a missing summary bucket at that boundary is contradictory and fails closed. Single approval returns generic 500 before session mutation. Bulk approval preflights every session before the first ledger insert, so a later outage cannot partially reserve or approve earlier items; it then debits the shared preflight balance in source order so later same-allocation rows retain sequential over-budget semantics. Route regressions cover single/bulk outage, valid under/over-budget reservations, shared-balance ordering, and a legacy untracked session as the defined approval-without-ledger case. |
| Z7-R5.2 | Round five expanded the inventory to production roots, direct table touches, SQL functions/views, and indirect calls. Round six supersedes its incomplete SQL syntax census with the exact AST/SQL maps below, including newly introduced roots and conservative unsupported-dynamic handling. |
| Z7-R5.3 | `PROJECT_STATE.md` now routes reviewers to Round 5 and states `REVIEW READY` pending another cumulative independent verdict. It explicitly preserves not accepted, not merged, not deployed, local-only migrations, and not production-verified. |
| Z7-R5.4 | Reconcile comments now describe two global hourly jobs plus per-occurrence attendance candidates/dedupe. Webhook comments accurately describe meeting lifecycle/projection handling, provisional joined/left attendance, ledger-only events, and the no-job-enqueue boundary. Existing cron/webhook suites remain green. |

### Round four

| Finding | Disposition and evidence |
|---|---|
| Z7-R4.1 | Both the live adapter and pure reconciliation now require finite integers; `1 <= page_size <= 100`; nonnegative `page_count`/`total_records`; `page_count = 0` only for the valid zero-record envelope and otherwise `ceil(total_records/page_size)`; stable metadata across pages; exact fetched-page and participant counts; per-page cardinality; and a nonempty token until the declared terminal page followed by an empty token. Invalid numeric metadata maps to `invalid_pagination_metadata`; coherent-number contradictions map to `contradictory_pagination_metadata`, `page_count_mismatch`, or `participant_count_mismatch`. Job regressions prove exactly one rejection, zero promotion, and preservation of an earlier complete batch. Valid 230-row multipage and zero-participant envelopes remain green. |
| Z7-R4.2 | The JSON ledger endpoint resolves `session_facilitators` before constructing the ledger query. An errored scope lookup returns a generic 500 and never runs or returns the ledger; a successful zero-row lookup returns 200 empty; successful nonempty scope remains constrained by the facilitated session IDs. Three route tests exercise all branches. |
| Z7-R4.3 | Round four introduced the direct-use audit, but its first census was incomplete/overcounted. Rounds five and six replaced it with the exact direct-and-transitive executable census below; only that current census should be used for review. |
| Z7-R4.4 | The report-batch migration now documents the lifecycle as the two terminal branches `pending -> complete | rejected`; SQL constraints/RPCs and pgTAP continue to enforce that neither terminal state can transition or be rewritten. The mechanically regenerated cumulative inventory below supersedes the earlier round-four boundary inventory. |

### Earlier rounds retained cumulatively

- R1 active financial calculations all use the effective-minute derivation; deliberate raw-hours
  admin displays remain historical evidence. Lifecycle/report mutations are
  database-atomic, comparison dependencies fail closed, retryable report candidates resolve, and
  override request IDs serialize at PostgreSQL.
- R2 occurrence UUIDs fill only while missing; report batches resolve once; canonical override
  payload equality is database-derived; pagination tokens are bounded; financial lookups fail
  closed; comparison paths are mutation-sensitive and billing-isolated; override inputs validate
  UUID/integer bounds; and page-cap candidates reject once.
- The round-three participant guard closes the last reviewed path that could bypass terminal batch
  resolution after a syntactically valid but runtime-malformed Zoom response.
- Round four closes numeric/range/cross-field pagination integrity, the JSON ledger's facilitator
  lookup, and the misleading linear lifecycle comment. Round five closes availability failures
  before financial/approval mutation and expands the direct/transitive production-consumer
  inventory. Round six makes that inventory syntax/root conservative, enforces exact coherent
  availability and contract/type pairs, protects override/report state at the database boundary,
  and installs the additive reschedule replacement. Round seven makes the override event table
  RPC-writer-only even for `service_role`, closes tracked/XOR no-ledger reschedules in a new
  replacement, and supersedes the source/SQL guard with the conservative executable census below.

## Production `contract_hours_ledger.hours` direct-and-transitive inventory

The executable guard treats every production table touch as reviewable, including status-only and
write exceptions; this prevents a future raw-hours reader from hiding in a query that was assumed
irrelevant. Classifications below are in source order when a file touches the table more than once.

| Production TypeScript path | Touches | Classification and justification |
|---|---:|---|
| `components/workspace/WorkspaceSessionsTab.tsx` | 1 | `status-only`: reads ledger status to decorate session rows; no hours number enters a calculation. |
| `lib/services/hour-tracking.ts` | 6 | `write`, `status-only`, `write`, `status-only`, `write`, `write`: reservation/cancellation lifecycle persistence; no reporting calculation reads raw hours. |
| `lib/services/school-hours-report.ts` | 1 | `billable`: selects `hours` + `effective_minutes` and calls `billableHours` for the school drill-down. |
| `pages/admin/sessions/index.tsx` | 1 | `status-only`: presence/status decoration, no hours number. |
| `pages/api/admin/consultant-rates/[id].ts` | 2 | `status-only`, `status-only`: guards rate mutation/deletion against ledger existence/status. |
| `pages/api/admin/sessions/[id]/hours-comparison.ts` | 1 | `historical`: admin comparison exposes raw planned ledger hours beside effective minutes; it does not bill or pay. |
| `pages/api/consultant-earnings/[consultant_id].ts` | 1 | `billable`: earnings breakdown uses `billableHours`; Zoom observations never enter the input. |
| `pages/api/contracts/[id]/hours/allocate.ts` | 1 | `status-only`: allocation safety check only. |
| `pages/api/contracts/[id]/hours/ledger/[ledgerId].ts` | 2 | `status-only`, `write`: row lookup and administrative mutation. |
| `pages/api/contracts/[id]/hours/ledger/csv.ts` | 1 | `billable`: export uses `billableHours`. |
| `pages/api/contracts/[id]/hours/ledger/index.ts` | 2 | `historical`, `write`: raw administrative ledger listing and manual-entry creation; it is not an aggregate/payment calculation. Consultant scope now fails closed before the historical read. |
| `pages/api/sessions/[id]/approve.ts` | 1 | `write`: approval creates the reservation row. |
| `pages/api/sessions/reports/analytics.ts` | 1 | `aggregate`: hours KPI uses `billableHours(..., 'charged_total')`. |
| `pages/consultor/sessions/index.tsx` | 1 | `status-only`: ledger status only. |

Indirect calls are discovered from the SQL dependency graph rather than a hand-written RPC-name
regex. `fail-closed` means an error cannot authorize a write or return an incomplete authoritative
financial result; `non-authoritative` means the value cannot authorize or settle a financial write.

| Production TypeScript path | Calls | Classification and authority |
|---|---:|---|
| `lib/services/hour-tracking.ts` | 2 | `get_bucket_summary`: write precondition, fail closed; `apply_session_reschedule`: write, fail closed. |
| `lib/services/school-hours-report.ts` | 1 | `get_bucket_summary`: aggregate, fail closed. |
| `pages/admin/sessions/create.tsx` | 1 | `get_bucket_summary`: financial preview, non-authoritative. |
| `pages/api/admin/sessions/[id]/hour-override.ts` | 1 | `apply_session_hour_override`: authenticated admin database write, fail closed. |
| `pages/api/consultant-earnings/[consultant_id].ts` | 1 | `get_consultant_earnings`: billable, fail closed. |
| `pages/api/consultant-earnings/[consultant_id]/pdf.ts` | 1 | `get_consultant_earnings`: billable, fail closed. |
| `pages/api/contracts/[id]/hours/index.ts` | 1 | `get_bucket_summary`: aggregate, fail closed. |
| `pages/api/contracts/[id]/hours/reallocate.ts` | 2 | First `get_bucket_summary`: write precondition, fail closed; second: post-write display, non-authoritative. |

The AST scan reports unsupported dynamic callables and targets instead of silently skipping them.
Its complete current allowlist is: `lib/propuestas/scripts/seed-db.ts` (five proposal seed tables),
`lib/zoom/attendance-store.ts` (`meeting_attendees` or `session_attendees`),
`utils/meetingUtils.ts` (`meeting_commitments` or `meeting_tasks`), and `hooks/useUrlState.ts`
(`push` or `replace` on the Next router). None can resolve to a financial table or database
callable. Every exact finite value set has an executable ledger-value mutation; any new dynamic
callable/target or changed literal makes the guard red until classified.

| Production SQL migration path | Expressions | Classification and justification |
|---|---:|---|
| `supabase/migrations/00000000000000_baseline.sql` | 6 | `historical` x6: immutable baseline definitions, superseded by later active functions. |
| `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` | 5 | `historical` x5: first reschedule definition, superseded by later identical-signature replacements. |
| `supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql` | 2 | `historical` x2: intermediate bucket aggregate, superseded by the Z7 override-aware definition. |
| `supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 3 | `historical`, `historical`, `write`: superseded duration/bucket reads and its ledger update; it is retained as immutable migration history. |
| `supabase/migrations/20260813120200_session_hour_overrides.sql` | 5 | `aggregate`, `aggregate`, `billable`, `billable`, `billable`: active school reserved/consumed aggregates and consultant-payment branches use `COALESCE(round(effective_minutes / 60, 2), hours)`. Comments are stripped before counting. |
| `supabase/migrations/20260813120300_reschedule_availability_guard.sql` | 2 | `historical`, `write`: superseded R6 reschedule read/write retained as immutable migration history. |
| `supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql` | 2 | `historical`, `write`: active reschedule reads planned ledger hours and writes its replacement planned value; neither use is post-session Zoom billing. |

The recursive SQL-object census is separately exact because a function or view can hide a ledger
dependency without spelling the table name at its TypeScript call site.

| Migration | Ledger-backed definitions | Classification and dependency |
|---|---:|---|
| `00000000000000_baseline.sql` | 2 | Historical direct definitions of `get_bucket_summary` and `get_consultant_earnings`. |
| `20260805120000_reschedule_hours_rpc.sql` | 1 | Historical direct `reschedule_session_hours`. |
| `20260808120000_session_reschedule_atomic.sql` | 1 | Write/fail-closed `apply_session_reschedule`, transitively ledger-backed. |
| `20260809120000_fix_bucket_summary_fanout.sql` | 1 | Historical direct `get_bucket_summary`. |
| `20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 1 | Write/fail-closed direct `reschedule_session_hours`. |
| `20260813120200_session_hour_overrides.sql` | 3 | Direct `apply_session_hour_override` write/fail-closed, `get_bucket_summary` aggregate, and `get_consultant_earnings` billable definitions. |
| `20260813120300_reschedule_availability_guard.sql` | 1 | Superseded write/fail-closed direct `reschedule_session_hours` replacement. |
| `20260813120500_reschedule_tracking_pair_guard.sql` | 1 | Active write/fail-closed direct `reschedule_session_hours` replacement. |

The only active financial formulas are the shared TypeScript `billableHours` derivation and the SQL
coalesce twin above. Raw admin ledger/comparison reads are intentional historical evidence, writes
are lifecycle operations, and status-only queries do not calculate a monetary or consumption value.
The executable maps therefore cover 14 direct production source files/22 touches, 8 indirect
production source files/10 calls, 7 SQL files/25 uncommented raw-hours expressions, and 8 migration files/11
ledger-backed definitions, with zero unexplained uses.

## Mechanically complete cumulative file inventory

The following inventory has exactly one entry for every path changed from the immutable base.
Risk grouping describes review priority, not ownership.

<!-- CUMULATIVE_INVENTORY_START -->

### Highest risk — schema, RLS, database state machines, and concurrency

- `scripts/ci/override-concurrency-proof.mjs`
- `supabase/migrations/20260811130000_zoom_attendance.sql`
- `supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql`
- `supabase/migrations/20260812120000_zoom_attendance_participant_uuid.sql`
- `supabase/migrations/20260813120000_zoom_attendance_observations.sql`
- `supabase/migrations/20260813120100_zoom_attendance_report_batches.sql`
- `supabase/migrations/20260813120200_session_hour_overrides.sql`
- `supabase/migrations/20260813120300_reschedule_availability_guard.sql`
- `supabase/migrations/20260813120400_override_audit_write_privileges.sql`
- `supabase/migrations/20260813120500_reschedule_tracking_pair_guard.sql`
- `supabase/tests/002-zoom-internal-isolation.sql`
- `supabase/tests/011-zoom-public-rls.sql`
- `supabase/tests/013-session-reschedule-atomic.sql`
- `supabase/tests/015-session-hour-overrides.sql`

### Highest risk — Zoom ingestion, report authority, and lifecycle runtime

- `lib/zoom/api.ts`
- `lib/zoom/attendance-effective.ts`
- `lib/zoom/attendance-identity.ts`
- `lib/zoom/attendance-intervals.ts`
- `lib/zoom/attendance-report-store.ts`
- `lib/zoom/attendance-report.ts`
- `lib/zoom/attendance-store.ts`
- `lib/zoom/fake.ts`
- `lib/zoom/jobs/attendance-reconcile.ts`
- `lib/zoom/jobs/registry.ts`
- `lib/zoom/jobs/webhook-sweep.ts`
- `lib/zoom/participant-lifecycle.ts`
- `lib/zoom/webhook-lifecycle.ts`
- `lib/zoom/webhook-store.ts`

### High risk — billing consumers, APIs, and product surfaces

- `components/sessions/AttendanceSuggestionsPanel.tsx`
- `components/sessions/HoursComparisonPanel.tsx`
- `lib/services/billable-hours.ts`
- `lib/services/hour-tracking.ts`
- `lib/services/school-hours-report.ts`
- `lib/types/consultor-sessions.types.ts`
- `lib/types/hour-tracking.types.ts`
- `pages/admin/sessions/[id].tsx`
- `pages/api/admin/sessions/[id]/hour-override.ts`
- `pages/api/admin/sessions/[id]/hours-comparison.ts`
- `pages/api/consultant-earnings/[consultant_id].ts`
- `pages/api/contracts/[id]/hours/ledger/csv.ts`
- `pages/api/contracts/[id]/hours/ledger/index.ts`
- `pages/api/cron/zoom-reconcile.ts`
- `pages/api/sessions/[id]/approve.ts`
- `pages/api/sessions/[id]/attendance-suggestions.ts`
- `pages/api/sessions/[id]/attendees.ts`
- `pages/api/sessions/bulk-approve.ts`
- `pages/api/sessions/index.ts`
- `pages/api/sessions/reports/analytics.ts`
- `pages/api/zoom/webhook.ts`
- `pages/consultor/sessions/[id].tsx`

### Executable regression and integration coverage

- `__tests__/api/admin/hour-override.test.ts`
- `__tests__/api/admin/hours-comparison.test.ts`
- `__tests__/api/cron/zoom-reconcile.test.ts`
- `__tests__/api/hour-tracking/earnings-pdf.test.ts`
- `__tests__/api/hour-tracking/earnings.test.ts`
- `__tests__/api/hour-tracking/ledger-csv.test.ts`
- `__tests__/api/hour-tracking/ledger-json.test.ts`
- `__tests__/api/hour-tracking/planned-minutes-snapshot.test.ts`
- `__tests__/api/hour-tracking/reservation.test.ts`
- `__tests__/api/sessions/reschedule-hours-sync.test.ts`
- `__tests__/api/sessions/session-approval-hours-fail-closed.test.ts`
- `__tests__/api/sessions/session-approve-zoom-provision.test.ts`
- `__tests__/api/sessions/session-bulk-approve-zoom-provision.test.ts`
- `__tests__/api/sessions/session-create-facilitators.test.ts`
- `__tests__/api/sessions/attendance-suggestions.test.ts`
- `__tests__/api/sessions/attendees.test.ts`
- `__tests__/api/sessions/session-reports-analytics.test.ts`
- `__tests__/api/zoom/webhook.test.ts`
- `__tests__/components/sessions/AttendanceSuggestionsPanel.test.tsx`
- `__tests__/components/sessions/HoursComparisonPanel.test.tsx`
- `__tests__/lib/services/billable-hours.test.ts`
- `__tests__/lib/services/comparison-billing-isolation.test.ts`
- `__tests__/lib/services/ledger-hours-reader-inventory.test.ts`
- `__tests__/lib/services/school-hours-report.test.ts`
- `__tests__/lib/zoom/attendance-effective.test.ts`
- `__tests__/lib/zoom/attendance-identity.test.ts`
- `__tests__/lib/zoom/attendance-intervals.test.ts`
- `__tests__/lib/zoom/attendance-report-store.test.ts`
- `__tests__/lib/zoom/attendance-report.test.ts`
- `__tests__/lib/zoom/attendance-store.test.ts`
- `__tests__/lib/zoom/fake.test.ts`
- `__tests__/lib/zoom/jobs/attendance-reconcile.test.ts`
- `__tests__/lib/zoom/jobs/webhook-sweep.test.ts`
- `__tests__/lib/zoom/participant-lifecycle.test.ts`
- `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts`
- `__tests__/lib/zoom/webhook-store.test.ts`

### Governance, contracts, prompts, state, and review evidence

- `PROJECT_STATE.md`
- `docs/plan/zoom/LEDGER.md`
- `docs/plan/zoom/PLAN.md`
- `docs/plan/zoom/prompts/Z7-r1.md`
- `docs/plan/zoom/prompts/Z7-r2.md`
- `docs/plan/zoom/prompts/Z7-r5.md`
- `docs/plan/zoom/remediation/Z7-review-1.md`
- `docs/plan/zoom/remediation/Z7-review-2.md`
- `docs/plan/zoom/remediation/Z7-review-3.md`
- `docs/plan/zoom/remediation/Z7-review-4.md`
- `docs/plan/zoom/remediation/Z7-review-5.md`
- `docs/plan/zoom/remediation/Z7-review-6.md`
- `docs/plan/zoom/remediation/Z7-review-7.md`
- `docs/plan/zoom/reviews/fase-7-review-request.md`
- `docs/plan/zoom/reviews/fase-7-review-verdict.md`

### Build/test configuration

- `package.json`

<!-- CUMULATIVE_INVENTORY_END -->

Mechanical proof command, run after staging this document and again after committing it:

```bash
comm -3 \
  <(git diff --name-only 4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD | sort) \
  <(sed -n '/CUMULATIVE_INVENTORY_START/,/CUMULATIVE_INVENTORY_END/p' \
      docs/plan/zoom/reviews/fase-7-review-request.md \
    | sed -n 's/^- `\(.*\)`$/\1/p' | sort)
```

Result after the evidence commit: no output. Counts: cumulative diff **102**, inventory **102**,
duplicates **0**.

## Gate and fail-on-old evidence

All database/browser runs used the local Supabase stack and synthetic fixtures. No command was
piped through `tail`.

| Command | Result | Exit |
|---|---|---:|
| `npx vitest run __tests__/lib/services/ledger-hours-reader-inventory.test.ts __tests__/api/sessions/reschedule-hours-sync.test.ts` | Round-seven source/SQL and both-API reschedule focus: 2 files, **34 green** | 0 |
| Focused inherited high-risk Vitest command over reservation, snapshot, JSON ledger, single approval, creation, reschedule, override, inventory, billable/isolation, cron/webhook, report/store/reconcile, and participant-lifecycle suites | 16 files, **251 green** | 0 |
| Focused PostgreSQL state/privilege/reschedule set: `013-session-reschedule-atomic.sql`, `015-session-hour-overrides.sql` | **174 assertions green**; direct/wrapper pair guard **80**, privilege/audit writer boundary **94** | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no RLS disablement | 0 |
| `TZ=America/Santiago npm test` | 323 files, **7,361 green / 11 skipped** | 0 |
| `npm run build` | production build; **156/156 static pages** | 0 |
| Fresh local `supabase db reset` | all migrations through additive `20260813120500` replayed | 0 |
| `npm run test:db` | 12 files, **761 assertions green** | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; forged/different payloads `P0409` sequentially and concurrently; no `23505` | 0 |
| Fresh local `supabase db reset`; local-CLI URL/keys supplied to `node scripts/ci/seed-e2e.mjs`; `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npm test` | 323 files, **7,361 green / 11 skipped** | 0 |
| `TZ=Europe/Madrid npm test` | **7,353 green / 8 failed / 11 skipped** in 323 files; all 8 are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |

Round-seven mutation/fail-on-old evidence was uncommitted, run only against the local worktree and
local PostgreSQL, and exactly restored before the recorded green gates:

- Reapplying the rejected R6 reschedule definition over the local R7 replacement made
  `013-session-reschedule-atomic.sql` fail **14/80**. Fully tracked and both XOR no-ledger direct
  and wrapper calls did not raise; session state moved from `10:30/90` to `11:00/120`. Reapplying
  `20260813120500` restored **80/80** with byte-identical failure state and the valid legacy paths.
- Granting `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` back to the exposed roles made
  `015-session-hour-overrides.sql` fail **23/94**. A direct `service_role` insert reserved the
  request ID, the later admin RPC could not apply, and mutation/privilege probes were red.
  Reapplying `20260813120400` restored **94/94**, including the later one-mutation/one-actor-event
  admin application after the failed poison attempt.
- Restoring the receiver-name heuristic made the 8-test source/SQL guard suite fail two tests:
  it missed the renamed `s.from(target)` form and the new production JS/JSX root. Restoring the
  symbol-independent discovery returned the suite to green.
- Disabling unqualified-hours counting made the mutation `SELECT hours FROM
  contract_hours_ledger` return zero instead of one and made its executable guard assertion red.
  Qualified, quoted, arbitrary-alias, CTE, function, view, and transitive probes remain alongside
  it. Every finite dynamic allowlist also replaces one live allowed literal with
  `contract_hours_ledger` in-memory and proves the exact-value assertion rejects the mutation.

Round-six mutation/fail-on-old evidence was uncommitted, run against the same local stack, and
exactly restored before the recorded green gates:

- Replacing integer-hundredths comparison with binary-float division made the 0.60/three-times-0.20
  regression return `[false, false, true, true]` instead of `[false, false, false, true]`.
- Removing bracket-call resolution from the AST guard found only 2 of the 4 supported direct-table
  mutation forms, so the mutation test failed. New-root, constants, generic, destructured,
  unsupported-dynamic, quoted/unaliased SQL, alternate-alias, view, and transitive-function probes
  remain executable in the green suite.
- Reapplying historical `20260809120100_reschedule_rpc_uses_bucket_summary.sql` over the local
  replacement made `013-session-reschedule-atomic.sql` fail **18/50**: missing, duplicate,
  malformed, and incoherent buckets all committed session `10:30 -> 11:00`, ledger
  `1.50/90 -> 2.00/120`, and revision `0 -> 1`. Reapplying `20260813120300` restored **50/50**.
- Temporarily making the report-batch trigger `UPDATE`-only made `011-zoom-public-rls.sql` fail
  **6/153**: batch rows were deleted and dependent operations reached FK `23503` instead of the
  stable `P0409`. Restoring `UPDATE OR DELETE` returned **153/153**.
- Temporarily granting `UPDATE(effective_minutes)` to both authenticated and service roles made
  `015-session-hour-overrides.sql` fail **5/65**; a direct write changed the value to 18 with no
  expected denial. Revoking those grants returned **65/65** while audited apply/reverse and allowed
  lifecycle-column updates stayed green.

Earlier proofs remain cumulative: Round 2's old UUID SQL, malformed-token coercion, and comparison
ledger mutation all made their new regressions red; Round 4 guard removal produced 27 pagination
failures; Round 5's old availability fallback inserted one single ledger row and two bulk rows when
the new assertions require zero. Those temporary sources were restored before every Round 6 gate.

Environment/tooling retries are recorded rather than presented as code results. The first reset
attempt selected a newer transient CLI and stalled in the desktop credential helper; the installed
Supabase CLI 2.110.0 then replayed the database successfully. An initial parallel UTC/Madrid run
exposed a test-only temporary-root collision; replacing the fixed probe directory with `mkdtempSync`
removed cross-process interference, after which all zones were run sequentially. Chromium first
collected no tests without the ignored local mock marker, then exposed missing public URL/feature
flags (110 green/7 failed). With the exact local synthetic CI flags, the final selector was 117/117;
the temporary ignored environment file was removed. In Round 7 the first fail-on-old SQL command
targeted an unavailable host `psql`, made no database change, and was retried against the exact
local Supabase container. The first Round 7 browser seed followed pgTAP and hit its leftover local
auth fixtures (`listUsers` error); a new local reset followed by the same synthetic seed succeeded,
and the final 117-test selector ran from that state. No persistent test environment file remains.

## Explicit inherited deviations

- Advisory `npm run lint:testid` remains the round-two measured repository baseline of **44 errors
  / 2,625 warnings**. Round seven adds no interactive UI.
- Madrid's eight `businessDays.test.ts` failures are the previously reproduced out-of-scope
  licitación defect. All Z7/hours tests are green in all three zones.
- The broad `npm run e2e` inherited round-one result remains **160 passed / 27 skipped / 1 did not
  run / 62 failed (250 total)**. Round seven changes no `tests/e2e/` path; the supported mandatory
selector was rerun fresh at 117/117.

None of these deviations is represented as a green gate.

## Independent reviewer focus and residual risks

1. Exercise direct audit-table `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, and `TRIGGER` as every
   exposed role, then prove the owner RPC alone applies/reverses exactly one actor-bound event and
   that a failed service poison cannot reserve its request ID.
2. Re-run the direct RPC, wrapper, and both API paths for fully tracked and each XOR no-ledger
   session; compare byte-identical session/ledger/revision state and retain both-null legacy,
   date-only, valid under-budget, and coherent over-budget behavior.
3. Re-run both mechanical inventories against the integrated HEAD: cumulative paths must be
   102/102; renamed/computed/quoted/destructured/shadowed/dynamic TS/JS forms and new roots, plus
   qualified/unqualified/quoted/alias/CTE/function/view/transitive SQL, must have zero unexplained uses.
4. Mutate every finite dynamic allowance and every SQL/source syntax probe independently; confirm
   the exact classification maps, 14/22 direct source census, 8/10 indirect source census, 7/25
   SQL expression census, and 8/11 SQL object census all go red on unclassified additions.
5. Preserve earlier availability, pair, exact-hundredths, pagination, terminal authority, UUID,
   canonical override concurrency, JSON facilitator scoping, comparison-to-billing isolation, and
   school/payment/export regressions.

Residual risks: a wider database outage may delay the durable batch-status read but cannot demote
a complete batch; advisory-lock hash collision may serialize unrelated request IDs but cannot
merge their canonical payloads; provider-side pagination behavior beyond the documented zero and
nonzero envelopes remains unmeasured against the real tenant; real Zoom webhook/report divergence
remains unmeasured; external ledger activity can change a balance between read-only preflight and
insert; and the pre-existing multi-row ledger insert sequence is not a PostgreSQL transaction, so a
later ledger-write failure (distinct from the availability failures closed in R5) can leave earlier
rows. The inherited unmatched-attendance-suggestion semantics are intentionally unchanged in this
round. Local gates do not prove production migration state.

## Handoff constraints

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, or test weakening occurred. Independent review must use the cumulative
boundary and issue its own verdict. Production migration application and read-only verification
remain explicitly outside this builder handoff.
