# T2 evidence — CI e2e topology

Phase T2 builds the CI e2e fixture topology (it did not exist before: gate 4 built
against placeholder env and ran only the smoke spec against no Supabase stack).

## CI runs (PR [#27](https://github.com/brentcurtis76/fne-lms/pull/27), branch `phase/t2-ci`)

| # | Purpose | Run | Gate 4 result |
|---|---------|-----|---------------|
| [1](https://github.com/brentcurtis76/fne-lms/actions/runs/30601851610) | Baseline — reworked gate 4 on the real topology | `decf9e4` | RED — 7/8, locator ambiguity (not access) |
| [2](https://github.com/brentcurtis76/fne-lms/actions/runs/30602316662) | Locator fixed | `c6e3c99` | **GREEN — 8 passed (8.6s)** |
| [3](https://github.com/brentcurtis76/fne-lms/actions/runs/30602616645) | **Skip-guard demonstration** — scratch `test.skip` on a mandatory spec | `48c5806` | specs step SUCCEEDS (7/8), **guard step FAILS** |
| [4](https://github.com/brentcurtis76/fne-lms/actions/runs/30602963208) | Scratch skip reverted | `c123727` | **GREEN — 8 passed (9.6s)**, all six checks |

Run URLs and the guard's failure output are recorded in [`ci-runs.md`](ci-runs.md).

## What the runs prove

- **[A1]** Gate 4 starts an isolated local Supabase stack on the runner
  (`supabase start`), re-applies every migration from scratch (`supabase db reset`),
  builds and serves the app against that stack's URL/keys, and tears it down
  (`supabase stop --no-backup`, `if: always()`). No remote QA project, no real
  credentials — the keys come from `supabase status -o json` on the runner.
- **[A2]** `scripts/ci/seed-e2e.mjs` seeds an `admin` and a `docente` with known
  credentials plus the one school row they hang off; re-running it converges
  (verified locally: second run reports `reused` for both users).
- **[A3]** `tests/e2e/helpers/auth.ts` produces a storageState per fixture by
  driving the real login form; `tests/e2e/ci-fixture.spec.ts` proves both log in
  and that gating differs (admin reaches `/admin/schools`; docente is bounced to
  `/dashboard`).
- **[A4]** The mandatory list lives in `scripts/ci/e2e-mandatory.mjs`; CI runs
  exactly that list and then re-reads the Playwright JSON report to fail on a
  skipped or absent mandatory spec. Run 2 is the demonstration.
- **[A5]** All six checks green on the final run.
