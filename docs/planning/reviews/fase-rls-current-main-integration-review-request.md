# RLS PR #89 — current-main integration review request

**DO NOT MERGE — independent integrated review and separately authorized Production prerequisites remain required.**

## Identity and scope

Repository `https://github.com/brentcurtis76/fne-lms.git`; worktree `/Users/brentcurtis/dev/wt/rls-learn`; common Git directory `/Users/brentcurtis/dev/fne-lms/.git`; branch `codex/rls-release`; existing draft PR #89.

Initial local/published head: `dc63b3899072800eea764af088eedc0522b83d9e`. Reviewed packaging preserved in `ddf0f3578546741f65fb8d023e2f8d97601ef7b3`, parent exactly the initial head. All 20 physical status entries and 13 existing file SHA-256 values matched the independent manifest before staging; seven renames are byte-identical.

Executable integration: `97f735be1c883d555709d2da06f524467c4c5006`; tree `d43bf35ea906cf9c4cca5478591b06d7dd9fb267`. Merge parents, in order: preservation `ddf0f3578546741f65fb8d023e2f8d97601ef7b3`, actual fetched main `097b62ed00ea11318d1743b7145c2a5793db9e23`. Seven commits ahead of main at this integration commit; this review/documentation commit adds one. The final publication SHA is the commit containing these records (or a later records-only commit), recorded exactly in the external `final-verification.json` and GitHub PR #89. Do not mistake the executable integration SHA for the final published head.

Objective: preserve the approved package, merge actual current main without rewriting either history, validate the combined release including actual-current-main P0–P7 compatibility, and publish the revised candidate to existing PR #89 for the original reviewer. No merge, ready/draft transition, auto-merge, workflow rerun/cancellation, provider change, deployment, Production/shared-database operation, real-user data, external comment/message, subagent or new task is authorized or performed in this unit.

External evidence: `/Users/brentcurtis/Documents/ChatGPT/RLS Review/current-main-integration-evidence/REPORT.md`, with commands, logs, immutable source inventories, transaction wrappers, baseline comparisons, failures and final remote/CI observations. Earlier evidence remains unchanged.

## Integration and behavior

Current main advanced from `3d13ddb5ec34b784215991354f10f7d86a3ebc19` by 101 paths, including seven Procesos de Cambio migrations. Its assessment autosave/frequency handling, scoped consultant access, assignment/replacement, template eligibility locking, provisioning and lifecycle work is retained verbatim. `main-delta.patch` contains the complete inspected delta. No direct CREATE/REPLACE function-name overlap exists between the two added migration sets; their indirect shared role/profile, assignment and entitlement dependencies were exercised together.

- **Conflicts:** only `.gitignore` and `PROJECT_STATE.md`, both additive blocks. Kept both narrow manifest/config exceptions and both historical workstreams. No whole-file ours/theirs replacement. `package.json` merged automatically; verified every script/dependency from both parents survives with its original value. CI and all 15 mandatory specs survive unchanged; both database suite inventories survive, including equal numeric prefixes.
- **Only additional runtime configuration change:** `config/pilot-schema-attestation.json` regenerated from a positively identified fresh combined reset. It now binds the exact 55-migration schema, with 172 incoming foreign keys. Relative to the same-role current-main baseline, the attested changes are the existing RLS `user_roles_enroll_group_paths` trigger and two profile foreign keys (`learning_path_user_progress`, `learning_path_daily_user_activity`). No policy, grant, helper body, SQL payload or application code was changed to integrate the workstreams. The exact-digest refusal mechanism is unchanged; wrong-digest refusal remains tested.
- **Attestation limitation:** even current main alone on this disposable has an incoming-FK section digest different from main's saved expectation; all its table/function sections match. This pre-existing local mismatch is retained in `ATTESTATION-ASSESSMENT.md`, not attributed to RLS or claimed resolved in Production. The new exact expectation is for the freshly reset combined schema. A future separately authorized live preflight must resolve any target drift before provisioning.
- **Documentation:** this request, the current operator checklist/CURRENT rollout and PROJECT_STATE establish the latest candidate while retaining historical evidence. Historical E2E exceptions confer no waiver on this validation.

## Migration and transaction identities

55 combined local migrations = 48 current-main migrations + the seven ordered RLS dependencies. The original main-side `20260907120000_proc_integrity.sql` is retained byte-for-byte. The seven RLS files, all unchanged from independent approval, are:

| Order | Deployment filename | SHA-256 |
|---|---|---|
| 1 | `20260908180000_learning_path_governance.sql` | `531f26d9bcbbed5ee6e8b4cc0d7489a7a5d568024985f4338f49ad27a04252ac` |
| 2 | `20260908180100_b10a_referenced_tables_rls.sql` | `9eae018bafe961051aff510a472aac9bc3134a1fa227ddd9a0d1fcdaaf3136cb` |
| 3 | `20260908180200_drls_function_exposure.sql` | `9c5cdde7844278ab51280170a17cd665709d8514328164647bb6fadc227dd221` |
| 4 | `20260908180300_r2_remediation.sql` | `f670e51974b028b1df51dedd6a5c4413109805b1de51a0fb581da58eccdf18b5` |
| 5 | `20260908180400_c1_function_exposure.sql` | `6a8bc13f4acdb95e135613ab6696bacf9d7245e1ec12547493e364b10adba1d0` |
| 6 | `20260908180500_c2_course_entitlement.sql` | `6efec15025cf23e5aeef452dab33650dd791202de6c16dcbd866f0225c1315bf` |
| 7 | `20260908180600_c3_reporting_retention.sql` | `a3a76729e0b0784d1de379b606bec70f37cf692948fbe1c069914ac2734dbaa8` |

All seven remain together; each prefix requires its preceding steps. The existing source-mapping manifest retains the original reviewed identities. `main-migration-inventory.json` / `combined-migration-inventory.json` retain both complete chains and hashes. Exact external transaction wrapper files and hashes are identical to the approved packaging revision: zero wrapper changes. Their 80-row history lock is historical metadata, not current Production verification. They must be re-locked under separate live authority before execution; never repair history or replay the squashed baseline to fit them.

## Final-tree validation

Node 22.22.0; Supabase CLI 2.110.0; disposable PostgreSQL 15.8 only: project/container `rlslearn-disposable` / `supabase_db_rlslearn-disposable`, API `127.0.0.1:54351`, DB `127.0.0.1:54352`. Project labels, actual container port bindings and dedicated config were checked before every reset. Synthetic fixtures and protected external credentials only.

| Gate | Result |
|---|---|
| Actions, migrations, browser-boundary, committed-secret guards | PASS; 55 migrations |
| Type-check / zero-warning lint / production build / price-leak guard | PASS |
| Full Vitest | PASS: 429 files, 9,868 tests; 12 existing opt-in skips |
| Fresh complete combined reset / full pgTAP | PASS: 55 migrations; 42 files / 4,116 assertions |
| Normal / long settlement and course-grant concurrency | PASS: 18 / 18 / 14 checks |
| Actual current-main archive and production build | PASS: 2,588 files hash-verified against exact main `097b62ed` |
| Actual-current-main P0–P7 / injected failures / old-new app window | PASS: 563 checks, zero failures; baseline contains all 48 main migrations |
| Exact atomic wrappers on representative disposable baseline | PASS: 52 checks, zero failures; 80 old history rows unchanged, seven exact new rows |
| Complete pgTAP after representative wrappers | PASS: 42 files / 4,116 assertions |
| Mandatory E2E union / no-skip guard | PASS: 219 tests, zero skipped/unexpected/flaky; all 15 specs; 2,634 replica source files verified |
| Context-save concurrency | PASS |
| Synthetic Operation A / lifecycle fault drills | PASS: 49 main checks and lifecycle drills; fixtures/index/sessions cleaned |
| Pilot attestation / apply-verify-reset cascade lifecycle | PASS; regenerated exact digest; wrong-digest refusals retained |
| Focused pilot units after config regeneration | PASS: 5 files / 193 tests |
| Queue / recovery / supervisor concurrency | PASS |
| Override / attendance authority concurrency | PASS on explicitly port-adapted external copies; same assertions and payloads |
| Ledger | Expected exit 1: exact unchanged 67-error set, 57 BACKLOG + 10 W-D; not green |
| Whitespace / source / payload / prior-evidence integrity | PASS; final publication observations in external report |

Provenance: full static/unit/build/browser/database/prefix/wrapper gates cover merged source tree `78d8aec1e9f262965abd795805b2578b2d5d24ff`. Integration commit `97f735be` adds only the regenerated pilot attestation JSON to that tree. The pilot lifecycle and 193 focused units cover that exact config. Subsequent changes are records only; expensive application gates are not repeated for prose. New-source GitHub CI and automatic Preview status are observed after publication and recorded externally; this local table does not assert those checks have passed.

Retained non-passing attempts: original Operation A connection (`postgres`, non-superuser on PG15) refused privileged `deadlock_timeout`; rerun with disposable `supabase_admin` passed without SQL edits or privilege changes. Original override proof refused this authorized port because it hardcodes 54322; external copies bind only 54352 with the explicit container/config guard and run unchanged assertions. First adapter attempt had an encoded-space path error before database access; corrected copies passed. Initial Python archive extraction used an unavailable API parameter; corrected extraction and full blob verification completed before any archive build. Original attestation mismatch is recorded above. No failure is relabeled as green.

## Independent review focus

1. Verify the exact preservation and two-parent integration, conflict union, current base/head and both complete migration/test inventories.
2. Review shared authentication, role membership, assignment and course-entitlement behavior under the combined triggers/grants; all seven approved RLS payload hashes must still match.
3. Inspect the regenerated schema expectation and before/after evidence, including the inherited main-only FK digest mismatch; the change must not weaken target-drift refusal.
4. Check actual-current-main source provenance, P0–P7/injected failures and exact wrapper atomicity. Historical Production registry metadata is not a new live re-lock.
5. Verify publication/CI/Preview for the final SHA and maintain the hold for independent approval and all operator prerequisites.

## Remaining owner and release decisions

Historical preflight counted 4,477 enrollments, including 203 with neither current path nor explicit-course authority. Unknown-origin access stays preserved pending disposition; no origin is inferred. Historical backup metadata showed an approximately nine-hour-old physical backup, PITR disabled, restore time untested; this does not establish current recovery readiness. Exactly 67 ownership obligations remain, with no invented owner, waiver or acceptance.

Production identity/schema/configuration/backup preflight must be refreshed after integration under separate authority. Independently approve the final combined source, review CI/Preview, re-lock the actual base/application/registry and exact package, settle owner decisions, and obtain explicit Production apply/merge/deploy authorization. No live endpoint testing or Production operation occurred here. PR #89 remains draft and held; publication is not release approval.
