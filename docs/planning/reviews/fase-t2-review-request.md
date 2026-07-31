# Fase T2 — review request

**Branch:** `phase/t2-ci`
**Base:** `d62d7e9` (origin/main at branch creation)
**Commits:** see "Commits" below
**PR:** https://github.com/brentcurtis76/fne-lms/pull/27

## Objective and scope (from `docs/plan/PLAN.md`, Phase T2 — frozen v4)

> **Scope:** `.github/workflows/ci.yml` gate 4; `scripts/ci/seed-e2e.mjs`;
> `tests/e2e/helpers/auth.ts`; `tests/e2e/ci-fixture.spec.ts`; playwright config
> wiring; skip-guard.
> **Out of scope:** product specs (owned by later phases).

Executor prompt additionally froze out: `middleware.ts` (zero changes, D-10) and
any application source beyond test helpers / scripts / workflow config.

This phase *builds* the CI fixture topology. Before it, gate 4 built the app
against placeholder/secret env and ran only `tests/e2e/smoke.spec.ts` — no
Supabase stack was started or seeded anywhere in CI.

## Files, grouped by risk

**Highest risk — CI topology**
- `.github/workflows/ci.yml` (gate 4 rewritten): `supabase start -x …` →
  `supabase db reset` → `.env.local` from `supabase status -o json` → build →
  seed → mandatory specs → skip guard → `supabase stop --no-backup` (`if: always()`).
  Job timeout raised 20 → 30 min; CLI pinned to `2.110.0` for this job only.

**Medium risk — test infrastructure**
- `scripts/ci/seed-e2e.mjs` (new): idempotent synthetic seeder. Refuses any
  non-local Supabase host.
- `tests/e2e/helpers/auth.ts` (new): UI login → storageState per fixture.
- `scripts/ci/e2e-mandatory.mjs` (new): mandatory spec list + fail-on-skip guard.

**Lower risk**
- `tests/e2e/ci-fixture.spec.ts` (new): the fixture spec itself.
- `scripts/ci/e2e-fixtures.json` (new): shared credential/fixture constants.
- `playwright.config.ts`: CI reporter now also emits JSON for the guard.
- `.gitignore`: `test-results/`, `tests/e2e/.auth/`, and a negation for the
  fixtures JSON (the repo ignores `*.json` wholesale).

No application source touched. No migration touched. `middleware.ts` untouched.

## Test evidence

Full run log with URLs and verbatim output: `docs/plan/evidence/t2/ci-runs.md`.

| What | Command | Result |
|---|---|---|
| Mandatory e2e set | `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list) --project=chromium` | **8 passed (8.6s)** — `smoke.spec.ts` (2) + `ci-fixture.spec.ts` (6) |
| Skip guard, happy path | `node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json` | `OK — 2 mandatory spec(s) ran with no skips` (on the real CI report) |
| Skip guard, hostile path | same, with a scratch `test.skip` on a mandatory spec | specs step **succeeds**, guard step **fails** — see run 3 |
| Gate 1 typecheck / 1b lint / 2 unit / 3 pgTAP | CI on the branch commit | all green |
| Seeder idempotency | `node scripts/ci/seed-e2e.mjs` twice | 1st `created`, 2nd `reused` for both fixtures |
| Seeder safety rail | `NEXT_PUBLIC_SUPABASE_URL=https://<prod>.supabase.co node scripts/ci/seed-e2e.mjs` | refuses, exit 1 |

**Why the gates were verified in CI rather than locally.** This worktree is shared
with at least one other live session; while T2 ran it carried another phase's
uncommitted source files, and two `next build` processes were writing the same
`.next/` concurrently. A local `npm test` / `npm run build` would have graded a
tree that is not this branch's content. CI runs the four gates on a clean
checkout of the exact pushed commit, which is the stronger signal — that is what
the table reports.

## Scrutinise these hardest

1. **`beforeAll` ordering for storageState.** Each describe declares
   `test.use({ storageState: <path> })` for a file its own `beforeAll` creates.
   This works because Playwright builds the test context after `beforeAll`, but it
   is a subtle ordering dependency. The textbook alternative — a `setup` project
   with `dependencies` — was rejected because the only way to wire it without
   attaching a login dependency to the default `chromium` project (used by ~57
   legacy specs, many already failing locally) was extra project surgery.
   `browser.newContext()` inside the hook also had to be given an explicit empty
   storageState, because Playwright otherwise applies the enclosing `test.use`
   to it and tries to read the very file it is about to write.
2. **Pinned CLI in gate 4 vs `latest` in gate 3.** Gate 4 passes service names to
   `supabase start -x`; those names are not a stable contract across CLI releases,
   so an unrelated PR could go red on a CLI bump. Pinning removes that, at the
   cost of two CLI versions in one workflow and a pin that needs bumping. If you
   prefer one version everywhere, the alternative is dropping `-x` entirely and
   paying several GB of image pulls per run.
3. **The `-x` exclusion list is a silent capability removal.** Gate 4 starts
   without `studio,logflare,vector,edge-runtime,imgproxy,mailpit,realtime,supavisor,pooler`.
   db/auth/rest/kong/storage stay. Nothing in the mandatory set needs the excluded
   services (the dashboard renders fine without realtime), but a later phase that
   adds an Edge Function or an inbucket/mailpit assertion will see a confusing
   connection failure rather than a clear "service not started". Worth a comment
   or an explicit allowlist if a later phase needs one back.
4. **The admin-page assertion couples an infra spec to a product page.**
   `ci-fixture.spec.ts` asserts the `/admin/schools` heading "Gestión de Escuelas".
   That is deliberate — it proves *both* the middleware gate and the page's own
   `getUserPrimaryRole()` check — but it means a product rename breaks an
   infrastructure spec. A weaker URL-only assertion would decouple them and prove
   less.
5. **Password locator is a CSS selector.** `input[type="password"]` violates the
   house `getByRole`/`getByTestId` preference. `<input type="password">` has no
   implicit ARIA role and this page's labels are not associated with their inputs,
   so the only role-based fix is adding `data-testid` to `pages/login.tsx` — out
   of scope here. Worth a backlog item before A6b builds on this helper.
6. **Guard ↔ config coupling.** The guard reads
   `test-results/e2e-results.json`, which only exists because
   `playwright.config.ts` adds a JSON reporter under `CI`. Changing the reporter
   config silently changes whether the guard can run at all (it fails loudly
   rather than passing vacuously — but the coupling is implicit).

## Known limitations / deferred

- **Local full-suite `npm run e2e` is unchanged** — the pre-existing ~57
  env-dependent legacy failures remain. Only the two mandatory specs are
  guaranteed, and only in the CI topology.
- **Gate 4 is slower** (stack start + `db reset` + build). Job timeout raised to
  30 min.
- **No product specs added** — later phases own those; they add themselves to
  `MANDATORY_SPECS`.
- **Fixture roles are `admin` and `docente` only.** The four GENERA user types
  (asesor/estudiante/familia/leadership) do not exist yet (Fase 1 owns the
  mapping), so the "disallowed role" fixture uses `docente` per the plan.
- **Shared-worktree hazard observed during execution.** A parallel session
  committed unrelated Phase A0 work onto this branch mid-phase; its commit was
  preserved at `rescue/a0-6e69c9e` and this branch was rebuilt to hold only T2.
  Its working-tree files were left untouched. See the executor report.
