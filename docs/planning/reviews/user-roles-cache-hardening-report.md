# Review report — `user_roles_cache` hardening stack (3 branches)

**For**: an independent code reviewer.
**Subject**: three stacked branches fixing two security exposures and one
long-standing functional bug on `public.user_roles_cache` and its refresh
function.
**Date**: 2026-07-29. **Repo**: GENERA (FNE-LMS).
**Status**: all three branches implemented, gated, pushed, unmerged.

> **Re-audited 2026-07-29 (later).** `fix/sess-leak` (Z1a-4/Z1a-5) merged to
> `main` as PR #24 (`c8b84f4`) after this stack was branched. The caller audit
> below was re-run against the new `origin/main` (`2786fa8`). Two corrections
> resulted: the RPC caller inventory is **seven** routes, not four (§5), and
> the read-path effect now splits cleanly into **browser callers (denied, fail
> closed)** vs **server callers (service-role, retained)** (§4).
> The stack's base `959c1fe` is still an ancestor of `main`, `git merge-tree`
> reports **no conflicts**, and there is **zero file overlap** between what this
> stack touches and what `main` changed in the interim.

This document is self-contained — you should not need any prior conversation.
Every factual claim below is reproducible with the commands given. Where a
judgment call was made, it is labelled as such. Production figures were obtained
via a **read-only** catalog/aggregate query; no production data was modified and
no personal data is reproduced here (only counts).

---

## 1. TL;DR

| # | Problem | Type | Severity | Branch | Migration |
|---|---|---|---|---|---|
| 1 | `user_roles_cache` matview readable by `anon`/`authenticated`; matviews cannot carry RLS | Cross-tenant information disclosure | High | `fix/roles-cache-rls` | `20260728000000` |
| 2 | `refresh_user_roles_cache()` EXECUTE-able by `anon`/`authenticated` via PostgREST RPC | Unauthenticated-triggerable server work | Medium | `fix/roles-exec` | `20260729000000` |
| 3 | That same function has **never worked** — `REFRESH … CONCURRENTLY` with no unique index → SQLSTATE 55000 on every call | Functional bug (silent) | High | `fix/roles-refresh` | `20260729120000` |

All three are **pre-existing**, inherited from
`supabase/migrations/00000000000000_baseline.sql`. None was introduced by
recent work. Problems 1 and 3 are causally linked to the Z1a-4 finding that
stale cache rows could resurrect just-revoked roles.

**Net effect once applied**: the matview has no client-reachable entry point
(read or refresh), and the refresh path works for the first time.

---

## 2. The stack

Linear, each branch built on the previous. Base is `origin/main` @ `959c1fe`.

```
959c1fe  base (still an ancestor of origin/main @ 2786fa8)
  └─ 738e875  fix/roles-cache-rls   REVOKE on the view
       └─ 2e2b2f9  fix/roles-exec        REVOKE EXECUTE on the function
            └─ 77ed4f5  fix/roles-refresh     repair the function
                 ├─ 52d9df0  docs: consolidated report (this file)
                 └─ c9a9475  docs: post-PR-#24 caller re-audit   ← STACK TIP
```

The two trailing commits are documentation only. `c9a9475` additionally
corrects the header comments of the `20260728000000` and `20260729000000`
migrations — see the note in §7.

**Merge order is mandatory**: `fix/roles-cache-rls` → `fix/roles-exec` →
`fix/roles-refresh`. All three modify
`supabase/tests/030-user-roles-cache-grants.sql`; merging out of order
conflicts. Migration timestamps encode the same order.

Review the tip branch to see the whole stack:

```bash
git fetch origin && git checkout fix/roles-refresh && git log --oneline origin/main..HEAD
```

---

## 3. Reviewer setup

Gates are the repo's four CI gates plus lint. To run the DB gate locally:

```bash
supabase db reset && supabase test db
```

Two environment gotchas that will otherwise waste your time:

- **`supabase db start` does not re-apply migrations** to an already-running
  local DB. Use `supabase migration up --local`, or `supabase db reset` for a
  full from-scratch replay (which is what CI Gate 3 does).
- **ESLint 8 cascade in worktrees.** If you review inside a git worktree under
  the parent checkout, `npm run lint` fails with "couldn't determine the plugin
  `@next/next` uniquely" — it walks up into the parent's `.eslintrc.json`. Add
  `"root": true` to `.eslintrc.json` temporarily, run lint, then revert. This is
  a pre-existing environment quirk, **not** something these branches introduced,
  and no committed file contains the workaround.

---

## 4. Problem 1 — matview readable by any anon-key holder

### What was wrong

`public.user_roles_cache` is a **materialized view**, so it cannot carry RLS —
`ALTER MATERIALIZED VIEW … ENABLE ROW LEVEL SECURITY` does not exist. Its only
protection is table privileges, and the baseline granted everything:

- `supabase/migrations/00000000000000_baseline.sql:26063` — `GRANT ALL … TO anon`
- `…:26064` — `GRANT ALL … TO authenticated`
- View definition at `…:11406`

PostgREST exposes matviews in the `public` schema, so
`GET /rest/v1/user_roles_cache?select=*` with the anon key returned **every
user's role assignments**: `user_id`, `role`, `school_id`, `community_id`,
`generation_id`, `approval_status`, `is_admin`, `is_teacher`.

This is cross-tenant: a user at school A could enumerate the role graph of every
other school. Under the project's privacy rules (Ley 21.719) role assignments
tied to identifiable users are protected personal data.

**Not theoretical** — the application itself reads it through exactly this path
with a browser client (`utils/roleUtils.ts:195-196`), which is proof the
PostgREST route works. Production confirmed still-open at time of writing:
`has_table_privilege('anon','public.user_roles_cache','SELECT') = true`.

### The fix

`supabase/migrations/20260728000000_revoke_client_read_user_roles_cache.sql`

```sql
REVOKE ALL ON TABLE public.user_roles_cache FROM PUBLIC;
REVOKE ALL ON TABLE public.user_roles_cache FROM anon;
REVOKE ALL ON TABLE public.user_roles_cache FROM authenticated;
```

`service_role` keeps its grant.

### Why this breaks nothing — caller audit

Run `grep -rn "user_roles_cache" --include="*.ts" --include="*.tsx" .` to
reproduce.

- **DB-side readers** — `auth_get_user_role()`, `auth_is_teacher()`,
  `auth_has_school_access()`, `auth_has_school_access_uuid()`,
  `refresh_user_roles_cache()`. All are `SECURITY DEFINER` owned by `postgres`,
  so they read with the owner's privileges, not the caller's. Unaffected. No RLS
  policy or view references the matview directly.
- **App-side** — the only reader is `getUserRolesFromCache()`
  (`utils/roleUtils.ts:180`), reachable exclusively from `getUserRoles()`'s
  degraded path. Since Z1a-5 that path executes **only when the authoritative
  `user_roles` query ERRORS** — a zero-row result is authoritative and never
  falls through. It runs on whatever client the caller passed, which is what
  splits the effect in two:

**Browser callers → denied, fail closed.** The cache SELECT raises `42501`,
`getUserRolesFromCache()` logs it and returns `[]`, so the degraded path yields
an empty role list rather than stale rows.

| Caller | Client |
|---|---|
| `hooks/useAuthEnhanced.ts:127` | browser |
| `pages/dashboard.tsx:345` | browser |
| `pages/detailed-reports.tsx:154` | browser |
| `pages/user/[userId].tsx:108` | browser |
| `pages/api/admin/check-permissions.ts:48` | **server route, but anon-key** `createServerSupabaseClient({req,res})` |

That last row is the one a reviewer is most likely to misclassify: it is an API
route, but it builds a request-scoped client on the anon key plus the user's
session, so for privilege purposes it is a client caller and is denied.

**Server callers → unaffected.** `service_role` keeps its grant, so the degraded
path still returns its display rows. This is the overwhelming majority of the
~90 `getUserRoles()` call sites — every route that builds a service client, plus
`lib/api/meetings/load-context.ts:135` and
`lib/utils/session-meet-access.ts:68`. Note `pages/api/reports/detailed.ts:65`
and `filter-options.ts:32` pass a variable named `supabase` that is a
module-level **service-role** client — again, judge by construction, not name.

- **Admin API routes** only call the *refresh* RPC, never read the view (§5).

### Expected outcome

- `anon` and `authenticated` receive permission-denied (SQLSTATE `42501`) on any
  direct read of the matview.
- Self-reads are unaffected in substance: they are already served by the
  `read_own_roles` RLS policy on `public.user_roles`
  (`baseline.sql:21424`), which this migration does not touch. A signed-in user
  reading their own roles through the anon client keeps working.
- **No authorization change, in either direction.** Since Z1a-5 every cached row
  is stamped `from_cache: true`; `getHighestRole()` refuses those rows and every
  scope check reads them as no scope. The degraded path was already
  authorization-inert, so denying it removes no grant and creates no new denial
  of a legitimate grant.
- **The only user-visible effect is display continuity during an outage**, and
  only for browser callers. If `user_roles` is erroring, those callers now show
  an empty role list instead of stale cached rows — the shell no longer knows
  which communities the user belongs to until the primary query recovers.
  Server (service-role) callers keep the fallback and see no change.
- Normal operation is entirely unaffected for everyone: with `user_roles`
  healthy the cache is never consulted at all.

### Design decision to challenge

No `SECURITY DEFINER` self-read wrapper was added. Rationale: after the audit no
legitimate client-side reader remains, self-reads already flow through
`user_roles` RLS, and an unused definer function is fresh attack surface. **If
you find a client path that genuinely needs the view, this decision reverses.**

`REVOKE … FROM PUBLIC` is broader than the strict minimum. Intentional: a
PUBLIC-inherited grant would evade the two named revokes.

---

## 5. Problem 2 — refresh function callable by any anon-key holder

### What was wrong

`public.refresh_user_roles_cache()` is `SECURITY DEFINER` owned by `postgres`.
The baseline granted EXECUTE to clients:

- `baseline.sql:24144` — `GRANT ALL ON FUNCTION … TO anon`
- `baseline.sql:24145` — `GRANT ALL ON FUNCTION … TO authenticated`
- Function definition at `baseline.sql:4498`

PostgREST exposes `public`-schema functions as RPC, so any anon-key holder could
`POST /rest/v1/rpc/refresh_user_roles_cache`. **`SECURITY DEFINER` does not
bypass the EXECUTE check** — the grant was the only gate. No data disclosure;
the cost is server-side work and error-log volume driven by unauthenticated
callers.

**Proven reachable.** The pre-migration pgTAP run (negative control, §8) shows
the `authenticated` role getting *past* the permission check and into the
function body: it failed with `55000` (the function's own breakage — Problem 3),
not `42501`. Permission was genuinely granted.

### The fix

`supabase/migrations/20260729000000_revoke_client_execute_refresh_roles_cache.sql`

```sql
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM authenticated;
```

### The subtle part — `REVOKE FROM PUBLIC` is load-bearing

`CREATE FUNCTION` grants EXECUTE to `PUBLIC` implicitly, and the baseline
preserved it. Observed `pg_proc.proacl` before the fix:

```
{=X/postgres,postgres=X/postgres,anon=X/postgres,authenticated=X/postgres,service_role=X/postgres}
 ^^^^^^^^^^^ this leading "=X" is the PUBLIC grant
```

Revoking only `anon` and `authenticated` would have left both roles still
executing via `PUBLIC` — **a migration that looks correct and fixes nothing.** A
dedicated assertion pins this using `aclexplode(...)` with `grantee = 0`.

After the fix: `{postgres=X/postgres,service_role=X/postgres}`.

### Caller audit

**Full RPC caller inventory — seven routes**, re-audited against `origin/main`
`2786fa8` (an earlier pass against the pre-PR-#24 main listed only four; that
was incomplete). All seven are **server callers on a service-role client**, so
none is affected by the REVOKE:

| # | Call site | Receiver | Service-role? |
|---|---|---|---|
| 1 | `pages/api/admin/assign-role.ts:613` | `supabaseService` | yes — `createServiceRoleClient()` |
| 2 | `pages/api/admin/bulk-create-users.ts:418` | `supabaseAdmin` | yes — `createClient(…, SUPABASE_SERVICE_ROLE_KEY)` |
| 3 | `pages/api/admin/delete-user.ts:116` | `supabaseAdmin` | yes — `createServiceRoleClient()` |
| 4 | `pages/api/admin/growth-communities/[id]/leaders.ts:112` | `supabase` | yes — `createServiceRoleClient()` at :84 |
| 5 | `pages/api/admin/networks/supervisors.ts:205` | `supabase` (param) | yes — see trap below |
| 6 | `pages/api/admin/remove-role.ts:145` | `supabaseService` | yes — `createServiceRoleClient()` |
| 7 | `pages/api/admin/tractor-signups/grant.ts:165` | `supabase` (param) | yes — `createServiceRoleClient()` at :282 |

**Naming trap — verify rows 5 and 7 at the call site, not the variable name.**
`networks/supervisors.ts` builds an anon-key `supabase` at handler scope (`:23`)
*and* a service-role `supabaseAdmin` (`:33`), then passes `supabaseAdmin` into
`handleRemoveSupervisor()` (`:46`), whose parameter is itself named `supabase`
(`:155`). Line 205 therefore reads exactly like the anon client but is
service-role. `grant.ts` does the same thing via `refreshRolesCache(supabase)`.
Judging either by variable name alone predicts a `42501` regression that does
not exist. I initially misread row 5 this way; checking the binding corrected it.

- **No browser caller of this RPC exists** anywhere in the repo.
- **No SQL caller.** The trigger `profiles_changed_refresh_cache`
  (`baseline.sql:15364`) fires `trigger_refresh_user_roles_cache()`, which only
  calls `pg_notify` (`baseline.sql:5007-5012`) — it does **not** invoke the
  refresh function.
- **No client-side caller** anywhere in the repo.

### Expected outcome

`anon`/`authenticated` receive `42501` on the RPC. All seven admin routes above
are unaffected, because every one of them is a server caller holding
service-role. There is no browser caller to break.

### Left alone deliberately

`trigger_refresh_user_roles_cache()` retains its client grants
(`baseline.sql:24300-24301`). It is a `RETURNS trigger` function, which PostgREST
does not expose and which cannot be called directly, so it is not reachable.
Left untouched to keep the diff minimal — flag if you disagree.

---

## 6. Problem 3 — the refresh function has never worked

### What was wrong

The function body was:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache;
```

`CONCURRENTLY` **requires** a UNIQUE index with no `WHERE` clause on the
matview. `user_roles_cache` has four indexes
(`baseline.sql:15220-15232`) — `is_admin`, `is_teacher`, `role`, `user_id` — and
**none is unique**. Therefore every call has always failed with SQLSTATE `55000`
("cannot refresh materialized view … concurrently"). On an unpopulated matview
it fails even earlier, with `55000` "CONCURRENTLY cannot be used when the
materialized view is not populated".

All seven admin routes (§5) `console.error` and continue, so the failure was
invisible. Verified against production (read-only): `total_indexes = 4`,
`unique_indexes = 0`, PostgreSQL 15.8.

### Measured impact (production, read-only, 2026-07-29)

| Metric | Value |
|---|---|
| Rows in `user_roles_cache` | 250 |
| Live role assignments (`is_active` + `approved`) | 734 |
| **Missing from cache** | **484 (66%)** |

The cache has never refreshed through this path. This is the mechanism behind
the Z1a-4 finding that stale cache rows could resurrect just-revoked roles.

### Why the two obvious fixes are not available

**(A) Add a unique index — impossible in principle, not merely blocked by
current data.** A unique index must cover the matview's own columns, and the
matview projects nothing that distinguishes two identical `user_roles` rows:
`approval_status`, `is_admin` and `is_teacher` are pure functions of
`user_id`/`role_type`, and `cached_at` is `now()`, constant across a refresh.
Production evidence:

- **3 duplicate groups** (8 rows, 5 excess) on
  `(user_id, role, school_id, generation_id, community_id)` in the **live source
  query** → future refreshes would fail even if an index existed.
- **2 groups of exact full-row duplicates** already in the matview →
  `CREATE UNIQUE INDEX` fails outright.

`NULLS NOT DISTINCT` (PG15+, available on 15.8) does **not** help: these are
genuine repeated rows, not an artifact of NULL comparison. All 3 groups have
NULL `generation_id`, but none has NULL `school_id` or `community_id`, and
full-row equality holds regardless of NULL semantics.

Reproduce:

```sql
select count(*) from (
  select ur.user_id, ur.role_type, ur.school_id, ur.generation_id, ur.community_id
  from user_roles ur join profiles p on ur.user_id = p.id
  where ur.is_active = true and p.approval_status = 'approved'
  group by 1,2,3,4,5 having count(*) > 1) d;
```

**(B) Add `user_roles.id` to the matview** — a matview's column list cannot be
altered, so this needs `DROP` + `CREATE`, which the repo's additive-only rule
forbids without explicit sign-off. It also would not fix the duplicate rows,
only key around them.

### The fix — drop `CONCURRENTLY`

`supabase/migrations/20260729120000_fix_user_roles_cache_refresh.sql` does
`CREATE OR REPLACE FUNCTION` with a plain `REFRESH MATERIALIZED VIEW`, plus an
explicit `search_path` (the SECURITY DEFINER function had none) and a schema
qualification.

Plain refresh: needs no unique index, tolerates the duplicates as-is, works on
an unpopulated matview, and — unlike `CONCURRENTLY` — is legal inside a function
and a transaction, so the RPC path works.

**Trade-off**: plain refresh takes an `ACCESS EXCLUSIVE` lock, so readers block
for its duration. At 734 rows that is sub-millisecond, against a status quo of
never refreshing at all. Path back to `CONCURRENTLY` if the matview ever grows
enough to matter: de-duplicate `user_roles`, add a real key, restore the keyword.

### Privilege safety (important interaction with Problem 2)

`CREATE OR REPLACE FUNCTION` preserves the existing ACL, so the revokes from
`20260729000000` survive. Verified directly — `proacl` identical before and
after (`{postgres=X/postgres,service_role=X/postgres}`) — and pinned by the
anon/authenticated/PUBLIC assertions that run *after* this migration. If a
future edit ever replaces the function in a way that resets grants, the suite
goes red.

### Expected outcome

- `refresh_user_roles_cache()` succeeds instead of raising `55000`.
- The first production run will add roughly **484 missing rows** — the first
  time this path has ever moved data. Expected and desirable, but worth watching.
- Role changes made through all seven admin routes (§5) will actually propagate
  to the cache, closing the stale-role window.

---

## 7. Complete file inventory

**Eight unique files**, all additive except the shared test file (which three
branches modify in turn, so it appears three times below). **No application code
was modified anywhere in this stack** — SQL, tests and docs only.

| Branch | File | Status | Lines | Purpose |
|---|---|---|---|---|
| `fix/roles-cache-rls` | `supabase/migrations/20260728000000_revoke_client_read_user_roles_cache.sql` | created | 51 | REVOKE on the matview |
| | `supabase/tests/030-user-roles-cache-grants.sql` | created | 191 | pgTAP suite, `plan(13)` |
| | `docs/planning/reviews/fix-roles-cache-rls-review-request.md` | created | 98 | per-branch review request |
| `fix/roles-exec` | `supabase/migrations/20260729000000_revoke_client_execute_refresh_roles_cache.sql` | created | 57 | REVOKE EXECUTE on the function |
| | `supabase/tests/030-user-roles-cache-grants.sql` | modified | +70/−11 | → `plan(18)` |
| | `docs/planning/reviews/fix-roles-exec-review-request.md` | created | 130 | per-branch review request |
| `fix/roles-refresh` | `supabase/migrations/20260729120000_fix_user_roles_cache_refresh.sql` | created | 58 | repair the function |
| | `supabase/tests/030-user-roles-cache-grants.sql` | modified | +79/−7 | → `plan(23)` |
| | `docs/planning/reviews/fix-roles-refresh-review-request.md` | created | 144 | per-branch review request |
| `fix/roles-refresh` (docs commits) | `docs/planning/reviews/user-roles-cache-hardening-report.md` | created | — | **this report** (`52d9df0`, re-audited in `c9a9475`) |

The two migration line counts are their **current** sizes, after `c9a9475`
expanded their header comments (they were 27 and 39 when first committed). The
three per-branch review-request files satisfy the repo's "a phase without its
review-request file is not complete" rule and contain the same analysis scoped
to each branch.

> **Where to read the migration comments.** The post-PR-#24 re-audit corrected
> the header comments of `20260728000000` (browser vs server split) and
> `20260729000000` (seven-route RPC inventory). Those corrections landed as a
> later commit on the **tip** branch `fix/roles-refresh`, not as history rewrites
> of the branches that introduced the files — so `fix/roles-cache-rls` and
> `fix/roles-exec` still carry the earlier, less precise comment text. The
> merged result is correct, and only comments differ. **Review the tip's
> version.** If you would rather each branch carry its own final comment, the
> stack can be rebased to fold the corrections back — say so and it will be
> redone that way.

---

## 8. Test evidence

**Final state**: `supabase test db` → **5 files, 49 assertions, all pass**,
including after a full `supabase db reset` (from-scratch replay of every
migration — the CI Gate 3 path).

All other gates pass: `npm run type-check`, `npm run lint` (zero warnings),
`npm test` (197 files, 2493 tests), `npm run build`. E2E not run — no app-code
change in the stack.

### Negative controls — the part worth your attention

Each branch's suite was run against a database that had **not** yet applied that
branch's migration, to prove the assertions actually detect the vulnerable
state rather than passing vacuously.

| Branch | Result before its migration | Failing assertions |
|---|---|---|
| `fix/roles-cache-rls` | failed 7 of 13 | 2-5, 8-9, 12 |
| `fix/roles-exec` | failed 4 of 18 | 7-9, 14 |
| `fix/roles-refresh` | failed 4 of 23 | 11-12, 22-23 |

Two of these outputs are themselves primary evidence of the bugs:

- **`fix/roles-exec`, assertion 14** — `caught: 55000 … wanted: 42501`. As
  `authenticated`, the call reached the function body. That is the proof that
  the EXECUTE grant was real and reachable.
- **`fix/roles-refresh`, assertions 22-23** —
  `CONTEXT: SQL statement "REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache"`
  and then the cache unchanged (`have: (0), want: (1)`). That is Problem 3
  captured live.

Reproduce any of them:

```bash
git checkout <branch> && git stash push supabase/migrations/<that-branch-migration>.sql
supabase db reset && supabase test db   # expect the listed failures
git stash pop && supabase db reset && supabase test db   # expect PASS
```

### Two assertion-design notes

- **`42501` is a deliberate discriminator, not laziness.** Because the function
  body used to always fail with `55000`, a test asserting merely "the call
  throws" would have passed whether or not the grant existed. Asserting the
  specific SQLSTATE is what makes the suite detect a regression. After Problem 3
  is fixed the assertion is stronger still: the body now *succeeds* for a
  permitted caller, so a returning grant surfaces as a passing call.
- **The refresh test proves data movement, not just absence of error.** It
  inserts a new role assignment, asserts the cache does **not** contain it,
  refreshes, then asserts it does. A bare `lives_ok` would have passed against a
  no-op.

---

## 9. What to scrutinize hardest

Ranked. Items 1-3 are where I most expect to be wrong.

1. **The deviation on Problem 3.** The assigned approach was "add a unique
   index"; I rejected it. The entire branch rests on the duplicate-row evidence
   in §6. If that analysis is wrong, the conclusion is wrong. The queries are
   reproducible read-only against production — re-run them rather than trusting
   the numbers here.
2. **The `ACCESS EXCLUSIVE` lock** introduced by dropping `CONCURRENTLY`. This
   is the one real regression risk in the stack. The matview is read by
   `auth_get_user_role()`, `auth_is_teacher()` and `auth_has_school_access*()`,
   which RLS policies invoke — a slow refresh would stall queries. Judged
   negligible at 734 rows. Challenge the judgment, not just the arithmetic.
3. **No SECURITY DEFINER read-wrapper** (§4). If any client path genuinely needs
   the view, the REVOKE-only design is wrong.
4. **Duplicate rows left in place.** Problem 3's fix makes the cache faithfully
   reproduce duplicate rows rather than failing. Arguably the duplicates are a
   data-quality bug that should be fixed *first*; I judged a destructive dedupe
   out of scope for a repair migration. That ordering is debatable.
5. **`REVOKE ALL` vs `REVOKE EXECUTE`/`SELECT`.** Broader verb than the strict
   minimum, chosen for future-proofing and to catch PUBLIC-inherited grants.
   Trivially narrowed if you prefer.
6. **`search_path` addition is scope creep.** Small, security-positive, free
   given the function was being replaced — but not strictly part of "make
   refresh work". Easy to split out.
7. **Catalog-internals assertions.** `aclexplode(...) grantee = 0` for PUBLIC and
   the `proconfig` string match `search_path=public, pg_temp` are both stable
   Postgres behavior but are internals; the `proconfig` one is brittle to
   cosmetic reformatting of the migration. Deliberate — confirm you are happy
   depending on them in CI.
8. **Stacked-branch mechanics.** Three branches, one shared test file, strict
   merge order. Verify the ordering holds and that no branch merges alone.
9. **The caller inventories (§4, §5) — re-derive them, do not trust them.** An
   earlier pass of this report undercounted the RPC callers (four instead of
   seven) because it ran against the pre-PR-#24 `main`, and separately I
   misclassified `networks/supervisors.ts:205` as an anon-key call because the
   parameter shadows the name. Both are corrected, but the class of error is
   easy to repeat. Re-run:
   `git grep -n "refresh_user_roles_cache" origin/main -- '*.ts' '*.tsx'` and
   `git grep -n "getUserRoles(" origin/main -- '*.ts' '*.tsx'`, and resolve each
   receiver to its construction site rather than its identifier.

---

## 10. Known limitations and follow-ups

- **None of the three migrations is applied to production.** Merging to `main`
  deploys application code only — it does not run migrations. Until the SQL runs
  through the controlled DB path, the read exposure, the RPC exposure and the
  stale cache all persist in production. **Recommend applying all three
  together, in timestamp order.**
- **Duplicate `user_roles` rows remain** (3 groups, 5 excess rows in the live
  source). Needs a separate reviewed change: it is a destructive data fix and
  likely also an app-side idempotency bug in whichever admin route creates them.
  Until then the matview cannot be re-keyed and `CONCURRENTLY` cannot return.
  Tracked as a follow-up task.
- **`trigger_refresh_user_roles_cache()` retains client grants** — not reachable
  (see §5), left alone deliberately.
- **Display continuity during a `user_roles` outage** is reduced for browser
  callers only (see §4). No authorization effect. `fix/sess-leak` has since
  merged (PR #24), so the earlier concern about `pages/user/[userId].tsx`
  showing roles via the leak no longer applies — that path only reaches the
  cache when the primary query errors.
- **First production refresh will be large** (~484 rows added).

## 11. Explicit non-goals

Not attempted in this stack, on purpose: de-duplicating `user_roles`; re-keying
or recreating the matview; changing any application code; applying migrations to
production; revisiting anything delivered by `fix/sess-leak`, which is already
merged (PR #24) and is treated here as part of the `main` baseline.
