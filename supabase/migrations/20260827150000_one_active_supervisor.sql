-- =============================================================================
-- 20260827150000_one_active_supervisor.sql
-- One active supervisor_de_red role per user — database-level invariant
-- =============================================================================
--
-- INVARIANT ENFORCED. At most one row in public.user_roles may simultaneously
-- satisfy (role_type = 'supervisor_de_red' AND is_active = true) for a given
-- user_id. Put differently: a user may be the ACTIVE supervisor of at most
-- one network (public.redes_de_colegios, via user_roles.red_id) at any point
-- in time. Historical / deactivated rows (is_active = false, or legacy NULL)
-- are explicitly NOT covered by this invariant and remain unlimited.
--
-- WHY THIS IS NEEDED. Until now the rule existed ONLY at the application
-- layer, in two call sites:
--   - pages/api/admin/networks/supervisors.ts (handleAssignSupervisor)
--   - utils/roleUtils.ts (assignSupervisorRole)
-- Both run a SELECT for the target user's existing active supervisor_de_red
-- rows and, only if none conflict, INSERT the new row. That SELECT-then-
-- INSERT sequence is a check-then-act (TOCTOU) race: two concurrent requests
-- assigning the same user as supervisor of two different networks can both
-- execute their SELECT before either request's INSERT has committed, both
-- observe "no conflicting active role", and both proceed to insert — leaving
-- the user with two simultaneously active supervisor_de_red rows despite the
-- application-level rule saying that cannot happen. A third call site,
-- pages/api/admin/assign-role.ts, inserts public.user_roles rows generically
-- for any role_type (including supervisor_de_red) and performs NO existing-
-- active-role check at all before inserting, so today it is not merely racy —
-- the rule is entirely unenforced on that path.
--
-- FIX. A partial unique index on public.user_roles(user_id), scoped to rows
-- where role_type = 'supervisor_de_red' AND is_active = true, turns the
-- invariant into a database constraint that Postgres itself serializes:
-- whichever of two concurrent inserts commits second now fails with 23505
-- (unique_violation) instead of silently succeeding. This migration changes
-- no application code; it only closes the race at the layer that can
-- actually close it.
--
-- ADDITIVITY. This migration is strictly additive. It creates exactly one
-- partial unique index and one COMMENT ON INDEX. It does not DROP, TRUNCATE,
-- or ALTER any existing object, and it makes no row-level-security change of
-- any kind: public.user_roles keeps the FORCE ROW LEVEL SECURITY posture set
-- in the baseline migration untouched, and no policy is added, removed, or
-- modified here.
--
-- PREFLIGHT (fail-closed). Before the index is created, a DO block checks
-- whether any user ALREADY holds more than one active supervisor_de_red row
-- today. If Postgres were simply asked to build the unique index over data
-- that already violates uniqueness, index creation would fail with an
-- unhelpful low-level error; instead, the preflight below raises one
-- itemized, actionable exception naming every offending user_id and its
-- active-row count, and then aborts. The preflight is READ-ONLY: it never
-- modifies, deactivates, or deletes a row. Deciding which single active
-- assignment should remain for an affected user is an operator decision that
-- this migration deliberately does not make unilaterally. If no user has
-- more than one active row, the preflight does nothing and the migration
-- proceeds straight to index creation.
-- =============================================================================

DO $$
DECLARE
  v_conflict RECORD;
  v_conflict_lines text := '';
  v_conflict_count integer := 0;
  v_message text;
BEGIN
  FOR v_conflict IN
    SELECT user_id, count(*) AS active_count
    FROM public.user_roles
    WHERE role_type = 'supervisor_de_red'
      AND is_active = true
    GROUP BY user_id
    HAVING count(*) > 1
    ORDER BY user_id
  LOOP
    v_conflict_count := v_conflict_count + 1;
    v_conflict_lines := v_conflict_lines
      || format('  - user_id %s: %s active supervisor_de_red rows', v_conflict.user_id, v_conflict.active_count)
      || E'\n';
  END LOOP;

  IF v_conflict_count > 0 THEN
    v_message := format(
      'Preflight failed: %s user(s) hold more than one ACTIVE supervisor_de_red row in public.user_roles, which this migration''s unique index forbids. This check made NO changes: it did not modify, deactivate, or delete any row. The operator must resolve each duplicate manually (decide which single active assignment should remain for that user and set is_active = false on the others) before re-applying this migration. Offending users:' || E'\n' || '%s',
      v_conflict_count,
      v_conflict_lines
    );
    RAISE EXCEPTION '%', v_message USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- Partial unique index: enforces the invariant going forward. is_active is a
-- nullable boolean with DEFAULT true (baseline.sql:11387); the predicate
-- `is_active = true` intentionally evaluates to NULL (excluded) for both
-- is_active = false and is_active IS NULL rows, so only genuinely active rows
-- count toward uniqueness and historical/inactive rows remain unrestricted.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_roles_one_active_supervisor
ON public.user_roles (user_id)
WHERE role_type = 'supervisor_de_red' AND is_active = true;

COMMENT ON INDEX public.uq_user_roles_one_active_supervisor IS 'Enforces at most one ACTIVE supervisor_de_red role per user_id in public.user_roles; is_active = false or NULL rows are unrestricted and may repeat freely.';
