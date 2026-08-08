# Fase 5 (Zoom Z2) — review request

> Z2 is `fase-5` (Z1c was `fase-4`). This file is extended by each Z2 chunk.
> Covered below: **Z2-1**, **Z2-2a**.

---

## Chunk Z2-1 — durable managed intent + provision-at-approve enqueue

### Branch and commits

- **Branch:** `feat/zoom-sess`
- **Base:** `e796646` (`origin/main` at the time the worktree was created; the two
  commits since the prompt's stated anchor `513c75c` are docs-only, so every `file:line`
  anchor in the dispatch prompt still resolved)
- **Worktree:** `/Users/brentcurtis/Documents/fne-zoom-sess` (created from the PM
  checkout, per the standing rule that Zoom sessions run no mutating git command in
  `fne-lms-working`)
- **PR:** not opened — the PR opens at phase end, after all Z2 chunks land.

| SHA | Cluster |
|---|---|
| `f7a3df5` | A1 — additive migration + pgTAP column shape + type |
| `5ada5ff` | A2 — close the `is_zoom_managed` eligibility seam |
| `1162c9e` | A3, A11 — the gate module + the feature flag entry |
| `67379a1` | A4–A7 — both approve routes wired |
| `839dc36` | A8–A10 — create-time intent + PUT guard |

### Scope IN (copied from the dispatch prompt §2)

- **S1** additive migration `20260804120000_zoom_managed_intent.sql` adding
  `public.consultor_sessions.is_zoom_managed boolean NOT NULL DEFAULT false`.
- **S2** close the eligibility seam in `lib/zoom/jobs/meeting-provision.ts` (row type,
  `readSession` select, `SessionEligibilityCheck` union, the branch, the comment).
- **S3** one gate module `lib/zoom/provisioning-intent.ts` that *delegates* to
  `checkSessionEligibility` — master flag, school allowlist, dedupe key, never-throwing
  enqueue.
- **S4** wire `approve.ts` and `bulk-approve.ts`; approval never fails because of Zoom.
- **S5** create-time intent in `POST /api/sessions` (validation, forced provider, NULL
  link, recurrence inheritance).
- **S6** the PUT guard in `pages/api/sessions/[id]/index.ts` (409 on managed link /
  provider edits; admin-only, pre-approval-only intent toggle).

### Scope OUT (copied from §3) — none of this was built or touched

Join API, `meeting-join-policy`, `/meet/session/[id]`, any page or React component,
`JoinMeetingButton`, the workspace Sesiones tab, the "Generar reunión Zoom" scheduler
control (**no UI at all**); `meeting_sync` / `meeting_delete`, reschedule sync, the
atomic reschedule RPC, cancellation and series-cancel, the modality-flip delete;
notifications, reminders, iCal, dual-zone display, dial-in numbers; the Z2 hours-consumer
audit; `community_meetings.is_zoom_managed` (Z6 adds the mirror — PM ruling); any change
to `zoom_internal` schema, grants, RLS or the job RPCs; any refactor of
`meeting-provision.ts` beyond the S2 edits.

### Files, grouped by risk

**Highest — the security/business invariants**

| File | +/- | Purpose |
|---|---|---|
| `pages/api/sessions/[id]/index.ts` | +63/-0 | The PUT guard: managed sessions reject non-null `meeting_link` writes and provider moves off `'zoom'` (409); the intent flag is admin-only and frozen after approval. |
| `lib/zoom/provisioning-intent.ts` | +147/-0 | The only place that decides whether a session is provisioned for, and under which dedupe key. |
| `lib/zoom/jobs/meeting-provision.ts` | +17/-9 | Fifth eligibility check + the column in `readSession`'s select. A wrong select string here is a silent `undefined` that would refuse every session. |
| `supabase/migrations/20260804120000_zoom_managed_intent.sql` | +23/-0 | The column. Additive only; no RLS change, no grant, no destructive statement. |

**Medium — route behaviour**

| File | +/- | Purpose |
|---|---|---|
| `pages/api/sessions/index.ts` | +27/-2 | Accepts the flag; exempts managed requests from the `meeting_link` 400; forces provider `'zoom'` and NULL link; inherited by every recurrence row. |
| `pages/api/sessions/[id]/approve.ts` | +12/-1 | Hoists `approved_at` and enqueues after the status update. |
| `pages/api/sessions/bulk-approve.ts` | +9/-0 | Same, once per updated session. |

**Low — types, flags, schema assertions**

| File | +/- | Purpose |
|---|---|---|
| `lib/featureFlags.ts` | +6/-1 | `FeatureFlags.ZOOM_MEETINGS` + the `NEXT_PUBLIC_` client `switch` case. |
| `lib/types/consultor-sessions.types.ts` | +11/-0 | `is_zoom_managed` on `ConsultorSession`; optional on `ConsultorSessionInsert` (the DB default covers omission). |
| `supabase/tests/011-zoom-public-rls.sql` | +24/-1 | Column-shape assertions, plan 15 → 18. |

**Tests (new unless noted)**

| File | +/- | Covers |
|---|---|---|
| `__tests__/lib/zoom/provisioning-intent.test.ts` | +321 | A3 — gate matrix, allowlist parsing, key rules, never-throws (33 tests) |
| `__tests__/api/sessions/session-approve-zoom-provision.test.ts` | +293 | A4 A5 A6 (11 tests) |
| `__tests__/api/sessions/session-bulk-approve-zoom-provision.test.ts` | +249 | A7, mixed batch (6 tests) |
| `__tests__/api/sessions/session-managed-intent-create.test.ts` | +216 | A8 (9 tests) |
| `__tests__/api/sessions/session-managed-link-guard.test.ts` | +271 | A9 A10 (13 tests) |
| `__tests__/lib/zoom/jobs/meeting-provision.test.ts` | +13/-0 (modified) | A2 — fixture marked managed, two new refusal rows |

### Test evidence

```
npm run type-check && npm run lint && npm test && npm run build
```

- type-check: clean
- lint: clean (`--max-warnings=0`)
- vitest: **Test Files 264 passed (264) · Tests 4298 passed (4298)**
- build: `✓ Compiled successfully`, full page manifest emitted

```
npm run test:db
```

- **Files=8, Tests=338 · Result: PASS** (011 now 18 subtests)

**Fixture change in the existing provision suite.** Exactly one fixture was touched:
`SESSION` in `meeting-provision.test.ts`, which gained `is_zoom_managed: true`. It is the
single happy-path row the whole file provisions for, and only a session the scheduler
marked as managed is ever provisioned for — so it is legitimately managed. Every refusal
case in that file derives from it by patch, which is why no other fixture needed
changing.

**Fail-on-old proof.** `pages/api/sessions/[id]/approve.ts` and
`pages/api/sessions/[id]/index.ts` were stashed (tests untouched) and the two files
re-run:

```
 ❯ session-approve-zoom-provision.test.ts  (11 tests | 3 failed)
     → expected "spy" to be called 1 times, but got 0 times   [A4]
 ❯ session-managed-link-guard.test.ts      (13 tests | 9 failed)
     → expected 200 to be 409   [A9 meeting_link]
     → expected 200 to be 409   [A9 meeting_provider]
     → expected 400 to be 403   [A10 consultant]
 Test Files  2 failed (2)
      Tests  12 failed | 12 passed (24)
```

`npm run test:db` also produced its own fail-on-old evidence before the migration was
applied locally: `Failed tests: 16-18 — Column public.consultor_sessions.is_zoom_managed
does not exist`.

### Where an independent reviewer should push hardest

1. **The dedupe key includes `approved_at` — is that the right trade?** It makes a
   dead-lettered job retryable by re-approving, at the cost that two *concurrent* approve
   requests that both pass the status check would mint two different keys and therefore
   two jobs. The handler is idempotent by checkpoint-adopt, so the second converges, but
   the reasoning is worth checking rather than taking on trust. The key format was
   specified by the plan; the concurrency consequence is mine to flag.
2. **The PUT intent toggle rejects on PRESENCE, not on change.** After approval, any PUT
   carrying `is_zoom_managed` at all is a 409 — including one that re-sends the value the
   row already has. I chose the strict reading ("the field cannot appear after
   approval"); the looser one ("only a genuine flip is rejected") is defensible too and no
   test distinguishes them today. If a later chunk's UI round-trips the whole session
   object, this becomes a real 409.
3. **The gate delegates, but nothing structurally prevents a future inline copy.** The
   proof that `checkProvisionGate` calls `checkSessionEligibility` rather than restating
   it is a spy in the unit test, not a type or a lint rule. Check that the delegation
   assertion is actually load-bearing and not satisfiable by a re-implementation.
4. **`readSession`'s select string.** The column was added to a hand-written column list.
   If it were misspelled, `is_zoom_managed` would arrive `undefined`, the gate would refuse
   *every* session, and no unit test would catch it — the provision suite feeds rows
   directly to the handler and never exercises the real store's select. `test:db` proves
   the column exists but not that this string reads it.
5. **The allowlist "malformed narrows" rule.** `ZOOM_SCHOOL_ALLOWLIST=colegio-77` yields
   an EMPTY set, which refuses every school rather than allowing every school. That is the
   safe direction for a wave rollout but it is a silent, total shutoff — an operator typo
   stops all provisioning with no signal beyond the per-session skip. Worth ruling on
   whether that should log louder.

### Known limitations and deferred items

- **No UI.** The API accepts `is_zoom_managed`; nothing sets it yet. The "Generar reunión
  Zoom" control is explicitly a later chunk.
- **`community_meetings.is_zoom_managed` is not added.** Per the PM ruling in the dispatch
  prompt, Z6 adds the mirror.
- **PUT does not re-validate modality when an admin turns the flag on.** An admin can set
  `is_zoom_managed: true` on a `borrador` *presencial* session. Nothing is provisioned —
  the eligibility gate refuses it at approve time on `modality` — so the flag is inert
  rather than unsafe, but the POST path validates this and the PUT path does not. Not in
  the chunk's S6 spec; flagged rather than silently added.
- **The eligibility check order is visible in the refusal reason.** A session that fails
  both `meeting_provider` and `is_zoom_managed` reports only the former. Intentional (the
  handler stores one `detail`), but triage sees the first failure, not all of them.
- **The `.env.local` needed for `npm run build`** is not in the repo (gitignored); it was
  copied from an existing checkout to run the build gate. Without it the build fails at
  "Collecting page data" on `NEXT_PUBLIC_SUPABASE_URL` — an environment artifact, not a
  code failure.
- **Local `test:db` ran against `supabase migration up`, not a full `db reset`.** The
  local Postgres was exactly one migration behind (`20260803170000`), and other
  workstreams share that container, so applying the single pending migration was preferred
  over destroying their local data. CI's `supabase db start` replays every migration from
  scratch and is the real proof that the file composes.
- **Production schema is NOT updated.** Applying the migration to production is a separate,
  Brent-authorized, Brent-executed step. This chunk's green gates prove code correctness
  and nothing about deployment.

---

## Chunk Z2-1 — round r3 (B1 remediation)

### Branch and commits

- **Branch:** `feat/zoom-sess` (unchanged), on top of `6d1f58b`
- **Commits:** `7048fb3` (code + tests), plus the commit carrying this section
- **Files:** `pages/api/sessions/[id]/index.ts` (+42/−0),
  `__tests__/api/sessions/session-managed-link-guard.test.ts` (+159/−2)
- **No migration, no new file.** r1's migration, seam, gate module, approve hooks,
  POST path, feature-flag entry and pgTAP additions are untouched.

### The B1 fix as shipped

r1 shipped the PUT guard keyed on the STORED `is_zoom_managed`, but it did not act on
the ON **transition**. An admin could set `is_zoom_managed: true` on a row that already
carried a manual `meeting_link` on a non-`zoom` provider, and the row would stay that
way — a managed session holding a rival link the provisioner does not own. Two additions,
both in the `handlePut` guard block:

1. **Forcing (S1).** On the transition the update carries `is_zoom_managed: true`,
   `meeting_link: null`, `meeting_provider: 'zoom'` — one update, routed through the
   existing `updateData`/`fieldsChanged` copy so the `session_activity_log` entry sees it.
   Discarding the manual link is the semantic of "the platform now owns this meeting".
2. **Modality rule (S2).** The transition is refused 400 es-CL when the effective
   modality is neither `online` nor `hibrida`, mirroring `pages/api/sessions/index.ts:120-126`.
   Ordered **before** the forcing, so a refused request writes nothing. This closes the
   gap r1 flagged in its own known-limitations list ("PUT does not re-validate modality
   when an admin turns the flag on").

Both are scoped to the transition (stored `!== true` AND request sets `true`), so
re-sending `true` on an already-managed row forces nothing and is never newly refused.

### The R1/R4 contradiction, and how it was resolved

**r2 stopped with `STATUS: FINDINGS` and committed nothing — correctly.** The r2 prompt's
R1 required the transition to write `meeting_link: null` / `meeting_provider: 'zoom'`
"whatever the stored link was", while its R4 required every r1 assertion to pass
untouched. Two r1 assertions pin the transition's payload exactly, on a fixture whose
stored link is already null (`session-managed-link-guard.test.ts:211` and `:221`, both
`toEqual({ is_zoom_managed: true })`). Unconditional forcing adds two keys to that
payload, so R1 and R4 could not both hold. The PM verified the contradiction against the
code and ruled it a drafting error in R4, whose purpose was to stop assertions being
weakened to manufacture green — not to freeze a literal the fix deliberately changes.

**The r3 ruling: Reading A, force unconditionally.** Reading B (force only fields whose
stored value differs) was rejected on two grounds: it would be a third rule POST does not
have, re-diverging the two entry points; and it reopens B1 through a race — between the
row `SELECT` and the `UPDATE`, a concurrent PUT can set a `meeting_link`, and a
difference-only rule would leave it in place on a managed row.

**Accepted cost, ruled by the PM and deliberately NOT "fixed":** because `fieldsChanged`
drives the audit entry at `pages/api/sessions/[id]/index.ts:389-400`, a toggle on an
already-null-link row records `meeting_link: null → null` and
`meeting_provider: 'zoom' → 'zoom'`. Cosmetic noise, weighed against a correctness hole.
Filtering no-op fields out of `fieldsChanged` would change shared behaviour for every
field on this route and was ruled out of scope.

**Test edits authorised and taken:** the payload literals at `:211` and `:221` only,
updated to the three-key shape, each with a comment recording that the literal IS the
ruling. Both tests keep their names and their `toBe(200)` assertions. No other r1
assertion, fixture or test name was touched in any file.

### Fail-on-old proof

`pages/api/sessions/[id]/index.ts` alone reverted to `6d1f58b`, r3 tests left in place:

```
 ❯ __tests__/api/sessions/session-managed-link-guard.test.ts  (20 tests | 8 failed) 13ms
   → admin + borrador: allowed
     expected { is_zoom_managed: true } to deeply equal { is_zoom_managed: true, …(2) }
   → admin + pendiente_aprobacion: allowed
     expected { is_zoom_managed: true } to deeply equal { is_zoom_managed: true, …(2) }
   → discards a stored manual link and forces provider zoom, in ONE update [R1]
     expected { is_zoom_managed: true } to deeply equal { is_zoom_managed: true, …(2) }
   → a manual link sent WITH the toggle is discarded, not stored [R1]
     expected { …(3) } to deeply equal { is_zoom_managed: true, …(2) }
   → refuses the toggle on a stored presencial session with 400 es-CL, nothing written
     expected 200 to be 400
   → refuses the toggle when the request itself moves modality to presencial
     expected 200 to be 400
   → allows modality: 'online' sent together with the toggle on a presencial row
     expected { modality: 'online', …(1) } to deeply equal { is_zoom_managed: true, …(3) }
   → allows the toggle on a hibrida session
     expected { is_zoom_managed: true } to deeply equal { is_zoom_managed: true, …(2) }

 Tests  8 failed | 12 passed (20)
```

All six new-behaviour tests fail against r1's route, plus the two authorised literals.
Restored, the file passes 20/20.

### Gates

Run from `/Users/brentcurtis/Documents/fne-zoom-sess`:

| Gate | Baseline at `6d1f58b` | r3 |
|---|---|---|
| `npm run type-check` | 0 | **0** |
| `npm run lint` (`--max-warnings=0`) | 0 | **0** |
| `npm test` | 4298 passed / 264 files | **4305 passed / 264 files** |
| `npm run build` | 0 | **0** |
| `npm run test:db` | 338, `Result: PASS`, 8 files | **338, `Result: PASS`, 8 files** |

The +7 are this round's new tests; nothing moved down.

### What a reviewer should still distrust

- **The guard block now does four things in sequence** — admin-only, boolean-shape,
  managed-row link/provider 409s, pre-approval lock, transition modality 400, transition
  forcing — and the ordering carries the safety. `managedIntentTransition` is computed
  after the lock check and read in two places; anything inserted between them, or any
  future early `return` before the forcing block, silently un-forces the shape. The
  cheapest thing to verify is that no path reaches the `.update(...)` with
  `managedIntentTransition === true` and a two-key payload.
- **The effective-modality read is a ternary on `!== undefined`, not `??`.** The prompt's
  prose says `req.body.modality ?? session.modality`; the accepted r2 implementation is
  `req.body.modality !== undefined ? req.body.modality : session.modality`. These differ
  only when a caller sends `modality: null` — the ternary refuses the toggle with a 400,
  `??` would fall back to the stored modality and let `updateData.modality = null` reach a
  NOT NULL column. The ternary was kept as the safer of the two; a reviewer may still want
  the null case rejected explicitly rather than incidentally.
- **All 20 assertions are against a hand-rolled Supabase mock,** the same one r1 used.
  It records `.update(...)` payloads faithfully but does not model Postgres: the CHECK
  constraint on `meeting_provider`, the NOT NULL on `is_zoom_managed`, and the optimistic
  `if_updated_at` guard are all unexercised here. No integration test drives this route.
- **The race the ruling cites is closed by argument, not by a test.** Unconditional
  forcing means a concurrent PUT that sets a link between the SELECT and the UPDATE is
  overwritten — but nothing here proves the two statements are not separated by anything
  else, and the route holds no lock.
- **Carried from r1, still open and still out of scope:** PUT can move an already-managed
  session's modality to `presencial` with no guard. Inert today (the eligibility gate
  refuses on modality, so nothing provisions); logged by the PM as backlog. Deliberately
  left untested so a future fix does not have to delete an assertion pinning the gap.

---

## Chunk Z2-2a — the authorized join opening (server only)

### Branch and commits

- **Branch:** `feat/zoom-sess`
- **Base:** `42ecdf6` (the Z2-1 r3 head; worktree was clean at it)
- **Worktree:** `/Users/brentcurtis/Documents/fne-zoom-sess`
- **PR:** not opened — the PR opens at phase end, after all Z2 chunks land.

| SHA | Cluster |
|---|---|
| `110f74a` | S1 + S2 + both suites |

### Objective and scope

Plan §5: *"everything Zoom-credential-shaped lives server-side… Exactly one narrow
per-request opening: the authorized join payload from
`POST /api/meet/{surface}/{id}/join`."* Chunk Z2-1 sealed the intent and the
provisioning enqueue; nothing could join the resulting meeting. This chunk opens
that door for consultor sessions, server-side only.

**In:** `authorizeMeetingJoin()` (the §5 persona matrix) and
`POST /api/meet/session/[id]/join` in link mode.
**Out, deliberately:** all UI (Z2-2b), community-meeting join (Z6), embed / SDK
signature / ZAK (Z3), reschedule-cancel-delete sync (Z2-3), notifications and iCal
(Z2-4), the hours audit (Z2-5). No migration; no change to `zoom_internal` grants
or RLS.

### Files, by risk

| Risk | File | Δ |
|---|---|---|
| **High** | `lib/utils/meeting-join-policy.ts` (new) | +184 |
| **High** | `pages/api/meet/session/[id]/join.ts` (new) | +191 |
| Test | `__tests__/lib/utils/meeting-join-policy.test.ts` (new) | +386 |
| Test | `__tests__/api/meet/session-join.test.ts` (new) | +502 |

Nothing existing was modified. `resolveMeetSessionAccess`,
`pages/meet/session/[id].tsx` and `tests/e2e/zoom-join-authz.spec.ts` are untouched,
per PM ruling 5.

### Test evidence

`__tests__/lib/utils/meeting-join-policy.test.ts` — 17 tests: the seven §5 personas,
two `canViewSession()`-diverges-from-join assertions, and six edges (malformed id,
no roles, archived session, facilitator-who-is-also-attendee, global consultor,
foreign/inactive community membership).

`__tests__/api/meet/session-join.test.ts` — 22 tests: 405/401, the kill switch with
its no-lookup assertion, the byte-identity pair, the two distinguishable 403s, the
three-persona secret sweep, 410 × {cancelled, ended} × {admin, facilitator,
attendee}, the 404-not-410 ordering proof, four pending shapes, the three link
payloads, and two read-failure paths.

The route suite runs against the **real** `authorizeMeetingJoin` and the **real**
`sendAuthError`/`sendApiResponse`/`sendSessionNotFound`; only `getApiUser` and the two
Supabase client factories are stubbed. [A2] and [A3] are claims about bytes, and a
mocked policy or mocked responder would let them pass while the shipped bodies
differed.

**Mutation probes** (a fail-on-old is not available for a brand-new endpoint, and one
was not manufactured):

1. *Other-school branch returns 403 instead of the shared not-found* — 5 failures,
   including `expected 403 to be 404` on the byte-identity pair and on the
   404-not-410 ordering test. Reverted.
2. *Meeting read hoisted above the authorization gates, `join_url` echoed on the
   denial bodies* — 2 failures: the secret sweep
   (`expected '{"error":"No estás en la lista de asi…' to not include 'https://…'`)
   and `expected [ 'zoom_meetings', …(3) ] to not include 'zoom_meetings'`. Reverted.

### Gates

Run from `/Users/brentcurtis/Documents/fne-zoom-sess`:

| Gate | Baseline at `42ecdf6` | Z2-2a |
|---|---|---|
| `npm run type-check` | 0 | **0** |
| `npm run lint` (`--max-warnings=0`) | 0 | **0** |
| `npm test` | 4305 passed / 264 files | **4344 passed / 266 files** |
| `npm run build` | 0 | **0** (route emitted as `ƒ /api/meet/session/[id]/join`) |
| `npm run test:db` | 338, `Result: PASS`, 8 files | **338, `Result: PASS`, 8 files** |

The +39 / +2 are this chunk's two new suites; nothing moved down.

### What a reviewer should scrutinise hardest

- **The ordering in the route is the security property, and it is enforced by
  reading order alone — there is no structural barrier.** Steps 5–7 read meeting
  state; steps 1–4 must all have returned first. One statement moved above the
  `decision.kind` branches rebuilds the meeting existence oracle, and the only thing
  that catches it is the `tablesRead` assertion in the 404-not-410 test. That is one
  assertion guarding an invariant that spans forty lines.
- **`is_active === false → not-found` is mine, not the prompt's.** The §5 matrix has
  no archived-session row. I mirrored `resolveMeetSessionAccess` and
  `GET /api/sessions/[id]` (only admins reach archived sessions) because without it
  the join opening would be strictly more permissive than every surface that leads to
  it, and Z2-3's cancel sync does not exist yet — so a soft-deleted session's meeting
  would otherwise stay joinable. If the PM wants the matrix read literally, this
  branch and its test come out.
- **The success envelope is `{ data: … }`, not a bare object.** The prompt writes
  `200 { mode: 'pending' }` and `{ mode: 'link', join_url, role }`; I put exactly those
  payloads through `sendApiResponse`, so the wire body is `{"data":{"mode":"link",…}}`.
  That follows CLAUDE.md's API Route Pattern and the repo's other session routes, but
  it is an interpretation, and Z2-2b will be written against whichever shape stands.
- **Both suites assert against hand-rolled Supabase proxies, not Postgres.** The
  proxy answers one canned result per table regardless of the filters applied, so
  `.eq('expected', true)` on `session_attendees` and the
  `surface_type`/`surface_id` pair on both meeting reads are *asserted nowhere*. A
  policy that forgot the `expected` filter, or a route that queried the wrong surface,
  would pass every test in this chunk. Nothing integration-tests this endpoint.
- **`JOINABLE_MEETING_STATUSES = ['provisioned', 'started']` is a judgment call about
  the §8 state machine.** Everything else — including a `zoom_meetings` row that is
  `ended` or `cancelled` while the projection still reads `scheduled` — falls to
  `{ mode: 'pending' }` rather than 410, because the prompt makes the projection the
  authority for the 410 and step 6 the catch-all. A reviewer may reasonably argue a
  desynced `ended` row should be 410, not "in preparation".

### Known limitations / deferred

- No UI consumes this endpoint yet (Z2-2b). It is unreachable in the product.
- Community meetings are not handled; `authorizeMeetingJoin` is consultor-sessions-only
  and would need §5's second matrix for Z6.
- The 503 kill-switch branch is reached before the service client is built, which is
  what [A4] asserts — but that also means a flag flip mid-request is not observable
  anywhere later in the handler. Not a concern today; worth remembering if the flag
  ever becomes per-school.
- Carried from Z2-1 and still open, still out of scope: PUT can move an
  already-managed session's modality to `presencial` with no guard.

---

## Round r5 — chunk Z2-2a, filter-aware test doubles (test-only)

Closes the gap the r4 report disclosed under *scrutiny*: **"a policy that dropped the
`expected` filter would pass every test here."** The PM measured it and it was worse
than one filter — the old `chainable()` Proxy returned a canned row per *table name*,
so `.eq()` arguments were invisible to every assertion in both suites, and three
lookups were each one line away from a real breach.

**No source changed.** `lib/utils/meeting-join-policy.ts` and
`pages/api/meet/session/[id]/join.ts` are byte-identical to `4cd2263`
(`git hash-object` == `git rev-parse 4cd2263:<path>` for both). The diff is two test
files.

### What changed

- Both doubles now **record the `(column, value)` pairs** each `from(table)` chain is
  given and resolve the seeded row **only if every recorded filter matches one of its
  column values** — the way Postgres would. A filter the row does not satisfy resolves
  `{ data: null, error: null }`, i.e. "no row". Seeded rows carry an explicit `match`
  (their real column values) separate from the `data` the `select()` returns, because
  `select('id')` returns one column while the WHERE clause compares three.
- `isFacilitator` / `isExpectedAttendee` keep their old meaning — a roster row owned by
  the caller — so every pre-existing test reads unchanged. New `facilitator` /
  `attendee` / `meetingSurfaceId` seeds place a row somewhere else on purpose.
- `tablesRead` is untouched; the [A8] ordering assertion still rests on it.

### New assertions (6)

Policy suite — *the roster lookups are bound to their filters*: an expected-attendee row
belonging to another `user_id` does not authorize; an attendee row with
`expected: false` does not authorize its own owner; a facilitator row belonging to
another `user_id` does not make this caller host; and a positive control — the same rows
DO authorize the user they belong to, so the double is not simply blind.

Route suite — *the reads are bound to their filters*: a provisioned meeting for a
different `surface_id` yields `mode: 'pending'`, never that other session's `join_url`;
an attendee row belonging to another user yields 403 with no link.

### Mutation probes — the evidence the doubles now bite

Each mutation was applied to the shipped source, the two suites run, then the file
restored from a copy taken beforehand. There is still no prior revision to fail against.

| Probe | Mutation | Before r5 | After r5 |
|---|---|---|---|
| 1 | attendee lookup loses `.eq('user_id', userId)` | 39/39 **passed** (PM) | **2 failed** / 43 passed |
| 2 | attendee lookup loses `.eq('expected', true)` | would pass | **1 failed** / 44 passed |
| 3 | `zoom_meetings` read loses `.eq('surface_id', …)` | would pass | **1 failed** / 44 passed |

Probe 1 is the PM's own probe — the one that authorized every caller reaching that
branch and stayed green. It now fails in **both** suites.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` → exit 0;
**4350 passed / 266 files** (baseline 4344 / 266 — six new, none lost).
`npm run test:db` → `Files=8, Tests=338`, `Result: PASS`, exit 0.

### What this round does NOT close

- The doubles model `.eq()` only. `.in()`, `.or()`, `.is()`, `.gte()` and RLS itself are
  still unmodelled — a future lookup using any of them would be as invisible as `.eq()`
  was, because an unrecognised chain method still just returns the chain.
- An `.eq()` on a column the scenario did not declare resolves as "no row" rather than
  raising. That fails loudly in the authorized-path tests, but the message points at the
  assertion, not at the undeclared column.
- Still nothing integration-tests this endpoint against real Postgres. These are better
  doubles, not a database.

---

## Chunk Z2-2b — the two human surfaces

### Branch and commits

- **Branch:** `feat/zoom-sess`
- **Base:** `6c71eda` (the r5 head; worktree was clean at it)
- **Worktree:** `/Users/brentcurtis/dev/wt/zoom-sess` — **new path.** Every ZOOM
  worktree under `~/Documents` died when iCloud evicted the shared `.git` on
  2026-08-05. No work was lost; the live clone is now `/Users/brentcurtis/dev/fne-lms`.
- **PR:** not opened — the PR opens at phase end, after all Z2 chunks land.

| SHA | Cluster |
|---|---|
| `f77889c6` | S1 + S2 + three new suites |

### Objective and scope

Z2-1 made managed intent durable and made approval enqueue provisioning; Z2-2a
opened `POST /api/meet/session/[id]/join`. Neither was reachable by a person —
no one could set the flag and no one could press join. This chunk is those two
surfaces and nothing else.

**In:** the "Generar reunión Zoom" box in the scheduler, and the managed join on
the meeting interstitial.
**Out, deliberately:** the workspace "Sesiones" tab placement (PM deferral),
dual-zone time preview and dial-in (Z2-4), notifications / iCal / reminders
(Z2-4), reschedule-cancel-delete sync (Z2-3), the hours-consumer audit (Z2-5),
embed (Z3), community meetings (Z6). No migration. `lib/utils/meeting-join-policy.ts`,
`pages/api/meet/session/[id]/join.ts` and `tests/e2e/zoom-join-authz.spec.ts` are
untouched, per PM rulings 1 and 4.

### Files, by risk

| Risk | File | Δ |
|---|---|---|
| **High** | `pages/admin/sessions/create.tsx` | +82 / −32 |
| **High** | `components/sessions/JoinMeetingButton.tsx` (new) | +134 |
| Medium | `pages/meet/session/[id].tsx` | +12 / −3 |
| Low | `lib/utils/session-meet-access.ts` | +8 / −1 |
| Test | `__tests__/pages/admin/sessions/create-zoom-managed.test.tsx` (new) | +302 |
| Test | `__tests__/components/sessions/JoinMeetingButton.test.tsx` (new) | +190 |
| Test | `__tests__/pages/meet/session-managed-join.test.tsx` (new) | +145 |
| Test | `__tests__/lib/utils/session-meet-access.test.ts` | +26 |

### The payload builders — how "exactly two" was established

`create.tsx` posts to `/api/sessions` from `handleSaveDraft` and
`handleScheduleSession`, each spreading its own object literal. Both now send
`is_zoom_managed`. That there is no third was established three ways over the file
at `6c71eda`, all agreeing:

1. `grep -n "fetch("` → six call sites. Two are `POST /api/sessions` (`:565`,
   `:651`); the other four are `GET /api/admin/consultants`, `GET /api/hour-types`,
   `POST /api/sessions/bulk-approve` and `POST /api/sessions/{id}/approve` — the
   approve calls carry only a `recurrence_group_id` or nothing, no session fields.
2. `grep -n "JSON.stringify"` → three. Two are `body: JSON.stringify(payload)`
   (`:571`, `:657`); the third is the bulk-approve body.
3. `grep -n "payload\b"` → two `const payload` declarations (`:538`, `:624`) and
   nothing that mutates a payload elsewhere. `grep -n "meeting_link"` finds the same
   two spread sites (`:548`, `:634`) and no third.

Both are asserted independently in the new page suite — the draft path and the
schedule path each get a checked-box case and an unchecked-box case, reading the
actual `fetch` body.

### The interstitial's unmanaged markup

A6 asks for byte-identical legacy branches. Proven directly rather than by
inspection: `git show HEAD:'pages/meet/session/[id].tsx'` was written to a
temporary sibling module (so its relative imports resolved unchanged), both
revisions were rendered through `renderToStaticMarkup` for the has-link and
no-link sessions, and the strings compared.

```
=== HAS-LINK BEFORE LENGTH 2539 AFTER 2539   → identical
=== NO-LINK  BEFORE LENGTH 1784 AFTER 1784   → identical
✓ __tests__/_baseline_tmp.test.tsx  (2 tests) 7ms
```

Both temporary files were deleted; the committed tree has neither. Those exact
strings are now frozen in `session-managed-join.test.tsx`, so future drift in the
legacy branches fails there.

### Mutation probes

No fail-on-old exists — this is new UI, not a modified route. Instead the two
assertions carrying the security weight were mutated against the shipped source,
the suite run, and the file restored from a copy taken beforehand.

| Probe | Mutation | Result |
|---|---|---|
| 1 (A6) | render the join button for every session (`{session.is_zoom_managed ?` → `{true ?`) | **2 failed** / 4 passed — both frozen-markup tests |
| 2 (A8) | `getServerSideProps` returns `{...access.session, join_url: 'https://zoom.example.test/j/…'}` | **1 failed** / 5 passed — the serialized-props test |

After each revert, `shasum -a 256 pages/meet/session/[id].tsx` returned
`edf8dc75006decc6dbc0bc1e16d71fb92064ea54605f1169bb900e532b1eae52` — the
pre-probe value — and `diff` against the pre-probe copy was empty.

### Decisions a reviewer should look at

- **The provider `<select>` is hidden with the link field, not just the link
  field.** §2 says to hide the manual link; the provider dropdown exists only to
  classify that link, and `POST /api/sessions` forces `meeting_provider: 'zoom'`
  for a managed session. Leaving it visible would offer "Teams" as a choice the
  server silently overrides. Flagged as a deviation.
- **`401` → `router.replace('/login?next=' + encodeURIComponent(router.asPath))`,
  `404` → `router.replace('/404')`.** These are the destinations
  `getServerSideProps` already uses for the same two answers. A `router.reload()`
  would have been the more literal delegation but is wrong for `404`: the join
  policy is narrower than `canViewSession`, so SSR would re-grant the page and the
  denial would silently vanish.
- **A checked box does not clear a previously typed `meeting_link`.** The field is
  hidden and the server nulls the link for a managed session, so nothing leaks;
  clearing it would be adjacent form code this chunk was told not to touch.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` → exit 0;
**4378 passed / 269 files** (baseline 4350 / 266 — 28 new across 3 new files, none lost).
`npm run test:db` → `Files=8, Tests=338`, `Result: PASS`, exit 0.
`npx playwright test tests/e2e/zoom-join-authz.spec.ts` → **19 passed**, exit 0,
spec unmodified (`git diff --stat` on it is empty). Run against a freshly
`supabase db reset` local stack seeded by `scripts/ci/seed-e2e.mjs`; `.env.local`
was pointed at that stack for the run and restored afterwards (hash verified).

### What this round does NOT close

- The scheduler suite renders the real page but stubs Supabase and `fetch`. Nothing
  here proves the form's request survives a real `POST /api/sessions`; the server
  side of that contract is covered by Z2-1's own suite, not by this one.
- No e2e drives either new surface. `zoom-join-authz.spec.ts` seeds only unmanaged
  sessions, so it proves the legacy branches are intact and says nothing about the
  managed one. A managed fixture and a spec for it would need a seeded
  `zoom_internal.zoom_meetings` row — out of scope here.
- The join button's `window.open` runs after an `await`, so a strict popup blocker
  can swallow the tab. It matches the repo's existing fetch-then-open pattern
  (`components/licitaciones/ArchiveView.tsx:94`), and nothing in this chunk makes it
  worse, but school hardware is exactly where it would show up first.

---

## Chunk Z2-3a — the atomic pre-execution reschedule (hours only)

### Branch and commits

`feat/zoom-sess`, on top of `c2be4ec9`. One commit, listed in the executor report.
No Zoom in this chunk at all — `meeting_sync`/`meeting_delete` and every reschedule
enqueue hook are Z2-3b.

### Objective and scope

Plan §11: a pre-execution reschedule updates the hour reservation, the planned
snapshot and an append-only revision entry **in one transaction**.

The gap was re-verified against `c2be4ec9` before any code was written, and it is
real: neither `pages/api/sessions/[id]/index.ts` nor
`pages/api/sessions/edit-requests/[eid].ts` referenced `hour-tracking`,
`createReservation` or `contract_hours_ledger` at all. Moving a session from
09:00–10:30 to 09:00–11:30 left the school billed — and the consultant paid — for
1.5 h. That is a live billing bug; the Zoom work only made it visible.

### Files, by risk

| Risk | File | Purpose |
|---|---|---|
| **High** | `supabase/migrations/20260805120000_reschedule_hours_rpc.sql` (new) | `public.reschedule_session_hours(uuid, uuid)` + the `session_activity_log.action` widening |
| **High** | `pages/api/sessions/[id]/index.ts` | admin PUT calls the RPC on a duration-relevant change |
| **High** | `pages/api/sessions/edit-requests/[eid].ts` | edit-request approve does the same |
| Medium | `lib/services/hour-tracking.ts` | `syncRescheduleHours` + `isDurationRelevantChange` (new exports; the three cancellation-flow functions are untouched) |
| Low | `lib/types/hour-tracking.types.ts` | `RescheduleHoursPayload` / `RescheduleHoursResult` |
| Test | `supabase/tests/012-reschedule-hours-rpc.sql` (new, 36 assertions) | RPC behaviour in the database |
| Test | `__tests__/api/sessions/reschedule-hours-sync.test.ts` (new, 13 tests) | both routes, both directions |

### Decisions a reviewer should look at hardest

1. **The `session_activity_log.action` CHECK was widened, and that is a schema
   change the prompt did not anticipate.** Ruling §3.3 requires a new, specific
   action value; `action` carries a 16-value CHECK allowlist, so a new value cannot
   be written without widening it. The new list is a strict **superset** — every
   previously legal value is still legal, no row can fail it, nothing is removed.
   PostgreSQL has no "add a value to a CHECK" verb, so the mechanism is DROP + ADD;
   ordering is DROP → ADD NOT VALID → VALIDATE so the audit table is never blocked
   for writers. If the PM considers any `DROP CONSTRAINT` out of bounds regardless
   of direction, this is the line to reject.
2. **The RPC restates `get_bucket_summary`'s availability inline.** It could not
   call it: `get_bucket_summary` is a plain SQL function with **no `search_path` of
   its own**, so it resolves table names against the caller's — and the RPC pins an
   empty one per the `20260731120000` convention. Calling it fails with `relation
   "contract_hour_allocations" does not exist` (observed, not theorised). Two pgTAP
   assertions pin the restatement against `get_bucket_summary`'s own output so the
   two cannot drift silently.
3. **Route gating uses the status the row has AFTER the update**, because that is
   what the RPC reads. Post-execution time edits remain allowed at the session level
   and simply never reach the RPC; the RPC refuses them independently for any other
   caller ([A4] asserts that by calling it directly).
4. **A failed recomputation returns 500 rather than logging and continuing.** The
   session update has already been applied at that point, so this is loud-and-
   inconsistent rather than silent-and-stale — see "does NOT close" below.
5. **Over-budget matches `createReservation`, with the row's own reservation added
   back** before the comparison, since it is already inside the bucket's
   `reserved_hours` at reschedule time (it is not at approve time).

### Test evidence

pgTAP `012` — 36 assertions. [A3] atomicity is proven by forcing the revision
INSERT to fail with a trigger (a bogus actor would fail at the UPDATE instead,
because `updated_by` has an FK to `profiles`, and would prove nothing about
ordering), then asserting `hours` and `planned_minutes_snapshot` are unchanged and
no revision row survives.

**Mutation probe for [A3]:** replacing the revision INSERT with a best-effort
`BEGIN … EXCEPTION WHEN OTHERS THEN NULL; END` — precisely the anti-pattern §11
names — fails tests 16/17/18, with the ledger left reading `2.00` h / `120` min and
no revision row. The atomicity test is not vacuous.

**Fail-on-old for [A2]/[A6]:** with both route hunks reverted to `c2be4ec9` and
everything else in place, `reschedule-hours-sync.test.ts` is **7 failed / 6 passed**
— every "calls the RPC" assertion fails (`expected [] to have a length of 1 but got
+0`) and both 500 paths fail (`expected 200 to be 500`). The 6 that still pass are
the negative "does NOT call the RPC" assertions, which pass trivially against code
that never calls it — that is expected, and they earn their place only alongside the
positive ones.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` → exit 0,
**4391 passed / 270 files** (PM baseline at `c2be4ec9`: 4378 / 269 — +13 in 1 new
file, none lost).
`npm run test:db` → `Files=9, Tests=374`, `Result: PASS`, exit 0 (baseline 338 / 8
— +36 in 1 new suite). Run after a full `supabase db reset`, so the migration is
verified to replay **in chain order**, not just applied by hand.

### What this round does NOT close

- **The session UPDATE and the ledger RPC are still two statements.** The RPC makes
  its own three writes atomic, which is what §11 requires, but a mid-request failure
  can still leave the session retimed with the ledger unmoved. The route now returns
  500 instead of swallowing it, so the operator learns — but there is no compensating
  rollback of the session row. Folding the session update into the RPC would touch
  both routes' whole update path and is beyond this chunk.
- **No production verification.** Every gate here ran against a local Postgres. The
  migration is unapplied in production and applying it is a separate Brent-authorized
  step.
- **`edit-requests/[eid].ts:185` inserts `action: 'edit_approval_blocked'`, which was
  never in the CHECK allowlist** — that best-effort insert has always failed silently.
  Pre-existing, unrelated to this chunk, and deliberately left alone; the widening
  here adds only `'hours_revised'`. Worth its own ticket.
- The `en_progreso`+ freeze is asserted on the RPC and on the routes, but nothing
  here covers the Z7 override path, which does not exist yet.

---

## Chunk Z2-3b — telling Zoom

### Branch and commits

`feat/zoom-sess`, on top of `334de02a`. One commit, `08d3e82b`, listed in the
executor report. No migration.

### Objective and scope

Plan §8's two missing lifecycle legs. Z2-1 made a session platform-managed and
enqueued `meeting_provision` at approve; Z2-2a/2b built and exposed the join; Z2-3a
made a pre-execution reschedule move the hours ledger atomically. **Nothing ever
told Zoom.** A rescheduled session kept its original Zoom time, and a cancelled
session left a live meeting on a booked host forever — the row stayed in an ACTIVE
status, so the §9 EXCLUDE constraint went on reserving that host for a window nobody
would use, and the projection went on advertising a joinable meeting.

Two handlers (`meeting_sync`, `meeting_delete`), both registered, and four enqueue
points — the two reschedule routes, both cancel routes, and the PUT modality flip to
`presencial`.

### Files, by risk

| Risk | File | Purpose |
|---|---|---|
| **High** | `lib/zoom/jobs/meeting-sync.ts` (new, 559) | PATCH Zoom to the current Chile wall-clock; move the reservation; republish |
| **High** | `lib/zoom/jobs/meeting-delete.ts` (new, 410) | DELETE at Zoom; row → `deleted` (releasing the host); republish → `cancelled` |
| **High** | `lib/zoom/provisioning-intent.ts` (+204/−1) | the two dedupe keys, the cleanup gate, the two enqueue functions |
| **Medium** | `pages/api/sessions/[id]/index.ts` (+29) | reschedule → `meeting_sync`; flip to `presencial` → `meeting_delete` |
| **Medium** | `pages/api/sessions/[id]/cancel.ts` (+18) | both cancel paths → `meeting_delete` |
| **Medium** | `pages/api/sessions/series/[groupId]/cancel.ts` (+11) | one `meeting_delete` per affected managed session |
| **Medium** | `pages/api/sessions/edit-requests/[eid].ts` (+25) | edit-request approve → `meeting_sync` |
| **Low** | `lib/zoom/jobs/registry.ts` (+18/−1) | both types registered, same commit as their first enqueue |
| **Low** | `lib/zoom/jobs/meeting-provision.ts` (+22/−5) | `sessionStartsAtIso` extracted; the provisioner now calls it |
| **Low** | `__tests__/lib/zoom/jobs/provisionHarness.ts` (+56) | sync/delete store doubles over the SAME rows and projection |

### Decisions a reviewer should look at hardest

**1. `meeting_sync` writes the DATABASE first, then Zoom.** The chunk is called
"telling Zoom" and it tells the row first. The row's interval IS a §9 host
reservation, so moving it can raise 23P01 — and that refusal is PERMANENT (no
backoff frees a host; host reassignment is a later phase). Discovering it before the
Zoom call leaves both sides on the old time and a consistent world for a human to
repair. The reverse order would put Zoom on a window the database had just refused to
reserve: a host genuinely double-booked, with no retry that repairs it. The residual
is bounded — a failed PATCH leaves the row ahead of Zoom and the retry re-PATCHes,
which is safe because PATCH, unlike `createMeeting`, is idempotent.

**2. Cleanup does NOT use the provisioning gate.** `checkSessionEligibility` refuses
a cancelled session and a `presencial` one, which are exactly the two states a
cleanup exists for; running it here would refuse every job it is supposed to mint. So
`checkCleanupGate` keys on the durable `is_zoom_managed` intent instead (the fact,
not `meeting_provider`, which is vocabulary and can legitimately be hand-managed).

**3. `meeting_delete` refuses one row: a numberless reservation parked under
`ambiguous_create_outcome`.** That park is not an empty reservation — it is one held
BECAUSE a meeting may exist at Zoom under a number nobody could read (Sol F4).
`meeting_provision`'s own eligibility path refuses to release it; this handler does
the same, non-retryably, with zero writes.

**4. Sync accepts only `provisioned`.** `pending` is either a bare reservation or the
operator-recovery state `meeting_provision` owns; `started` means reality overtook the
reschedule; the rest have nothing joinable to move. A NULL meeting number is a
COMPLETION, not a failure — the provisioner re-proves its reservation against the
current schedule (`reservationMatchesSource`) and will create at the new time.

**5. Both enqueues sit BEFORE the Z2-3a hours sync, not after.** The hours sync can
return 500 on a path where the times already moved; an enqueue after it would leave
Zoom on the old time in exactly the case an admin is being told to go and check the
ledger. Neither enqueue can throw or change the response, so no branch's status or
body moves.

**6. `sessionStartsAtIso` was extracted rather than re-derived.** `TZDate`'s
`toISOString()` renders the ZONED form (`…T17:00:00.000-04:00`). Postgres parses it to
the same instant, so the difference is invisible in the database and very visible in a
dedupe key — a key built the obvious way would still be a valid string and would
silently stop deduplicating. One derivation, three call sites.

**7. The edit-request path nulls `scheduled_duration_minutes` before enqueueing.**
That route updates without a `.select()`, so the row is reconstructed as
`{ ...session, ...sessionUpdate }` — and the generated column on `session` is the one
computed for the OLD times. Nulling it forces derivation from the new start/end. Found
by the suite, not by reading.

### Test evidence

84 new tests in 4 files: `meeting-sync.test.ts` (27), `meeting-delete.test.ts` (15),
`session-reschedule-zoom-sync.test.ts` (24), `session-cancel-zoom-delete.test.ts` (18).

Both handler suites run the round trip through `runZoomTick` and the REAL
`createZoomJobRegistry()`, so a handler that existed but was never registered fails
them — the Z1b-3 sequencing rule, asserted rather than assumed. The store doubles are
the shared provision harness extended over the SAME rows and projection, so the
host-busy path meets the real EXCLUDE model and the delete path is proved to release
the reservation by re-reserving the same host for the same window afterwards.

Route suites fake ONLY the queue seam; the gate, the dedupe key and the wiring are
real. The session doubles are **filter-aware** — a canned row resolves only when the
recorded `.eq()` filters match it — and the `consultor_sessions` double recomputes
`scheduled_duration_minutes` on update, because it is a stored generated column and
the dedupe key reads it.

The reschedule fixture sits on **2026-09-10**, inside Chile DST (UTC−3). A handler
shipping a UTC-converted instant, or a key built by concatenation, would agree with a
UTC−4 fixture half the year and disagree here.

**Fail-on-old for [A7]/[A9]:** with the four route files alone reverted to `334de02a`
and everything else in place, the two route suites are **14 failed / 28 passed** —
every positive enqueue assertion fails (`expected "spy" to be called 1 times, but got
0 times`; the series case `2 times, but got 0`), on all four routes. The 28 that still
pass are the negative "does NOT enqueue" assertions, which pass trivially against code
that never enqueues; they earn their place only alongside the positive ones. Restored
by blob hash — all four files back to their committed hashes, `git status` clean, and
the suites green again at 42/42.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` → exit 0,
**4475 passed / 274 files** (PM baseline at `334de02a`: 4391 / 270 — +84 in 4 new
files, none lost).

`npm run test:db` → **NOT RUN.** The Docker daemon is down on this host
(`Cannot connect to the Docker daemon at unix:///Users/brentcurtis/.docker/run/docker.sock`),
so `supabase test db` never reached a local Postgres (`LegacyDbConnectError`). Not
worked around, and the last-known figure is deliberately not restated as though it
were reproduced. This chunk adds no migration, so the gate is a regression check
here rather than a proof of new behaviour.

### What this round does NOT close

- **[A10] contradicts plan §14 on cleanup, and [A10] was implemented.** §14 (PLAN.md
  line 292) says the kill switch "stops *new meetings and joins*, never cleanup" and
  names `meeting_delete` among the jobs that continue with the master flag off. [A10]
  requires no enqueue at any of the four points when the flag is off. Both cannot
  hold. The consequence is real and one-directional: with the flag off during an
  incident, a session cancelled in that window leaves a live meeting on a booked host
  — the exact failure this chunk exists to fix. It is one line
  (`checkCleanupGate`'s flag check) either way. **PM ruling needed.**
- **No handler has ever run against a real Zoom tenant.** Everything here is the fake.
- **No production verification, and no reconcile.** A `meeting_sync` that dead-letters
  leaves the row ahead of Zoom with nothing to repair it; reconcile-driven repair is
  explicitly out of scope for this chunk.
- **`sync_host_busy` has no automatic remedy.** A reschedule onto a window the host
  already occupies fails terminally with both intervals in `evidence`; host
  reassignment is a later phase, so the operator's only lever is moving the other
  meeting.
- Notifications, iCal and reminders still describe the OLD time after a reschedule —
  Z2-4.

---

## Z2-3b — round r9 (remediation: the [A10]/§14 ruling)

**Commit:** `ec400d24` on `feat/zoom-sess`, on top of `0666b996`. One source file, two
test files. No migration.

### The ruling this round applies

The PM ruled §14 over [A10], and narrower than [A10] in one direction only: **`meeting_delete`
is ungated by both flags; `meeting_sync` is unchanged.**

- **Master flag.** PLAN.md:292 — the kill switch stops *new meetings and joins*, **never
  cleanup**, and names `meeting_delete` for cancellations among the jobs that continue while
  it is off. The r8 report's one-directional consequence was the right one: with the flag off
  during an incident, a session cancelled in that window left a live meeting on a booked host.
- **Allowlist.** PLAN.md:296 — `ZOOM_SCHOOL_ALLOWLIST` is "checked at **provision time**". A
  cancellation is not a provision, and a school removed after provisioning must not have a
  live meeting stranded on it.
- **Sync stays gated.** §14 does not name sync among what continues, and the documented
  behaviour for a removed school is that its existing meetings **freeze** ("NOT auto-deleted
  … a reconcile notice lists still-provisioned meetings so an admin can bulk-cancel
  deliberately"). Freezing is the plan's stated intent, so leaving sync gated follows §14's
  words rather than extending them.

### What changed

`lib/zoom/provisioning-intent.ts` (+18/−26) — `checkCleanupGate` drops the
`FEATURE_ZOOM_MEETINGS` branch and the `ZOOM_SCHOOL_ALLOWLIST` branch, keeping only
`is_zoom_managed !== true → { reason: 'not_managed' }`. It therefore reads no environment at
all, so the `env` parameter went with the branches rather than sitting unread on the
signature; its one caller (`enqueueSessionMeetingDelete`) drops the argument and still passes
`env` to the queue factory. `CleanupGateRefusal` narrows to the single reason that remains —
the `feature_disabled` and `school_not_allowlisted` variants are now unreachable on this gate
and are removed rather than left as dead shapes (both still exist on `ProvisionGateRefusal`,
so `ZoomEnqueueRefusal` is unchanged). The doc comment states **why** cleanup is ungated and
says explicitly not to "restore" a flag check, so the next reader does not re-add one.

`checkProvisionGate`, the sync enqueue, all four enqueue points, both handlers, the registry
entries, the dedupe keys and the `sessionStartsAtIso` extraction are untouched.

### Test evidence

The r8 `[A10]` cases that asserted the reverse were **replaced**, not supplemented — an
assertion that cleanup is gated is now a statement the plan contradicts. The three delete
points (single cancel, series cancel, modality flip) each assert they **still enqueue** with
the master flag `'false'` and unset, and with the school outside a non-empty allowlist, on
the exact argument object; the unmanaged refusal is asserted at all three. Every `meeting_sync`
assertion is byte-unchanged and still passing — that is ruling (b), and the reschedule suite
is now where the two gates' difference is visible on ONE route.

**Mutation probe** (there is no fail-on-old here: the behaviour is being deliberately
reversed, so the old source is the thing under repair).

1. Re-added the master-flag check to `checkCleanupGate` → **6 failed / 40 passed** across the
   two route suites: both legacy-cancel `[R2]` cases, both series `[R2]` cases (`expected
   "spy" to be called 2 times, but got 0 times`) and both modality-flip `[R2]` cases.
2. Re-added the allowlist check instead → **3 failed / 43 passed**: the `[R3]` case at each of
   the three delete points.
3. Reverted. `git hash-object lib/zoom/provisioning-intent.ts` →
   `bd9e23bc939d31ae4481d94ef486d10156b19653`, identical to the pre-probe hash.

Each probe fails **only** the cases that encode the ruling, and no sync case moved under
either — the new assertions bite on exactly the behaviour they name.

### Gates at `ec400d24`

`npm run type-check && npm run lint && npm test && npm run build` → exit 0,
**4479 passed / 274 files** (PM baseline at `0666b996`: 4475 / 274 — +4 new cases, none
lost, no file added).

`npm run test:db` → **NOT RUN**, same cause as r8: the Docker daemon is down on this host
(`Cannot connect to the Docker daemon at unix:///Users/brentcurtis/.docker/run/docker.sock`),
so `supabase test db` never reached a local Postgres (`LegacyDbConnectError`, exit 1). Not
worked around, and the r8 `Files=9, Tests=374` figure is still not restated as though it were
reproduced. This round adds no migration and touches no SQL, so nothing here changes what the
suite would assert.

### Still open after this round

Everything under r8's "What this round does NOT close" stands, minus the [A10]/§14 item,
which this round closes. Plus:

- **The edit-request modality gap is still open.** `PUT /api/sessions/edit-requests/[eid]`
  can carry a `modality` change and enqueues only `meeting_sync`, so an approved edit request
  that flips a session to `presencial` leaves the meeting alive. Flagged in r8, recorded by
  the PM as backlog, and deliberately not fixed here — it is a new lifecycle point, not the
  ruling. Note that the ruling makes this gap slightly wider in one respect: the delete that
  path fails to enqueue would now fire regardless of either flag.

---

## Chunk Z2-5 — the hours-consumer audit — round r10 · **FINDINGS, no source change**

**Branch head unchanged: `118a9db8`.** `git diff 118a9db8` is empty for all source. This
round delivers the §11 inventory (S5) and stops on S2 — the school-report retarget rests on
a premise that is false against the repo, and repairing it needs a decision the prompt does
not authorise.

### The blocking finding — `lib/services/school-hours-report.ts` cannot return sessions

The session query at `:149-166` selects **two columns that do not exist** on
`consultor_sessions`, and orders by one of them:

| Line | Reference | Reality |
|---|---|---|
| `:154` | `scheduled_date` | no such column — the table has `session_date` |
| `:156` | `planned_duration_minutes` | no such column — the table has `scheduled_duration_minutes` (generated) and `actual_duration_minutes` |
| `:165` | `.order('scheduled_date', …)` | same phantom column, in the order key |

PostgREST rejects an unknown column in `select` (and in `order`) with `42703`. The route
destructures the error away — `const { data: sessionRows } = await …` — so `sessionRows` is
`null`, `typedRows` is `[]`, and **every bucket's `sessions` array is empty**. The drill-down
under each hour bucket renders nothing.

**Evidence, and its one limit.** Three independent strands:

1. `supabase/migrations/00000000000000_baseline.sql:7700-7742` is the full `consultor_sessions`
   definition and carries neither column; `grep -rn 'planned_duration_minutes\|scheduled_date' supabase/`
   returns **zero** hits across all 12 migrations.
2. That baseline dump is itself current: it carries `blocks.payload`, `blocks.lesson_id` and
   `blocks.is_visible` exactly as the live table is known to have them, so it is not a stale
   snapshot.
3. `pages/api/admin/bulk-tag-sessions.ts:131` does `scheduled_date: s.session_date` — an
   explicit alias "for frontend compat", written by someone who knew the real column name.

*Limit:* this was **not** executed against a live PostgREST. `test:db` cannot connect (below)
and production is off-limits per `CLAUDE.md`. The conclusion rests on the schema record plus
PostgREST's documented behaviour, not on an observed 400.

**Why no test caught it.** `fetchSchoolReportData` has **no** direct coverage: both suites that
name it — `__tests__/api/hour-tracking/school-report.test.ts:53` and `school-report-pdf.test.ts:52`
— `vi.mock` the module out entirely and assert against a hand-built return value. 15 tests
pass green over a function whose main query cannot succeed. Introduced in `94312a76`
("Phase 6 — Polish + Badges…").

### Why this stops S2 rather than being fixed inside it

- §1's anchor table says `:200-202` is "the offending derivation, **feeding `hours` at `:214`**".
  The text matches, but the claim does not: with `typedRows` always empty, that derivation
  never runs on a real row, and this consumer displays no hours at all — it is not
  mis-presenting `actual_duration_minutes`, it is presenting nothing.
- S2 says "extend the ledger select it **already makes** at `:178-181`". That query is inside
  `if (sessionIds.length > 0)`, which never holds. **S2's whole retarget is unreachable code**
  until the phantom columns are repaired.
- Repairing them means renaming a **display** field (`scheduled_date` → `session_date`, feeding
  `date` at `:212`) and an **order key** — neither is an hours concern, and the repair would
  take the school report's drill-down from "always empty" to "populated" on a report that goes
  to schools. That is a visible product change no acceptance criterion covers and §4 excludes.
  §2 S5 is explicit: *"do not silently widen scope to fix it."*

### What the PM has to decide

**Option A — repair first, retarget second (recommended).** A separate chunk fixes the three
phantom references and lands the first real unit test for `fetchSchoolReportData`; Z2-5's
retarget then follows on a query that works and can be asserted end to end. Costs a round,
keeps the visible change reviewable on its own.

**Option B — one chunk, explicitly widened.** Authorise the column repair inside Z2-5 and
state the drill-down going live as an expected outcome, so the reviewer is not surprised.

Either way `hours` cannot be derived from `planned_duration_minutes`; the fallback source
must become `scheduled_duration_minutes`.

### Design work already settled (so the next round does not redo it)

- **S1 helper — `resolveBillableHours(ledgerRow, plannedMinutes)`** in `lib/services/hour-tracking.ts`,
  returning `{ hours, source }` where `source ∈ ledger | ledger_non_billable | planned_fallback`.
  The `source` is what lets a test tell "read the ledger" from "fell back" when the two
  numbers coincide.
- **Ruling 3 (no ledger row) → the session's approved planned duration, never a silent 0**,
  sourced `planned_fallback`. It is the number both consumers already display for those
  sessions today, since `actual_duration_minutes` stays NULL until finalize.
- **Ruling 4 → `devuelta` = 0 (`ledger_non_billable`), `penalizada` = its `hours`.** This is not
  a judgement call; two existing sources fix it:
  - `get_bucket_summary` (baseline `:2781-2823`) rolls `('consumida','penalizada')` into
    `consumed_hours` and excludes `devuelta` from the bucket entirely. That bucket header
    renders directly above the per-session drill-down, so a `penalizada` row reading 0 h would
    contradict the total above it.
  - `pages/api/consultant-earnings/[consultant_id].ts:170` sums ledger `hours` filtered to
    `('consumida','penalizada')` — penalizada already **pays the consultant**.
- **Z7 seam:** helper reads `hours` today; when `effective_minutes` lands, the only change is
  preferring `effective_minutes / 60` for a billable row plus the column in two `select()`
  strings.

### §11 hours-consumer inventory (S5 — the deliverable)

**How I searched.** Four repo-wide greps over `*.ts|*.tsx|*.js`, excluding `node_modules`
and `.next`: `actual_duration_minutes`, `scheduled_duration_minutes`, `planned_minutes_snapshot`,
`contract_hours_ledger`. For the ledger I read every `select()` that follows a
`.from('contract_hours_ledger')` to separate rows that carry `hours` from rows that carry only
`status`/`admin_override`. Every hit was then opened to decide whether the value reaches a
human. Test files and fixtures are excluded from the verdict table and listed separately.

| # | Site | Reads | Presented to a human? | Verdict |
|---|---|---|---|---|
| 1 | `lib/services/school-hours-report.ts:201` | `actual_duration_minutes ?? planned_duration_minutes` | **No — unreachable** (finding above) | **BLOCKED** — retarget deferred pending the PM decision |
| 2 | `pages/api/sessions/reports/analytics.ts:327` | `actual_duration_minutes` → `total_hours_actual` | Yes, in the API body — but see #3 | **To retarget** (S3); design settled, not landed this round |
| 3 | `pages/consultor/sessions/reports.tsx:57` | `total_hours_actual` | **No.** Declared on the KPI interface and **never rendered** — the only KPI card in that block is `total_hours_scheduled` at `:541` | **Already correct** — and ruling 2's premise needs amending: there is **no UI label** claiming "real"/"actual" elapsed time to fix, because nothing renders the field |
| 4 | `pages/api/sessions/[id]/finalize.ts:96,108` | writes `actual_duration_minutes ?? scheduled_duration_minutes` | No | **Deliberately left** — the compatibility writer §2 S4 keeps |
| 5 | `pages/api/sessions/index.ts:230` | writes `actual_duration_minutes: null` | No | **Deliberately left** — creation default |
| 6 | `pages/admin/sessions/[id].tsx:847` | `scheduled_duration_minutes` → `({n} min)` | Yes | **Already correct** — planned duration, presented as planned |
| 7 | `pages/api/sessions/reports/analytics.ts:323` | `scheduled_duration_minutes` → `total_hours_scheduled` | Yes | **Already correct** — named and used as scheduled |
| 8 | `pages/api/consultant-earnings/[consultant_id].ts:156,181` | ledger `hours`, status ∈ `('consumida','penalizada')` | Yes — consultant payment | **Already correct** — reads the ledger, the §11 source of truth |
| 9 | `pages/api/contracts/[id]/hours/ledger/index.ts:112` | ledger `select('*')` incl. `hours` | Yes — admin ledger view | **Already correct** |
| 10 | `pages/api/contracts/[id]/hours/ledger/csv.ts:97` | ledger `hours` | Yes — CSV export | **Already correct** |
| 11 | `lib/services/hour-tracking.ts:283` (`createReservation`) | derives `hours` from `scheduled_duration_minutes` | No — it is the writer | **Already correct** — this is where ledger `hours` comes from |
| 12 | `components/workspace/WorkspaceSessionsTab.tsx:104`; `pages/admin/sessions/index.tsx:746`; `pages/consultor/sessions/index.tsx:98` | ledger `session_id, status, admin_override` — **no `hours`** | Status badge only | **Already correct** — not hours readers |
| 13 | `pages/api/admin/consultant-rates/[id].ts:176,208` | ledger existence check, selects `id` only | No | **Already correct** — not an hours reader |
| 14 | `lib/zoom/{provisioning-intent,jobs/meeting-sync,jobs/meeting-provision}.ts` | `scheduled_duration_minutes` → Zoom meeting length | Yes, as meeting duration | **Already correct** — meeting length, not billed hours; sealed chunks |
| 15 | `planned_minutes_snapshot` | written at `lib/services/hour-tracking.ts:328`, updated by the Z2-3a RPC | **No reader anywhere** outside tests | **Deliberately left** — Z7 consumes it for the comparison UI |

**Third offender found: none.** Every ledger-`hours` reader outside the two named consumers
(#8, #9, #10) already reads the §11 source of truth. The one genuinely broken site is #1, and
it is broken in a way §11 did not anticipate — not "shows the wrong number" but "shows no
sessions at all".

**Test-only occurrences** (no verdict needed, but #2's fixtures at
`__tests__/api/sessions/session-reports-analytics.test.ts:77,88` must move to ledger rows when
S3 lands, and `session-notification-recipients.test.ts:335` merely sets the column NULL).

### Gates

No source changed, so nothing could fall: `git status` clean and `git diff 118a9db8 --stat`
empty prove the tree is byte-identical to the PM's measured baseline. The four gates were
therefore not re-run — re-measuring an unmodified checkout of an already-measured commit
proves nothing the diff does not. The suites covering the affected area were run:

```
✓ __tests__/api/sessions/session-reports-analytics.test.ts  (11 tests)
✓ __tests__/api/hour-tracking/school-report.test.ts  (11 tests)
✓ __tests__/api/hour-tracking/school-report-pdf.test.ts  (4 tests)
✓ __tests__/api/hour-tracking/reservation.test.ts  (10 tests)
Test Files  4 passed (4)     Tests  36 passed (36)
```

Note what that green means for `school-report*`: 15 of those 36 pass over a mocked-out
service, which is exactly how the finding survived.

`npm run test:db` — **NOT RUN**, real error:

```
Connecting to local database...
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect","suggestion":"Make sure your local IP is allowed in Network Restrictions and Network Bans.\nhttps://supabase.com/dashboard/project/_/database/settings"}}
```

---

## Chunk Z2-5a — the school-report drill-down repair — round r11

The repair r10 declined to make. Scope is the phantom-column fix plus its first real test
coverage; the hours retarget is untouched and stays with Z2-5b.

### Branch and commits

- **Branch:** `feat/zoom-sess` (base for this round: `68b08ab6`)
- **Files changed:** `lib/services/school-hours-report.ts`,
  `__tests__/lib/services/school-hours-report.test.ts` (new)
- **No migration.** The columns were always fine; the query was wrong.

### [S1] The three phantom references

| Line (pre) | Was | Now |
|---|---|---|
| `:37` | `SessionRow.scheduled_date` | `session_date` |
| `:39` | `SessionRow.planned_duration_minutes` | `scheduled_duration_minutes` |
| `:154` | `select(… scheduled_date …)` | `session_date` |
| `:156` | `select(… planned_duration_minutes …)` | `scheduled_duration_minutes` |
| `:165` | `.order('scheduled_date', …)` | `.order('session_date', …)` |
| `:201` | `s.planned_duration_minutes` fallback | `s.scheduled_duration_minutes` |
| `:212` | `date: s.scheduled_date ?? ''` | `date: s.session_date ?? ''` |

[A1] proof — the file no longer names either column:

```
$ grep -n "scheduled_date\|planned_duration_minutes" lib/services/school-hours-report.ts
$ echo $?
1
```

Independently re-verified against the schema record before touching anything:
`00000000000000_baseline.sql:7714` carries `session_date` (date, NOT NULL) and
`scheduled_duration_minutes` (integer, `GENERATED ALWAYS AS ((end_time - start_time)/60)
STORED`); no migration adds `scheduled_date` or `planned_duration_minutes`.
`pages/api/admin/bulk-tag-sessions.ts:131` still aliases `scheduled_date: s.session_date`
"for frontend compat" — the same tell r10 found.

### [S2] The swallowed error — the report now FAILS rather than degrades

`:149` captured only `data`. It now captures `error` and, on error, logs the bucket
identity and throws:

```ts
if (sessionsError) {
  console.error(
    `[SchoolHoursReport] Sessions query failed (contrato=${contrato.id}, bucket=${bucket.hour_type_key}):`,
    sessionsError
  );
  throw new Error(
    `No se pudieron obtener las sesiones del bucket "${bucket.hour_type_key}" del contrato ${contrato.id}`
  );
}
```

**Why fail, not degrade.** Schools reconcile billable hours against this drill-down. A
silently short list is a worse outcome than a visible error: an empty section reads as
"there were no sessions", which is a factual claim the code cannot support when the query
failed — that indistinguishability is the entire bug being repaired here, and degrading
quietly would rebuild it. A throw is also cheap to surface: both callers already wrap the
call in `try/catch` and return a Spanish 500
(`pages/api/school-hours-report/[school_id]/index.ts:87-90` and `.../pdf.ts`), so nothing
crashes and no caller changes.

**A deliberate asymmetry the reviewer should rule on.** The `bucketError` branch at
`:139-142` still does the opposite — it `continue`s past a contract whose bucket RPC failed,
under the comment "Skip this contract rather than failing the whole report". That is
arguably the same silent-omission class, on a coarser unit (a whole contract). It is
pre-existing, outside this chunk's scope, and left byte-unchanged. Flagged, not fixed.

### [S3] First real coverage — `__tests__/lib/services/school-hours-report.test.ts`

7 tests that **execute** `fetchSchoolReportData`. The client is a constructor parameter, so
nothing about the module is mocked — there is no `vi.mock` of the service anywhere in the
file.

Per the §3.4 ruling, the Supabase double is **schema-faithful, not table-name-keyed**. It
parses the `select()` string (including the `session_facilitators(profiles(…))` and
`programas(…)` embeds), the `.eq()`/`.in()` filters and the `.order()` column against a
column list mirrored from the baseline dump, and answers an unknown column the way PostgREST
does — `42703 column ... does not exist`. Rows are resolved by matching the recorded filter
arguments, sorted by the recorded order column, and projected to the selected columns only.
**A double that ignored the select string would pass against the broken query**, which is the
whole reason this one does not.

| Test | What it pins |
|---|---|
| drill-down is populated | 2 sessions under the bucket; ledger sub-query actually runs |
| maps each session | date/hours/status/consultant per row; `actual ?? scheduled` fallback |
| bucket isolation | a `diagnostico` session never leaks into `acompanamiento` |
| asks only for real columns | select/order carry no phantom column; select validates clean |
| **fails loudly** | with the column absent, the call **rejects** and logs contract+bucket |
| school not found | `null` |
| no active contracts | empty program list |

### [A4] Fail-on-old proof

Source alone reverted to `68b08ab6` (test file kept), suite re-run:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  ... > returns buckets whose session drill-down is populated
AssertionError: expected [] to have a length of 2 but got +0
 FAIL  ... > maps each session from the columns the table actually has
AssertionError: expected undefined to match object { …(7) }
 FAIL  ... > keeps each bucket to its own hour_type_key
AssertionError: expected [] to deeply equal [ Array(1) ]
 FAIL  ... > asks consultor_sessions only for columns it has
AssertionError: expected '\n          id,\n          title,\n  …' not to match /scheduled_date/
 FAIL  ... > fails loudly when the sessions query errors instead of reporting an empty bucket
AssertionError: promise resolved "{ school_id: 77, …(2) }" instead of rejecting
      Tests  5 failed | 2 passed (7)
```

The last line is the production bug reproduced verbatim: the pre-fix function **resolves
successfully with an empty drill-down** where it should reject.

Revert proven byte-identical by blob hash:

```
FIXED BLOB (before revert):  1649f8ae54f6dc0c44d0a749537a7c606fc680e8
REVERTED BLOB:               807869fab496f06f6e86b668ffa141599ca67ca7
PRE-FIX BLOB AT 68b08ab6:    807869fab496f06f6e86b668ffa141599ca67ca7
RESTORED BLOB:               1649f8ae54f6dc0c44d0a749537a7c606fc680e8   ← MATCH
```

### [A5] The hours derivation

`:200-202` is **not retargeted**. The structure is identical — `actual_duration_minutes ??
<fallback> ?? 0`, then `/ 60`; `const hours = durationMinutes / 60;` is byte-unchanged. The
only edit is the renamed identifier (and its comment), which [A1] compels: leaving
`s.planned_duration_minutes` there would both fail type-check against the renamed
`SessionRow` and leave the banned string in the file. **This is a literal conflict between
[A1] and [A5]'s "byte-unchanged", resolved in favour of the narrowest reading that satisfies
both — rename only, semantics untouched.** Z2-5b's retarget onto the ledger is untouched and
unblocked. Called out for an explicit PM ruling.

### [A6] Existing suites

Both suites that mock the module out are unchanged and still pass:

```
✓ __tests__/lib/services/school-hours-report.test.ts  (7 tests)
✓ __tests__/api/hour-tracking/school-report-pdf.test.ts  (4 tests)
✓ __tests__/api/hour-tracking/school-report.test.ts  (11 tests)
Test Files  3 passed (3)     Tests  22 passed (22)
```

### [A7] Gates

```
( npm run type-check && npm run lint && npm test && npm run build )
GATES_EXIT=0
```

- `tsc --noEmit` — 0
- `eslint --ext .js,.jsx,.ts,.tsx --max-warnings=0 .` — 0
- `Test Files  275 passed (275)` · `Tests  4486 passed (4486)`
- `next build` — `✓ Compiled successfully`, `✓ Generating static pages (156/156)`

Against the PM baseline of **274 files / 4479 tests**: +1 file, +7 tests — exactly this
chunk's new suite. Nothing fell.

`npm run test:db` — **NOT RUN**, real error (Docker daemon down, fifth round running):

```
Connecting to local database...
{"_tag":"Error","error":{"code":"LegacyDbConnectError","message":"failed to connect to postgres: effect/sql/SqlError: PgClient: Failed to connect","suggestion":"Make sure your local IP is allowed in Network Restrictions and Network Bans.\nhttps://supabase.com/dashboard/project/_/database/settings"}}

$ docker info; echo $?
Cannot connect to the Docker daemon at unix:///Users/brentcurtis/.docker/run/docker.sock. Is the docker daemon running?
1
```

This chunk adds no migration, so no pgTAP coverage changed.

### What schools will now see

The per-bucket session drill-down in the school hours report — JSON and PDF — goes from
**always empty** to listing that bucket's sessions, newest first: title, date, consultant
name (or "Sin asignar"), hours, and status (`consumida` / `reservada` / `penalizada` /
`devuelta`, taken from the ledger where an entry exists, otherwise mapped from the session
status). Bucket totals, contract totals and every hours figure are unchanged — those come
from `get_bucket_summary` and never depended on this query. The visible change is additive:
a section that rendered nothing now renders rows. Nothing that was displayed before is
removed or altered.

Two consequences worth naming before this reaches a school:

1. **The per-session `hours` figure is still derived the old way** (`actual_duration_minutes
   ?? scheduled_duration_minutes`), which Z2-5 identified as the wrong source and Z2-5b will
   retarget onto the ledger. Until then, a session's listed hours can disagree with the
   bucket totals above it. This chunk makes that disagreement *visible* for the first time —
   it does not create it.
2. **Only the first facilitator is named.** Co-facilitated sessions will show one consultant.
   Pre-existing at `:195`, untouched.

### Not done / open

- The `bucketError` `continue` at `:139-142` (silent contract omission) — flagged above.
- `SESSION_STATUS_FALLBACK` at `:57-63` maps `aprobada`, `reservada` and `en_curso`, none of
  which are in the `consultor_sessions_status_check` constraint
  (`borrador`, `pendiente_aprobacion`, `programada`, `en_progreso`, `pendiente_informe`,
  `completada`, `cancelada`); `programada` and `pendiente_informe` are absent from the map and
  fall through to `reservada`. Dead entries plus unmapped real ones. Out of scope, untouched.
- Not executed against a live PostgREST — `test:db` cannot connect and production is
  off-limits. The fix rests on the schema record; the double reproduces PostgREST's documented
  `42703`, not an observed one.

---

## Chunk Z2-5b — the retarget onto ledger hours — round r12

### Branch and commits

`feat/zoom-sess`, base `8c350fa7` (r11's head). One commit on top. No migration, no schema
change, no RPC touched.

### What moved

`consultor_sessions.actual_duration_minutes` is named for a measurement nobody takes. Its
only two writes are `pages/api/sessions/index.ts:230` (NULL at creation) and
`pages/api/sessions/[id]/finalize.ts:108` (`actual_duration_minutes ??
scheduled_duration_minutes`). It therefore only ever held the *scheduled* value, for
sessions that reached finalize — and both hour consumers reported it, one of them under
the response key `total_hours_actual`.

Both now read `contract_hours_ledger` through one helper.

### Files, by risk

| File | Risk | What |
|---|---|---|
| `lib/services/billable-hours.ts` (new, 99 lines) | **The whole judgment call** | The single derivation. Status semantics, the no-ledger-row fallback, and the Z7 seam all live here. |
| `pages/api/sessions/reports/analytics.ts` | High — new query on a hot path | Ledger `.in()` added to the existing `Promise.all`; `total_hours_actual` re-derived; `actual_duration_minutes` dropped from the select. |
| `lib/services/school-hours-report.ts` | Medium | Existing ledger sub-query extended with `hours`; two parallel maps collapsed to one row map; `actual_duration_minutes` dropped from the select. |
| `lib/types/consultor-sessions.types.ts` | Low | `@deprecated` block on the column. No behaviour. |
| `__tests__/api/sessions/session-reports-analytics.test.ts` | Medium | Double rebuilt schema-faithful; 5 tests added. |
| `__tests__/lib/services/school-hours-report.test.ts` | Low | Extends r11's double; 4 tests added. |

### Status semantics — the one thing to scrutinise hardest

`executeCancellation` (`lib/services/hour-tracking.ts:471-482`) updates only `status`, the
cancellation fields and the override fields. **It never rewrites `hours`.** A `devuelta`
row therefore still holds the full originally-reserved amount even though those hours went
back to the school. So the two consumers deliberately treat status differently:

| Status | Per-session display (school drill-down) | `total_hours_actual` aggregate |
|---|---|---|
| `reservada` | row's `hours` verbatim | **excluded** — reserved, not consumed |
| `consumida` | row's `hours` verbatim | **counted** |
| `devuelta` | row's `hours` verbatim | **excluded** — counting it would bill returned hours |
| `penalizada` | row's `hours` verbatim | **counted** — the school pays |
| *(no ledger row)* | `scheduled_duration_minutes / 60` | `scheduled_duration_minutes / 60` |

The display is verbatim-by-status because the drill-down renders the status beside the
number; the aggregate has no such column to disambiguate it.

Independent corroboration, not touched by this chunk:
`pages/api/consultant-earnings/[consultant_id].ts:170` already filters
`.in('status', ['consumida', 'penalizada'])` in SQL for the consultant-payment side. Same
two statuses, arrived at separately. It answers a different question (payment, not school
billing) and is outside §11's two named consumers, so it was left alone — but if a future
chunk unifies it, it should call `billableHours` rather than repeat the list.

### The no-ledger-row fallback

Legacy sessions and never-approved sessions have no ledger entry. A naive retarget would
silently drop them to zero — the school report would under-report, and nothing would
error. The fallback to `scheduled_duration_minutes` is behaviour-preserving for exactly
those rows (`actual_duration_minutes` was a copy of that value anyway) while the ledger
path is corrective for the rest. It is asserted in both consumers.

Reviewer's question to ask: this makes the aggregate *larger* than before for tenants with
many un-ledgered sessions, because those sessions used to contribute 0. That is the
intended direction per the PM ruling, but it is a visible number change.

### The Z7 seam

`lib/services/billable-hours.ts:86-98` carries a named `SEAM: Z7-EFFECTIVE-MINUTES` block.
§11's end state is `coalesce(effective_minutes / 60.0, hours)`; `effective_minutes` is
Z7's additive column and **does not exist today**. One `return` changes when it lands;
nothing else in the module does. No migration was added or proposed.

### Test evidence

`__tests__/lib/services/school-hours-report.test.ts` — 7 → **11 tests**:
ledger `hours` beat `actual_duration_minutes` on the same fixture (1.25 vs 1.5); the
sub-query shape is asserted (`session_id, status, is_over_budget, hours`, one `.in()` per
bucket, **2 queries for 2 buckets — no added round trip**); all four statuses verbatim; the
legacy no-row fallback (scheduled 90 → 1.5h, not the 0.5h `actual_duration_minutes` holds);
an `admin_override` row passing through at 1.1h.

`__tests__/api/sessions/session-reports-analytics.test.ts` — 11 → **16 tests**. The double
was table-name-keyed (the exact anti-pattern §6 warns about: same canned rows regardless of
select or filter). It now mirrors the baseline column lists, applies `eq`/`in`/`gte`/`lte`,
and answers an unknown column with PostgREST's `42703`. All 11 pre-existing tests pass
against it unchanged. New: the four-status matrix summing to 5.6h (reservada 3h and
devuelta 4h contributing nothing), the no-row fallback, the override passthrough, the query
shape, and a 500 when the ledger read errors.

### Fail-on-old

Each consumer was reverted to its `8c350fa7` content **alone**, its suite re-run, then
restored and checked by blob hash.

- `lib/services/school-hours-report.ts` → **7 of 11 failed**, including
  `expected { hours: 4, status: 'reservada' } to deeply equal { hours: 1.5, ... }` and
  `expected '…' not to match /actual_duration_minutes/`. Restored:
  `14d24f2873f9588607ef6c75ac42239b447e8427`, byte-identical.
- `pages/api/sessions/reports/analytics.ts` → **5 of 16 failed**, including
  `expected +0 to be 5.6` and `expected [] to have a length of 1`. Restored:
  `3271173f4bf1841310863c7c8f4b807303bfb350`, byte-identical.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` — chain exit **0**.
Unit: **275 files, 4495 tests passed** (PM baseline 275/4486; +9 = 4 + 5 added). Build
compiled successfully.

`npm run test:db` — **ran for the first time in six rounds**; Docker is back up. Exit 0,
`Files=9, Tests=374, Result: PASS`. This chunk adds no migration, so the figure matching
the pre-Docker-outage number is expected, not inherited.

### What this chunk does NOT close

- **`total_hours_actual` keeps its name.** `pages/consultor/sessions/reports.tsx:57`
  declares it; only what feeds it changed. PM-verified that nothing renders it (the only
  hours KPI card is `total_hours_scheduled` at `:541`), so there is no visible label saying
  "actual" over ledger-derived data — but the key is still a lie by name, and Z7 or a later
  chunk should rename it together with the page.
- **`actual_duration_minutes` still exists and `finalize.ts` still writes it.** Deprecated
  in the type only. No column drop, per ruling 6.
- **The two defects r11 logged are untouched** — the `bucketError` `continue` at `:139-142`
  and the `SESSION_STATUS_FALLBACK` mismatch at `:57-63`. Both still awaiting a PM ruling.
- **The other ledger readers were not audited against the helper** —
  `consultant-earnings`, `contracts/[id]/hours/ledger/*`, `admin/sessions/index.tsx`,
  `consultor/sessions/index.tsx`. None reads `actual_duration_minutes` (grep-verified), so
  none carries the defect this chunk fixes, but none routes through `billableHours` either.
- **Not executed against a live PostgREST.** Both doubles reproduce PostgREST's documented
  behaviour; production is off-limits and `test:db` covers RLS, not these queries.

---

## Chunk Z2-5b — round r13 — correction to the r12 text above

**Everything above stays as written; this section corrects it.** r12's no-ledger-row
ruling was wrong for the aggregate, and the r12 text above states that wrong behaviour as
intended. Three lines of logic changed; nothing else r12 shipped moved.

### What was wrong

`billableHours` returned the no-ledger-row fallback **before** the mode check, so
`charged_total` gave an un-ledgered session its full scheduled duration. The module's own
doc defines that mode as "only statuses in `CHARGED_LEDGER_STATUSES` contribute", and it
correctly returns 0 for `reservada` ("the session has not happened. NOT charged"). A
`borrador` session — not even approved — therefore counted for **more** than an approved
one. The less-committed session weighed more.

`pages/api/sessions/reports/analytics.ts` filters sessions by `is_active`, school, date
range and consultant, with **no status filter**, so this was not a legacy-data edge case:
every unapproved session in the range inflated `total_hours_actual`, a money-adjacent KPI.
Before the chunk they contributed 0, because `actual_duration_minutes` is NULL until
finalize.

### The corrected ruling

In `charged_total`, a session with no ledger row contributes **0** — including a legacy
session that was delivered but never linked to a contract. It was not charged through the
ledger, so a ledger-derived KPI must not claim it was. In `per_session_display` the
fallback to `scheduled_duration_minutes` **stands unchanged**: the drill-down renders one
row per session and must show something for a session that is not ledgered yet.

The status table at "Status semantics" above is corrected in its last row only:

| Status | Per-session display (school drill-down) | `total_hours_actual` aggregate |
|---|---|---|
| *(no ledger row)* | `scheduled_duration_minutes / 60` | **0** — no billing record |

The four ledger-status rows are unchanged. The module is now internally consistent: in
`charged_total`, **only a ledger row with a charged status ever contributes**.

### Which r12 claims above this supersedes

- **"The no-ledger-row fallback"** section — its reasoning holds for the drill-down only.
  Its closing note that "this makes the aggregate *larger* than before for tenants with
  many un-ledgered sessions" described the defect. The aggregate is no longer larger on
  that account: un-ledgered sessions contribute 0, as they did before the chunk.
- **"Test evidence"** — the analytics four-status matrix now sums to **4.1h**, not 5.6h
  (the 1.5h from the un-ledgered session is gone). The `no-row fallback` test in that suite
  is now a `borrador`-contributes-0 test asserted end to end through the handler. The
  `school-hours-report` legacy no-row fallback (scheduled 90 → 1.5h) is **unchanged** and
  still asserted — display behaviour did not drift.

### r13 files

| File | What |
|---|---|
| `lib/services/billable-hours.ts` | `!entry` branch made mode-aware; function doc states both behaviours and why they differ. |
| `pages/api/sessions/reports/analytics.ts` | Comment only — it stated the superseded fallback. No logic, no query change. |
| `__tests__/lib/services/billable-hours.test.ts` (new) | Direct 2×2: `{row, no row}` × `{per_session_display, charged_total}`, plus the invariant and the reservada-vs-borrador ordering. |
| `__tests__/api/sessions/session-reports-analytics.test.ts` | Matrix total 5.6 → 4.1; no-row test inverted to a `borrador` session with a non-zero scheduled duration contributing 0. |
| `__tests__/lib/services/school-hours-report.test.ts` | Comment only — names the display half of the split so a future drift to 0 is caught by intent, not just by number. |

No migration, no UI, no rename of `total_hours_actual`. The two defects r11 logged
(`bucketError` `continue`; `SESSION_STATUS_FALLBACK`) remain untouched and unruled.

### r13 verification

Rather than a fail-on-old — the behaviour was deliberately reversed, so the old source is
the thing under repair — a **mutation probe**: the mode-blind `!entry` return was restored,
the new assertions were shown failing, then reverted and checked byte-identical by blob
hash. Figures are in the r13 ledger row.

---

## Chunk Z2-4a — session lifecycle notifications — round r14

### Branch and commits

Branch `feat/zoom-sess`, on top of `24be1034`. One commit; see the ledger row for the SHA.

### The defect this closes

`lib/types/consultor-sessions.types.ts:26,32,33` declared `session_created`,
`session_rescheduled` and `session_cancelled`. None of the three had a config in
`NOTIFICATION_EVENTS` and none had an emitter anywhere in `lib/` or `pages/` — they were
declarations with nothing behind them. **A reschedule notified nobody.** Z2-3b sharpened
this rather than milder: since that chunk a reschedule converges the Zoom meeting to the
new time, so the platform was silently moving a meeting the participants still had at the
old time in their calendars.

### What the three events say, and to whom

All three go to the **deduplicated union of the session's own facilitators and attendees**
and to nobody else — no admins, no consultants-by-school, no growth-community members.
These are people already on the session, so no disclosure boundary moves. An empty union
emits nothing and is not an error (the same rule the reminder cron applies).

| Event | Copy (es-CL) | Importance | Why that importance |
|---|---|---|---|
| `session_created` | "Sesión agendada: …" / "Su sesión quedó agendada para el {fecha} a las {hora}." | `normal` | The session is typically days out and nothing is required of the reader now — this is the confirmation, not a call to act. |
| `session_rescheduled` | "Sesión reprogramada: …" / "Su sesión se movió de {antes} a {después}. Actualice su calendario." | `high` | The reader is holding a now-wrong time. Reading it late means arriving at the wrong moment. |
| `session_cancelled` | "Sesión cancelada: …" / "Su sesión del {fecha} a las {hora} fue cancelada. No necesita conectarse." | `high` | Same shape — without it the reader shows up to a meeting that no longer exists. |

`SessionEventData.session` gained two optional fields, `previous_date` and
`previous_time`. Optional and additive: the interface is shared with the edit-request and
reminder events and was not reshaped.

### Ruling 1, as verified rather than assumed

`session_created` fires at **approval**, not creation. Verified directly:
`pages/api/sessions/index.ts:225` sets `status: 'borrador' as const` unconditionally —
there is no branch on that route that creates a session in any other status. A `borrador`
session is not participant-visible, so a create-time emitter would notify people about
something they cannot see. Approval is also where Z2-1 enqueues Zoom provisioning, so it
is the single moment the session becomes real in both senses. `pages/api/sessions/index.ts`
gained no emitter.

### The changed-fields comparison, and the judgment call inside it

`hasScheduleChanged(previous, next)` compares **values**, not which keys a request
happened to carry:

```
previous.session_date !== next.session_date || previous.start_time !== next.start_time
```

Two consequences a reviewer should weigh:

1. **`end_time` is deliberately excluded.** It changes the duration, not when the reader
   has to be somewhere, and the notification renders only the start — so an end-time-only
   edit would render an identical "before" and "after" ("se movió de X a X"). The prompt's
   wording is "the date or time actually changed", which I read as the start. **This is
   the one place I would most expect a PM to overrule me**: a participant whose session was
   extended by an hour arguably wants to know, and today they are not told. Logged as open
   below rather than decided unilaterally in either direction.

2. **The edit-request route also gates on values, where the prompt said "includes a date
   or time field".** Declared as a deviation below. Value comparison is a strict subset of
   key-presence: it never notifies where key-presence would not, and it differs only in
   the degenerate case where an approved change set carries a date field holding the date
   the session already had — where the notification would announce a move from a time to
   itself. One comparison rule for both reschedule paths also means they cannot drift.

### Files, by risk

| File | Risk | What |
|---|---|---|
| `lib/services/session-lifecycle-notifications.ts` (new) | **High** — the whole derivation | The single emitter: recipient union, schedule formatting, platform-URL build, trigger call, swallow-and-log. Also exports `hasScheduleChanged`. |
| `lib/notificationEvents.ts` | Medium | Three registry configs + two optional fields on `SessionEventData.session`. No existing config touched. |
| `lib/notificationService.ts` | Medium | Three `case` labels added to the existing facilitators+attendees recipient branch. Without this the events resolve to the `default:` branch, which warns and returns **zero** recipients — the wiring is load-bearing, not cosmetic. |
| `pages/api/sessions/[id]/approve.ts` | Low | One call after `enqueueSessionProvision`. |
| `pages/api/sessions/bulk-approve.ts` | Low | One call per approved session, in its own loop beside the Zoom loop. |
| `pages/api/sessions/[id]/index.ts` (PUT) | Medium | One guarded call beside the Zoom enqueues. |
| `pages/api/sessions/edit-requests/[eid].ts` | Medium | One guarded call beside the Zoom sync; post-update row reconstructed as `{...session, ...sessionUpdate}`, the same way `effectiveStatus` does. |
| `pages/api/sessions/[id]/cancel.ts` | Low | **Two** calls — the clause path and the legacy path both reach `cancelada`. |
| `pages/api/sessions/series/[groupId]/cancel.ts` | Low | One call per cancelled session. |
| `__tests__/api/sessions/session-lifecycle-notifications.test.ts` (new) | — | 22 tests, all six routes driven through the real handlers. |

### Placement, and the one case where it is arguable

Every call sits **after the write that makes the change real has committed**, and every
call is wrapped so it cannot throw (the helper owns the `try/catch`; callers add none).

The arguable case: in both reschedule routes the emit is placed **before** the hours sync,
which can return 500. So a request that ends 500 may still have notified. That is
deliberate and follows the reasoning already written into those files for the Zoom
enqueues — the session row genuinely moved, and the 500 tells an admin to go check the
ledger, not that the reschedule was undone. Notifying after the sync would leave
participants holding the old time in exactly the case that most needs the warning.

### Test evidence

`__tests__/api/sessions/session-lifecycle-notifications.test.ts` — 22 tests. Only the
notification service, the Zoom queue and the hour-tracking writes are faked; the registry,
the helper, the recipient union and the comparison are all real, driven through the six
handlers.

- **[A1]** All three resolve through `hasEventConfig`/`getEventConfig` and are compared
  against the fallback config so a missing registration cannot pass.
- **[A2]** `session_rescheduled`'s description asserted to contain all four of the old
  date, old time, new date and new time — a dropped field fails. Plus a degradation test
  that the copy never renders `undefined`/`null`.
- **[A3]** All six routes, each asserting the recipient set through
  `expectDedupedRecipients`: **length 3 first**, then identity, then the both-roles user
  exactly once. The fixture puts one user in *both* the facilitator and attendee lists.
  Length-before-identity matters: a `Set` comparison alone silently dedups a broken
  derivation, which is exactly what the mutation probe exposed.
- **[A4]** The fixture link is a synthetic passcode-bearing Zoom URL. Asserted that the
  payload's `join_url` contains `/meet/session/{id}`, and that the **serialized whole
  payload** contains neither that string nor `pwd=` — not just the field I happen to know
  about. Plus: `join_url` is `null` when the session has no meeting.
- **[A5]** Two cases on the PUT (title-only; date resubmitted unchanged) and one on the
  edit-request route (title-only change set) — each asserting a 200 **and** no emission,
  so an early 4xx cannot be mistaken for correct silence.
- **[A6]** With the trigger rejecting, approve, cancel and the reschedule PUT each still
  return 200, and the assertions check the trigger *was* called and the response body
  still carries the new status — so the guarantee is proven, not merely survived.

### [A7] Mutation probes — two, both bit

1. **Dedup broken** in `collectParticipantIds` (facilitator ids re-appended after the
   `Set`): initially only **1** test failed, because the other routes' assertions used
   `new Set(...)` which silently re-dedups. That finding is itself worth recording — the
   probe caught weak tests, not just weak code. The assertions were strengthened to check
   length first, and the same mutation then failed **7** tests across all six routes.
2. **`hasScheduleChanged` forced to `true`**: **3** tests failed — both [A5] PUT cases and
   the edit-request title-only case.

Both reverted; `lib/services/session-lifecycle-notifications.ts` verified byte-identical by
`git hash-object` (`3f7f9200b08a65382153b3a32a099676009e51f7` before and after each probe),
tree clean.

### Gates at this head

`npm run type-check && npm run lint && npm test && npm run build` — all four green.
Unit: **4525 passed / 277 files** (baseline `24be1034`: 4503 / 276; +22 tests, +1 file,
nothing fell).

`npm run test:db` **could not run — the Docker daemon is down on this host**
(`docker info` fails). This round adds no SQL, no migration and no RLS change, so the
pgTAP suite exercises nothing this chunk touched; the PM-verified `Files=9, Tests=374,
Result: PASS` two commits back is the last known state. **This is unverified by me** and
should be re-run before the phase closes.

### What I did NOT verify

- **`test:db` / pgTAP** — see above. Not run at all.
- **Anything past `triggerNotification`.** The notification service is mocked, so this
  chunk proves the event is emitted with the right type, recipients and payload. It does
  **not** prove a notification row is written, an e-mail renders, or that quiet-hours and
  per-user preferences behave. The three events are new to `getRecipients`, so their
  end-to-end delivery has never actually executed anywhere.
- **The DB-template path.** `triggerNotification` prefers a DB trigger row over the code
  defaults; with no `notification_triggers` row for these three types it uses the registry.
  I did not check production for rows of these types, and I cannot — no production access.
- **Real rendering of the es-CL copy.** The strings are asserted as strings. Nobody has
  seen them in the in-app notification UI or in an e-mail.
- **`buildAbsoluteUrl` origin in production.** Tests run with a `Host` header. The
  standing Z1a ops item — `NEXT_PUBLIC_BASE_URL` must be set in Vercel prod — now has a
  third consumer.
- **Volume.** A series cancel emits one notification per session; a 30-session series
  produces 30 notifications per recipient, sequentially. No batching, no digest, no rate
  limit. Not in scope, but it is the first place this will hurt.

### Not done / open

- **iCal `SEQUENCE` — out of scope by the prompt (chunk Z2-4b).** `lib/utils/session-ical.ts`
  emits no `SEQUENCE`, so an already-imported calendar event never updates on reschedule.
  The participant now gets a notification saying the session moved while their calendar
  entry still shows the old time. **This chunk narrows that gap but does not close it, and
  arguably makes the inconsistency more visible.**
- **Dial-in capture/column/display** — Z2-4c, needs a migration.
- **Dual-zone / Madrid-preview scheduler** — Z2-4c.
- **`end_time`-only edits send no notification** — the judgment call above, offered for a
  PM ruling.
- **No reminder-style send-once ledger.** The reminder cron records sends in
  `session_notifications` and checks before sending; these lifecycle emits do not. Two
  approvals of the same session (not currently reachable — approve rejects a `programada`
  session) would notify twice. Flagged, not fixed: it would need a schema decision.
- Untouched and unruled, as instructed: `bucketError` `continue`
  (`lib/services/school-hours-report.ts:139-142`), the `SESSION_STATUS_FALLBACK` mismatch
  (`:57-63`), and `total_hours_actual`'s now-inaccurate name.

---

## Chunk Z2-4a — round r15 — remediation, and a correction to the r14 text above

**Everything in the r14 section stays as written; this section corrects it where r15
supersedes it.** Two of the three dispatched findings produced source changes. The third
— the one the round was built around — did not reproduce, and that is reported here as a
finding rather than papered over with a speculative fix.

Branch `feat/zoom-sess`, on top of `7315ec85`. No SQL, no migration, no schema or RLS
change. Docker was still down, so `npm run test:db` was not run.

### Finding 2 — `end_time` now counts as a reschedule (supersedes r14)

**The r14 text above says `end_time` is deliberately excluded from `hasScheduleChanged`.
That is now wrong and the exclusion is reversed.** A session moved 09:00–10:30 →
09:00–11:30 re-bills the school through the reschedule RPC (Z2-3a) and extends the Zoom
meeting through `meeting_sync` (Z2-3b). Before this round the ledger changed, Zoom
changed, and the participant who now owed an extra hour was told nothing — the exact
defect this chunk exists to close, surviving in the duration-only case.

`SessionSchedule` and `LifecycleSessionRow` gained `end_time`; `hasScheduleChanged`
compares it. Both callsites were checked rather than assumed: `[id]/index.ts` passes whole
rows (`select('*')` before and after the update, and `end_time` is in `allowedFields` at
`:357-374`), and `edit-requests/[eid].ts` builds `{ ...session, ...sessionUpdate }` where
`sessionUpdate[key] = changes[key].new` — so an approved `end_time` change does reach the
comparison. The edit-request assertion in `[B4]` is the one that proves it on that path.

**The copy changed with it**, because r14's objection to including `end_time` was
correct on its own terms: start-only copy would render an identical before and after.
`session_rescheduled` now renders a **range** on both sides and carries `end_time` /
`previous_end_time` in the payload:

> `Su sesión cambió. Antes: lunes 14 de septiembre, de 09:00 a 10:30. Ahora: lunes 14 de
> septiembre, de 09:00 a 11:30. Actualice su calendario.`

The "Antes: … Ahora: …" shape replaced "se movió de X a Y" because a rendered range
already contains "de … a …", and nesting the two is unreadable in Spanish. Degradation is
unchanged: a missing previous schedule still renders `su horario anterior`, never
`undefined`/`null`, and the r14 assertions covering that still pass untouched.

### Finding 3 — the recipient query no longer swallows its errors

`collectParticipantIds` destructured only `data`, so a failed `session_facilitators` or
`session_attendees` read produced an empty union, and `notifySessionLifecycle` returned
silently under the comment "a session with nobody on it is a normal state". A read error
and an empty session were indistinguishable — the defect class r11 was dispatched to
repair one chunk earlier.

It now returns `{ userIds, facilitatorsError, attendeesError }`. Each failed read is
logged on its own line naming the table; when the union is empty **and** a read failed,
a separate line says `NOT notifying — recipients could not be read. This is a failed
query, not an empty session.` A genuinely empty session logs none of it, which is what
makes the two distinguishable in the logs.

**Ruling made here, stated for the reviewer to challenge: a PARTIAL read still notifies
whoever was found.** If facilitators are unreadable but attendees resolve, the attendees
are notified. Those people are genuinely on the session and genuinely need to know it
moved; withholding from them because the *other* table was unreachable converts a partial
failure into a total one, and the logged lines are what make the shortfall diagnosable.
Invariant 3 is untouched — nothing here reaches the caller, and `[B7]` asserts the route
still returns 200 on every read-failure shape.

### Finding 1 — the unit-gate flake did NOT reproduce; no change was made

The round was dispatched on the finding that
`__tests__/api/sessions/session-lifecycle-notifications.test.ts` destabilises `npm test`,
observed at 2 failures in 8 runs of `7315ec85`. **It did not reproduce here in 35
consecutive full runs of that exact tree**, and no fix was applied, because a fix without
a mechanism is what this round was explicitly told not to deliver.

What was run at `7315ec85`, unmodified (`git rev-parse HEAD` verified before starting):

| Probe | Runs | Result |
|---|---|---|
| `npm test`, serial, warm duration cache | 20 | 20 clean, 4525 / 277 |
| `npm test`, cold cache (`node_modules/.vitest` deleted each time) | 3 | 3 clean |
| Forced random FILE order, 6 distinct permutations of all 277 files | 6 | 6 clean |
| Two `npm test` processes concurrently in the same worktree | 6 | 6 clean |

The forced-order probe is the one that matters for the dispatched hypothesis. The
sequencer orders files by cached duration, so run-to-run order variation is bounded by
that cache; the probe replaced the cache with fabricated durations to impose an exact,
arbitrary permutation, sampling the order space far more aggressively than natural runs
do. **Six unrelated permutations of all 277 files were clean, which is evidence against
file-order-dependent mock leakage** — the proposed mechanism.

`--sequence.shuffle` DOES produce failures (2–4 files per seed), but it shuffles tests
*within* files as well as files, and **the identical seeds produce the identical failures
with this chunk's test file removed** (seeds 11/22/33/44: 4/2/3/4 failed files, same
counts both ways). Those victims — `__tests__/api/admin/delete-user.test.ts`,
`admin/remove-role.test.ts`, `lib/services/__tests__/userAssignments.test.ts`,
`__tests__/api/school/audit-logging.test.ts` — are **pre-existing within-file order
dependencies, unrelated to this chunk**, and are logged below as an open item.

Two candidate mechanisms were checked and ruled out rather than left as speculation:

- **The process-wide rate-limit LRU** (`lib/rateLimit.ts:52`) is genuine shared mutable
  state across all 277 files under `threads: false`, keyed `${ip}:${endpoint}` and
  falling back to `unknown:unknown` for any suite that sends no `x-forwarded-for`. It
  cannot be this: no route under `pages/api/sessions/` uses `withRateLimit`, so this
  chunk's tests add nothing to that cache. It is noted because it is a real trap for a
  future suite.
- **The reported victim signature is inconsistent with mock leakage.** In
  `__tests__/api/pasantias-pdf.test.ts` the guard is
  `if (req.method !== 'GET') { handleMethodNotAllowed(res, ['GET']); return; }`
  (`lib/pasantias/pdf/serve.ts:103-106`). A leaked `lib/api-auth` mock would have to make
  `handleMethodNotAllowed` present-but-inert to yield 200; no test file in the repo stubs
  that export (all 103 `api-auth` mocks either spread `importOriginal` or omit it, and an
  omitted export would throw a `TypeError`, not return 200). That route also uses unique
  synthetic IPs per request, so it cannot be a rate-limit victim either.

**What the PM should do with this.** The two runs that failed are real observations and
this section is not claiming otherwise; it is claiming they were not reproducible from
the committed tree on this machine over 35 attempts across four probe designs. The
attribution experiment's control arms (6 and 5 clean runs) are, at those sample sizes,
equally consistent with a cause outside the tree — concurrent activity in the worktree at
the time, or a stale `node_modules/.vite` transform cache. Re-running the original 8-run
observation at the r15 head is the cheapest next step; a full run costs ~27s.

### Acceptance criteria

`[B2]` ten consecutive clean full runs and `[B9]` the four gates are recorded in the
executor report for this round. Baseline `7315ec85` was 4525 / 277; the head of r15 is
**4533 / 277** — eight tests added (`[B4]` ×2, `[B5]` ×2, `[B7]` ×4), none removed and
none weakened, so `[B3]` holds. `[B6]` was already covered by the two r14 title-only
assertions, one per reschedule route, and both still pass with `end_time` in the
comparison.

`[B8]`'s mutation probe deleted `previous.end_time !== next.end_time` from
`hasScheduleChanged`: `[B4]` and `[B5]` failed on both routes (4 failures, 26 passed) and
nothing else moved. The revert was verified by blob hash
(`b30c143427a825f9631ac2f2a62597eea858dc45`) and a clean tree.

### Where a reviewer should push hardest

1. **The partial-read ruling.** Notifying an incomplete recipient set is a judgement
   call, and the opposite choice is defensible. If a partially-notified reschedule is
   worse than a silently-unnotified one for this product, this is the line to change.
2. **`formatSchedule` degrades `end_time` independently** of date and start. A row with a
   valid start and a malformed end renders as `..., a las 09:00` — start-only, which is
   exactly the shape r14 objected to. It is reachable only from already-bad data, but it
   means the range is best-effort rather than guaranteed.
3. **Finding 1's negative result.** Thirty-five clean runs is evidence, not proof; if the
   PM can reproduce at the r15 head, this section is wrong and the chunk needs another
   round.
4. **The `end_time` reach on the edit-request path.** It is asserted, but through a fake
   client whose `update()` merges the payload — the assertion is that the value reaches
   the comparison, not that Postgres would return that row.

### Known limitations / deferred

- **Pre-existing within-file test-order dependencies** in `admin/delete-user`,
  `admin/remove-role`, `services/userAssignments` and `school/audit-logging`. Exposed by
  `--sequence.shuffle`, present with and without this chunk. Out of scope here; worth a
  ticket, since it means the suite would break if the runner ever randomised order.
- `npm run test:db` not run — Docker daemon down for the whole round.
- No iCal `SEQUENCE` (Z2-4b), no dial-in / dual-zone (Z2-4c), no send-once ledger, no
  digest for series cancels — all still open, all still out of scope.
- The `defaultUrl: '/consultor/sessions'` backlog item from r14 stands unchanged.

---

## Chunk Z2-4b — round r16

**Branch** `feat/zoom-sess`, base `ea2b4556` (Z2-4a sealed). One commit.

**Objective.** Emit RFC 5545 `SEQUENCE` on every .ics the platform produces, so a
rescheduled or cancelled session is recognised by a calendar client as a *revision* of
the event it already holds rather than as a duplicate to be ignored. Since r15 the
platform tells a participant their session moved while their calendar keeps the old
time; `lib/utils/session-ical.ts` emitted no `SEQUENCE`, so every .ics we have ever
produced is, to a client, the first and final revision of its event.

### Files

| File | Risk | Change |
|---|---|---|
| `lib/utils/session-ical.ts` | medium | `created_at`/`updated_at` on `ICalSessionInput`; `deriveSequence()`; `sequence` on `ICalEventData` |
| `pages/api/sessions/series/[groupId]/ical.ts` | medium | explicit projection widened by two columns + pass-through |
| `pages/api/sessions/ical.ts` | low | pass-through (`select('*')` already returned them) |
| `pages/api/sessions/[id]/ical.ts` | low | pass-through (`select('*')` already returned them) |
| `lib/utils/__tests__/session-ical.test.ts` | low | +12 tests |
| `__tests__/api/sessions/ical-sequence.test.ts` | low | new, 10 tests, per-endpoint |

### What was verified about `updated_at`, before any code was written

- `consultor_sessions` declares both columns as
  `timestamp with time zone DEFAULT now() NOT NULL`
  (`supabase/migrations/00000000000000_baseline.sql:7734-7735`). Neither is nullable, so
  a row read from this table always carries both.
- `trg_consultor_sessions_updated_at BEFORE UPDATE ON public.consultor_sessions FOR EACH
  ROW EXECUTE FUNCTION public.set_updated_at()` (`:15376`), and `set_updated_at()` is
  `NEW.updated_at = NOW()` (`:4597-4604`). The bump is unconditional and does not depend
  on any code path remembering to do it.
- The cancel path is a plain `UPDATE … SET status='cancelada'` on that table
  (`pages/api/sessions/[id]/cancel.ts:186-195`), so it fires the same trigger. That is
  what makes a cancellation a revision rather than an ignored tombstone; it is asserted
  in both test files rather than assumed.

### What each endpoint selects

- `pages/api/sessions/ical.ts:60` and `pages/api/sessions/[id]/ical.ts:45` both use
  `select('*', …)` — the two columns were already arriving and only needed mapping.
- `pages/api/sessions/series/[groupId]/ical.ts:41` **projects columns explicitly**. It
  did not select either timestamp, so the projection was widened. Had this been assumed
  rather than checked, that surface would silently have emitted `SEQUENCE:0` forever —
  the exact failure mode ruling 2 warns about.

### Test evidence

Four gates green from the worktree: type-check 0 · lint 0 (`--max-warnings=0`) ·
`npm test` **4555 passed / 278 files** · build 0. Baseline `ea2b4556` was 4533 / 277;
the delta is exactly the 22 tests added here and nothing fell.

Mutation probe: `deriveSequence` pinned to `return 0`. 10 tests failed across both
files, including the two that carry the chunk's whole point — "keeps the UID stable and
raises SEQUENCE across two exports" (`expected 0 to be greater than 0`) and "raises
SEQUENCE when the session is cancelled" (same). Reverted; blob hash
`16d555c6cf6ca9f546965dd825756313906c92ed` before and after, clean tree.

### Where a reviewer should push hardest

1. **`SEQUENCE` = seconds between `created_at` and `updated_at`** is a proxy for a
   revision counter, not a revision counter. Two updates inside the same second produce
   the same sequence, and the second one would be ignored by a client that already
   holds the first. Real reschedules are minutes apart, but a script or a double-submit
   is not. A dedicated `revision` column would not have this property; it needs a
   migration, which this chunk was ruled out of carrying.
2. **The degradation to `SEQUENCE:0` is silent.** `created_at`/`updated_at` are optional
   on `ICalSessionInput` so a malformed pair cannot break an export — but that is also
   what would hide a future endpoint that forgets to pass them. The cross-surface
   consistency test is the only thing standing between that mistake and a shipped
   regression; a fourth .ics surface added later gets no such protection automatically.
3. **No .ics produced by this branch has been opened by a real calendar client.** Not
   Google Calendar, not Apple Calendar, not Outlook. Every assertion here is against the
   serialized text and RFC 5545 as read. Whether these clients actually honour a
   `SEQUENCE` bump on a `METHOD`-less .ics *downloaded* (rather than delivered by iMIP
   e-mail invitation) is unverified, and is the single largest gap in this chunk.
4. **Endpoint tests use a proxy-based Supabase stub**, inherited from
   `ical-attendee-disclosure.test.ts`. It returns the same rows for any query shape, so
   the series test proves the handler *maps* `created_at`/`updated_at` — it cannot prove
   the widened `select()` string is accepted by PostgREST. That is a build-time-untested
   string.

### Known limitations / deferred

- `npm run test:db` not run — the Docker daemon is still down (fourth consecutive
  round). This chunk adds no migration and no SQL, so no RLS surface changed.
- **`METHOD:REQUEST` / iMIP is out of scope and may be required.** `SEQUENCE` is
  necessary for a client to treat an export as a revision; for some clients it is not
  sufficient without an e-mailed invitation carrying `METHOD:REQUEST`. Flagged, not
  built — see NOT DONE in the round report.
- Sub-second updates floor to 0 (asserted). `updated_at` earlier than `created_at`
  clamps to 0 rather than going negative (asserted).
- Untouched, still open: dial-in / dual-zone (Z2-4c), the send-once notification ledger,
  series-cancel batching, the `defaultUrl` backlog item, `bucketError` `continue`,
  `SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name, and the four suites with
  pre-existing within-file order dependencies found in r15.

---

## Chunk Z2-4c — round r17

**Branch** `feat/zoom-sess`, base `3685644c` (chunk Z2-4b sealed). One commit.

### Objective and scope

§15's dual-zone requirement: *"dual-zone (`hora Chile` inputs + Madrid preview) wiring"*.
Sessions are scheduled by people in Chile and delivered in part from Spain; every stored
time is Chile time and neither scheduling form said so. This chunk changes what two forms
**show**. Nothing stored, submitted, sent or exported changed timezone.

Carried over from Z2-4b: `ICalSessionInput.created_at`/`updated_at` were optional, which
r16 itself flagged — a future .ics surface that forgot them compiled clean and silently
emitted `SEQUENCE:0`, reintroducing the exact bug r16 removed. They are now
required-but-nullable.

**Out of scope, untouched:** dial-in (Z2-4d), `METHOD`/iMIP and the subscribable-feed gap,
any change to stored data / API payloads / notifications / .ics timezones, and all the
standing unruled items.

### Files by risk

| Risk | File | Why |
|---|---|---|
| Medium | `lib/utils/session-ical.ts` | type tightening on a shipped export; `deriveSequence` logic unchanged |
| Medium | `pages/api/sessions/ical.ts`, `series/[groupId]/ical.ts`, `[id]/ical.ts` | three callsites `\|\| undefined` → `?? null` |
| Low | `lib/utils/session-timezone.ts` | one added exported helper, `formatSessionRangeForConsultant` |
| Low | `pages/admin/sessions/create.tsx`, `components/sessions/EditRequestModal.tsx` | two labels + one derived read-only `<p>` each |
| Low | four test files (two new) | evidence |

### The two DST fixtures, and why

`2027-01-15` and `2027-07-15`, both with Chile 09:00–10:30.

- **January** — Chile on summer time (UTC−3), Spain on winter time (UTC+1) → **+4h**,
  `13:00 a 14:30 (hora España)`.
- **July** — Chile on winter time (UTC−4), Spain on summer time (UTC+2) → **+6h**,
  `15:00 a 16:30 (hora España)`.

Chosen because the two hemispheres shift in opposite directions, so the offset is not a
constant and the two expected strings are mutually exclusive: **no fixed offset can
satisfy both.** A test asserts that directly (`the two fixtures above disagree`). Dates are
in 2027 so they sit in the future relative to the form's `min` attribute rather than
relying on jsdom ignoring it. Both dates are far from a transition boundary — this suite
does not probe the changeover weekends themselves.

### Evidence

Five gates green at the commit: type-check 0 · lint 0 (`--max-warnings=0`) ·
**4579 passed / 280 files** (baseline 4555/278; +24 tests, +2 files, none fell) ·
build 0 · `test:db` **Files=9, Tests=374, Result: PASS** — byte-identical to the PM's
baseline, as expected for a round with no SQL.

Mutation probe: replacing `CONSULTANT_TIMEZONE` with `SESSION_TIMEZONE` in
`formatSessionTimeForConsultant` (a zero-offset stub) failed **9 tests across all three
new/extended suites**, including both DST fixtures collapsing to `09:00 a 10:30 (hora
España)`. Reverted; `git hash-object lib/utils/session-timezone.ts` returns
`c2177b9aaf63233b71f4276e7ba217390279479b` before and after.

### Scrutinise hardest

1. **The `substring(0, 5)` in `formatSessionRangeForConsultant`.** The range is built by
   slicing the time out of `formatSessionTimeForConsultant`'s formatted string rather than
   by re-deriving it. That honours the one-module ruling and cannot drift from the single
   conversion — but it is coupled to that function's exact `"HH:MM (hora España)"` output
   shape. Change the format and the range silently loses its label. Asserted by value, not
   by construction.
2. **`?? null` at the three .ics callsites is a real behaviour change at the boundary, not
   just a type change.** `|| undefined` also converted the empty string to `undefined`;
   `?? null` passes `''` through. `deriveSequence` treats both identically (`Date.parse('')`
   is `NaN` → 0), and the r16 `empty strings` case asserts it — but the reasoning is worth
   checking rather than taking from me.
3. **The single-module guard strips comments before scanning.** Three unrelated files
   legitimately mention `Europe/Madrid` in prose (`lib/pasantias/pdf/format.ts` and two
   hour-tracking suites explaining the three-TZ matrix). The guard would have failed on
   them, so it now reads code only. A regex comment-stripper is approximate — a
   `Europe/Madrid` inside a string containing `*/` would slip past it.
4. **`EditRequestModal`'s preview tracks edited state, and the test that proves it is the
   date-change one.** The other assertions would also pass against stored values, since
   the modal seeds its state from the session. Only the fixture where the proposed date
   crosses the hemisphere divergence distinguishes the two.
5. **`Partial<ICalSessionInput>` in the r16 degrade suite.** The `both timestamps missing`
   case needs a shape the interface now forbids, so the fixture is widened to `Partial` to
   keep `delete` legal. Every r16 assertion is unchanged in value; the type of one local
   is not. A reviewer should confirm this did not weaken what that suite proves.

### Not verified

- **No browser, no real device, no visual check.** The previews were never rendered in a
  browser at any width. The prompt requires the result to stay usable on low-end school
  hardware and small screens; what I can say is that each preview is a single `<p>` of body
  text in normal flow below the fields, with no fixed width, no grid placement and no
  media query — but "it does not break the layout at 320px" is asserted by construction,
  not observed.
- **No screen-reader check.** The Chile marker is inside the `<label>` text, so it is read
  with the field; the Spain preview is a sibling `<p>` with no `aria-describedby` linking
  it to the inputs. That is a defensible omission for a derived hint, not a verified one.
- Nothing about the DST changeover weekends themselves, in either hemisphere.

### Looked wrong, out of scope

- `EditRequestModal`'s diff preview reads `(session as any)[field]` (line ~185) to pull the
  old value. It works, and the `any` predates this chunk, but it is the one place in that
  file the narrowed `Pick<...>` prop type buys nothing.
- `pages/admin/sessions/create.tsx` computes `min={new Date().toISOString()...}` inline in
  the date input, so the floor is UTC "today", not Chile today. For a few hours each day
  those disagree. Unrelated to this chunk; not touched.
- The `create.tsx` suite emits `act(...)` warnings from mount effects, inherited from the
  existing `create-zoom-managed` suite's scaffolding. Pre-existing, not introduced here.

---

## Chunk Z2-4d — round r19

**Branch** `feat/zoom-sess`, base `f92c2bcb` (r18 committed nothing). One commit on top.

### What r18 found — carried forward, because r18 wrote no code

Round r18 stopped at design time with `STATUS: FINDINGS` and committed nothing, so its
two findings survive only here and in the ledger. The PM verified both against the code
before ruling.

**Finding 1 — dial-in numbers were ALREADY persisted, unnamed.** `lib/zoom/client.ts:264`
does `JSON.parse(raw) as T` with no field whitelist; `ZoomMeetingSettings` carries
`[key: string]: unknown`; `mapMeeting` does `settings: raw.settings ?? {}`, a whole-object
passthrough; and the provisioner writes `effective_settings: created.settings` verbatim
(`meeting-provision.ts:2323`). A tenant with an audio plan has therefore been writing its
dial-in set into `zoom_internal.zoom_meetings.effective_settings` all along. What was
missing was a NAME, not the data.

**Finding 2 — the provisioner does not write the row; two SECURITY DEFINER RPCs do.**
`zoom_internal.recover_provisioned_meeting` and `zoom_internal.adopt_checkpoint_meeting`,
both 6-argument. A 7th parameter is a NEW function in Postgres, so it needs either a
`DROP` (RED-tier forbidden by `CLAUDE.md`) or a defaulted overload — and an overload would
make `supabase/tests/002-zoom-internal-isolation.sql`'s six POSITIONAL calls ambiguous
(42725) while its signature-based grant asserts kept passing against a stale function that
silently wrote NULL forever. A green gate proving nothing.

### The ruling implemented (Option A)

Add the column; derive it INSIDE the two existing RPCs at their unchanged 6-argument
signature via `CREATE OR REPLACE`. The argument that makes a derived column safe here is
that `effective_settings` has exactly TWO writers in the codebase, and both are the
`UPDATE … SET` inside those two functions — so a column set in the SAME statement cannot
drift from its source. That property ends the moment a third writer appears, which is why
the column `COMMENT` says so in capitals.

### Exact DDL

```sql
ALTER TABLE zoom_internal.zoom_meetings
  ADD COLUMN IF NOT EXISTS dial_in_numbers jsonb;

COMMENT ON COLUMN zoom_internal.zoom_meetings.dial_in_numbers IS '…derived from
effective_settings -> ''global_dial_in_numbers'' inside the two provisioning RPCs… ANY
FUTURE WRITER OF effective_settings MUST SET THIS COLUMN TOO…';
```

plus `CREATE OR REPLACE FUNCTION` for both RPCs at the identical signature
`(uuid, bigint, text, text, jsonb, uuid)`, each gaining one line:

```sql
           dial_in_numbers = p_effective_settings -> 'global_dial_in_numbers',
```

No `DROP`, no overload, no signature change, no RLS change. The trailing `REVOKE`/`GRANT`
pair is re-asserted for the two amended signatures only — deliberately NOT the ancestor
migration's blanket `REVOKE ALL ON ALL FUNCTIONS IN SCHEMA zoom_internal`, which here would
strip every other RPC's grants.

### Diff of each `CREATE OR REPLACE` body against the original

Mechanically diffed against `20260731120000_zoom_provision_rpcs.sql`:

```
--- orig/recover_provisioned_meeting        --- orig/adopt_checkpoint_meeting
+++ new/recover_provisioned_meeting         +++ new/adopt_checkpoint_meeting
            join_url = p_join_url,                      join_url = p_join_url,
            effective_settings = …,                     effective_settings = …,
+           dial_in_numbers = p_effective…    +          dial_in_numbers = p_effective…
            status = 'provisioned',                     status = 'provisioned',
```

One added line each; every other byte of both bodies, including `SECURITY DEFINER` and
`SET search_path = ''`, is unchanged.

### How the from-scratch replay was proved

`npx supabase db reset` (drops and recreates the local database, then replays all 13
migrations in order) — run three times: once to establish the baseline, once for the
mutation probe, once after the revert. The log line
`Applying migration 20260806120000_zoom_dial_in_numbers.sql...` appears in each, and
`npm run test:db` is green after the first and third.

Note for the PM's post-merge checklist: this is a LOCAL proof only. The production schema
still needs the column and both function replacements applied by Brent, and verified with
read-only queries afterwards (the Z1b lesson).

### The wire shape is DOCUMENTATION-BASED — read this before approving

**No real Zoom tenant has ever returned dial-in numbers to this code.** CI runs
`ZOOM_MODE=mock`, so `lib/zoom/fake.ts` is the only producer any assertion here has seen,
and a fake cannot confirm a shape it was told. `settings.global_dial_in_numbers` with
`country`/`country_name`/`city`/`number`/`type` comes from Zoom's API documentation. CI
cannot retire this risk; only a staging run against a real audio-plan tenant can. It is
recorded under NOT DONE and carried in the `ZoomDialInNumber` doc comment.

### Files

| File | Risk | What changed |
|---|---|---|
| `supabase/migrations/20260806120000_zoom_dial_in_numbers.sql` | **high** | new: column, comment, both RPCs amended in place |
| `supabase/tests/002-zoom-internal-isolation.sql` | **high** | +15 asserts: column shape/denial, signature identity, no-overload, projection boundary, dial-in capture on both RPC paths |
| `lib/zoom/api.ts` | medium | `ZoomDialInNumber`; named in `ZoomMeetingSettings`; `dialInNumbers` on `ZoomMeeting` via `mapMeeting` (array-guarded); create-check header documents the field as deliberately optional |
| `lib/zoom/fake.ts` | medium | synthetic dial-in set by default + `setDialInNumbers(null)` to model a no-audio-plan tenant |
| `__tests__/lib/zoom/jobs/provisionHarness.ts` | medium | the double mirrors the SQL derivation (second implementation on purpose) |
| `__tests__/lib/zoom/jobs/meeting-provision.test.ts` | low | 4 tests: both RPC paths × audio plan / no audio plan, read back off the row |
| `__tests__/lib/zoom/fake.test.ts` | low | 6 tests: fake fidelity, `mapMeeting` guard, create-check optionality and unchanged rejections |

### Mutation probe

Deleted the `dial_in_numbers = …` line from `adopt_checkpoint_meeting` ONLY, replayed from
scratch, and got exactly one failure — the adoption assert — while the recovery capture
stayed green, proving the two paths are distinguished:

```
# Failed test 90: "adoption captures global_dial_in_numbers into dial_in_numbers"
#         have: NULL
#         want: [{"city": "Valparaíso", … "number": "+56 32 5555 0101", …}]
# Looks like you failed 1 test of 113
```

Reverted; `git hash-object` returns `47ad349c505e27a264751c4f778f5a225a2518af`, identical
to the pre-probe hash.

### Gates

`npm run type-check` 0 · `npm run lint` 0 (`--max-warnings=0`) · `npm test` **4589 passed /
280 files** (was 4579) · `npm run build` 0 · `npm run test:db` **Files=9, Tests=389, PASS**
(was 374).

### What a reviewer should scrutinise hardest

1. **The 6-argument identity assert.** My first version used
   `pg_get_function_identity_arguments`, which on this Postgres returns parameter NAMES
   too, and it failed. It now uses `oidvectortypes(p.proargtypes)`. Check that this really
   is the type list and would still catch a 7th parameter — it is the assert standing
   between this round and finding 2's failure mode.
2. **`dial_in_numbers` is OPTIONAL on `StoredMeeting`** in the test harness, to avoid
   editing a dozen unrelated seed literals. Rows the harness itself mints always set it;
   nothing else is asserted on. Judge whether that weakens the F4 `toBeNull()` assertions.
3. **The array guard in `mapMeeting`.** `settings` arrives off an unvalidated `JSON.parse`,
   so a non-array under this key is reachable from the wire; the guard yields `null`
   instead of a lying type. But `effective_settings` — and therefore the COLUMN — still
   stores whatever Zoom sent, guard or no guard. The column can hold a non-array.
4. **The default-on fake.** Every existing test now provisions with dial-in numbers in
   `effective_settings`. Nothing asserted on `effective_settings` broke, but the reviewer
   should confirm no suite was silently made less specific by the extra key.
5. **`meeting-provision.ts` is untouched** — per the ruling. Confirm the diff really
   contains no edit to it.

### Known limitations / deferred

- No UI, no join-endpoint payload, no `session_meetings_public` column — Z2-4e, and the
  projection boundary is now asserted at schema level so it cannot be crossed quietly.
- The wire shape is unvalidated against a real tenant (see above).
- Rows provisioned BEFORE this migration keep `dial_in_numbers` NULL while their
  `effective_settings` may hold the numbers. No backfill was in scope; the column is
  nullable and a backfill would be a separate, additive round.

---

## Chunk Z2-4e — round r20

**Branch** `feat/zoom-sess`, base `978e68a1` (Z2-4d sealed). **This is the last build
chunk of phase Z2.**

Z2-4d gave `zoom_internal.zoom_meetings` a named `dial_in_numbers` column and proved
both provisioning paths populate it. Nothing read it. This chunk carries it to a human,
under PM ruling 1 (the join endpoint may return it, nothing else may) and ruling 2
(render it on `/meet/session/[id]`).

### Files

| File | What |
|---|---|
| `supabase/migrations/20260807120000_backfill_zoom_dial_in_numbers.sql` | new; one guarded `UPDATE`, DML only |
| `supabase/tests/002-zoom-internal-isolation.sql` | new section F, `plan(113)` → `plan(117)` |
| `lib/utils/meeting-dial-in.ts` | new; the whitelist + the response type |
| `pages/api/meet/session/[id]/join.ts` | widened read (`:167`) and the `mode: 'link'` response only |
| `components/sessions/MeetingDialIn.tsx` | new; the rendered block |
| `components/sessions/JoinMeetingButton.tsx` | holds the block in state, renders it |
| `pages/meet/session/[id].tsx` | header comment only — no code change |
| `__tests__/api/meet/session-join.test.ts` | G2/G3/G4 |
| `__tests__/components/sessions/JoinMeetingButton.test.tsx` | G5 |
| `__tests__/lib/zoom/dial-in-forbidden-surfaces.test.ts` | new; G6 |

### The exact response-shape change

`POST /api/meet/session/[id]/join`, outcome 7 only:

```
BEFORE  { mode: 'link', join_url, role }
AFTER   { mode: 'link', join_url, role, dial_in? }

dial_in = {
  numbers: [{ number, country_name?, city?, type? }, …],   // ≥ 1, each with a number
  meeting_number: string,                                   // digits, never a JSON number
  passcode?: string,                                        // omitted when the meeting has none
}
```

The key is **absent**, never `null` and never `{}`, whenever `buildJoinDialIn()` returns
`null` — no audio plan (the common case), no entry carrying a usable `number`, or no
meeting number. Half a dial-in is a phone call that reaches a prompt the caller cannot
answer, so the block is withheld whole rather than shown partial.

`numbers` is whitelisted to four fields. `dial_in_numbers` holds Zoom's array VERBATIM
and `lib/zoom/client.ts` parses the wire with no field whitelist, so whatever Zoom adds
tomorrow is already in that column today; spreading it would publish fields nobody has
read. The fixture in `session-join.test.ts` carries a deliberate unknown passenger
(`quality`) and asserts it does not survive.

### How I proved refusals are unchanged [G3]

Not by comparing against literals. Each refusal — 404 other-school, both 403s, 410 over
a cancelled projection, 410 over an ended one, 500 on a projection read failure — is
produced **twice against the same scenario**: once with a meeting row that has no audio
plan, once with the dial-in row. The two responses are compared to **each other**, status
and raw body. The property asserted is that a refused caller cannot tell whether this
meeting has dial-in data, let alone read it. The 503 kill switch is asserted separately
with `tablesRead` empty, since it answers before a client is built.

The pre-existing `[A7]` assertions (`Object.keys(data)` is exactly
`['mode','join_url','role']`) were **not edited** and still pass: the shared
`provisionedMeeting` fixture has no audio plan, so the widening is invisible to them.
That is deliberate — an untouched baseline is worth more than an updated one.

### The migration

```sql
UPDATE zoom_internal.zoom_meetings
   SET dial_in_numbers = effective_settings -> 'global_dial_in_numbers'
 WHERE dial_in_numbers IS NULL
   AND effective_settings ? 'global_dial_in_numbers';
```

No DDL, no DROP, no grant or RLS change, no new function. `dial_in_numbers IS NULL` is
the guard that makes it idempotent and makes it incapable of overwriting a correction.

**Scrutinise this:** on a fresh replay the statement matches **zero rows**, because
`zoom_meetings` is empty at migration time. So the replay proves only that it parses and
applies. The three outcomes are asserted in pgTAP section F against seeded fixtures — by
a **hand-copy of the same UPDATE**. That is the device Z2-4d used for the two SECURITY
DEFINER bodies and it carries the same weakness: nothing mechanically ties the copy to
the migration. Diff them; do not trust them.

### The §2 product tension, in my own words

The plan asks for dial-in as a **school internet outage** fallback. What ships here does
not survive that scenario. The numbers render on `/meet/session/[id]`, which is a web
page, fetched over the internet, after a click. A participant whose internet is down
cannot load it. For the number to be useful during an outage it would have to have
reached them *before* it — and the two channels that do that, a notification payload and
an .ics file, are exactly the two ruling 1 forbids for these values, for good reasons
that have not changed.

So this chunk is correct against ruling 2 and still leaves the motivating scenario open.
The honest reading is that this surface serves a **different, real** case: a participant
whose *audio or video* is failing, or whose device cannot run the client, while the page
still loads. Whether the outage case needs a channel of its own — a printed card, an
SMS, a school-office poster, something outside this system entirely — is Brent's call.
I did not invent one.

### That no real tenant has ever returned these numbers

Stated plainly, because both the shape and the rendering rest on it: **no real Zoom
tenant has ever returned dial-in numbers to this code.** CI runs `ZOOM_MODE=mock`; the
fake in `lib/zoom/fake.ts` is the only producer, and a fake cannot confirm a wire shape
it was told. `ZoomDialInNumber` comes from Zoom's documentation. Everything downstream —
the whitelist's four field names, the assumption that `number` is a dialable string, the
assumption that `global_dial_in_numbers` is an array of objects, the labels the page
renders — inherits that. The whitelist degrades safely (an entry without a string
`number` is dropped, an unknown field is not forwarded), but "degrades safely" is not
"verified". **Validate against a real audio-plan tenant in staging before this reaches a
school.**

### What a reviewer should scrutinise hardest

1. **The hand-copied UPDATE in pgTAP section F.** See above. It is the only proof the
   backfill does what its three criteria say, and it is a copy.
2. **`dial_in` renders in `JoinMeetingButton`, not in `pages/meet/session/[id].tsx`.**
   S3 names the page; the page's only change is its header comment. My reasoning: these
   are the same credentials `join_url` is, and the page's `getServerSideProps`
   deliberately never touches `zoom_internal` — putting them in props would put them in
   the served HTML before anyone clicked, which is the leak Z1a closed. Ruling 2 itself
   cites `JoinMeetingButton` at `:31`/`:83`. Judge whether that reading is right.
3. **The block survives a successful join, and is cleared before every new attempt.**
   It stays because the link opens in a new tab and this tab is where the number can be
   read back from. It is cleared at the top of `handleJoin` so a block from an earlier
   answer cannot outlive the decision that produced it (asserted: a 410 on the second
   click removes it). Judge whether "survives the join" is the right default.
4. **No cap and no ordering on `numbers`.** A tenant with a large multi-country audio
   plan would render a long list, and Chile's own number is not necessarily first.
   Ordering is a product decision I was not given, so I passed Zoom's array through in
   its own order. This is the most likely thing to need a follow-up.
5. **[G6] passes objects carrying fields their types do not declare.** Both the .ics
   builder and the notification emitter are handed the session row WITH the dial-in
   columns attached, exactly as an over-broad `select` would deliver them, and asserted
   to emit none of them. Well-typed inputs would have proved only that TypeScript
   compiled. Judge whether the cast is honest or whether it tests a scenario that cannot
   occur.

### Known limitations / deferred

- **The outage scenario is not solved.** See §2 above. Open, and Brent's.
- **The wire shape is unvalidated against a real tenant.** See above. This is now
  load-bearing for a rendered surface, not just for a column.
- **Admin and consultor session-detail pages carry no dial-in** — out of scope per
  ruling 2. If the plan wants it there, it is a new round.
- **No ordering, no cap, no country preference** on the rendered number list.
- **No e2e coverage.** The dial-in path is asserted at the handler and at the component;
  `tests/e2e/zoom-join-authz.spec.ts` was not extended, because the seeded synthetic
  tenant provisions through the fake with no audio plan by default and giving it one
  would change what every other assertion in that spec runs against.
- **Nothing tells a participant the number exists before they click join.** The block
  only appears after a successful join response.
- The standing unruled items are untouched: `bucketError` `continue`,
  `SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name, the notification `defaultUrl`
  item, the send-once notification ledger, series-cancel batching, `create.tsx`'s
  UTC-vs-Chile date `min`, and the four suites with pre-existing within-file order
  dependencies.

---

# Sol remediation — round r21 (items 1 and 2)

Branch `feat/zoom-sess`, forked at `62da7925`. Sol items **1 and 2 only**; the other
ten are separate rounds and nothing here touches them.

## Item 1 — the `DROP` is gone, and no schema change replaced it

`supabase/migrations/20260805120000_reschedule_hours_rpc.sql` lost its entire
constraint block. The migration now performs **no DDL on any pre-existing object**: it
creates one function and grants EXECUTE on it.

The revision row moved to Sol's primary remedy — an already-allowed `action` plus a
typed discriminator. The exact change inside `reschedule_session_hours`:

```sql
        INSERT INTO public.session_activity_log (session_id, user_id, action, details)
        VALUES (
            p_session_id,
            p_actor_id,
            'edited',                                   -- was: 'hours_revised'
            jsonb_build_object(
                'event_type',        'hours_revised',   -- new: the discriminator
                'ledger_entry_id',   v_ledger_id,
                …unchanged…
            )
        );
```

**Replay proof — done by resetting, not by reasoning.** `npx supabase db reset`
replayed every migration from the baseline, then the allowlist was read straight out of
the catalog:

```
CHECK ((action = ANY (ARRAY['created'::text, 'viewed'::text, 'edited'::text,
 'status_changed'::text, 'materials_uploaded'::text, 'materials_deleted'::text,
 'report_filed'::text, 'report_updated'::text, 'attendance_recorded'::text,
 'attendance_updated'::text, 'communication_added'::text, 'edit_requested'::text,
 'edit_approved'::text, 'edit_rejected'::text, 'cancelled'::text, 'finalized'::text])))
```

Sixteen values, character-identical to the baseline at
`00000000000000_baseline.sql:10793`. No `hours_revised`. `013-session-reschedule-atomic.sql`
[B2] pins both facts from the catalog rather than from the migration text, so a future
widening fails the suite.

`grep -rin drop supabase/migrations/20260805120000*.sql` and the same over the new
migration return only comment lines that mention the word.

**The divergence the prompt named, and what it means in practice.** A developer's
existing local database still carries the widened 17-value constraint and the old
function body; a fresh replay produces 16 and the new body. Both accept everything this
round writes, and `npm run test:db` resets before it runs, so CI and any real gate run
sees the replayed state. Production has never had either version.

## Item 2 — one transactional RPC, and the atomicity proof

`supabase/migrations/20260808120000_session_reschedule_atomic.sql` adds
`public.apply_session_reschedule(p_session_id uuid, p_actor_id uuid, p_updates jsonb,
p_if_updated_at timestamptz DEFAULT NULL) RETURNS jsonb`, `SECURITY DEFINER`,
`SET search_path = ''`, REVOKE-then-narrow-GRANT to `service_role` by signature.

In one transaction it: validates the caller's column map against an allowlist and fails
closed; locks the session `FOR UPDATE`; applies the optimistic guard (returning
`{conflict:true,current}` having written nothing); applies the update through
`jsonb_populate_record`, so the table's own column types do the coercion; and, for a
duration-relevant change on a `programada` row, calls the **unchanged**
`reschedule_session_hours` for the ledger hours, the planned snapshot, the ledger date,
the over-budget state and the revision row.

`reschedule_session_hours` is left in place — not dropped, not overloaded, no signature
change — and is still exercised on its own by suite 012. Calling it rather than
reimplementing it is what keeps the hours arithmetic a single implementation.

**ATOMICITY PROOF ([B4]).** A `BEFORE INSERT` trigger rejects the revision row, which
the inner function writes last — precisely the window that used to leave the session
moved and the ledger stale, because the route's `.update()` had already committed on its
own connection. Both tables are then compared against their pre-call state:

```
ok 14 - B4: a ledger failure propagates out of the RPC instead of being swallowed
ok 15 - B4: THE SESSION DID NOT MOVE — the source update rolled back with the ledger
ok 16 - B4: the ledger row is byte-identical to its pre-call state
ok 17 - B4: no revision row survived the rollback
```

**MUTATION PROBE.** The re-raise was replaced with a swallow — `v_hours :=
jsonb_build_object('applied', false)` — i.e. the source update commits independently of
the ledger write. Replayed and re-run:

```
# Failed test 14: "B4: a ledger failure propagates out of the RPC instead of being swallowed"
#       caught: no exception
# Failed test 15: "B4: THE SESSION DID NOT MOVE — the source update rolled back with the ledger"
#         have: 2026-09-10 09:00:00-11:00:00 / 120
#         want: 2026-09-10 09:00:00-10:30:00 / 90
# Failed test 30: "B9: a 0 h recomputation raises with the inner function's own SQLSTATE"
# Failed test 31: "B9: the session kept its old times — the refusal rolled the update back"
Files=10, Tests=427, Result: FAIL
```

`have: … 11:00:00 / 120` is Sol's defect, reproduced on demand: the session at the new
time, the ledger at the old duration. Reverted; blob hash `1cf004006af1dbc8ea…`
identical before and after; tree clean.

## Behaviour ordering that MOVED — the PM must re-rule it

On **both** routes the `meeting_sync` enqueue and the `session_rescheduled` notification
used to run **before** the hours sync. That placement was ruled in earlier rounds with an
explicit reason: the hours sync could return 500 on a path where the times had already
moved, so an enqueue after it would leave Zoom holding the old time.

**That reason no longer exists.** The hours work is now inside the same transaction as
the update, so a failed reconciliation means the times did not move either. Both calls
now run **after** the whole transaction commits. `session-reschedule-zoom-sync.test.ts`
carries the inverted case explicitly: the test formerly named "STILL enqueues when the
hours RPC fails after the times moved" now asserts the opposite and checks the row is
untouched.

Two consequences of the same change:

- **The 500 copy had to change.** "La sesión se actualizó, pero no se pudieron
  recalcular las horas…" is now false. Both routes say the session was **not** modified,
  and the tests assert the row really is untouched so the copy is not a claim the code
  cannot back.
- **The edit-request route's `scheduled_duration_minutes: null` workaround is gone.** It
  existed because `{...session, ...sessionUpdate}` cannot recompute a STORED generated
  column; the RPC's `RETURNING to_jsonb(t)` returns the real recomputed row.

## What moved from the route into the database

- **The optimistic guard.** The admin PUT's `.eq('updated_at', if_updated_at)` is now a
  comparison under `FOR UPDATE` inside the RPC — strictly stronger, and on the same side
  of the transaction boundary as the ledger. The non-reschedule branch keeps the
  PostgREST guard it always had.
- **The `programada` ledger gate.** The routes used to decide whether the ledger should
  follow. They no longer do — the caller is not the security boundary. The two unit
  assertions that used to say "does NOT call the RPC once the session is under way" now
  say the RPC is still called and the gate is the RPC's; the behaviour they protected (no
  ledger write, session edit still allowed, 200) is asserted in 013 [B7].

## Deliberately NOT routed through the RPC

A PUT or an approval that touches nothing duration-relevant keeps its plain
`.update()`. It has no ledger consequence, so wrapping it buys no atomicity, and doing it
anyway would have rewritten every non-reschedule write path and the mocks of some
thirteen suites. Both **reschedule** flows converge on the one RPC, which is the finding.

## Evidence

- type-check 0 · lint 0 · **4622 passed / 281 files** (was 4617) · build 0
- `npm run test:db` — **Files=10, Tests=427** (was 9 / 393), Result: PASS
- New: `supabase/tests/013-session-reschedule-atomic.sql` (32 assertions).
  `012` gained 2 (36 → 38) for the new revision-row shape.

## Known limitations

- **The atomicity proof is a local Postgres, not production.** Nothing in this round has
  been applied to the production database, and the two migrations join the four already
  unapplied there.
- **The column allowlist is a hand-maintained copy** of the admin PUT's `allowedFields`
  ∪ `STRUCTURAL_FIELDS`. Nothing forces the three to stay in step; a field added to the
  route and not to the migration fails closed (the request 500s) rather than silently
  writing, which is the safe direction, but it is still a copy.
- **The edit-request route passes no `if_updated_at`.** Its stale-value guard is still
  the JS old-value comparison it always had, run before the RPC. Closing that race by
  passing `session.updated_at` would have been free, and was left alone as out of scope.
- `'edit_approval_blocked'` at `pages/api/sessions/edit-requests/[eid].ts:195` is **not
  in the action allowlist** and would violate the CHECK if that branch ever fired. It
  predates this round and is untouched.

---

# Sol remediation — round r22 (item 3)

**Branch** `feat/zoom-sess`, base `374cdbac`. Scope: **Sol item 3 only** — the fan-out in
`public.get_bucket_summary`. The other ten items are separate rounds and were not touched.

## The bug

`get_bucket_summary` (`supabase/migrations/00000000000000_baseline.sql:2781-2820`) is
**live in production** and predates Zoom entirely; Z2 only found it, because the reschedule
RPC pinned its own availability expression against it.

The single query joins the ledger and then aggregates the allocations over the joined set:

```sql
-- OLD (baseline:2799-2820)
SELECT
  ht.key AS hour_type_key,
  ht.display_name,
  SUM(ea.allocated_hours) AS allocated_hours,
  COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0) AS reserved_hours,
  COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0) AS consumed_hours,
  SUM(ea.allocated_hours)
    - COALESCE(SUM(CASE WHEN chl.status = 'reservada' THEN chl.hours END), 0)
    - COALESCE(SUM(CASE WHEN chl.status IN ('consumida', 'penalizada') THEN chl.hours END), 0)
  AS available_hours,
  BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation,
  COALESCE(SUM(ea.allocated_hours) FILTER (WHERE ea.is_annex), 0) AS annex_hours
FROM effective_allocations ea
JOIN hour_types ht ON ht.id = ea.hour_type_id
LEFT JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
  AND chl.status IN ('reservada', 'consumida', 'penalizada')
GROUP BY ht.key, ht.display_name, ht.sort_order
ORDER BY ht.sort_order;
```

The `LEFT JOIN` fans out: one allocation with N counted ledger rows becomes N rows, so
`SUM(ea.allocated_hours)` counts that allocation N times. `allocated_hours`,
`available_hours` and `annex_hours` are inflated by the ledger row count.
`reserved_hours`/`consumed_hours` were already correct — they sum `chl.hours`, and the
fan-out gives each ledger row exactly once.

## The fix

`supabase/migrations/20260809120000_fix_bucket_summary_fanout.sql` —
`CREATE OR REPLACE FUNCTION` at the identical signature, no `DROP`, no `ALTER`, no
`GRANT`/`REVOKE`. `effective_allocations` is unchanged; the aggregation is split in two
and the results joined (PM ruling 1 — no `SUM(DISTINCT …)`):

```sql
-- NEW
allocation_totals AS (          -- allocations only; the ledger cannot reach this sum
  SELECT ea.hour_type_id,
         SUM(ea.allocated_hours) AS allocated_hours,
         BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation,
         COALESCE(SUM(ea.allocated_hours) FILTER (WHERE ea.is_annex), 0) AS annex_hours
    FROM effective_allocations ea
   GROUP BY ea.hour_type_id
),
ledger_totals AS (              -- ledger only; each row counted exactly once
  SELECT ea.hour_type_id,
         COALESCE(SUM(chl.hours) FILTER (WHERE chl.status = 'reservada'), 0) AS reserved_hours,
         COALESCE(SUM(chl.hours) FILTER (WHERE chl.status IN ('consumida','penalizada')), 0) AS consumed_hours
    FROM effective_allocations ea
    JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
     AND chl.status IN ('reservada', 'consumida', 'penalizada')
   GROUP BY ea.hour_type_id
)
SELECT ht.key, ht.display_name,
       alloc.allocated_hours,
       COALESCE(led.reserved_hours, 0),
       COALESCE(led.consumed_hours, 0),
       alloc.allocated_hours - COALESCE(led.reserved_hours, 0) - COALESCE(led.consumed_hours, 0),
       alloc.is_fixed_allocation,
       alloc.annex_hours
  FROM allocation_totals alloc
  JOIN hour_types ht ON ht.id = alloc.hour_type_id
  LEFT JOIN ledger_totals led ON led.hour_type_id = alloc.hour_type_id
 ORDER BY ht.sort_order;
```

Grouping moved from `ht.key, ht.display_name, ht.sort_order` to `ea.hour_type_id`, which is
equivalent: `hour_types.key` is UNIQUE (`baseline.sql:12317`), so one key is one row either
way. Return shape, argument name, `STABLE`, invoker-rights and the three EXECUTE grants are
all asserted unchanged in pgTAP ([J6], 8 assertions).

## The RPC now CALLS it — one formula, not a proven-equivalent copy

`supabase/migrations/20260809120100_reschedule_rpc_uses_bucket_summary.sql` replaces
`public.reschedule_session_hours` with a body **identical to the r21 version except for the
availability block**, which is now:

```sql
SELECT b.available_hours
  INTO v_available
  FROM public.get_bucket_summary(v_contrato_id) b
 WHERE b.hour_type_key = v_hour_type_key;
```

r21 could not do this — `get_bucket_summary` pinned no `search_path`, so calling it from a
`SET search_path = ''` SECURITY DEFINER function failed on name resolution. **The repair
pins `SET search_path TO 'public'` on `get_bucket_summary`**, which removes the obstacle.
That is the one change in this round beyond the aggregation itself; it alters name
resolution only — the function stays invoker-rights, so inside the SECURITY DEFINER RPC it
executes in exactly the privilege context the inline query did. Two pgTAP assertions read
`pg_proc.prosrc` directly to prove the RPC names `get_bucket_summary` and that no
`effective_allocations` copy survives in it.

## Blast radius — every reader of `get_bucket_summary`

All of these show the **same downward correction**: available/allocated/annex hours fall to
their true values wherever an allocation carries more than one ledger row. Reserved and
consumed figures do not move.

| Surface | File | Effect |
|---|---|---|
| Admin + equipo_directivo hours dashboard | `pages/api/contracts/[id]/hours/index.ts:102` | allocated/available/annex drop to true values |
| Hour-tracking service | `lib/services/hour-tracking.ts:221` | same, for every caller of `getBucketSummary` |
| School hours report | `lib/services/school-hours-report.ts:143` | report totals drop to true values |
| Reallocation guard | `pages/api/contracts/[id]/hours/reallocate.ts:132,217` | **behaviour change**: a reallocation that today passes on inflated availability can now be refused — correctly |
| Session creation budget hint | `pages/admin/sessions/create.tsx:337` | the availability shown while booking drops |
| Reschedule `is_over_budget` | `20260809120100…` (was inline) | flags over-budget cases that were previously missed |

`lib/services/billable-hours.ts` and both hours consumers read the ledger directly and are
unaffected. `lib/types/hour-tracking.types.ts:131` needs no change — the shape is identical.

**Brent-facing note:** after this is applied in production, schools' *available hours* will
drop. Nothing was consumed; the previous figure was inflated by the number of sessions
booked against each allocation. No UI copy was touched and no compatibility path was added
(PM ruling 5).

## Tests

`supabase/tests/014-bucket-summary-fanout.sql` — new file, 37 assertions, synthetic
fixtures only (`@test.local`, invented school 9932 / contracts `CT-BUCKETS-*`), whole file
rolls back.

- **[J1]** 100 h allocation × 3 counted ledger rows → `allocated_hours` 100 (was 300),
  `available_hours` 83 (was 283), one row per hour type, `is_fixed_allocation` passthrough.
- **[J2]** direct 100 + annex 100 on one hour type → 200 allocated. This is the assertion a
  `DISTINCT`-based non-fix fails.
- **[J3]** annex adds (40 + 50 = 90) and `annex_hours` = 50 with two ledger rows on the
  annex (was 140 / 100).
- **[J4]** consumption to exactly 0 available, and past it to −2.00, both reported
  arithmetically.
- **[J5]** reserved/consumed asserted literally AND against a hand-computed `SUM` over the
  ledger; a `devuelta` row stays excluded.
- **[J7]** the RPC bucket: 10 allocated, 8 consumed over two rows, this session's 1.50 h
  reservation as the third row → 0.50 available; stretching to 3.00 h flags
  `is_over_budget = true`. **Under the old formula the same case gives 20.50 available and
  `false`** — this is precisely where the two copies disagreed.
- `012`'s A8 anti-drift pins are kept (comment updated: they now pin the caller against the
  function it reads, not against a restatement).

No unit tests changed: this round changes no TypeScript behaviour, only the numbers the DB
returns, and the dashboard suites assert pass-through of whatever the RPC returns.

## Mutation probe

Restoring the fan-out (the old `SUM(ea.allocated_hours)` over the joined set) inside the new
migration and re-running `supabase db reset && npm run test:db` fails **15 of 37** assertions
in `014`, including every [J1] and [J7] number:

```
# Failed test 9: "J1: one 100 h allocation with three ledger rows reports 100 allocated, not 300"
#         have: 300.00   want: 100
# Failed test 31: "J7: the RPC bucket has 0.50 h available before the reschedule"
#         have: 20.50    want: 0.50
# Failed test 32: "J7: the RPC flags over budget — the fanned-out formula would have said false"
#         have: false    want: true
Failed tests:  9-10, 15-16, 18-24, 31-34
Result: FAIL
```

Reverted; `git hash-object` on the migration returns `c0b7296028ac3d72348b34826e343a02a35d0cfc`
before and after, and the tree is clean apart from this round's own files.

Note for the reviewer: assertion 35 (`available_hours < 0` equals the flag the RPC wrote)
**passes under the mutation too** — with the RPC calling the function, both sides move
together. The explicit numbers are what catch the regression, which is why [J1]/[J7] assert
values and not just agreement.

## Evidence

- type-check 0 · lint 0 · **4622 passed / 281 files** (unchanged — no TS touched) · build 0
- `npm run test:db` — **Files=11, Tests=464** (was 10 / 427), Result: PASS

## Known limitations

- **Not applied to production.** These two migrations join the ones already unapplied there.
  Until they are, the dashboards keep showing inflated availability.
- **No backfill and none needed** — the function is a read-time aggregation; no stored value
  was ever wrong.
- **Pre-existing, untouched, out of scope:** an allocation that is BOTH a direct allocation
  of the contract AND points at another allocation of the same contract via
  `adds_to_allocation_id` appears twice in `effective_allocations` and is counted twice. That
  is exactly what the old function did; this round preserves it deliberately rather than
  changing a second behaviour under cover of the fan-out fix. Worth its own ruling.
- `SET search_path TO 'public'` on `get_bucket_summary` also makes it non-inlinable by the
  planner. Its callers all pass a single contract id and the plan is trivial; no measurable
  cost, but it is a real change to how the function is planned.

---

# Sol remediation — round r23 (items 4 and 9)

**Branch** `feat/zoom-sess`, base `5d32a364`. Two items were dispatched together on the
premise that they are one concern. **Item 4 is implemented. Item 9 is NOT — it is returned
as a FINDINGS** with the evidence below, because the ruling as written reverses a
deliberate, mandatory-CI-gated invariant in both directions and its blast radius lands
entirely outside the five gates this round was told to run.

## Item 4 — the source of truth closes the join · IMPLEMENTED

### The closed set, and why

`authorizeMeetingJoin` already reads the `consultor_sessions` row to answer the school and
community questions. It now selects `status` and `modality` from that same row and carries
them out on the `authorized` result as `source`. The route gates on them **immediately after
authorization** — before the projection read, and before `zoom_internal` is addressed at all.
No extra round trip.

**Status — a `Record<SessionStatus, boolean>`, not a list.** This is a security boundary, so
adding a value to `SessionStatus` must fail type-check until somebody classifies it rather
than defaulting to whichever side is convenient.

| Status | Closes join | Why |
|---|---|---|
| `borrador` | no | Pre-approval. §8: creating a session makes no Zoom call, so there is nothing provisioned yet. Must keep reaching `mode: 'pending'` — **"not yet" is not "no longer"**, and a draft told "Esta reunión ya no está disponible" is a lie. |
| `pendiente_aprobacion` | no | Same. |
| `programada` | no | Approved and scheduled — the normal join. |
| `en_progreso` | no | Under way. The single most important status NOT to close, and the reason `PROVISION_ELIGIBLE_SESSION_STATUSES` (`['programada']`) could not simply be reused. |
| `pendiente_informe` | **yes** | Surfaced to consultores as *"Sesión finalizada. Debe completar el informe y la asistencia."* The call is over; only paperwork remains. |
| `completada` | **yes** | Over. |
| `cancelada` | **yes** | The round's reason to exist. |

**Modality — an allowlist, `['online', 'hibrida']`.** `presencial` is the only value that has
nothing to join today, but an unrecognised modality must **refuse** rather than fall through
to the credentials, so it is written as "not in the eligible set" rather than "in a closed
set". `hibrida` is IN: a hybrid session has attendees joining remotely and is exactly as
entitled to a link as an online one.

It is a **separate constant** from `PROVISION_ELIGIBLE_MODALITIES` rather than an import —
provisioning eligibility must be free to tighten without silently tightening who may join a
meeting that already exists — and their equality is held by a contract test
(`meeting-join-policy.test.ts`, "shares the provisioner vocabulary for modality") so the two
cannot drift unnoticed. Importing `lib/zoom/jobs/meeting-provision.ts` into the route would
also have pulled the whole provisioning pipeline into that function's bundle.

### The ordering proof

The claim is *credentials are not READ*, which a body assertion cannot prove. Three
independent pieces:

1. **A double that detonates on contact.** `zoomInternalSchema()` is stubbed to return a
   client whose `from()` throws. On the cancelled-session path the route answers **410**; had
   it addressed `zoom_internal`, the route's own `catch` would have turned the throw into a
   500. 410 *is* the proof.
2. **A negative control for that double** — the same throwing client on the joinable path
   yields the 500, so the assertion above is not passing because the double is inert.
3. **`tablesRead` is exactly `['consultor_sessions']`** on the refusal path: not
   `zoom_meetings`, and not even `session_meetings_public`.

### Ordering vs. the frozen denial semantics

The gate runs **after** `authorizeMeetingJoin`, exactly where the projection check runs, so it
cannot convert a 403/404 into a 410. Asserted directly: an other-school caller asking about a
**cancelled** session still gets 404, and the GC member and same-school consultor still get
their two distinct 403s. A second test compares each pre-existing refusal's **bytes** against
the same persona on a live session and requires them equal.

The seven documented outcomes are unchanged — the new gate shares the existing 410. The
header's gate list was renumbered (5 → source of truth, 6 → projection, 7 → pending, 8 →
link) and the two in-header references to the old numbers were updated with it.

### Mutation probe

- **Mutation A — gate moved to after the internal read.** `[K3]` fails: `expected 500 to be
  410` (the throwing double fired). `[K1]`/`[K2]` still pass, correctly — moving the gate
  changes *when the credentials are fetched*, not what the body carries. That the two
  mutations fail different criteria is the point.
- **Mutation B — gate deleted.** 8 failures: `[K1]` ×4 (`expected 200 to be 410` — the
  original bug, an authorized caller getting a live link for a cancelled session),
  `[K2]` ×3, `[K3]` ×1.
- **Revert:** `git hash-object` on the route is `bc404414…` before and after; `git status
  --porcelain` empty; both suites green again.

## Item 9 — one policy across route and SSR · NOT IMPLEMENTED (FINDINGS)

The ruling is grounded: PLAN §5 says in as many words that `authorizeMeetingJoin()` is *"used
by both the join API and the `/meet` pages' getServerSideProps"*, and §14 lists `/meet` SSR as
a kill-switch enforcement point. The problem is not the direction. It is that the change is
**not the contained delegation the prompt models**, and the one suite that would catch what it
actually does is not in this round's gates.

`resolveMeetSessionAccess` gates on `canViewSession` — "may this user OPEN the session".
`authorizeMeetingJoin` gates on the §5 join list — `session_attendees(expected) ∪
session_facilitators ∪ admins`. Neither is a subset of the other, so swapping one for the
other moves personas **in both directions**.

`tests/e2e/zoom-join-authz.spec.ts` is a **mandatory** spec (`scripts/ci/e2e-mandatory.mjs`
fails the gate if it is skipped) whose persona tiers are built on `canViewSession`. Against
the seeded fixtures (`scripts/ci/e2e-fixtures.json`: `session` …501 has a facilitator and no
attendees; `linkedSession` …502 has facilitator `consultorAssigned` and expected attendees
`gcLeader` and `docente`):

| Persona | Session | Today | Under the ruling | |
|---|---|---|---|---|
| `docente` (tier DENIED) | linked | 404 | **200 + the raw `meeting_link`** | expected attendee ⇒ authorized |
| `gcLeader` (tier VIEW_ONLY) | unlinked | 200 | **404** | GC member, no attendee row ⇒ forbidden ⇒ notFound |
| `consultorGlobal` (tier PRIVILEGED) | both | 200 | **404** | global consultor, not a facilitator ⇒ forbidden |
| `admin`, `consultorAssigned` | both | 200 | 200 | unchanged |

Three things make this more than a test update:

1. **A spec exists whose entire purpose is to assert the opposite.** `"meet interstitial — an
   attendee row is not view access"` — *"docente attends the linked session yet cannot open
   it… A regression that started consulting attendance would show up here and nowhere else in
   this suite."* The ruling makes an attendee row exactly the thing that grants access. That
   test cannot be updated; it can only be deleted or inverted, and inverting it is a product
   decision, not a refactor.
2. **A persona classified DENIED newly receives a raw legacy meeting link.** `linkedSession`
   carries `meetingProvider: 'otro'` — a hand-managed link, not a Zoom meeting. Applying §5's
   *Zoom* join matrix to a non-Zoom surface is the category error underneath both directions
   of movement: the interstitial serves the Z1a legacy link **and** the managed join, and the
   join matrix was written for the second only.
3. **A global consultor loses the interstitial**, for both a Zoom session and a legacy one.

Item 9 also, as specified, silently reverses a Z1a product decision recorded in that spec's
header — *"a GC leader who is denied the raw link in an API payload still gets it here,
because here the access is re-checked server-side on every visit"* — and would ship it behind
five gates none of which run Playwright. `[K10]` names five gates; e2e is not among them.

### What I would propose instead

Keep `canViewSession` as the gate on **page access** (it answers the page's question, and the
e2e persona matrix stays true), and put `authorizeMeetingJoin` on the **join affordance**: the
page renders `JoinMeetingButton` only when the join policy authorizes the caller, and renders
the §14 disabled state when `FeatureFlags.ZOOM_MEETINGS` is off. That satisfies what item 9 is
actually protecting — nothing Zoom-join-shaped is offered server-side to somebody the one join
policy refuses, and the kill switch is enforced on SSR — while preserving all three behaviours
§2 of the prompt says must survive, without re-tiering a legacy surface or touching a
mandatory gate. It leaves two helpers, but they answer two genuinely different questions, and
`lib/utils/meeting-join-policy.ts`'s own header argues at length that they must.

If the PM's ruling stands as written instead, the round needs to be re-scoped to include
`tests/e2e/zoom-join-authz.spec.ts`, `tests/e2e/helpers/session-personas.ts` and a Playwright
gate, plus an explicit decision on whether the legacy `meeting_link` interstitial is governed
by the Zoom join list.

## Evidence

- `npm run type-check && npm run lint && npm test && npm run build` — 0 · 0 ·
  **4648 passed / 281 files** (was 4622 / 281; +26, none lost) · 0
- `npm run test:db` — **Files=11, Tests=464**, Result: PASS (unchanged, as required — this
  round adds no SQL)

## Known limitations / open

- **Item 9 not done.** `[K6]` `[K7]` `[K8]` not met — see above.
- **The SSR page still does not enforce the kill switch**, which is the half of item 9 that
  carries no persona-tier consequence at all and could have shipped alone. It is left with the
  rest of the item rather than split, so the PM rules on one thing.
- The interstitial does **not** get the source-of-truth 410 treatment. Out of this round's
  criteria (`[K1]`–`[K5]` are all route-level), and unnecessary in practice: the page renders
  no meeting facts, and `JoinMeetingButton` fetches per click from the route, which now
  refuses. Worth a ruling if the page should stop rendering the button at all for a cancelled
  session.
- `authorizeMeetingJoin`'s `source` is the first non-authorization data the module carries
  out. Deliberate and documented in its header — `status`/`modality` are two more columns of
  the row it already reads, and the *gate* stays in the route — but it is a boundary a
  reviewer should look at rather than take on trust.

---

# Sol remediation — round r24 (item 5)

**Branch** `feat/zoom-sess` · **fork point** `f8bf88ab` · **1 commit**

Sol item 5: `meeting_provision` and `meeting_delete` are not coordinated per surface, so a
cancellation landing mid-provision can leave a live Zoom meeting for a cancelled session.
Item 9 is untouched — it is with Brent as a plan conflict.

## The mechanism, and why this one

**A source re-check at the persist point, plus an explicit compensating delete.** No SQL, no
migration, no change to `claim_zoom_jobs`.

Two coordination points in `lib/zoom/jobs/meeting-provision.ts`:

1. **After `createMeeting` returns and after the post-create checkpoint heartbeat, before the
   persist CAS**, the handler re-reads `consultor_sessions` and re-runs the SAME
   `checkSessionEligibility` gate. Refused ⇒ DELETE the meeting at Zoom, release the
   reservation, republish the retired projection, and COMPLETE with a distinct
   `MeetingProvisionCompensatedResult`.
2. **On a persist CAS miss whose winner is a RETIRED row** (numberless, `cancelled` or
   `deleted`), the same compensation runs. That miss is *explained* — a `meeting_delete`
   retired the row — so it is no longer reported as `possible_orphan`. The row itself is left
   alone: the writer that retired it owns the record and published its own projection.

**Why not the alternatives.** A surface-level advisory lock cannot be held across this
handler's PostgREST calls — there is no stable database session behind them — so it would have
to become a lock row with its own lease and expiry, i.e. a second queue with a second set of
expiry races. Excluding conflicting job types at claim time coordinates the CLAIMS, not the
WORK: a provisioner whose lease expires mid-`createMeeting` still walks into the same window,
and the change would land in the one RPC four review rounds have hardened. The re-check sits
inside the process that is *holding the unpersisted meeting*, which is the only place that can
still undo it.

**Why the two points close the window between them.** The reservation INSERT happens before
`createMeeting`. So a `meeting_delete` that finds NO row at all must have read before that
INSERT; its job is only claimable after the cancel commits; therefore the cancel is already
visible to re-check #1. A delete that runs after the CAS finds the row carrying the number and
removes the meeting through its own ordinary path. The only remaining ordering — a cancel that
commits between re-check #1 and the CAS — is exactly what point #2 catches.

**A third site, same helper.** The eligibility gate now compensates when the job carries a
live post-create checkpoint on a numberless reservation. That is the crash-shaped version of
the same end state (a previous attempt created at Zoom, died before persisting, session
cancelled in between); refusing and walking away left that meeting standing. The job outcome is
unchanged — still terminal `session_ineligible` — only the meeting is removed first. An
UNRESOLVED `ambiguous_create_outcome` park still outranks it and is left completely untouched.

**Compensation failure is loud, on both surfaces.** The job fails terminally under
`compensation_failed` with `evidence.created_zoom_meeting_number`, AND the row is parked under
the same reason with the same number while KEEPING its `pending` status — so the §9 EXCLUDE
constraint goes on blocking a host a live meeting occupies. `meeting-delete.ts` gained one
guard for that: it refuses to release a compensation-parked row, on the exact
`ambiguous_create_outcome` precedent (`delete_compensation_parked`, evidence carrying the
number). Nothing else in that handler changed; it is the provisioner that yields, because it is
the one holding an unpersisted meeting.

## How the interleaving was forced

Never `Promise.all` and hope. The cancellation and its `meeting_delete` job are driven **from
inside a seam of the provisioner's own call sequence**, so the ordering is identical on every
run and every machine:

| Ordering | Seam |
|---|---|
| Sol's named one — delete runs before any row exists | wrap `store.insertReservation` |
| delete retires an existing bare reservation mid-create | wrap `api.createMeeting` |
| the residual — delete lands between re-check and CAS | wrap `store.adoptCheckpointMeeting` |

In each the wrapper flips `consultor_sessions.status` to `cancelada` and runs the REAL
`createMeetingDeleteHandler` against the SAME shared harness rows, then delegates. Its outcome
is asserted, not swallowed: the named interleaving asserts the delete really did die terminally
under `no_meeting_row` — Sol's step 3, and the reason it is not coming back.

## Files changed

- `lib/zoom/jobs/meeting-provision.ts` — the two coordination points, the eligibility-gate
  site, the shared compensation helper, `ZoomCompensationFailedError`, the row marker, the
  compensated result shape, module header.
- `lib/zoom/jobs/meeting-delete.ts` — the compensation-park refusal + module header.
- `__tests__/lib/zoom/jobs/meeting-provision.test.ts` — 11 tests under
  `Sol item 5 — a cancellation racing a provision`.

## Test evidence

- `npm run type-check && npm run lint && npm test && npm run build` — 0 · 0 ·
  **4659 passed / 281 files** (was 4648 / 281; +11, none lost) · 0
- `npm run test:db` — **Files=11, Tests=464**, Result: PASS (unchanged — no SQL this round)
- **Mutation probe [L6]**: neutralising BOTH coordination points (the re-check forced to
  `null`, the CAS-miss retirement branch disabled) killed **6 of the 11** tests, and `[L1]`
  failed with the orphan itself — `expected [ { id: 82000000001, … } ] to deeply equal []`, a
  live meeting at the fake for a cancelled session. Reverted; blob
  `417f8ee8318f9cfefecc4690dc96d2718ec9a6e5` identical; suite back to green; tree clean.

## Scrutinise hardest

1. **The claim that there is no window left.** It rests on "a delete that finds no row must
   have read before the reservation INSERT". That is an argument about commit visibility, not a
   test — no in-process double can prove it, and it is the load-bearing step.
2. **Compensating with a Zoom DELETE for a meeting we may not have persisted.** The number
   comes from the create response and from the job's own checkpoint, so it is ours; but the
   delete is irreversible and runs before any row records it.
3. **The eligibility-gate change** is the one behaviour a previous round deliberately settled
   the other way ("a live post-create checkpoint is left alone"). It is now compensated. Same
   job state, same error, different world.
4. **The compensation park keeps a `pending` row forever** until a human acts. That is the
   ambiguous-park precedent, but it adds a second reason a host can stay blocked.
5. **`releaseReservation` is skipped when the row is no longer active.** One extra
   `findMeetingBySurface` decides it; between that read and the release the row could move
   again. The consequence of losing that race is a row written by us instead of by the delete —
   both retired, both projecting `cancelled` — so it is a fidelity question, not a safety one.

## Known limitations / open

- **A lease lost between `createMeeting` and the re-check still strands a meeting.** The
  pre-existing RESIDUAL in the module header is unchanged: the checkpoint names it, a human
  cancels it. This round narrows the cancelled-session case, not the crash case in general.
- **The compensation is not itself atomic.** Zoom DELETE, then release, then republish are
  three calls; a crash between them leaves a released reservation with a stale projection
  (self-healing — the delete job republishes) or, before the release, a parked-looking row with
  the meeting already gone.
- **`meeting_delete` still fails terminally under `no_meeting_row`** in the named interleaving.
  That is a red job for a race the system now handles correctly. Out of this round's scope; it
  wants a ruling on whether "no row yet" should be a completion.
- **Modality flips are covered by construction, not by a dedicated test.** The re-check runs
  the whole `checkSessionEligibility` gate, so a flip to `presencial` mid-provision compensates
  the same way; only `cancelada` is asserted.

# Sol remediation — round r25 (item 9)

**Branch** `feat/zoom-sess` · **fork point** `f2c22a74` · **1 commit**

Sol item 9 — *one policy across route and SSR* — which r23 refused in its original form and
was right to refuse. This round implements it in the sharpened form the owner ruled.

## The two rulings this round executes

Both are **owner decisions (Brent)**, not executor judgement.

**RULING A — recorded in `PLAN.md` §5 (amendment dated 2026-08-06).** The plan line that read
"…used by both the join API and the `/meet` pages' getServerSideProps" was read as making
`authorizeMeetingJoin()` the PAGE-VISIBILITY gate. Implementing that literally re-tiers four
roles as a side effect of a security fix. The amendment keeps the intent and moves it:

1. Page visibility keeps `canViewSession`. No tier moves.
2. `authorizeMeetingJoin()` governs the join CAPABILITY wherever it appears on that page —
   the Zoom affordance **and** the raw pasted `meeting_link`.
3. The §14 kill switch is enforced in `/meet` SSR, as §14 already required.

**RULING B — owner, this round.** (2) collides with `tests/e2e/zoom-join-authz.spec.ts`, a
MANDATORY spec (`scripts/ci/e2e-mandatory.mjs`), which asserted that view-only personas reach
`meet-join-link` with the raw link as its `href`. That spec documented the inconsistency (2)
removes: "view-only" meant *no credentials* for a Zoom session and *here is the link* for a
pasted-link session. **The owner ruled: make it consistent.** Those assertions are inverted in
this round, and the reason is written into the spec's header so the next reader sees a
decision rather than a weakened assertion.

## What the code does now

`resolveMeetSessionAccess` makes two decisions instead of one. Page visibility is unchanged —
same `canViewSession`, same single shared `NOT_FOUND`. After it passes, the resolver calls
`authorizeMeetingJoin()` (the policy module, not a copy of it) and publishes
`join_access: 'allowed' | 'denied' | 'disabled'` plus an es-CL `join_denial_message`.

**The link is withheld from the PROPS, not from the markup.** Page props are serialised into
`__NEXT_DATA__`, so a conditional render would have shipped the URL to the very persona it is
withheld from. `meeting_link` is `null` unless `join_access === 'allowed'`.

The page renders that decision and nothing else: `meet-join-denied` for a refused viewer (no
affordance, no link, and not the `meet-no-link` state either — whether the session HAS a link
is part of the capability), `meet-join-disabled` for the kill switch, and the three existing
branches otherwise, byte-identical (the frozen-markup test at `6c71eda` still passes unedited).

## §14 — what the page does with the flag off, and why

With `FEATURE_ZOOM_MEETINGS` off the join route answers 503. The page therefore stops offering
the join it knows would fail, and shows the same sentence the route answers with. Two ordering
decisions, both deliberate:

- **Authorization is resolved first, the flag second.** A viewer the join list already refused
  gets `denied`, never `disabled` — so the flag's state is not disclosed to someone with no
  join to lose. The route checks the flag *before* authorization for the opposite reason (its
  503 must not become an oracle); on the page, page visibility has already been resolved
  before either check, so no denial path is touched: a non-entitled viewer still gets the one
  shared `not-found`, byte-identical to a nonexistent session (asserted, flag off).
- **The flag suppresses the MANAGED path only.** `FEATURE_ZOOM_MEETINGS` is Zoom's master
  switch (§14: "stops *new meetings and joins*"). A school's pasted Google Meet or Teams link
  is not a Zoom capability, and taking it away when Zoom is switched off would be an outage
  GENERA has no reason to cause.

## Tier table — before and after

Page access is unchanged in every row. Only the join columns move.

| Persona | Page (before → after) | Join affordance (before → after) | Raw link (before → after) |
|---|---|---|---|
| `admin` | 200 → 200 | yes → yes | yes → yes |
| `consultorAssigned` (lead facilitator of both) | 200 → 200 | yes → yes | yes → yes |
| `consultorGlobal` | 200 → 200 | yes → **no** | yes → **no** |
| `gcLeader` | 200 → 200 | yes → yes | yes → yes |
| `docente` | 404 → 404 | — | no → no |
| `consultorOtherSchool` | 404 → 404 | — | no → no |
| `inactiveConsultor` | 404 → 404 | — | no → no |

`consultorGlobal` is the whole change: privileged for DISCLOSURE (they receive the raw link in
API payloads — `session-disclosure.spec.ts`, unchanged) and refused by the §5 join list, which
has no branch for an unassigned consultor. Before this round the Zoom path refused them and
the pasted-link path handed them the URL.

**`gcLeader` is a fixture fact worth recording**: they are an EXPECTED ATTENDEE of both
seeded sessions, so they may join both. The fixture file lists them on the linked session
only — the second row is written by the `trg_sync_session_attendees_on_gc_change` trigger
(`00000000000000_baseline.sql`), which enrols an active GC member into every FUTURE
`programada` session of their community. A first run of this spec was authored from the
fixture JSON alone and failed on exactly that persona; the correction is in the spec's own
comment so the next reader does not repeat it.

## Files changed

- `lib/utils/session-meet-access.ts` (+84/−7) — the second decision, the withheld link, §14.
- `pages/meet/session/[id].tsx` (+28/−5) — two refusal panels; authorized branches untouched.
- `__tests__/lib/utils/session-meet-access.test.ts` (+193/−4) — the join matrix and §14.
- `__tests__/pages/meet/session-managed-join.test.tsx` (+97/−0) — what the refused viewer sees.
- `tests/e2e/zoom-join-authz.spec.ts` (+116/−20) — ruling B, with its reason in the file.

## Test evidence

Five gates at this head, from `/Users/brentcurtis/dev/wt/zoom-sess`:

`npm run type-check && npm run lint && npm test && npm run build` → exit 0;
**4676 passed / 281 files** (baseline 4659 / 281 — 17 new, none lost).
`npm run test:db` → `Files=11, Tests=464`, `Result: PASS` — unchanged.

**The mandatory e2e actually ran**: `npx playwright test tests/e2e/zoom-join-authz.spec.ts`
→ **20 passed**, against a freshly `supabase db reset` local stack seeded by
`scripts/ci/seed-e2e.mjs`. `.env.local` was pointed at that stack for the run and restored
afterwards (sha256 verified identical). This spec is not one of the five gates — it is
mandatory in CI only, which is exactly how r23's trap stayed invisible.

**Mutation probe.** Replacing the whole `joinAccess` computation with the constant `'allowed'`
(the gate removed) fails 6 of the new unit tests — including `expected
'https://meet.example.test/abc-def' to be null` — and both `consultorGlobal` e2e tests. The
file was restored from a pre-probe copy; `git hash-object` is `57ae3837…` before and after,
and the tree is clean apart from this round's five files.

## Scrutinise hardest

1. **The join policy is now called twice per page load** — once by the page, once by the join
   route when the user clicks. `resolveMeetSessionAccess` re-reads the session row, the roles
   and the facilitator row it had already read, because the policy owns its own lookups. The
   alternative was a prefetch parameter on a security module three rounds have sealed. Cost,
   not correctness — but it is a real cost on a page whose stated virtue is being light.
2. **The refused viewer no longer sees `meet-no-link`.** Whether a session has a link is now
   part of the capability, so a refused viewer gets the refusal on a linked and an unlinked
   session alike. That is deliberate (it is the one place the two could be told apart) and it
   is a copy change for `gcLeader`-shaped users who previously saw "no tiene enlace".
3. **`is_zoom_managed` still reaches the props of a refused viewer.** They learn the provider
   is Zoom and nothing else; the page does not use it on that branch. Removing it churns the
   frozen-markup fixtures for no security gain, but it is the one field that survives a refusal.
4. **The §14 scope call is mine to defend** (§ above): the flag suppresses the managed path
   only. If the reviewer reads §14 as "no joins at all", the pasted-link branch is wrong.
5. **`JOIN_AUTHORIZED` in the e2e spec is a hand-derived table**, not something read from the
   database. It is guarded (it must be a subset of the view tier and strictly narrower), and
   the trigger that made it non-obvious is documented, but a fixture change could still make
   it silently wrong in the permissive direction — it would show up as an unexpected pass.

## Known limitations / open

- **The page does not apply `joinIsClosedBySource`.** A cancelled or `presencial` session with
  a pasted link still shows that link to an authorized persona, while the managed path answers
  410. The persona rule is consistent now; the session-STATE rule is not. Out of this round's
  scope (r21–r24 sealed the route's source gate) and the natural next item.
- **No e2e covers the managed affordance or the kill switch.** Both seeded sessions are
  unmanaged (`is_zoom_managed` defaults to false and the seeder does not set it), so the
  `disabled` branch and `meet-join-button` are unit-tested only. Unchanged from r23's note.
- **`session-personas.ts` is untouched.** The view tiers are the same three; the join tiers
  live in the spec that uses them, per session, because that is what they are.

---

# Sol remediation — round r26 (items 6, 7, and the r25 completion)

**Branch** `feat/zoom-sess` · **base** `b9e5af0f` · **commits** 1

## Objective and scope

Three defects, all of them "the platform tells you about a session and gives you no way to
reach it":

- **Item 6** — every platform-link site gated on `meeting_link` being truthy, and a
  Zoom-managed session keeps `meeting_link` NULL by design (§8). So for exactly the sessions
  this phase provisions, `session_created`/`session_rescheduled`, both reminders and all three
  `.ics` endpoints carried no join URL at all.
- **Item 7** — §15 names the join control on the detail pages *and* the workspace Sesiones
  tab. The tab had none.
- **The r25 completion** — r25 made the PERSONA rule consistent across providers; the
  SESSION-STATE rule was not. `joinIsClosedBySource` gated the join route (410) while the page
  still rendered a pasted link for a cancelled or `presencial` session to an authorized
  persona.

Out of scope and untouched: Sol items 8/10/11/12, page visibility tiers, and every standing
unruled item.

## Files, grouped by risk

**Decision surfaces (highest):**
- `lib/utils/session-disclosure.ts` — new `sessionOffersPlatformJoin()`, the ONE derivation
  behind every "offer the platform link" decision. It decides *whether* to offer the platform
  surface, never *what* is offered, so it cannot widen disclosure.
- `lib/utils/session-meet-access.ts` — new `closed` value on `MeetJoinAccess`, decided by
  `joinIsClosedBySource` (imported, not re-implemented) and ordered after `denied`, before
  `disabled`. The link stays out of the props exactly as it does for a refused persona.
- `lib/utils/meeting-join-policy.ts` — `MEETING_CLOSED_MESSAGE` moved here beside the
  predicate that forces it; `pages/api/meet/session/[id]/join.ts` re-exports it so existing
  importers are unaffected. No behaviour change on the route.

**Emitters (medium):** `lib/services/session-lifecycle-notifications.ts`,
`pages/api/cron/session-reminders.ts`, `pages/api/sessions/ical.ts`,
`pages/api/sessions/[id]/ical.ts`, `pages/api/sessions/series/[groupId]/ical.ts` — each swaps
its `meeting_link` truthiness test for the shared predicate; the cron and the series `.ics`
additionally add `is_zoom_managed` to their explicit column lists.

**UI (medium):** `pages/meet/session/[id].tsx` (the `closed` notice),
`components/workspace/WorkspaceSessionsTab.tsx` (the join control).

**Tests:** five files extended, one added
(`__tests__/components/workspace/WorkspaceSessionsTab.join.test.tsx`).

## Evidence

- `npm run type-check` 0 · `npm run lint` 0 · **`npm test` 4706 passed / 282 files** (from
  4676/281) · `npm run build` 0 · **`npm run test:db` Files=11, Tests=464, PASS** (unchanged).
- **Mandatory e2e run** (not one of the five gates): `76 passed`, and
  `e2e-mandatory.mjs --check` reports 6 specs ran with no skips. Run against the local stack
  with `.env.local` temporarily re-pointed and then restored.
- **Mutation probe**: deleting the `is_zoom_managed` half of `sessionOffersPlatformJoin` kills
  **9 tests across all five surfaces plus the tab**; reverted, blob `d281593b…` identical.

## Scrutinize hardest

1. **`sessionOffersPlatformJoin` accepts three fields** (`meeting_link`, `has_meeting`,
   `is_zoom_managed`) so one predicate serves both server rows and disclosure-stripped client
   rows. That is a convenience, and a reviewer should check it cannot be fed a row where
   `has_meeting` is stale relative to the link.
2. **`session_cancelled` notifications now carry a join URL for managed sessions.** The ruling
   is unconditional and [N2] forbids changing the pasted-link case, so cancellation notices
   were left on the same rule. The link resolves to the `closed` page, which is arguably the
   right answer — but it is a link in a cancellation e-mail, and it is a judgment call.
3. **`applySessionMeetingDisclosure` was NOT changed.** `has_meeting` still means "a raw link
   exists", so an API payload for a managed session still reports `has_meeting: false` with a
   null `join_path`. The workspace tab compensates by reading `is_zoom_managed` directly. That
   inconsistency is real and deliberately out of this round's scope — item 6 named five
   surfaces and this is a sixth.
4. **The workspace control is an anchor, not `JoinMeetingButton`.** The ruling requires
   navigation to `/meet/session/{id}`; `JoinMeetingButton` POSTs to the join opening and opens
   a new tab, which is the interstitial's job, not a list row's. Reusing it would have put a
   credential-fetching control in a list. The row-click interaction (`stopPropagation` on a
   nested interactive element inside a `role="button"` card) is the part to check.
5. **The tab now imports `meeting-join-policy` into a client bundle.** Only the pure predicate
   is used; `roleUtils`/`session-policy` were already reachable from client components. Worth
   a look for anyone tracking bundle weight on school hardware.

## Known limitations / open

- **Still no e2e for the managed affordance, the `closed` state or the kill switch.** Both
  seeded sessions are `programada`/`online` and unmanaged (`is_zoom_managed` defaults to false
  and the seeder does not set it), so none of this round's new branches is reachable from a
  mandatory spec — which is also why the e2e run above passes unchanged.
- **`SESSION_STATUS_FALLBACK`, `total_hours_actual`, `create.tsx`'s UTC-vs-Chile `min`, the
  four order-dependent suites and `'edit_approval_blocked'`** remain unruled and untouched.

---

# Sol remediation — round r27 (items 8, 10, and two PM-ruled carry-overs)

**Branch** `feat/zoom-sess` · **base** `c6702698` · **commits** 1

## Objective and scope

Four defects, one concern: **the system tells the truth about failure and about state.**

- **Item 8** — a failed ledger read rendered as "no hours".
- **Item 10** — the backfill's proof was a hand-copy of the thing it proved.
- **S1 (from r24)** — `meeting_delete` dead-lettered on a race r24 taught the system to
  handle correctly.
- **S2 (from r26)** — the sixth surface that computed `has_meeting` from the raw link alone.

Out of scope and untouched: items 11 and 12 (`PROJECT_STATE.md`, the final gate run, the
e2e seeder's missing managed session, the staging checklist), everything r21–r26 sealed,
the page-visibility tiers, and the five standing unruled items.

## Files, grouped by risk

**Behaviour (4)**

| File | What changed |
|---|---|
| `lib/services/school-hours-report.ts` | Both swallowed reads now throw: the `get_bucket_summary` `continue`, and the `contract_hours_ledger` query whose `error` was never destructured. |
| `lib/zoom/jobs/meeting-delete.ts` | `no_meeting_row` split into a deferral and the anomaly; new `findLiveProvisionJob` store method + its production PostgREST query. |
| `lib/utils/session-disclosure.ts` | `applySessionMeetingDisclosure` routes `has_meeting`/`join_path` through `sessionOffersPlatformJoin`. |
| `components/workspace/WorkspaceSessionsTab.tsx` | Dropped `is_zoom_managed` from `SessionListItem` — the compensation the API now makes unnecessary. |

**Tests (5)** — `supabase/tests/002-zoom-internal-isolation.sql` (section F rewritten,
`plan(117)` → `plan(119)`), three suites extended, one added
(`__tests__/lib/zoom/jobs/meeting-delete-store.test.ts`), harness seam in
`provisionHarness.ts`.

## How the school-hours report signals failure

**It throws**, and that was not a free choice: the sessions query eleven lines below already
throws with a `console.error` naming contract and bucket, so a second convention in the same
loop would be the drift. Both new throws copy that shape verbatim — `console.error` with the
PostgREST error object, then an es-CL message naming the contract (and the bucket, where one
is in scope). The two API routes wrap `fetchSchoolReportData` in `try/catch` and answer 500,
unchanged.

The bucket-summary fix is what the prompt named. **The ledger query at the old `:197` was
fixed too**, and the ruling is why: "the scheduled fallback is used only after a successful
query proves a session genuinely has no row." That fallback is a per-session one, and its
error path was worse than the bucket summary's — the `error` was never destructured at all,
so a failed read produced an empty map and every session in the bucket silently took the
schedule as its billed figure. Both are the same defect class named in the item title.

## How the test executes the real migration, and the proof it is not a copy

**`\i` does not work in this harness, and the alternative is not a second copy.**

What was tried: `supabase test db` runs pg_prove in a container that bind-mounts **only the
directory of each path argument**, at its identical host path. `\ir
../migrations/20260807120000_…sql` therefore resolves to the correct absolute path and psql
answers `No such file or directory` — `supabase/tests` is mounted, `supabase/migrations` is
not. Passing the migration as a *second* path argument does mount it (verified by
`docker inspect`), but pg_prove then also runs the migration as a test file: it carries no
plan, so the run fails, and it would apply outside any transaction. The db container holds no
copy either — the CLI applies migrations over a connection rather than mounting them.

**The mechanism used instead:** `supabase_migrations.schema_migrations.statements` — the
statement array the Supabase CLI recorded when it **read and applied the file**. Section F
replays every element of that array in order through a `pg_temp` function. `supabase db start`
(CI gate 3) and `supabase db reset` (local) rebuild that row from `supabase/migrations` on
every run, so what executes is regenerated from the file and cannot be edited independently
of it. A guard assert requires the row to exist with at least one statement, so a renamed,
reverted or unapplied migration fails loudly instead of replaying nothing.

**The proof.** The migration's load-bearing `WHERE dial_in_numbers IS NULL` guard was deleted
— **the migration file only** — then `supabase db reset && npm run test:db`:

```
# Failed test 116: "backfill never overwrites a dial_in_numbers that already has a value"
#         have: [{"number": "+56 2 5555 0121"}]
#         want: [{"number": "+56 2 5555 0199"}]
# Looks like you failed 1 test of 119
```

That is the property a hand-copy can never have. Reverted; blob
`8855bb1696f9d5d0f54c4cc1db284585f926de43` identical, `test:db` back to PASS.

The hand-copy is gone, and so is the hand-written replay: idempotence is now asserted on
**values** (a temp snapshot after the first run, compared after a second real run) rather than
on a matched-row count, which would have passed for a statement that rewrote a row to the same
value. A fourth fixture with `effective_settings` NULL was added — the migration header claims
`?` never matches there and nothing asserted it.

## The dead-letter distinction

The question a `meeting_delete` with no row has to answer is **"will a row ever exist for this
surface?"**, and the queue answers it. `findLiveProvisionJob` looks for a `meeting_provision`
job whose payload matches this surface **whole** (`payload @> {surface_type, surface_id}`) and
whose status is `pending` or `leased`.

- **Found ⇒ handled correctly.** r24's own module header proves the tie: *a delete that finds
  no row must have read before the reservation INSERT*, which happens inside a provisioning
  run — so that run is still in flight, and r24 taught it to compensate its own meeting when
  the surface is retired underneath it. Nothing is left standing and no human is needed. The
  job completes with `deferred_to_provisioner: true` and the job id/status, so an operator can
  still see it removed nothing. It writes nothing — not the row, not Zoom.
- **Not found ⇒ genuine anomaly.** Nothing will create a row and none exists: the delete was
  enqueued for a surface that never had a meeting and never will, or its row went away under
  us. `ZoomDeleteMeetingRowMissingError` exactly as before.

`done`, `failed` and `dead` are deliberately excluded — a job in a terminal status will not run
again, so it can no longer explain the missing row. A **failed lookup throws**: not knowing is
not the same as knowing there is no provisioner, and the benign branch must never be reached by
default.

## Evidence

- `npm run type-check` 0 · `npm run lint` 0 · **`npm test` 4726 passed / 283 files** (from
  4706/282) · `npm run build` 0 · **`npm run test:db` Files=11, Tests=466, PASS** (from 464).
- **Mandatory e2e** (`session-disclosure.ts` was touched): `76 passed`, and
  `e2e-mandatory.mjs --check` reports 6 specs ran with no skips. Run against the local
  ephemeral stack via process env only — `.env.local` points at the remote project and was
  never written to.
- **Mutation probe [P7]**: restoring `continue` on the bucket-summary error path resolves the
  report instead of rejecting (`promise resolved "{ school_id: 77, …(2) }" instead of
  rejecting`) — the defect verbatim. The zero-buckets test kept passing, which is what makes
  it a fix to the error path and not to the feature. Reverted; blob
  `14acc37c76eb3364d428348a0101ce3e230545ab` identical, tree clean.

## Scrutinize hardest

1. **The deferral is a policy change to a job's success semantics.** `meeting_delete` can now
   return success having deleted nothing. The claim that this is safe rests entirely on r24's
   compensation actually being unconditional — if a provisioning path exists that leaves a
   meeting standing without a row, this converts a red job into a green one. That inference is
   read off `meeting-provision.ts`'s module header and its two compensation sites, not proved
   here.
2. **`findLiveProvisionJob` is a read across a race it does not hold a lock over.** Between the
   `findMeetingBySurface` miss and this lookup, the provisioner can finish. That widens the
   deferral window (a just-finished `done` job reads as "no live job" and dead-letters, which
   is the conservative direction), but a reviewer should confirm there is no ordering where it
   fails the other way.
3. **The pgTAP replay trusts the migration-history table.** If someone edits a migration and
   does *not* re-apply it, the test exercises the applied version. CI resets from
   `supabase/migrations` every run, so this is honest there; locally it means `db reset` is
   part of the loop. Whether "what actually ran" or "what is on disk" is the right thing to
   assert is a judgment call worth challenging.
4. **The ledger-query throw was not in the prompt's file:line.** The prompt quoted `:143`
   (`get_bucket_summary`); `:197` (`contract_hours_ledger`) was fixed on the strength of the
   ruling's own wording. That is an expansion beyond the quoted anchor, deliberately made and
   flagged here rather than hidden.
5. **`applySessionMeetingDisclosure` deliberately does not forward the input row's
   `has_meeting`** into `sessionOffersPlatformJoin`, though the predicate accepts it — a
   payload must not assert its own answer. Asserted, but it is a subtle asymmetry with the
   five client-side call sites that *do* pass it.

## Known limitations / open

- **No e2e reaches the managed-session disclosure.** The seeder's sessions are unmanaged
  (item 11's missing managed session), so the new `has_meeting: true` branch is unit-tested
  only. The mandatory specs pass unchanged for that reason.
- **`createSupabaseMeetingDeleteStore`'s other three methods still have no store test.** r27
  added one only for the query it introduced.
- **`SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name, `create.tsx`'s UTC-vs-Chile `min`,
  the four order-dependent suites and `'edit_approval_blocked'`** remain unruled and untouched.

---

# Sol remediation — round r28 (items 11 and 12a, plus the e2e coverage gap)

**Branch** `feat/zoom-sess` · **base** `3e33968d` · **commits** 1

**This is the last code round of phase Z2.** Item 12b — the staging checklist against a real
audio-plan Zoom tenant — is the owner's, was not attempted, was not stubbed, and is not done.

## Objective and scope

Three things, one concern: **make the phase's state legible to whoever reads it next.**

- **The coverage gap** that r23, r25, r26 and r27 each recorded and none was scoped to fix.
- **Item 11** — `PROJECT_STATE.md`, truthfully.
- **Item 12a** — the complete gate run at the final commit.

Out of scope and untouched: item 12b; everything r21–r27 sealed (page-visibility tiers, the
closed set, the disclosure predicate, every authorization rule); the five standing unruled
items (`SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name, `create.tsx`'s UTC-vs-Chile
`min`, the four order-dependent suites, `'edit_approval_blocked'`). No production code was
changed this round — the diff is fixtures, seeder, one new spec, CI env, and docs.

## The coverage gap, stated plainly

`consultor_sessions.is_zoom_managed` is `NOT NULL DEFAULT false`. `scripts/ci/seed-e2e-zoom.mjs`
never wrote it. Therefore **every seeded session was unmanaged, and no e2e test had ever
exercised a Zoom-managed session** — not the join affordance, not §14, not r26's managed
platform links, not r27's managed disclosure.

That is why the mandatory specs kept passing unchanged through four consecutive rounds that
changed managed behaviour. Those rounds are unit-tested and integration-tested. Until this
round they had never been exercised end to end.

## Added, not flipped

A **third** session — `zoom.managedSession`, `e2e00000-…-000000000503` — sits alongside the two
existing fixtures in the same school and the same growth community. `zoom.session` and
`zoom.linkedSession` keep `is_zoom_managed = false`; the seeder now writes the column for all
three rows, so what was defaulted is now stated. Verified against the seeded database:

```
                  id                  | is_zoom_managed |                     meeting_link                     | meeting_provider |   status
--------------------------------------+-----------------+------------------------------------------------------+------------------+------------
 e2e00000-0000-4000-8000-000000000501 | f               |                                                      | zoom             | programada
 e2e00000-0000-4000-8000-000000000502 | f               | https://meet.example.net/e2e-sintetica-enlace-manual | otro             | programada
 e2e00000-0000-4000-8000-000000000503 | t               |                                                      | zoom             | programada
```

The managed row's `meeting_link` is NULL by design (plan §8), not by omission. Its facilitator
is `consultorAssigned` and its expected attendee is `gcLeader` — seeded explicitly, though
`trg_sync_session_attendees_on_gc_change` would enrol the latter anyway, so the join list is
readable off the fixture JSON without knowing the trigger exists.

The seeder's local-only refusal is untouched: `seed-e2e-zoom.mjs` still has no connection path
of its own and still operates on the client `resolveConfig()` (`scripts/ci/seed-e2e.mjs`:41-58)
hands it, which throws on any non-local Supabase host and has no override flag.

## What the managed session now proves end to end

`tests/e2e/zoom-managed-join.spec.ts`, added to `MANDATORY_SPECS`. 12 tests:

| Persona | Page | Join opening (`POST /api/meet/session/[id]/join`) |
|---|---|---|
| `admin`, `consultorAssigned`, `gcLeader` | 200, `meet-join-button` visible, and `meet-join-link` / `meet-no-link` / `meet-join-disabled` / `meet-join-denied` all absent | 200 `{ mode: 'pending' }`, no `join_url`, no `dial_in` |
| `consultorGlobal` (may view, may not join) | 200, `meet-join-denied` with §5's exact copy, no join control of any kind, nothing meeting-shaped in the document | **403** with the same es-CL message |
| `consultorOtherSchool`, `docente`, `inactiveConsultor` | 404, no control of any kind — not even the refusal panel | — |

`meet-no-link` being asserted ABSENT is the load-bearing one: a managed session's
`meeting_link` is NULL, and deciding from that column alone is exactly the defect class r26
fixed on five surfaces and r27 on a sixth. This is the first assertion anywhere that can see
it on the interstitial.

The `403` on the opening is what makes the missing button non-cosmetic: without it, "no button
on the page" is satisfied by a page that merely failed to render one while the opening behind
it still answered anyone who posted at it directly.

## What it still does NOT prove

- **`mode: 'link'` and the dial-in block have no e2e coverage.** No `zoom_internal.zoom_meetings`
  row and no `session_meetings_public` projection are seeded, so the opening answers
  `mode: 'pending'` — §8's provisioning window. That is asserted rather than tolerated (a
  `link` outcome would mean a credential appeared out of a tenant that has none), but it means
  the successful join, the `join_url` hand-off and `buildJoinDialIn` remain unit-tested only.
- **"No raw link in the document" is a weaker assertion here than on the pasted-link session.**
  A managed session has no link on its own row to leak, so what the helper can prove is that
  the page invents none: no Zoom host, no other session's link, no non-null `meeting_link`
  anywhere in `__NEXT_DATA__`. It does not prove a *provisioned* `join_url` would be withheld —
  nothing in the synthetic tenant has one.
- **The §14 kill switch's OFF branch is not covered.** See below.

## §14 — what a single e2e run can and cannot prove

`FEATURE_ZOOM_MEETINGS` is read from `process.env` on every request (`lib/featureFlags.ts`:6),
so it has one value for the lifetime of the server Playwright starts, and a Playwright run has
one server. The e2e environment now sets it **on** (`.github/workflows/ci.yml`, the `.env.local`
step, both the server and the `NEXT_PUBLIC_` name so the two readers cannot disagree inside one
render) — **with it off there is no managed join affordance to assert the existence of at all**,
so criterion [Q2] is unsatisfiable in an environment where the flag is off.

The ON side is therefore covered end to end, and `meet-join-disabled` is asserted absent so a
silently-off flag fails the gate rather than passing as "no button, no problem".

**The OFF side is unreachable within one gate run, and no assertion pretends otherwise.** It
was nevertheless *exercised* this round, as a throwaway probe rather than as coverage — the
same spec re-run with `FEATURE_ZOOM_MEETINGS` unset:

```
  ✘ managed interstitial — admin (may join) › reaches the managed join affordance …
      expect(locator).toBeVisible() failed / Expected: visible / element(s) not found
  ✘ managed join opening — admin (may join) …
      Error: admin was refused the managed join opening   Expected: 200   Received: 503
  ✘ managed join opening — consultorGlobal (may view, may not join) …
      Error: consultorGlobal was let into the managed join opening   Expected: 403   Received: 503
  7 failed / 5 passed
```

The third line is worth reading twice: with the flag off, the persona who would otherwise get
403 gets **503** — the kill switch fires at gate 3, before authorization, exactly as the route's
header claims. That is real evidence about the OFF branch; it is **not** permanent coverage,
because reproducing it means re-running the gate with different env.

Making it permanent would take a **second Playwright `webServer` on another port with the flag
unset**, plus a spec that addresses that origin. That is a real mechanism and it was declined
for this round: adding a second production server to the e2e harness on the phase's last code
round is a larger change to the gate than the coverage is worth right now. Recorded as a debt
in `PROJECT_STATE.md`. Today the OFF branch is covered by
`__tests__/lib/utils/session-meet-access.test.ts`:429-467 and
`__tests__/api/meet/session-join.test.ts`:341-356, and by nothing else.

## Mutation probe — the gap was real

`is_zoom_managed` set to `false` on the seeded row (i.e. exactly what the pre-r28 seeder
produced), spec re-run:

```
  ✘ managed interstitial — admin (may join) › reaches the managed join affordance, and no other join control
  ✘ managed interstitial — consultorAssigned (may join) › reaches the managed join affordance, and no other join control
  ✘ managed interstitial — gcLeader (may join) › reaches the managed join affordance, and no other join control
      expect(locator).toBeVisible() failed / Expected: visible / element(s) not found
```

The affordance is not there, because on an unmanaged session it never was. Restored by
re-running the seeder; the row reads `t` again.

Note what did NOT fail in that probe: the suite's own fixture guard, which reads the JSON
rather than the database. It guards a different lever (a fixture edit that dropped the flag)
and is honest about that.

## Files changed

**Fixtures and seeding (3)**

| File | What changed |
|---|---|
| `scripts/ci/e2e-fixtures.json` | `zoom.managedSession` added; `_comment` explains added-not-flipped. |
| `scripts/ci/seed-e2e-zoom.mjs` | `is_zoom_managed` written for all three sessions; the third seeded through the same `seedSession` path as the other two. |
| `scripts/ci/seed-e2e.mjs` | Header: two sessions → three. |

**Tests and gate wiring (3)**

| File | What changed |
|---|---|
| `tests/e2e/zoom-managed-join.spec.ts` | New. 12 tests. |
| `scripts/ci/e2e-mandatory.mjs` | The new spec added to `MANDATORY_SPECS`. |
| `tests/e2e/helpers/auth.ts` | `E2eZoomFixtures.managedSession`, with `isZoomManaged` typed as the literal `true`. |

**CI (1)** — `.github/workflows/ci.yml`: `FEATURE_ZOOM_MEETINGS` and
`NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS` added to the e2e job's `.env.local` step.

**Docs (2)** — `PROJECT_STATE.md` (item 11), this file.

**No production code was changed.** No migration, no API route, no page, no component, no lib
module.

## Scrutinize hardest

1. **Turning `FEATURE_ZOOM_MEETINGS` on in CI is a behaviour change to the e2e environment, and
   it is mine.** The prompt did not name it. It is forced by [Q2] — the affordance cannot appear
   with the flag off — but it means the e2e gate no longer runs with the production-safe default,
   and it silently enables the provisioning gate and the scheduler's Zoom toggle for any future
   spec. Nothing in the mandatory list exercises either today. A reviewer should decide whether
   the e2e tenant running "flag on" is the right default or whether the two states deserve two
   jobs.
2. **`NEXT_PUBLIC_FEATURE_ZOOM_MEETINGS` was set alongside it, and that is a judgment call.**
   `lib/featureFlags.ts` reads a different variable on the server (`FEATURE_ZOOM_MEETINGS`) than
   in the browser (`NEXT_PUBLIC_…`), so setting only the first makes `pages/admin/sessions/create.tsx`
   compute one answer during SSR and the other after hydration. No spec covers that page, so this
   is prophylaxis, not a fix — and the underlying two-variables-one-switch design is untouched.
3. **The managed session is seeded but never provisioned.** Every assertion about the join
   opening is an assertion about the `pending` outcome. If a reviewer believes the phase's
   central claim is "a facilitator gets a working Zoom link", note that no automated test at any
   level drives that against anything but a fake — which is item 12b's whole point.
4. **`gcLeader` is seeded as an explicit attendee AND would be enrolled by the trigger.** Belt
   and braces, deliberately, so the join list is derivable from the JSON. But it means the spec
   would still pass if the trigger regressed, and `zoom-join-authz.spec.ts` — which relies on the
   trigger for the same persona on the other two sessions — is where that would surface.
5. **`PROJECT_STATE.md` is written in Spanish and I kept it that way.** `CLAUDE.md` puts technical
   docs in English; this file has been Spanish since Fase 0 and rewriting it would have been a far
   larger change than item 11 asked for. Matching the document beat matching the rule; flagged
   rather than hidden.

## Known limitations / open

- **Item 12b is NOT done.** No code in this phase has ever run against a real Zoom tenant. It
  needs real credentials and is the owner's.
- **The dial-in wire shape is documentation-based.** No real audio-plan response has been
  inspected. It fails closed (renders nothing) if the shape differs, but the code is unproven.
- **The four Z2 migrations are not applied to production**, and per the permanent rule from Z1b's
  closing defect the phase is not closed until the production schema is verified directly.
- **`mode: 'link'` and the dial-in block have no e2e coverage**; the §14 OFF branch has none
  either. Both are unit-tested only. See above for what each would cost.
- **`npm run e2e` (bare) is not the phase's evidence and does not pass.** `tests/e2e/` also holds
  legacy QA specs (`reservation`, `completion`, `cancellation`, the proposal flows) that need a
  different seed script, have never run in CI, and are untouched by this phase. The gate is the
  mandatory list, which is what CI runs and what is pasted below.
- **`SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name, `create.tsx`'s UTC-vs-Chile `min`,
  the four order-dependent suites and `'edit_approval_blocked'`** remain unruled and untouched.
- **`createSupabaseMeetingDeleteStore`'s other three methods still have no store test** (carried
  from r27, not addressed here).

## Evidence — item 12a, the complete gate run at the final commit

Local, macOS, against a freshly `supabase db reset` local stack. `.env.local` in this worktree
points at the REMOTE project and was **never written to**: the e2e run gets the local stack and
the two feature-flag values through process env only, mirroring the CI job's `.env.local` step.

| Gate | Command | Result |
|---|---|---|
| 1 | `npm run type-check` | clean |
| 2 | `npm run lint` (`--max-warnings=0`) | clean |
| 3 | `npm test` | **4726 passed / 283 files** (unchanged — this round adds no unit test) |
| 4 | `npm run build` | OK |
| 5 | `npm run test:db` | **PASS — Files=11, Tests=466** |
| e2e | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **88 passed** (from 76) |
| guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | `OK — 7 mandatory spec(s) ran with no skips` (from 6) |

Nothing fell. The only figures that moved are the two this round is supposed to move: the
mandatory e2e count (+12, all from the new spec) and the mandatory spec count (+1).

The verbatim tails are in the executor report for round r28.

---

# Sol re-review remediation — round r29 (M1–M4, m1, m4, m6)

Sol's second pass returned `REQUEST CHANGES`, narrowly: nine of twelve items closed, **four
MAJOR** and six MINOR outstanding. The PM verified all four MAJORs against the code before
dispatching; every one held. This round closes the four MAJORs plus three MINORs (m1, m4, m6).
`getAvailableHours` (m2) and the five standing unruled items — including
`'edit_approval_blocked'`, which swallows its audit-insert error in the same class as R-C — are
**ticketed, not fixed here**, by explicit PM ruling.

Branch `feat/zoom-sess`, on top of `bf7e7043`. No migration; no schema change.

## R-A / M1 — the THIRD window: a checkpointed meeting survives a green delete

**The chain, exactly as Sol described it and as the code confirms.** Reservation INSERT →
`createMeeting` succeeds → the post-create checkpoint lands → the attempt dies **retryably** →
the session is cancelled → `meeting_delete` claims, finds the **numberless** `pending` row, and
because `row.zoom_meeting_number !== null && …` is false it **skips the Zoom call entirely**,
marks the row `deleted`, **clears `last_error`** and completes **green** → the provision retry
reaches the eligibility gate, where `strandedCheckpoint` required
`ZOOM_MEETING_ACTIVE_STATUSES.includes(held.status)` and the row is now `deleted`. False. The
job walked away terminal under `session_ineligible` — a reason that reads as *handled*.

End state before this round: **cancelled session, live Zoom meeting, green delete job, green
provision job, no loud marker anywhere.** That is the item-5 harm verbatim, in exactly the
crash-shaped case the third compensation site was added to close. It also disproves r27's
stated premise that r24's compensation is unconditional.

**The fix** (`lib/zoom/jobs/meeting-provision.ts`, eligibility gate). The status predicate is
widened from ACTIVE-only to ACTIVE **or** `RETIRED_MEETING_STATUSES` (`cancelled`/`deleted`):

- A **numberless** row retired by a delete is the row whose retirement *proves* Zoom was never
  called — the delete had nothing it could name. The checkpoint is then the only record of the
  meeting, and this retry is the last process that can act on it.
- The compensating Zoom DELETE is issued. **The release/republish is not**: the existing
  re-read inside `compensateOrphanedMeeting` only retires a row that is still ACTIVE, so an
  already-retired row is left exactly as its writer left it. Asserted, not assumed — the test
  pins `releaseReservation` and `syncProjectionFromMeeting` call counts across the retry.
- `error` is deliberately still excluded: it is a provisioner's own definite-failure record,
  not a decision about the surface, and a create landing on one stays `possible_orphan`.
- **Ambiguous-park precedence is unchanged.** `!isAmbiguousCreateMarker(held.last_error)`
  still gates the whole branch, now asserted on a RETIRED row as well as a `pending` one.

**The module header's "There is no third window" claim was false and is corrected.** It now
says what is true: the two in-attempt re-checks close the window *within* an attempt and do not
close it *across* attempts, and the eligibility gate is the third site for exactly that reason.

## R-B / M2+m3 — three more swallowed reads, in the function r27 repaired

`lib/services/school-hours-report.ts` destructured only `data` on three reads above the ones
r27 fixed: `schools`, `clientes`, `contratos`. A failed `clientes` read coalesced to `[]` and
returned `{ programs: [] }` — **a 200 whose whole-school report shows zero contracts and zero
hours, pixel-identical to a school with nothing billed.** A failed `schools` read became a 404
"Escuela no encontrada" for a school that exists.

All three now destructure `.error` and throw, copying the convention the function already uses
(`console.error` with the PostgREST object, es-CL message naming the school). One deliberate
exception, called out because it is a judgment call: on `schools` the `.single()` **PGRST116**
(zero rows) is *not* treated as a failed read — it is the honest 404 this function has always
returned, and turning it into a 500 would be a behaviour change nobody asked for.

Legitimate-empty still works and is asserted: a school with genuinely no clientes, and one with
no contratos, both return a valid empty report.

**The framing Sol is right about:** the PM's r27 prompt quoted specific line anchors and the
round stayed on them. That is the PM's error, not r27's.

## R-C / M3 — a failed read gave a session the wrong MONEY status

`lib/services/hour-tracking.ts` read `hour_types.modality` without `.error`. On a failed read
`modality` stayed at its `'online'` initialiser, so a **`presencial`** session cancelled 120 h
out was evaluated under online thresholds — **clause 1 (`devuelta`, consultant unpaid) instead
of clause 4 (`penalizada`, consultant paid)** — and that status was written durably to the
ledger row, indistinguishable afterwards from a correct one.

PM ruling, which Sol explicitly asked to be made explicitly: **fixed now**, not ticketed.
Pre-existing is not a defence when the harm is a wrong billing status persisted to a ledger
row. The read now throws; nothing has been written at that point, so the caller gets a 500 (the
route wraps the whole handler in try/catch) and the ledger gets nothing.

Same PGRST116 carve-out as R-B, and for the same reason: a key with no matching row keeps the
pre-existing fallback. That path is unchanged and is pinned by a test so the next reader can
see it was left alone on purpose.

`getAvailableHours` (m2) is **untouched**, per the prompt.

## R-D / M4 — `PROJECT_STATE.md` said four migrations; the branch carries seven

`git diff --name-only main...HEAD -- supabase/migrations/` returns seven. `PROJECT_STATE.md`
said "cuatro migraciones" in the phase summary, the deploy-blocking debt and the phase-close
checklist. **An operator following that checklist applies four and misses
`apply_session_reschedule` and both bucket-summary functions. Production code then calls RPCs
that do not exist there, and every duration-relevant reschedule 500s.** The Z1b closing defect,
re-armed by the very document that records the permanent rule against it.

Every occurrence is corrected, and — per Sol, and the PM agrees — **the count is replaced with
an explicit per-file manifest** in the deploy-blocking debt, as a checklist that is ticked file
by file, with `git diff --name-only main...feat/zoom-sess -- supabase/migrations/` named as the
source of truth for verifying it stays complete. A count drifts silently; a list of filenames
does not.

DoD verified: `grep -c "20260808\|20260809" PROJECT_STATE.md` = **3** (≥ 3), and the manifest
diffs **byte-identically** against the git output.

## R-E — the three MINORs closed

- **m1** — the "a failed compensation keeps `pending`, so the §9 EXCLUDE keeps blocking the
  host" claim was **true for one trigger and false for the others**: on a CAS-miss-on-retired-row
  (and now on the new eligibility-gate retirement) the row is already `cancelled`/`deleted`, so
  no host is blocked while a possibly-live meeting stands. The claim is **qualified where it is
  written** — module header, `ZoomCompensationFailedError`'s doc, and the operator-facing
  message itself, which now says which of the two situations it is. The parking is **not**
  restructured: the mechanism is unchanged, and the only new input is a `holdsReservation`
  boolean that selects the honest sentence.
- **m4** — `pages/api/sessions/edit-requests/[eid].ts` passed no `if_updated_at`, leaving the
  RPC's purpose-built, pgTAP-proven guard unused while the path relied on a racy JS old-value
  comparison made against a row read several statements earlier (the whole facilitator
  revalidation sits in between). It now passes `session.updated_at` and handles the conflict
  **exactly as the admin PUT does**: 409, `code: 'SESSION_CONFLICT'`, and the row the RPC
  returned. One pre-existing r21 assertion (`p_if_updated_at: null`) encoded the gap and is
  updated with a comment saying why.
- **m6 — WHERE THE §5 AMENDMENT LIVES, for a branch-only reader.** Six shipped artifacts on
  this branch cite "plan §5, amended 2026-08-06 by owner decision":
  `lib/utils/session-meet-access.ts:8`, `pages/meet/session/[id].tsx:43`,
  `tests/e2e/zoom-managed-join.spec.ts:223`, `tests/e2e/zoom-join-authz.spec.ts:126`,
  `__tests__/lib/utils/session-meet-access.test.ts:323`,
  `__tests__/pages/meet/session-managed-join.test.tsx:150` — plus this file (§ RULING A) and
  `fase-5-pm-dossier.md:370`. **The amendment itself is NOT on this branch.** The branch copy
  of `docs/plan/zoom/PLAN.md:137` still carries the pre-amendment sentence ("…and the `/meet`
  pages' getServerSideProps"); the amended line and its full rationale block, and the r1–r28
  ledger, are on `main` (`git show main:docs/plan/zoom/PLAN.md`, around line 137).
  **PM ruling: `main` is deliberately NOT merged into the branch this round** — it would muddy
  the fix diff Sol re-reviews. Merging brings the amendment with it. A reviewer reading only
  this branch should treat `git show main:docs/plan/zoom/PLAN.md` as the authoritative §5.

## Files changed

| File | Δ | Why |
|---|---|---|
| `lib/zoom/jobs/meeting-provision.ts` | +98/−23 | R-A widened predicate; header "no third window" corrected; m1 qualification + `holdsReservation` |
| `lib/services/school-hours-report.ts` | +32/−3 | R-B: three reads throw on `.error` |
| `lib/services/hour-tracking.ts` | +20/−1 | R-C: `hour_types` read throws on `.error` |
| `pages/api/sessions/edit-requests/[eid].ts` | +21/−1 | m4: `if_updated_at` + 409 conflict handling |
| `PROJECT_STATE.md` | +12/−4 | R-D: seven-file manifest replaces the count, in all four places |
| `__tests__/lib/zoom/jobs/meeting-provision.test.ts` | +237 | R1 interleaving, R3 precedence ×2 |
| `__tests__/lib/services/school-hours-report.test.ts` | +80 | R4, per read + legitimate-empty |
| `__tests__/lib/services/hour-tracking-cancellation.test.ts` | +274 (new) | R5, the first suite to execute `executeCancellation` |
| `__tests__/api/sessions/reschedule-hours-sync.test.ts` | +71/−1 | R7 |

## Evidence — the complete gate run

Local, macOS. **Unlike r28, `.env.local` WAS written** for the e2e gate: it was backed up,
replaced with the CI job's local-stack block verbatim, and restored afterwards (`diff` against
the backup: identical, confirmed before commit). The local stack already had every migration
applied — `supabase db reset` was **not** run, and `scripts/ci/seed-e2e.mjs` is idempotent and
hard-refuses a non-local host. Production was never touched.

| Gate | Command | Result |
|---|---|---|
| 1 | `npm run type-check` | clean (exit 0) |
| 2 | `npm run lint` (`--max-warnings=0`) | clean (exit 0) |
| 3 | `npm test` | **4740 passed / 284 files** (from 4726 / 283 — **+14 / +1**, nothing fell) |
| 4 | `npm run build` | OK (exit 0) |
| 5 | `npm run test:db` | **PASS — Files=11, Tests=466** (unchanged; no pgTAP added) |
| e2e | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **88 passed** (unchanged) |
| guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | `OK — 7 mandatory spec(s) ran with no skips` |

The +14 is exactly this round's tests: 3 provision, 4 school-hours-report, 5 hour-tracking
(new file), 2 reschedule-hours-sync.

### Mutation probe on R-A (the criterion that makes R1 mean something)

Restored the ACTIVE-only guard (`heldStatusCompensable` back to
`ZOOM_MEETING_ACTIVE_STATUSES.includes(held.status)`) and re-ran R1 alone:

```
AssertionError: expected [ { id: 82000000001, …(11) } ] to deeply equal []
- Array []
+ Array [ Object { "id": 82000000001, "topic": "Sesión de acompañamiento — Ciclo 2", … } ]
```

The failure prints **the live Zoom meeting the fake is still holding** — the harm itself, not a
call count. Reverted; `git hash-object lib/zoom/jobs/meeting-provision.ts` is
`6d05ac5aa8c05ea28c76d6b1463bc86a2491865f` **before and after**, so the revert is byte-identical.

The R-B guards were probed the same way (all three disabled at once ⇒ exactly those 3 tests
fail, 16 pass), so each read's assertion bites on its own read.

## What a reviewer should scrutinise hardest

1. **The widened predicate's blast radius.** `cancelled` and `deleted` now reach
   `compensateOrphanedMeeting` from the eligibility gate. The claim is that a **numberless**
   retired row plus a checkpoint naming *that* row can only mean "a delete retired a
   reservation Zoom never heard about". Look for a fourth way a row reaches
   `cancelled`/`deleted` with a NULL number while a checkpoint for it is live — the release
   inside `compensateOrphanedMeeting` itself is the one worth chasing.
2. **The PGRST116 carve-outs in R-B and R-C.** Both are deliberate and both are behaviour
   preservation, not fix avoidance. If you think a `hour_type_key` with no matching row should
   also fail the cancellation, that is a real finding — it just is not this one.
3. **m4 and the JS old-value comparison.** The guard now runs inside the transaction, but the
   JS comparison above it was left in place. Two overlapping guards with different failure
   copy (409 "el valor actual de X ha cambiado" vs 409 `SESSION_CONFLICT`) is a UX seam worth a
   ruling.
4. **`holdsReservation` is what the caller LAST KNEW.** At the post-create re-check it is
   passed `true` because this attempt placed the reservation and nothing since has moved it —
   but a delete could retire the row between that read and a failed compensation. The value is
   the best knowledge available at the call, not a re-read, and it only selects a message.
5. **The manifest in `PROJECT_STATE.md`.** It is now the operator's checklist. Verify it
   against `git diff --name-only main...feat/zoom-sess -- supabase/migrations/` yourself rather
   than trusting the DoD line above.

## Known limitations / deferred

- **`getAvailableHours` (`hour-tracking.ts:223`, Sol m2)** — untouched by ruling; display-only,
  does not change billed amounts; standing backlog.
- **`'edit_approval_blocked'`** — its audit insert swallows its error, the same class as R-C.
  **Ticketed, not fixed here**, by explicit PM ruling in the round prompt.
- The five standing unruled items (`SESSION_STATUS_FALLBACK`, `total_hours_actual`'s name,
  `create.tsx`'s UTC-vs-Chile `min`, the four order-dependent suites, and the above) remain
  unruled and untouched, as do `createSupabaseMeetingDeleteStore`'s three untested methods.
- **Item 12b** (staging against a real Zoom tenant with an audio plan) is unchanged and still
  blocks phase close. Nothing in this round was exercised against a live tenant.
- **`main` is not merged into this branch** — see m6 above for where the §5 amendment lives.

---

# Sol round-3 notes — round r30 (MINOR 1, MINOR 2)

Branch `feat/zoom-sess`, base `796294cc`, one commit. Two files:
`lib/zoom/jobs/meeting-provision.ts`, `__tests__/lib/zoom/jobs/meeting-provision.test.ts`.
Phase Z2 is already APPROVED WITH NOTES; this closes the two MINORs the PM ruled fix-now.

## MINOR 1 — the failed-compensation message no longer claims a host slot

Sol's option B, the state-neutral one. `holdsReservation` recorded what the caller knew
*before* awaiting the Zoom DELETE, and a concurrent `meeting_delete` can retire the numberless
row while that request is in flight — so "keeps blocking its host" could be read after it
stopped being true. The failure copy now names the Zoom meeting number and the one required
action and asserts nothing about the host slot:

- **before:** `… — CANCEL IT AT ZOOM; the reservation is parked and keeps blocking its host
  until you do.` / `… the row was ALREADY retired, so NOTHING is blocking that host — the
  marker names the meeting but the slot is bookable now.`
- **after:** `… — CANCEL ZOOM MEETING <n> AT ZOOM. That is the whole action: no database
  change is needed, and this job will not retry it.`

**`holdsReservation` was REMOVED**, parameter and all three call sites. It was read in exactly
one place — the ternary above — so with a state-neutral sentence nothing reads it, and the
round prompt rules that out over leaving a dead parameter. No re-read was added on the error
path: it would move the staleness rather than remove it.

Behaviour is unchanged: the park, the preserved status, the durable marker, `meeting_delete`'s
refusal to release a parked row and the ambiguous-park precedence all still hold, and are
asserted rather than assumed ([L5], [L5b]).

New test **[L5b]** puts the already-retired row through a FAILED compensation, so the one
sentence is asserted on both paths. The shared helper
`expectStateNeutralCompensationCopy` asserts the number-and-action clause is present and that
`/blocking|bookable|reservation|host/i` appears nowhere in the message — a regression that
reintroduces either branch fails there rather than in a reviewer's reading of the diff.

## MINOR 2 — the numberless precondition now has a negative control

New test **[R4]**: an ineligible session, a retired row **carrying** `zoom_meeting_number`, and
a matching created checkpoint. It is built by running the REAL `meeting_delete` handler first
(it finds the number, calls Zoom, retires the row, publishes `cancelled`), so the "other
writer that did call Zoom" is an actual writer rather than a seeded literal, and the projection
asserted unchanged is one something really published. The provision retry then arrives with the
[R1] checkpoint and must issue **no** second DELETE, leaving row and projection as the delete
left them.

**Mutation probe.** Deleting `held.zoom_meeting_number === null` from the `strandedCheckpoint`
predicate previously passed all 116 tests in this suite. It now fails, and fails only [R4]:

```
AssertionError: expected "deleteMeeting" to be called 1 times, but got 2 times
 FAIL  __tests__/lib/zoom/jobs/meeting-provision.test.ts > [R4] THE NEGATIVE CONTROL …
 Test Files  1 failed (1)
      Tests  1 failed | 117 passed (118)
```

Reverted by restoring the pre-mutation copy; `git hash-object` on the file returns
`b0540c71e6c597f37f659ca526a0136e48ced6c7` before and after, and the tree carries only the two
intended files.

## What a reviewer should scrutinise

1. **The `not.toMatch(/blocking|bookable|reservation|host/i)` assertion.** It also constrains
   the interpolated Zoom error text (`message.slice(0, 200)`), which is a real Zoom string in
   production. It is fixed in these tests, so the assertion is about our copy — but a future
   test whose fake error mentions a host would fail here for the wrong reason.
2. **[R4]'s reliance on the real `meeting_delete`.** It buys a genuine projection and a genuine
   retirement, at the cost of coupling this test to that handler. If `meeting_delete` ever stops
   preserving `zoom_meeting_number` on retirement, [R4] stops testing what it says.
3. **Removing `holdsReservation` rather than keeping it.** Nothing reads it now, but it also
   removes the only place the two triggers were distinguished at the call site. If a future
   round wants that distinction back it must re-derive it.
4. **The e2e gate needed a rebuild against the local stack.** `zoom-mock-mode`'s negative
   controls spawn `next start` on 3101 and reuse the gate's production build; the local
   Playwright config serves the dev server, which clobbers `.next`. Run with `CI=1` (as CI
   does) or that spec fails for environmental reasons. Not a code finding — recorded so the
   next executor does not chase it.

## Gates

type-check 0 · lint 0 · **4742 passed / 284 files** (+2, baseline 4740/284) · build ✓ ·
`test:db` **Files=11, Tests=466, PASS** · mandatory e2e **88 passed, 7 specs**, no-skip guard
OK. Suite `meeting-provision.test.ts`: 116 → 118.

## Known limitations

- Nothing else in §3's out-of-scope list was touched, and no defect was found in passing.
- No migration, no SQL, nothing run against any non-local database.

---

# Merge with `main` — round r31

Phase Z2 was already code-complete and Sol-approved at `4be9f7d6`. PR #45 could not be
tested by CI at all, because GitHub reported it `CONFLICTING`: `main` had moved 136 commits
since the branch forked. This round merges `origin/main` into `feat/zoom-sess` and resolves
the conflicts. **No feature behaviour changed** — the only hand-written lines in the merge
are the three resolutions below.

Merge commit: `44f503bb` (`origin/main` = `781ae16d`, merge-base `e796646d`).

## The three resolutions — all unions, no side dropped

All three conflicts are in shared CI fixtures that both workstreams appended to, at the same
place in each file. None was a semantic clash, so none required picking a winner.

1. **`scripts/ci/e2e-mandatory.mjs`** — Z2's r28 added `zoom-managed-join.spec.ts`; the
   pasantías/A6/A8 workstream added `pasantias-page`, `footer-heading-order`,
   `pasantias-form` and `pasantias-leads-admin`. Both sides' entries kept, Zoom's first so
   it stays adjacent to the other Zoom specs, each with its original explanatory comment.
   The list went 7 → 11 entries; nothing was renumbered or reordered away.
2. **`scripts/ci/e2e-fixtures.json`** — the only conflicting region was the `_comment`
   preamble. Both notes kept, separated by a blank line. The data blocks themselves did not
   conflict and both survive: Z2's `zoom.managedSession` (`isZoomManaged: true`) and A8's
   top-level `pasantiasLead`. A8's comment explains why its block must stay top-level rather
   than under `users` (`assertFixtureRosterComplete()` requires `users` and
   `DECLARED_FIXTURE_KEYS` to be set-equal) — that constraint is preserved.
3. **`scripts/ci/seed-e2e.mjs`** — conflict confined to the header docblock's inventory
   list. Kept A8's "one Pasantías interest lead" bullet **and** Z2's rewording of the Zoom
   bullet from two sessions to three. A8's `ensurePasantiasLead()` and its call site landed
   in non-conflicting regions and were not touched. The script's hard refusal to run against
   a non-local Supabase host is unchanged (`LOCAL_HOSTS`, seed-e2e.mjs:41-56).

`.github/workflows/ci.yml` auto-merged cleanly, as the PM predicted.

## Final mandatory spec list (11)

```
tests/e2e/smoke.spec.ts
tests/e2e/ci-fixture.spec.ts
tests/e2e/zoom-join-authz.spec.ts
tests/e2e/session-disclosure.spec.ts
tests/e2e/session-ical.spec.ts
tests/e2e/zoom-mock-mode.spec.ts
tests/e2e/zoom-managed-join.spec.ts
tests/e2e/pasantias-page.spec.ts
tests/e2e/footer-heading-order.spec.ts
tests/e2e/pasantias-form.spec.ts
tests/e2e/pasantias-leads-admin.spec.ts
```

## Gates on the merged tree

type-check 0 · lint 0 · **6773 passed / 290 files** (baseline 4742/284 — the rise is
`main`'s own tests; nothing that passed before fails) · build ✓ · `test:db` **Files=11,
Tests=466, PASS** (identical to baseline) · mandatory e2e **112 passed / 11 specs**
(baseline 88/7), no-skip guard **OK — 11 mandatory spec(s) ran with no skips**.

The guard's exit code was captured directly rather than piped through `tail`, per the
standing rule that `cmd | tail; echo $?` reports tail's status.

## Feature diff unchanged

`git diff 4be9f7d6 HEAD` over `lib/zoom/**`, `lib/utils/meeting-*`,
`lib/services/{billable-hours,session-lifecycle-notifications,school-hours-report,hour-tracking}.ts`,
`pages/api/meet/**`, `pages/meet/**` and `supabase/migrations/**` is **empty**. The diff Sol
reviewed has not moved. The merge brought in **no** migrations (0 files under
`supabase/migrations/`).

## Anything unexpected the merge brought

Nothing that changed behaviour. Two things worth recording:

- **`PLAN.md` §5's owner-authored amendment (`50c28855`) arrived as expected**, which is what
  closes Sol's **m6** — the branch's code headers already cited it.
- **The local Supabase stack needed no `db reset`.** `supabase migration list` showed every
  one of the 17 migrations already applied, and the merge added none, so the schema the specs
  ran against is exactly what `supabase/migrations` declares. CI still does a full
  `db reset`; this is a local shortcut only, taken to avoid destroying local data.

## Known limitations

- `main`'s 136 commits of pasantías/A6/A7/A8 work were neither reviewed nor adjusted — out of
  scope for this round by instruction.
- Nothing was run against any non-local database. No migration was written or applied.
- `.env.local` was rebuilt the way `ci.yml` does for the e2e gate, then restored; the restore
  is verified by sha256 against the pre-round value. It was never printed or committed.
