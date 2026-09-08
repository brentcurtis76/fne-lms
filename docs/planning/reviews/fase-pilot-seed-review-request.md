# PR 4 — Pilot data provisioning — Review Request

- **Series**: Procesos de Cambio remediation, PR 4 of the plan (NOT a GENERA itinerary phase)
- **Branch**: `feat/pilot-seed`
- **Worktree**: `/Users/brentcurtis/dev/wt/proc-pr4`
- **Base**: `097a72b6` (PR 3 head, `docs(eval-reliable): review request for PR 3 …`)
- **Commits on top of base**: 7 (5 implementation/test checkpoints + 1 route type fix + this documentation commit; `git log 097a72b6..HEAD`)
- **Status**: implementation complete on the fake store; **no staging or production run has been performed**, and none can be until the target allowlist is approved (see Decisions pending).

## Objective

Controlled, reviewable tooling that provisions pilot **configuration** — never
users, courses, assignments, instances, responses or transversal-context
answers — in two separated modes:

- **A. Synthetic staging rehearsal**: a `[SINTÉTICO]` school with two grades,
  one complete instrument per grade, expectations, year weights and migration
  plan, on a dedicated staging target, with a manifest-scoped reset.
- **B. Real-pilot configuration provisioning**: only approved, non-PII
  configuration for an existing school on the production-class target, no
  reset, no delete.

Both run through the same four stages (`preflight` → `apply` → `verify`, plus
synthetic-only `reset`), the same pure target guard, the same non-PII manifest
lint, and publish templates only through the shared publication service.

### Scope in
- `config/pilot-provisioning-targets.json` allowlist (null/unapproved on purpose).
- `scripts/pilot-provisioning/*.mjs`: guard, manifest, store, preflight, apply, verify, reset, audit, CLI.
- Additive extraction of the publish route's validation + snapshot logic into `lib/services/assessment-builder/publishTemplate.ts`.
- Manifests `pc-pilot-synthetic-v1.json` and `pc-pilot-v1.template.json`.
- npm scripts `pilot:preflight|apply|verify|reset`; `.gitignore` entries.
- Tests on an in-memory store; operator guide.

### Scope out
- Any write to staging or production (blocked by the unapproved allowlist).
- Creating auth users/profiles/roles, docente-to-course assignments, course structures, transversal context, instances, responses.
- Real docente bindings (a gitignored runtime input is reserved under `.pilot-provisioning/`; nothing consumes it yet).
- Migrations, RLS changes, deployments, E2E/build for the CLI.

## Files by risk

**Higher risk (production code path changed)**
- `pages/api/admin/assessment-builder/templates/[templateId]/publish.ts` — now delegates to the service and maps `{ ok:false, status, error, code?, details? }` / success to the exact previous JSON bodies. Auth → permission → `upgradeExisting` 409 ordering unchanged. 15/15 existing tests green.
- `lib/services/assessment-builder/publishTemplate.ts` (new) — the route's steps 1–5 verbatim, returning a result object instead of writing `res`. Sibling imports are relative (not `@/`) so the CLI can load it under `node --import tsx`.

**Medium risk (new tooling that will eventually write to real projects)**
- `scripts/pilot-provisioning/target-guard.mjs` — pure guard; exact URL/ref/class/key-reference checks; no bypass.
- `scripts/pilot-provisioning/apply.mjs`, `reset.mjs` — the only write paths; apply writes 8 allowlisted tables, reset deletes 9 (adds snapshots).
- `scripts/pilot-provisioning/store.mjs` — Supabase-JS implementation with table allowlists; local file lock.
- `scripts/pilot-provisioning/preflight.mjs`, `verify.mjs`, `manifest.mjs`, `audit.mjs`, `cli.mjs`.

**Low risk**
- `config/pilot-provisioning-targets.json`, `config/pilot-manifests/*.json`, `package.json` scripts, `.gitignore` (un-ignore entries for the two config paths + ignore `.pilot-provisioning/`), docs, tests.

## Test evidence

- `__tests__/scripts/pilot-provisioning/target-guard.test.ts` — 21 tests
- `__tests__/scripts/pilot-provisioning/manifest.test.ts` — 24 tests
- `__tests__/scripts/pilot-provisioning/stages.test.ts` — 18 tests
- `__tests__/scripts/pilot-provisioning/cli.test.ts` — 15 tests
- `__tests__/api/assessment-builder/publish.test.ts` — 15 tests (unchanged, still green after the extraction)
- Focused run: **6 files, 107 tests passed** (the above + the production-QA guard suite, 14, as a regression control).
- Full `npm test`: see the gate line in the report / below.

Covered explicitly: correct staging target accepted; production ref, localhost/127.0.0.1/::1/0.0.0.0, unknown ref, mismatched class and unapproved (committed) allowlist rejected with the client factory never called; no bypass export/env/argv read in the guard; first apply creates the expected counts (1 school, 2 templates, 2 objectives, 2 modules, 6 indicators, 9 expectations, 3 year weights, 4 migration-plan rows, 2 snapshots via publish); second apply is a no-op with the same digest; foreign-owned collision, drifted owned rows, archived owned templates, eligible QA/demo templates, bad grade mapping and missing columns fail closed; verify fails on a missing snapshot / expectation / migration entry / frequency config and on digest mismatch; manifest lint rejects non-reserved emails, JWT/sb_/postgres strings, URLs, secret-named keys, birth-date keys, dates, RUTs, UUIDs and minor-data terms; synthetic reset deletes only owned ids and refuses instance/profile/foreign-snapshot references; realPilot has no reset (throws before the lock); provisioning writes no user/instance/assignment/course tables (fake store + allowlist assertions); the Supabase store delegates publication to the injected shared service with `(client, templateId, { id: actor })` and the CLI loads that exact module.

## Areas to scrutinise hardest

1. **The route extraction** — behaviour must be byte-identical for every status/body. I mapped `code`/`details` conditionally so the 400 bodies match; the success body is rebuilt field by field. The `if (result.ok === false)` form is deliberate: `strict: false` disables truthiness narrowing on the discriminant.
2. **`node --import tsx` as the way the CLI reaches the TypeScript service.** `tsx`'s `tsImport` API failed on both `@/` aliases and extensionless sibling imports under Node 22, so the npm scripts register the loader process-wide. Running `cli.mjs` with bare `node` fails with a clear message. Judge whether a `.mjs` copy of the service would have been the safer choice; I chose one code path over two copies.
3. **Conflict semantics in preflight** — a foreign template collides when it shares (area, grade) and either version (`1.0.0`/`1.1.0`) or name; any foreign *eligible* template on a manifest grade is a conflict. This is strict on purpose (a grade must end with exactly the approved set) but it means a real pilot with pre-existing published instruments on those grades will stop until they are archived by hand.
4. **Derived ids in realPilot mode.** Row ids are uuidv5 under a per-manifest-version namespace in both modes (the manifest itself contains no UUIDs). The brief reserved seeder-owned ids for synthetic data; I extended the derivation to real mode because natural keys alone cannot make apply idempotent across the draft→published version change. Reset remains synthetic-only regardless.
5. **What "untouched" proves.** Apply compares counts of instances (by owned snapshot and by school), courses, assignments, contexts, profiles and roles before/after; verify reports them. Counts, not row identity — a swap inside a table would not be seen. The write allowlist in `store.mjs` is the real guarantee.
6. **The lock and the transaction story.** Local `O_EXCL` file lock; restartable checkpoints instead of a transaction (PostgREST). Preflight shows a resumed run's drafts as `updates`.

## Known limitations / deferred

- **No staging/production run performed.** Targets are null/unapproved until Brent supplies the exact refs and URLs; the tests prove the refusal.
- `npm run build` and Playwright were not run in this worktree (orchestrator-owned per the task limits); no UI was touched.
- `ab_grades` expected names/`is_always_gt` in the synthetic manifest follow `types/assessment-builder.ts`; a differing staging seed stops preflight (manifest, not database, is corrected).
- Schema check is a required-column probe; migration ledger and RLS are not visible through PostgREST.
- The synthetic personas are documented, not created; a rehearsal that needs logins seeds them through the existing invitation flow, outside this tooling.
- Real docente bindings: no runtime input is consumed yet (excluded by the plan; path reserved).

## Decisions pending (blocking a real run)

- Pilot school (`pilotSchoolId`) and participating grades.
- Template owner/content per grade, expectation profile, frequency configuration, migration-plan entries.
- Staging project ref/URL and pilot project ref/URL for the allowlist, plus who approves the manifest digest.
- Whether `--actor` (an admin's user id) is recorded in `snapshot_data.published_by` or the nil UUID is acceptable for provisioning-time publications.

## Gate results

Orchestrator's matrix on head `2b6d20bc` (the commit before this fix):

- `npm run type-check`: clean.
- `npm run lint`: clean (zero warnings).
- `npm run lint:testid` (advisory): baseline 2614 problems, repo-wide and pre-existing; unchanged by this PR.
- Full Vitest (`npm test`): 407 files, 9159 passed, 12 skipped, 1 failure — `__tests__/security/committed-secrets-guard.test.ts > the tracked tree > contains no committed credential`, caused by three credential-shaped synthetic fixtures in `__tests__/scripts/pilot-provisioning/`. Fixed in this commit by rewriting the fixtures (no allowlist entry added); `npm run guard:secrets` reports 0 findings on the fixed tree.
- pgTAP (`supabase test db`): Files=27, Tests=2317, PASS.
- `npm run build`: OK.
- Playwright, mandatory suite: 192 passed / 0 failed / 0 flaky / 0 skipped.
- Playwright, literal full E2E: 238 passed / 60 failed / 27 skipped. The 60 failing identifiers are identical to the PR 3 head, with zero candidate-only failures. The literal gate remains RED; this is pre-existing and no exception is claimed.

The matrix will be re-run on the head produced by this commit.

## Orchestrator gate matrix on the final cumulative head `cdd83f4f` (2026-09-07, local CI-parity, loopback 127.0.0.1:54321/54322)

Head `cdd83f4f` = PR 4 code head `7bdb3eb6` + one records-only commit (PR 2/PR 3 gate evidence). Guards (`guard:actions`, `guard:migrations`, `guard:browser`, `guard:secrets` on the Git index — 0 findings, no allowlist entry) OK; `git diff --check` clean; `type-check` clean; `lint` zero warnings; `lint:testid` advisory 2614 problems repo-wide (pre-existing baseline); `npm test` **407 files, 9160 passed / 12 skipped / 0 failed**; `supabase db reset` (43 migrations) + `supabase test db` **Files=27, Tests=2317, PASS**; `npm run build` OK + price-leak guard OK; mandatory Playwright manifest **192 / 0 / 0 / 0**, `--check` OK.

Literal `CI=1 npm run e2e`: **238 passed / 60 failed / 0 flaky / 27 skipped, exit 1** (JSON SHA-256 `406dfdd01eb2ec428a7145c81ab700439db11fa58d4e96cfe2c6d0c92a79c413`). Same 60 `file:line:column` identifiers as the PR 4 pre-fix head `2b6d20bc` (SHA-256 `76e24d20bfdc4c1937e706045936dd64567ba8fcb282fa7c81489eb559ea0c8e`), the PR 3 head, the PR 2 head and the exact `main` base `be2ce676`: candidate-only **0**, base-only **0** at every step. **The literal gate remains RED (pre-existing, unowned by this program); no exception is claimed or extended.** Not pushed, not merged, not deployed.
