# B2a — Network-supervisor product repair — Review Request

- **Batch**: B2a (Santa Marta remediation series; NOT a GENERA itinerary phase)
- **Branch**: `fix/red-super`
- **Worktree**: `/Users/brentcurtis/dev/wt/red-super`
- **Base**: `a28eebc9152565cd8b287fe12e8679c2ab783137` (origin/main, the PR #55 QA-foundation merge — verified exact before branching)
- **Round-1 implementation head**: `9d71dfef` (`fix(networks): repair supervisor management, fail closed (B2a)`); round-1 docs commit `09765566` — the head Codex reviewed
- **Correction round**: Codex returned **REQUEST CHANGES** on `09765566`. The reviewed commits are untouched; the corrections land as NEW commits on top — one implementation commit (migration + concurrency proof + audit + copy + tests) and the documentation commit that carries this update (a document cannot cite the SHA of the commit that contains it; `git log a28eebc9..HEAD` shows all four)
- **Status**: REVIEW READY — correction round 1 complete, awaiting Codex re-review. NOT approved. Nothing pushed, no PR, no merge, no deployment, no production access.

## Objective

Repair the network-supervisor management surface end to end: supervisor assignment
and removal, the `GET /api/admin/networks` listing that reported every supervisor
list empty, fail-closed error handling for every affected database lookup, and the
one-active-network-per-supervisor rule — proven against the real local application
and the seeded synthetic tenant, with a cross-network negative control.

## The defects, as found at the base SHA

1. **Pseudo-service-role client.** Both endpoints built their "admin" client as
   `createServerSupabaseClient({req,res}, { supabaseKey: SERVICE_ROLE_KEY })`. That
   auth-helpers construction sets the `apikey` but keeps sending the **caller's
   session JWT** as the bearer, so PostgREST resolved `authenticated`, not
   `service_role`. `user_roles` has no admin-read policy (only `read_own_roles` and
   the community-member view), so every supervisor read about *other* users came
   back empty — silently.
2. **Swallowed errors everywhere.** Every lookup destructured only `{ data }`. A
   failed query was indistinguishable from "not found" (assignment answered 404) or
   from "no conflict" (the duplicate/other-network checks fell through, fail open).
   The GET listing converted a failed supervisor query into `supervisors: []` /
   `supervisor_count: 0`.
3. **Wrong column.** Assignment selected `redes_de_colegios(name)` twice; the real
   column is `nombre`. The query always errored, the error was discarded, and every
   assignment returned 404 "Red no encontrada". The same wrong column inside the
   other-network embed meant the one-active-network rule **never fired**.
4. **Nonexistent column written.** Removal (whose lookup had already been repaired
   on main) still wrote `updated_at` on `user_roles`, a column the table does not
   have (`supabase/migrations/00000000000000_baseline.sql:11380`), so PostgREST
   rejected the update (PGRST204) and every removal 500'd. The update result was
   never checked either.

`tests/e2e/ci-fixture.spec.ts` had documented defect #1 verbatim as "reported as a
product finding, not repaired here"; this batch is that repair.

## What changed

- **Authorization** (both endpoints): `checkIsAdmin()` from `lib/api-auth.ts`
  authenticates the caller and verifies an ACTIVE admin role via the service
  client. Anonymous → 401. Authenticated non-admin (supervisor_de_red included) →
  403. Privileged queries then run on `createServiceRoleClient()` —
  `createClient(url, SERVICE_ROLE_KEY)` with no request-derived headers, so the
  caller's JWT can never reach PostgREST on the privileged path. This is the same
  pattern `assign-role.ts` and the rest of the modern admin routes already use.
- **GET /api/admin/networks**: one batched supervisor query for all networks
  (`.in('red_id', ids)`, active `supervisor_de_red` only, `profiles:user_id`
  disambiguated embed), with its error CHECKED → 500 on failure, never fake-empty
  data. `supervisor_count` is derived from the returned list, so the two cannot
  disagree. Response shape unchanged (the management UI consumes it as-is).
- **POST (assign)**: uuid-format validation (400); network lookup on `nombre` with
  `maybeSingle()` distinguishing 404 from 500; user lookup likewise; ONE
  error-checked query of the target's active supervisor roles backing both rules —
  duplicate-same-network → 409 naming the network, any other active supervisor
  role → 409 naming the *other* network ("Un usuario solo puede supervisar una red
  a la vez"); then the repaired `assignSupervisorRole()` helper performs the grant;
  cache refresh (`refresh_user_roles_cache`) on success, non-fatal, mirroring the
  removal path and `assign-role.ts`.
- **DELETE (remove)**: kept the repaired lookup; the deactivation payload is now
  exactly `{ is_active: false }` (mirroring `remove-role.ts`), followed by
  `.select('id')` read-back — an update that errored OR matched no rows is a 500,
  fail closed. The role row is deactivated, never deleted (audit history kept).
  Cache-refresh behavior preserved (non-fatal, logged).
- **utils/roleUtils.ts › assignSupervisorRole**: every lookup error-checked with a
  typed `failure` discriminator (`network_lookup_failed` vs `network_not_found`,
  `role_lookup_failed`, `duplicate`, `other_network`, `insert_failed`, `not_admin`,
  `unexpected`) so the API maps honest statuses; the one-active-network rule is now
  enforced in the helper as well as the route; the insert writes only real
  `user_roles` columns. Only this helper was touched in the file.

## Scope

**In**: `pages/api/admin/networks/index.ts`,
`pages/api/admin/networks/supervisors.ts`, the directly-used supervisor helper in
`utils/roleUtils.ts`, focused unit/API tests, one mandatory Playwright spec (plus
its registration in `scripts/ci/e2e-mandatory.mjs`), a comment-only update to the
now-stale defect note in `tests/e2e/ci-fixture.spec.ts`, this document, and one
factual PROJECT_STATE.md status line.

**Out** (deliberately untouched): `middleware.ts`; Supabase migrations (no schema
change of any kind); reporting tabs/APIs; the network CRUD handlers' own internal
lookups (see Known limitations); the sibling endpoints
`supervisors-simple.ts` / `schools.ts` / `all-schools*.ts`; the QA roster/topology
(`e2e-fixtures.json`, `seed-e2e.mjs` — untouched); CI configuration; other Santa
Marta batches.

## Files changed, by risk

**Higher risk (product authorization + data paths)**
- `pages/api/admin/networks/index.ts` — auth plumbing replaced; GET supervisor
  query rebuilt fail-closed; CRUD handlers' internal logic untouched but now run
  on the genuine service client (they previously ran under the caller's JWT).
- `pages/api/admin/networks/supervisors.ts` — auth plumbing replaced; POST/DELETE
  repaired as above.
- `utils/roleUtils.ts` — `assignSupervisorRole` only (helper used by the POST).

**Medium risk (gate mechanics)**
- `scripts/ci/e2e-mandatory.mjs` — one appended entry; the list is add-only.

**Lower risk (tests + docs)**
- `__tests__/api/admin/networks-index.test.ts` (new, 8 tests)
- `__tests__/api/admin/networks-supervisors.test.ts` (rewritten around the new
  auth plumbing; keeps the pre-existing DELETE regression intent, adds the POST
  and authorization matrices — 27 tests)
- `__tests__/utils/roleUtils.assignSupervisorRole.test.ts` (new, 7 tests)
- `tests/e2e/network-supervisors.spec.ts` (new mandatory spec, 11 tests)
- `tests/e2e/ci-fixture.spec.ts` (comment-only; zero behavior change)
- `docs/planning/reviews/fase-b2a-review-request.md`, `PROJECT_STATE.md`

Diffstat at the implementation head: 9 files, +1816 / −217.

## Test evidence — round 1, historical (at head `9d71dfef`)

> The correction round re-ran every gate; the CANONICAL current counts live in
> the **Correction round 1** section at the end of this document. This section
> is kept as the accurate record of what was measured at the reviewed head.

Fail-on-old, measured by checking out ONLY the three product files at
`a28eebc9` with the new tests in place:

- Unit: `npx vitest run __tests__/api/admin/networks-index.test.ts __tests__/api/admin/networks-supervisors.test.ts __tests__/utils/roleUtils.assignSupervisorRole.test.ts`
  → **42/42 FAIL at base**, **42/42 pass at head**.
- E2E: `CI=1 npx playwright test tests/e2e/network-supervisors.spec.ts --project=chromium --retries=0`
  against a production build of the base product code, seeded stack →
  **4 failed / 4 did-not-run (serial chain) / 3 passed**. The failures are exactly
  the defect signature: empty supervisor listing, 404-instead-of-400 on malformed
  ids, 404 on assignment, no supervisor rendered in the UI. The 3 passes are the
  auth-boundary tests (401/403/my-roles), which the old code also satisfied — they
  pin invariants, not the defects.

Gates at the head (in run order):

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run type-check` | clean |
| Lint | `npm run lint` | clean, zero warnings |
| Migration guards | `npm run guard:migrations` | OK (37 migration files; no RLS-disable, no destructive DDL) |
| Browser boundary | `npm run guard:browser` | OK (1149 files, 694 modules, 516 entrypoints) |
| Unit (full) | `npm test` | **368 files, 8384 passed, 11 skipped** (run began with no `.env.local`, matching CI's unit gate) |
| pgTAP / RLS | `npm run test:db` | **21 files, 1433 tests, PASS** |
| Build (production) | `npm run build` | success; `node scripts/check-price-leak.mjs` OK (262 files) |
| Mandatory e2e | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **188 passed, 0 skipped, 0 flaky** (JSON report `stats`: expected 188, unexpected 0) |
| No-skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | OK — 13 mandatory specs ran with no skips |
| Hygiene | `git diff --check` | clean |

The e2e leg reproduced CI gate 4 exactly: `supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,supavisor,pooler`,
`supabase db reset` (all 37 migrations from scratch), `.env.local` generated from
`supabase status -o json` per the ci.yml recipe (local URLs only), production
build, `node scripts/ci/seed-e2e.mjs`, then the mandatory list under `CI=1`
(production server, workers=1, JSON report).

## Browser/API acceptance evidence (real app, seeded local stack)

All via `tests/e2e/network-supervisors.spec.ts` (11/11 passed, first attempt):

- Anonymous GET/POST/DELETE → **401**; authenticated `networkSupervisor` persona →
  **403** on all three methods (a supervisor cannot grant supervision, not even to
  themself).
- Admin `GET /api/admin/networks` → primary network (`Red Sintetica E2E`) lists
  the canonical synthetic supervisor; secondary (`Red Sintetica E2E Norte`)
  reports `supervisors: []` and `supervisor_count: 0`; every network's
  `supervisor_count` equals its list length.
- Assignment lifecycle on an **isolated synthetic candidate** (created by the
  spec, RFC 2606 address, no password, purged afterwards): assign to primary →
  **201** naming the real network; duplicate → **409**; assignment to the seeded
  secondary network while the primary role is active → **409** ("una red a la
  vez") and the secondary network still displays no supervisor; removal → **200**,
  and a service-client read-back shows the role row **deactivated, not deleted**
  (`is_active: false`, red_id primary); second removal → **404**.
- Canonical supervisor's `/api/auth/my-roles`: active roles exactly
  `['supervisor_de_red']` with `red_id` = the primary network id only.
- Browser UI: `/admin/network-management` as admin renders both network cards;
  the primary card shows "Supervisora Red Sintetica"; the secondary card shows no
  supervisor (name text absent).
- Post-run hygiene, verified via service client: 0 candidate auth users,
  0 candidate profiles, 0 candidate role rows; secondary network 0 active
  supervisors; primary network exactly 1.

## Data and environment confirmations

- **Synthetic data only.** Every account, network, school and candidate involved
  is the seeded synthetic tenant (RFC 2606 domains, invented names) or a
  spec-created synthetic candidate on the ephemeral local stack. No student or
  staff PII anywhere (Ley 21.719). No QA passwords appear in this document, in
  test output, or in commits — credentials live only in `scripts/ci/e2e-fixtures.json`.
- **Local only.** All tests ran against the local Supabase stack
  (`127.0.0.1:54321/54322`) freshly reset from migrations. The new spec refuses
  non-local Supabase hosts at module load, like `auth-lifecycle.spec.ts`.
- **Nothing pushed, no PR opened or modified, no merge, no deployment, no
  production access or writes of any kind.** The branch exists only in the local
  worktree.

## Known limitations / deferred

1. The network CRUD handlers in `index.ts` (create/update/delete network) keep
   their five pre-existing `{ data }`-only lookups (lines 227, 300, 312, 372, 383
   at the head) — including delete-network's active-supervisor guard. They are
   OUT of B2a scope ("unrelated network-management features") and unchanged in
   behavior except that they now run on the genuine service client. A follow-up
   batch should fail-close them; flagged rather than silently absorbed.
2. `GET /api/admin/networks/supervisors` (available-users listing) logic is
   untouched; the management UI uses `supervisors-simple.ts` for that modal, which
   is also out of scope and was not repaired or audited here.
3. ~~The one-active-network rule is enforced at two application layers but not by
   a database constraint — a concurrent-admin race could in principle
   double-assign.~~ **CLOSED in correction round 1**: migration
   `20260827150000_one_active_supervisor.sql` adds the partial unique index
   `uq_user_roles_one_active_supervisor` (DB-agent authored, additive, with a
   read-only fail-closed preflight that reports pre-existing duplicates instead
   of touching them); its 23505 maps to HTTP 409; proven by pgTAP `060`, a
   two-session concurrency proof, and unit coverage — see the correction
   section below.
4. ~~Supervisor grant/removal writes no `recordSecurityAudit` row.~~ **CLOSED in
   correction round 1**: `role_assigned` / `role_removed` events with ids-only
   metadata, fail-open-but-visible — see the correction section below.
5. `checkIsAdmin` maps an internal auth-check failure to non-admin (403) rather
   than 500 — deny-on-doubt, identical to every other consumer of that helper.
6. (New, correction round) `handleGetAvailableUsers`' pre-existing
   `'Network ID es requerido'` 400 keeps its legacy wording — that GET is the
   out-of-scope legacy listing (limitation 2). The repaired POST/DELETE paths
   speak plain es-CL only.
7. (New, correction round) After the unique index, a `supervisor_de_red` grant
   through the generic `assign-role.ts` that loses to an existing active row
   answers a mapped 409; other role types have no unique index and keep their
   generic insert-error 500. `assign-role.ts` still runs no supervisor
   pre-check of its own — the index is its enforcement.

## Where Codex should press hardest

1. **Does the privileged client truly avoid the caller's JWT?**
   `lib/api-auth.ts::createServiceRoleClient()` builds `createClient(url,
   SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false }})`
   with no request-derived headers. The non-vacuous proof is the e2e listing test:
   `user_roles` has no admin-read policy, so a client still carrying the caller's
   JWT returns the listing empty and that test goes red (it did, at the base —
   see fail-on-old). Check I haven't reintroduced any `{ req, res }`-derived
   client on a privileged query path.
2. **Does every affected query fail closed?** `supervisors.ts` now has zero
   `{ data }`-only destructures; `index.ts` has five, all inside the out-of-scope
   CRUD handlers listed above. Verify that boundary is drawn where this document
   says it is, and that the GET's batched supervisor query cannot fall through to
   an empty list on error (unit: "turns a failed supervisor query into a 500").
3. **Do schema names and payloads match the real database?** `nombre` everywhere
   (no `name` on `redes_de_colegios`); insert payload columns exactly
   `{user_id, role_type, red_id, is_active, assigned_by, assigned_at}`;
   deactivation exactly `{ is_active: false }`. The mocked tests pin the SHAPE;
   the live proof is the e2e lifecycle, which executed the real insert and update
   against the migration-reset schema.
4. **Is the cross-network test real and non-vacuous?** The candidate actively
   supervises the primary network at the moment the secondary assignment is
   attempted; the rejection is asserted (409 + message naming the current
   network), the secondary network's emptiness is re-read AFTER the attempt, and
   the candidate's active rows are read back via the service client as exactly
   `[primary red_id]`. The negative control is the seeded, populated secondary
   network — never a nonexistent id. At the base SHA this spec fails (4 red).
5. **Is mutable e2e data isolated from parallel tests?** The lifecycle block is
   serial; it mutates only its own candidate (fixed purge prefix + per-run
   address, pre-purged in beforeAll, purged again in afterAll); the canonical
   `networkSupervisor` fixture is never written; nothing is ever assigned to the
   secondary network, so no other spec's "secondary is unsupervised" reading can
   be perturbed even transiently. Successful grants target the primary network
   only, and other specs assert primary membership by containment, not equality.

---

# Correction round 1 — Codex REQUEST CHANGES, addressed

Codex's independent review of head `09765566` returned **REQUEST CHANGES** with
four required corrections. The reviewed commits are untouched; everything below
landed as new commits so only the new diff needs re-review. **This round claims
no approval** — it awaits Codex's re-review.

## Correction 1 — the concurrent-assignment race, closed at the database

- **Migration** `supabase/migrations/20260827150000_one_active_supervisor.sql`,
  authored through the DB-agent flow. Strictly additive: a read-only, fail-closed
  preflight (a DO block that RAISEs, listing each offending `user_id` and its
  active-row count, if any user already holds >1 active `supervisor_de_red` row —
  it never modifies, deactivates or deletes anything; resolving duplicates is an
  explicit operator decision), then the partial unique index
  `uq_user_roles_one_active_supervisor ON user_roles (user_id) WHERE role_type =
  'supervisor_de_red' AND is_active = true`. Inactive history (false or NULL)
  stays unlimited. `guard:migrations` passes over all 38 files.
- **23505 → 409, everywhere the index can surface.**
  `assignSupervisorRole` classifies a 23505 insert loss as
  `active_role_conflict` with a plain es-CL message (no database internals);
  the supervisors route maps it to **409**. The DB agent's impact sweep found
  one more path that inserts active supervisor rows: the generic
  `assign-role.ts`, which had NO active-supervisor check at all and previously
  double-inserted silently — it now maps the same 23505 to the same 409 (other
  role types are untouched; no other unique index exists on `user_roles`).
  This is the one deliberate out-of-round-1-scope file touch, made because the
  migration itself changes that endpoint's failure mode; flagged here rather
  than slipped in.
- **pgTAP** `supabase/tests/060-user-roles-supervisor-unique.sql` (8 tests):
  index exists and is UNIQUE; a second ACTIVE row for the same user is rejected
  (23505) toward another network AND duplicating the same one; inactive
  historical rows stay allowed (plural), NULL `is_active` is outside the
  predicate; a different user is unaffected.
- **Real two-session concurrency proof**
  `scripts/ci/supervisor-concurrency-proof.mjs` (`npm run
  test:supervisor-concurrency`), pg over the local stack like the repo's other
  concurrency proofs: session B's competing insert must BLOCK while session A
  holds its uncommitted insert, then fail with 23505 when A commits; a
  simultaneous double-fire yields exactly one winner + one 23505; end state is
  EXACTLY ONE active row, with deactivated history preserved and still
  insertable. Synthetic fixed-uuid fixtures, local-host guard, pre- and
  post-purge of its own rows.
- **Fail-on-old, both layers.** Run against the pre-index database first, the
  proof FAILED exactly as the defect predicts — "session B inserted a SECOND
  active supervisor row while session A held its uncommitted insert — the race
  is open" — and passes after `supabase db reset` applies the migration. The
  correction unit tests (below) fail 12/12 at the reviewed head `09765566`.

## Correction 2 — durable security auditing

- After a committed assignment, the route records `role_assigned`; after a
  committed removal (which now receives the authenticated admin id as a
  parameter), `role_removed` — both via `lib/security/audit.ts::
  recordSecurityAudit` on the service client, with `actorUserId` (admin),
  `actorRole: 'admin'`, `targetUserId`, and metadata of EXACTLY
  `{ role_type: 'supervisor_de_red', red_id }` — ids only, no names, no e-mail,
  no credentials (Ley 21.719; the module's sanitiser is a second net).
- **Fail-open-but-visible, as documented in the module**: the role change is
  already committed when the audit row is attempted, so the response stays
  201/200 and carries `audited: true|false`. The call is additionally wrapped so
  even a contract-violating THROW in the audit layer cannot flip a committed
  change into an error response. Unit tests pin: the exact event payload for
  both actions, metadata key-set exactly `['red_id','role_type']`, no audit call
  on any rejected path (409/404/500), and 201/200 with `audited: false` when the
  audit write fails or throws.
- **End-to-end**: the mandatory spec now asserts `audited: true` on both
  mutations and reads the REAL `security_audit_events` rows back through the
  service client — exactly one `role_assigned` and one `role_removed` for the
  candidate, `outcome: 'success'`, `actor_role: 'admin'`, metadata equal to the
  ids-only object.

## Correction 3 — plain es-CL validation copy

The repaired POST/DELETE paths answer malformed ids with
`La red o el usuario indicados no son válidos` and missing ids with
`La red y el usuario son requeridos` — no "Network ID", "User ID" or "UUID"
reaches the administrator. Unit tests pin the exact text and assert the
forbidden terms are absent. (The out-of-scope legacy GET keeps its old wording —
known limitation 6.)

## Correction 4 — documentation

This document and PROJECT_STATE.md updated as required: the concurrency
limitation removed as CLOSED, audit behavior added, all counts corrected below,
and no review approval claimed anywhere.

## Files changed in the correction round

**Higher risk** — `supabase/migrations/20260827150000_one_active_supervisor.sql`
(new, DB-agent authored); `pages/api/admin/networks/supervisors.ts` (audit,
409 mapping, es-CL copy, removal handler takes adminId);
`utils/roleUtils.ts` (`active_role_conflict` classification);
`pages/api/admin/assign-role.ts` (the one flagged cross-file touch: 23505 → 409
for supervisor grants).

**Medium risk** — `scripts/ci/supervisor-concurrency-proof.mjs` (new) and its
`package.json` script `test:supervisor-concurrency`.

**Lower risk** — `supabase/tests/060-user-roles-supervisor-unique.sql` (new);
`__tests__/api/admin/networks-supervisors.test.ts` (+5 tests, several extended);
`__tests__/utils/roleUtils.assignSupervisorRole.test.ts` (+1);
`__tests__/api/admin/assign-role.test.ts` (+1);
`tests/e2e/network-supervisors.spec.ts` (audit assertions inside the existing 11
tests); this document; `PROJECT_STATE.md`.

## Canonical test evidence at the correction head (all local, synthetic only)

| Gate | Command | Result |
| --- | --- | --- |
| Fail-on-old (unit) | the 3 supervisor suites + assign-role vs reviewed head `09765566` (product files checked out, new tests in place) | **12 correction tests FAIL / 90 pass** at `09765566` → all pass at the correction head |
| Fail-on-old (race) | `npm run test:supervisor-concurrency` on the PRE-index database | **FAIL — open race reproduced** (second active row inserted past the held transaction) |
| Focused suites | `npx vitest run` over `networks-index`, `networks-supervisors`, `roleUtils.assignSupervisorRole`, `assign-role` tests | **4 files, 110 passed** |
| Typecheck / Lint | `npm run type-check` / `npm run lint` | clean / clean, zero warnings |
| Migration guards | `npm run guard:migrations` | OK — 38 files, no RLS-disable, no destructive DDL |
| Browser boundary | `npm run guard:browser` | OK |
| Unit (full) | `npm test` (with `.env.local` parked aside, matching CI's unit gate) | **368 files, 8391 passed, 11 skipped** |
| pgTAP / RLS | `npm run test:db` after `supabase db reset` (all 38 migrations from scratch — the new preflight passes on a clean database) | **22 files, 1441 tests, PASS** |
| Concurrency proof | `npm run test:supervisor-concurrency` (post-migration) | **PASS** — blocking observed, loser 23505, exactly one active row in both phases, history preserved |
| Build (production) | `npm run build` + `node scripts/check-price-leak.mjs` | success / OK |
| Mandatory e2e | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **188 passed, 0 skipped, 0 flaky, 13 specs**; my 11 tests first-attempt, audit rows asserted live |
| No-skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | OK — 13 mandatory specs, no skips |
| Hygiene | `git diff --check`; post-run residue sweep | clean; 0 candidate rows anywhere, secondary network 0 active supervisors, exactly the lifecycle's 2 role-audit rows in the local trail |

The migration was applied ONLY to the ephemeral local stack via `supabase db
reset`. Applying it to production remains a human post-merge step under the
standing rule (PROJECT_STATE.md, Z1b closure): "aplicar migraciones a
producción" is a mandatory post-merge checklist item verified by the PM.

## Where Codex should press hardest — correction round

1. **The migration**: is the preflight genuinely read-only and fail-closed
   (report-and-abort, never mutate)? Is the index truly additive and its
   predicate exactly the invariant (NULL excluded on purpose)?
2. **The proof's honesty**: the held-lock phase asserts session B BLOCKS before
   the winner commits — verify that assertion cannot pass vacuously, and that
   the red run on the pre-index database is the same script, unmodified.
3. **The 409 mapping's blast radius**: `assign-role.ts` was outside round-1
   scope; confirm the added branch is exactly `roleType === 'supervisor_de_red'
   && code === '23505'`, after the community-rollback compensation, changing
   nothing else on that endpoint.
4. **Audit metadata discipline**: nothing but `role_type` and `red_id` can reach
   the trail from these call sites, on both success responses AND the absence of
   audit calls on rejected paths; and the fail-open guarantee (audited:false,
   never an error flip).
5. **Doc truthfulness**: the round-1 evidence section is labeled historical; the
   counts above are the canonical ones; no approval is claimed.
