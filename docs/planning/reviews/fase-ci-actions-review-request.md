# Phase review request — CI-MAINT-01 action-runtime maintenance

## Branch and baseline

- Branch: `ci/actions-node24`
- Base: `060703071399e035c3ba124971b21b11f2b0275e` (`origin/main` at dispatch)
- Commit count over base: 2 (the phase commit plus the independent-review
  correction commit; the first commit was not amended or rewritten)
- Owner authorization: Brent explicitly authorized immediate implementation on 2026-08-29

## Objective and scope

This is an owner-created repository-maintenance phase; it has no section in the
GENERA construction itinerary. This section is therefore the normative dispatch
scope.

Objective: remove the Node 20 action-runtime deprecation exposed by PR #62 and
its post-merge run before it can become a CI outage, while preserving the seven
protected CI contexts and their behavior.

In scope:

- upgrade every `actions/checkout` and `actions/setup-node` use to v7;
- upgrade both `supabase/setup-cli` uses to v3;
- upgrade the failure-only Playwright report upload to
  `actions/upload-artifact@v7`;
- move the two guard jobs' selected application runtime from Node 20 to Node 22;
- configure Node before setup-cli in Gate 3 and pin its CLI to the already-used
  Gate 4 version, `2.110.0`, instead of `latest`;
- add an executable, tested guard against retired action majors, Node 20, and
  unreviewed external actions;
- document the action-runtime versus application-runtime distinction.

Out of scope:

- renaming, adding, removing, or weakening any of the seven CI jobs;
- application/UI code, migrations, schema, data, RLS, Supabase production,
  Vercel configuration, branch protection, manual deployment, or secrets;
- Santa Marta claims, work-item/map CSVs, release protocol, classification,
  counts, and W-B2d/W-B2c authorization state.

## Files by risk

High risk — workflow execution:

- `.github/workflows/ci.yml`

Medium risk — executable enforcement and tests:

- `scripts/ci/check-action-runtimes.mjs`
- `__tests__/scripts/ci-action-runtime-guard.test.ts`
- `package.json`

Low risk — documentation/state:

- `docs/ci-setup.md`
- `PROJECT_STATE.md`
- `docs/planning/reviews/fase-ci-actions-review-request.md`

## Test evidence

- Focused runtime-guard suite: 17/17 passed, including all four retired action
  refs; Node 20 major, wildcard, patch, and `lts/iron` selections; an
  unreviewed action; an unreviewed ref format; and disappearance of a reviewed
  action family.
- Runtime guard on the real workflow: 17 action uses across one workflow, clean.
- Workflow YAML parses with exactly the same seven job keys; repository sweep
  finds zero retired action refs or Node 20 selections.
- TypeScript: `npm run type-check` clean.
- ESLint: `npm run lint` clean with `--max-warnings=0`.
- Vitest: 369 files, 8,423 passed, 11 skipped, zero failed. The final full run
  used a Git-initialized non-nested export because the canonical checkout's
  parked `.claude/worktrees` make repository-wide collection scan duplicate
  copies; the export contained the exact candidate tree and linked the same
  installed dependencies.
- Production build: compiled successfully, 149/149 static pages, using only
  command-scoped synthetic localhost environment values; no production
  environment file or provider was accessed.
- Browser/server boundary guard: 1,150 files and 695 reachable modules, clean.
- Migration guards: 40 migration files, no RLS disable or destructive SQL.
- Price-leak scan: 259 built static files, clean.
- Santa Marta validator: expected exit 1 with exactly the 67 pre-existing
  `[16 propiedad]` ownership findings and no other failure category.
- `git diff --check`: clean.
- Hosted compatibility and annotation removal: necessarily pending the PR. A
  local runner cannot execute GitHub-hosted action implementations.
- `test:db`/Playwright are not run locally for this phase because no DB or UI
  artifact changed; both are mandatory on the PR, where they exercise the new
  setup-cli action and workflow topology directly.

## Hardest review areas

1. **Supabase setup-cli v3 behavior.** v3 installs the CLI from npm; verify both
   Gate 3 and Gate 4 still receive exactly CLI `2.110.0` and that Gate 3's
   reordered Node setup does not change database-test semantics.
2. **Protected context preservation.** Confirm all seven job `name:` values,
   triggers, concurrency, timeouts, security guards, E2E manifest, and no-skip
   guard are unchanged.
3. **Guard fail-closed boundary.** Ensure comments/local actions are not false
   positives, new external actions fail until reviewed, and the real-workflow
   assertion cannot pass vacuously.
4. **Node concepts are not conflated.** The action implementations run on Node
   24 while repository commands deliberately run on Node 22; neither is an
   accidental claim about production runtime.
5. **Failure-only artifact path.** A green PR will not execute upload-artifact;
   verify the v7 ref and inputs statically because deliberately failing Gate 4
   is not part of this phase.

## Known limitations and deferred evidence

- Only a PR run can prove the hosted actions initialize successfully and the
  Node 20 annotations disappear. Do not approve merge on local gates alone.
- The failure-only Playwright report upload is not dynamically exercised by a
  green run. Its official v7 release ref and unchanged inputs are the bounded
  evidence for this phase.
- No push, PR, merge, deployment, production access, Supabase call, or external
  configuration mutation belongs to this implementation phase before Brent's
  separate post-review decision.

## Independent review — round 1

Claude independently reviewed exact commit
`b02f029546f42c41f569e124fd91de08f1aa12f8` and reported no P0, P1, or P2
findings plus three P3 findings. This second commit addresses all three without
amending or rewriting the reviewed commit:

1. Gate 4's stale "unlike gate 3" comment now states accurately that both
   Supabase gates pin the CLI.
2. Direct negative controls now exercise `UNREVIEWED_REF` and
   `MISSING_REVIEWED_ACTION`; deleting either rule can no longer leave the
   focused suite green.
3. `docs/ci-setup.md` now documents the enforced `vN` or `vN.N.N` ref-format
   rule and states precisely that all guard failure rules have direct tests.

Because the correction creates a new head, independent delta review remains
required before push. Hosted action compatibility and annotation removal still
remain PR-only evidence.
