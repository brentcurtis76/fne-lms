# Fase SM-12 — review request (W-B10a-02)

**Unit** SM-12, round 2 (remediation of r1) · **Ledger item** W-B10a-02 · **Order** `runs/SM-12/order-r2.md`
**Branch** `fix/sm09-ci` · **Base SHA** `100b8339dc13b8b0f4eede7073bd6dfc253b0c7c` · **Commits** 0 —
delivered uncommitted on the base SHA, because `pm-unit precheck` requires HEAD not to move.
**Executor** Claude Code `claude-opus-5`, effort `high`.

## Objective

Close SM10-R0-B1: an active literal `equipo_directivo` could read the
`growth_community_transformation_access` rows of **every** school, because the W-B10a-01 read
policy delegates to `public.is_admin_or_consultor(auth.uid())`, which deliberately includes
`equipo_directivo` and takes no row as input. `equipo_directivo` is a school-level role, so the
read must stop at the actor's own school — the boundary `transformation_assessments` already
draws with `school_id = ANY (user_school_ids(auth.uid()))`.

### Scope in
- One new additive migration adding a RESTRICTIVE SELECT policy plus two new SECURITY DEFINER
  helpers on `public.growth_community_transformation_access`.
- pgTAP proof of the new boundary and of everything it must not change.

### Scope out (explicitly not done)
- No edit to any existing migration, helper or policy. `is_admin_or_consultor`,
  `auth_is_community_member` and `user_school_ids` are untouched; the two W-B10a-01 policies on
  this table are untouched.
- No product/TypeScript change. No dependency, config, CI or lockfile change.
- No other table, even where the same role-vs-tenant shape exists (see Limitations, L1).

## Files, grouped by risk

| Risk | File | What |
|---|---|---|
| **High — authorization boundary** | `supabase/migrations/20260921003500_b10a_transformation_access_school_scope.sql` (new, 157 lines) | 2 × `CREATE OR REPLACE FUNCTION` + `COMMENT`/`REVOKE`/`GRANT`, 1 × `CREATE POLICY … AS RESTRICTIVE FOR SELECT`. No `DROP`, `TRUNCATE`, destructive `ALTER` or row-security disable. **r1** touches one predicate inside `auth_community_in_actor_schools` (SM12-R0-B1). |
| **Medium — test surface** | `supabase/tests/071-b10a-referenced-tables-rls.sql` (modified, +183 lines vs HEAD) | `plan(164)` → `plan(195)`; section 5b (31 assertions); 4 new synthetic users, 1 school-less community, 2 extra access rows; a `pg_temp.set_service_role()` shim. **r1** adds 7 assertions and 2 users. |
| **Low — documentation** | `docs/planning/reviews/fase-sm-12-review-request.md` (new) | This file. **r2 changes nothing else** — it is the only file r2 edits. |

## The change in one predicate

The permissive policy is left alone; PostgreSQL ANDs the new restrictive one with it, so the
effective SELECT predicate becomes:

```
( is_admin_or_consultor(uid) OR auth_is_community_member(gc) )        -- W-B10a-01, unchanged
AND ( NOT auth_is_equipo_directivo_only()                             -- W-B10a-02, new
      OR auth_is_community_member(gc)
      OR auth_community_in_actor_schools(gc) )
```

`auth_is_equipo_directivo_only()` is TRUE only for an actor holding an active `equipo_directivo`
role and **no** active `admin`/`consultor` role, so FNE-global staff fall out of the restriction
at its first clause and read exactly what they read before.

### r1 (SM12-R0-B1): the two sides now agree about a NULL `is_active`

`public.user_roles.is_active` is nullable (default `true`, but an explicit `NULL` sticks).
`is_admin_or_consultor` and `auth_is_equipo_directivo_only` both read it as
`COALESCE(is_active, true)`; `user_school_ids` accepts only `is_active = true`. In r0 that
disagreement meant a leader whose role row carried `is_active NULL` was classified school-scoped
by the new policy, but matched **no** school — so the restriction hid even their own school's row,
a denial the change was not supposed to introduce.

`auth_community_in_actor_schools` now ORs one extra branch onto the school match:

```sql
gc.school_id = ANY (public.user_school_ids(auth.uid()))
OR EXISTS (SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.school_id = gc.school_id
              AND ur.is_active IS NULL
              AND ur.role_type = 'equipo_directivo')
```

That is exactly `COALESCE(is_active, true)` **for the role rows that make the actor school-scoped**
and nothing else: `user_school_ids` is untouched, so a NULL-active `docente`, `consultor` or
`admin` role still contributes no school here. No other role widens.

## Test evidence

**r2 target — a disposable, branch-exact stack created and destroyed for this round.** r1's
numbers came from the shared `127.0.0.1:54422` stack, which carried 65 migrations against this
branch's 57. That stack no longer exists on this host (its data volume was left initialised by
PostgreSQL 15 under a PostgreSQL 17 image and its container was removed, by something outside
this unit, before r2 started). r2 therefore created its own:

| | |
|---|---|
| project id | `sm12-r2-disposable` — unique; distinct containers, network and volumes |
| API / DB | `http://127.0.0.1:54521` · `postgresql://…@127.0.0.1:54522/postgres` |
| ports | 54520/54521/54522 each proved free immediately before creation; the shared 54421/54422 pair untouched |
| workdir | `runs/SM-12/scratch-r2` (RUN scratch: a config with a unique id and port block, plus byte-identical copies of `supabase/migrations` and `supabase/tests`) |
| branch-exact | `supabase_migrations.schema_migrations` = **57 rows, version list identical to the branch's 57 files** (`diff` empty — `evidence/r2/migrations-applied.txt` vs `migrations-branch.txt`) |
| before seed | `auth.users` 0, `profiles` 0, `schools` 0, `user_roles` 0, `growth_communities` 0 |
| fixtures | `scripts/ci/seed-e2e.mjs` only — 13 synthetic `e2e-*@example.com` personas (RFC 2606), 2 schools, 14 role rows, 2 communities |
| teardown | `supabase stop --no-backup --workdir …/scratch-r2`; containers, network and volumes proved absent afterwards |

pgTAP fixtures remain synthetic and inside `BEGIN … ROLLBACK`; the post-suite row counts above
were measured *after* the full pgTAP run and are all zero, so the suite leaves no residue.

r2 changes no product or test file, so its baseline and its final state are the same code. Every
number below was measured on the untouched dispatch state; the only later edit is this markdown,
which no gate reads. Full record: `evidence/baseline.md`, logs in `evidence/r2/`.

| Suite | Command | r1 (shared drifted stack) | **r2 (branch-exact stack)** |
|---|---|---|---|
| Focused pgTAP | `npm run test:db -- supabase/tests/071-b10a-referenced-tables-rls.sql` | exit 0 — Files=1, Tests=195, PASS | **exit 0 — Files=1, Tests=195, PASS** |
| Full pgTAP | `npm run test:db` | exit 1 — Files=43, Tests=4296, 12 failing in 3 files | **exit 0 — Files=43, Tests=4296, `All tests successful`** |
| Unit | `npm test` | exit 0 — 359 files, 9363 passed, 1 skipped | **exit 0 — 359 files, 9363 passed, 1 skipped** |
| Types | `npm run type-check` | exit 0 | **exit 0** |
| Lint | `npm run lint` | exit 0, 0 warnings | **exit 0, 0 warnings** |
| Build | `npm run build` | exit 0, 149/149 static pages | **exit 0, 149/149 static pages** |
| Guards | `npm run guard:migrations` | exit 0 — 57 migrations | **exit 0 — 57 migrations, no destructive statement** |
| Whitespace | `git diff --check` | exit 0 | **exit 0** |
| **E2E (full suite)** | `CI=1 E2E_PORT=3000 npm run e2e` | not run | **exit 1 — 269 passed, 60 failed, 27 skipped (1.2h)** — see L2 |
| **E2E (CI gate 4 set)** | the 16 specs `scripts/ci/e2e-mandatory.mjs --list` names | not run | **223 passed, 0 failed**; `--check` guard exit 0, "16 mandatory spec(s) ran with no skips" |

The two pgTAP commands carried `--workdir <RUN>/scratch-r2` so the CLI resolves the disposable
stack instead of the repo's default project; the files executed are the repository's own (their
absolute repo paths appear on every line of the logs). The full suite must run before the focused
one on a fresh database — `supabase/tests/000-setup.sql` is what creates the `tests` helper schema.

### The targeted consultor governance journey

`tests/e2e/learning-path-governance.spec.ts` — the spec the r1 review named as the reason the E2E
gate is materially relevant — is **25 passed, 0 failed** on the final state, desktop Chromium
(`devices['Desktop Chrome']`, 1280×720), against the isolated stack. Its test 10, "B10a surfaces
through real tokens: instructors, modules, transformation access" (`:707`), signs in as the
`consultorGlobal` persona, exchanges a real access token, and reads
`/rest/v1/growth_community_transformation_access?select=id&limit=1` through PostgREST with that
token: expected **200**, observed **200** — the new restrictive policy does not close the read for
an actor who is exempt from it. The same request with only the anon key is expected and observed
in `[401, 403]`. No console error and no unexpected network status was recorded. Evidence:
`evidence/r2/ui/`, `evidence/r2/e2e-results-full.json`, `evidence/r2/e2e-full.log`.

### The r1 regression really does catch SM12-R0-B1

The r0 file had no negative control (old L5). It has one now, measured rather than argued. With the
r0 definition of `auth_community_in_actor_schools` restored on the same database and the r1 test
file unchanged, `npm run test:db -- supabase/tests/071-…sql` is **exit 1**:

```
# Failed test 176: "NULL-active equipo_directivo: KEEPS the access row of a community in their OWN school (SM12-R0-B1 counterexample)"
#         have: 0        want: 1
# Failed test 178: "NULL-active equipo_directivo: the whole visible set is exactly their own school's row"
#         have: NULL     want: {71000000-0000-4000-8000-00000000c001}
```

— the exact shape the r0 review reported (helper TRUE, classifier TRUE, visible rows 0). With the
r1 definition the same file is exit 0, 195/195. Both runs are in
`runs/SM-12/evidence/counterexample-r1-without-fix.log` and `final-r1-testdb-focused.log`; the
function was restored immediately afterwards and its deployed body byte-matches the migration file.

The 7 new assertions: the fixture's `is_active` really is NULL; `is_admin_or_consultor` is TRUE for
that actor; `auth_is_equipo_directivo_only()` is TRUE for that actor; they keep their own school's
row; they still lose the other school's row; their visible set is exactly their own school's row;
and an actor holding `equipo_directivo` **and** an active `consultor` role still reads all three
rows (the exemption branch). Every r0 assertion is retained unchanged.

Before/after counterexample on the same database, same query, same fixtures
(`runs/SM-12/evidence/repro-before.log`, `repro-after.log`): an active literal `equipo_directivo`
of school 9721 saw the access rows of communities in schools 9721 **and** 9722; afterwards it sees
only 9721's.

## The 3–5 areas to scrutinize hardest

1. **RESTRICTIVE was chosen over rewriting the permissive policy, and it binds future policies
   too.** Tightening a permissive policy requires `DROP`/`ALTER POLICY`, both outside this order
   and against the repository's additive-only rule, so the boundary is a restrictive policy
   instead. The consequence is real and worth a decision: this policy is now ANDed with *every*
   permissive SELECT policy that anyone adds to this table later, including ones whose author has
   not read this file. Assertions "the W-B10a-01 permissive read policy is still there,
   unrewritten" and "the school-scope boundary is a RESTRICTIVE SELECT policy" pin both halves.
2. **The membership branch is duplicated inside the restrictive predicate.** Without
   `OR auth_is_community_member(growth_community_id)` in the new policy, a school leader who is
   also an active member of a community in *another* school would lose the read their membership
   grants — a tightening this unit was not asked for. I judged that out of scope and preserved it.
   If the reviewer thinks role should dominate membership, this is the line to change.
3. **`auth_is_equipo_directivo_only()` decides who is school-scoped, by exclusion.** Anyone
   holding an active `admin` or `consultor` role is exempt. Two judgment calls are baked in:
   `COALESCE(is_active, true)` (copied verbatim from `is_admin_or_consultor` so the two helpers
   can never disagree about the same row) and the fact that only these three role names matter.
   The other six RBAC roles are unaffected because the permissive policy never let them read.
   **r1 makes the third helper agree** — see area 6, which is the sharpest thing to look at.
4. **A community with `school_id IS NULL` is now invisible to a school leader.** It belongs to no
   school, so it matches nobody's school; it stays reachable through membership. This is a
   deliberate tightening beyond the literal finding and is asserted explicitly
   ("a community with school_id NULL belongs to no school…"). If any real school-less community
   is meant to be visible to leaders, this is where it breaks.
5. **The full pgTAP gate is green on r2's branch-exact stack, which settles r0/r1's red
   baseline.** r1 reported 12 failing assertions in `053-forced-password-change-data-layer.sql`,
   `070-proc-integrity.sql` and `074-consultor-scope.sql` and diagnosed them as drift of the
   shared target rather than of this tree. r2 tested that diagnosis instead of asserting it: on a
   database built from exactly this branch's 57 migrations, `npm run test:db` is **exit 0,
   Files=43, Tests=4296, `All tests successful`**. No test was skipped, filtered or weakened to
   get there — the same 43 files ran. The reviewer should still confirm the inference, but the
   claim is now measured on both sides.
6. **r1's NULL-`is_active` branch is a widening, and its narrowness is the whole argument.** The
   new `OR EXISTS (… ur.is_active IS NULL AND ur.role_type = 'equipo_directivo')` adds schools that
   `user_school_ids` deliberately refuses. I confined it to `equipo_directivo` rows precisely
   because those are the rows that made the actor school-scoped in the first place, so the fix
   restores agreement without granting anyone a school they did not already carry through the
   classifier. Worth checking specifically: (a) it cannot widen a non-`equipo_directivo` role,
   because `user_school_ids` is untouched and the new branch filters on `role_type`; (b) it cannot
   widen anyone who is not already `auth_is_equipo_directivo_only()`, because the helper is only
   ever consulted from the third clause of a predicate whose first clause already exempted them;
   (c) `user_school_ids` itself is **not** changed, so nothing outside this policy moves. The
   alternative — fixing `user_school_ids` to COALESCE — would have changed every tenant boundary in
   the repository and is far outside this order.

## Known limitations and deferred items

- **L1 — the same shape exists elsewhere and is untouched.** `transformation_assessments_insert`
  and `transformation_assessments_update` also accept `is_admin_or_consultor(auth.uid())` as a
  school-independent escape (`00000000000000_baseline.sql:21740`, `:21750`), which lets an
  `equipo_directivo` write outside their school. Out of this order's allowlist; routed to the PM
  as a candidate successor unit, not fixed here.
- **L2 (r1, now closed) — `npm run e2e` has been run, on an isolated branch-exact stack.**
  Command: `CI=1 E2E_PORT=3000 npm run e2e`, port 3000 proved free immediately beforehand, with
  Playwright starting and owning its own production server (`playwright.config.ts:79` — with `CI`
  set, `reuseExistingServer` is false). Result **exit 1: 269 passed, 60 failed, 27 skipped**.
  **This is not relabelled a pass.** What the 60 are:

  | Spec | Failed | Cause |
  |---|---|---|
  | `e2e/flows/proposal-*.spec.ts` (7 files) | 29 | `page.waitForURL` times out on the login submit. These specs sign in as `admin@test.cl` / `docente.qa@fne.cl` (`proposal-admin-visibility.spec.ts:32,45`), legacy QA personas that `scripts/ci/seed-e2e.mjs` does not create — it creates only the 13 `e2e-*@example.com` fixtures. |
  | `qa/qa-system.spec.ts` | 16 | Same: `admin@test.com` / `tester@test.com` (`:16`,`:18`), absent from the seed; the `beforeEach` login hook times out. |
  | `qa/auth-redirects.spec.ts` | 13 | 4 assert `401` on `/api/users`, `/api/schools`, `/api/courses`, `/api/networks` and observe **404** — those API routes do not exist in this codebase, so the spec is stale, not a bypass. The other 9 are the advisory finding below. |
  | `e2e/reservation.spec.ts` | 2 | `admin@test.cl` again (`:15`). |

  None of the 60 is in the repository's own E2E gate: `.github/workflows/ci.yml:298` runs
  `npx playwright test $(node scripts/ci/e2e-mandatory.mjs --list)`, the 16 mandatory specs, and
  **all 16 are green — 223 passed, 0 failed**, with the anti-skip guard
  (`node scripts/ci/e2e-mandatory.mjs --check test-results/e2e-results.json`) exiting 0 on
  "16 mandatory spec(s) ran with no skips". None of the 60 failing specs references
  `growth_community_transformation_access` or any object this migration creates (`grep` over
  `tests/e2e/flows`, `tests/qa`, `tests/e2e/reservation.spec.ts`: no match). They were measured on
  the **untouched** dispatch state, before r2's only edit.

  **The judgment for the PM:** `npm run e2e` as literally written is a superset of the gate CI
  enforces, and that superset has been red for reasons unrelated to this unit since before it
  started. Making it green would need either legacy QA fixtures seeded (outside this order) or
  specs edited (forbidden). The unit is delivered PARTIAL on this row rather than claimed green.
- **L3 (r1, now closed) — the build gate's environment.** `npm run build` is exit 0, 149/149
  static pages, with `NEXT_PUBLIC_*` supplied from the disposable stack. A `.env.local` was
  required after all — `tests/e2e/auth-lifecycle.spec.ts:74` and `tests/e2e/zoom-mock-mode.spec.ts:76`
  `readFileSync` it at module load with no fallback, so the e2e gate cannot collect without it. It
  was written exactly as `.github/workflows/ci.yml:216-276` writes it, is gitignored
  (`.gitignore:152`), never entered the status lock, and was **deleted at teardown** (absence
  proved in the report). Its values were the well-known public local-stack demo keys, not
  credentials, and they appear in no committed file and in no evidence file (every log and the
  JSON report were scanned and redacted).
- **L4 (r1, superseded) — no shared stack carries this migration any more.** r1 applied it to
  `127.0.0.1:54422`; that stack is gone from this host, removed outside this unit before r2 began.
  r2 applied the migration only to its own disposable database, which has since been destroyed.
- **L5 (r0, resolved) — the file had no negative control.** r1 produced one: with the r0
  function definition restored the new assertions fail 176 and 178, with the r1 definition they
  pass, same database and same test file. See "The r1 regression really does catch SM12-R0-B1".
- **L6 (r1, now closed) — the pgTAP proof is branch-exact.** r1 could only prove the fix against
  the shared stack's drifted schema. r2 re-ran both the focused file (195/195) and the whole suite
  (4296/4296) against a database built from exactly this branch's 57 migrations.
- **L7 (new, advisory — outside this unit, for the PM to route).** Nine `qa/auth-redirects.spec.ts`
  assertions fail because a logged-out browser that opens `/workspace`, `/messages`, `/courses`,
  `/courses/:id`, `/enroll`, `/evaluaciones`, `/quiz/:id`, `/analytics` or `/supervisor-red` is
  still on that URL five seconds later instead of at `/login`; `/dashboard`, `/profile` and the QA
  routes do redirect and pass. `toHaveURL` is web-first and retried for the full timeout, so this
  is not a race in the assertion. **I am not claiming a data leak** — the spec asserts the URL
  only, and these pages guard client-side through `lib/frontend-auth-utils.ts` (`router.push` after
  a session check), so an unauthenticated visitor may well be seeing an empty shell. But "nine
  protected routes do not reach `/login`" is worth someone's deliberate look, and it is on
  untouched code well outside this order's allowlist. Evidence: `evidence/r2/e2e-results-full.json`.

## Cleanup performed by r2

Everything r2 created is gone; each item is proved in `runs/SM-12/executor-report-r2.md`:

| Resource | Disposal |
|---|---|
| Disposable stack (6 containers, 1 network, 2 volumes, all named `*sm12-r2-disposable`) | `supabase stop --no-backup`; `docker ps -a` / `volume ls` / `network ls` show none |
| Synthetic fixtures (13 personas, 2 schools, 14 role rows, 2 communities) | destroyed with the stack's volume |
| `lib/propuestas/__tests__/poc-output.pdf` | deleted. Gitignored (`.gitignore:160`), untracked, deliberately de-tracked in commit `1e6fdd1aa`, and regenerated on every `npm test` by `lib/propuestas/__tests__/poc-generate.test.ts:14` — provenance proved before removal, as the order required |
| `.env.local` | deleted (see L3) |
| `.e2e-outbox/`, `test-results/`, `playwright-report/` | deleted; all three are gitignored (`.gitignore:188,189,192`) and none existed before r2 |
| `runs/SM-12/scratch-r2/` | RUN scratch; the stack config and the migration/test copies removed with it |

No shared or foreign database, container or server was created, modified or removed by r2.
