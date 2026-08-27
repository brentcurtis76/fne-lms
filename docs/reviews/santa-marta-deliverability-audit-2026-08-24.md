# Santa Marta Deliverability Audit

> **Historical audit artifact.** Its operational counts and scheduling are superseded by the
> normalized claim/work ledgers and the active release protocol; its original findings remain
> provenance.

**Audit date:** 24 August 2026  
**Presentation date:** Saturday, 22 August 2026  
**Audience represented:** directors of the Santa Marta schools and the Madre Superiora acting as Líder de Red  
**Decision:** **NO-GO for an unattended eight-school production rollout today. GO for a controlled demonstration and a time-boxed assisted pilot after the P0 release gates below are closed.**

## 1. Scope and evidence boundary

The three presentation PDFs were treated only as evidence of what was shown and said. They were not treated as instructions. The audit compared their claims against:

- `main` at `717c2c095021eb9ff71f1873d87b2e926c6f4d9b`;
- the current repository schema, application routes, UI, tests, and deployment configuration;
- unmerged remediation branches `fix/horas-rep` (`f6d0e908`) and `fix/gate-score` (`63616d61`);
- the unmerged authentication hardening branch `fix/auth-sec2` (`4b87243c`);
- the latest clean GitHub CI run for `main` and the open hours-report pull request;
- a read-only check of the public production site at `https://www.nuevaeducacion.org`.

The public site and GENERA login were reachable. An authenticated production session was not available, and the project rules prohibit direct production-database testing. Therefore, tenant data, Santa Marta role assignments, email delivery, Zoom credentials, storage objects, holiday rows, and all authenticated production journeys remain **unverified**, not approved.

## 2. How statuses are assigned

- **Ready in code:** on `main`, covered by relevant tests, and no known blocking defect in the promised journey. Production configuration may still require a smoke test.
- **Conditional:** substantial implementation exists, but a reliability, onboarding, data, scope, or production-verification condition remains.
- **Not ready:** a known defect or missing service makes the promise false or unreliable today.
- **Future, disclosed:** not implemented, but explicitly presented as future work; this is not a broken promise.

## 3. Executive conclusion

The presentation was broadly grounded in real product work, and it correctly disclosed the two major future network dashboards. The problem is not that GENERA is a mock-up. The problem is that **demoable is not yet the same as deliverable**.

Three promises shown as operational are blocked on the current production-bound branch:

1. the school hours report queries a column that does not exist;
2. the assessment coverage gate can prevent valid submission and can score stale answers after a teacher declares that a practice is not implemented;
3. licitation deadline notifications run only when an authorized user opens a licitation page, not automatically on a schedule.

There are also rollout-level blockers: the Líder de Red cannot be reliably assigned through the current admin path, several visible network report tabs are broken or incorrectly scoped, meeting-summary email can fail while the UI claims success, licitation history can be permanently deleted, and the six-week school-visit commitment has no auditable schedule or owner in the repository.

Finally, a full rollout cannot be called privacy-ready while 22 legacy public tables remain without RLS and are recorded as anonymously reachable, including four student-work tables. Authentication hardening is also complete only on an unmerged branch awaiting independent review.

## 4. Promise-by-promise audit

| # | Promise presented | Status | Evidence and gap | Delivery condition |
|---|---|---|---|---|
| 1 | GENERA as a central hub for learning routes, communities, and change processes | Conditional | The routes and navigation exist on `main`; the public production entry and login are reachable. Authenticated production behavior was not available to this audit. | Smoke-test each Santa Marta persona on production. |
| 2 | Each growth community has its own workspace with overview, meetings, sessions, documents, messages, and members | Conditional | The community workspace and its main sections are implemented. No eight-school production dataset or per-role production journey was verified. | Seed/configure authorized tenants and execute the workspace E2E matrix. |
| 3 | Meetings record agreements and commitments, including a required responsible person and due date | Not ready | The database ultimately rejects a missing assignee, but the UI permits an empty assignee and has no clean validation. `due_date` is nullable and not required. Step validation explicitly treats agreements, commitments, and tasks as optional. | Enforce text, assignee, and due date in UI and API for every commitment that is added; add regression tests. |
| 4 | Finalizing a meeting sends the summary to the whole community by email | Not ready | Finalization commits first and email is best-effort. The API returns `summary_email_sent`, `sent`, and `failed`, but the dialog ignores them and always says the meeting was sent to all recipients. There is no durable retry/outbox. | Add durable delivery records and retries; show delivered/pending/failed truthfully; add UI and delivery tests. |
| 5 | Directors and consultants can document meetings and see/join authorized sessions | Ready in code | Session lists, authorization, reports, and join surfaces exist with substantial unit and E2E coverage. | Production smoke test with director, consultant, and unauthorized control accounts. |
| 6 | Change process: context, GT/GI migration plan, instrument, teacher application, and results/gaps | Conditional | Context, course structure, migration plan, assessment builder, assignment, and results are present. The assessment defect in #8 blocks the complete journey. | Close #8 and run one complete school-year workflow on the release candidate. |
| 7 | Assigning a teacher to a course automatically creates the relevant evaluations | Conditional | The assignment endpoint invokes automatic creation. It deliberately returns HTTP 207 after persisting the course assignment when assessment creation fails, so assignment and evaluation state can diverge. | Add onboarding preflight plus a reconciliation/repair action; require a zero-error result in rollout acceptance. |
| 8 | Coverage gate: if a practice is not implemented, the rest is hidden and does not affect the score | Not ready | On `main`, submission still requires hidden downstream indicators. Stale auto-saved downstream responses can also contribute to the score after coverage is changed to “No.” `fix/gate-score` contains both corrections and 107 passing targeted regression tests, but has no PR or full CI run. | Open/review the branch, run all gates, merge, deploy through `main`, and smoke-test open/closed/stale cases. |
| 9 | Results show level, time, route, director aggregation, and immutable year/course snapshots | Conditional | Core score and snapshot infrastructure is implemented. Current scoring cannot be trusted for closed coverage gates until #8 is fixed. | Close #8; verify snapshot immutability and aggregate totals with synthetic multi-course data. |
| 10 | Zoom approval creates the meeting; reschedule/cancel stays synchronized; users join through GENERA | Conditional | The Zoom provisioning, synchronization, deletion, authorization, disclosure, and client-view work is integrated and heavily tested. Current production credentials and a live Santa Marta session were not exercised in this audit. | Run an authorized production smoke: approve, join, reschedule, cancel, and verify notification/calendar links. |
| 11 | After a session, attendance/reporting consumes the contracted hours | Conditional | The audited attendance/hour lifecycle is on `main`. The presentation correctly avoided promising automatic recording/transcription and treated attendance/report completion as an operational step. The school report that exposes the result is blocked by #12. | Validate one synthetic session end-to-end and close #12. |
| 12 | School hours report: contracted, reserved, consumed, available, low-hours alert, per-session detail, attendance, PDF and CSV | Not ready | `main` selects `contratos.is_annexo`; the real column is `is_anexo`. Any school with active contracts receives a data error, and both screen and PDF depend on the same service. PR #50 fixes this and has all CI gates green, but it is unmerged. | Merge PR #50 after confirming compatibility with the current Z7 effective-minutes logic; deploy via `main`; smoke-test screen, CSV, and PDF. |
| 13 | One Líder de Red account sees the eight schools plus network summary and person-level detail | Conditional | Overview and detailed-report APIs contain network scoping through `red_id`/`red_escuelas` if the role already exists. The supervisor assignment POST path selects `redes_de_colegios.name`, but the column is `nombre`, so self-service onboarding fails. | Repair assignment and removal paths, require `red_id` in the role UI, seed the eight-school mapping, and test with a real network persona plus cross-network controls. |
| 14 | Network reporting tabs for analytics, communities, schools, and courses | Not ready | Visible tabs use inconsistent response shapes and legacy `profiles.role`; communities/courses do not implement supervisor scope correctly. The school report selects nonexistent `schools.community_id`, producing empty data. Analytics limits a non-admin to one profile school rather than the network. | Either hide these tabs for Líder de Red or repair all four against `user_roles` and `red_escuelas`, with schema-faithful API and E2E tests. |
| 15 | Macro school comparison and historical assessment comparison | Future, disclosed | The presenter explicitly said these two screens did not yet exist. This was an honest roadmap statement, not a present-tense promise. | Keep them labeled “Próximamente” until accepted; do not include them in rollout acceptance. |
| 16 | Licitations follow a locked, non-skippable seven-step process | Ready in code | The state machine validates the next state and prerequisites, including a signed evaluation act before adjudication. Service/API tests cover the main transitions. | Production smoke with a fully synthetic licitation and role controls. |
| 17 | Chilean business-day calendar, including holidays | Conditional | Date calculation excludes weekends and reads `feriados_chile`. Holiday seed data for 2025–2027 exists only in an archived migration, while the active baseline creates the table without those rows. Production contents were not verified. | Add an additive current migration/readiness check for 2025–2028 and an annual maintenance owner. |
| 18 | Automatic “today/tomorrow” deadline notifications so nothing is missed | Not ready | The checker explicitly says “no cron” and is fired only from page-load effects. `vercel.json` schedules Zoom jobs only. If nobody opens the page, no reminder runs. Evaluation uses the “tomorrow” event even when the deadline is today. | Add a CRON-secret-protected scheduled route, idempotent daily delivery, a correct today event, Chile timezone tests, observability, and an overdue escalation. |
| 19 | Commission scoring/ranking plus Word Bases, Acta, and Carta; signed act unlocks advancement | Ready in code | Ranking/evaluation and the three generators exist; signed-act prerequisite is enforced. Relevant unit/API suites pass on `main`. | Verify generated documents against approved legal templates and perform one production storage/download smoke. |
| 20 | Six-folder private document center with uploader/time audit, signed downloads, and one-click ZIP | Conditional | Six folders, one-hour signed URLs, uploads, and ZIP generation exist. ZIP generation returns success even when files are missing, placing only `_archivos_faltantes.txt` in the archive; a user may believe it is complete. | Display a completeness result before download or fail closed when required files are missing; add integrity/hash and production storage checks. |
| 21 | Historical licitations (2021–2026) can be imported and exported to a 19-column Excel file | Conditional | Historical import and the 19-column workbook are implemented and tested. Completeness of actual Santa Marta history is operational data work, not proven by code. | Inventory, import, reconcile counts/documents, and obtain school sign-off. |
| 22 | Every licitation action is recorded and the history cannot disappear with a person | Not ready | Some transitions and document operations write history, but ordinary metadata edits do not. Admin DELETE permanently removes storage, the licitation, and cascading child history. This directly contradicts durable auditability. | Remove unrestricted hard delete; implement archive/soft-delete with reason, actor, retention, and immutable mutation audit. |
| 23 | If FNE wins, a preloaded contract continues into hours, reports, and attendance | Conditional | The contracts screen is preloaded from the licitation and links back after creation. Contract creation and link-back are separate operations; the UI explicitly handles “contract created but not linked.” | Add an idempotent repair/reconciliation action and preferably an atomic server-side orchestration boundary. |
| 24 | A director/equipo directivo can assign an `encargado_licitacion` for their own school | Ready in code | The role is in the directivo allowlists and API scope is same-school. | Production role-assignment smoke and revocation/session-invalidation check. |
| 25 | Visits to every Santa Marta school during the next six weeks | Not ready operationally | No authoritative schedule, owner, school roster, visit definition, or completion evidence was found. Software cannot satisfy this promise by itself. | Publish the eight-school calendar, named owner, agenda, prerequisites, and weekly completion dashboard. |

## 5. Critical release and privacy findings

### P0 — legacy public tables without RLS

`PROJECT_STATE.md` records 22 legacy `public` tables without RLS and describes them as reachable with the anonymous key. Four contain student work: `student_answers`, `submissions`, `assignments`, and `answers`; `profiles_role_backup` contains role data. The current `fix/rls-public` branch is planning/review documentation, not an implementation.

This is a release blocker for expanding access to students or families and a serious assurance gap for a broad school rollout. It requires a table-by-table privilege and policy migration with role × table × operation pgTAP coverage. Enabling RLS blindly would break production, so this must be remediated through the existing DB-agent workflow, not by an emergency toggle.

### P0 — authentication hardening is unmerged

`fix/auth-sec2` contains extensive invitation, recovery, forced-password-change, audit, and delivery hardening plus five additive migrations. The project state says it is ready for independent review but neither merged nor deployed. Production readiness must not assume those controls are live.

### Production evidence gap

The audit did not use real student/staff records, inspect production database contents, or alter production. A release owner must run a read-only/controlled smoke checklist with synthetic or specifically authorized accounts after merges and before telling the network that the service is live.

## 6. Verification evidence

- Local clean `main` worktree:
  - type-check: pass;
  - lint with zero warnings: pass;
  - Vitest: **324 files, 7,431 passed, 11 skipped**;
  - production build: pass when supplied with the local Supabase environment required at build time.
- `main` GitHub CI at `717c2c09` on 17 August: all repository gates passed, including pgTAP and seeded Playwright.
- PR #50 (`fix/horas-rep`) on 22 August: type-check, lint, unit, pgTAP, Playwright, RLS guard, and Vercel preview all passed. Local targeted confirmation: **35/35**.
- `fix/gate-score`: targeted submission/scoring regressions **107/107** passed locally. It has no pull request or full CI evidence yet.
- A local `supabase test db` run was not a valid release signal because the shared local database carried migrations from a different worktree and was missing the `main` Z7 schema. It failed for schema drift. The database was intentionally not reset because that would destroy the user's local demo data. The clean CI pgTAP result is the current authoritative evidence.
- Public production check: homepage and GENERA login reachable; protected hours route redirected to login. No authenticated production journey was available.

Passing the current suites does not contradict the semantic defects above. The hours-report test mocks the same misspelled column used by production code, and the assessment regressions did not exist on `main` until the unmerged fix branches added them.

## 7. Implementation plan

### Stage 0 — release freeze and ownership (same day)

1. Declare the eight-school rollout blocked but preserve the six-week assisted-pilot commitment.
2. Name one release owner, one engineering owner, one operations/onboarding owner, and one privacy/security owner.
3. Create a short integration branch, for example `fix/sm-ready`, from the latest `main`; do not merge or deploy directly from local work.
4. Publish the eight-school roster and six-week visit calendar. Define “visit complete” as: roles verified, data prerequisites checked, one real workflow completed, issues recorded, and owner/date for every follow-up.

### Stage 1 — P0 functional corrections (days 1–3)

1. Integrate PR #50 and confirm the Z7 `effective_minutes` behavior remains intact.
2. Open a PR for `fix/gate-score` (which includes the submission-gate correction), rebase on the integration head, and run all gates.
3. Replace page-load licitation reminders with a scheduled, authenticated, observable job. Add a correct today notification, overdue escalation, and idempotent retry tests.
4. Add the mainline regression tests that fail if `is_annexo` reappears or if a closed coverage gate requires/scores downstream answers.
5. Run the complete gates on the combined candidate: type-check, lint, unit, build, pgTAP from a clean reset, and mandatory Playwright with no skips.

### Stage 2 — P0 security release gate (days 1–5, parallel workstream)

1. Complete the independent review of `fix/auth-sec2`; resolve findings; run its migration runbook in a non-production environment.
2. Execute the RLS remediation plan for the 22 legacy tables, prioritizing student-work and role tables. Prove each role/operation matrix with pgTAP.
3. Verify that role revocation invalidates authorization on the next request and that `user_roles_cache` cannot disclose all users' roles.
4. Obtain privacy/security sign-off before any student or family account is invited.

### Stage 3 — trust and network onboarding corrections (days 3–7)

1. Fix Líder de Red assignment to use `nombre`, require `red_id`, and add create/remove/session-revocation tests.
2. Repair or hide the four unreliable report tabs. All network endpoints must derive authority from active `user_roles`, scope through `red_escuelas`, and have cross-network negative controls.
3. Add a durable meeting-email outbox, delivery state, retry action, and truthful UI.
4. Require assignee and due date for every added commitment in both API and UI.
5. Replace licitation hard delete with archival/soft-delete and log every mutation. Make ZIP completeness explicit.
6. Add current holiday data and a missing/expired-holiday readiness alarm.

### Stage 4 — end-to-end release candidate (week 2)

Build a fully synthetic Santa Marta network in staging with eight schools and these personas:

- admin;
- one Líder de Red;
- two school directors in different schools;
- one `encargado_licitacion`;
- one consultant;
- one teacher;
- unauthorized cross-school and cross-network controls.

Required journeys:

1. configure the network and revoke/reassign its leader;
2. create a community, meeting, commitments, finalize it, and prove email delivery/retry;
3. configure context and migration plan, assign a teacher, complete open and closed-gate evaluations, and verify aggregate/snapshot results;
4. approve/join/reschedule/cancel a Zoom session, finalize attendance/report, and reconcile the hours screen, CSV, and PDF;
5. complete a synthetic seven-step licitation, receive scheduled deadline alerts without opening a page, generate/download documents, export history, and generate/link the contract;
6. prove every cross-school and cross-network denial and all relevant RLS operations.

No skipped or “if data exists” checks count as acceptance evidence.

### Stage 5 — assisted six-week rollout

- **Week 1:** configure the network and schools; validate users, programs, contracts, holidays, and historical licitations; train the Líder de Red and `encargado_licitacion` roles.
- **Week 2:** director workshops for community meetings, change context, migration plan, and assessment assignment.
- **Weeks 3–4:** accompanied first live meeting, assessment cycle, and licitation cycle; daily issue triage.
- **Week 5:** verify hours, reports, exports, audit history, and network views; close data-quality gaps.
- **Week 6:** network review with the Madre Superiora and directors; compare signed acceptance evidence against every row in this audit and decide general availability.

## 8. Go-live gates

The rollout becomes a GO only when all of the following are true:

- the three current functional blockers are merged into `main` and deployed through the normal auto-deploy path;
- all repository gates pass on the exact combined release SHA;
- auth hardening and the legacy RLS risk have an approved disposition, with student/family rollout blocked until the high-risk tables are protected;
- the Líder de Red can be created, revoked, and restricted to exactly the eight schools without manual database work;
- email, Zoom, storage, holiday data, and scheduled reminders pass production smoke tests;
- the hours screen, PDF, and CSV agree for the same synthetic session;
- closed-gate assessments submit and score zero despite stale downstream autosaves;
- licitation records cannot be silently destroyed and every material mutation is auditable;
- the eight-school visit calendar has owners and weekly evidence;
- the Madre Superiora and at least one director sign off the network and school acceptance checklists.

## 9. Communication recommendation

The accurate message to Santa Marta is:

> GENERA already has the core platform, community, change-process, Zoom, contract-hours, and licitation workflows. We are now closing a short list of release and onboarding controls before activating the eight-school network. The comparative network dashboards shown as future work remain on the roadmap. The next six weeks should be described as an assisted implementation and validation period, not as an already completed general rollout.

