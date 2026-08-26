# Fase QA-ROLES — review request

**Branch:** `codex/qa-roles`
**Base:** `c56dba4adaa23863756ec9a8580361662bc516f2` (`main` at branch creation — merge of PR #54)
**Commits:** 1 (implementation + this file)
**PR:** none — not opened. Nothing pushed, merged or deployed.

## Objective and scope

Finish the end-to-end QA foundation described in
`SANTA_MARTA_CODEX_CLAUDE_PLAN.md` §5: synthetic local accounts for all nine
existing roles, the school/community/generation/network relationships those roles
need to be *useful* rather than merely able to log in, negative controls between
schools and networks, reusable browser login/storage-state helpers, and a
local-only seeder with no override.

The branch arrived carrying six modified tracked files and **no implementation
commit**. That work was inspected, preserved and finished; it is part of the
single commit under review.

**Scope in**
- `scripts/ci/e2e-fixtures.json` — persona roster, org fixtures, scope-field docs
- `scripts/ci/seed-e2e.mjs`, `scripts/ci/seed-e2e-zoom.mjs` — the local seeder
- `tests/e2e/helpers/auth.ts`, `tests/e2e/helpers/session-personas.ts` — helpers
- `tests/e2e/ci-fixture.spec.ts` — the mandatory fixture spec
- `docs/planning/reviews/fase-qa-roles-review-request.md` — this file

**Scope out, and untouched — verify with `git diff --stat`**
- Product code (`pages/`, `components/`, `lib/`, `utils/`)
- `middleware.ts`
- `supabase/migrations/**`
- `.github/workflows/ci.yml`
- Anything production: no deploy, no push, no production data, no secrets

## What changed

### 1. The roster reaches all nine roles (13 personas)

`types/roles.ts` lists nine roles. Before this branch the fixture file had six
personas covering four of them. It now has 13 covering all nine:

| Persona | Role | Scope |
| --- | --- | --- |
| `admin` | `admin` | school `primary` |
| `docente` | `docente` | school `primary` |
| `consultorGlobal` | `consultor` | `roleScope: global` → `school_id` NULL |
| `consultorAssigned` | `consultor` | school `primary` |
| `consultorOtherSchool` | `consultor` | school `secondary` |
| `gcLeader` | `lider_comunidad` | school `primary`, community `zoom` |
| `directivo` | `equipo_directivo` | school `primary` |
| `directivoSecondary` | `equipo_directivo` | school **`secondary`** |
| `generationLeader` | `lider_generacion` | school `primary`, generation `primary` |
| `networkSupervisor` | `supervisor_de_red` | school `primary`, network `primary` |
| `communityManager` | `community_manager` | school `primary`, community `role` |
| `procurementManager` | `encargado_licitacion` | school `primary` |
| `inactiveConsultor` | `docente` + inactive `consultor` | school `primary` |

Two `equipo_directivo` personas at different schools, as §5 requires. All
pre-existing Zoom personas, sessions, reports and negative session controls are
preserved unchanged — the diff removes exactly two lines from `HEAD` in the spec
(an import line and a `loginViaUi` call), both replaced in place.

### 2. Second synthetic school network — the cross-network negative control

Two networks, disjoint by construction:

| Fixture | Name | School it holds | Supervisor |
| --- | --- | --- | --- |
| `network` | `Red Sintetica E2E` | `primary` (990001) | `networkSupervisor` |
| `networkSecondary` | `Red Sintetica E2E Norte` | `secondary` (990002) | **nobody** |

`networkSupervisor` is scoped to the primary network **only**. `networkSecondary`
is a fully seeded network — real `redes_de_colegios` row, real `red_escuelas`
link to the secondary school — that no persona in the roster holds any role in.

That is the point. A later batch asserting a `supervisor_de_red` denial can point
at a network that genuinely exists and genuinely has a school in it. Asserting a
denial against an absent id passes for the wrong reason and keeps passing after
the scoping it guards has broken.

`ensureNetwork` takes the school from the network block's own `school` field
rather than a hardcoded `fixtures.school.id`, so disjointness is a property the
seeder *could* violate — which is what makes asserting it worth anything.

### 3. The separation is explicit in the mandatory spec

`tests/e2e/ci-fixture.spec.ts` is on the mandatory manifest
(`scripts/ci/e2e-mandatory.mjs`), so the skip guard fails the gate if it does not
run. Three layers, all read back through the running application — never from the
fixture JSON, which would let a spec pass against a database the seeder never
touched:

1. **Per-persona (13 tests).** Login through the real form, then
   `GET /api/auth/my-roles`: active role, `school_id`, `generation_id`,
   `community_id` and `red_id` must all match the declared scope. `red_id` is
   asserted as `primary` **or null** — the seeder can also map
   `network: 'secondary'`, and the spec deliberately refuses to, so a roster edit
   that scoped someone to `networkSecondary` fails here. Every role row of every
   persona is additionally asserted **not** to carry `networkSecondary`.
2. **As admin.** `GET /api/admin/networks`: both networks exist, primary holds
   exactly school 990001, secondary holds exactly 990002, and the intersection of
   the two school sets is empty.
3. **As the supervisor.** `GET /api/auth/my-roles`: exactly one active role, it is
   `supervisor_de_red`, and its `red_id` is the primary network and not the other.

**Both layers were verified to fail on the old behavior, for the intended reason**
(local DB, synthetic rows, restored by re-seeding afterwards):

- Deleted the `networkSecondary` row →
  `Error: network e2e00000-0000-4000-8000-000000000704 is not seeded` (3 attempts,
  test failed).
- Repointed the supervisor's `red_id` at the secondary network → both the
  per-persona login assertion and the dedicated supervisor test failed with
  `Expected "…0702" / Received "…0704"`.

### 4. Fixture-file documentation

The `_comment` block in `scripts/ci/e2e-fixtures.json` now documents **all six
supported scope fields** — `school`, `roleScope`, `generation`, `community`,
`network`, `inactiveRoles` — each with its accepted values, which columns it
writes, and why it exists. It also carries the network-topology table and the
limitation below.

## LIMITATION — read this before reusing the control

**The cross-network control proves topology. It does not prove denial.**

`ci-fixture.spec.ts` proves *who is scoped where*: which network each role row
carries, and which school each network holds. It exercises **no product surface
across the network boundary**. It is not, and must not be cited as, evidence that
any page, API route or RLS policy denies a `supervisor_de_red` access to a school
outside their network.

**Every affected product batch must add its own positive and negative
cross-network end-to-end test.** The fixture gives that test a real, populated
network to deny against; it does not do the test's work.

This is stated in three places so it cannot be lost: the fixture `_comment`, the
`E2E_NETWORK_SECONDARY` doc comment in `tests/e2e/helpers/auth.ts`, and the
`cross-network separation` describe header in the spec.

## Product finding — NOT repaired here (out of scope)

`GET /api/admin/networks` returns `supervisors: []` and `supervisor_count: 0` for
**every network and every caller**, including a global admin, even when the role
rows exist.

Cause: `pages/api/admin/networks/index.ts:34-36` builds its "admin" client with
`createServerSupabaseClient({ req, res }, { supabaseKey: SERVICE_ROLE_KEY })`.
That sets the `apikey` but the auth-helpers client still sends the **caller's
session JWT** as the bearer, so PostgREST resolves `authenticated`, not
`service_role`. `user_roles` has no admin-read policy — only `read_own_roles`
(`baseline.sql:21424`) and `user_roles_community_member_view` (`:21834`) — so the
supervisor sub-query returns nothing. The handler does not check that query's
error, so the empty list is silent. The `hasAdminPrivileges` check above it still
passes because it reads the caller's *own* role row.

Verified directly: the same PostgREST query with a true service-role key returns
the supervisor row; the route returns an empty array.

Consequence for this branch: the supervisor half of the control is asserted
through `/api/auth/my-roles` as the supervisor instead. Asserting
`secondary.supervisors` is empty via the admin route would pass **vacuously** —
it is empty for both networks regardless of the data — and would keep passing
after the seeding broke. That is precisely the failure this control exists to
prevent, so the vacuous assertion was removed rather than kept as decoration.

Recommend a separate bounded batch for the route itself (admin networks page
under-reports supervisors in production too). Not touched here: product code is
out of scope.

## Files by risk

**Highest — the seeder writes to a database**
- `scripts/ci/seed-e2e.mjs` (+138/-…): generation, two networks, role community,
  `generation_id`/`red_id` on profile and role rows, convergence check extended to
  the new columns. Local-only guard **unchanged**.

**Medium — the mandatory spec and its helpers**
- `tests/e2e/ci-fixture.spec.ts` (+157/-2): scope assertions and the cross-network
  block.
- `tests/e2e/helpers/auth.ts` (+51): roster tuple, scope-field types,
  `E2E_GENERATION` / `E2E_NETWORK` / `E2E_NETWORK_SECONDARY` / `E2E_ROLE_COMMUNITY`.
- `tests/e2e/helpers/session-personas.ts` (+9): the seven new personas classified
  into `DENIED_PERSONAS`. The partition assertion still holds — every persona is in
  exactly one tier.

**Lower**
- `scripts/ci/e2e-fixtures.json` (+130): data and documentation.
- `scripts/ci/seed-e2e-zoom.mjs` (+8/-…): the Zoom growth community now takes the
  fixture generation, because the primary school became `has_generations: true`.
- `docs/planning/reviews/fase-qa-roles-review-request.md` (new).

## Safety

- **Synthetic only (Ley 21.719).** `example.com` / `example.net` are RFC 2606
  reserved; every name is invented; no minor data, no real PII. The two new
  networks and the generation carry invented Spanish names explicitly marked as
  test data in their `descripcion`.
- **Local-only, no override.** `resolveConfig()` throws for any host outside
  `{127.0.0.1, localhost, ::1, 0.0.0.0}`, before `createClient` is called — so a
  misconfigured run never opens a connection. Verified against three non-local
  hosts and both env-var names (`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_URL`):
  exit 1 every time. `grep -Ei 'force|override|allow_|skip_|bypass'` over both
  seeders finds only the two comments saying no override exists.
- **Credentials.** Synthetic passwords live only in `scripts/ci/e2e-fixtures.json`,
  the repository's established local fixture file. None appear in this document,
  in any commit message, or in any report.
- No migration, no product code, no CI workflow, no `middleware.ts`, no deploy.

## Review hotspots — where to look hardest

1. **`ensureRole` convergence (`scripts/ci/seed-e2e.mjs`).** It now compares five
   columns instead of three. If a comparison is wrong, a *stale* role row silently
   survives a re-seed and every later spec tests the wrong scope. The two-run
   evidence below is what covers this; check the comparison itself, not just that
   it ran.
2. **`hasGenerations: true` on the primary school.** This is the one change that
   reaches beyond the new personas: it flips `schools.has_generations` for the
   school every existing Zoom spec uses, and `seed-e2e-zoom.mjs` now writes a real
   `generation_id` onto the Zoom growth community where it previously wrote NULL
   (with a comment explaining the NULL). All Zoom specs pass, but this is the
   likeliest place for an unintended interaction.
3. **The vacuous-assertion decision.** I removed a passing assertion
   (`secondary.supervisors` is empty via the admin route) because it passes for the
   wrong reason. Judge whether that was right, or whether it should have been kept
   with a comment. It is the one place I chose *less* coverage deliberately.
4. **`red_id` asserted as "primary or null".** The seeder supports
   `network: 'secondary'`; the spec refuses it. That asymmetry is intentional and
   documented, but it means the spec encodes a policy the seeder does not enforce.
5. **`DENIED_PERSONAS` classification.** Six of the seven new personas are denied
   the Zoom session. `communityManager` is denied while holding a *real* community
   scope (a different community) — check that the tier is right and that the
   partition assertion still covers the whole roster.

## Known limitations and deferred items

- The cross-network control is topology-only — see LIMITATION above.
- `/api/admin/networks` under-reports supervisors — see Product finding above. Not
  repaired; needs its own batch.
- No new pgTAP coverage. This branch adds no table, column, policy or migration —
  it seeds existing tables — so the RLS matrix is unchanged. The full suite was run
  as a regression gate.
- `lint:testid` is advisory and was not run; no interactive element was added.
- `test:override-concurrency` and `test:attendance-authority-concurrency` are not
  CI gate steps. They were run anyway and pass; recorded as extra evidence.
- `PROJECT_STATE.md` is **deliberately not updated**. The handoff enumerated the
  files to create and did not include it, and the batch is not closed — it is
  awaiting independent review. Recording it as done before a verdict is exactly
  what `SANTA_MARTA_CODEX_CLAUDE_PLAN.md` §8 forbids. Flagged rather than assumed:
  if the reviewer wants the state file updated pre-verdict, that is a one-line fix.
- Nothing was pushed. No PR. No merge. No deployment. No production access.

## Test evidence

Recorded below against the committed head. The exact SHA, the final re-run of
every gate, and the working-tree state are reported in the `REVIEW READY`
message that accompanies this file.

| Gate | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run type-check` | pass, no output |
| Lint | `npm run lint` | pass, zero warnings |
| Unit | `npm test` | **365 files, 8321 passed, 11 skipped (8332)** |
| Build | `npm run build` | pass — compiled, 149/149 static pages |
| Migration guard | `npm run guard:migrations` | pass — 37 migrations scanned |
| Browser guard | `npm run guard:browser` | pass — 1149 files, 694 modules |
| RLS pgTAP | `npm run test:db` | **21 files, 1433 tests, all pass** |
| Queue concurrency | `npm run test:queue` | pass — 40 jobs, 2 loops, each exactly once |
| Recovery concurrency | `npm run test:recovery-concurrency` | pass — 7 assertions |
| Override concurrency | `npm run test:override-concurrency` | pass (not a CI step) |
| Attendance concurrency | `npm run test:attendance-authority-concurrency` | pass (not a CI step) |
| E2E mandatory | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)` | **177 passed, 0 failed** |
| Skip guard | `node scripts/ci/e2e-mandatory.mjs --check …` | **12 mandatory specs ran, no skips** |
| Whitespace | `git diff --check` | clean |

### Seed repeatability

From a `supabase db reset` (all migrations from scratch), the seeder was run
**twice**:

- Run 1 — exit 0, 13 users + 1 lead `created`.
- Run 2 — exit 0, 13 users + 1 lead `reused`; the role-row and network log lines
  `diff` **identically** against run 1.
- Database after both runs: 13 `auth.users`, 13 `profiles`, 14 `user_roles`
  (13 active + 1 inactive), 2 schools, 1 generation, 2 growth communities,
  **2 networks, 2 `red_escuelas` links**. No duplication.
- Topology confirmed in SQL: `Red Sintetica E2E → 990001`,
  `Red Sintetica E2E Norte → 990002`; the only role row carrying a network is
  `e2e-supervisor-red@example.com / supervisor_de_red / active` on the primary
  network; the secondary network has none.
- All nine roles present: `admin` 1, `consultor` 3 active + 1 inactive,
  `equipo_directivo` 2, `lider_generacion` 1, `lider_comunidad` 1, `docente` 2,
  `supervisor_de_red` 1, `community_manager` 1, `encargado_licitacion` 1.

### Non-local refusal

| Host | Env var | Result |
| --- | --- | --- |
| `https://not-a-real-project.example.com` | `NEXT_PUBLIC_SUPABASE_URL` | exit 1, refused |
| `https://db.example.net` | `NEXT_PUBLIC_SUPABASE_URL` | exit 1, refused |
| `http://192.168.1.50:54321` | `NEXT_PUBLIC_SUPABASE_URL` | exit 1, refused |
| `https://not-a-real-project.example.com` | `SUPABASE_URL` (fallback) | exit 1, refused |

Fake hosts and a fake key throughout — the guard throws before any client is
constructed, so no connection is opened to anything, and no real host was named.

### Environment

Gates ran in `/Users/brentcurtis/dev/wt/qa-roles` against the **local** Supabase
stack (`http://127.0.0.1:54321`). `.env.local` is git-ignored, was written from
`supabase status -o json` for the run, and holds only ephemeral local-stack values
— exactly the keys `.github/workflows/ci.yml` gate 4 writes. Playwright ran with
`CI=1` to match the gate: production server, one worker, `retries: 2`, JSON report.
