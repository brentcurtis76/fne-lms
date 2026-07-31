# T2 — CI run log (PR #27, branch `phase/t2-ci`)

All runs are on the reworked gate 4: `supabase start` → `supabase db reset` →
`.env.local` from `supabase status -o json` → `npm run build` → `node
scripts/ci/seed-e2e.mjs` → mandatory specs → skip guard → `supabase stop
--no-backup`.

Mandatory set = `tests/e2e/smoke.spec.ts` (2 tests) + `tests/e2e/ci-fixture.spec.ts`
(6 tests) = **8 tests**.

## Run 1 — baseline, gate 4 RED (expected-shape failure)

- Commit `decf9e4` · https://github.com/brentcurtis76/fne-lms/actions/runs/30601851610
- Stack start, `db reset`, env extraction, build and seed **all succeeded** on the runner:

```
[seed-e2e] school 990001 "Colegio Sintetico E2E" ready
[seed-e2e] admin <e2e-admin@example.com> created — role admin, id 50e740da-…
[seed-e2e] docente <e2e-docente@example.com> created — role docente, id 59d1cfdd-…
[seed-e2e] done
```

- Specs: **7 passed, 1 failed**. The failure was locator ambiguity, not access —
  `/admin/schools` renders the same `<h1>` twice (layout header + page heading):

```
Error: strict mode violation: getByRole('heading', { name: 'Gestión de Escuelas' }) resolved to 2 elements:
    1) <h1 class="text-2xl sm:text-3xl font-bold …">Gestión de Escuelas</h1>
    2) <h1 class="text-3xl font-bold …">Gestión de Escuelas</h1>  (inside <main>)
```

- Guard on the real report: `[e2e-mandatory] OK — 2 mandatory spec(s) ran with no skips`
- Teardown ran (`Tear down local Supabase stack: success`).
- Fixed in `c6e3c99` by scoping the assertion to the `main` landmark.

## Run 2 — gate 4 GREEN

- Commit `c6e3c99` · https://github.com/brentcurtis76/fne-lms/actions/runs/30602316662

```
Running 8 tests using 1 worker
  8 passed (8.6s)
[e2e-mandatory] OK — 2 mandatory spec(s) ran with no skips
```

- All six checks pass: RLS migration guard, Gate 1 Typecheck, Gate 1b Lint,
  Gate 2 Unit, Gate 3 pgTAP, Gate 4 E2E.

## Run 3 — skip-guard demonstration (deliberately RED)

- Commit `48c5806` (scratch `test.skip` on a mandatory spec; reverted immediately
  after) · https://github.com/brentcurtis76/fne-lms/actions/runs/30602616645
- **This is the hole the guard closes.** Playwright counted 8 tests, ran 7, and
  exited 0 — the "Run mandatory e2e specs" step **succeeded**:

```
Running 8 tests using 1 worker
  7 passed (8.4s)
```

- The guard then read the JSON report and failed the job:

```
[e2e-mandatory] FAILED — mandatory specs must run, not skip:
  - tests/e2e/ci-fixture.spec.ts: skipped test "is denied the admin-only page"
##[error]Process completed with exit code 1.
```

- Step results: `Run mandatory e2e specs: success` · **`Guard — no mandatory spec
  may be skipped: failure`** · run conclusion `failure`. Without the guard this
  run would have been green with a mandatory access-control test silently
  disabled.
- Scratch commit reverted in the next commit; `tests/e2e/ci-fixture.spec.ts` on
  the branch contains no `test.skip`.

## Run 4 — scratch skip reverted, gate 4 GREEN again

- Commit `c123727` · https://github.com/brentcurtis76/fne-lms/actions/runs/30602963208
- Run conclusion: **success** — all six checks green (RLS migration guard,
  Gate 1 Typecheck, Gate 1b Lint, Gate 2 Unit, Gate 3 pgTAP, Gate 4 E2E).

```
Running 8 tests using 1 worker
  8 passed (9.6s)
[e2e-mandatory] OK — 2 mandatory spec(s) ran with no skips
```

## Run 5 — final head (docs + a comment-only edit)

- Commit `<head>` · recorded in the PR checks. Same code as run 4; it exists only
  because this evidence file had to record run 4's result.
