# Fase 7 (Z7) — review request · chunks Z7-1 and Z7-2

> Written by the executor per `CLAUDE.md` executor rule 6 and the Z7-r1/r2 prompts.
> This file is the reviewer's entry document for the **cumulative** diff and now covers
> **Z7-1 and Z7-2**. Z7-3 … Z7-5 append to it as they land; the phase is not reviewable
> as a whole until they do.
>
> **Z7-1 is CLOSED** — Codex `PASS` on `43999499..e5b5a26d`, verdict saved at
> `fase-7-review-verdict.md`, close record at `PLAN.md` §15.3.8. Its sections below are
> retained because the reviewer reads the cumulative diff, not just the newest chunk.
> **Z7-2 is the new work; its own section is at the end and that is where to start.**

## Branch, base, commits

| | |
|---|---|
| Worktree | `/Users/brentcurtis/dev/wt/zoom-hours` (git common dir `/Users/brentcurtis/dev/fne-lms/.git`) |
| Branch | `feat/zoom-hours` |
| Base | `main` @ `4399949942bfcf49dfa8de40cbf7edbf40f0490e` |
| Commits | `ba82884e` (PM contract + r1 prompt) · `0e29d53b` (Z7-1 a1) · `c2cf4ed2` (a1 ledger) · `e5b5a26d` (**Z7-1 a2 — the reviewed and PASSED head**) · `ac573883` (PM close record + r2 prompt) · `e9bb5ce9` (verdict + chunk close) · this Z7-2 commit |
| Phase contract | `docs/plan/zoom/PLAN.md` §15.3 (+ §15.3.8 close record); §11, §6, §7, §10 normative |
| Executor prompts | `docs/plan/zoom/prompts/Z7-r1.md`, `docs/plan/zoom/prompts/Z7-r2.md` |
| Diff to review | `git diff 43999499..<head>` — cumulative, both chunks |

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

---

# Chunk Z7-2 — participant ingestion

**Start here.** Everything above is Z7-1, already reviewed and PASSED at `e5b5a26d`; it
is retained only because the cumulative diff includes it.

## Objective and scope (copied from §15.3.2, Z7-2)

**Z7-2 — participant ingestion.** `meeting.participant_joined` /
`meeting.participant_left` applied through the webhook path, the identity-matching
hierarchy as a **pure module** (`customer_key` → `profiles.id` first, then
registrant/e-mail, then display name — never the reverse order), and interval
merge/rejoin de-duplication as a **pure module**. Both pure so the §11 "reconnect
intervals don't double-count" test is a unit test, not an integration guess.

**Out of scope and untouched:** the participant report and `attendance_reconcile` (Z7-3)
· `session_hour_overrides`, `effective_minutes`, the override RPC, the
`billable-hours.ts` seam (Z7-4) · every UI surface (Z7-5) · `tests/e2e/` · `lib/meet/*`
and `JoinMeetingButton.*` (Z3b) · **`public.has_global_workspace_access`** — a real,
live, pre-existing baseline defect that Z7 does not close over (§15.3.8 item 2, needs an
owner) · the 22-table RLS allowlist.

## Files, grouped by risk

### HIGH — the identity decision, because a wrong match is the defect this design exists to prevent

| File | Purpose |
|---|---|
| `lib/zoom/attendance-identity.ts` (new, pure) | `readParticipantField` (the single `""`→null chokepoint), `readParticipantIdentity`, `profileIdFromCustomerKey` (inverse of `toCustomerKey`), `normalizeDisplayName`, `matchByDisplayName` (ambiguity ⇒ null), `matchParticipantIdentity` (the fixed hierarchy), `identityToken` (the fallback interval key). No I/O. |

### HIGH — additive schema plus the uniqueness the Z7-1 review deferred here

| File | Purpose |
|---|---|
| `supabase/migrations/20260812120000_zoom_attendance_participant_uuid.sql` | `participant_uuid text`, the **partial** unique index on `(zoom_meeting_uuid, participant_uuid) WHERE participant_uuid IS NOT NULL`, and `CHECK (left_at IS NULL OR left_at >= joined_at)`. |

### MEDIUM — ingestion and its persistence seam

| File | Purpose |
|---|---|
| `lib/zoom/participant-lifecycle.ts` (new) | `PARTICIPANT_EVENT_TYPES` (separate from `LIFECYCLE_EVENT_TYPES`), surface resolution, and `applyParticipantEvent` returning a typed outcome. |
| `lib/zoom/attendance-store.ts` (new) | `ZoomAttendanceStore` + the Supabase implementation. **Has no method that can write `zoom_meetings`** — that is the [B8] enforcement. |
| `lib/zoom/attendance-intervals.ts` (new, pure) | `isClosableBy`, `mergeIntervals`, `totalPresenceSeconds`, `selectIntervalToClose`. |
| `lib/zoom/webhook-lifecycle.ts` | `[B1]`: `readLifecycleInstant` gains the plausible-epoch band; `MIN/MAX_PLAUSIBLE_INSTANT_MS` exported. |
| `pages/api/zoom/webhook.ts`, `lib/zoom/jobs/webhook-sweep.ts` | Both dispatch participant events to the **same** applier; both gained a lazily-built `attendanceStore` dep. |

### LOW — tests

| File | Purpose |
|---|---|
| `__tests__/lib/zoom/attendance-identity.test.ts` (new) | 23 tests. |
| `__tests__/lib/zoom/attendance-intervals.test.ts` (new) | 19 tests — the §11 no-double-count table. |
| `__tests__/lib/zoom/participant-lifecycle.test.ts` (new) | 23 tests, fixture-driven. |
| `supabase/tests/011-zoom-public-rls.sql` | `plan(71)` → `plan(83)`. |
| `__tests__/lib/zoom/webhook-lifecycle-instants.test.ts` | +4 tests for `[B1]`. |
| `__tests__/api/zoom/webhook.test.ts`, `__tests__/lib/zoom/jobs/webhook-sweep.test.ts` | Route/sweep dispatch. **Two existing route tests changed subject — see Deviations.** |

## Test evidence

| Suite | Command | Result |
|---|---|---|
| jsdom proof `[B0]` | `node -e "…require('jsdom')…"` | `JSDOM OK ok` |
| jsdom proof `[B0]` | `npx vitest run __tests__/lib/meet/embed-capabilities.test.ts` | 30 passed, `environment 111ms` |
| Full | `npm test` | **309 files / 7,145 passed + 11 skipped (7,156)**, `environment 290ms` |
| pgTAP | `npm run test:db` | 11 files / **549 tests**, `Result: PASS` |

### Fail-on-old — two probes, each reverted and re-proved by hash

```
8095b28340ade88171b561615853a265cbde83c80554535e4a360efdb6fda0b8  lib/zoom/attendance-identity.ts
839a358685e3c5b4ba03a75326095097a3775722d0c79c7b6c080bea041f8e03  20260812120000_zoom_attendance_participant_uuid.sql
```

**Probe (i) — let the identity matcher accept `""`** (`readParticipantField` returns
`raw.trim()` instead of collapsing empty to null). **6 tests fail, exit 1**, including
`[B5]`'s two: *"the committed GUEST capture has four empty-string fields, and none
becomes a value"* and *"[B5] the GUEST capture … none of them matches"*.

**Probe (ii) — drop `UNIQUE` from the partial index.** **pgTAP 75 and 76 fail, exit 1**:
the index-shape assert, and *"a redelivered participant_joined is refused by the partial
unique index"* with `caught: no exception / wanted: 23505`.

## The areas to scrutinise hardest

1. **`participant_uuid` pairing stability is UNVERIFIED and I could not settle it.** The
   two committed captures are **different people** (`customer_key`
   `47d97…d9` vs `38a57…77`; `Anfitrion Spike` vs `Invitada Spike`), so they are not a
   joined→left pair and nothing about pairing can be inferred from them. [R3] told me to
   build both paths and return `FINDINGS` if a fixture or Zoom's documented semantics
   contradicted the ruling. **Neither did — there is simply no evidence either way**, so I
   built both and did not raise `FINDINGS`. Judge whether that was the right call, or
   whether "no evidence" should itself have been a `FINDINGS`. If the uuid does change
   between join and leave, the fallback identity path is what keeps intervals closing, and
   it is tested.
2. **The uuid-less dedupe is applier-side only, and it is weaker than the index.** With
   `participant_uuid` NULL there is no partial index to lean on, so redelivery is caught
   by "same identity + identical `joined_at` on an open interval". That is a
   read-then-write, i.e. a race that two concurrent deliveries could lose. I accepted it
   because the alternative — a total unique index — would collapse every anonymous guest
   of one occurrence into a single interval, which is a worse and permanent error. **Judge
   whether the race is acceptable, and whether a narrower unique index (e.g. including
   `joined_at`) would close it without the collapse.**
3. **Email matching is a repo-wide `profiles` lookup, not scoped to the surface.** [R6]
   constrains *name* matching to the expected attendees; I read e-mail as safe to match
   globally because it is unique and identifying, so a consultant from another school who
   joins is still correctly identified with `matched_by='email'`. **That is my reading of
   a rule that only spoke about names** — if e-mail was also meant to be attendee-scoped,
   this is a finding.
4. **`totalPresenceSeconds` returns 0 for an open interval, by design.** An interval with
   no `participant_left` has no observed duration, and anchoring it on `now()` would
   fabricate the number §11 compares against planned hours. Z7-5 has to render the open
   case as a state rather than a number — **if it instead sums this helper, a live meeting
   reads as zero presence.** Nothing in this chunk enforces that.
5. **The store double models the partial unique index and the close guard.** Both are
   database behaviours, so the double is a model, and a drifted model would keep the unit
   suite green while production diverged. pgTAP asserts both independently against a real
   database — **verify the two really cover the same claims.**

## Criteria

| ID | Status | Evidence |
|---|---|---|
| B0 | met | `JSDOM OK ok`; 30 passed, `environment 111ms`. |
| B1 | met | Both reviewer probes as named cases: header-seconds `1785368934` (asserted to have produced `1970-01-21T15:56:08.934Z`) and `Number.MAX_SAFE_INTEGER` (asserted to throw `RangeError`) both now return null; the band is applied to the ISO path too; the fixtures' real values are unchanged, and both band edges are pinned. |
| B2 | met | `participant-lifecycle.test.ts` asserts the whole insert by value: surface, `schoolId 9901`, occurrence uuid, `joinedAt '2026-07-29T23:55:56.000Z'`, `matchedBy 'customer_key'`, `userId` the decoded profile. |
| B3 | met | The actual duplicate delivery, twice through the applier → `interval_opened` then `interval_duplicate`, one row. Plus the uuid-less variant, plus pgTAP `23505` at the database. Probe (ii) proves the DB half fails without `UNIQUE`. |
| B4 | met | Pair closes the open interval; the committed guest `participant_left` (whose join was never seen) writes no row, calls no insert, and returns `no_open_interval`. |
| B5 | met | Guest fixture's four `""` fields asserted individually; identity resolves to `unmatched`/NULL; `findProfileIdByEmail` never called. Probe (i) fails this. |
| B6 | met | Two candidates for one normalised name ⇒ `unmatched`, `user_id` NULL — in the pure module and through the applier. |
| B7 | met | 19 interval tests: disjoint, overlapping, adjacent, contained, still-open, order-independence, malformed-dropped, three-way chain, no-mutation. |
| B8 | met | Structurally: the attendance store's key set is asserted to be exactly the eight methods, with no `setMeetingStatus`/`setProjectionStatus`/`insertMeeting`. Behaviourally: route and sweep both assert those lifecycle methods are never called and the meeting/projection statuses are unchanged. |
| B9 | met | Out-of-order leave → interval stays open, no close recorded, nothing thrown; pgTAP proves the CHECK still refuses a directly-offered bad row on INSERT **and** on UPDATE. |
| B10 | met | `git diff main..HEAD -- lib/services/billable-hours.ts lib/services/hour-tracking.ts` is empty. |
| B11 | met | `git diff --stat main..HEAD -- tests/e2e/` is empty. |
| B12 | met | All five gates green; see the executor report. |

## Deviations and accepted trade-offs

1. **Two existing route tests changed subject.** `__tests__/api/zoom/webhook.test.ts`
   drove the participant fixture and asserted *"Z1b-3 does not look up meetings for events
   it does not apply"* — that comment named Z7 as the future owner, and this is that
   chunk. The route now applies the event, so those tests inject an attendance double and
   assert the **dispatch** plus the unchanged `[B8]` claim (no `setMeetingStatus`, no
   `setProjectionStatus`). Without an injected store the route builds the real
   Supabase-backed one and answers 500 on a config error, so the edit was forced by real
   behaviour, not by convenience. No assertion was weakened.
2. **No `FINDINGS` raised on `participant_uuid` pairing.** See scrutiny point 1: the
   ruling is unverifiable rather than contradicted, and [R3] pre-authorised building both
   paths. Flagged rather than silently accepted.
3. **E-mail matching is repo-wide.** See scrutiny point 3 — my reading of a rule that
   constrained names only.
4. **`identityToken` is used as a pairability guard, not as a stored key.** [R3] describes
   the fallback key; the store realises it as an OR over the identity columns, and the
   token itself decides whether a leave is pairable at all (`unpairable_leave`). Same
   information, one fewer stored column.

## Known limitations and blind spots

- **Nothing here has run against a real recorded session.** Z0B's capture is the only
  evidence behind every fixture shape, and it cannot supply a joined→left pair.
- **Local and CI green say nothing about deployment.** Three migrations are now unapplied
  in production; §0.1(d) keeps the phase open until Brent applies them and the schema is
  verified read-only.
- **`matched_by='name'` depends on the surface having expected attendees.** A community
  meeting with an empty `meeting_attendees` can never match by name — correct
  (fail-closed), but it means the name branch is effectively dead for surfaces nobody
  populated.
- **`has_global_workspace_access` is still unowned** (§15.3.8 item 2) and deliberately
  untouched.
- **No `attendance_reconcile` yet**, so a webhook Zoom never delivered leaves a gap that
  nothing currently repairs. That is Z7-3's whole job.

---

## Z7-2 remediation — Codex `FAIL`, two blocking defects, both fixed

Codex returned `FAIL` on `43999499..6177ad5e` with two `[P1]` defects. **Both accepted
without argument; neither was a judgment call I had flagged.** What follows is what
changed and, more importantly, why my own evidence had not caught either.

### P1-1 — the uuid-less fallback could close the wrong participant's interval

`identityToken()` chose ONE key in priority order, but `identityFilter()` turned every
available identity column into an `or=(...)`. Two uuid-less participants with different
`customer_key` values and the **same display name** both matched a leave query, and
`selectIntervalToClose()` then closed whichever joined latest. That is the wrong-person
match the whole chunk is built to prevent.

**Fix (Codex's own smallest correction, taken as written):** persist the normalised token
on the row as `identity_token` and query it with **exact equality**. `identityFilter` is
deleted, and the structural client type no longer has an `or(...)` member at all — the
widened query is now unexpressible rather than merely unused.

### P1-2 — concurrent uuid-less redeliveries bypassed `[B3]`

The uuid-less dedupe was a read-then-insert while the partial unique index excludes
`participant_uuid IS NULL`, so there was no database constraint behind it. Codex's
barrier probe produced `{"result":["interval_opened","interval_opened"],"insertCount":2}`.
Reachable through two concurrent deliveries, because duplicate ledger rows with
`processed_at = NULL` are not atomically claimed before both requests invoke the applier.

**Fix:** the row now carries `source_event_key` — the ledger's `dedupe_key`, i.e.
`sha256(raw body)` — under a partial UNIQUE index. Zoom's retry and the sweep's replay
carry the same bytes and therefore the same key, so the second is refused **inside
Postgres**, where interleaving cannot change the outcome. The read-then-insert is deleted
outright; a genuine rejoin is a different body, a different key, and correctly a new row.

### Why my evidence missed both, which matters more than the fixes

**I had no test of the real store's query.** The applier suite drives a double, and my
`storeDouble` returned every uuid-less open row without filtering by identity — the exact
weakness Codex named. I proved this rather than assumed it: a probe re-pointing the real
`listOpenIntervals` at `display_name` **passed the entire applier suite, exit 0**.

`__tests__/lib/zoom/attendance-store.test.ts` is the missing half — real `supabase-js`,
real `createSupabaseAttendanceStore`, intercepted `fetch`, filters read off the wire. It
is the same pattern `webhook-store.test.ts` already established for the lifecycle, and I
should have written it when I created a second store. The same probe now **fails**.

The double was also fixed: it filters by one key with exact equality, models **both**
partial unique indexes, and resolves them synchronously inside `insertInterval` the way
Postgres resolves them inside one statement — which is what makes the barrier test a test
of the design rather than of the double's scheduling.

### Codex's non-blocking rulings, all actioned

| Ruling | What I did |
|---|---|
| `profiles.email` is **not** database-unique, so my "unique and identifying" rationale was overstated, and `.maybeSingle()` fails closed by **throwing** | Changed to `.limit(2)` and "two rows ⇒ unmatched", the same ambiguity rule the name branch uses. A throw here is a 500 from the webhook route and a Zoom retry loop against a body that can never succeed. Asserted on the wire and in the pure matcher. |
| `participant_uuid` pairing: Zoom's schema gives it on both events and says it is assigned at join and valid for that meeting, but does not guarantee persistence across a disconnect/rejoin — a validation gap, not a `FINDINGS` | Recorded as a known limitation with the citation. The fallback path is what covers it and is tested. |
| Zero for open intervals is acceptable **provided Z7-5 renders the open state** rather than presenting it as final presence | Recorded as an explicit Z7-5 precondition here and in the ledger. |
| No Z7-1 regression; the saved verdict is clearly labelled a relay | No action. |

### Evidence after the fix

| Gate | Result |
|---|---|
| `npm run type-check` / `npm run lint` | PASS / PASS, zero warnings |
| `npm test` | **310 files / 7,161 passed + 11 skipped (7,172)**, `environment 290ms` |
| `npm run build` | PASS |
| `supabase db reset` + `npm run test:db` | 11 files / **557 tests**, PASS (`011` now `plan(91)`) |

**Fail-on-old, both probes targeting the fixed defects** (reverted, byte identity re-proved
— `9d19bce0…` store, `8095b283…` identity, `cc9d5760…` migration):

- **P1-1 probe** — re-point `listOpenIntervals` at `display_name`: **fails**
  `attendance-store.test.ts` *"pairs on identity_token when Zoom omitted participant_uuid"*,
  exit 1. (The same probe passed before this file existed.)
- **P1-2 probe** — stop persisting `source_event_key`: **5 tests fail**, exit 1, including
  the concurrent barrier test and both callers' key-propagation assertions.

### New and changed files

| File | Purpose |
|---|---|
| `__tests__/lib/zoom/attendance-store.test.ts` (new, 11 tests) | The wire-level suite that was missing. |
| `supabase/migrations/20260812120000_…_participant_uuid.sql` | `identity_token` + its lookup index; `source_event_key` + partial UNIQUE index. Amended in place — still unapplied everywhere, same upheld precedent. |
| `lib/zoom/attendance-store.ts` | Exact-equality lookup; `identityFilter` deleted; `or(...)` removed from the client type; e-mail ambiguity. |
| `lib/zoom/participant-lifecycle.ts` | Read-then-insert deleted; takes and persists the delivery key; passes one pairing key. |
| `pages/api/zoom/webhook.ts`, `lib/zoom/jobs/webhook-sweep.ts` | Both pass their ledger dedupe key, asserted end-to-end in both suites. |
| `supabase/tests/011-zoom-public-rls.sql` | `plan(83)` → `plan(91)`: both columns, the partial UNIQUE index, the two-namesakes scenario at the database, and the rejoin/report-row cases. |

### What to scrutinise now

1. **`source_event_key` keys on the DELIVERY, not the person.** Two byte-different bodies
   describing the same logical join produce two rows; only the `participant_uuid` index
   catches that, and uuid-less participants have no such protection. I judged this
   correct — a genuine rejoin must not be swallowed — but it is a deliberate limit.
2. **The barrier test still runs against a double.** It models both indexes atomically,
   which is the property under test, but it is not Postgres. The pgTAP section asserts the
   same uniqueness against a real database; the concurrency itself is not reproducible in
   pgTAP (single connection, as `002`'s header records).
3. **`identity_token` embeds an e-mail or a name**, so it is PII of the same grade as the
   columns beside it. Covered by the same SELECT-only RLS; called out in the migration.

---

## Z7-2 re-review — Codex `FAIL` #2, and the lean overlay §5 hypothesis change

Codex returned `FAIL` on `43999499..3e852828` with one BLOCKER, and it is the **second
consecutive failure in the identity/pairing category**. Overlay §5 therefore applied: the
"one primary token per event is sufficient" hypothesis had to change before more code.
**It has. This section states the new hypothesis explicitly, because that is what §5
requires and what an override is not.**

### The defect — reproduced before it was fixed

`identityToken()` recomputed the strongest token independently on every event, while the
row stored only that one token. Zoom does not present the same fields on every event for
the same person, so a leave arriving with FEWER fields DOWNGRADES to a weaker rank that
belongs to somebody else:

```
A joins with customer_key=A and name "Ana"  → stored ck:a
B joins with only the name "Ana"            → stored nm:ana
A leaves, Zoom omits customer_key           → recomputed nm:ana
→ the exact lookup returns B, and B's interval is closed.
```

**Reproduced against the applier before changing anything**, and the output is the point:

```
CLOSES: [{"id":"row-2","leftAt":"2026-07-30T00:10:00.000Z"}]
```

`row-2` is B. My own review request had claimed this case "fails open, the interval stays
open". That was **wrong** — it failed onto the wrong person, which is the single outcome
[R6] exists to prevent. The namesake test I had written could not detect it because it
gave both participants a `customer_key`, so neither ever downgraded.

### The hypothesis change

**Old:** one prioritised token per event is sufficient to pair a leave with its join.
**Refuted** — the token is a property of the EVENT, not of the person, so it is not stable
across events for one participant.

**New:** a join is findable by **any evidence it actually presented**; the leave still
searches with **its own strongest token only**; and **ambiguity is resolved by refusing to
close, never by choosing.**

The asymmetry is deliberate and is the whole design:

| | Widened | Unchanged |
|---|---|---|
| **Storage** — `identity_tokens text[]`, every presented rank, strongest first | ✅ | |
| **Search key** — the leave's own strongest token | | ✅ — matching a strong-evidence leave by name would discard the evidence that makes the pair trustworthy |
| **Resolution** — exactly one match closes; zero or many close nothing | | ✅ new, replacing "latest wins" on the fallback path |

Under it, the counterexample resolves: A's downgraded leave searches `nm:ana`, which now
matches **both** rows (A carries it at a weaker rank), so the applier closes **nothing** and
both intervals stay open for the Z7-3 reconcile — which §11 already makes authoritative
over webhooks, so the unresolved case has a designated owner rather than being a silent gap.

The uuid path is untouched: `participant_uuid` is unambiguous, so "latest open interval"
still applies there.

### What changed

| File | Change |
|---|---|
| `supabase/migrations/20260812120000_…` | `identity_token text` → `identity_tokens text[]`, GIN-indexed for containment. `source_event_key` and its partial UNIQUE index **untouched** — that remediation passed review. |
| `lib/zoom/attendance-identity.ts` | New `identityTokens()` (all ranks, strongest first); `identityToken()` is now exactly its first element. |
| `lib/zoom/attendance-store.ts` | Fallback lookup is `identity_tokens=cs.{token}` (array containment) instead of `identity_token=eq.…`. |
| `lib/zoom/participant-lifecycle.ts` | Persists all ranks; **`participantUuid === null && open.length > 1` ⇒ `no_open_interval`**, before any "latest" selection. |
| `__tests__/lib/zoom/participant-lifecycle.test.ts` | Codex's regression verbatim (A ck+name, B name-only, A leaves without ck ⇒ **neither closed**), plus the unambiguous-downgrade case and the strong-leave-never-matched-by-name case. |
| `__tests__/lib/zoom/attendance-identity.test.ts` | The counterexample as a pure-module assertion. |
| `__tests__/lib/zoom/attendance-store.test.ts` | Wire assertion is now containment, and `identity_token` equality is asserted **absent** — the refuted model cannot come back unnoticed. |
| `supabase/tests/011-zoom-public-rls.sql` | `plan(91)` → `plan(93)`: the two-namesake rows at the database, the strong-token lookup returning one, the downgraded lookup returning **two**, and an assert that keying on `identity_tokens[1]` alone would have found only the namesake — the refuted model, pinned as a live refutation. |

### Evidence

| Gate | Result |
|---|---|
| jsdom proof | `JSDOM OK ok`; 30 passed, `environment 241ms` |
| `npm run type-check` / `npm run lint` | PASS / PASS, zero warnings |
| `npm test` | **310 files / 7,168 passed + 11 skipped (7,179)** |
| `npm run build` | PASS |
| `supabase db reset` + `npm run test:db` | 11 files / **559 tests**, PASS |

**Fail-on-old** (reverted, byte identity re-proved — `eed7b403…` identity,
`11618108…` applier):

- **Probe (v)** — restore the single-primary-token storage: **5 tests fail**, exit 1,
  including *"a DOWNGRADED leave closes nobody, not a namesake"* and the pure-module
  counterexample. The refuted hypothesis can no longer pass.
- **Probe (vi)** — remove the ambiguity guard so the fallback picks "latest" again:
  **1 test fails**, exit 1 — the Codex regression itself.

### What I get wrong under this design, stated plainly

1. **Two people who present only a shared display name can never be paired at all.** Their
   leaves close nothing and both intervals stay open. That is the intended trade — no close
   beats a wrong close — but it means uuid-less same-name participants produce open
   intervals that only Z7-3 can resolve.
2. **A person with two genuinely open intervals** (a rejoin whose first leave was never
   delivered) also hits the ambiguity rule and closes neither. Same trade, same owner.
3. **`identity_tokens` embeds an e-mail and a display name.** Same PII grade as the columns
   beside it, same SELECT-only RLS, called out in the migration.
4. **This is the third pairing design in three attempts.** If the reviewer finds a fourth
   counterexample, the honest read is that webhook-only pairing cannot be made safe for
   uuid-less participants, and the pairing should move wholesale to Z7-3's report.

---

# Z7-2 — CONTRACT SUPERSEDED. This document's Z7-2 sections above describe a withdrawn contract.

> **Reviewer: read this section before anything above it about pairing.** Codex returned
> `FINDINGS` on `43999499..a530aafb` — the contract was unsatisfiable, not merely unimplemented.
> The PM replanned on 2026-08-12. Everything above under *Chunk Z7-2* is retained as the record
> of how the phase got here, **not as a statement of the current contract.** Nothing has been
> rewritten out of it.

## What was superseded

`prompts/Z7-r2.md` `[R3]` (interval key falls back to the identity token) and `[R4]` (a leave
matching no open interval writes no row) are **withdrawn, not amended.** They are jointly
unsatisfiable: *B joins as "Ana" and B leaves* and *B joins as "Ana", A's join is lost, and A
leaves* produce identical events and identical database state while the two rules demand
opposite outcomes. The executor reproduced both histories returning the same close before
accepting the finding.

**The governing pairing contract is now `PLAN.md` §15.3.9.** Review against that section, not
against `Z7-r2.md`.

## The new scope

A token may authorise webhook-time closure only if **Zoom mints it** (the client cannot assert
it), it is **unique to one participant-connection by construction**, and it **matches exactly
one open row** in that occurrence. `participant_uuid` qualifies. `customer_key`, `email` and
`display_name` are reconciliation evidence only.

`customer_key` is barred by the *first* rule rather than by missing evidence: we mint it at
`pages/api/meet/session/[id]/join.ts:439` and hand it to the browser, so it is an identity
claim. Z0B `zoom-spike-results.md` §6.2's byte-identical result measured the **report** round
trip, not webhook joined→left pairing — the right evidence for matching a row to a person, the
wrong evidence for closing an interval.

Attempt 5 is therefore mostly **deletion**: remove the fallback closure path, record leave
observations as durable evidence instead of discarding them, widen the partial unique index,
and replace the H1-only regression with the eleven-row falsification matrix.

## Surviving implementation from `a530aafb`

`source_event_key` and its partial UNIQUE index · persisted identity evidence
(`identity_tokens`, GIN index, `matched_by`) · the `participant_uuid` closure path ·
`lib/zoom/attendance-intervals.ts` · `[B1]`'s `readLifecycleInstant` hardening ·
`PARTICIPANT_EVENT_TYPES` and the one applier shared by the route and the sweep · every
approved Z7-1 artefact.

## Code that must be removed or changed

| Anchor | Change |
|---|---|
| `lib/zoom/attendance-store.ts` — `listOpenIntervals`' `identityToken` arm | removed; it is the fallback closure key |
| `lib/zoom/attendance-identity.ts:215` `identityToken()` | no longer a closure input; the plural `identityTokens()` evidence function stays |
| `lib/zoom/participant-lifecycle.ts:240` — the `open.length > 1` guard | deleted, made moot by the exactly-one-match rule; leaving it would be a second, weaker gate beside the real one |
| `selectIntervalToClose` | narrowed to uuid-matched rows only |
| `supabase/migrations/20260812120000_*` partial unique index | **widened to `(zoom_meeting_uuid, participant_uuid, joined_at)`** — see the limitation below |
| `__tests__/lib/zoom/participant-lifecycle.test.ts:413` | replaced; it covered only History 1, which is why a green suite sat on a live defect |

## Acceptance and falsification cases

The eleven-row matrix in `PLAN.md` §15.3.9 is the criteria, carried into `prompts/Z7-r5.md` as
`[C1]`–`[C10]`. **`[C4]` is the case the old contract could not express**: H1 and H2 run through
the same applier must produce identical, empty close sets. Fail-on-old is specified as restoring
the fallback arm and showing `[C4]` fails — a probe that does not fail against the old code
proves nothing, which is exactly how attempt 4 stayed green.

## Unresolved evidence and limitations

1. **A Z7-1 index defect found during the replan, not by review.** The partial unique index
   `(zoom_meeting_uuid, participant_uuid)` permits at most one row per uuid per occurrence, so a
   rejoin reusing a `participant_uuid` would violate it. It passed a Codex `PASS` and three
   review rounds because every test to date exercised one interval per participant.
2. **`participant_uuid` joined→left stability remains unmeasured.** It is now safe to be wrong
   about — instability degrades to no-closure — so it determines *how much* the webhook path can
   close before the report lands, not whether the result is correct.
3. **Uuid-less duplicate joins can double-count until the report supersedes them.** Accepted
   deliberately over any matching heuristic.
4. **The report's completeness is unmeasured** beyond §6.2's four participants across three
   meetings; nothing establishes behaviour for a large or long meeting.
5. **Z7-3's semantics are fixed but unbuilt** (§15.3.9): wholesale supersession per occurrence,
   **no cross-source row matching at all**, newest `report_fetched_at` batch wins, webhook rows
   never edited or deleted.
