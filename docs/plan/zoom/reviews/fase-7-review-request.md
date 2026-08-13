# Zoom phase Z7 — cumulative independent review request

## Control record

- Builder state: `REVIEW READY`; this document is evidence, not an acceptance verdict.
- Canonical branch: `feat/zoom-hours`.
- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`.
- Rejected round-five canonical head: `290478810f17c86cfbcdbcad2ba03cb655a9d100`
  (35 commits from the base; tree `718211ee6cbf71c85322572cfc03e5b26ba43cc5`).
  It is a rejected review point, not acceptance evidence.
- Detached round-four starting point: `cd39592d891fa8c9df24334798868445242ab5ef`
  (35 commits; tree-equivalent to the rejected canonical head).
- Detached round-five contract cherry-pick: `950451825bb95e90aa8eee13748b7b53174c71ee`
  (36 commits).
- Detached round-five implementation: `193c0f2868fbc5d81787b0be20f797b6d4bdab65`
  (37 commits).
- Detached round-five project-state reconciliation:
  `3b378a6f56df198fc81cd3e7e0fd6903d5bd2460` (38 commits).
- Detached bulk shared-balance hardening:
  `c22008cf27b6a802106c0af1dddc84aa16723131` (39 commits).
- This evidence document is the 40th cumulative detached commit. A commit cannot truthfully embed
  its own identity; its exact detached SHA is supplied in the builder handoff. The external review
  dispatch must pin the post-cherry-pick canonical HEAD (`CANONICAL_HEAD_PENDING_INTEGRATION`).
- Review boundary: `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`.

There is no recursive HEAD placeholder in this artifact. A commit cannot contain its own SHA,
and cherry-picking changes detached commit identities. All embedded SHAs above are already stable
objects with counts verified by `git rev-list --count 43999499..<sha>`.

Ordered detached commits after `cd39592d891fa8c9df24334798868445242ab5ef`:

1. `950451825bb95e90aa8eee13748b7b53174c71ee` — round-five contract cherry-pick.
2. `193c0f2868fbc5d81787b0be20f797b6d4bdab65` — code, tests, inventory, and entrypoint-comment repair.
3. `3b378a6f56df198fc81cd3e7e0fd6903d5bd2460` — project-state reconciliation.
4. `c22008cf27b6a802106c0af1dddc84aa16723131` — preserve sequential over-budget classification after read-only bulk preflight.
5. This evidence commit — exact detached SHA in the builder handoff.

## Objective, delivered scope, and current status

PLAN §11 remains the governing objective: planned time is billed and paid unless an authenticated
admin explicitly writes an audited override; Zoom elapsed/presence is comparison evidence only;
the same effective minutes feed school consumption and consultant payment. PLAN §15.3 delivered
the attendance schema and lifecycle instants, participant ingestion, authoritative report
reconciliation, append-only override machinery, comparison/override UI, and facilitator
attendance suggestions.

Z7 is implemented on the feature branch but remains in independent remediation/re-review. It is
not accepted, merged, deployed, or production-verified. All six Z7 migrations have been replayed
only against the local Supabase stack; production application and read-only verification remain a
human-controlled post-merge step.

Out of scope remains recording/transcription/minutas/consent, Z3b Client View, unrelated RLS
remediation, the Vitest upgrade, leadership aggregates, deployments, production data/schema, and
unrelated refactors.

## Finding disposition

### Round five

| Finding | Disposition and evidence |
|---|---|
| Z7-R5.1 | Availability now has a discriminated `available | missing` result and throws on RPC/shape/numeric dependency failures. A successful empty summary is legitimate for a direct lookup; approval first proves a matching allocation exists, so a missing summary bucket at that boundary is contradictory and fails closed. Single approval returns generic 500 before session mutation. Bulk approval preflights every session before the first ledger insert, so a later outage cannot partially reserve or approve earlier items; it then debits the shared preflight balance in source order so later same-allocation rows retain sequential over-budget semantics. Route regressions cover single/bulk outage, valid under/over-budget reservations, shared-balance ordering, and a legacy untracked session as the defined approval-without-ledger case. |
| Z7-R5.2 | The executable inventory scans root TypeScript files plus every production root (`components`, `config`, `constants`, `contexts`, `hooks`, `lib`, `pages`, `src`, `types`, `utils`); finds 14 files/22 direct table touches; recursively discovers ledger-backed SQL functions/views and 8 files/10 TypeScript indirect calls; and finds 5 SQL files/17 uncommented raw-hours expressions under arbitrary aliases. Exact classifications have zero unexplained consumers. Mutation probes exercise whitespace-varied direct use, multiline/destructured RPC, alternate alias, synthetic view, transitive function, and a TypeScript view consumer. |
| Z7-R5.3 | `PROJECT_STATE.md` now routes reviewers to Round 5 and states `REVIEW READY` pending another cumulative independent verdict. It explicitly preserves not accepted, not merged, not deployed, local-only migrations, and not production-verified. |
| Z7-R5.4 | Reconcile comments now describe two global hourly jobs plus per-occurrence attendance candidates/dedupe. Webhook comments accurately describe meeting lifecycle/projection handling, provisional joined/left attendance, ledger-only events, and the no-job-enqueue boundary. Existing cron/webhook suites remain green. |

### Round four

| Finding | Disposition and evidence |
|---|---|
| Z7-R4.1 | Both the live adapter and pure reconciliation now require finite integers; `1 <= page_size <= 100`; nonnegative `page_count`/`total_records`; `page_count = 0` only for the valid zero-record envelope and otherwise `ceil(total_records/page_size)`; stable metadata across pages; exact fetched-page and participant counts; per-page cardinality; and a nonempty token until the declared terminal page followed by an empty token. Invalid numeric metadata maps to `invalid_pagination_metadata`; coherent-number contradictions map to `contradictory_pagination_metadata`, `page_count_mismatch`, or `participant_count_mismatch`. Job regressions prove exactly one rejection, zero promotion, and preservation of an earlier complete batch. Valid 230-row multipage and zero-participant envelopes remain green. |
| Z7-R4.2 | The JSON ledger endpoint resolves `session_facilitators` before constructing the ledger query. An errored scope lookup returns a generic 500 and never runs or returns the ledger; a successful zero-row lookup returns 200 empty; successful nonempty scope remains constrained by the facilitated session IDs. Three route tests exercise all branches. |
| Z7-R4.3 | Round 4 introduced the direct-use audit, but its 13-file/21-touch TypeScript claim and 19-expression SQL count were incomplete/overcounted. Round 5 supersedes that evidence with the expanded direct-and-transitive census below: 14 files/22 direct touches, 8 files/10 indirect calls, 5 SQL files/17 uncommented raw-hours expressions, and 6 migration files/9 ledger-backed object definitions. |
| Z7-R4.4 | The report-batch migration now documents the lifecycle as the two terminal branches `pending -> complete | rejected`; SQL constraints/RPCs and pgTAP continue to enforce that neither terminal state can transition or be rewritten. This cumulative artifact inventories all 83 paths from the immutable base and records round-four evidence without asserting its own SHA. |

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
  before financial/approval mutation and replaces the incomplete reader guard with the exhaustive
  direct/transitive production-consumer inventory.

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

| Production SQL migration path | Expressions | Classification and justification |
|---|---:|---|
| `supabase/migrations/00000000000000_baseline.sql` | 6 | `historical` x6: immutable baseline definitions, superseded by later active functions. |
| `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` | 4 | `historical` x4: first reschedule definition, superseded by `20260809120100`. |
| `supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql` | 2 | `historical` x2: intermediate bucket aggregate, superseded by the Z7 override-aware definition. |
| `supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 2 | `historical`, `write`: the active pre-execution reschedule preserves/recomputes planned hours; it is not post-session Zoom billing. |
| `supabase/migrations/20260813120200_session_hour_overrides.sql` | 3 | `aggregate`, `aggregate`, `billable`: active school reserved/consumed aggregates and consultant payment use `COALESCE(round(effective_minutes / 60, 2), hours)`. Comments are stripped before counting. |

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

The only active financial formulas are the shared TypeScript `billableHours` derivation and the SQL
coalesce twin above. Raw admin ledger/comparison reads are intentional historical evidence, writes
are lifecycle operations, and status-only queries do not calculate a monetary or consumption value.
The executable maps therefore cover 14 direct TypeScript files/22 touches, 8 indirect TypeScript
files/10 calls, 5 SQL files/17 uncommented raw-hours expressions, and 6 migration files/9
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
- `supabase/tests/002-zoom-internal-isolation.sql`
- `supabase/tests/011-zoom-public-rls.sql`
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
- `__tests__/api/hour-tracking/reservation.test.ts`
- `__tests__/api/sessions/session-approval-hours-fail-closed.test.ts`
- `__tests__/api/sessions/session-approve-zoom-provision.test.ts`
- `__tests__/api/sessions/session-bulk-approve-zoom-provision.test.ts`
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

Result after the evidence commit: no output. Counts: cumulative diff **92**, inventory **92**,
duplicates **0**.

## Gate and fail-on-old evidence

All database/browser runs used the local Supabase stack and synthetic fixtures. No command was
piped through `tail`.

| Command | Result | Exit |
|---|---|---:|
| `npx vitest run` with reservation, snapshot, approval fail-closed, reader inventory, cron, and webhook focused files | 6 files, **63 passed** | 0 |
| Round 5 availability fail-on-old: both dependency-error branches temporarily restored to the old `ready/isOverBudget:false` fallback; new route suite run before restoration | **2 failed / 2 passed**: single inserted 1 ledger row; bulk inserted 2 rows before assertions halted; both should have inserted 0 | 1 expected |
| Same six-file Round 5 command after exact source restoration, then again after shared-balance hardening | 6 files, **63 passed** on eventual tree | 0 |
| Approval/facilitator/provisioning/lifecycle, override, ledger JSON, billable/isolation, pagination, attendance reconcile, and inventory focused command | 13 files, **254 passed** | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no RLS disablement | 0 |
| `TZ=America/Santiago npm test` | 323 files, **7,333 passed / 11 skipped** | 0 |
| `npm run build` | production build; **156/156 static pages** | 0 |
| Fresh local `supabase db reset` | all migrations through `20260813120200` replayed | 0 |
| `npm run test:db` | 12 files, **671 assertions** | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; forged/different payloads `P0409` sequentially and concurrently; no `23505` | 0 |
| Fresh local `supabase db reset`; local-CLI URL/keys supplied to `node scripts/ci/seed-e2e.mjs`; `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npm test` | 323 files, **7,333 passed / 11 skipped** | 0 |
| `TZ=Europe/Madrid npm test` | **7,325 passed / 8 failed / 11 skipped** in 323 files; all 8 are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |

Round-two fail-on-old/mutation evidence remains part of the cumulative record: old UUID SQL
failed pgTAP 011; old token coercion failed all four malformed-token cases; and a real comparison
route ledger mutation made the isolation suite fail.

Round-four guard-removal proof was source-restored before any green run or commit. The 27 failures
include live adapter acceptance of negative/fractional metadata, job promotion/no rejection for
invalid envelopes, pure reconciliation accepting short/fractional/contradictory pages, and loss of
the stable rejection taxonomy. The restored tree returned 154/154 focused and is what every later
gate exercised.

Round-five fail-on-old was likewise uncommitted and exactly restored before the 62/62 focused run,
static gates, or repair commit. Assertions inspect the mutation arrays before status/body, so the
old path's 1-row single mutation and 2-row bulk partial mutation are direct evidence, not an
inference from response codes. The first build attempt compiled but failed page-data collection
because public Supabase variables were absent; it was rerun successfully with local CLI URL/key.
The first Chromium invocation collected no tests because its mock-mode spec requires an ignored
`.env.local`; the same local-only synthetic configuration expected by CI was supplied and the
selector then ran 117/117. Neither environment-only retry is represented as a green code result.

## Explicit inherited deviations

- Advisory `npm run lint:testid` remains the round-two measured repository baseline of **44 errors
  / 2,625 warnings**. Round five adds no interactive UI.
- Madrid's eight `businessDays.test.ts` failures are the previously reproduced out-of-scope
  licitación defect. All Z7/hours tests are green in all three zones.
- The broad `npm run e2e` inherited round-one result remains **160 passed / 27 skipped / 1 did not
  run / 62 failed (250 total)**. Round five changes no `tests/e2e/` path; the supported mandatory
  selector was rerun fresh at 117/117.

None of these deviations is represented as a green gate.

## Independent reviewer focus and residual risks

1. Inject availability failure and a successful-but-missing summary bucket after allocation lookup
   into single and late-item bulk approval; verify generic 500 and no ledger/session mutation.
2. Re-run both mechanical inventories against the integrated HEAD: cumulative paths must be 92/92;
   direct touches, transitive RPC/view/function edges, arbitrary SQL aliases, and their authority
   classifications must have zero unexplained uses.
3. Mutate each pagination dimension independently and in combination through the live adapter and
   job; verify one rejection, no promotion, preservation of prior complete authority, and the exact
   stable reason.
4. Exercise the JSON ledger with a real failed facilitator query and re-check terminal report-batch
   recovery at the PostgreSQL boundary.
5. Re-check canonical override replay equality, comparison-to-billing isolation, and all active
   school/payment/export formulas.

Residual risks: a wider database outage may delay the durable batch-status read but cannot demote
a complete batch; advisory-lock hash collision may serialize unrelated request IDs but cannot
merge their canonical payloads; provider-side pagination behavior beyond the documented zero and
nonzero envelopes remains unmeasured against the real tenant; real Zoom webhook/report divergence
remains unmeasured; external ledger activity can change a balance between read-only preflight and
insert; and the pre-existing multi-row ledger insert sequence is not a PostgreSQL transaction, so a
later ledger-write failure (distinct from the availability failures closed in R5) can leave earlier
rows. Local gates do not prove production migration state.

## Handoff constraints

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, or test weakening occurred. Independent review must use the cumulative
boundary and issue its own verdict. Production migration application and read-only verification
remain explicitly outside this builder handoff.
