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
