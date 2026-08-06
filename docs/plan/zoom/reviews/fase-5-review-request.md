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
