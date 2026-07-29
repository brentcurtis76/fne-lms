# Review request — fix/roles-refresh

## Branch

- **Branch**: `fix/roles-refresh`
- **Base**: `fix/roles-exec` @ `2e2b2f9` → `fix/roles-cache-rls` @ `738e875` → `origin/main` @ `959c1fe`
- **Commits**: 1 (3rd in the stack)
- **Merge order**: strictly stacked. `fix/roles-cache-rls` → `fix/roles-exec` → this.
  All three edit `supabase/tests/030-user-roles-cache-grants.sql`; merging out of
  order conflicts.

## Objective

Make `public.refresh_user_roles_cache()` actually work. It ran
`REFRESH MATERIALIZED VIEW CONCURRENTLY`, which requires a UNIQUE index with no
WHERE clause; the matview has four indexes and none is unique, so **every call
has always failed** with SQLSTATE `55000`.

**In scope**: repair the refresh. **Out of scope**: de-duplicating `user_roles`
(destructive — needs its own reviewed change), re-keying the matview, applying
any of the three migrations to production.

## Impact of the bug (measured against production, read-only)

| | |
|---|---|
| Cached rows | 250 |
| Live role assignments | 734 |
| Missing from cache | 484 (66%) |

The cache has never refreshed through this path. The four admin routes calling
the RPC (`assign-role.ts:613`, `bulk-create-users.ts:418`,
`growth-communities/[id]/leaders.ts:112`, `tractor-signups/grant.ts:165`)
`console.error` and continue, so the failure was invisible. This is the
mechanism behind the Z1a-4 finding that stale cache rows could resurrect
just-revoked roles.

## Approach — and why the two obvious ones don't work

The task proposed (A) add a unique index, or (B) add `user_roles.id` to the
matview. I rejected both on evidence and took a third path.

**(A) is impossible in principle, not merely blocked by current data.** A unique
index must cover the matview's own columns, and the matview projects nothing
that distinguishes two identical `user_roles` rows: `approval_status`,
`is_admin` and `is_teacher` are pure functions of `user_id`/`role_type`, and
`cached_at` is `now()` — constant across a refresh. Production bears this out:

- 3 duplicate groups (8 rows, 5 excess) on
  `(user_id, role, school_id, generation_id, community_id)` in the **live source
  query** → future refreshes would fail even if the index existed.
- 2 groups of **exact full-row duplicates** already in the matview →
  `CREATE UNIQUE INDEX` fails outright.

`NULLS NOT DISTINCT` (the task's suggested mitigation) does not help: the
duplicates are genuine repeated rows, not an artifact of NULL comparison. All 3
groups do have NULL `generation_id`, but none has NULL `school_id` or
`community_id`, and full-row equality holds regardless of NULL semantics.

**(B) requires `DROP` + `CREATE` of the matview** — a matview's column list
cannot be altered — which the additive-only rule forbids without explicit
sign-off. It also would not fix the underlying duplicate rows, just key around
them.

**(C) — what I did: drop `CONCURRENTLY`.** `CREATE OR REPLACE FUNCTION` with a
plain `REFRESH MATERIALIZED VIEW`. Additive, no DROP, needs no unique index,
tolerates the duplicates as-is, works on an unpopulated matview, and is legal
inside a function and a transaction (`CONCURRENTLY` is not) so the PostgREST RPC
path works too. Also adds an explicit `search_path` to the SECURITY DEFINER
function, which had none.

**Trade-off**: plain refresh takes an ACCESS EXCLUSIVE lock, so readers block
for its duration. At 734 rows that is sub-millisecond, against a status quo of
never refreshing at all. The path back to `CONCURRENTLY`, if the matview ever
grows enough to matter: de-duplicate `user_roles`, add a real key, restore the
keyword.

## Privilege safety

`CREATE OR REPLACE FUNCTION` preserves the existing ACL, so the client revokes
from `20260729000000` survive — verified directly (`proacl` identical before and
after: `{postgres=X/postgres,service_role=X/postgres}`), and pinned by the
anon/authenticated/PUBLIC assertions that run after this migration. If a future
edit ever replaces the function in a way that resets grants, the suite goes red.

## Files

| Risk | File | Change |
|---|---|---|
| Medium | `supabase/migrations/20260729120000_fix_user_roles_cache_refresh.sql` | `CREATE OR REPLACE` the function without `CONCURRENTLY`; pin `search_path`; schema-qualify; add COMMENT |
| Low | `supabase/tests/030-user-roles-cache-grants.sql` | plan 18 → 23; definition assertions + end-to-end refresh regression test |
| Low | `docs/planning/reviews/fix-roles-refresh-review-request.md` | this file |

## Test evidence

- **pgTAP (`supabase test db`)**: 5 files, 49 assertions, all pass — including
  after a full `supabase db reset` (from-scratch replay of all migrations, which
  is what CI Gate 3 does).
- **Negative control** (suite run *before* applying this migration): failed
  exactly the 4 new assertions — 11, 12 (definition) and 22, 23 (behavior). Test
  22's output captured the live bug verbatim:
  `CONTEXT: SQL statement "REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache"`,
  and test 23 showed the cache unchanged (`have: (0), want: (1)`).
- **The behavioral test moves data, not just exits cleanly**: it inserts a new
  role assignment, asserts the cache does *not* contain it, refreshes, then
  asserts it does. A bare `lives_ok` would have passed against a no-op.
- **type-check / unit (Vitest) / build / lint**: pass, zero warnings.
- **E2E**: not run — SQL and docs only, no app-code change.

## Areas to scrutinize hardest

1. **Deviation from the assigned approach.** I was told to prefer (A) and did
   not. The whole branch rests on the duplicate-row evidence above — if that
   analysis is wrong, the conclusion is wrong. The queries are reproducible
   against production read-only; re-run them.
2. **ACCESS EXCLUSIVE lock.** The one real regression risk. The matview is read
   by `auth_get_user_role()`, `auth_is_teacher()`, `auth_has_school_access*()`,
   which RLS policies call — so a slow refresh would stall queries. Judged
   negligible at 734 rows; challenge the judgment, not just the arithmetic.
3. **Duplicate rows left in place.** This change makes the cache faithfully
   reproduce duplicates instead of failing. Arguably the duplicates are a
   data-quality bug that should be fixed first; I judged a destructive dedupe
   out of scope for a repair migration. That ordering is debatable.
4. **`search_path` addition is scope creep.** Small, security-positive, and free
   given the function was being replaced anyway — but it is not strictly part of
   "make refresh work". Easy to split out if you object.
5. **`proconfig` assertion is brittle to formatting.** It matches the exact
   string `search_path=public, pg_temp`. If someone reformats the migration, the
   test fails for a cosmetic reason. Deliberate (it pins the literal setting) but
   worth a second opinion.

## Known limitations / deferred

- **Duplicate `user_roles` rows remain** (3 groups, 5 excess rows in the live
  source). Needs a separate, reviewed, destructive migration plus a decision on
  whether a uniqueness constraint belongs on `user_roles` itself. Until then the
  matview cannot be re-keyed and `CONCURRENTLY` cannot return.
- **None of the three migrations is applied to production.** Merging to main
  deploys app code only; the read exposure, the RPC exposure, and this stale
  cache all persist in prod until the SQL runs through the controlled DB path.
  Recommend applying all three together, in timestamp order.
- **First successful refresh will be a large one** — it will add ~484 missing
  rows. Expected and desirable, but it is the first time this path has ever
  moved data, so watch it.
