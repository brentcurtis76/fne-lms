# Fase 7 (Z7) — review request · chunk Z7-1, attempt 1

> Written by the executor per `CLAUDE.md` executor rule 6 and the Z7-r1 prompt §11.
> This file covers **chunk Z7-1 only**. Z7-2 … Z7-5 append to it as they land; the
> phase is not reviewable as a whole until they do.

## Branch, base, commits

| | |
|---|---|
| Worktree | `/Users/brentcurtis/dev/wt/zoom-hours` (git common dir `/Users/brentcurtis/dev/fne-lms/.git`) |
| Branch | `feat/zoom-hours` |
| Base | `main` @ `4399949942bfcf49dfa8de40cbf7edbf40f0490e` |
| Commits on the branch | 2 — `ba82884e` (PM: Z7 contract + r1 prompt), plus this chunk's implementation commit |
| Phase contract | `docs/plan/zoom/PLAN.md` §15.3 (self-contained); §11, §6, §7, §10 normative |
| Executor prompt | `docs/plan/zoom/prompts/Z7-r1.md` |

## Objective and scope (copied from §15.3.2, Z7-1)

**Z7-1 — attendance schema + the actual-elapsed instants.** Migration creating
`public.zoom_attendance` per §6 (school_id NOT NULL, surface keys, per-person interval
rows, identity columns `user_id` nullable / `customer_key` / `display_name` /
`transient_email`, `matched_by` enum) with RLS per §7 (admin all; consultor only if
facilitator; facilitator of that surface; **nobody else, and no authenticated write
policy at all**); the two additive `zoom_meetings.actual_*` columns from the C6
amendment plus their guarded lifecycle writes; pgTAP appended to
`supabase/tests/011-zoom-public-rls.sql` in that file's existing 010 style.

**Out of scope (§15.3.3 and prompt §4), and untouched here:** participant ingestion,
identity matching and interval merging (Z7-2) · the participant report and
`attendance_reconcile` (Z7-3) · `session_hour_overrides`, `effective_minutes`, the
override RPC, the `billable-hours.ts` seam (Z7-4) · every UI surface (Z7-5) ·
`tests/e2e/` · `lib/meet/*` and `JoinMeetingButton.*` (Z3b) · the 22-table production
RLS allowlist and INSPIRA's `20260803170000` migration.

## Files, grouped by risk

### HIGH — new public data surface and its RLS

| File | Purpose |
|---|---|
| `supabase/migrations/20260811130000_zoom_attendance.sql` (+123) | `public.zoom_attendance`: per-person interval rows, `school_id NOT NULL`, identity columns with `matched_by`, `source`, two indexes, RLS enabled, **two SELECT policies and no write policy for any role**. |

### HIGH — private-schema change on the path that decides a comparison shown to admins

| File | Purpose |
|---|---|
| `supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql` (+72) | Additive nullable `actual_started_at` / `actual_ended_at` on `zoom_internal.zoom_meetings` (the C6 amendment), column comments, and the `BEFORE UPDATE` trigger that makes both write-once by COALESCE. |

### MEDIUM — the webhook lifecycle, which is order-sensitive by design

| File | Purpose |
|---|---|
| `lib/zoom/webhook-lifecycle.ts` (+52/−6) | New `readLifecycleInstant`; `applyWebhookLifecycle` gains an optional 4th parameter (the body's `event_ts`) and passes the parsed instant into the existing guarded transition. |
| `lib/zoom/webhook-store.ts` (+16/−3) | `setMeetingStatus` gains an optional 4th parameter and adds `actual_started_at`/`actual_ended_at` to the same patch, under the same "only when present" rule as the occurrence uuid. |
| `pages/api/zoom/webhook.ts` (+10/−1) | `ZoomWebhookBody` gains `event_ts` and `object.start_time`/`end_time`; the lifecycle call passes `body.event_ts`. |
| `lib/zoom/jobs/webhook-sweep.ts` (+8/−1) | `StoredPayload` gains `event_ts`; the sweep passes the stored body's value. |

### LOW — tests and evidence

| File | Purpose |
|---|---|
| `supabase/tests/011-zoom-public-rls.sql` (+334/−1) | `plan(18)` → `plan(51)`. Three new sections: the `zoom_attendance` persona matrix + write denial, the `actual_*` column shape + §6 lockdown, and the write-once trigger. |
| `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts` (+257) | 10 tests: `readLifecycleInstant` units, and fixture-driven end-to-end instant capture including the out-of-order sequence. |
| `__tests__/api/zoom/webhook.test.ts` (+13/−2) | **Two existing assertions edited** — see "Deviations". |

## Test evidence

| Suite | Command | Result |
|---|---|---|
| jsdom proof `[A0]` | `node -e "…require('jsdom')…"` | `JSDOM OK ok` |
| jsdom proof `[A0]` | `npx vitest run __tests__/lib/meet/embed-capabilities.test.ts` | 30 passed, `environment 119ms` |
| Baseline (pre-change) | `npm test` | **305 files / 7059 passed, 11 skipped (7070)**, `environment 242ms` |
| Final | `npm test` | 306 files / 7069 passed, 11 skipped (7080) |
| New unit suite | `npx vitest run __tests__/lib/zoom/webhook-lifecycle-instants.test.ts` | 10 passed |
| pgTAP | `npm run test:db` | 11 files / **517 tests**, `Result: PASS` |

**The baseline number matters and is not the one in the pilot paperwork.**
`docs/plan/SOP-PILOT.md` records "6,575 unit tests" at this base. That figure comes
from a run in which Vitest 0.34 silently dropped all 51 jsdom files because `canvas`
failed to load — green, exit 0, `environment 0ms`. The baseline recorded above was
measured in this worktree after `npm ci`, with jsdom proven working first.

### Fail-on-old — two mutation probes, each reverted and re-proved by hash

Pre-probe hashes:

```
30b916ca3c268b37d8cec0cb0125a153b6da3b401ee86eabec6eafedfc1cb393  20260811130000_zoom_attendance.sql
984d5f783c47e7bd71bf2002c9c5924d517b4ee530b48c9b31607168c1cc5e64  20260811130100_zoom_meeting_actual_instants.sql
```

**Probe (i) — drop the COALESCE guard on `actual_started_at`.**
`NEW.actual_started_at := COALESCE(OLD.actual_started_at, NEW.actual_started_at)` →
`NEW.actual_started_at := NEW.actual_started_at`, then `supabase db reset && npm run test:db`:

```
# Failed test 48: "a REPLAYED meeting.started cannot overwrite an instant already recorded"
#         have: 2001-01-01 00:00:00+00
#         want: 2026-07-29 23:55:56+00
# Failed test 51: "an unrelated UPDATE leaves both instants exactly as they were"
Result: FAIL          exit=1
```

**Probe (ii) — widen the facilitator predicate to any active consultor at the school.**
Replaced the `session_facilitators` EXISTS with a `user_roles` school-scope EXISTS,
then `supabase db reset && npm run test:db`:

```
# Failed test 24: "consultor A (School A, NOT the facilitator): sees nothing — school scope grants nothing here"
#         have: 2   want: 0
# Failed test 25: "consultor B (School B): sees nothing, including their own school's row"
#         have: 1   want: 0
Result: FAIL          exit=1
```

Both files were restored from backup and re-hashed to the two values above before the
final gate run.

## The five areas to scrutinise hardest

1. **The write-once trigger is a one-way door, and I chose it knowingly.**
   `zoom_internal.preserve_actual_instants()` COALESCEs both columns on *every* UPDATE,
   so no writer can ever revise an instant. That is exactly what [A6] asks for, and it
   is enforced below every caller rather than inside one. But §11 quantity (3) reads
   *"started/ended webhook instants **(reconcile-corrected)**"*, and a reconcile
   correction cannot go through a plain UPDATE against this trigger. Z7-3 will need an
   explicit path (a `SECURITY DEFINER` function, or a trigger exemption keyed on the
   writer). The alternative — putting COALESCE in the UPDATE's SET list — is not
   available: the writer is PostgREST, which sends literal values only. **Challenge
   whether write-once is the right default, or whether the trigger should have been
   scoped narrower from the start.**

2. **`meeting.ended` carries `start_time` and I deliberately do not read it.** The
   committed `meeting-ended.json` capture has `payload.object.start_time`. The prompt
   specifies "`meeting.started` records `actual_started_at` and `meeting.ended` records
   `actual_ended_at`", and [A5] asserts exactly that, so each event writes only its own
   column. The visible consequence: in the out-of-order case (`ended` applied first,
   then a swept `started` refused by the status guard) `actual_started_at` stays NULL
   forever even though the `ended` payload contained the value. That is a data loss
   the reconcile could repair — and cannot, per point 1. A reviewer may reasonably
   judge this the wrong trade.

3. **`community_meeting` attendance rows are readable by admins only.** §7's "Fac ✓"
   applies to both surfaces, but the facilitator predicate for community meetings is
   `community_meetings.facilitator_id`, not `session_facilitators`, and the Z7-1 scope
   names only the latter. I under-granted rather than invent a policy, and the
   migration comment says so. Verify that the direction (fail-closed) is acceptable and
   that Z7-5 is the right home for the missing policy.

4. **The RLS predicate reads another RLS-protected table.**
   `zoom_attendance_facilitator_select` does `EXISTS (SELECT 1 FROM
   public.session_facilitators …)`, copying the baseline's `attendees_consultor_select`
   pattern verbatim. The pgTAP passes with `z_fac_a` (an active consultor at that
   school, so `facilitators_consultor_select` also lets them read the row). **A
   facilitator with `facilitator_role = 'equipo_interno'` and no consultor role at that
   school is not covered by any fixture here**, and whether they can read their own
   `session_facilitators` row through baseline policy is unverified. If they cannot,
   they will not see attendance for their own session. Fail-closed, but a real hole in
   my coverage.

5. **The header/body timestamp asymmetry.** `event_ts` in the body is milliseconds; the
   `x-zm-request-timestamp` header is seconds; mixing them has already produced one
   committed defect in this repo. I made the header structurally unreachable (the
   function's callers hand it only the parsed body) and asserted the recorded instant
   equals neither reading of the header. Confirm the structural argument holds and that
   no future caller can hand the header value in through the new 4th parameter.

## Criteria

| ID | Status | Evidence |
|---|---|---|
| A0 | met | Both commands pasted above; baseline 305 files / 7059 tests, `environment 242ms`. |
| A1 | met | `20260811130000_zoom_attendance.sql`; pgTAP `col_not_null` on `school_id`; table created with every §3(a) column, CHECK and FK. |
| A2 | met | pgTAP: 6 write-denial asserts across two personas **plus** a structural assert that `pg_policies` holds zero rows for this table with `cmd <> 'SELECT'`. Probe (ii) proves the suite fails on a widened policy. |
| A3 | met | pgTAP asserts admin=3, facilitator=2 (+ negative on the other session), same-school non-facilitator=0, other-school=0, GC member=0, anon=0. |
| A4 | met | pgTAP: `has_column` ×2, `col_type_is` ×2, `col_is_null` ×2, `has_column_privilege` false ×4, plus schema-USAGE and zero-table-grants re-asserted after the migration. |
| A5 | met | `webhook-lifecycle-instants.test.ts` asserts `2026-07-29T23:55:56.000Z` and `2026-07-30T00:03:26.000Z` by value from the committed captures, plus the `event_ts`-in-ms fallback and the header-unreachability assert. `__tests__/api/zoom/webhook.test.ts` pins the same two values end-to-end through the route. |
| A6 | met | Out-of-order half (`ended` then a swept `started`) in Vitest against a store double that models the guard and applies the patch verbatim; replay half in pgTAP against a real database. Probe (i) proves the pgTAP half fails without the guard. |
| A7 | **partial** | Behaviour is unchanged and all 305 pre-existing files pass. **But two assertions in `__tests__/api/zoom/webhook.test.ts` were edited** — see Deviations. |
| A8 | met | `git diff --stat main..HEAD -- tests/e2e/` is empty. |
| A9 | met | All five gates run verbatim at the final head; see the executor report. |

## Deviations and accepted trade-offs

1. **[A7] is partial: two existing assertions were edited.**
   `__tests__/api/zoom/webhook.test.ts:507` and `:534` assert the exact argument list of
   `setMeetingStatus` via `toHaveBeenCalledWith`. Z7-1 widens that call by one argument
   and the value is non-`undefined` in both tests (the fixtures carry real times), so
   the assertions cannot pass unedited. I added the expected instant rather than
   loosening the assertion — the edited tests are strictly stronger than before, and
   now pin the instant end-to-end through the real route. No other existing test was
   touched, and no assertion was weakened or deleted anywhere.

2. **The COALESCE lives in a trigger, not in the UPDATE's SET list.** The prompt says
   "inside the same guarded UPDATE". A `BEFORE UPDATE` trigger fires as part of that
   statement and cannot be raced, so the ordering property is the one requested; but
   the mechanism is not literally the SET list, because PostgREST cannot express an
   expression over the existing row. Consequence in scrutiny point 1.

## Known limitations, deferred items, and blind spots

- **Not exercised against a real recorded session.** Z0B's capture is the only evidence
  behind the fixture shapes (§15.3.5).
- **Local and CI green say nothing about deployment.** Both migrations must be applied
  to production by Brent and the schema verified read-only before the phase closes
  (§0.1(d) — Z1b broke session approval in production despite ten green review rounds).
- **`zoom_attendance` has no uniqueness constraint and no `left_at >= joined_at` CHECK.**
  Deliberate: dedupe and interval merging are Z7-2's pure modules, and rejecting a row
  Zoom reported would lose attendance data rather than preserve it.
- **`community_meeting` facilitator SELECT policy** — deferred, see scrutiny point 3.
- **Reconcile correction of `actual_*`** — blocked by the write-once trigger, see
  scrutiny point 1. Z7-3 must resolve it.
- **`equipo_interno` facilitators** are not covered by any fixture, see scrutiny point 4.
- **`.env.local`** was copied into the worktree for `npm run build` and is gitignored;
  `git check-ignore -v .env.local` confirms, and it appears in no commit.
