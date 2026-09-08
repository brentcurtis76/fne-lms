# Controlled RLS Production release checklist — unexecuted

This checklist grants no Production authority. Independent review of the integrated tree, Brent's release authorization, and the database-first sequence are required before marking ready, merging or deploying. No Production query, migration or maintenance request was executed during preparation.

## Release identity

- Repository: `https://github.com/brentcurtis76/fne-lms.git`; release branch `codex/rls-release`.
- Locked source: `92df72a637f2cead48c1fce9b3d71d9a34204c8e`.
- Exact approved 89-path preservation: `ce24dba2ba6b98251ccf162aa88ab1717611cc37`.
- Integrated main: `3d13ddb5ec34b784215991354f10f7d86a3ebc19`.
- Resolve the final PR/head from the accompanying release evidence report, then verify GitHub's live head and main match those recorded SHAs before any operator action. Any changed head requires review; changed main requires integration assessment.
- The source includes B2c-M1 documentation commit `92df72a6`, also present in draft PR #85. That PR and its branch remain separate.

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

Under separate Production authorization, apply each exact reviewed file atomically, in this order, recording successful version and checksum before advancing:

1. `20260907120000_learning_path_governance.sql`
2. `20260907120100_b10a_referenced_tables_rls.sql`
3. `20260907120200_drls_function_exposure.sql`
4. `20260907120300_r2_remediation.sql`
5. `20260907120400_c1_function_exposure.sql`
6. `20260907120500_c2_course_entitlement.sql`
7. `20260907120600_c3_reporting_retention.sql`

Do not mark ready/merge/deploy before the authorized database sequence and required review are complete. All seven must exist before the new app deploys. Migration CI is disposable-only and does not establish Production schema readiness.

## Partial failure and containment

- A failed migration leaves the prior transactional prefix. Hold the old app; identify the cause and actual schema prefix, preserve evidence, and obtain review for any SQL/security change before retrying. Do not replay already-applied migrations indiscriminately.
- If P7 succeeds but the app deploy fails, retain P7 and the rehearsed old app; retry the app deployment only under authorization.
- If application rollback is required, return to the verified compatible old deployment while retaining the database. Never disable RLS, widen grants, delete history or roll back the database to contain an app incident.
- If a new app reaches an incomplete prefix, contain the app deployment immediately. Missing dependencies are not permission to hot-edit production schema.
- Stop on unexpected access/reporting behavior, increased endpoint errors, deadlocks, mismatched approved SHA, missing protections or durable reporting evidence. Preserve aggregate/error metadata without PII or secrets.

## Application, scheduler and postflight

After explicit authorization and P7 checks, follow Brent's controlled merge/deployment path. Confirm the deployed commit is the approved head.

Verify admin learning-path management/reporting and school counts; assigned learner path/course/lesson and Mis cursos access; non-admin denial of cross-user learning-path reports with preserved course reporting; forced-password isolation; path-only loss versus independent grant survival using approved synthetic/operator test accounts and an explicitly authorized write scope. Historical unknown access is preserved, not certified.

Confirm `/api/cron/cleanup-learning-path-sessions` is hourly (`0 * * * *`), and the retired summary refresh is not scheduled. Observe the first scheduled run and the next two: both settlement and retention succeed, backlog drains, `retainedMissingEvidence` stays zero. The 15-minute stale threshold, 500-session settlement bound, seven-day retention and up-to-5,000 archive bound are specified in the maintenance procedure. Do not exercise live maintenance endpoints during draft preparation.

Recheck Q1 after the first maintenance settlement (old-app closed-but-unsettled sessions can exist during the window), Q8 reporting evidence, Q9 aggregate provenance, Q10 access protections and application error metadata. Retain operator evidence and unresolved acceptance items; only the authorized owner can declare operational release completion.
