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
