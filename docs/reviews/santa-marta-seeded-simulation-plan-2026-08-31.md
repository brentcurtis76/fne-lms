# Santa Marta Seeded Simulation Plan — 2026-08-31

**Status:** SM-SIM-D0 DOCUMENTATION PHASE AUTHORIZED BY BRENT (2026-09-02) — recorded on `docs/sm-sim-d0`; pending independent review and Brent's merge decision. Provisioning, implementation, staging writes, seeding, and deployment remain `BLOCKED` / `UNAUTHORIZED`.

**Original research baseline:** live `origin/main` at `49814091a2df69cc8e4c02beba8014bb5aa0694c` (2026-08-31)

**Documentation-phase base:** live `origin/main` at `8218e597e148d8044fe7d330c118243aa3772485` (re-fetched 2026-09-02)

**Authorization boundary:** this plan authorizes no provisioning, implementation, staging write, seed execution, deployment, or production access

**Required environment label:** **PILOTO SIMULADO — DATOS SINTÉTICOS — NO PRODUCCIÓN**

## Recommendation

Proceed with a persistent **seeded simulation**, not a Santa Marta pilot. The preferred design is sound with four conditions:

- A dedicated non-production Supabase project.
- A protected Vercel custom `staging` environment connected only to that project.
- A new deterministic, idempotent, staging-only seeder.
- Explicit language and UI identifying it as synthetic simulation evidence only.

Brent authorized only the documentation phase on 2026-09-02. Provisioning, implementation, migration application, and seeding remain separate and unauthorized.

During the underlying read-only assessment, no files or external systems were changed. The documentation phase changes only the nine files listed in §15. External reads were limited to Git and GitHub PR/run/deployment metadata; no Supabase or Vercel control plane, database, credential, or other provider account was accessed, and no deployment was initiated.

## 1. Live repository lock

The remote was rechecked immediately before the original report:

| State | Result |
|---|---|
| Live `origin/main` | `49814091a2df69cc8e4c02beba8014bb5aa0694c` |
| Local branch | `docs/ci-close` |
| Local HEAD | `17ee9cf6ec5eff896842f5c84f8275d01e89365b` |
| Divergence | Local is 6 commits behind live main and 0 ahead |
| Working tree at assessment time | Clean; no tracked or untracked changes |
| Upstream | `origin/docs/ci-close`, `+0/-0` |

All governing-artifact findings below came from the live-main Git objects, not the older checked-out copies.

The documentation phase re-locked the repository before editing:

| State | Result |
|---|---|
| Live `origin/main` / phase base | `8218e597e148d8044fe7d330c118243aa3772485` |
| Branch | `docs/sm-sim-d0` |
| Base relationship | clean worktree created directly from live `origin/main` |
| Source draft | the untracked file in the canonical checkout; copied into this isolated worktree without altering the source |
| External activity | read-only `git fetch` and GitHub PR/run/deployment metadata for the already-completed PR #65 closure; no Supabase or Vercel control-plane access, database access, credential access, or external mutation |

## 2. Governing requirements

[AGENTS.md](../../AGENTS.md) and [CLAUDE.md](../../CLAUDE.md) are substantively mirrored. They require:

- Read [PROJECT_STATE.md](../../PROJECT_STATE.md) before changes.
- No deployment; `main` is the controlled auto-deployment path.
- No production database changes or destructive schema operations.
- Additive, DB-agent-owned migrations with RLS and role × table × operation coverage.
- Synthetic data only; no student PII, real documents, identifiers, or fixtures.
- Current nine-role model only; the future `estudiante`/family mapping must not be invented early.
- Type-check, lint, unit tests, build, and DB/E2E gates proportional to scope.
- Branch names no longer than 20 characters, no self-merge, and an independently reviewable phase review-request file.

At the original assessment, live main already contained merge `49814091…`, but the top `LP-GOV-01` entry in `PROJECT_STATE.md` still said the governance correction was “NOT MERGED.” This documentation phase corrects that drift: PR [#65](https://github.com/brentcurtis76/fne-lms/pull/65) was merged by Brent at approved head `d8f9ea38e37b0075e84cd016cf30086e04cf658b` as merge commit `49814091a2df69cc8e4c02beba8014bb5aa0694c`; PR CI run `33397850894` and post-merge CI run `33400056341` succeeded, and automatic Production deployment `6182645350` completed successfully. This closes only W-B2c prerequisite 1. W-B2c remains `BLOCKED` and unauthorized pending Privacy approval of the actor-by-operation matrix and Brent's later explicit implementation authorization.

## 3. Santa Marta governance state

The pre-phase live-main artifacts were revision 9. This branch advances the mutable governance artifacts to revision 10 while preserving all historical evidence:

- Release protocol: [santa-marta-release-protocol-2026-08-25.md](santa-marta-release-protocol-2026-08-25.md), revision 10 on this branch.
- Combined plan: [santa-marta-combined-plan-2026-08-25.md](santa-marta-combined-plan-2026-08-25.md), retained as historical audit context rather than the current scheduling authority.
- Normalization report: [santa-marta-ledger-normalization-report-2026-08-25.md](santa-marta-ledger-normalization-report-2026-08-25.md).
- Mutable work ledger: [santa-marta-work-items.csv](santa-marta-work-items.csv).
- Mapping ledger: [santa-marta-work-claim-map.csv](santa-marta-work-claim-map.csv).
- Validator: [check-ledger.mjs](../../scripts/check-ledger.mjs).

The revision-10 candidate ledger on this branch contains:

- 160 frozen claims.
- 36 unique P0 claims.
- 109 mutable work items.
- 156 claim/work links.
- 63 P0 links.
- 29 batches covering 35 work items.
- Modes: 91 `MERGE`, 11 `DATA`, 6 `PRODUCTION_CHECK`, 1 `DOCUMENTATION`.
- Statuses: 29 scheduled, 57 backlog, 19 blocked, 3 done, 1 superseded.
- Structural, scope, classification, and global-learning-path checks passed.
- Exactly 67 existing ownership failures remain under validator check 16. Those are governance blockers, not validator defects.

`W-SIM-01` and `W-SIM-02` account for the two new work items and four new non-closing evidence links. Both are `BLOCKED` and `UNAUTHORIZED`; neither is a remediation of the frozen claims, and neither closes a claim. W-B2c remains blocked and unauthorized. Its governance-merge prerequisite is now evidenced as complete, but Privacy approval and Brent's separate implementation authorization remain open. W-B2d is truthfully superseded without execution. W-PC-06 must not be rerun.

## 4. Seeder audit

The original review at `49814091…` found 40 committed files whose names identify them as seeders, plus adjacent QA population utilities. Only the local CI seeder had a real target allowlist.

| Surface | Files | Target safety |
|---|---|---|
| Local CI | `scripts/ci/seed-e2e.mjs`, `seed-e2e-zoom.mjs` | Strong: localhost-only allowlist before client creation; Zoom inherits that boundary. Not usable for persistent staging. |
| Existing demo seeder | `scripts/demo-data/seed-demo.ts` plus `cleanup-demo.ts` | Unsafe for staging: arbitrary environment target, random identifiers/dates, incomplete idempotency, and broad content-matched deletion. |
| Proposal seeds | `lib/propuestas/scripts/seed-db.ts` and five files under `lib/propuestas/seeds/` | Environment-selected target with no project/ref allowlist; contents are not certified synthetic. |
| QA API seed | `pages/api/qa/seed-codebase-index.ts` | Admin bearer guard, but no database-target guard; writes to whichever deployment database is configured. |
| JavaScript QA seeders | `seed-consultant-rates-qa.mjs`, `seed-docente-qa-test-data.js`, `seed-hour-tracking-qa-data.mjs`, `seed-hour-tracking-qa-scenarios.mjs`, and the three `seed-qa-phase2*.js` files | No exact project allowlist; several depend on existing rows or nondeterministic values. |
| SQL QA seeds | Two files under `docs/migrations/`, `scripts/seed-docente-qa-test-data.sql`, and 16 `docs/qa-system/seed-*.sql` files | Target-blind manual SQL. |
| Archived seed migrations | Four `supabase/migrations-archive/*seed*.sql` files | Historical migration content; no script-level target guard and not part of the active replay chain. |
| QA population utilities | `scripts/import-qa-role-scenarios.js`, `scripts/populate-qa-scenarios.js` | Read `.env.local` and write to the selected project without target validation. |

Additional findings:

- `package.json` exposes several stale `seed:*` commands whose referenced `scripts/data-seeding` tree or individual seeder files do not exist.
- `scripts/seed-hour-tracking-qa-data.mjs` defaults to the known production project URL.
- At the original baseline, `scripts/seed-hour-tracking-qa-scenarios.mjs` contained both the production ref and a committed credential-shaped service-role JWT. It was not displayed or used during the assessment. CRED-01 later removed that tracked script and installed the index-only committed-secret guard through PR #66; the historical exposure and the still-enabled legacy keys remain governed in the separate credential lane. No production or legacy credential may be reused for this staging environment.
- No existing remote-capable seeder meets the required deterministic, resettable, exact-staging-only contract.

Current-main reconciliation at `8218e597…`: the original 40-file named-seeder inventory is now 39 because CRED-01 removed `scripts/seed-hour-tracking-qa-scenarios.mjs`; `scripts/seed-hour-tracking-qa-data.mjs` remains and still defaults to the known production project URL. The other architecture findings and the 40-active/38-archived migration counts are unchanged from the original assessment.

### Historical `scripts/demo/seed-sm`

It is not in live main or any current live-origin branch. It is preserved as versioned historical evidence:

- Frozen checkout: `/Users/brentcurtis/dev/fne-lms`
- Historical branch: `chore/save-sm`
- Preservation commit: `18e6fcb729cb24f7cb1168a8c044bc2b6663743b`
- A local-only `archive/sm-saved` branch also contains it.

Therefore it is **historical versioned evidence**, not authoritative and not currently merely unversioned. The governing documents’ “unversioned” description reflects an earlier point in time.

It must not be revived wholesale: its fixtures copy real Santa Marta school identities and include a real named person, and its LMS module creates compatibility views absent from governed migrations. Only its broad scenario categories are useful as planning evidence.

## 5. Vercel environment model

Repository evidence establishes:

- `main` auto-deploys as Production.
- Non-production branches receive Preview deployments.
- `vercel.json` defines four scheduled jobs: Zoom ticker, Zoom reconciliation, recovery outbox, and auth retention.
- There is no repository-defined stable staging environment or staging-domain configuration.
- `.claude/skills/pipeline-context.md` contains an older staging/production description that conflicts with canonical AGENTS/CLAUDE rules and must not govern this work.

Vercel supports stable branch URLs and branch-specific Preview variables; Pro and Enterprise also support a dedicated custom environment with independent variables. A Pro project receives one custom environment at no extra custom-environment fee. See [Vercel environments](https://vercel.com/docs/deployments/environments) and [environment variables](https://vercel.com/docs/environment-variables).

Important repository assumptions that need implementation work:

- `lib/utils/environmentMonitor.ts` knows only production and localhost; an unknown staging Supabase URL merely warns server-side and reports “production” client-side.
- `next.config.js` allows optimized images only from the production Supabase hostname.
- `lib/utils/app-url.ts` permits Host-header fallback in non-production unless a base URL is configured.
- `lib/email/outbox.ts` deliberately refuses capture on every Vercel deployment, so the local E2E file transport cannot be the staging mail solution.
- `lib/pasantias/pdf/serve.ts` permits cache writes only when `VERCEL_ENV=production` and assumes deployments share a bucket.

Vercel’s repository cron definitions call the Vercel project’s **Production deployment URL**. They do not provide automatic scheduling for Preview/custom staging. See [Vercel Cron Jobs](https://vercel.com/docs/cron-jobs). Therefore the initial simulation should test scheduled endpoints through controlled manual invocation and leave autonomous scheduling out of scope. A separate scheduler would require its own later decision and threat model.

## 6. Supabase topology and clean staging initialization

Current topology:

- `supabase/config.toml` names the production project ref, although local Docker URLs remain local.
- Active chain: 40 migrations:
  - `00000000000000_baseline.sql`
  - 39 forward migrations through `20260827170000_lockdown_unused_legacy_tables.sql`
- Archive: 38 historical SQL files, ending with `APPLY_MANUALLY_consultor_rls_fix.sql`.
- CI pins Supabase CLI `2.110.0`.
- Current CI reconstructs the active 40-migration chain on an ephemeral local stack.

The production migration history predates the squash and contains the historical migration rows. That is why normal migration push/repair operations must not be used against production.

A clean, newly created staging project does not have that historical mismatch. Its safe initialization design is:

1. Validate that the explicit target ref and database hostname exactly equal the committed staging allowlist and do not equal production.
2. Confirm its remote migration ledger is empty.
3. Apply the active baseline plus 39 forward migrations in timestamp order using the pinned CLI and an isolated staging link.
4. Do not replay `migrations-archive`.
5. Do not copy or repair production migration-ledger rows.
6. Verify the remote ledger contains exactly the active 40 versions and validate schema, extensions, RLS, storage buckets, Auth settings, cron dependencies, and required reference data.
7. Run the new simulation seeder separately; do not combine schema initialization with seed execution.

Supabase’s migration system applies versioned migrations in order and tracks them in `supabase_migrations.schema_migrations`; its documentation also warns that remote reset is destructive and that environment targets must be checked explicitly. See [Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations) and the [local and staging workflow](https://supabase.com/docs/guides/local-development/cli-workflows).

A particular clean-project risk is that squashing can omit data-manipulation content such as reference rows, buckets, cron jobs, or vault values. The active chain’s successful local reconstruction is necessary but not sufficient proof of hosted Auth/Storage/configuration completeness. Any missing prerequisite must become separately governed version-controlled work; the simulation seeder must never create schema, policies, functions, or compatibility views.

## 7. Overlap with existing Santa Marta work

### Synthetic equivalents, without closure credit

The simulation data manifest overlaps every current production data lane:

- W-D-01 programs.
- W-D-02 accounts.
- W-D-03 network and schools.
- W-D-04 transversal context/catalog/grades.
- W-D-05 communities and membership.
- W-D-06 contracts and hour buckets.
- W-D-07 procurement history/documents.
- W-D-08 teacher-course assignments and evaluations.
- W-D-09 LMS paths, courses, modules, lessons, and enrollments.
- W-D-10 published assessment instrument.

All ten remain `BLOCKED`, `UNAUTHORIZED`, class-3 production data work. Synthetic staging evidence closes none of them.

The simulation can exercise behavior related to B3 meetings, B4 sessions, B5 assessment snapshots, B6 reports, B7 communities, B8 procurement, B9 assignments, and B10 authentication/mail. It does not establish that any open implementation defect in those lanes is fixed.

### Genuine production-readiness work that remains

- W-PC-01 through W-PC-05 remain blocked and unauthorized.
- W-B2c learning-path RLS and function security remains a prerequisite for sharing the staging environment beyond a tightly controlled admin-only review.
- W-B10a and broader student/family RLS remain genuine future work. They are not needed to model adult teacher-learners and must not be bypassed by inventing student roles.
- Real-school onboarding, Privacy acceptance, production provider verification, real inbox delivery, stakeholder acceptance, and production data reconciliation remain unproven.
- B2a and B2b are already technically closed and must not be reopened or reapplied.
- D-RLS-01/02/03 remain separate deferred security work.

## 8. Governance recommendation

Use **both** a release-protocol addendum and new mutable work items.

- Protocol revision 10 should replace “real Santa Marta pilot” execution language with a clearly bounded seeded-simulation lane while preserving the historical record.
- `W-SIM-01`: `MERGE`, class 0, covering code, target guards, banner, mail isolation, seed/reset tooling, and tests.
- `W-SIM-02`: `DATA`, class 3, covering the later staging-only schema initialization and synthetic-data execution.

Both start `BLOCKED` and `UNAUTHORIZED`. Merging W-SIM-01 must not authorize W-SIM-02.

They should map as non-closing evidence dependencies to the existing onboarding and learning-path umbrella claims, using the W-PC-06 precedent: a mapping records relevance but does not make the work a remediation or close the production claim. The validator must pin that distinction.

The frozen 160-claim ledger and its hash remain byte-for-byte unchanged.

## 9. Synthetic scenario manifest

Use manifest version `sm-sim-v1` with UUIDv5 identifiers and a recorded scenario epoch. The same version and epoch must produce identical identifiers, counts, relationships, and digest.

| Lane | Proposed synthetic content |
|---|---|
| Organizations | `Red Sintética SM-01`, two clearly synthetic member schools, and one out-of-scope synthetic control school |
| People | 20 accounts: 1 admin, 1 supervisor, 2 directivos, 2 consultores, 1 community manager, 2 generation leaders, 2 community leaders, 1 procurement officer, and 8 adult `docente` learners |
| Identity | Reserved `.test` addresses, synthetic labels, no RUTs, birthdates, government IDs, phone numbers, or real-school identifiers |
| Programs/context | 2 programs, synthetic transversal context, catalogs, grades, and positive/negative school-scope controls |
| Communities | 3 communities with leader, member, outsider, and cross-school denial cases |
| Learning | 3 global FNE path templates, 5 courses, 10 modules, 20 lessons; direct and group assignments plus an unassigned control |
| Progress | Not-started, partial, completed, active-session, ended-session, reassigned, and unassigned states |
| Meetings | 6 community/consulting sessions spanning requested, approved, completed, cancelled, and rescheduled states |
| Zoom | `ZOOM_MODE=mock` only; no Zoom credentials, external meeting creation, or real join proof |
| Consulting | 3 synthetic contracts, hour buckets, normal consumption, adjustment, over-limit refusal, and report reconciliation |
| Assessments | 2 templates, one published v1 snapshot, one draft revision, 6 attempts covering open, partial, submitted, evaluated, and immutable-history cases |
| Procurement | 2 fictional processes: standard path and deadline/weekend/holiday edge case; generated documents visibly watermarked `SIMULACIÓN — SIN VALIDEZ` |
| Email | Invitation, recovery, meeting summary, and deadline cases routed only to one controlled capture sink |
| Negative controls | Anonymous, unassigned, wrong-school, wrong-network, non-admin management, unknown project target, real-looking email domain, and outbound-provider refusal |

All “learners” are explicitly synthetic adults using the existing `docente` role. No `estudiante`, family, or minor persona is introduced.

## 10. Safety invariants and stop conditions

Implementation must stop if any of these fail:

- The staging project ref has not been supplied and committed to the allowlist.
- URL hostname, anon-key ref claim, service-role-key ref claim, or database hostname disagree.
- The target equals production, localhost, or any unknown ref.
- A bypass such as `--force`, override environment variable, or interactive “continue anyway” exists.
- Target validation would occur after constructing a network client.
- The staging migration ledger is non-empty or differs from the expected active chain.
- A fixture contains a real name, real domain, valid personal identifier, copied production identifier, or copied production row.
- Any account might represent a minor.
- The seeder needs to create schema, policies, functions, buckets, or compatibility views.
- A real Zoom credential is configured or `ZOOM_MODE` is not exactly `mock`.
- Email is not rewritten/refused at the central outbound boundary.
- The banner or `noindex` marking is missing from any rendered route.
- Reset encounters an unowned or unexplained row.
- The repository committed-secret guard is not green, a production or legacy credential is proposed for staging, or staging credentials are not isolated from Production.
- W-B2c remains open and the environment is proposed for broad or public sharing.
- Anyone proposes using simulation evidence as production activation, real onboarding readiness, stakeholder acceptance, or a real Santa Marta pilot.

The target guard must complete before any network access and must never log keys, passwords, tokens, or complete connection strings.

## 11. Reset and cleanup design

Routine reset is manifest-scoped, not project-wide:

1. Acquire a simulation lock.
2. Preflight the exact staging target.
3. Inventory every manifest-owned UUID, reserved email, storage prefix, and expected row count.
4. Stop if foreign rows reference manifest-owned records or appear inside the owned namespace.
5. Delete only manifest-owned application rows in foreign-key-safe order inside a transaction.
6. Remove only manifest-owned Auth users and storage objects under an exact versioned prefix.
7. Reseed the same manifest and epoch.
8. Compare counts and a canonical digest to the published expected digest.

Normal seeding is reconcile/upsert, so running it twice changes no identifiers or counts. Reset must be restartable after partial Auth/provider failure.

There should be no generic remote wipe, project deletion, or “clean everything” command. Whole-project reconstruction is a separately authorized DB-agent operation reserved for the dedicated staging project.

## 12. Test and acceptance plan

Before merge:

- Target-guard matrix: exact staging passes; production, local, unknown, malformed key, missing variable, and URL/key mismatch all fail before network access.
- Manifest lint: reserved domains, prohibited-name dictionary, no identifier-shaped values, adults only, stable digest.
- Determinism and idempotency tests.
- Seed → mutate → reset → digest-equality test on ephemeral local Supabase through a separate localhost-only adapter.
- Unexpected-row and foreign-reference reset refusal tests.
- Banner, `noindex`, environment header, and small-screen accessibility tests.
- Email sink rewrite/refusal tests covering every direct Resend call site.
- Mock-Zoom enforcement test.
- Required repository gates: type-check, lint, unit tests, build, local pgTAP, and proportional Playwright E2E.

After separate staging authorization:

- Verify the exact 40-version migration ledger.
- Seed twice and confirm no drift.
- Complete each role journey and negative cross-school/cross-network journey.
- Confirm all email events appear only in the controlled sink.
- Confirm zero real Zoom/provider calls.
- Confirm procurement files are watermarked.
- Exercise scheduled endpoints manually with the staging secret; do not claim autonomous cron coverage.
- Reset and prove the original digest is restored.
- Capture screenshots that always include the simulation banner.
- Produce an acceptance report titled “seeded synthetic simulation,” never “pilot completion.”

Local ephemeral Supabase remains the automated CI target; it is not the persistent simulation environment.

## 13. Cost and account dependencies

- **Supabase:** a free project may cost $0 but can pause after inactivity, so it does not satisfy a reliably persistent environment. Pro is $25/month with compute credit; if production already consumes the included Micro compute, an additional Micro staging project starts around $10/month. Exact impact depends on the current organization and region. See [Supabase pricing](https://supabase.com/pricing) and the [billing FAQ](https://supabase.com/docs/guides/platform/billing-faq).
- **Vercel:** custom environments require Pro or Enterprise. Pro currently has a $20/month platform fee with one deploying seat and usage credit; the first custom environment itself carries no additional custom-environment charge. If FNE already uses Pro, only incremental usage may change. See the [Vercel Pro plan](https://vercel.com/docs/plans/pro-plan).
- **Email:** Resend’s free tier currently permits 3,000 messages/month and 100/day; Pro starts at $20/month. Resend does not provide a sandbox mode, so the application-side sink restriction is mandatory even on a separate account. See [Resend pricing](https://resend.com/docs/knowledge-base/what-is-resend-pricing) and its [sandbox limitation](https://resend.com/docs/knowledge-base/does-resend-require-production-approval).
- **Domain/DNS:** no extra platform fee if an existing controlled subdomain is used; DNS administration is required.
- **Test inbox/deployment protection:** potentially $0 with existing services, otherwise vendor-dependent.
- **Cron:** automatic Vercel cron coverage is deliberately excluded from the first simulation phase.

## 14. Staged itinerary

1. **SM-SIM-D0 — documentation only**

   Reconcile live state; write protocol revision 10; add W-SIM-01/W-SIM-02 as blocked and unauthorized; pin claims-as-non-closing evidence; define the manifest, target contract, language rules, reset rules, costs, and acceptance boundary. Independent review and Brent merge decision required.

2. **External prerequisite allocation**

   Brent creates or designates the separate Supabase staging project, Vercel custom environment, stable protected domain, and controlled email sink. Only nonsecret identifiers enter the repository. No seed execution yet.

3. **SM-SIM-I1 — implementation**

   Implement build/runtime guards, banner, email isolation, deterministic seeder/reset/verifier, local CI adapter, and tests. Merge does not authorize hosted writes.

4. **SM-SIM-D1 — staging initialization and seed**

   Separately authorize the DB agent to initialize only the allowlisted clean staging project and then run W-SIM-02. No production access.

5. **SM-SIM-A1 — acceptance and operations**

   Run hosted acceptance, record the manifest digest, document reset ownership and cadence, and label all evidence as synthetic simulation evidence.

## 15. Exact later file scope

### Documentation phase

Modify:

- `PROJECT_STATE.md`
- `docs/reviews/santa-marta-release-protocol-2026-08-25.md`
- `docs/reviews/santa-marta-combined-plan-2026-08-25.md`
- `docs/reviews/santa-marta-ledger-normalization-report-2026-08-25.md`
- `docs/reviews/santa-marta-work-items.csv`
- `docs/reviews/santa-marta-work-claim-map.csv`
- `scripts/check-ledger.mjs`

Create:

- `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md`
- `docs/planning/reviews/fase-sm-sim-plan-review-request.md`

Do not modify the frozen claims CSV or archived legacy ledger.

### Implementation phase

Modify:

- `package.json`
- `next.config.js`
- `pages/_app.tsx`
- `lib/utils/environmentMonitor.ts`
- `lib/utils/app-url.ts`
- `lib/pasantias/pdf/serve.ts`
- `lib/email/invitations.ts`
- `lib/email/expenseNotifications.ts`
- `lib/emailService.js`
- `lib/pasantias/emails.ts`
- `pages/api/contact.ts`
- `PROJECT_STATE.md`

Create:

- `config/santa-marta-simulation-target.json`
- `components/SimulationEnvironmentBanner.tsx`
- `lib/email/outbound-policy.ts`
- `scripts/ci/check-simulation-target.mjs`
- `scripts/ci/seed-santa-marta-simulation.mjs`
- `scripts/santa-marta-simulation/target-guard.ts`
- `scripts/santa-marta-simulation/manifest.ts`
- `scripts/santa-marta-simulation/seed.ts`
- `scripts/santa-marta-simulation/reset.ts`
- `scripts/santa-marta-simulation/verify.ts`
- Versioned modules under `scripts/santa-marta-simulation/modules/`
- `__tests__/scripts/santa-marta-simulation.test.ts`
- `__tests__/lib/email/outbound-policy.test.ts`
- `__tests__/components/SimulationEnvironmentBanner.test.tsx`
- `tests/e2e/santa-marta-simulation.spec.ts`
- `docs/planning/reviews/fase-sm-sim-impl-review-request.md`

No Supabase migration should be part of this implementation phase. If a required scenario cannot be represented by the governed active schema, implementation stops and returns a separate database work item. `vercel.json` should also remain unchanged because automatic staging cron execution is out of scope.

## Decision gate

**SM-SIM-D0 DOCUMENTATION AUTHORIZED — IMPLEMENTATION AND DATA ACTIONS NOT AUTHORIZED**

**Brent decision recorded 2026-09-02:** execute the documentation-only `SM-SIM-D0` reconciliation using the recommended separate Supabase staging project, protected Vercel custom staging environment, adult-only synthetic manifest, and two non-closing mutable work items. Independent review and Brent's merge decision remain required. This decision authorizes no provisioning, implementation, staging write, seeding, deployment, or production access.
