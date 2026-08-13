# Zoom phase Z7 — independent review request

## 1. Authoritative control record

- Review state requested: `REVIEW READY` (builder evidence only; never an acceptance verdict)
- Canonical branch: `feat/zoom-hours`
- Immutable cumulative review base: `4399949942bfcf49dfa8de40cbf7edbf40f0490e`
- Rejected canonical round-one head: `dd7836eb9d6c2a2d4d46c7ba43205bc694450578`
- Rejected-tree equivalent detached base: `a5f7aa37` (tree `1d32b45c8dcd954e2caaa4b1980a4fdb1127c21f`)
- Canonical repair HEAD: `CANONICAL_HEAD_PENDING_INTEGRATION`
- Canonical cumulative commit count (`git rev-list --count 43999499..HEAD`):
  `CANONICAL_COMMIT_COUNT_PENDING_INTEGRATION`
- Detached implementation evidence head: `2070e892cf4cfe194468d2d090090374680658d3`
- Detached cumulative count through implementation: `24`
- Review boundary: cumulative `4399949942bfcf49dfa8de40cbf7edbf40f0490e..HEAD`

The orchestrator must replace both canonical placeholders with the integrated full SHA and exact
count, then commit that reconciliation before independent review. Cherry-picking changes commit
IDs; detached IDs below are ordering evidence, not canonical identities.

Ordered detached commits after `a5f7aa37`:

1. `b394a2177d0fcc8795e8fef7a41a674e0f83051c` — `docs(z7): record round-two review findings`
2. `2070e892cf4cfe194468d2d090090374680658d3` — `fix(z7): close round-two integrity gaps`
3. This review-evidence commit (use the detached SHA returned by the builder).

## 2. Objective and scope

The governing objective remains PLAN §11: planned/approved time is the default billed and paid
value; Zoom elapsed and facilitator presence are comparison evidence only; a post-execution admin
override is the sole path to change `effective_minutes`; the same adjusted value drives school
consumption and consultant payment; overrides are append-only and reversible without erasing
history.

PLAN §15.3.2 scope, retained:

- **Z7-1 — attendance schema + actual-elapsed instants:** public attendance rows, RLS, actual
  lifecycle instants, and pgTAP.
- **Z7-2 — participant ingestion:** webhook join/leave ingestion, pure identity hierarchy, and
  reconnect-safe interval arithmetic.
- **Z7-3 — report reconciliation:** participant-report adapter/fake/job; a complete report is
  authoritative over provisional webhooks.
- **Z7-4 — override machinery:** append-only overrides, additive `effective_minutes`, one
  authenticated admin RPC, canonical billable derivation, and DB enforcement.
- **Z7-5 — surfaces:** admin comparison/override UI plus facilitator attendance suggestions.

PLAN §15.3.3 out of scope, retained: recording, transcription, minutas, and consent; Z3b Client
View; changes under `tests/e2e/`; the unrelated production RLS allowlist and INSPIRA migration;
the Vitest upgrade; and leadership aggregates. This remediation also excluded deployment,
production/remote DB access, real data, destructive schema work, and unrelated refactors.

## 3. Round-two finding disposition

| Finding | Disposition and executable evidence |
|---|---|
| Z7-R2.1 | Lifecycle SQL now uses existing-first UUID fill. pgTAP 011 proves ended-before-started fill, later differing replays/refused starts preserve identity, and the occurrence remains a reconciliation candidate. An exact old-expression reset made assertion 67 fail with `Different/Occurrence==`; restored code returns 146/146. |
| Z7-R2.2 | A PostgreSQL trigger permits only pending→complete/rejected; both terminal states are immutable. Conditional reject RPC cannot demote a committed batch. The job reads durable status after ambiguous promotion failure. pgTAP covers terminal transitions and effective authority; Vitest simulates post-commit response loss. |
| Z7-R2.3 | PostgreSQL stores and compares canonical normalized JSONB under the request-ID advisory lock. The caller hash is audit evidence only. pgTAP changes every payload field under one forged hash; the real two-connection proof repeats every field sequentially and concurrently and observes `P0409`, never `23505`. |
| Z7-R2.4 | The live adapter requires a string `next_page_token`; only explicit `''` terminates. Adapter/job tests cover absent, null, numeric, and object tokens. Restoring exact old coercion produced 4 failures in 96 focused assertions; restored code produced 96/96. |
| Z7-R2.5 | Consultant earnings fails closed on `hour_types`; consultant CSV fails closed on facilitator lookup and emits no successful CSV. Existing override/reversal consumer assertions preserve 0.75/7.50 and 1.00/10.00. |
| Z7-R2.6 | Three named executable planned-60 scenarios cover Zoom 45, Zoom 90, and no Zoom. A source-boundary test inventories every comparison write/RPC path and the sole override RPC. Inserting an actual comparison-route ledger update made 2/4 isolation assertions fail; exact removal restored 4/4. |
| Z7-R2.7 | Route validation rejects invalid session UUID, invalid reversal UUID, and values above PostgreSQL `integer` max with 400 before RPC. Unknown DB failures remain generic 500. |
| Z7-R2.8 | Page cap has a distinct error type and one catch-owned resolution; the test observes exactly one `page_cap_exceeded` rejection and no promotion. |
| Z7-R2.9 | This file replaces, rather than appends to, the rejected artifact. It contains one control record, one gate table, current findings, and explicit integration placeholders. |

## 4. Round-one remediation status after round two

The round-one repairs remain present in the cumulative tree: financial consumers use the
effective-minute derivation; lifecycle writes are atomic; report promotion is batch-atomic;
comparison dependencies fail closed; retryable fetch failures reject batches; and request-ID
application is advisory-lock serialized. Round two supersedes two earlier claims: occurrence UUID
identity is now proven against real SQL, and override replay equality is now database-derived
rather than caller-hash-derived. No earlier claim that conflicts with those facts survives here.

## 5. Files created or modified in round two

### Highest risk — database authority and transaction semantics

- `supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql`
- `supabase/migrations/20260813120100_zoom_attendance_report_batches.sql`
- `supabase/migrations/20260813120200_session_hour_overrides.sql`
- `supabase/tests/011-zoom-public-rls.sql`
- `supabase/tests/015-session-hour-overrides.sql`
- `scripts/ci/override-concurrency-proof.mjs`

### High risk — report state machine and Zoom wire validation

- `lib/zoom/api.ts`
- `lib/zoom/attendance-report-store.ts`
- `lib/zoom/jobs/attendance-reconcile.ts`
- `__tests__/lib/zoom/fake.test.ts`
- `__tests__/lib/zoom/jobs/attendance-reconcile.test.ts`

### Medium risk — financial/API boundaries

- `pages/api/admin/sessions/[id]/hour-override.ts`
- `pages/api/consultant-earnings/[consultant_id].ts`
- `pages/api/contracts/[id]/hours/ledger/csv.ts`
- `__tests__/api/admin/hour-override.test.ts`
- `__tests__/api/hour-tracking/earnings.test.ts`
- `__tests__/api/hour-tracking/ledger-csv.test.ts`

### Contract/isolation tests and evidence

- `__tests__/lib/services/billable-hours.test.ts`
- `__tests__/lib/services/comparison-billing-isolation.test.ts` (new)
- `docs/plan/zoom/remediation/Z7-review-2.md` (contract commit)
- `docs/plan/zoom/reviews/fase-7-review-request.md`

The audit was not limited to cited files. Direct ledger/effective-minute readers and comparison
write/RPC paths were searched across `lib/`, `pages/`, and `scripts/`. The canonical billing helper
still reads only ledger fields; the comparison GET has no write/RPC; its panel has one comparison
read and one explicit override POST; and the override endpoint calls only
`apply_session_hour_override`, never the ledger table directly.

## 6. Gate evidence

All supported gates used the local Supabase stack and synthetic fixtures only. No command was
piped through `tail`.

| Command | Exact result | Exit |
|---|---|---:|
| Focused round-two Vitest set | 8 files, **155 passed** | 0 |
| Pagination old-behavior probe: exact old coercion + `npx vitest run __tests__/lib/zoom/fake.test.ts __tests__/lib/zoom/jobs/attendance-reconcile.test.ts` | **4 failed / 92 passed**; all four malformed-token cases resolved instead of rejecting | 1 expected |
| Restored pagination focused recheck | 2 files, **96 passed** | 0 |
| Billing mutation probe: actual comparison-route `.update({ hours: 0 })` + isolation test | **2 failed / 2 passed**; exact removal then **4/4 passed** | 1 expected, then 0 |
| Old-SQL probe: exact incoming-first UUID expression → `supabase db reset && npm run test:db` | **1 failed / 670 passed**; pgTAP 011 assertion 67 observed overwrite | 1 expected |
| Restored fresh SQL replay + `npm run test:db` | 12 files, **671 passed** (011: 146; 015: 59) | 0 |
| `npm run type-check` | no diagnostics | 0 |
| `npm run lint` | zero warnings | 0 |
| `bash scripts/ci/check-rls-migrations.sh` | no migration disables RLS | 0 |
| `npm test` | 320 files, **7,277 passed / 11 skipped** | 0 |
| `npm run build` | production build, **156/156 static pages** | 0 |
| `npm run test:override-concurrency` | identical race apply+replay; differing race `P0409`; sequential replay; every canonical field forged-hash sequential/concurrent `P0409`; no `23505` | 0 |
| Fresh reset → synthetic seed → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **117/117 passed**, one worker | 0 |
| `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | 11 mandatory specs ran with no skips | 0 |
| `TZ=UTC npm test` | 320 files, **7,277 passed / 11 skipped** | 0 |
| `TZ=America/Santiago npm test` | 320 files, **7,277 passed / 11 skipped** | 0 |
| `TZ=Europe/Madrid npm test` | **7,269 passed / 8 failed / 11 skipped**; all failures are inherited `lib/__tests__/businessDays.test.ts` | 1 inherited |
| `npm run lint:testid` | inherited advisory: **44 errors / 2,625 warnings** | 1 advisory |

The first mandatory-E2E setup attempt was invalid because the ignored local environment omitted
`CRON_SECRET` and `NEXT_PUBLIC_BASE_URL`; it was stopped, the local-only file was corrected, the
production build was rerun, and the authoritative fresh result is 117/117 plus the no-skip guard.

## 7. Time-zone and billing result

The three named Z7-A6 scenarios execute in `billable-hours.test.ts` and return one billed hour in
all three matrix runs:

- planned 60 / Zoom 45 → billed 60;
- planned 60 / Zoom 90 → billed 60;
- planned 60 / no Zoom data → billed 60.

All Z7 and hours suites are green in Madrid. Its eight failures are the already-recorded,
out-of-scope licitación business-day date-construction defect and reproduce independently of Z7.

## 8. Inherited deviations and broad-suite record

- `lint:testid` is advisory and unchanged in character: 44 missing-rule errors and 2,625
  repository-wide warnings. Round two adds no interactive component.
- The Madrid matrix retains exactly eight failures in `lib/__tests__/businessDays.test.ts`; this
  was reproduced on the immutable phase start in round one and remains outside Zoom scope.
- The exact broad `npm run e2e` was run in round one and recorded **160 passed / 27 skipped /
  1 did not run / 62 failed (250 total)**. Those failures are the inherited legacy inventory
  (principally proposal/QA credentials absent from the supported synthetic seeder, legacy
  reservation logins, and one full-run-only mock-port race). Round two did not change
  `tests/e2e/`; the supported mandatory selector was rerun fresh at 117/117.

These deviations are not described as green and are not acceptance claims.

## 9. Independent reviewer focus

1. **Batch terminality and ambiguous commits.** Exercise table-privileged writes as well as the
   reject/promote RPCs; the database trigger, not TypeScript, must remain the last boundary.
2. **Canonical override equality.** Inspect normalization, JSONB null semantics, advisory-lock
   ordering, and the reversal-target forged-hash cases; no unique violation may escape.
3. **Occurrence identity and candidate selection.** Re-run the ended-before-started path against
   real PostgreSQL and confirm a later UUID can neither overwrite nor remove candidacy.
4. **Financial dependency failure direction.** Confirm earnings and consultant CSV errors cannot
   become zero-valued JSON or header-only success, and verify 45-minute override/reversal totals
   across school and consultant consumers.
5. **Executable comparison isolation.** Add another real write/RPC mutation to each comparison
   path and verify the source-boundary test turns red without relying on comments or doubles.

## 10. Known limitations and residual risks

- Local/CI success says nothing about deployment. Brent must apply migrations and perform the
  PLAN read-only production-schema verification after merge; this task neither accessed nor
  changed production.
- A durable status read can itself fail during a wider database outage. That preserves safety
  (it cannot demote `complete`) but retries the job until the database is readable.
- The batch state trigger intentionally makes terminal rows wholly immutable, including
  `updated_at` and rejection-reason rewrites. Operational annotations must live elsewhere.
- PostgreSQL advisory locking uses a 64-bit hash. A collision may serialize unrelated request
  IDs but canonical request-ID/payload comparison prevents them from merging.
- Real Zoom report/webhook divergence remains an operational blind spot already documented in
  PLAN §15.3.5; no live Zoom or real participant data was used here.

## 11. Prohibitions and handoff

No merge, push, deploy, Vercel call, production/remote DB access, real data, RLS disablement,
test weakening, or destructive migration occurred. The builder is not the acceptor. Independent
review must use the cumulative boundary and issue its own verdict after the orchestrator replaces
the canonical placeholders.
