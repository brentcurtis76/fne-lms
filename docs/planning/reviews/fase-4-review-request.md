# Fase 4 (Zoom Z1c) — Synthetic tenant + CI e2e — review request

- **Branch**: `feat/e2e-tenant`
- **Base**: `origin/main` @ `a1712f5` (`docs(pm): Z1c-1 dispatch ledger row + PROJECT_STATE post-merge truth pass`)
- **Chunk**: Z1c-1 — reconciliation + synthetic tenant extension
- **Out of scope for this chunk**: the zoom e2e specs themselves (join-authz matrix, disclosure
  regressions, iCal content) — those are Z1c-2, after the PM rules on §1 below.

---

## 1. Reconciliation — plan-era Z1c scope vs. what exists on `main`

Plan §15 (`docs/planning/zoom-integration-plan.md:458`) scoped Z1c as:

> `scripts/seed-e2e-zoom.js` (local-only guard); e2e CI job wired to local Supabase
> (db start + seed + env); blocking mock-mode specs: join-authz persona matrix,
> disclosure regressions, iCal content
> **DoD:** Zoom e2e specs in the blocking gate

That was written before the INSPIRA/T2 track landed an e2e seeding topology on `main`.
Classification of every element:

| # | Plan-era scope element | Verdict | Evidence / what it means |
|---|---|---|---|
| 1 | `scripts/seed-e2e-zoom.js` as a **standalone seeder** | **OBSOLETE** | Superseded by `scripts/ci/seed-e2e.mjs`, which CI already invokes (`.github/workflows/ci.yml:157-161`). A second top-level seeder would need its own guard, its own CI step and its own fixture file — three chances to drift from the one the specs actually log in as. The plan's *named artifact* survives as a **module**: `scripts/ci/seed-e2e-zoom.mjs`, imported and invoked by the shared seeder (per the PM ruling). |
| 2 | **local-only guard** on the seeder | **ALREADY EXISTS** | `scripts/ci/seed-e2e.mjs:31` (`LOCAL_HOSTS`) + `:33-49` (`resolveConfig`) throw on any Supabase host outside `127.0.0.1 / localhost / ::1 / 0.0.0.0`, with **no override flag by design** (header comment `:14-16`). The zoom module runs *inside* that process, after `resolveConfig()` has already thrown or passed — it inherits the guard rather than re-implementing it. |
| 3 | **e2e CI job wired to local Supabase — db start** | **ALREADY EXISTS** | `ci.yml:129-132`: `supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,realtime,supavisor,pooler` then `supabase db reset`. |
| 4 | **… + env** | **ALREADY EXISTS (for Supabase) / EXTEND (for Zoom)** | `ci.yml:134-142` writes `.env.local` with exactly three Supabase variables from `supabase status -o json`. `ZOOM_MODE` is **not** among them, and `resolveZoomMode` treats unset as `live` (`lib/zoom/api.ts:426-435`) — so the mock adapter is currently unreachable from Gate 4. See **Q2**. |
| 5 | **… + seed** | **ALREADY EXISTS / EXTEND** | `ci.yml:157-161` sources `.env.local` and runs `node scripts/ci/seed-e2e.mjs`. Extended in this chunk with the zoom personas and the zoom domain graph — **no new CI step**. |
| 6 | **blocking mechanism** ("Zoom e2e specs in the blocking gate") | **ALREADY EXISTS** | `scripts/ci/e2e-mandatory.mjs:17` `MANDATORY_SPECS` drives both what runs (`ci.yml:163-164`, `--list`) and a post-run guard (`ci.yml:167-169`, `--check`) that fails the gate if a mandatory spec is absent, contributed no tests, or had any test skipped — because a skipped Playwright test otherwise reports as success. Registering a spec here *is* the blocking mechanism. |
| 7 | spec family: **join-authz persona matrix** | **STILL TO BUILD** (Z1c-2) — *personas built here* | No spec exercises `/meet/session/[id]` authorization. The tenant this chunk seeds is its precondition; the spec itself is Z1c-2. |
| 8 | spec family: **disclosure regressions** | **STILL TO BUILD** (Z1c-2) | `lib/utils/session-disclosure.ts` exists and is unit-tested, but no e2e spec covers it. The facilitator link seeded here (`consultorAssigned`, `is_lead`) is the persona `canViewRestrictedReports` needs (`session-disclosure.ts:26`). |
| 9 | spec family: **iCal content** | **STILL TO BUILD** (Z1c-2) | `pages/api/sessions/[id]/ical.ts` + `pages/api/sessions/series/[groupId]/ical.ts` + `lib/utils/session-ical.ts` exist; no e2e spec fetches them. The seeded session is the fixture they need. |
| 10 | **fixture single-source-of-truth** (implied, not in the plan) | **ALREADY EXISTS / EXTEND** | `scripts/ci/e2e-fixtures.json` is read by both `seed-e2e.mjs:29` and `tests/e2e/helpers/auth.ts:16`, and `FixtureKey` (`auth.ts:18`) is a hand-written union that the `Record<FixtureKey, E2eFixtureUser>` assignment (`auth.ts:28`) forces to stay in step with the JSON. Extended, not replaced — this typing is exactly what stops seeder/spec drift. |

**Net**: the infrastructure half of Z1c was already delivered by another track. What genuinely
remains is (a) the personas — this chunk — and (b) the three spec families plus `ZOOM_MODE=mock`
— Z1c-2.

---

## 2. Q1 — how does a seeded session acquire a Zoom meeting?

**Recommendation: (a) seed the rows directly — but not with hand-written SQL. Seed
`zoom_internal.zoom_meetings` and then call the existing
`zoom_internal.sync_projection_from_meeting()` RPC to derive `session_meetings_public`.**
Call it **(a′)**.

### What each option actually costs

**(b) enqueue `meeting_provision` + run one tick with `ZOOM_MODE=mock`** is the higher-fidelity
option, and it is genuinely attractive: it exercises the real handler, the real
`lib/zoom/fake.ts`, and the real projection RPC, so the rows are provably shaped the way
production will shape them. Its cost is not one dependency but five, and each is a new way for
the e2e gate to go red for a reason that has nothing to do with the spec under test:

1. **Hosts.** `meeting-provision.ts:1286` reads `zoom_internal.zoom_hosts`; with no rows the job
   ends in `ZoomNoHostAvailableError` (terminal, no retry). So the seeder must invent host rows
   (`zoom_user_id`, `email`, `max_concurrent`, `org_owned`) — synthetic Zoom account identifiers
   that exist nowhere else in the tenant.
2. **Cron auth.** The tick runs behind `lib/zoom/cron-auth.ts`, which is fail-closed on both
   schemes: the seeder (or the spec) would have to set `CRON_SECRET` or `CRON_API_KEY` in the CI
   env and present it.
3. **A running app server.** `/api/cron/zoom-ticker` only exists once Playwright's `webServer`
   is up — so provisioning would move out of the seed step and into a Playwright global-setup or
   a spec, splitting "seed the tenant" across two mechanisms.
4. **Process identity.** The mock adapter is a **process-local singleton**
   (`api.ts:441-445`, "so mock state persists across calls within one process"). The seeder is a
   separate `node` process from `next start`; anything the seeder mints in mock mode is invisible
   to the server and vice-versa. That is fine as long as provisioning happens *inside* the server
   process — but it is a sharp edge that will cut someone later.
5. **Asynchrony.** A tick is a budgeted batch (`DEFAULT_TICK_BUDGET_MS`, `DEFAULT_BATCH_SIZE`),
   so the spec must poll for the job to reach `succeeded` — a new class of flake in a gate whose
   whole value is being trustworthy.

**(a) raw SQL for both tables** avoids all five but has a real defect: `session_meetings_public`
is a *projection*, and hand-writing both sides means the fixture can encode a projection state
the worker would never produce. The projection logic then has no single owner.

### Why (a′)

`zoom_internal.sync_projection_from_meeting()` already exists
(`supabase/migrations/20260731120000_zoom_provision_rpcs.sql:179`) and is the same function the
provision handler calls. Seeding `zoom_meetings` and invoking that RPC gives:

- the projection derived by **the production code path**, not by the fixture — so
  `session_meetings_public` cannot drift from what the worker writes;
- zero dependency on hosts, cron secrets, a running server, mock-singleton identity, or polling;
- a deterministic, idempotent row set (fixed synthetic UUIDs, `UNIQUE (surface_type, surface_id)`
  on the projection makes re-seeding converge).

What (a′) gives up, stated plainly: it does **not** prove that `meeting_provision` produces those
rows. That is a real loss — but it is the *provisioning job's* coverage, and the job already has
dedicated unit coverage from Z1b. Z1c's DoD is "Zoom e2e specs in the blocking gate", i.e.
covering the **surfaces** (join-authz, disclosure, iCal), not re-proving the worker through the
slowest possible harness.

**Recommendation for the PM: adopt (a′) for Z1c-2, and record option (b) as the right shape for a
later, separate `meeting_provision` end-to-end spec** — where the five dependencies above are the
subject of the test rather than incidental risk. **Nothing implementing Q1 was written in this
chunk**, per the prompt: no `zoom_meetings` or `session_meetings_public` rows are seeded, and the
seeded session carries `meeting_link = NULL` so it sits in the honest pre-provisioning state.

---

## 3. Q2 — where does `ZOOM_MODE=mock` enter the e2e environment?

**File/step: `.github/workflows/ci.yml`, the `Point the app at the local stack` step
(`:134-142`) — one more `echo` into the same `.env.local` heredoc.**

Rationale for that step rather than a `env:` key on the job or on the Playwright step:

- Playwright's `webServer` (`playwright.config.ts:56-61`) runs `npm run start` in CI. `next start`
  loads `.env.local`, so a variable written there reaches the server process. A step-level `env:`
  on the *Playwright* step would also reach it (child process inherits), but a job-level `env:`
  and a step-level `env:` both leave the **seed step** and any local reproduction (`npm run
  start` by hand) without it. `.env.local` is the one place that serves CI, the seeder and a
  developer identically — and it is already the file this gate uses for exactly that purpose.

**Does it have to precede `npm run build`? No — but it will anyway, and that is free.**

- `ZOOM_MODE` is not `NEXT_PUBLIC_*`, so Next.js does not inline it into the client bundle; it is
  read at **runtime** via `process.env` inside `resolveZoomMode(env = process.env)`
  (`lib/zoom/api.ts:431`), which is only reached from `getZoomApi()` — and every call site is
  inside a request/job handler (`lib/zoom/jobs/host-sync.ts:193`,
  `lib/zoom/jobs/meeting-provision.ts:1783`; verified by grep — there is **no module-scope
  call**). So a build that ran without it is not poisoned.
- The existing step already sits before `Build (production)` (`:148-149`), so adding the line
  there costs nothing and removes the question.

**One caveat the PM should rule on with Z1c-2**: `resolveZoomMode` throws `ZoomConfigError` on any
value other than `live`/`mock`/empty. Writing the line into `.env.local` means a typo becomes a
runtime 500 in the ticker/provision path rather than a build failure — which is the fail-loud
behaviour Z1b deliberately chose, so I am not proposing to change it, only noting where it
surfaces.

---

## 4. Q3 — is `tests/e2e/` reachable by type-check and lint?

Answered by running the tools, not by reading config. **The answer is different for the two
tools, and different again for `.mjs`.**

| Path | `npm run type-check` (`tsc --noEmit`) | `npm run lint` (`eslint --ext .js,.jsx,.ts,.tsx . --max-warnings=0`) |
|---|---|---|
| `tests/e2e/helpers/auth.ts` | **YES — checked** | **YES — linted** |
| `tests/e2e/*.spec.ts` (incl. `ci-fixture.spec.ts`) | **NO — excluded** | **YES — linted** |
| `scripts/ci/*.mjs` (`seed-e2e.mjs`, `seed-e2e-zoom.mjs`, `e2e-mandatory.mjs`) | **NO** | **NO** |
| `scripts/ci/e2e-fixtures.json` | **YES** — pulled into the program via `resolveJsonModule` by `auth.ts`'s import | n/a |

Evidence:

- `tsc --noEmit --listFilesOnly` over the real config emits exactly two paths under
  `tests/e2e/` + `scripts/ci/`: `tests/e2e/helpers/auth.ts` and `scripts/ci/e2e-fixtures.json`.
  Specs are excluded by `tsconfig.json`'s `exclude` (`"**/*.spec.ts"`); `.mjs` never matches the
  `include` globs (`"**/*.ts"`, `"**/*.tsx"`).
- `eslint --ext .js,.jsx,.ts,.tsx tests/e2e --format json` lists 19 files, including every
  `*.spec.ts` and `helpers/auth.ts`.
- `eslint --ext .js,.jsx,.ts,.tsx scripts/ci` → `No files matching the pattern "scripts/ci" were
  found.` (`scripts/ci` holds only `.mjs`, `.json` and `.sh`.)

**Consequence for what this chunk adds, stated plainly rather than assumed:**

- `scripts/ci/seed-e2e-zoom.mjs` is **unchecked by both gates**. Its only automated proof is that
  it runs — which is why the double-run seeder proof and the login spec matter more here than
  they would for a `.ts` module. I did not add it to either gate: bringing `.mjs` into `npm run
  lint` would change the lint surface for the whole repo (an unrelated-cleanup deviation), and
  `allowJs` type-checking of `.mjs` would pull every script in the repo into `tsc`.
- The **fixture JSON is type-checked** through `auth.ts`. This is the load-bearing safety net: a
  persona key added to the JSON but not to `FixtureKey`, or a field the interface does not
  declare, fails `npm run type-check`. Every persona this chunk adds therefore has a compile-time
  tie to the seeder's input.
- The new **login spec is linted but not type-checked**, same as every existing spec.

---

## 5. STOP conditions — all four evaluated, none fired

| STOP condition | Checked | Result |
|---|---|---|
| Shared seeder cannot take more personas without restructuring | Read `seed-e2e.mjs` whole; `ensureAuthUser:52` / `ensureProfile:91` / `ensureRole:109` are already per-fixture helpers driven by a loop over `FIXTURES.users` (`:146`) | **DID NOT FIRE.** The only structural change is per-fixture school/community/active-state resolution (previously hard-coded to `FIXTURES.school.id`) and splitting the single loop into profile-pass → zoom-domain → role-pass so `user_roles.community_id` has its FK target. Additive, not a restructure. |
| Zoom-domain seeding requires a **migration** | Queried the live local schema after `supabase db reset` (all 7 migrations applied) for `growth_communities`, `consultor_sessions`, `session_facilitators`, `user_roles`, `schools`, `profiles` | **DID NOT FIRE.** Every column and FK the seeding needs already exists in the baseline. **No migration is added by this chunk.** |
| Gate 4's ephemeral stack cannot support the persona matrix | `supabase start -x studio,logflare,vector,edge-runtime,imgproxy,mailpit,realtime,supavisor,pooler` (CI's exact list) locally | **DID NOT FIRE.** `db`, `auth` (gotrue), `rest` (postgrest), `kong`, `storage` and `pg_meta` all come up. The matrix needs auth (login), rest (service-role writes) and kong (API URL); none is in the exclusion list. |
| The existing fixtures/seeder are not what Gate 4 uses | Read `ci.yml:157-169` | **DID NOT FIRE.** Gate 4 sources `.env.local` and runs `node scripts/ci/seed-e2e.mjs`, then runs exactly `node scripts/ci/e2e-mandatory.mjs --list` and checks the report. The premise holds. |

---

## 6. Persona matrix

Seeded by `scripts/ci/seed-e2e.mjs` + `scripts/ci/seed-e2e-zoom.mjs`. "Verdict" is the expected
`canViewSession` outcome for the seeded session
(`e2e00000-0000-4000-8000-000000000501`, school `990001`, community
`e2e00000-0000-4000-8000-000000000c01`) — **asserted by Z1c-2, not by this chunk.**

| Persona (fixture key) | Roles seeded | `canViewSession` branch it proves | Verdict |
|---|---|---|---|
| `admin` *(pre-existing)* | `admin` @ 990001, active | `:94` — `highestRole === 'admin'` short-circuit | **allow** |
| `consultorGlobal` | `consultor`, **school_id NULL**, active | `:103` — `getConsultorAccess(...).isGlobal` | **allow** |
| `consultorAssigned` | `consultor` @ **990001**, active (+ lead facilitator on the session) | `:108` — `access.schoolIds` contains the session's school | **allow** |
| `consultorOtherSchool` | `consultor` @ **990002**, active | negation of `:108` — consultor whose schools exclude the session's; falls through to `:122` | **deny** |
| `gcLeader` | `lider_comunidad` @ 990001, **community_id = the session's community**, active | `:114-120` — an active role whose `community_id` matches | **allow** |
| `docente` *(pre-existing)* | `docente` @ 990001, no community, active | negation of everything — the plain `:122` fall-through | **deny** |
| `inactiveConsultor` | `docente` @ 990001 active **+ `consultor` @ 990001 `is_active:false`** | the Z1a invariant: a role that would authorize via `:108` does not, because it is inactive | **deny** |

Three notes a reviewer should hold onto:

1. **The inactive persona needs its active `docente` row.** With only an inactive role,
   `getUserRoles` returns `[]` → `getHighestRole` returns `null` →
   `resolveMeetSessionAccess` bails at `session-meet-access.ts:71` before `canViewSession` is
   ever consulted, and the persona could not log in and reach `/dashboard` either. The active
   `docente` row (no `community_id`) makes the denial attributable to the *deactivation* rather
   than to having no roles at all. The two rows use different `role_type`s deliberately —
   `ensureRole` keys on `(user_id, role_type)`.
2. **The denial is enforced twice, and the seeding exercises both.** `getUserRoles`
   (`utils/roleUtils.ts:307`) filters `is_active = true` in the query, so the inactive row never
   reaches `canViewSession`; `canViewSession`'s own `r.is_active` predicates (`:114-120`) are the
   second layer. A reviewer should not read the persona as proving only the second.
3. **`consultorAssigned` being the facilitator cannot mask its branch.** `canViewSession` never
   reads `ctx.isFacilitator` — that flag only reaches `canEditSession` and the disclosure
   helpers. The facilitator link exists because Z1c-2's disclosure specs need a persona that
   satisfies `canViewRestrictedReports` (`lib/utils/session-disclosure.ts:26`).

### Why `lider_comunidad` for the community-membership branch

`canViewSession`'s GC branch is role-type-agnostic — it matches **any** active role carrying the
session's `community_id`. But the app's write paths only ever put a `community_id` on a
`lider_comunidad` row: `pages/api/admin/assign-role.ts:101-102` sanitizes `communityId` to `null`
for every other role type, explicitly so "stray IDs on roles that don't own them (e.g. docente
with a body communityId) are written as null". **A plain non-leader growth-community "member"
with a `user_roles.community_id` is not a shape this application produces**, so seeding one would
have meant inventing a row the product never creates. Declared as a limitation: the branch is
proven with the only shape that reaches it.

### `meeting_link` is NULL, and that is enough for the matrix

The seeded session is pre-provisioning: `meeting_provider = 'zoom'`, no link. On
`/meet/session/[id]` that means an **authorized** persona renders the page with
`data-testid="meet-no-link"` (`pages/meet/session/[id].tsx:86`) while an **unauthorized** one
gets `notFound: true` (`:133-135`). So Z1c-2 can write the full join-authz matrix on
`page-renders` vs `404` **without Q1 being resolved first** — Q1 only gates the specs that need
an actual meeting.

---

## 7. Commit map

| SHA | Purpose |
|---|---|
| `5e9d935` | `docs(z1c)` — the reconciliation (§1–§5 above). Landed alone, before any code. |
| `3034c28` | `test(z1c)` — fixture personas, the two-pass seeder, `scripts/ci/seed-e2e-zoom.mjs`. |
| `e4e4b93` | `test(z1c)` — `FixtureKey`/`FIXTURE_KEYS` typing + the login proof over every persona. |
| *(this commit)* | `docs(z1c)` — §6–§11 of this file. |

Three code/doc commits + this one. No migrations, no application source touched.

---

## 8. Files

**Risk: medium — changes what CI seeds**

- `scripts/ci/seed-e2e.mjs` *(modified)* — two-pass ordering (schools → users+profiles → zoom
  domain → roles); per-fixture school/community/active-state resolution; `ensureRole` now
  converges an existing row instead of only reactivating it. **The local-only guard
  (`:31`, `:33-49`) is untouched — byte-identical to the fork point.**
- `scripts/ci/e2e-fixtures.json` *(modified)* — 5 new personas, a second school, and the `zoom`
  domain block with fixed synthetic ids.

**Risk: low — new, additive, reached only through the guarded seeder**

- `scripts/ci/seed-e2e-zoom.mjs` *(new)* — growth community + provisionable session +
  facilitator link. No `main()`, no shebang, not runnable, no env access.

**Risk: low — test-side only**

- `tests/e2e/helpers/auth.ts` *(modified)* — `FixtureKey` extended (this is the compile-time
  anti-drift tie), `E2eFixtureUser` gains the optional seeding fields, plus `FIXTURE_KEYS`,
  `E2E_SCHOOL_SECONDARY`, `E2E_ZOOM`.
- `tests/e2e/ci-fixture.spec.ts` *(modified)* — the login block iterates `FIXTURE_KEYS`
  instead of a hard-coded `['admin', 'docente']`.

**Untouched, deliberately**: `.github/workflows/ci.yml`, `scripts/ci/e2e-mandatory.mjs`, every
`lib/zoom/**` module, `supabase/migrations/**`, all application source.

---

## 9. Test evidence

All figures produced on this branch, on this machine, against the local ephemeral stack.
No command in this section was piped through `tail` before its exit code was read.

| Gate | Result |
|---|---|
| `npm run type-check` | **exit 0**, no diagnostics |
| `npm run lint` | **exit 0** (`--max-warnings=0`) |
| `npm test` | **exit 0** — **3992 passed / 3992, 253 test files** |
| `npm run build` | **exit 0** (production build, `.env.local` pointing at the local stack) |
| `npm run test:db` | **exit 0** — `Files=7, Tests=171 … Result: PASS`, on a from-scratch `supabase db reset`. **Matches the 171/171 across 7 suites baseline exactly.** |
| e2e (mandatory specs, `CI=true` ⇒ prod server, workers 1) | **exit 0** — **13 passed (17.0s)** |
| `node scripts/ci/e2e-mandatory.mjs --check` | **exit 0** — `OK — 2 mandatory spec(s) ran with no skips` |

E2e composition: 7 login tests (one per persona, was 2) + 4 storage-state tests +
2 smoke = 13. Every new persona reached `/dashboard` through the real login form, including
`consultorGlobal` (`school_id NULL`), `gcLeader` (`lider_comunidad`) and `inactiveConsultor`.

### Seeder double-run proof

`supabase db reset` → seed → snapshot → seed → snapshot, on the final code:

```
RESET_EXIT=0   SEED1_EXIT=0   SEED2_EXIT=0
SNAPSHOT_DIFF_EXIT=0 (0 = identical)
authusers 7 · profiles 7 · user_roles 8 · schools 2 ·
growth_communities 1 · consultor_sessions 1 · session_facilitators 1
```

The snapshot covers row counts plus every seeded column of `profiles`, `user_roles`,
`growth_communities`, `consultor_sessions` and `session_facilitators`. The **only** difference
between the two runs is the log line `created` → `reused`. Counts are unchanged, so nothing
duplicated; values are unchanged, so nothing was rewritten.

### Local-only guard, re-proven (not modified)

```
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co node scripts/ci/seed-e2e.mjs
[seed-e2e] FAILED: refusing to seed e2e fixtures against non-local Supabase host …
GUARD_EXIT=1
```

### Fail-on-old proofs

**(a) `ensureRole` convergence — genuine fail-on-old, fork-point code actually executed.**
`git show a1712f5:scripts/ci/seed-e2e.mjs` was extracted and run against a deliberately drifted
row:

| Step | `inactiveConsultor`'s `consultor` row |
|---|---|
| 1. after the new seeder | `is_active = f` ✓ |
| 2. drift (manual `UPDATE`) | `is_active = t` |
| 3. **fork-point seeder** (`exit 0`) | `is_active = t` — **old code silently leaves the drift in place** |
| 4. new seeder (`exit 0`) | `is_active = f` — converged |

The old `ensureRole` only ever reactivates (`a1712f5:scripts/ci/seed-e2e.mjs:118-126`), so a
persona meant to be denied would have been silently granted access on any re-seed of a drifted
stack. This is the defect the convergence change fixes.

**(b) `FixtureKey` ↔ fixture-file drift — genuine fail-on-old.** Adding a `FixtureKey` member
with no JSON entry and running the real gate:

```
tests/e2e/helpers/auth.ts(50,14): error TS2741: Property 'personaNotInTheJson' is missing in
type '{ admin: …; docente: …; consultorGlobal: …; … }' but required in type
'Record<FixtureKey, E2eFixtureUser>'.
```

Reverted immediately; `git diff` on the file confirms restoration.

**(c) The login tests have NO fail-on-old, and I am not going to manufacture one.**
They assert authentication, which the fork-point seeder also produces: run the old seeder against
the *new* fixture file and all seven personas still log in (the old loop iterates
`FIXTURES.users` and ignores the fields it does not know, so they get roles — the *wrong* ones,
at the primary school, with no community and no inactive row). What the old seeder gets wrong is
**authorization shape**, and nothing in this chunk asserts authorization — that is exactly what
Z1c-2's matrix is for. Stated plainly so the PM does not read 7/7 green as coverage it is not.

---

## 10. Scrutiny areas — where I would attack this if I were reviewing

1. **`ensureRole`'s convergence is now a three-column write, and I changed T2's semantics.**
   It updates `school_id`, `community_id` and `is_active` together. If a future persona is
   expected to accumulate a role row from somewhere else (a UI flow inside a spec, say), this
   seeder will now stomp it on the next run where the old one would not have. I judged that
   correct — a fixture file that does not fully describe the fixture is worse — but it is a
   behavioural change to another track's code and deserves a second opinion.
2. **The two-pass split moved the zoom seeding into the middle of user seeding.** If
   `seedZoomFixtures` throws, the tenant is left with profiles but no role rows — a *partially*
   seeded stack in a shape the old single-pass loop could not produce. Re-running converges it
   (every write is an upsert/look-before-insert), but the failure mode is new. Worth deciding
   whether a partially-seeded stack should be loud rather than merely recoverable.
3. **`scripts/ci/seed-e2e-zoom.mjs` is reached by neither `type-check` nor `lint`** (§4). A
   column name typo in it fails only at seed time. That is true of `seed-e2e.mjs` too and I did
   not change the situation — but the surface just grew, and the PM may want `.mjs` brought into
   one of the gates as its own piece of work.
4. **`sessionDate: "2030-06-12"` is a magic constant chosen for idempotency.** It has to be in
   the future for provisioning to make sense and fixed so a re-run writes the same row. It will
   stop being "the future" in 2030. No test asserts futureness, so this fails silently and late.
5. **I extended T2's `ci-fixture.spec.ts` rather than adding a Zoom-scoped sibling spec.** The
   login block is now data-driven off `FIXTURE_KEYS`, which means any persona a *future* track
   adds to the fixture file silently joins this spec — good for coverage, but it makes one spec's
   runtime a function of a file other people edit. If the PM prefers a separate
   `tests/e2e/zoom-fixtures.spec.ts` (registered in `MANDATORY_SPECS`), that is a cheap change and
   I will make it in Z1c-2.

---

## 11. Known limitations / deferred

- **No `zoom_meetings` / `session_meetings_public` rows** — that is Q1, deliberately unimplemented
  pending the PM's ruling.
- **`ZOOM_MODE=mock` is not wired into `ci.yml`** — that is Q2, and `ci.yml` is untouched in this
  chunk. Until it is wired, `getZoomApi` in the e2e environment would resolve to `live`.
- **No non-leader growth-community "member" persona** — the shape does not exist in the app's
  write paths (§6).
- **No `data-testid` added to application source.** The three the matrix needs already exist
  (`meet-join-link`, `meet-no-link`, `meet-back-link`). Z1c-2 will need **no new testid for the
  join-authz matrix**; whether the disclosure and iCal specs need one is an open question for
  that chunk.
- **The zoom-domain rows are asserted by nothing yet.** Their existence is proven only by the
  seeder exiting 0 and the snapshot; no spec reads them until Z1c-2.
