-- =============================================================================
-- 20260809120000_fix_bucket_summary_fanout.sql — Z2 r22 (Sol item 3)
--
-- THE BUG (live in production, not introduced by Z2): the baseline definition of
-- public.get_bucket_summary (00000000000000_baseline.sql:2781-2820) aggregates
-- SUM(ea.allocated_hours) over a set that has already been fanned out by
--
--     LEFT JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
--
-- One allocation with N matching ledger rows becomes N rows, so the allocation's
-- hours are counted N times. `allocated_hours`, `available_hours` and
-- `annex_hours` are all inflated by the ledger's row count: a 100 h allocation
-- with three sessions on it reports 300 allocated and 300 − reserved − consumed
-- available. The error grows with every booking and always errs toward telling a
-- school it has MORE hours than it bought.
--
-- `reserved_hours` and `consumed_hours` were already correct — they sum
-- `chl.hours`, and the fan-out gives each ledger row exactly once.
--
-- THE FIX (PM ruling 1): aggregate the allocations once per hour type in their
-- own CTE, aggregate the ledger once per hour type in another, then join the two
-- results. No fan-out can reach the allocation sum. `SUM(DISTINCT …)` is NOT used
-- and must never be: two legitimately equal allocations on one hour type are not
-- duplicates, and DISTINCT would silently swallow one of them.
--
-- ADDITIVE ONLY (PM ruling 2): CREATE OR REPLACE at the identical signature. No
-- DROP of any kind, no ALTER, no TRUNCATE, no RLS change. The return shape —
-- column names, order and types — is unchanged, because lib/types/
-- hour-tracking.types.ts:131 and every dashboard consumer read it by name.
--
-- GRANTS (PM ruling 3): untouched. The baseline grants EXECUTE to anon,
-- authenticated and service_role (baseline.sql:23723-23725); CREATE OR REPLACE
-- preserves them, and this file deliberately contains no GRANT and no REVOKE.
--
-- SEARCH_PATH: the function now pins `SET search_path TO 'public'`. It previously
-- pinned none, which is why public.reschedule_session_hours (SECURITY DEFINER,
-- `SET search_path = ''`) could not call it and had to restate the availability
-- formula inline — the second copy of the very formula being repaired here. With
-- the path pinned, the RPC calls this function directly (see
-- 20260809120100_reschedule_rpc_uses_bucket_summary.sql), so ONE formula exists.
-- The function stays invoker-rights: this changes name resolution only, never
-- privileges or RLS.
--
-- USER-VISIBLE EFFECT: dashboards will show FEWER available hours than they do
-- today, because today's figure is inflated. That is the fix working.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_bucket_summary(p_contrato_id uuid)
RETURNS TABLE(
  hour_type_key text,
  display_name text,
  allocated_hours numeric,
  reserved_hours numeric,
  consumed_hours numeric,
  available_hours numeric,
  is_fixed_allocation boolean,
  annex_hours numeric
)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  WITH effective_allocations AS (
    -- Direct allocations for this contract
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           false AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.contrato_id = p_contrato_id

    UNION ALL

    -- Annex allocations that add hours to this contract's buckets
    SELECT cha.id, cha.hour_type_id, cha.allocated_hours, cha.is_fixed_allocation,
           true AS is_annex
    FROM contract_hour_allocations cha
    WHERE cha.adds_to_allocation_id IN (
      SELECT id FROM contract_hour_allocations
      WHERE contrato_id = p_contrato_id
    )
  ),
  -- One row per hour type, over ALLOCATIONS ONLY. The ledger is not in scope
  -- here, so nothing can multiply these sums.
  allocation_totals AS (
    SELECT
      ea.hour_type_id,
      SUM(ea.allocated_hours) AS allocated_hours,
      BOOL_OR(ea.is_fixed_allocation) AS is_fixed_allocation,
      COALESCE(SUM(ea.allocated_hours) FILTER (WHERE ea.is_annex), 0) AS annex_hours
    FROM effective_allocations ea
    GROUP BY ea.hour_type_id
  ),
  -- One row per hour type, over the LEDGER ONLY. Each ledger row is counted
  -- exactly once, as it already was before this fix.
  ledger_totals AS (
    SELECT
      ea.hour_type_id,
      COALESCE(SUM(chl.hours) FILTER (WHERE chl.status = 'reservada'), 0) AS reserved_hours,
      COALESCE(SUM(chl.hours) FILTER (WHERE chl.status IN ('consumida', 'penalizada')), 0) AS consumed_hours
    FROM effective_allocations ea
    JOIN contract_hours_ledger chl ON chl.allocation_id = ea.id
      AND chl.status IN ('reservada', 'consumida', 'penalizada')
    GROUP BY ea.hour_type_id
  )
  SELECT
    ht.key AS hour_type_key,
    ht.display_name,
    alloc.allocated_hours,
    COALESCE(led.reserved_hours, 0) AS reserved_hours,
    COALESCE(led.consumed_hours, 0) AS consumed_hours,
    alloc.allocated_hours
      - COALESCE(led.reserved_hours, 0)
      - COALESCE(led.consumed_hours, 0)
    AS available_hours,
    alloc.is_fixed_allocation,
    alloc.annex_hours
  FROM allocation_totals alloc
  JOIN hour_types ht ON ht.id = alloc.hour_type_id
  LEFT JOIN ledger_totals led ON led.hour_type_id = alloc.hour_type_id
  ORDER BY ht.sort_order;
$$;

COMMENT ON FUNCTION public.get_bucket_summary(uuid) IS
  'Returns hour bucket summary for a contract: allocated, reserved, consumed, available, annex_hours. Includes annex allocations. Used for the admin and equipo_directivo hour tracking dashboard. Z2 r22 (Sol item 3): allocations and ledger are aggregated SEPARATELY and then joined — the previous single-query form let the ledger LEFT JOIN fan out and multiply allocated/available/annex hours by the ledger row count.';
