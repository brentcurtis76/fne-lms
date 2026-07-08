# Fase 0 — Review Request

> Retroactive first instance of the review-request rule (CLAUDE.md Executor Rules #6). Written by the executor that built the phase. Reviewer instructions: `docs/planning/review-protocol.md`.

## Branch

- **Branch:** `feat/fase0-ci`
- **Base:** `main` @ `0650746`
- **Commits:** 8 (`50c56b0` → `ef764ca`) at time of writing. The docs commit adding this file, and a pending baseline/archive commit (see Known limitations), will extend this.

## Objective and scope (copied from itinerary, Phase 0)

- **Objective:** Establish the AI-agent working environment on top of `fne-lms-working`.
- **Scope (in):** Create CLAUDE.md + AGENTS.md + PROJECT_STATE.md; wire CI (typecheck, unit, `supabase test db`, Playwright); add pgTAP + Supabase test helpers; add a `data-testid` lint rule; add a hook blocking migrations that disable RLS; set up branch protection requiring green checks.
- **Scope (out):** Any feature code, any schema change.
- **DoD:** builds pass; typecheck passes; CI runs all four gates on PR; a deliberately world-readable table fails the `rls_enabled` test.

## Files created/modified, by risk

**High — defines what "green" means, or enforces a hard rule:**
- `.github/workflows/ci.yml` — 6 checks (RLS guard + Gates 1, 1b, 2, 3, 4), concurrency cancel, `timeout-minutes: 20` everywhere
- `scripts/ci/check-rls-migrations.sh` — CI-side RLS-disable guard (scans `supabase/migrations/` only)
- `scripts/hooks/block-rls-disable.sh` + `.claude/settings.json` — author-time PreToolUse hook, same rule
- `supabase/tests/000-setup.sql` — pgTAP + vendored `tests.*` helpers (hand-written, basejump-API-compatible)
- `supabase/tests/001-rls-enabled.sql` — `public` schema must be fully RLS-enabled, **empty allowlist**
- `playwright.config.ts` — CI now builds and tests against a production server

**Medium — conventions and commands agents will obey:**
- `CLAUDE.md` (rewritten, 9 real roles), `AGENTS.md` (new mirror), `PROJECT_STATE.md` (new living state doc)
- `package.json` — removed broken `test:db:supervisor`; `test:db` = `supabase test db`
- `.eslintrc.testid.json` + `lint:testid` (advisory), `.gitignore` overrides to track state/planning docs

**Low — documentation and inert test content:**
- `docs/ci-setup.md`, `docs/planning/GENERA-00/-01/-itinerario` + `archive/` (planning docs moved into git)
- `tests/e2e/smoke.spec.ts` (Gate 4 smoke), `supabase/tests/010-consultor-sessions-rls.sql` (pure move from `database/tests/`)

## Test evidence

Honest status: **most of this phase's own gates have not executed anywhere yet** — the sandbox that built it had no Docker/psql and could not `npm ci` native binaries. CI itself is the deliverable, and it is unverified until the first PR runs.

- **Typecheck:** PASS local, incremental `tsc --noEmit`, 0 errors (2026-07-07). Full cold check → Gate 1 on first PR.
- **RLS-disable hook:** 4/4 self-tests (block Write, pass benign, block Bash, CI guard clean over the 38 legacy migrations).
- **pgTAP:** 13 asserts written across 3 files (setup 2, rls-enabled 3, consultor-sessions 8) — **never executed**. → Gate 3.
- **Vitest / Lint / E2E:** **not run on this branch.** → Gates 2, 1b, 4. Known risk: 13 Vitest failures from April (assessment-builder) may reappear.

## Where the reviewer should push hardest

1. **`.github/workflows/ci.yml` has never run.** Written blind, no runner available — action versions, Supabase CLI setup, the Gate 4 env-placeholder scheme, and job wiring will meet reality for the first time on the PR. Read it as untested code, because it is.
2. **`supabase/tests/000-setup.sql` helpers are vendored by hand.** Claimed API-compatible with basejump's test helpers but never executed against a real Postgres; a signature or semantics mismatch would invalidate every future RLS matrix built on them (and Fase 1 builds ~40–60 asserts on exactly this).
3. **`001-rls-enabled.sql`'s empty allowlist is asserted, not demonstrated.** It was verified by reading migrations, not by running against the live schema; also the DoD's negative control ("a deliberately world-readable table fails the test") was never actually performed.
4. **The migration baseline/archive maneuver changes what Gate 3 applies.** Moving 38 legacy migrations to `supabase/migrations-archive/` + a `--linked` baseline dump (procedure in `docs/ci-setup.md`) is staged but uncommitted at time of writing; verify the final commit matches the documented procedure, and note `check-rls-migrations.sh` scans only the active dir — archived files leave the guard's view by design (they are no longer applied), a judgment call worth a second opinion.
5. **Doc drift: CLAUDE.md still says "CI — Four Gates" while the workflow and PROJECT_STATE.md say 6 checks.** Found while writing this request — exactly the PROJECT_STATE-truthfulness class of finding the protocol exists to catch; the reviewer should decide whether naming ("4 gates + guard + lint" vs "6 checks") gets normalized.

## Known limitations / deferred

- **Branch protection not enabled** (scope-in item) — requires GitHub admin; deferred to Brent after the first PR, exact check names in `docs/ci-setup.md`.
- **DoD is at best half-verified**: "CI runs all four gates on PR" is pending the first PR; the rls_enabled negative control was never run.
- 13 April Vitest failures may surface at Gate 2 — triage plan (fix or `.skip()` + TODO) already logged in PROJECT_STATE.md.
- `lint:testid` is advisory until the existing baseline is cleaned.
- Working tree at time of writing carries the staged (uncommitted) migration archive + several pre-existing untracked docs (`docs/notes.md`, code reviews) awaiting Brent's keep/discard call.
