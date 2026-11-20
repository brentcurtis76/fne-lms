-- =============================================================================
-- 20261119103000_reallocate_hours_atomic.sql — GENERA fixes F21d (GES-3.14)
--
-- public.reallocate_contract_hours(p_contrato_id, p_from, p_to, p_hours,
-- p_reason, p_actor): moving a contract's hours from one category to another
-- as one statement. Before this, pages/api/contracts/[id]/hours/reallocate.ts
-- read both allocations and the available hours, then wrote the source and
-- the target as two separate updates computed from the values it had read,
-- and ignored a failed history line; two moves at the same time could create
-- or lose hours.
--
-- The function:
--   * refuses, with a distinct message the route maps to the Spanish sentence
--     it answers today: invalid_hours, same_category, reserved_category
--     (online_learning, the platform's reserved hours), from_/to_category_not_found,
--     from_/to_allocation_missing, insufficient_hours (DETAIL = the hours
--     available, as get_bucket_summary computes them);
--   * locks the two allocation rows FOR NO KEY UPDATE, always in id order, so
--     two moves wait for one another and never for each other in a cycle;
--   * checks the available hours inside the lock with get_bucket_summary (the
--     same rule the route applied: available < hours is refused);
--   * changes both rows by increment and writes the history line; any error
--     (a refused actor, a CHECK) undoes the whole call.
-- Hours are taken at two decimals, the precision of both columns, so that the
-- two rows and the history line always carry the same amount.
--
-- Called only by the server (service role) after the route's own role check.
-- Additive: one new function and its permissions; no stored row is repaired.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.reallocate_contract_hours(
  p_contrato_id uuid,
  p_from text,
  p_to text,
  p_hours numeric,
  p_reason text,
  p_actor uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_hours      numeric := round(p_hours, 2);
  v_from_type  uuid;
  v_to_type    uuid;
  v_from_alloc uuid;
  v_to_alloc   uuid;
  v_available  numeric;
  v_from_new   numeric;
  v_to_new     numeric;
  v_log_id     uuid;
BEGIN
  IF v_hours IS NULL OR v_hours <= 0 THEN
    RAISE EXCEPTION 'invalid_hours' USING ERRCODE = 'P0001';
  END IF;
  IF p_from = p_to THEN
    RAISE EXCEPTION 'same_category' USING ERRCODE = 'P0001';
  END IF;
  IF p_from = 'online_learning' OR p_to = 'online_learning' THEN
    RAISE EXCEPTION 'reserved_category' USING ERRCODE = 'P0001';
  END IF;

  SELECT ht.id INTO v_from_type FROM public.hour_types ht WHERE ht.key = p_from;
  IF v_from_type IS NULL THEN
    RAISE EXCEPTION 'from_category_not_found' USING ERRCODE = 'P0001';
  END IF;
  SELECT ht.id INTO v_to_type FROM public.hour_types ht WHERE ht.key = p_to;
  IF v_to_type IS NULL THEN
    RAISE EXCEPTION 'to_category_not_found' USING ERRCODE = 'P0001';
  END IF;

  SELECT a.id INTO v_from_alloc FROM public.contract_hour_allocations a
   WHERE a.contrato_id = p_contrato_id AND a.hour_type_id = v_from_type;
  IF v_from_alloc IS NULL THEN
    RAISE EXCEPTION 'from_allocation_missing' USING ERRCODE = 'P0001';
  END IF;
  SELECT a.id INTO v_to_alloc FROM public.contract_hour_allocations a
   WHERE a.contrato_id = p_contrato_id AND a.hour_type_id = v_to_type;
  IF v_to_alloc IS NULL THEN
    RAISE EXCEPTION 'to_allocation_missing' USING ERRCODE = 'P0001';
  END IF;

  -- Lock both rows, always in id order: a second move of either row waits here.
  PERFORM 1 FROM public.contract_hour_allocations a
   WHERE a.id IN (v_from_alloc, v_to_alloc)
   ORDER BY a.id
     FOR NO KEY UPDATE;

  -- Inside the lock: the available hours as the route read them (get_bucket_summary).
  SELECT b.available_hours INTO v_available
    FROM public.get_bucket_summary(p_contrato_id) b
   WHERE b.hour_type_key = p_from;
  v_available := coalesce(v_available, 0);
  IF v_available < v_hours THEN
    RAISE EXCEPTION 'insufficient_hours' USING ERRCODE = 'P0001', DETAIL = v_available::text;
  END IF;

  UPDATE public.contract_hour_allocations
     SET allocated_hours = allocated_hours - v_hours, updated_at = now()
   WHERE id = v_from_alloc
  RETURNING allocated_hours INTO v_from_new;

  UPDATE public.contract_hour_allocations
     SET allocated_hours = allocated_hours + v_hours, updated_at = now()
   WHERE id = v_to_alloc
  RETURNING allocated_hours INTO v_to_new;

  INSERT INTO public.contract_hour_reallocation_log
    (contrato_id, from_hour_type_id, to_hour_type_id, hours, reason, created_by)
  VALUES
    (p_contrato_id, v_from_type, v_to_type, v_hours, p_reason, p_actor)
  RETURNING id INTO v_log_id;

  RETURN jsonb_build_object(
    'log_id', v_log_id,
    'from_allocated_hours', v_from_new,
    'to_allocated_hours', v_to_new);
END;
$$;

COMMENT ON FUNCTION public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid) IS
  'F21d (GES-3.14): moves hours between two allocation rows of one contract and writes the history line in one statement, both rows locked in id order and the available hours checked inside the lock; server only (service role).';

REVOKE ALL ON FUNCTION public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reallocate_contract_hours(uuid, text, text, numeric, text, uuid) TO service_role;
