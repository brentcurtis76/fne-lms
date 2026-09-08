-- =============================================================================
-- 20260827160000_active_supervisor_requires_red.sql
-- An ACTIVE supervisor_de_red role must name its network — database invariant
-- =============================================================================
--
-- INVARIANT ENFORCED. Every row in public.user_roles that simultaneously
-- satisfies (role_type = 'supervisor_de_red' AND is_active = true) must carry
-- a non-NULL red_id (the supervised network, public.redes_de_colegios). Put
-- differently: an ACTIVE network supervisor without a network cannot exist.
-- Historical / deactivated rows (is_active = false, or legacy NULL) and every
-- other role type are explicitly NOT covered and keep NULL red_id freely.
--
-- WHY THIS IS NEEDED. Migration 20260827150000_one_active_supervisor.sql
-- added uq_user_roles_one_active_supervisor: at most ONE active
-- supervisor_de_red row per user. That index counts ANY active row —
-- including one with red_id NULL. The generic role-assignment path
-- (pages/api/admin/assign-role.ts, driven by components/RoleAssignmentModal)
-- collected no network and wrote no red_id, so its FIRST supervisor grant for
-- a user succeeded as (role_type = 'supervisor_de_red', is_active = true,
-- red_id = NULL). The unique index then treated that user as already holding
-- their one active supervisor role and refused the real, network-scoped
-- assignment through Gestión de Redes — an active but unusable supervisor
-- that also blocked the correct grant. The application layer now refuses
-- supervisor_de_red on the generic endpoint outright, but per-endpoint checks
-- are exactly what round 1 showed to be bypassable: this constraint makes the
-- database itself reject the malformed row no matter which code path writes
-- it (assign-role, create-user, bulk import, or any future caller).
--
-- FIX. A table CHECK constraint:
--
--   role_type <> 'supervisor_de_red'
--   OR is_active IS DISTINCT FROM TRUE
--   OR red_id IS NOT NULL
--
-- A row violates it only when ALL three disjuncts are false: it is a
-- supervisor row, it is strictly active (is_active = true — IS DISTINCT FROM
-- TRUE is true for both false and NULL, keeping legacy history unrestricted),
-- and it names no network. INSERTs and UPDATEs alike are covered, so a
-- NULL-red row can neither be created active nor reactivated later.
--
-- DELIBERATE CONSEQUENCE. user_roles_red_id_fkey is ON DELETE SET NULL
-- (baseline.sql:17854): removing a red used to silently null red_id off its
-- rows. For a row that is ACTIVE, that SET NULL now violates this constraint,
-- so deleting a network that still has an ACTIVE supervisor is refused by the
-- database. This backs the existing application-level guard in the network
-- delete handler (deactivate or reassign the supervisor first); inactive
-- history still nulls out freely, exactly as before.
--
-- ADDITIVITY. Strictly additive: one ADD CONSTRAINT (guarded by a
-- pg_constraint existence check so a re-run is a no-op) and one COMMENT. No
-- object is removed or altered destructively, and no row-level-security
-- change of any kind is made: public.user_roles keeps the FORCE ROW LEVEL
-- SECURITY posture from the baseline untouched, and no policy is added,
-- removed, or modified here.
--
-- PREFLIGHT (read-only, fail-closed). ADD CONSTRAINT validates existing rows,
-- so applying this over data that already violates the invariant would abort
-- with an unhelpful low-level error. The DO block below checks FIRST: if any
-- ACTIVE supervisor_de_red row already has red_id NULL, it raises ONE
-- itemized, actionable exception naming every offending user_id and its
-- NULL-red active-row count, then aborts the migration. The preflight is
-- READ-ONLY: it never modifies, deactivates, or deletes a row. Deciding
-- whether an affected assignment should be deactivated or pointed at the
-- correct network is an operator decision this migration deliberately does
-- not make unilaterally. If no such row exists, the preflight does nothing
-- and the migration proceeds straight to the constraint.
-- =============================================================================

DO $$
DECLARE
  v_conflict RECORD;
  v_conflict_lines text := '';
  v_conflict_count integer := 0;
  v_message text;
BEGIN
  FOR v_conflict IN
    SELECT user_id, count(*) AS null_red_count
    FROM public.user_roles
    WHERE role_type = 'supervisor_de_red'
      AND is_active = true   -- matches only strictly-active rows, exactly the set the constraint restricts
      AND red_id IS NULL
    GROUP BY user_id
    ORDER BY user_id
  LOOP
    v_conflict_count := v_conflict_count + 1;
    v_conflict_lines := v_conflict_lines
      || format('  - user_id %s: %s ACTIVE supervisor_de_red row(s) with red_id NULL', v_conflict.user_id, v_conflict.null_red_count)
      || E'\n';
  END LOOP;

  IF v_conflict_count > 0 THEN
    v_message := format(
      'Preflight failed: %s user(s) hold an ACTIVE supervisor_de_red row with red_id NULL in public.user_roles, which this migration''s CHECK constraint forbids. This check made NO changes: it did not modify, deactivate, or delete any row. The operator must resolve each row manually (either set is_active = false, or point red_id at the correct red in public.redes_de_colegios) before re-applying this migration. Offending users:' || E'\n' || '%s',
      v_conflict_count,
      v_conflict_lines
    );
    RAISE EXCEPTION '%', v_message USING ERRCODE = 'P0001';
  END IF;
END;
$$;

-- The constraint. Guarded by a pg_constraint existence check (Postgres has no
-- ADD CONSTRAINT IF NOT EXISTS) so re-application is a no-op, mirroring the
-- CREATE UNIQUE INDEX IF NOT EXISTS convention of the sibling migration.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conname = 'chk_user_roles_active_supervisor_needs_red'
      AND conrelid = 'public.user_roles'::regclass
      AND contype = 'c'
  ) THEN
    ALTER TABLE public.user_roles
      ADD CONSTRAINT chk_user_roles_active_supervisor_needs_red
      CHECK (
        role_type <> 'supervisor_de_red'
        OR is_active IS DISTINCT FROM TRUE
        OR red_id IS NOT NULL
      );
  END IF;
END;
$$;

COMMENT ON CONSTRAINT chk_user_roles_active_supervisor_needs_red ON public.user_roles IS 'An ACTIVE supervisor_de_red row must carry a non-NULL red_id (its supervised network). Inactive or NULL-is_active history and every other role type may keep red_id NULL freely.';
