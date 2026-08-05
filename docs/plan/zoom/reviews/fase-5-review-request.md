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
