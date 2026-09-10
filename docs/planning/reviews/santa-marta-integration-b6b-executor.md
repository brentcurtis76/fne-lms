# SM-INTEGRATE-B6b r1 — executor report

Status: READY_FOR_REVIEW (integration only; not approved, not released, not published)

## Actor, runtime, authority

- Executor: Claude Code, `bounded-executor` 1.1.0 applied from the explicitly delivered packet (safe-mode; native skill loading not claimed). Model self-identified `claude-opus-5`; effort `medium` as requested by the launcher (not independently observable from inside the session). No subagents.
- Order: SM-INTEGRATE-B6b r1 under SM-AUTONOMY-2026-09-10 (as stated in the order; grant file not read by executor). PM: Codex. Counters: integration execution 1, remediation 0; underlying B6b 1/0 and recovery 1/0 unchanged. No product remediation performed.
- Node: every command pinned `PATH=/Users/brentcurtis/.nvm/versions/node/v22.22.0/bin:$PATH`; `node -v` = v22.22.0.
- External actions: NONE. No fetch, push, PR, merge, deploy, DB/provider action, reseed/reset, server start, or edit to the shared/source repository.

## State identity

- Destination: `/Users/brentcurtis/dev/sm-release-20260910`, branch `codex/sm-b6b`, base 4af14cbec172705cfc4b08f438674bc65cc7be87.
- Live `git ls-remote origin refs/heads/main` = 4af14cbec172705cfc4b08f438674bc65cc7be87 (unchanged, so no fetch was needed).
- Before: no `.git/index`, empty worktree (only `.git`), no stash, single worktree registration, shallow depth-50 clone. The branch was created at 4af14cb and populated with `git restore --source=HEAD --staged --worktree -- .`; status was clean afterwards. The no-checkout "staged deletions" were never committed.
- Source (read-only): `/Users/brentcurtis/dev/wt/sm-nav-dir`, branch `fix/nav-dir`, HEAD 10983e7fe1a6f579cef6ba9a1407847543fad6ec. That commit is an ancestor of 4af14cb. Source status and the three product hashes are identical before and after this unit.
- Upstream delta 10983e7..4af14cb (f354bad, merge 4af14cb) touches only `supabase/tests/079-c3-reporting-retention.sql` and three docs. It includes no application code, so application code here differs from the reviewed B6b source state only by the approved Sidebar bytes.

## Criteria

| ID | Result | Evidence |
|---|---|---|
| I1 | PASS | Source and destination SHA256 are identical for all three product files and match the order's hashes (table below). |
| I2 | PASS | The branch sits on 4af14cb. Baseline blobs at 10983e7 equal 4af14cb for the existing files (Sidebar.tsx f3bf02baef5d53d74940e265029fd818775fa5d3, recovery-crypto.test.ts d01d3a56213a24061bd631beffa1b67840f578d1). The new test and reports are absent in both. No overlap and no adaptation. Working diff before commit: 2 modified approved files plus 7 new allowlisted files only. |
| I3 | PASS with env attribution | Focused suites, type-check and lint pass. The full unit suite passes when the four PM-injected e2e app variables are unset. With them set, 2 environment-dependent tests fail (see Validation). |
| I4 | PASS with one disclosed side effect | Reports imported verbatim, PM verdict untouched, protected PIDs 69369 and 83306 running, no publication. Possible write to the ignored source outbox (see Deviations). |

| File | SHA256 (source = destination) |
|---|---|
| components/layout/Sidebar.tsx | 5793e9510cd6da533fe9cabb133b69ad4a5905e4bc4c1ac0f98ccdc8abe6f2e4 |
| __tests__/components/layout/Sidebar.schoolResults.test.tsx | 05e7dd31284484ae8c08454b785b80d28cfdf0d3721c1be68288d73c6016c812 |
| __tests__/lib/auth/recovery-crypto.test.ts | d8f098c24064ef42d5dbb81257aabd44c1b970bca910e05ede20b5771b1b2093 |
| docs/planning/reviews/santa-marta-w-b6b-01-executor.md | e3d5a6cb047aec94cbad67d7a2fc902b72a43ab17aef843db201775458bba68a |
| docs/planning/reviews/santa-marta-w-b6b-01-checkpoint.md | 3a64d05b13f40accc6fefb25b7cb66a63e2cbd707d4885a2db3ea4b48bf3dfab |
| docs/planning/reviews/santa-marta-w-b6b-01-pm-review.md | 56f510f0db2515b8b7e4e42144235392c2119d93007107a72ff2f0af5830de31 |
| docs/planning/reviews/santa-marta-ci-recovery-executor.md | 4debc0103da91c553bde12ab41fc2f32415ab5f65f66a36a7007496fe591e7a8 |
| docs/planning/reviews/santa-marta-ci-recovery-pm-review.md | 769038f6d8316cb1a31b60998ed220c5571e2b2c9c5b009c68c7a77a36b6dd6b |

## Validation (final imported bytes, Node v22.22.0, logs in /tmp/sm-b6b-integration/)

| Command | Exit | Result | Log |
|---|---|---|---|
| `npm ci` | 0 | package-lock.json SHA256 unchanged | npm-ci.log, lock-before.sha |
| `npx vitest run __tests__/components/layout/ __tests__/api/assessment-builder/dashboard.test.ts __tests__/lib/auth/recovery-crypto.test.ts` | 0 | 6 files, 91 tests passed | focused.log |
| `npm run type-check` | 0 | clean | type-check.log |
| `npm run lint` (max-warnings 0) | 0 | clean | lint.log |
| `npm test` (full PM env) | 1 | 429/431 files; 2 failed, 9902 passed, 12 skipped | unit-full.log |
| `npx vitest run __tests__/api/auth/recovery-request.test.ts __tests__/lib/email/outbox.test.ts` (full PM env) | 1 | 2 failed, 18 passed (reproduced) | env-attrib-ambient.log |
| same, `env -u E2E_MAIL_OUTBOX -u E2E_APP_ORIGIN -u E2E_PORT -u NEXT_PUBLIC_BASE_URL` | 0 | 20 passed | env-attrib-unset.log |
| `npm test` with the same four variables unset | 0 | 431 files; 9904 passed, 12 skipped | unit-full-e2e-unset.log |

Failure attribution: the failures are environmental, not caused by the import.
- `outbox.test.ts` asserts `outboxPath()` is null when `E2E_MAIL_OUTBOX` is unset. The PM runtime sets it to `/Users/brentcurtis/dev/wt/sm-nav-dir/.e2e-outbox/outbox.jsonl`.
- `recovery-request.test.ts` expects origin `https://genera.example.cl` but received `http://localhost:3127`, which comes from `NEXT_PUBLIC_BASE_URL`/`E2E_APP_ORIGIN`.
- Neither file imports the changed files.
- The unset-env full-run count equals the CI-recovery executor's reported final-state count (9904 passed, 12 skipped).
- Recommendation for PM: run the unit gate without the e2e app variables. The gate is not relabeled; the full-env run remains exit 1.

No new build, server, E2E or pgTAP run (per order). Existing B6b build/UI/E2E evidence and CI079 main evidence remain REPORTED. Their applicability rests on the tree comparison above, and the PM will assess it.

## UI

UI checks performed by this executor: NONE. The designated UI actor remains the PM. Earlier B6b UI evidence belongs to its original actors and is not claimed here.

## Deviations / findings

- D1 (disclosure, non-blocking for the import): the ignored source file `/Users/brentcurtis/dev/wt/sm-nav-dir/.e2e-outbox/outbox.jsonl` has mtime 2026-09-10 08:41:02 -03 (92 lines, 209913 bytes). That falls inside my first full-env `npm test` (log ended 08:42:02). Code paths such as `lib/email/invitations.ts` → `captureOutboundEmail` honor the ambient `E2E_MAIL_OUTBOX`, so that run probably appended synthetic test messages. The protected app on :3127 may also be a writer, so attribution is PROBABLE, not proven. The mtime was unchanged after the unset-env rerun (checked 08:47:06). I did not read or modify the contents. Tracked and untracked source status and product hashes are unchanged. Route to PM: the e2e runtime env should not be exported into unit runs.
- The nonblocking canonical-suffix wording note remains reviewed debt; the test was not edited.

## Hygiene and artifacts

- No debug or provisional edits; product bytes are exact copies.
- RETAINED: `/tmp/sm-b6b-integration/*` logs (evidence); ignored `node_modules/`, `tsconfig.tsbuildinfo`, `lib/propuestas/__tests__/poc-output.pdf` in the destination (generated by install/type-check/tests; ignored, not committed). No removal performed.

## Context

Effective window and occupancy: UNKNOWN (no telemetry). No compaction observed. Early checkpoint written after import.

## Next action

The local commit on `codex/sm-b6b` contains exactly the three product files, five imported reports and this report. Writes stop here. The PM should review the frozen commit, assess D1 and the unit-gate env, and decide on hosted gates. Publication is not authorized by this order.
