-- Z7-R11: exposed callers may update only the lifecycle columns used by the
-- mechanically inventoried production writers. Earlier column grants included
-- `hours` and immutable identity/snapshot fields, so both table and every
-- column-level UPDATE ACL must be removed before the minimal union is restored.

REVOKE UPDATE ON TABLE public.contract_hours_ledger
  FROM PUBLIC, anon, authenticated, service_role;

REVOKE UPDATE (
  id,
  allocation_id,
  session_id,
  hours,
  status,
  session_date,
  is_over_budget,
  is_manual,
  cancellation_clause,
  cancellation_reason,
  admin_override,
  admin_override_reason,
  recorded_at,
  recorded_by,
  updated_at,
  updated_by,
  notes,
  planned_minutes_snapshot,
  effective_minutes
) ON TABLE public.contract_hours_ledger
  FROM PUBLIC, anon, authenticated, service_role;

-- Exact union of the four production TypeScript UPDATE shapes:
-- completeReservation, cancellation, cancellation compensation, and the
-- permitted manual cancellation-status override.
GRANT UPDATE (
  status,
  cancellation_clause,
  cancellation_reason,
  admin_override,
  admin_override_reason,
  updated_at,
  updated_by
) ON TABLE public.contract_hours_ledger TO authenticated, service_role;

COMMENT ON COLUMN public.contract_hours_ledger.effective_minutes IS
  'Audited admin override in minutes. NULL means planned ledger hours govern; zero is an explicit waiver. Exposed roles have no table UPDATE and only the seven mechanically inventoried lifecycle columns; hours, effective_minutes, and immutable identity/snapshot columns remain owner-RPC-only.';
