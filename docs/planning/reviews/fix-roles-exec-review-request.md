# Review request — fix/roles-exec

## Branch

- **Branch**: `fix/roles-exec`
- **Base**: `fix/roles-cache-rls` @ `738e875` (which forks from `origin/main` @ `959c1fe`)
- **Commits**: 1 (2 on the branch counting the base fix)
- **Merge order**: stacked. `fix/roles-cache-rls` must land first, or land both together —
  this branch extends the pgTAP file that branch introduced.

## Objective

Close the last client-reachable entry point to `public.user_roles_cache`.
`fix/roles-cache-rls` revoked client SELECT on the view; this revokes client
EXECUTE on `public.refresh_user_roles_cache()`, the SECURITY DEFINER function
PostgREST exposes as an RPC.

**In scope**: REVOKE migration + pgTAP assertions. **Out of scope**: repairing
the refresh path (see Finding 2 — deliberately not bundled into a security
fix), the client grants on `trigger_refresh_user_roles_cache()` (a trigger
function; PostgREST does not expose `RETURNS trigger`, so it is not callable),
applying either migration to production (Brent's controlled path).

## The problem

`refresh_user_roles_cache()` runs `REFRESH MATERIALIZED VIEW CONCURRENTLY` and
is `SECURITY DEFINER` owned by `postgres`. The baseline grants EXECUTE to
`anon` and `authenticated` (baseline lines 24144-24145). SECURITY DEFINER does
**not** bypass the EXECUTE check, so that grant was the only gate — any holder
of the anon key could invoke it over `/rest/v1/rpc/refresh_user_roles_cache`.
No data disclosure; the cost is server-side work and error-log volume driven by
unauthenticated callers.

**Verified reachable, not theoretical.** The pre-migration pgTAP run (negative
control below) shows the `authenticated` role getting *past* the permission
check and into the function body — it failed with `55000` (the function's own
breakage), not `42501`. Permission was genuinely granted.

## Two findings worth the reviewer's attention

**Finding 1 — `REVOKE FROM PUBLIC` is load-bearing.** `CREATE FUNCTION` grants
EXECUTE to PUBLIC implicitly and the baseline preserved it:
`proacl = {=X/postgres,postgres=X/postgres,anon=X/postgres,...}` — the leading
`=X` is PUBLIC. Revoking only `anon` and `authenticated` would have left both
roles executing via PUBLIC, i.e. a migration that looks correct and fixes
nothing. There is a dedicated assertion pinning this (`aclexplode` / `grantee = 0`).

**Finding 2 — the function cannot currently succeed for anyone, in production.**
`REFRESH ... CONCURRENTLY` requires a unique index with no WHERE clause. The
matview has four indexes, none unique. Confirmed by read-only catalog query
against production: `total_indexes=4, unique_indexes=0`. Every call fails with
`55000`.

Consequences the reviewer should weigh:

- This REVOKE removes no working behavior — the safety argument is unusually strong.
- The role cache has **never** been refreshing via this path. Production shows
  `relispopulated = true`, so the matview holds data, but that data is stale by
  an unknown margin. This corroborates the Z1a-4 finding that stale cache rows
  could resurrect just-revoked roles, and it retroactively strengthens the case
  for the companion read-revoke: the data anon could read was real, just old.
- The four admin routes that call this RPC have been silently logging failures
  (they `console.error` and continue). Nobody noticed.

I did **not** fix the refresh path here. Adding a unique index or dropping
CONCURRENTLY is a behavioral change to a hot trigger-adjacent path and belongs
in its own reviewed change, not smuggled into a privilege revoke. Flagged as a
follow-up.

## Caller audit

- **Production callers** all use the service-role client, which keeps EXECUTE:
  `pages/api/admin/assign-role.ts:613`, `bulk-create-users.ts:418`,
  `growth-communities/[id]/leaders.ts:112`, `tractor-signups/grant.ts:165`.
- **No SQL caller.** `trigger_refresh_user_roles_cache()` (the only trigger in
  the chain, on `profiles`) calls `pg_notify` — it does not invoke the refresh
  function. Nothing else in the baseline or migrations calls it.
- **No client-side caller.** No browser-client `.rpc('refresh_user_roles_cache')`
  anywhere in the repo.

## Files

| Risk | File | Change |
|---|---|---|
| Medium | `supabase/migrations/20260729000000_revoke_client_execute_refresh_roles_cache.sql` | `REVOKE ALL ON FUNCTION` from `PUBLIC`, `anon`, `authenticated`; service_role untouched |
| Low | `supabase/tests/030-user-roles-cache-grants.sql` | plan 13 → 18; adds the function privilege matrix, the PUBLIC-grant assertion, and a functional 42501 check |
| Low | `docs/planning/reviews/fix-roles-exec-review-request.md` | this file |

## Test evidence

- **pgTAP (`supabase test db`)**: 5 files, 44 assertions, all pass.
- **Negative control** (suite run against the DB *before* applying the
  migration): failed exactly the 4 new assertions — 7, 8, 9 (privilege matrix +
  PUBLIC grant) and 14 (functional call). Assertion 14's failure output is the
  proof-of-reachability quoted above: `caught: 55000 ... wanted: 42501`.
- **42501 is a real discriminator.** Because the function body always fails with
  `55000`, a test that merely asserted "the call throws" would pass whether or
  not the grant existed. Asserting the specific SQLSTATE is what makes this
  suite detect a regression.
- **type-check / unit (Vitest) / build**: pass. **Lint**: pass, zero warnings.
- **E2E**: not run — no app-code change (SQL and docs only).

## Areas to scrutinize hardest

1. **`REVOKE ALL` vs `REVOKE EXECUTE`.** Equivalent today (EXECUTE is the only
   function privilege). I chose ALL for future-proofing and consistency with
   the companion migration. Trivially reversible if you prefer the narrower verb.
2. **Finding 2 left unfixed.** The strongest challenge to this branch is "you
   found the refresh is broken and shipped a revoke anyway." I believe splitting
   is right, but it is a judgment call and the follow-up must actually happen —
   otherwise the cache silently rots forever.
3. **Stacked-branch mechanics.** This branch edits a test file that only exists
   on `fix/roles-cache-rls`. Merging this alone onto main would conflict/fail.
4. **Migration timestamp ordering.** `20260729000000` must sort after
   `20260728000000`; both are pending in production, so they apply in sequence.
5. **`aclexplode` assertion portability.** `grantee = 0` for PUBLIC is stable
   Postgres behavior but is a catalog-internals detail; confirm you are happy
   depending on it in CI.

## Known limitations / deferred

- **Refresh path still broken** (Finding 2) — needs its own change: either add
  `CREATE UNIQUE INDEX ... ON user_roles_cache (user_id, role, ...)` (note
  `user_id` alone is not unique — a user can hold several role rows) or drop
  `CONCURRENTLY` and accept the exclusive lock. Recommend the unique index.
- **Neither migration is applied to production.** Both exposures remain live in
  prod until the SQL is run through the controlled DB path; merging to main
  only deploys app code.
- `trigger_refresh_user_roles_cache()` retains client grants — harmless (not
  invocable via PostgREST), left alone to keep this diff minimal.
