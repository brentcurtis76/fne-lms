-- Z7-R10: close the two remaining exposed-role override authority paths.
--
-- Production ledger INSERT audit (all current TypeScript writers):
--   * lib/services/hour-tracking.ts#createReservation writes allocation_id,
--     session_id, hours, status, session_date, recorded_by, is_over_budget,
--     is_manual, and planned_minutes_snapshot;
--   * pages/api/contracts/[id]/hours/ledger/index.ts writes allocation_id,
--     session_id, hours, status, session_date, recorded_by, is_over_budget,
--     is_manual, and notes.
-- id/recorded_at use owner-defined UUID/time defaults. No production INSERT writes
-- cancellation/update fields, and effective_minutes is exclusively changed by the
-- audited owner RPC after the row exists.

REVOKE INSERT ON TABLE public.contract_hours_ledger
  FROM PUBLIC, anon, authenticated, service_role;

GRANT INSERT (
  allocation_id,
  session_id,
  hours,
  status,
  session_date,
  recorded_by,
  is_over_budget,
  is_manual,
  planned_minutes_snapshot,
  notes
) ON TABLE public.contract_hours_ledger TO authenticated, service_role;

-- Identity sequences are table-owner implementation details. SECURITY DEFINER
-- attendance/override RPCs execute as the owner and need no caller privilege.
REVOKE ALL ON SEQUENCE public.session_hour_overrides_seq_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- Reassert the Round 9 batch-sequence boundary so the complete Z7 identity-sequence
-- census is fail closed even when older broad grants are replayed before this file.
REVOKE ALL ON SEQUENCE zoom_internal.zoom_attendance_report_batches_seq_seq
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON COLUMN public.contract_hours_ledger.effective_minutes IS
  'Audited admin override in minutes. NULL means the planned ledger hours govern; zero is an explicit waiver. Direct UPDATE and INSERT are unavailable to exposed roles: only apply_session_hour_override/reverse_session_hour_override may change this column.';
