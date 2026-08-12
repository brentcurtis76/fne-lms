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
