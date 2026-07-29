-- =============================================================================
-- Make refresh_user_roles_cache() actually work.
--
-- The function ran REFRESH MATERIALIZED VIEW CONCURRENTLY, which requires a
-- UNIQUE index with no WHERE clause on the matview. public.user_roles_cache has
-- four indexes and none is unique, so EVERY call failed with SQLSTATE 55000.
-- The role cache has therefore never refreshed through this path: production
-- holds 250 cached rows against 734 live role assignments — two thirds of
-- current assignments are missing, and the four admin routes that call the RPC
-- have been console.error-ing on every call. This is the mechanism behind the
-- Z1a-4 finding that stale cache rows could resurrect just-revoked roles.
--
-- Fix: drop CONCURRENTLY. Plain REFRESH needs no unique index, works on an
-- unpopulated matview, and (unlike CONCURRENTLY) is legal inside a function and
-- a transaction — so the PostgREST RPC path works too.
--
-- WHY NOT ADD THE UNIQUE INDEX INSTEAD — the obvious fix is impossible here.
-- A unique index would have to cover the matview's own columns, and the matview
-- projects nothing that distinguishes two identical user_roles rows:
-- approval_status, is_admin and is_teacher are pure functions of user_id /
-- role_type, and cached_at is now(), identical across a refresh. Production
-- confirms the consequence: 3 duplicate groups (8 rows, 5 excess) on
-- (user_id, role, school_id, generation_id, community_id) in the live source,
-- and 2 groups of EXACT FULL-ROW duplicates already sitting in the matview.
-- CREATE UNIQUE INDEX would fail outright, and NULLS NOT DISTINCT does not help
-- (the duplicates are not caused by NULL comparison). Adding user_roles.id to
-- the matview would give a clean key but requires DROP + CREATE of the
-- matview, which the repo's additive-only rule forbids without sign-off.
--
-- COST OF PLAIN REFRESH: it takes an ACCESS EXCLUSIVE lock for the duration,
-- so readers block. At 734 rows that is sub-millisecond, and the alternative is
-- the status quo where the cache never refreshes at all. If the matview ever
-- grows enough for the lock to matter, the path back to CONCURRENTLY is:
-- de-duplicate user_roles, add a unique key, then restore the CONCURRENTLY
-- keyword. Deliberately not attempted here — de-duplicating rows is a
-- destructive data change and belongs in its own reviewed migration.
--
-- Also hardens the SECURITY DEFINER function with an explicit search_path
-- (it had none) and schema-qualifies the matview.
--
-- Privileges are NOT touched: CREATE OR REPLACE FUNCTION preserves the existing
-- ACL, so the client revokes from 20260729000000 survive. Verified, and pinned
-- by the anon/authenticated/PUBLIC assertions in
-- supabase/tests/030-user-roles-cache-grants.sql, which run after this.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.refresh_user_roles_cache() RETURNS void
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public, pg_temp
    AS $$
BEGIN
    REFRESH MATERIALIZED VIEW public.user_roles_cache;
END;
$$;

COMMENT ON FUNCTION public.refresh_user_roles_cache() IS
  'Repopulates user_roles_cache. Plain (non-CONCURRENT) refresh: the matview has no unique index and cannot have one, because it projects no column distinguishing duplicate user_roles rows. Takes an ACCESS EXCLUSIVE lock; negligible at current row counts. Service-role callers only.';
