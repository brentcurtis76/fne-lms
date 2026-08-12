# PLAN — RLS (public-schema allowlist retirement)

META
- REPO / ROOT: `fne-lms` · worktree `/Users/brentcurtis/dev/wt/rls-public`
- GIT COMMON DIR: `/Users/brentcurtis/dev/fne-lms/.git` → lean overlay **ACTIVE**
- BRANCH: `fix/rls-public`, base `main` @ `43999499`, plan drafted at `c1dcf314`
- BRANCH CONVENTION: all phases land on `fix/rls-public` as sequential commits (≤20 chars, Vercel preview DNS — `CLAUDE.md` Executor Rule 1). One PR per phase.
- **THIS PLAN LIVES ONLY ON `fix/rls-public`.** It is not on `main`. Read it with
  `git show fix/rls-public:docs/plan/rls/PLAN.md` or work in the worktree above.
- PLAN FROZEN: **not yet** — Codex r1 FINDINGS (12 items, all accepted), Codex r2 FINDINGS
  (10 items, all accepted). Pending **r3**, scoped to the amendments only. The §1.5 two-round cap
  was reached and explicitly overridden by Brent on 2026-08-12 — see the Decision Log for the
  evidence that override names.
- WORKFLOW: canonical SOP + `~/.claude/agent-workflow/LEAN-WORKFLOW.md` (rolling wave; only the next executable phase is a full contract).

---

## Goal

Empty the legacy allowlist in `supabase/tests/001-rls-enabled.sql:58-66` — 22 `public` tables
that carry no RLS and hold direct `arwdDxt` grants to `anon` and `authenticated` — **and** close
the **public RPC bypass surface** that would otherwise bypass whatever policies those tables get.
"RPC bypass surface" rather than "SECURITY DEFINER surface": nine of the ten functions in R1 are
`SECURITY DEFINER`, but `cleanup_propuesta_rate_limits()` is invoker-rights and is exposed for the
opposite reason — it runs with the *caller's* privileges over a table `anon` can already write.
*(Codex r2, N3.)*

Three completion conditions:

1. **Table DoD** — the allowlist array reaches `{}` and `tests.rls_enabled('public')` passes with
   no exception. Reached at the end of R9.
2. **Named-function DoD** — none of the **ten functions this workstream has audited** can be
   executed by `anon`/`PUBLIC`, and none derives its acting user or its authorization from a
   caller-supplied parameter. Delivered by R1, R1b and R10.
3. **Surface DoD** — the remaining `public` functions carrying an `anon` grant are audited, and
   each is either revoked, hardened, or recorded as deliberately safe with evidence. Delivered by
   R11 and whatever phases R11's discovery produces.

**Condition 3 is new (Codex r2, B5) and it is a scope expansion, not a narrowed claim.** Codex's
proposed remedy was to shrink the DoD to the ten audited functions; Brent's ruling on
2026-08-12 was to expand the workstream instead. The finding stands either way: the previous
"no `public` function … can bypass RLS" wording was **already false** at the moment it was written.
Measured from `supabase/migrations/00000000000000_baseline.sql`:

| | count |
|---|---|
| `SECURITY DEFINER` functions in `public` | 90 |
| …carrying a `GRANT … TO anon` | 88 |
| …covered by R1's ten | 9 |
| **…outside the audit so far** | **79** — 9 return `trigger`, **70 are RPC-callable** |

`get_unread_notification_count(p_user_id uuid)` (`baseline.sql:3660-3672`, granted `anon` at
`:23825`) is the worked example: `SECURITY DEFINER`, unqualified `FROM user_notifications`,
caller-supplied subject, no `auth.uid()` check. At least 20 of the 70 take a caller-supplied user
identifier, including `create_notification`, `create_user_notification`,
`award_course_completion_badge`, `get_user_admin_status` and `get_effective_user_role`.

**Stated precisely, because the distinction is the whole point of §6: the grants are proven from
the baseline file. Reachability and exploitability of those 70 are UNMEASURED.** The discovery
document probed only the functions it named. 70 is a sizing figure, not 70 confirmed
vulnerabilities — establishing which is R11's job and the reason R11 is `DISCOVERY`.

R1 is the only phase whose contract is fully specified. Execution order is the `Order` column in
the phase index.

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
  vulnerability. **Only the first is mechanically blocked** — `scripts/hooks/block-rls-disable.sh`
  and `scripts/ci/check-rls-migrations.sh` match the phrase that disables RLS and nothing else;
  neither script inspects `GRANT` (`check-rls-migrations.sh:7`). Restoring a grant to
  `PUBLIC`/`anon` is therefore **prohibited by this plan and by review, not by a guard.** Reviewers
  must check for it by hand. Every phase states what rollback actually is.
  *(Amended after Codex plan review r1, S6 — the original text claimed guard coverage the scripts
  do not provide.)*
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

**Phase IDs are stable and never renumbered** — the ledger, prompts and review artifacts cite
them. Execution order is the `Order` column, which the Codex r1 review changed (S4).

| Order | ID | Name | Risk | Status | Allowlist after | Depends on | Owner gate |
|---|----|------|------|--------|-----------------|-----------|------------|
| 1 | R1 | Close the anonymous reach — 10 function `EXECUTE` revocations + `profiles_role_backup` | HIGH | **TODO — full contract below** | 21 | — | none |
| 2 | R1b | Bind `has_global_workspace_access` to `auth.uid()` | HIGH | OUTLINE | 21 | R1 | none |
| 3 | R2 | Six empty legacy student tables (Ley 21.719) | HIGH | OUTLINE | 15 | R1 | none |
| 4 | R3 | Remaining dead / service-only tables | HIGH | OUTLINE | 7 | R1 | **Q1** |
| 5 | R4 | Retire the broken `qa_tester_time_logs` reader, then lock it down | HIGH | OUTLINE | 6 | R1 | none |
| 6 | R5 | `instructors` policy | HIGH | OUTLINE | 5 | R1 | **Q2** |
| 7 | R6 | `growth_community_transformation_access` policy | HIGH | OUTLINE | 4 | R1 | **Q3** |
| 8 | R7 | `learning_paths` + `learning_path_courses` (coupled) | HIGH | OUTLINE | 2 | R1 | Q5 *(default)* |
| 9 | **R10** | Actor-derivation redesign of `submit_quiz` + 5 learning-path RPCs | HIGH | OUTLINE | 2 | R1, R7 | Q5 *(default)* |
| 10 | R8 | `group_assignment_discussions` policy | HIGH | OUTLINE | 1 | R1 | none |
| 11 | R9 | `modules` — riskiest, last of the tables | HIGH | OUTLINE | **0** | R1–R8 | **Q4** |
| 12 | **R11** | **DISCOVERY** — audit the remaining 70 anon-granted RPC-callable functions | **DISCOVERY** | OUTLINE | 0 | R1 | none |
| 13+ | R12… | Remediation phases, **defined by R11's output** — not invented here | HIGH | UNDEFINED | 0 | R11 | TBD by R11 |

Every phase except R11 is `HIGH` under overlay §3 — they touch RLS/grants or ship a migration.
R11 is `DISCOVERY`: the evidence needed to write a safe implementation contract for the 70 does
not exist yet, and per overlay §3 a `DISCOVERY` phase produces evidence and a revised contract
without smuggling implementation into research. **R12+ are deliberately left undefined.** Writing
phase contracts for 70 functions whose reachability is unmeasured would be inventing requirements
from guesses — the exact thing the overlay forbids.

**Dependency graph.** R1 is the root and blocks nothing structurally — R2…R9 could each run
without it — but it runs first because it is the largest risk reduction per line available and
changes no behaviour for any known in-repository caller. R1b follows immediately: R1 revokes
`anon` on `has_global_workspace_access` but leaves an authenticated oracle standing, and that item
must not be homeless (§1.4). R7 is one phase, not two: `learning_paths` and
`learning_path_courses` are read as a pair across ~31 sites and neither can be secured in
isolation (§5). R9 is last because enabling RLS on `modules` activates three already-present
policies whose coverage is unproven.

**R10 moved from last to directly after R7** (Codex r1, S4). It is not structurally dependent on
R7's *migration* — it depends on the same authorization decisions, which Q5 now settles. Since
authenticated identity and scoring forgery remain live after R1, R10 should not wait behind R8 and
R9. Its position after R7 is the earliest point at which its authorization model is decided.

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
| **Q5** *(ruling with a default — **not** a gate)* | Learning-path management scope: do `admin`, `equipo_directivo` and `consultor` keep **global** management of every learning path, or is management **scoped** to the manager's school/generation? Rows can carry null `school_id`/`generation_id` today, so a scoped rule needs a backfill first. | R7 and R10 — **neither is blocked** | **Default applies: both ship preserving today's effectively-global management**, recorded as explicit debt. That default does not widen access beyond today's behaviour, and narrowing later is a backfill plus `ALTER POLICY`, not a migration rewrite. *(Added r1 S3; reclassified from gate to ruling-with-default after Codex r2, S2 — calling it a gate while its unanswered branch still ships was a contradiction.)* |

---

# Phase R1 — Close the anonymous reach

**Risk: HIGH** (RLS/grants, migration, security). **Status: TODO.** **Depends on: nothing.**

Largest risk reduction per line available in this workstream. It closes every *proven* anonymous
write path and removes the privileged-role roster from the internet, with **no policy design and
no application redesign**.

**Behaviour-change promise, stated precisely** (Codex r1, S1). R1 changes no behaviour for any
**known in-repository authenticated caller**. It is not "no behaviour change for any
authenticated caller": three zero-caller RPCs lose `authenticated` `EXECUTE` outright, so an
out-of-repo authenticated integration calling them would break. That is a deliberate, bounded
risk — see Risk 2 and Rollback.

**What R1 does NOT close.** After R1, `has_global_workspace_access(uuid)` still lets any
*authenticated* caller ask whether an arbitrary UUID is an active `admin`/`consultor`, because the
function is `SECURITY DEFINER`, accepts a caller-supplied id, and bypasses `user_roles` RLS
(`user_roles` is not in the allowlist, so its RLS is on). R1 removes the anonymous path; **R1b
removes the authenticated one.** Do not read R1's "removes the privileged-role roster from the
internet" as covering both. *(Codex r1, B1 — the original plan left this item with no home.)*

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

Its **revocation and `search_path` pin** belong in R1: same mechanical class as the others, one
additive `ALTER FUNCTION`, and the Zoom plan's Z6 builds directly on those three policies. Its
**actor-binding** does not — that is a body change with its own matrix, and R1 is already at the
15-criterion cap, so §1.3 makes it a separate phase (R1b). Codex r1 (B1, ruling D) accepted R1 as
the right home for the mechanical half while requiring the oracle to be explicitly scheduled.

**Nine of the ten are `SECURITY DEFINER`; `cleanup_propuesta_rate_limits()` is not.** It is
`LANGUAGE sql`, invoker-rights (`baseline.sql:1882-1884`), and its body is a bare `DELETE FROM
propuesta_rate_limits`. Revoking it is still correct and still urgent — as invoker-rights it runs
with the *caller's* privileges, and `anon` currently holds `arwdDxt` on that table, so anonymous
execution deletes rows for real. *(Codex r1, N1.)*

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
- **Write** `docs/planning/reviews/fase-R1-review-request.md` — the **canonical** path required by
  `CLAUDE.md:43` Executor Rule 6. A one-line pointer to it goes in `docs/plan/rls/reviews/`;
  the pointer is a convenience, the canonical file is the artifact.
  *(Amended after Codex r1, B5 — the original plan relocated it by decision log. Repo hard rules
  outrank the plan, including this one; the overlay's own precedence list says so.)*
- **Write** `docs/plan/rls/evidence/R1-gates.md` — raw command output, including A15's two counts.
- **Write** the A1 statement-allowlist checker as a committed script.
- **Append** the round entry to `docs/plan/rls/LEDGER.md`.

**Sizing.** Eight files — within the ≤10 rule. The ≤600-net-line guidance **will be exceeded** and
that is accepted here rather than glossed: the pgTAP file alone will approach the 502-line
precedent, before ~40 migration statements, the checker script, and three documentation artifacts.
The cap is a proxy for "one durable executor conversation", and R1 meets the real constraint — the
work is mechanical and repetitive, not novel. **Bound it explicitly: prefer compact data-driven
assertions** (one `SELECT … FROM unnest(ARRAY[…]) ` loop over the ten signatures) **over ten
copy-pasted blocks.** If the pgTAP file passes ~350 lines, that is the signal the assertions are
being written long-hand, not that the phase is too big.
*(Codex r1, S5 — the original "well inside ≤600 net lines" was unsupported.)*

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

- [ ] **A1** **Exact-multiset migration check, not a syntactic category check.** A committed
      script (`scripts/ci/check-r1-migration.sh` or equivalent) strips comments and asserts the
      migration's executable statements are **exactly** the expected multiset — every statement
      matched on its *operation, target and grantee together*:
      `REVOKE ALL ON FUNCTION <sig> FROM PUBLIC|anon` for all ten named signatures;
      `REVOKE ALL … FROM authenticated` for the three zero-caller signatures only;
      `REVOKE ALL … FROM authenticated` + `GRANT EXECUTE … TO authenticated` for the seven others;
      `ALTER FUNCTION public.has_global_workspace_access(uuid) SET search_path = public, pg_temp`;
      `REVOKE ALL ON public.profiles_role_backup FROM anon|authenticated`;
      `ALTER TABLE public.profiles_role_backup ENABLE ROW LEVEL SECURITY`; and `COMMENT ON TABLE
      public.profiles_role_backup`. **Any extra statement fails, any missing statement fails, and
      any statement naming a function, table, or role outside this list fails.** The script's
      invocation appears in A14's gate command, not merely in prose.
      *(Amended after Codex r2, B1: the r1 remedy allowed the right *kinds* of statement against
      the wrong targets — an unrelated `GRANT EXECUTE … TO PUBLIC` on some other function passed
      the form check and escaped A3–A6, which only inspect the ten. A control that admits
      out-of-scope privilege changes while looking rigorous is worse than the grep it replaced.)*
- [ ] **A2** The migration file does **not** contain the phrase `disable row level security` in
      any case, **including in comments** — `scripts/ci/check-rls-migrations.sh` greps
      `-rniE 'disable[[:space:]]+row[[:space:]]+level[[:space:]]+security'` across all migration
      text. `bash scripts/ci/check-rls-migrations.sh` exits 0.
- [ ] **A3** For the three zero-caller RPCs, the **effective** ACL —
      `aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))` — carries **no entry** for
      `PUBLIC` (grantee oid `0`), `anon`, or `authenticated`. Back it with
      `NOT has_function_privilege('anon', <oid>, 'EXECUTE')` for each.
- [ ] **A4** For the six live RPCs and `has_global_workspace_access`, the same effective-ACL
      expression carries exactly `{EXECUTE}` for `authenticated` and **no entry** for `PUBLIC` or
      `anon`.
      *(A3/A4 amended after Codex r1, S2: raw `aclexplode(NULL)` returns zero rows even though the
      default `PUBLIC EXECUTE` applies, so a bare `proacl` read would silently pass a function
      whose grants were never materialised. These ten do carry explicit `PUBLIC` entries today, so
      the original form would have caught a missing `PUBLIC` revoke — but the criterion must be
      correct in general, not by accident of this schema.)*
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
- [ ] **A12** As `service_role`, `SELECT` on `profiles_role_backup` succeeds, and its column set
      is unchanged (`id`, `role`, `created_at`). **Row preservation is proved by A1's statement
      allowlist, not by this read** — a successful `SELECT` shows the table is readable, not that
      no row moved. The production row count (25) is checked under D-7 after apply; a local test
      database has no rows to count. *(Codex r1, B3.)*
- [ ] **A13** `supabase/tests/001-rls-enabled.sql` allowlist has exactly 21 entries,
      `profiles_role_backup` absent, and the `:46-50` comment says 21 rather than 22.
- [ ] **A14** All required gates green, **with both committed checkers invoked in the command
      itself** — see "Exact commands" below. E2E is not required; no UI file is touched.
      *(Codex r2, B1 and B2: a checker that exists but is never run by the gate is prose.)*
- [ ] **A15** **Suite-completeness proof via a committed external checker.** Vitest 0.34's JSON
      reporter emits the **executed** set only — a file dropped at collection is absent from the
      JSON and from the totals, so the JSON alone can never prove discovery completeness. Ship
      `scripts/ci/check-suite-complete.mjs` that:
      (a) derives the **expected** file set independently, by applying the `include`/`exclude`
      globs from `vitest.config.ts` to the working tree;
      (b) runs `npm test -- --reporter=json` and reads `testResults[].name`;
      (c) compares the two as **normalized absolute path sets** and fails on any difference in
      either direction, printing the missing files by name;
      (d) separately asserts every file declaring `@vitest-environment jsdom` is present in the
      executed set.
      Its invocation appears in A14's gate command. Both counts land in `evidence/R1-gates.md`.
      `node -e "require('jsdom')"` stays as a fast precondition — necessary, never sufficient.
      *(Amended after Codex r2, B2. The r1 remedy said "executed equals discovered" without
      saying where "discovered" comes from, which on this reporter is unobtainable — it replaced
      one unverifiable check with another. This criterion gates every test count in the
      workstream, so it is the one that most needed to become executable.)*

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
node -e "require('jsdom')" \
  && bash scripts/ci/check-rls-migrations.sh \
  && bash scripts/ci/check-r1-migration.sh \
  && npm run type-check \
  && npm run lint \
  && node scripts/ci/check-suite-complete.mjs \
  && npm run build \
  && npm run test:db
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

All 15 criteria checked; every gate in A14 green with A15's suite-completeness counts shown;
migration additive and idempotent; `docs/planning/reviews/fase-R1-review-request.md` committed
with the content `CLAUDE.md:43` Executor Rule 6 requires (branch + base SHA + commit count, objective, scope in/out,
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
   A test count reported without A15's executed-vs-discovered counts is not evidence — and note
   that `require('jsdom')` alone does **not** discharge it (Codex r1, B4).
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

Not "disable RLS" and not "restore the grants" — both restore the vulnerability. Per D-4, **only
the first is mechanically blocked**; restoring a grant is prohibited by this plan and by review,
and a reviewer has to check for it by hand.
*(Codex r2, S1 — this paragraph still repeated the claim D-4 was corrected to drop. Amending the
decision without amending the prose that quotes it is the same miss the r1 amendment made three
other times; the r3 review exists to catch a fourth.)*

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
CHECK — eight files (matching the amended Scope, not the original six — Codex r2, N2); one
migration of roughly 40 statements; two committed checker scripts; one pgTAP file modelled
line-for-line on the 502-line `030-pasantias-leads-rls.sql`, which a single session produced.
RESULT — **supported**, with the caveat that A15's `npm ci` must happen at the start, not after
the diff is written.
BLIND SPOT — none material. If context does run short, the split point is clean: functions first,
`profiles_role_backup` second.

---

# Future phases — bounded outlines

Rolling wave (overlay §3): these are deliberately short. Each becomes a full contract, expanded
and repaired in place, immediately before dispatch. Do not execute from an outline.

### R1b — Bind `has_global_workspace_access` to `auth.uid()` · HIGH · immediately after R1

**Added after Codex plan review r1 (B1).** R1 revokes `anon`, which closes the anonymous path. It
leaves an **authenticated** one: the function is `SECURITY DEFINER`, takes a caller-supplied
`check_user_id`, and reads `user_roles` — whose RLS it therefore bypasses — so any authenticated
caller can ask whether an arbitrary UUID is an active `admin`/`consultor`. That is the same
privileged-role disclosure R1 closes for `profiles_role_backup`, reachable by a different door.

Fix: backward-compatible `CREATE OR REPLACE FUNCTION` keeping the signature, which **fails closed
on a mismatch** — if `check_user_id` is distinct from `auth.uid()`, return `false`; otherwise
answer for `auth.uid()`. It must **not** silently ignore the parameter.

*(Amended after Codex r2, B4, which answered a question the PM had flagged as genuinely open.
Silently substituting the security subject is its own trap: an admin passing a foreign UUID would
get `true` **about themselves**, and a later caller could read that as authorization for the
supplied subject. Returning `false` rather than raising keeps the function composable inside a
policy `USING` clause, where an exception would break the query rather than deny the row.)*

All three call sites already pass `auth.uid()` (`baseline.sql:18196`, `:18203`, `:18210`) and
there are zero repository callers, so the mismatch branch is unreachable from anything that
exists today. Criteria must include: the three `community_meetings` policies still admit an active
admin, an active `consultor` and a community member and still deny a `docente`; **and an active
admin passing another user's UUID receives `false`** — the negative test that proves it fails
closed rather than substituting.

Its own phase rather than part of R1 because it is a **body** change needing a behavioural matrix,
and R1 is already at the 15-criterion cap (§1.3: criteria that don't fit are two phases). Its own
phase rather than deferred into R10 because an unowned security item at the end of an eleven-phase
workstream is exactly the §1.4 failure this plan is supposed to avoid. Small — one function, one
migration, one pgTAP file. Allowlist unchanged at 21.

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

### R7 — `learning_paths` + `learning_path_courses` · HIGH · after R1 · gated on **Q5**

One phase, not two: read as a pair across ~31 sites, and `learning_path_courses` must inherit
authorization from its parent `learning_paths` row rather than exposing every path whose course is
visible. Inserts stamp `created_by = auth.uid()`. Allowlist 4 → 2.
The global-vs-scoped management ruling is now **Q5**, an owner gate rather than an open question
buried in the outline (Codex r1, S3). If Q5 goes unanswered, R7 ships preserving today's
effectively-global behaviour as explicitly recorded debt.

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
Carries the §5 trap: `validate_assignment_instance_course` is an **invoker-rights** trigger
(`BEFORE INSERT OR UPDATE`, `baseline.sql:15684`) on `assignment_instances` that `SELECT`s
`modules` and raises `'Template not found'` on an empty read. Under RLS that read is filtered by
the caller's policies.

**CORRECTED after Codex plan review r1 (B2) — verified, and the discovery document is wrong
here.** §5 says the trap is safe today "because the only writer to `assignment_instances` is
`pages/api/admin/growth-communities/[id]/index.ts:113` using `createServiceRoleClient()`". That is
true of *repository code* and **false at the database boundary**: `assignment_instances` has RLS
on (`baseline.sql:19747`) and carries `assignment_instances_teacher_manage`
(`baseline.sql:19758`) — a policy with **no `FOR` clause, so `FOR ALL`**, `TO authenticated`, with
`USING`/`WITH CHECK` of `((created_by = auth.uid()) OR auth_is_course_teacher(course_id))`. The
`created_by = auth.uid()` branch means **any authenticated user can INSERT or UPDATE directly over
PostgREST without being a teacher**, and that write fires the invoker-rights trigger.

So "pin the sole-writer invariant with pgTAP" is **not a valid option** — it would pin a claim
that is already false.

**R9 must do BOTH of the following. They are not alternatives** *(Codex r2, B3 — the r1 amendment
wrongly wrote them as an either/or, which would have left a confirmed authenticated write
vulnerability live)*:

1. **Harden the trigger.** Make `validate_assignment_instance_course` `SECURITY DEFINER` with a
   pinned `search_path` and **fully qualified relation references**, scoped to integrity
   validation only. This stops `modules` RLS from breaking integrity checking. It deliberately
   lets the trigger read `modules` outside RLS — acceptable because its only output is
   validate-or-raise, not data. Codex ruled this an acceptable integrity boundary (r2, ruling C).
2. **Repair the policy, independently.** `assignment_instances_teacher_manage` lets any
   authenticated user INSERT or UPDATE by setting `created_by = auth.uid()`. That is a live
   vulnerability today, unrelated to the trigger and unfixed by hardening it. R9's matrix must
   include **direct negative tests for an ordinary authenticated user** — not only the
   service-role route.

This is the second error found in the discovery document; treat its remaining §5 call-site claims
as needing the same boundary check before they become criteria.

**Allowlist reaches `{}` here.**

### R10 — Actor-derivation redesign · HIGH · **runs directly after R7** · gated on **Q5**

*(Listed last, executed 9th of 11 — phase IDs are stable, order is the index's `Order` column.
Moved forward on Codex r1, S4: R10 is not structurally dependent on R7's migration, only on the
same authorization decisions, and authenticated identity/scoring forgery stays live after R1.
Waiting behind R8 and R9 bought nothing.)*

`submit_quiz` plus the five learning-path mutation RPCs. Not first: it needs enrollment and
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

### R11 — Audit the remaining anon-granted public functions · **DISCOVERY** · after R1

**Added 2026-08-12 by Brent's ruling on Codex r2 B5.** Codex proposed narrowing the Function DoD
to the ten audited functions; Brent chose to expand the workstream instead. The PM flagged that
expansion risks delaying R1 and strains the sizing rules; Brent took that tradeoff knowingly. R1
is unaffected — it still ships first, and R11 runs after it.

**Input.** 70 RPC-callable `public` functions carrying a `GRANT … TO anon` in the baseline and
outside the ten this workstream has audited. See the Goal's table for the derivation.

**This phase is `DISCOVERY` and must not smuggle implementation into research** (overlay §3). It
produces evidence and a revised contract; it ships no migration.

Bounded output:

1. **A classification of all 70**, per function: is it reachable as `anon` over PostgREST at all;
   does it read or write RLS-protected data; does it derive its actor from `auth.uid()` or from a
   caller-supplied parameter; does it have a repository caller and under which client. Same
   method and same evidence standard the r1 discovery used — **read-only, no writes to
   production, synthetic identifiers only**.
2. **A proven-vs-inferred split**, as §6 does. The grants are proven from the baseline; nothing
   about reachability may be asserted without a probe or a catalog read.
3. **A proposed phase decomposition** for the remediation, sized to the ≤10-file rule — almost
   certainly grouped by defect class (revoke-only / actor-binding / already-safe) rather than
   one phase per function.

**R12+ are deliberately undefined until R11 lands.** Writing contracts for 70 functions whose
reachability is unmeasured would invent requirements from guesses.

**Known trap:** the 70 include the `auth_*` helper family — `auth_is_admin`,
`auth_is_course_student`, `auth_is_course_teacher`, `auth_is_superadmin`,
`auth_user_community_ids` and others — which RLS policies across the schema call inside `USING`
clauses. **`authenticated` must retain `EXECUTE` on those or policies break schema-wide.** R11
must identify every policy-invoked function before any later phase revokes anything, or the
remediation will take production down. This is the single most likely way the expanded scope
causes damage, and it is why R11 is discovery rather than a revoke sweep.

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
| 2026-08-12 | ~~Review-request artifacts live at `docs/plan/rls/reviews/R<n>-review-request.md`~~ **REVERSED** — canonical path is `docs/planning/reviews/fase-R<n>-review-request.md`, with a pointer from the workstream directory | Codex r1 ruled it a hard-rule violation (B5): `CLAUDE.md:43` names an exact path, and the overlay's own precedence list puts repo hard rules above the plan. A decision log cannot override a hard rule — that was the error. | Codex plan review r1 |
| 2026-08-12 | **Amendment round after Codex plan review r1: FINDINGS.** 5 BLOCKING and 6 SHOULD-FIX accepted in full; 1 NIT accepted. New phase **R1b**; new owner question **Q5**; **R10 resequenced** to run 9th of 11; criteria A1, A3, A4, A12, A15 rewritten; D-4 corrected. | Two findings asserted new facts and were independently verified before acceptance — B2 (direct authenticated writes to `assignment_instances`) and N1 (`cleanup_propuesta_rate_limits` is invoker-rights). Both held. | Codex plan review r1 |
| 2026-08-12 | The discovery document has now been **wrong twice**. §5's "sole writer is service-role" for `assignment_instances` is false at the database boundary. | Its remaining §5 call-site claims describe repository code, not the RLS boundary. Any phase promoting one to a criterion must re-check it against policies, not only against `grep`. | Codex plan review r1 (B2), verified by PM |
| 2026-08-12 | Retiring `profiles_role_backup` is an owner decision, not a phase | `CLAUDE.md` Database Safety forbids `DROP`; 25 rows of historical role state may have audit value | Discovery §4 |
| 2026-08-12 | **Codex plan review r2: FINDINGS.** 5 BLOCKING, 2 SHOULD-FIX, 3 NITs — all accepted, none disputed. | r2 fixed 6 of the 12 r1 items outright; the rest were "the control does not do what it claims", not directional disagreement. Codex answered all three questions the PM had flagged as genuinely open (A, B, C). | Codex plan review r2 |
| 2026-08-12 | **Round cap reached and overridden by Brent** — a third Codex review is authorized, scoped to the amendments only rather than the whole plan. | §1.5 caps the loop at 2 and routes the decision to Brent. The override names its evidence: r2 caught 4 stale cross-references left by the r1 amendment, so freezing without a check has a demonstrated, not theoretical, failure rate. | Brent |
| 2026-08-12 | **B5 resolved by EXPANDING scope, not by narrowing the claim** — new `DISCOVERY` phase R11 covering the 70 remaining anon-granted RPC-callable functions; the Goal gains a third completion condition. | Codex's proposed remedy was to shrink the Function DoD to the ten audited functions. Brent ruled the other way. The PM flagged that expansion risks delaying R1 and strains sizing; Brent took the tradeoff. R1 is unaffected and still ships first. **This is a different remedy than the reviewer proposed and r3 must rule on whether it satisfies B5.** | Brent, over Codex r2 B5 |
| 2026-08-12 | Q5 reclassified from **gate** to **ruling with a default** | Calling it a gate while its unanswered branch still shipped was a contradiction. The default — preserve today's effectively-global management — does not widen access and is narrowable later by backfill plus `ALTER POLICY`. | Codex r2, S2 |
