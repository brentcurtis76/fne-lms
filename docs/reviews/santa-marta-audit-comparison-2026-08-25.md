# Comparison and corrected delivery plan — Santa Marta

> **Historical audit artifact.** Its operational counts and scheduling are superseded by the
> normalized claim/work ledgers and the active release protocol; its original findings remain
> provenance.

**Date:** 25 August 2026

**Compared:**

- Codex: `santa-marta-deliverability-audit-2026-08-24.md`
- Claude: `santa-marta-promise-audit-2026-08-24.md`
- Code baseline used by both: `main` at `717c2c095021eb9ff71f1873d87b2e926c6f4d9b`

## Executive verdict

Claude's audit is the stronger **defect-discovery document**. My audit is the stronger **release-decision document**. Neither plan should be executed unchanged.

Claude found several central first-use failures that my 25-row promise matrix either missed or classified too optimistically. In particular, my original report was wrong to call the director/consultant session journey "Ready in code," and it materially overstated readiness of meeting documentation, attendance/hour closure, and immutable assessment snapshots.

My report adds release controls and integrity risks that Claude did not cover: destructive deletion of licitation history, non-atomic licitation-to-contract linking, partial teacher-assignment/evaluation creation, exact persona and cross-tenant acceptance tests, the missing six-week visit schedule, and a stronger GO/NO-GO framework.

The best plan is therefore:

1. use Claude's granular findings as the defect backlog;
2. use Codex's evidence boundaries, rollout tiers, production gates, and acceptance matrix as the release framework;
3. correct the factual and sequencing problems in both reports;
4. do not promise a two-week launch date until the critical-path fixes have passed a combined release candidate.

The current decision remains **NO-GO for opening all eight schools**. A controlled demonstration remains acceptable. An assisted staff-only pilot can begin only after the first-school gate in this document; student/family rollout remains blocked until the legacy RLS exposure and authentication integration are resolved.

## 1. Where the Codex plan is better

### 1.1 It distinguishes code readiness from production evidence

The Codex report explicitly separates:

- present on `main`;
- covered by tests;
- dependent on production configuration;
- actually smoke-tested in production.

That is important here because neither audit had an authenticated production session. Zoom credentials, Resend delivery, storage buckets, holiday rows, network membership, and Santa Marta role assignments remain unverified. Claude records this limitation too, but its plan sometimes turns an unverified configuration into a dated implementation commitment.

### 1.2 It provides a release decision, not only a repair backlog

The Codex plan includes:

- a clear NO-GO/conditional-pilot decision;
- named release, engineering, operations, and privacy owners;
- an exact combined-SHA gate;
- full repository gates;
- a synthetic eight-school network;
- a persona matrix;
- cross-school and cross-network negative controls;
- a production smoke checklist;
- explicit acceptance and sign-off.

Claude's branches and line-level fixes are more actionable for engineering, but its exit criteria are thinner and sometimes inconsistent with its own P0 classification.

### 1.3 It catches integrity and operational gaps Claude omitted

These Codex findings remain valid and should be added to the canonical backlog:

| Gap                                                                                          | Why it matters                                                      |
| -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Licitation admin DELETE hard-deletes storage, the licitation, and cascading history          | Directly contradicts the promise that the history cannot disappear. |
| Ordinary licitation metadata edits are not written to `licitacion_historial`                 | "Every action is recorded" is not true.                             |
| Contract creation and licitation link-back are separate operations                           | The UI already admits the contract can be created but not linked.   |
| Teacher-course assignment can commit and then return HTTP 207 when evaluation creation fails | The core onboarding state can diverge.                              |
| The ZIP can return HTTP 200 while omitting files                                             | A successful download does not prove completeness.                  |
| The six-week visit promise has no authoritative schedule, owner, or completion definition    | Software work alone cannot deliver the operational promise.         |
| Role revocation/cache behavior needs an acceptance control                                   | Creating the Líder de Red is only half the access-control journey.  |

### 1.4 It prioritizes security more coherently

Codex treats the 22 legacy public tables and unmerged authentication hardening as release gates. Claude calls the RLS exposure P0 but splits the referenced tables into weeks 4–6, after the first accounts would be opened. That is internally inconsistent.

The correct distinction is by rollout tier:

- **Before any broader production pilot:** verify actual production grants and contain any anonymous write/read exposure to high-risk tables.
- **Before any student/family invitations:** complete all 22 table dispositions with role × table × operation tests.
- **Before general availability:** integrate and independently review authentication hardening on top of current `main`.

## 2. What the Codex audit missed

Claude found material defects that the Codex audit did not report:

### 2.1 Community meeting persistence is broken more broadly than validation

Codex found missing responsible-person/deadline validation and false email success. It missed that:

- `meeting_agreements` has no INSERT or SELECT policy;
- `meeting_tasks` also lacks the required INSERT/SELECT policies;
- create-path child-write errors are logged and discarded;
- edit-path insert/update/delete errors are also discarded;
- the parent meeting can report success while agreements, commitments, tasks, or attendees did not persist.

This changes the workspace/meeting promise from **Conditional** to **Not ready**.

### 2.2 Community workspace first-use defects

Codex missed that:

- ordinary community members cannot rename the workspace despite the UI saying they can;
- the failure can surface as an English database error;
- the `community-images` storage bucket is not created by a migration and is unverified in production;
- feed author names can be blank because browser-side profile joins are filtered by profile RLS.

### 2.3 The session journey is not ready

Codex classified director/consultant session access as "Ready in code." That was wrong.

On `main`:

- the workspace session card routes everyone to `/consultor/sessions/[id]`;
- that page permits only `consultor`, `admin`, and `lider_comunidad`, so an `equipo_directivo` user is redirected;
- `session_attendees` is not populated when a session is created or approved; the existing trigger only reacts to later `user_roles` changes;
- there is no normal user-facing transition from `programada`/`en_progreso` to `pendiente_informe`;
- finalization therefore cannot normally consume the reserved hours;
- the hours report's attendance field is hard-coded to `null`.

This changes both the session-access and attendance/hour-lifecycle promises to **Not ready**.

### 2.4 Assessment snapshots are mutable

Codex said snapshot infrastructure existed and requested verification. Claude found that published-template edits call `updatePublishedTemplateSnapshot()` and overwrite the snapshot used by already assigned/applied evaluations. The presentation's "sealed photo" promise is therefore false on `main`.

This changes immutable snapshots from **Conditional** to **Not ready**.

### 2.5 School transformation and results defects

Codex missed:

- transformation percentages are calculated over all 16 Chilean grades rather than the levels offered by the school;
- the director's results dashboard is hidden inside an `adminOnly` sidebar group;
- the "courses meeting expectation" denominator includes unevaluated courses as failures;
- an indicator summary card is structurally N/N even when gap analysis below it disagrees;
- the course label needed to distinguish same-grade courses is not available/rendered.

### 2.6 Network learning analytics are incomplete, not merely mis-scoped

Claude correctly found that the network tabs use removed `profiles.role` fields and that the school tab selects nonexistent `schools.community_id`. Codex missed a second class of failure:

- the learning-path summary views used by the network card are created only by the local Santa Marta seeder, not by an active migration;
- no normal application path updates `course_enrollments.total_time_spent_seconds`, so the displayed total-time metric has no durable writer.

### 2.7 Additional six-week failures

Claude also adds legitimate backlog items that Codex did not cover:

- notification email dispatch is incomplete and several reminders are not scheduled;
- session in-app notifications can point non-consultants to a route that rejects them;
- the promised 25 MB upload exceeds the practical serverless request path;
- historical licitations lack the same bulk-download experience;
- duplicate filenames can collide in ZIPs;
- licitation detail queries a nonexistent `schools.code` field;
- pending autosaves can be lost on fast navigation/tab close;
- generated random onboarding passwords fail the password rule;
- the `programas` dependency has no administration surface or active seed migration;
- observability and Spanish error surfaces need runtime verification and hardening.

## 3. What the Codex audit got wrong

These are not merely omissions; they change the original readiness verdict.

| Original Codex statement                                                  | Corrected conclusion                                                                                                                                                               |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Director/consultant session journey is "Ready in code"                    | **Wrong.** Director navigation rejects `equipo_directivo`; attendees are not seeded; normal closure is unreachable.                                                                |
| Attendance/hour lifecycle is on `main` and only the report blocks it      | **Overstated.** Components exist, but the normal lifecycle cannot reach `pendiente_informe`, and attendance may be empty.                                                          |
| Snapshot infrastructure is present; verify immutability                   | **Misclassified.** The snapshot is deliberately overwritten after publication.                                                                                                     |
| Due date is simply nullable                                               | **Incomplete behavior model.** Direct SQL can accept `NULL`, but the UI sends `''`; the date insert fails and the error is swallowed, so all rows in that batch may disappear.     |
| Three current functional blockers                                         | **Substantial understatement.** The hours typo, assessment gate, and reminder cron are only three of several first-contact blockers.                                               |
| Authentication hardening can be handled as a days-1–5 review/merge stream | **Unsafe assumption.** `fix/auth-sec2` is not based on current `main`; it predates Z7 and needs a deliberate rebase/integration and full regression review.                        |
| Two-week release-candidate stage                                          | **Too optimistic without staffing assumptions.** It is possible only with several parallel workstreams and immediate review capacity; it should be gate-driven, not date-promised. |

The Codex audit's overall NO-GO verdict remains correct. Its promise-level status counts do not.

## 4. Where Claude's plan is better

### 4.1 Much better granularity

Claude decomposes the presentation into concrete user actions and identifies the exact point of failure. That catches semantic defects that route-existence and unit-test checks do not catch.

The strongest examples are:

- agreements appearing to save while RLS rejects them;
- child-write errors being swallowed;
- a director being routed to a consultant-only page;
- session attendees never being created;
- a session never reaching the state required for hour consumption;
- a published assessment snapshot being overwritten;
- transformation percentages using grades the school does not offer;
- network learning time depending on seeder-only views.

### 4.2 Better root-cause grouping

Claude often consolidates multiple visible failures around one root cause. For example, missing attendee creation explains the empty attendance table, inability to mark attendance, and missing participant join eligibility. That is a better implementation unit than fixing each screen separately.

### 4.3 Better engineering specificity

Claude names short branches, relevant files, likely fixes, and relative effort. That makes the report more useful for ticket creation than Codex's higher-level stages.

### 4.4 Better self-correction

Claude records seven refuted findings and admits that 10 of 40 checked line citations were imprecise. That is good audit behavior: the document shows that findings were challenged rather than merely accumulated.

## 5. What Claude missed or got wrong

### 5.1 The numerical summary is not reconcilable

Claude reports 160 verified promises, but its displayed categories add to 105:

- 27 sustained;
- 27 P0;
- 43 P1;
- 6 P2;
- 2 future.

It also mixes **promises** and **defects** in the same count. Without a canonical 160-row ledger, the figures cannot support completeness or a readiness percentage. Codex's 25 rows are too coarse; Claude's 160 is not auditable from the report. The combined process needs one ledger with unique IDs and exactly one current status per sub-promise.

### 5.2 The first-school sequence contradicts the P0 findings

Claude says the remaining work is about two weeks and labels only Wave 0 as "before the first school," but Wave 1 still contains the central meeting and session blockers and Wave 2 contains snapshot integrity, correct numbers, and the network tabs. Opening a school after Wave 0 would expose defects Claude itself classifies as P0.

### 5.3 RLS priority is internally inconsistent

Claude correctly calls the 22 legacy tables a blocker, but its plan fixes only a subset before first access and defers eight referenced tables until weeks 4–6. At minimum the production privilege audit and high-risk containment must happen before a broader pilot; all 22 dispositions must close before student/family access.

### 5.4 The proposed consultant/session fix is incomplete and potentially overbroad

Adding an unconditional consultant bypass to community middleware could grant every consultant every workspace. The fix must scope access through active school/community assignments.

Populating `session_attendees` also does not fix the director redirect by itself. The detail page still rejects `equipo_directivo`. The implementation needs either:

- a role-neutral session detail route backed by the canonical session policy; or
- explicit `equipo_directivo` support in the current page, with school/community scope and negative tests.

The status transition to `pendiente_informe` also needs a deliberate state-machine design and audit event; merely relaxing finalization preconditions should not bypass lifecycle controls silently.

### 5.5 The suggested network-tab fix is insufficient

Replacing `profiles.role` with `user_roles.role_type` fixes the immediate schema error, but does not implement network authority. `community.ts` and `course-analytics.ts` only calculate reportable data for admin/consultor paths; a `supervisor_de_red` would still receive empty or incorrectly scoped results.

Every network endpoint must:

1. resolve an active `supervisor_de_red` role;
2. require a non-null `red_id`;
3. derive allowed schools from `red_escuelas`;
4. scope communities, users, courses, and aggregates through those schools;
5. prove cross-network denial.

### 5.6 One RLS schema statement is self-contradictory and wrong

Claude says neither `learning_paths` nor `learning_path_courses` has `school_id`, then proposes joining to `learning_paths.school_id`. In the baseline, `learning_paths.school_id` does exist and is nullable; only `learning_path_courses` lacks it. The nullable/orphan-policy warning is valid, but the stated schema fact is not.

### 5.7 Production write exposure is stated more strongly than the recorded evidence

The project state confirms 22 production tables without RLS and records anonymous REST readability. The older state note says actual grants had not yet been checked; the baseline grants are not proof of current production privileges when schema drift is already known. Claude's statement that all 22 are writable in production should be treated as a high-confidence risk requiring an immediate read-only privilege check, not as fully established production evidence. The privacy blocker remains either way.

### 5.8 The community rename fix should not be a broad table UPDATE policy

A general member UPDATE policy on `community_workspaces` controls rows, not columns. It could permit changes beyond name/image. A narrow server endpoint with an allowlisted payload and membership/scope check is safer.

### 5.9 The timeline is not credible as a commitment

"Approximately two weeks" does not include:

- the large authentication rebase/integration;
- independent reviews;
- RLS migration design and pgTAP matrices;
- clean database resets;
- staging data construction;
- production configuration checks;
- eight-school onboarding and historical-data reconciliation.

Two weeks can be an internal target for a first staff-only candidate with multiple parallel owners. It should not be communicated as a delivery promise.

### 5.10 Claude omits several trust failures

Claude does not include the following in its plan:

- licitation hard delete and cascading loss of history;
- unaudited metadata edits;
- non-atomic contract creation/linking;
- teacher-assignment/evaluation divergence;
- the absent six-week visit calendar and owner;
- explicit revocation/session-invalidation acceptance;
- an exact combined-SHA persona matrix and cross-tenant release gate.

## 6. Shared misses in both original plans

### 6.1 `fix/auth-sec2` is based before Z7

Both plans failed to inspect the branch ancestry before scheduling authentication hardening.

Current evidence:

```text
merge-base(main, fix/auth-sec2) = 4399949942bf...
main is ancestor of fix/auth-sec2 = no
main-only commit = 717c2c09 (Z7 attendance and audited-hour overrides)
diff fix/auth-sec2..main = 283 files, +38,776 / -26,923
```

This does **not** mean urgent work must wait for an authentication decision. It means:

- every new Santa Marta fix must branch from current `main`;
- the dirty `fix/auth-sec2` worktree must not be used as the source for hours/session code;
- authentication hardening needs its own rebase/integration branch, conflict review, migration rehearsal, and full gates;
- PR #50 itself is already based on current `main` and retains Z7 `effective_minutes`; the risk is the stale auth worktree/local hours edit, not the PR.

### 6.2 Neither plan establishes one canonical promise ledger

The two reports use incompatible units: 25 thematic promises versus 160 claimed sub-promises. The implementation program needs a single ledger containing:

- promise/sub-promise ID;
- exact presentation source;
- current code status;
- defect IDs;
- rollout tier affected;
- owner;
- target branch/PR;
- automated evidence;
- production evidence;
- acceptance signer.

### 6.3 Neither plan includes a rollback/canary protocol

Because `main` auto-deploys, every merge changes production. Each wave needs:

- an exact order of merges;
- feature/account gating where possible;
- a pre-merge rollback decision;
- post-deploy read-only schema verification;
- a synthetic smoke test;
- an incident owner and stop condition.

## 7. Corrected combined plan

The plan is organized by **release gate**, with parallel engineering tracks inside each gate. Dates are forecasts, not promises. All new branches start from current `main` and remain at most 20 characters.

### Gate 0 — Control the release and evidence (same day)

1. Keep the eight-school rollout closed; allow controlled demos only.
2. Name owners for release, engineering, onboarding/data, privacy/security, and school-visit operations.
3. Publish the eight-school roster and six-week visit calendar. Visits may begin immediately as discovery, data-readiness, and training sessions; they must not be represented as successful platform activation before the relevant gate passes. Define a completed visit: prerequisites verified, the gate-appropriate journey completed, findings logged, and owners/dates assigned to follow-ups.
4. Create the canonical promise ledger. Reconcile Claude's 160 count rather than copying it.
5. Require all new fix branches to start from `main`, not from `fix/auth-sec2` or the dirty worktree.
6. Perform authorized read-only checks of production schema/configuration:
   - privileges/RLS exposure for all 22 legacy tables;
   - Santa Marta network plus eight `red_escuelas` rows;
   - 2026–2028 holidays;
   - Resend sender-domain verification;
   - `community-images` and licitation storage buckets;
   - required cron secrets and Zoom configuration.

**Exit:** owners and visit calendar published; promise ledger exists; production unknowns have an evidence result; no branch is based on stale auth code.

### Gate 1 — Immediate known hotfixes (target 2–3 working days)

Parallel work:

1. Merge PR #50 `fix/horas-rep` through the normal reviewed path.
2. Open/review `fix/gate-score`; run the full CI suite on its exact head.
3. Fix Líder de Red assignment/removal:
   - `name` → `nombre`;
   - check lookup errors fail-closed;
   - remove nonexistent `updated_at` writes;
   - require `red_id`;
   - refresh/revoke role cache safely;
   - test create, duplicate, move, remove, and cross-network denial.
4. Correct meeting email provider-result handling and UI truth; verify the sender domain and a real synthetic receipt. Do not yet claim durable delivery.
5. Contain any confirmed anonymous access to the highest-risk legacy tables immediately, through additive migrations and the DB-agent flow.

**Exit:** exact combined candidate passes type-check, lint, unit, build, pgTAP on a clean reset, mandatory Playwright with no skips, and migration guard. Hours/gate/network-role synthetic smoke passes.

### Gate 2 — First-school staff journey (forecast 1–2 weeks with parallel owners)

#### Track A — Community and meetings

- Add correctly scoped INSERT/SELECT policies for agreements and tasks.
- Propagate every create/edit/delete error; never report parent success after a child failure.
- Enforce commitment text, responsible person, and due date in UI, server boundary, and database.
- Implement a narrow workspace-name/image endpoint; do not grant broad member UPDATE.
- Serve feed author data through an authorized server endpoint.
- Verify the community image bucket and signed-object access.

#### Track B — Sessions and hours

- Replace the consultant-only detail route for participant viewing, or make it role-neutral under the canonical session policy.
- Scope consultants by active school/community assignments; no global middleware bypass.
- Populate and reconcile `session_attendees` when sessions are created/approved and when membership changes.
- Design the explicit end-of-session transition to `pendiente_informe`; audit it and enforce Chile time.
- Finalize report + attendance + hour consumption atomically enough to prevent a half-completed lifecycle.
- Populate attendance in screen, PDF, and CSV and reconcile all three.

#### Track C — Assessments and school results

- Make published snapshots immutable; edits create a new version.
- Fix director navigation to the results dashboard.
- Filter migration-plan grades by the school's configured levels.
- Reconcile teacher assignment/evaluation creation after HTTP 207 partial outcomes.
- Correct evaluated-course denominators, indicator cards, and course labels.

#### Track D — Network reports and learning time

- Replace legacy role lookup with active `user_roles`.
- Scope every network query through `red_id` → `red_escuelas`.
- remove nonexistent `schools.community_id` usage.
- move server routes off the browser anon client.
- add active migrations for required learning-summary views with safe privileges.
- implement the durable writer/aggregation source for learning time.
- hide any tab that is not ready; a visible broken tab is not an acceptable placeholder.

**Exit:** one synthetic school completes community creation/rename/feed, meeting save/reopen/finalize/email, assessment open/closed gate, session join/attendance/report/hour closure, and director results navigation. Cross-school negatives pass.

### Gate 3 — Licitation and operational trust (forecast week 2–3)

1. Add a scheduled, authenticated, idempotent licitation deadline job with today/tomorrow/overdue semantics, Chile timezone tests, and observability.
2. Add current holiday data plus annual expiry/readiness alarm.
3. Remove hard delete; add archive/soft-delete with reason, actor, retention, and immutable history.
4. Audit all material metadata changes.
5. Make ZIP success mean complete success; report omissions before download and resolve filename collisions.
6. Provide equivalent bulk download for imported historical licitations.
7. Replace the direct 25 MB request path with a storage-native signed upload or another architecture proven on Vercel.
8. Fix the nonexistent `schools.code` selection.
9. Make contract creation/link-back one idempotent orchestration, or provide a reliable reconciliation queue/action.
10. Add an administration/approved-seed path for `programas`.

**Exit:** a synthetic seven-step licitation completes without opening a page to trigger reminders; documents and history are complete; deletion cannot erase the record; contract link reconciliation is proven.

### Gate 4 — Security, authentication, and reliability (parallel; blocks broader rollout)

1. Complete table-by-table dispositions for all 22 legacy no-RLS tables with privilege cleanup and pgTAP matrices.
2. Build a fresh auth integration branch from current `main`; rebase/cherry-pick the reviewed auth commits deliberately.
3. Review every conflict touching Z7, roles, middleware, email, migrations, or browser/server boundaries.
4. Rehearse auth migrations from a clean baseline and verify the production schema before and after authorized application.
5. Verify forced password change, invitation, recovery, role revocation, session invalidation, and delivery evidence.
6. Replace or complete the general notification email path.
7. Prove Sentry/runtime initialization with a controlled synthetic event; add Spanish 404/500/error surfaces and alert ownership.
8. Add durable meeting-email outbox/retries and truthful delivered/pending/failed state.
9. Flush autosaves on navigation/page hide and expose unsaved state.

**Exit:** independent security/privacy approval; all high-risk RLS tests pass; current-main auth integration passes every repository gate and production smoke. Only then may student/family rollout be considered.

### Gate 5 — Eight-school release candidate

Build an eight-school synthetic Santa Marta network in staging with:

- admin;
- one Líder de Red;
- two directors in different schools;
- one `encargado_licitacion`;
- one consultant;
- one teacher;
- unauthorized cross-school and cross-network controls.

Required acceptance journeys:

1. create, revoke, and reassign the Líder de Red;
2. create/rename a community, publish in the feed, and see another person's author identity;
3. save/reopen agreements and commitments, finalize, and prove email behavior;
4. view and document a school-scoped session as consultant and director;
5. complete attendance/report and consume hours; reconcile UI/CSV/PDF;
6. configure school grades and verify migration percentages;
7. assign a teacher and reconcile evaluations;
8. complete open/closed/stale-gate assessments;
9. prove a published-template edit cannot change an applied evaluation;
10. load all network tabs with exact eight-school scope;
11. complete the licitation workflow, automatic reminders, downloads, audit, and contract link;
12. prove every relevant cross-school, cross-network, and anonymous denial.

No skipped or conditional test counts as acceptance evidence.

### Gate 6 — Assisted rollout

1. Internal synthetic production smoke.
2. One-school staff pilot with daily triage.
3. Two-school pilot after one complete accepted cycle.
4. Convert the readiness visits already under way into school-by-school activation only as each school's required gates pass.
5. Keep student/family invitations gated separately behind Gate 4.
6. Conduct the network review with the Madre Superiora and directors against the canonical promise ledger, not against either narrative audit.

## 8. Realistic schedule and staffing

The original two-week language should be retired as a promise.

With at least three parallel engineering owners plus prompt DB/security review:

- **2–3 working days:** Gate 0 and known hotfix candidate;
- **1–2 weeks:** first-school staff candidate, if meeting/session fixes do not uncover schema surprises;
- **2–4 weeks:** two-school candidate with assessments, reports, and licitation trust controls;
- **4–6+ weeks:** eight-school assisted rollout and security/auth completion.

With one engineer/reviewer, these tracks are mostly sequential and the calendar expands materially. The release date must move with gate evidence, not with the presentation date.

## 9. Final synthesis

- **Use Claude for:** the granular defect ledger, first-contact journey analysis, root-cause grouping, and file-level repair hypotheses.
- **Use Codex for:** evidence boundaries, production verification, release ownership, rollout tiers, persona/cross-tenant acceptance, data/operations, and GO/NO-GO gates.
- **Discard from Codex:** the optimistic readiness labels for meetings, sessions, hours lifecycle, and snapshots.
- **Discard from Claude:** the unreconciled counts, two-week commitment, partial RLS-before-first-school sequencing, overbroad consultant/workspace fix, and schema/scoping inaccuracies.
- **Add to both:** current-main auth integration, canonical promise ledger, rollback/canary protocol, destructive/audit controls, transactional reconciliation, and a real six-week visit calendar.

The combined result is not "fix Claude's 27 P0s" and it is not "execute Codex's five stages." It is a gated release program in which every promise has one ledger row, every fix has a reproducible test, every production dependency has evidence, and each school is activated only after its required journeys pass.
