-- =============================================================================
-- 20260920213000_assessment_instance_cancellation.sql — PROC-LIFECYCLE-CANCELLATION
-- child 1. Database-only, non-destructive cancellation foundation. Additive and
-- idempotent.
--
-- WHY AUDIT FIELDS AND NOT A STATUS VALUE
--   assessment_instances.status is guarded by the baseline CHECK
--   assessment_instances_status_check, which allows exactly pending,
--   in_progress, completed and archived. PostgreSQL cannot widen a CHECK
--   expression in place, and the additive-only rule forbids removing and
--   recreating it. So cancellation is recorded in new nullable audit columns and
--   the lifecycle state is DERIVED: cancelled when cancelled_at IS NOT NULL,
--   otherwise the stored status. The pre-cancellation status is preserved
--   unchanged as historical state, and the storage contract that
--   InstanceStatus mirrors is untouched.
--
-- WHAT THIS ADDS
--   * assessment_instances.cancelled_at / cancelled_by / cancellation_reason,
--     with an all-or-none CHECK that also bounds the reason (non-blank, <= 500).
--   * public.assessment_instance_lifecycle_state(text, timestamptz) — the one
--     derivation, so no caller re-implements it.
--   * public.cancel_assessment_instance(uuid, uuid, text) — the atomic RPC.
--     service_role only; it re-checks the actor itself rather than trusting the
--     caller, so an API route cannot cancel on behalf of a non-admin.
--   * Two guards that make a cancelled instance terminal: later UPDATE/DELETE of
--     the instance, and later INSERT/UPDATE/DELETE of its responses, are
--     refused. A response UPDATE is judged on BOTH its old and its new parent,
--     so it cannot be moved out of a cancelled instance either. Snapshots,
--     responses, assignees, results, authorship and completion history are all
--     preserved: nothing is removed anywhere.
--
-- REFUSALS (SQLSTATE, stable message)
--   42501  permission_denied            actor is not an active literal admin
--   42501  cancellation_requires_rpc    audit fields written outside the RPC
--   P0001  invalid_reason               blank reason
--   P0001  reason_too_long              reason over 500 characters
--   P0001  instance_not_found           no such instance
--   P0001  instance_not_cancellable:<s> stored status is not an eligible one
--   P0001  instance_cancelled           mutation after cancellation
--   A refused call writes nothing.
-- =============================================================================

ALTER TABLE public.assessment_instances
  ADD COLUMN IF NOT EXISTS cancelled_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS cancelled_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancellation_reason text;

DO $constraint$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'assessment_instances_cancellation_all_or_none'
       AND conrelid = 'public.assessment_instances'::regclass
  ) THEN
    ALTER TABLE public.assessment_instances
      ADD CONSTRAINT assessment_instances_cancellation_all_or_none CHECK (
        (cancelled_at IS NULL AND cancelled_by IS NULL AND cancellation_reason IS NULL)
        OR (
          cancelled_at IS NOT NULL
          AND cancelled_by IS NOT NULL
          AND cancellation_reason IS NOT NULL
          AND btrim(cancellation_reason) <> ''
          AND length(cancellation_reason) <= 500
        )
      );
  END IF;
END
$constraint$;

-- The single derivation of the lifecycle state. Pure: it reads the two stored
-- values it is given, so it can be used in a projection or an index expression.
CREATE OR REPLACE FUNCTION public.assessment_instance_lifecycle_state(
  p_status text,
  p_cancelled_at timestamp with time zone
)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE WHEN p_cancelled_at IS NOT NULL THEN 'cancelled' ELSE p_status END
$$;

COMMENT ON FUNCTION public.assessment_instance_lifecycle_state(text, timestamp with time zone) IS
  'Derived lifecycle state: cancelled when cancelled_at is set, otherwise the stored status. The stored status is never rewritten by cancellation.';

REVOKE ALL ON FUNCTION public.assessment_instance_lifecycle_state(text, timestamp with time zone) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.assessment_instance_lifecycle_state(text, timestamp with time zone) TO authenticated, service_role;

-- Guard: a cancelled instance is terminal, and the audit fields are writable
-- only while cancel_assessment_instance is actually executing. Nothing here is
-- settable by the caller: the guard reads the RPC's owner from the catalog and
-- the live PL/pgSQL call stack, neither of which a client can forge.
CREATE OR REPLACE FUNCTION public.assessment_instance_cancellation_guard()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_owner name;
  v_stack text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.cancelled_at IS NOT NULL THEN
      RAISE EXCEPTION 'instance_cancelled' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.cancelled_at IS NOT NULL OR NEW.cancelled_by IS NOT NULL OR NEW.cancellation_reason IS NOT NULL THEN
      RAISE EXCEPTION 'cancellation_requires_rpc' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'instance_cancelled' USING ERRCODE = 'P0001';
  END IF;

  IF NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
     OR NEW.cancelled_by IS DISTINCT FROM OLD.cancelled_by
     OR NEW.cancellation_reason IS DISTINCT FROM OLD.cancellation_reason THEN
    -- current_user is the RPC's owner only inside that SECURITY DEFINER function;
    -- the stack frame then proves it is that function and not some other function
    -- the same owner happens to own. A direct write by service_role, authenticated
    -- or the owner itself has no such frame and is refused. This does not defend
    -- against a PostgreSQL superuser, who can disable the trigger outright.
    SELECT pg_get_userbyid(p.proowner) INTO v_owner
      FROM pg_proc p
     WHERE p.oid = to_regprocedure('public.cancel_assessment_instance(uuid,uuid,text)');
    GET DIAGNOSTICS v_stack = PG_CONTEXT;

    IF v_owner IS NULL
       OR current_user <> v_owner
       OR v_stack !~ 'function (public\.)?cancel_assessment_instance\(uuid,uuid,text\) line ' THEN
      RAISE EXCEPTION 'cancellation_requires_rpc' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER assessment_instance_cancellation_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_instances
  FOR EACH ROW EXECUTE FUNCTION public.assessment_instance_cancellation_guard();

-- Guard: responses of a cancelled instance are frozen. SECURITY DEFINER so the
-- lookup cannot be hidden by the caller's RLS — an invisible parent must not
-- read as "not cancelled".
CREATE OR REPLACE FUNCTION public.assessment_response_cancellation_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_instance uuid := CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.instance_id END;
  v_new_instance uuid := CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE NEW.instance_id END;
BEGIN
  -- Both parents are checked, so an UPDATE can neither move a response INTO a
  -- cancelled instance nor move one OUT of it, which would erase history from it.
  IF EXISTS (
    SELECT 1 FROM public.assessment_instances
     WHERE cancelled_at IS NOT NULL
       AND (id = v_old_instance OR id = v_new_instance)
  ) THEN
    RAISE EXCEPTION 'instance_cancelled' USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER assessment_response_cancellation_guard_trg
  BEFORE INSERT OR UPDATE OR DELETE ON public.assessment_responses
  FOR EACH ROW EXECUTE FUNCTION public.assessment_response_cancellation_guard();

-- The atomic cancellation. The actor UUID is an argument and is validated here,
-- so the service path cannot delegate the role check to its caller.
CREATE OR REPLACE FUNCTION public.cancel_assessment_instance(
  p_actor_id uuid,
  p_instance_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reason text := btrim(coalesce(p_reason, ''));
  v_row public.assessment_instances%ROWTYPE;
BEGIN
  IF p_actor_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.user_roles
     WHERE user_id = p_actor_id AND role_type = 'admin' AND is_active IS TRUE
  ) THEN
    RAISE EXCEPTION 'permission_denied' USING ERRCODE = '42501';
  END IF;

  IF v_reason = '' THEN
    RAISE EXCEPTION 'invalid_reason' USING ERRCODE = 'P0001';
  END IF;
  IF length(v_reason) > 500 THEN
    RAISE EXCEPTION 'reason_too_long' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_row FROM public.assessment_instances
   WHERE id = p_instance_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'instance_not_found' USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: a repeat request returns the first audit facts and writes nothing.
  IF v_row.cancelled_at IS NULL THEN
    IF v_row.status NOT IN ('pending', 'in_progress', 'completed') THEN
      RAISE EXCEPTION 'instance_not_cancellable:%', v_row.status USING ERRCODE = 'P0001';
    END IF;

    UPDATE public.assessment_instances
       SET cancelled_at = now(), cancelled_by = p_actor_id, cancellation_reason = v_reason
     WHERE id = p_instance_id
     RETURNING * INTO v_row;
  END IF;

  RETURN jsonb_build_object(
    'instance_id', v_row.id,
    'status', v_row.status,
    'lifecycle_state', public.assessment_instance_lifecycle_state(v_row.status, v_row.cancelled_at),
    'cancelled_at', v_row.cancelled_at,
    'cancelled_by', v_row.cancelled_by,
    'cancellation_reason', v_row.cancellation_reason
  );
END;
$$;

COMMENT ON FUNCTION public.cancel_assessment_instance(uuid, uuid, text) IS
  'Atomically records the cancellation audit facts for an assessment instance. service_role only; validates that p_actor_id is an active literal admin, locks the row, requires a non-blank reason of at most 500 characters, and is idempotent.';

REVOKE ALL ON FUNCTION public.cancel_assessment_instance(uuid, uuid, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_assessment_instance(uuid, uuid, text) TO service_role;
