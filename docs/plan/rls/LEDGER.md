# LEDGER — RLS

Append-only, one entry per round. Plan: `docs/plan/rls/PLAN.md`.

**This ledger lives only on `fix/rls-public`.** It is not on `main`. Read it with
`git show fix/rls-public:docs/plan/rls/LEDGER.md` or work in
`/Users/brentcurtis/dev/wt/rls-public`.

---

### 2026-08-11 — r1 — DISCOVERY (Codex, pre-plan)

- SESSION: `RLS · r1 · diagnosis`
- ARTIFACT: `docs/plan/rls/reviews/rls-public-allowlist-r1-findings.md` — 200 lines.
  `git mv`d into this plan root on 2026-08-12; previously `docs/plan/reviews/`.
- RISK: DISCOVERY
- ACTION: read-only audit of the 22-table `public` allowlist against production
  `sxlogxqzmarhqsblxmtj` — catalog SQL over MCP, count-only REST probes
  (`limit=0`, `Prefer: count=exact`), read-only GET probes of candidate RPCs, static call-site
  analysis. No writes, no DDL, no row reads; all probe identifiers synthetic.
- COMMITS: `cc6275cb` (initial), `745c90fc` (corrected after independent review),
  `c1dcf314` (RPC bypasses + policy requirements)
- OUTPUT: §1 reachability proven with two discriminating controls (`profiles`,
  `pasantias_leads`); §3 per-table classification A1 dead (14) / A2 service-role-only (1) /
  A3 broken reader (1) / B user-facing (6); §4 `profiles_role_backup`; §5 remedy order with
  per-table policy contracts; §6 explicit proven-vs-inferred split.
- FINDINGS RAISED: grants are `arwdDxt` to both `anon` and `authenticated`, not the narrower set
  the 2026-07-08 exception recorded. The exception's claim that enabling RLS without policies
  "rompería producción" is **false for 15 of the 22** and repairably false for one more.
  Separately: nine SECURITY DEFINER RPCs are anonymously executable in production.
- DECISIONS: none — discovery produces evidence and a revised contract, not implementation.
- OPEN AFTER THIS ROUND: turn it into a phased plan with acceptance criteria.

---

### 2026-08-12 — plan — PM

- SESSION: `RLS · plan · PM`
- STARTED: 2026-08-12T13:52Z · ENDED: 2026-08-12T14:26Z
- ATTEMPT: 1 (cumulative, planning)
- RISK: DISCOVERY → plan
- HANDOFFS: 1 (Brent's `/plan-new` prompt)
- WORKTREE: `/Users/brentcurtis/dev/wt/rls-public`, branch `fix/rls-public`, clean at `c1dcf314`.
  Git common dir `/Users/brentcurtis/dev/fne-lms/.git` → **lean overlay ACTIVE**.
- ACTION:
  - `git mv docs/plan/reviews/rls-public-allowlist-r1-findings.md`
    → `docs/plan/rls/reviews/` (recorded above as r1's discovery artifact).
  - Created `docs/plan/rls/` with `PLAN.md`, `LEDGER.md`, `reviews/`, `evidence/`, `prompts/`.
  - Wrote `PLAN.md`: goal with two completion conditions, 6 non-goals, 8 frozen decisions,
    10-phase index with dependency graph, 4 owner questions with what-if-unanswered, R1 as a
    full contract (15 criteria + 7-claim falsification record), R2–R10 as bounded outlines,
    5 workstream blind spots, 6 decision-log entries.
- GATES: none run — planning round, no source touched.
- EVIDENCE GATHERED THIS ROUND (all re-verified on this branch, not inherited):
  - Allowlist is 22 entries at `supabase/tests/001-rls-enabled.sql:58-66`.
  - `has_global_workspace_access` — `baseline.sql:3987-3999` SECURITY DEFINER, unqualified
    `user_roles`, no `SET search_path`; `:23982` granted to `anon`; `:18196`/`:18203`/`:18210`
    three live `community_meetings` policies, all `TO authenticated`.
  - Caller audit of all ten functions. Two corrections to the inherited table:
    `update_full_learning_path` → `lib/services/learningPathsService.ts:256`;
    `end_learning_path_session` → `pages/api/learning-paths/session/end.ts:49`.
    Zero callers confirmed for `has_transformation_access`,
    `get_available_assignment_templates`, `cleanup_propuesta_rate_limits`,
    `has_global_workspace_access`.
  - `submit_quiz` live path is a **browser** client — `components/quiz/QuizTaker.tsx:6,31,114`
    and `LearningQuizTaker.tsx:6,33,152` use `useSupabaseClient()`. The three
    `scripts/seed-qa-phase2*.js` hits use `SUPABASE_SERVICE_ROLE_KEY`.
  - Only 3 `REVOKE … FROM PUBLIC` exist in the whole baseline (`:22315`, `:22368`, `:24046`) and
    none covers the ten in scope → D-3.
  - `GRANT USAGE ON SCHEMA public` only, no `CREATE`, for `anon`/`authenticated`
    (`baseline.sql:21931-21934`).
  - `supabase/config.toml` has no `[db]` section → no `major_version` pin; production is 15.8.
  - `scripts/ci/check-rls-migrations.sh` greps `-rniE` across **all** migration text, comments
    included.
  - Gate hazard reproduced and found **worse than briefed**: `node_modules` is absent in this
    worktree, so `node -e "require('jsdom')"` and `require('canvas')` both fail
    `MODULE_NOT_FOUND`. `npm test` is the only test script in `package.json` without the
    `register-canvas.js` preload, and `tests/mocks/register-canvas.js:3-7` swallows the failure.
  - Model precedent for every phase: `supabase/migrations/20260731140500_add_pasantias_leads.sql:134-148`
    (grant-list form) and `supabase/tests/030-pasantias-leads-rls.sql` (ACL pins, per-role
    `throws_ok`, `pg_temp` impersonation helpers).
- FINDINGS RAISED: one **weakening** of an inherited claim — the missing `search_path` on
  `has_global_workspace_access` is defence-in-depth, not a live exploit, because
  `anon`/`authenticated` hold `USAGE` only on `public` and PostgREST cannot create a temporary
  relation. It still ships in R1; the plan says so in its own words rather than inheriting the
  stronger framing.
- DECISIONS: 6 logged in `PLAN.md` § Decision log.
- BACKLOG ADDED: none.
- CODEX: not yet run.
- OPEN AFTER THIS ROUND:
  1. One independent **Codex plan review**. The plan is **not frozen** until it passes.
  2. Owner answers Q1–Q4 (none blocks R1).
  3. Codex to rule on the review-request path deviation (`docs/plan/rls/reviews/R<n>-…` vs
     `CLAUDE.md` Executor Rule 6's `docs/planning/reviews/fase-<N>-…`).

---

### 2026-08-12 — plan — r1 CODEX REVIEW + PM amendment

- SESSION: `RLS · plan · REVIEW` (Codex) → `RLS · plan · PM` (amendment)
- ATTEMPT: 2 (cumulative, planning)
- RISK: DISCOVERY → plan
- HANDOFFS: 2 (prompt out to Codex, review back)
- CODEX: **FINDINGS** — 5 BLOCKING, 6 SHOULD-FIX, 1 NIT. Codex confirmed the ten signatures,
  the three function-using `community_meetings` policies, and the three baseline `PUBLIC`
  revokes match the repository; it changed no files and did not access production.
- PM INDEPENDENT VERIFICATION before accepting (a review is a claim, not evidence):
  - **B2 — CONFIRMED.** `assignment_instances_teacher_manage` (`baseline.sql:19758`) has no
    `FOR` clause, so `FOR ALL`, `TO authenticated`, `USING`/`WITH CHECK`
    `((created_by = auth.uid()) OR auth_is_course_teacher(course_id))`. RLS is on at `:19747`;
    the trigger is `BEFORE INSERT OR UPDATE` at `:15684`. Any authenticated user can therefore
    write directly over PostgREST. **The discovery document's §5 "sole writer is service-role"
    claim is false at the database boundary** — its second error.
  - **N1 — CONFIRMED.** `cleanup_propuesta_rate_limits()` is `LANGUAGE sql` with no
    `SECURITY DEFINER` (`baseline.sql:1882-1884`). Nine of the ten are DEFINER, not ten.
    Revoking it stays urgent: as invoker-rights it runs with the caller's privileges, and `anon`
    holds `arwdDxt` on `propuesta_rate_limits`, so anonymous execution deletes rows for real.
  - **B1 — premise CONFIRMED.** `user_roles` is absent from the allowlist, so its RLS is on and
    the SECURITY DEFINER function does bypass it.
- TRIAGE: all 5 BLOCKING accepted, all 6 SHOULD-FIX accepted, the NIT accepted. **No finding
  disputed.** One accepted with a different remedy than Codex proposed — see DECISIONS.
- ACTION — `PLAN.md` amended:
  - **B1** → new phase **R1b** (bind `has_global_workspace_access` to `auth.uid()`), running
    directly after R1. R1's headline no longer implies it closes the authenticated oracle.
  - **B2** → R9's trap rewritten: "pin the sole-writer invariant" removed as an option because it
    would pin a false claim. R9 must make the trigger `SECURITY DEFINER` with a pinned
    `search_path` (or repair the policy) and test direct authenticated INSERT/UPDATE.
  - **B3** → A1 becomes a mechanically checked statement allowlist shipped as a committed script;
    A12 no longer claims a `SELECT` proves row preservation.
  - **B4** → A15 becomes an executed-vs-discovered file-count assertion from
    `--reporter=json`; `require('jsdom')` demoted to a necessary-not-sufficient precondition.
  - **B5** → review-request artifact moves to the canonical
    `docs/planning/reviews/fase-R1-review-request.md`; the earlier decision-log override is
    struck through rather than deleted.
  - **S1** → behaviour-change promise narrowed to known in-repository callers.
  - **S2** → A3/A4 read `aclexplode(COALESCE(proacl, acldefault('f', proowner)))`.
  - **S3** → new owner question **Q5** (learning-path global-vs-scoped management), gating R7
    and R10.
  - **S4** → **R10 resequenced** from 11th to 9th of 11. Phase IDs kept stable; the index gained
    an `Order` column.
  - **S5** → sizing claim corrected: ≤600 net lines **will** be exceeded; bounded instead by a
    data-driven-assertion instruction and a ~350-line pgTAP signal.
  - **S6** → D-4 corrected: only the RLS-disable phrase is guard-blocked; restoring a grant is
    prohibited by plan and review, not by a script.
  - **N1** → nine SECURITY DEFINER + one invoker-rights, stated with why it still matters.
- GATES: none run — planning round, no source touched.
- FINDINGS RAISED BY PM: none new.
- DECISIONS: 3 appended to `PLAN.md` § Decision log, including the reversal of the review-request
  path. **Deviation from Codex's proposed remedy on B1:** Codex offered "add to R1 or schedule in
  R10"; the amendment takes neither, creating R1b instead — R1 is at its 15-criterion cap so
  §1.3 forces a split, and deferring an unowned security item to 9th of 11 phases is the §1.4
  failure mode. Flagged for the r2 review to rule on.
- BACKLOG ADDED: none — every accepted finding landed in a named phase or criterion this round.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r2.** The plan is still **not frozen**.
  2. Owner answers Q1–Q5 (none blocks R1).
  3. `fix/rls-public` still has no upstream and exists on no remote.

---

### 2026-08-12 — plan — r2 CODEX REVIEW + PM amendment + scope expansion

- SESSION: `RLS · plan · REVIEW · r2` (Codex) → `RLS · plan · PM` (amendment)
- ATTEMPT: 3 (cumulative, planning)
- RISK: DISCOVERY → plan
- HANDOFFS: 2 (prompt out to Codex, review back) + 1 owner decision
- CODEX: **FINDINGS** — 5 BLOCKING, 2 SHOULD-FIX, 3 NITs. Disposition of r1: 6 fixed, 4 not
  fixed or partially fixed, 2 fixed with stale prose left behind. Codex changed no files and
  did not access production.
- CODEX ANSWERED ALL THREE OPEN PM QUESTIONS:
  - (A) R1b is the right split, but silently ignoring the parameter is wrong — must fail closed.
  - (B) A15 is implementable on Vitest 0.34 **only** with a separate expected-file-set checker;
    JSON alone cannot prove discovery completeness. This confirmed the PM's own doubt.
  - (C) A privileged integrity-only trigger is acceptable, **and** the `FOR ALL` policy must be
    repaired independently — they are not alternatives.
- PM INDEPENDENT VERIFICATION before accepting B5 (the one finding asserting new facts):
  - `get_unread_notification_count(p_user_id uuid)` — CONFIRMED. `baseline.sql:3660-3672`,
    SECURITY DEFINER, unqualified `FROM user_notifications`, caller-supplied subject, granted
    `anon` at `:23825`.
  - Sized the surface rather than accepting the single example: **90** SECURITY DEFINER functions
    in `public`, **88** granted to `anon`, **9** covered by R1's ten, **79** outside the audit —
    of which 9 return `trigger` and **70 are RPC-callable**. At least 20 of the 70 take a
    caller-supplied user identifier.
  - **Recorded as UNMEASURED, not as 70 vulnerabilities**: the grants are proven from the
    baseline file; reachability and exploitability are not. Promoting them would repeat exactly
    the error §6 exists to prevent.
- TRIAGE: all 10 findings accepted, none disputed. **Four were the PM's own stale cross-references
  from the r1 amendment** (S1, N1, N2, N3) — the primary statement was corrected and the prose
  quoting it was not. Named as a pattern in the plan text, not just fixed.
- OWNER DECISIONS (Brent, at the §1.5 round cap):
  1. **Amend all 10, then a narrow r3** — the cap is overridden, with the override naming its
     evidence: the r1 amendment left 4 stale contradictions, so freezing unchecked has a
     demonstrated failure rate. r3 reviews the amendments only, not the whole plan.
  2. **Expand the RLS workstream to cover the 70** rather than narrowing the DoD as Codex
     proposed. The PM flagged that this risks delaying R1 and strains the sizing rules; Brent
     took the tradeoff knowingly. R1 is unaffected and still ships first.
- ACTION — `PLAN.md` amended:
  - **r2 B1** → A1 becomes an exact-multiset check (operation × target × grantee), not a
    syntactic category check; its invocation is now inside A14's gate command.
  - **r2 B2** → A15 becomes a committed `scripts/ci/check-suite-complete.mjs` that derives the
    expected set from the Vitest include/exclude globs and diffs it against `testResults[].name`.
  - **r2 B3** → R9 must do trigger hardening **and** policy repair; they are no longer alternatives.
  - **r2 B4** → R1b fails closed: mismatch with `auth.uid()` returns `false`, plus a negative test.
  - **r2 B5** → resolved by **expansion**: new `DISCOVERY` phase **R11**, third completion
    condition in the Goal, R12+ deliberately undefined until R11 lands.
  - **r2 S1** → stale rollback prose corrected. **S2** → Q5 reclassified gate → ruling-with-default.
  - **r2 N1/N2/N3** → five-vs-six form count, six-vs-eight files in Claim 7, and "SECURITY DEFINER
    surface" → "public RPC bypass surface" in the Goal.
- NEW RISK RECORDED IN R11: the 70 include the `auth_*` helper family (`auth_is_admin`,
  `auth_is_course_student`, `auth_is_course_teacher`, `auth_is_superadmin`,
  `auth_user_community_ids`) which RLS policies call inside `USING` clauses. `authenticated` must
  retain `EXECUTE` or policies break schema-wide. This is the most likely way the expanded scope
  causes production damage, and it is why R11 is DISCOVERY rather than a revoke sweep.
- GATES: none run — planning round, no source touched.
- DECISIONS: 4 appended to `PLAN.md` § Decision log, including the round-cap override and the
  B5 remedy divergence.
- BACKLOG ADDED: none — every accepted finding landed in a named phase, criterion, or decision.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r3**, scoped to the amendments. Plan still **not frozen**.
  2. r3 must rule on whether expanding scope satisfies B5, since that is not the remedy Codex
     proposed.
  3. Owner answers Q1–Q4 (none blocks R1). Q5 has a default and blocks nothing.
  4. `fix/rls-public` still has no upstream and exists on no remote — now 6 commits.

---

### 2026-08-12 — plan — r3 CODEX REVIEW + PM amendment + an R1 defect found in the process

- SESSION: `RLS · plan · REVIEW · r3` (Codex) → `RLS · plan · PM`
- ATTEMPT: 4 (cumulative, planning)
- RISK: DISCOVERY → plan
- HANDOFFS: 2 (prompt out, review back) + 1 owner decision
- CODEX: **FINDINGS** — 5 BLOCKING, 2 SHOULD-FIX, 0 NITs. r2 disposition: 8 of 10 fully fixed.
  Rulings A, B, C, D, F PASS; **E FAIL** (A15's expected-set source). Codex changed no files and
  did not access production.
- CONVERGENCE ANALYSIS (the PM had committed to calling re-plan on a third FINDINGS):
  R1's own contract passed 5 of 6 rulings and had exactly one open defect (A15/B3+B4, now fixed).
  **Every other blocking item was in R11 or the Surface DoD** — a section one round old, on its
  first review. Re-planning R1–R10 would have discarded work that survived three adversarial
  reviews, so the commitment was reported as firing on the letter and not the substance.
  Brent chose to fully specify R11 and go to r4.
- **DEFECT FOUND IN R1 WHILE WRITING R11's CONTRACT — would have broken production:**
  `has_transformation_access(uuid)` has **zero repository callers and seven RLS-policy callers**:
  `members_insert/update_transformation_assessments`,
  `members_insert/update/delete_transformation_results`,
  `members_insert/delete_transformation_conversation_messages`. **All seven carry no `TO` clause**,
  so they default to `TO PUBLIC`. Policy expressions evaluate with the invoking role's privileges,
  so R1's planned `REVOKE … FROM authenticated` would have raised `42501` on every authenticated
  INSERT/UPDATE/DELETE against those three live tables.
  - **The discovery document's third error**, and the first that would have caused an outage.
  - Missed by the discovery document, by this plan's r1 caller audit, and by the Codex r1 and r2
    reviews *of* that audit — all four used the same grep-over-`.rpc()` method.
  - A first-line `grep` over `CREATE POLICY` found only 4 of the 7; whole-statement extraction
    found all seven. Multi-line policy bodies defeat naive greps.
  - Fix: `has_transformation_access` moves to the keep-`authenticated` group. Full-revoke group
    3 → 2 (`get_available_assignment_templates`, `cleanup_propuesta_rate_limits`, both confirmed
    zero-dependency). Keep group 7 → 8. A8 gains criterion (a), which **must fail** if the revoke
    returns. D-3 qualified. Falsification CLAIM 1 recorded as refuted-then-repaired rather than
    silently rewritten.
- SUPPORTING MEASUREMENT: 634 policies in the baseline, **420 with no `TO` clause** (= `TO
  PUBLIC`). 15+ distinct helper functions appear in policy bodies on a first-line sweep alone,
  including `auth_is_course_teacher` (7) and `auth_is_school_directivo` (7).
- ACTION — `PLAN.md` amended:
  - **r3 B1** → inventory is by `regprocedure`, never by name; the two SECURITY DEFINER overloads
    of `mark_notification_read` (`baseline.sql:4334`, `:4350`) had been merged by a name-based
    count. Corrected to 91 signatures / 89 anon-granted / 80 outside the audit / 71 non-trigger.
  - **r3 B2** → Surface DoD narrowed to anon-granted `SECURITY DEFINER` signatures; the previous
    wording covered hundreds of invoker-rights functions R11 could never audit. "RPC-callable" →
    "non-trigger RPC candidates", since reachability is what R11 measures.
  - **r3 B3** → A15 names its expected-set source: `vitest.config.ts:7-18` has `exclude` and no
    `include`, so the effective set is `configDefaults.include` + that exclude, loaded through a
    real config loader. Second failure of this criterion.
  - **r3 B4** → R1 scope was internally impossible (A15 requires a `.mjs` checker while
    out-of-scope said "no TypeScript or JavaScript"). Nine files; exclusion narrowed to
    application code.
  - **r3 B5** → R11 gains the six-class dependency inventory (policies, function bodies, triggers,
    views/rules, defaults/generated expressions, constraints), catalog-sourced not grep-sourced,
    plus effective-role derivation and the `TO`-clause semantics. D-3 qualified to match.
  - **r3 S1** → pre-expansion sequencing prose swept.
  - **r3 S2** → R11 bounded as three checkpointed units: R11a bulk dependency sweep (six queries,
    all 80 at once), R11b per-signature classification in four batches of 20 with artifacts
    appended per batch, R11c consolidation. R11 is not closed until R11c lands; no R12 may be
    dispatched from a partial classification.
- GATES: none run — planning round, no source touched.
- DECISIONS: 5 appended to `PLAN.md` § Decision log.
- BACKLOG ADDED: none.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r4.** Plan still **not frozen**. r4 must re-check R1, not only R11 —
     R1's caller table changed materially this round.
  2. Owner answers Q1–Q4 (none blocks R1). Q5 has a default.
  3. `fix/rls-public` still has no upstream and exists on no remote — now 9 commits.

---

### 2026-08-12 — plan — r4 CODEX REVIEW + R1 split behind a DISCOVERY phase

- SESSION: `RLS · plan · REVIEW · r4` (Codex) → `RLS · plan · PM`
- ATTEMPT: 5 (cumulative, planning)
- RISK: DISCOVERY → plan
- HANDOFFS: 2
- CODEX: **FINDINGS** — 3 BLOCKING, 3 SHOULD-FIX, 0 NITs. r3 disposition: B1–B4 FIXED,
  B5 PARTIAL, S1 NOT FIXED, S2 FIXED. Rulings: A PASS-with-qualification, B current-facts-PASS
  /method-FAIL, C FAIL, D PASS, E MIXED, F PASS, G FAIL.
- **IS R1 DISPATCHABLE: NO.** The PM had put that question to Codex directly and undertaken to
  act on the answer. Codex's reasoning: R1's actions are substantively correct — it independently
  swept the three dependency classes the PM had declared as unswept and found no additional
  caller — but the evidence-producing method has failed in four independent ways, and the plan
  claimed a six-class check it admits was never run.
- CODEX'S INDEPENDENT VERIFICATION (stronger than the PM's own): reproduced 91/89/80/71 and both
  `mark_notification_read` overloads; confirmed exactly seven policies depend on
  `has_transformation_access`, all with `polroles = {0}` (PUBLIC); confirmed by **local probe**
  that revoking PUBLIC+anon+authenticated yields `42501 permission denied for function`. The
  probe ran inside a transaction that was rolled back, with the rollback verified. No production
  access.
- ACTION — `PLAN.md` amended:
  - **r4 B1** → **new `DISCOVERY` phase `R0`**, order 1, blocking R1. Rebuilds the ten-signature
    inventory from authoritative sources with 8 acceptance criteria: `regprocedure` identity and
    overload disambiguation, effective ACLs, security mode/config, application callers with
    client roles, **unfiltered reverse `pg_depend` first** then textual analyses, policy
    `polroles`, proven-vs-inferred split naming the `prosrc` overload and dynamic-SQL limits, and
    an explicit diff against R1's current contract. R0 closes only when R1 has been amended from
    it. R1 status → **BLOCKED on R0**.
  - **r4 B2** → A8(a) rewritten. The negative assertion was invalid: PostgreSQL raises `42501`
    for **both** an RLS policy violation and `permission denied for function`, so "not 42501"
    could never distinguish a correct denial from the regression. Now matches on error message.
    Removed a non-existent UPDATE policy on `transformation_conversation_messages` (that table
    has INSERT/DELETE/SELECT policies only). **Test plan rewritten** — it was still at
    three-dead/seven-live, tested only workspace access under A8, and supplied no transformation
    fixtures, so an executor following it would have omitted the outage regression entirely.
    New assertion group `r1_transformation_member_matrix` plus the fixtures it needs.
  - **r4 B3** → R11 starts from an **unfiltered** reverse `pg_depend` sweep so unimagined catalog
    classes cannot vanish by construction; adds **expression indexes** (`pg_index.indexprs`/
    `indpred`) and **partition-key expressions**, both of which execute functions during writes;
    states that `prosrc` matching cannot resolve overloads or prove absence of dynamic SQL.
  - **r4 S1** → outage description corrected: it is the PUBLIC+authenticated **combination**, not
    the authenticated revoke alone, and it affects the seven policy-carrying operations when a
    row reaches the predicate — not every DML statement on three tables.
  - **r4 S2** → stale sequencing prose swept (META, R9-is-last, eleven-phase, R7/R10 Q5 labels).
  - **r4 S3** → A1 names its seven normalization targets explicitly and states that
    `has_transformation_access` receives no `authenticated` ACL statement, which is why A4's
    keep-group is eight while A1's list is seven.
  - **New D-9** — mandatory mechanical consistency sweep after every amendment.
- **D-9 SWEEP RUN THIS ROUND** (the first under the new rule): 20 patterns checked against active
  text above the Decision Log. Two hits, both correct usage — "six live RPCs" (there are six
  *application* RPCs inside the eight-signature keep-group) and "SECURITY DEFINER surface" (the
  sentence explaining why the plan no longer uses that phrase). **No stale references found.**
- FINDINGS RAISED BY PM: none new.
- DECISIONS: 5 appended to `PLAN.md` § Decision log.
- COMMITS: `2654e2b2`. Branch **pushed** — `origin/fix/rls-public` now exists and tracks.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r5.** Plan still **not frozen**.
  2. **R0 is the next phase to dispatch, not R1.** R0 is DISCOVERY; it ships no migration.
  3. Owner answers Q1–Q4 (none blocks R0 or R1). Q5 has a default.

---

### 2026-08-12 — plan — r5 CODEX REVIEW + PM amendment

- SESSION: `RLS · plan · REVIEW · r5` (Codex) → `RLS · plan · PM`
- ATTEMPT: 6 (cumulative, planning)
- CODEX: **FINDINGS** — 3 BLOCKING, 2 SHOULD-FIX, 0 NITs. `IS R0 DISPATCHABLE: no`.
  `SHOULD THE PLAN FREEZE NOW: no` — but with a bounded freeze checklist, not a new problem class.
  r4 disposition: B1 PARTIAL, B2 NOT FULLY FIXED, B3 PARTIAL, S1 FIXED, S2 NOT FIXED, S3 FIXED.
- PM VERIFICATION before accepting:
  - **B1 — CONFIRMED, and it is a hard-rule violation in the plan's own text.** `AGENTS.md:37`
    reads "never touch prod DB directly" with **no read-only exception**; R0's contract said
    production facts "gathered read-only under D-7's rules". The plan's own precedence list puts
    repo hard rules above the plan, and the plan broke one.
  - **B3 — CONFIRMED on all three counts.** `members_delete_transformation_results`
    (`baseline.sql:20989-20994`) additionally requires `role_type IN ('admin','consultor')`, so a
    generic member cannot drive the matrix. `rubric_item_id` is `NOT NULL` on both dependent
    tables (`:11154`, `:11183`), so a `transformation_rubric` fixture is required and was absent.
    Non-member UPDATE/DELETE filter to zero rows rather than raising — **which `CLAUDE.md` itself
    documents** ("Blocked `INSERT` throws; blocked `UPDATE` returns empty — assert accordingly")
    and which this plan contradicted anyway.
- ACTION — `PLAN.md` amended: AR0-8 forbids any executor production connection; D-7 clarified so
  the production verification is Brent's; R0 gains exact gates, the canonical
  `docs/planning/reviews/fase-R0-review-request.md`, its five named documentation outputs, and an
  independent Codex review in its closure; AR0-3 requires `pg_identify_object` resolution; new
  AR0-3b inventories and dispositions dynamic SQL; application discovery becomes exhaustive over
  all tracked sources with runtime role *sets*; AR0-7 absorbs the A8(a) derivation; R0's
  out-of-scope wording fixed; the eight stale references fixed; R11a's "six catalog queries"
  corrected.
- **D-9 REWRITTEN — the control failed on its first use.** It ran at r4 and still passed eight
  live contradictions, because a guessed pattern list cannot match sentences that never contained
  the new wording. Now diff-driven, three required layers: (1) search **both old and new forms**
  of every changed fact, dispositioning every hit; (2) structural comparison of the phase index
  against each phase header; (3) centralize volatile counts. A later stale reference means the
  control failed, not that it was skipped.
- **D-9 SWEEP UNDER THE NEW RULES:** layer 1 flagged 5 candidates, of which **2 were genuinely
  stale** — R0's "Where to run it" still routed evidence to production (line 378), and R11's
  per-signature point 4 still restricted callers to `.rpc()` in three extensions (line 1133), the
  exact B2 error one layer over. Both fixed. Three were the amendment quoting old wording, which
  is correct. Layer 2 (index vs headers) clean. Layer 3 found the counts restated in 13 places and
  R11a's stale "six catalog queries"; a centralization anchor now defines them once. **The new
  control caught what the old one could not, on its first run.**
- COMMITS: `62687c8a`. Pushed.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r6.** Plan still **not frozen**.
  2. R0 remains the next phase to dispatch. It ships nothing — its blast radius is wasted effort,
     never production damage.
  3. Owner answers Q1–Q4; Q5 has a default.

---

### 2026-08-13 — plan — r6 CODEX REVIEW + PM amendment

- SESSION: `RLS · plan · REVIEW · r6` (Codex) → `RLS · plan · PM`
- ATTEMPT: 7 (cumulative, planning)
- CODEX: **FINDINGS** — 2 BLOCKING, 2 SHOULD-FIX, 2 NITs. `IS R0 DISPATCHABLE: no`, with
  "no broader redesign is needed". r5 checklist: no-production **SATISFIED**, A8 path
  **SATISFIED**, population rules **SUBSTANTIALLY SATISFIED**, command/closure contract
  **NOT SATISFIED**.
- PM VERIFICATION: **B1 CONFIRMED** — `AGENTS.md:30` requires
  `type-check && lint && test && build` before reporting any phase complete, with no
  documentation-only exception. R0's contract waived `npm test` and `npm run build`.
  **This is the second hard-rule violation to reach a phase contract in this plan**, after r5's
  production-access one. Both were reasonable-looking engineering judgments overriding an
  absolute rule; both times the plan's own precedence list already said which wins. Worth naming
  as a pattern: the PM's failure mode is *optimizing a contract against a rule it has read*.
- ACTION — `PLAN.md` amended:
  - **r6 B1** → all four gates restored, plus `--local` on `supabase db reset` as
    defence-in-depth (Codex ruling B). Recorded that `npm test` runs because the repo requires
    it, **not** as evidence of suite completeness — A15's checker does not exist until R1 and the
    jsdom hazard is live, so R0 may not cite a test count as evidence.
  - **r6 B2** → AR0-8 must classify every production-only uncertainty **load-bearing or not**;
    load-bearing ones become a named **R1 pre-dispatch owner gate** for Brent's read-only
    confirmation. Closes the path by which R0 could unblock R1 with unresolved uncertainty about
    the exact production ACLs R1 modifies, given D-7's check runs only after apply.
  - **r6 S1** → four more stale references fixed: R1's metadata line (`Status: TODO. Depends on:
    nothing.`), R11's "no writes to production" evidence rule, R11a's "Six queries", and the
    whole-workstream blind spot's three-extension description.
  - **r6 S2** → generic `.rpc(<variable>)` and constructed-name sinks must be inventoried and
    traced; dynamic-SQL analysis covers **all user-defined schemas**, not only `public`
    (`zoom_internal` exists).
  - **r6 N1/N2** → outputs recounted as five required plus one optional; closure cites all nine
    criteria including AR0-3b.
- **D-9 LAYER 2 CORRECTED — the control's second failure, and its diagnosis.** At r5 it compared
  index rows to phase *headers* only. R1's header correctly read "BLOCKED on R0" while the
  metadata line **two lines below** still said "Status: TODO. Depends on: nothing." The check
  passed clean over a contradiction two lines apart. Layer 2 now compares
  index → header → metadata line. Per Codex ("mechanically comparable facts should not ride on a
  human sweep"), `docs/plan/rls/tools/check-plan-consistency.sh` becomes an **R0 deliverable** —
  documentation machinery, so inside R0's no-source boundary. The PM cannot write it (SOP §1.1).
- **D-9 SWEEP THIS ROUND, under the corrected layer 2:** layer 1 flagged 2 candidates, **both
  the amendment quoting old wording** — 0 real stale hits. Layer 2 clean: R0 index
  "TODO — next to dispatch" ↔ header ↔ metadata; R1 index "BLOCKED on R0" ↔ header ↔ metadata.
  Layer 3 counts still centralized at the Goal anchor.
- COMMITS: `4db2e5b8`. Pushed (first attempt hit a GitHub 500; retried successfully).
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r7.** Plan still **not frozen**.
  2. R0 remains next to dispatch. It ships no migration, no grant change, no application/test
     source — worst case is a wasted session.
  3. Owner answers Q1–Q4; Q5 has a default.

---

### 2026-08-13 — plan — r7 CODEX REVIEW + PM amendment + new phase RM

- SESSION: `RLS · plan · REVIEW · r7` (Codex) → `RLS · plan · PM`
- ATTEMPT: 8 (cumulative, planning)
- CODEX: **FINDINGS** — 4 BLOCKING, 2 SHOULD-FIX, 0 NITs. **"No category (i) defect remains"** —
  R0's evidence workflow and production boundary are dispatchable *in substance*; every blocker
  was category (ii), a repo-rule breach. `THIRD HARD-RULE RELAXATION: found`.
- **THE PM ASKED CODEX TO HUNT ITS OWN FAILURE MODE, AND IT FOUND ONE.** The r7 prompt directed
  Codex to read `AGENTS.md`/`CLAUDE.md` as the specification and the plan as the thing under
  test, on the grounds that two instances of "reasonable judgment overrides an absolute rule" is
  a pattern. Result — a third instance plus two adjacent conflicts:
  | round | rule | how the plan narrowed it |
  |---|---|---|
  | r5 | "never touch prod DB directly" | read in a read-only exception |
  | r6 | four gates before reporting complete | waived unit/build since no source changes |
  | r7 | `test:db` "when DB/UI **touched**" | narrowed "touched" to "source changed" |
  All three caught by review, none by the PM. Recorded in `PLAN.md` as the pattern rather than
  quietly fixed.
- PM VERIFICATION: B1 confirmed (`AGENTS.md:30` says "touched"; R0 starts, resets and queries the
  DB). B2 confirmed (`AGENTS.md:32`/`CLAUDE.md:43` require test evidence *with counts*, which
  R0's absolute prohibition made unsatisfiable). B3 confirmed (`CLAUDE.md:4`/`AGENTS.md:4` require
  `PROJECT_STATE.md` on phase end). B4 confirmed as a *finding*: 112 vs 73 lines with material
  section differences both ways.
- ACTION: `test:db` and the consistency checker added to R0's gate chain; the test-count
  prohibition replaced with report-but-bound; `PROJECT_STATE.md` added as a sixth required
  output; the checker gained an executable acceptance contract (forms parsed, mismatch → non-zero
  exit, invoked in the chain); R11 stopped restating the population counts.
- **ONE REMEDY DISPUTED — the first in eight rounds.** B4's finding was accepted; its remedy was
  not. The PM held that reconciling two repo-wide instruction files is not a ten-signature
  discovery phase's to own — they govern ZOOM, INSPIRA and every other workstream, and the PM
  cannot edit source (SOP §1.1). Codex read `AGENTS.md:3`'s "fix the divergence in the same PR"
  as binding on this PR; the PM read it as binding on the PR that *causes* divergence.
  **Brent ruled: fix it now, before R0, as its own phase.** New phase **`RM`** at order 1, HIGH,
  nine criteria, with an asymmetry rule forbidding deletion of guidance unique to `AGENTS.md`.
  R0 becomes BLOCKED on RM. Dispatch order is now `RM` → `R0` → `R1`.
- **D-9 SWEEP:** layer 1 flagged 4 candidates across two passes; **2 were genuinely stale** — the
  full-contract phase list (fixed to `RM`/`R0`/`R1`) and "thirteen-phase" (→ fourteen). Two were
  the amendment quoting old wording. Layer 2 clean: RM, R0 and R1 each agree across index row,
  header and metadata line. Layer 3 clean — counts live only at the Goal anchor.
- COMMITS: `bcfb6292`, `52080f5d`. Pushed.
- OPEN AFTER THIS ROUND:
  1. **Codex plan review r8**, then dispatch — Brent's ruling. Plan still **not frozen**.
  2. `RM` is next to dispatch, not R0.
  3. Owner answers Q1–Q4; Q5 has a default.

---

### 2026-08-13 — plan — r8 CODEX REVIEW + PM amendment

- SESSION: `RLS · plan · REVIEW · r8` (Codex) → `RLS · plan · PM`
- ATTEMPT: 9 (cumulative, planning)
- CODEX: **FINDINGS** — 3 BLOCKING, 3 SHOULD-FIX, 0 NITs. `IS RM DISPATCHABLE: no`.
  **One category (i)** — the consistency-checker contract. r7 disposition: B1/B2/B3 FIXED,
  B4 PARTIAL, S1 NOT FIXED, S2 FIXED.
- RULINGS: asymmetry rule **incorrect**; RM's `test:db`/`e2e` omission **correct**.
- PM ASSESSMENT — all three blockers accepted without dispute:
  - **B1 is the sharpest.** The PM's asymmetry rule had **one exit**. It forbade deleting a rule
    unique to `AGENTS.md` and required proposing it to Brent — but defined no behaviour if Brent
    said no. That branch leaves `AGENTS.md:3` violated permanently and RM unable to close, in a
    phase whose entire purpose is restoring that invariant. Fixed with two terminating branches;
    rejection relocates the guidance to a non-governing record, so knowledge survives without
    instructing agents. Promoted to owner gate **Q6** in the index rather than buried in prose.
  - **B2 is a repeat of a defect already fixed.** RM's out-of-scope excluded every file but
    `AGENTS.md` while ARM-7/ARM-8 and its DoD required three others — **the identical structural
    error Codex found in R0 at r6 and the PM fixed there, reproduced verbatim when writing a new
    phase.** A fixed defect does not stay fixed across phases unless the contract template
    carries it forward.
  - **B3, category (i):** the checker contract demanded status and dependencies from the phase
    *heading*, which carries neither — unimplementable, and would have produced permanent false
    failures or a checker weaker than D-9. Fields are now compared only between forms that carry
    them, and every full-contract phase gained an explicit `**Order: N.**` metadata field, since
    document position cannot stand in for order (R10 sits after R9 but executes before it).
- **D-9 ESCAPED A THIRD TIME, and the diagnosis is now consistent.** S3 caught R10's stale
  "10th of 13" after RM's insertion shifted every Order value. All three escapes (r5, r6, r8) were
  **layer-1 enumeration gaps, never layer-2 comparison gaps** — the hand-written old-form list
  keeps missing facts the PM did not think to list. Layer 1 now requires enumerating a changed
  **class** by pattern (every ordinal, every count, every phase name) rather than by memory.
- **D-9 SWEEP UNDER THE NEW RULE:** class-enumerated every `Nth of M` and `<word>-phase` claim in
  active text. Two hits, both correct after fixing (R10 → "11th of 14"; "fourteen-phase" verified
  against 14 defined index rows plus the `R12…` placeholder). Layer 2 clean — index Order 1/2/3
  match metadata `Order:` 1/2/3 for RM/R0/R1. Layer 3 clean.
- COMMITS: `bbedda06`. Pushed.
- OPEN AFTER THIS ROUND:
  1. Brent instructed dispatch after r8; r8 returned FINDINGS including one category (i), all now
     fixed. **Decision needed: dispatch RM, or run r9.**
  2. Plan still **not frozen**. `RM` is next; `Q6` gates its close.

---

### 2026-08-13 — RM — round 1 executor · BLOCKED checkpoint

- SESSION: `RLS · RM · EXEC`
- ATTEMPT: 1 (phase RM)
- BASE / START: `fix/rls-public` @ `4db6a37f`; merge base `main` @ `43999499`.
- ACTION: installed the worktree dependencies with `npm ci`, then reconciled every canonical
  `CLAUDE.md` section into `AGENTS.md` without changing rule substance. Commit `20149faa` carries
  the common branch. Both files are now 112 lines.
- VERIFIED DIVERGENCE AFTER COMMON RECONCILIATION: only the agent-specific title/preamble and two
  Q6 rule candidates remain: (1) `CLAUDE.md` precedence plus same-PR remediation; (2) mandatory
  per-role testing for middleware/RBAC changes. The rest of the former Auth Middleware Warning
  already exists canonically in `CLAUDE.md`.
- Q6: **OPEN; RM CANNOT CLOSE.** Approval adds those rules to canonical `CLAUDE.md`; rejection
  removes them from governing `AGENTS.md` and records them in
  `evidence/RM-retired-guidance.md`. No executor choice was made.
- GATES: type-check PASS; lint PASS; Vitest PASS (**305 files, 7,059 passed, 11 skipped**); build
  compiled successfully and then FAILED because `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_ANON_KEY` are absent. Reproduced identically at merge base `43999499` in
  a clean temporary detached worktree after `npm ci`; classified as a base/environment failure,
  not an RM regression. Temporary worktree removed. No test:db/e2e because RM touches no DB/UI.
- CLOSE ARTIFACTS: canonical review request created as a **blocked checkpoint**.
  `PROJECT_STATE.md` intentionally unchanged because the phase has not ended.
- **D-9 SWEEP:** no `PLAN.md` amendment occurred. Layer 1: classified every `AGENTS.md` diff hunk
  against the three allowed edit classes and searched the post-change files for old compact and
  new canonical forms; no silently dropped rule found, with the two unique rules explicitly
  dispositioned to Q6. Layer 2: phase index/header/metadata were untouched. Layer 3: no volatile
  plan count changed. `git diff --check` clean.
- OPEN AFTER THIS ROUND:
  1. Brent rules separately or jointly on the two Q6 candidates.
  2. Apply the selected terminating branch, update `PROJECT_STATE.md`, rerun gates, and request
     independent review before closing RM.
  3. Decide whether the verified base build environment failure is acceptable evidence for this
     documentation-only phase or requires an owner-supplied non-secret local build environment.

---

### 2026-08-13 — RM round 1 — PM VERIFICATION of the executor report

- SESSION: `RLS · RM · PM`
- ATTEMPT: 1 (RM), cumulative
- RISK: HIGH
- EXECUTOR REPORTED: `STATUS: BLOCKED` on a "verified base build-environment failure",
  commits `20149faa`, `6e698ef1`.
- **WHAT THE PM VERIFIED INDEPENDENTLY** (a report is a claim, not evidence):
  - **The build failure was MISDIAGNOSED. It is not a base failure.** `/Users/brentcurtis/dev/fne-lms/.env.local`
    exists (2289 bytes); this worktree had **no `.env*` at all**. `.gitignore:16` means
    `git worktree add` never copies it. PM symlinked it (no second copy of secrets on disk) and
    **`npm run build` completes successfully** — full route table emitted, middleware 73.7 kB.
    **ARM-9 is met.**
  - ARM-3 verified byte-for-byte: `(+ \`test:db\`/\`e2e\` when DB/UI touched)` is **identical** in
    both files at line 40.
  - ARM-2 verified: all four hard rules present in `AGENTS.md` with canonical content —
    NO DEPLOYMENTS, Database Safety (5 bullets incl. the RLS hook/CI clause), Privacy Ley 21.719
    (4 bullets), Memory Discipline.
  - ARM-1 verified structurally: `diff` of section headers shows **one** difference, the title
    line, which is presentation not a governing rule — the executor's stated assumption, and it is
    correct.
  - ARM-6 verified: both files 112 lines; under 200.
  - Q6 inventory verified by full `diff`: exactly the two items reported, nothing else.
  - **The jsdom hazard did NOT materialise.** 305 files / 7059 tests with `environment 365ms`.
    The plan's documented base is 254 files with 51 jsdom files silently dropped; **254 + 51 = 305**,
    so the full suite ran. Recorded because every later phase's A15 reasoning depends on it.
- FINDINGS RAISED:
  - **[B1 · BLOCKING-as-method, not as code] The base-failure control could not discriminate what
    it claimed.** Reproducing at merge base **inside the same env-less worktree** proves only that
    both fail identically — it cannot separate a code regression from a missing environment. The
    correct control is a checkout that *has* the environment. Consequence: the report routed
    toward an unnecessary overlay §5 stabilization phase. **Same shape as defects this plan has
    hit repeatedly: a control that cannot distinguish the thing it exists to distinguish.** No
    code defect; the diff is sound.
  - **[S1 · SHOULD-FIX] Overlay §5's evidence record was not written.** `evidence/` is empty. A
    red required gate must be recorded there with base SHA, environment, command and counts. What
    belongs there now is the **worktree setup gap**, so the next executor does not lose a round to
    it.
  - **[S2 · SHOULD-FIX] The two Q6 candidates are presented as symmetric and are not.** Retiring
    candidate 1 would delete the mirror invariant that RM exists to restore — its reject branch is
    self-defeating. Also, `CLAUDE.md:4` already carries a partial form of that statement
    ("`AGENTS.md` mirrors this file"), so candidate 1 is a *partial* divergence — the missing part
    is the precedence-and-same-PR clause, not the whole rule.
- DECISIONS: none by the PM. **Q6 is Brent's and is the only thing now blocking RM.**
- GATES RE-RUN BY PM: `npm run build` → **PASS** (after env symlink). Executor's type-check, lint
  and Vitest results accepted as reported and consistent with the PM's own suite-count check.
- ENVIRONMENT CHANGE MADE BY PM: symlinked `.env.local` into the worktree. Gitignored, not
  committed, no secrets duplicated.
- OPEN: Q6 ruling; then apply the branch, update `PROJECT_STATE.md`, re-run gates, push, and send
  to Codex for RM's independent review.

---

### 2026-08-13 — RM — round 2 executor · COMPLETE, awaiting independent review

- SESSION: `RLS · RM · EXEC`
- ATTEMPT: 2 (phase RM)
- START: `fix/rls-public` @ `53b4dafa`; merge base `main` @ `43999499`.
- Q6 RULING APPLIED: Brent promoted both candidates. `CLAUDE.md` now carries the precedence and
  same-PR remediation rule plus mandatory per-role testing for middleware/RBAC changes;
  `AGENTS.md` states the same rules from its own file perspective. Nothing was retired, so
  `evidence/RM-retired-guidance.md` was not created.
- ARM-8: `PROJECT_STATE.md` now records RM execution complete and queued for independent review.
  This is not a reviewer verdict: R0 remains blocked until RM passes that review.
- RED-GATE RECORD: created `evidence/RM-worktree-env-gap.md` with the exact round-1 error, ignored
  environment-file cause, local symlink remedy, base SHA and the non-discriminating-control
  lesson. The ignored `.env.local` symlink remains local and uncommitted; no secret content was
  inspected or recorded.
- CORRECTED DIAGNOSIS: reproducing the merge-base build inside another env-less worktree could
  not distinguish code from environment. With the existing main-checkout `.env.local` linked,
  no stabilization phase is needed and the build passes.
- GATES: exact chain
  `npm run type-check && npm run lint && npm test && npm run build` exited 0. Type-check PASS;
  lint PASS; Vitest PASS (**305 files, 7,059 passed, 11 skipped, 38.73s, environment 244ms**);
  build PASS (**156/156 static pages**, full route table, middleware **73.4 kB**). The jsdom hazard
  did not materialize: the documented 254 non-jsdom files plus 51 jsdom files equal the 305
  discovered here. No test:db/e2e because RM touched no DB/UI, started no database, ran no query
  and rendered no UI.
- ARM-6: `CLAUDE.md` and `AGENTS.md` remain 112 lines each, under the 200-line ceiling.
- **D-9 SWEEP:** no `PLAN.md` amendment occurred. Layer 1 compared both instruction files after
  Q6, re-enumerated the allowed edit classes and found only title/preamble presentation deltas;
  the governing rules match. Layer 2 phase index/header/metadata were untouched. Layer 3 no
  volatile plan count changed. `git diff --check` clean; the ignored symlink is absent from Git.
- COMMITS: `a6433ad7`, phase-close documentation commit follows this entry. Push follows.
- OPEN AFTER THIS ROUND:
  1. Independent RM review; R0 dispatches only after a non-blocking verdict.

---

### 2026-08-13 — RM round 2 — PM VERIFICATION — PHASE CLEAN

- SESSION: `RLS · RM · PM`
- EXECUTOR REPORTED: `STATUS: COMPLETE`, commits `a6433ad7`, `81e93ce1`, pushed.
- **WHAT THE PM VERIFIED INDEPENDENTLY:**
  - **The mirror invariant is restored.** Full `diff CLAUDE.md AGENTS.md` returns **only the first
    four lines** — title and preamble. **Every governing rule from line 5 to 112 is
    byte-identical.** The precedence clause now appears in both (`CLAUDE.md:4`, `AGENTS.md:3`),
    and the `PROJECT_STATE` rule appears in both in terser phrasing — reworded-same-meaning, which
    ARM-4 permits.
  - Both Q6 promotions applied and **minimal**: clause-level insertions into existing lines
    (`CLAUDE.md:4` precedence, `CLAUDE.md:75` `+ per-role testing`). No reflow, which is why both
    files remain 112 lines. `git diff` inspected directly, not taken from the report.
  - `RM-retired-guidance.md` correctly **not** created — nothing was retired.
  - `evidence/RM-worktree-env-gap.md` exists, 2607 bytes, and is genuinely good: it records the
    error, root cause, `.gitignore:16`, the symlink, the merge-base SHA, the reusable rule, and
    explicitly notes that **no environment-file contents were inspected, copied, logged or
    committed** — correct privacy hygiene for a secrets file.
  - `PROJECT_STATE.md` updated in the file's own language with RM's status and a new parallel
    thread (c), correctly stating R0 stays blocked pending independent review.
  - Gates accepted as reported (`exit 0`, 305 files / 7059 tests, `environment 244ms`, build
    emitting `- Environments: .env.local`). The PM had already run `npm run build` independently
    last round; the suite count matches the PM's own check. Not re-run in full — Codex re-runs it.
- **CORRECTION TO THE PM'S OWN PREVIOUS LEDGER ENTRY.** The r1 verification entry says the
  executor "reproduced at merge base **inside the same env-less worktree**". The evidence file
  states it used *another detached worktree*, and the real mechanism is more general and more
  useful: **any newly created worktree lacks gitignored files**, so a merge-base control cut as a
  fresh worktree can never discriminate an environment gap. The executor's write-up is more
  precise than the PM's summary was; the PM's framing is corrected here rather than left standing.
- FINDINGS RAISED: **none blocking.**
  - [N1 · NIT] `evidence/RM-worktree-env-gap.md` attributes the symlink to Brent; the PM made it.
    Trivial, but the record should be accurate. Not worth a remediation round on its own — fold
    into any later touch of that file.
- ACCEPTANCE CRITERIA — PM's independent assessment: **ARM-1 … ARM-9 all met.**
- **PM VERDICT: RM is clean and ready for independent Codex review.** The PM does not mark phases
  DONE; only the independent review does.
- OPEN: Codex RM review. R0 dispatches only after it passes.
