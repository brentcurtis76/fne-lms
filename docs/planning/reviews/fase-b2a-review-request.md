# B2a — Network-supervisor product repair — Review Request

- **Batch**: B2a (Santa Marta remediation series; NOT a GENERA itinerary phase)
- **Branch**: `fix/red-super`
- **Worktree**: `/Users/brentcurtis/dev/wt/red-super`
- **Base**: `a28eebc9152565cd8b287fe12e8679c2ab783137` (origin/main, the PR #55 QA-foundation merge — verified exact before branching)
- **Implementation head**: `9d71dfef` (`fix(networks): repair supervisor management, fail closed (B2a)`)
- **Commit count**: 2 — the implementation commit above plus the documentation commit that carries this file and the PROJECT_STATE.md status line (a document cannot cite the SHA of the commit that contains it; `git log a28eebc9..HEAD` shows both)
- **Status**: REVIEW READY. Nothing pushed, no PR, no merge, no deployment, no production access.

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

## Test evidence (all local, worktree `/Users/brentcurtis/dev/wt/red-super`)

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
3. The one-active-network rule is enforced at two application layers (route +
   helper) but not by a database constraint — schema changes are out of scope for
   this batch, so a concurrent-admin race could in principle double-assign. The
   DB agent flow would own a partial unique index if wanted.
4. Supervisor grant/removal writes no `recordSecurityAudit` row. `assign-role.ts`
   audits; `remove-role.ts` (the removal pattern mirrored here) does not. Left
   consistent with the removal pattern; a follow-up could add both.
5. `checkIsAdmin` maps an internal auth-check failure to non-admin (403) rather
   than 500 — deny-on-doubt, identical to every other consumer of that helper.

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
