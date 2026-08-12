# PLAN — RLS (public-schema allowlist retirement)

META
- REPO / ROOT: `fne-lms` · worktree `/Users/brentcurtis/dev/wt/rls-public`
- GIT COMMON DIR: `/Users/brentcurtis/dev/fne-lms/.git` → lean overlay **ACTIVE**
- BRANCH: `fix/rls-public`, base `main` @ `43999499`, plan drafted at `c1dcf314`
- BRANCH CONVENTION: all phases land on `fix/rls-public` as sequential commits (≤20 chars, Vercel preview DNS — `CLAUDE.md` Executor Rule 1). One PR per phase.
- **THIS PLAN LIVES ONLY ON `fix/rls-public`.** It is not on `main`. Read it with
  `git show fix/rls-public:docs/plan/rls/PLAN.md` or work in the worktree above.
- PLAN FROZEN: **not yet** — pending one independent Codex plan review.
- WORKFLOW: canonical SOP + `~/.claude/agent-workflow/LEAN-WORKFLOW.md` (rolling wave; only the next executable phase is a full contract).

---

## Goal

Empty the legacy allowlist in `supabase/tests/001-rls-enabled.sql:58-66` — 22 `public` tables
that carry no RLS and hold direct `arwdDxt` grants to `anon` and `authenticated` — **and** close
the SECURITY DEFINER RPC surface that would otherwise bypass whatever policies those tables get.

Two completion conditions, in this order:

1. **Table DoD** — the allowlist array reaches `{}` and `tests.rls_enabled('public')` passes with
   no exception. Reached at the end of R9.
2. **Workstream DoD** — no `public` function reachable by `anon`/`PUBLIC` can write or disclose
   data that table RLS is supposed to govern. Reached at the end of R10. Table RLS is *not*
   complete while a `SECURITY DEFINER` function bypasses it, which is why R10 exists and why it
   is last rather than dropped.

## Non-goals

- **Dropping any table.** `CLAUDE.md` Database Safety forbids `DROP`/`TRUNCATE`; schema changes
  are additive only. §4 of the discovery document recommends eventually retiring
  `profiles_role_backup` — that is a **separate owner decision, not a phase here**.
- **Writing to production.** Every migration is applied to production by Brent, separately.
- **Verifying §6's one inferred claim** (that `anon` can write the 22 tables). Confirming it needs
  a write to production. It stays inferred; the remedy does not depend on it being measured.
- **Re-auditing the discovery.** `reviews/rls-public-allowlist-r1-findings.md` §6 marks what is
  proven. This plan consumes it; it does not re-derive it.
- **Fixing every unfixed `search_path` in the schema.** R1 hardens exactly one function
  (`has_global_workspace_access`) because it is load-bearing for three live policies. A general
  sweep is out of scope and is not silently implied.
- **Any UI, copy, or application-behaviour change** outside the two narrow route/service edits
  named in R4 and R10.

---

## Frozen architectural decisions

No phase may violate these without a Decision Log entry.

- **D-1 — Grant-list form, not enumerated revokes.** Every lockdown is
  `REVOKE ALL … FROM <role>;` followed by `GRANT <the single needed privilege> TO <role>;`.
  Enumerating privileges to revoke is forbidden: a future server version's new privilege lands on
  the granted side of the line. Precedent and rationale:
  `supabase/migrations/20260731140500_add_pasantias_leads.sql:134-148`.
- **D-2 — Assert over the real ACL.** pgTAP pins read `aclexplode(pg_class.relacl)` /
  `aclexplode(pg_proc.proacl)`, never `information_schema.role_table_grants`. The
  `information_schema` views report only SQL-standard privileges, which is exactly how an earlier
  pin missed PostgreSQL 17's `MAINTAIN` (`supabase/tests/030-pasantias-leads-rls.sql:13-26`).
- **D-3 — `PUBLIC` is revoked explicitly on every function.** PostgreSQL grants `EXECUTE` to
  `PUBLIC` by default. Only three functions in the entire baseline carry an explicit
  `REVOKE … FROM PUBLIC` (`00000000000000_baseline.sql:22315`, `:22368`, `:24046`) and **none of
  the ten in scope is one of them**. `REVOKE … FROM anon` alone therefore leaves an inherited
  `PUBLIC` grant standing and closes nothing.
- **D-4 — Rollback is never "disable RLS" or "restore the grants."** Both restore the
  vulnerability; both are blocked by `scripts/hooks/block-rls-disable.sh` and by
  `scripts/ci/check-rls-migrations.sh`. Every phase states what rollback actually is.
- **D-5 — Allowlist edits ship in the same commit as their migration and pgTAP coverage.**
  A phase that removes a table from `001-rls-enabled.sql` without landing both is incomplete.
  Source-test edits do not happen "inside" a migration.
- **D-6 — `service_role` is never narrowed.** It is the only intended write path for the
  service-only tables and it bypasses RLS. Every phase asserts it survives.
- **D-7 — A phase with a migration is not closed until the PRODUCTION schema is verified
  read-only** (columns, grants, RLS, function `EXECUTE`). Local and CI green prove code
  correctness and nothing about deployment — `docs/plan/zoom/PLAN.md:26` §0.1(d), written after
  Z1b shipped six unapplied migrations and broke session approval despite ten green rounds.
- **D-8 — Codex is the reviewer, never the implementer.** Codex authored the diagnosis
  (`reviews/rls-public-allowlist-r1-findings.md`), so separation of duties makes it the
  independent reviewer of this plan and of every phase. Implementation is a fresh Claude Code
  executor in this worktree.

---

## Phase index

| ID | Name | Risk | Status | Allowlist after | Depends on | Owner gate |
|----|------|------|--------|-----------------|-----------|------------|
| R1 | Close the anonymous reach — 10 function `EXECUTE` revocations + `profiles_role_backup` | HIGH | **TODO — full contract below** | 21 | — | none |
| R2 | Six empty legacy student tables (Ley 21.719) | HIGH | OUTLINE | 15 | R1 | none |
| R3 | Remaining dead / service-only tables | HIGH | OUTLINE | 7 | R1 | **Q1** |
| R4 | Retire the broken `qa_tester_time_logs` reader, then lock it down | HIGH | OUTLINE | 6 | R1 | none |
| R5 | `instructors` policy | HIGH | OUTLINE | 5 | R1 | **Q2** |
| R6 | `growth_community_transformation_access` policy | HIGH | OUTLINE | 4 | R1 | **Q3** |
| R7 | `learning_paths` + `learning_path_courses` (coupled) | HIGH | OUTLINE | 2 | R1 | none |
| R8 | `group_assignment_discussions` policy | HIGH | OUTLINE | 1 | R1 | none |
| R9 | `modules` — riskiest, last of the tables | HIGH | OUTLINE | **0** | R1–R8 | **Q4** |
| R10 | Actor-derivation redesign of `submit_quiz` + 5 learning-path RPCs | HIGH | OUTLINE | 0 | R1, R7 | none |

Every phase is `HIGH` under overlay §3: all ten touch RLS/grants or ship a migration. That is an
honest classification, not inflation — there is no `STANDARD` work in this workstream.

**Dependency graph.** R1 is the root and blocks nothing structurally — R2…R9 could each run
without it — but it runs first because it is the largest risk reduction per line available and
carries zero behaviour change. R7 is one phase, not two: `learning_paths` and
`learning_path_courses` are read as a pair across ~31 sites and neither can be secured in
isolation (§5). R9 is last because enabling RLS on `modules` activates three already-present
policies whose coverage is unproven. R10 depends on R7 because hardening the learning-path RPCs'
authorization needs the policies R7 designs as the reference model.

---

## Owner decisions — Brent

None of these blocks R1. Each is stated with the phase it gates and what happens if it is not
answered in time.

| # | Question | Gates | If unanswered |
|---|---|---|---|
| **Q1** | Does anything **outside this repository** read `menu_permissions` (104 rows) or `deleted_courses` (12 rows)? A Retool/Metabase board, a manual query, a cron script. | R3 | R3 splits: the six zero-row tables ship, and those two hold. The repo audit is exhaustive for visible code but §6 is explicit that it cannot see an external consumer. |
| **Q2** | Are all 17 `instructors` rows publishable profiles, or are some internal-only? | R5 | R5 cannot ship. A policy cannot infer publication from a parent course when the table is queried directly; if some rows are internal, an explicit publication flag is needed first (an additive column, so still within hard rules). |
| **Q3** | May `consultor` assign/revoke transformation access? `isUserAdmin()` treats `consultor` as admin while the route copy says "solo admins". | R6 | R6 ships read-only policies and defers the write policy, or holds entirely. Encoding the wrong answer silently grants or removes a real capability. |
| **Q4** | Enrollment status semantics: do `paused` / `dropped` / `expired` / `completed` enrollments retain `modules` access? | R9 | R9 cannot ship. `auth_is_course_student()` checks that *any* enrollment exists and ignores status entirely, so the answer decides whether activating the existing policy is a no-op or a lockout. |

---

# Phase R1 — Close the anonymous reach

**Risk: HIGH** (RLS/grants, migration, security). **Status: TODO.** **Depends on: nothing.**

Largest risk reduction per line available in this workstream. It closes every *proven* anonymous
write path and removes the privileged-role roster from the internet, with **no policy design, no
application redesign, and no behaviour change for any authenticated caller**.

## Why this is one phase and not two

The discovery document's "Step 0" bundled a mechanical `REVOKE EXECUTE` with a full
actor-derivation redesign of six SECURITY DEFINER functions. Those have wildly different risk and
are split here: the mechanical half is R1, the redesign is R10. The caller audit that makes the
split clean was run on `main` @ `43999499` and re-verified on this branch at `c1dcf314`:

| Function (signature for `REVOKE`) | Repository callers | R1 action |
|---|---|---|
| `has_transformation_access(uuid)` | **none** (grep over `*.ts`/`*.tsx`/`*.js`, excluding `types/supabase.ts`, `node_modules`) | revoke `PUBLIC` + `anon` + `authenticated` |
| `get_available_assignment_templates(uuid)` | **none** | revoke `PUBLIC` + `anon` + `authenticated` |
| `cleanup_propuesta_rate_limits()` | **none** | revoke `PUBLIC` + `anon` + `authenticated` |
| `has_global_workspace_access(uuid)` | **none** in app code; **three live policies** (below) | revoke `PUBLIC` + `anon`; keep `authenticated`; pin `search_path` |
| `submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)` | `lib/services/quizSubmissions.js:75` | revoke `PUBLIC` + `anon` only |
| `create_full_learning_path(text, text, uuid[], uuid)` | `lib/services/learningPathsService.ts:69` | revoke `PUBLIC` + `anon` only |
| `update_full_learning_path(uuid, text, text, uuid[], uuid)` | `lib/services/learningPathsService.ts:256` | revoke `PUBLIC` + `anon` only |
| `batch_assign_learning_path(uuid, uuid[], uuid[], uuid)` | `lib/services/learningPathsService.ts:313` | revoke `PUBLIC` + `anon` only |
| `start_learning_path_session(uuid, uuid, uuid, character varying)` | `pages/api/learning-paths/session/start.ts:86` | revoke `PUBLIC` + `anon` only |
| `end_learning_path_session(uuid)` | `pages/api/learning-paths/session/end.ts:49` | revoke `PUBLIC` + `anon` only |

Two corrections to the inherited table, both verified: `update_full_learning_path` is at
`learningPathsService.ts:256` (not unspecified), and `end_learning_path_session` is at
`pages/api/learning-paths/session/end.ts:49` — it does have a named call site.

`submit_quiz`'s live path is a **browser** client, which is why keeping `authenticated` preserves
the student quiz flow: `components/quiz/QuizTaker.tsx:6,31,114` and
`components/quiz/LearningQuizTaker.tsx:6,33,152` both `useSupabaseClient()` and inject it into
`submitQuiz`. The other three `submit_quiz` hits (`scripts/seed-qa-phase2*.js`) construct clients
from `SUPABASE_SERVICE_ROLE_KEY` (`seed-qa-phase2.js:12,20`) and are unaffected.

## The added item — `has_global_workspace_access`

Not in the discovery document. Found during ZOOM Z7-1's Codex review; it had no owner. Verified
on this branch:

- `supabase/migrations/00000000000000_baseline.sql:3987-3999` — `SECURITY DEFINER`,
  `LANGUAGE plpgsql`, **unqualified `FROM user_roles`**, and **no `SET search_path`**.
- `:23982` — `GRANT ALL ON FUNCTION … TO "anon"`.
- `:18196`, `:18203`, `:18210` — three live `community_meetings` policies (INSERT `WITH CHECK`,
  DELETE `USING`, SELECT `USING`), **all `TO authenticated`**, each opening with
  `public.has_global_workspace_access(auth.uid()) OR …`.

It belongs in R1 rather than a phase of its own: it is the same mechanical class as the other
nine (revoke `anon` on a SECURITY DEFINER function with zero repository callers), the hardening is
one additive `ALTER FUNCTION`, and the Zoom plan's Z6 builds directly on those three policies. A
phase containing one line is loop overhead, not risk management.

**Honest exploitability, stated rather than inflated.** The missing `search_path` is a latent
hazard, not a demonstrated exploit. Shadowing `public.user_roles` needs `CREATE` on a schema, and
the baseline grants `anon`/`authenticated` only `USAGE` on `public`
(`00000000000000_baseline.sql:21932-21933`); no `CREATE` grant to either role appears in the
baseline. The `pg_temp` variant is not reachable through PostgREST, which offers no way to create
a temporary relation. It is fixed here as cheap defence-in-depth on a function three live
policies depend on — the same *class* as the invoker-rights trap §5 records for
`validate_assignment_instance_course`, without the same proven reachability.

**`pg_temp` must be named last.** PostgreSQL searches the temporary schema *first* for relation
names when `pg_temp` is not listed in `search_path` ("The Schema Search Path", PostgreSQL
documentation). So the hardened form is `SET search_path = public, pg_temp` — writing
`SET search_path = public` alone leaves `pg_temp` implicitly first and re-opens the hazard the
pin exists to close. [A5] enforces the explicit two-element form.

## Scope

- **One new migration**, `supabase/migrations/<UTC timestamp>_rls_r1_revoke_anon_execute.sql`.
  Content, in the D-1 grant-list form only:
  - `REVOKE ALL ON FUNCTION … FROM PUBLIC;` + `FROM anon;` for all ten functions.
  - `REVOKE ALL … FROM authenticated;` for the three zero-caller RPCs.
  - `REVOKE ALL … FROM authenticated;` then `GRANT EXECUTE … TO authenticated;` for the six
    live RPCs and `has_global_workspace_access`.
  - `ALTER FUNCTION public.has_global_workspace_access(uuid) SET search_path = public, pg_temp;`
  - `REVOKE ALL ON public.profiles_role_backup FROM anon;` + `FROM authenticated;` then
    `ALTER TABLE public.profiles_role_backup ENABLE ROW LEVEL SECURITY;` — **no policy.**
  - `COMMENT ON TABLE public.profiles_role_backup` recording why it is locked and that retirement
    is a separate owner decision.
- **One new pgTAP file**, `supabase/tests/050-rpc-execute-and-role-backup.sql` (050 is free:
  existing files are 000, 001, 002, 010–014, 020, 030, 040).
- **Edit** `supabase/tests/001-rls-enabled.sql` — remove `'profiles_role_backup'` from the
  allowlist array, leaving 21 entries, and update the count in the comment at `:46-50`.
- **Write** `docs/plan/rls/reviews/R1-review-request.md` and
  `docs/plan/rls/evidence/R1-gates.md`.
- **Append** the round entry to `docs/plan/rls/LEDGER.md`.

Six files. Well inside the ≤10 / ≤600-net-line sizing rule.

## Explicitly out of scope

- Any policy on `profiles_role_backup`. It gets RLS with **zero** policies; it has zero readers.
- Dropping `profiles_role_backup`, or proposing its retirement in code or migration.
- Any change to the *bodies* of `submit_quiz` or the five learning-path RPCs. R1 changes
  privileges only. Actor derivation, enrollment checks and trusted scoring are R10.
- `search_path` on any function other than `has_global_workspace_access`.
- Any of the other 21 allowlist tables.
- Any application, route, component, or service file. **R1 touches no TypeScript or JavaScript.**
- Adding `REVOKE`s for functions not in the ten-row table above, however tempting the adjacent
  `grep` hit.

## Acceptance criteria

Each independently checkable by running something. `<fn>` below means all ten functions.

- [ ] **A1** The migration is additive: no `DROP`, no `TRUNCATE`, no destructive `ALTER`. Verified
      by `grep -niE 'drop|truncate' <migration>` returning only matches inside comments, if any.
- [ ] **A2** The migration file does **not** contain the phrase `disable row level security` in
      any case, **including in comments** — `scripts/ci/check-rls-migrations.sh` greps
      `-rniE 'disable[[:space:]]+row[[:space:]]+level[[:space:]]+security'` across all migration
      text. `bash scripts/ci/check-rls-migrations.sh` exits 0.
- [ ] **A3** For the three zero-caller RPCs, `aclexplode(pg_proc.proacl)` carries **no entry** for
      `PUBLIC` (grantee oid `0`), `anon`, or `authenticated`.
- [ ] **A4** For the six live RPCs and `has_global_workspace_access`,
      `aclexplode(pg_proc.proacl)` carries exactly `{EXECUTE}` for `authenticated` and **no
      entry** for `PUBLIC` or `anon`.
- [ ] **A5** `pg_proc.proconfig` for `has_global_workspace_access(uuid)` contains exactly
      `search_path=public, pg_temp` — asserted as a string, so a `public`-only pin fails.
- [ ] **A6** `has_function_privilege('service_role', '<fn>', 'EXECUTE')` is true for all ten.
- [ ] **A7** Behavioural anon denial: as `anon`, `SELECT public.cleanup_propuesta_rate_limits()`,
      `SELECT public.has_transformation_access('…'::uuid)` and
      `SELECT public.has_global_workspace_access('…'::uuid)` each raise `42501`
      (`throws_ok`). These three need no fixtures and perform no write.
- [ ] **A8** `has_global_workspace_access` still returns `true` for an active `admin` and an
      active `consultor`, and `false` for a `docente`, called as `authenticated` — the
      `search_path` pin did not change resolution. This is what keeps the three
      `community_meetings` policies working.
- [ ] **A9** `profiles_role_backup`: `tests.rls_enabled('public','profiles_role_backup')` passes,
      and `pg_policies` returns **zero** rows for it.
- [ ] **A10** `profiles_role_backup`: `aclexplode(pg_class.relacl)` carries no entry for `anon`
      and none for `authenticated`.
- [ ] **A11** Behavioural, per role: as `anon` and as an authenticated `docente`, each of
      `SELECT` / `INSERT` / `UPDATE` / `DELETE` / `TRUNCATE` on `profiles_role_backup` raises
      `42501`. `TRUNCATE` is the one RLS never evaluates — it is the reason A10 exists.
- [ ] **A12** As `service_role`, `SELECT` on `profiles_role_backup` succeeds. No migration
      statement writes, deletes, or alters any row.
- [ ] **A13** `supabase/tests/001-rls-enabled.sql` allowlist has exactly 21 entries,
      `profiles_role_backup` absent, and the `:46-50` comment says 21 rather than 22.
- [ ] **A14** All required gates green, with the jsdom proof in A15 satisfied first:
      `npm run type-check && npm run lint && npm test && npm run build`, plus
      `npm run test:db`. E2E is not required — no UI file is touched.
- [ ] **A15** **jsdom proof, mandatory before any test count is reported as evidence.**
      `node -e "require('jsdom')"` exits 0, **and** the `npm test` summary shows a non-zero
      `environment` time. See "Gate hazard" below — this worktree currently fails both.

## Test plan

**New file — `supabase/tests/050-rpc-execute-and-role-backup.sql`.** Model it on
`supabase/tests/030-pasantias-leads-rls.sql`, which is the repo's worked precedent for exactly
this shape: ACL-level pins (`:100-118`), privilege-layer `throws_ok` per role (`:340-382`), and
`pg_temp` impersonation helpers (`:215-238`). Reuse those helpers verbatim; do not invent new ones.

Named assertions, grouped:

- `r1_acl_dead_rpcs` — A3, three functions × grantee absence.
- `r1_acl_live_rpcs` — A4, seven functions × `{EXECUTE}` for `authenticated` only.
- `r1_proconfig_search_path` — A5.
- `r1_service_role_execute_survives` — A6.
- `r1_anon_execute_denied` — A7, three `throws_ok('42501')`.
- `r1_workspace_access_still_resolves` — A8, three `is()` over admin / consultor / docente.
- `r1_role_backup_rls_no_policy` — A9.
- `r1_role_backup_acl_empty` — A10.
- `r1_role_backup_denied_anon` / `r1_role_backup_denied_docente` — A11, five commands each.
- `r1_role_backup_service_role_reads` — A12.

Fixtures: `auth.users` + `profiles` + `user_roles` rows for an admin, a consultor and a docente,
following `030-pasantias-leads-rls.sql:178-198`. The file runs inside `BEGIN … ROLLBACK`.

**Exact commands:**

```bash
node -e "require('jsdom')" && npm run type-check && npm run lint && npm test && npm run build && npm run test:db
```

To run the new pgTAP file alone during implementation:

```bash
supabase test db --file supabase/tests/050-rpc-execute-and-role-backup.sql
```

**PostgreSQL version divergence is real and already handled in this repo.** `supabase/config.toml`
has no `[db]` section and therefore pins no `major_version`, so local and CI run the CLI's
default image while production is 15.8 (`030-pasantias-leads-rls.sql:20-26`). `aclexplode` over
`relacl`/`proacl` behaves identically on both, so R1's pins need no version guard — but do not
add a `MAINTAIN` probe without the `server_version_num` guard that `030` uses at `:141-165`.

## Definition of done

All 15 criteria checked; every gate in A14 green with A15's jsdom proof shown; migration additive
and idempotent; `docs/plan/rls/reviews/R1-review-request.md` committed with the content
`CLAUDE.md` Executor Rule 6 requires (branch + base SHA + commit count, objective, scope in/out,
files by risk, test evidence, the 3–5 areas a reviewer should scrutinise hardest with one honest
line each, and known limitations); raw command output in `docs/plan/rls/evidence/R1-gates.md`;
ledger entry appended; no BLOCKING Codex finding.

**D-7 applies:** R1 is not *closed* until Brent has applied the migration to production and the
production schema has been verified read-only — `proacl` for the ten functions, `proconfig` for
`has_global_workspace_access`, and `relrowsecurity` + `relacl` for `profiles_role_backup`. Codex
PASS on the branch is necessary and not sufficient.

## Risks / unknowns

1. **Gate hazard — this worktree cannot currently run the unit gate at all.** `node_modules` is
   absent (`ls -d node_modules` → No such file or directory), so both
   `node -e "require('jsdom')"` and `node -e "require('canvas')"` fail `MODULE_NOT_FOUND`. The
   executor must `npm ci` first. Beyond that: `npm test` is `vitest run` **with no canvas
   preload**, while every other test script in `package.json` carries
   `cross-env NODE_OPTIONS=--require=./tests/mocks/register-canvas.js`, and
   `tests/mocks/register-canvas.js:3-7` swallows the load failure in a bare `try/catch`. That is
   the documented failure mode in which a green 254-file / 6,575-test summary silently drops 51
   jsdom files under Vitest 0.34 with exit 0. **A15 exists because of this and is not optional.**
   A test count reported without the jsdom proof is not evidence.
2. **The three zero-caller RPCs lose `authenticated` too, and an out-of-repo caller is invisible.**
   Same blind spot class as Q1. Failure direction is **safe** — denial, not exposure — and the
   forward fix is a new migration re-granting `EXECUTE` **to `authenticated` only** on the single
   named function. That is not "restoring the grants": `PUBLIC` and `anon` stay revoked.
3. **`REVOKE … FROM anon` without `FROM PUBLIC` would close nothing.** D-3 records why. This is
   the single most likely way to ship an R1 that passes a careless review and fixes nothing —
   A3/A4 assert grantee *absence* including oid `0` precisely to catch it.
4. **The CI migration guard greps comments too.** Any rollback prose in the migration that spells
   out the forbidden phrase fails the PR. A2 exists for this.
5. **`search_path` form.** If the executor finds that `SET search_path = public, pg_temp` breaks
   resolution of `user_roles` — it should not, `user_roles` is in `public` — that is a
   `STATUS: FINDINGS` return, not a workaround.
6. **UNVERIFIED — whether an out-of-repo authenticated integration calls the six live RPCs.**
   Not load-bearing for R1: `authenticated` retains `EXECUTE` on all six, so any such caller is
   unaffected. It becomes load-bearing in R10 and is flagged there.

## Rollback

Not "disable RLS" and not "restore the grants" — both restore the vulnerability and both are
blocked by `scripts/hooks/block-rls-disable.sh` and `scripts/ci/check-rls-migrations.sh` (D-4).

- **Before production apply:** revert the commits on `fix/rls-public`. The migration has never
  run against production; reverting is a no-op there.
- **After production apply, if a zero-caller RPC turns out to have an external authenticated
  consumer:** a new forward migration granting `EXECUTE` on that one named function to
  `authenticated` only. Never to `PUBLIC` or `anon`.
- **A live RPC breaking for authenticated users is impossible by construction** — they keep
  `EXECUTE`. If observed, the cause is elsewhere; investigate before changing any grant.
- **`profiles_role_backup` has zero readers**, so there is no rollback scenario. If one surfaced,
  the forward fix is a service-role read path — never re-granting `anon`/`authenticated`, never
  disabling RLS.
- **The `search_path` pin** is reverted by `ALTER FUNCTION … RESET search_path`, additive and
  non-destructive, if and only if A8 proves false in production.

## Falsification record (overlay §4.1 — required for HIGH)

**CLAIM 1** — Revoking `EXECUTE` from `PUBLIC` + `anon` on the ten functions breaks no repository
caller.
COUNTEREXAMPLE — an in-repo call path that runs as `anon`, e.g. an unauthenticated SSR page or a
route using the publishable key with no session.
CHECK — `grep -rn '<fn>' --include='*.ts' --include='*.tsx' --include='*.js'` over the worktree,
excluding `node_modules` and `types/supabase.ts`; then the client factory for each hit
(`components/quiz/QuizTaker.tsx:31`, `LearningQuizTaker.tsx:33` → `useSupabaseClient()`;
`scripts/seed-qa-phase2.js:12,20` → `SUPABASE_SERVICE_ROLE_KEY`).
RESULT — **supported.** Every live caller is browser-authenticated or service-role. All six live
RPCs keep `authenticated`.
BLIND SPOT — an out-of-repo caller. Grep cannot see a Retool board, a partner integration, or a
manual script. Failure direction is denial, which is safe.

**CLAIM 2** — `REVOKE … FROM anon` alone is insufficient; `PUBLIC` must be revoked explicitly.
COUNTEREXAMPLE — the baseline already revoked `PUBLIC` on these functions, making it redundant.
CHECK — `grep -c REVOKE supabase/migrations/00000000000000_baseline.sql` → 3, at `:22315`,
`:22368`, `:24046` — `bot_save_expense_item`, `can_edit_meeting`, `is_admin_or_consultor`.
RESULT — **supported.** None of the ten is among them, so PostgreSQL's default `EXECUTE` to
`PUBLIC` stands on all ten. Frozen as D-3.
BLIND SPOT — the baseline dump is the local record. Production `proacl` was read during discovery
and is consistent, but D-7's post-apply verification is what proves it there.

**CLAIM 3** — Keeping `authenticated` on `submit_quiz` preserves the student quiz flow.
COUNTEREXAMPLE — the live path runs as `anon`, e.g. an unauthenticated quiz preview.
CHECK — `components/quiz/QuizTaker.tsx:6,31,114` and `LearningQuizTaker.tsx:6,33,152` —
`useSupabaseClient()` from `@supabase/auth-helpers-react`, injected into `submitQuiz`
(`lib/services/quizSubmissions.js:73-83`).
RESULT — **supported.** Browser client with a restored session = `authenticated`.
BLIND SPOT — a logged-out user reaching a quiz component would already fail on
`quiz_submissions` RLS, so R1 does not change that outcome. Not re-verified here.

**CLAIM 4** — `profiles_role_backup` lockdown breaks nothing.
COUNTEREXAMPLE — any reader: app code, function body, trigger, or view.
CHECK — discovery §4 (zero references outside the baseline that creates it at `:9916` and the
allowlist that exempts it; no function, trigger, or view; §6 confirms no view depends on any of
the 22). Re-confirmed here for the *repo* by the same grep sweep.
RESULT — **supported.**
BLIND SPOT — out-of-repo readers, as with Q1. 25 rows of historical role state; the table is a
completed migration's scratch space.

**CLAIM 5** — Revoking `anon` on `has_global_workspace_access` cannot break the three
`community_meetings` policies.
COUNTEREXAMPLE — a policy on that table that applies to `anon`, or an `anon` path reaching the
function through RLS.
CHECK — `00000000000000_baseline.sql:18196`, `:18203`, `:18210` — all three are `TO authenticated`.
`community_meetings` is absent from the 22-table allowlist (`001-rls-enabled.sql:58-66`), so its
RLS is enabled and the policies are live rather than inert.
RESULT — **supported.** `anon` never matches a `TO authenticated` policy, so the function is never
invoked on its behalf there. A8 pins the `authenticated` outcome.
BLIND SPOT — whether some *other* policy elsewhere calls this function. `grep` over all migrations
found uses only at `:3987`, `:4002`, `:18196`, `:18203`, `:18210`, `:23982-23984`.

**CLAIM 6** — The missing `search_path` is currently exploitable.
COUNTEREXAMPLE — `anon`/`authenticated` lack `CREATE` on any schema, so no shadow relation can be
planted.
CHECK — `grep -n 'ON SCHEMA "public"' 00000000000000_baseline.sql` → `:21931-21934`, `GRANT USAGE`
only for `postgres`, `anon`, `authenticated`, `service_role`. No `CREATE` grant to either public
role appears in the baseline. PostgREST exposes no way to create a temporary relation.
RESULT — **refuted as a live exploit; retained as defence-in-depth.** The plan text says so
explicitly rather than inheriting the stronger framing. It still ships in R1: one additive line,
on a function three live policies depend on, which Zoom Z6 will build on.
BLIND SPOT — production `CREATE` grants were not re-queried (no production access from this
session). D-7's post-apply check covers the function's `proconfig`, not schema-level `CREATE`.

**CLAIM 7** — R1 fits one durable executor conversation.
COUNTEREXAMPLE — the pgTAP matrix is large enough to exhaust context.
CHECK — six files; one migration of roughly 40 statements; one pgTAP file modelled line-for-line
on the 502-line `030-pasantias-leads-rls.sql`, which a single session produced.
RESULT — **supported**, with the caveat that A15's `npm ci` must happen at the start, not after
the diff is written.
BLIND SPOT — none material. If context does run short, the split point is clean: functions first,
`profiles_role_backup` second.

---

# Future phases — bounded outlines

Rolling wave (overlay §3): these are deliberately short. Each becomes a full contract, expanded
and repaired in place, immediately before dispatch. Do not execute from an outline.

### R2 — Six empty legacy student tables · HIGH · after R1

`student_answers`, `submissions`, `answers`, `assignments`, `quizzes`, `questions`. `REVOKE ALL`
from `anon` + `authenticated`, `ENABLE ROW LEVEL SECURITY`, **no policy**. All six are dead
relations at 0 rows (§3 Group A1) — `submit_quiz` writes `quiz_submissions`, not these. **This is
the Ley 21.719 item and it is free precisely because the tables are empty**; it costs nothing
today and becomes expensive the moment Fase 2 writes the first row of minor data. Allowlist 21 → 15.
Rollback: forward-only; a reader that surfaces gets a policy, never a restored grant.
Watch: `components/assignments/*` matches are `supabase.storage.from('assignments')`, the storage
bucket, not the table (§3) — do not "fix" them.

### R3 — Remaining dead / service-only tables · HIGH · after R1 · gated on **Q1**

`menu_permissions`, `metadata_sync_log`, `propuesta_rate_limits`, `course_prerequisites`,
`deleted_blocks`, `deleted_courses`, `deleted_lessons`, `deleted_modules`. Same treatment.
`propuesta_rate_limits` additionally needs a **positive** `service_role` test — it is the one
service-role-only table (§3 Group A2) and D-6 says prove it survives. Allowlist 15 → 7.
If Q1 is unanswered, split: the six zero-row tables ship, `menu_permissions` (104 rows) and
`deleted_courses` (12 rows) hold.

### R4 — `qa_tester_time_logs` · HIGH · after R1

Retire the broken reader first, then lock the table down. `pages/api/qa/time-tracking.ts:78-128`
queries columns that do not exist (`log_date`, `total_active_seconds`, …); production returns
`42703`. The route already has a working `qa_test_runs` fallback. Make the route use it
explicitly and add a regression test — **do not** switch the broken branch to `service_role`,
which only guarantees the invalid query keeps failing. Then `REVOKE` + `ENABLE RLS`, no policy,
on the empty table. Allowlist 7 → 6. The only future phase besides R10 that touches application
code.

### R5 — `instructors` · HIGH · after R1 · gated on **Q2**

First of Group B. 17 rows, broad read surface, simple data. `pages/courses/[id].tsx` is an
**unauthenticated SSR surface**, so an authenticated-only policy is insufficient — published-course
instructor identity is legitimately public. Prefer **column grants** (`id`, `full_name`,
`photo_url`, `bio`, `specialty`) over restoring `ALL`; deny browser writes; `service_role` keeps
management. Allowlist 6 → 5.

### R6 — `growth_community_transformation_access` · HIGH · after R1 · gated on **Q3**

Access-control table, 7 rows. **Must not call `has_transformation_access` from its own policy** —
that function reads this same table and would recurse. Use a direct `user_roles`/community
predicate or a non-recursive helper. Revocation is `UPDATE`, not `DELETE`. Allowlist 5 → 4.

### R7 — `learning_paths` + `learning_path_courses` · HIGH · after R1

One phase, not two: read as a pair across ~31 sites, and `learning_path_courses` must inherit
authorization from its parent `learning_paths` row rather than exposing every path whose course is
visible. Open ruling to settle in the contract: `admin`, `equipo_directivo` and `consultor`
currently hold effectively global management while rows can carry null `school_id`/`generation_id`
— decide global-vs-scoped and backfill usable scope before writing a narrower policy. Inserts
stamp `created_by = auth.uid()`. Allowlist 4 → 2.

### R8 — `group_assignment_discussions` · HIGH · after R1

Zero rows, but a **live** code path (`lib/services/groupAssignments.js:210,267`,
`groupAssignmentsV2.js:1048`), so it can be designed without data pressure but not skipped.
`SELECT` + `INSERT` for group members and authorized managers only; no browser `UPDATE`/`DELETE`
is currently needed. Open ruling: the unique index includes `thread_id`, so concurrent callers can
create multiple mappings for one assignment/group — decide whether creation becomes atomic and
unique on `(assignment_id, group_id)` first. Allowlist 2 → 1.

### R9 — `modules` · HIGH · after R1–R8 · gated on **Q4**

**The riskiest phase and the last of the tables.** 71 rows, 27 call sites, mostly browser.
It already carries three policies (`modules_admin_all`, `modules_student_view`,
`modules_teacher_manage`), all `TO authenticated`, all **inert because RLS is off** — enabling RLS
activates them as-is. They authorize by admin status, course-teacher relationship, or enrollment,
**not** by the nine role names, so coverage of non-teaching roles is unproven. The
relationship × role × enrollment-status matrix must be tested before the flip.
Carries the §5 trap: `validate_assignment_instance_course` is an **invoker-rights** trigger on
`assignment_instances` that `SELECT`s `modules` and raises `'Template not found'` on an empty
read. Safe today only because the sole writer
(`pages/api/admin/growth-communities/[id]/index.ts:113`) uses `createServiceRoleClient()`. Either
make it `SECURITY DEFINER` in the same migration or pin the invariant with pgTAP — the phase
contract must name which. **Allowlist reaches `{}` here.**

### R10 — Actor-derivation redesign · HIGH · after R1 and R7

`submit_quiz` plus the five learning-path mutation RPCs. Last, not first: it needs enrollment and
ownership rules, a trusted scoring source, and its own pgTAP matrix — none of which exist before
R7. Derive every acting user from `auth.uid()` instead of the caller-supplied `p_student_id` /
`p_created_by` / `p_updated_by` / `p_assigned_by` / `p_user_id`; make `end_learning_path_session`
prove the session belongs to the actor; validate enrollment, ownership and management scope inside
each function; set safe `search_path` on each.
The trusted quiz source already exists (§5): `blocks.id` is the UUID passed as `p_block_id`, and
`blocks.payload` holds the `QuizBlockPayload` the browser currently echoes back as `p_quiz_data`.
A backward-compatible `CREATE OR REPLACE FUNCTION` keeps the signature — so the existing client
keeps working while its redundant parameters are deprecated — and avoids destructive replacement.
The UNVERIFIED out-of-repo-caller question becomes load-bearing here, because R10 changes
behaviour rather than privileges: a signature-compatible replacement is what bounds the risk.

---

## Blind spots — whole workstream

Stated per overlay §3 instead of claiming completeness.

1. **Out-of-repo consumers are invisible.** The audit covers `.from()`/`.rpc()` across
   `.ts`/`.tsx`/`.js`, function bodies, triggers, view dependencies, and raw REST. It cannot see a
   Retool board, a Metabase query, a partner integration, or a manual script. Q1 asks about the
   two plausible candidates. **Failure direction is safe in every phase: denial, never exposure.**
2. **Write reachability stays inferred.** §6's one inferred claim. Verifying it needs a write to
   production and will not be done. The remedy does not depend on it.
3. **Bearer-only external clients.** `getApiUser()` accepts an `Authorization` header while
   `createApiSupabaseClient()` restores only cookies (`lib/api-auth.ts:16-28`). Every in-repo
   caller found uses same-origin cookie requests. Policy integration tests must make the supported
   transport explicit — this bites in R5–R9, not R1.
4. **Local PostgreSQL is not production PostgreSQL.** `supabase/config.toml` pins no
   `[db] major_version`; production is 15.8. D-7 exists because of this.
5. **Whether the existing `modules` policies preserve every legitimate reader is unknown.** R9
   must test the matrix rather than assume either success or breakage.

---

## Decision log

| Date | Decision | Rationale | Raised by |
|---|---|---|---|
| 2026-08-12 | Discovery artifact `git mv`d from `docs/plan/reviews/` to `docs/plan/rls/reviews/` | Workstream self-containment; it is r1's DISCOVERY output in the overlay's sense | Brent (PM prompt) |
| 2026-08-12 | The document's "Step 0" is split: mechanical `REVOKE` → R1, actor-derivation redesign → R10 | Wildly different risk; R1 has zero behaviour change while R10 rewrites six function bodies | ZOOM PM, carried over with the caller audit |
| 2026-08-12 | `has_global_workspace_access` added to R1 rather than a phase of its own | Same mechanical class, zero repo callers, one additive `ALTER`; Zoom Z6 builds on the three policies it guards | ZOOM Z7-1 Codex review |
| 2026-08-12 | Its `search_path` gap is recorded as **defence-in-depth, not a live exploit** | `anon`/`authenticated` hold `USAGE` only on `public` (baseline:21932-21933); PostgREST cannot create a temp relation | This plan — a deliberate weakening of the inherited framing |
| 2026-08-12 | Review-request artifacts live at `docs/plan/rls/reviews/R<n>-review-request.md`, not `docs/planning/reviews/fase-<N>-review-request.md` | `CLAUDE.md` Executor Rule 6 names itinerary *fases*; this workstream's units are R1–R10. Content requirements are honoured in full. **Flagged for the Codex plan review to rule on.** | This plan |
| 2026-08-12 | Retiring `profiles_role_backup` is an owner decision, not a phase | `CLAUDE.md` Database Safety forbids `DROP`; 25 rows of historical role state may have audit value | Discovery §4 |
