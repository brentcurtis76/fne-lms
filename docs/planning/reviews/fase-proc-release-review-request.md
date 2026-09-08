# Procesos de Cambio — integrated demo release candidate

Date: 2026-09-08. Status: LOCAL VALIDATION PASSED (FULL E2E DEFERRED); SEVEN PRODUCTION MIGRATIONS APPLIED; APPLICATION RELEASE PENDING; PHASE NOT CLOSED.

## Current clean publication — authorized by Brent

Brent approved publishing the validated code as a clean release commit, correcting the synthetic test fixture while preserving all original branches and history. Current publication worktree: `/Users/brentcurtis/dev/wt/proc-demo`; branch `codex/proc-demo`; single-parent publication base: `3d13ddb5ec34b784215991354f10f7d86a3ebc19` (live main rechecked).

The source snapshot is `005f6270ff71831f404d2f8f79042d182b76b2a4` on the intact `codex/proc-release` branch, whose executable code is the tested `0e9fcf37`. This new branch contains that snapshot without importing the unpublished ancestor commits rejected by GitHub. No existing commit or branch was rewritten, reset, force-pushed or removed.

Only the redaction-test fixture and the two current records differ from the source snapshot: the fixture now generates an explicitly synthetic non-credential string using repetition, preserving the test's long-string redaction behavior without embedding a provider-shaped credential. All application code, migrations, tooling, configuration and dependencies are byte-identical to the validated integrated candidate. The blocked historical push remains recorded below; no GitHub protection was bypassed or disabled.

Fresh publication checks: `npm ci`, type-check, zero-warning lint, actions/migrations/browser guards and staged diff/secret checks passed; the corrected pilot CLI suite passed all 19 tests. A fresh full Vitest run is in progress at publication. The earlier local browser/build/database/concurrency evidence applies to the byte-identical application and schema, not to an untested integration. GitHub PR CI must independently run on the clean publication head. Full E2E and the remaining minor numeric edge case remain deferred by Brent; Operation A remains unauthorized. Production schema rollout is complete; application publication and Brent-controlled merge/deployment remain pending.

## Locked inputs and scope

- Release worktree: `/Users/brentcurtis/dev/wt/proc-release`, branch `codex/proc-release`.
- Committed remediation input: `9d6a2a25f3b3b533dd3b9e7207d83a30b6a38ad8` (43 commits unique to the input versus the main below).
- Integrated main: `3d13ddb5ec34b784215991354f10f7d86a3ebc19`, including PRs 86, 87 and 88. Rechecked live during validation.
- Ordinary merge, preserving both histories. The original remediation worktree's concurrent uncommitted numeric work is excluded and untouched.
- Objective: integrate the committed Procesos PR2/PR3/PR4 and remediation work with current production fixes for a demo. This is not a claim of full phase closure or independent approval.
- Brent deferred the remaining minor numeric precision edge case and the literal full E2E rerun until after the demo. The mandatory browser suite and other release gates remain required. This does not waive a new failure.
- Operation A, production cleanup, reassignment, and production seeding remain unauthorized.

## Integration decisions / files by risk

High risk:

- `pages/docente/assessments/[instanceId]/index.tsx`: retain main's durable per-user/instance/tab draft session, explicit recovery, load-error refusal, serialized saves and completed read-only form. Integrate the branch's confirmation dialog, context summary, independent `canSubmit` permission, guarded navigation and save-before-return. The durable session is the only pending-answer authority; the superseded branch save queue is not retained.
- `components/layout/Sidebar.tsx`: preserve PR88 assignment discovery for all authenticated school roles and account-scoped lookup results; do not reinstate the old teaching-role restriction.
- Seven unchanged migration files, `20260907120000` through `20260908140000`, are inherited from the committed remediation input. No new SQL was authored for this integration.

Tests:

- Autosave tests now exercise the durable draft semantics, including whole-batch retry after partial acknowledgement and journal survival after actual unmount. Success mocks report the actual batch count.
- Completion tests include the actual `canSubmit` API field and the required confirmation dialog; successful submission stays on the completed form, as in main.
- Sidebar role tests assert unrestricted role discovery while retaining the personal-assignment requirement. Main's actual sidebar account-switch tests remain included.
- Main's two real-browser draft recovery/load-failure tests are retained in the mandatory manifest.

Records:

- Preserve both sides of PROJECT_STATE history and add a current release entry.
- Remove two trailing whitespace occurrences in main's evaluation-role record for diff hygiene.

## Validation evidence on the integrated executable tree

- `npm ci`: exit 0.
- Type-check, zero-warning lint, actions guard, migration guard (48 files), browser/server guard: exit 0.
- Focused integration tests: 6 files, 78 tests passed.
- Full Vitest: 415 files, 9724 tests passed, zero failures (JSON reporter, exit 0).
- Fresh loopback `supabase db reset --local`: all 48 migrations, exit 0.
- Full pgTAP: 31 files, 2506 tests, PASS.
- Queue, recovery, context-save, pilot-reset-cascade, and synthetic Operation A concurrency/lifecycle proofs: all exit 0. The synthetic proof is not production Operation A.
- Production build: 149/149 static pages, exit 0. Price-leak check: 262 files, exit 0. An initial invocation used an incorrect script path after the successful build; rerunning the existing `scripts/check-price-leak.mjs` passed.
- Mandatory Playwright: 194 passed, zero failures, skips or flaky tests in 2.2 minutes, exit 0; no-skip check: all 14 mandatory specs, exit 0. Initial collection stopped because two specs unconditionally read `.env.local`. An ignored credentials-free placeholder was added; all nine CI-recipe values are supplied in the process environment from loopback-verified `supabase status`. No production environment file was read or copied. Synthetic local seed succeeded.
- Literal full E2E: DEFERRED BY BRENT until after the demo; not run on this candidate and not claimed green. Earlier 60-failure comparisons remain historical evidence only.
- Staged secret guard: final index including this record, 2588 tracked paths, zero findings. Staged and unstaged diff-check passed; both are checked again before the merge commit.

## Initial production preflight and blocker (historical)

Brent authorized a read-only production schema/duplicate preflight and applying exactly the seven named migrations only if it is clean. The public bundle of `https://www.nuevaeducacion.org/login` identifies Supabase project `sxlogxqzmarhqsblxmtj`; the authenticated project inventory identifies it as FNE LMS. Only this release checkout was linked to that verified project.

Read-only production checks found PostgreSQL 15.8, zero duplicate school-context groups, zero duplicate live course/snapshot-instance groups, and all three policies targeted by the consultor migration present. None of the seven release migrations is recorded as applied; the latest recorded migration is `20260902162557`.

`supabase db push --linked --dry-run` nevertheless exited 1: `LegacyDbPushMissingLocalError`, because 33 historical production migration versions are absent from this checkout's migration directory. No migration was applied. The CLI's suggested history repair was NOT executed; no history was marked reverted, no broad push or schema pull was attempted. Production deployment is blocked pending a separately approved reconciliation/targeted migration plan. The clean duplicate checks do not override this history mismatch.

## Authorized targeted production rollout — 2026-09-08

After the blocked bulk-push dry-run, Brent explicitly approved a targeted rollout of only the seven migrations, after additional schema-compatibility checks, preserving every existing migration-history record. This supersedes the production blocker above for these seven files only; it does not reconcile or waive the historical bulk-push discrepancy for future work.

The pinned executable candidate is merge commit `0e9fcf37baaf3cbda10c42b1d79bed6c2ac02608`, with parents `9d6a2a25` and `3d13ddb5`. All seven SQL files were verified byte-identical to that commit before rollout. The release candidate has 101 changed paths versus main, including this record; this follow-up changes records only.

Additional read-only production checks:

- All 286 columns (types, nullability and defaults), 135 constraints, and RLS settings across 25 relevant tables match the locally tested database.
- Both authorization-helper bodies, signatures, security modes and configurations match local.
- All 16 grade mappings resolve exactly once; role and generation enum values are present; both proposed index names were free; all seven migration versions were absent.
- Production PostgreSQL is 15.8. The migration DDL uses compatible features; no PostgreSQL-17-only transaction timeout was set.

A local rolled-back rehearsal applied all seven exact DDL files and passed verification assertions. The authorized production operation then executed in one transaction with a 3-second lock timeout, 20-second statement timeout and 10-second idle-in-transaction timeout. It rechecked duplicate prerequisites, applied the seven committed files in order, verified all six resulting function bodies/security configurations/role execution privileges against local, verified the valid unique indexes, enabled progress trigger and preserved RLS, and inserted exactly seven new migration records containing the exact source SQL. It requested PostgREST schema-cache reload and committed successfully.

The transaction asserted the entire pre-existing migration-history digest remained unchanged. An independent post-commit query confirmed **73 historical records unchanged**, digest `8f014883781d2d0c2bdbd6cf503a1a80`; exactly seven new versions with matching names and source-body hashes; and both unique indexes valid. A separate post-commit comparison verifies the three changed policies against local.

No historical migration record was updated or removed. No assessment, assignee, response, course, context, or other business row was inserted, updated or deleted by the rollout. No RPC was invoked to perform a business operation. No seeding, cleanup, reassignment, or Operation A occurred. The source files and bounded rollout/rehearsal scripts are preserved outside the repository in Brent's `Procesos de cambio/production-rollout-0e9fcf37` workspace.

## Independent review focus

1. Draft recovery plus navigation/confirmation: ensure no integration path drops a journal or submits before persistence, and cancellation leaves autosave usable.
2. PR88 preservation: all nine school roles may discover personal assignments, with no stale account lookup leaking sidebar visibility.
3. Permission split: editing, submission, completed/archived state, and recovery readiness must remain distinct and fail closed.
4. Database rollout: validate the seven exact migrations against production's actual schema and historical migration provenance without rewriting history or running Operation A.
5. Deferred precision contract: do not mistake the committed 8-ULP implementation or previous baseline E2E results for final acceptance of the unresolved edge case or this new tree.

## Not done

Independent review of this integration, GitHub PR CI, Brent-controlled main merge, application deployment verification, post-demo full E2E, and full phase closure remain open. The seven production schema migrations are applied; historical migration reconciliation remains separate deferred maintenance. At this records commit nothing has been pushed or merged to main by this release task. No production business rows have been modified.

### Publication attempt blocked by GitHub push protection

The push of `codex/proc-release` at records head `6c8f6999` was rejected with GH013. GitHub identified a Stripe-shaped test string in ancestor `aab49908e84cc5f7382928a96bfa1290fba2e9bd`, `__tests__/scripts/pilot-provisioning/cli.test.ts:172`, inside the synthetic redaction/failure-audit test. The same fixture remains at HEAD. The repository's staged-index guard passed but does not establish that the full unpublished history will pass GitHub's provider-specific scanning.

No bypass URL was followed, no protection was changed, and no PR was created. The production migration success above is independently verified and is not rolled back by a rejected Git push. A proposed next step requires Brent's publication-history decision: retain all original branches and publish the same validated application snapshot as a clean release commit from current main, replacing the key-shaped fixture with an explicitly synthetic runtime-generated test value, then validate that test and run PR CI. This would change publication ancestry, not rewrite the original branches. No such change has been made yet.
