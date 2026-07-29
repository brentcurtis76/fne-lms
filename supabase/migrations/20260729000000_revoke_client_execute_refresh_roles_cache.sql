-- =============================================================================
-- Revoke client EXECUTE on public.refresh_user_roles_cache().
--
-- The function is SECURITY DEFINER (owner: postgres) and runs
--   REFRESH MATERIALIZED VIEW CONCURRENTLY user_roles_cache
-- The baseline grants EXECUTE to anon and authenticated, and PostgREST exposes
-- public-schema functions as RPC, so any holder of the anon key could invoke it
-- at will. SECURITY DEFINER does NOT bypass the EXECUTE check — the grant is
-- the only thing gating it. No data disclosure; the cost is server-side work
-- and error-log volume driven by unauthenticated callers.
--
-- Companion to 20260728000000, which revoked the client SELECT grants on the
-- view itself. That one closed a read exposure; this one closes the write/
-- trigger surface, so the view has no client-reachable entry point left.
--
-- REVOKE FROM PUBLIC is the load-bearing statement, not a belt-and-braces
-- extra: Postgres grants EXECUTE to PUBLIC by default at CREATE FUNCTION time,
-- and the baseline preserved it (pg_proc.proacl = {=X/postgres,...} — the
-- leading "=X" is PUBLIC). Revoking only anon and authenticated would leave
-- both roles still able to execute, inheriting the privilege via PUBLIC.
--
-- service_role keeps EXECUTE: every production caller goes through it
-- (pages/api/admin/assign-role.ts, bulk-create-users.ts,
-- growth-communities/[id]/leaders.ts, tractor-signups/grant.ts).
--
-- Note for whoever picks up the cache next: this function cannot currently
-- succeed for ANY caller. CONCURRENTLY requires a unique index with no WHERE
-- clause, and the matview has four indexes, none unique (verified against
-- production), so every call fails with SQLSTATE 55000. The revoke therefore
-- removes no working behavior. Repairing the refresh path (unique index, or
-- drop CONCURRENTLY) is deliberately left out of this security fix.
--
-- ALL, not EXECUTE: they are equivalent for functions today (EXECUTE is the
-- only function privilege) and ALL stays correct if that ever changes.
-- =============================================================================

REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM anon;
REVOKE ALL ON FUNCTION public.refresh_user_roles_cache() FROM authenticated;
