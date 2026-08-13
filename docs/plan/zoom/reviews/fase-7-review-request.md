# Zoom phase Z7 — cumulative independent review request

## Control record

- Builder state: `REVIEW READY`; this document is evidence, not an acceptance verdict.
- Canonical branch: `feat/zoom-hours`.
- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`.
- Rejected round-four canonical head: `26ab5d10f80cab526ea2cb38f0469b10b503e462`
  (30 commits from the base). It is a rejected review point, not acceptance evidence.
- Stable round-four contract: `a0f15daabb8ca99ef37864e5fc5477c48f2f2843`
  (31 canonical commits from the base).
- Detached round-three starting point: `647a28373d2461673e648e94b7f4c4fb6d4b1f6b`
  (30 commits; tree-equivalent to the rejected canonical head).
- Detached contract cherry-pick: `df9abb1ebb234e66d1d16551e598a2fbe130e802`
  (31 commits).
- Detached round-four implementation: `b9787b0d9a7c391f2dba8b4815b6d215a3e0d437`
  (32 commits).
- Detached round-four project-state reconciliation:
  `e6afb99cf50f170cffdf9fc81b229c27817364be` (33 commits).
- Billing-reader comment reconciliation: `3c708fbebe57c956d472cd23dd5a2835a57bc58d`
  (34 commits).
- This evidence document is the 35th cumulative detached commit. A commit cannot truthfully embed
  its own identity; its exact detached SHA is supplied in the builder handoff. The external review
  dispatch must pin the post-cherry-pick canonical HEAD (`CANONICAL_HEAD_PENDING_INTEGRATION`).
- Review boundary: `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`.

There is no recursive HEAD placeholder in this artifact. A commit cannot contain its own SHA,
and cherry-picking changes detached commit identities. All embedded SHAs above are already stable
objects with counts verified by `git rev-list --count 43999499..<sha>`.

Ordered detached commits after `647a28373d2461673e648e94b7f4c4fb6d4b1f6b`:

1. `df9abb1ebb234e66d1d16551e598a2fbe130e802` — round-four contract cherry-pick.
2. `b9787b0d9a7c391f2dba8b4815b6d215a3e0d437` — code and regression repair.
3. `e6afb99cf50f170cffdf9fc81b229c27817364be` — project-state reconciliation.
4. `3c708fbebe57c956d472cd23dd5a2835a57bc58d` — billing-reader comment reconciliation.
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

### Round four

| Finding | Disposition and evidence |
|---|---|
| Z7-R4.1 | Both the live adapter and pure reconciliation now require finite integers; `1 <= page_size <= 100`; nonnegative `page_count`/`total_records`; `page_count = 0` only for the valid zero-record envelope and otherwise `ceil(total_records/page_size)`; stable metadata across pages; exact fetched-page and participant counts; per-page cardinality; and a nonempty token until the declared terminal page followed by an empty token. Invalid numeric metadata maps to `invalid_pagination_metadata`; coherent-number contradictions map to `contradictory_pagination_metadata`, `page_count_mismatch`, or `participant_count_mismatch`. Job regressions prove exactly one rejection, zero promotion, and preservation of an earlier complete batch. Valid 230-row multipage and zero-participant envelopes remain green. |
| Z7-R4.2 | The JSON ledger endpoint resolves `session_facilitators` before constructing the ledger query. An errored scope lookup returns a generic 500 and never runs or returns the ledger; a successful zero-row lookup returns 200 empty; successful nonempty scope remains constrained by the facilitated session IDs. Three route tests exercise all branches. |
| Z7-R4.3 | The direct-use audit below inventories every production TypeScript table touch and every SQL `l.hours`/`chl.hours`/`SET hours =` expression. Two executable inventory tests recursively scan `lib/`, `pages/`, and all migrations, enforce exact files and source-order classifications, and fail on any new unclassified touch. It finds 13 TypeScript files / 21 touches and 5 SQL files / 19 expressions. The helper comment now names the actual consumers and explicitly separates historical admin reads from billable calculations. |
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
  lookup, the production direct-reader inventory, and the misleading linear lifecycle comment.

## Production `contract_hours_ledger.hours` direct-use inventory

The executable guard treats every production table touch as reviewable, including status-only and
write exceptions; this prevents a future raw-hours reader from hiding in a query that was assumed
irrelevant. Classifications below are in source order when a file touches the table more than once.

| Production TypeScript path | Touches | Classification and justification |
|---|---:|---|
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

| Production SQL migration path | Expressions | Classification and justification |
|---|---:|---|
| `supabase/migrations/00000000000000_baseline.sql` | 6 | `historical` x6: immutable baseline definitions, superseded by later active functions. |
| `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` | 4 | `historical` x4: first reschedule definition, superseded by `20260809120100`. |
| `supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql` | 3 | `historical` x3: intermediate bucket aggregate, superseded by the Z7 override-aware definition. |
| `supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql` | 2 | `historical`, `write`: the active pre-execution reschedule preserves/recomputes planned hours; it is not post-session Zoom billing. |
| `supabase/migrations/20260813120200_session_hour_overrides.sql` | 4 | `historical`, `aggregate`, `aggregate`, `billable`: one superseded-claim comment; active school reserved/consumed aggregates and consultant payment use `COALESCE(round(effective_minutes / 60, 2), hours)`. |

The only active financial formulas are the shared TypeScript `billableHours` derivation and the SQL
coalesce twin above. Raw admin ledger/comparison reads are intentional historical evidence, writes
are lifecycle operations, and status-only queries do not calculate a monetary or consumption value.

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
- `lib/services/school-hours-report.ts`
- `lib/types/consultor-sessions.types.ts`
- `pages/admin/sessions/[id].tsx`
- `pages/api/admin/sessions/[id]/hour-override.ts`
- `pages/api/admin/sessions/[id]/hours-comparison.ts`
- `pages/api/consultant-earnings/[consultant_id].ts`
- `pages/api/contracts/[id]/hours/ledger/csv.ts`
- `pages/api/contracts/[id]/hours/ledger/index.ts`
- `pages/api/cron/zoom-reconcile.ts`
- `pages/api/sessions/[id]/attendance-suggestions.ts`
- `pages/api/sessions/[id]/attendees.ts`
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

Result after the evidence commit: no output. Counts: cumulative diff **83**, inventory **83**,
duplicates **0**.

## Gate and fail-on-old evidence

All database/browser runs used the local Supabase stack and synthetic fixtures. No command was
piped through `tail`.

| Command | Result | Exit |
|---|---|---:|
| `npx vitest run __tests__/lib/zoom/fake.test.ts __tests__/lib/zoom/attendance-report.test.ts __tests__/lib/zoom/jobs/attendance-reconcile.test.ts __tests__/api/hour-tracking/ledger-json.test.ts __tests__/lib/services/ledger-hours-reader-inventory.test.ts` | 5 files, **154 passed** | 0 |
| Three pagination files after temporarily removing the live numeric/contradiction guards and the pure numeric/page-count/fetched-page/per-page guards | **27 failed / 122 passed**; invalid metadata was accepted, jobs resolved/promoted instead of rejecting, and contradictory page cardinality escaped | 1 expected |
| Same five-file focused command after exact restoration | 5 files, **154 passed** | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no RLS disablement | 0 |
| `npm test` | 322 files, **7,322 passed / 11 skipped** | 0 |
| `npm run build` | production build; **156/156 static pages** | 0 |
| Fresh local `supabase db reset` | all migrations through `20260813120200` replayed | 0 |
| `npm run test:db` | 12 files, **671 assertions** | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; forged/different payloads `P0409` sequentially and concurrently; no `23505` | 0 |
| Fresh local `supabase db reset`; local-CLI URL/keys supplied to `node scripts/ci/seed-e2e.mjs`; `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npx vitest run --reporter=json --outputFile=/tmp/z7-r4-utc.json` | 322 files, **7,322 passed / 11 skipped** | 0 |
| `TZ=America/Santiago npx vitest run --reporter=json --outputFile=/tmp/z7-r4-santiago.json` | 322 files, **7,322 passed / 11 skipped** | 0 |
| `TZ=Europe/Madrid npx vitest run --reporter=json --outputFile=/tmp/z7-r4-madrid.json` | **7,314 passed / 8 failed / 11 skipped**; all 8 are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |

Round-two fail-on-old/mutation evidence remains part of the cumulative record: old UUID SQL
failed pgTAP 011; old token coercion failed all four malformed-token cases; and a real comparison
route ledger mutation made the isolation suite fail.

Round-four guard-removal proof was source-restored before any green run or commit. The 27 failures
include live adapter acceptance of negative/fractional metadata, job promotion/no rejection for
invalid envelopes, pure reconciliation accepting short/fractional/contradictory pages, and loss of
the stable rejection taxonomy. The restored tree returned 154/154 focused and is what every later
gate exercised.

## Explicit inherited deviations

- Advisory `npm run lint:testid` remains the round-two measured repository baseline of **44 errors
  / 2,625 warnings**. Round four adds no interactive UI.
- Madrid's eight `businessDays.test.ts` failures are the previously reproduced out-of-scope
  licitación defect. All Z7/hours tests are green in all three zones.
- The broad `npm run e2e` inherited round-one result remains **160 passed / 27 skipped / 1 did not
  run / 62 failed (250 total)**. Round four changes no `tests/e2e/` path; the supported mandatory
  selector was rerun fresh at 117/117.

None of these deviations is represented as a green gate.

## Independent reviewer focus and residual risks

1. Mutate each pagination dimension independently and in combination through the live adapter and
   job; verify one rejection, no promotion, preservation of prior complete authority, and the exact
   stable reason.
2. Re-run both mechanical inventories against the integrated HEAD: cumulative paths must be 83/83,
   and every production ledger table touch/direct SQL hours expression must remain classified.
3. Exercise the JSON ledger with a real failed facilitator query and confirm generic 500, no ledger
   query/payload, while successful zero and nonzero scopes retain their distinct behavior.
4. Re-check batch terminality and ambiguous promotion recovery at the PostgreSQL boundary.
5. Re-check canonical override replay equality, comparison-to-billing isolation, and all active
   school/payment/export formulas.

Residual risks: a wider database outage may delay the durable batch-status read but cannot demote
a complete batch; advisory-lock hash collision may serialize unrelated request IDs but cannot
merge their canonical payloads; provider-side pagination behavior beyond the documented zero and
nonzero envelopes remains unmeasured against the real tenant; real Zoom webhook/report divergence
remains unmeasured; and local gates do not prove production migration state.

## Handoff constraints

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, or test weakening occurred. Independent review must use the cumulative
boundary and issue its own verdict. Production migration application and read-only verification
remain explicitly outside this builder handoff.
