# Review request — W-SIM-01 Production-QA containment and deterministic gap tooling

> Executor: Codex, local implementation and self-review. Independent reviewer: a fresh read-only reviewer following `docs/planning/review-protocol.md`. Approval authority: Brent. This work unit was not pushed, merged, deployed, or executed against Production.

**Remediation round 1 status (2026-09-03).** The first independent review returned `REQUEST CHANGES` at exact head `bdff3107fb47bf45ee255e6236d787111086a538`. Brent authorized bounded local remediation of findings 1–6, 8, and 11 on the existing branch. That remediation is included in the current review range and is documented in `docs/planning/reviews/fase-sm-sim-i1-remediation-1.md`. Findings 7, 9, and 10, plus the broader administrative-aggregate inventory noted by the reviewer, remain explicitly deferred. The request below now describes the remediated candidate; the original evidence remains part of the immutable Git history.

**Remediation round 2 status (2026-09-03).** The rereview at exact head `b8aefb17c8a42f042f2ff9400535a010fe8dd0c9` returned `REQUEST CHANGES` with one blocking finding: manifest-declared JSON objects were compared by projecting the actual value onto the declared key set, so an extra nested property was discarded and a drifted row could pass `verify` and be accepted by `reset`. Round 1 claimed exact JSON equality that the code did not deliver; that claim is now corrected in place in §5 and §7 of the remediation report. Brent authorized one bounded fix commit on top of that head. The object comparison is now exact at every depth, four refusal cases plus two real-`jsonb` savepoint-contained database drift probes cover it, and the new tests were confirmed to fail against the unfixed engine. Findings 7, 9, and 10 and the broader administrative aggregates remain deferred and untouched. Round 2 re-measured only type-check, zero-warning lint, the focused simulation/remediation specs, `npm run test:simulation-db`, and the full Vitest suite; §5's build, pgTAP, Playwright, ledger, and repository-guard figures belong to the round-1 head and were not re-run, because this round changed one comparison function and test files only.

## 1. Identity

| Item | Value |
|---|---|
| Work item | `W-SIM-01` (`MERGE`, class 0, batch `SIM1`) |
| Branch | `feat/sm-sim` |
| Worktree | `/Users/brentcurtis/dev/wt/sm-sim` |
| Original governance base | `b4929b3627a3a640312ea678c5c57c9857d50920` — PR #80 merge |
| Final parent/base | `d103198980b1671a2a207f4d2efcc1fd8db7a980` — local `origin/main` after PR #81; fast-forwarded before the W-SIM-01 commit. The intervening commits change only `PROJECT_STATE.md` and the Zoom B1 review request, with no W-SIM-01 implementation overlap. |
| Commits | Initial implementation commit `bdff3107fb47bf45ee255e6236d787111086a538`, followed by one local remediation commit. The executor report supplies the final exact SHA because a commit cannot contain its own hash. |
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
| Official-report exclusion | `lib/services/reports.js`; `lib/services/school-hours-report.ts`; inventoried report/dashboard/session routes, including `pages/api/admin/transformation-assessments.ts` | QA and operator tenants do not enter the thirteen inventoried official/client aggregates or selectors, legacy null-scoped transformation rows remain visible, and ordinary clients retain their path. |
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
| Vitest | `npm test` — 387 files, 8,801 passed, 12 skipped, 0 failed (8,813 total) at the round-2 head; the round-1 head measured 8,796 passed, and the difference is exactly the five new comparison tests |
| Production build | `npm run build` — exit 0; Next 14.2.35; 149/149 static pages |
| Database tests | local `supabase test db` — 25 files, 2,143 tests passed |
| Browser E2E | CI-equivalent Playwright (`CI=1`, production server, one worker, retries) — 192/192 passed |
| Simulation plan | Seven rows across four existing tables; stable remediated digest `bd0a666fa14e3058dd1b95b8062fce583b75f1396c08c063c4242f04cf7b16c6`; four gaps remain explicitly deferred |
| Seeder behavior | A dedicated real-PostgreSQL integration test used the local Supabase database only, seeded all seven manifest rows, proved a second seed inserts zero rows, verified exact values using PostgreSQL's real `date` and `jsonb` representations, injected two savepoint-contained drift mutations into real `jsonb` columns and proved both `verify` and `reset` refuse them, reset exactly seven rows in reverse order, and always rolled the enclosing transaction back. A separate residue query found zero manifest rows, no `schools` rows for 257/259, and no row carrying the injected property. |
| Transaction compatibility | The integration cycle runs inside a caller-owned local PostgreSQL `SERIALIZABLE` transaction that is always rolled back. Normal verification remains `SERIALIZABLE READ ONLY`; the advisory-lock compatibility probe also passed and rolled back. |
| Repository guards | Migration guard: 41 files, clean. Browser/server boundary guard: 1,153 files / 690 browser-reachable modules / 510 entrypoints, clean. Action-runtime guard: 17 uses, clean. Staged secret guard: 2,508 paths, zero findings. `git diff --cached --check`: clean. |
| Ledger validator | Expected repository baseline: exit 1 with exactly 67 pre-existing `[16 propiedad]` findings and no other category; `[23 simulación]` and every other substantive check pass. This phase does not own or alter those 67 backlog ownership debts. |

The first local Playwright attempt used the development server with five workers and produced 187 passes, four failures, and one test not run from development-only concurrency/startup interference. The required CI-equivalent rerun used the repository's production-server shape, one worker, and retries; all 192 tests passed. The latter is the authoritative browser gate. No test contacted Production or an external email/Zoom provider.

During remediation, an initial `CI=1 npm run e2e` invocation selected all 325 discovered tests rather than CI's thirteen-spec mandatory manifest and was stopped after an unseeded, unrelated proposal-flow login test exhausted its retries (38 passed, 21 skipped, 1 failed, 1 interrupted, 264 not run). It is not represented as a green gate. The repository's exact CI sequence was then reproduced: the guarded local synthetic seeder ran, the thirteen mandatory specs passed **192/192** against the production server with one worker and retries, and `e2e-mandatory --check` confirmed no mandatory spec was skipped.

The repository-wide advisory `npm run lint:testid` remains non-green with 44 missing-rule configuration errors and 2,577 warnings across pre-existing UI surfaces. It is explicitly advisory in `AGENTS.md`; this phase introduced no interactive control, and the required zero-warning ESLint gate is green.

## 6. Executor self-review corrections

The executor found and corrected these issues before the phase commit:

1. The broad repository `*.json` rule initially hid the target contract. `.gitignore` now explicitly re-includes `config/production-qa-simulation-target.json` so the critical allowlist cannot exist only locally.
2. The expense-notification API initially exposed only generic `skipped: true` evidence for QA. It now preserves `status: 'suppressed_qa'`, with a route test.
3. Legacy email-service log messages said “sent successfully” even when the central provider could suppress or refuse. They now say “delivery result”.
4. The read-only verifier's PostgreSQL advisory-lock form was tested directly in a local read-only serializable transaction and rolled back. An initial shell probe expanded `$1` before it reached PostgreSQL and therefore failed to parse; the immediately corrected quoted probe passed. No persistent change occurred.
5. After independent review, the manifest's licitation values were made valid under all baseline CHECK constraints; date-only comparison and explicit JSONB parameter serialization were added; a real local-PostgreSQL seed/idempotency/verify/reset integration test was added; nullable meeting/expense notification cases were handled deliberately; all legacy URL guard variants were aligned; the standard `generations` trigger side effect was documented; and the transformation-assessments aggregate was brought into the reporting scope. See the remediation report for the finding-by-finding map.
6. After the rereview, the manifest-owned row comparison was made genuinely exact. Round 1's projection kept only manifest-declared keys, so an extra nested JSON property was discarded before comparison; that hole and the round-1 report's overstated claim about it are both corrected, and the new coverage was verified to fail against the unfixed engine.

## 7. Mandatory review hotspots

1. **Reporting inventory completeness.** Rebuild the official reporting/selectors inventory independently and verify every relevant server-side aggregation uses the exclusion scope. Do not accept the route-contract test as the inventory itself.
2. **Email caller completeness and multi-role resolution.** Search for every active provider invocation and every changed caller. Verify a user with multiple school roles cannot bypass QA suppression and that provider construction occurs only after authorization.
3. **Zoom ordering and global-host distinction.** Inspect every job/cron/join/create path for authorization before network invocation. Decide independently whether the provider-account host-sync operation is correctly outside tenant traffic; flag it if any tenant-scoped payload can reach it.
4. **Manifest/reset safety.** Check table schemas, trigger and foreign-key behavior, equality comparisons, reverse deletion order, advisory locking, and the absence of force, wildcard, prefix-delete, or unowned-row paths. Specifically re-derive the JSON comparison: confirm no undeclared key at any depth can be discarded, that an object/array or object/`null` mismatch is not coerced into a match, and that the retained date-only and numeric-string normalizations remain narrow.
5. **Banner authority.** Verify the label and robots marker cannot be enabled by user-controlled query/body/local state and do not appear for real client or operator tenants.

## 8. Known limitations and deferred work

- Schools 257 and 259 remain `tenant_kind='client'`. The governed CLI therefore refuses to seed, verify, or reset them; changing that state belongs only to separately authorized W-SIM-02.
- Network membership, learning-path assignment/progress, assessment submissions, and Zoom attendance are intentionally absent from the seven-row manifest and reported as deferred gaps.
- Local green tests prove implementation behavior, not deployed-Production behavior. Exact-SHA post-deployment containment verification would be a later, separately authorized step.
- Reset directly owns only its seven deterministic application rows. It does not directly insert, update, or delete Auth, storage, pre-existing QA fixtures, tenant classification, or any row that fails exact manifest equality/reference checks. The pre-existing standard `generations` insert/delete triggers recompute `schools.has_generations` for schools 257/259; this narrow, self-correcting side effect is declared in the manifest and exercised by the rolled-back local integration test. It never changes `tenant_kind` or `internal_zoom_testing_enabled`.
- Reset and verify compare manifest-owned rows by exact canonical JSON, including every key PostgreSQL returns that the manifest did not declare. The only normalizations applied before that comparison are date-only/ISO `Date` rendering and numeric-string coercion for numerically declared columns; both are exercised by a dedicated test so they cannot quietly widen.
- Independent review is still pending. This request does not authorize push, merge, deployment, or W-SIM-02.
- Findings 7 (database-URL checks in legacy seeders and the queue-proof localhost assertion), 9 (licititation partial-unique-index natural key), and 10 (per-candidate Zoom-reconcile refusal isolation) remain deferred, as do administrative aggregates outside the transformation-assessments route. They are not represented as remediated here.

## 9. External-action record

No external action occurred. This implementation and verification performed no hosted database query or write, Production classification, Production seed/verify/reset, Auth/storage operation, email/Zoom/provider request, push, PR, merge, or deployment. Database writes were limited to the local Supabase database inside an enclosing transaction that was always rolled back; a separate local residue check found zero manifest rows. All other mutations were confined to the isolated local worktree and disposable local test services.
