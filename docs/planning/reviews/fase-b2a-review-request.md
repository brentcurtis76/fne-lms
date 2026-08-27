# B2a — Network-supervisor product repair — Review Request

- **Batch**: B2a (Santa Marta remediation series; NOT a GENERA itinerary phase)
- **Branch**: `fix/red-super`
- **Worktree**: `/Users/brentcurtis/dev/wt/red-super`
- **Base**: `a28eebc9152565cd8b287fe12e8679c2ab783137` (origin/main, the PR #55 QA-foundation merge — verified exact before branching)
- **Round-1 implementation head**: `9d71dfef` (`fix(networks): repair supervisor management, fail closed (B2a)`); round-1 docs commit `09765566` — the head Codex reviewed
- **Correction round 1**: Codex returned **REQUEST CHANGES** on `09765566`. The reviewed commits are untouched; the corrections landed as NEW commits on top — implementation `0971479a` (migration + concurrency proof + audit + copy + tests) and docs `1e08e482`
- **Correction round 2**: Codex's re-review of `1e08e482` returned **REQUEST CHANGES** again (the generic-channel supervisor hole — see the round-2 section at the end). The four reviewed commits are again untouched; round 2 lands as NEW commits on top: one implementation commit (UI + API + migration + tests at four layers) and the documentation commit that carries this update
- **Correction round 3**: Codex's re-review of the round-2 head `b5d5f5f7` returned **REQUEST CHANGES** a third time — the channel boundary was incomplete across the ACCOUNT-CREATION writers, and this document's limitation 8 misdescribed the bulk importer's failure mode (see the corrected limitation 8 and the round-3 section at the end). The six reviewed commits are again untouched; round 3 lands as NEW commits on top: implementation `4340323f` (both account-creation boundaries, the parser, the fail-closed 23514 backstop, tests at unit and e2e layers) and the documentation commit that carries this update (a document cannot cite the SHA of the commit that contains it; `git log a28eebc9..HEAD` shows all eight)
- **Status**: **CLOSED IN PRODUCTION (2026-08-27).** Codex approved correction round 3 at `63fc8c9c`; PR #56 merged as `0a6576c9`; pull-request and post-merge CI passed; the Vercel deployment completed; both production migrations were applied manually by Brent and verified read-only. See the authoritative post-merge closure record at the end of this document.

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
7. ~~(New, correction round) After the unique index, a `supervisor_de_red` grant
   through the generic `assign-role.ts` that loses to an existing active row
   answers a mapped 409; other role types have no unique index and keep their
   generic insert-error 500. `assign-role.ts` still runs no supervisor
   pre-check of its own — the index is its enforcement.~~ **REPLACED in
   correction round 2**: the 409 mapping was insufficient — it only fired on
   the SECOND grant, while the FIRST generic grant succeeded as an active
   supervisor with `red_id` NULL that then blocked the real assignment.
   `assign-role.ts` now refuses `supervisor_de_red` outright (400, es-CL
   guidance, before any write), the modal no longer offers it, and the
   database itself rejects any active NULL-red supervisor row via CHECK
   constraint. The now-unreachable 409 branch was removed. See the round-2
   section below.
8. ~~(New, correction round 2) `create-user.ts` and `bulk-create-users.ts` can
   still RECEIVE `role=supervisor_de_red` in a direct API request or CSV row
   (no UI offers it — the create form hardcodes `docente`, and neither surface
   collects a network). Since the CHECK constraint, such a request fails at
   the database (the active row would carry `red_id` NULL), surfacing as those
   endpoints' generic insert-failure error rather than a supervisor-specific
   400 with channel guidance. No unusable supervisor can be created — but the
   error copy on those two endpoints is generic.~~ **CORRECTED AND CLOSED in
   correction round 3.** The struck-through statement was WRONG about the bulk
   importer, not merely incomplete. "Fails at the database, fails cleanly" held
   only for `create-user.ts` (provision auth account + profile → 23514 on the
   role insert → rollback → generic 500). In `bulk-create-users.ts` the 23514
   landed in the role-insert handler's non-critical fall-through, so the import
   KEPT the role-less auth user and profile, audited `user_created_bulk` with
   outcome `success`, counted the row as succeeded, returned `success: true`,
   and delivered the account's password. For the record, the real attack
   surface was narrower than "CSV row" suggested and worse than "generic copy"
   admitted: an EXPLICIT CSV `supervisor_de_red` value was ALREADY rejected by
   the parser (`supervisor_de_red` has never been in its `validRoles` list —
   generic "Rol '…' inválido"); the genuinely unvalidated bulk path was
   `options.defaultRole=supervisor_de_red` applied to every empty-role row
   (`defaultRole` was validated against nothing) landing in the non-critical
   23514 handling. Closed in round 3, and marked closed only because BOTH
   account-creation endpoints now refuse the role BEFORE provisioning (exact
   es-CL channel guidance at the create-user boundary, the parser — both entry
   forms — and a defense-in-depth check inside the bulk per-user `createUser`)
   AND the 23514 backstop now fails CLOSED (failure result, no credential, no
   success audit, cleanup of the auth user and profile with each deletion
   verified). See the round-3 section below.

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

## Test evidence at the round-1 correction head — historical

> Round 2 re-ran every gate; the CANONICAL current counts live in the
> **Correction round 2** section at the end of this document. This section is
> kept as the accurate record of what was measured at the round-1 head
> `1e08e482`.

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

---

# Correction round 2 — the generic-channel supervisor hole, closed at all three layers

Codex's re-review of round-1 head `1e08e482` returned **REQUEST CHANGES**: the
generic role-assignment workflow still OFFERED `supervisor_de_red`, with no
network selector, and `assign-role.ts` wrote no `red_id`. The FIRST generic
grant therefore succeeded as `(role_type='supervisor_de_red', is_active=true,
red_id=NULL)`. `uq_user_roles_one_active_supervisor` then counted that row as
the user's one active supervisor role and refused the real assignment through
Gestión de Redes — an active but unusable supervisor that also blocked the
correct grant. The round-1 23505→409 mapping only ever fired on the SECOND
attempt; the first sailed through.

The four reviewed commits are untouched; everything below landed as new
commits. **This round claims no approval** — it awaits Codex's re-review.

## Correction 1 — UI boundary

`components/RoleAssignmentModal.tsx` removes `supervisor_de_red` from
`AVAILABLE_ROLES` (the generic assign/edit dropdown), with a comment explaining
the channel. Existing supervisor roles remain FULLY visible: the current-roles
list and the detail pane render from the fetched rows' `role_type` via
`ROLE_NAMES`/`ROLE_DESCRIPTIONS`, independent of the assignable list — proven
by a unit test that loads a user holding a supervisor role and asserts the name
renders while the dropdown (all 8 options) never offers it. The modal's
pre-existing defensive submit check (`filteredAvailableRoles.includes`) now
refuses the role on every submit path as a side effect of the list change.

## Correction 2 — API boundary

`pages/api/admin/assign-role.ts` refuses `roleType === 'supervisor_de_red'`
with **HTTP 400** and the exact plain es-CL guidance
**“El rol Supervisor de Red debe asignarse desde Gestión de Redes.”** — before
any database write: no `user_roles` insert, no `growth_communities` write, no
audit row, no cache refresh (unit tests assert the supabase client is never
touched at all: zero `from()` calls, zero `rpc()` calls). Placement is
deliberate: AFTER the hoisted ED-assignability gate (an equipo_directivo still
receives its accurate 403 — Gestión de Redes is admin-only, so the guidance
would misdirect an ED) and BEFORE the schoolId shape check (the channel refusal
is the actionable error). The round-1 23505→409 supervisor branch in the
insert-error handler was **removed as unreachable** — no supervisor insert can
originate from this endpoint anymore; a comment at the site records why.

## Correction 3 — database invariant

- **Round-1 migration untouched.** `20260827150000_one_active_supervisor.sql`
  is not modified; the new rule is a LATER additive migration,
  `supabase/migrations/20260827160000_active_supervisor_requires_red.sql`.
- **Read-only fail-closed preflight**: a DO block that RAISEs one itemized
  exception (each offending `user_id` + its NULL-red active-row count, ids
  only) if any ACTIVE `supervisor_de_red` row already has `red_id` NULL, then
  aborts — it never modifies, deactivates or deletes anything; resolving each
  row (deactivate, or point at the correct red) is an explicit operator
  decision. Proven live: with a synthetic NULL-red active row planted in a
  transaction, applying the migration aborted with the itemized message, the
  constraint was NOT created, and rollback left zero residue.
- **The CHECK constraint** `chk_user_roles_active_supervisor_needs_red`,
  exactly the required predicate:
  `role_type <> 'supervisor_de_red' OR is_active IS DISTINCT FROM TRUE OR
  red_id IS NOT NULL` — rejects active network supervisors without a network
  (INSERT and UPDATE alike, so reactivation and red-stripping are covered)
  while allowing inactive/legacy history (`false` and NULL `is_active`) and
  unrelated roles with NULL `red_id`. Guarded by a `pg_constraint` existence
  check (no ADD CONSTRAINT IF NOT EXISTS in Postgres); no RLS change of any
  kind; `guard:migrations` passes over all 39 files.
- **Deliberate consequence, documented in the migration**:
  `user_roles_red_id_fkey` is ON DELETE SET NULL, so removing a red that still
  has an ACTIVE supervisor is now refused by the database (the SET NULL would
  violate the CHECK) — backing the pre-existing app-level guard in the network
  delete handler. Inactive history still nulls out freely.
- **Blast radius handled, not discovered later**: pgTAP suites 051/053 seed
  ACTIVE rows for all nine roles and previously gave supervisors `red_id`
  NULL — exactly the shape the constraint forbids. Their fixtures now create a
  synthetic red and stamp it on the supervisor rows only (everything still
  rolls back). `create-user.ts`/`bulk-create-users.ts` can still RECEIVE the
  role in direct requests; the database now refuses the row (known limitation
  8). The e2e seeder and the concurrency proof always wrote `red_id` and run
  unchanged.

## Correction 4 — tests, all four layers

- **Unit (API)** — the two tests that approved the unscoped generic grant
  (`admin: assigning "supervisor_de_red" with schoolId=42 → 200` and the
  23505→409 mapping test) are REPLACED by a 4-test
  `supervisor_de_red channel boundary (B2a r2)` block: the FIRST grant (no
  conflict in sight) → 400 with the exact es-CL text and ZERO client activity
  (no from(), no rpc()); a schoolId cannot smuggle the grant; the channel 400
  wins precedence over a malformed-schoolId 400; the copy contains no English
  and no database internals. The ED 403 test for supervisor_de_red is kept —
  its precedence over the channel 400 is now documented in place.
- **Unit (UI)** — the default-dropdown test now asserts EIGHT roles with
  `supervisor_de_red` explicitly absent, and a new test proves an existing
  supervisor role stays visible (list + detail pane) while the new-role
  dropdown never offers it.
- **pgTAP** — new suite `supabase/tests/061-user-roles-active-supervisor-red.sql`
  (11 tests): constraint exists as a CHECK; active+NULL-red rejected on INSERT
  (23514); an inactive NULL-red row cannot be REACTIVATED (23514); `red_id`
  cannot be stripped from an active row (23514); active+valid-red accepted;
  inactive (plural) and NULL-`is_active` history allowed; unrelated roles
  (docente, admin) active with NULL red allowed; deactivation unrestricted; a
  different user's properly-scoped active row unaffected.
- **E2E** — the mandatory lifecycle gains a FIRST step before the dedicated
  assignment: the admin posts the generic
  `assign-role {targetUserId: candidate, roleType: supervisor_de_red}` → 400
  with the exact es-CL text; service-client read-back proves ZERO supervisor
  rows of any liveness and ZERO `role_assigned` audit rows for the candidate.
  The SAME candidate is then assigned through the dedicated network endpoint
  (201, audited) — proving the refusal left the legitimate channel fully
  functional — and the existing duplicate/cross-network/removal/audit
  assertions all still pass; the assignment test's `toHaveLength(1)` on
  `role_assigned` doubles as proof the rejected generic attempt wrote no audit
  row.

## Fail-on-old — every layer, against the round-1 head `1e08e482`

- **Unit**: with the two product files checked out at `1e08e482` and the new
  tests in place, exactly the **6** new/updated tests FAIL (the 4 channel-
  boundary API tests; the 2 modal tests) → all pass at the round-2 head.
- **pgTAP**: suite 061 run against the PRE-migration database is red exactly
  as the defect predicts — the active NULL-red INSERT **succeeds** (test 2),
  and the knock-on assertions fail with it; green after `supabase db reset`
  applies the migration.
- **E2E**: the new lifecycle test run against a production build of the OLD
  `assign-role.ts` on the constrained database fails with **500 ≠ 400** — and
  that 500 is itself the DB CHECK refusing the NULL-red row the old code tried
  to write (23514, which the old 23505 branch cannot map): the database
  backstop holds even against pre-fix application code.
- **Preflight**: demonstrated fail-closed on planted bad data (see
  Correction 3), and passes untouched on the clean reset.

## Files changed in the correction round 2

**Higher risk** —
`supabase/migrations/20260827160000_active_supervisor_requires_red.sql` (new);
`pages/api/admin/assign-role.ts` (channel-boundary 400; unreachable 409 branch
removed); `components/RoleAssignmentModal.tsx` (role fenced from the dropdown).

**Lower risk (tests + docs)** —
`supabase/tests/061-user-roles-active-supervisor-red.sql` (new, 11 tests);
`supabase/tests/051-forced-password-change-boundary.sql` and
`supabase/tests/053-forced-password-change-data-layer.sql` (fixture-only: the
supervisor fixture rows now carry a synthetic red);
`__tests__/api/admin/assign-role.test.ts` (2 tests replaced by 4; comments);
`__tests__/components/RoleAssignmentModal.allowedRoles.test.tsx` (1 test
updated, 1 added); `tests/e2e/network-supervisors.spec.ts` (+1 lifecycle test,
header updated); this document; `PROJECT_STATE.md`.

## Test evidence at the round-2 head — historical

> Round 3 re-ran every gate; the CANONICAL current counts live in the
> **Correction round 3** section at the end of this document. This section is
> kept as the accurate record of what was measured at the round-2 head
> `b5d5f5f7`.

| Gate | Command | Result |
| --- | --- | --- |
| Fail-on-old (unit) | new tests vs product files at `1e08e482` | **6 FAIL** at `1e08e482` → all pass at the round-2 head |
| Fail-on-old (pgTAP) | suite 061 via psql on the PRE-migration database | **red** — the NULL-red active INSERT succeeds; green post-reset |
| Fail-on-old (e2e) | new lifecycle test vs old `assign-role.ts` build on the constrained DB | **red (500 ≠ 400)** — the 500 is the DB CHECK refusing the row |
| Preflight fail-closed | migration applied over a planted NULL-red active row (transaction, rolled back) | **aborts** with itemized user_id list; constraint not created; zero residue |
| Focused suites | `npx vitest run` over `assign-role`, `RoleAssignmentModal.allowedRoles`, `RoleAssignmentModal.liderCommunityMode` | **3 files, 77 passed** (assign-role 64; modal 7 + 6) |
| Typecheck / Lint | `npm run type-check` / `npm run lint` | clean / clean, zero warnings |
| Migration guards | `npm run guard:migrations` | OK — 39 files, no RLS-disable, no destructive DDL |
| Browser boundary | `npm run guard:browser` | OK (1149 files, 694 modules, 516 entrypoints) |
| Unit (full) | `npm test` (`.env.local` parked aside, matching CI's unit gate) | **368 files, 8394 passed, 11 skipped** |
| pgTAP / RLS | `npm run test:db` after `supabase db reset` (all 39 migrations from scratch — the new preflight passes on a clean database) | **23 files, 1452 tests, PASS** |
| Concurrency proof | `npm run test:supervisor-concurrency` (post-migration) | **PASS** — blocking observed, loser 23505, exactly one active row in both phases, history preserved |
| Build (production) | `npm run build` + `node scripts/check-price-leak.mjs` | success / OK (262 files) |
| Affected spec, no retries | `CI=1 npx playwright test tests/e2e/network-supervisors.spec.ts --project=chromium --retries=0` | **12 passed** (11 + the new generic-refusal test), first attempt |
| Mandatory e2e | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **189 passed, 0 skipped, 0 flaky, 13 specs** (JSON `stats`: expected 189, unexpected 0); my spec’s 12 all first-attempt |
| No-skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | OK — 13 mandatory specs ran with no skips |
| Hygiene | `git diff --check`; post-run residue sweep | clean; residue sweep: 0 candidate auth users / profiles / role rows, primary network exactly 1 active supervisor (the canonical fixture), secondary 0, **0 ACTIVE supervisor rows with `red_id` NULL anywhere**, and the local audit trail holds exactly the 3 post-reset lifecycle runs’ role_assigned/role_removed pairs |

The migration was applied ONLY to the ephemeral local stack via `supabase db
reset`. Applying it to production remains a human post-merge step under the
standing rule (PROJECT_STATE.md, Z1b closure): “aplicar migraciones a
producción” is a mandatory post-merge checklist item verified by the PM.

## Where Codex should press hardest — correction round 2

1. **Is the 400 truly before every write?** The gate sits after auth, the
   required-fields check, the validRoles check and the ED gate — verify no
   `supabaseService` usage (query, insert, rpc) can precede it, and that the
   unit assertions on “zero from()/rpc() calls” actually pin that.
2. **The constraint's predicate vs. the spec.** Confirm
   `pg_get_constraintdef` is exactly the required three-disjunct expression,
   that NULL `is_active` is deliberately OUTSIDE the invariant (matching the
   unique index's treatment of NULL-as-not-active), and that the UPDATE paths
   (reactivation, red-stripping) are covered by pgTAP, not just INSERT.
3. **The 051/053 fixture change.** It touches two passing RLS suites — verify
   the change is fixture-only (a red for the supervisor rows), alters no
   assertion, and that giving those personas a network cannot affect any
   forced-password-change assertion.
4. **The removed 409 branch.** Confirm removal is safe: no other writer of
   supervisor rows goes through assign-role.ts, and the dedicated route's own
   23505→409 mapping (round 1) is untouched.
5. **The ED precedence call.** ED + supervisor_de_red answers 403 (role not
   assignable), not the channel 400 — deliberate, tested, and documented; check
   the reasoning holds (Gestión de Redes is admin-only).
6. **Doc truthfulness**: round-1 evidence is labeled historical; the counts
   above are canonical; limitation 7 is REPLACED (not silently deleted);
   limitation 8 (create-user/bulk direct requests now fail at the DB with
   generic copy) is honest about what round 2 does NOT change; no approval is
   claimed anywhere. *(Round 3 later showed that limitation-8 claim was itself
   WRONG for the bulk importer — the 23514 was swallowed as non-critical and
   the import reported success. See the corrected limitation 8 and the round-3
   section below.)*

---

# Correction round 3 — the account-creation channel, closed and fail-closed

Codex's re-review of round-2 head `b5d5f5f7` returned **REQUEST CHANGES**: the
channel boundary was incomplete across the account-creation writers, and this
document's limitation 8 misdescribed the failure mode it deferred.

The finding, verified before correcting (and reproduced live — see
fail-on-old): `bulk-create-users.ts` treated the CHECK constraint's 23514 on
the `user_roles` insert as a NON-CRITICAL role error. It kept the just-created
role-less auth user and profile, audited `user_created_bulk` with outcome
`success`, counted the row as succeeded, returned `success: true`, and
delivered the account's password. The reachable path was
`options.defaultRole=supervisor_de_red` applied to empty-role CSV rows —
`defaultRole` was validated against NOTHING (an explicit CSV supervisor value
was already refused by the parser, with generic copy; `validateRoleAssignment`
fails closed for junk strings, so `supervisor_de_red` was the one role that
passed application validation and failed at the database). `create-user.ts`
accepted the role, provisioned the auth account and profile, and only then hit
the constraint — rollback plus a 500 that leaked the raw constraint text.

The six reviewed commits are untouched; everything below landed as new
commits. **This round claims no approval** — it awaits Codex's re-review.

## Correction 1 — manual create-user boundary

`pages/api/admin/create-user.ts` refuses `role=supervisor_de_red` with
**HTTP 400** and the exact es-CL guidance **“El rol Supervisor de Red debe
asignarse desde Gestión de Redes.”** — BEFORE `createServiceRoleClient()` is
built, so before `provisionAuthAccount`, the profile write, the role insert,
and the audit row (this endpoint has no cache refresh). Placement mirrors
`assign-role.ts` (r2): AFTER the ED gates — an equipo_directivo keeps its
accurate 403 (`Role not assignable by equipo_directivo`), deliberate
precedence, since Gestión de Redes is admin-only — and BEFORE the schoolId
shape check (the channel refusal wins over an incidental malformed schoolId).

## Correction 2 — bulk-import boundary, both entry forms

- **Parser** (`utils/bulkUserParser.ts`): the supervisor check runs on
  `finalRole` — the CSV cell OR `options.defaultRole` after the empty-cell
  fallback — so BOTH entry forms land in `invalid` with the same exact es-CL
  guidance and no account is ever attempted for the row. Case- and
  whitespace-insensitive on purpose (`defaultRole` passes through verbatim;
  explicit cells are lowercased by the parser). An explicit CSV value
  previously drew the generic `Rol 'supervisor_de_red' inválido`; it now gets
  the actionable channel copy. Rows with OTHER roles in the same batch are
  unaffected (tested: the docente row still imports while the supervisor row
  fails alone).
- **Defense in depth** (`bulk-create-users.ts::createUser`): a second refusal
  with the same copy sits at the top of the per-user creation function, ahead
  of `validateRoleAssignment`, community auto-creation, and
  `provisionAuthAccount` — a parser or column-mapping regression cannot
  reopen the channel.

## Correction 3 — the 23514 backstop fails CLOSED

The role-insert error handler in `createUser` gains an explicit
`code === '23514'` branch (between the existing 23503 cleanup and the
non-critical fall-through): the row is a **failure**, never a success — no
credential is issued (credentials are only collected for succeeded rows), no
`user_created_bulk` row of ANY outcome is written, and the just-created
account is removed: `user_roles` delete (defense in depth — the insert
failed), `profiles` delete (no FK cascade exists from auth.users), then
`auth.admin.deleteUser` — with EACH deletion's error checked. A cleanup
failure is surfaced (row error “…la cuenta parcial no pudo eliminarse por
completo. Revise y elimine la cuenta manualmente.” plus a structured
`[BULK-IMPORT]` console.error naming the failing layer), never assumed away.
Refusal and rollback paths write no audit rows, consistent with
`assign-role.ts` (r2) and `create-user.ts`'s own rollback. Non-23514
role-insert errors keep their pre-existing non-critical behavior — deliberately
out of r3 scope, pinned by a dedicated test so the narrowing is visible.

Today the only CHECK on `user_roles` is
`chk_user_roles_active_supervisor_needs_red`, so this branch is precisely the
supervisor backstop; it is keyed on the SQLSTATE, not the constraint name, so
any future CHECK on the table inherits the fail-closed handling.

## Correction 4 — tests

- **Unit (create-user)** — the round-2-era test that approved
  `supervisor_de_red` creation with 200 is REPLACED by a 3-test
  `supervisor_de_red channel boundary (B2a r3)` block: admin → 400 with the
  exact copy, `provisionAuthAccount` NEVER called (passthrough spy) and
  `createServiceRoleClient` never built (so no write of any kind); the channel
  400 wins precedence over a malformed schoolId; ED → the authorization 403,
  pinned as deliberate precedence.
- **Unit (bulk)** — 10 new tests: parser refusal of the explicit CSV form, of
  the defaultRole form, and of case/whitespace variants; API-level proof that
  each form creates NOTHING (no `auth.admin.createUser` call, no table write,
  no audit — the harness now tracks deletes/eqs and injects targeted
  failures); batch isolation (supervisor row fails alone, the docente row
  still imports with exactly one success audit); defense in depth via a
  mocked-parser bypass; the 23514 fail-closed proof (no success, no
  credentials, no `user_created_bulk` row, delivery audit
  `partial_failure`/0, cleanup of exactly the created id across all three
  stores); cleanup-failure surfacing (injected auth-delete error → row error
  says removal was incomplete, residue logged); and the non-critical pin for
  non-23514 errors.
- **E2E** — the mandatory spec gains a 3-test
  `account-creation channel boundary (B2a r3)` block, run as admin against
  the real server and constrained database: manual create-user → 400 + exact
  copy; bulk with an explicit CSV supervisor row → refused with the channel
  copy; bulk with `options.defaultRole=supervisor_de_red` → refused. Each
  test follows up through the SERVICE client: zero auth users, zero profiles,
  zero role rows for the synthetic address, and the
  `user_created_manual`/`user_created_bulk` success-audit count unchanged.
  The bulk calls authenticate with a real Bearer token minted by signing the
  admin fixture into local GoTrue — the same mechanism the import modal uses.
  The dedicated network-supervisor assignment lifecycle (r1/r2 tests) is
  untouched and still passes.

## Fail-on-old — against the round-2 head `b5d5f5f7`

- **Unit**: with the three product files checked out at `b5d5f5f7` and the new
  tests in place, exactly the **11** behavior tests FAIL (create-user: admin
  400 + schoolId precedence; bulk: 3 parser + 3 API + defense in depth + 2
  fail-closed) and the 2 pins (ED 403; non-critical non-23514) pass by design
  → all 82 pass at the round-3 head.
- **E2E**: against a production build of the OLD product files on the
  constrained database, all 3 new tests are red with exactly the defect
  signatures — manual: **500** whose body leaks the raw constraint text
  (`new row for relation "user_roles" violates check constraint
  "chk_user_roles_active_supervisor_needs_red"`); explicit CSV: 400 but the
  generic copy, not the channel guidance; defaultRole: **200 with
  `success:true`, a real `userId`, delivered credentials and
  `audited:true`** — the finding itself, reproduced verbatim; the spec's purge
  then removed the role-less account it left behind, and the database was
  reset + reseeded before the canonical head runs so the final audit trail
  carries no artifact of the demonstration.

## Files changed in the correction round 3

**Higher risk** — `pages/api/admin/create-user.ts` (channel 400 before any
provisioning); `pages/api/admin/bulk-create-users.ts` (defense-in-depth
refusal; 23514 fail-closed with verified cleanup);
`utils/bulkUserParser.ts` (channel refusal on finalRole — both entry forms).

**Lower risk (tests + docs)** — `__tests__/api/admin/create-user.test.ts`
(1 test replaced by 3; provisionAuthAccount passthrough spy);
`__tests__/api/admin/bulk-create-users.test.ts` (+10 tests; harness gains
delete/eq tracking and targeted failure injection);
`tests/e2e/network-supervisors.spec.ts` (+3 mandatory tests, header updated);
this document; `PROJECT_STATE.md`.

## Canonical test evidence at the round-3 head (all local, synthetic only)

| Gate | Command | Result |
| --- | --- | --- |
| Fail-on-old (unit) | new tests vs product files at `b5d5f5f7` | **11 FAIL** at `b5d5f5f7` (2 pins pass by design) → 82/82 at the round-3 head |
| Fail-on-old (e2e) | the 3 new tests vs a production build of the old code, constrained DB, `--retries=0` | **3 red** — 500 leaking the constraint text; generic copy ≠ channel guidance; 200/`success:true` + credentials + success audit for a role-less account |
| Focused suites | `npx vitest run` over `create-user`, `bulk-create-users` tests | **2 files, 82 passed** (49 + 33) |
| Typecheck / Lint | `npm run type-check` / `npm run lint` | clean / clean, zero warnings |
| Migration guards | `npm run guard:migrations` | OK — 39 files, no RLS-disable, no destructive DDL |
| Browser boundary | `npm run guard:browser` | OK (1149 files, 694 modules, 516 entrypoints) |
| Unit (full) | `npm test` (`.env.local` parked aside, matching CI's unit gate) | **368 files, 8406 passed, 11 skipped** |
| pgTAP / RLS | `npm run test:db` after `supabase db reset` (all 39 migrations from scratch) | **23 files, 1452 tests, PASS** |
| Concurrency proof | `npm run test:supervisor-concurrency` (post-migration) | **PASS** — blocking observed, loser 23505, exactly one active row in both phases, history preserved |
| Build (production) | `npm run build` + `node scripts/check-price-leak.mjs` | success / OK (262 files) |
| Affected spec, no retries | `CI=1 npx playwright test tests/e2e/network-supervisors.spec.ts --project=chromium --retries=0` | **15 passed** (12 from r1/r2 + the 3 new boundary tests), first attempt |
| Mandatory e2e | `CI=1 npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **192 passed, 0 skipped, 0 flaky, 13 specs** (JSON `stats`: expected 192, unexpected 0) |
| No-skip guard | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | OK — 13 mandatory specs ran with no skips |
| Hygiene | `git diff --check`; post-run residue sweep | clean; residue sweep (service-client + SQL): 0 boundary-prefix auth users / profiles / role rows, 0 lifecycle candidates, **0 `user_created_manual`/`user_created_bulk` audit rows of ANY outcome**, 0 ACTIVE supervisor rows with `red_id` NULL anywhere, primary network exactly 1 active supervisor (the canonical fixture), secondary 0; the trail holds exactly the 2 post-reset lifecycle runs’ role_assigned/role_removed pairs |

No database schema change of any kind in this round; the two supervisor
migrations from earlier rounds are untouched, exactly as the round-3
instructions require (no test demanded otherwise — the pgTAP suite and the
concurrency proof pass unchanged on the fresh reset).

## Where Codex should press hardest — correction round 3

1. **Is the create-user 400 truly before every write?** The gate sits after
   auth, required-fields, password policy, the VALID_ROLES check and the ED
   gates, and before `createServiceRoleClient()` — verify nothing builds a
   client or calls `provisionAuthAccount` earlier, and that the unit
   assertions (spy never called, factory never called) actually pin that.
2. **Does the parser check really cover both entry forms?** It runs on
   `finalRole` (cell OR defaultRole), case/whitespace-insensitive, ordered
   after the injection-character branch and before the generic invalid-role
   branch. Check the ordering can't let a variant slip to a path that ACCEPTS
   the row, and that `csv_overrides`/organizational handling is untouched.
3. **The 23514 branch's blast radius.** It sits between the 23503 cleanup and
   the non-critical fall-through: confirm 23505 (duplicate) and 23503 (FK)
   behavior is byte-identical, the fall-through still catches everything
   else, and the pinned non-critical test proves the narrowing is exactly
   SQLSTATE 23514.
4. **Cleanup verification honesty.** Each of the three deletions checks its
   own error; a failure flips the row copy and logs residue — verify no path
   returns the clean-removal message when a deletion failed, and that no
   path can reach Step 7/8 (school-name update, success audit) after a
   23514.
5. **The e2e residue probes' non-vacuity.** `residueFor` reads auth users,
   profiles AND role rows through the service client, and the audit probe
   counts success outcomes for both creation actions — check these would
   actually catch the old behavior (they did: the fail-on-old defaultRole run
   went red on status before even reaching them, with the role-less account
   demonstrably present).
6. **Doc truthfulness**: limitation 8 is corrected via strikethrough (the
   wrong claim preserved, its correction explicit), the round-2 evidence is
   relabeled historical, the counts above are canonical, and no approval is
   claimed anywhere.

# Post-merge production closure — authoritative

This section supersedes the pre-merge status and no-production-access language
in the historical build/review sections above. Those sections remain unchanged
as an audit trail of what was true at each review head.

## Merge, CI, and deployment

- Codex independently re-reviewed correction round 3 at exact head
  `63fc8c9c91a4b4b28773bd15dc426f5d3a195961` and returned **APPROVE** with no
  findings.
- Brent pushed `fix/red-super` and merged PR
  [#56](https://github.com/brentcurtis76/fne-lms/pull/56) at
  `2026-08-27T18:18:56Z`. Merge commit
  `0a6576c9ef52cc1513162549edc918208ba45bdf` has parents exactly
  `a28eebc9152565cd8b287fe12e8679c2ab783137` and
  `63fc8c9c91a4b4b28773bd15dc426f5d3a195961`.
- Pull-request CI run
  [33102793967](https://github.com/brentcurtis76/fne-lms/actions/runs/33102793967)
  completed successfully on the approved head, and post-merge `push` run
  [33102856003](https://github.com/brentcurtis76/fne-lms/actions/runs/33102856003)
  completed successfully on the exact merge commit. Both ran all seven gates.
- Vercel reported **Deployment has completed** for the exact merge commit
  (deployment `CsfHbqM3TtJDVkLCkHWbZgj1CLgQ`). No CLI or manual Vercel deploy
  was run; this was the repository's automatic `main` deployment.

## Production database application and read-back

Brent applied the two reviewed additive migrations in the production Supabase
SQL Editor, in order, one transaction per migration with the corresponding
`supabase_migrations.schema_migrations` ledger row. Codex did not connect to or
write the production database; it supplied one action at a time and reviewed
the returned ID-only/schema-only evidence. `supabase db push` and migration
history repair were not used.

1. `20260827150000_one_active_supervisor.sql`: the duplicate preflight returned
   no rows. Production read-back showed ledger version `20260827150000`, unique
   index `uq_user_roles_one_active_supervisor` on `user_roles(user_id)` with
   predicate `role_type = 'supervisor_de_red' AND is_active = true`, and zero
   duplicate active supervisors.
2. `20260827160000_active_supervisor_requires_red.sql`: the preflight correctly
   stopped before DDL because one legacy active QA supervisor role had
   `red_id IS NULL`. Brent identified the account privately as QA and explicitly
   authorized deactivating only that malformed role. The update changed exactly
   `is_active` to `false`; the account, profile, and historical role row were
   preserved. Read-back showed that same role present and inactive and zero
   remaining active supervisors without a network. No personal name or e-mail
   was copied into the repository.
3. After the data correction, Brent applied the second migration. Final
   production read-back showed ledger version `20260827160000`, validated CHECK
   constraint `chk_user_roles_active_supervisor_needs_red` with the reviewed
   definition, zero duplicate active supervisors, and zero active supervisors
   without a network.

## Final state and boundary

B2a is closed in code and production. Do not reapply either migration. The
legacy QA account has no active supervisor role; if it is needed again, an
administrator must assign it through **Gestión de Redes** after connecting its
school to a real network. No live production user-flow test was performed as
part of the migration ceremony; closure evidence is the approved implementation,
two green CI runs, successful deployment, migration ledger, live schema-object
definitions, and production invariant counts.
