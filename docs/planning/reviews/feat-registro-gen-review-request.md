# Review request — feat/registro-gen (generic public self-registration)

> Feature review (NOT a numbered GENERA itinerary phase — no phase number assigned on purpose).
> Protocol: `docs/planning/review-protocol.md`. Plan approved by Brent 2026-07-20 after two
> independent review rounds (both material findings incorporated — see "Design contract" below).

## Branch

- Branch: `feat/registro-gen`
- Base: `main` @ `cccfff2` (Merge PR #21, fase0 CI)
- Commits: 1 (implementation + tests + docs in a single commit; this file included)

## Objective and scope

**Objective:** a second public self-registration access point at `/registro` that accepts **all
schools** (not only the Santa Marta network) and captures an **optional** per-school generation
(Tractor/Innova-style), feeding the same staging table + admin review panel as the existing
`/registro-tractor` flow.

**In scope**
- New public page `/registro` (fork of `registro-tractor.tsx`) + new endpoint `/api/registro-signup`
- Additive migration: `tractor_signups.generation_id` (uuid NULL, FK → `generations` ON DELETE SET NULL)
- Grant endpoint accepts both sources; applies generation to `profiles.generation_id` under a
  strict fill-only-if-safe contract; parameterized invite email; `refresh_user_roles_cache` call
- Admin panel extended: source badge/filter, generation column, export columns; sidebar renamed "Registros"

**Out of scope (confirmed with Brent)**
- No auto-assignment of growth communities, courses, or learning paths at grant time
- No changes to `/registro-tractor` behavior (only shared-lib additions; its own files untouched
  except none — verified `git diff` touches neither `registro-tractor.tsx` nor `tractor-signup.ts`)
- Roles offered stay `docente` + `equipo_directivo`

## Design contract (generation semantics)

`user_roles.generation_id` is **never written** by this flow — it is reserved for
`lider_generacion` (assign-role.ts:345-349, guarded by its tests). The signup's generation goes to:
`tractor_signups.generation_id` (always retained) and `profiles.generation_id` only when safe:

| Case | profiles.generation_id | applied | warning |
|---|---|---|---|
| No generation on signup | unchanged | false | null |
| New user | set | true | null |
| Existing user, same school, profile generation null | backfilled | true | null |
| Existing user, school null (being backfilled) | backfilled | true | null |
| Existing user, same generation already | unchanged | true | null |
| Existing user, different generation | unchanged | false | "ya tiene otra generación" |
| Existing user, different school | unchanged | false | "pertenece a otro colegio" |
| Stale generation on signup | unchanged | false | "ya no corresponde al colegio" |

A warning never fails the grant; the admin UI surfaces it as an informational toast.

## Files by risk

**Higher risk (auth/provisioning path)**
- `pages/api/admin/tractor-signups/grant.ts` — widened source gate (grant/dismiss/delete),
  generation resolution + contract above, cache refresh ordering (after profile+role writes,
  before `markSignupGranted`), parameterized email body
- `supabase/migrations/20260720134519_add_generation_to_tractor_signups.sql` — additive column + FK

**Medium risk (new public surface)**
- `pages/api/registro-signup.ts` — new anonymous endpoint (own rate-limit bucket, honeypot,
  school existence check, single-query generation-ownership validation)
- `pages/registro.tsx` — new public page (GSSP: schools required / generations fail-soft)

**Lower risk (additive lib + admin UI)**
- `lib/tractorSignups.ts` — additive exports only (`GENERAL_SIGNUP_SOURCE`, `SIGNUP_SOURCES`,
  labels, `getAllSchools`, `getAllGenerations`, `findGenerationForSchool`, `isValidUuid`)
- `pages/api/admin/tractor-signups/index.ts` — `.in('source', …)`, all-schools name resolution,
  batched generation-name lookup, new row fields
- `components/admin/TractorSignupCard.tsx`, `pages/admin/tractor-signups.tsx`,
  `components/layout/Sidebar.tsx` — badges, filter, dialog/export columns, label rename

## Test evidence

- `npm run type-check` — PASS (0 errors)
- `npm run lint` — PASS (zero warnings)
- `npm test` — PASS: 192 files / 2452 tests (2407 pre-existing + 45 new)
  - `__tests__/api/registro-signup.test.ts` — 23 tests (validation, generation edges incl.
    DB-error 500s, dedup incl. cross-source regression, 42P01/23505/insert-failure)
  - `__tests__/api/admin/tractor-signups-grant.test.ts` — 14 tests (source gate on all three
    actions, full generation contract, `user_roles` never carries `generation_id`, cache-refresh
    once/ordering/non-fatal)
  - `__tests__/components/RegistroPage.generation.test.tsx` — 6 tests (selector visibility
    contract with deterministic fixture props)
  - `__tests__/components/TractorSignupsPage.grantWarning.test.tsx` — 2 tests (warning toast on
    successful grant; no warning → success only)
- `npm run build` — PASS
- `npm run lint:testid` — no new violations from touched files (pre-existing baseline unchanged;
  honeypot input got a testid)
- `npm run test:db` — PASS locally (after `supabase db reset` applied the new migration): all 4
  suites / 26 assertions, including `020-tractor-signups-rls.sql` (13 asserts: RLS flag,
  generation_id column + FK, admin CRUD, docente denied per convention, anon denied). Also runs
  in CI Gate 3 on a fresh `supabase db start`.
- Playwright `tests/e2e/registro.spec.ts` — 3 tests (render, client validation + focus, mocked
  submit → success panel). Run locally; not part of the CI smoke gate.

## Areas to scrutinize hardest

1. **Grant Case A decision tree** (`grant.ts`, existing-profile branch): the four-way generation
   outcome interacts with the pre-existing school backfill. I derived `profileMatchesSchool` from
   `backfillingSchool || Number(existingProfile.school_id) === schoolId` — check the edge where a
   profile has `school_id` set to the same school as string vs number.
2. **Widened source gate affects dismiss/delete too** — I widened one check used by three actions;
   tests cover all three, but review whether any OTHER consumer assumes tractor-only rows.
3. **Cache refresh placement** — added `refresh_user_roles_cache` (grant flow previously never
   refreshed; latent staleness gap closed). Confirm calling it non-fatally before
   `markSignupGranted` can't mask a failure mode.
4. **Anonymous endpoint hardening** — `/api/registro-signup` mirrors the tractor endpoint; verify
   the school-existence check + UUID + single-query ownership check leave no enumeration or
   injection surface beyond what the tractor endpoint already accepts.
5. **E2E determinism trade-off** — the plan originally extended the demo seed with a
   no-generations school; I instead moved the generation-visibility branches to a fixture-driven
   component test (truly deterministic) and kept the e2e spec to environment-independent flows
   (precondition: ≥1 school; fails loudly, never skips). Judge whether that deviation is acceptable.

## Known limitations / deferred

- **Prod migration: APPLIED 2026-07-20** (explicitly authorized by Brent in-session) via the
  Supabase Management API — same additive SQL as the committed migration file; column + FK
  verified on the live DB and the version recorded in `supabase_migrations.schema_migrations`
  (`20260720134519`). Note `supabase db push` was deliberately NOT used: the remote history
  tracks the pre-baseline migration series, so push would try to reconcile the squashed baseline.
- Cross-source unique email is accepted behavior: someone already in the tractor staging table who
  submits `/registro` gets silent success and no second row (regression-tested).
- No admin edit UI for a signup's generation; a stale generation fail-softs to null with a warning.
- `lint:testid` baseline remains dirty repo-wide (pre-existing; advisory).
- Demo seed (`scripts/demo-data/`) not extended (see scrutiny item 5).
