# PLAN — RLS (public-schema allowlist retirement)

META
- REPO / ROOT: `fne-lms` · worktree `/Users/brentcurtis/dev/wt/rls-public`
- GIT COMMON DIR: `/Users/brentcurtis/dev/fne-lms/.git` → lean overlay **ACTIVE**
- BRANCH: `fix/rls-public`, base `main` @ `43999499`, plan drafted at `c1dcf314`
- BRANCH CONVENTION: all phases land on `fix/rls-public` as sequential commits (≤20 chars, Vercel preview DNS — `CLAUDE.md` Executor Rule 1). One PR per phase.
- **THIS PLAN LIVES ONLY ON `fix/rls-public`.** It is not on `main`. Read it with
  `git show fix/rls-public:docs/plan/rls/PLAN.md` or work in the worktree above.
- PLAN FROZEN: **not yet** — Codex r1 FINDINGS (12), r2 FINDINGS (10), r3 FINDINGS (7), r4
  FINDINGS (6). All 35 accepted; none disputed. Pending **r5**. The §1.5 two-round cap was
  reached at r2 and overridden by Brent; see the Decision Log for the evidence each override
  names.
- **R1 IS NOT DISPATCHABLE until `R0` lands.** Codex r4 ruled that R1's *actions* are
  substantively correct but its evidence-producing method has failed in four independent ways,
  and the plan claimed a six-class dependency check that had only ever covered three. `R0`
  rebuilds that evidence from authoritative sources; R1 is then amended from R0's artifact.
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
3. **Surface DoD** — every remaining **`SECURITY DEFINER` signature in `public` carrying an `anon`
   grant** is audited, and each is either revoked, hardened, or recorded as deliberately safe with
   evidence. The nine that return `trigger` are audited too and dispositioned as
   not-RPC-reachable-by-construction. Delivered by R11 and whatever phases its discovery produces.
   *(Population narrowed after Codex r3, B2. The earlier wording said "the remaining `public`
   functions carrying an `anon` grant", which is **hundreds** of functions once invoker-rights
   ones are included — R11 could never have satisfied it. Invoker-rights functions carry no
   definer-privilege escalation and are deliberately out of this workstream.)*

**Condition 3 is new (Codex r2, B5) and it is a scope expansion, not a narrowed claim.** Codex's
proposed remedy was to shrink the DoD to the ten audited functions; Brent's ruling on
2026-08-12 was to expand the workstream instead. The finding stands either way: the previous
"no `public` function … can bypass RLS" wording was **already false** at the moment it was written.
Measured from `supabase/migrations/00000000000000_baseline.sql`:

**All inventory arithmetic is by `regprocedure` signature, never by function name.**
*(Codex r3, B1: the first count used unique names, which silently merged the two `SECURITY
DEFINER` overloads of `mark_notification_read` — `(notification_id uuid)` at `baseline.sql:4334`
and `(p_notification_id uuid, p_user_id uuid)` at `:4350`, both granted `anon` at `:24107` and
`:24113`. That dropped one audit subject. Overload-collapsing is the same class of measurement
error this plan has been catching in others; R11 must define its inventory by signature.)*

| | count |
|---|---|
| `SECURITY DEFINER` **signatures** in `public` | 91 |
| …carrying a `GRANT … TO anon` | 89 |
| …covered by R1's nine DEFINER signatures | 9 |
| **…outside the audit so far** | **80** — 9 return `trigger`, **71 are non-trigger RPC candidates** |

"**RPC candidates**", not "RPC-callable" *(Codex r3, B2)*: PostgREST reachability is precisely what
R11 must measure. Asserting it in the input count would state as fact the thing the phase exists
to establish.

`get_unread_notification_count(p_user_id uuid)` (`baseline.sql:3660-3672`, granted `anon` at
`:23825`) is the worked example: `SECURITY DEFINER`, unqualified `FROM user_notifications`,
caller-supplied subject, no `auth.uid()` check. At least 20 of the 71 take a caller-supplied user
identifier, including `create_notification`, `create_user_notification`,
`award_course_completion_badge`, `get_user_admin_status` and `get_effective_user_role`.

**Stated precisely, because the distinction is the whole point of §6: the grants are proven from
the baseline file. Reachability and exploitability of those 71 are UNMEASURED.** The discovery
document probed only the functions it named. 71 is a sizing figure, not 71 confirmed
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
- **D-3 — `PUBLIC` is revoked explicitly on every function selected for lockdown.** PostgreSQL
  grants `EXECUTE` to `PUBLIC` by default. Only three functions in the entire baseline carry an
  explicit `REVOKE … FROM PUBLIC` (`00000000000000_baseline.sql:22315`, `:22368`, `:24046`) and
  **none of the ten in scope is one of them**. `REVOKE … FROM anon` alone therefore leaves an
  inherited `PUBLIC` grant standing and closes nothing.
  **Qualification (Codex r3, B5):** this applies to functions *selected for lockdown*, not to
  functions proven to require `PUBLIC` execution as RLS policy helpers. A policy written without
  a `TO` clause defaults to `TO PUBLIC` — **420 of the baseline's 634 policies are in that form** —
  so revoking `PUBLIC`/`anon` on a helper such a policy invokes converts an anonymous query from
  *filtered to zero rows* into *permission denied*. Every phase must classify a function's policy
  role before revoking, and record the resulting failure-mode change. Never infer that "no
  repository caller" means "no caller".
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
- **D-9 — Every amendment ends with a mechanical consistency sweep of the active text.** Correcting
  a statement without correcting the prose that quotes it has now happened **five times** across
  four review rounds — D-4's rollback prose, the five-vs-six form count, six-vs-eight files, the
  Q5 gate label, and the Test plan's three-dead/seven-live counts, which would have shipped an
  executor a test plan that omitted the outage regression. The pattern is the amendment process,
  not any one miss. So: after amending, `grep` the active text (everything above the Decision Log,
  which is append-only history and stays as written) for every count, phase ordinal, group name
  and guard claim the amendment touched, and record the sweep in the ledger. A reviewer finding
  a stale cross-reference means the sweep was not run.
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
| 1 | **R0** | **DISCOVERY** — rebuild R1's ten-signature evidence from authoritative sources | **DISCOVERY** | **TODO — next to dispatch** | 22 | — | none |
| 2 | R1 | Close the anonymous reach — 10 function `EXECUTE` revocations + `profiles_role_backup` | HIGH | **BLOCKED on R0** — contract below, to be amended from R0's artifact | 21 | **R0** | none |
| 3 | R1b | Bind `has_global_workspace_access` to `auth.uid()` | HIGH | OUTLINE | 21 | R1 | none |
| 4 | R2 | Six empty legacy student tables (Ley 21.719) | HIGH | OUTLINE | 15 | R1 | none |
| 5 | R3 | Remaining dead / service-only tables | HIGH | OUTLINE | 7 | R1 | **Q1** |
| 6 | R4 | Retire the broken `qa_tester_time_logs` reader, then lock it down | HIGH | OUTLINE | 6 | R1 | none |
| 7 | R5 | `instructors` policy | HIGH | OUTLINE | 5 | R1 | **Q2** |
| 8 | R6 | `growth_community_transformation_access` policy | HIGH | OUTLINE | 4 | R1 | **Q3** |
| 9 | R7 | `learning_paths` + `learning_path_courses` (coupled) | HIGH | OUTLINE | 2 | R1 | Q5 *(default)* |
| 10 | **R10** | Actor-derivation redesign of `submit_quiz` + 5 learning-path RPCs | HIGH | OUTLINE | 2 | R1, R7 | Q5 *(default)* |
| 11 | R8 | `group_assignment_discussions` policy | HIGH | OUTLINE | 1 | R1 | none |
| 12 | R9 | `modules` — riskiest, last of the tables | HIGH | OUTLINE | **0** | R1–R8 | **Q4** |
| 13 | **R11** | **DISCOVERY** — audit the remaining 80 anon-granted DEFINER signatures | **DISCOVERY** | OUTLINE | 0 | R1 | none |
| 14+ | R12… | Remediation phases, **defined by R11's output** — not invented here | HIGH | UNDEFINED | 0 | R11 | TBD by R11 |

Every phase except R11 is `HIGH` under overlay §3 — they touch RLS/grants or ship a migration.
R11 is `DISCOVERY`: the evidence needed to write a safe implementation contract for the 71 does
not exist yet, and per overlay §3 a `DISCOVERY` phase produces evidence and a revised contract
without smuggling implementation into research. **R12+ are deliberately left undefined.** Writing
phase contracts for 71 signatures whose reachability is unmeasured would be inventing requirements
from guesses — the exact thing the overlay forbids.

**Dependency graph.** R1 is the root and blocks nothing structurally — R2…R9 could each run
without it — but it runs first because it is the largest risk reduction per line available and
changes no behaviour for any known in-repository caller. R1b follows immediately: R1 revokes
`anon` on `has_global_workspace_access` but leaves an authenticated oracle standing, and that item
must not be homeless (§1.4). R7 is one phase, not two: `learning_paths` and
`learning_path_courses` are read as a pair across ~31 sites and neither can be secured in
isolation (§5). R9 is the last TABLE phase because enabling RLS on `modules` activates three already-present
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

# Phase R0 — Rebuild R1's evidence · **DISCOVERY**

**Risk: DISCOVERY.** **Status: TODO — next to dispatch.** **Depends on: nothing.**
**Blocks: R1.**

## Why this phase exists

Codex r4 ruled R1 **not dispatchable**. Not because its actions are wrong — Codex independently
confirmed the current function grouping is correct — but because **the method that produced R1's
evidence has failed in four independent ways, and the plan claimed a check it never ran.**

| round | class of error | what it was |
|---|---|---|
| r1 | wrong anchors | two call-site line numbers wrong in the inherited caller table |
| r2 | boundary confusion | "sole writer is service-role" true of repo code, false at the DB boundary |
| r3 | wrong identity key | inventory counted function *names*, merging two `mark_notification_read` overloads |
| r4 | wrong population | caller audit read only application code; seven RLS-policy callers invisible |

Each was a *new* class, not a repeat. Three of the four were found by review or by unrelated work
rather than by the audit itself. R1's text also asserted a six-class dependency check when only
three classes had ever been swept — the plan claimed evidence that did not exist, which is the
specific failure that makes the rest untrustworthy.

**R0 is cheap insurance against an expensive mistake.** R1 revokes privileges in production; the
r4 find was an outage caught with hours to spare.

## Scope

Produce **one committed artifact**, `docs/plan/rls/evidence/R0-ten-signature-inventory.md`, that
rebuilds R1's evidence from authoritative sources, with the command and its raw output beside
every claim. For **each of the ten signatures**, keyed by `regprocedure`:

1. **Signature identity** — `oid`, `regprocedure`, argument types, and **whether any overload of
   the same name exists**. This is the r3 failure; resolving by name is forbidden.
2. **Effective ACL** — `aclexplode(COALESCE(proacl, acldefault('f', proowner)))`, per grantee,
   including `PUBLIC` as oid `0`.
3. **Security mode and configuration** — `prosecdef`, `proconfig`, `prolang`, owner.
4. **Application callers** — `.rpc()` across `*.ts`/`*.tsx`/`*.js`, each with its client factory
   and the role that factory produces.
5. **Database-side dependencies — start from an UNFILTERED reverse `pg_depend` sweep**, so a
   catalog class nobody thought of cannot vanish by construction. Only then add textual analysis
   for the places PostgreSQL records no procedural dependency: `pg_policy.polqual`/`polwithcheck`,
   `pg_proc.prosrc`, `pg_trigger`, `pg_rewrite`, `pg_attrdef`, `pg_constraint`, **expression
   indexes (`pg_index.indexprs`/`indpred`) and partition-key expressions (`pg_partitioned_table`)**.
6. **Policy roles** — for every dependent policy, its `polroles`. **`{0}` means `PUBLIC`**, which
   is the common case in this schema (420 of 634). Record the role that actually needs `EXECUTE`
   and the failure-mode change for each role being revoked.
7. **Action → test mapping** — for each signature, the R1 action it implies and the named pgTAP
   assertion that will prove it.

## Explicitly out of scope

- **Any migration, grant change, or source edit.** R0 ships evidence, nothing else
  (overlay §3: a DISCOVERY phase must not smuggle implementation into research).
- Re-auditing the 22 tables, or anything about `profiles_role_backup` beyond confirming its
  `relacl` and `relrowsecurity`.
- The other 80 signatures — that is R11.

## Acceptance criteria

- [ ] **AR0-1** The artifact covers all ten signatures, each keyed by `regprocedure`, with every
      claim accompanied by its command and raw output.
- [ ] **AR0-2** Overload resolution is explicit: for each of the ten, the artifact states whether
      other overloads of that name exist and how the target was disambiguated.
- [ ] **AR0-3** The dependency sweep **starts** from an unfiltered reverse `pg_depend` query whose
      output is recorded in full — including classes expected to be empty — followed by the
      textual analyses for the classes `pg_depend` does not record.
- [ ] **AR0-4** Expression indexes and partition-key expressions are covered, and their results
      recorded even when empty.
- [ ] **AR0-5** Every dependent policy is listed with its `polroles`, `TO`-clause interpretation,
      table, and command.
- [ ] **AR0-6** A **proven vs inferred** split in §6's style. `prosrc` textual matching cannot
      reliably resolve overloaded calls and cannot prove the absence of dynamic SQL
      (`EXECUTE format(...)`); those limits are stated, and anything they touch is marked
      `UNVERIFIED` or conservatively attributed rather than asserted.
- [ ] **AR0-7** An explicit **diff against R1's current contract**: every place R1's caller table,
      grouping, criteria, or test plan disagrees with the rebuilt evidence. "No disagreement" is
      a valid result and must be stated positively rather than by silence.
- [ ] **AR0-8** Evidence is gathered **read-only**. Any local probe runs inside a transaction that
      is rolled back, with the rollback verified. **No production writes.**

## Test plan

R0 writes no tests — it is discovery. Its verification is that a reader can re-run every recorded
command and obtain the recorded output.

**Where to run it.** Prefer the local Supabase stack (`supabase db start` + `supabase db reset`),
which reflects the committed migrations. Where a claim must be true of *production*, it is
gathered read-only under D-7's rules and labelled as such. Local and production PostgreSQL differ
(17.x vs 15.8, see the Test plan note in R1), so version-sensitive results carry their server
version.

## Definition of done

The artifact exists, is committed, satisfies AR0-1 … AR0-8, and R1's contract has been amended
from it — including its caller table, group membership, acceptance criteria and test plan. **R0
closes only when R1 has been updated to match**, because an artifact nobody folded back in is
exactly the failure mode that produced this phase.

## Risks

1. **R0 becomes a re-audit of everything.** It is bounded to ten signatures and one artifact.
   The 80 are R11's.
2. **The local catalog is not production.** Codex ran its r4 sweep locally and found no additional
   dependencies. That is strong evidence and not proof for production; D-7 applies.
3. **`prosrc` and dynamic SQL.** Textual analysis cannot prove a negative. AR0-6 requires the
   limit be stated rather than papered over.

## Rollback

R0 changes nothing. If its evidence contradicts R1 — as the r1 discovery's has three times — the
correct outcome is a plan amendment, not a workaround.

---

# Phase R1 — Close the anonymous reach

**Risk: HIGH** (RLS/grants, migration, security). **Status: TODO.** **Depends on: nothing.**

Largest risk reduction per line available in this workstream. It closes every *proven* anonymous
write path and removes the privileged-role roster from the internet, with **no policy design and
no application redesign**.

**Behaviour-change promise, stated precisely** (Codex r1, S1). R1 changes no behaviour for any
**known in-repository authenticated caller**. It is not "no behaviour change for any
authenticated caller": two zero-dependency RPCs lose `authenticated` `EXECUTE` outright, so an
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

| Function (signature for `REVOKE`) | Repository callers | **Policy callers** | R1 action |
|---|---|---|---|
| `has_transformation_access(uuid)` | none | **SEVEN** — see correction below | revoke `PUBLIC` + `anon` only; **`authenticated` MUST be kept** |
| `get_available_assignment_templates(uuid)` | **none** | **0** | revoke `PUBLIC` + `anon` + `authenticated` |
| `cleanup_propuesta_rate_limits()` | **none** | **0** | revoke `PUBLIC` + `anon` + `authenticated` |
| `has_global_workspace_access(uuid)` | none in app code | **3**, all `TO authenticated` | revoke `PUBLIC` + `anon`; keep `authenticated`; pin `search_path` |
| `submit_quiz(uuid, text, uuid, uuid, jsonb, jsonb, integer)` | `lib/services/quizSubmissions.js:75` | 0 | revoke `PUBLIC` + `anon` only |
| `create_full_learning_path(text, text, uuid[], uuid)` | `lib/services/learningPathsService.ts:69` | 0 | revoke `PUBLIC` + `anon` only |
| `update_full_learning_path(uuid, text, text, uuid[], uuid)` | `lib/services/learningPathsService.ts:256` | 0 | revoke `PUBLIC` + `anon` only |
| `batch_assign_learning_path(uuid, uuid[], uuid[], uuid)` | `lib/services/learningPathsService.ts:313` | 0 | revoke `PUBLIC` + `anon` only |
| `start_learning_path_session(uuid, uuid, uuid, character varying)` | `pages/api/learning-paths/session/start.ts:86` | 0 | revoke `PUBLIC` + `anon` only |
| `end_learning_path_session(uuid)` | `pages/api/learning-paths/session/end.ts:49` | 0 | revoke `PUBLIC` + `anon` only |

Two corrections to the inherited table, both verified: `update_full_learning_path` is at
`learningPathsService.ts:256` (not unspecified), and `end_learning_path_session` is at
`pages/api/learning-paths/session/end.ts:49` — it does have a named call site.

### THE CORRECTION THAT WOULD HAVE BROKEN PRODUCTION — `has_transformation_access`

Found 2026-08-12 while writing R11's dependency contract, which Codex r3 B5 required. R1 was
otherwise ready to dispatch.

Every prior analysis — the discovery document, this plan's r1 caller audit, and the Codex r1 and
r2 reviews *of* that audit — established callers by grepping `.rpc()` across `*.ts`/`*.tsx`/`*.js`.
That method cannot see a **database-side** caller. `has_transformation_access(uuid)` has none in
the repository and **seven inside live RLS policies**:

| policy | table | command | `TO` clause |
|---|---|---|---|
| `members_insert_transformation_assessments` | `transformation_assessments` | INSERT | **none → `PUBLIC`** |
| `members_update_transformation_assessments` | `transformation_assessments` | UPDATE | **none → `PUBLIC`** |
| `members_insert_transformation_results` | `transformation_results` | INSERT | **none → `PUBLIC`** |
| `members_update_transformation_results` | `transformation_results` | UPDATE | **none → `PUBLIC`** |
| `members_delete_transformation_results` | `transformation_results` | DELETE | **none → `PUBLIC`** |
| `members_insert_transformation_conversation_messages` | `transformation_conversation_messages` | INSERT | **none → `PUBLIC`** |
| `members_delete_transformation_conversation_messages` | `transformation_conversation_messages` | DELETE | **none → `PUBLIC`** |

RLS policy expressions evaluate with the **invoking** role's privileges. R1 revokes `PUBLIC` *and*
`anon`; had it also revoked `authenticated` as the plan said through r2, the seven policy
operations above would raise `42501 permission denied for function` instead of evaluating the
predicate. **That is an outage in the live transformation feature, shipped by a phase whose stated
promise is that it changes no behaviour for known in-repository callers.**

**Two precision corrections to this description** *(Codex r4, S1 — the mechanism was right, the
blast radius was overstated)*: it is the **combination** that breaks it, not the `authenticated`
revoke alone — revoking `authenticated` while leaving the inherited `PUBLIC` grant standing would
still resolve, which is exactly why D-3 requires revoking `PUBLIC` explicitly. And it affects the
**seven operations that carry these policies when a row reaches the predicate**, not every DML
combination on all three tables; an UPDATE or DELETE matching zero rows need never evaluate the
function.

`has_transformation_access` therefore moves into the keep-`authenticated` group. The full-revoke
group drops to **two** — `get_available_assignment_templates` and `cleanup_propuesta_rate_limits`,
both confirmed to have zero policy, function-body and trigger dependencies. The keep-group grows
to **eight**.

Revoking `anon` on it stays correct and is retained. Because those seven policies carry no `TO`
clause they nominally apply to `PUBLIC`, so an `anon` attempt changes from *policy evaluates and
denies the row* to *permission denied on the function*. Both are denials, these are writes `anon`
has no business performing, and the stricter failure is the safer one — but it is a behaviour
change, recorded here rather than discovered in production.

**This is the discovery document's third error and the first that would have caused an outage.**
It is also the strongest available argument for R11's dependency inventory: a grep-based caller
audit survived three adversarial reviews and was still wrong.

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
  - `REVOKE ALL … FROM authenticated;` for the TWO zero-dependency RPCs only (`get_available_assignment_templates`, `cleanup_propuesta_rate_limits`) — never for `has_transformation_access`.
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
- **Write** two committed checker scripts: `scripts/ci/check-r1-migration.sh` (A1's exact-multiset
  check) and `scripts/ci/check-suite-complete.mjs` (A15's suite-completeness check). Both are
  invoked by A14's gate command.
- **Append** the round entry to `docs/plan/rls/LEDGER.md`.

**Sizing.** Nine files — within the ≤10 rule *(Codex r3, B4: the count omitted A15's checker)*. The ≤600-net-line guidance **will be exceeded** and
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
- Any application, route, component, or service file. **R1 touches no application TypeScript or
  JavaScript; `scripts/ci/check-suite-complete.mjs` is the sole JavaScript deliverable.**
  *(Codex r3, B4 — the earlier blanket exclusion made A15's own checker impossible to ship.)*
- Adding `REVOKE`s for functions not in the ten-row table above, however tempting the adjacent
  `grep` hit.

## Acceptance criteria

Each independently checkable by running something. `<fn>` below means all ten functions.

- [ ] **A1** **Exact-multiset migration check, not a syntactic category check.** A committed
      script (`scripts/ci/check-r1-migration.sh` or equivalent) strips comments and asserts the
      migration's executable statements are **exactly** the expected multiset — every statement
      matched on its *operation, target and grantee together*:
      `REVOKE ALL ON FUNCTION <sig> FROM PUBLIC|anon` for all ten named signatures;
      `REVOKE ALL … FROM authenticated` for the TWO zero-dependency signatures only;
      `REVOKE ALL … FROM authenticated` + `GRANT EXECUTE … TO authenticated` for the **seven
      normalization targets — the six application RPCs plus `has_global_workspace_access`**;
      **`has_transformation_access` receives NO `authenticated` ACL statement at all** and keeps
      its existing grant untouched, which is why A4's keep-group is eight while this list is seven
      *(Codex r4, S3 — "the seven others" was ambiguous against an eight-signature A4)*;
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
- [ ] **A3** For the TWO zero-dependency RPCs (`get_available_assignment_templates`, `cleanup_propuesta_rate_limits`), the **effective** ACL —
      `aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner)))` — carries **no entry** for
      `PUBLIC` (grantee oid `0`), `anon`, or `authenticated`. Back it with
      `NOT has_function_privilege('anon', <oid>, 'EXECUTE')` for each.
- [ ] **A4** For the EIGHT keep-`authenticated` signatures — the six live RPCs, `has_global_workspace_access`, and `has_transformation_access` — the same effective-ACL
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
- [ ] **A8** **Both policy-invoked helpers still work for `authenticated`.**
      **(a)** `has_transformation_access` — an authenticated community member can still perform
      the **seven operations that actually carry policies**: INSERT/UPDATE on
      `transformation_assessments`; INSERT/UPDATE/DELETE on `transformation_results`;
      INSERT/DELETE on `transformation_conversation_messages`. *(There is no UPDATE policy on
      `transformation_conversation_messages` — Codex r4, B2.)* **This positive member matrix is
      the control that catches the outage: it fails outright if `EXECUTE` disappears.**
      For the negative case, **assert on the error message, not on SQLSTATE** — PostgreSQL raises
      `42501` for *both* an RLS policy violation and `permission denied for function`, so
      SQLSTATE alone cannot distinguish a correct denial from the regression. Match
      `permission denied for function` to detect the failure mode and the row-level-security
      message to confirm the correct one. *(Codex r4, B2 — the earlier "not `42501`" assertion was
      invalid on its face.)*
      **(b)** `has_global_workspace_access` still returns `true` for an active `admin` and an
      active `consultor`, and `false` for a `docente`, called as `authenticated` — the
      `search_path` pin did not change resolution. This keeps the three `community_meetings`
      policies working.
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
      (a) derives the **expected** file set independently. **`vitest.config.ts` defines `exclude`
      but no `include`** (`vitest.config.ts:7-18`), so the effective discovery set is
      `configDefaults.include` from `vitest/config` combined with that file's `exclude`. The
      checker must resolve the effective config through a real config loader — plain Node cannot
      import a TypeScript config file. *(Amended after Codex r3, B3 / ruling E: the r2 remedy said
      "derive from include/exclude" against a config that has no `include`, leaving the expected
      set undefined. Second failure of this same criterion.)*
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

- `r1_acl_dead_rpcs` — A3, **two** signatures × grantee absence
  (`get_available_assignment_templates`, `cleanup_propuesta_rate_limits`).
- `r1_acl_live_rpcs` — A4, **eight** signatures × `{EXECUTE}` for `authenticated` only
  (six application RPCs + `has_global_workspace_access` + `has_transformation_access`).
- `r1_proconfig_search_path` — A5.
- `r1_service_role_execute_survives` — A6.
- `r1_anon_execute_denied` — A7, three `throws_ok('42501')`.
- `r1_workspace_access_still_resolves` — A8(b), three `is()` over admin / consultor / docente.
- **`r1_transformation_member_matrix` — A8(a), the outage regression.** Seven `lives_ok`
  operations as an authenticated community member: INSERT/UPDATE `transformation_assessments`;
  INSERT/UPDATE/DELETE `transformation_results`; INSERT/DELETE
  `transformation_conversation_messages`. Then, as a non-member, the same operations denied — with
  `throws_ok` matched on the **row-level-security message**, and an explicit assertion that
  `permission denied for function` does **not** appear. Without this group an executor following
  the test plan would ship the very regression R1 was amended to prevent.
- `r1_role_backup_rls_no_policy` — A9.
- `r1_role_backup_acl_empty` — A10.
- `r1_role_backup_denied_anon` / `r1_role_backup_denied_docente` — A11, five commands each.
- `r1_role_backup_service_role_reads` — A12.

Fixtures: `auth.users` + `profiles` + `user_roles` rows for an admin, a consultor and a docente,
following `030-pasantias-leads-rls.sql:178-198`. **A8(a) additionally needs transformation
fixtures** — a growth community, an active scoped `user_roles` row making one user a member and
leaving another a non-member, a `growth_community_transformation_access` row, and a parent
`transformation_assessments` row for the `transformation_results` and
`transformation_conversation_messages` operations to hang off. *(Codex r4, B2: the previous
fixture list supplied none of these, so A8(a) was unimplementable as written.)* The file runs
inside `BEGIN … ROLLBACK`.

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
2. **The two zero-dependency RPCs lose `authenticated` too, and an out-of-repo caller is invisible.**
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
- **After production apply, if one of the two zero-dependency RPCs turns out to have an external
  authenticated consumer:** a new forward migration granting `EXECUTE` on that one named function
  to `authenticated` only. Never to `PUBLIC` or `anon`.
- **If any authenticated path raises `42501` on a function after apply**, the cause is a
  policy-invoked helper whose `authenticated` grant was revoked — the `has_transformation_access`
  failure mode. Forward fix: re-grant `EXECUTE` to `authenticated` on that named function only,
  then add the missing dependency to R11's inventory. This is the one rollback scenario R1 has a
  realistic chance of hitting.
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
RESULT — **REFUTED at r3, then repaired.** The check was the wrong check: it establishes
*repository* callers and says nothing about **database-side** callers.
`has_transformation_access` has seven RLS-policy callers and would have broken production. The
corrected check adds a full-body sweep of `pg_policy` (`polqual`/`polwithcheck`), function bodies,
triggers, views, rules, defaults and constraints — run here against the baseline dump, and
required of every later phase. Re-run under the corrected check: **supported**, with
`has_transformation_access` moved to the keep-`authenticated` group and the other nine unchanged.
BLIND SPOT — the *original* blind spot was recorded as "an out-of-repo caller", and that framing
is what let this through: it named the exotic risk while missing the ordinary one sitting in the
same database. Grep still cannot see a Retool board or a partner integration, and that remains
true. But the lesson worth carrying is narrower and sharper — **a caller audit that only reads
application code is not a caller audit.** Multi-line policy bodies also defeat a first-line grep:
the first sweep found 4 of the 7, and only whole-statement extraction found all seven.

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
CHECK — nine files (matching the amended Scope; six at r1, eight at r2, nine after Codex r3 B4
added A15's checker to the count); one migration of roughly 40 statements; two committed checker
scripts; one pgTAP file modelled
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
phase rather than deferred into R10 because an unowned security item at the end of a twelve-phase
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

### R7 — `learning_paths` + `learning_path_courses` · HIGH · after R1 · Q5 applies as a ruling-with-default, not a gate

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

### R10 — Actor-derivation redesign · HIGH · **runs directly after R7** · Q5 applies as a ruling-with-default, not a gate

*(Listed here for historical ID stability; executed 10th of 13 — order is the index's `Order` column.
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

### R11 — Audit the remaining anon-granted `SECURITY DEFINER` surface · **DISCOVERY** · after R1

**Added 2026-08-12 by Brent's ruling on Codex r2 B5**; contract completed after Codex r3 B5 and
S2. Codex proposed narrowing the Function DoD to the ten audited signatures; Brent chose to expand
the workstream instead. The PM flagged that expansion risks delaying R1 and strains sizing; Brent
took that tradeoff knowingly. R1 is unaffected — it still ships first, and R11 runs after it.

**This phase has already paid for itself.** Writing its dependency contract is what surfaced the
`has_transformation_access` outage in R1, after a grep-based caller audit had survived three
adversarial reviews. See R1's correction section.

**Input.** 80 `SECURITY DEFINER` signatures in `public` carrying a `GRANT … TO anon`, outside the
ten this workstream has audited: **71 non-trigger** signatures plus **9 that return `trigger`**.
All identified by `regprocedure`, never by name — see the Goal's arithmetic note.

**This phase is `DISCOVERY` and must not smuggle implementation into research** (overlay §3). It
produces evidence and a revised contract. **It ships no migration and changes no grant.**

**Evidence rules, inherited from the r1 discovery.** Read-only. No writes to production. Synthetic
identifiers only. Every claim carries its command and output, a file and line, or an authoritative
source. Anything unmeasured is labelled `UNVERIFIED` and stays that way.

#### Per-signature classification — what must be recorded

For each of the 80, keyed by `regprocedure`:

1. **Definer status and `proconfig`** — is `search_path` pinned, and to what.
2. **Actor derivation** — does it use `auth.uid()`, or accept a caller-supplied subject
   (`p_user_id`, `user_uuid`, `check_user_id`, …)? At least 20 are in the second class.
3. **Data touched** — does it read or write a table with RLS enabled, and which.
4. **Repository callers** — `.rpc()` across `*.ts`/`*.tsx`/`*.js`, with the client factory per hit.
5. **PostgREST reachability** — present in the REST schema cache and anonymously executable, or
   not. Measured, not assumed. This is why the input says "candidates".

#### Database-object dependency inventory — B5, and the reason R1 nearly shipped an outage

A caller audit that reads only application code is not a caller audit. For every one of the 80,
sweep **all** of these, from the catalog rather than by grepping the dump:

**Start from an UNFILTERED reverse `pg_depend` sweep** — every dependent object of every one of
the 80, with no `classid` filter — so a catalog class nobody thought to enumerate cannot disappear
by construction. Record the full output, including classes that come back empty. *(Codex r4, B3:
an enumerated class list can only find what it already imagined.)* **Then** add textual analysis
for the places PostgreSQL records no procedural dependency:

| dependency class | source of truth |
|---|---|
| RLS policies | `pg_policy.polqual` and `polwithcheck` via `pg_get_expr(…, polrelid)` |
| other function bodies | `pg_proc.prosrc` across all `public` functions |
| triggers | `pg_trigger` joined to `pg_proc` |
| views and rules | `pg_rewrite.ev_action`, `pg_depend` |
| column defaults and generated expressions | `pg_attrdef.adbin` via `pg_get_expr` |
| check constraints | `pg_constraint.conbin` via `pg_get_expr` |
| **expression indexes** | `pg_index.indexprs` and `indpred` via `pg_get_expr` |
| **partition-key expressions** | `pg_partitioned_table.partexprs` |

The last two were added at Codex r4 (B3): both execute functions **during writes**, so a missed
one produces exactly the R1 failure mode — a write path that breaks when a grant is revoked.

**Two limits of `prosrc` textual analysis that must be stated, not papered over:** it cannot
reliably resolve an **overloaded** call to a specific `regprocedure`, and it cannot prove the
**absence** of a dynamic-SQL call (`EXECUTE format(...)`). Anything touching either is
conservatively attributed to *all* candidate overloads, or marked `UNVERIFIED` — never asserted
clean.

**Grepping the migration dump is explicitly insufficient and the plan has the scar to prove it.**
A first-line `grep` over `CREATE POLICY` found 4 of `has_transformation_access`'s 7 policy
callers; only whole-statement extraction found all seven, and the catalog is more reliable than
either. Policy bodies routinely span many lines.

#### Effective-role derivation — the second half of B5

For every dependency found, record **which role actually needs `EXECUTE`**, not which role seems
plausible:

- **A policy with no `TO` clause defaults to `TO PUBLIC`.** In this schema that is **420 of 634
  policies** — the common case, not the exception. Revoking `PUBLIC`/`anon` on a helper such a
  policy invokes converts an anonymous query from *filtered to zero rows* into *permission
  denied*. That may be acceptable; it is never acceptable to discover it in production.
- A policy `TO authenticated` never evaluates for `anon`, so revoking `anon` is free.
- Output per signature: the minimum grant set that preserves every dependency, and the
  failure-mode change for every role being revoked.

**Known trap, and the most likely way this workstream causes an outage.** The 80 include the
`auth_*` helper family — `auth_is_admin`, `auth_is_course_student`, `auth_is_course_teacher`,
`auth_is_school_directivo`, `auth_is_superadmin`, `auth_user_community_ids` and others — which
policies across the schema invoke inside `USING`/`WITH CHECK`. A first-pass sweep already shows
`auth_is_course_teacher` in 7 policies and `auth_is_school_directivo` in 7, and that sweep
undercounts for the multi-line reason above. **`authenticated` must retain `EXECUTE` on every one
of these or policies break schema-wide.** R11 must produce the complete policy-helper set *before*
any later phase revokes anything.

#### Bounded execution — S2

Per-signature analysis of 80 signatures across six dependency classes does not fit one durable
session. R11 runs as three checkpointed units, each committing its artifact before the next
begins, so an exhausted session resumes from a file rather than from conversation:

| unit | work | artifact | why it is bounded |
|---|---|---|---|
| **R11a** | The dependency and role-requirement sweep. Six catalog queries covering all 80 at once, plus the policy `TO`-clause classification. | `evidence/R11a-dependency-map.md` | **Bulk, not per-signature.** Six queries, one pass, whole population. This is the cheap half and it is what protects every later phase. |
| **R11b** | Per-signature classification (the five points above), consuming R11a's map. **Batched in fours of twenty**, alphabetical by `regprocedure`, each batch appended to its artifact as it completes. | `evidence/R11b-classification.md` | Resumable at a 20-signature boundary. Batch identity is mechanical, so no judgment is needed to know where to restart. |
| **R11c** | Consolidation: the proven-vs-inferred split, and a proposed phase decomposition grouped by **defect class** — revoke-only / actor-binding-required / policy-helper-keep-authenticated / already-safe — sized to the ≤10-file rule. | `reviews/R11-findings.md` | One document, written once, from two committed inputs. |

**R11 is not closed until R11c lands.** R11a and R11b are checkpoints, not deliverables — no R12
phase may be dispatched from a partial classification. **R12+ stay undefined until R11c exists**;
writing contracts for 71 signatures whose reachability is unmeasured would invent requirements
from guesses, which is what the overlay forbids and what this workstream has now been burned by
three times.

**Rollback.** R11 changes nothing, so there is nothing to roll back. If its evidence contradicts
this plan — as the r1 discovery's did, three times — the correct outcome is a plan amendment, not
a workaround.

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
| 2026-08-12 | **Codex plan review r3: FINDINGS.** 5 BLOCKING, 2 SHOULD-FIX, 0 NITs — all accepted. r2 disposition: 8 of 10 fully fixed; rulings A, B, C, D, F PASS, E FAIL. | Every r3 blocking item was in the expanded scope (R11 / Surface DoD) or in A15 — R1's own contract passed 5 of 6 rulings. | Codex plan review r3 |
| 2026-08-12 | **R1 AMENDED BEFORE DISPATCH — `has_transformation_access` keeps `authenticated`.** It has 7 RLS-policy callers, all on policies with no `TO` clause. Revoking `authenticated` would have raised `42501` on every authenticated write to `transformation_assessments`, `transformation_results` and `transformation_conversation_messages`. | Found while writing R11's B5 dependency contract. **The discovery document's third error, and the first that would have caused a production outage.** A grep-based caller audit survived three adversarial reviews and was still wrong. Full-revoke group drops 3 → 2; keep-`authenticated` group grows 7 → 8; A8 gains the criterion that catches it. | PM, from Codex r3 B5's requirement |
| 2026-08-12 | **D-3 qualified**: blanket `PUBLIC` revocation applies to functions *selected for lockdown*, not to functions proven to be RLS policy helpers. | 420 of the baseline's 634 policies carry no `TO` clause and therefore default to `TO PUBLIC`. Revoking a helper they invoke converts an anonymous query from filtered-to-zero-rows into permission-denied. | Codex r3, B5 |
| 2026-08-12 | Falsification **CLAIM 1 flipped supported → REFUTED, then repaired.** Its check established repository callers only; its recorded blind spot named out-of-repo callers while missing database-side ones in the same database. | Kept in the plan as a refuted-then-repaired record rather than quietly rewritten, because the framing error is the transferable lesson: a caller audit that reads only application code is not a caller audit. | PM |
| 2026-08-12 | **R11 fully specified** rather than left an outline: dependency inventory across six catalog classes, effective-role derivation, and a three-unit checkpointed execution shape (R11a sweep / R11b batches of 20 / R11c consolidation). | Brent's ruling on the r3 freeze path. Overlay §3 would have allowed R11 to stay a bounded outline, but the `has_transformation_access` find is evidence that its dependency work protects phases that dispatch *before* it. | Brent |
| 2026-08-12 | **Codex plan review r4: FINDINGS.** 3 BLOCKING, 3 SHOULD-FIX, 0 NITs — all accepted. Codex independently reproduced the by-signature arithmetic, both `mark_notification_read` overloads, and the seven `has_transformation_access` policies (`polroles = {0}`), and confirmed by local probe that revoking `PUBLIC`+`anon`+`authenticated` yields `42501 permission denied for function`. | Its ACL probe ran in a rolled-back transaction with the rollback verified. No production access. | Codex plan review r4 |
| 2026-08-12 | **R1 SPLIT: new `DISCOVERY` phase `R0` rebuilds R1's ten-signature evidence; R1 is BLOCKED until R0 lands and is amended from R0's artifact.** | Codex r4 ruled R1 not dispatchable. Its actions are substantively correct — Codex verified the omitted three dependency classes contain no additional caller — but the evidence-producing METHOD failed in four independent ways (wrong anchors → wrong boundary → wrong identity key → wrong population), and the plan asserted a six-class dependency check that had only ever covered three. **The PM asked for this conclusion explicitly and acted on it rather than defending the text.** | Codex r4, accepted by PM |
| 2026-08-12 | A8(a)'s negative assertion corrected: match the **error message**, not SQLSTATE. | PostgreSQL raises `42501` for both an RLS policy violation and `permission denied for function`, so the original "not `42501`" test could never distinguish a correct denial from the regression it exists to catch. Also removed a non-existent UPDATE policy on `transformation_conversation_messages`. | Codex r4, B2 |
| 2026-08-12 | The outage description was **overstated and is corrected**: it is the `PUBLIC`+`authenticated` combination that breaks it, not the `authenticated` revoke alone, and it affects the seven policy-carrying operations when a row reaches the predicate — not every DML statement on all three tables. | The mechanism and the fix were right; the blast radius was not. Recorded rather than quietly narrowed. | Codex r4, S1 |
| 2026-08-12 | **New frozen decision D-9** — every amendment ends with a mechanical consistency sweep of the active text, recorded in the ledger. | Five stale cross-references across four rounds, the worst being a Test plan that still described three-dead/seven-live functions and would have handed an executor a plan omitting the outage regression. The failure is the amendment process, not any single miss. | PM |
