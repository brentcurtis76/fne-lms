# Review request — W-SIM-01 Production-QA containment and deterministic gap tooling

> Executor: Codex, local implementation and self-review. Independent reviewer: a fresh read-only reviewer following `docs/planning/review-protocol.md`. Approval authority: Brent. This work unit was not pushed, merged, deployed, or executed against Production.

## 1. Identity

| Item | Value |
|---|---|
| Work item | `W-SIM-01` (`MERGE`, class 0, batch `SIM1`) |
| Branch | `feat/sm-sim` |
| Worktree | `/Users/brentcurtis/dev/wt/sm-sim` |
| Original governance base | `b4929b3627a3a640312ea678c5c57c9857d50920` — PR #80 merge |
| Final parent/base | `d103198980b1671a2a207f4d2efcc1fd8db7a980` — local `origin/main` after PR #81; fast-forwarded before the W-SIM-01 commit. The intervening commits change only `PROJECT_STATE.md` and the Zoom B1 review request, with no W-SIM-01 implementation overlap. |
| Commits | One local phase commit on the final parent. The executor report supplies the exact SHA because a commit cannot contain its own hash. |
| Upstream | None; the branch has never been pushed |
| Governing scope | Current amendment §§D–F of `docs/reviews/santa-marta-seeded-simulation-plan-2026-08-31.md`, the W-SIM-01 ledger contract, and release-protocol revision 11. These supersede the historical staging design. |

## 2. Objective and scope

Implement the code-only W-SIM-01 containment layer and deterministic tooling required before a separately authorized Production-QA data operation could even be considered. The implementation must fail closed around the exact Production project and the exact two synthetic QA tenants, must prevent QA traffic from affecting official reporting or external providers, and must never treat pre-existing QA rows as disposable manifest data.

### In scope

- A tracked exact-target contract for Supabase ref `sxlogxqzmarhqsblxmtj`, schools 257 and 259, the governed label, synthetic email domain, and manifest version.
- Pure central tenant-policy helpers that distinguish `qa`, `operator`, and `client` traffic and require both allowlisted schools to be classified `tenant_kind='qa'` before any governed seed, verify, or reset operation.
- Server-side exclusion of QA/operator tenants from the inventoried official reporting aggregations and selectors.
- One outbound-email provider boundary requiring explicit authorization before constructing or invoking Resend; QA results must be `suppressed_qa` and must not claim delivery.
- A tenant boundary for managed Zoom create, join, delete, sync, attendance, and scheduled reconciliation paths, with QA refusal before provider invocation and no Production-wide mock mode.
- The QA-only visible banner and `noindex` marker, driven by authoritative server-provided tenant context.
- Deterministic, versioned UUIDv5 plan/seed/verify/reset tooling over a seven-row, four-table ownership manifest, inside bounded transactions with advisory serialization.
- Fail-closed guards on the inventoried legacy demo/QA seeders when their environment resolves to the exact Production project.
- Unit, database, and browser coverage proportionate to the changed boundaries.

### Out of scope

- No migration, schema change, RLS/policy/grant/function change, school classification, hosted query/write, Auth/storage operation, Production seed/verify/reset, provider call, email delivery, Zoom call, or stakeholder rehearsal.
- No synthetic global learning-path template and no attempt to close `W-B2c-01`, real onboarding, Santa Marta acceptance, or any of the four non-closing claim mappings.
- No implementation of the deferred network-membership, learning-path assignment/progress, assessment-submission, or Zoom-attendance gaps.
- No W-SIM-02 authorization or execution, push, PR, merge, deployment, or post-deployment verification.

## 3. Files by review risk

### High risk

- `.gitignore`, `config/production-qa-simulation-target.json`, and `package.json` — tracked immutable target contract and command entry points.
- `lib/simulation/**`, `scripts/production-qa-simulation/**`, and the legacy `scripts/**` / `lib/propuestas/scripts/seed-db.ts` changes — target resolution, tenant preflight, manifest ownership, transaction, verification, reset, and legacy-seeder refusal.
- `lib/email/provider.ts`, `lib/email/outbound-policy.ts`, all modified email callers, and their API routes — provider centralization and tenant authorization.
- `lib/zoom/tenant-boundary.ts`, the modified Zoom jobs, reconciliation route, session creation/capabilities routes, and join policy/route — provider-call ordering and tenant resolution.
- The modified reporting services and API routes — completeness of official-report exclusion.

### Medium risk

- `components/SimulationEnvironmentBanner.tsx`, `components/layout/MainLayout.tsx`, and `types/roles.ts` — tenant-context rendering, noindex behavior, and client/operator non-regression.

### Lower risk but contract-bearing

- `__tests__/**` — route inventories, negative provider tests, manifest/reset invariants, UI scope, and regression coverage.
- `PROJECT_STATE.md` and this request — state and evidence claims.

## 4. Contract-to-implementation map

| Contract | Primary implementation | Required reviewer conclusion |
|---|---|---|
| Exact destination only | `config/production-qa-simulation-target.json`; `lib/simulation/constants.ts`; `lib/simulation/route-context.ts`; CLI target guard | A mistyped ref, extra/missing school, non-Production URL, or absent explicit confirmation fails before SQL or providers. |
| Separate data authority | `lib/simulation/tenant-policy.ts`; `scripts/production-qa-simulation/target-guard.mjs` | W-SIM-01 does not classify schools or authorize W-SIM-02; both schools must already be `qa`. |
| Official-report exclusion | `lib/services/reports.js`; `lib/services/school-hours-report.ts`; inventoried report/dashboard/session routes | QA and operator tenants do not enter official/client aggregates or selectors, and ordinary clients retain their path. |
| Email suppression | `lib/email/outbound-policy.ts`; `lib/email/provider.ts`; all changed email callers | Every active Resend send goes through one boundary; QA returns `suppressed_qa` before the SDK is instantiated or invoked. |
| Zoom refusal | `lib/zoom/tenant-boundary.ts`; changed jobs/routes/policies | QA is rejected before any provider method; real client behavior remains unchanged; no global Production mock switch is introduced. |
| Visible label | `components/SimulationEnvironmentBanner.tsx`; `components/layout/MainLayout.tsx` | Only authoritative QA tenant context renders the exact label and `noindex`; client and operator surfaces do not. |
| Deterministic gap tooling | `scripts/production-qa-simulation/manifest.mjs`; `cli.mjs`; `engine.mjs` | Plan is stable at seven rows/four tables, uses versioned deterministic IDs, and never assumes ownership of existing rows. |
| Manifest-only reset | `scripts/production-qa-simulation/engine.mjs`; `postgres-store.mjs` | Reset has no force/wipe path, stops on drift or foreign references, and deletes only exact manifest rows in reverse dependency order. |
| Existing seeders prohibited | `lib/simulation/legacy-seeder-guard.ts`; all changed legacy seeder entry points | A Production-targeted invocation refuses before mutation while local/test use remains available. |

## 5. Verification evidence

All gates used Node 22 and the local Supabase stack or local application server. `.env.local` contained local Supabase values only and remained ignored.

| Gate | Result |
|---|---|
| TypeScript | `npm run type-check` — exit 0 |
| ESLint | `npm run lint` — exit 0, zero warnings |
| Vitest | `npm test` — 385 files, 8,785 passed, 11 skipped, 0 failed (8,796 total) |
| Production build | `npm run build` — exit 0; Next 14.2.35; 149/149 static pages |
| Database tests | local `supabase test db` — 25 files, 2,143 tests passed |
| Browser E2E | CI-equivalent Playwright (`CI=1`, production server, one worker, retries) — 192/192 passed |
| Simulation plan | Seven rows across four existing tables; stable digest `54e4a627fcb49a0fdbbfd18549f2f0b8036cb4ec95a44390a72c3d883cdefa9f`; four gaps remain explicitly deferred |
| Seeder behavior | Local seed-E2E was idempotent and reused existing synthetic fixtures; it deleted nothing |
| Transaction compatibility | Local PostgreSQL accepted the manifest advisory lock inside `SERIALIZABLE READ ONLY`; the probe was rolled back |
| Repository guards | Migration guard: 41 files, clean. Browser/server boundary guard: 1,153 files / 690 browser-reachable modules / 510 entrypoints, clean. Action-runtime guard: 17 uses, clean. Staged secret guard: 2,505 paths, zero findings. `git diff --cached --check`: clean. |
| Ledger validator | Expected repository baseline: exit 1 with exactly 67 pre-existing `[16 propiedad]` findings and no other category; `[23 simulación]` and every other substantive check pass. This phase does not own or alter those 67 backlog ownership debts. |

The first local Playwright attempt used the development server with five workers and produced 187 passes, four failures, and one test not run from development-only concurrency/startup interference. The required CI-equivalent rerun used the repository's production-server shape, one worker, and retries; all 192 tests passed. The latter is the authoritative browser gate. No test contacted Production or an external email/Zoom provider.

The repository-wide advisory `npm run lint:testid` remains non-green with 44 missing-rule configuration errors and 2,577 warnings across pre-existing UI surfaces. It is explicitly advisory in `AGENTS.md`; this phase introduced no interactive control, and the required zero-warning ESLint gate is green.

## 6. Executor self-review corrections

The executor found and corrected these issues before the phase commit:

1. The broad repository `*.json` rule initially hid the target contract. `.gitignore` now explicitly re-includes `config/production-qa-simulation-target.json` so the critical allowlist cannot exist only locally.
2. The expense-notification API initially exposed only generic `skipped: true` evidence for QA. It now preserves `status: 'suppressed_qa'`, with a route test.
3. Legacy email-service log messages said “sent successfully” even when the central provider could suppress or refuse. They now say “delivery result”.
4. The read-only verifier's PostgreSQL advisory-lock form was tested directly in a local read-only serializable transaction and rolled back. An initial shell probe expanded `$1` before it reached PostgreSQL and therefore failed to parse; the immediately corrected quoted probe passed. No persistent change occurred.

## 7. Mandatory review hotspots

1. **Reporting inventory completeness.** Rebuild the official reporting/selectors inventory independently and verify every relevant server-side aggregation uses the exclusion scope. Do not accept the route-contract test as the inventory itself.
2. **Email caller completeness and multi-role resolution.** Search for every active provider invocation and every changed caller. Verify a user with multiple school roles cannot bypass QA suppression and that provider construction occurs only after authorization.
3. **Zoom ordering and global-host distinction.** Inspect every job/cron/join/create path for authorization before network invocation. Decide independently whether the provider-account host-sync operation is correctly outside tenant traffic; flag it if any tenant-scoped payload can reach it.
4. **Manifest/reset safety.** Check table schemas, trigger and foreign-key behavior, equality comparisons, reverse deletion order, advisory locking, and the absence of force, wildcard, prefix-delete, or unowned-row paths.
5. **Banner authority.** Verify the label and robots marker cannot be enabled by user-controlled query/body/local state and do not appear for real client or operator tenants.

## 8. Known limitations and deferred work

- Schools 257 and 259 remain `tenant_kind='client'`. The governed CLI therefore refuses to seed, verify, or reset them; changing that state belongs only to separately authorized W-SIM-02.
- Network membership, learning-path assignment/progress, assessment submissions, and Zoom attendance are intentionally absent from the seven-row manifest and reported as deferred gaps.
- Local green tests prove implementation behavior, not deployed-Production behavior. Exact-SHA post-deployment containment verification would be a later, separately authorized step.
- Reset owns only its seven deterministic application rows. It does not touch Auth, storage, pre-existing QA fixtures, tenant classification, or any row that fails exact manifest equality/reference checks.
- Independent review is still pending. This request does not authorize push, merge, deployment, or W-SIM-02.

## 9. External-action record

None. This implementation and verification performed no hosted database query or write, Production classification, Production seed/verify/reset, Auth/storage operation, email/Zoom/provider request, push, PR, merge, or deployment. All mutations were confined to the isolated local worktree and local disposable test services.
