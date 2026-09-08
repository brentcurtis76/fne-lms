# RLS PR #89 migration packaging — independent review request

## Identity and review boundary

Worktree `/Users/brentcurtis/dev/wt/rls-learn`, branch `codex/rls-release`, common Git directory `/Users/brentcurtis/dev/fne-lms/.git`. HEAD and published PR #89 remain `dc63b3899072800eea764af088eedc0522b83d9e`; authorized/rehearsed main is `3d13ddb5ec34b784215991354f10f7d86a3ebc19`. Zero commits in this follow-up; all changes are unstaged/uncommitted. PR remains draft and unmerged. Prior APPROVE WITH NOTES covers the old integrated source, not this unpublished packaging revision. No Production mutation or publication occurred.

Objective: resolve the Production migration-version collision, preserve the seven reviewed SQL payloads and existing Production history, validate the revised package, and prepare the database-first controlled release for review. Scope excludes application/security behavior changes, historical reclassification, ownership assignment, Production writes/backup/restore, staging/commit/push/ready/merge/deployment, and subagents.

## Changes

- Seven migration files renamed from `20260907120000`–`20260907120600` to `20260908180000`–`20260908180600`. **Every byte is identical to the approved source**, including original version references inside comments. All seven must move together to preserve dependency order. The old names are historical identities only.
- `.gitignore` narrowly allows the one release manifest below through the repository-wide `*.json` exclusion; no other JSON is unignored.
- `docs/reviews/rls-release-migration-manifest-2026-09-08.json` records original/new filenames, exact SHA-256, source/base and step dependencies.
- Operator checklist and CURRENT rollout section use the deployment filenames, explain the collision and forbid generic Production migration push/history repair. Historical rollout material is preserved. The checklist corrects deployment identity to the verified resulting merge SHA; a newly reviewed source must be locked after publication.
- PROJECT_STATE records this local revision and validation without declaring review/release acceptance. This review request closes the local evidence handoff only.
- External evidence and seven exact per-file transaction wrappers: `/Users/brentcurtis/Documents/ChatGPT/RLS Review/production-preflight-evidence/release-revision/`. See `REPORT.md`, `transaction-package/`, and `transaction-package-manifest.json`. Earlier preflight/review evidence is preserved unchanged.

## Why this package is needed

Production project `sxlogxqzmarhqsblxmtj` already records `20260907120000` as `proc_integrity`; registry version is the primary key and RLS feature objects remain absent. The 80-row Production history differs from the disposable squashed baseline. Blindly pushing local migrations could skip required payload #1 or collide with history. The new versions were absent at both 17:53 and 18:10 UTC on 2026-09-08; recheck immediately before any authorized apply. Existing history is never modified to make the package fit.

Each proposed transaction wrapper checks the complete observed version/name registry plus preceding release payload MD5s and key schema-prefix objects, locks migration-history recording, applies one exact payload, verifies existing history stayed unchanged, inserts its new version/name with the exact payload text, and commits both together. SHA-256 is retained externally; no checksum column is added. Registry drift, wrong prefix, reused version, failed payload or failed history write stops the transaction. Actual Supabase endpoint/project identity remains a mandatory operator check; these SQL files contain no connection or credential and cannot independently attest the cloud project from `current_database()='postgres'`.

## Validation

All results are fresh for this local revision unless expressly identified as inherited.

| Check | Result |
|---|---|
| Payload preservation, order, unique versions, current Production vacancy | PASS: seven byte-identical payloads; 48 local migration files; old paths absent; seven new versions in correct order |
| Migration safety guards | PASS |
| Type-check / lint / build | PASS; zero-warning lint |
| Full Vitest | 412 files, 9,140 passed; 12 existing opt-in skips |
| Current-main old/new app P0–P7 and failure rehearsal | 563 checks, zero failures, with 80 Production history identities represented synthetically |
| Exact transaction wrappers on representative Production differences | 52 checks, zero failures: order/replay refusal, payload failure, real duplicate-version history-write failure, post-history failure, success and preservation of all 80 rows |
| Full pgTAP on revised P7 | 36 files / 3,753 assertions, PASS |
| Settlement normal/long and grant concurrency | PASS; 18 / 18 / 14 checks |
| Mandatory E2E | 219 passed, zero skips/flakes, all 15 mandatory specs; report guard passes |
| CLI full-chain cleanup reset | PASS: all 48 migrations, final version 20260908180600; standard 13 synthetic auth users restored; no rehearsal paths or synthetic Production registry left |

The first default pgTAP invocation found zero files because the scratch workdir had no tests directory: it is not accepted as validation. The explicit rerun exposed a fixture error: Zoom's test replays recorded migration SQL, but the synthetic history used placeholder text. The fixture now uses committed local SQL for matching versions (never Production data/SQL) and comment placeholders for unrelated historical versions; the full wrapper and pgTAP runs then passed without changing tests or migration payloads. Retained logs document both failures and the correction.

Production catalog assessment: scoped columns, types/defaults, policies, constraints, ACLs, triggers and relevant function fingerprints compared to the disposable P0. All policy/trigger definitions match. Differences are stricter Production anon TRUNCATE/REFERENCES/TRIGGER grants, equivalent UUID default qualification / activity-constraint casts, and comments/error-HINT text in otherwise identical password-boundary function bodies. Exact wrapper tests and P7 E2E use the stricter grants and actual inspected password-function definitions. See `CATALOG-ASSESSMENT.md`; this is not certification of unrelated Production schemas or data. No Production reporting/helper/maintenance function was invoked.

## Review focus

1. Verify seven old/new payload hashes and order; no SQL behavior or approved application code changed.
2. Inspect the exact external transaction wrappers, complete-history drift checks, preceding-prefix guards and payload/history atomicity. No baseline replay, history overwrite, conflict suppression or grant widening is permitted.
3. Assess the bounded Production catalog equivalence reasoning and its limits; distinguish 563 baseline prefix checks from 52 exact-wrapper tests and 219 P7 E2E checks with Production's stricter relevant grants.
4. Confirm release identity: new source requires renewed review and CI after publication; merge-commit parents must be authorized base then reviewed source, tree equal with unchanged base, and Production must deploy the resulting merge SHA.
5. Keep historical unknown access, backup suitability and exactly 67 ownership obligations visible. No acceptance, named owner or ledger-green verdict is supplied by this revision.

## Remaining release gates

Independent review of this unpublished package, separately authorized publication and new-source CI/re-lock, explicit historical-access and recovery-point decisions, governance disposition, and finally exact Production apply/merge/deploy authority. At 18:10 UTC Production still ran READY deployment `dpl_2nL5NVHmJ1dUuw4jL16vmcKzkY2i` at the unchanged rehearsed main SHA. Latest completed physical backup remained 08:58:26 UTC that day, PITR disabled; restore was not tested or triggered. Historical preflight counted 4,477 enrollments (1,246 without path entitlement; 203 without either current source); counts must be refreshed at release. Ownership remains 57 BACKLOG triage-owner and 10 W-D owner failures. Separately approved synthetic-account writes and first-three-cleanup-run verification remain postflight.
