# Review request — fix/roles-cache-rls

## Branch

- **Branch**: `fix/roles-cache-rls`
- **Base**: `origin/main` @ `959c1fe` (fix(assessment-builder): indicator PUT camelCase mapping, #23)
- **Commits**: 1

## Objective

Close the cross-tenant read exposure on `public.user_roles_cache`. The
materialized view cannot carry RLS, and the baseline grants `ALL` on it to
`anon` and `authenticated` — any client holding the anon key could enumerate
every user's role assignments (`user_id`, `role`, `school_id`, `community_id`,
`generation_id`). Recorded as a residual risk in the fase-1 PM dossier
(Z1a-4 caller audit, "Ticketed for Brent"); Z1a itself was no-migrations scope.

**In scope**: REVOKE migration + pgTAP grant suite. **Out of scope**: app-code
changes (none are needed — see audit), the anon/authenticated EXECUTE grant on
`refresh_user_roles_cache()` (flagged separately), applying the migration to
production (Brent's controlled path).

## Caller audit (why REVOKE-only is safe)

- **DB-side**: every reader of the view — `auth_get_user_role()`,
  `auth_is_teacher()`, `auth_has_school_access()`,
  `auth_has_school_access_uuid()`, `refresh_user_roles_cache()` — is
  `SECURITY DEFINER` owned by `postgres`; unaffected. No RLS policy or view
  references the matview directly (checked baseline + all migrations).
- **App-side (main)**: the only reader is the fallback inside
  `getUserRoles` (`utils/roleUtils.ts:195`). It fires only when the primary
  RLS-guarded `user_roles` query returns zero rows, and its error path
  degrades to `[]`. Self-reads are already served by the `read_own_roles`
  policy on `user_roles`, so post-REVOKE the fallback only loses what it
  should never have had: cross-user reads (e.g. `pages/user/[userId].tsx`
  viewing another user outside one's community will show no roles instead of
  leaked ones). Side effect is security-positive: the stale-cache path that
  could resurrect just-revoked roles now fails closed on main too.
- **App-side (`fix/sess-leak`, unmerged)**: only reader is
  `getUserRolesFromCache` via the service-role client — unaffected.
  Migration touches no app code, so no conflict with that branch in either
  merge order.
- **Admin API routes** (`assign-role`, `bulk-create-users`,
  `growth-communities/[id]/leaders`, `tractor-signups/grant`) only call the
  `refresh_user_roles_cache()` RPC — write-side, unaffected.

## Files

| Risk | File | Change |
|---|---|---|
| Medium | `supabase/migrations/20260728000000_revoke_client_read_user_roles_cache.sql` | `REVOKE ALL` on the matview from `PUBLIC`, `anon`, `authenticated` (additive hardening; service_role grant untouched) |
| Low | `supabase/tests/030-user-roles-cache-grants.sql` | 13-assertion pgTAP suite: privilege matrix + functional 42501 checks + SECURITY DEFINER path still works |
| Low | `docs/planning/reviews/fix-roles-cache-rls-review-request.md` | this file |

## Test evidence

- **pgTAP (`supabase test db`)**: 5 files, 39 assertions, all pass — includes
  the 13 new assertions.
- **Negative control**: the new suite was first run against a local DB that
  had NOT applied the migration; it failed exactly the 7 grant/permission
  assertions (2-5, 8-9, 12) and passed the rest — the suite provably detects
  the vulnerable state, so a future view re-creation (Supabase default
  privileges would re-grant client access) goes red in CI.
- **Unit (Vitest)**: 2493 passed, 0 failed.
- **type-check / lint / build**: pass (see PR CI for the canonical run).
- **E2E**: not run — no UI or app-code change.

## Areas to scrutinize hardest

1. **The no-wrapper decision.** I deliberately did NOT add a SECURITY DEFINER
   self-read function. Judgment call: no legitimate client-side reader
   remains (self-reads flow through `user_roles` RLS), and an unused wrapper
   is fresh attack surface. If the reviewer finds a client path that truly
   needs the view, that reverses this decision.
2. **`pages/user/[userId].tsx` display degradation on main.** Until
   `fix/sess-leak` merges, viewing another user's profile outside one's
   community stops showing roles once the migration is applied (it showed
   them via the leak). I judged this acceptable — it is the disclosure being
   closed — but it is a user-visible change on main.
3. **`REVOKE ... FROM PUBLIC`** is broader than the task's minimum (SELECT
   from anon/authenticated). Intentional: matviews have no other legitimate
   client grantee, and PUBLIC-inherited grants would evade the two named
   revokes. Verify no non-Supabase role depended on it.
4. **Error-code-only assertions.** `throws_ok` checks SQLSTATE `42501` with a
   NULL message because "permission denied for materialized view" wording
   varies across Postgres versions. Slightly weaker assertion, deliberate.
5. **Timing/ordering.** The migration is safe to apply before or after
   `fix/sess-leak` merges (audit above), but production application remains
   Brent's controlled path; nothing here touches the live DB.

## Known limitations / deferred

- `refresh_user_roles_cache()` still has EXECUTE granted to
  anon/authenticated (SECURITY DEFINER refresh — a nuisance/DoS vector, not a
  disclosure). Out of scope here; flagged as a separate follow-up task.
- The matview itself remains unpopulated (`WITH NO DATA`) in a from-scratch
  DB until something refreshes it; the pgTAP suite refreshes it inside its
  rolled-back transaction. Pre-existing behavior, unchanged.
