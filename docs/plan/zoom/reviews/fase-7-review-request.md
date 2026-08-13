# Fase 7 (Z7) — review request · FULL PHASE (Z7-1 … Z7-5)

> Supersedes every earlier revision of this file (which tracked Z7-2 attempts 2–4
> under the withdrawn contract). The review boundary is the **cumulative diff
> `43999499..HEAD`**, judged against `PLAN.md` §15.3 with **§15.3.9 as the governing
> pairing/reconciliation contract** — not against `Z7-r2.md`, whose [R3]/[R4] are
> withdrawn.

| | |
|---|---|
| Branch | `feat/zoom-hours` (worktree `/Users/brentcurtis/dev/wt/zoom-hours`) |
| Base | `main` @ `4399949942bfcf49dfa8de40cbf7edbf40f0490e` |
| Implementation head | `8ccc64b3` (this docs commit rides on top; review the cumulative diff) |
| Commits from base | 19 = 18 at `8ccc64b3` (1 phase-open docs · 5 Z7-1 incl. its dispatch/close docs · 8 Z7-2 attempt/replan history · 4 implementation checkpoints `4c1b11e2`→`8ccc64b3`) + this docs commit |
| Executor | Claude (single durable conversation, overlay §4.2; cumulative attempt 5) |
| Reviewer protocol | `docs/planning/review-protocol.md` + lean overlay §4.3 |

## 1. Phase objective and scope

**Objective (§15 row + §11 + §15.3.9):** persist Zoom attendance evidence per §6/§7,
capture the authoritative participant report per occurrence, build the §11 override
machinery (the ONLY path that changes billed hours), and surface planned-vs-Zoom
comparison + facilitator attendance suggestions — with Zoom data **comparison/audit
only, never billing** (nothing Zoom-derived can write `contract_hours_ledger`).

**In scope / delivered:** Z7-1 attendance data plane (approved earlier, untouched) ·
Z7-2 corrected ingestion under §15.3.9 · Z7-3 report reconciliation · Z7-4 override
machinery · Z7-5 admin comparison/override panel + facilitator suggestions panel.

**Out of scope, confirmed untouched (§15.3.3):** recording/transcription/minutas/
consent (Z4/Z5/Z8/Z12) · Client View / `lib/meet/*` / `JoinMeetingButton.*` (Z3b) ·
`tests/e2e/` (sealed since Z2-2b — `git diff --stat main...HEAD -- tests/e2e/` is
empty) · the production RLS allowlist and `20260803170000` · the Vitest 1.x upgrade ·
leadership aggregates · `has_global_workspace_access` (pre-existing, needs an owner).

## 2. Chunk-to-commit map

| Chunk | Commit | Content |
|---|---|---|
| Z7-1 (approved 2026-08-12) | `0e29d53b`, `c2cf4ed2`, `e5b5a26d` | attendance schema, actual-elapsed instants, SECURITY DEFINER facilitator predicate, lifecycle RPC — Codex `PASS` |
| Z7-2 history (superseded impl + replan docs) | `6177ad5e` … `a08370aa` | attempts 2–4 and the §15.3.9 contract replan; the unsafe fallback implementation these introduced is REMOVED at `4c1b11e2` |
| **Z7-2 (re-scoped, attempt 5)** | `4c1b11e2` | uuid-only closure; `zoom_internal.zoom_attendance_observations`; one-transaction leave applier; index widened in place |
| **Z7-3** | `349f13d1` | report page read + fake pagination; complete-batch validation; DB-owned batch promotion; `attendance_reconcile` job + hourly enqueue; effective-set resolver |
| **Z7-4** | `0d5bd910` | `session_hour_overrides` + trigger; `effective_minutes`; apply/reverse RPC; §11 coalesce closed in every consumer incl. `get_bucket_summary` |
| **Z7-5** | `8ccc64b3` | hours-comparison + attendance-suggestions endpoints; `HoursComparisonPanel` (admin) + `AttendanceSuggestionsPanel` (facilitator); es-CL copy + data-testids |

## 3. The governing contract, in five sentences

A `participant_left` may close an interval ONLY via a Zoom-minted `participant_uuid`
matching exactly one open row in the occurrence; name/e-mail/`customer_key` are
reconciliation evidence and never authorise a destructive write. Every leave lands as
a durable private observation, committed in ONE transaction with any eligible close.
The participant report becomes authoritative only as a COMPLETE batch (every page,
unchanged parameters, count == `total_records`, consistent metadata), promoted
atomically under a DB-owned monotonic sequence; a complete batch supersedes webhook
attendance WHOLESALE per occurrence, and no row is ever matched across sources.
Billed hours change only through the admin override RPC (actor = `auth.uid()` inside;
zero-waiver additive `effective_minutes`; append-only audit). Everything uncertain —
open intervals, provisional webhook data, live occurrences — is rendered as a STATE,
never a fabricated number.

## 4. Files by risk

**HIGH — billing and destructive-write authority**
- `supabase/migrations/20260813120200_session_hour_overrides.sql` — the override
  table + trigger + `apply_session_hour_override` + the `get_bucket_summary`
  replacement (identical signature; the only formula change is the §11 coalesce)
- `lib/services/billable-hours.ts` — the §11 coalesce with the one rounding rule
- `pages/api/admin/sessions/[id]/hour-override.ts` — the admin mutation route
- `supabase/migrations/20260813120000_zoom_attendance_observations.sql` —
  `apply_participant_leave`: the only webhook-time interval-close path
- `supabase/migrations/20260812120000_zoom_attendance_participant_uuid.sql` —
  amended IN PLACE (unmerged/unapplied): index widened, withdrawn-contract comments
  rewritten

**MEDIUM — reconciliation and ingestion correctness**
- `supabase/migrations/20260813120100_zoom_attendance_report_batches.sql` — batch
  table + atomic `promote_attendance_report_batch` + report-row CHECKs
- `lib/zoom/participant-lifecycle.ts`, `lib/zoom/attendance-store.ts` — the applier
  and its one-call leave path
- `lib/zoom/attendance-report.ts`, `lib/zoom/jobs/attendance-reconcile.ts`,
  `lib/zoom/attendance-report-store.ts` — complete-batch fetch/validate/promote
- `lib/zoom/attendance-effective.ts` — read-time supersession
- `pages/api/cron/zoom-reconcile.ts` — candidate listing + hourly enqueue
- `lib/zoom/api.ts`, `lib/zoom/fake.ts` — the paginated report read (+ the fake that
  paginates exactly as Zoom does)

**LOW — read surfaces and UI**
- `pages/api/admin/sessions/[id]/hours-comparison.ts`,
  `pages/api/sessions/[id]/attendance-suggestions.ts` (read-only; the §7 gate)
- `components/sessions/HoursComparisonPanel.tsx`,
  `components/sessions/AttendanceSuggestionsPanel.tsx` + the two page mounts
- `lib/services/school-hours-report.ts`, `pages/api/sessions/reports/analytics.ts`
  (select `effective_minutes`; derivation unchanged otherwise)
- `lib/zoom/attendance-identity.ts`, `lib/zoom/attendance-intervals.ts` (evidence/
  arithmetic modules; closure inputs removed)

## 5. Gates — exact commands, counts, exit codes

All run in the worktree at the final head, unpiped (tails recorded from full runs).

| Gate | Command | Result | Exit |
|---|---|---|---|
| Type-check | `npm run type-check` | PASS, no output | 0 |
| Lint | `npm run lint` | PASS, zero warnings (`--max-warnings=0`) | 0 |
| Unit | `npm test` | **318 files / 7,244 passed + 11 skipped (7,255)** · jsdom `environment` 246–268 ms (real collection — the base checkout's silent-skip regression did not recur) | 0 |
| Build | `npm run build` | PASS (production; 156/156 static pages) — run twice: once against the real `.env.local`, once CI-style against the local stack for e2e | 0 |
| pgTAP | `supabase db reset` then `npm run test:db` | clean replay of ALL migrations from scratch · **12 files / 649 tests** (011 = 134 · 015 = 49 · 002 = 137) | 0 |
| E2E | CI recipe: CI-style `.env.local` → `npm run build` → `node scripts/ci/seed-e2e.mjs` → `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **see §5.1** | — |
| 3-TZ matrix | `TZ=UTC npm test` · `TZ=America/Santiago npm test` · `TZ=Europe/Madrid npm test` | UTC and Santiago: **identical 7,244 passed**. Madrid: 7,236 passed + **8 pre-existing failures in `lib/__tests__/businessDays.test.ts`** — byte-identical to `main`, licitación scope, fails on `main` under Madrid too; **not Z7's** (carried finding, §10). Every Z7/hours suite passes under all three TZs | see note |
| lint:testid | `npm run lint:testid` | advisory — **zero hits in any file this phase adds**; total warning count unchanged vs `main` (2,625 vs 2,626 baseline; the delta is measurement noise in pre-existing files, not a new element) | n/a (advisory) |

### 5.1 E2E result

**117 passed (1.1 m), exit 0**, followed by the no-skip guard:
`node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` →
"OK — 11 mandatory spec(s) ran with no skips". Run exactly as CI runs it: CI-style
`.env.local` built from `supabase status` (local stack, `ZOOM_MODE=mock`, synthetic
cron secret), fresh `supabase db reset`, production build with those values inlined,
`node scripts/ci/seed-e2e.mjs`, then
`CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)
--project=chromium` against `npm run start`. The real `.env.local` was backed up
first and restored after; `tests/e2e/` itself is untouched ([Z7-A8]).

## 6. Critical invariants — entry points for the reviewer

| Invariant | Enforced at |
|---|---|
| Closure requires Zoom-minted uuid × exactly one open row | `supabase/migrations/20260813120000_zoom_attendance_observations.sql:115` (`apply_participant_leave`); TS single-call path `lib/zoom/participant-lifecycle.ts:256` |
| Observation + close = ONE transaction; duplicate delivery does nothing at all | same function — the `EXCEPTION WHEN unique_violation` rollback; proven in pgTAP 011 **L3** (pre-seeded key makes the close roll back) and vitest `[C6b]` |
| Rejoin admissible / redelivery refused | widened partial index `supabase/migrations/20260812120000_zoom_attendance_participant_uuid.sql:67` `(zoom_meeting_uuid, participant_uuid, joined_at)` |
| Batch authoritative only when COMPLETE; promotion atomic; DB-owned order | `supabase/migrations/20260813120100_zoom_attendance_report_batches.sql:123` (`promote_attendance_report_batch`, count re-check INSIDE the txn); completeness rule `lib/zoom/attendance-report.ts:65`; job rejection paths `lib/zoom/jobs/attendance-reconcile.ts:166` |
| Wholesale supersession, never cross-source matching; webhook rows never edited | `lib/zoom/attendance-effective.ts:61` (read-time rule; the report store has no interval-write member at all) |
| Report rows: batch-scoped, closed, no `participant_uuid`, no delivery key | paired CHECKs in the batches migration (`zoom_attendance_report_batch_source`, `zoom_attendance_report_rows_closed`) + promote RPC inserts |
| Overrides append-only at the database | trigger `supabase/migrations/20260813120200_session_hour_overrides.sql:93`; pgTAP 015 [Z7-A3] |
| Override path unreachable by service/jobs/Zoom | `apply_session_hour_override` (`...20260813120200...sql:127`): actor from `auth.uid()` inside, NULL aborts, non-admin aborts, **EXECUTE revoked from `service_role` explicitly** (Supabase default privileges grant it otherwise); pgTAP 015 [Z7-A4] |
| The exact §11 chain | pgTAP 015 [Z7-A5]: 90-planned → 45 → 30 → reverse-second = 45 → reverse-first = NULL/planned, plus refusals (reverse-non-latest, double-reverse, reverse-a-reversal) |
| One billable derivation, one rounding rule | `lib/services/billable-hours.ts:116` and the same `round(effective_minutes/60.0, 2)` in `get_bucket_summary` — §11 "a single adjusted value flows to both consumption and payment" |
| Zoom data never reaches billing | `git diff main...HEAD -- lib/services/hour-tracking.ts` **empty**; `billable-hours.ts` reads only ledger columns; the ONLY `effective_minutes` writer is the admin RPC (grep `effective_minutes` across `lib/`, `pages/` — no other writer) |
| Uncertainty is a state, never a number | `totalPresenceSeconds` counts CLOSED intervals only (`lib/zoom/attendance-intervals.ts`); both endpoints emit `state`/`has_open_interval(s)` flags; both panels render es-CL states (component suites pin the copy) |

## 7. Adversarial / fail-on-old evidence

1. **Vitest fail-on-old (identity closure).** Restoring the withdrawn fallback-closure
   arm (token-containment close for uuid-less leaves) into the store double fails
   exactly `[C3]`, `[C4]` (H1/H2) and `[C5]` — 3 failed / 31 passed. The attempt-4
   suite was green over this defect; this one is not.
2. **SQL fail-on-old (identity closure).** The same fallback arm written into the REAL
   `apply_participant_leave` (transient `CREATE OR REPLACE` on the local stack, never
   committed) fails pgTAP 011 at exactly the three **L4** asserts ("a uuid-less leave
   is unpairable", "the matching-evidence open row STAYS OPEN", evidence recording) —
   3 failed of 134. Function restored by `supabase db reset`; the committed migration
   was never altered.
3. **Transaction-boundary probes on real SQL.** 011 **L3**: a pre-seeded observation
   key makes `apply_participant_leave` report `observation_duplicate` AND leaves the
   interval OPEN — the close rolled back with the conflict. 011 **B2**: a promote
   whose row count ≠ `total_records` raises, and afterwards the batch is still
   `pending` with ZERO attendance rows — rows and flip are one transaction.
4. **Authorization probes.** pgTAP 015: NULL `auth.uid()` aborts (P0403); authenticated
   docente and consultor rejected; `service_role` holds no EXECUTE at all; UPDATE and
   DELETE on the audit table refused by trigger; authenticated INSERT refused by RLS
   (42501). Route tests: 401/403/400/409 taxonomy.
5. **Completeness matrix (12–14).** Unit: the exact suppressed-participant candidate
   (page one of a 31-person meeting) is rejected `pagination_not_exhausted`; count
   drift and metadata drift rejected; mid-pagination page failure rejects the WHOLE
   candidate with nothing promoted (job suite, against the fake that paginates).

## 8. What was verified — and what was NOT

**Verified locally:** everything in §5–§7; migrations replay from scratch; the four
checkpoint commits each passed type-check/lint/full-unit/test:db at their head.

**NOT verified — external, honestly stated:**
- **No real Zoom traffic.** Fixture shapes rest on the committed Z0B captures; the
  report's own completeness behaviour beyond §6.2's four participants across three
  meetings is unmeasured (§15.3.9 blind spot 3). `participant_uuid` rejoin reuse is
  undocumented — either behaviour degrades to no-closure (a performance property,
  not correctness).
- **Nothing about production.** No push, no PR, no merge, no deploy, no production
  access of any kind (not even read). All six Z7 migrations are unapplied outside
  local Docker; per §0.1(d) the phase is not closed until Brent applies them and the
  production schema is verified.
- **True cross-connection concurrency** is exercised at the semantics level (pgTAP
  sequential conflict probes + single-transaction structure + barrier-released vitest
  doubles), not with two live Postgres sessions racing — same posture 002 documents
  for the job queue.

## 9. Accepted deviations

1. **`selectIntervalToClose` was DELETED, not "narrowed"** (§15.3.9 what-survives list
   said narrowed): the close decision moved inside `apply_participant_leave`, where
   "exactly one open row" cannot race a concurrent applier — the same replan, stronger
   form. `isClosableBy` survives as the SQL guard's TS twin; `mergeIntervals`/
   `totalPresenceSeconds` survive as the read-time arithmetic.
2. **`get_bucket_summary` is replaced at its identical signature** (not named in
   §15.3.2's Z7-4 row). Required by §11's own test list — "override 60→45 updates
   aggregates once" and "reversal restores aggregate" are false without it — and by
   "a single adjusted value flows to both consumption and payment". Mechanism follows
   the repo-approved precedent (`20260809120000`), grants and return shape preserved.
3. **The observation outcome enum is exactly §15.3.9's four values**; zero-or-many
   open matches both record `no_open_interval` (rule 3 treats them identically). The
   distinction lives in the row data (`participant_uuid` present or not).
4. **Consumer select-string pins updated** (`school-hours-report.test.ts`,
   `session-reports-analytics.test.ts`): the pinned column lists gained
   `effective_minutes` — the intentional Z7-4 change those pins exist to notice, not
   a weakening (the schema-validation harnesses still refuse unknown columns).
5. **`[C11]` held at the Z7-2 checkpoint** (`4c1b11e2`: billing files untouched);
   Z7-4 then closed the `billable-hours.ts` seam as its own contract requires.
   `hour-tracking.ts` is untouched across the whole phase.
6. **Role-visibility "end to end" is covered by route + component + pgTAP layers**,
   not Playwright: `tests/e2e/` is sealed by [Z7-A8]/§15.3.3, which this phase may
   not override. The §7 gate is asserted at the database (RLS/pgTAP), at the route
   (401/403/404-no-oracle tests) and in the DOM (panel self-removal on 404).

## 10. Known limitations and carried findings

- **Uuid-less duplicate joins can double-count until the report lands** (§15.3.9
  matrix row 7) — accepted deliberately over any matching heuristic; the report
  supersedes wholesale. Rendered provisional until then.
- **Webhook-only occurrences whose report never materialises** stay provisional
  forever (visible state; rejected batches + dead-lettered jobs surface on the §18
  panel when Z12 builds it).
- **Attendance suggestions cannot distinguish "left the meeting" from "connection
  died"** — arrival_status (`late`/`left_early`) is left to the facilitator; the
  panel applies only present/absent.
- **Pre-existing, NOT Z7's:** `lib/__tests__/businessDays.test.ts` fails 8 tests
  under `TZ=Europe/Madrid` on `main` too (licitación scope; flagged as a separate
  task). `public.has_global_workspace_access` remains carried with no owner.
- **`docs/plan/LEDGER.md` at the primary checkout** carries uncommitted lean-pilot
  edits outside this worktree — not this branch's to commit.

## 11. Hardest areas for an independent reviewer

1. **The one-transaction leave applier** (`apply_participant_leave`) — the FOR UPDATE
   candidate lock, the whole-body EXCEPTION rollback, and whether any interleaving of
   route × sweep can produce a closed interval with an unmatched observation (the
   [C6b] property). The pgTAP L-probes are sequential; judge whether the argument
   from single-function atomicity closes the true-concurrency gap.
2. **Batch authority ordering** — `seq` is minted at PENDING-batch creation (fetch
   start), so of two overlapping fetches that both complete, the LATER-STARTED wins
   even if it finished first. Both are complete snapshots and the rule is
   deterministic and clock-free, but check it against §15.3.9's "later partial can
   never displace earlier complete" (it cannot: rejected/pending batches never win).
3. **The reversal chain semantics** in `apply_session_hour_override` — "latest
   unreversed non-reversal" selection (`ORDER BY seq DESC`), the restore of the
   TARGET's `previous_minutes`, and the ledger flag resets when the chain empties.
   The §11 sequence is pinned in pgTAP 015 E1–E7; hunt for a chain state those seven
   cases miss (e.g. apply-after-reversal then reverse again — previous_minutes
   snapshots make it consistent, but verify).
4. **The §11 coalesce in `get_bucket_summary`** — applied to BOTH the reservada and
   consumida sums (uniform rule; effective_minutes only ever exists on consumida
   rows). Confirm no consumer still derives hours from `chl.hours` directly
   (`school-hours-report`, `analytics`, reschedule RPC availability math).
5. **The suggestions endpoint's absence semantics** — `absent` only under a complete
   report batch, `no_data` under provisional webhook data. This is product-visible
   direction-of-failure; check the tri-state against §15.3.5's "never toward a wrong
   person marked present" and the copy in `AttendanceSuggestionsPanel`.
