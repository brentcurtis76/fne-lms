# Controlled RLS Production release checklist — unexecuted

This checklist grants no Production authority. Independent review of the integrated tree, Brent's release authorization, and the database-first sequence are required before marking ready, merging or deploying. No Production query, migration or maintenance request was executed during preparation.

## Current integrated candidate — independent review pending

**DO NOT MERGE — independent integrated review and separately authorized Production prerequisites remain required.**

Production's historical version `20260907120000` belongs to `proc_integrity`. Seven RLS deployment filenames `20260908180000`–`20260908180600` preserve every approved payload byte; see `rls-release-migration-manifest-2026-09-08.json`. Never repurpose that main-side migration, repair history, replay the baseline or use generic Production `db push`.

## Release identity

- Repository `https://github.com/brentcurtis76/fne-lms.git`; release branch `codex/rls-release`; existing draft PR #89.
- Reviewed packaging preservation `ddf0f3578546741f65fb8d023e2f8d97601ef7b3`, parent `dc63b3899072800eea764af088eedc0522b83d9e`.
- Executable integration `97f735be1c883d555709d2da06f524467c4c5006`; merge parents are preservation then actual main `097b62ed00ea11318d1743b7145c2a5793db9e23`.
- The final publication adds review records. Lock its exact GitHub head and base against `docs/planning/reviews/fase-rls-current-main-integration-review-request.md` and external `current-main-integration-evidence/final-verification.json`; the executable integration SHA alone is not the final publication identity.
- All earlier source/base/deployment observations remain historical. Independent approval must cover this final combined candidate, not merely the approved packaging or prior `3d13ddb5` integration.
- Under future explicit release authority, use the controlled merge-commit path. Verify the resulting commit has exactly two parents, in order: newly authorized main/base, then independently reviewed final source. With unchanged base, its tree must equal the reviewed source tree. Verify Production deploys the **resulting merge SHA**. Changed base/source or unexpected tree difference requires renewed review before release.
- PR #85, `fix/rls-learn`, PR #90 and their histories remain separate and untouched.
- Exact transaction wrappers are unchanged from the approved packaging revision and were retested against current main plus historical representative metadata. Their 80-row Production registry snapshot is historical: refresh and re-lock under separate authority before any execution. Local fingerprint `7ac1100f…` binds the combined disposable schema only; any target attestation mismatch remains a stop.

## Prerequisites and stop conditions

1. Record independent integrated-tree approval and settled CI/Preview outcomes for the exact head. A failed required gate stops release; local success does not replace CI. Do not inherit any assessment branch's historical exception.
2. Verify the intended Supabase organization/project reference and Production database identity against the owner's authoritative deployment configuration, and the Vercel project/team, Production environment and linked repository. Read configuration identity only; never print connection strings or keys. Stop on any mismatch or unknown project. A localhost/disposable identity is not Production evidence.
3. Verify a recoverable Production backup and the current deployed application SHA through authorized metadata. If the deployed application differs materially from rehearsed main, establish compatibility before proceeding.
4. Obtain explicit acceptance of the historical `unknown` enrollment limitation or a separately authorized reconciliation plan. Existing unknown-origin enrollments retain access; timestamps/membership do not prove independent origin. Never infer origins, delete history or run bulk reclassification as part of this checklist.
5. Record the exact 67 unresolved ledger ownership failures (57 BACKLOG triage owners, 10 W-D blocked owners). Ownership acceptance remains Brent's separate obligation; do not invent names or declare the ledger green.
6. Secret-presence checks only: verify required application Supabase configuration and `CRON_SECRET` exist in the correct Production environment without retrieving values into logs. Verify the hosting plan supports the declared hourly schedule. Provider changes require separate authorization.

## Authorized operator preflight, by schema prefix

Use only the CURRENT section of `rls-remediation-rollout-2026-09-07.md`. Its historical sections are audit records. Every query needs its referenced objects first; never execute all fenced SQL at P0.

| Prefix | Permitted aggregate/schema checks |
|---|---|
| P0, before any of the seven migrations | Record applied migration versions and expected baseline; rollout P1–P8 only after confirming every referenced baseline table/column exists. P1–P3 validate RLS/policy/unique-key pre-state; P4–P5 capture mapping, group, session, assignment and progress baselines; P6 previews historical heartbeat disposition; P7 checks closure objects absent; P8 captures enrollments. **Do not run P9 or Q1–Q10 at P0.** |
| P1 onward | Q6/Q7 fixed heartbeat ceiling, privileges, helper volatility and enabled guards; compare helper definitions with reviewed files. `settled_at` now exists. |
| After #4, before #7 | Run P9 to capture settled-session/grain expectations; this is the documented checkpoint for its `settled_at` dependency. Run Q1–Q5 with the new progress/credit columns present and account for concurrent legitimate activity. |
| After #6 | Q9 origin totals/report and #6-dependent Q10 identity/provenance/atomic-grant checks. Do not query #7 views/grain yet. |
| After #7 | Full Q8–Q10, plus relevant Q1–Q7; aggregate comparisons must explain actual intervening activity. Repeat after application deployment. |

Stop before apply for unknown/partial schema, unexpected existing closure objects, missing expected policies or workspace uniqueness, inconsistent discussion mappings, or nonzero group assignments pending owner review of membership semantics. Record foreign-parent folder count (not itself a stop). After P1, stop for missing/mismatching heartbeat protections. After P7, stop for missing grain evidence or any privilege/guard/view mismatch. Nonzero historical ineligible heartbeat counts alone are not a failure and must not be rewritten to force zero.

## Database before application

Under separate Production authorization, recheck the manifest versions are unused and the verified preceding prefix is intact. Apply each exact reviewed payload and its new version/name/statements history row in the same transaction, in this order. A history-recording failure rolls back the payload too. Retain its SHA-256 externally, and verify history plus actual schema in a fresh read-only transaction before advancing:

1. `20260908180000_learning_path_governance.sql`
2. `20260908180100_b10a_referenced_tables_rls.sql`
3. `20260908180200_drls_function_exposure.sql`
4. `20260908180300_r2_remediation.sql`
5. `20260908180400_c1_function_exposure.sql`
6. `20260908180500_c2_course_entitlement.sql`
7. `20260908180600_c3_reporting_retention.sql`

Do not mark ready/merge/deploy before the authorized database sequence and required review are complete. All seven must exist before the new app deploys. Migration CI is disposable-only and does not establish Production schema readiness.

## Partial failure and containment

- A failed migration leaves the prior transactional prefix. Hold the old app; identify the cause and actual schema prefix, preserve evidence, and obtain review for any SQL/security change before retrying. Do not replay already-applied migrations indiscriminately.
- If P7 succeeds but the app deploy fails, retain P7 and the rehearsed old app; retry the app deployment only under authorization.
- If application rollback is required, return to the verified compatible old deployment while retaining the database. Never disable RLS, widen grants, delete history or roll back the database to contain an app incident.
- If a new app reaches an incomplete prefix, contain the app deployment immediately. Missing dependencies are not permission to hot-edit production schema.
- Stop on unexpected access/reporting behavior, increased endpoint errors, deadlocks, mismatched approved SHA, missing protections or durable reporting evidence. Preserve aggregate/error metadata without PII or secrets.

## Application, scheduler and postflight

After explicit authorization and P7 checks, follow Brent's controlled merge/deployment path. Merging `main` triggers automatic Production deployment, so complete all database prerequisites first. Record and verify the resulting merge SHA, its exact parents and tree as specified above, then confirm Vercel Production deploys that verified merge SHA. The PR head is the approved source parent; the resulting merge SHA is the deployment target.

Verify admin learning-path management/reporting and school counts; assigned learner path/course/lesson and Mis cursos access; non-admin denial of cross-user learning-path reports with preserved course reporting; forced-password isolation; path-only loss versus independent grant survival using approved synthetic/operator test accounts and an explicitly authorized write scope. Historical unknown access is preserved, not certified.

Confirm `/api/cron/cleanup-learning-path-sessions` is hourly (`0 * * * *`), and the retired summary refresh is not scheduled. Observe the first scheduled run and the next two: both settlement and retention succeed, backlog drains, `retainedMissingEvidence` stays zero. The 15-minute stale threshold, 500-session settlement bound, seven-day retention and up-to-5,000 archive bound are specified in the maintenance procedure. Do not exercise live maintenance endpoints during draft preparation.

Recheck Q1 after the first maintenance settlement (old-app closed-but-unsettled sessions can exist during the window), Q8 reporting evidence, Q9 aggregate provenance, Q10 access protections and application error metadata. Retain operator evidence and unresolved acceptance items; only the authorized owner can declare operational release completion.
