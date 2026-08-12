# Fase 7 (Z7) — review request · chunk Z7-1, attempt 2

> Written by the executor per `CLAUDE.md` executor rule 6 and the Z7-r1 prompt §11.
> This file covers **chunk Z7-1 only**. Z7-2 … Z7-5 append to it as they land; the
> phase is not reviewable as a whole until they do.
>
> **Attempt 2 supersedes attempt 1.** Attempt 1's self-report nominated five areas for
> scrutiny; Brent's remediation directive addressed three of them at the root. What
> changed is summarised in "What attempt 2 changed and why" below — read that first if
> you reviewed attempt 1.

## Branch, base, commits

| | |
|---|---|
| Worktree | `/Users/brentcurtis/dev/wt/zoom-hours` (git common dir `/Users/brentcurtis/dev/fne-lms/.git`) |
| Branch | `feat/zoom-hours` |
| Base | `main` @ `4399949942bfcf49dfa8de40cbf7edbf40f0490e` |
| Commits | `ba82884e` (PM contract + prompt) · `0e29d53b` (attempt 1) · `c2cf4ed2` (attempt-1 ledger) · this remediation commit |
| Phase contract | `docs/plan/zoom/PLAN.md` §15.3; §11, §6, §7, §10 normative |
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

**Out of scope (§15.3.3 and prompt §4), and untouched:** participant ingestion, identity
matching and interval merging (Z7-2) · the participant report and
`attendance_reconcile` (Z7-3) · `session_hour_overrides`, `effective_minutes`, the
override RPC, the `billable-hours.ts` seam (Z7-4) · every UI surface (Z7-5) ·
`tests/e2e/` · `lib/meet/*` and `JoinMeetingButton.*` (Z3b) · the 22-table production
RLS allowlist and INSPIRA's `20260803170000` migration.

## What attempt 2 changed and why

### 1. The facilitator predicate is now a SECURITY DEFINER function

Attempt 1 inlined `EXISTS (SELECT 1 FROM public.session_facilitators …)` into the
policy. Two defects, both now fixed:

- **An RLS policy's subquery is itself subject to the referenced table's RLS.**
  `session_facilitators` carries only `facilitators_consultor_select` (requires
  `ur.school_id = cs.school_id`) and `facilitators_gc_member_select`. A facilitator
  who is `equipo_interno`, or a consultor whose `user_roles.school_id` is NULL, could
  not read their **own** facilitator row — and therefore saw no attendance for a
  session they run. Attempt 1 flagged this as an untested blind spot; it was a real
  defect. `public.is_zoom_surface_facilitator` is SECURITY DEFINER so the membership
  lookup no longer depends on the caller's own read rights.
- **`community_meeting` surfaces had no policy at all** (admin-only). The function's
  second branch covers them via `community_meetings.facilitator_id`.

Least privilege, clause by clause: `auth.uid()` is read inside the function so the
caller cannot supply an identity; it returns one boolean and no rows, so an accidental
grant leaks a membership bit rather than data; `STABLE`; `SET search_path = ''`;
`EXECUTE` revoked from `PUBLIC` and `anon`, granted to `authenticated` only.

### 2. The write-once trigger is gone, replaced by a guarded lifecycle RPC

Attempt 1 used a `BEFORE UPDATE` trigger, which made the two columns write-once for
**every** writer — including the Z7-3 reconcile, whose participant report §11 makes
authoritative. `zoom_internal.apply_meeting_lifecycle` scopes the rule to the
replay-prone webhook path instead:

- one atomic statement whose `WHERE ... status = ANY (p_applies_from)` is the same
  monotonicity guard as before, now sent as an argument so
  `lib/zoom/webhook-store.ts` stays the single source of truth for the sets;
- `COALESCE(m.actual_started_at, p_actual_started_at)` and the same for
  `actual_ended_at` — fill-while-NULL, so a replay is inert;
- `SECURITY INVOKER`, because the caller is already `service_role`;
- **a plain service-role `UPDATE` still corrects either column** — the explicit path
  Z7-3 needs, asserted in pgTAP rather than merely claimed.

### 3. `meeting.ended` now supplies `actual_started_at` too

Its payload states when the occurrence began as well as when it finished. Under
fill-while-NULL that cannot race `meeting.started`; what it fixes is the out-of-order
case, where the `started` that follows is refused by the guard and attempt 1 left
`actual_started_at` NULL forever. **The `event_ts` fallback stays asymmetric on that
branch**: it may stand in for `end_time`, never for `start_time`, because the ended
event is delivered when the meeting finished and using its timestamp as a start would
record a zero-length meeting as fact.

The out-of-order test no longer expects NULL. It asserts **both exact fixture
instants**, in Vitest and again against a real database.

## Files, grouped by risk

### HIGH — new public data surface, its RLS, and the predicate behind it

| File | Purpose |
|---|---|
| `supabase/migrations/20260811130000_zoom_attendance.sql` | `public.zoom_attendance` (per-person intervals, `school_id NOT NULL`, `matched_by`, `source`, two indexes), `public.is_zoom_surface_facilitator`, RLS enabled, two SELECT policies, **no write policy for any role**. |

### HIGH — private-schema change on the path that feeds an admin billing comparison

| File | Purpose |
|---|---|
| `supabase/migrations/20260811130100_zoom_meeting_actual_instants.sql` | Additive nullable `actual_started_at` / `actual_ended_at`, column comments, and `zoom_internal.apply_meeting_lifecycle`. |

### MEDIUM — the webhook lifecycle, order-sensitive by design

| File | Purpose |
|---|---|
| `lib/zoom/webhook-lifecycle.ts` | `readLifecycleInstant`; the per-event instant policy including the asymmetric `event_ts` fallback; passes both instants into the guarded call. |
| `lib/zoom/webhook-store.ts` | `LifecycleInstants`; `setMeetingStatus` now calls the RPC and sends the applies-from set as an argument. |
| `pages/api/zoom/webhook.ts` | `ZoomWebhookBody` gains `event_ts` and `object.start_time`/`end_time`; passes `body.event_ts`. |
| `lib/zoom/jobs/webhook-sweep.ts` | `StoredPayload` gains `event_ts`; the sweep passes the stored body's value. |

### LOW — tests and evidence

| File | Purpose |
|---|---|
| `supabase/tests/011-zoom-public-rls.sql` | `plan(18)` → `plan(71)`. Persona matrix incl. the three new personas and the uuid collision; the predicate's own grants and `prosecdef`; the `actual_*` column shape and §6 lockdown; the RPC's grants, guard, fill-while-NULL, out-of-order sequence and correction path. |
| `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts` | 14 tests, fixture-driven. |
| `__tests__/lib/zoom/webhook-store.test.ts` | Wire assertions moved from the PATCH query string to the RPC body. |
| `__tests__/api/zoom/webhook.test.ts` | Two `toHaveBeenCalledWith` assertions updated. |

## Test evidence

| Suite | Command | Result |
|---|---|---|
| jsdom proof `[A0]` | `node -e "…require('jsdom')…"` | `JSDOM OK ok` |
| jsdom proof `[A0]` | `npx vitest run __tests__/lib/meet/embed-capabilities.test.ts` | 30 passed, `environment 119ms` |
| Baseline (pre-change) | `npm test` | **305 files / 7059 passed, 11 skipped (7070)**, `environment 242ms` |
| Final | `npm test` | 306 files / **7074 passed**, 11 skipped (7085), `environment 430ms` |
| pgTAP | `npm run test:db` | 11 files / **537 tests**, `Result: PASS` |

`docs/plan/SOP-PILOT.md` records "6,575 unit tests" at this base. That figure comes from
a run in which Vitest 0.34 silently dropped all 51 jsdom files because `canvas` failed
to load — green, exit 0, `environment 0ms`. The baseline above was measured in this
worktree after `npm ci`, with jsdom proven working first.

### Fail-on-old — three probes, each reverted and re-proved by hash

Pre-probe hashes:

```
d0d8a538b18ec81abec1b5f7049aec44f9347b7f53b2119f6520f5ec2e097746  20260811130000_zoom_attendance.sql
3a9305440caf386a840cd288311e96b0110d324e528266b45ae7d0f8b7c0d379  20260811130100_zoom_meeting_actual_instants.sql
```

**Probe (i) — drop `SECURITY DEFINER` from the facilitator predicate.**
`Failed 51/71`, exit 1. The first facilitator persona errors outright:

```
ERROR: relation "user_roles" does not exist
CONTEXT: PL/pgSQL function public.has_global_workspace_access(uuid) line 3 at RETURN
         SQL function "is_zoom_surface_facilitator" statement 1
```

Worth reading closely, because it says something the green run does not: as INVOKER the
predicate evaluates `community_meetings`' own RLS, whose policy function
`has_global_workspace_access` reads `user_roles` **unqualified** and therefore breaks
under this function's `SET search_path = ''`. DEFINER avoids that because the definer
bypasses RLS on the two membership tables, so no foreign policy function is invoked.
The coupling is real; it fails loudly rather than silently, which is the right
direction, and it is called out again under "scrutinise hardest".

**Probe (ii) — ignore `surface_type` (evaluate both branches with `OR`).**
`Failed 5/71`, exit 1: tests 26–29 (the uuid collision, both directions) and 45 (the
unknown-surface-type denial).

**Probe (iii) — drop the fill-while-NULL COALESCE on `actual_started_at`.**
`Failed 1/71`, exit 1: test 66, `have: 2001-01-01 00:00:00+00`,
`want: 2026-07-29 23:55:56+00`.

All three files restored and re-hashed to the values above before the final gate run.

## The areas to scrutinise hardest

1. **`SECURITY DEFINER` on a predicate reachable from any authenticated session.** It is
   the fix for two real defects, but it is also a privilege amplifier: anyone who can
   execute it gets a membership answer computed with owner rights. The mitigations are
   that it returns a boolean and no rows, reads `auth.uid()` internally, and is
   EXECUTE-revoked from `PUBLIC`/`anon`. **Judge whether the amplification is
   proportionate**, and whether a `SET search_path = ''` DEFINER function calling into
   `public` is the right shape given probe (i)'s finding about
   `has_global_workspace_access`.
2. **`anon` now gets `42501` from `zoom_attendance`, not an empty set.** Revoking `anon`
   EXECUTE means the policy cannot be evaluated at all for an unauthenticated caller.
   That is a stricter denial and it is asserted — but it is a different failure MODE
   from every other table in this codebase, and a future PostgREST reader expecting
   `[]` will see an error. Confirm this is the posture you want.
3. **The applies-from set is now a parameter, not SQL.** This avoids a third drifting
   copy of the monotonicity rule (`sync_projection_from_meeting` already carries a drift
   warning), and `webhook-store.test.ts` reads the array back off the wire. But the
   guard is now caller-supplied: **a caller that sent a wider set would widen the rule
   silently at the database.** Judge whether the wire assertions are sufficient
   protection, or whether the sets belong in SQL despite the drift cost.
4. **The Vitest store double now models `COALESCE` as well as the guard.** That is a
   model of the RPC, and a model that drifted would keep the unit tests green while
   production diverged. The pgTAP section asserts the same properties against a real
   database precisely so the model is never the only evidence — **verify that the two
   really do cover the same claims**, especially the out-of-order sequence.
5. **The header/body timestamp asymmetry, plus a new one.** Body `event_ts` is
   milliseconds, the `x-zm-request-timestamp` header is seconds, and the header is
   structurally unreachable. Attempt 2 adds a second asymmetry: on the `ended` branch
   `event_ts` may back `end_time` but never `start_time`. Confirm both hold and that no
   future caller can pass the header value in through the fourth parameter.

## Criteria

| ID | Status | Evidence |
|---|---|---|
| A0 | met | Both commands pasted; baseline 305 files / 7059 tests, `environment 242ms`. |
| A1 | met | Migration + pgTAP `col_not_null` on `school_id`; all §3(a) columns, CHECKs and FKs. |
| A2 | met | Six write-denial asserts across two reading personas **plus** a structural assert that `pg_policies` holds zero non-SELECT rows for this table. |
| A3 | met | admin 5 · school-scoped facilitator 2 · **globally scoped facilitator 2** · **named community facilitator 1** · same-school non-facilitator 0 · other-school 0 · GC member 0 · anon denied · both directions of the uuid collision. |
| A4 | met | `has_column` ×2, `col_type_is` ×2, `col_is_null` ×2, `has_column_privilege` false ×4, schema USAGE false, zero table grants. |
| A5 | met | Values from the committed captures: `2026-07-29T23:55:56.000Z`, `2026-07-30T00:03:26.000Z`; `event_ts`-in-ms fallback; header unreachable. Pinned in the unit suite and end-to-end through the route. |
| A6 | met | Replay half: the RPC applies but COALESCE holds the value (pgTAP 66, probe iii). Out-of-order half: `ended` then a swept `started`, asserting **both exact instants** — in Vitest and in pgTAP against a real database. |
| A7 | **partial** | Behaviour preserved and all 305 pre-existing files pass, but three existing test files were edited. See Deviations. |
| A8 | met | `git diff --stat main..HEAD -- tests/e2e/` is empty. |
| A9 | met | All five gates green, in the order requested; see the executor report. |

## Deviations and accepted trade-offs

1. **[A7] remains partial, and attempt 2 widened it.** Attempt 1 edited two assertions
   in `__tests__/api/zoom/webhook.test.ts`. Attempt 2 additionally rewrote the
   `setMeetingStatus` wire assertions in `__tests__/lib/zoom/webhook-store.test.ts`,
   because moving the transition onto an RPC changes the wire contract that file exists
   to pin: a PATCH with `?status=in.(…)` is now a POST to
   `/rest/v1/rpc/apply_meeting_lifecycle` carrying `p_applies_from`. The assertions
   still pin the same sets literally, and one test was added. No assertion was weakened
   or deleted; nothing outside these three files was touched.
2. **Both migrations were amended in place rather than superseded.** They are unapplied
   everywhere (production included — Brent applies migrations separately, and the local
   database is rebuilt from files by `supabase db reset`), and the branch is unmerged.
   A follow-up migration would have had to `DROP POLICY` and drop a trigger, leaving a
   worse permanent record for no gain. **If your convention is append-only migrations
   even pre-merge, say so and I will split them.**
3. **No named "correction RPC" was added.** The directive asked to keep an explicit
   correction path available to Z7-3. Removing the trigger reopens a plain service-role
   `UPDATE`, which is asserted in pgTAP; shipping an unused RPC now would prejudge
   semantics Z7-3 should choose. The path is documented in both migration headers and
   proved by test rather than merely asserted in prose.

## Known limitations, deferred items, and blind spots

- **Not exercised against a real recorded session.** Z0B's capture is the only evidence
  behind the fixture shapes (§15.3.5).
- **Local and CI green say nothing about deployment.** Both migrations must be applied
  to production by Brent and the schema verified read-only before the phase closes
  (§0.1(d) — Z1b broke session approval in production despite ten green review rounds).
- **`zoom_attendance` has no uniqueness constraint and no `left_at >= joined_at` CHECK.**
  Deliberate: dedupe and interval merging are Z7-2's pure modules, and rejecting a row
  Zoom reported would lose attendance data rather than preserve it.
- **`equipo_interno` facilitators are still not covered by a fixture.** The persona that
  now proves the same property is the globally scoped consultor facilitator, which fails
  for the same reason under the old predicate. The `facilitator_role` value itself is
  never read by the predicate, so the two are equivalent for this policy — but that is
  an argument, not a test.
- **`community_meetings.facilitator_id` is a single user.** A community meeting with a
  co-facilitator has no second reader; §7 does not define one, and no table models it.
- **`.env.local`** was copied into the worktree for `npm run build`, is gitignored
  (`git check-ignore -v .env.local`), and appears in no commit.
