# Zoom phase Z7 — cumulative independent review request

## Control record

- Builder state: `REVIEW READY`; this document is evidence, not an acceptance verdict.
- Canonical branch: `feat/zoom-hours`.
- Immutable cumulative base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`.
- Rejected round-two canonical head: `c9cbdafd63927c6ae38e7fe649bc816676220d46`.
- Stable canonical implementation through round two:
  `1317f6a225553d78d55746a5f690d05cca0e0780` (24 commits from the base).
- Stable canonical round-two evidence:
  `841c97f95007d2eed54c167f21c2b12a6e447ff3` (25 commits).
- Stable canonical bookkeeping head:
  `c9cbdafd63927c6ae38e7fe649bc816676220d46` (26 commits).
- Stable canonical round-three contract:
  `6b065975d1469db28a1b8f34aa37970662bb773f` (27 commits).
- Detached round-three implementation:
  `828d3403a0918f3d5db99ea975e0ec4c938f397f` (28 commits).
- Detached project-state reconciliation:
  `4344adadc0bbd5180db85c9be0e92f8f660c4b47` (29 commits).
- This evidence document is the 30th cumulative detached commit. Its detached SHA is supplied
  in the builder handoff; the external review dispatch supplies the integrated live review HEAD.
- Review boundary: `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`.

There is no recursive HEAD placeholder in this artifact. A commit cannot contain its own SHA,
and cherry-picking changes detached commit identities. All embedded SHAs above are already stable
objects with counts verified by `git rev-list --count 43999499..<sha>`.

Ordered detached commits after `a1f73ab2b2cb24d6c0a5b5a883aef1d7af779b18`:

1. `088ec1c72812dcdb619dd943b99623477a2df203` — canonical bookkeeping cherry-pick.
2. `1a5d639b6a67bdf5f23c7d06cfb2a2888f314f03` — round-three contract cherry-pick.
3. `828d3403a0918f3d5db99ea975e0ec4c938f397f` — malformed participant repair/tests.
4. `4344adadc0bbd5180db85c9be0e92f8f660c4b47` — project-state reconciliation.
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

### Round three

| Finding | Disposition and evidence |
|---|---|
| Z7-R3.1 | The live API rejects every non-null-object participant element, including `null`, primitives, and arrays. `validateReportBatch` independently performs the same runtime guard and returns `malformed_participant_row` rather than throwing. The job maps that error to exactly one terminal batch rejection and zero promotion. Three focused files execute 121 tests. Reverting both guards produced 12 failures / 109 passes, including the original uncaught null `TypeError`; restoration returned 121/121. |
| Z7-R3.2 | This artifact is cumulative rather than round-specific. It records all stable canonical/detached identities available without self-reference and inventories all 79 paths in `git diff --name-only 43999499..HEAD`. The mechanical comparison below returns no lines and count 79/79. |
| Z7-R3.3 | `PROJECT_STATE.md` now states Z7 is implemented but remains `REVIEW READY` in remediation/re-review. It summarizes delivered invariants, local-only migrations, current gates, and explicitly denies acceptance, merge, deployment, and production verification. |

### Earlier rounds retained cumulatively

- R1 financial consumers all use the effective-minute derivation, lifecycle/report mutations are
  database-atomic, comparison dependencies fail closed, retryable report candidates resolve, and
  override request IDs serialize at PostgreSQL.
- R2 occurrence UUIDs fill only while missing; report batches resolve once; canonical override
  payload equality is database-derived; pagination metadata is strict; financial lookups fail
  closed; comparison paths are mutation-sensitive and billing-isolated; override inputs validate
  UUID/integer bounds; and page-cap candidates reject once.
- The round-three participant guard closes the last reviewed path that could bypass terminal batch
  resolution after a syntactically valid but runtime-malformed Zoom response.

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
- `__tests__/api/sessions/attendance-suggestions.test.ts`
- `__tests__/api/sessions/attendees.test.ts`
- `__tests__/api/sessions/session-reports-analytics.test.ts`
- `__tests__/api/zoom/webhook.test.ts`
- `__tests__/components/sessions/AttendanceSuggestionsPanel.test.tsx`
- `__tests__/components/sessions/HoursComparisonPanel.test.tsx`
- `__tests__/lib/services/billable-hours.test.ts`
- `__tests__/lib/services/comparison-billing-isolation.test.ts`
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

Result: no output. Counts: cumulative diff **79**, inventory **79**, duplicates **0**.

## Gate and fail-on-old evidence

All database/browser runs used the local Supabase stack and synthetic fixtures. No command was
piped through `tail`.

| Command | Result | Exit |
|---|---|---:|
| `npx vitest run __tests__/lib/zoom/fake.test.ts __tests__/lib/zoom/attendance-report.test.ts __tests__/lib/zoom/jobs/attendance-reconcile.test.ts` | 3 files, **121 passed** | 0 |
| Same focused command with both participant guards temporarily removed | **12 failed / 109 passed**; null leaked `TypeError`, live rows resolved instead of rejecting, and stable taxonomy was absent | 1 expected |
| Same focused command after exact restoration | 3 files, **121 passed** | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no RLS disablement | 0 |
| `npm test` | 320 files, **7,289 passed / 11 skipped** | 0 |
| `npm run build` | production build; **156/156 static pages** | 0 |
| `npm run test:db` | 12 files, **671 assertions** | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; forged/different payloads `P0409` sequentially and concurrently; no `23505` | 0 |
| Fresh `supabase db reset`; `node scripts/ci/seed-e2e.mjs`; `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npm test` | 320 files, **7,289 passed / 11 skipped** | 0 |
| `TZ=America/Santiago npm test` | 320 files, **7,289 passed / 11 skipped** | 0 |
| `TZ=Europe/Madrid npm test` | **7,281 passed / 8 failed / 11 skipped**; all 8 are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |

Round-two fail-on-old/mutation evidence remains part of the cumulative record: old UUID SQL
failed pgTAP 011; old token coercion failed all four malformed-token cases; and a real comparison
route ledger mutation made the isolation suite fail.

## Explicit inherited deviations

- Advisory `npm run lint:testid` remains the round-two measured repository baseline of **44 errors
  / 2,625 warnings**. Round three adds no interactive UI.
- Madrid's eight `businessDays.test.ts` failures are the previously reproduced out-of-scope
  licitación defect. All Z7/hours tests are green in all three zones.
- The broad `npm run e2e` inherited round-one result remains **160 passed / 27 skipped / 1 did not
  run / 62 failed (250 total)**. Round three changes no `tests/e2e/` path; the supported mandatory
  selector was rerun fresh at 117/117.

None of these deviations is represented as a green gate.

## Independent reviewer focus and residual risks

1. Re-run malformed participant values through the real live adapter and job; verify one reject,
   zero promotion, stable reason, and no pending batch/`TypeError` escape.
2. Re-run the inventory comparison against the integrated live HEAD and independently verify the
   stable canonical counts above.
3. Re-check batch terminality and ambiguous promotion recovery at the PostgreSQL boundary.
4. Re-check canonical override replay equality, all forged-hash fields, and the absence of `23505`.
5. Re-check comparison-to-billing isolation and all school/payment/export consumers.

Residual risks: a wider database outage may delay the durable batch-status read but cannot demote
a complete batch; advisory-lock hash collision may serialize unrelated request IDs but cannot
merge their canonical payloads; real Zoom webhook/report divergence remains unmeasured; and local
gates do not prove production migration state.

## Handoff constraints

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
destructive migration, or test weakening occurred. Independent review must use the cumulative
boundary and issue its own verdict. Production migration application and read-only verification
remain explicitly outside this builder handoff.
